//! 回归测试：dsh 来源探测必须在 tokio 异步运行时内全异步完成。
//!
//! 旧实现 `detect_running_dsh` 在端口有监听时调用 `reqwest::blocking`，
//! 其内部会在异步上下文里构建并 drop 一个 shell runtime —— debug 构建下
//! tokio 直接 panic（"Cannot drop a runtime in a context where blocking is not
//! allowed"），导致 `/dsh/open`（以及 `/dsh/source-status`）的 axum handler
//! task 崩溃、连接被重置，前端表现为 `Network error: Failed to fetch`。
//!
//! 复现条件：ad-server 异步上下文调用探测且目标端口确实有进程监听。

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

/// 端口有监听时，异步上下文内调用 `detect_running_dsh` 必须正常返回（不得 panic）。
#[tokio::test]
async fn detect_running_dsh_is_async_safe_inside_runtime() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind dummy server");
    let port = listener.local_addr().expect("addr").port();
    std::thread::spawn(move || {
        for mut s in listener.incoming().flatten() {
            let clone = s.try_clone().expect("clone stream");
            let mut reader = BufReader::new(clone);
            let mut line = String::new();
            // 读取请求头，避免 hyper 解析到未消费请求上的响应（UnexpectedMessage）。
            loop {
                line.clear();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
            }
            let body = b"<title>DeepSeek Harness</title>";
            let _ = write!(
                s,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: text/html\r\n\r\n",
                body.len()
            );
            let _ = s.write_all(body);
            let _ = s.flush();
        }
    });

    let running = adl_dsh_version::detect_running_dsh(port).await;
    let info = running.expect("listening port must be detected");
    assert_eq!(info.port, port);
    assert_eq!(info.url, format!("http://127.0.0.1:{port}/"));
}

/// 普通网页占用同一端口时不得被误判为 dsh。
#[tokio::test]
async fn detect_running_dsh_rejects_unrelated_web_page() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind dummy server");
    let port = listener.local_addr().expect("addr").port();
    std::thread::spawn(move || {
        for mut s in listener.incoming().flatten() {
            let clone = s.try_clone().expect("clone stream");
            let mut reader = BufReader::new(clone);
            let mut line = String::new();
            loop {
                line.clear();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
            }
            let body = b"<title>Some Dev Server</title>";
            let _ = write!(
                s,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: text/html\r\n\r\n",
                body.len()
            );
            let _ = s.write_all(body);
            let _ = s.flush();
        }
    });

    assert!(adl_dsh_version::detect_running_dsh(port).await.is_none());
}

/// 端口空闲时快速返回 `None`（不创建 HTTP 客户端）。
#[tokio::test]
async fn detect_running_dsh_returns_none_when_port_closed() {
    let port = {
        let l = TcpListener::bind("127.0.0.1:0").expect("bind");
        l.local_addr().expect("addr").port()
    };
    assert!(adl_dsh_version::detect_running_dsh(port).await.is_none());
}
