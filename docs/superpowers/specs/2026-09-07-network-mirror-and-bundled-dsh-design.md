# 网络镜像配置 + 内置 dsh 设计规格

> **日期：** 2026-09-07
> **状态：** 草案
> **范围：** 网络下载源管理、内置 dsh 包、共存检测、欢迎页设置 UI

---

## 1. 问题陈述

### 1.1 当前问题

1. **dsh 启动依赖网络：** 当前通过 `npx @deepseek-ai/dsh@<version> --profile web --no-open` 启动，需要 npm 仓库访问权限。用户无网络或未配置代理时启动失败。
2. **无镜像源配置：** 硬编码 `registry.npmjs.org`，中国大陆用户下载速度极慢或无法访问。
3. **无内置 dsh：** 用户首次使用必须下载，离线环境完全不可用。
4. **无共存逻辑：** 不检测系统已安装的 dsh 或正在运行的进程，可能导致端口冲突或重复启动。

### 1.2 目标用户场景

| 场景 | 当前行为 | 期望行为 |
|------|----------|----------|
| 无网络/未开代理 | 启动失败 | 使用内置 dsh 正常启动 |
| 中国大陆用户 | npm 下载极慢 | 使用 npmmirror 加速 |
| 系统已安装 dsh | 忽略，重新下载 | 检测并复用 |
| dsh 已在运行 | 尝试重新启动，端口冲突 | 检测并复用现有进程 |
| 有代理但未配置 | 无法使用代理 | 配置文件支持代理设置 |

---

## 2. 架构设计

### 2.1 新增子系统

```
┌─────────────────────────────────────────────────────────┐
│                    AI Digital Life                       │
├─────────────────────────────────────────────────────────┤
│  Frontend (React)                                       │
│  ├── WelcomePage.tsx  ← 新增下载设置面板                │
│  └── dshSlice.ts      ← 新增 sourceStatus 状态          │
├─────────────────────────────────────────────────────────┤
│  Tauri Bridge                                           │
│  └── tauri-dsh.ts     ← 新增 downloadSource 相关方法    │
├─────────────────────────────────────────────────────────┤
│  Rust Server (adl-server)                               │
│  ├── handlers/dsh.rs  ← 修改启动逻辑（回退链）          │
│  ├── crates/download-source/  ← 新建：下载源管理        │
│  ├── crates/dsh-bundle/       ← 新建：内置 dsh 管理     │
│  └── crates/dsh-version/      ← 修改：系统 dsh 检测     │
├─────────────────────────────────────────────────────────┤
│  FileSystem                                             │
│  ├── <data_dir>/config/download-sources.json  ← 新配置  │
│  ├── <data_dir>/dsh-bundle/                   ← 内置包  │
│  └── <data_dir>/dsh-versions/                 ← 已有    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 启动回退链

```
用户点击 "打开 DeepSeek Harness"
  │
  ├─ ① 端口 3080 有 dsh 运行？
  │   └─ 是 → 复用，返回 URL
  │
  ├─ ② 系统 PATH 找到 dsh 命令？
  │   └─ 是 → 启动系统 dsh 二进制
  │
  ├─ ③ 内置 dsh 可用？
  │   └─ 是 → 启动内置 node + bin.js（离线可用）
  │
  ├─ ④ 本地 npm 缓存有 dsh？
  │   └─ 是 → 启动 npx（使用缓存）
  │
  └─ ⑤ 回退：从配置的镜像下载
      └─ 读取 download-sources.json → 设置代理 → npx 下载
