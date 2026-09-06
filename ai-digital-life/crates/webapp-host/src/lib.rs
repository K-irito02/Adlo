use std::time::Duration;

use adl_errors::AppError;

pub use port::pick_free_port;

pub mod port;

/// dsh web profile 默认监听端口（`@deepseek-ai/dsh` 启动时不传 `--port` 的默认值）。
pub const DSH_DEFAULT_PORT: u16 = 3080;

/// 一个已被宿主拉起、就绪的 Web 应用进程句柄。
pub struct HostedProcess {
    pub child: tokio::process::Child,
    pub url: String,
    pub port: u16,
}

/// 尝试 spawn 程序，Windows 上自动回退到 `.cmd` 后缀。
///
/// Windows 的 npm/npx 等工具以 `.cmd` 批处理脚本形式存在。
/// 从桌面启动的 GUI 进程 PATH 可能不含 Node.js 直接路径，
/// 但 `.cmd` 扩展名会通过 PATHEXT 被自动查找——前提是目录在 PATH 上。
/// 若 `npx` 本身找不到，尝试 `npx.cmd` 作为回退。
fn try_spawn(program: &str, args: &[String]) -> Result<tokio::process::Child, AppError> {
    // 先尝试原始程序名
    match tokio::process::Command::new(program).args(args).kill_on_drop(true).spawn() {
        Ok(child) => Ok(child),
        Err(e) => {
            // Windows 上回退到 .cmd 后缀
            #[cfg(target_os = "windows")]
            {
                if !program.ends_with(".cmd") {
                    let cmd_program = format!("{program}.cmd");
                    tracing::warn!(
                        ?program,
                        ?cmd_program,
                        ?e,
                        "spawn failed, trying .cmd fallback on Windows"
                    );
                    return tokio::process::Command::new(&cmd_program)
                        .args(args)
                        .kill_on_drop(true)
                        .spawn()
                        .map_err(|e2| {
                            AppError::Io(format!(
                                "spawn {program} failed ({e}); fallback {cmd_program} also failed: {e2}"
                            ))
                        });
                }
            }
            Err(AppError::Io(format!("spawn {program} failed: {e}")))
        },
    }
}

