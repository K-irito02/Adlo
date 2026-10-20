# dsh 版本来源与真实版本管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 dsh 版本来源可控、可解释，并让安装/重装/卸载/切换当场真实执行且自动重启助手。

**Architecture:** 后端新增 `version_source` 偏好与来源解析纯函数；宿主版本改为 npm 真安装到 `<数据根>/dsh-versions/installed/<版本>`；新增 `/dsh/restart` 串行重启助手；前端新增来源选择器、按实际来源显隐管理项，并修复 DTO 字段名与检查更新提示。

**Tech Stack:** Rust（tokio / reqwest / serde / semver）+ Tauri 2 + React 19 + Zustand + TypeScript + Vitest。

**Spec:** `docs/superpowers/specs/2026-10-20-dsh-version-source-design.md`

## Global Constraints

- 不修改系统全局安装；不实现数据迁移；历史空目录视为未安装。
- 所有 UI 文本走 i18n，不硬编码；中英文案同步。
- 版本操作串行化；安装失败必须保留旧版本。
- 不新增注释（除非必要），沿用现有代码风格。
- 不新增向后兼容层。
- 测试只跑受影响范围：`cargo test -p <crate>` / `vitest run <file>`；同时保持 clippy、tsc 通过。

---

### Task 1: 版本 DTO 输出 camelCase

**Files:**
- Modify: `ai-digital-life/crates/dsh-version/src/lib.rs`
- Test: `ai-digital-life/crates/dsh-version/src/lib.rs`（`#[cfg(test)] mod tests`）

**Interfaces:**
- Produces: `VersionStatus` / `VersionInfo` / `VersionCatalog` 的 JSON 键为 `currentSelected`、`latestAvailable`、`prereleaseAvailable`、`hasPrereleaseUpdate`、`prereleaseUnknown`、`publishedAt`、`latestStable`、`latestPrerelease`。

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn version_status_serializes_camel_case() {
    let status = VersionStatus {
        current_selected: Some("0.2.0".into()),
        installed: vec!["0.2.0".into()],
        latest_available: None,
        has_update: false,
        prerelease_available: Some("0.2.1-rc.2".into()),
        has_prerelease_update: true,
        prerelease_unknown: false,
    };
    let json = serde_json::to_value(&status).unwrap();
    assert_eq!(json["currentSelected"], "0.2.0");
    assert!(json["latestAvailable"].is_null());
    assert_eq!(json["prereleaseAvailable"], "0.2.1-rc.2");
    assert_eq!(json["hasPrereleaseUpdate"], true);
    assert!(json.get("current_selected").is_none());
}

