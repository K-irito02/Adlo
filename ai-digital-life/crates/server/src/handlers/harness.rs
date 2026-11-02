//! 通用 harness 版本管理 HTTP handlers（OpenCode CLI；DSH 保留自身端点）。
//!
//! 版本内核在 `adl_harness_version`：本模块只负责把 `opencode` 描述符、版本目录、
//! 版本任务与来源偏好接到 HTTP 上。DSH 的运行态（端口/标签/auth）不在此处。

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use axum::extract::State;
use axum::response::IntoResponse;
use serde::Deserialize;

use crate::ServerState;
use crate::ipc;
use adl_download_source;
use adl_errors::AppError;
use adl_harness_version as hv;
use adl_harness_version::spec;

const HARNESS_KEY: &str = "opencode";

fn root(state: &ServerState) -> PathBuf {
    state.storage.paths().harness_versions_dir(HARNESS_KEY)
}

/// 托管 OpenCode 的数据隔离变量：只在宿主托管 + 注入开启时使用独立数据库。
///
/// 用户本机可能装着更高版本的 OpenCode（例如 OpenCode Desktop），它与 CLI 共用
/// `~/.local/share/opencode/opencode.db`，但 schema 不兼容（新库无 `session` 表）；
/// 托管版本直接打开会报 `Database is not empty and has no session table`。
/// 用 `OPENCODE_DB` 把托管版本的会话数据库放到应用数据目录，避免互相破坏。
fn managed_terminal_env(
    harness_root: &Path,
    effective: hv::EffectiveSource,
    selected: Option<&str>,
    injection_enabled: bool,
) -> Vec<(OsString, OsString)> {
    if !injection_enabled || effective != hv::EffectiveSource::Host || selected.is_none() {
        return Vec::new();
    }
    let base = harness_root.parent().unwrap_or(harness_root);
    let db = base.join("managed").join("opencode.db");
    vec![(OsString::from("OPENCODE_DB"), db.into_os_string())]
}

