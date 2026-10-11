# 日志设置修复 + 开发阶段 CLI 控制 — 设计规格

- 日期：2026-10-11
- 状态：已获用户批准（6 项决策全部定稿）
- 关联进度文件：`docs/root-cause-resolution/2026-10/progress-2026-10-11-205426.md`
- 范围：设置面板「通用」组三个设置项（日志级别 / 终端日志模式 / 调试日志模式）的缺陷修复 + 开发阶段终端 CLI 控制能力

---

## 1. 背景与目标

「通用」组三个设置项是排查 bug、验证稳定性、测试功能时的核心辅助手段，用户与 agent 都需要用。经 Phase 0 调查，发现 10 项缺陷，其中 3 项为"设置了但完全无效"级别。

**目标**：
1. 三个设置项在 Tauri 桌面与浏览器两种模式下都真实生效、行为一致
2. 新增"开发阶段"能力：用户与 agent 通过终端命令启动应用并在启动时控制这三个设置
3. 全部修复有可验证证据（单测 + 集成测试 + 真实文件落盘断言）

## 2. 缺陷清单（Phase 0 实证）

| # | 缺陷 | 根因 |
|---|------|------|
| 1 | 日志级别完全无效 | `LogConfig` 无 `log_level` 字段；filter 硬编码 stdout=`info`/file=`debug`；`log_level` 零消费点 |
| 2 | 浏览器模式三个设置全挂 | `preview-bridge` 的 app 域接 httpBridge `NOT_SUPPORTED` 桩（f8fb72fd 回归）；ad-server 无 `/app/*` 路由 |
| 3 | adl-server 不读设置（+ 日志落点易混淆） | `engine.rs` 用 `LogMode::default()` 且不读 config.json；shell 改设置不通知 server。**更正（实证 2026-10-11）**：两进程 `resolve_log_dir` 的 `dev_project_root` 取自各自 `CARGO_MANIFEST_DIR`，目录**本就不同**（壳 `<仓库根>/.adl-logs`、server `<仓库根>/ai-digital-life/.adl-logs`），故 terminal-logs **不存在**互写截断；真实冲突在 `debug-logs.txt`（浏览器前端与 Tauri 壳同落 `<仓库根>/.adl-logs/`，`dev:both` 下互相覆盖，已由 4.7 的分名修复） |
| 4 | set_mode 失败被静默吞掉 | `app.rs` `let _ = state.log_manager.set_mode(...)`；config 已先改写 → 永久漂移 |
| 5 | 浏览器模式调试日志模式不生效 | `debugLogCollector` 读 `localStorage['adl_log_mode_debug']`，全仓库无人写该 key |
| 6 | 外部改 config.json 不同步日志子系统 | `ConfigWatcher` 只更新 `config_arc`，不调 `set_mode` |
| 7 | 快速连续改设置丢 patch | `generalActions.updatePreferences` 的 `isFetching` 守卫静默丢弃 |
| 8 | log_level 无校验 | 任意字符串入库 |
| 9 | 死 API | `app_set_log_mode` 命令 + bridge `setLogMode` 四端实现，无任何调用方 |
| 10 | CLI 雏形不完整 | `--log-mode` 只能同时设两模式、无 `--log-level`、无校验；ad-server 无日志参数；启动脚本不转发 |

## 3. 定稿决策

| 决策 | 选择 | 要点 |
|------|------|------|
| 1 日志级别生效方式 | **A1 + 语义 b** | `tracing_subscriber::reload` 热切换；`logLevel` 控 stdout 层；file 层 = `max_verbosity(logLevel, debug)`（保留下限 debug 的尸检能力） |
| 2 浏览器模式 app 域 | **C1** | ad-server 新增 `/app/info` + `/app/preferences`；httpBridge 桩换真实 fetch；config.json 单一真源 |
| 3 双进程日志文件 | **F1** | 按进程角色分文件：shell = `terminal-logs.txt` 系列；adl-server = `adl-server-logs.txt` 系列 |
| 4 并发 patch | **P1** | 合并式排队：in-flight 期间到达的 patch 合并进队列，完成后一次发出；不丢、不并发写盘 |
| 5a log_level 校验 | 做 | 类型级：引入 `LogLevel` 枚举（消灭 Issue 8） |
| 5b 死 API | **删** | 删除 `app_set_log_mode` 命令 + 四端 `setLogMode` 方法 |
| 6a 持久化 | **S1 session-only** | CLI/env 覆盖只对本次进程生效，**不写 config.json** |
| 6b 参数面 | flag + env 双通道 | 优先级 `CLI flag > RUST_LOG > ADL_* env > config.json > 默认` |
| 6e 生效范围 | **R1 启动时** | 不做运行中热改 CLI 入口 |

---

## 4. 目标设计

