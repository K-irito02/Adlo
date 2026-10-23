use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use adl_errors::AppError;
use tokio::io::{AsyncBufReadExt, BufReader};

/// 一个已被宿主拉起、就绪的进程句柄（从 webapp-host 原样搬入，字段保持同名）。
pub struct HostedProcess {
    pub child: tokio::process::Child,
    pub url: String,
    pub port: u16,
}

/// 绑定一个临时端口以探测空闲端口号，随后关闭监听返回端口。
pub fn pick_free_port() -> Result<u16, AppError> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::Io(format!("bind ephemeral port failed: {e}")))?;
    let port =
        listener.local_addr().map_err(|e| AppError::Io(format!("local_addr failed: {e}")))?.port();
    Ok(port)
}

/// 去掉 ANSI 转义序列（如 `\x1b[0m`），避免残留控制字符进日志。
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // 跳过 CSI 序列：ESC [ 参数… 中间字节… 最终字节。
            let mut it = chars.by_ref().peekable();
            if it.peek() == Some(&'[') {
                it.next();
                for nc in it.by_ref() {
                    if ('\x40'..='\x7e').contains(&nc) {
                        break;
                    }
                }
                continue;
            }
        }
        out.push(c);
    }
    out
}

/// 日志脱敏：去掉 URL 的 query 与 fragment 再记录。
/// 启动打印的真实入口 URL 常含一次性认证参数（如 `?token=xxx`），属凭据，
/// 禁止进普通日志。脱敏后仅保留 origin + path，定位问题足够（端口/落点仍可见）。
fn redact_url_for_log(url: &str) -> String {
    let stripped = strip_ansi(url);
    let mut out = String::with_capacity(stripped.len());
    for c in stripped.chars() {
        if c == '?' || c == '#' {
            break;
        }
        out.push(c);
    }
    // 尾随标点与引号是打印格式残留，非 URL 本体。
    out.trim_end_matches(['.', ',', ';', '!', '?', ':', '。', '，', '；', '"', '\'', ')', ']', '}'])
        .to_string()
}

/// 日志行脱敏：把 `token=<值>` 的参数值替换为 `<redacted>`（值到空白/引号/括号为止）。
/// stdout 整行 debug 记录前调用；解析仍用原始行。
/// URL/参数值截断符：空白、半角/全角引号与括号（\u 转义，避免源码编码歧义）。
const TOKEN_TERMINATORS: &[char] = &[
    '"', '\'', ')', ']', '}', '>', '\u{201c}', '\u{201d}', '\u{2018}', '\u{2019}', '\u{00ab}',
    '\u{00bb}',
];

fn redact_token_param(line: &str) -> String {
    let cleaned = strip_ansi(line);
    let mut out = String::with_capacity(cleaned.len());
    let mut rest = cleaned.as_str();
    while let Some(idx) = rest.find("token=") {
        out.push_str(&rest[..idx + "token=".len()]);
        out.push_str("<redacted>");
        let after = &rest[idx + "token=".len()..];
        let skip = after
            .find(|c: char| c.is_whitespace() || TOKEN_TERMINATORS.contains(&c))
            .unwrap_or(after.len());
        rest = &after[skip..];
    }
    out.push_str(rest);
    out
}

/// 从一行 stdout 中提取打印出的真实入口 URL（通用层）。
///
/// 约定：`marker` 行内优先取首个 loopback 真实入口
///（含一次性 `?token=` 等认证参数，LAN 地址在括号内会被自然忽略，
/// 因为 loopback 项排在前面；若无 loopback 项则回退首个 URL）。
fn extract_launch_url(line: &str, marker: &str) -> Option<String> {
    let idx = line.find(marker)?;
    let mut rest = &line[idx + marker.len()..];
    let mut first: Option<String> = None;
    loop {
        let http = rest.find("http://");
        let https = rest.find("https://");
        let Some(start) = (match (http, https) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (Some(a), None) | (None, Some(a)) => Some(a),
            // 无更多 URL：回退首个（可能非 loopback），都没有则为 None。
            (None, None) => None,
        }) else {
            return first;
        };
        let url_part = &rest[start..];
        let end = url_part
            .find(|c: char| c.is_whitespace() || TOKEN_TERMINATORS.contains(&c))
            .unwrap_or(url_part.len());
        let url = url_part[..end]
            .trim_end_matches(['.', ',', ';', '!', '?', ':'])
            .trim_end_matches(['。', '，', '；', '\u{201c}', '\u{201d}'])
            .to_string();
        rest = &url_part[end..];
        if url.is_empty() {
            continue;
        }
        if first.is_none() {
            first = Some(url.clone());
        }
        if is_loopback_url(&url) {
            return Some(url);
        }
    }
}

