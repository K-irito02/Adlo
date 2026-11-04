use crate::state::ServerState;
use adl_pty::PtyEventEmitter;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::mpsc;

pub async fn ws_handler(
    State(state): State<ServerState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

struct WsEmitter {
    tx: mpsc::UnboundedSender<Message>,
}

#[async_trait::async_trait]
impl PtyEventEmitter for WsEmitter {
    async fn emit_output(&self, session_id: &str, data: &str) {
        let frame = serde_json::json!({
            "kind": "output",
            "sessionId": session_id,
            "data": data
        });
        // UnboundedSender::send is infallible (only fails if receiver is dropped)
        let _ = self.tx.send(Message::Text(frame.to_string()));
    }

    async fn emit_terminated(&self, session_id: &str) {
        let frame = serde_json::json!({
            "kind": "terminated",
            "sessionId": session_id
        });
        let _ = self.tx.send(Message::Text(frame.to_string()));
    }
}

async fn handle_socket(state: ServerState, socket: WebSocket) {
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let emitter: Arc<dyn PtyEventEmitter> = Arc::new(WsEmitter { tx });
    let (mut sink, mut stream) = socket.split();
    let mut created: Vec<String> = Vec::new();

    // Split into two tasks: one for receiving, one for sending
    let (send_tx, mut send_rx) = mpsc::unbounded_channel::<Message>();

    // Spawn a sender task that reads from send_rx and writes to sink
    let sender_task = tokio::spawn(async move {
        tracing::trace!("pty_ws sender: task started");
        // 连续发送超时计数：客户端半死时避免逐消息 5s 死等（排空阶段最多 ~10s）
        let mut consecutive_timeouts = 0u32;
        while let Some(msg) = send_rx.recv().await {
            tracing::trace!("pty_ws sender: sending message");
            // Use timeout to avoid blocking forever on slow clients
            match tokio::time::timeout(std::time::Duration::from_secs(5), sink.send(msg)).await {
                Ok(Ok(())) => {
                    consecutive_timeouts = 0;
                    tracing::trace!("pty_ws sender: message sent");
                },
                Ok(Err(e)) => {
                    tracing::warn!(error = %e, "pty_ws sender: failed to send");
                    break;
                },
                Err(_) => {
                    consecutive_timeouts += 1;
                    tracing::warn!("pty_ws sender: send timed out, dropping message");
                    // 连续超时视为客户端已死，结束排空以尽快进入清理（kill 会话）
                    if consecutive_timeouts >= 2 {
                        break;
                    }
                },
            }
        }
        tracing::trace!("pty_ws sender: task ended");
    });

    loop {
        tokio::select! {
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        tracing::trace!(text = %text, "pty_ws: received text frame");
                        let (reply, new_session) = dispatch_frame(&state, &emitter, &text).await;
                        if let Some(sid) = new_session {
                            created.push(sid);
                        }
                        // Send reply through the channel instead of directly
                        if let Some(reply) = reply {
                            if send_tx.send(reply).is_err() {
                                tracing::warn!("pty_ws: failed to queue reply");
                                break;
                            }
                        }
                    },
                    Some(Ok(Message::Close(_))) => {
                        tracing::debug!("pty_ws: received close frame");
                        break;
                    },
                    Some(Err(e)) => {
                        tracing::error!(error = %e, "pty_ws: received error");
                        break;
                    },
                    None => {
                        tracing::debug!("pty_ws: stream ended");
                        break;
                    },
                    Some(Ok(Message::Binary(_)))
                    | Some(Ok(Message::Ping(_)))
                    | Some(Ok(Message::Pong(_))) => {},
                }
            }
            outgoing = rx.recv() => {
                match outgoing {
                    Some(msg) => {
                        // Forward to sender task
                        if send_tx.send(msg).is_err() {
                            tracing::warn!("pty_ws: failed to forward outgoing message");
                            break;
                        }
                    },
                    None => break,
                }
            }
        }
    }

    // Clean up
    drop(send_tx);
    drop(emitter);
    let _ = sender_task.await;

    // Kill sessions created by this connection
    if !created.is_empty() {
        for sid in &created {
            let _ = state.pty_sessions.kill(sid).await;
        }
    }
}

