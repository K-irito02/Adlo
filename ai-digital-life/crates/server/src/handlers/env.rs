//! Env domain HTTP handlers — environment dependency status + hosted installs.
//!
//! Follows the dsh domain recipe: `State(state): State<ServerState>`, results
//! wrapped with [`crate::ipc::to_response`]. Installs and uninstalls run under
//! the shared `env_install_lock` with progress on `env_task` (kind
//! `"env-{dep}-install"` / `"env-{dep}-uninstall"`); the work itself runs in a
//! background `tokio::spawn` and the frontend polls the `task` section of
//! `GET /env/status` while it runs — the same
//! split as `/dsh/install-version` + `/dsh/version-task` (see `dsh.rs`).
//!
//! `EnvStatus` owns the camelCase wire shape; providers stay snake_case
//! (Task 5/7 precedent).

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::Path;

use adl_env::providers::{adlserver, bash, git, node, webview2};
use adl_env::{DependencyState, EffectiveSource, Origin, resolve};
use adl_hosted::ProgressPhase;

/// Parse a dependency key; anything outside [`adl_env::ENV_DEPS`] is
/// `InvalidInput` (4xx, never a silent no-op).
pub fn parse_dep(dep: &str) -> Result<&'static str, AppError> {
    match dep {
        "node" => Ok("node"),
        "git" => Ok("git"),
        "bash" => Ok("bash"),
        "webview2" => Ok("webview2"),
        "adlserver" => Ok("adlserver"),
        "netprobe" => Ok("netprobe"),
        _ => Err(AppError::InvalidInput(format!("unknown env dependency: {dep}"))),
    }
}

/// Parse a source mode (`auto`/`system`/`host`/`custom`); anything else is `InvalidInput`.
pub fn parse_mode(mode: &str) -> Result<adl_env::SourceMode, AppError> {
    match mode {
        "auto" => Ok(adl_env::SourceMode::Auto),
        "system" => Ok(adl_env::SourceMode::System),
        "host" => Ok(adl_env::SourceMode::Host),
        "custom" => Ok(adl_env::SourceMode::Custom),
        _ => Err(AppError::InvalidInput(format!("invalid source mode: {mode}"))),
    }
}

/// `host` mode requires a hosted provider. `webview2`/`adlserver`/`netprobe`
/// have no hosted install root, so selecting `host` is a machine-coded 4xx
/// (`no-hosted-source`) rather than a silently ineffective preference.
/// `bash` is hosted through the PortableGit package.
/// `custom` mode requires custom-path support (`node`/`git`/`bash` only).
pub fn validate_hosted_source(dep: &str, mode: adl_env::SourceMode) -> Result<(), AppError> {
    if mode == adl_env::SourceMode::Host && matches!(dep, "webview2" | "adlserver" | "netprobe") {
        return Err(AppError::InvalidInput("no-hosted-source".into()));
    }
    if mode == adl_env::SourceMode::Custom && matches!(dep, "webview2" | "adlserver" | "netprobe") {
        return Err(AppError::InvalidInput("no-custom-path".into()));
    }
    Ok(())
}

/// Whitelist deps that own a hosted install root for uninstall: `node|git`.
/// `bash` is provided by the PortableGit package and follows Git
/// (`bash-follows-git`); `webview2`/`adlserver`/`netprobe` are not managed
/// through hosted version dirs. Machine codes (not prose) so the frontend can
/// branch on them.
pub fn validate_uninstall(dep: &str) -> Result<&'static str, AppError> {
    let dep = parse_dep(dep)?;
    match dep {
        "node" | "git" => Ok(dep),
        "bash" => Err(AppError::InvalidInput("bash-follows-git".into())),
        _ => Err(AppError::InvalidInput("not-managed".into())),
    }
}

/// Whether an installed semver meets the baseline floor (`None`/unparsable
/// never meets). Pure for testability.
pub fn meets_semver(installed: Option<&str>, stable: &str) -> bool {
    let Ok(floor) = stable.parse::<semver::Version>() else {
        return false;
    };
    installed.is_some_and(|v| v.parse::<semver::Version>().is_ok_and(|ver| ver >= floor))
}

/// Whether an installed numeric-dotted version (WebView2 `140.0.3485.94`
/// style, not strict semver) meets the minimum floor.
/// Handler-local numeric compare: the provider's `cmp_dotted` is private, and
/// extending the Task 10 provider for one call site is not worth the churn.
pub fn meets_dotted(installed: Option<&str>, minimum: &str) -> bool {
    let (Some(got), Some(floor)) = (installed.and_then(dotted_parts), dotted_parts(minimum)) else {
        return false;
    };
    cmp_padded(&got, &floor) != std::cmp::Ordering::Less
}

/// Split a numeric-dotted version into components; `None` unless it has ≥3
/// all-numeric parts (mirrors the provider's validity rule).
fn dotted_parts(v: &str) -> Option<Vec<u64>> {
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() < 3 {
        return None;
    }
    parts.iter().map(|p| p.parse::<u64>().ok()).collect()
}

/// Lexicographic compare with implicit trailing-zero padding (`140.0`
/// vs `140.0.0.0` are equal, not less).
fn cmp_padded(a: &[u64], b: &[u64]) -> std::cmp::Ordering {
    let len = a.len().max(b.len());
    let pad = |v: &[u64]| {
        let mut out = v.to_vec();
        out.resize(len, 0);
        out
    };
    pad(a).cmp(&pad(b))
}

/// `netprobe` section of `EnvStatus`: two probe lights plus the CI-token
/// presence third light — CI/GitHub token only, NOT the dsh model-key status
/// (unknowable from the backend; Phase 2 renders the model-key row as
/// guidance-only). Existence only — the value is never read into the
/// response; see `has_access_token` in the ci domain for the same pattern).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetprobeState {
    pub registry_ok: bool,
    pub registry_latency_ms: u64,
    pub ci_token_configured: bool,
}

/// `GET /env/status` response: six dependency sections plus the in-flight
/// install `task` snapshot (seven sections), the environment data root
/// (`dataDir`) the providers resolve hosted dirs against, plus the derived
/// `dshReady` flag (`dsh_ready = node.meetsBaseline` — the harness needs node).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvStatus {
    pub node: adl_env::DependencyState,
    pub git: adl_env::DependencyState,
    pub bash: adl_env::DependencyState,
    pub webview2: adl_env::DependencyState,
    pub adlserver: adl_env::DependencyState,
    pub netprobe: NetprobeState,
    pub task: Option<adl_hosted::ProgressSnapshot>,
    /// Environment data root (`state.storage.paths().root`), display string.
    /// Same root the env providers use for hosted installs/config.
    pub data_dir: String,
    pub dsh_ready: bool,
}

/// GET `/env/status` — full environment snapshot. Detection runs live (cheap
/// `spawn_blocking` probes) but the serialized response is cached for
/// [`STATUS_CACHE_TTL`] and the registry probe never uses the 30s transfer
/// timeout; install/uninstall progress polling therefore never waits on the
/// network.
pub async fn status(State(state): State<ServerState>) -> impl IntoResponse {
    let result = status_inner(&state).await;
    ipc::to_response(result)
}

/// `/env/status` 响应缓存 TTL（前端安装期间 3s 轮询，2s 内重复请求直接复用）。
const STATUS_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(2);
/// registry 探测请求超时：轮询端点绝不能等共享 client 的 30s。
const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// A task is "running" only while it has no terminal error. An errored
/// snapshot is finished-but-failed (kept for polling), so it must not suppress
/// probing/caching or block `/env/recheck`.
fn task_is_running(snapshot: Option<&adl_hosted::ProgressSnapshot>) -> bool {
    snapshot.is_some_and(|task| task.error.is_none())
}

