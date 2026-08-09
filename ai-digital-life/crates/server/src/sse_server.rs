use crate::router::app_router;
use crate::sse::SseEventBus;
use crate::state::ServerState;
use adl_agent_runtime::question::QuestionService;
use axum::extract::{Path, Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use std::sync::atomic::{AtomicU16, Ordering};
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

/// Shared router state for the axum layer: the `SseEventBus` plus the
/// `QuestionService` the `/question/{request_id}/reply` endpoint drives.
#[derive(Clone)]
pub struct SseState {
    pub bus: SseEventBus,
    pub questions: QuestionService,
}

#[derive(Deserialize)]
struct AfterParams {
    after: Option<i64>,
}

/// Build the SSE routes (`/event`, `/question/{request_id}/reply`) with the
/// shared [`SseState`]. Used by both the full `app_router` (ad-server) and the
/// desktop shell's transitional `spawn_sse_server`.
pub fn sse_router(state: SseState) -> Router {
    Router::new()
        .route("/event", get(sse_handler))
        .route("/question/{request_id}/reply", post(reply_handler))
        .with_state(state)
}

/// Desktop-shell (Tauri) entry during the transitional phase: spawns a bare
/// [`SseEventBus`] + [`QuestionService`] over the shared `app_router` on an
/// ephemeral port, stores the bound port into `port`, and returns it.
pub async fn spawn_sse_server(
    bus: SseEventBus,
    questions: QuestionService,
    port: Arc<AtomicU16>,
) -> u16 {
    // NOTE: binds with `tokio::net::TcpListener::bind` rather than
    // `std::net::TcpListener::bind` + `from_std` — the latter stalls the tokio
    // runtime's timer/IO driver on Windows with mio 1.2.2, hanging every
    // connected client (verified empirically, see task-2-report).
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind SSE listener on ephemeral port");
    let bound = listener.local_addr().expect("SSE listener address").port();
    let app = app_router(SseState { bus, questions });
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("SSE HTTP server failed: {e}");
        }
    });
    port.store(bound, Ordering::Relaxed);
    bound
}

/// Standalone `ad-server` entry: bind an ephemeral port, build the full
/// `app_router` from the [`ServerState`]'s `sse_bus` + `questions`, spawn the
/// axum server, write the bound port back into `state.server_port`, and return
/// it.
pub async fn spawn_http_server(state: &ServerState) -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind ad-server listener on ephemeral port");
    let bound = listener.local_addr().expect("ad-server listener address").port();
    let app =
        app_router(SseState { bus: state.sse_bus.clone(), questions: state.questions.clone() });
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("ad-server HTTP failed: {e}");
        }
    });
    state.server_port.store(bound, Ordering::Relaxed);
    bound
}

async fn sse_handler(
    State(state): State<SseState>,
    Query(params): Query<AfterParams>,
    headers: axum::http::HeaderMap,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    // 支持 ?after= 查询参数与标准 EventSource 重连头 Last-Event-ID
    // （浏览器自动重连会发送最后收到的 `id:` 作为该头），取两者较大值。
    let query_after = params.after.unwrap_or(0);
    let header_after = headers
        .get("last-event-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    let after = query_after.max(header_after);

    // 先订阅 live，再重放 history，避免 spawn 任务在两次调用之间推进 seq
    // 导致重放与实时流之间丢事件或重复；最后用 last_replayed 去重。
    let live_rx = state.bus.subscribe_live();
    let replay = state.bus.replay_after(after);
    let last_replayed = replay.last().map(|(seq, _)| *seq).unwrap_or(after);

    let replay_stream = tokio_stream::iter(replay.into_iter().map(|(seq, ev)| {
        let json = serde_json::to_string(&ev).unwrap_or_default();
        Ok(Event::default().id(seq.to_string()).data(json))
    }));

    // 实时流只放行 seq > last_replayed 的事件，保证与重放流不重叠。
    let live_stream = BroadcastStream::new(live_rx).filter_map(move |item| {
        item.ok().filter(|(seq, _)| *seq > last_replayed).map(|(seq, ev)| {
            let json = serde_json::to_string(&ev).unwrap_or_default();
            Ok(Event::default().id(seq.to_string()).data(json))
        })
    });

    let combined = replay_stream.chain(live_stream);
    Sse::new(combined).keep_alive(KeepAlive::default())
}

#[derive(Deserialize)]
struct ReplyBody {
    answers: Vec<serde_json::Value>,
}

async fn reply_handler(
    State(state): State<SseState>,
    Path(request_id): Path<String>,
    Json(body): Json<ReplyBody>,
) -> Result<(), (axum::http::StatusCode, String)> {
    state
        .questions
        .reply(&request_id, body.answers)
        .map_err(|e| (axum::http::StatusCode::NOT_FOUND, e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sse::SseEventBus;
    use adl_agent_runtime::part_event_bus::PartEventBus;
    use adl_types::SessionPartEvent;
    use futures::StreamExt;

    fn temp_db() -> adl_storage::Database {
        let path = std::env::temp_dir().join(format!("adl-ssesrv-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn sse_endpoint_streams_event() {
        let db = temp_db();
        let part_bus = PartEventBus::new(16);
        let sse_bus = SseEventBus::new(db.clone());
        sse_bus.spawn(part_bus.clone());
        // 让后台订阅任务先完成 subscribe，避免 publish 早于订阅被广播通道丢弃
        tokio::task::yield_now().await;
        let questions = adl_agent_runtime::question::QuestionService::new(part_bus.clone());

        let port = spawn_sse_server(sse_bus, questions, Arc::new(AtomicU16::new(0))).await;
        let url = format!("http://127.0.0.1:{port}/event");

        // 先发布一个事件，再连接（确保 history 有内容）
        part_bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let resp = reqwest::get(&url).await.unwrap();
        // SSE 响应：content-type text/event-stream，body 含事件
        assert!(resp.status().is_success());
        // SSE 流永不结束，resp.text() 会挂起 —— 只读取首个 chunk 并加超时。
        let first =
            tokio::time::timeout(std::time::Duration::from_secs(3), resp.bytes_stream().next())
                .await
                .expect("SSE stream should emit a chunk within timeout")
                .expect("SSE stream should not end")
                .expect("reqwest read should not error");
        let text = String::from_utf8_lossy(&first);
        assert!(
            text.contains("message.part.updated") || text.contains("session.status"),
            "unexpected SSE payload: {text}"
        );
    }
}