```

---

## 3. 子系统详细设计

### 3.1 下载源配置 (`crates/download-source/`)

#### 配置文件

**位置：** `<data_dir>/config/download-sources.json`

```json
{
  "version": 1,
  "npm_registry": "https://registry.npmjs.org",
  "dsh_mirror": null,
  "proxy": {
    "mode": "auto",
    "http_proxy": null,
    "https_proxy": null,
    "no_proxy": null
  },
  "prefer_offline": true
}
```

#### 字段说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `version` | number | `1` | 配置版本号，便于未来迁移 |
| `npm_registry` | string | `"https://registry.npmjs.org"` | 默认 npm 仓库地址 |
| `dsh_mirror` | string \| null | `null` | dsh 专用镜像 URL（如 `https://registry.npmmirror.com`） |
| `proxy.mode` | `"auto"` \| `"manual"` \| `"none"` | `"auto"` | 代理模式 |
| `proxy.http_proxy` | string \| null | `null` | HTTP 代理地址（手动模式） |
| `proxy.https_proxy` | string \| null | `null` | HTTPS 代理地址（手动模式） |
| `proxy.no_proxy` | string \| null | `null` | 不代理的地址列表 |
| `prefer_offline` | boolean | `true` | 优先使用本地缓存 |

#### 预设镜像源

| 名称 | URL | 适用地区 |
|------|-----|----------|
| npmjs (官方) | `https://registry.npmjs.org` | 全球 |
| npmmirror | `https://registry.npmmirror.com` | 中国大陆 |
| 自定义 | 用户输入 | 用户指定 |

#### Rust API

```rust
// crates/download-source/src/lib.rs

pub struct DownloadSourceConfig {
    pub version: u32,
    pub npm_registry: String,
    pub dsh_mirror: Option<String>,
    pub proxy: ProxyConfig,
    pub prefer_offline: bool,
}

pub struct ProxyConfig {
    pub mode: ProxyMode,
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
}

pub enum ProxyMode {
    Auto,    // 使用系统代理（已有 system-proxy feature）
    Manual,  // 使用配置的代理地址
    None,    // 不使用代理
}

/// 读取下载源配置
pub fn load(data_dir: &Path) -> Result<DownloadSourceConfig, AppError>

/// 保存下载源配置
pub fn save(data_dir: &Path, config: &DownloadSourceConfig) -> Result<(), AppError>

/// 解析实际使用的 npm 仓库地址（考虑镜像）
pub fn resolve_registry(config: &DownloadSourceConfig) -> String

/// 构建 reqwest Client（应用代理配置）
pub fn build_http_client(config: &DownloadSourceConfig) -> Result<reqwest::Client, AppError>

/// 测试指定源的连通性
pub async fn test_source(url: &str, timeout: Duration) -> Result<SourceStatus, AppError>
```

#### 连通性测试

```rust
pub struct SourceStatus {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}
```

测试方法：向目标 URL 发送 `GET /` 请求，检查 HTTP 200 响应。

### 3.2 内置 dsh 管理 (`crates/dsh-bundle/`)

#### 目录结构

```
<data_dir>/dsh-bundle/
├── version.txt                    # 内置版本号（如 "0.1.2"）
├── package/                       # 预下载的 dsh 包
│   ├── package.json
│   ├── lib/
│   │   └── bin.js                 # dsh 入口文件
│   └── node_modules/              # 依赖
└── manifest.json                  # 包元数据
```

#### manifest.json

```json
{
  "version": "0.1.2",
  "bundled_at": "2026-09-07T00:00:00Z",
  "npm_registry": "https://registry.npmmirror.com",
  "package_hash": "sha256:..."
}
```

#### Rust API

```rust
// crates/dsh-bundle/src/lib.rs

pub struct BundledDsh {
    pub version: String,
    pub path: PathBuf,
    pub manifest: BundleManifest,
}

/// 检查是否有内置 dsh
pub fn detect(data_dir: &Path) -> Result<Option<BundledDsh>, AppError>

/// 获取内置版本号
pub fn bundled_version(data_dir: &Path) -> Result<Option<String>, AppError>

/// 获取内置 dsh 的启动命令和参数
pub fn launch_command(bundled: &BundledDsh) -> (String, Vec<String>)
// 返回: ("node", ["<path>/package/lib/bin.js", "--profile", "web", "--no-open"])

/// 安装/更新内置 dsh（从 npm 下载并解压）
pub async fn install(
    data_dir: &Path,
    version: &str,
    source_config: &DownloadSourceConfig,
    progress: impl Fn(InstallProgress),
) -> Result<BundledDsh, AppError>

pub struct InstallProgress {
    pub stage: InstallStage,
    pub percent: Option<f32>,
    pub message: String,
}

pub enum InstallStage {
    Downloading,
    Extracting,
    Installing,
    Complete,
}
```

