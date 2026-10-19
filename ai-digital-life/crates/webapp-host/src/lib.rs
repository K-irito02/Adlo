use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use adl_errors::AppError;
use tokio::io::{AsyncBufReadExt, BufReader};

pub use port::pick_free_port;

pub mod port;

/// dsh web profile 默认监听端口（`@deepseek-ai/dsh` 启动时不传 `--port` 的默认值）。
pub const DSH_DEFAULT_PORT: u16 = 3080;

/// 本地 Web 应用在 stdout 打印真实入口 URL 的行标记（通用层）。
/// dsh 0.2.x 起打印 `dsh web: http://127.0.0.1:3080/?token=xxx (LAN: …)`；
/// 未来其它智能体站点若同样打印认证 URL，只需新增各自的 marker 常量并复用
/// `extract_launch_url`，无需复制捕获管线。
pub const DSH_URL_MARKER: &str = "dsh web:";

/// 需要认证的本地 Web 应用在裸 `/` 上返回的 401 指纹（通用层）。
/// 当前仅 dsh（`dsh-client-connection` 的 `writeUnauthorized`）；
/// 未来其它站点新增指纹时追加到 `is_auth_required_body` 的匹配表即可。
pub const DSH_AUTH_REQUIRED_BODY: &str = "dsh web authentication required";

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
/// 禁止进普通日志（R1-H1；调试日志收起器会收录 stdout 明文）。
/// 脱敏后仅保留 origin + path，定位问题足够（端口/落点仍可见）。
pub fn redact_url_for_log(url: &str) -> String {
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

pub fn redact_token_param(line: &str) -> String {
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

/// 判断 401 正文是否为“需认证，先打开打印出的 URL”的已知本地应用指纹。
/// 调用方（如运行态探测）据此把“进程在运行但需认证”与“进程未运行”区分开，
/// 避免误判未运行而重复 spawn 撞上 `EADDRINUSE`。
pub fn is_auth_required_body(body: &str) -> bool {
    body.contains(DSH_AUTH_REQUIRED_BODY)
}

/// 一个已被宿主拉起、就绪的 Web 应用进程句柄。
pub struct HostedProcess {
    pub child: tokio::process::Child,
    pub url: String,
    pub port: u16,
}

/// 从一行 stdout 中提取打印出的真实入口 URL（通用层）。
///
/// 约定：`marker` 行内优先取首个 loopback 真实入口
///（含一次性 `?token=` 等认证参数，LAN 地址在括号内会被自然忽略，
/// 因为 loopback 项排在前面；若无 loopback 项则回退首个 URL）。
/// 裸地址会 401 的站点必须用此 URL 打开
///（首次访问种 HttpOnly cookie，后续靠 cookie）。
pub fn extract_launch_url(line: &str, marker: &str) -> Option<String> {
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
/// 同时从 stdout 中解析打印出的真实入口 URL（`marker` 由调用方按应用指定，
/// dsh 传 `DSH_URL_MARKER`；未来其它站点传各自 marker，复用同一管线）。
/// marker 为 `&'static str`：调用方传模块级常量即可（dsh 见 `DSH_URL_MARKER`）。
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
                        "webapp-host: captured launch URL"
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

/// 端口就绪后等待真实入口 URL（最多 `wait`），超时则回退裸 URL 并告警
///（裸地址对需认证的站点会 401，届时以前端展示的指引为准）。
async fn wait_for_authenticated_url(slot: &UrlSlot, fallback: &str, wait: Duration) -> String {
    let start = std::time::Instant::now();
    loop {
        if let Some(url) = slot.lock().ok().and_then(|g| g.clone()) {
            return url;
        }
        if start.elapsed() >= wait {
            tracing::warn!(
                fallback,
                "webapp-host: port ready but no launch URL captured; falling back to bare URL (may require auth)"
            );
            return fallback.to_string();
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}
/// 在空闲端口上 spawn 指定程序，并轮询其根路径直到 TCP 可达或超时。
/// 需认证的本地应用会打印带参数的真实入口 URL（dsh 即 `dsh web: <url>`），
/// 端口就绪后等待该 URL（最多 5s），用它作为 `HostedProcess.url` 以通过 401 认证。
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
    let (mut child, url_slot) = spawn_capturing(program, args, DSH_URL_MARKER)?;

    // 记录子进程PID
    if let Some(pid) = child.id() {
        tracing::info!(?program, ?pid, "spawn_and_wait_ready: child process started");
    }

    let deadline = tokio::time::Instant::now() + timeout;
    let mut check_count = 0;
    let spawn_start = std::time::Instant::now();

    // 宿主先探测一个空闲端口作为健康检查兜底，但被托管的 web 应用可能忽略 --port
    // 而绑定自己的固定默认端口（如 dsh 默认 3080），因此同时探测该默认端口。
    let default_url = format!("http://127.0.0.1:{DSH_DEFAULT_PORT}");
    loop {
        if tokio::time::Instant::now() >= deadline {
            tracing::error!(?program, ?port, ?check_count, "spawn_and_wait_ready: timeout");
            // stdout/stderr 已由后台任务持续 drain（防管道阻塞），此处仅记录已捕获的 URL 状态（脱敏）。
            tracing::error!(?program, captured_url = %redact_url_for_log(&resolve_url_slot(&url_slot, "")), "spawn_and_wait_ready: captured URL at timeout");
            if let Err(e) = child.kill().await {
                tracing::error!(?program, "spawn_and_wait_ready: failed to kill on timeout: {e}");
            }
            return Err(AppError::Timeout(format!("{program} not ready within {timeout:?}")));
        }
        check_count += 1;

        let check_start = std::time::Instant::now();
        // 快速检查默认端口3080（TCP 连接检查，比 HTTP 请求更快）
        if check_port_fast(DSH_DEFAULT_PORT).await {
            let final_url =
                wait_for_authenticated_url(&url_slot, &default_url, Duration::from_secs(5)).await;
            tracing::info!(
                ?program,
                redacted_url = %redact_url_for_log(&final_url),
                ?check_count,
                elapsed_ms = check_start.elapsed().as_millis(),
                total_elapsed_ms = spawn_start.elapsed().as_millis(),
                "spawn_and_wait_ready: process is ready on default port"
            );
            return Ok(HostedProcess { child, url: final_url, port: DSH_DEFAULT_PORT });
        }

        // 检查指定端口（TCP 连接检查）
        if check_port_fast(port).await {
            let final_url =
                wait_for_authenticated_url(&url_slot, &url, Duration::from_secs(5)).await;
            tracing::info!(
                ?program,
                redacted_url = %redact_url_for_log(&final_url),
                ?port,
                ?check_count,
                elapsed_ms = check_start.elapsed().as_millis(),
                total_elapsed_ms = spawn_start.elapsed().as_millis(),
                "spawn_and_wait_ready: process is ready on specified port"
            );
            return Ok(HostedProcess { child, url: final_url, port });
        }

        tracing::debug!(
            ?program,
            ?check_count,
            elapsed_ms = check_start.elapsed().as_millis(),
            "spawn_and_wait_ready: check failed, sleeping"
        );

        // 使用 100ms 轮询间隔，平衡响应速度与 CPU 占用
        tokio::time::sleep(Duration::from_millis(100)).await;
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
    let (mut child, url_slot) = spawn_capturing(node_bin, &args, DSH_URL_MARKER)?;

    if let Some(pid) = child.id() {
        tracing::info!(?node_bin, ?pid, "spawn_node_direct: child process started");
    }

    let deadline = tokio::time::Instant::now() + timeout;
    let mut check_count = 0;
    let spawn_start = std::time::Instant::now();

    loop {
        if tokio::time::Instant::now() >= deadline {
            tracing::error!(?node_bin, ?port, ?check_count, "spawn_node_direct: timeout");
            tracing::error!(?node_bin, captured_url = %redact_url_for_log(&resolve_url_slot(&url_slot, "")), "spawn_node_direct: captured URL at timeout");
            if let Err(e) = child.kill().await {
                tracing::error!(?node_bin, "spawn_node_direct: failed to kill on timeout: {e}");
            }
            return Err(AppError::Timeout(format!("{node_bin} not ready within {timeout:?}")));
        }
        check_count += 1;

        let check_start = std::time::Instant::now();
        // 快速检查默认端口3080（TCP 连接检查，比 HTTP 请求更快）
        if check_port_fast(DSH_DEFAULT_PORT).await {
            let final_url =
                wait_for_authenticated_url(&url_slot, &default_url, Duration::from_secs(5)).await;
            tracing::info!(
                ?node_bin,
                redacted_url = %redact_url_for_log(&final_url),
                ?check_count,
                elapsed_ms = check_start.elapsed().as_millis(),
                total_elapsed_ms = spawn_start.elapsed().as_millis(),
                "spawn_node_direct: process is ready on default port"
            );
            return Ok(HostedProcess { child, url: final_url, port: DSH_DEFAULT_PORT });
        }

        // 检查指定端口（TCP 连接检查）
        if check_port_fast(port).await {
            let final_url =
                wait_for_authenticated_url(&url_slot, &url, Duration::from_secs(5)).await;
            tracing::info!(
                ?node_bin,
                redacted_url = %redact_url_for_log(&final_url),
                ?port,
                ?check_count,
                elapsed_ms = check_start.elapsed().as_millis(),
                total_elapsed_ms = spawn_start.elapsed().as_millis(),
                "spawn_node_direct: process is ready on specified port"
            );
            return Ok(HostedProcess { child, url: final_url, port });
        }

        tracing::debug!(
            ?node_bin,
            ?check_count,
            elapsed_ms = check_start.elapsed().as_millis(),
            "spawn_node_direct: check failed, sleeping"
        );

        // 使用 100ms 轮询间隔，平衡响应速度与 CPU 占用
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// 快速检查端口是否可达（TCP 连接检查，带超时）。
pub async fn check_port_fast(port: u16) -> bool {
    use tokio::net::TcpStream;
    tokio::time::timeout(
        Duration::from_millis(100),
        TcpStream::connect(format!("127.0.0.1:{port}")),
    )
    .await
    .is_ok()
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

    #[tokio::test]
    async fn wait_for_authenticated_url_returns_captured_immediately() {
        let slot: UrlSlot = Arc::new(StdMutex::new(Some("http://127.0.0.1:3080/?token=x".into())));
        let got =
            wait_for_authenticated_url(&slot, "http://127.0.0.1:3080/", Duration::from_secs(5))
                .await;
        assert_eq!(got, "http://127.0.0.1:3080/?token=x");
    }

    #[tokio::test]
    async fn wait_for_authenticated_url_falls_back_to_bare_on_timeout() {
        let slot: UrlSlot = Arc::new(StdMutex::new(None));
        let got =
            wait_for_authenticated_url(&slot, "http://127.0.0.1:3080/", Duration::from_millis(50))
                .await;
        assert_eq!(got, "http://127.0.0.1:3080/");
    }

    #[test]
    fn extract_launch_url_parses_dsh_authenticated_url() {
        let line = "dsh web: http://127.0.0.1:3080/?token=abc123 (LAN: http://192.168.1.2:3080/?token=abc123)";
        assert_eq!(
            extract_launch_url(line, DSH_URL_MARKER).as_deref(),
            Some("http://127.0.0.1:3080/?token=abc123")
        );
    }

    #[test]
    fn extract_launch_url_supports_other_markers() {
        let line = "agent web: https://127.0.0.1:4099/?auth=xyz";
        assert_eq!(
            extract_launch_url(line, "agent web:").as_deref(),
            Some("https://127.0.0.1:4099/?auth=xyz")
        );
        // marker 不匹配时不误解析
        assert!(extract_launch_url(line, DSH_URL_MARKER).is_none());
    }

    #[test]
    fn extract_launch_url_returns_none_without_marker_or_url() {
        assert!(extract_launch_url("http://127.0.0.1:3080/?token=abc", DSH_URL_MARKER).is_none());
        assert!(extract_launch_url("dsh web: startup failed", DSH_URL_MARKER).is_none());
        assert!(extract_launch_url("", DSH_URL_MARKER).is_none());
    }

    #[test]
    fn extract_launch_url_prefers_loopback_over_lan() {
        // LAN 在前、loopback 在后也应选中 loopback（dsh 实际先打印 loopback，此处覆盖顺序变化）。
        let line =
            "dsh web: http://192.168.1.2:3080/?token=x (loopback http://127.0.0.1:3080/?token=x)";
        assert_eq!(
            extract_launch_url(line, DSH_URL_MARKER).as_deref(),
            Some("http://127.0.0.1:3080/?token=x")
        );
        // 无 loopback 时回退首个 URL。
        let line = "dsh web: http://10.0.0.5:3080/";
        assert_eq!(
            extract_launch_url(line, DSH_URL_MARKER).as_deref(),
            Some("http://10.0.0.5:3080/")
        );
    }

    #[test]
    fn extract_launch_url_trims_punctuation_and_brackets() {
        let line = "dsh web: <http://127.0.0.1:3080/?token=abc123>,";
        assert_eq!(
            extract_launch_url(line, DSH_URL_MARKER).as_deref(),
            Some("http://127.0.0.1:3080/?token=abc123")
        );
        let line = "dsh web: “http://127.0.0.1:3080/?token=abc”。";
        assert_eq!(
            extract_launch_url(line, DSH_URL_MARKER).as_deref(),
            Some("http://127.0.0.1:3080/?token=abc")
        );
    }

    #[test]
    fn redact_url_for_log_strips_query_and_fragment() {
        assert_eq!(
            redact_url_for_log("http://127.0.0.1:3080/?token=abc123"),
            "http://127.0.0.1:3080/"
        );
        assert_eq!(
            redact_url_for_log("http://127.0.0.1:3080/?token=abc#frag"),
            "http://127.0.0.1:3080/"
        );
        // 裸地址原样返回（仅去尾随标点）。
        assert_eq!(redact_url_for_log("http://127.0.0.1:3080/."), "http://127.0.0.1:3080/");
    }

    #[test]
    fn redact_token_param_masks_value_only() {
        assert_eq!(
            redact_token_param("dsh web: http://127.0.0.1:3080/?token=abc123 (LAN: x)"),
            "dsh web: http://127.0.0.1:3080/?token=<redacted> (LAN: x)"
        );
        // 无 token 行原文返回。
        assert_eq!(redact_token_param("listening on 3080"), "listening on 3080");
    }

    #[test]
    fn is_auth_required_body_matches_known_fingerprints() {
        assert!(is_auth_required_body(
            "dsh web authentication required; reopen the URL printed by dsh web."
        ));
        assert!(!is_auth_required_body("hello world"));
        assert!(!is_auth_required_body(""));
    }

    #[test]
    fn is_loopback_url_handles_bracket_and_port_forms() {
        // R1 复审回归：localhost:port 与 [::1]:port 曾被误判为非 loopback。
        for url in [
            "http://127.0.0.1:3080/",
            "http://127.0.0.1/",
            "http://localhost:3080/?token=x",
            "http://LOCALHOST:3080/",
            "http://[::1]:3080/",
            "http://[::1]/",
            "http://user:pw@127.0.0.1:3080/",
            "http://127.0.0.2:1/",
        ] {
            assert!(is_loopback_url(url), "{url}");
        }
        for url in [
            "http://192.168.1.10:3080/",
            "http://example.com:3080/",
            "http://[2001:db8::1]:3080/",
            "not a url",
        ] {
            assert!(!is_loopback_url(url), "{url}");
        }
    }
}