/// 粗判 loopback 地址（127/8、localhost、IPv6 回环，括号内外两种写法）。
///
/// 解析顺序必须先处理方括号再处理端口：
/// `[::1]:3080` 须先取括号内主体 `::1`；若先按 `:port` 切分，
/// `localhost:3080` 会被误判为纯 IPv6 字面量（R1 复审发现的真 bug）。
fn is_loopback_url(url: &str) -> bool {
    let after_scheme = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let authority = after_scheme.split(['/', '?', '#']).next().unwrap_or(after_scheme);
    let host_port = authority.rsplit_once('@').map(|(_, h)| h).unwrap_or(authority);
    // 方括号 IPv6 字面量：`[v6]` 或 `[v6]:port`，取括号内主体。
    // 非括号 host：恰好 1 个冒号即 `host:port` 去端口；0 个即 host 本体；
    // 多个冒号即无括号 IPv6 字面量（URL 内无端口写法），整体即 host。
    let host_no_port = if let Some(rest) = host_port.strip_prefix('[') {
        rest.split(']').next().unwrap_or(rest)
    } else if host_port.chars().filter(|&c| c == ':').count() == 1 {
        host_port.split_once(':').map(|(h, _)| h).unwrap_or(host_port)
    } else {
        host_port
    };
    host_no_port.eq_ignore_ascii_case("localhost") || host_no_port == "::1" || {
        let parts: Vec<&str> = host_no_port.split('.').collect();
        parts.len() == 4 && parts[0] == "127" && parts.iter().all(|p| p.parse::<u8>().is_ok())
    }
}

/// 共享的 URL 槽：stdout 读取任务写入，spawn 轮询读取。
type UrlSlot = Arc<StdMutex<Option<String>>>;

/// spawn 子进程并持续 drain stdout/stderr（避免管道填满阻塞子进程），
/// 同时从 stdout 中解析打印出的真实入口 URL（`marker` 由调用方按应用指定）。
/// marker 为 `&'static str`：调用方传模块级常量即可。
fn spawn_capturing(
    program: &str,
    args: &[String],
    marker: &'static str,
) -> Result<(tokio::process::Child, UrlSlot), AppError> {
    use tokio::process::Command as TokioCommand;
    let slot: UrlSlot = Arc::new(StdMutex::new(None));
    let mut cmd = TokioCommand::new(program);
    cmd.args(args).kill_on_drop(true).stdout(Stdio::piped()).stderr(Stdio::piped());
    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
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
                    let mut fallback = TokioCommand::new(&cmd_program);
                    fallback
                        .args(args)
                        .kill_on_drop(true)
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped());
                    match fallback.spawn() {
                        Ok(child) => return drain_and_watch(child, slot, marker),
                        Err(e2) => {
                            return Err(AppError::Io(format!(
                                "spawn {program} failed ({e}); fallback {cmd_program} also failed: {e2}"
                            )));
                        },
                    }
                }
            }
            return Err(AppError::Io(format!("spawn {program} failed: {e}")));
        },
    };
    drain_and_watch(child, slot, marker)
}

/// 接管已 spawn 子进程的 stdout/stderr：drain 防阻塞 + 解析真实入口 URL。
/// 日志一律脱敏后记录（`?token=` 等认证参数属凭据，见 `redact_*`）。
fn drain_and_watch(
    mut child: tokio::process::Child,
    slot: UrlSlot,
    marker: &'static str,
) -> Result<(tokio::process::Child, UrlSlot), AppError> {
    if let Some(stdout) = child.stdout.take() {
        let slot_clone = slot.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(url) = extract_launch_url(&line, marker) {
                    tracing::info!(
                        redacted_url = %redact_url_for_log(&url),
                        "proc-host: captured launch URL"
                    );
                    if let Ok(mut guard) = slot_clone.lock() {
                        if guard.is_none() {
                            *guard = Some(url);
                        }
                    }
                }
                tracing::debug!(target: "host-stdout", "{}", redact_token_param(&line));
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                // stderr 仅 drain + debug 记录；同 stdout 做脱敏（子进程可能把 URL 打到 stderr）。
                tracing::debug!(target: "host-stderr", "{}", redact_token_param(&line));
            }
        });
    }
    Ok((child, slot))
}

/// 等待真实入口 URL 打印的最长宽限（端口已通但 stdout 行尚未到达时）。
/// 应用一般先监听端口后打印 URL，两者间有短暂窗口；此处轮询而非固定 sleep。
fn resolve_url_slot(slot: &UrlSlot, fallback: &str) -> String {
    slot.lock().ok().and_then(|g| g.clone()).unwrap_or_else(|| fallback.to_string())
}