async fn status_inner(state: &ServerState) -> Result<serde_json::Value, AppError> {
    // 活动任务期间不走缓存（task 快照必须新鲜）且绝不触网：安装进度轮询
    // 不能被 registry 探测阻塞。错误快照是已结束任务，照常探测/缓存。
    let task = state.env_task.snapshot();
    let running = task_is_running(task.as_ref());
    if !running {
        if let Some(cached) = cache_get(&state.env_status_cache, STATUS_CACHE_TTL).await {
            return Ok(cached);
        }
    }

    let paths = state.storage.paths();
    let root = paths.root.clone();
    let credentials_dir = paths.credentials_dir.clone();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_default();
    let baseline = adl_env::baseline::load(&exe_dir)?;
    let sources = adl_env::config::load(&root)?;

    // 同步探测（where/注册表/文件存在性）集中进一次 blocking 调度，别占运行时。
    let det = {
        let root = root.clone();
        let sources = sources.clone();
        let baseline = baseline.clone();
        let exe_dir = exe_dir.clone();
        tokio::task::spawn_blocking(move || collect_states(&root, &sources, &baseline, &exe_dir))
            .await
            .map_err(|e| AppError::Internal(format!("env detection task failed: {e}")))?
    };

    // CI/GitHub token presence only — NOT dsh model-key status (unknowable
    // from backend; Phase 2 renders the model-key row as guidance-only).
    // Existence check only (`get_…` returned value discarded, never in response;
    // no suitable presence-only API, so reuse existing `get_ci_access_token_in_dir` ——
    // 本 crate 在此任务内不扩展，见 concerns）。阻塞 keyring/文件 IO 走
    // `spawn_blocking`（同 ci 域 `read_ci_access_token` 模式）。
    let ci_token_configured = tokio::task::spawn_blocking(move || {
        adl_credential::get_ci_access_token_in_dir(&credentials_dir).is_some()
    })
    .await
    .unwrap_or(false);

    let netprobe = if running {
        // 有任务在跑：只报上次已知的 registry 结果（未知时 false），不探测。
        let (registry_ok, registry_latency_ms) = last_known_registry(state).await;
        NetprobeState { registry_ok, registry_latency_ms, ci_token_configured }
    } else {
        let download = adl_download_source::load(&root)?;
        let registry = adl_download_source::resolve_registry(&download).to_string();
        let probe = match probe_client(state, &download).await {
            Ok(client) => Some(adl_env::providers::netprobe::check(&client, &registry).await),
            Err(e) => {
                tracing::warn!(error = %e, "env: probe client build failed; registry unknown");
                None
            },
        };
        NetprobeState {
            registry_ok: probe.as_ref().is_some_and(|p| p.registry_ok),
            registry_latency_ms: probe.map(|p| p.registry_latency_ms).unwrap_or(0),
            ci_token_configured,
        }
    };

    let dsh_ready = det.node.meets_baseline;
    let status = EnvStatus {
        node: det.node,
        git: det.git,
        bash: det.bash,
        webview2: det.webview2,
        adlserver: det.adlserver,
        netprobe,
        task,
        data_dir: root.to_string_lossy().into_owned(),
        dsh_ready,
    };
    let value = serde_json::to_value(&status).map_err(|e| AppError::Internal(e.to_string()))?;
    if !running {
        cache_put(&state.env_status_cache, value.clone()).await;
    }
    Ok(value)
}

/// 复用缓存的短超时探测 client；下载源配置或「自动回退直连」状态变化时重建。
///
/// 锁只在读/写缓存时短暂持有：客户端构建已变为 async（含代理预检），持锁跨 await
/// 会让并发的 `/env/status` 串行等待。
async fn probe_client(
    state: &ServerState,
    download: &adl_download_source::DownloadSourceConfig,
) -> Result<reqwest::Client, AppError> {
    // 自动回退状态纳入 key：代理软件重新打开后（健康缓存 5s 过期）client 会重建为
    // 走代理，而不是永久沿用 `no_proxy()` 的旧实例。只有 Auto 需要探测代理端点，
    // 其余模式不得为此多付一次预检延迟。
    let fallback = if matches!(download.proxy.mode, adl_download_source::ProxyMode::Auto) {
        adl_download_source::proxy_health(download).await.auto_fallback
    } else {
        false
    };
    let key =
        format!("{}|fallback={fallback}", serde_json::to_string(download).unwrap_or_default());
    if let Some(client) = {
        let slot = state.env_probe_client.lock().await;
        slot.as_ref().and_then(|(cached_key, client)| (cached_key == &key).then(|| client.clone()))
    } {
        return Ok(client);
    }
    let client =
        adl_download_source::build_http_client_with_timeout(download, PROBE_TIMEOUT).await?;
    *state.env_probe_client.lock().await = Some((key, client.clone()));
    Ok(client)
}

/// 上次缓存里的 registry 字段（忽略 TTL：安装期间只作“最后已知值”）。
async fn last_known_registry(state: &ServerState) -> (bool, u64) {
    let guard = state.env_status_cache.lock().await;
    let Some((_, value)) = guard.as_ref() else {
        return (false, 0);
    };
    let netprobe = &value["netprobe"];
    (
        netprobe.get("registryOk").and_then(|v| v.as_bool()).unwrap_or(false),
        netprobe.get("registryLatencyMs").and_then(|v| v.as_u64()).unwrap_or(0),
    )
}

async fn cache_get(
    cache: &tokio::sync::Mutex<Option<(std::time::Instant, serde_json::Value)>>,
    ttl: std::time::Duration,
) -> Option<serde_json::Value> {
    let guard = cache.lock().await;
    match guard.as_ref() {
        Some((at, value)) if at.elapsed() < ttl => Some(value.clone()),
        _ => None,
    }
}

/// 读取最近一次快照（忽略 TTL）：按 dep 重检需要以它为合并基线，
/// 不能因 2s TTL 过期就退化成全量探测。
async fn cache_peek(
    cache: &tokio::sync::Mutex<Option<(std::time::Instant, serde_json::Value)>>,
) -> Option<serde_json::Value> {
    cache.lock().await.as_ref().map(|(_, value)| value.clone())
}

async fn cache_put(
    cache: &tokio::sync::Mutex<Option<(std::time::Instant, serde_json::Value)>>,
    value: serde_json::Value,
) {
    *cache.lock().await = Some((std::time::Instant::now(), value));
}

async fn cache_clear(cache: &tokio::sync::Mutex<Option<(std::time::Instant, serde_json::Value)>>) {
    *cache.lock().await = None;
}

/// 同步失效（`Drop` 里用）：锁被状态请求短暂占用时异步补一次清理。
fn invalidate_status_cache(state: &ServerState) {
    match state.env_status_cache.try_lock() {
        Ok(mut guard) => *guard = None,
        Err(_) => {
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                let cache = state.env_status_cache.clone();
                handle.spawn(async move {
                    *cache.lock().await = None;
                });
            }
        },
    }
}

/// 后台 env 任务收尾守卫。正常失败路径已由 provider `set_error`（错误快照保留
/// 供轮询）；panic 或提前返回未留错误时补一条并释放运行槽
///（错误快照不再阻塞 `begin`）。Drop 同时失效 `/env/status` 缓存。
struct RunGuard {
    state: ServerState,
}

impl RunGuard {
    fn new(state: &ServerState) -> Self {
        Self { state: state.clone() }
    }
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        if self.state.env_task.snapshot().is_some_and(|s| s.error.is_none()) {
            tracing::error!("env: task ended without success/error; marking aborted");
            self.state.env_task.abort_with("env task aborted unexpectedly");
        }
        invalidate_status_cache(&self.state);
    }
}

/// Blocking-side detection results (built inside one `spawn_blocking`).
struct DetectedStates {
    node: adl_env::DependencyState,
    git: adl_env::DependencyState,
    bash: adl_env::DependencyState,
    webview2: adl_env::DependencyState,
    adlserver: adl_env::DependencyState,
}

fn collect_states(
    root: &Path,
    sources: &adl_env::config::EnvSourcesConfig,
    baseline: &adl_env::baseline::EnvBaseline,
    exe_dir: &Path,
) -> DetectedStates {
    DetectedStates {
        node: node_state(root, sources, &baseline.node.stable),
        git: git_state(root, sources, baseline),
        bash: bash_state(root, sources),
        webview2: webview2_state(sources, &baseline.webview2.minimum),
        adlserver: adlserver_state(sources, exe_dir),
    }
}

/// Custom-path override for node/git: run the override binary's `--version`
/// instead of the `where` lookup. Broken binary → unavailable (status reflects
/// reality; `set-custom-path` validated it at save time).
fn detect_node_at(path: &str) -> node::Detection {
    let version = std::process::Command::new(path).arg("--version").output().ok().and_then(|o| {
        if !o.status.success() {
            return None;
        }
        node::parse_version(&String::from_utf8_lossy(&o.stdout))
    });
    match version {
        Some(version) => node::Detection {
            available: true,
            version: Some(version),
            path: Some(path.to_string()),
        },
        None => node::Detection { available: false, version: None, path: None },
    }
}

fn detect_git_at(path: &str) -> git::Detection {
    let version = std::process::Command::new(path).arg("--version").output().ok().and_then(|o| {
        if !o.status.success() {
            return None;
        }
        git::parse_version(&String::from_utf8_lossy(&o.stdout))
    });
    match version {
        Some(version) => {
            git::Detection { available: true, version: Some(version), path: Some(path.to_string()) }
        },
        None => git::Detection { available: false, version: None, path: None },
    }
}