### 4.1 `LogLevel` 类型与跨 IPC 契约（解决 Issue 8）

- 新增 `adl_types::types::config::LogLevel` 枚举：`Error | Warn | Info | Debug | Trace`，`#[serde(rename_all = "lowercase")]` + `TS` derive，与既有 `LogMode` 同处、同风格。
- 实现 `FromStr`（大小写不敏感，非法值 `Err`）、`Display`、`PartialOrd/Ord`（按 verbosity：Error < Warn < Info < Debug < Trace）、`max_verbosity(a, b)` 辅助。
- 契约变更：`AppConfig.log_level: String → LogLevel`；`ConfigSnapshot.log_level: String → LogLevel`；`AppPreferencePatch.log_level: Option<String> → Option<LogLevel>`。
- TS 侧 `logLevel` 变为字面量联合类型；`settingsViewModel` 的 options 与该联合对齐（`as LogLevel` 替代 `as string`）。
- 迁移：`config.json` 中旧值（小写字符串）反序列化兼容（lowercase 与现状一致）；非法值 → 反序列化失败 → `load_from` 回退默认（已有 `AppConfig::default()` 兜底路径）。

### 4.2 adl-logging reload 基础设施（决策 1）

- `LogConfig` 新增 `log_level: LogLevel`。
- `LogManager` 新增字段：`stdout_filter: reload::Handle<EnvFilter, Registry>`、`file_filter: reload::Handle<EnvFilter, Registry>`。
- `LogManager::init(config, log_dir, process_role)`：
  - 构造 `reload::Layer::new(EnvFilter::new(init_stdout))` 与 `reload::Layer::new(EnvFilter::new(init_file))`，取 handle 存入 manager。
  - `init_stdout` = logLevel；`init_file` = `max_verbosity(logLevel, Debug)`。
  - 若设置了 `RUST_LOG`，则两层初始 filter 都用 RUST_LOG（保留现有 env 覆盖语义）。
- 新增 `set_log_level(&self, level: LogLevel) -> LogResult<()>`：
  - 写 `config.log_level`（写锁内**禁 tracing**，沿用既有死锁回归约束）；
  - 守卫释放后 `stdout_filter.reload(...)`、`file_filter.reload(...)`；
  - 最后 `tracing::info!("[ADL-LOG] log level changed")`。
- `adl-logging/Cargo.toml`：`tracing-subscriber` features 增加 `"reload"`。
- 启动日志行：`[ADL-LOG] level=info stdout=info file=debug role=shell`（便于用户/agent 自证）。

### 4.3 进程角色文件分离（决策 3 / F1）

- `LogManager::init` 增加 `process_role: LogProcessRole`（`Shell` / `Server`），或等价地接受 `terminal_prefix: &str`。
- shell 前缀 `terminal-logs`；server 前缀 `adl-server-logs`。
- `TerminalMakeWriter` / `open_terminal_file` / `SessionTracker` 名称 / prune 前缀全部改用该前缀。
- `debug-logs` 仅 shell 侧写（`write_debug_logs`），server 不写，保持无冲突。
- 影响：`AGENTS.md` 调试工具章节、`crates/kernel/src/storage` 文档中提及的 terminal-logs 路径说明同步更新。

### 4.4 配置优先级与 session-only 覆盖（决策 6a/6b）

解析顺序（两进程一致）：

```
CLI flag  →  RUST_LOG  →  ADL_* env  →  config.json  →  默认值
```

- CLI flag（`--log-level` / `--terminal-log-mode` / `--debug-log-mode` / 兼容 `--log-mode`）→ 启动时写入 `ADL_LOG_LEVEL` / `ADL_TERMINAL_LOG_MODE` / `ADL_DEBUG_LOG_MODE` env，再被本进程读取。
- env 作为**跨进程传输通道**：shell 经 `AdServerHandle::spawn` 派生的 ad-server 子进程自动继承 → 单一 env 同时覆盖两个后端进程。
- **session-only**：覆盖值不写回 config.json。启动打印 `[ADL-CLI] level=… terminal=… debug=… (session override, not persisted)`。
- 若存在 session 覆盖，`ConfigWatcher` 重载不得覆盖被 session 覆盖的字段（见 4.8）。

### 4.5 ad-server `/app` 路由（决策 2 / C1）

- 抽取共享纯函数 `adl_kernel::app_info::build(config: &AppConfig, current_workspace: Option<WorkspaceMeta>) -> AppInfo`（含 `resolved_theme` 推导、`ConfigSnapshot` 构造），shell 的 `build_app_info` 与 server handler 共用，消除双份契约面。
- 新增 `crates/server/src/handlers/app.rs`：
  - `GET /app/info` → `IpcResult<AppInfo>`：从 `storage.paths().config_dir` 读 config + 从 state 取 currentWorkspace。
  - `POST /app/preferences` → body `AppPreferencePatch`：read-modify-write config.json（`Mutex` 串行化），应用 patch（含 `log_level` / `terminal_log_mode` / `debug_log_mode` 校验与 clamp），对本进程 `LogManager` 调用 `set_mode` / `set_log_level`，返回更新后的 `AppInfo`。
  - `set_mode` 失败必须返回结构化错误（解决 Issue 4 的吞错）。
