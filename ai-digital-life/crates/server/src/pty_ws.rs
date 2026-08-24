//! PTY over WebSocket: `GET /pty` upgrades to a WS connection driving the
//! shared [`SessionManager`](adl_pty::SessionManager) from `ServerState`.
//!
//! Text-frame protocol (JSON):
//!
//! * Client → server:
//!   `{"kind":"create","shell":?,"cwd":?,"cols":80,"rows":24}`,
//!   `{"kind":"input","sessionId":s,"data":…}`,
//!   `{"kind":"resize","sessionId":s,"cols":…,"rows":…}`,
//!   `{"kind":"kill","sessionId":s}`
//! * Server → client:
//!   `{"kind":"created","sessionId":s}`,
//!   `{"kind":"output","sessionId":s,"data":…}`,
//!   `{"kind":"error","sessionId":s?,"message":…}`
//!
//! Each connection builds its own [`Arc<dyn PtyEventEmitter>`] whose
//! `emit_output` forwards an `output` frame onto that connection's socket
//! (via an mpsc channel), then hands it to [`SessionManager::create`] so every
//! PTY stdout line reaches exactly the connection that created the session.
//! When the connection closes, the sessions it created are killed so no
//! orphaned shell processes leak.

use crate::state::ServerState;
use adl_pty::PtyEventEmitter;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::mpsc;

/// `GET /pty` → upgrade to a WebSocket.
pub async fn ws_handler(
    State(state): State<ServerState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

/// Per-connection emitter: forwards `output` frames from the PTY stdout reader
/// thread onto this connection's socket via an unbounded mpsc channel.
struct WsEmitter {
    tx: mpsc::UnboundedSender<Message>,
}

impl PtyEventEmitter for WsEmitter {
    fn emit_output(&self, session_id: &str, data: &str) {
        let frame = serde_json::json!({ "kind": "output", "sessionId": session_id, "data": data });
        let _ = self.tx.send(Message::Text(frame.to_string()));
    }
}

async fn handle_socket(state: ServerState, socket: WebSocket) {
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let emitter: Arc<dyn PtyEventEmitter> = Arc::new(WsEmitter { tx });
    let (mut sink, mut stream) = socket.split();
    let mut created: Vec<String> = Vec::new();

    loop {
        tokio::select! {
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let (reply, new_session) = dispatch_frame(&state, &emitter, &text);
                        if let Some(sid) = new_session {
                            created.push(sid);
                        }
                        if let Some(reply) = reply {
                            if sink.send(reply).await.is_err() {
                                break;
                            }
                        }
                    },
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    // Binary frames are not part of the protocol; ping/pong are
                    // answered by tokio-tungstenite internally.
                    Some(Ok(Message::Binary(_)))
                    | Some(Ok(Message::Ping(_)))
                    | Some(Ok(Message::Pong(_))) => {},
                }
            }
            outgoing = rx.recv() => {
                match outgoing {
                    Some(msg) => {
                        if sink.send(msg).await.is_err() {
                            break;
                        }
                    },
                    None => break,
                }
            }
        }
    }

    // Kill the sessions this connection created so no PTY survives the
    // browser/tab going away.
    if !created.is_empty() {
        let sessions = match state.pty_sessions.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        for sid in &created {
            let _ = sessions.kill(sid);
        }
    }
}

/// Dispatch one client frame against the shared [`SessionManager`]. Returns
/// `(reply_to_send, newly_created_session_id)`.
fn dispatch_frame(
    state: &ServerState,
    emitter: &Arc<dyn PtyEventEmitter>,
    text: &str,
) -> (Option<Message>, Option<String>) {
    let value: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return (Some(error_message(None, "invalid JSON frame")), None),
    };
    let Some(kind) = value.get("kind").and_then(|k| k.as_str()) else {
        return (Some(error_message(None, "frame missing 'kind'")), None);
    };

    let sessions = match state.pty_sessions.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    match kind {
        "create" => {
            let shell = value
                .get("shell")
                .and_then(|s| s.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("powershell");
            let cwd = value
                .get("cwd")
                .and_then(|s| s.as_str())
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| {
                    std::env::current_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."))
                        .to_string_lossy()
                        .to_string()
                });
            let cols = value.get("cols").and_then(|c| c.as_u64()).unwrap_or(80) as u16;
            let rows = value.get("rows").and_then(|c| c.as_u64()).unwrap_or(24) as u16;
            match sessions.create(emitter.clone(), shell, &cwd, cols, rows) {
                Ok(sid) => {
                    let reply =
                        serde_json::json!({ "kind": "created", "sessionId": sid }).to_string();
                    (Some(Message::Text(reply)), Some(sid))
                },
                Err(e) => {
                    tracing::error!(error = %e, "pty_ws: PTY session create failed");
                    (Some(error_message(None, &e.to_string())), None)
                },
            }
        },
        "input" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "input frame missing sessionId")), None);
            };
            let data = value.get("data").and_then(|d| d.as_str()).unwrap_or("");
            match sessions.write(sid, data) {
                Ok(()) => (None, None),
                Err(e) => (Some(error_message(Some(sid), &e.to_string())), None),
            }
        },
        "resize" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "resize frame missing sessionId")), None);
            };
            let cols = value.get("cols").and_then(|c| c.as_u64()).unwrap_or(80) as u16;
            let rows = value.get("rows").and_then(|c| c.as_u64()).unwrap_or(24) as u16;
            match sessions.resize(sid, cols, rows) {
                Ok(()) => (None, None),
                Err(e) => (Some(error_message(Some(sid), &e.to_string())), None),
            }
        },
        "kill" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "kill frame missing sessionId")), None);
            };
            match sessions.kill(sid) {
                Ok(()) => (None, None),
                Err(e) => (Some(error_message(Some(sid), &e.to_string())), None),
            }
        },
        _ => (Some(error_message(None, &format!("unknown frame kind: {kind}"))), None),
    }
}

fn error_message(sid: Option<&str>, message: &str) -> Message {
    let mut frame = serde_json::json!({ "kind": "error", "message": message });
    if let Some(sid) = sid {
        frame["sessionId"] = Value::String(sid.to_string());
    }
    Message::Text(frame.to_string())
}
