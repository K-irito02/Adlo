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

const OPENCODE_LINES: &[&spec::HarnessSpec] = &[&spec::OPENCODE, &spec::OPENCODE_V2];

/// 该描述符是否 2.x 包线（`@opencode/cli`）。
fn is_v2_line(spec: &spec::HarnessSpec) -> bool {
    spec.package == spec::OPENCODE_V2.package
}

/// 按版本号选择包线：优先读安装时写入的 `.adl-package` 标记。
///
/// 预发布版本无法按 major 反推：1.x 与 2.x 的 beta 都是 `0.0.0-beta-*`（major 0），
/// 只看 major 会把 2.x beta 路由到 1.x 包并报「未发布」。没有标记的旧安装回退到
/// major 规则（2.x 正式版 major >= 2，其余按 1.x），与历史行为一致。
fn spec_for_version(root: &Path, version: &str) -> &'static spec::HarnessSpec {
    if let Some(spec) =
        hv::read_line_for(root, version).filter(|spec| spec.id == spec::HarnessId::OpenCode)
    {
        return spec;
    }
    match semver::Version::parse(version) {
        Ok(v) if v.major >= 2 => &spec::OPENCODE_V2,
        Ok(v) if !v.pre.is_empty() => {
            // 所有预发布安装都会写 `.adl-package`；走到这里说明标记丢失/损坏。
            // 预发布无法从 major 区分包线，回退 1.x 是唯一安全默认，但必须留痕。
            tracing::warn!(%version, "opencode: missing package line marker for prerelease");
            &spec::OPENCODE
        },
        _ => &spec::OPENCODE,
    }
}

/// 安装**尚未落盘**的版本时确定包线：没有 `.adl-package` 标记，只能探测 registry。
///
/// 预发布（major 0）先查 `@opencode/cli`，命中走 2.x；明确 404 才回退 1.x。
/// 探测本身失败（超时/5xx/代理）必须上抛为网络错误，不能当成「2.x 没有此版本」，
/// 否则用户会看到误导性的「未发布」。
async fn spec_for_new_install(
    data_dir: &Path,
    root: &Path,
    version: &str,
) -> Result<&'static spec::HarnessSpec, AppError> {
    if let Some(spec) =
        hv::read_line_for(root, version).filter(|spec| spec.id == spec::HarnessId::OpenCode)
    {
        return Ok(spec);
    }
    match semver::Version::parse(version) {
        Ok(v) if v.major >= 2 => Ok(&spec::OPENCODE_V2),
        Ok(v) if v.major == 0 => {
            match hv::version_exists(&spec::OPENCODE_V2, data_dir, version).await {
                Ok(true) => Ok(&spec::OPENCODE_V2),
                Ok(false) => Ok(&spec::OPENCODE),
                Err(e) => {
                    tracing::warn!(
                        %version,
                        package = spec::OPENCODE_V2.package,
                        error = %e,
                        "opencode: package line probe failed"
                    );
                    Err(e)
                },
            }
        },
        _ => Ok(&spec::OPENCODE),
    }
}

/// shim 目录（`<harnesses>/opencode/managed/shim`）到版本可执行文件的相对路径。
///
/// 用相对路径而不是绝对路径：cmd.exe 按控制台代码页读取 `.cmd`，数据根含非 ASCII
/// （CJK 用户名 / 自定义存储根）时绝对路径会被解码成乱码；脚本本身只含 ASCII 版本号。
fn opencode_shim_target(version: &str, marker_rel: &str) -> String {
    format!("../../versions/installed/{version}/{}", marker_rel.replace('\\', "/"))
}

/// Windows 的 `opencode.cmd`：强制 `--standalone`。
fn opencode_shim_cmd(version: &str, marker_rel: &str) -> String {
    let target = opencode_shim_target(version, marker_rel).replace('/', "\\");
    format!("@echo off\r\n\"%~dp0{target}\" --standalone %*\r\n")
}

