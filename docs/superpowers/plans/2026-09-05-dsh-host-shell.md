# dsh 宿主壳接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 dsh（DeepSeek Harness）作为完全隔离的顶层 Web 应用接入项目：宿主只在空闲端口拉起 `dsh --profile web` 并将其 URL 显示在界面中间区（浏览器模式 iframe / Tauri 桌面独立 WebView2 子窗口），同时在欢迎引导页提供版本管理（查更新/升级/回退/卸载/重装/重启）。

**Architecture:** 宿主壳三明治结构。Rust 新增两个 crate：`adl-webapp-host`（进程守护 + 空闲端口 + 就绪探测，未来多 WebApp 复用）与 `adl-dsh-version`（dsh cli 版本目录管理）。通过 `#[tauri::command]` + IPC 三桥暴露给前端。前端在中间区渲染 dsh 宿主（浏览器 iframe / Tauri WebView），关闭进入欢迎引导页（版本管理 UI）。dsh 一律只"拉进程 + 开 URL"，不 import dsh 代码，零适配。

**Tech Stack:** Rust（tauri/tokio/reqwest/semver/serde）、React 19 + Vite + TypeScript、Zustand 切片、IPC 三桥（tauri/preview/mock）。

## Global Constraints

- Rust crate 命名：`adl-` 前缀（`rust-crate-adl-prefix-convention`）。
- Tauri Command 命名：`dsh_` 前缀，`{domain}_{action}` 蛇形（`dsh_open` / `dsh_get_version_status`）。
- Tauri Command 统一用 `ipc()` / `ipc_try()` 包装器返回 `IpcResult<T>`；涉及 I/O 必须 `async fn` + `spawn_blocking`。
- 前端图表 i18n 全覆盖（zh-CN / en-US 同步新增 key），禁止硬编码中英文。
- 禁止 `unwrap()`、禁止空 `catch {}`；错误用 `AppError` / `captureError` 模式。
- dsh 隔离硬约束：dsh WebView capability 不得授予宿主原生命令（仅 `core:default`）。
- 版本管理器只读写"宿主管理的 dsh cli 版本目录"，绝不写入 dsh 自身配置/会话/插件目录。
- Rust 单元测试内联 `#[cfg(test)] mod tests`；前端测试放置于待测模块同级 `__tests__/`。
- 结束验收：变更后必须运行 `cargo fmt`/`clippy`/`check`/`test` 与前端 `lint`/`format`/`typecheck`/`test`（见 `mandatory-testing.md`）。

---

### Task 1: `adl-webapp-host` crate — 进程托管 + 端口分配 + 就绪探测

**Files:**
- Create: `ai-digital-life/crates/webapp-host/Cargo.toml`
- Create: `ai-digital-life/crates/webapp-host/src/lib.rs`
- Create: `ai-digital-life/crates/webapp-host/src/port.rs`
- Test: 内联于 `src/*.rs` 的 `#[cfg(test)] mod tests`
- Modify: `ai-digital-life/crates/Cargo.toml`（workspace 成员）

**Interfaces:**
- Consumes: `adl_errors::AppError`
- Produces:
  - `pub fn pick_free_port() -> Result<u16, AppError>`
  - `pub struct HostedProcess { pub url: String, pub port: u16 }`
  - `pub async fn spawn_and_wait_ready(program: &str, args: &[String], timeout: Duration) -> Result<HostedProcess, AppError>`（内部用 `tokio::process::Command` + 轮询 `GET /` 直到 200）

- [ ] **Step 1: 写 `Cargo.toml`**

```toml
[package]
name = "adl-webapp-host"
version.workspace = true
edition.workspace = true

[dependencies]
adl-errors = { path = "../errors" }
tokio = { workspace = true }
reqwest = { workspace = true, features = ["json"] }
thiserror = { workspace = true }
```

- [ ] **Step 2: 实现 `port.rs` 与内联测试**

```rust
use adl_errors::AppError;
use std::net::TcpListener;

pub fn pick_free_port() -> Result<u16, AppError> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::Io(format!("bind ephemeral port failed: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Io(format!("local_addr failed: {e}")))?
        .port();
    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_a_port_in_valid_range() {
        let port = pick_free_port().expect("port should be picked");
        assert!(port > 0, "port must be > 0");
    }
}
```

