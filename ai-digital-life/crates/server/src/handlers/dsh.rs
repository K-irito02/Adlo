//! Dsh-harness domain HTTP handlers — dsh 宿主壳业务（拉起 + 版本管理）。
//!
//! 遵循 retrieval 域配方：`State(state): State<ServerState>` 提取状态，
//! 结果用 [`crate::ipc::to_response`] 包装为 `IpcResult<T>`。dsh 进程宿主在
//! [`ServerState::dsh_state`]（`Arc<AsyncMutex<Option<ManagedDsh>>>`）；
//! 由于 `HostedProcess` 内含 `tokio::process::Child` 不可 Clone，运行状态由锁内
//! `Option` 持有，handler 一律用 async `lock().await` 直写（不在 `spawn_blocking`
//! 内持有 tokio Mutex）。
//!
use crate::ServerState;
use crate::ipc;
use crate::state::{DshSpawnSource, ManagedDsh};
use adl_download_source;
use adl_harness_version;
use adl_errors::AppError;
use adl_webapp_host::DSH_DEFAULT_PORT;
use adl_webapp_host::spawn_and_wait_ready;
use adl_webapp_host::spawn_node_direct;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::sync::Mutex as AsyncMutex;

/// dsh 版本目录 root（宿主持有的版本目录位置）。
pub fn dsh_root(state: &ServerState) -> PathBuf {
    dsh_root_dir(state.storage.paths())
}

/// 含数据根目录的 dsh 版本目录拼接（纯函数，便于单测）。
fn dsh_root_dir(paths: &adl_kernel::storage::StoragePaths) -> PathBuf {
    paths.harness_versions_dir("dsh")
}

fn clear_source_cache(state: &ServerState) {
    if let Ok(mut cache) = state.dsh_source_cache.write() {
        *cache = None;
    }
}

/// 版本目录变更前停止正在运行的 dsh，避免 Windows 下文件占用导致替换/删除失败。
async fn stop_running_dsh(state: &ServerState) -> bool {
    tracing::debug!("dsh::stop_before_mutation: start");
    let mut stopped = false;
    {
        let _guard = state.dsh_start_lock.lock().await;
        {
            let mut guard = state.dsh_state.lock().await;
            if let Some(mut managed) = guard.take() {
                let _ = managed.process.child.kill().await;
                let _ = managed.process.child.wait().await;
                stopped = true;
                tracing::debug!("dsh::stop_before_mutation: hosted process killed");
            }
        }
        match free_stale_dsh_on_default_port().await {
            Ok(true) => {
                stopped = true;
                tracing::debug!("dsh::stop_before_mutation: stale process on default port freed");
            },
            Ok(false) => {},
            Err(e) => tracing::warn!(error = %e, "dsh: stop before version mutation failed"),
        }
    }
    clear_source_cache(state);
    tracing::debug!(stopped, "dsh::stop_before_mutation: done");
    stopped
}

fn is_cancelled_error<T>(result: &Result<T, AppError>) -> bool {
    matches!(result, Err(AppError::Cancelled(_)))
}

/// 版本变更收尾（update/uninstall/reinstall/install_version 共用）：
/// 先放版本锁再按需重开（restore 内部 run_open 同样取 version_lock，
/// async Mutex 不可重入，同任务重复加锁会死锁），随后 finish 任务、
/// 成功则清来源缓存。调用方传 owned guard，所有权移入即释放时机明确。
async fn finish_version_mutation(
    state: &ServerState,
    guard: tokio::sync::OwnedMutexGuard<()>,
    was_running: bool,
    result: &Result<serde_json::Value, AppError>,
) {
    if was_running && is_cancelled_error(result) {
        tracing::debug!("dsh::finish_mutation: cancelled, restoring stopped dsh");
        drop(guard);
        restore_after_cancel(state).await;
    }
    state.dsh_version_task.finish();
    match result {
        Ok(_) => tracing::debug!("dsh::finish_mutation: ok, source cache cleared"),
        Err(e) => tracing::debug!(error = %e, "dsh::finish_mutation: failed"),
    }
    if result.is_ok() {
        clear_source_cache(state);
    }
}

/// 版本任务占位（四变更端点共用）：已有任务在跑则拒绝，避免并发变更。
fn try_begin_version_task(state: &ServerState, kind: &str, version: &str) -> Result<(), AppError> {
    if state.dsh_version_task.begin(kind, version) {
        Ok(())
    } else {
        tracing::debug!(?kind, %version, "dsh::version_task: begin rejected (another task running)");
        Err(AppError::InvalidInput("another version task is running".into()))
    }
}