fn node_state(
    root: &Path,
    sources: &adl_env::config::EnvSourcesConfig,
    stable: &str,
) -> DependencyState {
    let mode = sources.node.mode;
    let custom = sources.node.custom_path.clone().filter(|p| !p.is_empty());
    let host = adl_hosted::HostedVersions::open(root, node::HOSTED_NAME, node::MARKER_REL)
        .read_selected()
        .ok()
        .flatten();
    // `custom` 模式只认指定路径：未填写时直接不可用，不回退到 PATH 探测；
    // 非 custom 模式保持向后兼容（已填路径仍优先覆盖探测）。
    let sys = match custom.as_deref() {
        Some(p) => detect_node_at(p),
        None if mode == adl_env::SourceMode::Custom => {
            node::Detection { available: false, version: None, path: None }
        },
        None => node::detect(),
    };
    let effective = resolve(mode, sys.available, host.clone()).effective;
    let (installed_version, path, origin) = match effective {
        EffectiveSource::Host => (
            host.clone(),
            host.as_ref().map(|v| node::host_bin_path(root, v).to_string_lossy().into_owned()),
            Origin::Bundled,
        ),
        EffectiveSource::System => (
            sys.version.clone(),
            sys.path.clone(),
            if custom.is_some() { Origin::Manual } else { Origin::Path },
        ),
        EffectiveSource::None => (None, None, Origin::Path),
    };
    let meets_baseline =
        installed_version.as_deref().is_some_and(|v| meets_semver(Some(v), stable));
    DependencyState {
        mode,
        effective,
        origin,
        installed_version,
        baseline_version: stable.to_string(),
        meets_baseline,
        path,
        custom_path: custom,
    }
}

fn git_state(
    root: &Path,
    sources: &adl_env::config::EnvSourcesConfig,
    baseline: &adl_env::baseline::EnvBaseline,
) -> DependencyState {
    let mode = sources.git.mode;
    let custom = sources.git.custom_path.clone().filter(|p| !p.is_empty());
    let host = adl_hosted::HostedVersions::open(root, git::HOSTED_NAME, git::MARKER_REL)
        .read_selected()
        .ok()
        .flatten();
    let sys = match custom.as_deref() {
        Some(p) => detect_git_at(p),
        None if mode == adl_env::SourceMode::Custom => {
            git::Detection { available: false, version: None, path: None }
        },
        None => git::detect(),
    };
    let effective = resolve(mode, sys.available, host.clone()).effective;
    let (installed_version, path, origin) = match effective {
        EffectiveSource::Host => (
            host.clone(),
            host.as_ref().map(|v| git::host_bin_path(root, v).to_string_lossy().into_owned()),
            Origin::Bundled,
        ),
        EffectiveSource::System => (
            sys.version.clone(),
            sys.path.clone(),
            if custom.is_some() { Origin::Manual } else { Origin::Path },
        ),
        EffectiveSource::None => (None, None, Origin::Path),
    };
    let meets_baseline =
        installed_version.as_deref().is_some_and(|v| meets_semver(Some(v), &baseline.git.stable));
    DependencyState {
        mode,
        effective,
        origin,
        installed_version,
        baseline_version: baseline.git.stable.clone(),
        meets_baseline,
        path,
        custom_path: custom,
    }
}

fn bash_state(root: &Path, sources: &adl_env::config::EnvSourcesConfig) -> DependencyState {
    bash_state_from_candidates(root, sources, bash::detect())
}

/// Candidate-ranking half of [`bash_state`] (pure w.r.t. real machine probes so
/// tests can inject a fake detected candidate).
fn bash_state_from_candidates(
    root: &Path,
    sources: &adl_env::config::EnvSourcesConfig,
    mut candidates: Vec<bash::BashCandidate>,
) -> DependencyState {
    let mode = sources.bash.mode;
    let custom = sources.bash.custom_path.clone().filter(|p| !p.is_empty());
    // `custom` 模式只认指定路径：清空探测候选，仅保留已填且存在的文件；
    // 非 custom 模式保持向后兼容（已填路径置顶，仍保留探测候选）。
    if mode == adl_env::SourceMode::Custom {
        candidates.clear();
        if let Some(p) = custom.as_deref() {
            if Path::new(p).is_file() {
                candidates.push(bash::BashCandidate {
                    kind: bash::BashKind::Manual,
                    path: p.to_string(),
                });
            }
        }
    } else if let Some(p) = custom.as_deref() {
        // 显式自定义路径是 `Manual`，在 system 侧优先于探测到的候选（不得排到末尾）。
        if Path::new(p).is_file() {
            candidates.retain(|c| c.path != p);
            candidates.insert(
                0,
                bash::BashCandidate { kind: bash::BashKind::Manual, path: p.to_string() },
            );
        }
    }
    // PortableGit 提供宿主 bash（`bin/bash.exe`）；host 侧不再是恒不可用。
    let host = bash::detect_hosted(root);
    let host_available = host.is_some();
    let sys_available = !candidates.is_empty();
    let effective =
        resolve(mode, sys_available, host_available.then(|| "hosted".to_string())).effective;
    let pick = match effective {
        EffectiveSource::Host => host,
        EffectiveSource::System | EffectiveSource::None => candidates.into_iter().next(),
    };
    let (path, origin) = match pick {
        Some(c) => (
            Some(c.path),
            match c.kind {
                bash::BashKind::Hosted => Origin::Bundled,
                bash::BashKind::Manual => Origin::Manual,
                _ => Origin::Path,
            },
        ),
        None => (None, Origin::Path),
    };
    // bash 无版本 baseline：meets = 可用性。
    DependencyState {
        mode,
        effective,
        origin,
        installed_version: None,
        baseline_version: String::new(),
        meets_baseline: effective != EffectiveSource::None,
        path,
        custom_path: custom,
    }
}

fn webview2_state(sources: &adl_env::config::EnvSourcesConfig, minimum: &str) -> DependencyState {
    let mode = sources.webview2.mode;
    let sys = webview2::detect();
    let effective = resolve(mode, sys.available, None).effective;
    let installed_version = match effective {
        EffectiveSource::None => None,
        _ => sys.version.clone(),
    };
    DependencyState {
        mode,
        effective,
        origin: Origin::Registry,
        installed_version: installed_version.clone(),
        baseline_version: minimum.to_string(),
        meets_baseline: meets_dotted(installed_version.as_deref(), minimum),
        // 注册表只记版本不记路径。
        path: None,
        custom_path: sources.webview2.custom_path.clone(),
    }
}

fn adlserver_state(sources: &adl_env::config::EnvSourcesConfig, exe_dir: &Path) -> DependencyState {
    let mode = sources.adlserver.mode;
    let sys = adlserver::detect(exe_dir);
    let effective = resolve(mode, sys.available, None).effective;
    // 存在性即达标：无 `--version` 口径，version 恒为 None。
    DependencyState {
        mode,
        effective,
        origin: Origin::Bundled,
        installed_version: None,
        baseline_version: String::new(),
        meets_baseline: effective != EffectiveSource::None,
        path: match effective {
            EffectiveSource::None => None,
            _ => sys.path.clone(),
        },
        custom_path: sources.adlserver.custom_path.clone(),
    }
}

