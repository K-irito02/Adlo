//! Dsh-harness domain HTTP handlers — dsh 宿主壳业务（拉起/关闭 + 版本管理）。
//!
//! 遵循 retrieval 域配方：`State(state): State<ServerState>` 提取状态，
//! 结果用 [`crate::ipc::to_response`] 包装为 `IpcResult<T>`。dsh 进程宿主在
//! [`ServerState::dsh_state`]（`Arc<AsyncMutex<Option<HostedProcess>>>`）；
//! 由于 `HostedProcess` 内含 `tokio::process::Child` 不可 Clone，运行状态由锁内
//! `Option` 持有，handler 一律用 async `lock().await` 直写（不在 `spawn_blocking`
//! 内持有 tokio Mutex）。

use crate::ServerState;
use crate::ipc;
use adl_download_source;
use adl_dsh_bundle;
use adl_dsh_version;
use adl_errors::AppError;
use adl_webapp_host::DSH_DEFAULT_PORT;
use adl_webapp_host::HostedProcess;
use adl_webapp_host::spawn_and_wait_ready;
use adl_webapp_host::spawn_node_direct;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;

/// dsh 版本目录 root（宿主持有的版本目录位置）。
pub fn dsh_root(state: &ServerState) -> PathBuf {
    dsh_root_dir(&state.data_dir)
}

/// 含数据根目录的 dsh 版本目录拼接（纯函数，便于单测）。
fn dsh_root_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("dsh-versions")
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloseInput {
    #[serde(default = "default_true")]
    keep: bool,
}

fn default_true() -> bool {
    true
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionInput {
    version: String,
}

/// POST `/dsh/open` — 拉起 dsh 进程（若已运行返回已有 URL）。返回 `{ url, freedPort }`。
pub async fn open(State(state): State<ServerState>) -> impl IntoResponse {
    let result =
        run_open(state.dsh_state.clone(), state.dsh_start_lock.clone(), &state.data_dir).await;
    ipc::to_response(result)
}

/// 端口是否已被占用：尝试绑定 127.0.0.1:port，成功（可绑）即视为空闲。
async fn is_port_occupied(port: u16) -> bool {
    match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => {
            drop(listener);
            false
        },
        Err(_) => true,
    }
}

/// 进程命令行是否指向 dsh 残留（@deepseek-ai/dsh 包 / dsh lib bin.js）。
fn is_dsh_cmdline(cmdline: &str) -> bool {
    let lower = cmdline.to_lowercase();
    lower.contains("@deepseek-ai/dsh")
        || lower.contains("@deepseek-ai\\dsh")
        || lower.contains("\\dsh\\lib\\bin.js")
}

/// 从 `netstat -ano` 输出解析在 `port` 上 LISTENING 的 PID 列表。
///
/// 本地地址 token（如 `0.0.0.0:3080` / `[::]:3080`）最后一个 `:` 之后必须恰好等于
/// `port`，避免 `:30800` 之类的相似端口被误匹配。
fn parse_netstat_listening_pids(text: &str, port: u16) -> Vec<u32> {
    let port_token = port.to_string();
    text.lines()
        .filter(|l| {
            let mut tokens = l.split_whitespace();
            let local = tokens.nth(1).unwrap_or_default();
            local.rsplit(':').next() == Some(&port_token) && l.contains("LISTENING")
        })
        .filter_map(|l| l.split_whitespace().next_back()?.parse::<u32>().ok())
        .collect()
}

/// 查询占用端口的进程 PID 列表（平台命令实现）。
#[cfg(target_os = "windows")]
async fn pids_listening_on(port: u16) -> Result<Vec<u32>, AppError> {
    let out = tokio::process::Command::new("netstat")
        .args(["-ano"])
        .output()
        .await
        .map_err(|e| AppError::Io(format!("netstat failed: {e}")))?;
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_netstat_listening_pids(&text, port))
}

/// 非 Windows：尝试 lsof 解析占用端口的 PID；lsof 缺失则视为无法识别占用者（返回空）。
#[cfg(not(target_os = "windows"))]
async fn pids_listening_on(port: u16) -> Result<Vec<u32>, AppError> {
    let out = match tokio::process::Command::new("lsof")
        .args(["-ti", &format!("tcp:{port}")])
        .output()
        .await
    {
        Ok(out) => out,
        Err(_) => {
            tracing::warn!("lsof not available; cannot identify process on port {port}");
            return Ok(Vec::new());
        },
    };
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.trim().parse::<u32>().ok())
        .collect())
}