### 3.3 dsh 共存与检测（扩展 `crates/dsh-version/`）

#### 系统 dsh 检测

```rust
// crates/dsh-version/src/lib.rs 新增

pub struct SystemDshInfo {
    pub path: PathBuf,           // dsh 可执行文件路径
    pub version: Option<String>, // 版本号（如能获取）
    pub is_running: bool,        // 是否正在运行
    pub pid: Option<u32>,        // 进程 ID（如正在运行）
}

/// 扫描系统 PATH 中的 dsh 命令
pub fn detect_system_dsh() -> Option<SystemDshInfo>

/// 检查端口 3080 是否有 dsh 运行
pub fn detect_running_dsh() -> Option<RunningDshInfo>

/// 智能选择 dsh 启动源
pub fn select_dsh_source(
    data_dir: &Path,
    bundled: Option<&BundledDsh>,
) -> DshSource

pub enum DshSource {
    /// 复用已运行的 dsh
    ReuseRunning { url: String, port: u16 },
    /// 使用系统安装的 dsh
    System { info: SystemDshInfo },
    /// 使用内置 dsh
    Bundled { bundled: BundledDsh },
    /// 需要通过 npx 下载
    Download { version: Option<String> },
}
```

#### 检测逻辑

```rust
pub fn select_dsh_source(data_dir: &Path, bundled: Option<&BundledDsh>) -> DshSource {
    // 1. 检查端口 3080 是否有 dsh 运行
    if let Some(running) = detect_running_dsh() {
        return DshSource::ReuseRunning {
            url: running.url,
            port: running.port,
        };
    }

    // 2. 检查系统 PATH 中的 dsh
    if let Some(system) = detect_system_dsh() {
        return DshSource::System { info: system };
    }

    // 3. 检查内置 dsh
    if let Some(b) = bundled {
        return DshSource::Bundled { bundled: b.clone() };
    }

    // 4. 回退到 npx 下载
    let selected = read_selected(data_dir).ok().flatten();
    DshSource::Download { version: selected }
}
```

### 3.4 启动逻辑修改 (`crates/server/src/handlers/dsh.rs`)

当前 `run_open` 函数修改为使用回退链：

```rust
async fn run_open(...) -> Result<serde_json::Value, AppError> {
    // 1. 快速路径：已运行 → 返回 URL
    if let Some(ref proc) = *dsh_state.lock().await {
        return Ok(json!({ "url": proc.url }));
    }

    // 2. 获取配置
    let source_config = download_source::load(&root)?;
    let bundled = dsh_bundle::detect(&root)?;

    // 3. 智能选择启动源
    let dsh_source = dsh_version::select_dsh_source(&root, bundled.as_ref());

    match dsh_source {
        DshSource::ReuseRunning { url, .. } => {
            return Ok(json!({ "url": url, "source": "reuse" }));
        }
        DshSource::System { info } => {
            let hp = spawn_and_wait_ready(
                &info.path.to_string_lossy(),
                &["--profile", "web", "--no-open"],
                Duration::from_secs(30),
            ).await?;
            // 存储并返回
        }
        DshSource::Bundled { bundled } => {
            let (program, args) = dsh_bundle::launch_command(&bundled);
            let hp = spawn_and_wait_ready(&program, &args, Duration::from_secs(30)).await?;
            // 存储并返回
        }
        DshSource::Download { version } => {
            // 原有 npx 逻辑，但应用镜像配置
            let registry = download_source::resolve_registry(&source_config);
            let package_spec = match version {
                Some(v) => format!("@deepseek-ai/dsh@{v}"),
                None => "@deepseek-ai/dsh@latest".to_string(),
            };
            let mut args = vec![package_spec, "--profile".into(), "web".into(), "--no-open".into()];
            // 如果配置了镜像，添加 --registry 参数
            if registry != "https://registry.npmjs.org" {
                args.push("--registry".into());
                args.push(registry);
            }
            let hp = spawn_and_wait_ready("npx", &args, Duration::from_secs(60)).await?;
            // 存储并返回
        }
    }
}
```