/// POST `/env/install` — install `{ dep, version? }` (missing version means
/// the baseline stable). Accepted installs run in the background; the
/// response is `{ started: true }` (same shape as `/env/uninstall`) and
/// progress is polled via `status`.
pub async fn install(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: InstallInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = install_inner(&state, input).await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
struct InstallInput {
    dep: String,
    #[serde(default)]
    version: Option<String>,
}

/// Started-trigger response shared by `/env/install` and `/env/uninstall`:
/// the call kicks off work, progress comes from status. (`/env/recheck` returns
/// a full `EnvStatus` snapshot instead.)
fn started_payload() -> serde_json::Value {
    serde_json::json!({ "started": true })
}

/// Env 任务占位（安装/卸载共用 `env_task`，已有任务在跑则拒绝）。错误快照是
/// 已结束任务，`begin_with` 会直接替换（不再需要手工回收）；env 无取消路由，
/// 任务一律 `cancellable: false`。
fn try_begin_env_task(state: &ServerState, kind: &str, label: &str) -> Result<(), AppError> {
    if state.env_task.begin_with(kind, label, false) {
        return Ok(());
    }
    tracing::debug!(?kind, %label, "env: begin rejected (another task running)");
    Err(AppError::InvalidInput("another env task is already running".into()))
}

async fn install_inner(
    state: &ServerState,
    input: InstallInput,
) -> Result<serde_json::Value, AppError> {
    let dep = parse_dep(&input.dep)?;
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_default();
    let baseline = adl_env::baseline::load(&exe_dir)?;
    match dep {
        "node" => {
            let version = input.version.unwrap_or_else(|| baseline.node.stable.clone());
            version
                .parse::<semver::Version>()
                .map_err(|_| AppError::InvalidInput(format!("bad node version {version}")))?;
            try_begin_env_task(state, "env-node-install", &format!("node {version}"))?;
            spawn_node_install(state, version.clone(), baseline.node.dist_base.clone());
            Ok(started_payload())
        },
        "git" => {
            let version = input.version.unwrap_or_else(|| baseline.git.stable.clone());
            // tag+asset 逐字来自 baseline，short semver 推不出 asset 名——
            // 非 baseline 版本拒绝（不得猜 `.windows.N` 后缀）。
            if version != baseline.git.stable {
                return Err(AppError::InvalidInput(format!(
                    "only the baseline git version {} can be installed",
                    baseline.git.stable
                )));
            }
            try_begin_env_task(state, "env-git-install", &format!("git {version}"))?;
            spawn_git_install(
                state,
                version.clone(),
                baseline.git.base.clone(),
                baseline.git.tag.clone(),
                baseline.git.asset.clone(),
            );
            Ok(started_payload())
        },
        // WebView2 由安装器管理：provider 直接返回机器码引导错误（4xx）。
        "webview2" => {
            webview2::install()?;
            Ok(started_payload())
        },
        // bash 随宿主 PortableGit 提供：单独安装没有意义，引导去装 Git。
        "bash" => Err(AppError::InvalidInput(
            "bash is provided by the hosted PortableGit package; install git instead".into(),
        )),
        _ => Err(AppError::InvalidInput(format!("{dep} cannot be installed"))),
    }
}

/// 后台执行 node 宿主托管安装（`env_install_lock` 下串行；进度经 `env_task`
/// 由 `GET /env/status` 的 `task` 节轮询）。
/// 成功由 provider `finish()` 清快照；失败留 error 快照供轮询，
/// 下次 install 经 `try_begin_env_task` 回收。
fn spawn_node_install(state: &ServerState, version: String, dist_base: String) {
    let task_state = state.clone();
    tokio::spawn(async move {
        let _lock = task_state.env_install_lock.clone().lock_owned().await;
        let _run = RunGuard::new(&task_state);
        let root = task_state.storage.paths().root.clone();
        let download = match adl_download_source::load(&root) {
            Ok(c) => c,
            Err(e) => {
                task_state.env_task.set_error(&e.to_string());
                return;
            },
        };
        let cfg =
            node::InstallConfig { data_dir: &root, dist_base: &dist_base, download: &download };
        if node::install(&version, &cfg, &task_state.env_task).await.is_ok() {
            // 新版本写入 selected.txt 后，宿主目录要立刻进 PATH（新终端/dsh 下一次拉起生效）。
            crate::env_path::refresh(&root);
        }
    });
}

/// 后台执行 PortableGit 宿主托管安装（tag+asset 逐字透传 baseline；语义同上）。
fn spawn_git_install(
    state: &ServerState,
    version: String,
    base: String,
    tag: String,
    asset: String,
) {
    let task_state = state.clone();
    tokio::spawn(async move {
        let _lock = task_state.env_install_lock.clone().lock_owned().await;
        let _run = RunGuard::new(&task_state);
        let root = task_state.storage.paths().root.clone();
        let download = match adl_download_source::load(&root) {
            Ok(c) => c,
            Err(e) => {
                task_state.env_task.set_error(&e.to_string());
                return;
            },
        };
        let cfg = git::InstallConfig {
            data_dir: &root,
            git_base: &base,
            git_tag: &tag,
            git_asset: &asset,
            download: &download,
        };
        if git::install(&version, &cfg, &task_state.env_task).await.is_ok() {
            // 同 node：宿主 PortableGit 的 `cmd/` 与 `bin/` 立刻进入 PATH。
            crate::env_path::refresh(&root);
        }
    });
}

/// POST `/env/uninstall` — remove hosted `{ dep, version? }`. Missing
/// `version` means the currently selected hosted version. Accepted removals
/// run in the background (same `env_install_lock` as installs) and the
/// response is `{ started: true }`; progress/results are polled via
/// `GET /env/status`'s `task` section and refreshed status.
pub async fn uninstall(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: UninstallInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = uninstall_inner(&state, input).await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
struct UninstallInput {
    dep: String,
    #[serde(default)]
    version: Option<String>,
}

async fn uninstall_inner(
    state: &ServerState,
    input: UninstallInput,
) -> Result<serde_json::Value, AppError> {
    tracing::info!(dep = %input.dep, version = ?input.version, "env: uninstall requested");
    let dep = validate_uninstall(&input.dep)?;
    let root = state.storage.paths().root.clone();
    let version = match input.version {
        Some(v) => {
            // 显式版本先 trim；空白版本是调用方错误（4xx），不得静默回落到 selected。
            let trimmed = v.trim();
            if trimmed.is_empty() {
                return Err(AppError::InvalidInput(format!("bad {dep} version: empty")));
            }
            trimmed.to_string()
        },
        None => selected_hosted_version(&root, dep)?
            .ok_or_else(|| AppError::InvalidInput("no-selected-version".into()))?,
    };
    tracing::info!(dep, %version, "env: uninstall accepted");
    try_begin_env_task(state, &uninstall_kind(dep), &version)?;
    spawn_uninstall(state, dep, version);
    Ok(started_payload())
}

/// Task kind for the background uninstall (`env-{dep}-uninstall`); pinned in
/// tests so the frontend's polling filter cannot silently drift.
fn uninstall_kind(dep: &str) -> String {
    format!("env-{dep}-uninstall")
}

/// Selected hosted version for an uninstall-eligible dep (provider-owned
/// layout: `env-hosted/{node,git}/selected.txt`).
fn selected_hosted_version(root: &Path, dep: &str) -> Result<Option<String>, AppError> {
    let (name, marker) = match dep {
        "node" => (node::HOSTED_NAME, node::MARKER_REL),
        "git" => (git::HOSTED_NAME, git::MARKER_REL),
        _ => return Ok(None),
    };
    adl_hosted::HostedVersions::open(root, name, marker).read_selected()
}

/// Background hosted uninstall (serialized with installs on
/// `env_install_lock`). Success finishes the task; failure records the error
/// for polling, reclaimed by the next env task (`try_begin_env_task`).
fn spawn_uninstall(state: &ServerState, dep: &'static str, version: String) {
    let task_state = state.clone();
    let log_version = version.clone();
    tokio::spawn(async move {
        let _lock = task_state.env_install_lock.clone().lock_owned().await;
        let _run = RunGuard::new(&task_state);
        let root = task_state.storage.paths().root.clone();
        tracing::info!(dep, version = %log_version, "env: uninstall starting");
        // `/env/status` should show removing while the provider works.
        task_state.env_task.update(ProgressPhase::Removing, Some(0), 0, 0, false);
        // `remove_dir_all` is blocking IO — keep it off the runtime.
        let result = tokio::task::spawn_blocking(move || match dep {
            "node" => node::uninstall(&root, &version).map(|_| ()),
            "git" => git::uninstall(&root, &version).map(|_| ()),
            _ => unreachable!("whitelist guarantees node|git"),
        })
        .await;
        match result {
            Ok(Ok(())) => {
                tracing::info!(dep, version = %log_version, "env: uninstall succeeded");
                task_state.env_task.finish();
                // 选中版可能回退到另一已装版本，或无版本可选中 → PATH 必须同步收缩。
                crate::env_path::refresh(&task_state.storage.paths().root);
            },
            Ok(Err(e)) => {
                tracing::warn!(
                    dep,
                    version = %log_version,
                    error = %e,
                    "env: uninstall failed"
                );
                task_state.env_task.set_error(&e.to_string());
            },
            Err(e) => {
                tracing::error!(
                    dep,
                    version = %log_version,
                    error = %e,
                    "env: uninstall task failed"
                );
                task_state.env_task.set_error(&format!("uninstall task failed: {e}"));
            },
        }
    });
}

/// POST `/env/select-source` — set `{ dep, mode }` source preference.
pub async fn select_source(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SelectInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = select_source_inner(&state, input).await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
struct SelectInput {
    dep: String,
    mode: String,
}

async fn select_source_inner(
    state: &ServerState,
    input: SelectInput,
) -> Result<serde_json::Value, AppError> {
    // 校验全部发生在落盘前：非法 dep/mode 直接 4xx，不污染已存配置。
    let dep = parse_dep(&input.dep)?;
    let mode = parse_mode(&input.mode)?;
    validate_hosted_source(dep, mode)?;
    let root = state.storage.paths().root.clone();
    let _config_guard = state.env_config_lock.lock().await;
    let mut config = adl_env::config::load(&root)?;
    adl_env::config::apply_select(dep, mode, &mut config)?;
    adl_env::config::save(&root, &config)?;
    // 立即失效状态缓存：前端保存后马上取 status，不能返回旧 mode/effective。
    cache_clear(&state.env_status_cache).await;
    // 来源切换会改变注入集合（宿主副本 / 指定路径的父目录）：refresh 先摘旧目录
    // 再按新配置加新目录，避免宿主版继续抢占系统命令或指定路径不生效。
    crate::env_path::refresh(&root);
    Ok(serde_json::json!(true))
}

/// POST `/env/set-custom-path` — set `{ dep, path }` explicit override.
/// Validated server-side BEFORE saving (runs the provider's
/// detect-equivalent: `--version` parse for node/git, existence for bash);
/// failures are 4xx and leave the saved config untouched. Blank path clears.
pub async fn set_custom_path(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: CustomPathInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = set_custom_path_inner(&state, input).await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
struct CustomPathInput {
    dep: String,
    path: String,
}

async fn set_custom_path_inner(
    state: &ServerState,
    input: CustomPathInput,
) -> Result<serde_json::Value, AppError> {
    let dep = parse_dep(&input.dep)?;
    if !adl_env::config::custom_path_supported(dep)? {
        return Err(AppError::InvalidInput(format!("custom path is not supported for {dep}")));
    }
    let path = input.path.trim().to_string();
    // 服务端即时校验：跑对应 `--version`/存在性检查，不通过 4xx 且不落盘。
    if !path.is_empty() {
        match dep {
            "node" | "git" => check_custom_version_bin(&path, dep).await?,
            "bash" if !Path::new(&path).is_file() => {
                return Err(AppError::InvalidInput(format!(
                    "bash custom path does not exist: {path}"
                )));
            },
            _ => {},
        }
    }
    let root = state.storage.paths().root.clone();
    let _config_guard = state.env_config_lock.lock().await;
    let mut config = adl_env::config::load(&root)?;
    adl_env::config::set_custom_path(
        &mut config,
        dep,
        if path.is_empty() { None } else { Some(path) },
    )?;
    adl_env::config::save(&root, &config)?;
    cache_clear(&state.env_status_cache).await;
    // 指定路径会改变注入集合：system/custom/auto 回退都取该可执行文件的父目录。
    // 刷新一次，让新终端与下一次 dsh/git 拉起使用新路径。
    crate::env_path::refresh(&root);
    Ok(serde_json::json!(true))
}

/// Run `<bin> --version` off the runtime (blocking spawn) and require the
/// provider's parser to accept the output.
async fn check_custom_version_bin(bin: &str, dep: &str) -> Result<(), AppError> {
    let bin_owned = bin.to_string();
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new(&bin_owned).arg("--version").output()
    })
    .await
    .map_err(|e| AppError::Internal(format!("version check task failed: {e}")))?
    .map_err(|e| AppError::InvalidInput(format!("cannot run {bin} --version: {e}")))?;
    if !output.status.success() {
        return Err(AppError::InvalidInput(format!("{bin} --version failed")));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let ok = match dep {
        "node" => node::parse_version(&text).is_some(),
        "git" => git::parse_version(&text).is_some(),
        _ => false,
    };
    if ok {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!("{bin} is not a usable {dep} binary")))
    }
}

/// POST `/env/recheck` — 按 dep 集合重新探测（空/缺省 = 全量）。
///
/// 返回合并后的完整 `EnvStatus`（不再返回 `{started:true}`）：
/// - 只探测请求的依赖，其余字段保留当前缓存值；
/// - 缓存写回与合并都在同一把锁内完成，两个块并发刷新不会互相覆盖；
/// - 冷缓存（从未 `/env/status`）无可合并基线，退回全量探测。
pub async fn recheck(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let result = recheck_inner(&state, body).await;
    ipc::to_response(result)
}

async fn recheck_inner(
    state: &ServerState,
    body: axum::body::Bytes,
) -> Result<serde_json::Value, AppError> {
    let deps = parse_recheck_deps(&body)?;
    // 失败任务是终态：recheck 清掉它，后续状态才会重新探测/缓存。
    state.env_task.clear_errored();
    if deps.is_empty() {
        cache_clear(&state.env_status_cache).await;
        return status_inner(state).await;
    }
    if cache_peek(&state.env_status_cache).await.is_none() {
        // 冷缓存：直接全量探测并写回；不再 clear（peek 与 clear 之间可能已有
        // 并发请求写入新快照，清掉只会让它白白多探测一次）。
        return status_inner(state).await;
    }
    let probed = probe_deps(state, &deps).await?;
    let task_snapshot = state.env_task.snapshot();
    let running = task_is_running(task_snapshot.as_ref());
    let merged = {
        let mut guard = state.env_status_cache.lock().await;
        match guard.as_mut() {
            Some((at, value)) => {
                merge_probed(value, &probed);
                // 活动任务期间 task 必须新鲜（与 status_inner 的不变量对齐）：
                // 缓存里的旧 task 可能还是安装开始前的 null，直接返回会抹掉进度行。
                if let Some(obj) = value.as_object_mut() {
                    obj.insert(
                        "task".to_string(),
                        serde_json::to_value(&task_snapshot)
                            .map_err(|e| AppError::Internal(e.to_string()))?,
                    );
                }
                if !running {
                    // running 时不延期 at：依赖所有 env 任务结束时的 RunGuard Drop
                    // 失效缓存；若将来出现绕过 RunGuard 的结束路径，这里会留下
                    // 「进行中」幽灵 task 直到 TTL 到期。
                    *at = std::time::Instant::now();
                }
                Some(value.clone())
            },
            None => None,
        }
    };
    match merged {
        Some(value) => Ok(value),
        None => {
            // 极窄竞态：探测期间缓存被清空 → 全量兜底（status_inner 自行写回）。
            status_inner(state).await
        },
    }
}

#[derive(serde::Deserialize)]
struct RecheckInput {
    #[serde(default)]
    deps: Option<Vec<String>>,
}

/// 解析并校验 `deps`（去重、保留顺序）；`netprobe` 不是可重检的依赖项。
fn parse_recheck_deps(body: &axum::body::Bytes) -> Result<Vec<&'static str>, AppError> {
    // 空 body 视为全量（保持旧调用口径：`{}` / 无 body 都走全量）。
    if body.is_empty() {
        return Ok(Vec::new());
    }
    let input: RecheckInput =
        serde_json::from_slice(body).map_err(|e| AppError::InvalidInput(e.to_string()))?;
    let mut deps: Vec<&'static str> = Vec::new();
    for dep in input.deps.unwrap_or_default() {
        let dep = parse_dep(&dep)?;
        if dep == "netprobe" {
            return Err(AppError::InvalidInput("netprobe is not recheckable".into()));
        }
        if !deps.contains(&dep) {
            deps.push(dep);
        }
    }
    Ok(deps)
}