/// 按当前「版本来源 + 已装版本」刷新终端 PATH 与数据隔离注入。
///
/// 只有解析为宿主托管且该版本完整安装时才注入；system / 未安装 → 清空。
/// 在启动与每次版本变更/来源切换后调用（新会话生效）。
pub fn refresh_managed_bins(state: &ServerState) {
    let harness_root = root(state);
    let data_dir = &state.storage.paths().root;
    let config = adl_download_source::load(data_dir);
    let injection_enabled = config.as_ref().map(|c| c.opencode_terminal_injection).unwrap_or(true);
    let mode = config
        .map(|c| c.opencode_version_source)
        .unwrap_or(adl_download_source::VersionSourceMode::Auto);
    let selected = hv::read_selected_for(&spec::OPENCODE, &harness_root).ok().flatten();
    let installed = selected
        .as_deref()
        .is_some_and(|v| hv::is_version_installed_for(&spec::OPENCODE, &harness_root, v));
    let has_system = hv::detect_system_bin(&spec::OPENCODE).is_some();
    let effective = hv::resolve_effective_source(mode, false, installed, has_system);
    let dirs = match (&effective, selected.as_deref()) {
        (hv::EffectiveSource::Host, Some(version)) if injection_enabled => {
            vec![adl_pty::managed_bins::bin_dir_for(
                &harness_root.join("installed").join(version),
                spec::OPENCODE.marker_rel,
            )]
        },
        _ => Vec::new(),
    };
    let env =
        managed_terminal_env(&harness_root, effective, selected.as_deref(), injection_enabled);
    // SQLite 不会自动创建父目录；先建好托管数据库目录（失败时注入仍会带上路径，
    // 由用户侧报错暴露，不静默改写为共享 DB）。
    if let Some((_, value)) = env.first() {
        if let Some(parent) = Path::new(value).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    adl_pty::managed_bins::set_managed_bin_dirs(dirs);
    adl_pty::managed_bins::set_managed_env(env);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionInput {
    version: String,
    #[serde(default)]
    select: Option<bool>,
}

fn try_begin(state: &ServerState, kind: &str, version: &str) -> Result<(), AppError> {
    if state.opencode_version_task.begin(kind, version) {
        Ok(())
    } else {
        Err(AppError::InvalidInput("another version task is running".into()))
    }
}

/// `POST /opencode/get-version-status`
pub async fn get_version_status(State(state): State<ServerState>) -> impl IntoResponse {
    let result =
        hv::get_version_status_for(&spec::OPENCODE, &root(&state), &state.storage.paths().root)
            .await
            .map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// `POST /opencode/version-catalog`
pub async fn get_version_catalog(State(state): State<ServerState>) -> impl IntoResponse {
    let result = hv::fetch_catalog_for(&spec::OPENCODE, &state.storage.paths().root)
        .await
        .map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// `POST /opencode/install-version` body `{ version, select? }`
pub async fn install_version(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let version = input.version.trim().to_string();
    let select = input.select.unwrap_or(true);
    let harness_root = root(&state);
    let kind = if hv::is_version_installed_for(&spec::OPENCODE, &harness_root, &version) {
        "opencode-reinstall"
    } else {
        "opencode-install"
    };
    if let Err(e) = try_begin(&state, kind, &version) {
        return ipc::to_response(Err(e));
    }
    let _guard = state.opencode_version_lock.lock().await;
    let result = hv::install_version_with_task_for(
        &spec::OPENCODE,
        &harness_root,
        &state.storage.paths().root,
        &version,
        &state.opencode_version_task,
        select,
    )
    .await
    .map(|v| serde_json::json!(v));
    state.opencode_version_task.finish();
    refresh_managed_bins(&state);
    ipc::to_response(result)
}

/// `POST /opencode/update`
pub async fn update(State(state): State<ServerState>) -> impl IntoResponse {
    let harness_root = root(&state);
    if let Err(e) = try_begin(&state, "opencode-update", "latest") {
        return ipc::to_response(Err(e));
    }
    let _guard = state.opencode_version_lock.lock().await;
    let result = hv::update_for(
        &spec::OPENCODE,
        &harness_root,
        &state.storage.paths().root,
        &state.opencode_version_task,
    )
    .await
    .map(|v| serde_json::json!(v));
    state.opencode_version_task.finish();
    refresh_managed_bins(&state);
    ipc::to_response(result)
}

/// `POST /opencode/revert` body `{ version }`
pub async fn revert(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = hv::revert_for(&spec::OPENCODE, &root(&state), &input.version)
        .await
        .map(|v| serde_json::json!(v));
    refresh_managed_bins(&state);
    ipc::to_response(result)
}

/// `POST /opencode/uninstall` body `{ version }`
pub async fn uninstall(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    if let Err(e) = try_begin(&state, "opencode-uninstall", &input.version) {
        return ipc::to_response(Err(e));
    }
    let _guard = state.opencode_version_lock.lock().await;
    let result = hv::uninstall_for(
        &spec::OPENCODE,
        &root(&state),
        &input.version,
        &state.opencode_version_task,
    )
    .await
    .map(|()| serde_json::json!(true));
    state.opencode_version_task.finish();
    refresh_managed_bins(&state);
    ipc::to_response(result)
}

/// `POST /opencode/reinstall`
pub async fn reinstall(State(state): State<ServerState>) -> impl IntoResponse {
    let harness_root = root(&state);
    let selected = match hv::read_selected_for(&spec::OPENCODE, &harness_root) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return ipc::to_response(Err(AppError::NotFound("no selected version".into())));
        },
        Err(e) => return ipc::to_response(Err(e)),
    };
    if let Err(e) = try_begin(&state, "opencode-reinstall", &selected) {
        return ipc::to_response(Err(e));
    }
    let _guard = state.opencode_version_lock.lock().await;
    let result = hv::reinstall_for(
        &spec::OPENCODE,
        &harness_root,
        &state.storage.paths().root,
        &state.opencode_version_task,
    )
    .await
    .map(|v| serde_json::json!(v));
    state.opencode_version_task.finish();
    refresh_managed_bins(&state);
    ipc::to_response(result)
}

/// `POST /opencode/version-task`
pub async fn get_version_task(State(state): State<ServerState>) -> impl IntoResponse {
    let task = state.opencode_version_task.snapshot();
    ipc::to_response(Ok(serde_json::json!({ "task": task })))
}

/// `POST /opencode/cancel-version-task`
pub async fn cancel_version_task(State(state): State<ServerState>) -> impl IntoResponse {
    state.opencode_version_task.cancel();
    ipc::to_response(Ok(serde_json::json!(true)))
}

/// `POST /opencode/source-status` — 系统安装 + 版本来源解析（无运行态）。
pub async fn get_source_status(State(state): State<ServerState>) -> impl IntoResponse {
    let result = source_status_inner(&state);
    ipc::to_response(result)
}

fn source_status_inner(state: &ServerState) -> Result<serde_json::Value, AppError> {
    let data_dir = state.storage.paths().root.clone();
    let harness_root = root(state);
    let config = adl_download_source::load(&data_dir)?;
    let system = hv::detect_system_bin(&spec::OPENCODE).map(|info| {
        serde_json::json!({
            "path": info.path,
            "version": info.version,
        })
    });
    let host_version = hv::read_selected_for(&spec::OPENCODE, &harness_root)?
        .filter(|v| hv::is_version_installed_for(&spec::OPENCODE, &harness_root, v));
    let mode = config.opencode_version_source;
    let has_system = system.is_some();
    let has_host = host_version.is_some();
    let resolve = |mode: adl_download_source::VersionSourceMode| {
        hv::resolve_effective_source(mode, false, has_host, has_system)
    };
    Ok(serde_json::json!({
        "system": system,
        "versionSource": {
            "mode": mode,
            "effective": resolve(mode),
            "resolvedByMode": {
                "auto": resolve(adl_download_source::VersionSourceMode::Auto),
                "system": resolve(adl_download_source::VersionSourceMode::System),
                "host": resolve(adl_download_source::VersionSourceMode::Host),
            },
            "hostVersion": host_version,
        },
        "config": {
            "version_source": mode,
            "source_mode": config.source_mode,
            "npm_registry": config.npm_registry,
        },
        "terminalInjection": config.opencode_terminal_injection,
    }))
}

/// `POST /opencode/version-source` body `{ mode }`
pub async fn save_version_source(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    #[derive(Deserialize)]
    struct Input {
        mode: adl_download_source::VersionSourceMode,
    }
    let input: Input = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = (|| {
        let data_dir = &state.storage.paths().root;
        let mut config = adl_download_source::load(data_dir)?;
        config.opencode_version_source = input.mode;
        adl_download_source::save(data_dir, &config)
    })();
    refresh_managed_bins(&state);
    ipc::to_response(result.map(|()| serde_json::json!(true)))
}

/// `POST /opencode/terminal-injection` body `{ enabled }`
pub async fn save_terminal_injection(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    #[derive(Deserialize)]
    struct Input {
        enabled: bool,
    }
    let input: Input = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = (|| {
        let data_dir = &state.storage.paths().root;
        let mut config = adl_download_source::load(data_dir)?;
        config.opencode_terminal_injection = input.enabled;
        adl_download_source::save(data_dir, &config)
    })();
    refresh_managed_bins(&state);
    ipc::to_response(result.map(|()| serde_json::json!(true)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_harness_version::EffectiveSource;

    #[test]
    fn managed_env_isolates_opencode_db_only_for_host_source() {
        let harness_root = Path::new("data/harnesses/opencode/versions");
        let expected = Path::new("data/harnesses/opencode/managed").join("opencode.db");

        let env = managed_terminal_env(harness_root, EffectiveSource::Host, Some("1.19.5"), true);
        assert_eq!(env.len(), 1);
        assert_eq!(env[0].0, OsString::from("OPENCODE_DB"));
        assert_eq!(Path::new(&env[0].1), expected);

        for (effective, selected, enabled) in [
            (EffectiveSource::System, Some("1.19.5"), true),
            (EffectiveSource::None, Some("1.19.5"), true),
            (EffectiveSource::Host, None, true),
            (EffectiveSource::Host, Some("1.19.5"), false),
        ] {
            assert!(
                managed_terminal_env(harness_root, effective, selected, enabled).is_empty(),
                "unexpected env for {effective:?} selected={selected:?} enabled={enabled}"
            );
        }
    }
}