---

## 4. 前端 UI 设计

### 4.1 欢迎页设置入口

在 `WelcomePage.tsx` 的 topbar 区域（现有版本选择下拉菜单旁边）添加设置按钮：

```
┌─────────────────────────────────────────────────────┐
│  [DeepSeek 图标]  DeepSeek Harness                  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [齿轮图标]  版本: 0.1.2  [下拉箭头]        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│         [ 打开 DeepSeek Harness ]                   │
│                                                     │
│  ┌─ 下载源状态 ─────────────────────────────────┐  │
│  │  ● 内置版本: v0.1.2 (离线可用)               │  │
│  │  ● 系统 dsh: 未检测到                        │  │
│  │  ● 镜像源: npmmirror (已连接)                │  │
│  │  [设置...]                                   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 4.2 下载设置面板

点击设置按钮后弹出面板（使用现有 `.modal` 样式）：

```
┌─ 下载设置 ──────────────────────────────────────────┐
│                                                     │
│  下载源                                              │
│  ┌─────────────────────────────────────────────┐   │
│  │  ○ npmjs (官方)        ● 已连接 120ms       │   │
│  │  ○ npmmirror (中国)    ● 已连接 45ms        │   │
│  │  ○ 自定义                                    │   │
│  │    ┌───────────────────────────────────┐    │   │
│  │    │ https://custom-registry.example   │    │   │
│  │    └───────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  代理设置                                            │
│  ┌─────────────────────────────────────────────┐   │
│  │  模式: [自动检测 ▾]                          │   │
│  │                                              │   │
│  │  ── 手动设置（仅手动模式显示）──              │   │
│  │  HTTP 代理: [________________]               │   │
│  │  HTTPS 代理: [________________]              │   │
│  │  不代理: [________________]                  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [测试连接]                           [保存] [取消] │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 4.3 组件结构

```
DownloadSettingsModal (新建)
├── SourceSelector          # 下载源选择器
│   ├── SourceOption        # 单个源选项（带状态指示器）
│   └── CustomSourceInput   # 自定义源输入框
├── ProxyConfig             # 代理配置
│   ├── ProxyModeSelect     # 代理模式下拉
│   └── ProxyFields         # 代理地址输入（条件渲染）
├── TestConnectionButton    # 测试连接按钮
└── Actions                 # 保存/取消按钮
```

### 4.4 i18n 键

**en-US:**
```typescript
export const dshEn = {
  // ... 现有键
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
  dshSettingsTestSuccess: 'Connection successful ({latency}ms)',
  dshSettingsTestFailed: 'Connection failed: {error}',
  dshSettingsTestTesting: 'Testing...',
  dshSettingsSave: 'Save',
  dshSettingsCancel: 'Cancel',
  dshStatusBundled: 'Bundled: v{version} (Offline available)',
  dshStatusBundledNone: 'Bundled: Not available',
  dshStatusSystem: 'System dsh: v{version}',
  dshStatusSystemNone: 'System dsh: Not detected',
  dshStatusMirror: 'Mirror: {name} (Connected)',
  dshStatusMirrorNone: 'Mirror: Not configured',
  dshStatusRunning: 'Running: port {port}',
} as const;
```