async fn restore_after_cancel(state: &ServerState) {
    if let Err(e) = run_open(
        state.dsh_state.clone(),
        state.dsh_starting.clone(),
        state.dsh_start_lock.clone(),
        state.dsh_version_lock.clone(),
        state.storage.paths(),
        state.dsh_source_cache.clone(),
    )
    .await
    {
        tracing::warn!(error = %e, "dsh: restore after cancel failed, assistant left stopped");
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionInput {
    version: String,
    /// 仅 install-version 用：false=只修目录不改选中（行内“重装非当前”）；
    /// 缺省 true（安装即选中，兼容旧客户端）。
    #[serde(default)]
    select: Option<bool>,
}

/// POST `/dsh/open` — 拉起 dsh 进程（若已运行返回已有 URL）。返回 `{ url, freedPort }`。
pub async fn open(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_open(
        state.dsh_state.clone(),
        state.dsh_starting.clone(),
        state.dsh_start_lock.clone(),
        state.dsh_version_lock.clone(),
        state.storage.paths(),
        state.dsh_source_cache.clone(),
    )
    .await;
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

/// 本次启动的回环覆盖参数：生成宿主保留 patch 文件并拼 `--patch` 参数。
/// 只在真正 spawn 的分支调用，ReuseRunning/None 不碰文件。
async fn loopback_web_args(
    paths: &adl_kernel::storage::StoragePaths,
) -> Result<Vec<String>, AppError> {
    let loopback_patch = ensure_loopback_patch(paths).await?;
    Ok(dsh_web_args(&loopback_patch))
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

async fn detect_source(
    paths: &adl_kernel::storage::StoragePaths,
    mode: adl_download_source::VersionSourceMode,
) -> adl_harness_version::DshSource {
    let running = adl_harness_version::detect_running_dsh(DSH_DEFAULT_PORT).await;
    let system = adl_harness_version::detect_system_dsh().await;
    // 版本目录取 StoragePaths 的正式口径（`harnesses` 可被存储设置覆盖），
    // 不能再用 data_dir 硬拼，否则安装的版本在覆盖场景下对启动不可见。
    let root = paths.harness_versions_dir("dsh");
    adl_harness_version::select_dsh_source(&root, mode, running, system)
}

const DSH_LOOPBACK_PATCH: &str =
    "- id: webserver\n  config:\n    host: '127.0.0.1'\n    port: 3080\n";

async fn ensure_loopback_patch(
    paths: &adl_kernel::storage::StoragePaths,
) -> Result<PathBuf, AppError> {
    let dir = paths.harness_versions_dir("dsh");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Io(format!("create {}: {e}", dir.display())))?;
    let path = dir.join("loopback.patch.yml");
    let existing = tokio::fs::read_to_string(&path).await.ok();
    if existing.as_deref() != Some(DSH_LOOPBACK_PATCH) {
        tokio::fs::write(&path, DSH_LOOPBACK_PATCH)
            .await
            .map_err(|e| AppError::Io(format!("write {}: {e}", path.display())))?;
    }
    Ok(path)
}

fn dsh_web_args(patch: &Path) -> Vec<String> {
    vec![
        "--profile".to_string(),
        "web".to_string(),
        "--patch".to_string(),
        patch.to_string_lossy().into_owned(),
        "--no-open".to_string(),
    ]
}

/// 拉起进行中标志的 RAII 守卫：spawn 成功写入 `dsh_state` 或任何失败路径离开时自动复位。
struct StartingGuard(Arc<std::sync::atomic::AtomicBool>);

impl StartingGuard {
    fn arm(flag: &Arc<std::sync::atomic::AtomicBool>) -> Self {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
        Self(flag.clone())
    }
}

impl Drop for StartingGuard {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::Relaxed);
    }
}

async fn run_open(
    dsh_guard: Arc<AsyncMutex<Option<ManagedDsh>>>,
    dsh_starting: Arc<std::sync::atomic::AtomicBool>,
    start_lock: Arc<AsyncMutex<()>>,
    version_lock: Arc<AsyncMutex<()>>,
    paths: &adl_kernel::storage::StoragePaths,
    dsh_source_cache: Arc<RwLock<Option<adl_harness_version::DshSource>>>,
) -> Result<serde_json::Value, AppError> {
    let start_time = std::time::Instant::now();

    // 快速路径：已运行则直接返回（不加 start_lock）。
    // 持锁复查前先做 try_wait 收割：托管子进程可能已退出（崩溃/被外部杀掉），
    // 此时必须按“未运行”继续走 spawn 流程，不得返回指向已死进程的 stale 地址
    //（M1：与 managed_snapshot 读路径对称，共用同一锁内实现）。
    if let Some(managed) = managed_snapshot_inner(&dsh_guard).await {
        tracing::info!(
            elapsed_ms = start_time.elapsed().as_millis(),
            "dsh::run_open: fast path - already running"
        );
        return Ok(serde_json::json!({ "url": managed.url, "freedPort": false }));
    }

    // 串行化启动：free_stale + spawn 持独立锁，close/revert/uninstall 不被阻塞。
    // 版本目录变更（install/uninstall/reinstall/update）持 version_lock：
    // 此处先取 version_lock 再取 start_lock，与变更路径的嵌套顺序一致
    // （version 外层 → stop 内取 start_lock），无锁序反转；避免 detect 选中
    // 半写入版本并 spawn。快速路径（已运行）不取任何写锁。
    let _version_guard = version_lock.lock().await;
    let _start_guard = start_lock.lock().await;
    // 拉起中标志（L1）：取锁成功即置位，覆盖来源探测 + free_stale + spawn 全窗口；
    // ReuseRunning / None 路径随各自 early-return 自动复位（Drop），前端短暂骨架可接受。
    let _starting = StartingGuard::arm(&dsh_starting);
    // 持锁复查：同样先 try_wait 收割已退出的托管子进程（与快速路径同一语义），
    // 避免并发 open 在 spawn 窗口外拿到 stale 句柄。
    if let Some(managed) = managed_snapshot_inner(&dsh_guard).await {
        tracing::info!(
            elapsed_ms = start_time.elapsed().as_millis(),
            "dsh::run_open: acquired lock - already running"
        );
        return Ok(serde_json::json!({ "url": managed.url, "freedPort": false }));
    }

    // 固定 dsh 默认端口：若被残留 dsh 占用则先释放（用户选择"仅杀 dsh 残留进程"）。
    // 加载下载源配置（内置包已在服务启动时收编为普通宿主版本，此处不再涉内置）。
    let config_start = std::time::Instant::now();
    let download_config = adl_download_source::load(&paths.root)?;
    tracing::info!(elapsed_ms = config_start.elapsed().as_millis(), "dsh::run_open: config loaded");

    // 智能选择 dsh 来源（在 free_stale 之前，避免误杀用户正在运行的 dsh）
    // 优先使用缓存的来源，避免重复检测
    let source = {
        // 先读缓存，提取数据后立即释放锁，避免跨 await 持有 RwLockReadGuard
        let cached = dsh_source_cache.read().ok().and_then(|cache| cache.clone());
        if let Some(ref cached_source) = cached {
            // 缓存命中：如果是 ReuseRunning，验证进程是否仍在运行
            match cached_source {
                adl_harness_version::DshSource::ReuseRunning { url, port } => {
                    // 快速 TCP 检查验证端口是否仍在监听（锁已释放，可安全 await）
                    if adl_webapp_host::check_port_fast(*port).await {
                        tracing::info!(
                            elapsed_ms = config_start.elapsed().as_millis(),
                            url = %url,
                            port = *port,
                            "dsh::run_open: source cache HIT — reusing running instance (verified alive)"
                        );
                        cached_source.clone()
                    } else {
                        // 进程已死，清除缓存并重新检测
                        tracing::warn!(
                            url = %url,
                            port = *port,
                            "dsh::run_open: cached ReuseRunning but port not listening — clearing cache"
                        );
                        if let Ok(mut cache) = dsh_source_cache.write() {
                            *cache = None;
                        }
                        let detect_start = std::time::Instant::now();
                        let new_source = detect_source(paths, download_config.version_source).await;
                        tracing::info!(
                            detect_ms = detect_start.elapsed().as_millis(),
                            source = ?new_source,
                            "dsh::run_open: source re-detected after stale cache"
                        );
                        if let Ok(mut cache) = dsh_source_cache.write() {
                            *cache = Some(new_source.clone());
                        }
                        new_source
                    }
                },
                _ => {
                    tracing::info!(
                        elapsed_ms = config_start.elapsed().as_millis(),
                        source = ?cached_source,
                        "dsh::run_open: source cache HIT — reusing detected source"
                    );
                    cached_source.clone()
                },
            }
        } else {
            let detect_start = std::time::Instant::now();
            let new_source = detect_source(paths, download_config.version_source).await;
            tracing::info!(
                detect_ms = detect_start.elapsed().as_millis(),
                source = ?new_source,
                "dsh::run_open: source cache MISS — fresh detection completed"
            );
            if let Ok(mut cache) = dsh_source_cache.write() {
                *cache = Some(new_source.clone());
            }
            tracing::info!(
                elapsed_ms = config_start.elapsed().as_millis(),
                "dsh::run_open: source cached for future calls"
            );
            new_source
        }
    };

    // 真正要 spawn 时才需要「拉起中」之外的动作：ReuseRunning / None 在上游
    // early-return，此处只剩 HostInstalled / System 两个实际拉起分支。
    // （_starting 已在取锁成功时置位，覆盖来源探测窗口；此处不再重复 arm。）

    // 固定 dsh 默认端口：若被残留 dsh 占用则先释放（用户选择"仅杀 dsh 残留进程"）。
    // 仅在需要启动新进程时才执行 free_stale（ReuseRunning 跳过）
    let freed_start = std::time::Instant::now();
    let freed = match &source {
        adl_harness_version::DshSource::ReuseRunning { .. } => false,
        adl_harness_version::DshSource::None => false,
        _ => free_stale_dsh_on_default_port().await?,
    };
    tracing::info!(
        elapsed_ms = freed_start.elapsed().as_millis(),
        "dsh::run_open: free_stale completed"
    );

    let timeout = std::time::Duration::from_secs(60);
    let spawn_start = std::time::Instant::now();
    // 本次 spawn 的来源版本与来源类型（事项 2026-10-20/1：运行中显示真实版本用；
    // 2026-10-22：记录来源使读数能区分「宿主拉起 / 系统安装拉起 / 外部运行」）。
    // 复用/无来源走上游 early-return，此处不可达。
    let (hp, spawn_version, spawn_source) = match source {
        adl_harness_version::DshSource::ReuseRunning { url, port } => {
            tracing::info!(?url, ?port, "dsh::run_open: reusing running instance");
            // 已有进程运行中，直接返回 URL。不写入 dsh_guard（进程非我们启动，无法持有 Child）。
            // close 操作对复用的进程无意义（我们没有 Child handle），保持原样即可。
            return Ok(serde_json::json!({ "url": url, "freedPort": freed }));
        },
        adl_harness_version::DshSource::System { info } => {
            tracing::info!(path = %info.path.display(), version = ?info.version, "dsh::run_open: using system dsh");
            let args = loopback_web_args(paths).await?;
            let hp = spawn_and_wait_ready(&info.path.to_string_lossy(), &args, timeout).await?;
            (hp, info.version.clone(), DshSpawnSource::System)
        },
        adl_harness_version::DshSource::HostInstalled { version, bin } => {
            tracing::info!(%version, path = %bin.display(), "dsh::run_open: using host-installed dsh");
            let args = loopback_web_args(paths).await?;
            let hp = spawn_node_direct("node", &bin.to_string_lossy(), &args, timeout).await?;
            (hp, Some(version), DshSpawnSource::Host)
        },
        adl_harness_version::DshSource::None => {
            tracing::warn!("dsh::run_open: no dsh source available");
            return Err(AppError::NotFound(
                "no dsh source available; install a version in settings".into(),
            ));
        },
    };
    tracing::info!(
        elapsed_ms = spawn_start.elapsed().as_millis(),
        "dsh::run_open: spawn completed"
    );

    // 持锁写入（start_lock 已保证串行，无并发方抢先写入）。
    let mut guard = dsh_guard.lock().await;
    let url = hp.url.clone();
    *guard = Some(ManagedDsh { process: hp, version: spawn_version, source: spawn_source });
    tracing::info!(total_elapsed_ms = start_time.elapsed().as_millis(), "dsh::run_open: completed");
    Ok(serde_json::json!({ "url": url, "freedPort": freed }))
}

/// Pre-start dsh in background. Called from `serve()` after server is ready.
/// Errors are logged but non-fatal — user can still open dsh manually later.
pub async fn pre_start_dsh(state: &ServerState) {
    tracing::info!("dsh::pre_start: spawning dsh in background");
    let start = std::time::Instant::now();
    match run_open(
        state.dsh_state.clone(),
        state.dsh_starting.clone(),
        state.dsh_start_lock.clone(),
        state.dsh_version_lock.clone(),
        state.storage.paths(),
        state.dsh_source_cache.clone(),
    )
    .await
    {
        Ok(val) => {
            // 凭据红线：真实入口 URL 含一次性 `?token=`，禁止进普通日志（事项 2026-10-20/4）。
            let url = val.get("url").and_then(|v| v.as_str()).unwrap_or("unknown");
            tracing::info!(
                elapsed_ms = start.elapsed().as_millis(),
                url = %adl_webapp_host::redact_url_for_log(url),
                "dsh::pre_start: dsh ready"
            );
        },
        Err(e) => {
            tracing::warn!(
                elapsed_ms = start.elapsed().as_millis(),
                error = %e,
                "dsh::pre_start: dsh spawn failed — will retry on user click"
            );
        },
    }
}

/// POST `/dsh/get-version-status` — 查询 dsh 版本目录状态（`VersionStatus`）。
pub async fn get_version_status(State(state): State<ServerState>) -> impl IntoResponse {
    ipc::to_response(get_version_status_value(&state).await)
}

/// POST `/dsh/update` — 升级 dsh 至最新可用版本，返回新版本串。
pub async fn update(State(state): State<ServerState>) -> impl IntoResponse {
    if let Err(e) = try_begin_version_task(&state, adl_harness_version::task_kind::UPDATE, "latest") {
        return ipc::to_response(Err(e));
    }
    let guard = state.dsh_version_lock.clone().lock_owned().await;
    let was_running = stop_running_dsh(&state).await;
    let root = dsh_root(&state);
    let result = adl_harness_version::update_with_task(
        &root,
        &state.storage.paths().root,
        &state.dsh_version_task,
    )
    .await
    .map(|v| serde_json::json!(v));
    finish_version_mutation(&state, guard, was_running, &result).await;
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
    tracing::debug!(version = %input.version, "dsh::revert: request");
    let _guard = state.dsh_version_lock.lock().await;
    let root = dsh_root(&state);
    let result = adl_harness_version::revert(&root, &input.version).await.map(|v| serde_json::json!(v));
    match &result {
        Ok(_) => tracing::debug!(version = %input.version, "dsh::revert: ok"),
        Err(e) => tracing::debug!(version = %input.version, error = %e, "dsh::revert: failed"),
    }
    if result.is_ok() {
        clear_source_cache(&state);
    }
    ipc::to_response(result)
}

/// POST `/dsh/uninstall` — 卸载指定版本。body: `{ version }`，成功返回 `true`。
/// 内置预置版本同样按普通版本卸载（删除版本目录 + 来源记录）。
pub async fn uninstall(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    tracing::debug!(version = %input.version, "dsh::uninstall: request");
    if let Err(e) =
        try_begin_version_task(&state, adl_harness_version::task_kind::UNINSTALL, &input.version)
    {
        return ipc::to_response(Err(e));
    }
    let guard = state.dsh_version_lock.clone().lock_owned().await;
    let root = dsh_root(&state);
    // 卸载当前选中版本需要先停进程（Windows 下文件占用会导致删除失败）。
    let is_current =
        adl_harness_version::read_selected(&root).ok().flatten().as_deref() == Some(&input.version);
    tracing::debug!(version = %input.version, is_current, "dsh::uninstall: task begun");
    let was_running = if is_current { stop_running_dsh(&state).await } else { false };
    tracing::debug!(version = %input.version, was_running, "dsh::uninstall: invoking kernel");
    let result =
        adl_harness_version::uninstall_with_task(&root, &input.version, &state.dsh_version_task)
            .await
            .map(|()| serde_json::json!(true));
    match &result {
        Ok(_) => tracing::debug!(version = %input.version, "dsh::uninstall: ok"),
        Err(e) => tracing::debug!(version = %input.version, error = %e, "dsh::uninstall: failed"),
    }
    finish_version_mutation(&state, guard, was_running, &result).await;
    ipc::to_response(result)
}

/// POST `/dsh/reinstall` — 真重新安装当前选中版本并选中，返回该版本串。
pub async fn reinstall(State(state): State<ServerState>) -> impl IntoResponse {
    let root = dsh_root(&state);
    let selected = match adl_harness_version::read_selected(&root) {
        Ok(Some(version)) => version,
        Ok(None) => {
            tracing::debug!("dsh::reinstall: rejected (no selected version)");
            return ipc::to_response(Err(AppError::NotFound("no selected version".into())));
        },
        Err(e) => {
            tracing::debug!(error = %e, "dsh::reinstall: read selected failed");
            return ipc::to_response(Err(e));
        },
    };
    tracing::debug!(version = %selected, "dsh::reinstall: request");
    if let Err(e) = try_begin_version_task(&state, adl_harness_version::task_kind::REINSTALL, &selected)
    {
        return ipc::to_response(Err(e));
    }
    let guard = state.dsh_version_lock.clone().lock_owned().await;
    let was_running = stop_running_dsh(&state).await;
    tracing::debug!(version = %selected, was_running, "dsh::reinstall: invoking kernel");
    let result = adl_harness_version::reinstall_with_task(
        &root,
        &state.storage.paths().root,
        &state.dsh_version_task,
    )
    .await
    .map(|v| serde_json::json!(v));
    match &result {
        Ok(_) => tracing::debug!(version = %selected, "dsh::reinstall: ok"),
        Err(e) => tracing::debug!(version = %selected, error = %e, "dsh::reinstall: failed"),
    }
    finish_version_mutation(&state, guard, was_running, &result).await;
    ipc::to_response(result)
}

/// POST `/dsh/restart` — 确保 dsh 处于运行状态并返回其地址（用户 2026-10-21 完成态定义）。
/// 正在运行（含经指纹/命令行验证的外部进程）则重启；未运行但有可用来源
/// （刚安装/切换/重装完）则直接拉起——不建标签（建标签是前端 openDsh 的事）。
/// 无可用来源返回 `{ restarted:false, url:null }`（调用方负责关残留标签）。
pub async fn restart(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_restart(&state).await;
    ipc::to_response(result)
}

async fn run_restart(state: &ServerState) -> Result<serde_json::Value, AppError> {
    let (had_process, freed_external) = {
        let _guard = state.dsh_start_lock.lock().await;
        let had_process = {
            let mut guard = state.dsh_state.lock().await;
            match guard.take() {
                Some(mut managed) => {
                    if let Err(e) = managed.process.child.kill().await {
                        tracing::warn!(error = %e, "dsh::restart: kill hosted process failed");
                    }
                    let _ = managed.process.child.wait().await;
                    true
                },
                None => false,
            }
        };
        let freed_external = free_stale_dsh_on_default_port().await?;
        (had_process, freed_external)
    };

    // had_process/freed_external 仅用于诊断：无论之前是否有进程，只要有可用
    // 来源就确保拉起（安装/切换/重装后的“完成后即运行”语义）；无可用来源时
    // run_open 返回 NotFound，下方统一折为 restarted:false。
    tracing::debug!(had_process, freed_external, "dsh::run_restart: ensuring dsh is running");
    clear_source_cache(state);
    let opened = run_open(
        state.dsh_state.clone(),
        state.dsh_starting.clone(),
        state.dsh_start_lock.clone(),
        state.dsh_version_lock.clone(),
        state.storage.paths(),
        state.dsh_source_cache.clone(),
    )
    .await;
    match opened {
        Ok(value) => Ok(serde_json::json!({
            "restarted": true,
            "url": value.get("url").cloned(),
        })),
        Err(AppError::NotFound(_)) => Ok(serde_json::json!({ "restarted": false, "url": null })),
        Err(e) => Err(e),
    }
}

/// POST `/dsh/version-catalog` — 查询官方版本目录（正式版/预发布分桶 + 各自最新）。
pub async fn get_version_catalog(State(state): State<ServerState>) -> impl IntoResponse {
    let result = match adl_harness_version::fetch_catalog(&state.storage.paths().root).await {
        Ok(v) => serde_json::to_value(&v).map_err(|e| AppError::Internal(e.to_string())),
        Err(e) => Err(e),
    };
    ipc::to_response(result)
}

/// POST `/dsh/install-version` — 安装指定版本（正式版或预发布均可，需官方确已发布）。
/// body: `{ version, select? }`，成功返回该版本串；select 缺省 true（登记并选中，
/// 下次 `open` 即按该版本启动），false 则只修目录、保持原选中（行内“重装非当前”）。
pub async fn install_version(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let select = input.select.unwrap_or(true);
    tracing::debug!(version = %input.version, select, "dsh::install_version: request");
    let root = dsh_root(&state);
    // Install/Reinstall 分类只影响进度条 kind 标签：判定在锁外，结果可能与
    // 实际执行略有出入（并发变更），正确性不受影响，故接受此近似。
    let kind = if adl_harness_version::is_host_version_installed(&root, input.version.trim()) {
        adl_harness_version::task_kind::REINSTALL
    } else {
        adl_harness_version::task_kind::INSTALL
    };
    if let Err(e) = try_begin_version_task(&state, kind, input.version.trim()) {
        return ipc::to_response(Err(e));
    }
    let guard = state.dsh_version_lock.clone().lock_owned().await;
    let current = adl_harness_version::read_selected(&root).ok().flatten();
    let is_current = current.as_deref() == Some(input.version.trim());
    tracing::debug!(version = %input.version, ?kind, ?current, is_current, "dsh::install_version: task begun");
    let was_running = if is_current { stop_running_dsh(&state).await } else { false };
    tracing::debug!(version = %input.version, was_running, select, "dsh::install_version: invoking kernel");
    let result = adl_harness_version::install_version_with_task(
        &root,
        &state.storage.paths().root,
        &input.version,
        &state.dsh_version_task,
        select,
    )
    .await
    .map(|v| serde_json::json!(v));
    match &result {
        Ok(_) => tracing::debug!(version = %input.version, "dsh::install_version: ok"),
        Err(e) => {
            tracing::debug!(version = %input.version, error = %e, "dsh::install_version: failed")
        },
    }
    finish_version_mutation(&state, guard, was_running, &result).await;
    ipc::to_response(result)
}

/// POST `/dsh/version-task` — 当前版本任务进度（无任务时为 null）。
pub async fn get_version_task(State(state): State<ServerState>) -> impl IntoResponse {
    let task = state.dsh_version_task.snapshot();
    ipc::to_response(Ok(serde_json::json!({ "task": task })))
}

/// POST `/dsh/cancel-version-task` — 请求取消当前版本任务。
pub async fn cancel_version_task(State(state): State<ServerState>) -> impl IntoResponse {
    state.dsh_version_task.cancel();
    ipc::to_response(Ok(serde_json::json!(true)))
}

/// POST `/dsh/source-status` — 获取下载源状态（system/running/config）。
pub async fn get_source_status(State(state): State<ServerState>) -> impl IntoResponse {
    let result = get_source_status_inner(&state).await;
    ipc::to_response(result)
}

async fn get_source_status_inner(state: &ServerState) -> Result<serde_json::Value, AppError> {
    let data_dir = &state.storage.paths().root;

    let system = adl_harness_version::detect_system_dsh().await.map(|info| {
        serde_json::json!({
            "path": info.path,
            "version": info.version,
        })
    });

    let running_detected = adl_harness_version::detect_running_dsh(DSH_DEFAULT_PORT).await;
    // 宿主持有 Child 即本次会话拉起（版本与来源精确已知）；try_wait 过滤已退出的
    // 子进程，避免残留句柄把外部进程误标为本次会话拉起（P5）。
    let managed = managed_snapshot(state).await;
    let running = running_detected.map(|info| running_payload(info, managed));

    let config = adl_download_source::load(data_dir)?;
    let root = dsh_root(state);
    // 宿主「当前可用」版本：选中且完整安装。内置预置版本就是普通已装版本，
    // 是否内置由 `get-version-status` 的 `bundledVersion` 记录回答，与此处无关。
    let host_version = adl_harness_version::read_selected(&root)?
        .filter(|version| adl_harness_version::is_host_version_installed(&root, version));
    let effective = adl_harness_version::resolve_effective_source(
        config.version_source,
        running.is_some(),
        host_version.is_some(),
        system.is_some(),
    );
    // 偏好解析（忽略 running）：管理项显隐与切源确认只认这份结果。running 是
    // 「运行时事实」，来源可能是应用自启也可能是用户外部手动拉起，不应遮蔽
    // 用户选择的来源偏好（否则 auto+系统安装 在进程运行时被误判为宿主能力）。
    let resolve_by_mode = |mode: adl_download_source::VersionSourceMode| {
        adl_harness_version::resolve_effective_source(
            mode,
            false,
            host_version.is_some(),
            system.is_some(),
        )
    };
    let resolved_by_mode = serde_json::json!({
        "auto": resolve_by_mode(adl_download_source::VersionSourceMode::Auto),
        "host": resolve_by_mode(adl_download_source::VersionSourceMode::Host),
        "system": resolve_by_mode(adl_download_source::VersionSourceMode::System),
    });
    let version_source = serde_json::json!({
        "mode": config.version_source,
        "effective": effective,
        "hostVersion": host_version,
        "resolvedByMode": resolved_by_mode,
    });
    let config_value =
        serde_json::to_value(&config).map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(serde_json::json!({
        "system": system,
        "running": running,
        // 拉起中：前端读数据此显示骨架胶囊，避免半途值跳变。
        "starting": state.dsh_starting.load(std::sync::atomic::Ordering::Relaxed),
        "versionSource": version_source,
        "config": config_value,
    }))
}

/// 托管快照：「本次会话拉起」的三元组（地址 + 版本 + 来源）。
/// 写路径（`run_open` 快速/复查分支）与读路径（source-status / running）共用，
/// 保证已退出的托管子进程不被当成仍在运行。
struct ManagedSnapshot {
    url: String,
    version: Option<String>,
    source: &'static str,
}

/// 宿主托管状态快照。`try_wait` 发现子进程已退出时清空 `dsh_state` 并返回
/// `None`（不再算本次会话拉起）；探测失败则保守地保持托管判定。
async fn managed_snapshot(state: &ServerState) -> Option<ManagedSnapshot> {
    managed_snapshot_inner(&state.dsh_state).await
}

/// `managed_snapshot` 的锁内实现：直接操作 `dsh_state` 句柄，供不持有
/// `&ServerState` 的写路径（`run_open`）复用，避免读写判定不对称。
async fn managed_snapshot_inner(
    dsh_state: &Arc<AsyncMutex<Option<ManagedDsh>>>,
) -> Option<ManagedSnapshot> {
    let mut guard = dsh_state.lock().await;
    let managed = guard.as_mut()?;
    let snapshot = || ManagedSnapshot {
        url: managed.process.url.clone(),
        version: managed.version.clone(),
        source: managed.source.as_str(),
    };
    match managed.process.child.try_wait() {
        Ok(Some(_)) => {
            tracing::debug!("dsh: managed child already exited; clearing hosted state");
            *guard = None;
            None
        },
        Ok(None) => Some(snapshot()),
        Err(e) => {
            tracing::warn!(error = %e, "dsh: try_wait failed; keeping managed state");
            Some(snapshot())
        },
    }
}

/// 运行中进程 payload：托管时带 spawn 地址/版本与来源，否则按外部进程（版本未知）。
fn running_payload(
    info: adl_harness_version::RunningDshInfo,
    managed: Option<ManagedSnapshot>,
) -> serde_json::Value {
    let (is_managed, version, source) = match managed {
        Some(managed) => (true, managed.version, managed.source),
        None => (false, None, "external"),
    };
    serde_json::json!({
        "url": info.url,
        "port": info.port,
        "managed": is_managed,
        "version": version,
        "source": source,
    })
}

/// POST `/dsh/running` — 轻量运行状态：只探测端口 + 宿主托管快照，
/// 不跑 `where dsh` / `dsh --version`（设置面板 5s 轮询用）。
pub async fn get_running(State(state): State<ServerState>) -> impl IntoResponse {
    let managed = managed_snapshot(&state).await;
    let running = adl_harness_version::detect_running_dsh(DSH_DEFAULT_PORT)
        .await
        .map(|info| running_payload(info, managed));
    let starting = state.dsh_starting.load(std::sync::atomic::Ordering::Relaxed);
    ipc::to_response(Ok::<serde_json::Value, AppError>(
        serde_json::json!({ "running": running, "starting": starting }),
    ))
}

/// 官方版本目录缓存有效期：设置面板反复进入/轮询不重复打 registry。
const CATALOG_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(300);

/// 取官方版本目录（TTL 内复用内存缓存；刷新失败时回退旧缓存）。
pub(crate) async fn load_catalog_cached(
    state: &ServerState,
) -> Option<adl_harness_version::VersionCatalog> {
    let cached = state
        .dsh_catalog_cache
        .read()
        .ok()
        .and_then(|slot| slot.as_ref().map(|(at, catalog)| (*at, catalog.clone())));
    if let Some((at, catalog)) = &cached {
        if at.elapsed() < CATALOG_CACHE_TTL {
            return Some(catalog.clone());
        }
    }
    match adl_harness_version::fetch_catalog(&state.storage.paths().root).await {
        Ok(catalog) => {
            if let Ok(mut slot) = state.dsh_catalog_cache.write() {
                *slot = Some((std::time::Instant::now(), catalog.clone()));
            }
            Some(catalog)
        },
        Err(e) => {
            tracing::warn!(
                error = %e,
                "dsh::settings_snapshot: catalog fetch failed; falling back to stale cache"
            );
            cached.map(|(_, catalog)| catalog)
        },
    }
}

/// 启动期预热官方版本目录：让首屏聚合快照命中缓存，避免首次进入设置面板被
/// registry 网络请求拖慢（失败仅记日志，下次进入设置时再按需拉取）。
pub(crate) async fn prewarm_catalog(state: &ServerState) {
    if load_catalog_cached(state).await.is_some() {
        tracing::debug!("dsh::catalog_prewarm: catalog cached");
    } else {
        tracing::debug!("dsh::catalog_prewarm: catalog unavailable; will retry on demand");
    }
}

/// POST `/dsh/settings-snapshot` — 版本管理块首屏原子快照：一次返回
/// source-status + version-status + catalog，前端单次提交，消除分段到货导致的跳动。
pub async fn get_settings_snapshot(State(state): State<ServerState>) -> impl IntoResponse {
    let result = get_settings_snapshot_inner(&state).await;
    ipc::to_response(result)
}

async fn get_settings_snapshot_inner(state: &ServerState) -> Result<serde_json::Value, AppError> {
    // source-status 与 version-status 互不依赖，并行取；任一腿失败只降级该腿为
    // null（前端保留旧值），不再全有全无，避免一腿抖动拖垮整个首屏（L2）。
    let (source_result, version_result) =
        tokio::join!(get_source_status_inner(state), get_version_status_value(state));
    let source = match source_result {
        Ok(source) => source,
        Err(e) => {
            tracing::warn!(
                error = %e,
                "dsh::settings_snapshot: source leg failed; degrading to null"
            );
            serde_json::Value::Null
        },
    };
    let version = match version_result {
        Ok(version) => version,
        Err(e) => {
            tracing::warn!(
                error = %e,
                "dsh::settings_snapshot: version leg failed; degrading to null"
            );
            serde_json::Value::Null
        },
    };
    let catalog = match load_catalog_cached(state).await {
        Some(catalog) => {
            serde_json::to_value(&catalog).map_err(|e| AppError::Internal(e.to_string()))?
        },
        None => serde_json::Value::Null,
    };
    Ok(serde_json::json!({
        "sourceStatus": source,
        "versionStatus": version,
        "catalog": catalog,
    }))
}

/// `/dsh/get-version-status` 与聚合快照共用的版本状态取值。
async fn get_version_status_value(state: &ServerState) -> Result<serde_json::Value, AppError> {
    let root = dsh_root(state);
    let status = adl_harness_version::get_version_status(&root, &state.storage.paths().root).await?;
    serde_json::to_value(&status).map_err(|e| AppError::Internal(e.to_string()))
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
    let input: serde_json::Value =
        serde_json::from_slice(&body).map_err(|e| AppError::InvalidInput(e.to_string()))?;

    let mut config = adl_download_source::load(&state.storage.paths().root)?;

    // PATCH 语义：字段缺省 = 不修改；类型错误 = InvalidInput（与 dsh_mirror 臂同口径，
    // 事项 11 Phase 4 A3-F1；npm_registry 旧静默忽略一并收紧）。
    if let Some(registry) = input.get("npm_registry") {
        match registry {
            serde_json::Value::String(s) => config.npm_registry = s.clone(),
            serde_json::Value::Null => {},
            _ => {
                return Err(AppError::InvalidInput("npm_registry must be string or null".into()));
            },
        }
    }
    if let Some(mirror) = input.get("dsh_mirror") {
        config.dsh_mirror = match mirror {
            serde_json::Value::String(s) => Some(s.clone()),
            serde_json::Value::Null => None,
            _ => return Err(AppError::InvalidInput("dsh_mirror must be string or null".into())),
        };
    }
    if let Some(mode) = input.get("source_mode") {
        match mode {
            serde_json::Value::String(s) => {
                config.source_mode = match s.as_str() {
                    "auto" => adl_download_source::SourceMode::Auto,
                    "manual" => adl_download_source::SourceMode::Manual,
                    _ => return Err(AppError::InvalidInput(format!("invalid source mode: {s}"))),
                };
            },
            // 显式 null 视为缺省不修改（与 proxy 字段 null-清空语义不同：source_mode
            // 无"清空"概念，前端缺省即不发该键）。
            serde_json::Value::Null => {},
            _ => {
                return Err(AppError::InvalidInput("source_mode must be string or null".into()));
            },
        }
    }
    if let Some(mode) = input.get("version_source") {
        match mode {
            serde_json::Value::String(s) => {
                config.version_source = match s.as_str() {
                    "auto" => adl_download_source::VersionSourceMode::Auto,
                    "system" => adl_download_source::VersionSourceMode::System,
                    "host" => adl_download_source::VersionSourceMode::Host,
                    _ => {
                        return Err(AppError::InvalidInput(format!("invalid version source: {s}")));
                    },
                };
            },
            serde_json::Value::Null => {},
            _ => {
                return Err(AppError::InvalidInput("version_source must be string or null".into()));
            },
        }
    }
    if let Some(proxy) = input.get("proxy") {
        // proxy 本体非对象（null 除外）直接拒绝，避免整体静默 no-op 误导调用方。
        if !proxy.is_object() && !proxy.is_null() {
            return Err(AppError::InvalidInput("proxy must be object".into()));
        }
        if let Some(proxy_mode) = proxy.get("mode") {
            match proxy_mode {
                serde_json::Value::String(s) => {
                    config.proxy.mode = match s.as_str() {
                        "auto" => adl_download_source::ProxyMode::Auto,
                        "manual" => adl_download_source::ProxyMode::Manual,
                        "none" => adl_download_source::ProxyMode::None,
                        _ => {
                            return Err(AppError::InvalidInput(format!("invalid proxy mode: {s}")));
                        },
                    };
                },
                // 显式 null 视为缺省不修改（mode 无"清空"概念）。
                serde_json::Value::Null => {},
                _ => {
                    return Err(AppError::InvalidInput("proxy mode must be string or null".into()));
                },
            }
        }
        // 字段支持 null 清空（恢复默认需清掉残留的代理地址），string 写入。
        for (key, slot) in [
            ("http_proxy", &mut config.proxy.http_proxy),
            ("https_proxy", &mut config.proxy.https_proxy),
            ("no_proxy", &mut config.proxy.no_proxy),
        ] {
            match proxy.get(key) {
                Some(serde_json::Value::String(v)) => *slot = Some(v.clone()),
                Some(serde_json::Value::Null) => *slot = None,
                Some(_) => {
                    return Err(AppError::InvalidInput(format!("{key} must be string or null")));
                },
                None => {},
            }
        }
    }

    adl_download_source::save(&state.storage.paths().root, &config)?;
    clear_source_cache(state);
    // 下载源/代理变化会使目录缓存可能来自旧 registry：清空，下次快照重新拉取。
    if let Ok(mut cache) = state.dsh_catalog_cache.write() {
        *cache = None;
    }
    Ok(serde_json::json!(true))
}

/// POST `/dsh/test-source` — 测试下载源连通性。
pub async fn test_source(body: axum::body::Bytes) -> impl IntoResponse {
    let result = test_source_inner(body).await;
    ipc::to_response(result)
}

async fn test_source_inner(body: axum::body::Bytes) -> Result<serde_json::Value, AppError> {
    let input: serde_json::Value =
        serde_json::from_slice(&body).map_err(|e| AppError::InvalidInput(e.to_string()))?;

    let url = input
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("missing 'url' field".into()))?;

    let status = adl_download_source::test_source(url, std::time::Duration::from_secs(10)).await;

    // 键名与前端 `DshTestResult` 对齐（reachable/latency_ms/error 全 snake_case，
    // 与 source-status 的 config 序列化口径一致；曾误写 latencyMs 致前端读到
    // undefined 显示 "-ms"，且自动检测的延迟比较恒取首项）。
    Ok(serde_json::json!({
        "reachable": status.reachable,
        "latency_ms": status.latency_ms,
        "error": status.error,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// dsh_root 返回 storage 的 dsh-versions 目录。
    #[test]
    fn dsh_web_args_use_loopback_patch_before_app_args() {
        let args = dsh_web_args(Path::new("/tmp/loopback.patch.yml"));
        assert!(args.windows(2).any(|w| w == ["--profile", "web"]));
        assert!(args.windows(2).any(|w| w == ["--patch", "/tmp/loopback.patch.yml"]));
        assert_eq!(args.last().map(String::as_str), Some("--no-open"));
    }

    #[test]
    fn dsh_root_returns_storage_harness_versions_dir() {
        let dir = PathBuf::from("/tmp/data");
        let storage = crate::engine::storage_from_locator(
            &adl_kernel::storage::StorageLocator::default(),
            &dir,
        );
        assert_eq!(
            dsh_root_dir(storage.paths()),
            PathBuf::from("/tmp/data/harnesses/dsh/versions")
        );
    }

    /// `revert`/`uninstall` 对非法 body 返回 BAD_REQUEST（INVALID_INPUT），不触达版本逻辑。
    #[test]
    fn version_input_camelcase_deserializes() {
        let v: VersionInput = serde_json::from_str(r#"{ "version": "1.2.3" }"#).unwrap();
        assert_eq!(v.version, "1.2.3");
    }

    /// `install-version` 对非法 body 直接 InvalidInput（离线可测，不触网）。
    #[tokio::test]
    async fn install_version_rejects_malformed_body() {
        let dir = std::env::temp_dir().join(format!(
            "adl-dsh-install-bad-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let state = crate::engine::init_server_state(
            &dir,
            crate::engine::storage_from_locator(
                &adl_kernel::storage::StorageLocator::default(),
                &dir,
            ),
        )
        .await
        .unwrap();
        let resp = install_version(State(state), axum::body::Bytes::from(r#"{ "nope": 1 }"#)).await;
        let body = axum::body::to_bytes(resp.into_response().into_body(), 1024).await.unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value.get("ok").and_then(|v| v.as_bool()), Some(false));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// `install-version` 对非法 semver 在触网前拒绝（离线可测）。
    #[tokio::test]
    async fn install_version_rejects_invalid_semver_offline() {
        let dir = std::env::temp_dir().join(format!(
            "adl-dsh-install-semver-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let state = crate::engine::init_server_state(
            &dir,
            crate::engine::storage_from_locator(
                &adl_kernel::storage::StorageLocator::default(),
                &dir,
            ),
        )
        .await
        .unwrap();
        let resp =
            install_version(State(state), axum::body::Bytes::from(r#"{ "version": "bogus!!" }"#))
                .await;
        let body = axum::body::to_bytes(resp.into_response().into_body(), 4096).await.unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value.get("ok").and_then(|v| v.as_bool()), Some(false));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn save_source_config_writes_version_source() {
        let dir = std::env::temp_dir().join(format!(
            "adl-dsh-version-source-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let state = crate::engine::init_server_state(
            &dir,
            crate::engine::storage_from_locator(
                &adl_kernel::storage::StorageLocator::default(),
                &dir,
            ),
        )
        .await
        .unwrap();

        let body = serde_json::json!({ "version_source": "host" });
        save_source_config_inner(&state, axum::body::Bytes::from(body.to_string())).await.unwrap();
        let config = adl_download_source::load(&dir).unwrap();
        assert_eq!(config.version_source, adl_download_source::VersionSourceMode::Host);

        let bad = serde_json::json!({ "version_source": "bogus" });
        let err = save_source_config_inner(&state, axum::body::Bytes::from(bad.to_string()))
            .await
            .expect_err("invalid version source");
        assert!(matches!(err, AppError::InvalidInput(_)));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// save_source_config：source_mode 写入、registry 写入、proxy 字段 null 清空。
    #[tokio::test]
    async fn save_source_config_writes_mode_and_clears_proxy() {
        let dir = std::env::temp_dir().join(format!(
            "adl-dsh-source-cfg-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let state = crate::engine::init_server_state(
            &dir,
            crate::engine::storage_from_locator(
                &adl_kernel::storage::StorageLocator::default(),
                &dir,
            ),
        )
        .await
        .unwrap();

        let body = serde_json::json!({
            "source_mode": "manual",
            "npm_registry": "https://registry.npmmirror.com",
            "proxy": {
                "mode": "manual",
                "http_proxy": "http://proxy:8080",
                "https_proxy": null,
                "no_proxy": null
            }
        });
        save_source_config_inner(&state, axum::body::Bytes::from(body.to_string())).await.unwrap();

        // null 清空：把已写入的 http_proxy 清掉。
        let clear = serde_json::json!({ "proxy": { "http_proxy": null } });
        save_source_config_inner(&state, axum::body::Bytes::from(clear.to_string())).await.unwrap();

        let config = adl_download_source::load(&dir).unwrap();
        assert_eq!(config.source_mode, adl_download_source::SourceMode::Manual);
        assert_eq!(config.npm_registry, "https://registry.npmmirror.com");
        assert_eq!(config.proxy.http_proxy, None);
        assert_eq!(config.proxy.mode, adl_download_source::ProxyMode::Manual);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// `/dsh/test-source` 响应键名与前端 `DshTestResult` 对齐（全 snake_case）：
    /// 曾误写 `latencyMs`，前端 `latency_ms` 读到 undefined 显示 "-ms"，
    /// 且自动检测的延迟比较恒取首项。用必拒连的本地端口，快失败、无外部网络依赖。
    #[tokio::test]
    async fn test_source_response_keys_match_frontend_type() {
        let body = axum::body::Bytes::from(r#"{ "url": "http://127.0.0.1:1/" }"#);
        let value = test_source_inner(body).await.unwrap();
        assert_eq!(value.get("reachable").and_then(|v| v.as_bool()), Some(false));
        assert!(value.get("latency_ms").is_some());
        assert!(value.get("latencyMs").is_none());
        assert!(value.get("error").is_some());
    }

    /// save_source_config 非法输入直接 InvalidInput，且校验全部发生在落盘前
    ///（无部分写入）。覆盖：非法 source_mode 字符串/类型、非法 registry 类型、
    ///proxy 本体非对象、proxy 字段非法类型（事项 11 Phase 4 A3-F3）。
    #[tokio::test]
    async fn save_source_config_rejects_invalid_input_atomically() {
        let dir = std::env::temp_dir().join(format!(
            "adl-dsh-source-bad-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let state = crate::engine::init_server_state(
            &dir,
            crate::engine::storage_from_locator(
                &adl_kernel::storage::StorageLocator::default(),
                &dir,
            ),
        )
        .await
        .unwrap();

        // 先落一份已知配置，后续非法写入不得污染它。
        let seed = serde_json::json!({
            "source_mode": "manual",
            "npm_registry": "https://registry.npmmirror.com",
        });
        save_source_config_inner(&state, axum::body::Bytes::from(seed.to_string())).await.unwrap();

        for bad in [
            serde_json::json!({ "source_mode": "bogus" }),
            serde_json::json!({ "source_mode": 123 }),
            serde_json::json!({ "npm_registry": 123 }),
            serde_json::json!({ "proxy": "not-an-object" }),
            serde_json::json!({ "proxy": { "http_proxy": 123 } }),
            serde_json::json!({ "proxy": { "mode": 123 } }),
        ] {
            let result =
                save_source_config_inner(&state, axum::body::Bytes::from(bad.to_string())).await;
            assert!(result.is_err(), "expected InvalidInput for {bad}");
        }

        let config = adl_download_source::load(&dir).unwrap();
        assert_eq!(config.source_mode, adl_download_source::SourceMode::Manual);
        assert_eq!(config.npm_registry, "https://registry.npmmirror.com");
        assert_eq!(config.proxy.http_proxy, None);

        let _ = std::fs::remove_dir_all(&dir);
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

    /// running payload：宿主拉起时带 spawn 来源与版本，外部进程按 unknown/external。
    #[test]
    fn running_payload_distinguishes_managed_source_and_external() {
        let info =
            adl_harness_version::RunningDshInfo { url: "http://127.0.0.1:3080/".into(), port: 3080 };
        let managed = running_payload(
            info.clone(),
            Some(ManagedSnapshot {
                url: "http://127.0.0.1:3080/".into(),
                version: Some("0.2.1".into()),
                source: "host",
            }),
        );
        assert_eq!(managed.get("managed").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(managed.get("source").and_then(|v| v.as_str()), Some("host"));
        assert_eq!(managed.get("version").and_then(|v| v.as_str()), Some("0.2.1"));

        let system = running_payload(
            info.clone(),
            Some(ManagedSnapshot {
                url: "http://127.0.0.1:3080/".into(),
                version: None,
                source: "system",
            }),
        );
        assert_eq!(system.get("source").and_then(|v| v.as_str()), Some("system"));
        assert!(system.get("version").is_some_and(|v| v.is_null()));

        let external = running_payload(info, None);
        assert_eq!(external.get("managed").and_then(|v| v.as_bool()), Some(false));
        assert_eq!(external.get("source").and_then(|v| v.as_str()), Some("external"));
        assert!(external.get("version").is_some_and(|v| v.is_null()));
    }

    /// spawn 来源对外序列化封闭值域：host / system（external 只用于外部进程）。
    #[test]
    fn spawn_source_serializes_closed_vocabulary() {
        assert_eq!(DshSpawnSource::Host.as_str(), "host");
        assert_eq!(DshSpawnSource::System.as_str(), "system");
    }
}