/// POSIX 的 `opencode`（unix 直接用；Windows 上供 Git Bash 命中，因为 bash 不解析 `.cmd`）。
fn opencode_shim_sh(version: &str, marker_rel: &str) -> String {
    format!(
        "#!/bin/sh\nexec \"$(dirname \"$0\")/{}\" --standalone \"$@\"\n",
        opencode_shim_target(version, marker_rel)
    )
}

/// 写入 2.x 包装脚本。
///
/// Windows 同时写 `.cmd`（cmd/PowerShell 命中）与无扩展名 sh 脚本（Git Bash 不解析
/// `.cmd`，只写 `.cmd` 时 bash 会落到 bin 目录里的裸 exe，绕过 `--standalone`）。
fn write_shims(shim_dir: &Path, version: &str, marker_rel: &str) -> bool {
    let written = if cfg!(windows) {
        std::fs::write(shim_dir.join("opencode.cmd"), opencode_shim_cmd(version, marker_rel))
            .is_ok()
            && std::fs::write(shim_dir.join("opencode"), opencode_shim_sh(version, marker_rel))
                .is_ok()
    } else {
        std::fs::write(shim_dir.join("opencode"), opencode_shim_sh(version, marker_rel)).is_ok()
    };
    #[cfg(unix)]
    let written = written && {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(shim_dir.join("opencode"), std::fs::Permissions::from_mode(0o755))
            .is_ok()
    };
    written
}