/// 端口就绪后等待真实入口 URL（最多 `wait`），超时则回退裸 URL 并告警。
async fn wait_for_authenticated_url(slot: &UrlSlot, fallback: &str, wait: Duration) -> String {
    let start = std::time::Instant::now();
    loop {
        if let Some(url) = slot.lock().ok().and_then(|g| g.clone()) {
            return url;
        }
        if start.elapsed() >= wait {
            tracing::warn!(
                fallback,
                "proc-host: port ready but no launch URL captured; falling back to bare URL (may require auth)"
            );
            return fallback.to_string();
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// 快速检查端口是否可达（TCP 连接检查，带超时）。
async fn check_port_fast(port: u16) -> bool {
    use tokio::net::TcpStream;
    tokio::time::timeout(
        Duration::from_millis(100),
        TcpStream::connect(format!("127.0.0.1:{port}")),
    )
    .await
    .is_ok()
}

/// 在候选端口上 spawn 指定程序，并轮询直到任一端口 TCP 可达或超时。
/// 需认证的本地应用会打印带参数的真实入口 URL，
/// 端口就绪后等待该 URL（最多 5s），用它作为 `HostedProcess.url` 以通过 401 认证。
/// 超时：杀掉子进程并返回 `AppError::Timeout`。
/// spawn 失败：返回 `AppError::Io`。
pub async fn spawn_with_marker(
    program: &str,
    args: &[String],
    marker: &'static str,
    ports: &[u16],
    timeout: Duration,
) -> Result<HostedProcess, AppError> {
    if ports.is_empty() {
        return Err(AppError::InvalidInput("spawn_with_marker: ports must not be empty".into()));
    }
    let fallbacks: Vec<String> = ports.iter().map(|p| format!("http://127.0.0.1:{p}")).collect();
    tracing::info!(?program, ?args, ?ports, "spawn_with_marker: starting process");
    let (mut child, url_slot) = spawn_capturing(program, args, marker)?;

    // 记录子进程PID
    if let Some(pid) = child.id() {
        tracing::info!(?program, ?pid, "spawn_with_marker: child process started");
    }

    let deadline = tokio::time::Instant::now() + timeout;
    let mut check_count = 0;
    let spawn_start = std::time::Instant::now();

    loop {
        if tokio::time::Instant::now() >= deadline {
            tracing::error!(?program, ?ports, ?check_count, "spawn_with_marker: timeout");
            // stdout/stderr 已由后台任务持续 drain（防管道阻塞），此处仅记录已捕获的 URL 状态（脱敏）。
            tracing::error!(?program, captured_url = %redact_url_for_log(&resolve_url_slot(&url_slot, "")), "spawn_with_marker: captured URL at timeout");
            if let Err(e) = child.kill().await {
                tracing::error!(?program, "spawn_with_marker: failed to kill on timeout: {e}");
            }
            return Err(AppError::Timeout(format!("{program} not ready within {timeout:?}")));
        }
        check_count += 1;

        let check_start = std::time::Instant::now();
        for (port, fallback) in ports.iter().zip(fallbacks.iter()) {
            if check_port_fast(*port).await {
                let final_url =
                    wait_for_authenticated_url(&url_slot, fallback, Duration::from_secs(5)).await;
                tracing::info!(
                    ?program,
                    redacted_url = %redact_url_for_log(&final_url),
                    ?port,
                    ?check_count,
                    elapsed_ms = check_start.elapsed().as_millis(),
                    total_elapsed_ms = spawn_start.elapsed().as_millis(),
                    "spawn_with_marker: process is ready"
                );
                return Ok(HostedProcess { child, url: final_url, port: *port });
            }
        }

        tracing::debug!(
            ?program,
            ?check_count,
            elapsed_ms = check_start.elapsed().as_millis(),
            "spawn_with_marker: check failed, sleeping"
        );

        // 使用 100ms 轮询间隔，平衡响应速度与 CPU 占用
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn spawn_captures_marker_url() {
        // python 不可用环境下跳过：用 cmd 模拟一个“打印 marker 后常驻”的子进程
        let hp = spawn_with_marker(
            "cmd",
            &["/c".into(), "echo READY http://127.0.0.1:9 & ping -n 6 127.0.0.1 >nul".into()],
            "READY",
            &[9],
            std::time::Duration::from_secs(20),
        )
        .await;
        // 端口 9 大概率未监听 → 期望超时错误，关键断言是 marker 管线未 panic 且错误为 Timeout
        assert!(matches!(hp, Err(AppError::Timeout(_))));
    }
}
