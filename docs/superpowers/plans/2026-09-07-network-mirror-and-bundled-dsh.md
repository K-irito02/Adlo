# 网络镜像配置 + 内置 dsh 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加下载源镜像配置、内置 dsh 包管理、系统 dsh 检测与共存，使用户在离线或网络受限环境下仍能使用 dsh。

**Architecture:** 三个新/扩展 crate（download-source、dsh-bundle、dsh-version 扩展）提供后端能力，服务器层实现启动回退链，前端添加下载设置面板和状态卡片。

**Tech Stack:** Rust (reqwest, serde, tokio, semver), React, TypeScript, CSS (项目 design system tokens)

**Spec:** `docs/superpowers/specs/2026-09-07-network-mirror-and-bundled-dsh-design.md`

## Global Constraints

- Rust edition 2024, rust-version 1.85
- 所有 UI 文本必须使用 i18n key，禁止硬编码
- CSS 使用项目 design system tokens（`var(--space-*)`, `var(--text-*)`, `var(--radius-*)` 等）
- 组件样式使用 `adl-` 前缀 BEM 命名
- 图标使用 SVG（`viewBox="0 0 24 24"`, `currentColor`）
- 配置文件位于 `<data_dir>/config/` 目录
- 双端一致性：Tauri 桌面 + 浏览器模式均可用

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `crates/download-source/Cargo.toml` | 下载源 crate 配置 |
| `crates/download-source/src/lib.rs` | 配置读写、源解析、代理构建、连通性测试 |
| `crates/dsh-bundle/Cargo.toml` | 内置 dsh crate 配置 |
| `crates/dsh-bundle/src/lib.rs` | 内置 dsh 检测、版本查询、启动命令构建 |
| `frontend/src/app/features/dsh/DownloadSettingsModal.tsx` | 下载设置模态框组件 |
| `frontend/src/app/features/dsh/SourceStatusCard.tsx` | 下载源状态卡片组件 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `ai-digital-life/Cargo.toml` | 添加 workspace members |
| `crates/dsh-version/src/lib.rs` | 添加系统 dsh 检测、运行进程检测、智能选择 |
| `crates/dsh-version/Cargo.toml` | 添加依赖（ tokio process, std Command） |
| `crates/webapp-host/src/lib.rs` | 添加 `spawn_node_direct()` 支持直接 node.js 启动 |
| `crates/server/Cargo.toml` | 添加 download-source、dsh-bundle 依赖 |
| `crates/server/src/state.rs` | 无结构变更（dsh_state 已有） |
| `crates/server/src/handlers/dsh.rs` | 重构 run_open 实现回退链，添加下载源端点 |
| `frontend/src/shared/ipc/dsh.ts` | 添加 DshBridge 下载源方法 |
| `frontend/src/tauri-bridge/tauri-dsh.ts` | 实现 Tauri 桥接 |
| `frontend/src/httpBridge.ts` | 添加 HTTP 路由映射 |
| `frontend/src/app/stores/slices/dshSlice.ts` | 添加 sourceStatus 状态 |
| `frontend/src/app/stores/actions/dshActions.ts` | 添加下载源 actions |
| `frontend/src/app/features/dsh/WelcomePage.tsx` | 添加设置入口和状态卡片 |
| `frontend/src/app/i18n/en-US/dsh.ts` | 添加英文 i18n 键 |
| `frontend/src/app/i18n/zh-CN/dsh.ts` | 添加中文 i18n 键 |
| `frontend/src/styles/regions/dsh.css` | 添加下载设置面板样式 |

---

### Task 1: 创建 download-source crate

**Files:**
- Create: `ai-digital-life/crates/download-source/Cargo.toml`
- Create: `ai-digital-life/crates/download-source/src/lib.rs`
- Modify: `ai-digital-life/Cargo.toml` (添加 workspace member)

**Interfaces:**
- Produces: `DownloadSourceConfig`, `ProxyConfig`, `ProxyMode`, `SourceStatus`, `load()`, `save()`, `resolve_registry()`, `build_http_client()`, `test_source()`

- [ ] **Step 1: 创建 crate 目录和 Cargo.toml**

```toml
# ai-digital-life/crates/download-source/Cargo.toml
[package]
name = "adl-download-source"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
adl-errors = { path = "../errors" }
serde = { workspace = true }
serde_json = { workspace = true }
reqwest = { workspace = true }
tokio = { workspace = true }
tracing = { workspace = true }
```

- [ ] **Step 2: 在 workspace Cargo.toml 添加 member**

在 `ai-digital-life/Cargo.toml` 的 `[workspace] members` 列表中添加 `"crates/download-source"`。

- [ ] **Step 3: 编写配置结构体和序列化**

```rust
// crates/download-source/src/lib.rs
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadSourceConfig {
    pub version: u32,
    pub npm_registry: String,
    pub dsh_mirror: Option<String>,
    pub proxy: ProxyConfig,
    pub prefer_offline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub mode: ProxyMode,
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProxyMode {
    Auto,
    Manual,
    None,
}

impl Default for DownloadSourceConfig {
    fn default() -> Self {
        Self {
            version: 1,
            npm_registry: "https://registry.npmjs.org".to_string(),
            dsh_mirror: None,
            proxy: ProxyConfig::default(),
            prefer_offline: true,
        }
    }
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            mode: ProxyMode::Auto,
            http_proxy: None,
            https_proxy: None,
            no_proxy: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStatus {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}
```

- [ ] **Step 4: 实现 load/save 函数**

```rust
fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("config").join("download-sources.json")
}

pub fn load(data_dir: &Path) -> Result<DownloadSourceConfig, adl_errors::AppError> {
    let path = config_path(data_dir);
    if !path.exists() {
        return Ok(DownloadSourceConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| adl_errors::AppError::Io(format!("读取下载源配置失败: {e}")))?;
    let config: DownloadSourceConfig = serde_json::from_str(&content)
        .map_err(|e| adl_errors::AppError::Io(format!("解析下载源配置失败: {e}")))?;
    Ok(config)
}

pub fn save(data_dir: &Path, config: &DownloadSourceConfig) -> Result<(), adl_errors::AppError> {
    let dir = data_dir.join("config");
    std::fs::create_dir_all(&dir)
        .map_err(|e| adl_errors::AppError::Io(format!("创建配置目录失败: {e}")))?;
    let path = config_path(data_dir);
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| adl_errors::AppError::Io(format!("序列化下载源配置失败: {e}")))?;
    std::fs::write(&path, content)
        .map_err(|e| adl_errors::AppError::Io(format!("写入下载源配置失败: {e}")))?;
    Ok(())
}
```

