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

/// Shared router state for the desktop-shell transitional SSE layer: the
/// `SseEventBus` plus the `QuestionService` the `/question/{request_id}/reply`
/// endpoint drives.
#[derive(Clone)]
pub struct SseState {
    pub bus: SseEventBus,
    pub questions: QuestionService,
}

#[derive(Deserialize)]
pub(crate) struct AfterParams {
    after: Option<String>,
}

/// `?after=latest` sentinel: a cold subscribe that must skip the durable
/// history replay and stream live events only (the Task 8 flood — a fresh page
/// load has no last-seen seq, so a plain `/event` would replay the whole
/// event_log). seqs are positive rowids, so `-1` can never be a real resume
/// point.
const LIVE_ONLY_SENTINEL: i64 = -1;

/// Parse the `?after=` query value into a resume seq. `"latest"` maps to the
/// live-only sentinel; anything else parses as i64 (defaults to 0 when absent
/// or unparseable, preserving the legacy `/event` replay-everything behavior).
fn resolve_after(raw: Option<String>) -> Option<i64> {
    raw.as_deref()
        .map(|s| if s == "latest" { LIVE_ONLY_SENTINEL } else { s.parse::<i64>().unwrap_or(0) })
}

/// Build the SSE routes (`/event`, `/question/:request_id/reply`) over the
/// `SseState`-based handlers. Used exclusively by the desktop shell's
/// transitional `spawn_sse_server` (the standalone ad-server mounts the
/// `ServerState`-based variants via `app_router` instead).
pub fn sse_router(state: SseState) -> Router {
    Router::new()
        .route("/event", get(sse_handler))
        .route("/question/:request_id/reply", post(reply_handler))
        .with_state(state)
}

/// Desktop-shell (Tauri) entry during the transitional phase: spawns a bare
/// [`SseEventBus`] + [`QuestionService`] over `sse_router` on an ephemeral
/// port, stores the bound port into `port`, and returns it. Keeps serving
/// `Router<SseState>` — independent of the `ServerState`-typed `app_router`.
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
    let app = sse_router(SseState { bus, questions });
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
    serve_on(listener, state).await
}

/// Bind `127.0.0.1:<port>` exactly and serve the full `app_router` on it,
/// writing the bound port into `state.server_port`. Returns an error (without
/// starting the server) when the port is already in use.
pub(crate) async fn spawn_http_server_on_port(
    state: &ServerState,
    port: u16,
) -> Result<u16, std::io::Error> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    Ok(serve_on(listener, state).await)
}

/// Bind a fresh [`ServerState`]-backed router to an already-bound listener,
/// spawn the axum server, and record the bound port in `state.server_port`.
async fn serve_on(listener: tokio::net::TcpListener, state: &ServerState) -> u16 {
    let bound = listener.local_addr().expect("ad-server listener address").port();
    state.server_port.store(bound, Ordering::Relaxed);
    let app = app_router(state.clone()).with_state(state.clone());
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("ad-server HTTP failed: {e}");
        }
    });
    bound
}

