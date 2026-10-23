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

/// Parse a source mode (`auto`/`system`/`host`); anything else is `InvalidInput`.
pub fn parse_mode(mode: &str) -> Result<adl_env::SourceMode, AppError> {
    match mode {
        "auto" => Ok(adl_env::SourceMode::Auto),
        "system" => Ok(adl_env::SourceMode::System),
        "host" => Ok(adl_env::SourceMode::Host),
        _ => Err(AppError::InvalidInput(format!("invalid source mode: {mode}"))),
    }
}

/// `host` mode requires a hosted provider. `webview2`/`adlserver`/`netprobe`
/// have no hosted install root, so selecting `host` is a machine-coded 4xx
/// (`no-hosted-source`) rather than a silently ineffective preference.
pub fn validate_hosted_source(dep: &str, mode: adl_env::SourceMode) -> Result<(), AppError> {
    if mode == adl_env::SourceMode::Host && matches!(dep, "webview2" | "adlserver" | "netprobe") {
        return Err(AppError::InvalidInput("no-hosted-source".into()));
    }
    Ok(())
}

/// Whitelist deps that own a hosted install root for uninstall: `node|git`.
/// `bash` ships inside the hosted git dir; `webview2`/`adlserver`/`netprobe`
/// are not managed through hosted version dirs. Machine codes (not prose) so
/// the frontend can branch on them.
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

async fn status_inner(state: &ServerState) -> Result<serde_json::Value, AppError> {
    // 活动任务期间不走缓存（task 快照必须新鲜）且绝不触网：安装进度轮询
    // 不能被 registry 探测阻塞。
    let task = state.env_task.snapshot();
    if task.is_none() {
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

    let netprobe = if task.is_some() {
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
    if status.task.is_none() {
        cache_put(&state.env_status_cache, value.clone()).await;
    }
    Ok(value)
}

/// 复用缓存的短超时探测 client；仅下载源配置变化时重建。
async fn probe_client(
    state: &ServerState,
    download: &adl_download_source::DownloadSourceConfig,
) -> Result<reqwest::Client, AppError> {
    let key = serde_json::to_string(download).unwrap_or_default();
    let mut slot = state.env_probe_client.lock().await;
    if let Some((cached_key, client)) = slot.as_ref() {
        if cached_key == &key {
            return Ok(client.clone());
        }
    }
    let client = adl_download_source::build_http_client_with_timeout(download, PROBE_TIMEOUT)?;
    *slot = Some((key, client.clone()));
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
    let sys = match custom.as_deref() {
        Some(p) => detect_node_at(p),
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
    let git_host = adl_hosted::HostedVersions::open(root, git::HOSTED_NAME, git::MARKER_REL)
        .read_selected()
        .ok()
        .flatten();
    // 宿主 bash 挂在宿主 git 目录下（`host_bash_path`）：选中 git 且文件存在才算 host 侧可用。
    let mut host_version: Option<String> = None;
    if let Some(git_version) = git_host {
        let host_bash = bash::host_bash_path(root, &git_version);
        if host_bash.is_file() {
            candidates.insert(
                0,
                bash::BashCandidate {
                    kind: bash::BashKind::HostMinGit,
                    path: host_bash.to_string_lossy().into_owned(),
                },
            );
            host_version = Some(git_version);
        }
    }
    // 显式自定义路径是 `Manual`，在 system 侧优先于探测到的候选（不得排到末尾）。
    if let Some(p) = custom.as_deref() {
        if Path::new(p).is_file() {
            candidates.retain(|c| c.path != p);
            candidates.insert(
                0,
                bash::BashCandidate { kind: bash::BashKind::Manual, path: p.to_string() },
            );
        }
    }
    // manual 显式路径计入 system 侧可用（`mode: system + origin: manual` 语义）。
    let sys_available = candidates.iter().any(|c| !matches!(c.kind, bash::BashKind::HostMinGit));
    let effective = resolve(mode, sys_available, host_version).effective;
    let pick = match effective {
        EffectiveSource::Host => {
            candidates.iter().find(|c| matches!(c.kind, bash::BashKind::HostMinGit))
        },
        EffectiveSource::System => {
            candidates.iter().find(|c| !matches!(c.kind, bash::BashKind::HostMinGit))
        },
        EffectiveSource::None => None,
    };
    let (path, origin) = match pick {
        Some(c) => (
            Some(c.path.clone()),
            match c.kind {
                bash::BashKind::HostMinGit => Origin::Bundled,
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
/// response is `{ accepted: true }` and progress is polled via `status`.
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
            Ok(serde_json::json!({ "accepted": true, "dep": "node", "version": version }))
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
            Ok(serde_json::json!({ "accepted": true, "dep": "git", "version": version }))
        },
        // WebView2 由安装器管理：provider 直接返回机器码引导错误（4xx）。
        "webview2" => {
            webview2::install()?;
            Ok(serde_json::json!(true))
        },
        // bash 无独立宿主目录，随宿主 git 一起装。
        "bash" => Err(AppError::InvalidInput(
            "bash ships with the hosted git installation; install git instead".into(),
        )),
        _ => Err(AppError::InvalidInput(format!("{dep} cannot be installed"))),
    }
}

/// 后台执行 node 宿主安装（`env_install_lock` 下串行；进度经 `env_task`
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
        let _ = node::install(&version, &cfg, &task_state.env_task).await;
    });
}

/// 后台执行 MinGit 宿主安装（tag+asset 逐字透传 baseline；语义同上）。
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
            mingit_base: &base,
            mingit_tag: &tag,
            mingit_asset: &asset,
            download: &download,
        };
        let _ = git::install(&version, &cfg, &task_state.env_task).await;
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
    Ok(serde_json::json!({ "started": true }))
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
    let mut config = adl_env::config::load(&root)?;
    adl_env::config::apply_select(dep, mode, &mut config)?;
    adl_env::config::save(&root, &config)?;
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
    let mut config = adl_env::config::load(&root)?;
    adl_env::config::set_custom_path(
        &mut config,
        dep,
        if path.is_empty() { None } else { Some(path) },
    )?;
    adl_env::config::save(&root, &config)?;
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