- [ ] **Step 5: 实现 resolve_registry 函数**

```rust
pub fn resolve_registry(config: &DownloadSourceConfig) -> String {
    if let Some(ref mirror) = config.dsh_mirror {
        if !mirror.is_empty() {
            return mirror.clone();
        }
    }
    config.npm_registry.clone()
}
```

- [ ] **Step 6: 实现 build_http_client 函数**

```rust
pub fn build_http_client(config: &DownloadSourceConfig) -> Result<reqwest::Client, adl_errors::AppError> {
    let mut builder = reqwest::Client::builder();

    match config.proxy.mode {
        ProxyMode::Auto => {
            // reqwest system-proxy feature handles this automatically
        }
        ProxyMode::Manual => {
            if let Some(ref http_proxy) = config.proxy.http_proxy {
                let proxy = reqwest::Proxy::http(http_proxy)
                    .map_err(|e| adl_errors::AppError::Io(format!("配置 HTTP 代理失败: {e}")))?;
                builder = builder.proxy(proxy);
            }
            if let Some(ref https_proxy) = config.proxy.https_proxy {
                let proxy = reqwest::Proxy::https(https_proxy)
                    .map_err(|e| adl_errors::AppError::Io(format!("配置 HTTPS 代理失败: {e}")))?;
                builder = builder.proxy(proxy);
            }
            if let Some(ref no_proxy) = config.proxy.no_proxy {
                let proxy = reqwest::Proxy::no_proxy()
                    .map_err(|e| adl_errors::AppError::Io(format!("配置 no_proxy 失败: {e}")))?;
                // no_proxy is handled by setting the NO_PROXY env var
                std::env::set_var("NO_PROXY", no_proxy);
            }
        }
        ProxyMode::None => {
            builder = builder.no_proxy();
        }
    }

    let client = builder.build()
        .map_err(|e| adl_errors::AppError::Io(format!("构建 HTTP 客户端失败: {e}")))?;
    Ok(client)
}
```

- [ ] **Step 7: 实现 test_source 函数**

```rust
pub async fn test_source(url: &str, timeout: std::time::Duration) -> SourceStatus {
    let client = match reqwest::Client::builder()
        .timeout(timeout)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return SourceStatus {
                reachable: false,
                latency_ms: None,
                error: Some(format!("构建客户端失败: {e}")),
            };
        }
    };

    let start = std::time::Instant::now();
    match client.get(url).send().await {
        Ok(resp) => {
            let latency = start.elapsed().as_millis() as u64;
            let status = resp.status();
            SourceStatus {
                reachable: status.is_success() || status.is_redirection(),
                latency_ms: Some(latency),
                error: if status.is_success() || status.is_redirection() {
                    None
                } else {
                    Some(format!("HTTP {status}"))
                },
            }
        }
        Err(e) => SourceStatus {
            reachable: false,
            latency_ms: None,
            error: Some(e.to_string()),
        },
    }
}
```

- [ ] **Step 8: 验证编译**

Run: `cargo check -p adl-download-source` (在 `ai-digital-life/` 目录下)
Expected: 编译通过，无错误

- [ ] **Step 9: 提交**

```bash
git add crates/download-source/
git commit -m "feat(download-source): add download source configuration crate"
```

---

### Task 2: 创建 dsh-bundle crate

**Files:**
- Create: `ai-digital-life/crates/dsh-bundle/Cargo.toml`
- Create: `ai-digital-life/crates/dsh-bundle/src/lib.rs`
- Modify: `ai-digital-life/Cargo.toml` (添加 workspace member)

**Interfaces:**
- Consumes: `adl_download_source::DownloadSourceConfig`
- Produces: `BundledDsh`, `BundleManifest`, `detect()`, `bundled_version()`, `launch_command()`

- [ ] **Step 1: 创建 crate 目录和 Cargo.toml**

```toml
# ai-digital-life/crates/dsh-bundle/Cargo.toml
[package]
name = "adl-dsh-bundle"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
adl-errors = { path = "../errors" }
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
tracing = { workspace = true }
```

- [ ] **Step 2: 在 workspace Cargo.toml 添加 member**

在 `ai-digital-life/Cargo.toml` 的 `[workspace] members` 列表中添加 `"crates/dsh-bundle"`。

- [ ] **Step 3: 编写 BundleManifest 和 BundledDsh 结构体**

```rust
// crates/dsh-bundle/src/lib.rs
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleManifest {
    pub version: String,
    pub bundled_at: String,
    pub npm_registry: String,
    pub package_hash: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BundledDsh {
    pub version: String,
    pub path: PathBuf,
    pub manifest: BundleManifest,
}
```

- [ ] **Step 4: 实现 detect 函数**

```rust
fn bundle_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("dsh-bundle")
}

fn manifest_path(data_dir: &Path) -> PathBuf {
    bundle_dir(data_dir).join("manifest.json")
}

fn version_path(data_dir: &Path) -> PathBuf {
    bundle_dir(data_dir).join("version.txt")
}

fn package_dir(data_dir: &Path) -> PathBuf {
    bundle_dir(data_dir).join("package")
}

pub fn detect(data_dir: &Path) -> Result<Option<BundledDsh>, adl_errors::AppError> {
    let manifest_p = manifest_path(data_dir);
    if !manifest_p.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&manifest_p)
        .map_err(|e| adl_errors::AppError::Io(format!("读取内置 dsh manifest 失败: {e}")))?;
    let manifest: BundleManifest = serde_json::from_str(&content)
        .map_err(|e| adl_errors::AppError::Io(format!("解析内置 dsh manifest 失败: {e}")))?;

    let pkg_dir = package_dir(data_dir);
    let bin_js = pkg_dir.join("lib").join("bin.js");
    if !bin_js.exists() {
        tracing::warn!("内置 dsh bin.js 不存在: {}", bin_js.display());
        return Ok(None);
    }

    Ok(Some(BundledDsh {
        version: manifest.version.clone(),
        path: pkg_dir,
        manifest,
    }))
}
```

