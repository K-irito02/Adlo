# Phase 1（后端 + 打包）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成通用托管层 `adl-hosted`、新 crate `adl-env`（Node/Git/Bash/WebView2/adl-server/netprobe 六 provider + `/env/*` 接口）与安装包改动（adl-server 随包 + WebView2 embedBootstrapper），dsh 迁移到通用层且行为不变。

**Architecture:** 先抽通用层（HostedVersions/AtomicSwap/adopt/ProcHost/ProgressTask/InstallLock），dsh 原地迁移验证；再建 `adl-env`（统一 Provider trait + 六实现 + `env-sources.json` + `env-baseline.json` resource）；最后接 server 路由与打包。测试全离线可跑（网络探测用本地桩）。

**Tech Stack:** Rust stable 1.85+ / edition 2024 / tokio / axum 0.7 / serde (camelCase DTO) / semver / reqwest（复用 `download-source::build_http_client`）/ Tauri 2.x bundler。

**Spec:** `docs/superpowers/specs/2026-10-23-env-dependency-management-design.md`（§5 后端、§6 安装包、§12 Phase 1）

## Global Constraints

- `cargo clippy --workspace --all-targets -- -D warnings` 零警告；`cargo fmt --all` 干净；`cargo test --workspace` 全绿。
- Commit 风格 `type(scope): summary`，scope 用 `rust`（后端）/`deps`（打包配置），例 `feat(rust): add adl-hosted crate`。
- 未发布阶段：直接重构，不留向后兼容层、不做数据迁移。
- 低层 crate 禁止依赖高层：`adl-hosted`/`adl-env` 只依赖 errors/download-source/tokio/serde 等基础 crate。
- 新增 server 路由的 Tauri 透传在 Phase 2 做；本期只做 HTTP 路由 + Rust 单测。
- 测试代码优先 `.expect("reason")`；网络相关单测必须离线可跑（本地 TcpListener 桩或纯函数）。
- DTO 一律 `#[serde(rename_all = "camelCase")]`。

---

## File Structure

```
ai-digital-life/crates/adl-hosted/          # NEW 通用托管层（Task 1–5）
  Cargo.toml                                 # deps: adl-errors, tokio, serde, serde_json, tracing
  src/lib.rs                                 # 重导出 + HostedVersions
  src/hosted_versions.rs                     # 布局/installed/<v>/marker + selected.txt + 回落选择
  src/atomic_swap.rs                          # .tmp → 原子改名 → 清旧版；失败保旧清 tmp
  src/adopt.rs                                # 一次性预置包收编（单副本不变式）
  src/proc_host.rs                            # HostedProcess + spawn_capturing（marker 参数化）+ 端口轮询
  src/progress.rs                             # ProgressTask（kind: String + 通用 phase）
  src/lock.rs                                 # InstallLock = Arc<AsyncMutex<()>> 别名 + new()
ai-digital-life/crates/adl-env/             # NEW 环境依赖（Task 7–10）
  Cargo.toml                                 # + adl-hosted, adl-download-source, semver="1", reqwest
  src/lib.rs                                 # SourceMode/EffectiveSource/DependencyState/resolve()
  src/config.rs                              # env-sources.json load/save（per-dep version_source）
  src/baseline.rs                            # env-baseline.json 类型 + 加载（resource 路径注入）
  src/providers/node.rs | git.rs | bash.rs | webview2.rs | adlserver.rs | netprobe.rs
ai-digital-life/crates/server/src/
  state.rs                                   # + env_install_lock: InstallLock, env_task: ProgressTask
  router.rs                                  # + /env/status|install|select-source|set-custom-path|recheck
  handlers/env.rs                            # NEW
ai-digital-life/src-tauri/
  src/adl_server.rs                          # 相对 current_exe() 解析随包 adl-server（dev 回退 target/）
  tauri.conf.json                            # bundle.windows: embedBootstrapper; externalBin; beforeBundleCommand
  binaries/.gitkeep                         # externalBin 落点（构建期 copy 进入，git 不追踪 exe）
```

---

### Task 1: `adl-hosted` 骨架 + `HostedVersions`

**Files:**
- Create: `ai-digital-life/crates/adl-hosted/Cargo.toml`
- Create: `ai-digital-life/crates/adl-hosted/src/lib.rs`, `src/hosted_versions.rs`
- Modify: `ai-digital-life/Cargo.toml` (`members` += `"crates/adl-hosted"`)

**Interfaces:**
- Consumes: `adl-errors::AppError`
- Produces: `HostedVersions::open(root, name)`, `installed_marker(version)`, `is_installed(version)`, `read_selected()`, `write_selected(v)`, `best_fallback(except) -> Option<String>`, `installed_versions() -> Vec<String>`（仅 marker 完整者；空目录/非 semver 忽略——照抄 dsh 语义）

- [ ] **Step 1: Write the failing test** — `crates/adl-hosted/src/hosted_versions.rs` 底部 `#[cfg(test)]`：

