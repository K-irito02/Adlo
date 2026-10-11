# 日志设置修复 + 开发阶段 CLI 控制 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 subagent-driven-development（推荐）或 executing-plans 逐任务实施。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 让「通用」组三个日志设置项在双端真实生效，并新增开发阶段 CLI 控制能力。

**Architecture:** 在 `adl-logging` 引入 `tracing_subscriber::reload` 热切换与进程角色分离文件；在 `adl-types` 引入 `LogLevel` 强类型；ad-server 新增 `/app/*` 路由作为浏览器模式配置真源；前端 `updatePreferences` 改为合并式排队；启动脚本与两个 Rust 入口新增 CLI/env 覆盖（session-only）。

**Tech Stack:** Rust（tracing-subscriber reload、axum、serde、ts-rs）+ TypeScript/React 19 + Vitest + Node ESM 启动脚本。

**Spec:** `docs/superpowers/specs/2026-10-11-log-settings-and-dev-cli-design.md`

## Global Constraints

- Rust 禁止 `unwrap()`（生产代码）；错误经 `AppError` / `LogError` 统一
- 持配置写锁期间**禁止 tracing**（既有死锁回归约束）
- 前端 UI 禁止硬编码中英文（i18n key）
- 前端 `src/app/**` 禁止直接从 `@ai-digital-life/kernel` 导入（含 type-only）
- 双端一致：Tauri / 浏览器两模式行为对齐
- 每阶段只跑受影响测试，不跑全量；收尾按 mandatory-testing
- Commit 规范：`type(scope): summary`；scope ∈ core/frontend/rust/stores/browser/terminal/ipc/docs/deps

---

### Task A1: 引入 `LogLevel` 强类型（adl-types）

**Files:**
- Modify: `ai-digital-life/crates/types/src/types/config.rs`
- Test: 同文件内联 `#[cfg(test)] mod tests`

**Interfaces:**
- Produces: `adl_types::types::config::LogLevel`（`Error|Warn|Info|Debug|Trace`，serde lowercase，`TS` 导出，`FromStr` 大小写不敏感、`Display`、`Ord` 按 verbosity、`max_verbosity(a,b)`）；`AppConfig.log_level: LogLevel`、`ConfigSnapshot.log_level: LogLevel`、`AppPreferencePatch.log_level: Option<LogLevel>`

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn log_level_parses_case_insensitively_and_orders_by_verbosity() {
    assert_eq!("TRACE".parse::<LogLevel>().unwrap(), LogLevel::Trace);
    assert!("nope".parse::<LogLevel>().is_err());
    assert!(LogLevel::Error < LogLevel::Warn);
    assert!(LogLevel::Debug < LogLevel::Trace);
}

#[test]
fn log_level_max_verbosity_picks_the_more_verbose() {
    assert_eq!(LogLevel::max_verbosity(LogLevel::Error, LogLevel::Debug), LogLevel::Debug);
    assert_eq!(LogLevel::max_verbosity(LogLevel::Trace, LogLevel::Debug), LogLevel::Trace);
}
```

- [ ] **Step 2: 跑测试确认失败** — `cargo test -p adl-types log_level` → 编译失败（`LogLevel` 未定义）

- [ ] **Step 3: 实现枚举与契约替换**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../frontend/src/shared/ipc/generated/")]
pub enum LogLevel { Error, Warn, Info, Debug, Trace }

impl LogLevel {
    pub fn max_verbosity(a: Self, b: Self) -> Self { a.max(b) }
}

impl std::str::FromStr for LogLevel {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "error" => Ok(Self::Error),
            "warn" => Ok(Self::Warn),
            "info" => Ok(Self::Info),
            "debug" => Ok(Self::Debug),
            "trace" => Ok(Self::Trace),
            other => Err(format!("invalid log level: {other} (expected error|warn|info|debug|trace)")),
        }
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self { Self::Error => "error", Self::Warn => "warn", Self::Info => "info", Self::Debug => "debug", Self::Trace => "trace" };
        f.write_str(s)
    }
}
```