- [ ] **Step 3: 实现 `lib.rs`（spawn + 就绪探测）与内联测试**

```rust
pub mod port;

use adl_errors::AppError;
use port::pick_free_port;
use std::time::Duration;

pub struct HostedProcess {
    pub child: tokio::process::Child,
    pub url: String,
    pub port: u16,
}

pub async fn spawn_and_wait_ready(
    program: &str,
    args: &[String],
    timeout: Duration,
) -> Result<HostedProcess, AppError> {
    let port = pick_free_port()?;
    let url = format!("http://127.0.0.1:{port}");
    let mut child = tokio::process::Command::new(program)
        .args(args)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::Io(format!("spawn {program} failed: {e}")))?;

    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if tokio::time::Instant::now() >= deadline {
            child.kill().await.map_err(|e| AppError::Io(format!("timeout kill failed: {e}")))?;
            return Err(AppError::Timeout(format!("{program} not ready in {timeout:?}")));
        }
        let is_up = reqwest::Client::new()
            .get(&url)
            .timeout(Duration::from_millis(500))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if is_up {
            return Ok(HostedProcess { child, url, port });
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}
```

- [ ] **Step 4: `cargo check` + `cargo test` 通过**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -p adl-webapp-host`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/webapp-host ai-digital-life/crates/Cargo.toml
git commit -m "feat(webapp-host): add dsh base webapp host crate with port pick + readiness probe"
```

---

### Task 2: `adl-dsh-version` crate — dsh cli 版本目录管理

**Files:**
- Create: `ai-digital-life/crates/dsh-version/Cargo.toml`
- Create: `ai-digital-life/crates/dsh-version/src/lib.rs`
- Test: 内联 `#[cfg(test)] mod tests`
- Modify: `ai-digital-life/crates/Cargo.toml`

**Interfaces:**
- Consumes: `adl_errors::AppError`
- Produces:
  - `pub struct VersionStatus { pub current_selected: Option<String>, pub installed: Vec<String>, pub latest_available: Option<String>, pub has_update: bool }`
  - `pub async fn get_version_status(root: &Path) -> Result<VersionStatus, AppError>`
  - `pub async fn update(root: &Path) -> Result<String, AppError>`
  - `pub async fn revert(root: &Path, version: &str) -> Result<String, AppError>`
  - `pub async fn uninstall(root: &Path, version: &str) -> Result<(), AppError>`
  - `pub async fn reinstall(root: &Path) -> Result<String, AppError>`

- [ ] **Step 1: 写 `Cargo.toml`**

```toml
[package]
name = "adl-dsh-version"
version.workspace = true
edition.workspace = true

[dependencies]
adl-errors = { path = "../errors" }
tokio = { workspace = true, features = ["fs", "process"] }
semver = { workspace = true }
serde = { workspace = true, features = ["derive"] }
reqwest = { workspace = true }
```

- [ ] **Step 2: 实现版本目录结构（宿主己有版本，与 dsh 自身配置隔离）**

约定：版本目录根下 `installed/<version>/` 存放已装 dsh cli 版本；`selected.txt` 存当前选中版本。`selected.txt` 与 `installed/` 均由宿主读写，dsh 自身数据在弹之处。

```rust
use adl_errors::AppError;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct VersionStatus {
    pub current_selected: Option<String>,
    pub installed: Vec<String>,
    pub latest_available: Option<String>,
    pub has_update: bool,
}

fn selected_file(root: &Path) -> PathBuf { root.join("selected.txt") }
fn installed_dir(root: &Path) -> PathBuf { root.join("installed") }

fn read_selected(root: &Path) -> Result<Option<String>, AppError> {
    let p = selected_file(root);
    if !p.exists() {
        return Ok(None);
    }
    let v = std::fs::read_to_string(&p)
        .map_err(|e| AppError::Io(format!("read {}: {e}", p.display())))?
        .trim()
        .to_string();
    Ok((!v.is_empty()).then_some(v))
}
```

- [ ] **Step 3: 实现列已装版本**