async fn dispatch_frame(
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

    match kind {
        // ping/pong 由连接层处理：即时回 pong，不进入业务分发
        "ping" => (Some(Message::Text(serde_json::json!({"kind": "pong"}).to_string())), None),
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
                .unwrap_or_else(default_terminal_cwd);
            // 前端可能传入「上次所在目录」（由 shell 通过 OSC 9;9 上报后持久化）。
            // 该目录可能已被删除或改名，直接交给 spawn 会导致会话创建失败，
            // 因此这里校验一次，无效则回退到默认目录，保证终端总能起来。
            let cwd = if std::path::Path::new(&cwd).is_dir() {
                cwd
            } else {
                let fallback = default_terminal_cwd();
                tracing::warn!(
                    requested = %cwd,
                    fallback = %fallback,
                    "pty_ws: requested cwd does not exist, falling back to default"
                );
                fallback
            };
            let cols = value
                .get("cols")
                .and_then(|c| c.as_u64())
                .and_then(|c| u16::try_from(c).ok())
                .unwrap_or(80);
            let rows = value
                .get("rows")
                .and_then(|c| c.as_u64())
                .and_then(|c| u16::try_from(c).ok())
                .unwrap_or(24);

            tracing::info!(
                shell = %shell,
                cwd = %cwd,
                cols = cols,
                rows = rows,
                "pty_ws: received create request"
            );

            match state.pty_sessions.create(emitter.clone(), shell, &cwd, cols, rows).await {
                Ok(sid) => {
                    let reply =
                        serde_json::json!({"kind": "created", "sessionId": sid}).to_string();
                    (Some(Message::Text(reply)), Some(sid))
                },
                Err(e) => {
                    tracing::error!(error = %e, "pty_ws: session creation failed");
                    (Some(error_message(None, &e.to_string())), None)
                },
            }
        },
        "input" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "input frame missing sessionId")), None);
            };
            let data = value.get("data").and_then(|d| d.as_str()).unwrap_or("");
            match state.pty_sessions.write(sid, data).await {
                Ok(()) => (None, None),
                Err(e) => {
                    // 会话不存在通常意味着前端持有了失效的 sessionId（如应用重启后点击恢复的旧标签）。
                    // 记录 WARN，便于定位"终端输入无反应"类问题。
                    tracing::warn!(session_id = %sid, error = %e, "pty_ws: input write failed");
                    (Some(error_message(Some(sid), &e.to_string())), None)
                },
            }
        },
        "resize" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "resize frame missing sessionId")), None);
            };
            let cols = value
                .get("cols")
                .and_then(|c| c.as_u64())
                .and_then(|c| u16::try_from(c).ok())
                .unwrap_or(80);
            let rows = value
                .get("rows")
                .and_then(|c| c.as_u64())
                .and_then(|c| u16::try_from(c).ok())
                .unwrap_or(24);
            match state.pty_sessions.resize(sid, cols, rows).await {
                Ok(()) => (None, None),
                Err(e) => {
                    tracing::warn!(session_id = %sid, error = %e, "pty_ws: resize failed");
                    (Some(error_message(Some(sid), &e.to_string())), None)
                },
            }
        },
        "kill" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "kill frame missing sessionId")), None);
            };
            match state.pty_sessions.kill(sid).await {
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

/// 未指定 cwd 时解析用户主目录（Windows `USERPROFILE` / Unix `HOME`），
/// 供"默认终端目录"等独立终端使用，避免跟随服务进程的当前目录。
fn default_terminal_cwd() -> String {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .or_else(|| std::env::current_dir().ok().map(|p| p.into_os_string()))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string())
}
