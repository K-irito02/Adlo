use std::time::Duration;

use adl_errors::AppError;

pub use port::pick_free_port;

pub mod port;

/// 一个已被宿主拉起、就绪的 Web 应用进程句柄。
pub struct HostedProcess {
    pub child: tokio::process::Child,
    pub url: String,
    pub port: u16,
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
    let mut child = tokio::process::Command::new(program)
        .args(args)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::Io(format!("spawn {program} failed: {e}")))?;

    let client = reqwest::Client::new();
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if tokio::time::Instant::now() >= deadline {
            child
                .kill()
                .await
                .map_err(|e| AppError::Io(format!("timeout kill failed: {e}")))?;
            return Err(AppError::Timeout(format!(
                "{program} not ready within {timeout:?}"
            )));
        }
        let is_up = client
            .get(&url)
            .timeout(Duration::from_millis(500))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if is_up {
            return Ok(HostedProcess { child, url, port });
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
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