- `ServerState` 新增 `log_manager: Arc<LogManager>`（`init_server_state` 目前 `let _log_manager = ...` 丢弃，改为存入）。
- `router.rs` 注册两条路由。
- httpBridge：`app.getInfo` / `app.updatePreferences` 由桩改为真实 `call()` fetch。
- 桌面路径不变（Tauri invoke 覆盖）。

### 4.6 前端 `updatePreferences` 合并式排队（决策 4 / P1）

- `generalActions` 内模块级队列：
  ```
  type Pending = { patch: AppPreferencePatch; resolve: (ok: boolean) => void };
  let queue: Pending[] = [];
  let running = false;
  ```
- 调用时入队并返回 Promise；runner 排空队列 → `mergePrefPatches` 合并为单一 patch → 一次 IPC → 所有 pending 以同一结果 resolve。
- `mergePrefPatches(a, b)`：`fonts` 一级深合并（避免 `uiFont`/`codeFont` 互相覆盖）；`keybinds` 整表覆盖（UI 传全量）；其余标量后者胜。
- 保留 `clearError(SCOPE)` / `captureError(get, error, SCOPE)` / `isFetching['updatePreferences']` 语义（running 期间 true）。
- 消除 Issue 7 的静默丢弃，且不引入并发 config 写盘。

### 4.7 浏览器模式调试日志模式来源修复（Issue 5）

- `debugLogCollector`（浏览器分支）的 mode 来源改为解析链：
  `import.meta.env.VITE_ADL_DEBUG_LOG_MODE`（CLI/env 注入）→ `appInfo.config.debugLogMode`（C1 打通后可用）→ `'overwrite'`。
- 删除幻影 key `adl_log_mode_debug` 读取。
- Tauri 分支不变（`write_debug_logs_to_project` 用 LogManager 自身 config）。
- **文件名分名（消除真实冲突）**：浏览器模式的调试日志由 dev preview service 写到 `<仓库根>/.adl-logs/debug-logs-browser*.txt`（原为 `debug-logs.txt`，与 Tauri 壳同目录同名 → `dev:both` 下互相覆盖）。

### 4.8 ConfigWatcher 联动（Issue 6）

- `setup.rs` 的 config 更新任务：在写 `config_arc` 后，比较新旧 `terminal_log_mode` / `debug_log_mode` / `log_level`，若有变化则调用 `log_manager.set_mode(...)` / `set_log_level(...)`（守卫外调用，避免死锁）。
- 若该字段存在 **session 覆盖**，则跳过同步（session 优先）。
- 同步失败只 `tracing::warn!`（外部改文件属非关键路径），不漂移 config.json。

### 4.9 CLI 参数面（决策 6 / S1 + R1）

**flag（`pnpm <script> -- --flag value`）**

```
--log-level <error|warn|info|debug|trace>
--terminal-log-mode <overwrite|append|multi>
--debug-log-mode <overwrite|append|multi>
--log-mode <overwrite|append|multi>     # 兼容简写：同时设两模式
```

**env**：`ADL_LOG_LEVEL` / `ADL_TERMINAL_LOG_MODE` / `ADL_DEBUG_LOG_MODE`；保留 `ADL_CLI_LOG_MODE` 兼容旧用法。

**修改点**

| 文件 | 改动 |
|------|------|
| `src-tauri/src/main.rs` | `parse_cli_log_mode` → `parse_cli_log_overrides()`，解析 4 个 flag + 白名单校验（非法值 `eprintln!` 告警并忽略），写入 env |
| `crates/server/src/bin/adl-server.rs` | 新增解析 3+1 个 flag → 写 env（保留 `--port` / `--data-dir`） |
| `src-tauri/src/setup.rs` | 读 env 覆盖 → session-only 应用 + 打印 `[ADL-CLI]` 行 |
| `crates/server/src/engine.rs` | 读 config.json → 应用 env 覆盖 → 传 `LogConfig{...}` 给 init；LogManager 存入 state |
| `scripts/run-project-surface.mjs` | `process.argv.slice(3)` 透传解析 → ① 注入 env 给 Vite 子进程 ② 经 `cargo tauri dev --config X -- <args>` 传给应用 ③ env 自动继承给 shell 派生的 ad-server |
| `frontend/dev/ad-server-launch.mjs` | 显式把 env 传给 ad-server 子进程；并把 `debugLogMode` 注入为 `VITE_ADL_DEBUG_LOG_MODE` 给 Vite |