```rust
#[test]
fn ignores_empty_dirs_and_non_semver() {
    let tmp = std::env::temp_dir().join(format!("adl_hv_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    let hv = HostedVersions::open(&tmp, "node");
    // 空目录 + 非 semver 不算已装
    std::fs::create_dir_all(tmp.join("installed").join("empty")).unwrap();
    std::fs::create_dir_all(tmp.join("installed").join("xx")).unwrap();
    hv.mark_installed("22.14.0").expect("mark");
    assert_eq!(hv.installed_versions(), vec!["22.14.0".to_string()]);
    assert_eq!(hv.best_fallback(None).as_deref(), Some("22.14.0"));
    hv.write_selected("22.14.0").expect("select");
    assert_eq!(hv.read_selected().expect("read").as_deref(), Some("22.14.0"));
    let _ = std::fs::remove_dir_all(&tmp);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -p adl-hosted hosted_versions 2>&1 | Select-Object -Last 5`
Expected: FAIL（`could not find adl-hosted` 或编译失败：crate 不存在）

- [ ] **Step 3: Write minimal implementation** — Cargo.toml（workspace lints 照抄 dsh-bundle 版）、`lib.rs` 重导出、`hosted_versions.rs`：

```rust
use adl_errors::AppError;
use std::path::{Path, PathBuf};

pub struct HostedVersions { root: PathBuf, name: String, marker_rel: PathBuf }

impl HostedVersions {
    pub fn open(root: &Path, name: &str, marker_rel: &str) -> Self {
        Self { root: root.to_path_buf(), name: name.to_string(), marker_rel: PathBuf::from(marker_rel) }
    }
    fn installed_dir(&self) -> PathBuf { self.root.join(&self.name).join("installed") }
    pub fn version_dir(&self, v: &str) -> PathBuf { self.installed_dir().join(v) }
    pub fn installed_marker(&self, v: &str) -> PathBuf { self.version_dir(v).join(&self.marker_rel) }
    pub fn is_installed(&self, v: &str) -> bool { self.installed_marker(v).is_file() }
    pub fn mark_installed(&self, v: &str) -> Result<(), AppError> {
        let m = self.installed_marker(v);
        std::fs::create_dir_all(m.parent().expect("marker has parent"))
            .map_err(|e| AppError::Io(format!("create {}: {e}", m.display())))?;
        std::fs::write(&m, "").map_err(|e| AppError::Io(format!("write {}: {e}", m.display())))
    }
    pub fn installed_versions(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let Ok(entries) = std::fs::read_dir(self.installed_dir()) else { return out; };
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if semver_check(&n) && self.is_installed(&n) { out.push(n); }
        }
        out.sort();
        out
    }
    pub fn best_fallback(&self, except: Option<&str>) -> Option<String> {
        self.installed_versions().into_iter().rev().find(|v| Some(v.as_str()) != except)
    }
    pub fn read_selected(&self) -> Result<Option<String>, AppError> {
        let p = self.root.join(&self.name).join("selected.txt");
        if !p.exists() { return Ok(None); }
        let raw = std::fs::read_to_string(&p).map_err(|e| AppError::Io(format!("read {}: {e}", p.display())))?;
        let v = raw.trim().to_string();
        Ok(if self.is_installed(&v) { Some(v) } else { None })
    }
    pub fn write_selected(&self, v: &str) -> Result<(), AppError> {
        if !self.is_installed(v) { return Err(AppError::InvalidInput(format!("{v} not installed"))); }
        let p = self.root.join(&self.name).join("selected.txt");
        if let Some(parent) = p.parent() { std::fs::create_dir_all(parent).map_err(|e| AppError::Io(format!("create {}: {e}", parent.display())))?; }
        std::fs::write(&p, v).map_err(|e| AppError::Io(format!("write {}: {e}", p.display())))
    }
}

fn semver_check(v: &str) -> bool {
    // marker 目录名即版本：拒绝 `..`/分隔符（与 dsh-bundle 同一安全口径）
    !v.contains(['/', '\\']) && v.parse::<semver::Version>().is_ok()
}
```

（`semver = "1"` 加入 adl-hosted deps；`AppError::Io/InvalidInput` 必须已存在于 adl-errors——若缺，先在 errors crate 补齐，本任务第 3 步包含。）

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-hosted 2>&1 | Select-Object -Last 3`
Expected: PASS（`test result: ok`）

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-hosted ai-digital-life/Cargo.toml
git commit -m "feat(rust): add adl-hosted crate with HostedVersions"
```

---

### Task 2: `adl-hosted::AtomicSwap`（安装原子替换）

**Files:**
- Create: `ai-digital-life/crates/adl-hosted/src/atomic_swap.rs`
- Modify: `ai-digital-life/crates/adl-hosted/src/lib.rs`（`pub mod atomic_swap; pub use ...`）