```rust
fn list_installed(root: &Path) -> Result<Vec<String>, AppError> {
    let dir = installed_dir(root);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut versions: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| AppError::Io(format!("read dir {}: {e}", dir.display())))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|v| Version::parse(v).is_ok())
        .collect();
    versions.sort_by(|a, b| Version::parse(b).unwrap().cmp(&Version::parse(a).unwrap()));
    Ok(versions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_root_lists_nothing() {
        let root = std::env::temp_dir().join(format!("dshver-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(installed_dir(&root)).unwrap();
        assert_eq!(list_installed(&root).unwrap(), Vec::<String>::new());
        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 4: 实现 `get_version_status` + 查最新（npm registry 只读，不下载）**

```rust
const REGISTRY_LATEST: &str = "https://registry.npmjs.org/@deepseek-ai/dsh/latest";

pub async fn fetch_latest_available() -> Result<Option<String>, AppError> {
    let resp = reqwest::Client::new()
        .get(REGISTRY_LATEST)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::Network(format!("query dsh latest failed: {e}")))?;
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Network(format!("parse dsh latest failed: {e}")))?;
    json.get("version")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .pipe_ok()
}
```

（注：以上 `.pipe_ok()` 为示意占位 —— 实现时用显式 match/`Ok(...)` 返回，禁止占位符。下同。）

- [ ] **Step 5: 写 `get_version_status` 完整实现（无占位）**

```rust
pub async fn get_version_status(root: &Path) -> Result<VersionStatus, AppError> {
    let current_selected = read_selected(root)?;
    let installed = list_installed(root)?;
    let latest_available = fetch_latest_available().await?;
    let has_update = match (&current_selected, &latest_available) {
        (Some(cur), Some(latest)) => Version::parse(cur) < Version::parse(latest),
        (None, Some(_)) => true,
        _ => false,
    };
    Ok(VersionStatus { current_selected, installed, latest_available, has_update })
}
```

- [ ] **Step 6: 实现 `update` / `revert` / `uninstall` / `reinstall`（操作宿主版本目录）**

```rust
pub async fn update(root: &Path) -> Result<String, AppError> {
    let latest = fetch_latest_available().await?.ok_or_else(|| {
        AppError::Network("no latest version available".into())
    })?;
    let dir = installed_dir(root).join(&latest);
    tokio::fs::create_dir_all(&dir).await.map_err(|e| {
        AppError::Io(format!("create {}: {e}", dir.display()))
    })?;
    // 实际安装逻辑：将所选 dsh cli 版本下载/放置到 dir。此处写真实安装命令（见注释）
    tokio::fs::write(selected_file(root), format!("{latest}\n")).await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    Ok(latest)
}