- [ ] **Step 5: 实现 bundled_version 和 launch_command**

```rust
pub fn bundled_version(data_dir: &Path) -> Result<Option<String>, adl_errors::AppError> {
    let vp = version_path(data_dir);
    if !vp.exists() {
        return Ok(None);
    }
    let version = std::fs::read_to_string(&vp)
        .map_err(|e| adl_errors::AppError::Io(format!("读取内置 dsh 版本失败: {e}")))?;
    let version = version.trim().to_string();
    if version.is_empty() {
        return Ok(None);
    }
    Ok(Some(version))
}

pub fn launch_command(bundled: &BundledDsh) -> (String, Vec<String>) {
    let bin_js = bundled.path.join("lib").join("bin.js");
    let program = "node".to_string();
    let args = vec![
        bin_js.to_string_lossy().to_string(),
        "--profile".to_string(),
        "web".to_string(),
        "--no-open".to_string(),
    ];
    (program, args)
}
```

- [ ] **Step 6: 验证编译**

Run: `cargo check -p adl-dsh-bundle` (在 `ai-digital-life/` 目录下)
Expected: 编译通过，无错误

- [ ] **Step 7: 提交**

```bash
git add crates/dsh-bundle/
git commit -m "feat(dsh-bundle): add bundled dsh management crate"
```

---

### Task 3: 扩展 dsh-version — 系统 dsh 检测与智能选择

**Files:**
- Modify: `ai-digital-life/crates/dsh-version/Cargo.toml` (添加依赖)
- Modify: `ai-digital-life/crates/dsh-version/src/lib.rs` (添加检测和选择逻辑)

**Interfaces:**
- Consumes: `adl_dsh_bundle::BundledDsh`
- Produces: `SystemDshInfo`, `RunningDshInfo`, `DshSource`, `detect_system_dsh()`, `detect_running_dsh()`, `select_dsh_source()`

- [ ] **Step 1: 在 dsh-version Cargo.toml 添加依赖**

```toml
# 添加到 crates/dsh-version/Cargo.toml 的 [dependencies]
adl-dsh-bundle = { path = "../dsh-bundle" }
```

- [ ] **Step 2: 添加 SystemDshInfo 和 RunningDshInfo 结构体**

```rust
// 在 crates/dsh-version/src/lib.rs 末尾添加

use std::process::Command as StdCommand;

#[derive(Debug, Clone)]
pub struct SystemDshInfo {
    pub path: PathBuf,
    pub version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RunningDshInfo {
    pub url: String,
    pub port: u16,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum DshSource {
    ReuseRunning { url: String, port: u16 },
    System { info: SystemDshInfo },
    Bundled { bundled: adl_dsh_bundle::BundledDsh },
    Download { version: Option<String> },
}
```

- [ ] **Step 3: 实现 detect_system_dsh**

```rust
pub fn detect_system_dsh() -> Option<SystemDshInfo> {
    // Try to find dsh in PATH
    let output = if cfg!(target_os = "windows") {
        StdCommand::new("where")
            .arg("dsh")
            .output()
            .ok()?
    } else {
        StdCommand::new("which")
            .arg("dsh")
            .output()
            .ok()?
    };

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next()?.trim();
    let path = PathBuf::from(first_line);

    if !path.exists() {
        return None;
    }

    // Try to get version
    let version_output = StdCommand::new(&path)
        .arg("--version")
        .output()
        .ok();

    let version = version_output
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout);
                // Parse version from output (e.g., "dsh version 0.1.2")
                stdout
                    .lines()
                    .next()
                    .and_then(|line| {
                        line.split_whitespace()
                            .last()
                            .filter(|s| s.chars().next().map_or(false, |c| c.is_ascii_digit()))
                            .map(|s| s.to_string())
                    })
            } else {
                None
            }
        });

    Some(SystemDshInfo { path, version })
}
```

- [ ] **Step 4: 实现 detect_running_dsh**

```rust
pub fn detect_running_dsh() -> Option<RunningDshInfo> {
    use std::net::TcpStream;

    // Quick check: is port 3080 listening?
    let port = 3080u16;
    let addr = format!("127.0.0.1:{port}");
    let is_listening = TcpStream::connect(&addr).is_ok();

    if !is_listening {
        return None;
    }

    // Port is listening, try to verify it's dsh by checking HTTP
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()?;

    let url = format!("http://127.0.0.1:{port}");
    let resp = client.get(&url).send().ok()?;

    if resp.status().is_success() {
        Some(RunningDshInfo {
            url,
            port,
            pid: None, // Could enhance with netstat parsing if needed
        })
    } else {
        None
    }
}
```

- [ ] **Step 5: 实现 select_dsh_source**

```rust
pub fn select_dsh_source(
    data_dir: &Path,
    bundled: Option<&adl_dsh_bundle::BundledDsh>,
) -> DshSource {
    // 1. Check if dsh is already running on port 3080
    if let Some(running) = detect_running_dsh() {
        tracing::info!("检测到已运行的 dsh: port {}", running.port);
        return DshSource::ReuseRunning {
            url: running.url,
            port: running.port,
        };
    }

    // 2. Check system PATH for dsh
    if let Some(system) = detect_system_dsh() {
        tracing::info!("检测到系统 dsh: {}", system.path.display());
        return DshSource::System { info: system };
    }

    // 3. Check bundled dsh
    if let Some(b) = bundled {
        tracing::info!("使用内置 dsh: v{}", b.version);
        return DshSource::Bundled { bundled: b.clone() };
    }

    // 4. Fallback to npx download
    let selected = read_selected(data_dir).ok().flatten();
    tracing::info!("回退到 npx 下载: {:?}", selected);
    DshSource::Download { version: selected }
}
```

- [ ] **Step 6: 验证编译**

Run: `cargo check -p adl-dsh-version` (在 `ai-digital-life/` 目录下)
Expected: 编译通过，无错误

- [ ] **Step 7: 提交**

```bash
git add crates/dsh-version/
git commit -m "feat(dsh-version): add system detection and smart source selection"
```

---