**zh-CN:**
```typescript
export const dshZh = {
  // ... 现有键
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
  dshSettingsTestSuccess: '连接成功（{latency}ms）',
  dshSettingsTestFailed: '连接失败：{error}',
  dshSettingsTestTesting: '测试中...',
  dshSettingsSave: '保存',
  dshSettingsCancel: '取消',
  dshStatusBundled: '内置版本：v{version}（离线可用）',
  dshStatusBundledNone: '内置版本：不可用',
  dshStatusSystem: '系统 dsh：v{version}',
  dshStatusSystemNone: '系统 dsh：未检测到',
  dshStatusMirror: '镜像源：{name}（已连接）',
  dshStatusMirrorNone: '镜像源：未配置',
  dshStatusRunning: '运行中：端口 {port}',
} as const;
```

### 4.5 CSS 样式

使用项目现有设计系统，新增样式追加到 `dsh.css`：

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

/* 状态指示器 */
.adl-download-settings__status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.adl-download-settings__status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--text-muted);
}

.adl-download-settings__status-dot.is-connected {
  background: var(--success);
}

.adl-download-settings__status-dot.is-error {
  background: var(--danger);
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
}

.adl-app-welcome__source-settings-btn:hover {
  background: var(--accent-soft);
}
```

---

## 5. 数据流

### 5.1 配置读写流程

```
Frontend                    Tauri Bridge              Rust Server              FileSystem
   │                            │                         │                       │
   │── GET /dsh/source-status ──│── load_config() ────────│── read JSON ──────────│
   │←── { bundled, system, mirror, running } ────────────│←──────────────────────│
   │                            │                         │                       │
   │── POST /dsh/source-config ─│── save_config() ────────│── write JSON ─────────│
   │   { registry, proxy }      │                         │                       │
   │←── 200 OK ────────────────│←────────────────────────│←──────────────────────│
   │                            │                         │                       │
   │── POST /dsh/test-source ───│── test_source() ────────│── HTTP GET ───────────│
   │   { url }                  │                         │                       │
   │←── { reachable, latency } ─│←────────────────────────│←──────────────────────│
```

### 5.2 dsh 启动流程

```
Frontend                    Tauri Bridge              Rust Server              System/Network
   │                            │                         │                       │
   │── POST /dsh/open ─────────│── run_open() ───────────│                       │
   │                            │                         │── detect_running() ──│
   │                            │                         │←── running? ─────────│
   │                            │                         │── detect_system() ───│
   │                            │                         │←── system dsh? ──────│
   │                            │                         │── detect_bundled() ──│
   │                            │                         │←── bundled? ─────────│
   │                            │                         │── select_source() ───│
   │                            │                         │                       │
   │                            │                         │── spawn/process ─────│
   │                            │                         │←── HostedProcess ────│
   │←── { url, source } ───────│←────────────────────────│                       │