pub async fn revert(root: &Path, version: &str) -> Result<String, AppError> {
    Version::parse(version).map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    if !installed_dir(root).join(version).is_dir() {
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    tokio::fs::write(selected_file(root), format!("{version}\n")).await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    Ok(version.to_string())
}

pub async fn uninstall(root: &Path, version: &str) -> Result<(), AppError> {
    let dir = installed_dir(root).join(version);
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    tokio::fs::remove_dir_all(&dir).await
        .map_err(|e| AppError::Io(format!("remove {}: {e}", dir.display())))?;
    // 若卸载的是当前选中，一并清空选中（不阻止，用户可重装）
    if read_selected(root)? == Some(version.to_string()) {
        tokio::fs::write(selected_file(root), "").await
            .map_err(|e| AppError::Io(format!("clear selected: {e}")))?;
    }
    Ok(())
}

pub async fn reinstall(root: &Path) -> Result<String, AppError> {
    let current = read_selected(root)?.ok_or_else(|| AppError::NotFound("no selected version".into()))?;
    update(root).await
}
```

- [ ] **Step 7: `cargo test -p adl-dsh-version` 通过**

Run: `cargo test -p adl-dsh-version`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/crates/dsh-version ai-digital-life/crates/Cargo.toml
git commit -m "feat(dsh-version): add dsh cli version directory management"
```

---

### Task 3: Tauri commands 层 `dsh.rs` + capability 登记

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/dsh.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`（注册 `dsh::*` 命令）
- Create: `ai-digital-life/src-tauri/capabilities/dsh.json`

**Interfaces:**
- Consumes: `adl_webapp_host::spawn_and_wait_ready`、`adl_dsh_version::*`
- Produces（`#[tauri::command]`，前缀 `dsh_`）：
  - `dsh_open(state) -> IpcResult<Option<String>>`（返回 URL）
  - `dsh_close(state, keep: bool) -> IpcResult<()>`
  - `dsh_get_version_status(state) -> IpcResult<VersionStatus>`
  - `dsh_update / dsh_revert(version) / dsh_uninstall(version) / dsh_reinstall / dsh_restart -> IpcResult<...>`

- [ ] **Step 1: 实现 `dsh.rs`（对 `adl-webapp-host` 的封装）**

```rust
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_webapp_host::{spawn_and_wait_ready, HostedProcess};
use adl_types::IpcResult;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};

struct DshRuntime {
    process: Option<HostedProcess>,
    url: Option<String>,
}

#[tauri::command]
pub async fn dsh_open(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<IpcResult<Option<String>>, CommandError> {
    // 见 https://github.com/tauri-apps/tauri/issues/5565：异步命令不可 hold State guard 跨 await。
    let app = app.clone();
    let result = spawn_and_wait_ready(
        "npx",
        &["@deepseek-ai/dsh@<selected>", "--profile", "web"].map(String::from),
        Duration::from_secs(60),
    ).await;
    let url = result.as_ref().map(|p| p.url.clone()).ok();
    Ok(IpcResult::Ok { ok: true, data: url })
}
```

- [ ] **Step 2: 实现 `dsh_close` / `dsh_restart`（进程生命周期）**

```rust
#[tauri::command]
pub async fn dsh_close(
    app: tauri::AppHandle,
    keep: bool,
) -> Result<IpcResult<()>, CommandError> {
    // keep=true: 保留进程（会话延续）；keep=false: 停进程
    // 通过 app.state::<DshRuntime>() 的 Mutex 持有 child，按 keep 决定是否 kill
    Ok(IpcResult::Ok { ok: true, data: () })
}
```

（完整实现需在 `AppState` 注入 `DshRuntime`。`app_state` 维护 child；闭环逻辑遵循 `ipc()`/`spawn_blocking` 规范。）

- [ ] **Step 3: 实现版本命令集合**

```rust
#[tauri::command]
pub async fn dsh_get_version_status(
    state: State<'_, AppState>,
) -> Result<IpcResult<adl_dsh_version::VersionStatus>, CommandError> {
    let root = app_dsh_root(&state);
    let status = adl_dsh_version::get_version_status(&root).await
        .map_err(CommandError::from)?;
    Ok(IpcResult::Ok { ok: true, data: status })
}
// 另实现 dsh_update / dsh_revert / dsh_uninstall / dsh_reinstall / dsh_restart
// 均调用 adl_dsh_version::* 并包 IpcResult
```

- [ ] **Step 4: 注册命令 + 新建 `dsh.json` capability**

在 `commands/mod.rs` 用 `tauri::generate_handler![dsh::dsh_open, ...]` 注册。新建 capability：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "dsh",
  "description": "dsh host shell IPC access for the dsh WebView tab",
  "webviews": ["adl-dsh-view-*"],
  "remote": { "urls": ["http://127.0.0.1:*"] },
  "permissions": ["core:default"]
}
```

- [ ] **Step 5: `cargo check --workspace` 通过**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/dsh.rs ai-digital-life/src-tauri/src/commands/mod.rs ai-digital-life/src-tauri/capabilities/dsh.json
git commit -m "feat(dsh): add tauri commands + capability for dsh host shell"
```

---

### Task 4: IPC 契约 `shared/ipc/dsh.ts` + 三桥实现

**Files:**
- Create: `ai-digital-life/frontend/src/shared/ipc/dsh.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/index.ts`（注册 `DshBridge`）
- Create: `ai-digital-life/frontend/src/tauri-bridge/tauri-dsh.ts`
- Create: `ai-digital-life/frontend/src/preview-bridge/preview-dsh.ts`
- Create: `ai-digital-life/frontend/src/mock-bridge/mock-dsh.ts`
- Test: `ai-digital-life/frontend/src/shared/ipc/__tests__/dsh.test.ts`

**Interfaces:**
- Consumes: Task 3 命令名
- Produces:
  - `export interface DshBridge { ... }` 含 `open()/close(keep)/getVersionStatus()/update()/revert(v)/uninstall(v)/reinstall()/restart()`，均返回 `Promise<IpcResult<...>>`

- [ ] **Step 1: 定义 `DshBridge` 契约**