### Task 4: 扩展 webapp-host — 支持直接 node.js 启动

**Files:**
- Modify: `ai-digital-life/crates/webapp-host/src/lib.rs` (添加 spawn_node_direct 函数)

**Interfaces:**
- Produces: `spawn_node_direct()`

- [ ] **Step 1: 添加 spawn_node_direct 函数**

```rust
// 在 crates/webapp-host/src/lib.rs 的 spawn_and_wait_ready 函数之后添加

/// 直接通过 node.js 启动 dsh（使用内置包路径）
pub async fn spawn_node_direct(
    node_bin: &str,
    script_path: &str,
    extra_args: &[String],
    timeout: Duration,
) -> Result<HostedProcess, AppError> {
    let port = pick_free_port()?;
    let url = format!("http://127.0.0.1:{port}");
    let default_url = format!("http://127.0.0.1:{DSH_DEFAULT_PORT}");

    let mut args: Vec<String> = vec![script_path.to_string()];
    args.extend_from_slice(extra_args);

    let mut child = try_spawn(node_bin, &args)?;

    // Poll until ready
    let start = tokio::time::Instant::now();
    loop {
        if start.elapsed() > timeout {
            let _ = child.kill().await;
            return Err(AppError::Timeout(format!(
                "dsh 启动超时 ({})",
                timeout.as_secs()
            )));
        }

        // Check both the ephemeral port and default port
        let ready = check_port(&url).await || check_port(&default_url).await;
        if ready {
            // Determine which URL is actually serving
            let actual_url = if check_port(&default_url).await {
                default_url.clone()
            } else {
                url.clone()
            };
            return Ok(HostedProcess {
                child,
                url: actual_url,
                port,
            });
        }

        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

async fn check_port(url: &str) -> bool {
    reqwest::Client::new()
        .get(url)
        .timeout(Duration::from_secs(1))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}
```

- [ ] **Step 2: 验证编译**

Run: `cargo check -p adl-webapp-host` (在 `ai-digital-life/` 目录下)
Expected: 编译通过，无错误

- [ ] **Step 3: 提交**

```bash
git add crates/webapp-host/
git commit -m "feat(webapp-host): add spawn_node_direct for bundled dsh"
```

---

### Task 5: 重构 server handlers/dsh.rs — 实现启动回退链

**Files:**
- Modify: `ai-digital-life/crates/server/Cargo.toml` (添加依赖)
- Modify: `ai-digital-life/crates/server/src/handlers/dsh.rs` (重构 run_open)
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs` (添加下载源 handler)

**Interfaces:**
- Consumes: `adl_download_source::*`, `adl_dsh_bundle::*`, `adl_dsh_version::select_dsh_source()`
- Produces: 重构后的 `run_open()`, 新增 `get_source_status()`, `save_source_config()`, `test_source()`

- [ ] **Step 1: 在 server Cargo.toml 添加依赖**

```toml
# 添加到 crates/server/Cargo.toml 的 [dependencies]
adl-download-source = { path = "../download-source" }
adl-dsh-bundle = { path = "../dsh-bundle" }
```

- [ ] **Step 2: 添加下载源状态端点**

```rust
// 在 crates/server/src/handlers/dsh.rs 中添加

/// GET /dsh/source-status — 获取下载源状态
pub async fn get_source_status(
    State(state): State<ServerState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let bundled = adl_dsh_bundle::detect(&state.data_dir)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let system = adl_dsh_version::detect_system_dsh();
    let running = adl_dsh_version::detect_running_dsh();
    let config = adl_download_source::load(&state.data_dir)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "bundled": bundled.map(|b| serde_json::json!({
            "version": b.version,
            "path": b.path,
        })),
        "system": system.map(|s| serde_json::json!({
            "path": s.path,
            "version": s.version,
        })),
        "running": running.map(|r| serde_json::json!({
            "url": r.url,
            "port": r.port,
        })),
        "config": {
            "npm_registry": config.npm_registry,
            "dsh_mirror": config.dsh_mirror,
            "proxy_mode": config.proxy.mode,
        },
    })))
}

/// POST /dsh/source-config — 保存下载源配置
pub async fn save_source_config(
    State(state): State<ServerState>,
    Json(input): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut config = adl_download_source::load(&state.data_dir)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    if let Some(registry) = input.get("npm_registry").and_then(|v| v.as_str()) {
        config.npm_registry = registry.to_string();
    }
    if let Some(mirror) = input.get("dsh_mirror") {
        config.dsh_mirror = mirror.as_str().map(|s| s.to_string());
    }
    if let Some(proxy) = input.get("proxy") {
        if let Some(mode) = proxy.get("mode").and_then(|v| v.as_str()) {
            config.proxy.mode = match mode {
                "manual" => adl_download_source::ProxyMode::Manual,
                "none" => adl_download_source::ProxyMode::None,
                _ => adl_download_source::ProxyMode::Auto,
            };
        }
        if let Some(http) = proxy.get("http_proxy").and_then(|v| v.as_str()) {
            config.proxy.http_proxy = Some(http.to_string());
        }
        if let Some(https) = proxy.get("https_proxy").and_then(|v| v.as_str()) {
            config.proxy.https_proxy = Some(https.to_string());
        }
        if let Some(no) = proxy.get("no_proxy").and_then(|v| v.as_str()) {
            config.proxy.no_proxy = Some(no.to_string());
        }
    }

    adl_download_source::save(&state.data_dir, &config)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /dsh/test-source — 测试下载源连通性
pub async fn test_source(
    Json(input): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let url = input.get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("缺少 url 参数".to_string()))?;

    let status = adl_download_source::test_source(
        url,
        std::time::Duration::from_secs(5),
    ).await;

    Ok(Json(serde_json::json!({
        "reachable": status.reachable,
        "latency_ms": status.latency_ms,
        "error": status.error,
    })))
}
```

- [ ] **Step 3: 重构 run_open 实现回退链**

```rust
// 替换 crates/server/src/handlers/dsh.rs 中的 run_open 函数