/// 在空闲端口上 spawn 指定程序，并轮询其根路径直到 HTTP 200 或超时。
///
/// 超时：杀掉子进程并返回 `AppError::Timeout`。
/// spawn 失败：返回 `AppError::Io`。
pub async fn spawn_and_wait_ready(
    program: &str,
    args: &[String],
    timeout: Duration,
) -> Result<HostedProcess, AppError> {
    let port = pick_free_port()?;
    let url = format!("http://127.0.0.1:{port}");
    tracing::info!(?program, ?args, ?port, ?url, "spawn_and_wait_ready: starting process");
    let mut child = try_spawn(program, args)?;

    // 记录子进程PID
    if let Some(pid) = child.id() {
        tracing::info!(?program, ?pid, "spawn_and_wait_ready: child process started");
    }

    let client = reqwest::Client::new();
    let deadline = tokio::time::Instant::now() + timeout;
    let mut check_count = 0;

    // 宿主先探测一个空闲端口作为健康检查兜底，但被托管的 web 应用可能忽略 --port
    // 而绑定自己的固定默认端口（如 dsh 默认 3080），因此同时探测该默认端口。
    let default_url = format!("http://127.0.0.1:{DSH_DEFAULT_PORT}");
    loop {
        if tokio::time::Instant::now() >= deadline {
            tracing::error!(?program, ?port, ?check_count, "spawn_and_wait_ready: timeout");
            // 尝试读取子进程输出以获取更多信息（带超时保护）
            if let Some(mut stdout) = child.stdout.take() {
                use tokio::io::AsyncReadExt;
                let mut output = String::new();
                if tokio::time::timeout(Duration::from_secs(2), stdout.read_to_string(&mut output))
                    .await
                    .is_ok()
                {
                    tracing::error!(?program, "spawn_and_wait_ready: stdout: {}", output);
                }
            }
            if let Some(mut stderr) = child.stderr.take() {
                use tokio::io::AsyncReadExt;
                let mut output = String::new();
                if tokio::time::timeout(Duration::from_secs(2), stderr.read_to_string(&mut output))
                    .await
                    .is_ok()
                {
                    tracing::error!(?program, "spawn_and_wait_ready: stderr: {}", output);
                }
            }
            if let Err(e) = child.kill().await {
                tracing::error!(?program, "spawn_and_wait_ready: failed to kill on timeout: {e}");
            }
            return Err(AppError::Timeout(format!("{program} not ready within {timeout:?}")));
        }
        check_count += 1;

        // 检查默认端口3080
        let is_up_default = client
            .get(&default_url)
            .timeout(Duration::from_millis(500))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if is_up_default {
            tracing::info!(
                ?program,
                default_url,
                ?check_count,
                "spawn_and_wait_ready: process is ready on default port"
            );
            return Ok(HostedProcess { child, url: default_url, port: DSH_DEFAULT_PORT });
        }

        // 检查指定端口
        let is_up = client
            .get(&url)
            .timeout(Duration::from_millis(500))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if is_up {
            tracing::info!(
                ?program,
                ?port,
                ?check_count,
                "spawn_and_wait_ready: process is ready on specified port"
            );
            return Ok(HostedProcess { child, url, port });
        }

        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

/// 直接通过 node.js 启动 dsh（使用内置包路径）。
///
/// 与 `spawn_and_wait_ready` 类似，但专门用于 `node <script_path> [extra_args...]` 场景。
/// 构建参数时将 `script_path` 作为第一参数，`extra_args` 追加其后。
/// 轮询两个端口：`pick_free_port()` 返回的临时端口和 `DSH_DEFAULT_PORT` (3080)。
pub async fn spawn_node_direct(
    node_bin: &str,
    script_path: &str,
    extra_args: &[String],
    timeout: Duration,
) -> Result<HostedProcess, AppError> {
    let port = pick_free_port()?;
    let url = format!("http://127.0.0.1:{port}");
    let default_url = format!("http://127.0.0.1:{DSH_DEFAULT_PORT}");

    let mut args = vec![script_path.to_string()];
    args.extend_from_slice(extra_args);

    tracing::info!(?node_bin, ?script_path, ?port, ?url, "spawn_node_direct: starting process");
    let mut child = try_spawn(node_bin, &args)?;

    if let Some(pid) = child.id() {
        tracing::info!(?node_bin, ?pid, "spawn_node_direct: child process started");
    }

    let deadline = tokio::time::Instant::now() + timeout;
    let mut check_count = 0;

    loop {
        if tokio::time::Instant::now() >= deadline {
            tracing::error!(?node_bin, ?port, ?check_count, "spawn_node_direct: timeout");
            if let Some(mut stdout) = child.stdout.take() {
                use tokio::io::AsyncReadExt;
                let mut output = String::new();
                if tokio::time::timeout(Duration::from_secs(2), stdout.read_to_string(&mut output))
                    .await
                    .is_ok()
                {
                    tracing::error!(?node_bin, "spawn_node_direct: stdout: {}", output);
                }
            }
            if let Some(mut stderr) = child.stderr.take() {
                use tokio::io::AsyncReadExt;
                let mut output = String::new();
                if tokio::time::timeout(Duration::from_secs(2), stderr.read_to_string(&mut output))
                    .await
                    .is_ok()
                {
                    tracing::error!(?node_bin, "spawn_node_direct: stderr: {}", output);
                }
            }
            if let Err(e) = child.kill().await {
                tracing::error!(?node_bin, "spawn_node_direct: failed to kill on timeout: {e}");
            }
            return Err(AppError::Timeout(format!("{node_bin} not ready within {timeout:?}")));
        }
        check_count += 1;

        if check_port(&default_url).await {
            tracing::info!(
                ?node_bin,
                default_url,
                ?check_count,
                "spawn_node_direct: process is ready on default port"
            );
            return Ok(HostedProcess { child, url: default_url, port: DSH_DEFAULT_PORT });
        }

        if check_port(&url).await {
            tracing::info!(
                ?node_bin,
                ?port,
                ?check_count,
                "spawn_node_direct: process is ready on specified port"
            );
            return Ok(HostedProcess { child, url, port });
        }

        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

/// 检查指定 URL 是否可达（HTTP 2xx）。
async fn check_port(url: &str) -> bool {
    reqwest::Client::new()
        .get(url)
        .timeout(Duration::from_secs(1))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 单元测试：仅覆盖可离线验证的部分（pick_free_port 已在 port.rs 测过）。
    // spawn_and_wait_ready 依赖真实进程，难用单测覆盖，不强制写网络单测。
    #[test]
    fn hosted_process_fields_exist() {
        let _ = std::mem::size_of::<HostedProcess>();
    }
}
