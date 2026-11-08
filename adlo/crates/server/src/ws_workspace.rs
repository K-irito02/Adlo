use crate::state::ServerState;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::mpsc;

/// 慢订阅者队列上限：满则丢弃当前帧并 coalesce 为 overflow 信号，
/// 由前端退化为整轮重搜（内存有界，事项 45 Phase 4 S1）。
const SLOW_CONSUMER_QUEUE_CAP: usize = 64;

/// 构造 `files-changed` WS 帧：全分支唯一出口，形状由单测锁定
/// （`kind` 契约，前端 `workspace-events-ws.ts:handleFrame` 对接）。
/// `root_path` 空串表示批次归属未知（重连/慢订阅者 overflow），前端按全部工作区处理。
pub(crate) fn files_changed_frame(
    root_path: &str,
    changed: &[String],
    removed: &[String],
    overflow: bool,
) -> serde_json::Value {
    serde_json::json!({
        "kind": "files-changed",
        "rootPath": root_path,
        "changed": changed,
        "removed": removed,
        "overflow": overflow,
    })
}

fn overflow_frame() -> Message {
    Message::Text(files_changed_frame("", &[], &[], true).to_string())
}

/// overflow 帧的归属根：
/// - `coalesced=true`（队列满丢过帧，被丢批次可能来自任意根）→ 空串（前端按全部工作区补刷）；
/// - 否则（watcher 自身单批超限）→ 保留该批次的根，前端只补刷该工作区。
///
/// 返回 `(是否需要发 overflow 帧, 帧携带的根)`。
fn overflow_plan(root_path: &str, batch_overflow: bool, coalesced: bool) -> (bool, &str) {
    if !batch_overflow && !coalesced {
        return (false, root_path);
    }
    let frame_root = if coalesced { "" } else { root_path };
    (true, frame_root)
}

/// 构造 `clipboard-changed` WS 帧：与 `files_changed_frame` 同构，形状由单测锁定。
/// 无载荷 —— 消费端只需"剪贴板有变化"信号即可立即重取历史。
pub(crate) fn clipboard_changed_frame() -> serde_json::Value {
    serde_json::json!({ "kind": "clipboard-changed" })
}

/// 非阻塞发送一帧：成功 true；接收端已死 false（调用方 break）；
/// 队列满则置 coalesce 标志并返回 true（丢帧不断连，由 overflow 帧兜底）。
fn try_send_frame(tx: &mpsc::Sender<Message>, frame: Message, pending_overflow: &mut bool) -> bool {
    match tx.try_send(frame) {
        Ok(()) => true,
        Err(mpsc::error::TrySendError::Closed(_)) => false,
        Err(mpsc::error::TrySendError::Full(_)) => {
            *pending_overflow = true;
            true
        },
    }
}

/// GET `/ws/workspace` — 把 `AppEvent::FilesChanged` 作为 WS 文本帧推给订阅者。
/// 与 `/pty` 同构：单向推送、断线由客户端重连；`Lagged` 时以 `overflow: true` 通知
/// 前端退化为整轮重搜，而不是静默丢事件。
/// 信任边界：与 `/pty` 一致的本地回环（127.0.0.1）模型，无额外鉴权。
pub async fn ws_handler(
    State(state): State<ServerState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn handle_socket(state: ServerState, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Message>(SLOW_CONSUMER_QUEUE_CAP);
    let mut events = state.event_bus.subscribe();
    // coalesce 标志：队列满时丢帧但记住"有丢失"，下一次成功发送 overflow 帧。
    let mut pending_overflow = false;
    // Ping 回复走同一有界队列（满则丢弃该 Pong，客户端会重发 Ping）。
    let pong_tx = tx.clone();

    let forwarder = tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(adl_kernel::events::AppEvent::FilesChanged {
                    root_path,
                    changed,
                    removed,
                    overflow,
                }) => {
                    // coalesce 表示"历史上有帧被丢"（可能属于其它根，也可能是 clipboard
                    // 帧）：根不可知时必须发空根，让前端退化为全部工作区补刷。
                    let coalesced = pending_overflow;
                    let (effective_overflow, frame_root) =
                        overflow_plan(&root_path, overflow, coalesced);
                    if effective_overflow {
                        // overflow 覆盖本批载荷（前端收到 overflow 即整轮重搜，
                        // 残缺增量只会造成双算与 IPC 浪费）。
                        pending_overflow = false;
                        let frame = files_changed_frame(frame_root, &[], &[], true);
                        if !try_send_frame(
                            &tx,
                            Message::Text(frame.to_string()),
                            &mut pending_overflow,
                        ) {
                            break;
                        }
                        continue;
                    }
                    let frame = files_changed_frame(&root_path, &changed, &removed, false);
                    if !try_send_frame(&tx, Message::Text(frame.to_string()), &mut pending_overflow)
                    {
                        break;
                    }
                },
                Ok(adl_kernel::events::AppEvent::ClipboardChanged) => {
                    let frame = clipboard_changed_frame();
                    if !try_send_frame(&tx, Message::Text(frame.to_string()), &mut pending_overflow)
                    {
                        break;
                    }
                },
                Ok(_) => continue,
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "workspace ws: event bus lagged; signaling overflow");
                    if !try_send_frame(&tx, overflow_frame(), &mut pending_overflow) {
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

    // 读取分支：Ping 即回 Pong（axum 不自动回）；其余数据帧忽略；
    // 任何读取结束即整体收尾。
    while let Some(Ok(message)) = stream.next().await {
        match message {
            Message::Close(_) => break,
            Message::Ping(payload) => {
                let _ = pong_tx.try_send(Message::Pong(payload));
            },
            _ => {},
        }
    }
    forwarder.abort();
    sender.abort();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_changed_frame_shape_is_locked() {
        let frame =
            files_changed_frame("E:/repo", &["a.txt".to_string()], &["b.txt".to_string()], false);
        assert_eq!(frame["kind"], "files-changed");
        assert_eq!(frame["rootPath"], "E:/repo");
        assert_eq!(frame["changed"][0], "a.txt");
        assert_eq!(frame["removed"][0], "b.txt");
        assert_eq!(frame["overflow"], false);
    }

    #[test]
    fn overflow_frame_carries_no_payload() {
        let frame = files_changed_frame("", &[], &[], true);
        assert_eq!(frame["kind"], "files-changed");
        assert_eq!(frame["overflow"], true);
        assert_eq!(frame["changed"].as_array().unwrap().len(), 0);
        assert_eq!(frame["removed"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn overflow_plan_drops_the_root_only_when_coalesced() {
        assert_eq!(overflow_plan("E:/repo", false, true), (true, ""));
        assert_eq!(overflow_plan("E:/repo", true, false), (true, "E:/repo"));
        assert_eq!(overflow_plan("E:/repo", false, false), (false, "E:/repo"));
    }

    #[test]
    fn clipboard_changed_frame_shape_is_locked() {
        let frame = clipboard_changed_frame();
        assert_eq!(frame["kind"], "clipboard-changed");
    }
}