async fn run_open(
    data_dir: &Path,
    dsh_state: &Arc<AsyncMutex<Option<HostedProcess>>>,
    start_lock: &Arc<AsyncMutex<()>>,
) -> Result<serde_json::Value, AppError> {
    // 1. Quick path: already running
    {
        let state = dsh_state.lock().await;
        if let Some(ref proc) = *state {
            return Ok(serde_json::json!({ "url": proc.url, "source": "reuse" }));
        }
    }

    // 2. Acquire start lock
    let _lock = start_lock.lock().await;

    // 3. Double-check after acquiring lock
    {
        let state = dsh_state.lock().await;
        if let Some(ref proc) = *state {
            return Ok(serde_json::json!({ "url": proc.url, "source": "reuse" }));
        }
    }

    // 4. Free stale processes on default port
    free_stale_dsh_on_default_port().await;

    // 5. Load configs
    let source_config = adl_download_source::load(data_dir)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let bundled = adl_dsh_bundle::detect(data_dir)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // 6. Smart source selection
    let dsh_source = adl_dsh_version::select_dsh_source(data_dir, bundled.as_ref());

    // 7. Launch based on source
    let hp = match dsh_source {
        adl_dsh_version::DshSource::ReuseRunning { url, .. } => {
            // Shouldn't reach here (handled in step 1), but handle gracefully
            return Ok(serde_json::json!({ "url": url, "source": "reuse" }));
        }
        adl_dsh_version::DshSource::System { info } => {
            tracing::info!("启动系统 dsh: {}", info.path.display());
            let program = info.path.to_string_lossy().to_string();
            let args = vec![
                "--profile".to_string(),
                "web".to_string(),
                "--no-open".to_string(),
            ];
            spawn_and_wait_ready(&program, &args, Duration::from_secs(30)).await?
        }
        adl_dsh_version::DshSource::Bundled { bundled } => {
            tracing::info!("启动内置 dsh: v{}", bundled.version);
            let (program, args) = adl_dsh_bundle::launch_command(&bundled);
            spawn_node_direct(&program, &args[0], &args[1..], Duration::from_secs(30)).await?
        }
        adl_dsh_version::DshSource::Download { version } => {
            tracing::info!("通过 npx 下载 dsh: {:?}", version);
            let registry = adl_download_source::resolve_registry(&source_config);
            let package_spec = match version {
                Some(v) => format!("@deepseek-ai/dsh@{v}"),
                None => "@deepseek-ai/dsh@latest".to_string(),
            };
            let mut args = vec![
                package_spec,
                "--profile".to_string(),
                "web".to_string(),
                "--no-open".to_string(),
            ];
            // Apply mirror if configured
            if registry != "https://registry.npmjs.org" {
                args.push("--registry".to_string());
                args.push(registry);
            }
            // Apply proxy env vars if manual mode
            if source_config.proxy.mode == adl_download_source::ProxyMode::Manual {
                if let Some(ref http) = source_config.proxy.http_proxy {
                    std::env::set_var("HTTP_PROXY", http);
                }
                if let Some(ref https) = source_config.proxy.https_proxy {
                    std::env::set_var("HTTPS_PROXY", https);
                }
            }
            spawn_and_wait_ready("npx", &args, Duration::from_secs(60)).await?
        }
    };

    let url = hp.url.clone();
    let mut state = dsh_state.lock().await;
    *state = Some(hp);

    Ok(serde_json::json!({ "url": url, "source": "spawned" }))
}
```

- [ ] **Step 4: 在路由注册中添加新端点**

在服务器路由配置中（通常是 `crates/server/src/lib.rs` 或 `main.rs` 中的 router 定义），添加：

```rust
.route("/dsh/source-status", post(handlers::dsh::get_source_status))
.route("/dsh/source-config", post(handlers::dsh::save_source_config))
.route("/dsh/test-source", post(handlers::dsh::test_source))
```

- [ ] **Step 5: 验证编译**

Run: `cargo check -p adl-server` (在 `ai-digital-life/` 目录下)
Expected: 编译通过，无错误

- [ ] **Step 6: 提交**

```bash
git add crates/server/
git commit -m "feat(dsh): implement launch fallback chain with mirror support"
```

---

### Task 6: 前端 — 添加 i18n 键

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/dsh.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/dsh.ts`

**Interfaces:**
- Produces: i18n 键（供后续组件使用）

- [ ] **Step 1: 添加英文 i18n 键**

在 `ai-digital-life/frontend/src/app/i18n/en-US/dsh.ts` 的导出对象中添加：

```typescript
// 下载设置
dshSettingsTitle: 'Download Settings',
dshSettingsSource: 'Download Source',
dshSettingsSourceNpmjs: 'npmjs (Official)',
dshSettingsSourceNpmmirror: 'npmmirror (China)',
dshSettingsSourceCustom: 'Custom',
dshSettingsSourceCustomPlaceholder: 'https://custom-registry.example',
dshSettingsProxy: 'Proxy Settings',
dshSettingsProxyMode: 'Mode',
dshSettingsProxyModeAuto: 'Auto Detect',
dshSettingsProxyModeManual: 'Manual',
dshSettingsProxyModeNone: 'None',
dshSettingsProxyHttp: 'HTTP Proxy',
dshSettingsProxyHttps: 'HTTPS Proxy',
dshSettingsProxyNoProxy: 'No Proxy',
dshSettingsProxyPlaceholder: 'http://proxy:8080',
dshSettingsTestConnection: 'Test Connection',
dshSettingsTestSuccess: 'Connected ({latency}ms)',
dshSettingsTestFailed: 'Failed: {error}',
dshSettingsTestTesting: 'Testing...',
dshSettingsSave: 'Save',
dshSettingsCancel: 'Cancel',
// 状态
dshStatusBundled: 'Bundled: v{version} (Offline)',
dshStatusBundledNone: 'Bundled: N/A',
dshStatusSystem: 'System: v{version}',
dshStatusSystemNone: 'System: Not found',
dshStatusMirror: 'Mirror: {name}',
dshStatusMirrorNone: 'Mirror: Default',
dshStatusRunning: 'Running: port {port}',
```

- [ ] **Step 2: 添加中文 i18n 键**

在 `ai-digital-life/frontend/src/app/i18n/zh-CN/dsh.ts` 的导出对象中添加：