```

---

## 6. 错误处理

| 错误场景 | 处理方式 | 用户提示 |
|----------|----------|----------|
| 所有源均不可达 | 返回错误，建议检查网络 | "无法连接到任何下载源，请检查网络设置" |
| 内置 dsh 损坏 | 回退到 npx 下载 | "内置版本损坏，正在尝试在线下载..." |
| 系统 dsh 版本过旧 | 使用系统版本，显示警告 | "检测到系统 dsh 版本较旧，建议更新" |
| 端口 3080 被占用（非 dsh） | 尝试其他端口 | "端口 3080 被占用，正在尝试其他端口..." |
| npx 未安装 | 仅使用内置版本 | "未检测到 npm，将使用内置版本" |
| 代理连接失败 | 回退到直连 | "代理连接失败，尝试直连..." |

---

## 7. 测试策略

### 7.1 单元测试

- `download-source` crate：配置读写、源解析、代理配置构建
- `dsh-bundle` crate：版本检测、路径验证、启动命令构建
- `dsh-version` 扩展：系统 dsh 检测、运行进程检测、智能选择逻辑

### 7.2 集成测试

- 完整启动流程：mock npx、mock 系统 dsh、mock 运行进程
- 配置持久化：写入 → 重启 → 读取验证
- 镜像切换：切换源后验证下载使用新源

### 7.3 手动测试

| 测试场景 | 操作 | 预期结果 |
|----------|------|----------|
| 离线模式 | 断网，点击打开 dsh | 内置版本正常启动 |
| 镜像加速 | 配置 npmmirror，打开 dsh | 从镜像下载，速度更快 |
| 系统共存 | 系统安装 dsh，打开应用 | 自动检测并使用系统版本 |
| 运行复用 | 手动启动 dsh，打开应用 | 复用已运行的进程 |
| 代理配置 | 配置代理，测试连接 | 显示连接成功/失败 |
| 配置文件编辑 | 直接编辑 JSON 文件 | 应用热重载生效 |

---

## 8. 文件清单

### 8.1 新建文件

| 文件 | 用途 |
|------|------|
| `crates/download-source/Cargo.toml` | 下载源 crate 配置 |
| `crates/download-source/src/lib.rs` | 下载源管理核心逻辑 |
| `crates/dsh-bundle/Cargo.toml` | 内置 dsh crate 配置 |
| `crates/dsh-bundle/src/lib.rs` | 内置 dsh 管理核心逻辑 |
| `frontend/src/app/features/dsh/DownloadSettingsModal.tsx` | 下载设置模态框组件 |
| `frontend/src/app/features/dsh/SourceStatusCard.tsx` | 下载源状态卡片组件 |

### 8.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `crates/dsh-version/src/lib.rs` | 添加系统 dsh 检测、运行进程检测、智能选择 |
| `crates/server/src/handlers/dsh.rs` | 更新启动逻辑（回退链） |
| `crates/server/src/state.rs` | 添加 download-source 和 dsh-bundle 依赖 |
| `crates/webapp-host/src/lib.rs` | 支持直接 node.js 启动（不仅是 npx） |
| `frontend/src/app/features/dsh/WelcomePage.tsx` | 添加设置入口和状态卡片 |
| `frontend/src/app/stores/slices/dshSlice.ts` | 添加 sourceStatus 状态 |
| `frontend/src/app/stores/actions/dshActions.ts` | 添加下载源相关 actions |
| `frontend/src/shared/ipc/dsh.ts` | 添加 DshBridge 下载源方法 |
| `frontend/src/tauri-bridge/tauri-dsh.ts` | 实现 Tauri 桥接 |
| `frontend/src/httpBridge.ts` | 添加 HTTP 路由映射 |
| `frontend/src/app/i18n/en-US/dsh.ts` | 添加英文 i18n 键 |
| `frontend/src/app/i18n/zh-CN/dsh.ts` | 添加中文 i18n 键 |
| `frontend/src/styles/regions/dsh.css` | 添加下载设置面板样式 |
| `Cargo.toml` (workspace) | 添加新 crate 成员 |
| `crates/server/Cargo.toml` | 添加新 crate 依赖 |

---

## 9. 实现顺序

1. **Phase 1：下载源配置 crate** — 基础设施，无 UI 依赖
2. **Phase 2：内置 dsh 管理 crate** — 依赖 Phase 1 的配置读取
3. **Phase 3：系统 dsh 检测** — 扩展现有 dsh-version crate
4. **Phase 4：启动逻辑重构** — 集成回退链，替换原有 npx 直接调用
5. **Phase 5：前端 UI** — 设置面板、状态卡片、i18n
6. **Phase 6：测试与文档** — 单元测试、集成测试、用户文档

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 内置 dsh 包体积过大 | 安装包膨胀 | 按需下载内置版本，不随安装包分发 |
| npx 版本兼容性 | 不同 Node.js 版本行为差异 | 锁定 npx 参数格式，添加版本检测 |
| 镜像源同步延迟 | 用户获取旧版本 | 优先使用官方源，镜像作为加速选项 |
| 配置文件损坏 | 应用无法读取配置 | 提供默认值回退，配置文件验证 |
| 系统 dsh 检测误判 | 启动错误的 dsh 版本 | 验证版本号，提供手动切换选项 |