将 `AppConfig.log_level`/`ConfigSnapshot.log_level` 改为 `LogLevel`，`AppPreferencePatch.log_level` 改为 `Option<LogLevel>`；`AppConfig::default()` 用 `LogLevel::Info`；同步修正同一 crate 内所有构造点。

- [ ] **Step 4: 跑测试确认通过** — `cargo test -p adl-types` 全绿

- [ ] **Step 5: Commit** — `git commit -m "feat(core): add LogLevel enum and tighten log_level contract"`

---

### Task B1: adl-logging reload 基础设施 + log_level

**Files:**
- Modify: `ai-digital-life/crates/adl-logging/src/config.rs`（`LogConfig` 增 `log_level: LogLevel`）
- Modify: `ai-digital-life/crates/adl-logging/src/manager.rs`
- Modify: `ai-digital-life/crates/adl-logging/Cargo.toml`（`tracing-subscriber` features 加 `"reload"`）
- Test: `manager.rs` 内联

**Interfaces:**
- Produces: `LogManager::set_log_level(&self, level: LogLevel) -> LogResult<()>`；`LogConfig { terminal_log_mode, debug_log_mode, log_level }`；`LogManager::log_level(&self) -> LogResult<LogLevel>`
- Consumes: Task A1 的 `LogLevel`

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn set_log_level_changes_runtime_filter() {
    // init with Info, then set Trace, assert manager.log_level() == Trace
}

#[test]
fn file_layer_keeps_debug_floor_when_level_is_coarser_than_debug() {
    // log_level = Error → file filter stays debug (assert via max_verbosity(Error, Debug) == Debug)
}
```

- [ ] **Step 2: 跑测试确认失败** — `cargo test -p adl-logging set_log_level` → 编译失败

- [ ] **Step 3: 实现 reload 双层**

要点：
```rust
use tracing_subscriber::reload;