**已知边界（写入文档）**：`dev:browser`（纯 Vite、无 ad-server）下「日志级别 / 终端日志模式」无后端可作用，仅「调试日志模式」经 `VITE_ADL_DEBUG_LOG_MODE` 生效；需要完整后端日志请用 `dev:preview` / `dev:tauri` / `dev:both`。

### 4.10 死代码清理（决策 5b）

- 删除 `#[tauri::command] app_set_log_mode`（app.rs）+ `main.rs` 注册项。
- 删除 `DigitalLifeBridge.setLogMode`（`shared/ipc/digital-life.ts`）+ 四端实现（tauri/preview/mock/http）。
- 删除相关测试与 JSDoc 引用；确认无 capability / 文档残留。

---

## 5. 错误处理

- 所有 `set_mode` / `set_log_level` 失败：Rust 侧返回 `AppError`，前端 `captureError(get, error, SCOPE)`，禁止 `let _ =`。
- `/app/preferences` 写盘失败：返回结构化 IPC 错误，不部分应用。
- CLI 非法值：告警 + 忽略该 flag（不 abort 启动），并打印可用取值。
- 会话锁 / 配置锁中毒：沿用现有 `map_err` → `AppError::Internal` 模式，禁止 `unwrap()`。

## 6. 测试策略

**Rust**
- `adl-logging`：`LogLevel` 解析/排序/`max_verbosity`；`set_log_level` 实际改变文件层输出（写 trace 事件 → 断言文件含/不含）；file 层下限 debug 语义；进程角色前缀分文件（shell vs server 互不截断）；reload 不触发既有死锁回归。
- `adl-kernel`：`app_info::build` 纯函数契约（theme 推导、字段完整）。
- `adl-server`：`/app/info`、`/app/preferences` 集成测试（含非法 patch 拒绝、log mode 生效、config.json 落盘）。
- `adl-types`：`LogLevel` serde 往返 + TS 生成。
- `src-tauri`：CLI 解析单测（含非法值、简写、缺失值）。

**前端（Vitest）**
- `preview-bridge/__tests__/app-bridge-parity.test.ts`（已建，当前 RED）→ GREEN：getInfo/updatePreferences 真实往返。
- `generalActions`：合并队列（并发 patch 不丢、同字段后者胜、fonts 一级深合并、isFetching 语义、错误记录）。
- `settingsViewModel`：logLevel 联合类型 options 对齐。
- `debugLogCollector`：mode 解析链（env > appInfo > 默认），不读幻影 key。

**端到端手测（用户/agent 可复现）**
- `pnpm dev:tauri -- --log-level trace --terminal-log-mode multi` → 断言 `[ADL-CLI]` 行 + 多文件落盘 + 文件含 trace。
- 两进程分文件且**分目录**：`<仓库根>/.adl-logs/terminal-logs*.txt` 与 `<仓库根>/ai-digital-life/.adl-logs/adl-server-logs*.txt` 并存且各自完整。

## 7. 实施顺序（依赖约束）

```
A. adl-types: LogLevel 枚举 + 契约（前置，被所有后续依赖）
B. adl-logging: reload 基础设施 + log_level + 进程角色分文件（A1/F1 核心）
C. 后端接线: setup.rs(shell) / engine.rs(server) 读 config + env 覆盖 + 存 LogManager
D. ad-server /app 路由 + 抽取 app_info::build + httpBridge 真实实现
E. 前端: P1 合并队列 / Issue5 mode 来源 / Issue6 watcher 联动
F. CLI: main.rs + adl-server.rs 解析 + 两个启动脚本转发
G. 清理: 删 app_set_log_mode + setLogMode 四端
H. 验收: mandatory-testing 全流程 + 文档同步（AGENTS.md / commands.md / 相关 rules）
```

## 8. 风险与注意事项

| 风险 | 缓解 |
|------|------|
| 契约从 `logLevel: string` → 联合类型，波及生成类型与多处测试 | 字面量兼容（`'info'` 仍可赋值）；逐处核对编译错误 |
| reload handle 与既有"持锁禁 tracing"纪律冲突 | `reload::Handle` 操作不发 tracing；仍严格守卫外调用 |
| shell/server 双写 config.json 竞态 | 桌面走 Tauri、浏览器走 HTTP，实际不并发；server 侧 `Mutex` 串行化 |
| `cargo tauri dev` 参数透传语法 | 实现时以 `--config X -- <args>` 实测验证；失败则退回纯 env 通道 |
| 删除 `setLogMode` 影响面 | 全仓库 grep 确认零调用后再删（已初步确认） |
| 浏览器 `dev:browser` 无后端 | 文档明示边界，推荐 `dev:preview` |