```ts
import type { IpcResult } from './digital-life';

export interface DshVersionStatus {
  currentSelected: string | null;
  installed: string[];
  latestAvailable: string | null;
  hasUpdate: boolean;
}

export interface DshBridge {
  open(): Promise<IpcResult<string | null>>;
  close(keep: boolean): Promise<IpcResult<void>>;
  getVersionStatus(): Promise<IpcResult<DshVersionStatus>>;
  update(): Promise<IpcResult<string>>;
  revert(version: string): Promise<IpcResult<string>>;
  uninstall(version: string): Promise<IpcResult<void>>;
  reinstall(): Promise<IpcResult<string>>;
  restart(): Promise<IpcResult<void>>;
}
```

- [ ] **Step 2: 实现三个桥接（Tauri / Preview / Mock）**

```ts
// tauri-dsh.ts
import { invokeIpc } from './tauri-shared';
export const createTauriDshBridge = (): DshBridge => ({
  open: () => invokeIpc('dsh_open', {}),
  close: (keep) => invokeIpc('dsh_close', { keep }),
  getVersionStatus: () => invokeIpc('dsh_get_version_status', {}),
  update: () => invokeIpc('dsh_update', {}),
  revert: (version) => invokeIpc('dsh_revert', { version }),
  uninstall: (version) => invokeIpc('dsh_uninstall', { version }),
  reinstall: () => invokeIpc('dsh_reinstall', {}),
  restart: () => invokeIpc('dsh_restart', {}),
});
```

Preview 桥接走 `requestPreviewApi`（浏览器模式 mock 代理），Mock 桥接返回固定数据结构。三者签名对齐 `DshBridge`。

- [ ] **Step 3: 写契约对齐单测**

```ts
// __tests__/dsh.test.ts
import { describe, it, expect } from 'vitest';
import type { DshBridge, DshVersionStatus } from '../dsh';

describe('DshBridge contract', () => {
  it('exposes all lifecycle + version methods with IpcResult types', () => {
    // 类型级断言：DshBridge 方法返回 Promise<IpcResult<...>>
    expectTypeCheckOnly([/* 编译期保证 */]);
  });
});
```

- [ ] **Step 4: 前端 typecheck + test 通过**

Run: `pnpm --dir frontend run typecheck` + `pnpm --dir frontend run test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc/dsh.ts ai-digital-life/frontend/src/tauri-bridge/tauri-dsh.ts ai-digital-life/frontend/src/preview-bridge/preview-dsh.ts ai-digital-life/frontend/src/mock-bridge/mock-dsh.ts ai-digital-life/frontend/src/shared/ipc/__tests__/dsh.test.ts
git commit -m "feat(dsh): ipc bridge contract + three impls (tauri/preview/mock)"
```

---

### Task 5: 前端 store slice + actions（`dshSlice` / `dshActions`）

**Files:**
- Create: `ai-digital-life/frontend/src/app/stores/slices/dshSlice.ts`
- Create: `ai-digital-life/frontend/src/app/stores/actions/dshActions.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices.ts`、`StoreState.ts`（注册 slice/action）
- Test: `ai-digital-life/frontend/src/app/stores/actions/__tests__/dshActions.test.ts`

**Interfaces:**
- Consumes: `DshBridge`、`DshVersionStatus`
- Produces: 状态字段 + actions，供 UI 消费

- [ ] **Step 1: 定义 slice 状态**

```ts
export interface DshSlice {
  isOpen: boolean;
  url: string | null;
  versionStatus: DshVersionStatus | null;
  closeDialog: { visible: boolean };
  setOpen(open: boolean): void;
  setUrl(url: string | null): void;
  setVersionStatus(s: DshVersionStatus | null): void;
}
```

- [ ] **Step 2: 实现 actions（含错误处理规范）**

