use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_agent_runtime::question::QuestionService;
use adl_types::SessionPartEvent;
use futures::StreamExt;
use std::sync::Arc;
use std::sync::atomic::{AtomicU16, Ordering};

fn temp_db_path(prefix: &str) -> (adl_storage::Database, std::path::PathBuf) {
    let path = std::env::temp_dir().join(format!("{}-{}", prefix, uuid::Uuid::new_v4()));
    cleanup(&path);
    let db = adl_storage::Database::open(&path).expect("temp db should open");
    db.init_schema().expect("temp db schema should init");
    (db, path)
}

fn cleanup(path: &std::path::Path) {
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
    }
}

async fn read_first_event_chunk(port: u16) -> Vec<u8> {
    let url = format!("http://127.0.0.1:{port}/event");
    let resp = reqwest::get(&url).await.expect("GET /event should connect");
    assert!(resp.status().is_success(), "GET /event should succeed");
    // SSE 流永不结束，只读取首个 chunk 并加超时。
    tokio::time::timeout(std::time::Duration::from_secs(3), resp.bytes_stream().next())
        .await
        .expect("SSE stream should emit a chunk within timeout")
        .expect("SSE stream should not end")
        .expect("reqwest read should not error")
        .to_vec()
}

/// 全链路：engine 构造 ServerState（内含 sse_bus，已订阅 part_bus）→ 发布事件
/// → spawn_http_server(&state) → GET /event 流式返回该会话事件。
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn sse_streams_session_status_and_replays() {
    let data_dir = std::env::temp_dir().join(format!("adl-sse-{}", uuid::Uuid::new_v4()));
    let state = ad_server::engine::init_server_state(&data_dir)
        .await
        .expect("init_server_state should succeed");

    // 发布真实事件；等待 sse_bus 后台任务持久化到 event_log + 重放缓存
    state.part_bus.publish(SessionPartEvent::SessionStatus {
        session_id: "s1".into(),
        status: "busy".into(),
    });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let port = ad_server::sse_server::spawn_http_server(&state).await;
    assert_eq!(
        port,
        state.server_port.load(Ordering::Relaxed),
        "spawn_http_server must write the bound port back into ServerState"
    );

    let text =
        String::from_utf8(read_first_event_chunk(port).await).expect("SSE payload is UTF-8 JSON");
    assert!(text.contains("session.status"), "payload: {text}");

    let _ = std::fs::remove_dir_all(&data_dir);
}

/// `?after=latest`（live-only 哨兵）必须跳过 durable event_log 重放，只流式
/// 输出连接之后新发布的事件 —— 修复冷启动页面首次订阅把整条历史（至多 1000
/// 条）重放给前端的问题（Task 8 残留）。
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn sse_after_latest_is_live_only_skips_replay() {
    let (db, path) = temp_db_path("adl-sse-latest");
    let part_bus = PartEventBus::new(16);
    let sse_bus = ad_server::sse::SseEventBus::new(db.clone());
    sse_bus.spawn(part_bus.clone());
    tokio::task::yield_now().await;
    let questions = QuestionService::new(part_bus.clone());

    let port_slot = Arc::new(AtomicU16::new(0));
    let port = ad_server::sse_server::spawn_sse_server(sse_bus, questions, port_slot.clone()).await;

    // 先在历史里发布一个事件并等待持久化 —— 普通 `?after=` 连接会把它重放。
    part_bus.publish(SessionPartEvent::SessionStatus {
        session_id: "history-1".into(),
        status: "busy".into(),
    });
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;

    // 用 ?after=latest 连接（live-only）：历史事件绝不能被重放。
    let url = format!("http://127.0.0.1:{port}/event?after=latest");
    let resp = reqwest::get(&url).await.expect("GET /event?after=latest should connect");
    assert!(resp.status().is_success(), "GET /event?after=latest should succeed");
    let mut chunks = resp.bytes_stream();

    // 先给后台一小段时间：若错误重放历史，这里就能在超时前捕获到。
    let first = tokio::time::timeout(std::time::Duration::from_millis(300), chunks.next()).await;
    match first {
        Ok(Some(Ok(bytes))) => {
            let text = String::from_utf8_lossy(&bytes);
            assert!(
                !text.contains("history-1"),
                "?after=latest must not replay history, got: {text}"
            );
        },
        // 没有数据（纯 live-only，尚无新事件）也是正确行为。
        Ok(None) | Err(_) => {},
        Ok(Some(Err(_))) => panic!("SSE read error"),
    }

    // 连接之后发布新事件，必须能实时收到。
    part_bus.publish(SessionPartEvent::SessionStatus {
        session_id: "live-1".into(),
        status: "active".into(),
    });
    let live_arrived = tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            match chunks.next().await {
                Some(Ok(bytes)) => {
                    let text = String::from_utf8_lossy(&bytes);
                    if text.contains("live-1") {
                        return true;
                    }
                },
                _ => return false,
            }
        }
    })
    .await
    .expect("live event should arrive within timeout");

    assert!(live_arrived, "live-1 event should be observed");
    cleanup(&path);
}

/// Tauri 过渡路径：不经过 ServerState，直接 SseEventBus + spawn_sse_server，
/// 端口回写到调用方传入的 Arc<AtomicU16>（AppState.sse_port 的形状）。
#[tokio::test]
async fn bare_sse_bus_serves_events_via_spawn_sse_server() {
    let (db, path) = temp_db_path("adl-sse-bare");
    let part_bus = PartEventBus::new(16);
    let sse_bus = ad_server::sse::SseEventBus::new(db.clone());
    sse_bus.spawn(part_bus.clone());
    // 让后台订阅任务先完成 subscribe，避免 publish 早于订阅被广播通道丢弃
    tokio::task::yield_now().await;
    let questions = QuestionService::new(part_bus.clone());

    let port_slot = Arc::new(AtomicU16::new(0));
    let port = ad_server::sse_server::spawn_sse_server(sse_bus, questions, port_slot.clone()).await;
    assert_eq!(
        port,
        port_slot.load(Ordering::Relaxed),
        "spawn_sse_server must store the bound port into the caller's slot"
    );

    part_bus.publish(SessionPartEvent::SessionStatus {
        session_id: "s1".into(),
        status: "busy".into(),
    });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let first =
        String::from_utf8(read_first_event_chunk(port).await).expect("SSE payload is UTF-8 JSON");
    assert!(first.contains("session.status"), "payload: {first}");

    cleanup(&path);
}
