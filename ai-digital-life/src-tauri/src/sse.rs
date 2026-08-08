use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_storage::Database;
use adl_types::SessionPartEvent;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

const HISTORY_LIMIT: usize = 1000;

/// Capacity of the live SSE broadcast channel. A lagging subscriber misses
/// events and is expected to reconnect with `after`/Last-Event-ID replay.
const LIVE_CAPACITY: usize = 256;

/// Bridges the in-process `PartEventBus` to durable `event_log` storage, an
/// in-memory replay cache, and a live broadcast channel for the SSE endpoint.
#[derive(Clone)]
pub struct SseEventBus {
    db: Database,
    history: Arc<Mutex<Vec<(i64, SessionPartEvent)>>>,
    live: broadcast::Sender<(i64, SessionPartEvent)>,
}

impl SseEventBus {
    pub fn new(db: Database) -> Self {
        let (live, _) = broadcast::channel(LIVE_CAPACITY);
        Self { db, history: Arc::new(Mutex::new(Vec::new())), live }
    }

    /// Subscribe to `bus`, persisting every event to `event_log` + replay cache
    /// and re-broadcasting it to live SSE subscribers.
    pub fn spawn(&self, bus: PartEventBus) {
        let db = self.db.clone();
        let history = self.history.clone();
        let live = self.live.clone();
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
                            h.push((seq, event.clone()));
                            if h.len() > HISTORY_LIMIT {
                                let drain = h.len() - HISTORY_LIMIT;
                                h.drain(..drain);
                            }
                            let _ = live.send((seq, event));
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
        let oldest_cached = h.first().map(|(seq, _)| *seq);
        let cached: Vec<(i64, SessionPartEvent)> =
            h.iter().filter(|(seq, _)| *seq > after_seq).cloned().collect();
        drop(h);

        // The in-memory cache only covers the last HISTORY_LIMIT events. When
        // the requested `after` precedes the oldest cached seq — or the cache
        // is empty, e.g. right after a restart — fall back to the durable
        // event_log (global across sessions) so no events are lost.
        let needs_db = oldest_cached.is_none_or(|oldest| after_seq < oldest);
        if !needs_db {
            return cached;
        }

        let rows = match self.db.list_event_log_after_global(after_seq) {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!(%e, "failed to replay SSE event_log");
                return cached;
            },
        };

        // Merge cache + event_log into ascending order, deduping by seq. The
        // cache only holds events already persisted, but a concurrent append
        // may land in either source after the other is snapshotted — unioning
        // by seq closes both gaps (cache-first keeps the in-memory value).
        let mut by_seq: std::collections::BTreeMap<i64, SessionPartEvent> =
            cached.into_iter().collect();
        for (seq, _event_type, payload, _time_created) in rows {
            if let std::collections::btree_map::Entry::Vacant(entry) = by_seq.entry(seq) {
                if let Ok(event) = serde_json::from_value(payload) {
                    entry.insert(event);
                }
            }
        }
        by_seq.into_iter().collect()
    }

    /// Subscribe to the real-time event stream forwarded by `spawn`. Used by
    /// the SSE endpoint for live events after history replay.
    pub fn subscribe_live(&self) -> broadcast::Receiver<(i64, SessionPartEvent)> {
        self.live.subscribe()
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

    #[tokio::test]
    async fn live_events_carry_seq() {
        let (db, path) = temp_db();
        let bus = PartEventBus::new(16);
        let sse_bus = SseEventBus::new(db.clone());
        sse_bus.spawn(bus.clone());
        let mut live = sse_bus.subscribe_live();

        // 让后台任务先完成订阅，避免 publish 早于 subscribe 被广播通道丢弃
        tokio::task::yield_now().await;

        bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });

        let (seq, event) = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            live.recv(),
        )
        .await
        .expect("live event should arrive within timeout")
        .expect("live channel should not close");

        assert!(seq > 0, "live event must carry a positive seq");
        assert!(matches!(
            event,
            SessionPartEvent::SessionStatus { status, .. } if status == "busy"
        ));

        // 与持久化的 event_log seq 一致
        let persisted = db.list_event_log_after("s1", 0).unwrap();
        assert!(
            persisted.iter().any(|(s, t, _, _)| *s == seq && t == "session.status"),
            "live seq should match the persisted event_log seq"
        );
        cleanup(&path);
    }
}