/// 只探测请求的依赖；返回值顺序与 `deps` 一致。
async fn probe_deps(
    state: &ServerState,
    deps: &[&'static str],
) -> Result<Vec<(&'static str, serde_json::Value)>, AppError> {
    if deps.is_empty() {
        return Ok(Vec::new());
    }
    let paths = state.storage.paths();
    let root = paths.root.clone();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();
    let baseline = adl_env::baseline::load(&exe_dir)?;
    let sources = adl_env::config::load(&root)?;
    let requested: Vec<&'static str> = deps.to_vec();
    let probed = tokio::task::spawn_blocking(move || {
        let mut out: Vec<(&'static str, adl_env::DependencyState)> = Vec::new();
        for dep in requested {
            let state = match dep {
                "node" => node_state(&root, &sources, &baseline.node.stable),
                "git" => git_state(&root, &sources, &baseline),
                "bash" => bash_state(&root, &sources),
                "webview2" => webview2_state(&sources, &baseline.webview2.minimum),
                "adlserver" => adlserver_state(&sources, &exe_dir),
                _ => continue,
            };
            out.push((dep, state));
        }
        out
    })
    .await
    .map_err(|e| AppError::Internal(format!("env detection task failed: {e}")))?;
    probed
        .into_iter()
        .map(|(dep, state)| {
            serde_json::to_value(state).map(|value| (dep, value)).map_err(|e| {
                AppError::Internal(format!("env probe serialize failed for {dep}: {e}"))
            })
        })
        .collect::<Result<Vec<_>, _>>()
}

/// 把探测片段写回完整快照；node 参与时重算 `dshReady`。
fn merge_probed(value: &mut serde_json::Value, probed: &[(&'static str, serde_json::Value)]) {
    let Some(obj) = value.as_object_mut() else {
        return;
    };
    for (dep, dep_value) in probed {
        obj.insert((*dep).to_string(), dep_value.clone());
    }
    if probed.iter().any(|(dep, _)| *dep == "node") {
        let dsh_ready = obj
            .get("node")
            .and_then(|node| node.get("meetsBaseline"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        obj.insert("dshReady".to_string(), serde_json::Value::Bool(dsh_ready));
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CustomPathInput, EnvStatus, NetprobeState, RunGuard, STATUS_CACHE_TTL, SelectInput,
        UninstallInput, bash_state_from_candidates, cache_clear, cache_get, cache_put,
        meets_dotted, meets_semver, parse_dep, parse_mode, parse_recheck_deps, recheck_inner,
        select_source_inner, selected_hosted_version, set_custom_path_inner, task_is_running,
        try_begin_env_task, uninstall_inner, uninstall_kind, validate_hosted_source,
        validate_uninstall,
    };
    use adl_env::providers::{bash, git, node};
    use adl_env::{DependencyState, EffectiveSource, Origin, SourceMode};
    use adl_errors::AppError;

    fn dep_state(meets: bool) -> DependencyState {
        DependencyState {
            mode: SourceMode::Auto,
            effective: if meets { EffectiveSource::Host } else { EffectiveSource::None },
            origin: Origin::Path,
            installed_version: None,
            baseline_version: String::new(),
            meets_baseline: meets,
            path: None,
            custom_path: None,
        }
    }

    /// select-source 非法 dep 返回 4xx 口径：`parse_dep` 拒绝未知依赖。
    #[test]
    fn select_source_rejects_unknown_dep() {
        assert_eq!(parse_dep("node").unwrap(), "node");
        assert_eq!(parse_dep("netprobe").unwrap(), "netprobe");
        assert!(parse_dep("bogus").is_err());
        assert!(parse_dep("").is_err());
        assert!(parse_dep("Node").is_err());
    }

    #[test]
    fn parse_mode_accepts_closed_vocabulary() {
        assert_eq!(parse_mode("auto").unwrap(), SourceMode::Auto);
        assert_eq!(parse_mode("system").unwrap(), SourceMode::System);
        assert_eq!(parse_mode("host").unwrap(), SourceMode::Host);
        assert!(parse_mode("bogus").is_err());
        assert!(parse_mode("").is_err());
    }

    /// resolve 缺失强制模式 → effective none：强制 system 但系统侧缺失时，
    /// `resolve` 不静默降级（handler 据此置 `meets_baseline: false`）。
    #[test]
    fn forced_mode_without_availability_resolves_to_none() {
        let r = adl_env::resolve(SourceMode::System, false, Some("24.22.1".into()));
        assert_eq!(r.effective, EffectiveSource::None);
        let r = adl_env::resolve(SourceMode::Host, true, None);
        assert_eq!(r.effective, EffectiveSource::None);
    }

    #[test]
    fn meets_semver_compares_against_baseline() {
        assert!(meets_semver(Some("24.22.1"), "24.22.1"));
        assert!(meets_semver(Some("26.12.1"), "24.22.1"));
        assert!(!meets_semver(Some("22.14.0"), "24.22.1"));
        assert!(!meets_semver(None, "24.22.1"));
        assert!(!meets_semver(Some("garbage"), "24.22.1"));
    }

    #[test]
    fn meets_dotted_compares_numeric_components() {
        assert!(meets_dotted(Some("140.0.3485.94"), "140.0.0.0"));
        assert!(meets_dotted(Some("141.0.0.0"), "140.0.0.0"));
        assert!(!meets_dotted(Some("139.0.0.0"), "140.0.0.0"));
        assert!(!meets_dotted(None, "140.0.0.0"));
        assert!(!meets_dotted(Some("not-a-version"), "140.0.0.0"));
    }

    /// select-source 非法 dep 经 handler 层返回 InvalidInput（不触网不落盘）。
    #[tokio::test]
    async fn select_source_inner_rejects_unknown_dep() {
        let state = crate::test_util::test_server_state();
        let input = SelectInput { dep: "bogus".into(), mode: "auto".into() };
        let err = select_source_inner(&state, input).await.expect_err("unknown dep must fail");
        assert!(matches!(err, AppError::InvalidInput(_)), "unexpected error: {err}");
    }

    /// `host` 仅对拥有托管安装根的依赖有效；webview2/adlserver/netprobe
    /// 返回机器码 4xx。bash 由 PortableGit 托管，允许 `host`。
    #[test]
    fn select_source_rejects_host_for_deps_without_hosted_provider() {
        for dep in ["webview2", "adlserver", "netprobe"] {
            let err = validate_hosted_source(dep, SourceMode::Host).expect_err("no hosted source");
            assert!(
                matches!(err, AppError::InvalidInput(ref m) if m == "no-hosted-source"),
                "{dep}: unexpected error: {err}"
            );
        }
        for dep in ["bash", "webview2", "adlserver", "netprobe"] {
            assert!(validate_hosted_source(dep, SourceMode::Auto).is_ok());
            assert!(validate_hosted_source(dep, SourceMode::System).is_ok());
        }
        for dep in ["node", "git", "bash"] {
            assert!(validate_hosted_source(dep, SourceMode::Host).is_ok());
        }
    }

    /// handler 层同样拒绝，且不落盘（test state 用临时目录）。
    #[tokio::test]
    async fn select_source_inner_rejects_host_without_persisting() {
        let state = crate::test_util::test_server_state();
        let input = SelectInput { dep: "webview2".into(), mode: "host".into() };
        let err = select_source_inner(&state, input).await.expect_err("no hosted source");
        assert!(
            matches!(err, AppError::InvalidInput(ref m) if m == "no-hosted-source"),
            "unexpected error: {err}"
        );
        let config = adl_env::config::load(&state.storage.paths().root).unwrap();
        assert_eq!(config.webview2.mode, SourceMode::Auto);
    }

    /// bash 的 `host` 合法并落盘（宿主 PortableGit 提供 bash）。
    #[tokio::test]
    async fn select_source_inner_accepts_bash_host_and_persists() {
        let state = crate::test_util::test_server_state();
        let input = SelectInput { dep: "bash".into(), mode: "host".into() };
        select_source_inner(&state, input).await.unwrap();
        let config = adl_env::config::load(&state.storage.paths().root).unwrap();
        assert_eq!(config.bash.mode, SourceMode::Host);
    }

    /// 宿主 PortableGit 里的 `bin/bash.exe` 让 bash 的 host 来源真正生效。
    #[test]
    fn bash_host_mode_uses_portable_git_bash() {
        let dir = std::env::temp_dir().join(format!(
            "adl-server-env-bash-hosted-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let hv = adl_hosted::HostedVersions::open(&dir, git::HOSTED_NAME, git::MARKER_REL);
        hv.mark_installed("2.56.0").expect("git marker");
        hv.write_selected("2.56.0").expect("select git");
        let bash_path = git::host_bash_path(&dir, "2.56.0");
        std::fs::create_dir_all(bash_path.parent().expect("bash parent")).expect("bash dir");
        std::fs::write(&bash_path, "").expect("bash marker");

        let mut sources = adl_env::config::EnvSourcesConfig::default();
        sources.bash.mode = SourceMode::Host;
        let state = super::bash_state(&dir, &sources);
        assert_eq!(state.effective, EffectiveSource::Host);
        assert_eq!(state.origin, Origin::Bundled);
        assert_eq!(state.path, Some(bash_path.to_string_lossy().into_owned()));
        assert!(state.meets_baseline);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// select-source 合法写入落盘（test state 用临时目录，不污染真实数据）。
    #[tokio::test]
    async fn select_source_inner_persists_mode() {
        let state = crate::test_util::test_server_state();
        let input = SelectInput { dep: "node".into(), mode: "host".into() };
        select_source_inner(&state, input).await.unwrap();
        let config = adl_env::config::load(&state.storage.paths().root).unwrap();
        assert_eq!(config.node.mode, SourceMode::Host);
    }

    /// N2：保存 source 后必须立即失效状态缓存，否则前端保存后的首次 status
    /// 会重绘旧 mode/effective（2s TTL 内）。
    #[tokio::test]
    async fn select_source_inner_invalidates_status_cache() {
        let state = crate::test_util::test_server_state();
        cache_put(&state.env_status_cache, serde_json::json!({ "stale": true })).await;
        let input = SelectInput { dep: "node".into(), mode: "system".into() };
        select_source_inner(&state, input).await.unwrap();
        assert!(
            cache_get(&state.env_status_cache, STATUS_CACHE_TTL).await.is_none(),
            "select-source must invalidate the status cache"
        );
    }

    /// N2：自定义路径保存同样立即失效状态缓存。
    #[tokio::test]
    async fn set_custom_path_inner_invalidates_status_cache() {
        let state = crate::test_util::test_server_state();
        cache_put(&state.env_status_cache, serde_json::json!({ "stale": true })).await;
        let input = CustomPathInput { dep: "node".into(), path: String::new() };
        set_custom_path_inner(&state, input).await.unwrap();
        assert!(
            cache_get(&state.env_status_cache, STATUS_CACHE_TTL).await.is_none(),
            "set-custom-path must invalidate the status cache"
        );
    }

    /// N1：错误快照是已结束任务，不能再被当作 running（否则 status 停止探测/
    /// 缓存，recheck 也无法恢复 registry 灯）。
    #[test]
    fn errored_task_is_not_treated_as_running() {
        let state = crate::test_util::test_server_state();
        assert!(!task_is_running(state.env_task.snapshot().as_ref()));
        assert!(state.env_task.begin_with("env-node-install", "node 22.14.0", false));
        assert!(task_is_running(state.env_task.snapshot().as_ref()));
        state.env_task.set_error("boom");
        assert!(!task_is_running(state.env_task.snapshot().as_ref()));
    }

    /// L9：全量 recheck（无 deps）返回完整快照，不再是 `{started:true}`。
    /// 用运行中任务避免真实 registry 探测（该分支不触网）。
    #[tokio::test]
    async fn recheck_full_returns_status_snapshot() {
        let state = crate::test_util::test_server_state();
        assert!(state.env_task.begin_with("env-node-install", "node 22.14.0", false));
        let value = recheck_inner(&state, axum::body::Bytes::new()).await.unwrap();
        for key in [
            "node",
            "git",
            "bash",
            "webview2",
            "adlserver",
            "netprobe",
            "task",
            "dataDir",
            "dshReady",
        ] {
            assert!(value.get(key).is_some(), "missing {key} in {value}");
        }
        assert!(value.get("started").is_none());
        state.env_task.finish();
    }

    /// 按 dep 重检只替换请求的依赖，其他块（含 dshReady）保持缓存原值。
    #[tokio::test]
    async fn recheck_deps_preserves_other_sections() {
        let state = crate::test_util::test_server_state();
        cache_put(
            &state.env_status_cache,
            serde_json::json!({
                "node": { "marker": "keep-node" },
                "git": { "marker": "keep-git" },
                "bash": { "marker": "keep-bash" },
                "webview2": { "marker": "keep-webview2" },
                "adlserver": { "marker": "keep-adlserver" },
                "netprobe": {
                    "registryOk": true,
                    "registryLatencyMs": 1,
                    "ciTokenConfigured": false
                },
                "task": null,
                "dataDir": "/tmp",
                "dshReady": true
            }),
        )
        .await;
        let body =
            axum::body::Bytes::from(serde_json::json!({ "deps": ["adlserver"] }).to_string());
        let value = recheck_inner(&state, body).await.unwrap();
        assert_eq!(value["git"]["marker"], "keep-git");
        assert_eq!(value["webview2"]["marker"], "keep-webview2");
        assert_eq!(value["node"]["marker"], "keep-node");
        assert_eq!(value["dshReady"], true);
        // 只探测了 adlserver：其余依赖仍是种子标记，没有被动过。
        assert_eq!(value["adlserver"]["marker"], serde_json::Value::Null);
        assert!(value["adlserver"]["meetsBaseline"].is_boolean());
    }

    /// 进行中任务期间 recheck 必须返回新鲜的 task 快照（不能被缓存里的旧 null 抹掉）。
    #[tokio::test]
    async fn recheck_keeps_running_task_snapshot() {
        let state = crate::test_util::test_server_state();
        cache_put(
            &state.env_status_cache,
            serde_json::json!({
                "node": { "marker": "keep-node" },
                "git": { "marker": "keep-git" },
                "bash": { "marker": "keep-bash" },
                "webview2": { "marker": "keep-webview2" },
                "adlserver": { "marker": "keep-adlserver" },
                "netprobe": {
                    "registryOk": true,
                    "registryLatencyMs": 1,
                    "ciTokenConfigured": false
                },
                "task": null,
                "dataDir": "/tmp",
                "dshReady": true
            }),
        )
        .await;
        assert!(state.env_task.begin_with("env-git-install", "git 1.0.0", false));
        let body =
            axum::body::Bytes::from(serde_json::json!({ "deps": ["adlserver"] }).to_string());
        let value = recheck_inner(&state, body).await.unwrap();
        assert_eq!(value["task"]["kind"], "env-git-install");
        assert_eq!(value["task"]["version"], "git 1.0.0");
        state.env_task.finish();
    }

    /// deps 校验：未知依赖与 netprobe 都是 4xx；重复项去重。
    #[test]
    fn parse_recheck_deps_validates_and_dedupes() {
        assert!(parse_recheck_deps(&axum::body::Bytes::from(r#"{"deps":["netprobe"]}"#)).is_err());
        assert!(parse_recheck_deps(&axum::body::Bytes::from(r#"{"deps":["bogus"]}"#)).is_err());
        assert_eq!(
            parse_recheck_deps(&axum::body::Bytes::from(r#"{"deps":["node","node"]}"#)).unwrap(),
            vec!["node"]
        );
        assert!(parse_recheck_deps(&axum::body::Bytes::new()).unwrap().is_empty());
    }

    /// 两个 dep 并发重检：锁内合并到当前缓存，后完成者包含前者的新值，互不覆盖。
    #[tokio::test]
    async fn recheck_concurrent_deps_merge_both() {
        let state = crate::test_util::test_server_state();
        cache_put(
            &state.env_status_cache,
            serde_json::json!({
                "node": { "marker": "keep-node" },
                "git": { "marker": "keep-git" },
                "bash": { "marker": "keep-bash" },
                "webview2": { "marker": "keep-webview2" },
                "adlserver": { "marker": "keep-adlserver" },
                "netprobe": {
                    "registryOk": true,
                    "registryLatencyMs": 1,
                    "ciTokenConfigured": false
                },
                "task": null,
                "dataDir": "/tmp",
                "dshReady": true
            }),
        )
        .await;
        let node = recheck_inner(
            &state,
            axum::body::Bytes::from(serde_json::json!({ "deps": ["node"] }).to_string()),
        );
        let git = recheck_inner(
            &state,
            axum::body::Bytes::from(serde_json::json!({ "deps": ["git"] }).to_string()),
        );
        let (node_result, git_result) = tokio::join!(node, git);
        node_result.unwrap();
        git_result.unwrap();

        let cached = {
            let guard = state.env_status_cache.lock().await;
            guard.as_ref().map(|(_, value)| value.clone()).unwrap()
        };
        // node / git 两个 dep 都被新探测结果替换；其它块保持种子标记。
        assert_eq!(cached["node"]["marker"], serde_json::Value::Null);
        assert_eq!(cached["git"]["marker"], serde_json::Value::Null);
        // 序列化失败会写成 null（对非 object 取 ["marker"] 也是 Null）：用形状字段兜底。
        assert!(cached["node"]["meetsBaseline"].is_boolean());
        assert!(cached["git"]["meetsBaseline"].is_boolean());
        assert_eq!(cached["adlserver"]["marker"], "keep-adlserver");
    }

    /// `/env/uninstall` 白名单：仅 node/git 拥有托管版本目录。
    #[test]
    fn validate_uninstall_whitelists_hosted_deps() {
        assert_eq!(validate_uninstall("node").unwrap(), "node");
        assert_eq!(validate_uninstall("git").unwrap(), "git");
    }

    #[test]
    fn validate_uninstall_rejects_unknown_dep() {
        let err = validate_uninstall("bogus").expect_err("unknown dep");
        assert!(
            matches!(err, AppError::InvalidInput(ref m) if m.contains("unknown env dependency")),
            "unexpected error: {err}"
        );
    }

    /// webview2/adlserver/netprobe 不归托管版本目录管理 → 机器码 `not-managed`。
    #[test]
    fn validate_uninstall_rejects_unmanaged_dep() {
        for dep in ["webview2", "adlserver", "netprobe"] {
            let err = validate_uninstall(dep).expect_err("unmanaged dep");
            assert!(
                matches!(err, AppError::InvalidInput(ref m) if m == "not-managed"),
                "{dep}: unexpected error: {err}"
            );
        }
    }

    /// bash 无宿主托管版本 → 机器码 `bash-follows-git`。
    #[test]
    fn validate_uninstall_points_bash_at_git() {
        let err = validate_uninstall("bash").expect_err("bash follows git");
        assert!(
            matches!(err, AppError::InvalidInput(ref m) if m == "bash-follows-git"),
            "unexpected error: {err}"
        );
    }

    /// 缺省 version 走 selected 分支：从托管根读到 `selected.txt` 的版本；
    /// 同时钉住任务 kind（前端按 `env-{dep}-uninstall` 过滤轮询）。
    #[test]
    fn selected_hosted_version_reads_selected_and_kind_is_pinned() {
        let root = std::env::temp_dir().join(format!(
            "adl-server-env-uninstall-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let hv = adl_hosted::HostedVersions::open(&root, node::HOSTED_NAME, node::MARKER_REL);
        hv.mark_installed("22.14.0").expect("mark installed");
        hv.write_selected("22.14.0").expect("write selected");
        assert_eq!(
            selected_hosted_version(&root, "node").expect("selected"),
            Some("22.14.0".to_string())
        );
        assert_eq!(uninstall_kind("node"), "env-node-uninstall");
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 缺省 version 且该 dep 没有 selected 托管版本 → 4xx，不启动后台任务。
    #[tokio::test]
    async fn uninstall_inner_requires_selected_version_when_omitted() {
        let state = crate::test_util::test_server_state();
        let input = UninstallInput { dep: "node".into(), version: None };
        let err = uninstall_inner(&state, input).await.expect_err("no selection");
        assert!(
            matches!(err, AppError::InvalidInput(ref m) if m == "no-selected-version"),
            "unexpected error: {err}"
        );
        assert!(state.env_task.snapshot().is_none(), "no task must be started");
    }

    /// 不归托管依赖经 handler 层同样是 4xx，且不启动任务。
    #[tokio::test]
    async fn uninstall_inner_rejects_unmanaged_dep_without_starting_task() {
        let state = crate::test_util::test_server_state();
        let input = UninstallInput { dep: "webview2".into(), version: Some("1.0.0".into()) };
        let err = uninstall_inner(&state, input).await.expect_err("unmanaged dep");
        assert!(
            matches!(err, AppError::InvalidInput(ref m) if m == "not-managed"),
            "unexpected error: {err}"
        );
        assert!(state.env_task.snapshot().is_none());
    }

    /// 路由已挂载：POST /env/uninstall 命中 handler（未挂载会是 404，
    /// 这里断言校验失败返回 400），不触发真实卸载。
    #[tokio::test]
    async fn uninstall_route_is_mounted() {
        use tower::ServiceExt;
        let state = crate::test_util::test_server_state();
        let app = crate::router::app_router(state.clone()).with_state(state);
        let request = axum::http::Request::builder()
            .method("POST")
            .uri("/env/uninstall")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(r#"{"dep":"webview2"}"#))
            .expect("request");
        let response = app.oneshot(request).await.expect("route");
        assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
    }

    /// EnvStatus DTO 自有 camelCase：七节 + dshReady 全 camelCase，
    /// provider 侧保持 snake_case 不受影响。
    #[test]
    fn env_status_serializes_camel_case() {
        let status = EnvStatus {
            node: dep_state(true),
            git: dep_state(false),
            bash: dep_state(false),
            webview2: dep_state(false),
            adlserver: dep_state(false),
            netprobe: NetprobeState {
                registry_ok: true,
                registry_latency_ms: 12,
                ci_token_configured: false,
            },
            task: None,
            data_dir: "C:/data-root".into(),
            dsh_ready: true,
        };
        let v = serde_json::to_value(&status).unwrap();
        assert_eq!(v.get("dshReady").and_then(|b| b.as_bool()), Some(true));
        assert_eq!(v.get("dataDir").and_then(|s| s.as_str()), Some("C:/data-root"));
        assert_eq!(v["node"].get("meetsBaseline").and_then(|b| b.as_bool()), Some(true));
        assert_eq!(v["netprobe"].get("registryOk").and_then(|b| b.as_bool()), Some(true));
        assert_eq!(v["netprobe"].get("ciTokenConfigured").and_then(|b| b.as_bool()), Some(false));
        assert!(v.get("task").is_some());
        assert!(v.get("dsh_ready").is_none());
        assert!(v.get("data_dir").is_none());
        assert!(v["node"].get("meets_baseline").is_none());
    }

    /// 显式空白版本 → 4xx，且不启动后台任务（不静默回落到 selected）。
    #[tokio::test]
    async fn uninstall_inner_rejects_blank_version_without_starting_task() {
        let state = crate::test_util::test_server_state();
        let input = UninstallInput { dep: "node".into(), version: Some("   ".into()) };
        let err = uninstall_inner(&state, input).await.expect_err("blank version");
        assert!(
            matches!(err, AppError::InvalidInput(ref m) if m.contains("empty")),
            "unexpected error: {err}"
        );
        assert!(state.env_task.snapshot().is_none());
    }

    /// 状态缓存：TTL 内命中、过期失效、显式清理。离线单元测试（不触网）。
    #[tokio::test]
    async fn status_cache_hits_within_ttl_expires_and_clears() {
        let cache = tokio::sync::Mutex::new(None);
        cache_put(&cache, serde_json::json!({ "a": 1 })).await;
        let hit = cache_get(&cache, STATUS_CACHE_TTL).await.expect("fresh entry");
        assert_eq!(hit["a"], 1);
        cache_clear(&cache).await;
        assert!(cache_get(&cache, STATUS_CACHE_TTL).await.is_none(), "clear must invalidate");

        cache_put(&cache, serde_json::json!({ "b": 2 })).await;
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        assert!(
            cache_get(&cache, std::time::Duration::from_millis(10)).await.is_none(),
            "entry older than the TTL must not be served"
        );
    }

    /// M2：bash 显式自定义路径按 `Manual` 处理，并在 system 侧优先于探测候选。
    #[test]
    fn bash_custom_path_is_preferred_manual_system_source() {
        let dir = std::env::temp_dir().join(format!(
            "adl-server-env-bash-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let manual = dir.join("bash.exe");
        std::fs::write(&manual, "").expect("write manual bash");
        let manual = manual.to_string_lossy().into_owned();

        let mut sources = adl_env::config::EnvSourcesConfig::default();
        sources.bash.mode = SourceMode::System;
        sources.bash.custom_path = Some(manual.clone());
        let detected = bash::BashCandidate {
            kind: bash::BashKind::GitBundled,
            path: "C:/Program Files/Git/bin/bash.exe".into(),
        };
        let state = bash_state_from_candidates(&dir, &sources, vec![detected]);
        assert_eq!(state.effective, EffectiveSource::System);
        assert_eq!(state.origin, Origin::Manual);
        assert_eq!(state.path, Some(manual));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// M8：未 finish 的后台任务（panic/提前返回）由守卫补错误并释放运行槽，
    /// 下一次 `try_begin` 必须成功；正常失败路径的错误不被守卫覆盖。
    #[test]
    fn run_guard_releases_aborted_task_for_next_begin() {
        let state = crate::test_util::test_server_state();
        assert!(state.env_task.begin_with("env-node-install", "node 22.14.0", false));
        {
            let _guard = RunGuard::new(&state);
        }
        let snap = state.env_task.snapshot().expect("errored snapshot stays pollable");
        assert!(snap.error.is_some(), "guard must record the abort reason");
        assert!(!snap.cancellable, "env tasks are never cancellable");
        assert!(try_begin_env_task(&state, "env-node-install", "node 22.14.0").is_ok());

        state.env_task.set_error("boom");
        {
            let _guard = RunGuard::new(&state);
        }
        assert_eq!(
            state.env_task.snapshot().and_then(|s| s.error).as_deref(),
            Some("boom"),
            "handled failure errors must be preserved"
        );
    }
}