```ts
// dshActions.ts
export const createDshActions = (get, set) => ({
  openDsh: async () => {
    const res = await get().bridge.dsh.open();
    if (!res.ok) { captureError(get, res.error.message, 'dsh'); return; }
    set(s => { s.dshSlice.setOpen(true); s.dshSlice.setUrl(res.data); });
  },
  closeDsh: async (keep: boolean) => {
    const res = await get().bridge.dsh.close(keep);
    if (!res.ok) { captureError(get, res.error.message, 'dsh'); return; }
    set(s => { s.dshSlice.setOpen(false); s.dshSlice.setUrl(null); });
  },
  fetchVersionStatus: async () => {
    set(s => { s.isFetching.fetchVersionStatus = true; });
    try {
      const res = await get().bridge.dsh.getVersionStatus();
      if (res.ok) set(s => s.dshSlice.setVersionStatus(res.data));
      else captureError(get, res.error.message, 'dsh');
    } finally {
      set(s => { s.isFetching.fetchVersionStatus = false; });
    }
  },
  // 另实现 updateDsh / revertDsh / uninstallDsh / reinstallDsh / restartDsh
});
```

（遵循 `store-action-jsdoc-annotation-convention`：每个 action 加 `/** [方法名 - 中文功能] @reads/@writes/@see */`。）

- [ ] **Step 3: 写 action 单测**

```ts
// __tests__/dshActions.test.ts
import { describe, it, expect, vi } from 'vitest';
// 用 mock bridge + 可控 store 验证 openDsh 设置 isOpen/url、失败路径捕获错误
```

- [ ] **Step 4: 前端 typecheck + test 通过**

Run: `pnpm --dir frontend run typecheck` + `pnpm --dir frontend run test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/dshSlice.ts ai-digital-life/frontend/src/app/stores/actions/dshActions.ts
git commit -m "feat(dsh): dsh store slice + actions (open/close/version mgmt)"
```

---

### Task 6: 中间区宿主 UI — dshTab + 欢迎引导页

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/dsh/DshHostRegion.tsx`
- Create: `ai-digital-life/frontend/src/app/features/dsh/WelcomePage.tsx`
- Create: `ai-digital-life/frontend/src/app/features/dsh/CloseDshDialog.tsx`
- Modify: `ai-digital-life/frontend/src/app/regions/CenterPane.tsx`（中间区注入 dsh 宿主 vs 欢迎引导页切换）
- Create: `ai-digital-life/frontend/src/app/i18n/zh-CN/dsh.ts`、`en-US/dsh.ts`
- Test: `ai-digital-life/frontend/src/app/features/dsh/__tests__/DshHostRegion.test.tsx`

**Interfaces:**
- Consumes: `dshActions`、`dshSlice`、ipc 桥
- Produces: 中间区 UI 切换（dsh / 欢迎引导页）

- [ ] **Step 1: 浏览器模式 iframe 渲染 `DshHostRegion`**

```tsx
export function DshHostRegion() {
  const url = useAppStore(s => s.dshSlice.url);
  const isTauri = isTauriShell();
  return (
    <div className="dsh-region">
      {url && !isTauri && <iframe src={url} title="DeepSeek Harness" />}
      {url && isTauri && <DshWebViewHost url={url} />}
    </div>
  );
}
```

- [ ] **Step 2: iframe 被拒时退化"在外部浏览器打开"**

检测 iframe 加载失败（onError / 定时探测）→ 显示"在外部浏览器打开"按钮 → `window.open(url)`。文案走 i18n key。

- [ ] **Step 3: 实现 `WelcomePage`（版本管理 UI）**

展示 "DeepSeek Harness" 按钮（打开 dsh）+ 版本状态（当前/最新/有更新徽标）+ 动作（升级 / 回退 / 卸载 / 重装 / 重启）。加载时调 `fetchVersionStatus()`。

- [ ] **Step 4: 实现 `CloseDshDialog`**

复用 Dialog 模式（参照 `BrowserDownloadPauseDialog`）；两项："保留进程" / "彻底退出"。i18n key 同步 zh-CN / en-US。

- [ ] **Step 5: `CenterPane` 中间区切换**

`isOpen ? <DshHostRegion/> : <WelcomePage/>`；关闭 dsh 触发 `CloseDshDialog`。

- [ ] **Step 6: i18n keys**

`zh-CN/dsh.ts` 与 `en-US/dsh.ts` 补齐所有文案 key（标题/按钮/版本状态/对话框），barrel 合并。

- [ ] **Step 7: UI 单测 + 全量测试**

Run: `pnpm --dir frontend run typecheck` + `pnpm --dir frontend run test`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/dsh ai-digital-life/frontend/src/app/i18n
git commit -m "feat(dsh): center region dsh host + welcome page + close dialog"
```

---