/// SSE stream core shared by the `SseState`-based (desktop transitional) and
/// `ServerState`-based (standalone ad-server) `/event` handlers: replay history
/// after `after`, then chain the live events that follow it, deduped by seq.
fn stream_events(
    bus: SseEventBus,
    after: i64,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    // 先订阅 live，再重放 history，避免 spawn 任务在两次调用之间推进 seq
    // 导致重放与实时流之间丢事件或重复；最后用 last_replayed 去重。
    let live_rx = bus.subscribe_live();
    let replay = bus.replay_after(after);
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

/// Resolve the effective replay resume point for a `/event` request.
///
/// Supports `?after=<seq>` (replay from that seq) and the `?after=latest`
/// live-only sentinel (skip the whole history, stream only events published
/// after this connection). A `Last-Event-ID` header — sent by the browser's
/// native EventSource auto-reconnect — always wins over the sentinel: it is the
/// last record the client actually delivered, so resuming from it replays only
/// the gap instead of skipping ahead.
fn effective_after(after_query: Option<i64>, last_event_id: Option<i64>, bus: &SseEventBus) -> i64 {
    match (after_query, last_event_id) {
        (Some(LIVE_ONLY_SENTINEL), Some(reconnect)) => reconnect,
        (Some(LIVE_ONLY_SENTINEL), None) => bus.latest_seq(),
        (a, l) => a.unwrap_or(0).max(l.unwrap_or(0)),
    }
}

fn last_event_id_header(headers: &axum::http::HeaderMap) -> Option<i64> {
    headers.get("last-event-id").and_then(|v| v.to_str().ok()).and_then(|s| s.parse::<i64>().ok())
}

async fn sse_handler(
    State(state): State<SseState>,
    Query(params): Query<AfterParams>,
    headers: axum::http::HeaderMap,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let after =
        effective_after(resolve_after(params.after), last_event_id_header(&headers), &state.bus);
    stream_events(state.bus, after)
}

pub(crate) async fn sse_handler_state(
    State(state): State<ServerState>,
    Query(params): Query<AfterParams>,
    headers: axum::http::HeaderMap,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let after = effective_after(
        resolve_after(params.after),
        last_event_id_header(&headers),
        &state.sse_bus,
    );
    stream_events(state.sse_bus, after)
}

#[derive(Deserialize)]
pub(crate) struct ReplyBody {
    answers: Vec<serde_json::Value>,
}

fn handle_reply(
    questions: &QuestionService,
    request_id: &str,
    answers: Vec<serde_json::Value>,
) -> Result<(), (axum::http::StatusCode, String)> {
    questions
        .reply(request_id, answers)
        .map_err(|e| (axum::http::StatusCode::NOT_FOUND, e.to_string()))
}

async fn reply_handler(
    State(state): State<SseState>,
    Path(request_id): Path<String>,
    Json(body): Json<ReplyBody>,
) -> Result<(), (axum::http::StatusCode, String)> {
    handle_reply(&state.questions, &request_id, body.answers)
}

pub(crate) async fn reply_handler_state(
    State(state): State<ServerState>,
    Path(request_id): Path<String>,
    Json(body): Json<ReplyBody>,
) -> Result<(), (axum::http::StatusCode, String)> {
    handle_reply(&state.questions, &request_id, body.answers)
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

    #[test]
    fn resolve_after_parses_seq_and_latest() {
        assert_eq!(resolve_after(None), None);
        assert_eq!(resolve_after(Some("latest".into())), Some(LIVE_ONLY_SENTINEL));
        assert_eq!(resolve_after(Some("42".into())), Some(42));
        // 非数字回退为 0（保留旧行为：无 after = 全量重放）
        assert_eq!(resolve_after(Some("abc".into())), Some(0));
    }

    #[test]
    fn effective_after_honors_sentinel_and_reconnect() {
        let db = temp_db();
        let bus = SseEventBus::new(db);

        // 普通 ?after=<seq>：取 query 与 Last-Event-ID 的较大值。
        assert_eq!(effective_after(Some(10), None, &bus), 10);
        assert_eq!(effective_after(Some(10), Some(20), &bus), 20);
        // 无 query 时 0，Last-Event-ID 生效。
        assert_eq!(effective_after(None, Some(7), &bus), 7);
        // 纯 live-only：latest 哨兵且无重连头 → 当前最新 seq（空库 = 0）。
        assert_eq!(effective_after(Some(LIVE_ONLY_SENTINEL), None, &bus), 0);
        // EventSource 自动重连：latest 哨兵 + Last-Event-ID → 以重连头为准，
        // 绝不因 live-only 而丢掉断线期间的事件。
        assert_eq!(effective_after(Some(LIVE_ONLY_SENTINEL), Some(33), &bus), 33);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn effective_after_latest_reflects_live_bus_max() {
        let db = temp_db();
        let part_bus = PartEventBus::new(16);
        let sse_bus = SseEventBus::new(db.clone());
        sse_bus.spawn(part_bus.clone());
        tokio::task::yield_now().await;

        part_bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });
        // 等后台任务持久化并写入重放缓存，再确认 latest 哨兵解析到真实 max。
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let latest = effective_after(Some(LIVE_ONLY_SENTINEL), None, &sse_bus);
                if latest > 0 {
                    return latest;
                }
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("latest should advance once an event is persisted");
    }
}