/// 托管 OpenCode 的数据隔离变量：只在宿主托管 + 注入开启时使用独立数据库。
///
/// 用户本机可能装着更高版本的 OpenCode（例如 OpenCode Desktop），它与 CLI 共用
/// `~/.local/share/opencode/opencode.db`，但 schema 不兼容（新库无 `session` 表）；
/// 托管版本直接打开会报 `Database is not empty and has no session table`。
/// 用 `OPENCODE_DB` 把托管版本的会话数据库放到应用数据目录，避免互相破坏；
/// 1.x/2.x 的 schema 不兼容，按**包线**（而不是 semver major）分目录：预发布版本
/// 的 major 恒为 0，按 major 会把两条线塞进同一个库。
fn managed_terminal_env(
    harness_root: &Path,
    line: &spec::HarnessSpec,
    effective: hv::EffectiveSource,
    injection_enabled: bool,
) -> Vec<(OsString, OsString)> {
    if !injection_enabled || effective != hv::EffectiveSource::Host {
        return Vec::new();
    }
    let line_dir = if is_v2_line(line) { "v2" } else { "v1" };
    let base = harness_root.parent().unwrap_or(harness_root);
    let managed = base.join("managed").join(line_dir);
    let db = managed.join("opencode.db");
    let mut env = vec![
        (OsString::from("OPENCODE_DB"), db.into_os_string()),
        // 应用负责版本管理：阻止 TUI 内 /update 原地替换二进制。
        (OsString::from("OPENCODE_DISABLE_AUTOUPDATE"), OsString::from("1")),
    ];
    if is_v2_line(line) {
        // 2.x 默认连接后台 service（桌面版也共用同一个 service.json 发现）。
        // 隔离 XDG state/data，确保托管 CLI 启动自己的 service，不接管桌面版服务。
        env.push((OsString::from("XDG_DATA_HOME"), managed.join("data").into_os_string()));
        env.push((OsString::from("XDG_STATE_HOME"), managed.join("state").into_os_string()));
    }
    env
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
    let line = selected.as_deref().map(|version| spec_for_version(&harness_root, version));
    let installed = selected
        .as_deref()
        .is_some_and(|v| hv::is_version_installed_for(&spec::OPENCODE, &harness_root, v));
    let has_system = hv::detect_system_bin(&spec::OPENCODE).is_some();
    let effective = hv::resolve_effective_source(mode, false, installed, has_system);
    let active = match (&effective, selected.as_deref(), line) {
        (hv::EffectiveSource::Host, Some(version), Some(line)) if injection_enabled => {
            Some((version, line))
        },
        _ => None,
    };
    let mut dirs = Vec::new();
    if let Some((version, line)) = active {
        dirs.push(adl_pty::managed_bins::bin_dir_for(
            &harness_root.join("installed").join(version),
            line.marker_rel,
        ));
        // 2.x CLI 默认连接 background service（桌面版共用 service 发现）；用包装脚本强制
        // `--standalone`，让托管版本只运行自己的私人 server。脚本目录必须排在 bin 目录之前
        // （Windows 按 PATH 目录顺序查找，同目录内 .exe 优先于 .cmd）。
        if is_v2_line(line) {
            let shim_dir = harness_root
                .parent()
                .unwrap_or(harness_root.as_path())
                .join("managed")
                .join("shim");
            let written = std::fs::create_dir_all(&shim_dir).is_ok()
                && write_shims(&shim_dir, version, line.marker_rel);
            if written {
                dirs.insert(0, shim_dir);
            } else {
                tracing::warn!(path = %shim_dir.display(), "opencode: failed to write 2.x shim");
            }
        }
    }
    let env = active
        .map(|(_, line)| managed_terminal_env(&harness_root, line, effective, injection_enabled))
        .unwrap_or_default();
    // SQLite/XDG 不会自动创建目录；先建好托管数据目录（失败时注入仍会带上路径，
    // 由用户侧报错暴露，但必须留痕，否则只剩「打不开数据库」无从排查）。
    for (key, value) in &env {
        let key = key.to_string_lossy();
        let path = Path::new(value);
        if key != "OPENCODE_DB" && !key.starts_with("XDG_") {
            continue;
        }
        let target = if key == "OPENCODE_DB" { path.parent() } else { Some(path) };
        let Some(target) = target else { continue };
        if let Err(e) = std::fs::create_dir_all(target) {
            tracing::warn!(
                %key,
                path = %target.display(),
                error = %e,
                "opencode: failed to create managed data dir"
            );
        }
    }
    adl_pty::managed_bins::set_managed_state(dirs, env);
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
    let result = hv::get_version_status_for_lines(
        OPENCODE_LINES,
        &root(&state),
        &state.storage.paths().root,
    )
    .await
    .map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// `POST /opencode/version-catalog`
pub async fn get_version_catalog(State(state): State<ServerState>) -> impl IntoResponse {
    let result = hv::fetch_catalog_for_lines(OPENCODE_LINES, &state.storage.paths().root)
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
    let install_spec =
        match spec_for_new_install(&state.storage.paths().root, &harness_root, &version).await {
            Ok(spec) => spec,
            Err(e) => return ipc::to_response(Err(e)),
        };
    let kind = if hv::is_version_installed_for(install_spec, &harness_root, &version) {
        "opencode-reinstall"
    } else {
        "opencode-install"
    };
    if let Err(e) = try_begin(&state, kind, &version) {
        return ipc::to_response(Err(e));
    }
    let _guard = state.opencode_version_lock.lock().await;
    let result = hv::install_version_with_task_for(
        install_spec,
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
///
/// 目标版本取**合并包线**的最新正式版（与状态徽章同源）；再按目标版本所属包线
/// 安装，避免「已选 1.x 时更新只装 1.x、徽章却显示 2.x」的不一致。
pub async fn update(State(state): State<ServerState>) -> impl IntoResponse {
    let harness_root = root(&state);
    let data_dir = state.storage.paths().root.clone();
    let target =
        match hv::get_version_status_for_lines(OPENCODE_LINES, &harness_root, &data_dir).await {
            Ok(status) => status.latest_available,
            Err(e) => return ipc::to_response(Err(e)),
        };
    let Some(target) = target else {
        return ipc::to_response(Err(AppError::NotFound("no release published upstream".into())));
    };
    let update_spec = spec_for_version(&harness_root, &target);
    if let Err(e) = try_begin(&state, "opencode-update", &target) {
        return ipc::to_response(Err(e));
    }
    let _guard = state.opencode_version_lock.lock().await;
    let result = hv::install_version_with_task_for(
        update_spec,
        &harness_root,
        &data_dir,
        &target,
        &state.opencode_version_task,
        true,
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
    let result = hv::revert_for(
        spec_for_version(&root(&state), &input.version),
        &root(&state),
        &input.version,
    )
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
        spec_for_version(&root(&state), &input.version),
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
        spec_for_version(&harness_root, &selected),
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

    fn temp_root(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("adl-harness-handler-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("installed")).expect("create temp root");
        dir
    }

    fn write_line(root: &Path, version: &str, package: &str) {
        let dir = root.join("installed").join(version);
        std::fs::create_dir_all(&dir).expect("create version dir");
        std::fs::write(dir.join(".adl-package"), format!("{package}\n"))
            .expect("write line marker");
    }

    fn opencode_bin_marker() -> &'static str {
        if cfg!(windows) { "bin/opencode.exe" } else { "bin/opencode" }
    }

    #[test]
    fn opencode_shims_force_standalone_with_relative_targets() {
        let marker = opencode_bin_marker();
        // 锁定相对深度（不通过被测 helper 自证）：shim 在 managed/shim，版本在 versions/installed。
        assert_eq!(
            opencode_shim_target("2.2.5", marker),
            format!("../../versions/installed/2.2.5/{marker}")
        );
        let target = opencode_shim_target("2.2.5", marker);
        assert_eq!(
            opencode_shim_cmd("2.2.5", marker),
            format!("@echo off\r\n\"%~dp0{}\" --standalone %*\r\n", target.replace('/', "\\"))
        );
        assert_eq!(
            opencode_shim_sh("2.2.5", marker),
            format!("#!/bin/sh\nexec \"$(dirname \"$0\")/{target}\" --standalone \"$@\"\n")
        );
    }

    #[test]
    fn write_shims_persists_both_entry_points_on_windows() {
        let dir = temp_root("shims");
        let marker = opencode_bin_marker();
        assert!(write_shims(&dir, "2.2.5", marker));
        assert!(dir.join("opencode").is_file());
        #[cfg(windows)]
        {
            assert!(dir.join("opencode.cmd").is_file());
            assert_eq!(
                std::fs::read_to_string(dir.join("opencode.cmd")).expect("cmd shim"),
                opencode_shim_cmd("2.2.5", marker)
            );
        }
        assert_eq!(
            std::fs::read_to_string(dir.join("opencode")).expect("sh shim"),
            opencode_shim_sh("2.2.5", marker)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    async fn probe_against(status: &'static str, body: &'static str) -> Result<String, String> {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let tag = NEXT.fetch_add(1, Ordering::Relaxed);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let server = tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0u8; 2048];
                let _ = socket.read(&mut buf).await;
                let resp = format!(
                    "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(resp.as_bytes()).await;
            }
        });
        let data = temp_root(&format!("probe-data-{tag}"));
        let root = temp_root(&format!("probe-root-{tag}"));
        std::fs::create_dir_all(data.join("config")).expect("config dir");
        std::fs::write(
            data.join("config").join("download-sources.json"),
            format!(
                "{{\"npm_registry\":\"http://127.0.0.1:{port}\",\"source_mode\":\"manual\",\"proxy\":{{\"mode\":\"none\"}}}}"
            ),
        )
        .expect("write config");
        let result = spec_for_new_install(&data, &root, "0.0.0-beta-19507")
            .await
            .map(|spec| spec.package.to_string())
            .map_err(|e| e.to_string());
        server.abort();
        let _ = std::fs::remove_dir_all(&data);
        let _ = std::fs::remove_dir_all(&root);
        result
    }

    #[tokio::test]
    async fn prerelease_probe_prefers_v2_when_published() {
        assert_eq!(probe_against("200 OK", "{}").await.expect("probe"), "@opencode/cli");
    }

    #[tokio::test]
    async fn prerelease_probe_falls_back_to_v1_on_404() {
        assert_eq!(probe_against("404 Not Found", "").await.expect("probe"), "opencode-ai");
    }

    #[tokio::test]
    async fn prerelease_probe_surfaces_network_errors() {
        let err = probe_against("500 Internal Server Error", "").await;
        assert!(err.is_err(), "probe should not swallow 5xx");
    }

    #[test]
    fn spec_for_version_prefers_the_installed_package_line() {
        let root = temp_root("spec-line");
        // 2.x 预发布（major 0）只能靠安装标记区分，不能按 major 猜成 1.x。
        write_line(&root, "0.0.0-beta-19507", "@opencode/cli");
        assert_eq!(spec_for_version(&root, "0.0.0-beta-19507").package, "@opencode/cli");
        // 1.x 预发布同样 major 0，标记为 opencode-ai 时仍走 1.x。
        write_line(&root, "0.0.0-beta-202608110357", "opencode-ai");
        assert_eq!(spec_for_version(&root, "0.0.0-beta-202608110357").package, "opencode-ai");
        // 没有标记的旧安装回退到 major 规则。
        assert_eq!(spec_for_version(&root, "1.19.5").package, "opencode-ai");
        assert_eq!(spec_for_version(&root, "2.0.0").package, "@opencode/cli");
        assert_eq!(spec_for_version(&root, "2.2.5").package, "@opencode/cli");
        assert_eq!(spec_for_version(&root, "not-a-version").package, "opencode-ai");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn managed_env_isolates_opencode_db_by_package_line() {
        let harness_root = Path::new("data/harnesses/opencode/versions");
        let expected = Path::new("data/harnesses/opencode/managed/v1").join("opencode.db");

        let env = managed_terminal_env(harness_root, &spec::OPENCODE, EffectiveSource::Host, true);
        assert_eq!(env.len(), 2);
        assert_eq!(env[0].0, OsString::from("OPENCODE_DB"));
        assert_eq!(Path::new(&env[0].1), expected);
        assert_eq!(env[1].0, OsString::from("OPENCODE_DISABLE_AUTOUPDATE"));
        assert_eq!(env[1].1, OsString::from("1"));

        // 2.x 预发布 major = 0：仍必须落 managed/v2，不能与 1.x 共库。
        let v2 =
            managed_terminal_env(harness_root, &spec::OPENCODE_V2, EffectiveSource::Host, true);
        assert_eq!(v2.len(), 4);
        assert_eq!(
            Path::new(&v2[0].1),
            Path::new("data/harnesses/opencode/managed/v2").join("opencode.db")
        );
        let keys: Vec<String> = v2.iter().map(|(k, _)| k.to_string_lossy().into_owned()).collect();
        assert_eq!(
            keys,
            vec!["OPENCODE_DB", "OPENCODE_DISABLE_AUTOUPDATE", "XDG_DATA_HOME", "XDG_STATE_HOME"]
        );
        assert_eq!(
            Path::new(&v2[2].1),
            Path::new("data/harnesses/opencode/managed/v2").join("data")
        );
        assert_eq!(
            Path::new(&v2[3].1),
            Path::new("data/harnesses/opencode/managed/v2").join("state")
        );

        for (effective, enabled) in [
            (EffectiveSource::System, true),
            (EffectiveSource::None, true),
            (EffectiveSource::Host, false),
        ] {
            assert!(
                managed_terminal_env(harness_root, &spec::OPENCODE, effective, enabled).is_empty(),
                "unexpected env for {effective:?} enabled={enabled}"
            );
        }
    }
}