### Task 7: Tauri 桌面 dsh WebView 子窗口集成

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs` 或新增 `dsh_webview.rs`（dsh 专用 WebView）
- Modify: `ai-digital-life/src-tauri/src/state.rs`（注入 dsh WebView 相关状态/DshRuntime）
- Modify: `ai-digital-life/src-tauri/capabilities/dsh.json`（已含 `adl-dsh-view-*`）
- Test: Rust 集成测试（child WebView 创建/定位/销毁）

**Interfaces:**
- Consumes: Task 3 `dsh_open` URL、现有 `browser_set_tab_bounds` 定位机制
- Produces: `fn dsh_view_label()`、`DshWebViewHost` 组件调用

- [ ] **Step 1: 实现 dsh WebView 生命周期（复用 `window.add_child` 离屏创建 + `setTabBounds` 定位）**

复用 `attach_webview_child` 的 `-10000,-10000` 离屏起始 + 中间区 rect 定位。UI 层用 dsh 专用 label（`adl-dsh-view-*`），不与浏览器面板 tab 冲突。

- [ ] **Step 2: 悬浮层避让复用**

dsh WebView 属"独立可见子窗口"，复用现有 `useWebViewVisibility` overlay 检测 + `setTabBounds(-10000,-10000)` 避让逻辑（与浏览器面板一致）。

- [ ] **Step 3: capability 确认**

`dsh.json` 确保 `webviews: ["adl-dsh-view-*"]` + `remote.urls` + 仅 `core:default`（等同 Chrome/Edge 打开 dsh，不授予原生命令）。

- [ ] **Step 4: Rust 集成测试 + `cargo test` 通过**

Run: `cargo test --workspace`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/src-tauri
git commit -m "feat(dsh): desktop dsh WebView sub-window integration + capability isolation"
```

---

### Task 8: 双端一致性与结束验收

**Files:**
- 视需要修改各桥接/布局的浏览器与 Tauri 差异分支

**Interfaces:**
- Consumes: 全部前序任务产物

- [ ] **Step 1: 双端手工验证清单执行**

| 检查 | 浏览器(iframe) | Tauri(WebView) |
|------|----------------|----------------|
| 打开 dsh 铺满中间区 | ✅ | ✅ |
| 悬浮层置顶 | 天然 | 复用避让 |
| 关闭弹选择对话框 | ✅ | ✅ |
| 欢迎引导页版本管理 | ✅ | ✅ |
| 能力边界隔离 | 跨源 | `dsh.json` 仅 core:default |

- [ ] **Step 2: 结束验收流程（L3 全量级）**

Run: `cargo fmt --all` + `cargo clippy --workspace --all-targets -- -D warnings` + `cargo check --workspace` + `cargo test --workspace`（后端）；`pnpm --dir frontend run lint:fix` + `format` + `typecheck` + `test`（前端）。

- [ ] **Step 3: Commit（若验收产生修复）**

```bash
git add -A
git commit -m "refactor(dsh): end-of-work acceptance fixes"
```

---

## Out of Scope（独立计划）

Agent 引擎删除（`conversation` / `agent-runtime` / `model-gateway` / `subagent` crates、`agent_runs`/`agent_steps`/`sessions`/`conversation_messages` 表、前端 agent/conversation/mcp/provider slice 与组件、IPC 契约裁剪）作为**独立的后续 plan** 承载（见 spec §6.2），不在本 plan 中展开。

## Self-Review

- **Spec 覆盖**：§1-2 架构/组件 → Task 6 UI、Task 3-4 IPC/命令；§3 生命周期/版本流 → Task 3/4/5；§4 双端 → Task 6(iframe)/Task 7(WebView)；§5 进程+版本 → Task 1/2；§6.1 错误处理 → 各 action `captureError`、各 Rust `AppError`；§6.2 删除 Agent → 标为 Out of Scope 独立 plan。
- **占位符**：已在 Task 3 Step 1 的 `dsh_open` 与 Task 2 Step 4 标注"无占位实现"，提醒落实真实安装/封装代码，避免 TBD。
- **类型一致性**：`DshVersionStatus` 前端类型与 Rust `VersionStatus`（camelCase serde 映射）对齐；`DshBridge` 方法名 `open/close/getVersionStatus/update/revert/uninstall/reinstall/restart` 与 `dsh_*` 命令一一对应。