#[test]
fn version_catalog_serializes_camel_case() {
    let catalog = VersionCatalog {
        stable: vec![VersionInfo {
            version: "0.2.0".into(),
            published_at: Some("2026-09-29T09:56:27.000Z".into()),
        }],
        prerelease: vec![],
        latest_stable: Some("0.2.0".into()),
        latest_prerelease: None,
    };
    let json = serde_json::to_value(&catalog).unwrap();
    assert_eq!(json["stable"][0]["publishedAt"], "2026-09-29T09:56:27.000Z");
    assert_eq!(json["latestStable"], "0.2.0");
    assert!(json["latestPrerelease"].is_null());
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-dsh-version version_status_serializes_camel_case version_catalog_serializes_camel_case`
Expected: FAIL（`currentSelected` 为 null）。

- [ ] **Step 3: 加 serde 属性**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionStatus { /* ... */ }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo { /* ... */ }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionCatalog { /* ... */ }
```

- [ ] **Step 4: 运行通过**

Run: `cargo test -p adl-dsh-version`
Expected: PASS。

---

### Task 2: 新增 `version_source` 偏好

**Files:**
- Modify: `ai-digital-life/crates/download-source/src/lib.rs`
- Modify: `ai-digital-life/crates/server/src/handlers/dsh.rs`（保存/校验）
- Test: 两处 `#[cfg(test)]`

**Interfaces:**
- Produces: `adl_download_source::VersionSourceMode { Auto, System, Host }`；`DownloadSourceConfig.version_source`。
- API: `/dsh/source-config` 接受 `{ "version_source": "auto" | "system" | "host" }`；`/dsh/source-status` 的 `config.version_source` 返回同值。

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn version_source_defaults_to_auto_and_serializes_snake_case() {
    let config = DownloadSourceConfig::default();
    assert_eq!(config.version_source, VersionSourceMode::Auto);
    let json = serde_json::to_string(&config).unwrap();
    assert!(json.contains(r#""version_source":"auto""#));
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-download-source version_source_defaults_to_auto_and_serializes_snake_case`
Expected: FAIL（字段不存在）。

- [ ] **Step 3: 实现字段与枚举**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum VersionSourceMode {
    #[default]
    Auto,
    System,
    Host,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadSourceConfig {
    pub npm_registry: String,
    pub dsh_mirror: Option<String>,
    pub source_mode: SourceMode,
    pub version_source: VersionSourceMode,
    pub proxy: ProxyConfig,
}
```

- [ ] **Step 4: 保存接口支持**

在 `save_source_config_inner` 增加：

```rust
if let Some(mode) = input.get("version_source") {
    match mode {
        serde_json::Value::String(s) => {
            config.version_source = match s.as_str() {
                "auto" => adl_download_source::VersionSourceMode::Auto,
                "system" => adl_download_source::VersionSourceMode::System,
                "host" => adl_download_source::VersionSourceMode::Host,
                _ => return Err(AppError::InvalidInput(format!("invalid version source: {s}"))),
            };
        },
        serde_json::Value::Null => {},
        _ => return Err(AppError::InvalidInput("version_source must be string or null".into())),
    }
}
```

- [ ] **Step 5: 运行通过**

Run: `cargo test -p adl-download-source && cargo test -p adl-server save_source_config`
Expected: PASS。

---

### Task 3: 来源解析、宿主完整性、运行中指纹

**Files:**
- Modify: `ai-digital-life/crates/dsh-version/src/lib.rs`
- Test: 同文件 tests

**Interfaces:**
- Produces:
  - `pub enum EffectiveSource { Running, Host, System, Bundled, None }`
  - `pub fn resolve_effective_source(mode: VersionSourceMode, has_running: bool, has_host: bool, has_system: bool, has_bundled: bool) -> EffectiveSource`
  - `pub fn host_bin(root: &Path, version: &str) -> PathBuf`
  - `pub fn is_host_version_installed(root: &Path, version: &str) -> bool`
  - `pub fn is_dsh_http_response(status: u16, body: &str) -> bool`
  - `DshSource::HostInstalled { version: String, bin: PathBuf }`；删除 `DshSource::Download` 的自动 npx 行为。

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn resolve_source_modes() {
    use adl_download_source::VersionSourceMode::*;
    assert_eq!(resolve_effective_source(Auto, true, true, true, true), EffectiveSource::Running);
    assert_eq!(resolve_effective_source(Auto, false, true, true, true), EffectiveSource::Host);
    assert_eq!(resolve_effective_source(Auto, false, false, true, true), EffectiveSource::System);
    assert_eq!(resolve_effective_source(Auto, false, false, false, true), EffectiveSource::Bundled);
    assert_eq!(resolve_effective_source(Auto, false, false, false, false), EffectiveSource::None);
    assert_eq!(resolve_effective_source(System, false, true, true, true), EffectiveSource::System);
    assert_eq!(resolve_effective_source(System, false, true, false, true), EffectiveSource::None);
    assert_eq!(resolve_effective_source(Host, false, true, true, true), EffectiveSource::Host);
    assert_eq!(resolve_effective_source(Host, false, false, true, true), EffectiveSource::None);
}

#[test]
fn dsh_response_fingerprint() {
    assert!(is_dsh_http_response(401, "dsh web authentication required; reopen the URL"));
    assert!(is_dsh_http_response(200, "<title>DeepSeek Harness</title>"));
    assert!(!is_dsh_http_response(200, "<title>Some Dev Server</title>"));
    assert!(!is_dsh_http_response(404, "DeepSeek Harness"));
}

#[test]
fn host_installed_requires_bin_js() {
    let root = fresh_root("host_complete");
    let v = root.join("installed").join("1.0.0");
    std::fs::create_dir_all(&v).unwrap();
    assert!(!is_host_version_installed(&root, "1.0.0"));
    let bin = v.join("node_modules/@deepseek-ai/dsh/lib");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("bin.js"), "").unwrap();
    assert!(is_host_version_installed(&root, "1.0.0"));
    let _ = std::fs::remove_dir_all(&root);
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-dsh-version resolve_source_modes`
Expected: FAIL。

- [ ] **Step 3: 实现**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EffectiveSource { Running, Host, System, Bundled, None }

pub fn resolve_effective_source(
    mode: adl_download_source::VersionSourceMode,
    has_running: bool,
    has_host: bool,
    has_system: bool,
    has_bundled: bool,
) -> EffectiveSource {
    use adl_download_source::VersionSourceMode as Mode;
    if has_running { return EffectiveSource::Running; }
    match mode {
        Mode::System => if has_system { EffectiveSource::System } else { EffectiveSource::None },
        Mode::Host => if has_host { EffectiveSource::Host } else { EffectiveSource::None },
        Mode::Auto => {
            if has_host { EffectiveSource::Host }
            else if has_system { EffectiveSource::System }
            else if has_bundled { EffectiveSource::Bundled }
            else { EffectiveSource::None }
        },
    }
}

pub fn host_bin(root: &Path, version: &str) -> PathBuf {
    installed_dir(root)
        .join(version)
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("lib")
        .join("bin.js")
}

pub fn is_host_version_installed(root: &Path, version: &str) -> bool {
    host_bin(root, version).is_file()
}

pub fn is_dsh_http_response(status: u16, body: &str) -> bool {
    (status == 401 && adl_webapp_host::is_auth_required_body(body))
        || ((200..300).contains(&status) && body.contains("DeepSeek Harness"))
}
```

`detect_running_dsh` 改为使用 `is_dsh_http_response(status.as_u16(), &body)`。
`list_installed` 过滤 `is_host_version_installed`。
删除 `select_dsh_source` 的 `Download` 分支，新增：

```rust
pub enum DshSource {
    ReuseRunning { url: String, port: u16 },
    HostInstalled { version: String, bin: PathBuf },
    System { info: SystemDshInfo },
    Bundled { bundled: adl_dsh_bundle::BundledDsh },
    None,
}

pub fn select_dsh_source(
    data_dir: &Path,
    bundled: Option<&adl_dsh_bundle::BundledDsh>,
    mode: adl_download_source::VersionSourceMode,
    running: Option<RunningDshInfo>,
    system: Option<SystemDshInfo>,
) -> DshSource {
    let root = data_dir.join("dsh-versions");
    let host_version = read_selected(&root).ok().flatten()
        .filter(|v| is_host_version_installed(&root, v));
    let effective = resolve_effective_source(
        mode,
        running.is_some(),
        host_version.is_some(),
        system.is_some(),
        bundled.is_some(),
    );
    match effective {
        EffectiveSource::Running => {
            let r = running.expect("running checked");
            DshSource::ReuseRunning { url: r.url, port: r.port }
        },
        EffectiveSource::Host => {
            let v = host_version.expect("host checked");
            let bin = host_bin(&root, &v);
            DshSource::HostInstalled { version: v, bin }
        },
        EffectiveSource::System => DshSource::System { info: system.expect("system checked") },
        EffectiveSource::Bundled => DshSource::Bundled {
            bundled: bundled.expect("bundled checked").clone(),
        },
        EffectiveSource::None => DshSource::None,
    }
}
```

- [ ] **Step 4: 运行通过**

Run: `cargo test -p adl-dsh-version`
Expected: PASS。

---

### Task 4: 真安装引擎

**Files:**
- Create: `ai-digital-life/crates/dsh-version/src/install.rs`
- Modify: `ai-digital-life/crates/dsh-version/src/lib.rs`（`pub mod install;`、`uninstall`/`revert` 语义）
- Test: `install.rs` 内 tests

**Interfaces:**
- Produces:
  - `pub fn npm_install_args(tmp: &Path, version: &str, registry: &str) -> Vec<String>`
  - `pub async fn install(root: &Path, data_dir: &Path, version: &str) -> Result<String, AppError>`
  - `pub async fn uninstall(root: &Path, version: &str) -> Result<Option<String>, AppError>`（返回新的当前版本）
  - `pub async fn revert(root: &Path, version: &str) -> Result<String, AppError>`（要求完整安装）

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn npm_args_include_prefix_registry_and_version() {
    let args = npm_install_args(Path::new("/tmp/x"), "1.2.3", "https://registry.npmmirror.com");
    assert!(args.windows(2).any(|w| w == ["--prefix", "/tmp/x"]));
    assert!(args.contains(&"--registry=https://registry.npmmirror.com".to_string()));
    assert!(args.contains(&"@deepseek-ai/dsh@1.2.3".to_string()));
    assert!(args.contains(&"--no-audit".to_string()));
    assert!(args.contains(&"--no-fund".to_string()));
}

#[tokio::test]
async fn install_rejects_invalid_semver_offline() {
    let root = fresh_root("install_bad");
    let data = fresh_root("install_bad_data");
    let err = install(&root, &data, "bogus!!").await.expect_err("should fail");
    assert!(matches!(err, AppError::InvalidInput(_)));
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&data);
}

#[tokio::test]
async fn uninstall_current_selects_highest_remaining() {
    let root = fresh_root("uninstall_pick");
    for v in ["1.0.0", "2.0.0"] {
        let lib = root.join("installed").join(v).join("node_modules/@deepseek-ai/dsh/lib");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("bin.js"), "").unwrap();
    }
    std::fs::write(selected_file(&root), "2.0.0\n").unwrap();
    let next = uninstall(&root, "2.0.0").await.expect("uninstall ok");
    assert_eq!(next.as_deref(), Some("1.0.0"));
    assert_eq!(read_selected(&root).unwrap().as_deref(), Some("1.0.0"));
    let _ = std::fs::remove_dir_all(&root);
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-dsh-version npm_args_include_prefix_registry_and_version`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现安装/替换/卸载**

```rust
pub fn npm_install_args(tmp: &Path, version: &str, registry: &str) -> Vec<String> {
    vec![
        "install".into(),
        "--prefix".into(),
        tmp.to_string_lossy().into_owned(),
        format!("--registry={registry}"),
        "--no-audit".into(),
        "--no-fund".into(),
        "--loglevel=error".into(),
        format!("@deepseek-ai/dsh@{version}"),
    ]
}
```

- 校验 semver；registry 取 `adl_download_source::resolve_registry`。
- 保持官方发布校验：`fetch_catalog` 中找不到该版本时直接返回 `NotFound`（不创建目录）。
- 代理：`manual` 注入 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`；`none` 移除三个变量；`auto` 继承环境。
- 临时目录：`installed/.tmp-<version>-<nanos>`。
- `npm` 启动失败时 Windows 回退 `npm.cmd`；`kill_on_drop(true)`。
- 非零退出：读取 stderr 尾部 2000 字符，返回 `AppError::Io`。
- 校验 `host_bin(root, version)`；失败则删临时目录并报错。
- 原子替换：旧目录 → `.old-<nanos>`；临时目录 → 正式目录；删除旧目录。
- `uninstall`：删除目录；若为选中版本，`list_installed` 首个（降序）写回，空则清空 `selected.txt`；返回新选中。
- `revert`：要求 `is_host_version_installed`，否则 `NotFound`。

- [ ] **Step 4: 运行通过**

Run: `cargo test -p adl-dsh-version`
Expected: PASS。

---

### Task 5: 服务端来源解析、重启与缓存失效

**Files:**
- Modify: `ai-digital-life/crates/server/src/handlers/dsh.rs`
- Modify: `ai-digital-life/crates/server/src/state.rs`、`engine.rs`、`test_util.rs`、`router.rs`
- Test: `handlers/dsh.rs` tests

**Interfaces:**
- Produces:
  - `POST /dsh/restart` → `{ "restarted": bool, "url": string | null }`
  - `source-status` 增加 `versionSource: { mode, effective, hostVersion }`
  - `ServerState.dsh_version_lock: Arc<AsyncMutex<()>>`

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn version_source_payload_validation() {
    assert!(parse_version_source(Some(&serde_json::json!("auto"))).is_ok());
    assert!(parse_version_source(Some(&serde_json::json!("host"))).is_ok());
    assert!(parse_version_source(Some(&serde_json::json!("bogus"))).is_err());
    assert!(parse_version_source(Some(&serde_json::json!(1))).is_err());
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-server version_source_payload_validation`
Expected: FAIL。

- [ ] **Step 3: 实现**

`run_open`：

```rust
let config = adl_download_source::load(&paths.root)?;
let bundled = adl_dsh_bundle::detect(&paths.root)?;
let running = adl_dsh_version::detect_running_dsh(DSH_DEFAULT_PORT).await;
let system = adl_dsh_version::detect_system_dsh().await;
let source = adl_dsh_version::select_dsh_source(
    &paths.root,
    bundled.as_ref(),
    config.version_source,
    running,
    system,
);
```

- `HostInstalled { bin, .. }` 分支：
  `spawn_node_direct("node", &bin.to_string_lossy(), &["--profile","web","--no-open".into()].to_vec(), timeout)`。
- `None` 分支：`Err(AppError::NotFound("no dsh source available".into()))`。
- `get_source_status_inner` 增加：

```rust
let root = dsh_root(state);
let host_version = adl_dsh_version::read_selected(&root)?
    .filter(|v| adl_dsh_version::is_host_version_installed(&root, v));
let mode = config.version_source;
let effective = adl_dsh_version::resolve_effective_source(
    mode,
    running.is_some(),
    host_version.is_some(),
    system.is_some(),
    bundled.is_some(),
);
```

返回 `"versionSource": { "mode": mode, "effective": effective, "hostVersion": host_version }`（`mode`/`effective` 用 snake_case 小写值）。

`restart` handler：

```rust
pub async fn restart(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_restart(&state).await;
    ipc::to_response(result)
}

async fn run_restart(state: &ServerState) -> Result<serde_json::Value, AppError> {
    let _guard = state.dsh_start_lock.lock().await;
    let had_process = {
        let mut guard = state.dsh_state.lock().await;
        match guard.take() {
            Some(mut hp) => {
                let _ = hp.child.kill().await;
                let _ = hp.child.wait().await;
                true
            },
            None => false,
        }
    };
    let killed_external = kill_verified_external_dsh_on_default_port().await?;
    if let Ok(mut cache) = state.dsh_source_cache.write() { *cache = None; }
    let opened = run_open(
        state.dsh_state.clone(),
        state.dsh_start_lock.clone(),
        state.storage.paths(),
        state.dsh_source_cache.clone(),
    ).await;
    match opened {
        Ok(value) => {
            let restarted = had_process || killed_external;
            Ok(serde_json::json!({
                "restarted": restarted,
                "url": value.get("url").cloned(),
            }))
        },
        Err(e) => Err(e),
    }
}
```

`kill_verified_external_dsh_on_default_port` 复用 `pids_listening_on` / `process_cmdline` / `is_dsh_cmdline` / `kill_pid`，只杀验证过的 PID；没有则返回 `Ok(false)`。

- 在 `install_version`、`revert`、`uninstall`、`reinstall`、`save_source_config_inner` 成功后清空 `dsh_source_cache`。
- 路由增加 `.route("/dsh/restart", post(handlers::dsh::restart))`。

- [ ] **Step 4: 运行通过**

Run: `cargo test -p adl-server dsh && cargo clippy -p adl-server -p adl-dsh-version -p adl-download-source --all-targets -- -D warnings`
Expected: PASS。

---

### Task 6: 前端 IPC 类型与桥接

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/dsh.ts`
- Modify: `ai-digital-life/frontend/src/httpBridge.ts`
- Modify: `ai-digital-life/frontend/src/tauri-bridge/tauri-dsh.ts`
- Modify: `ai-digital-life/frontend/src/mock/mock-dsh.ts`
- Test: `ai-digital-life/frontend/src/shared/ipc/__tests__/` 或现有 bridge parity 测试

**Interfaces:**
- `DshBridge.restart(): Promise<IpcResult<{ restarted: boolean; url: string | null }>>`
- `DshSourceStatus.versionSource: { mode: 'auto'|'system'|'host'; effective: 'running'|'host'|'system'|'bundled'|'none'; hostVersion: string | null }`
- `DshSourceConfig.version_source?: 'auto'|'system'|'host'`

- [ ] **Step 1: 写失败测试**

在现有 bridge parity 测试中断言 `restart` 存在；在 `mock-dsh` 测试中断言 `versionSource` 字段。

- [ ] **Step 2: 实现类型与桥接**

```ts
restart: () => call<DshRestartResult>(baseUrl, '/dsh/restart', POST({})),
```

`tauri-dsh.ts` 增加 `restart: httpDsh.restart`；`mock-dsh.ts` 增加 `restart` 返回 `{ ok: true, data: { restarted: true, url: MOCK_URL } }`，并补齐 `versionSource` 与 `config.version_source`。

- [ ] **Step 3: 运行通过**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/httpBridge/__tests__/httpBridge.test.ts`
Expected: PASS。

---

### Task 7: Store actions（立即生效 + 标签同步）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/actions/dshActions.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/StoreState.ts`（如需新 action）
- Test: `ai-digital-life/frontend/src/app/stores/actions/__tests__/dshActions.test.ts`

**Interfaces:**
- Produces: `restartDsh(): Promise<{ restarted: boolean; url: string | null }>`
- `installDshVersion` / `revertDsh` / `uninstallDsh` / `reinstallDsh` 成功后调用 `restartDsh()` 并同步 dsh 标签。

- [ ] **Step 1: 写失败测试**

```ts
it('install version restarts dsh and navigates existing tab', async () => {
  // mock installVersion ok + restart ok + 已有同源标签
  await store.getState().installDshVersion('0.2.1-rc.2');
  expect(restartMock).toHaveBeenCalledTimes(1);
  expect(updateTabMock).toHaveBeenCalledWith('tab-1', { url: 'http://127.0.0.1:3080/?token=new' });
});
```

- [ ] **Step 2: 实现**

```ts
restartDsh: async () => {
  const result = await window.digitalLife.dsh.restart();
  if (!result.ok) return { restarted: false, url: null };
  if (result.data.url) syncDshTab(get, result.data.url);
  return result.data;
},
```

`syncDshTab`：按 origin 找已有标签；找到则 `browserUpdateTab(id, { url })` 并居中聚焦；否则 `browserOpenTab(url)` + `centerShowBrowserTab`。

四个变异 action 在成功分支调用 `await get().restartDsh()`。

- [ ] **Step 3: 运行通过**

Run: `cd frontend && npx vitest run src/app/stores/actions/__tests__/dshActions.test.ts`
Expected: PASS。

---

### Task 8: UI 与文案

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/dsh/DshVersionManagement.tsx`
- Modify: `ai-digital-life/frontend/src/shared/settings-reset/dshReset.ts`（默认值加 `version_source: 'auto'`）
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/dsh.ts`、`en-US/dsh.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/__tests__/keys.test.ts`
- Test: `ai-digital-life/frontend/src/app/features/dsh/DshVersionManagement.test.tsx`

**Interfaces:**
- 新增 i18n：
  - `dshVersionSource` / `dshVersionSourceDesc` / `dshVersionSourceHint`
  - `dshVersionSourceAuto` / `dshVersionSourceSystem` / `dshVersionSourceHost`
  - `dshSystemManagedNote` / `dshNoSourceNote`
  - `dshInstalling` / `dshInstalledAndRestarted` / `dshRestarted`
  - `dshCheckUpdateNoStable` / `dshCheckUpdatePrerelease`
  - 重写 `dshCurrentVersionHint`

- [ ] **Step 1: 写失败测试**

```tsx
it('hides management rows when effective source is system', () => {
  useAppStore.setState({ sourceStatus: makeStatus({ versionSource: { mode: 'auto', effective: 'system', hostVersion: null } }) });
  render(<DshVersionManagement />);
  expect(screen.queryByText('dshCheckUpdate')).toBeNull();
  expect(screen.queryByText('dshOfficialStable')).toBeNull();
  expect(screen.getByText('dshSystemManagedNote')).toBeTruthy();
});

it('auto with no source switches preference to host', async () => {
  // effective none, mode auto → saveSourceConfig 被调用 version_source=host
});
```

- [ ] **Step 2: 实现 UI**

- 首行「版本来源」：`SettingsSelect`，options 自动检测/系统安装/宿主安装；`onChange` 调 `saveSourceConfig({ version_source })` 后 `fetchSourceStatus(true)`。
- `effective === 'system'`：隐藏检查更新/正式版/预发布，显示 `dshSystemManagedNote`。
- `effective === 'none' && mode === 'auto'`：调用一次 `saveSourceConfig({ version_source: 'host' })` + `fetchSourceStatus(true)`，显示 `dshNoSourceNote`（ref 防重复）。
- 当前版本行按 effective 渲染；宿主版本显示版本号与徽标。
- 组件新增 `restarting` 状态并计入 `versionBusy`；每个版本操作成功后依次调用 `restartDsh()`、`fetchSourceStatus(true)`、`fetchDshVersionStatus(true)`。
- 检查更新 toast：

```ts
if (status.hasUpdate && status.latestAvailable) toast(dshHasUpdate)
else if (status.hasPrereleaseUpdate && status.prereleaseAvailable) toast(dshCheckUpdatePrerelease.replace('{version}', ...))
else if (status.latestAvailable) toast(dshNoUpdate)
else toast(dshCheckUpdateNoStable, 'info')
```

- 安装/切换/卸载/重装成功文案包含“已切换/已重启”。

- [ ] **Step 3: 运行通过**

Run: `cd frontend && npx vitest run src/app/features/dsh/DshVersionManagement.test.tsx src/app/i18n/__tests__/keys.test.ts`
Expected: PASS。

---

### Task 9: 全量受影响验证、文档与手动测试

**Files:**
- Modify: `docs/development/`（DSH 版本管理手册，如存在）
- Modify: `CONTEXT.md`（DSH Version 条目：来源偏好与宿主安装）
- Modify: `docs/knowledge-base/README.md` + 新增知识库条目
- Modify: `docs/root-cause-to-close/2026-10/progress-2026-10-20-001712.md`

- [ ] **Step 1: 质量门禁**

Run:
`cd ai-digital-life && cargo clippy --workspace --all-targets -- -D warnings`
`cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run src/app/features/dsh src/app/stores/actions/__tests__/dshActions.test.ts src/httpBridge/__tests__/httpBridge.test.ts`
Expected: 0 errors（允许既有 warning）。

- [ ] **Step 2: 手动测试（用户执行）**

1. 启动：`pnpm dev:tauri -- --log-level debug --debug-log-mode multi --terminal-log-mode multi`
2. 设置 → DSH → 版本管理：
   - 默认自动检测，当前来源应为「系统安装」，管理项隐藏，出现系统安装说明。
3. 版本来源切到「宿主安装」：出现检查更新/正式版/预发布。
4. 预发布里选 `0.2.1-rc.2` → 安装：按钮进入“正在安装”，约 1–3 分钟；成功后当前版本变为该版本，助手自动重启，标签地址更新。
5. 切换到 `0.2.0-rc.2`（若未安装则先安装）：立即重启。
6. 重新安装：同版本重装并重启。
7. 卸载当前版本：自动改选剩余最高版本；无剩余时提示没有可用版本。
8. 断网安装：报错，旧版本仍可用。
9. 用其它程序占用 3080：打开助手提示端口占用，不误杀。

- [ ] **Step 3: 记录日志证据**

在 `.adl-logs/debug-logs*.txt` 与 `ai-digital-life/.adl-logs/adl-server-logs*.txt` 搜索 `[ADL-DSH-VER]`、`dsh-version:`、`dsh::restart`，确认：
- `version status resolved` 的字段与前端读取一致；
- 安装/重启均有成功日志；
- 无未解 ERROR。
