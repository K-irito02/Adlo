use std::path::Path;
use std::time::Duration;

use adl_errors::AppError;
use serde::{Deserialize, Serialize};

const DEFAULT_VERSION: u32 = 1;
const DEFAULT_NPM_REGISTRY: &str = "https://registry.npmjs.org";
const DEFAULT_PREFER_OFFLINE: bool = true;
const CONFIG_FILE_NAME: &str = "download-sources.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadSourceConfig {
    pub version: u32,
    pub npm_registry: String,
    pub dsh_mirror: Option<String>,
    pub proxy: ProxyConfig,
    pub prefer_offline: bool,
    /// 下载源选择模式：auto=自动检测（延迟实测选优，前端负责解析写回 registry）；
    /// manual=用户手选（npm_registry 即所选值）。
    pub source_mode: SourceMode,
    /// 版本来源偏好：auto=自动检测，system=只用系统安装，host=只用宿主托管。
    pub version_source: VersionSourceMode,
    /// OpenCode 的版本来源偏好（DSH 仍用 `version_source`；两者互不影响）。
    pub opencode_version_source: VersionSourceMode,
    /// 是否把宿主托管的 OpenCode bin 目录注入新终端会话的 PATH（默认开）。
    pub opencode_terminal_injection: bool,
}

impl Default for DownloadSourceConfig {
    fn default() -> Self {
        Self {
            version: DEFAULT_VERSION,
            npm_registry: DEFAULT_NPM_REGISTRY.to_string(),
            dsh_mirror: None,
            proxy: ProxyConfig::default(),
            prefer_offline: DEFAULT_PREFER_OFFLINE,
            source_mode: SourceMode::Auto,
            version_source: VersionSourceMode::Auto,
            opencode_version_source: VersionSourceMode::Auto,
            opencode_terminal_injection: true,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum VersionSourceMode {
    #[default]
    Auto,
    System,
    Host,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SourceMode {
    #[default]
    Auto,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub mode: ProxyMode,
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self { mode: ProxyMode::Auto, http_proxy: None, https_proxy: None, no_proxy: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProxyMode {
    Auto,
    Manual,
    None,
}

/// 探针失败分类：前端按此映射本地化文案，不直接展示底层错误串。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceErrorKind {
    /// 代理端点本身不可达（端口没监听/被拒）：与下载源无关，改代理即可恢复。
    ProxyUnreachable,
    /// 目标源不可达（DNS/连接/超时），且无代理可归因（直连）。
    Network,
    /// 目标源返回非 2xx/3xx。
    Http,
    /// 其它（HTTP 客户端构建失败等）。
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStatus {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    /// 底层错误细节（日志/诊断用；界面展示走 `error_kind` 的本地化文案）。
    pub error: Option<String>,
    /// 失败分类；可达时为 None。
    pub error_kind: Option<SourceErrorKind>,
    /// 本次探测实际使用的代理端点（已脱敏）；直连为 None。
    pub proxy: Option<String>,
    /// 目标返回的 HTTP 状态码（仅 `Http` 类失败）。
    pub http_status: Option<u16>,
}

fn config_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("config").join(CONFIG_FILE_NAME)
}

pub fn load(data_dir: &Path) -> Result<DownloadSourceConfig, AppError> {
    let path = config_path(data_dir);
    if !path.exists() {
        return Ok(DownloadSourceConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("Failed to read config file {}: {e}", path.display())))?;
    let config: DownloadSourceConfig = serde_json::from_str(&content)
        .map_err(|e| AppError::Config(format!("Failed to parse config file: {e}")))?;
    Ok(config)
}

pub fn save(data_dir: &Path, config: &DownloadSourceConfig) -> Result<(), AppError> {
    let path = config_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("Failed to create config dir: {e}")))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::Internal(format!("Failed to serialize config: {e}")))?;
    std::fs::write(&path, content)
        .map_err(|e| AppError::Io(format!("Failed to write config file: {e}")))?;
    Ok(())
}

pub fn resolve_registry(config: &DownloadSourceConfig) -> &str {
    match &config.dsh_mirror {
        Some(mirror) => mirror,
        None => &config.npm_registry,
    }
}

/// 脱敏代理地址：只保留 `scheme://host:port`，`@` 之前的 userinfo 一律剥离
/// （凭据永不进日志）。无法解析时返回占位，避免原文（可能含密钥）外泄。
fn redact_proxy_endpoint(raw: &str) -> String {
    let Some(scheme_end) = raw.find("://") else {
        return "<unparseable>".to_string();
    };
    let (scheme, rest) = raw.split_at(scheme_end);
    let rest = &rest[3..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    if host_port.is_empty() {
        return "<unparseable>".to_string();
    }
    format!("{scheme}://{host_port}")
}

fn redact_proxy_endpoint_opt(raw: &Option<String>) -> String {
    match raw {
        Some(url) if !url.trim().is_empty() => redact_proxy_endpoint(url.trim()),
        _ => "<unset>".to_string(),
    }
}

pub async fn build_http_client(config: &DownloadSourceConfig) -> Result<reqwest::Client, AppError> {
    build_http_client_with_timeout(config, Duration::from_secs(30)).await
}

/// Same as [`build_http_client`] with an explicit request timeout. Callers that
/// must never stall a polling endpoint (e.g. `/env/status` probe) pass a short
/// timeout instead of the 30s transfer-sized default.
///
/// 异步的原因：`ProxyMode::Auto` 下先做代理端点可达性预检（带 5s 缓存），
/// 不可达时静默改走直连（用户要求 2026-10-30：代理软件被关掉时应用应自愈，
/// 而不是让所有下载/查版本整体失败）。
pub async fn build_http_client_with_timeout(
    config: &DownloadSourceConfig,
    timeout: Duration,
) -> Result<reqwest::Client, AppError> {
    let mut builder = reqwest::Client::builder();

    match config.proxy.mode {
        ProxyMode::None => {
            builder = builder.no_proxy();
        },
        ProxyMode::Manual => {
            let http_proxy = config.proxy.http_proxy.clone();
            let https_proxy = config.proxy.https_proxy.clone();
            let no_proxy = config.proxy.no_proxy.clone();

            if no_proxy.is_some() {
                let proxy = reqwest::Proxy::custom(move |url| {
                    let host = url.host_str().unwrap_or("");
                    let skip = no_proxy
                        .as_deref()
                        .map(|np| no_proxy_matches(np, &host.to_ascii_lowercase()))
                        .unwrap_or(false);
                    if skip {
                        None
                    } else if url.scheme() == "https" {
                        https_proxy.clone()
                    } else {
                        http_proxy.clone()
                    }
                });
                builder = builder.proxy(proxy);
            } else {
                if let Some(ref url) = http_proxy {
                    let proxy = reqwest::Proxy::http(url)
                        .map_err(|e| AppError::Config(format!("Invalid http_proxy: {e}")))?;
                    builder = builder.proxy(proxy);
                }
                if let Some(ref url) = https_proxy {
                    let proxy = reqwest::Proxy::https(url)
                        .map_err(|e| AppError::Config(format!("Invalid https_proxy: {e}")))?;
                    builder = builder.proxy(proxy);
                }
            }
        },
        ProxyMode::Auto => {
            // reqwest with system-proxy feature will use system proxy by default.
            // 可观测性：打印脱敏后的有效代理 env + 解析出的端点（env 或 Windows
            // 注册表系统代理）。若 reqwest 不支持该 scheme（如缺 `socks` 特性时的
            // socks5h），请求会直接失败且只留 "error sending request"；凭据永不进日志。
            let resolved = env_proxy_endpoint();
            tracing::info!(
                all_proxy = %redact_proxy_endpoint_opt(&env_raw("ALL_PROXY")),
                https_proxy = %redact_proxy_endpoint_opt(&env_raw("HTTPS_PROXY")),
                http_proxy = %redact_proxy_endpoint_opt(&env_raw("HTTP_PROXY")),
                resolved = %redact_proxy_endpoint_opt(&resolved),
                "download-source: building HTTP client with system proxy",
            );
            // 自动检测 = 跟随系统；但代理软件被关掉后环境变量仍残留（用户实测
            // 2026-10-30：ALL_PROXY 指向已停止监听的本地端口）→ 静默改走直连，
            // 避免「下载源/版本目录/环境检测」整体不可用。手动模式不做回退：
            // 用户显式填的代理失败时应当报错，而不是偷偷绕过。
            if let Some(endpoint) = resolved {
                if !proxy_endpoint_reachable_cached(&endpoint).await {
                    tracing::info!(
                        proxy = %redact_proxy_endpoint(&endpoint),
                        "download-source: auto proxy unreachable; falling back to direct connection",
                    );
                    builder = builder.no_proxy();
                }
            }
        },
    }

    builder
        .timeout(timeout)
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {e}")))
}

/// NO_PROXY/直连名单匹配：`*` 全匹配；条目支持精确 host 与 `.suffix` 子域后缀。
/// 分隔符兼容历史逗号与设置面板的「每行一个」（换行）写法。
fn no_proxy_matches(no_proxy: &str, host: &str) -> bool {
    no_proxy.split([',', '\n', '\r']).map(str::trim).filter(|entry| !entry.is_empty()).any(
        |entry| {
            if entry == "*" {
                return true;
            }
            let entry = entry.trim_start_matches('.').to_ascii_lowercase();
            host == entry || host.ends_with(&format!(".{entry}"))
        },
    )
}

/// 导出给外部子进程（npm 等）的 `NO_PROXY`：统一为逗号分隔。
///
/// 设置面板把直连名单保存为换行分隔；npm 的 `proxy-from-env` 只按逗号切分，
/// 直接透传换行值会被当成一个条目而整体失效。所有「导出给外部工具」的消费端
/// 都必须复用本函数，避免再次出现两套分隔符。
pub fn no_proxy_env_value(raw: &str) -> String {
    raw.split([',', '\n', '\r'])
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>()
        .join(",")
}

/// 读取环境变量并去掉首尾空白；空串按「未设置」处理（与 hyper-util 的 `is_empty()` 口径一致）。
fn env_trimmed(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .or_else(|| std::env::var(name.to_ascii_lowercase()).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// 读取环境变量原值（不去空白）：只有「缺失或空串」才算未设置，与 hyper-util
/// `get_first_env(...).is_empty()` 的判定一致；纯空白值仍算「已设置但不可解析」。
fn env_raw(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .or_else(|| std::env::var(name.to_ascii_lowercase()).ok())
        .filter(|value| !value.is_empty())
}

/// 把代理地址规范成可解析的 URL：无 scheme 时按 `http://` 处理（与 hyper-util 一致），
/// 并校验 scheme/host，供探测、脱敏与展示共用。
fn normalize_proxy_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate =
        if trimmed.contains("://") { trimmed.to_string() } else { format!("http://{trimmed}") };
    let parsed = reqwest::Url::parse(&candidate).ok()?;
    parsed.host_str()?;
    match parsed.scheme() {
        "http" | "https" | "socks4" | "socks4a" | "socks5" | "socks5h" => Some(candidate),
        _ => None,
    }
}

/// Windows 系统代理（HKCU Internet Settings）：与 hyper-util `win::with_system` 同源。
///
/// 返回 `(ProxyServer 原值, ProxyOverride 原值)`；`ProxyEnable=0` 视为未启用。
/// hyper-util 不解析 `http=...;https=...` 的映射写法，这里同样原样返回，保证
/// 「健康检查看到的代理」就是「真实请求使用的代理」。
#[cfg(windows)]
fn windows_proxy_settings() -> Option<(String, Option<String>)> {
    let settings = windows_registry::CURRENT_USER
        .open("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    if settings.get_u32("ProxyEnable").unwrap_or(0) == 0 {
        return None;
    }
    let server = settings.get_string("ProxyServer").ok()?;
    if server.trim().is_empty() {
        return None;
    }
    let override_list = settings.get_string("ProxyOverride").ok();
    Some((server, override_list))
}

#[cfg(not(windows))]
fn windows_proxy_settings() -> Option<(String, Option<String>)> {
    None
}

/// 注册表 `ProxyOverride` → NO_PROXY 口径（`;` 分隔、去掉 `*.`，与 hyper-util 一致）。
fn proxy_override_to_no_proxy(raw: &str) -> String {
    raw.split(';')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>()
        .join(",")
        .replace("*.", "")
}

/// Auto 模式下的直连名单：env `NO_PROXY` 非空优先，否则用注册表 `ProxyOverride`。
fn auto_no_proxy() -> String {
    env_trimmed("NO_PROXY").unwrap_or_else(|| {
        windows_proxy_settings()
            .and_then(|(_, override_list)| override_list)
            .map(|raw| proxy_override_to_no_proxy(&raw))
            .unwrap_or_default()
    })
}

/// Auto 模式的代理选择（纯函数，便于注入 env/注册表做单测）。
///
/// 逐条对齐 hyper-util `Builder::from_system().build()`：
/// - scheme 专用 env（非空即占位，即使无法解析）→ 该值，解析失败才回退 `ALL_PROXY`；
/// - scheme 专用 env 为空 → 注册表 `ProxyServer` → `ALL_PROXY`；
/// - 无前缀地址按 `http://` 规范化。
fn auto_proxy_for_scheme(
    get: &impl Fn(&str) -> Option<String>,
    registry: Option<&str>,
    is_https: bool,
) -> Option<String> {
    let all = || get("ALL_PROXY").and_then(|raw| normalize_proxy_url(&raw));
    let specific = if is_https { "HTTPS_PROXY" } else { "HTTP_PROXY" };
    match get(specific) {
        Some(raw) => normalize_proxy_url(&raw).or_else(all),
        None => registry.and_then(normalize_proxy_url).or_else(all),
    }
}

fn env_proxy_for_scheme(is_https: bool) -> Option<String> {
    let registry = windows_proxy_settings().map(|(server, _)| server);
    auto_proxy_for_scheme(&env_raw, registry.as_deref(), is_https)
}

/// 本次请求实际会走的代理端点（已规范化；可能含凭据，对外展示前必须脱敏）。
///
/// Auto 与 reqwest `system-proxy` 同源：env（scheme 专用 → ALL_PROXY）+ Windows
/// 注册表系统代理，并遵守 env/注册表的直连名单；Manual 只认配置里的同 scheme 字段。
fn resolve_proxy_url(config: &DownloadSourceConfig, url: &str) -> Option<String> {
    let target = reqwest::Url::parse(url).ok()?;
    let host = target.host_str()?.to_ascii_lowercase();
    let is_https = target.scheme() == "https";

    match config.proxy.mode {
        ProxyMode::None => None,
        ProxyMode::Manual => {
            if no_proxy_matches(config.proxy.no_proxy.as_deref().unwrap_or(""), &host) {
                return None;
            }
            // 与 `build_http_client` 的 Manual 分支逐字段一致：https 只认 https_proxy，
            // http 只认 http_proxy（不做跨字段回退，否则探针会报真实客户端没用的端点）。
            let raw = if is_https {
                config.proxy.https_proxy.as_deref()
            } else {
                config.proxy.http_proxy.as_deref()
            };
            raw.and_then(normalize_proxy_url)
        },
        ProxyMode::Auto => {
            if no_proxy_matches(&auto_no_proxy(), &host) {
                return None;
            }
            env_proxy_for_scheme(is_https)
        },
    }
}

/// 代理端点 TCP 可达性预检：把「代理没开」与「下载源不通」区分开。
async fn proxy_endpoint_reachable(proxy_url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(proxy_url) else {
        return false;
    };
    let Some(host) = parsed.host_str() else {
        return false;
    };
    // socks* 无默认端口语义，按 SOCKS 惯例 1080。
    let port = parsed.port_or_known_default().unwrap_or(1080);
    matches!(
        tokio::time::timeout(
            Duration::from_millis(1500),
            tokio::net::TcpStream::connect((host, port)),
        )
        .await,
        Ok(Ok(_))
    )
}

/// 代理健康结果缓存：设置面板一次刷新会连续构建多个客户端（目录 + 状态 + 探针），
/// 代理不可达时不能让每次构建都等 1.5s。TTL 5s：用户开关代理软件后很快自愈。
static PROXY_HEALTH_CACHE: std::sync::OnceLock<
    std::sync::Mutex<Option<(String, std::time::Instant, bool)>>,
> = std::sync::OnceLock::new();

fn proxy_health_cache() -> &'static std::sync::Mutex<Option<(String, std::time::Instant, bool)>> {
    PROXY_HEALTH_CACHE.get_or_init(|| std::sync::Mutex::new(None))
}

fn cached_proxy_reachable(endpoint: &str) -> Option<bool> {
    let guard = proxy_health_cache().lock().ok()?;
    let (cached, at, ok) = guard.as_ref()?;
    (cached == endpoint && at.elapsed() < Duration::from_secs(5)).then_some(*ok)
}

fn store_proxy_reachable(endpoint: &str, ok: bool) {
    if let Ok(mut guard) = proxy_health_cache().lock() {
        *guard = Some((endpoint.to_string(), std::time::Instant::now(), ok));
    }
}

/// 清空代理健康缓存：显式刷新代理设置时绕过 5s 冷却，立即重新探测。
pub fn invalidate_proxy_health_cache() {
    if let Ok(mut guard) = proxy_health_cache().lock() {
        *guard = None;
    }
}

/// 带缓存的代理端点可达性（`build_http_client` / 探针 / source-status 共用）。
async fn proxy_endpoint_reachable_cached(endpoint: &str) -> bool {
    if let Some(ok) = cached_proxy_reachable(endpoint) {
        return ok;
    }
    let ok = proxy_endpoint_reachable(endpoint).await;
    store_proxy_reachable(endpoint, ok);
    ok
}

/// `ProxyMode::Auto` 下用于「回退判定」的代理端点。
///
/// 客户端同时服务 http/https；registry/下载流量几乎全是 https，故按 https 口径
/// 取（HTTPS_PROXY → Windows 注册表系统代理 → ALL_PROXY），与 `resolve_proxy_url`
/// 对 https 目标的结果一致。
fn env_proxy_endpoint() -> Option<String> {
    env_proxy_for_scheme(true)
}

/// 代理生效状态（供设置面板显示「背后真实状态」；端点已脱敏）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyHealth {
    /// 实际使用的代理端点；直连为 None。
    pub endpoint: Option<String>,
    /// 自动检测因代理不可达而回退直连（界面据此显示「已自动改为直连」）。
    pub auto_fallback: bool,
}

/// `proxy_health` 的判定目标：用用户配置的下载源（含 scheme / NO_PROXY 语义），
/// 不再硬编码 npmjs；配置值不可解析时退回官方源。
fn health_target(config: &DownloadSourceConfig) -> String {
    let registry = config.npm_registry.trim().trim_end_matches('/');
    if reqwest::Url::parse(registry).is_ok() {
        format!("{registry}/")
    } else {
        "https://registry.npmjs.org/".to_string()
    }
}

/// 计算当前代理的真实生效状态（含自动检测回退判定）。
///
/// `endpoint` 按**目标源**解析（含 scheme / NO_PROXY），用于状态行展示；
/// `auto_fallback` 必须按**全局**端点判定 —— `build_http_client` 是 client 级决策
/// （https 端点不可达即整个 client `no_proxy()`），否则 http 源会显示成「已回退」
/// 而真实请求并没有。
pub async fn proxy_health(config: &DownloadSourceConfig) -> ProxyHealth {
    let target = health_target(config);
    let endpoint = resolve_proxy_url(config, &target);
    let endpoint_label = endpoint.as_deref().map(redact_proxy_endpoint);
    match config.proxy.mode {
        ProxyMode::None => ProxyHealth { endpoint: None, auto_fallback: false },
        ProxyMode::Manual => ProxyHealth { endpoint: endpoint_label, auto_fallback: false },
        ProxyMode::Auto => {
            let global = env_proxy_endpoint();
            // 回退只在「目标确实会走代理」且「全局端点确实不可达」时才成立：
            // 命中 NO_PROXY 的目标本来就直连，也不必为它多付一次端点预检。
            let auto_fallback = match (endpoint.as_deref(), global.as_deref()) {
                (Some(_), Some(global)) => !proxy_endpoint_reachable_cached(global).await,
                _ => false,
            };
            ProxyHealth {
                // 回退提示必须点名真正不可达的那个端点（全局 https 口径），
                // 而不是目标各自解析出的、可能仍然存活的 http 代理。
                endpoint: if auto_fallback {
                    global.as_deref().map(redact_proxy_endpoint)
                } else {
                    endpoint_label
                },
                auto_fallback,
            }
        },
    }
}

/// 探测下载源可达性。
///
/// 必须与真实下载共用同一套代理语义（`build_http_client`），否则「测试连接 /
/// 自动检测」的结论会与真实安装不一致（用户在「无代理」下仍被环境代理拦截）。
/// 失败按 `SourceErrorKind` 分类，界面据此给本地化、可操作的文案。
pub async fn test_source(
    url: &str,
    config: &DownloadSourceConfig,
    timeout: Duration,
) -> SourceStatus {
    let proxy_url = resolve_proxy_url(config, url);
    let mut proxy_label = proxy_url.as_deref().map(redact_proxy_endpoint);

    // 代理端点在、但端口不通（代理软件没开/地址写错）：
    // - 自动模式：客户端是**全局**决策（https 端点不可达 → 整个 client `no_proxy()`），
    //   探针必须镜像同一决策，否则 `proxy` 字段会声称走了代理而真实请求已直连；
    // - 手动模式：直接归因代理，不让用户去怀疑下载源。
    if config.proxy.mode == ProxyMode::Auto {
        if let Some(global) = env_proxy_endpoint() {
            if !proxy_endpoint_reachable_cached(&global).await {
                proxy_label = None;
            }
        }
    } else if let Some(proxy) = proxy_url.as_deref() {
        if !proxy_endpoint_reachable_cached(proxy).await {
            return SourceStatus {
                reachable: false,
                latency_ms: None,
                error: Some(format!(
                    "proxy endpoint unreachable: {}",
                    proxy_label.as_deref().unwrap_or("<unparseable>")
                )),
                error_kind: Some(SourceErrorKind::ProxyUnreachable),
                proxy: proxy_label,
                http_status: None,
            };
        }
    }

    let client = match build_http_client_with_timeout(config, timeout).await {
        Ok(c) => c,
        Err(e) => {
            return SourceStatus {
                reachable: false,
                latency_ms: None,
                error: Some(format!("Failed to build client: {e}")),
                error_kind: Some(SourceErrorKind::Unknown),
                proxy: proxy_label,
                http_status: None,
            };
        },
    };

    let start = std::time::Instant::now();
    match client.head(url).send().await {
        Ok(resp) => {
            let latency = start.elapsed().as_millis() as u64;
            let reachable = resp.status().is_success() || resp.status().is_redirection();
            let status = resp.status().as_u16();
            SourceStatus {
                reachable,
                latency_ms: Some(latency),
                error: if reachable { None } else { Some(format!("HTTP {status}")) },
                error_kind: if reachable { None } else { Some(SourceErrorKind::Http) },
                proxy: proxy_label,
                http_status: if reachable { None } else { Some(status) },
            }
        },
        Err(e) => SourceStatus {
            reachable: false,
            latency_ms: None,
            // 原始错误只进日志（界面用 error_kind 的本地化文案）；避免用户看到英文内部错误。
            error: Some({
                tracing::debug!(url, error = %e, "download-source: probe request failed");
                e.to_string()
            }),
            error_kind: Some(SourceErrorKind::Network),
            proxy: proxy_label,
            http_status: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_expected_values() {
        let config = DownloadSourceConfig::default();
        assert_eq!(config.version, 1);
        assert_eq!(config.npm_registry, "https://registry.npmjs.org");
        assert!(config.dsh_mirror.is_none());
        assert!(config.prefer_offline);
        assert_eq!(config.proxy.mode, ProxyMode::Auto);
        assert_eq!(config.source_mode, SourceMode::Auto);
    }

    /// 缺 source_mode 字段的旧配置文件按 struct 级 serde(default) 落到 Auto。
    #[test]
    fn missing_source_mode_defaults_to_auto() {
        let json = r#"{ "npm_registry": "https://registry.npmmirror.com" }"#;
        let config: DownloadSourceConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.source_mode, SourceMode::Auto);
        assert_eq!(config.npm_registry, "https://registry.npmmirror.com");
    }

    /// source_mode 序列化为 snake_case（auto / manual），与 proxy.mode 同口径。
    #[test]
    fn source_mode_serializes_snake_case() {
        let config = DownloadSourceConfig { source_mode: SourceMode::Manual, ..Default::default() };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains(r#""source_mode":"manual""#));
        let decoded: DownloadSourceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.source_mode, SourceMode::Manual);
    }

    #[test]
    fn version_source_defaults_to_auto_and_serializes_snake_case() {
        let config = DownloadSourceConfig::default();
        assert_eq!(config.version_source, VersionSourceMode::Auto);
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains(r#""version_source":"auto""#));
        let decoded: DownloadSourceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.version_source, VersionSourceMode::Auto);
    }

    #[test]
    fn missing_version_source_defaults_to_auto() {
        let json = r#"{ "npm_registry": "https://registry.npmmirror.com" }"#;
        let config: DownloadSourceConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.version_source, VersionSourceMode::Auto);
    }

    #[test]
    fn resolve_registry_returns_npm_when_no_mirror() {
        let config = DownloadSourceConfig::default();
        assert_eq!(resolve_registry(&config), "https://registry.npmjs.org");
    }

    #[test]
    fn resolve_registry_prefers_mirror() {
        let config = DownloadSourceConfig {
            dsh_mirror: Some("https://mirror.example.com".to_string()),
            ..Default::default()
        };
        assert_eq!(resolve_registry(&config), "https://mirror.example.com");
    }

    /// 代理地址脱敏：userinfo 必须剥离（凭据永不进日志），无 userinfo 时原样保留。
    #[test]
    fn redact_proxy_endpoint_strips_credentials() {
        assert_eq!(redact_proxy_endpoint("socks5h://127.0.0.1:17890"), "socks5h://127.0.0.1:17890");
        assert_eq!(
            redact_proxy_endpoint("http://user:pass@proxy.internal:8080"),
            "http://proxy.internal:8080"
        );
        assert_eq!(redact_proxy_endpoint("https://proxy.example.com"), "https://proxy.example.com");
        assert_eq!(redact_proxy_endpoint("https://h:443/path?q=1"), "https://h:443");
        assert_eq!(redact_proxy_endpoint("not a url"), "<unparseable>");
        assert_eq!(redact_proxy_endpoint("socks5://:1080"), "socks5://:1080");
        assert_eq!(redact_proxy_endpoint_opt(&None), "<unset>");
        assert_eq!(redact_proxy_endpoint_opt(&Some("  ".to_string())), "<unset>");
        assert_eq!(redact_proxy_endpoint_opt(&Some("http://u:p@h:1".to_string())), "http://h:1");
    }

    #[test]
    fn config_roundtrip_serde() {
        let config = DownloadSourceConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let decoded: DownloadSourceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config.npm_registry, decoded.npm_registry);
        assert_eq!(config.proxy.mode, decoded.proxy.mode);
    }

    #[test]
    fn config_serde_flavored_json() {
        let json = r#"{
            "version": 1,
            "npm_registry": "https://registry.npmjs.org",
            "dsh_mirror": "https://mirror.example.com",
            "proxy": {
                "mode": "manual",
                "http_proxy": "http://proxy:8080",
                "https_proxy": "http://proxy:8443",
                "no_proxy": "localhost,127.0.0.1"
            },
            "prefer_offline": false
        }"#;
        let config: DownloadSourceConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.version, 1);
        assert_eq!(config.dsh_mirror.as_deref(), Some("https://mirror.example.com"));
        assert_eq!(config.proxy.mode, ProxyMode::Manual);
        assert_eq!(config.proxy.http_proxy.as_deref(), Some("http://proxy:8080"));
        assert!(!config.prefer_offline);
    }

    #[test]
    fn default_proxy_mode_serializes_as_snake_case() {
        let config = DownloadSourceConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains(r#""mode":"auto"#));
    }

    #[test]
    fn save_and_load_roundtrip() {
        let tmp = std::env::temp_dir().join("adl_download_source_test");
        let _ = std::fs::remove_dir_all(&tmp);

        let config = DownloadSourceConfig {
            dsh_mirror: Some("https://mirror.test".to_string()),
            ..Default::default()
        };

        save(&tmp, &config).unwrap();
        let loaded = load(&tmp).unwrap();

        assert_eq!(config.version, loaded.version);
        assert_eq!(config.npm_registry, loaded.npm_registry);
        assert_eq!(config.dsh_mirror, loaded.dsh_mirror);
        assert_eq!(config.proxy.mode, loaded.proxy.mode);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn load_returns_default_when_missing() {
        let tmp = std::env::temp_dir().join("adl_download_source_missing");
        let _ = std::fs::remove_dir_all(&tmp);

        let loaded = load(&tmp).unwrap();
        assert_eq!(loaded.npm_registry, "https://registry.npmjs.org");
        assert!(loaded.dsh_mirror.is_none());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 本地 200 服务：只接受第一个连接后自行退出（测试只发一次 HEAD）。
    /// 用非阻塞 accept + 5s 期限，避免「请求被代理吃掉」时测试线程永久挂住。
    fn spawn_ok_server() -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            while std::time::Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.set_nonblocking(false);
                        let mut buf = [0u8; 1024];
                        let _ = stream.read(&mut buf);
                        let _ = stream.write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        );
                        return;
                    },
                    Err(_) => std::thread::sleep(std::time::Duration::from_millis(10)),
                }
            }
        });
        format!("http://{addr}/")
    }

    /// 绑定后立即释放的本地端口：探测期间无人监听（必拒连）。
    fn closed_local_port() -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        port
    }

    /// 手动代理不可达时必须归因为「代理不可用」，而不是笼统的「网络错误」：
    /// 用户据此知道该改代理设置，而不是怀疑下载源。
    #[tokio::test]
    async fn test_source_reports_proxy_unreachable_for_dead_manual_proxy() {
        let url = spawn_ok_server();
        let port = closed_local_port();
        let proxy = format!("http://127.0.0.1:{port}");
        let config = DownloadSourceConfig {
            proxy: ProxyConfig {
                mode: ProxyMode::Manual,
                http_proxy: Some(proxy.clone()),
                https_proxy: None,
                no_proxy: None,
            },
            ..Default::default()
        };

        let status = test_source(&url, &config, Duration::from_secs(2)).await;

        assert!(!status.reachable);
        assert_eq!(status.error_kind, Some(SourceErrorKind::ProxyUnreachable));
        assert_eq!(status.proxy.as_deref(), Some(proxy.as_str()));
        assert!(status.latency_ms.is_none());
    }

    /// 代理模式「无」必须真的直连：即使配置里残留一个不可达代理，
    /// 探针也不得被它拦下（与真实下载 `no_proxy()` 语义一致）。
    #[tokio::test]
    async fn test_source_none_mode_bypasses_configured_proxy() {
        let url = spawn_ok_server();
        let port = closed_local_port();
        let config = DownloadSourceConfig {
            proxy: ProxyConfig {
                mode: ProxyMode::None,
                http_proxy: Some(format!("http://127.0.0.1:{port}")),
                https_proxy: None,
                no_proxy: None,
            },
            ..Default::default()
        };

        let status = test_source(&url, &config, Duration::from_secs(5)).await;

        assert!(status.reachable, "mode=none must connect directly: {status:?}");
        assert_eq!(status.error_kind, None);
        assert_eq!(status.proxy, None);
    }

    /// 代理端点在状态里必须脱敏（凭据不进前端/日志）。
    #[tokio::test]
    async fn test_source_redacts_proxy_credentials() {
        let url = spawn_ok_server();
        let port = closed_local_port();
        let config = DownloadSourceConfig {
            proxy: ProxyConfig {
                mode: ProxyMode::Manual,
                http_proxy: Some(format!("http://user:secret@127.0.0.1:{port}")),
                https_proxy: None,
                no_proxy: None,
            },
            ..Default::default()
        };

        let status = test_source(&url, &config, Duration::from_secs(2)).await;

        assert_eq!(status.proxy.as_deref(), Some(format!("http://127.0.0.1:{port}").as_str()));
        assert!(!status.error.unwrap_or_default().contains("secret"));
    }

    /// 手动代理 + 直连名单：命中名单的 host 必须直连；https 只认 https_proxy
    ///（与真实客户端一致，不做跨字段回退）。
    #[test]
    fn manual_proxy_resolution_respects_no_proxy() {
        let config = DownloadSourceConfig {
            proxy: ProxyConfig {
                mode: ProxyMode::Manual,
                http_proxy: Some("http://proxy.internal:8080".into()),
                https_proxy: Some("http://secure.internal:8443".into()),
                no_proxy: Some("localhost,.internal".into()),
            },
            ..Default::default()
        };

        assert_eq!(
            resolve_proxy_url(&config, "https://registry.npmjs.org/@deepseek-ai/dsh").as_deref(),
            Some("http://secure.internal:8443")
        );
        assert_eq!(
            resolve_proxy_url(&config, "http://registry.npmjs.org/x").as_deref(),
            Some("http://proxy.internal:8080")
        );
        assert_eq!(resolve_proxy_url(&config, "https://api.internal/x"), None);

        // 只有 http_proxy 时，https 目标直连（客户端不会把 http 代理套到 https 上）。
        let only_http = DownloadSourceConfig {
            proxy: ProxyConfig {
                mode: ProxyMode::Manual,
                http_proxy: Some("http://proxy.internal:8080".into()),
                https_proxy: None,
                no_proxy: None,
            },
            ..Default::default()
        };
        assert_eq!(resolve_proxy_url(&only_http, "https://registry.npmjs.org/x"), None);
    }

    /// NO_PROXY 条目按「精确 host / 子域后缀」匹配，不做子串误伤。
    /// 分隔符同时支持逗号与换行（设置面板「每行一个」）。
    #[test]
    fn no_proxy_matching_is_exact_or_suffix() {
        assert!(no_proxy_matches("localhost,127.0.0.1", "localhost"));
        assert!(no_proxy_matches("localhost\n127.0.0.1", "127.0.0.1"));
        assert!(no_proxy_matches(".internal", "api.internal"));
        assert!(no_proxy_matches("*", "anything.example"));
        assert!(!no_proxy_matches("10.0.0.1", "110.0.0.10"));
        assert!(!no_proxy_matches("internal", "notinternal.example"));
    }

    /// 导出给外部子进程时必须统一成逗号分隔（npm 只认逗号）。
    #[test]
    fn no_proxy_env_value_normalizes_newlines() {
        assert_eq!(no_proxy_env_value("localhost\n127.0.0.1"), "localhost,127.0.0.1");
        assert_eq!(no_proxy_env_value(" a ,\r\n b \n"), "a,b");
        assert_eq!(no_proxy_env_value("\n,\r\n"), "");
    }

    /// 显式刷新（force）与保存配置都会清空健康缓存，绕开 5s 冷却。
    #[test]
    fn invalidate_proxy_health_cache_drops_entry() {
        // 用唯一 endpoint 避免与其它测试共享的全局缓存互相干扰。
        let endpoint = "http://127.0.0.1:9/adl-invalidate-probe";
        store_proxy_reachable(endpoint, true);
        assert_eq!(cached_proxy_reachable(endpoint), Some(true));
        invalidate_proxy_health_cache();
        assert_eq!(cached_proxy_reachable(endpoint), None);
    }

    /// Auto 代理优先级（与 hyper-util 对齐）：scheme env（非空即占位）→ 注册表 → ALL_PROXY。
    #[test]
    fn auto_proxy_prefers_scheme_env_then_registry_then_all_proxy() {
        fn env_of(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
            let owned: Vec<(String, String)> =
                pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
            move |name: &str| {
                owned
                    .iter()
                    .find(|(key, _)| key == name)
                    .map(|(_, value)| value.clone())
                    .filter(|value| !value.is_empty())
            }
        }

        // scheme env 赢过注册表。
        assert_eq!(
            auto_proxy_for_scheme(
                &env_of(&[
                    ("HTTPS_PROXY", "http://https.proxy:1"),
                    ("ALL_PROXY", "http://all.proxy:2"),
                ]),
                Some("127.0.0.1:7890"),
                true
            )
            .as_deref(),
            Some("http://https.proxy:1")
        );
        // scheme env 为空 → 注册表（原样值按 http:// 规范化）。
        assert_eq!(
            auto_proxy_for_scheme(&env_of(&[]), Some("127.0.0.1:7890"), true).as_deref(),
            Some("http://127.0.0.1:7890")
        );
        // 注册表赢过 ALL_PROXY（hyper-util 中 http/https 优先于 all）。
        assert_eq!(
            auto_proxy_for_scheme(
                &env_of(&[("ALL_PROXY", "http://all.proxy:2")]),
                Some("127.0.0.1:7890"),
                true
            )
            .as_deref(),
            Some("http://127.0.0.1:7890")
        );
        // 纯空白值算「已设置但不可解析」：不回退注册表，也拿不到 ALL_PROXY → None
        //（与 hyper-util 的 `is_empty()` 判定一致）。
        assert_eq!(
            auto_proxy_for_scheme(&env_of(&[("HTTPS_PROXY", "   ")]), Some("127.0.0.1:7890"), true),
            None
        );
        // 无 scheme env、无注册表 → ALL_PROXY；全空 → None。
        assert_eq!(
            auto_proxy_for_scheme(&env_of(&[("HTTP_PROXY", "http://http.proxy:3")]), None, false)
                .as_deref(),
            Some("http://http.proxy:3")
        );
        assert_eq!(auto_proxy_for_scheme(&env_of(&[]), None, true), None);
    }

    /// 代理地址规范化：无 scheme 补 `http://`，未知 scheme / 空值 / 无 host 一律不可用。
    #[test]
    fn normalize_proxy_url_adds_default_scheme_and_validates() {
        assert_eq!(normalize_proxy_url("127.0.0.1:7890").as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(
            normalize_proxy_url(" socks5h://127.0.0.1:1080 ").as_deref(),
            Some("socks5h://127.0.0.1:1080")
        );
        assert_eq!(normalize_proxy_url("ftp://proxy:21"), None);
        assert_eq!(normalize_proxy_url(""), None);
        assert_eq!(normalize_proxy_url("   "), None);
        assert_eq!(normalize_proxy_url("http://"), None);
    }

    /// 注册表 `ProxyOverride` → NO_PROXY：`;` 分隔、去掉 `*.`、丢弃空项。
    #[test]
    fn proxy_override_is_converted_to_no_proxy_syntax() {
        assert_eq!(
            proxy_override_to_no_proxy("localhost;127.0.0.1;*.internal; ;*.example.com"),
            "localhost,127.0.0.1,internal,example.com"
        );
        assert_eq!(proxy_override_to_no_proxy(""), "");
    }

    /// Windows 注册表读取是「只读 + 容错」：调用不得 panic（不存在的值按未启用处理）。
    #[cfg(windows)]
    #[test]
    fn windows_proxy_settings_read_is_non_panicking() {
        let _ = windows_proxy_settings();
    }

    /// 手动代理：真实状态如实报「不可达」，且不静默回退（用户显式选择应被尊重）。
    /// `proxy_health` 用 https 目标解析，故这里配置 `https_proxy`。
    #[tokio::test]
    async fn proxy_health_manual_dead_proxy_does_not_fall_back() {
        let port = closed_local_port();
        let config = DownloadSourceConfig {
            proxy: ProxyConfig {
                mode: ProxyMode::Manual,
                http_proxy: None,
                https_proxy: Some(format!("https://127.0.0.1:{port}")),
                no_proxy: None,
            },
            ..Default::default()
        };

        let health = proxy_health(&config).await;

        assert_eq!(health.endpoint.as_deref(), Some(format!("https://127.0.0.1:{port}").as_str()));
        assert!(!health.auto_fallback);
    }

    /// 模式=关闭：直连、无端点、无自动回退标记。
    #[tokio::test]
    async fn proxy_health_none_mode_is_direct() {
        let config = DownloadSourceConfig {
            proxy: ProxyConfig {
                mode: ProxyMode::None,
                http_proxy: Some("http://proxy.internal:8080".into()),
                https_proxy: None,
                no_proxy: None,
            },
            ..Default::default()
        };

        let health = proxy_health(&config).await;

        assert_eq!(health.endpoint, None);
        assert!(!health.auto_fallback);
    }
}