```typescript
// 下载设置
dshSettingsTitle: '下载设置',
dshSettingsSource: '下载源',
dshSettingsSourceNpmjs: 'npmjs（官方）',
dshSettingsSourceNpmmirror: 'npmmirror（中国）',
dshSettingsSourceCustom: '自定义',
dshSettingsSourceCustomPlaceholder: 'https://custom-registry.example',
dshSettingsProxy: '代理设置',
dshSettingsProxyMode: '模式',
dshSettingsProxyModeAuto: '自动检测',
dshSettingsProxyModeManual: '手动',
dshSettingsProxyModeNone: '无',
dshSettingsProxyHttp: 'HTTP 代理',
dshSettingsProxyHttps: 'HTTPS 代理',
dshSettingsProxyNoProxy: '不代理',
dshSettingsProxyPlaceholder: 'http://proxy:8080',
dshSettingsTestConnection: '测试连接',
dshSettingsTestSuccess: '已连接（{latency}ms）',
dshSettingsTestFailed: '失败：{error}',
dshSettingsTestTesting: '测试中...',
dshSettingsSave: '保存',
dshSettingsCancel: '取消',
// 状态
dshStatusBundled: '内置版本：v{version}（离线可用）',
dshStatusBundledNone: '内置版本：不可用',
dshStatusSystem: '系统版本：v{version}',
dshStatusSystemNone: '系统版本：未检测到',
dshStatusMirror: '镜像源：{name}',
dshStatusMirrorNone: '镜像源：默认',
dshStatusRunning: '运行中：端口 {port}',
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit` (在 `ai-digital-life/frontend/` 目录下)
Expected: 编译通过，无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/i18n/
git commit -m "feat(i18n): add download settings translations"
```

---

### Task 7: 前端 — 扩展 DshBridge 和 Store

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/dsh.ts` (添加类型和方法)
- Modify: `ai-digital-life/frontend/src/httpBridge.ts` (添加路由)
- Modify: `ai-digital-life/frontend/src/tauri-bridge/tauri-dsh.ts` (添加桥接)
- Modify: `ai-digital-life/frontend/src/app/stores/slices/dshSlice.ts` (添加状态)
- Modify: `ai-digital-life/frontend/src/app/stores/actions/dshActions.ts` (添加 actions)

**Interfaces:**
- Consumes: 后端 `/dsh/source-status`, `/dsh/source-config`, `/dsh/test-source` 端点
- Produces: `DshSourceStatus`, `DshSourceConfig`, `getSourceStatus()`, `saveSourceConfig()`, `testSource()`

- [ ] **Step 1: 在 dsh.ts 添加类型和方法**

```typescript
// 在 ai-digital-life/frontend/src/shared/ipc/dsh.ts 中添加

export interface DshSourceStatus {
  bundled: { version: string; path: string } | null;
  system: { path: string; version: string | null } | null;
  running: { url: string; port: number } | null;
  config: {
    npm_registry: string;
    dsh_mirror: string | null;
    proxy_mode: string;
  };
}

export interface DshSourceConfig {
  npm_registry?: string;
  dsh_mirror?: string | null;
  proxy?: {
    mode?: 'auto' | 'manual' | 'none';
    http_proxy?: string | null;
    https_proxy?: string | null;
    no_proxy?: string | null;
  };
}

export interface DshTestResult {
  reachable: boolean;
  latency_ms: number | null;
  error: string | null;
}

// 在 DshBridge 接口中添加
interface DshBridge {
  // ... 现有方法
  getSourceStatus: () => Promise<IpcResult<DshSourceStatus>>;
  saveSourceConfig: (config: DshSourceConfig) => Promise<IpcResult<boolean>>;
  testSource: (url: string) => Promise<IpcResult<DshTestResult>>;
}
```

- [ ] **Step 2: 在 httpBridge.ts 添加路由映射**

```typescript
// 在 ai-digital-life/frontend/src/httpBridge.ts 的 dsh 对象中添加

dsh: {
  // ... 现有方法
  getSourceStatus: () => call<DshSourceStatus>(baseUrl, '/dsh/source-status', POST({})),
  saveSourceConfig: (config: DshSourceConfig) => call<boolean>(baseUrl, '/dsh/source-config', POST(config)),
  testSource: (url: string) => call<DshTestResult>(baseUrl, '/dsh/test-source', POST({ url })),
},
```

- [ ] **Step 3: 在 tauri-dsh.ts 添加桥接**

```typescript
// 在 ai-digital-life/frontend/src/tauri-bridge/tauri-dsh.ts 的 createTauriDshBridge 中添加

// 直接透传（不需要额外的 Tauri IPC）
getSourceStatus: httpDsh.getSourceStatus,
saveSourceConfig: httpDsh.saveSourceConfig,
testSource: httpDsh.testSource,
```

- [ ] **Step 4: 在 dshSlice.ts 添加状态**

```typescript
// 在 ai-digital-life/frontend/src/app/stores/slices/dshSlice.ts 中添加

interface DshSlice {
  // ... 现有字段
  sourceStatus: DshSourceStatus | null;
  settingsModalVisible: boolean;
  // ... 现有 setters
  setDshSourceStatus: (status: DshSourceStatus | null) => void;
  setSettingsModalVisible: (visible: boolean) => void;
}
```

- [ ] **Step 5: 在 dshActions.ts 添加 actions**

```typescript
// 在 ai-digital-life/frontend/src/app/stores/actions/dshActions.ts 中添加

export async function fetchSourceStatus(): Promise<boolean> {
  const dsh = getDshBridge();
  if (!dsh) return false;
  const result = await dsh.getSourceStatus();
  if (result.ok) {
    useAppStore.getState().setDshSourceStatus(result.data);
    return true;
  }
  captureError('dsh', result.error);
  return false;
}

export async function saveSourceConfig(config: DshSourceConfig): Promise<boolean> {
  const dsh = getDshBridge();
  if (!dsh) return false;
  const result = await dsh.saveSourceConfig(config);
  if (result.ok) {
    await fetchSourceStatus(); // refresh
    return true;
  }
  captureError('dsh', result.error);
  return false;
}

export async function testSource(url: string): Promise<DshTestResult | null> {
  const dsh = getDshBridge();
  if (!dsh) return null;
  const result = await dsh.testSource(url);
  if (result.ok) {
    return result.data;
  }
  captureError('dsh', result.error);
  return null;
}
```