/// 查询进程命令行。
#[cfg(target_os = "windows")]
async fn process_cmdline(pid: u32) -> Option<String> {
    let script =
        format!("(Get-CimInstance Win32_Process -Filter \"ProcessId = {pid}\").CommandLine");
    let out = tokio::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .await
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// 非 Windows：读取 /proc/<pid>/cmdline（NUL 分隔拼成空格串）。
#[cfg(not(target_os = "windows"))]
async fn process_cmdline(pid: u32) -> Option<String> {
    let raw = std::fs::read(format!("/proc/{pid}/cmdline")).ok()?;
    Some(
        raw.split(|b| *b == 0)
            .filter(|s| !s.is_empty())
            .map(|s| String::from_utf8_lossy(s).into_owned())
            .collect::<Vec<_>>()
            .join(" "),
    )
}

/// 终止指定 PID 进程。失败（含工具报非零退出）返回 `Err`。
#[cfg(target_os = "windows")]
async fn kill_pid(pid: u32) -> Result<(), AppError> {
    let out = tokio::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .output()
        .await
        .map_err(|e| AppError::Io(format!("taskkill failed: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Io(format!(
            "taskkill pid {pid} failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
async fn kill_pid(pid: u32) -> Result<(), AppError> {
    let out = tokio::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .output()
        .await
        .map_err(|e| AppError::Io(format!("kill failed: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Io(format!(
            "kill pid {pid} failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    Ok(())
}

/// 若 dsh 默认端口被残留 dsh 进程占用则释放之。
///
/// - 端口空闲：返回 `Ok(false)`（无需释放）。
/// - 被 dsh 残留占用：kill 后返回 `Ok(true)`（已释放）。
/// - 被其它（非 dsh）进程占用：返回 `Err`，交由调用方提示用户手动处理。
async fn free_stale_dsh_on_default_port() -> Result<bool, AppError> {
    let port = DSH_DEFAULT_PORT;
    if !is_port_occupied(port).await {
        return Ok(false);
    }
    tracing::warn!(?port, "dsh default port occupied; checking for stale dsh residue");
    let pids = pids_listening_on(port).await?;
    // netstat 对同一监听可能输出多行（0.0.0.0 与 [::] 双栈），先按 PID 去重，
    // 避免对已终止的重复 PID 二次 taskkill 报错。
    let mut seen = std::collections::HashSet::new();
    let mut freed_any = false;
    for pid in pids {
        if !seen.insert(pid) {
            continue;
        }
        let Some(cmdline) = process_cmdline(pid).await else { continue };
        if !is_dsh_cmdline(&cmdline) {
            continue;
        }
        tracing::warn!(?pid, ?cmdline, "killing stale dsh residue on dsh default port");
        // 单个 PID 失败（如已在 netstat 与 kill 之间退出）不中断清理：记录后继续，
        // 最终以端口是否释放为准。
        if let Err(e) = kill_pid(pid).await {
            tracing::warn!(?pid, error = %e, "killing stale dsh pid failed; continuing");
        }
        freed_any = true;
    }
    if freed_any {
        // 轮询等待端口真正释放，避免紧接着 spawn 撞上 EADDRINUSE。
        for _ in 0..10 {
            if !is_port_occupied(port).await {
                return Ok(true);
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        return Err(AppError::Io(format!(
            "killed stale dsh process but port {port} is still in use"
        )));
    }
    // 兜底重查：若占用进程在我们探测期间恰好退出，端口已空闲则无需报错。
    if !is_port_occupied(port).await {
        return Ok(false);
    }
    Err(AppError::Io(format!(
        "dsh default port {port} is in use by another process; close it and retry"
    )))
}

async fn run_open(
    dsh_guard: Arc<AsyncMutex<Option<HostedProcess>>>,
    start_lock: Arc<AsyncMutex<()>>,
    data_dir: &Path,
) -> Result<serde_json::Value, AppError> {
    // 快速路径：已运行则直接返回（不加 start_lock）。
    {
        let guard = dsh_guard.lock().await;
        if let Some(ref hp) = *guard {
            return Ok(serde_json::json!({ "url": hp.url, "freedPort": false }));
        }
    }

    // 串行化启动：free_stale + spawn 持独立锁，close/revert/uninstall 不被阻塞。
    let _start_guard = start_lock.lock().await;
    {
        let guard = dsh_guard.lock().await;
        if let Some(ref hp) = *guard {
            return Ok(serde_json::json!({ "url": hp.url, "freedPort": false }));
        }
    }

    // 固定 dsh 默认端口：若被残留 dsh 占用则先释放（用户选择"仅杀 dsh 残留进程"）。
    let freed = free_stale_dsh_on_default_port().await?;

    // 加载配置与检测 bundled
    let download_config = adl_download_source::load(data_dir)?;
    let bundled = adl_dsh_bundle::detect(data_dir)?;

    // 智能选择 dsh 来源
    let source = adl_dsh_version::select_dsh_source(data_dir, bundled.as_ref());

    let timeout = std::time::Duration::from_secs(60);
    let hp = match source {
        adl_dsh_version::DshSource::ReuseRunning { url, port } => {
            tracing::info!(?url, ?port, "dsh::run_open: reusing running instance");
            // 已有进程运行中，包装为 HostedProcess 占位（child 不需要真实持有）。
            // 由于无法从外部获取已运行进程的 Child，构造一个"空壳"占位。
            // 这里直接返回 URL，不写入 dsh_guard（进程非我们启动）。
            return Ok(serde_json::json!({ "url": url, "freedPort": freed }));
        },
        adl_dsh_version::DshSource::System { info } => {
            tracing::info!(path = %info.path.display(), version = ?info.version, "dsh::run_open: using system dsh");
            let args = vec![
                "--profile".to_string(),
                "web".to_string(),
                "--no-open".to_string(),
            ];
            spawn_and_wait_ready(
                &info.path.to_string_lossy(),
                &args,
                timeout,
            ).await?
        },
        adl_dsh_version::DshSource::Bundled { bundled } => {
            tracing::info!(version = %bundled.version, path = %bundled.path.display(), "dsh::run_open: using bundled dsh");
            let (node_bin, script_args) = adl_dsh_bundle::launch_command(&bundled);
            spawn_node_direct(&node_bin, &script_args[0], &script_args[1..], timeout).await?
        },
        adl_dsh_version::DshSource::Download { version } => {
            let root = dsh_root_dir(data_dir);
            let selected_version = adl_dsh_version::read_selected(&root)?;
            let package_spec = match selected_version {
                Some(v) => format!("@deepseek-ai/dsh@{v}"),
                None => "@deepseek-ai/dsh@latest".to_string(),
            };
            let registry = adl_download_source::resolve_registry(&download_config);
            tracing::info!(?package_spec, ?registry, ?version, "dsh::run_open: using download source");
            let mut args = vec![
                package_spec,
                "--profile".to_string(),
                "web".to_string(),
                "--no-open".to_string(),
            ];
            // 传递注册表配置给 npx（必须在 package spec 之后）
            if registry != "https://registry.npmjs.org" {
                args.push(format!("--registry={registry}"));
            }
            spawn_and_wait_ready("npx", &args, timeout).await?
        },
    };

    // 持锁写入（start_lock 已保证串行，无并发方抢先写入）。
    let mut guard = dsh_guard.lock().await;
    let url = hp.url.clone();
    *guard = Some(hp);
    Ok(serde_json::json!({ "url": url, "freedPort": freed }))
}

/// POST `/dsh/close` — 关闭 dsh 进程。`keep=true`（缺省）：保留进程运行；
/// `keep=false`：kill 子进程并置 `dsh_state` 为 `None`。返回 `true`。
pub async fn close(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: CloseInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = close_inner(&state, input.keep).await;
    ipc::to_response(result)
}

async fn close_inner(state: &ServerState, keep: bool) -> Result<serde_json::Value, AppError> {
    // tokio Mutex 只在此 async 作用域短暂持有（不跨 spawn_blocking），符合规范。
    let mut guard = state.dsh_state.lock().await;
    if !keep {
        if let Some(mut hp) = guard.take() {
            let _ = hp.child.kill().await;
        }
    }
    Ok(serde_json::json!(true))
}

/// POST `/dsh/get-version-status` — 查询 dsh 版本目录状态（`VersionStatus`）。
pub async fn get_version_status(State(state): State<ServerState>) -> impl IntoResponse {
    let root = dsh_root(&state);
    let result = match adl_dsh_version::get_version_status(&root).await {
        Ok(v) => serde_json::to_value(&v).map_err(|e| AppError::Internal(e.to_string())),
        Err(e) => Err(e),
    };
    ipc::to_response(result)
}

/// POST `/dsh/update` — 升级 dsh 至最新可用版本，返回新版本串。
pub async fn update(State(state): State<ServerState>) -> impl IntoResponse {
    let root = dsh_root(&state);
    let result = adl_dsh_version::update(&root).await.map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// POST `/dsh/revert` — 回退到指定的已安装版本，返回该版本串。body: `{ version }`。
pub async fn revert(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root = dsh_root(&state);
    let result = adl_dsh_version::revert(&root, &input.version).await.map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// POST `/dsh/uninstall` — 卸载指定版本。body: `{ version }`，成功返回 `true`。
pub async fn uninstall(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root = dsh_root(&state);
    let result =
        adl_dsh_version::uninstall(&root, &input.version).await.map(|()| serde_json::json!(true));
    ipc::to_response(result)
}

/// POST `/dsh/reinstall` — 按当前选中版本重装最新可用版本，返回新版本串。
pub async fn reinstall(State(state): State<ServerState>) -> impl IntoResponse {
    let root = dsh_root(&state);
    let result = adl_dsh_version::reinstall(&root).await.map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// POST `/dsh/source-status` — 获取下载源状态（bundled/system/running/config）。
pub async fn get_source_status(
    State(state): State<ServerState>,
) -> impl IntoResponse {
    let result = get_source_status_inner(&state).await;
    ipc::to_response(result)
}

async fn get_source_status_inner(
    state: &ServerState,
) -> Result<serde_json::Value, AppError> {
    let data_dir = &state.data_dir;

    let bundled = adl_dsh_bundle::detect(data_dir)?
        .map(|b| serde_json::json!({ "version": b.version, "path": b.path }));

    let system = adl_dsh_version::detect_system_dsh()
        .map(|info| {
            serde_json::json!({
                "path": info.path,
                "version": info.version,
            })
        });

    let running = adl_dsh_version::detect_running_dsh(DSH_DEFAULT_PORT)
        .map(|info| {
            serde_json::json!({
                "url": info.url,
                "port": info.port,
            })
        });

    let config = adl_download_source::load(data_dir)?;
    let config_value = serde_json::to_value(&config)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(serde_json::json!({
        "bundled": bundled,
        "system": system,
        "running": running,
        "config": config_value,
    }))
}

/// POST `/dsh/source-config` — 保存下载源配置。
pub async fn save_source_config(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let result = save_source_config_inner(&state, body).await;
    ipc::to_response(result)
}

async fn save_source_config_inner(
    state: &ServerState,
    body: axum::body::Bytes,
) -> Result<serde_json::Value, AppError> {
    let input: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;

    let mut config = adl_download_source::load(&state.data_dir)?;

    if let Some(registry) = input.get("npm_registry").and_then(|v| v.as_str()) {
        config.npm_registry = registry.to_string();
    }
    if let Some(mirror) = input.get("dsh_mirror") {
        config.dsh_mirror = match mirror {
            serde_json::Value::String(s) => Some(s.clone()),
            serde_json::Value::Null => None,
            _ => return Err(AppError::InvalidInput("dsh_mirror must be string or null".into())),
        };
    }
    if let Some(proxy) = input.get("proxy") {
        if let Some(mode_str) = proxy.get("mode").and_then(|v| v.as_str()) {
            config.proxy.mode = match mode_str {
                "auto" => adl_download_source::ProxyMode::Auto,
                "manual" => adl_download_source::ProxyMode::Manual,
                "none" => adl_download_source::ProxyMode::None,
                _ => return Err(AppError::InvalidInput(format!("invalid proxy mode: {mode_str}"))),
            };
        }
        if let Some(v) = proxy.get("http_proxy").and_then(|v| v.as_str()) {
            config.proxy.http_proxy = Some(v.to_string());
        }
        if let Some(v) = proxy.get("https_proxy").and_then(|v| v.as_str()) {
            config.proxy.https_proxy = Some(v.to_string());
        }
        if let Some(v) = proxy.get("no_proxy").and_then(|v| v.as_str()) {
            config.proxy.no_proxy = Some(v.to_string());
        }
    }

    adl_download_source::save(&state.data_dir, &config)?;
    Ok(serde_json::json!(true))
}

/// POST `/dsh/test-source` — 测试下载源连通性。
pub async fn test_source(
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let result = test_source_inner(body).await;
    ipc::to_response(result)
}

async fn test_source_inner(
    body: axum::body::Bytes,
) -> Result<serde_json::Value, AppError> {
    let input: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;

    let url = input.get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("missing 'url' field".into()))?;

    let status = adl_download_source::test_source(
        url,
        std::time::Duration::from_secs(10),
    ).await;

    Ok(serde_json::json!({
        "reachable": status.reachable,
        "latencyMs": status.latency_ms,
        "error": status.error,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// dsh_root 返回 data_dir 下的 dsh-versions。
    #[test]
    fn dsh_root_returns_data_dir_child() {
        let data_dir = Path::new("/tmp/data");
        assert_eq!(dsh_root_dir(data_dir), PathBuf::from("/tmp/data/dsh-versions"));
    }

    /// close 在进程未运行时（keep=任意）幂等返回 `true`，不 panic。
    #[tokio::test]
    async fn close_without_process_is_ok() {
        let dir = std::env::temp_dir().join(format!(
            "adl-dsh-close-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let state = crate::engine::init_server_state(&dir).await.unwrap();
        let result = close_inner(&state, true).await.unwrap();
        assert_eq!(result, serde_json::json!(true));
        let result = close_inner(&state, false).await.unwrap();
        assert_eq!(result, serde_json::json!(true));
        let guard = state.dsh_state.lock().await;
        assert!(guard.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// `revert`/`uninstall` 对非法 body 返回 BAD_REQUEST（INVALID_INPUT），不触达版本逻辑。
    #[test]
    fn version_input_camelcase_deserializes() {
        let v: VersionInput = serde_json::from_str(r#"{ "version": "1.2.3" }"#).unwrap();
        assert_eq!(v.version, "1.2.3");
    }

    /// is_dsh_cmdline 识别 dsh 残留进程命令行（npm 规范名 / Windows 路径两种写法）。
    #[test]
    fn dsh_cmdline_detection() {
        // npm registry 包名（npx 解析后 node 实际执行的 bin.js 路径含 @deepseek-ai\dsh）。
        assert!(is_dsh_cmdline(
            r"C:\Users\u\.npm\_npx\abc\node_modules\@deepseek-ai\dsh\lib\bin.js --profile web"
        ));
        assert!(is_dsh_cmdline(
            "node /home/u/.npm/_npx/abc/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web"
        ));
        // 非 dsh 进程不得误判。
        assert!(!is_dsh_cmdline("C:\\Windows\\System32\\svchost.exe -k netsvcs"));
        assert!(!is_dsh_cmdline("node build/server.js --port 3080"));
    }

    /// netstat 解析：只收集指定端口（LISTENING）行，排除相似前缀端口（如 30800）。
    #[test]
    fn netstat_parsing_matches_exact_port_only() {
        let text = "\n\
            Proto  Local Address          Foreign Address        State           PID\n\
            TCP    0.0.0.0:3080           0.0.0.0:0              LISTENING       1234\n\
            TCP    0.0.0.0:30800          0.0.0.0:0              LISTENING       5678\n\
            TCP    127.0.0.1:3080         0.0.0.0:0              LISTENING       9012\n\
            TCP    [::]:3080              [::]:0                 LISTENING       3456\n\
            TCP    0.0.0.0:80             0.0.0.0:0              LISTENING       1111\n\
            TCP    0.0.0.0:3080           0.0.0.0:0              TIME_WAIT       2222\n\
        ";
        let pids = parse_netstat_listening_pids(text, 3080);
        assert_eq!(pids, vec![1234, 9012, 3456]);
    }
}