/// POST `/env/recheck` — fresh detection snapshot (`{ dep? }` optional;
/// unknown dep is 4xx). Detection itself is live, but `/env/status` responses
/// are TTL-cached, so recheck explicitly invalidates that cache first.
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
    // 空 body 视为 `{}`（与 `select-source` 的严格 body 口径不同：recheck 无必填字段）。
    if !body.is_empty() {
        let input: RecheckInput =
            serde_json::from_slice(&body).map_err(|e| AppError::InvalidInput(e.to_string()))?;
        if let Some(dep) = input.dep.as_deref() {
            parse_dep(dep)?;
        }
    }
    cache_clear(&state.env_status_cache).await;
    status_inner(state).await
}

#[derive(serde::Deserialize)]
struct RecheckInput {
    #[serde(default)]
    dep: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{
        EnvStatus, NetprobeState, RunGuard, STATUS_CACHE_TTL, SelectInput, UninstallInput,
        bash_state_from_candidates, cache_clear, cache_get, cache_put, meets_dotted, meets_semver,
        parse_dep, parse_mode, select_source_inner, selected_hosted_version, try_begin_env_task,
        uninstall_inner, uninstall_kind, validate_hosted_source, validate_uninstall,
    };
    use adl_env::providers::{bash, node};
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

    /// `host` 仅对拥有托管安装根的三类依赖有效；无托管来源返回机器码 4xx。
    #[test]
    fn select_source_rejects_host_for_deps_without_hosted_provider() {
        for dep in ["webview2", "adlserver", "netprobe"] {
            let err = validate_hosted_source(dep, SourceMode::Host).expect_err("no hosted source");
            assert!(
                matches!(err, AppError::InvalidInput(ref m) if m == "no-hosted-source"),
                "{dep}: unexpected error: {err}"
            );
        }
        for dep in ["webview2", "adlserver", "netprobe"] {
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

    /// select-source 合法写入落盘（test state 用临时目录，不污染真实数据）。
    #[tokio::test]
    async fn select_source_inner_persists_mode() {
        let state = crate::test_util::test_server_state();
        let input = SelectInput { dep: "node".into(), mode: "host".into() };
        select_source_inner(&state, input).await.unwrap();
        let config = adl_env::config::load(&state.storage.paths().root).unwrap();
        assert_eq!(config.node.mode, SourceMode::Host);
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

    /// bash 随宿主 git 一起装 → 机器码 `bash-follows-git`。
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
