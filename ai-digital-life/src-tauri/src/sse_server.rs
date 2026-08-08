use crate::sse::SseEventBus;
use adl_agent_runtime::question::QuestionService;
use axum::extract::{Path, Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

#[derive(Clone)]
struct SseState {
    bus: SseEventBus,
    questions: QuestionService,
}

#[derive(Deserialize)]
struct AfterParams {
    after: Option<i64>,
}

/// Spawn the axum SSE server on 127.0.0.1 with a random port. Returns the port.
pub async fn spawn_sse_server(bus: SseEventBus, questions: QuestionService) -> u16 {
    let state = SseState { bus, questions };
    let app = Router::new()
        .route("/event", get(sse_handler))
        .route("/question/{request_id}/reply", post(reply_handler))
        .with_state(state);

    // NOTE: binds with `tokio::net::TcpListener::bind` rather than
    // `std::net::TcpListener::bind` + `from_std` — the latter stalls the tokio
    // runtime's timer/IO driver on Windows with mio 1.2.2, hanging every
    // connected client (verified empirically, see task-2-report).
    let listener =
        tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind SSE listener on ephemeral port");
    let port = listener.local_addr().expect("SSE listener address").port();
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("SSE HTTP server failed: {e}");
        }
    });
    port
}

async fn sse_handler(
    State(state): State<SseState>,
    Query(params): Query<AfterParams>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    // 先重放 history（?after= 或 Last-Event-ID 支持断连重连）
    let after = params.after.unwrap_or(0);
    let history = state.bus.replay_after(after);
    let replay_stream = tokio_stream::iter(history.into_iter().map(|(seq, ev)| {
        let json = serde_json::to_string(&ev).unwrap_or_default();
        Ok(Event::default().id(seq.to_string()).data(json))
    }));

    // 再实时订阅
    let live_stream = BroadcastStream::new(state.bus.subscribe_live()).filter_map(|item| {
        item.ok().map(|(seq, ev)| {
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
    state.questions.reply(&request_id, body.answers).map_err(|e| {
        (axum::http::StatusCode::NOT_FOUND, e.to_string())
    })
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

        let port = spawn_sse_server(sse_bus, questions).await;
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
        let first = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            resp.bytes_stream().next(),
        )
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