let stdout_reload = reload::Layer::new(init_stdout_filter());
let file_reload = reload::Layer::new(init_file_filter());
let stdout_handle = stdout_reload.handle();
let file_handle = file_reload.handle();
// Registry::default().with(stdout_layer.with_filter(stdout_reload)).with(file_layer.with_filter(file_reload)).try_init()
```
`init_stdout_filter()`：`EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(log_level.to_string()))`；`init_file_filter()` 的 fallback 用 `LogLevel::max_verbosity(log_level, LogLevel::Debug)`。
`set_log_level`：写锁内改 `config.log_level`，**守卫释放后** `handle.reload(EnvFilter::new(...))`（stdout=level，file=max(level,Debug)），最后 `tracing::info!(...)`。

- [ ] **Step 4: 跑测试确认通过** — `cargo test -p adl-logging`
- [ ] **Step 5: Commit** — `feat(rust): hot-swap log level via tracing reload`

---

### Task B2: 进程角色分离日志文件（F1）

**Files:**
- Modify: `crates/adl-logging/src/manager.rs`（`init` 增 `terminal_prefix` 参数或用 `LogProcessRole`）
- Test: `manager.rs` 内联

**Interfaces:**
- Produces: `LogManager::init(config, log_dir, terminal_prefix: &str)`（`"terminal-logs"` / `"adl-server-logs"`）

- [ ] **Step 1: 写失败测试** — 两个 manager（不同前缀）各写若干行，断言两文件都完整且互不截断

```rust
#[test]
fn distinct_terminal_prefixes_do_not_truncate_each_other() {
    let shell = manager_with_prefix("terminal-logs");
    let server = manager_with_prefix("adl-server-logs");
    // 各写 100 行 → 文件行数 == 100 且内容不交错
}
```

- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**：`TerminalMakeWriter`/`TerminalWriter` 增 `prefix: String`；`open_terminal_file`、`SessionTracker::new(..., prefix)`、prune 前缀全部改用之
- [ ] **Step 4: 跑测试确认通过** — `cargo test -p adl-logging`
- [ ] **Step 5: Commit** — `feat(rust): split terminal log files per process role`

---

### Task C1: shell 侧接线（setup.rs）

**Files:**
- Modify: `ai-digital-life/src-tauri/src/setup.rs`
- Test: `setup.rs` 内联 + 现有 `tests`

**Interfaces:**
- Consumes: `LogManager::init(config, log_dir, "terminal-logs")`
- Produces: 启动打印 `[ADL-LOG] level=… stdout=… file=… role=shell` 与（有 CLI/env 覆盖时）`[ADL-CLI] … (session override, not persisted)`

- [ ] **Step 1: 写失败测试** — `parse_log_overrides_from(env: &[(String,String)])` 纯函数：env 值合法→覆盖，非法→忽略并保留原值
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**：
  - `init_app_state` 中 config 载入后，读 `ADL_LOG_LEVEL`/`ADL_TERMINAL_LOG_MODE`/`ADL_DEBUG_LOG_MODE`（`ADL_CLI_LOG_MODE` 兼容），解析成功才覆盖（session-only，不写盘）
  - `LogManager::init` 传 `log_level` 与 `"terminal-logs"`，并保留 `LogManager` 到 `AppState`
  - 打印启动日志行
- [ ] **Step 4: 跑测试确认通过** — `cargo test -p ai-digital-life`（或 crate 名）相关用例
- [ ] **Step 5: Commit** — `feat(rust): apply session-only log overrides in shell`

---

### Task C2: server 侧接线（engine.rs）

**Files:**
- Modify: `crates/server/src/engine.rs`、`crates/server/src/state.rs`
- Test: 内联

**Interfaces:**
- Produces: `ServerState.log_manager: Arc<LogManager>`；`init_server_state` 读 config.json + env 覆盖后 init

- [ ] **Step 1: 写失败测试** — 给定 config.json 含 `debug_log_mode=multi`，`init_server_state` 后 `state.log_manager.config()` 返回 multi
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**：把 `let _log_manager = LogManager::init(...)` 改为先 load config（已在其后 load，需提前）+ env 覆盖 + `LogManager::init(..., "adl-server-logs")`，存入 `ServerState`
- [ ] **Step 4: 跑测试确认通过** — `cargo test -p adl-server`
- [ ] **Step 5: Commit** — `feat(rust): server reads its own log settings`

---

### Task C3: ConfigWatcher 联动（Issue 6）

**Files:**
- Modify: `ai-digital-life/src-tauri/src/setup.rs`（`start_background_tasks`）
- Test: 内联（可注入的纯比较 + 调用桩）

- [ ] **Step 1: 写失败测试** — 纯函数 `diff_log_settings(old, new) -> Option<LogSettingsDelta>`，并断言存在 session 覆盖时返回 None
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**：watcher 循环中写 `config_arc` 后，若 delta 存在且无 session 覆盖 → 调 `set_mode`/`set_log_level`（守卫外），失败仅 `tracing::warn!`
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** — `fix(rust): sync log manager on external config change`

---

### Task D1: 抽取共享 `app_info::build`（adl-kernel）

**Files:**
- Create: `crates/kernel/src/app_info.rs`（+ `lib.rs` 导出）
- Modify: `src-tauri/src/commands/app.rs`（`build_app_info` 改为调用共享函数）
- Test: `app_info.rs` 内联

**Interfaces:**
- Produces: `adl_kernel::app_info::build(config: &AppConfig, current_workspace: Option<WorkspaceMeta>) -> AppInfo`

- [ ] **Step 1: 写失败测试** — `ThemeMode::System → Theme::Light`；`ConfigSnapshot.log_level` 透传；workspace 为 None 时 `current_workspace` 为 None
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现** 并把 shell 的 `build_app_info` 改为薄封装（保留 verbatim 前缀剥离在 shell 侧）
- [ ] **Step 4: 跑测试确认通过** — `cargo test -p adl-kernel`
- [ ] **Step 5: Commit** — `refactor(core): extract shared app_info builder`

---

### Task D2: ad-server `/app` 路由

**Files:**
- Create: `crates/server/src/handlers/app.rs`（+ `handlers/mod.rs`）
- Modify: `crates/server/src/router.rs`、`crates/server/src/state.rs`
- Test: `crates/server/tests/` 集成或 handler 内联

**Interfaces:**
- Consumes: `app_info::build`、`ServerState.log_manager`
- Produces: `GET /app/info`、`POST /app/preferences`

- [ ] **Step 1: 写失败测试** — `GET /app/info` 返回 ok + config；`POST /app/preferences {debugLogMode:"multi"}` → 返回 config 已变且 `state.log_manager.config().debug_log_mode == Multi`；非法 `logLevel` → 结构化错误
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**：handler 按 rust-server-handler-recipe（State 提取 → body 解析 → `run_blocking` 阻塞 I/O → `ipc::to_response`）；config 写入加 `Mutex` 串行化；`set_mode`/`set_log_level` 失败返回 `AppError`
- [ ] **Step 4: 跑测试确认通过** — `cargo test -p adl-server`
- [ ] **Step 5: Commit** — `feat(rust): add /app info and preferences routes`

---

### Task D3: httpBridge 真实实现 + 前端 parity GREEN

**Files:**
- Modify: `ai-digital-life/frontend/src/httpBridge.ts`（`app.getInfo` / `app.updatePreferences` 换真实 fetch）
- Test: `frontend/src/preview-bridge/__tests__/app-bridge-parity.test.ts`（已建 RED）

- [ ] **Step 1: 现有 RED 测试已就位**（3 个 case）
- [ ] **Step 2: 跑测试确认 RED** — `pnpm --dir frontend run test -- src/preview-bridge/__tests__/app-bridge-parity.test.ts` → 3 failed
- [ ] **Step 3: 实现**：`getInfo` → `call<AppInfo>(baseUrl, '/app/info', { method: 'GET' })`；`updatePreferences` → `call<AppInfo>(baseUrl, '/app/preferences', { method: 'POST', body: JSON.stringify(patch) })`
- [ ] **Step 4: 跑测试确认 GREEN**
- [ ] **Step 5: Commit** — `fix(ipc): real app domain over http for browser mode`

---

### Task E1: `updatePreferences` 合并式排队（P1）

**Files:**
- Modify: `frontend/src/app/stores/actions/generalActions.ts`
- Create: `frontend/src/app/stores/actions/preferencePatchMerge.ts`（`mergePrefPatches`）
- Test: `generalActions.test.ts` + `preferencePatchMerge.test.ts`

**Interfaces:**
- Produces: `mergePrefPatches(a, b): AppPreferencePatch`（`fonts` 一级深合并、其余后者胜）

- [ ] **Step 1: 写失败测试** — 连续两次调用（第一次未完成）→ IPC 只调 1 次且 payload 含两者；`fonts.uiFont` 与 `fonts.codeFont` 同时到达不互相覆盖
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现** 模块级队列 + runner + `mergePrefPatches`；保留 `clearError`/`captureError`/`isFetching` 语义
- [ ] **Step 4: 跑测试确认通过** — `pnpm --dir frontend run test -- src/app/stores/actions`
- [ ] **Step 5: Commit** — `fix(stores): coalesce rapid preference updates`

---

### Task E2: 浏览器调试日志模式来源修复（Issue 5）

**Files:**
- Modify: `frontend/src/app/utils/debugLogCollector.ts`
- Test: `debugLogCollector` 测试（新增或就近 `__tests__/`）

- [ ] **Step 1: 写失败测试** — `resolveBrowserDebugLogMode()` 解析链 env → appInfo → 'overwrite'；不再读 `adl_log_mode_debug`
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**（env 用 `import.meta.env.VITE_ADL_DEBUG_LOG_MODE`）
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** — `fix(frontend): resolve browser debug log mode from real sources`

---

### Task F1: Tauri 入口 CLI 解析

**Files:**
- Modify: `src-tauri/src/main.rs`
- Test: `main.rs` 内联（纯解析函数）

**Interfaces:**
- Produces: `parse_cli_log_overrides(args: &[String]) -> LogOverrides`

- [ ] **Step 1: 写失败测试** — `--log-level trace` 解析成功；非法 `--log-level nope` 忽略；`--log-mode multi` 同时设两模式；缺值不 panic
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现** 并写 env（`ADL_LOG_LEVEL`/`ADL_TERMINAL_LOG_MODE`/`ADL_DEBUG_LOG_MODE`/`ADL_CLI_LOG_MODE`）
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** — `feat(rust): parse log CLI overrides in shell`

---

### Task F2: adl-server 入口 CLI 解析

**Files:**
- Modify: `crates/server/src/bin/adl-server.rs`
- Test: 内联

- [ ] **Step 1-5:** 同上模式，解析 3+1 flag → 写 env（保留 `--port`/`--data-dir`）

---

### Task F3: 启动脚本转发

**Files:**
- Modify: `ai-digital-life/scripts/run-project-surface.mjs`
- Modify: `ai-digital-life/frontend/dev/ad-server-launch.mjs`
- Test: 就近 `__tests__`（纯解析函数导出）

- [ ] **Step 1: 写失败测试** — `parseLogFlags(argv)` 与 `buildAdServerEnv(overrides)` 纯函数
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**：`run-project-surface.mjs` 用 `process.argv.slice(3)` 解析 → 注入 Vite 子进程 env；tauri 模式经 `cargo tauri dev --config X -- <args>` 透传；`ad-server-launch.mjs` 把 env 传给 ad-server 并注入 `VITE_ADL_DEBUG_LOG_MODE`
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** — `feat(frontend): forward log CLI flags through launch scripts`

---

### Task G1: 删除死 API（5b）

**Files:**
- Modify: `src-tauri/src/commands/app.rs`、`src-tauri/src/main.rs`
- Modify: `frontend/src/shared/ipc/digital-life.ts`、`tauri-bridge/index.ts`、`preview-bridge/index.ts`、`mock-bridge.ts`、`httpBridge.ts`
- Test: 删除对应测试断言

- [ ] **Step 1:** 全仓库 grep `app_set_log_mode` / `setLogMode` 确认零调用
- [ ] **Step 2:** 逐端删除 + 移除 JSDoc 引用
- [ ] **Step 3:** `cargo check --workspace` + `pnpm --dir frontend run typecheck` 通过
- [ ] **Step 4: Commit** — `refactor(ipc): remove unused setLogMode bridge surface`

---

### Task H1: 验收 + 文档同步

- [ ] **Step 1:** 受影响测试全跑（Rust: adl-types/adl-logging/adl-kernel/adl-server/ai-digital-life；前端: stores/utils/preview-bridge/httpBridge）
- [ ] **Step 2:** `cargo fmt --all` + `cargo clippy --workspace --all-targets -- -D warnings` + `pnpm --dir frontend run lint:fix` + `typecheck`
- [ ] **Step 3:** 端到端手测（见 spec §6）：`pnpm dev:tauri -- --log-level trace --terminal-log-mode multi`，断言 `[ADL-CLI]` 行 + 分文件落盘 + 文件含 trace
- [ ] **Step 4:** 文档同步：`ai-digital-life/AGENTS.md`（日志文件路径/调试工具）、`.agents/rules/commands.md`（CLI 用法）+ 同步 `.opencode` / `.trae`
- [ ] **Step 5: Commit** — `docs: document log CLI overrides and split log files`

---

## Self-Review 记录

- **Spec 覆盖**：§4.1→A1；§4.2→B1；§4.3→B2；§4.4→C1/C2/F1/F2/F3；§4.5→D1/D2/D3；§4.6→E1；§4.7→E2；§4.8→C3；§4.9→F1/F2/F3；§4.10→G1。无遗漏。
- **占位符**：无 TBD/TODO；每个 task 含文件、接口、测试与命令。
- **类型一致性**：`LogLevel`（A1）→ `LogConfig.log_level`（B1）→ `set_log_level`（B1/C1/C2/C3）→ `/app/preferences`（D2）一致；`terminal_prefix`（B2）→ `init` 调用（C1/C2）一致；`mergePrefPatches`（E1）命名唯一。