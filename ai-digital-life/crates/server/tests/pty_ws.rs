//! Integration tests for the `/pty` WebSocket endpoint: a real `ad-server` is
//! spawned on an ephemeral port and the WS protocol (create → created →
//! output/error frames) is exercised with `tokio-tungstenite`.
//!
//! All frame awaits are wrapped in `tokio::time::timeout` so a server hang
//! fails the test instead of blocking the runtime forever.

use ad_server::engine::init_server_state;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use tokio_tungstenite::MaybeTlsStream;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

type Sock = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

/// Spawn the real `ad-server` HTTP surface on an ephemeral port and open a WS
/// connection to its `/pty` endpoint.
async fn connect_pty_socket() -> (Sock, u16) {
    let dir = std::env::temp_dir().join(format!("adl-ptyws-{}", uuid::Uuid::new_v4()));
    let state = init_server_state(&dir).await.expect("init_server_state should succeed");
    let port = ad_server::sse_server::spawn_http_server(&state).await;
    let url = format!("ws://127.0.0.1:{port}/pty");
    let (sock, _) = connect_async(&url).await.expect("ws connect to /pty should succeed");
    let _ = std::fs::remove_dir_all(&dir);
    (sock, port)
}

/// Read frames until one of `kind` arrives (skipping e.g. `output` frames that
/// race the `created` reply), or fail after the timeout.
async fn recv_kind(sock: &mut Sock, kind: &str) -> Value {
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let msg = sock.next().await.expect("ws stream should stay open").expect("frame ok");
            let text = match msg {
                WsMessage::Text(t) => t,
                _ => continue,
            };
            let v: Value = serde_json::from_str(&text).expect("frame should be valid JSON");
            if v.get("kind").and_then(|k| k.as_str()) == Some(kind) {
                return v;
            }
        }
    })
    .await
    .expect("a frame of the requested kind should arrive within the timeout")
}

/// Read output frames until one contains `needle`.
async fn recv_output_containing(sock: &mut Sock, needle: &str) -> Value {
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let msg = sock.next().await.expect("ws stream should stay open").expect("frame ok");
            let text = match msg {
                WsMessage::Text(t) => t,
                _ => continue,
            };
            let v: Value = serde_json::from_str(&text).expect("frame should be valid JSON");
            if v.get("kind").and_then(|k| k.as_str()) == Some("output")
                && v.get("data").and_then(|d| d.as_str()).is_some_and(|d| d.contains(needle))
            {
                return v;
            }
        }
    })
    .await
    .expect("an output frame containing the needle should arrive within the timeout")
}

fn create_frame() -> &'static str {
    r#"{"kind":"create","cols":80,"rows":24}"#
}

#[tokio::test]
async fn pty_ws_create_returns_session_id() {
    let (mut sock, _port) = connect_pty_socket().await;
    sock.send(WsMessage::Text(create_frame().into())).await.expect("send create");
    let created = recv_kind(&mut sock, "created").await;
    let sid = created["sessionId"].as_str().expect("created frame carries a sessionId");
    assert!(!sid.is_empty(), "sessionId should be non-empty: {created}");
}

#[tokio::test]
async fn pty_ws_invalid_json_yields_error_frame() {
    let (mut sock, _port) = connect_pty_socket().await;
    sock.send(WsMessage::Text("not-json".into())).await.expect("send garbage");
    let err = recv_kind(&mut sock, "error").await;
    assert!(err["message"].as_str().is_some(), "error frame carries a message: {err}");
}

#[tokio::test]
async fn pty_ws_unknown_kind_yields_error_frame() {
    let (mut sock, _port) = connect_pty_socket().await;
    sock.send(WsMessage::Text(r#"{"kind":"bogus"}"#.into())).await.expect("send unknown kind");
    let err = recv_kind(&mut sock, "error").await;
    assert!(err["message"].as_str().is_some(), "error frame carries a message: {err}");
}

#[tokio::test]
async fn pty_ws_echo_round_trip() {
    let (mut sock, _port) = connect_pty_socket().await;
    sock.send(WsMessage::Text(create_frame().into())).await.expect("send create");
    let created = recv_kind(&mut sock, "created").await;
    let sid = created["sessionId"].as_str().expect("sessionId").to_string();

    sock.send(WsMessage::Text(format!(
        r#"{{"kind":"input","sessionId":"{sid}","data":"echo PING_MARKER\r"}}"#
    )))
    .await
    .expect("send input");

    // `echo` works across cmd/powershell/bash and the PTY also echoes the typed
    // command, so "PING_MARKER" must show up in the output stream.
    recv_output_containing(&mut sock, "PING_MARKER").await;
}

#[tokio::test]
async fn pty_ws_input_on_unknown_session_yields_error_frame() {
    let (mut sock, _port) = connect_pty_socket().await;
    sock.send(WsMessage::Text(r#"{"kind":"input","sessionId":"nope","data":"ls\r"}"#.into()))
        .await
        .expect("send input for missing session");
    let err = recv_kind(&mut sock, "error").await;
    assert!(err["message"].as_str().is_some(), "error frame carries a message: {err}");
}