- [ ] **Step 6: 验证 TypeScript 编译**

Run: `npx tsc --noEmit` (在 `ai-digital-life/frontend/` 目录下)
Expected: 编译通过，无类型错误

- [ ] **Step 7: 提交**

```bash
git add frontend/src/shared/ipc/dsh.ts frontend/src/httpBridge.ts frontend/src/tauri-bridge/tauri-dsh.ts frontend/src/app/stores/
git commit -m "feat(dsh): extend bridge and store for download source management"
```

---

### Task 8: 前端 — DownloadSettingsModal 组件

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/dsh/DownloadSettingsModal.tsx`

**Interfaces:**
- Consumes: `useTCopy`, `fetchSourceStatus`, `saveSourceConfig`, `testSource`
- Produces: `DownloadSettingsModal` React component

- [ ] **Step 1: 创建 DownloadSettingsModal 组件**

```tsx
// ai-digital-life/frontend/src/app/features/dsh/DownloadSettingsModal.tsx
import { useState, useEffect, useCallback } from 'react';
import { useTCopy } from '../../i18n';
import { useAppStore, useAppActions } from '../../stores';
import type { DshSourceConfig, DshTestResult } from '../../../shared/ipc/dsh';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DownloadSettingsModal({ visible, onClose }: Props) {
  const { t } = useTCopy();
  const sourceStatus = useAppStore((s) => s.dshSourceStatus);
  const { fetchSourceStatus, saveSourceConfig, testSource } = useAppActions();

  const [selectedSource, setSelectedSource] = useState<'npmjs' | 'npmmirror' | 'custom'>('npmjs');
  const [customUrl, setCustomUrl] = useState('');
  const [proxyMode, setProxyMode] = useState<'auto' | 'manual' | 'none'>('auto');
  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('');
  const [testResult, setTestResult] = useState<DshTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchSourceStatus();
      setTestResult(null);
    }
  }, [visible]);

  useEffect(() => {
    if (sourceStatus?.config) {
      const cfg = sourceStatus.config;
      if (cfg.dsh_mirror?.includes('npmmirror')) {
        setSelectedSource('npmmirror');
      } else if (cfg.dsh_mirror) {
        setSelectedSource('custom');
        setCustomUrl(cfg.dsh_mirror);
      } else {
        setSelectedSource('npmjs');
      }
      setProxyMode(cfg.proxy_mode as any);
    }
  }, [sourceStatus]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const url = selectedSource === 'npmjs'
      ? 'https://registry.npmjs.org'
      : selectedSource === 'npmmirror'
        ? 'https://registry.npmmirror.com'
        : customUrl;
    const result = await testSource(url);
    setTestResult(result);
    setTesting(false);
  }, [selectedSource, customUrl]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const config: DshSourceConfig = {
      dsh_mirror: selectedSource === 'npmjs' ? null
        : selectedSource === 'npmmirror' ? 'https://registry.npmmirror.com'
        : customUrl || null,
      proxy: {
        mode: proxyMode,
        http_proxy: httpProxy || null,
        https_proxy: httpsProxy || null,
        no_proxy: noProxy || null,
      },
    };
    await saveSourceConfig(config);
    setSaving(false);
    onClose();
  }, [selectedSource, customUrl, proxyMode, httpProxy, httpsProxy, noProxy]);

  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal adl-download-settings" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{t.dshSettingsTitle}</h2>

        {/* Source Selection */}
        <div className="field">
          <label className="field__label">{t.dshSettingsSource}</label>
          <div className="adl-download-settings__sources">
            {(['npmjs', 'npmmirror', 'custom'] as const).map((src) => (
              <label
                key={src}
                className={`adl-download-settings__source ${selectedSource === src ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="source"
                  value={src}
                  checked={selectedSource === src}
                  onChange={() => setSelectedSource(src)}
                />
                <span>
                  {src === 'npmjs' ? t.dshSettingsSourceNpmjs
                    : src === 'npmmirror' ? t.dshSettingsSourceNpmmirror
                    : t.dshSettingsSourceCustom}
                </span>
              </label>
            ))}
            {selectedSource === 'custom' && (
              <input
                className="input"
                type="url"
                placeholder={t.dshSettingsSourceCustomPlaceholder}
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* Proxy Settings */}
        <div className="adl-download-settings__proxy">
          <div className="field">
            <label className="field__label">{t.dshSettingsProxy}</label>
            <select
              className="select"
              value={proxyMode}
              onChange={(e) => setProxyMode(e.target.value as any)}
            >
              <option value="auto">{t.dshSettingsProxyModeAuto}</option>
              <option value="manual">{t.dshSettingsProxyModeManual}</option>
              <option value="none">{t.dshSettingsProxyModeNone}</option>
            </select>
          </div>
          {proxyMode === 'manual' && (
            <>
              <div className="field">
                <label className="field__label">{t.dshSettingsProxyHttp}</label>
                <input className="input" placeholder={t.dshSettingsProxyPlaceholder} value={httpProxy} onChange={(e) => setHttpProxy(e.target.value)} />
              </div>
              <div className="field">
                <label className="field__label">{t.dshSettingsProxyHttps}</label>
                <input className="input" placeholder={t.dshSettingsProxyPlaceholder} value={httpsProxy} onChange={(e) => setHttpsProxy(e.target.value)} />
              </div>
              <div className="field">
                <label className="field__label">{t.dshSettingsProxyNoProxy}</label>
                <input className="input" placeholder="localhost,127.0.0.1" value={noProxy} onChange={(e) => setNoProxy(e.target.value)} />
              </div>
            </>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`banner ${testResult.reachable ? 'banner--success' : 'banner--error'}`}>
            {testResult.reachable
              ? t.dshSettingsTestSuccess.replace('{latency}', String(testResult.latency_ms))
              : t.dshSettingsTestFailed.replace('{error}', testResult.error || '')}
          </div>
        )}

        {/* Actions */}
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={handleTest} disabled={testing}>
            {testing ? t.dshSettingsTestTesting : t.dshSettingsTestConnection}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>{t.dshSettingsCancel}</button>
          <button className="btn" onClick={handleSave} disabled={saving}>{t.dshSettingsSave}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit` (在 `ai-digital-life/frontend/` 目录下)
Expected: 编译通过，无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/features/dsh/DownloadSettingsModal.tsx
git commit -m "feat(dsh): add DownloadSettingsModal component"
```

---

### Task 9: 前端 — SourceStatusCard 组件

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/dsh/SourceStatusCard.tsx`

**Interfaces:**
- Consumes: `useTCopy`, `useAppStore`
- Produces: `SourceStatusCard` React component

- [ ] **Step 1: 创建 SourceStatusCard 组件**

```tsx
// ai-digital-life/frontend/src/app/features/dsh/SourceStatusCard.tsx
import { useTCopy } from '../../i18n';
import { useAppStore } from '../../stores';

interface Props {
  onOpenSettings: () => void;
}

export function SourceStatusCard({ onOpenSettings }: Props) {
  const { t } = useTCopy();
  const sourceStatus = useAppStore((s) => s.dshSourceStatus);

  return (
    <div className="adl-app-welcome__source-status">
      {/* Bundled status */}
      <div className="adl-app-welcome__source-row">
        <span>
          <span className={`status-dot ${sourceStatus?.bundled ? 'is-connected' : ''}`} />
          {' '}
          {sourceStatus?.bundled
            ? t.dshStatusBundled.replace('{version}', sourceStatus.bundled.version)
            : t.dshStatusBundledNone}
        </span>
      </div>

      {/* System dsh status */}
      <div className="adl-app-welcome__source-row">
        <span>
          <span className={`status-dot ${sourceStatus?.system ? 'is-connected' : ''}`} />
          {' '}
          {sourceStatus?.system
            ? t.dshStatusSystem.replace('{version}', sourceStatus.system.version || '?')
            : t.dshStatusSystemNone}
        </span>
      </div>

      {/* Mirror status */}
      <div className="adl-app-welcome__source-row">
        <span>
          <span className={`status-dot ${sourceStatus?.config.dsh_mirror ? 'is-connected' : ''}`} />
          {' '}
          {sourceStatus?.config.dsh_mirror
            ? t.dshStatusMirror.replace('{name}', sourceStatus.config.dsh_mirror)
            : t.dshStatusMirrorNone}
        </span>
      </div>

      {/* Settings button */}
      <button className="adl-app-welcome__source-settings-btn" onClick={onOpenSettings}>
        <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        {t.dshSettingsTitle}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit` (在 `ai-digital-life/frontend/` 目录下)
Expected: 编译通过，无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/features/dsh/SourceStatusCard.tsx
git commit -m "feat(dsh): add SourceStatusCard component"
```

---

### Task 10: 前端 — 集成到 WelcomePage

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/dsh/WelcomePage.tsx` (添加设置入口和状态卡片)

**Interfaces:**
- Consumes: `DownloadSettingsModal`, `SourceStatusCard`

- [ ] **Step 1: 在 WelcomePage 中导入新组件**

```tsx
// 在 WelcomePage.tsx 顶部添加
import { DownloadSettingsModal } from './DownloadSettingsModal';
import { SourceStatusCard } from './SourceStatusCard';
```

- [ ] **Step 2: 添加状态和渲染逻辑**

```tsx
// 在 WelcomePage 组件内部添加
const [settingsVisible, setSettingsVisible] = useState(false);

// 在 JSX 中，在 version card 之后、CTA button 之后添加：
<SourceStatusCard onOpenSettings={() => setSettingsVisible(true)} />

{/* 在 return 的最外层添加 */}
<DownloadSettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit` (在 `ai-digital-life/frontend/` 目录下)
Expected: 编译通过，无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/features/dsh/WelcomePage.tsx
git commit -m "feat(dsh): integrate settings and status into WelcomePage"
```

---

### Task 11: 前端 — 添加 CSS 样式

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/regions/dsh.css` (添加下载设置面板样式)

**Interfaces:**
- Consumes: 项目 design system tokens

- [ ] **Step 1: 添加下载设置面板 CSS**

```css
/* 下载设置模态框 */
.adl-download-settings {
  max-width: 480px;
  width: 100%;
}

/* 源选择列表 */
.adl-download-settings__sources {
  display: grid;
  gap: var(--space-2);
}

.adl-download-settings__source {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: var(--transition-colors), var(--transition-shadow);
}

.adl-download-settings__source:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow);
}

.adl-download-settings__source.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.adl-download-settings__source input[type='radio'] {
  accent-color: var(--accent);
}

/* 代理配置区域 */
.adl-download-settings__proxy {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-subtle);
}

/* 欢迎页下载源状态卡片 */
.adl-app-welcome__source-status {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.adl-app-welcome__source-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.adl-app-welcome__source-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: var(--text-xs);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: var(--transition-colors);
  align-self: flex-end;
}

.adl-app-welcome__source-settings-btn:hover {
  background: var(--accent-soft);
}

.adl-app-welcome__source-settings-btn .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
```

- [ ] **Step 2: 验证 CSS 无语法错误**

在浏览器中打开应用，检查 Console 无 CSS 解析错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/styles/regions/dsh.css
git commit -m "feat(dsh): add download settings CSS styles"
```

---

### Task 12: 端到端验证

**Files:**
- 无新增文件，验证所有修改

**Interfaces:**
- 无新增接口

- [ ] **Step 1: Rust 编译验证**

Run: `cargo check --workspace` (在 `ai-digital-life/` 目录下)
Expected: 全部 crate 编译通过，无错误

- [ ] **Step 2: TypeScript 编译验证**

Run: `npx tsc --noEmit` (在 `ai-digital-life/frontend/` 目录下)
Expected: 编译通过，无类型错误

- [ ] **Step 3: 手动功能测试**

启动应用，验证：
1. 欢迎页显示下载源状态卡片（内置版本、系统 dsh、镜像源）
2. 点击设置按钮打开下载设置模态框
3. 可以切换下载源（npmjs/npmmirror/自定义）
4. 可以配置代理设置
5. 测试连接按钮正常工作
6. 保存设置后状态更新
7. 点击"打开 DeepSeek Harness"使用回退链逻辑

- [ ] **Step 4: 提交最终验证**

```bash
git add -A
git commit -m "chore: verify workspace compiles after dsh network features"
```
