use crate::state::ServerState;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::mpsc;

/// GET `/ws/workspace` — 把 `AppEvent::FilesChanged` 作为 WS 文本帧推给订阅者。
/// 与 `/pty` 同构：单向推送、断线由客户端重连；`Lagged` 时以 `overflow: true` 通知
/// 前端退化为整轮重搜，而不是静默丢事件。
pub async fn ws_handler(
    State(state): State<ServerState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn handle_socket(state: ServerState, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let mut events = state.event_bus.subscribe();

    let forwarder = tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(adl_kernel::events::AppEvent::FilesChanged { changed, removed, overflow }) => {
                    let frame = serde_json::json!({
                        "kind": "files-changed",
                        "changed": changed,
                        "removed": removed,
                        "overflow": overflow,
                    });
                    if tx.send(Message::Text(frame.to_string())).is_err() {
                        break;
                    }
                },
                Ok(_) => continue,
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "workspace ws: event bus lagged; signaling overflow");
                    let frame = serde_json::json!({
                        "kind": "files-changed",
                        "changed": [],
                        "removed": [],
                        "overflow": true,
                    });
                    if tx.send(Message::Text(frame.to_string())).is_err() {
                        break;
                    }
                },
                Err(RecvError::Closed) => break,
            }
        }
    });

    let sender = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sink.send(message).await.is_err() {
                break;
            }
        }
    });

    // 读取分支：客户端仅可能发送 close/ping；任何读取结束即整体收尾。
    while let Some(Ok(message)) = stream.next().await {
        if matches!(message, Message::Close(_)) {
            break;
        }
    }
    forwarder.abort();
    sender.abort();
}
