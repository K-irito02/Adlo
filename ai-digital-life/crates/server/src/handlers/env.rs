//! Env domain HTTP handlers — environment dependency status + hosted installs.
//!
//! Follows the dsh domain recipe: `State(state): State<ServerState>`, results
//! wrapped with [`crate::ipc::to_response`]. Installs run under
//! `env_install_lock` with progress on `env_task` (kind `"env-{dep}-install"`);
//! the install itself runs in a background `tokio::spawn` and the frontend
//! polls the `task` section of `GET /env/status` while it runs — the same
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
/// install `task` snapshot (seven sections), plus the derived `dshReady`
/// flag (`dsh_ready = node.meetsBaseline` — the harness needs node).
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
    pub dsh_ready: bool,
}

/// GET `/env/status` — full environment snapshot (detections are live on
/// every call; there is no detection cache in this phase).
pub async fn status(State(state): State<ServerState>) -> impl IntoResponse {
    let result = status_inner(&state).await;
    ipc::to_response(result)
}

async fn status_inner(state: &ServerState) -> Result<serde_json::Value, AppError> {
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

    // netprobe：共享 registry/proxy 感知 client（不另建第二个 client）。
    let download = adl_download_source::load(&root)?;
    let client = adl_download_source::build_http_client(&download)?;
    let probe = adl_env::providers::netprobe::check(
        &client,
        adl_download_source::resolve_registry(&download),
    )
    .await;
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

    let dsh_ready = det.node.meets_baseline;
    let status = EnvStatus {
        node: det.node,
        git: det.git,
        bash: det.bash,
        webview2: det.webview2,
        adlserver: det.adlserver,
        netprobe: NetprobeState {
            registry_ok: probe.registry_ok,
            registry_latency_ms: probe.registry_latency_ms,
            ci_token_configured,
        },
        task: state.env_task.snapshot(),
        dsh_ready,
    };
    serde_json::to_value(&status).map_err(|e| AppError::Internal(e.to_string()))
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
    let mode = sources.bash.mode;
    let custom = sources.bash.custom_path.clone().filter(|p| !p.is_empty());
    let git_host = adl_hosted::HostedVersions::open(root, git::HOSTED_NAME, git::MARKER_REL)
        .read_selected()
        .ok()
        .flatten();
    let mut candidates = bash::detect();
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
    if let Some(p) = custom.as_deref() {
        if Path::new(p).is_file() && !candidates.iter().any(|c| c.path == p) {
            candidates
                .push(bash::BashCandidate { kind: bash::BashKind::Manual, path: p.to_string() });
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

/// Install 占位（已有任务在跑则拒绝；上次失败残留的 error 快照在新请求时回收，
/// 否则一次失败会永久阻塞后续安装——成功路径由 provider `finish()` 清理）。
fn try_begin_env_task(state: &ServerState, kind: &str, label: &str) -> Result<(), AppError> {
    if state.env_task.begin(kind, label) {
        return Ok(());
    }
    let stale_error = state.env_task.snapshot().is_some_and(|s| s.error.is_some());
    if stale_error {
        state.env_task.finish();
        if state.env_task.begin(kind, label) {
            return Ok(());
        }
    }
    tracing::debug!(?kind, %label, "env::install: begin rejected (another task running)");
    Err(AppError::InvalidInput("another env install is already running".into()))
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
        let _guard = task_state.env_install_lock.clone().lock_owned().await;
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
        let _guard = task_state.env_install_lock.clone().lock_owned().await;
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
/// unknown dep is 4xx). Detection is uncached/live, so this is a fresh
/// `status` by construction ("clear cache" is a no-op: no cache exists).
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
        EnvStatus, NetprobeState, SelectInput, meets_dotted, meets_semver, parse_dep, parse_mode,
        select_source_inner,
    };
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

    /// select-source 合法写入落盘（test state 用临时目录，不污染真实数据）。
    #[tokio::test]
    async fn select_source_inner_persists_mode() {
        let state = crate::test_util::test_server_state();
        let input = SelectInput { dep: "node".into(), mode: "host".into() };
        select_source_inner(&state, input).await.unwrap();
        let config = adl_env::config::load(&state.storage.paths().root).unwrap();
        assert_eq!(config.node.mode, SourceMode::Host);
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
            dsh_ready: true,
        };
        let v = serde_json::to_value(&status).unwrap();
        assert_eq!(v.get("dshReady").and_then(|b| b.as_bool()), Some(true));
        assert_eq!(v["node"].get("meetsBaseline").and_then(|b| b.as_bool()), Some(true));
        assert_eq!(v["netprobe"].get("registryOk").and_then(|b| b.as_bool()), Some(true));
        assert_eq!(v["netprobe"].get("ciTokenConfigured").and_then(|b| b.as_bool()), Some(false));
        assert!(v.get("task").is_some());
        assert!(v.get("dsh_ready").is_none());
        assert!(v["node"].get("meets_baseline").is_none());
    }
}