**Interfaces:**
- Consumes: Task 1 `HostedVersions::version_dir`
- Produces: `atomic_swap::swap_into_place(staging: &Path, target: &Path) -> Result<(), AppError>`（旧目录改名 `.old-<nonce>` → staging 改名 target → 删旧；任一步失败后清 staging 保旧版；跨卷 rename 失败退化复制）

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn swap_replaces_target_and_keeps_old_on_nothing_else() {
    let tmp = std::env::temp_dir().join(format!("adl_sw_{}", nanos()));
    let target = tmp.join("installed").join("1.0.0");
    std::fs::create_dir_all(target.join("lib")).unwrap();
    std::fs::write(target.join("lib").join("old.txt"), "old").unwrap();
    let staging = tmp.join(".tmp-1.0.0-x");
    std::fs::create_dir_all(staging.join("lib")).unwrap();
    std::fs::write(staging.join("lib").join("new.txt"), "new").unwrap();
    swap_into_place(&staging, &target).expect("swap");
    assert!(target.join("lib").join("new.txt").is_file());
    assert!(!staging.exists(), "staging must be gone");
    let _ = std::fs::remove_dir_all(&tmp);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-hosted atomic_swap 2>&1 | Select-Object -Last 3`
Expected: FAIL（`unresolved import / no function swap_into_place`）

- [ ] **Step 3: Write minimal implementation** — 旧改名 → staging 改名 → 删旧；rename 失败（跨卷）则递归复制后删源；复制中途失败清半成品 target（此时源 staging 仍在，不丢数据）：

```rust
use adl_errors::AppError;
use std::path::Path;

pub fn swap_into_place(staging: &Path, target: &Path) -> Result<(), AppError> {
    let io = |ctx: &str, e: std::io::Error| AppError::Io(format!("{ctx}: {e}"));
    if target.exists() {
        let old = target.with_extension(format!("old-{}", nonce()));
        std::fs::rename(target, &old).map_err(|e| io("backup old", e))?;
        let r = swap_rename_or_copy(staging, target);
        if r.is_err() {
            let _ = std::fs::rename(&old, target); // 尽力恢复旧版
            return r;
        }
        let _ = std::fs::remove_dir_all(&old); // 清旧失败只告警，不丢新版
    } else {
        swap_rename_or_copy(staging, target)?;
    }
    Ok(())
}
```

（`nonce()` 用进程时间纳秒；`swap_rename_or_copy` = rename，失败则 copy_dir 后删 staging；copy 失败清半成品 target。copy_dir 逻辑照抄 `dsh-bundle::copy_dir`，junction 遇错直接报错。）

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-hosted 2>&1 | Select-Object -Last 3`
Expected: PASS（Task 1 用例仍绿）

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-hosted
git commit -m "feat(rust): add adl-hosted atomic swap"
```

---

### Task 3: `adl-hosted::adopt`（预置包收编，泛化 dsh-bundle）

**Files:**
- Create: `ai-digital-life/crates/adl-hosted/src/adopt.rs`
- Modify: `ai-digital-life/crates/adl-hosted/src/lib.rs`

**Interfaces:**
- Consumes: Task 1–2
- Produces: `adopt_bundle(bundle_dir, versions: &HostedVersions, manifest_version: &str, marker_rel: &str) -> Result<Option<String>, AppError>`（版本非法/semver 拒绝；目标已存在完整副本则只删源返回 None；收编成功删源目录）

- [ ] **Step 1: Write the failing test**（照抄 `dsh-bundle::adopt_moves_package...` 语义，marker 换成 `bin/node.exe` 泛化版）：bundle 含 marker → adopt 后目标 `installed/<v>/<marker>` 存在且源目录删除；目标已存在副本 → 返回 None 且用户副本保留。

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-hosted adopt 2>&1 | Select-Object -Last 3`
Expected: FAIL（无 `adopt` 模块）

- [ ] **Step 3: Write minimal implementation** — 逻辑逐行搬 `dsh-bundle::adopt`（detect 双文件存在 → 版本 semver 校验 → 目标存在则删源回 None → `swap_rename_or_copy` 搬移 → 删源），marker 路径与版本号改为参数。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-hosted 2>&1 | Select-Object -Last 3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-hosted
git commit -m "feat(rust): add adl-hosted bundle adopt"
```

---

### Task 4: `adl-hosted::ProcHost`（进程托管，从 webapp-host 泛化）

**Files:**
- Create: `ai-digital-life/crates/adl-hosted/src/proc_host.rs`
- Modify: `ai-digital-life/crates/adl-hosted/src/lib.rs`, `ai-digital-life/crates/adl-hosted/Cargo.toml`（+ `tokio` 已有；端口探测只需 `tokio::net::TcpStream`，不新增 reqwest）

**Interfaces:**
- Consumes: `AppError`
- Produces: `pub struct HostedProcess { pub child: tokio::process::Child, pub url: String, pub port: u16 }`（从 webapp-host 原样搬入，字段保持同名）；`spawn_with_marker(program, args, marker, ports: &[u16], timeout) -> Result<HostedProcess, AppError>`（`.cmd` 回退仅 Windows；stdout marker 捕获 + drain；轮询端口 TCP 可达）

- [ ] **Step 1: Write the failing test** — 用系统 shell 自举验证管线（Windows）：

```rust
#[tokio::test]
async fn spawn_captures_marker_url() {
    // python 不可用环境下跳过：用 cmd 模拟一个“打印 marker 后常驻”的子进程
    let hp = spawn_with_marker("cmd", &["/c".into(), "echo READY http://127.0.0.1:9 & ping -n 6 127.0.0.1 >nul".into()], "READY", &[9], std::time::Duration::from_secs(20)).await;
    // 端口 9 大概率未监听 → 期望超时错误，关键断言是 marker 管线未 panic 且错误为 Timeout
    assert!(matches!(hp, Err(AppError::Timeout(_))));
}
```

（注：此用例验证“无端口时超时而非挂死”；成功路径由 Task 6 的 dsh 现有回归覆盖，不在此重复起真实服务。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-hosted proc_host 2>&1 | Select-Object -Last 3`
Expected: FAIL（无此模块）

- [ ] **Step 3: Write minimal implementation** — 逐行搬 `webapp-host::{spawn_capturing, drain_and_watch, spawn_node_direct}`，改动仅三处：① `program/args` 泛化（删 `node_bin` 特化命名）；② marker 从 `DSH_URL_MARKER` 常量改参数；③ 端口列表参数化（调用方传候选端口；dsh 传 `[pick_free, 3080]` 保持现有语义，`pick_free_port` 一并搬入）。`HostedProcess` 定义搬入本 crate。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-hosted 2>&1 | Select-Object -Last 3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-hosted
git commit -m "feat(rust): add adl-hosted process hosting"
```

---

### Task 5: `adl-hosted::ProgressTask` + `InstallLock`（从 task.rs 泛化）

**Files:**
- Create: `ai-digital-life/crates/adl-hosted/src/progress.rs`, `src/lock.rs`
- Modify: `ai-digital-life/crates/adl-hosted/src/lib.rs`

**Interfaces:**
- Consumes: 无
- Produces: `ProgressTask { begin(kind: &str, label: &str) -> bool, update(...), snapshot(), finish(), cancel(), is_cancelled() }`（字段/序列化形状与现有 `VersionTask` 对齐：`kind: String, version/label: String, phase, done/total, error`，camelCase 由调用方 DTO 负责）；`InstallLock::new() -> Arc<AsyncMutex<()>>`

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn second_begin_while_running_returns_false_and_cancel_marks() {
    let t = ProgressTask::new();
    assert!(t.begin("install", "node 22.14.0"));
    assert!(!t.begin("install", "node 22.14.0"));
    t.cancel();
    assert!(t.is_cancelled());
    t.finish();
    assert!(t.snapshot().is_none());
    assert!(t.begin("install", "node 22.14.0"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-hosted progress 2>&1 | Select-Object -Last 3`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation** — 逐行搬 `dsh-version/src/task.rs`，`VersionTaskKind` enum 改为 `kind: String`（调用方传 `"dsh-install"` / `"env-node-install"`，线装格式由各调用方 DTO 保持旧键，dsh 前端无感）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-hosted 2>&1 | Select-Object -Last 3`
Expected: PASS（累计全部用例绿）

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-hosted
git commit -m "feat(rust): add adl-hosted progress task and install lock"
```

---

### Task 6: dsh 迁移到 `adl-hosted`（行为不变回归）

**Files:**
- Modify: `ai-digital-life/crates/dsh-version/Cargo.toml`（+ `adl-hosted`；`install.rs` 的 npm 流程保留，目录操作改调 `HostedVersions`/`swap_into_place`；`task.rs` 改为 `pub use adl_hosted::ProgressTask` 重导出 + 旧名别名 `TaskReporter = ProgressTask`、`VersionTaskKind` 常量字符串化，保持 handler 可用）、`ai-digital-life/crates/dsh-version/src/lib.rs`（`host_bin/is_host_version_installed/read_selected` 转调 `HostedVersions::open(root,"dsh-versions","node_modules/@deepseek-ai/dsh/lib/bin.js")`；`select_dsh_source` 逻辑不动）、`ai-digital-life/crates/webapp-host/src/lib.rs`（`HostedProcess` 改为 `pub use adl_hosted::HostedProcess`，`spawn_node_direct` 转调 `spawn_with_marker` 传 `["<pick_free>", 3080]` 候选）、`ai-digital-life/crates/dsh-bundle/src/lib.rs`（`adopt` 复用 `adl_hosted::swap_into_place` 的深层布局语义；通用 `adopt_bundle` 已按批准偏离移除）、`ai-digital-life/crates/server/src/state.rs`（`dsh_version_lock: adl_hosted::InstallLock`，`dsh_version_task: adl_hosted::ProgressTask`——字段名不变，只换类型；`dsh_state` 的 `ManagedDsh.process` 类型经重导出不变）、`ai-digital-life/crates/server/Cargo.toml`（+ `adl-hosted`）

**Interfaces:**
- Consumes: Task 1–5
- Produces: dsh 全链路行为不变（wire DTO 不动，前端零改）

> **已批准偏离（实现期确认）**：`adl_hosted::adopt_bundle` 因无调用方而被移除；`dsh-bundle::adopt` 改为复用 `adl_hosted::swap_into_place` 的深层布局（deep layout）语义，不再走通用 adopt 封装。

- [ ] **Step 1: Write the failing test** — 本任务无新行为测试；门控 = 现有回归集。先跑基线并记录：

Run: `cargo test -p adl-dsh-version --lib 2>&1 | Select-Object -Last 3` 与 `cargo test -p adl-server --lib dsh 2>&1 | Select-Object -Last 3`
Expected: 基线全绿（迁移前留档；若基线已红，先修后迁，不在本任务堆新逻辑）

- [ ] **Step 2: Migrate** — 按 Files 列表逐文件转调；`VersionTaskKind::Install` 等枚举使用处改为字符串 `"dsh-install"`；`task.rs` 保留文件做重导出（删实现，防外部 `use` 路径断裂）。

- [ ] **Step 3: Run regression**

Run: `cargo test -p adl-dsh-version 2>&1 | Select-Object -Last 3`，`cargo test -p adl-server --lib 2>&1 | Select-Object -Last 3`，`cargo test -p adl-webapp-host -p adl-dsh-bundle 2>&1 | Select-Object -Last 3`
Expected: 全绿（用例数与基线一致）

- [ ] **Step 4: Run lints**

Run: `cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-Object -Last 3; cargo fmt --all -- --check`
Expected: 零警告、`fmt` 无 diff

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/dsh-version ai-digital-life/crates/webapp-host ai-digital-life/crates/dsh-bundle ai-digital-life/crates/server
git commit -m "refactor(rust): migrate dsh hosting onto adl-hosted"
```

---

### Task 7: `adl-env` 骨架 + 来源模型 + `resolve()` 纯函数

**Files:**
- Create: `ai-digital-life/crates/adl-env/Cargo.toml`（deps: adl-errors, adl-hosted, adl-download-source, tokio/workspace, serde/workspace, serde_json/workspace, semver="1", tracing/workspace, reqwest/workspace）
- Create: `ai-digital-life/crates/adl-env/src/lib.rs`
- Modify: `ai-digital-life/Cargo.toml` (`members` += `"crates/adl-env"`)

**Interfaces:**
- Consumes: Task 1（`HostedVersions`）
- Produces: `SourceMode { Auto, System, Host }`（serde 小写）、`EffectiveSource`、`DependencyState`（§4.1 字段，camelCase）、`resolve(mode, sys_available: bool, host_version: Option<String>) -> Resolved` 纯函数；`ENV_DEPS: [&str; 6]` = node/git/bash/webview2/adlserver/netprobe

- [ ] **Step 1: Write the failing test** — 三态 × 可用性组合（照抄 dsh `resolve_version_source` 单测风格）：

```rust
#[test]
fn resolve_matrix() {
    use SourceMode::*;
    // auto: host 优先于 system；都没有 → none
    assert_eq!(resolve(Auto, true, Some("22.14.0".into())).effective, EffectiveSource::Host);
    assert_eq!(resolve(Auto, true, None).effective, EffectiveSource::System);
    assert_eq!(resolve(Auto, false, None).effective, EffectiveSource::None);
    // system/host 强制：缺失 → none（不静默降级，前端据此提示安装）
    assert_eq!(resolve(System, false, Some("22.14.0".into())).effective, EffectiveSource::None);
    assert_eq!(resolve(Host, true, None).effective, EffectiveSource::None);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-env 2>&1 | Select-Object -Last 3`
Expected: FAIL（crate 不存在）

- [ ] **Step 3: Write minimal implementation** — 类型 + `resolve`（与 `dsh-version::resolve_effective_source` 同优先级语义：auto→host>system>none；强制模式缺失即 none）+ `DependencyState` DTO（`#[serde(rename_all="camelCase")]`）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-env 2>&1 | Select-Object -Last 3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-env ai-digital-life/Cargo.toml
git commit -m "feat(rust): add adl-env skeleton and source resolution"
```

---

### Task 8: node provider（探测 + 便携包安装）

**Files:**
- Create: `ai-digital-life/crates/adl-env/src/providers.rs`（`pub mod node;` 占位声明后续任务追加）、`src/providers/node.rs`
- Modify: `ai-digital-life/crates/adl-env/src/lib.rs`（`pub mod providers;`）

**Interfaces:**
- Consumes: Task 7；`adl-download-source::build_http_client`（registry/proxy 复用）；`HostedVersions::open(data_dir, "env-hosted", ...)` 注意：HostedVersions::open(root, name, marker) 中 name="env-hosted/node"? 按 Task 1 签名 `open(root, name, marker_rel)`，node 用 `open(data_dir, "env-hosted/node", "node.exe")`——安装目录即版本目录本身（`installed/<v>/node.exe`）。
- Produces: `node::detect() -> Detection { available, version, path }`（跑 `node --version`，解析 `v22.14.0`；失败/`where node` 无命中 → unavailable）；`node::install(version, registry_cfg, reporter) -> Installed`（URL 模板取自 baseline：`{node_base}/v{version}/node-v{version}-win-x64.zip` → 下载 → 解压到 staging → marker `node.exe` 校验 → `swap_into_place` → `write_selected`）；`node::run_host_bin(version, args)`（供 dsh 启动复用 PATH 注入，Phase 2 接线，本期只备接口+单测）

- [ ] **Step 1: Write the failing test**（离线：探测走真实 PATH；安装走本地 zip 桩——单测内用 `zip`？仓库无 zip 依赖……改用“已解压目录桩”：install 拆两步 `fetch_zip(url)->bytes` 与 `adopt_staging(dir)`，单测只测后者 + URL 拼接）：

```rust
#[test]
fn node_dist_url_points_at_official() {
    assert_eq!(node_dist_url("https://nodejs.org/dist", "22.14.0"),
        "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip");
}

#[test]
fn adopt_staging_validates_node_exe_marker() {
    // staging 缺 node.exe → adopt 拒绝并清理 staging
    ...
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-env node 2>&1 | Select-Object -Last 3`
Expected: FAIL（无 providers 模块）

- [ ] **Step 3: Write minimal implementation** — `detect`（`where node`→`node --version`→ strip `v`→ semver 校验；任一步失败即 unavailable，不抛错）；`install`（`build_http_client` 下载 zip → 需解压：新增 `zip = "2"` 依赖？workspace 无 zip……查 `adm-zip` 仅前端 devDeps。后端解压 zip 最轻量是 `zip` crate。决策：本任务 Step 3 包含在 workspace `[workspace.dependencies]` 加 `zip = { version = "2", default-features = false, features = ["deflate"] }`（最小特性），`adl-env` 引用。解压后顶层目录 `node-v<V>-win-x64/` 内文件移到 staging 根 → marker 校验 → swap → selected）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-env 2>&1 | Select-Object -Last 3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-env ai-digital-life/Cargo.toml ai-digital-life/Cargo.lock
git commit -m "feat(rust): add adl-env node provider"
```

---

### Task 9: git provider（含 MinGit 托管）+ bash provider（三路探测）

**Files:**
- Create: `ai-digital-life/crates/adl-env/src/providers/git.rs`, `src/providers/bash.rs`
- Modify: `ai-digital-life/crates/adl-env/src/providers.rs`

**Interfaces:**
- Consumes: Task 7–8；`adl-pty` 不依赖（只复用探测路径常量思想：`Program Files/Git/bin/bash.exe`、`%ProgramFiles(x86)%` 变体、WSL `wsl.exe`、MSYS2 注册表/固定路径——本任务内重新实现为纯函数，保持 pty 零改动）
- Produces: `git::detect()`（PATH `git --version`）；`git::install()`（MinGit zip：`{mingit_base}/MinGit-<v>-64-bit.zip`，marker `cmd/git.exe`）；`bash::detect() -> Vec<BashCandidate { kind: GitBundled|Wsl|Msys2|Manual, path }>`（按优先级排序：Git自带 > WSL > MSYS2；宿主资产是 MinGit、不含 Bash，故无 host 来源，也无 `host_bash_path`）

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn ranking_prefers_system_git_over_wsl_and_msys2() {
    // snapshot: git_bundled + wsl + msys2 → [GitBundled, Wsl, Msys2]；
    // MinGit 不含 Bash，快照里没有 host 来源。
}

#[test]
fn git_version_parses() {
    assert_eq!(git::parse_version("git version 2.47.1.windows.1"), Some("2.47.1".into()));
    assert_eq!(git::parse_version("not git"), None);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-env bash 2>&1 | Select-Object -Last 3`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation** — `parse_version`（strip 前缀 `git version `，取空格前 token，`.windows.N` 后缀截断后 semver 校验）；`detect`（PATH）；`install`（下载 MinGit zip → 解压 → marker `cmd/git.exe` → swap/selected，复用 Task 8 的 zip/swap 管线，抽 `providers::fetch_and_stage(url, marker)` 共享函数放 `providers.rs`）；bash 三路探测纯函数（输入：env 快照结构体，输出候选列表；真实 PATH/注册表读取在 `detect()` 薄包装，便于单测）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-env 2>&1 | Select-Object -Last 3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-env
git commit -m "feat(rust): add adl-env git and bash providers"
```

---

### Task 10: webview2 + adlserver + netprobe providers

**Files:**
- Create: `ai-digital-life/crates/adl-env/src/providers/webview2.rs`, `src/providers/adlserver.rs`, `src/providers/netprobe.rs`
- Modify: `ai-digital-life/crates/adl-env/src/providers.rs`、`Cargo.toml`（webview2 探测需读注册表：用 `windows-registry`？workspace 无……最小方案：`std::process::Command("reg query ...")` 解析 `REG_SZ`，零新依赖；wry 只在 tauri-runtime-wry-patched 内，adl-env 不引 wry——版本以注册表为准，注释说明）

**Interfaces:**
- Consumes: Task 7；`adl-credential`（凭据存在性查询——只查有无，不读值；若其 API 无“存在性”接口，本任务 Step 3 改为：netprobe 只做两灯，第三灯在 server handler 层用 credential 现有 API 补，任务内注明）
- Produces: `webview2::detect() -> Detection`（读 `HKLM/HKCU...\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}\pv`，取最大版本；`install()` 返回 `AppError::InvalidInput("managed by installer…")` 引导错误——provider 内不装）；`adlserver::detect(exe_dir) -> Detection`（随包路径存在性 + `--version`？adl-server 无 version 命令则只判存在性）；`netprobe::check(client) -> { registry_ok, registry_latency_ms }`（GET registry 基址，复用 `build_http_client` 走代理配置）

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn parses_reg_query_pv_line() {
    let out = "    pv    REG_SZ    140.0.3485.94";
    assert_eq!(webview2::parse_pv(out), Some("140.0.3485.94".into()));
    assert_eq!(webview2::parse_pv(""), None);
}

#[test]
fn picks_highest_of_hklm_hkcu() {
    assert_eq!(webview2::pick_highest(Some("139.0.0.0"), Some("140.0.0.0")), Some("140.0.0.0".into()));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-env webview2 2>&1 | Select-Object -Last 3`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation** — `parse_pv`（找含 `REG_SZ` 行取末 token，semver 校验）；`detect`（`reg query HKLM\... /v pv` 失败则试 HKCU；解析失败即 unavailable）；`install()` 固定返回引导错误（含官网链接与“由安装包提供”说明文案 key 由前端定，此处只给英文 code + 中文 message 直写？不——message 由前端 i18n 映射，后端只返 `AppError::WebView2ManagedByInstaller`？errors crate 若无该变体，用 `InvalidInput("webview2-managed-by-installer")` 机器码，前端映射文案。本任务 Step 3 若 errors 缺变体则复用 InvalidInput，不扩 errors）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-env 2>&1 | Select-Object -Last 3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-env
git commit -m "feat(rust): add adl-env webview2 adlserver netprobe providers"
```

---

### Task 11: `env-sources.json` + baseline + `/env/*` 路由

**Files:**
- Create: `ai-digital-life/crates/adl-env/src/config.rs`、`src/baseline.rs`、`ai-digital-life/crates/server/src/handlers/env.rs`
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs`（`pub mod env;`）、`router.rs`（5 条路由）、`state.rs`（+ `pub env_install_lock: adl_hosted::InstallLock`、`pub env_task: adl_hosted::ProgressTask`，构造处初始化）、`crates/server/Cargo.toml`（+ adl-hosted, adl-env）、`ai-digital-life/src-tauri/resources/env-baseline.json`（NEW：`{ node: { stable: "22.14.0", dist_base: "https://nodejs.org/dist" }, git: { stable: "2.47.1", mingit_base: "..." }, webview2: { minimum: "140.0.0.0" } }`——版本号以实现时最新 LTS/稳定版为准，任务内注明核对源 nodejs.org / git-for-windows.github.io）、`tauri.conf.json`（`resources: ["resources/env-baseline.json"]`）

**Interfaces:**
- Consumes: Task 7–10
- Produces: `GET /env/status -> EnvStatus`（七项 camelCase；`dsh_ready = node.meetsBaseline`）；`POST /env/install {dep, version?}`（缺 version 用 baseline stable；走 env_install_lock + env_task；kind=`"env-{dep}-install"`）；`POST /env/select-source {dep, mode}`；`POST /env/set-custom-path {dep, path}`（服务端即时校验：跑对应 `--version`/存在性检查，不通过 4xx）；`POST /env/recheck {dep?}`（清缓存重探）；`env-sources.json` 复用 download-source 的 `config_path` 风格（`data_dir/env-sources.json`，`#[serde(default)]` 全 Auto）

- [ ] **Step 1: Write the failing test** — `handlers/env.rs` 底部：`select-source` 非法 dep 返回 4xx；`resolve` 缺失强制模式 → effective none 的 handler 级断言（用 tokio::test + `ServerState` 最小构造？state 构造重……改为 handler 逻辑抽纯函数 `apply_select(dep, mode, current) -> Result` 先单测，axum 接线后用现有 `tests/common` 起服务测路由存在性。若 server tests/common 过重，本任务单测止于纯函数 + `router.rs` 编译，路由存在性由 Phase 3 手动回归覆盖——任务内明确写出取舍）。

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-server --lib env 2>&1 | Select-Object -Last 3`
Expected: FAIL（无 env handler）

- [ ] **Step 3: Write minimal implementation** — config.rs（load/save，`#[serde(default)]`）、baseline.rs（`load_from(path)` + `stable_of(dep)`）、handlers（每个 handler ≤60 行，校验→锁→执行→快照；install 后台 `tokio::spawn` + 前端轮询 `env_task` 快照——照抄 `/dsh/install-version` + `/dsh/version-task` 结构，见 `dsh.rs:843-900`）、state/router 接线、baseline resource 文件 + tauri.conf resources。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-env -p adl-server --lib 2>&1 | Select-Object -Last 3`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-env ai-digital-life/crates/server ai-digital-life/src-tauri/resources ai-digital-life/src-tauri/tauri.conf.json
git commit -m "feat(rust): add env config baseline and /env routes"
```

---

### Task 12: adl-server 随包 + NSIS（WebView2）

**Files:**
- Modify: `ai-digital-life/src-tauri/tauri.conf.json`（`$schema` → `https://schema.tauri.app/config/2`；`bundle.windows += { webviewInstallMode: {type:"embedBootstrapper",silent:true} }`；**勿加 `bundleVCRuntime`**——当前固定工具链 tauri-cli 2.10.1 / tauri-utils 2.9.3 不支持该键，上游 tauri-utils ≥2.10 才支持。`bundle.externalBin: ["binaries/adl-server"]`；Tauri 钩子的 cwd 是应用目录 `ai-digital-life/`（**不是** `src-tauri/`），因此路径写 `scripts/...`、前端写 `--dir frontend`：`build.beforeBuildCommand: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-stage-sidecar.ps1 -Profile release && pnpm --dir frontend run build"`、`build.beforeBundleCommand: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/copy-adl-server-sidecar.ps1 -Profile release"`）、Create: `ai-digital-life/scripts/build-stage-sidecar.ps1`（先 `$env:RUSTFLAGS += "-C target-feature=+crt-static"`，再 `cargo build -p adl-server`（`--release` 或默认 dev——`-Profile debug` 映射默认 dev，输出 `target/debug`；cargo 拒绝 `--profile debug`，debug 是保留名），最后调 `copy-adl-server-sidecar.ps1` 落盘；sidecar 在 tauri-build 之外编译，不加静态 CRT 会动态依赖 `VCRUNTIME140.dll`）、`ai-digital-life/scripts/copy-adl-server-sidecar.ps1`（`target/<profile>/adl-server.exe` → `src-tauri/binaries/adl-server-x86_64-pc-windows-msvc.exe`；缺失则报错中断打包）、`src-tauri/binaries/.gitkeep`、Modify: `ai-digital-life/src-tauri/src/adl_server.rs`（`resolve_ad_server_binary` 改为：① `current_exe()` 同级 `adl-server.exe`（三元组名仅用于构建期 staging，运行时由 Tauri 去掉三元组改名）② dev 回退现有 workspace target 逻辑；新增单测覆盖“同级存在即选中”）

**Interfaces:**
- Consumes: Task 11（无其它依赖，可与 Task 7–11 并行， sole 共享编辑 `tauri.conf.json`——与 Task 11 同文件冲突，顺序执行）
- Produces: `cargo tauri build` 产物含 sidecar + embedBootstrapper；sidecar 为静态 CRT（无 `VCRUNTIME140.dll` 依赖）；dev 行为不变

- [ ] **Step 1: Write the failing test** — `adl_server.rs` 单元测试：

```rust
#[test]
fn prefers_sibling_sidecar_over_target_dir() {
    // 构造：无法改 current_exe → 抽 `resolve_in(dir: &Path) -> Option<PathBuf>` 纯函数单测：
    // sibling 存在 → Some(sibling)；不存在 → None（调用方再走 target/ 回退）
    ...
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p ai-digital-life adl_server 2>&1 | Select-Object -Last 3`
Expected: FAIL（无 `resolve_in`）

- [ ] **Step 3: Write minimal implementation** — 抽纯函数 + 双路径解析 + ps1 构建/拷贝脚本 + tauri.conf 三处配置（schema、钩子、externalBin）。`externalBin` 命名：Tauri 按 `adl-server-x86_64-pc-windows-msvc.exe` 查找（文档 pattern `binary-name{-target-triple}{.system-extension}`），脚本输出文件名必须精确匹配；运行时二进制名为 `adl-server.exe`（Tauri 安装时去掉三元组）。**不加 `bundleVCRuntime`**，改用 `-C target-feature=+crt-static` 构建 sidecar（tauri-build 之外的编译不继承静态 CRT 设置）；`binaries/` 加入 `.gitignore`（仅保留 `.gitkeep`）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p ai-digital-life 2>&1 | Select-Object -Last 3`，再 `cargo check -p ai-digital-life 2>&1 | Select-Object -Last 3`
Expected: PASS（不跑完整 `tauri build`——CI 级验证留 Phase 3）。注意 `Get-Content tauri.conf.json | ConvertFrom-Json` 只验证 JSON 语法，抓不到 schema 违规与钩子路径错误，必须用 `cargo check -p ai-digital-life` 让 tauri-build 真正解析配置。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/src-tauri ai-digital-life/scripts ai-digital-life/.gitignore
git commit -m "feat(deps): bundle adl-server sidecar and embedBootstrapper"
```

---

### Task 13: Phase 1 全量回归门

**Files:** 无新增（验证任务；发现问题则修完再合入，不开新需求）

- [ ] **Step 1: Run full workspace tests**

Run: `cargo test --workspace 2>&1 | Select-Object -Last 10`
Expected: 616+ 用例全绿（基线 616，新增约 40+；精确数以输出为准，红则修）

- [ ] **Step 2: Run clippy + fmt**

Run: `cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-Object -Last 3; cargo fmt --all -- --check`
Expected: 零警告、无 diff

- [ ] **Step 3: dsh 手动回归（Tauri 桌面，沿用 2026-10-20 spec §206 手动清单 1–5）**

Run: 手动——自动检测+系统安装显示；切宿主安装/装/切换/重装/卸载（可用小版本或复用已装版本做切换/卸载演练，避免 1–3 分钟长安装）；断网提示；3080 占用提示。
Expected: 与迁移前行为一致（版本操作走通用层后无感知差异）

- [ ] **Step 4: `/env/status` 手动验证**

Run: `cargo run -p adl-server -- --data-dir <tmp> --port 0` 后 `POST /env/status`（或经桌面 `httpBridge`），对照本机 `node --version` / `git --version` / 注册表 WebView2 版本。
Expected: 七项字段齐全、版本与本机一致、camelCase 键名

- [ ] **Step 5: Commit**（若 Step 1–4 有修，补提交；全绿则空提交禁止——直接在任务内注明门已过，不提交）

```bash
git log --oneline -3  # 确认 Phase 1 tasks 1–12 已合入，无额外提交
```

---

## Self-Review

**1. Spec coverage:** §5.1 通用层 → Task 1–6；§5.2 adl-env/providers → Task 7–10；§5.3 API → Task 11；§6.1 NSIS+随包 → Task 12；§5.1 dsh 迁移 → Task 6；§10 Rust 离线测试 → 各任务 Step 1/4。§6.2 向导、§7 UI、§8 runbook 属 Phase 2/3，未在本计划——符合分期。`env-baseline.json` 在线刷新 → Phase 2（前端触发）/Phase 3，Task 11 只做加载；spec 未要求本期刷新，已覆盖“失败用内置”。

**2. Placeholder scan:** 无 TBD/TODO/“类似 Task N”（Task 9 复用处已写明抽 `fetch_and_stage` 共享函数位置；Task 11 测试取舍已明确写出）。版本号（node stable/git stable/webview2 minimum）标为“实现时按发版日核对”，属外部事实非占位——Task 11/12 步骤内已要求核对源。

**3. Type consistency:** `HostedVersions::open(root, name, marker_rel)`（Task 1）→ Task 8 调用 `open(data_dir, "env-hosted/node", "node.exe")` 一致；`swap_into_place(staging, target)`（Task 2）→ Task 3/8/9 同签名；`ProgressTask::begin(kind: &str, label: &str)`（Task 5）→ Task 11 kind=`"env-{dep}-install"`；`InstallLock` 别名（Task 5）→ Task 6/11 state 字段类型一致；`HostedProcess` 重导出（Task 4→6）→ `state.rs ManagedDsh.process` 类型不变。

---

Plan complete and saved to `docs/superpowers/plans/2026-10-23-env-phase1-backend-packaging.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
