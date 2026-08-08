// Only the test module references this module today; the SSE endpoint (next
// task) consumes `SseEventBus`. Remove this once wired up.
#![allow(dead_code)]

use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_storage::Database;
use adl_types::SessionPartEvent;
use std::sync::{Arc, Mutex};

const HISTORY_LIMIT: usize = 1000;

/// Bridges the in-process `PartEventBus` to durable `event_log` storage and an
/// in-memory replay cache, feeding the SSE endpoint.
pub struct SseEventBus {
    db: Database,
    history: Arc<Mutex<Vec<(i64, SessionPartEvent)>>>,
}

impl SseEventBus {
    pub fn new(db: Database) -> Self {
        Self { db, history: Arc::new(Mutex::new(Vec::new())) }
    }

    /// Subscribe to `bus` and persist every event to `event_log` + replay cache.
    pub fn spawn(&self, bus: PartEventBus) {
        let db = self.db.clone();
        let history = self.history.clone();
        tokio::spawn(async move {
            let mut rx = bus.subscribe();
            loop {
                match rx.recv().await {
                    Ok(event) => {
                        let event_type = event_type(&event);
                        let payload = serde_json::to_value(&event).unwrap_or_default();
                        let session_id = event_session_id(&event);
                        // The real seq comes from append_event_log's return value.
                        if let Ok(seq) = db.append_event_log(&session_id, &event_type, &payload) {
                            let mut h = history.lock().unwrap_or_else(|e| e.into_inner());
                            h.push((seq, event));
                            if h.len() > HISTORY_LIMIT {
                                let drain = h.len() - HISTORY_LIMIT;
                                h.drain(..drain);
                            }
                        }
                    },
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        });
    }

    pub fn replay_after(&self, after_seq: i64) -> Vec<(i64, SessionPartEvent)> {
        let h = self.history.lock().unwrap_or_else(|e| e.into_inner());
        h.iter().filter(|(seq, _)| *seq > after_seq).cloned().collect()
    }
}

fn event_type(event: &SessionPartEvent) -> String {
    // 从 serde 序列化取 type 字段
    serde_json::to_value(event)
        .ok()
        .and_then(|v| v["type"].as_str().map(String::from))
        .unwrap_or_else(|| "unknown".to_string())
}

fn event_session_id(event: &SessionPartEvent) -> String {
    serde_json::to_value(event)
        .ok()
        .and_then(|v| {
            v["sessionID"].as_str().or_else(|| v["session_id"].as_str()).map(String::from)
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_agent_runtime::part_event_bus::PartEventBus;
    use adl_types::SessionPartEvent;

    fn temp_db() -> (adl_storage::Database, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!("adl-ssebus-{}.db", uuid::Uuid::new_v4()));
        cleanup(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        (db, path)
    }

    fn cleanup(path: &std::path::Path) {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
        }
    }

    #[tokio::test]
    async fn spawn_persists_events_and_replays() {
        let (db, path) = temp_db();
        let bus = PartEventBus::new(16);
        let sse_bus = SseEventBus::new(db.clone());
        sse_bus.spawn(bus.clone());

        // 让后台任务先完成订阅，避免 publish 早于 subscribe 被广播通道丢弃
        tokio::task::yield_now().await;

        bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });

        // 等待后台任务持久化并写入重放缓存
        let replay = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let r = sse_bus.replay_after(0);
                if !r.is_empty() {
                    return r;
                }
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("event should be replayed within timeout");

        assert_eq!(replay.len(), 1);
        assert!(matches!(
            &replay[0].1,
            SessionPartEvent::SessionStatus { status, .. } if status == "busy"
        ));

        // 验证 event_log 表持久化：published 事件已写入
        let persisted = db.list_event_log_after("s1", 0).unwrap();
        assert!(
            persisted.iter().any(|(_, t, _, _)| t == "session.status"),
            "published SessionStatus should be persisted to event_log"
        );

        let seq = db.append_event_log("s1", "test", &serde_json::json!({"x": 1})).unwrap();
        assert!(seq > 0);
        cleanup(&path);
    }
}
