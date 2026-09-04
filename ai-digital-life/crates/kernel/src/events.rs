use std::collections::BTreeMap;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tokio::sync::broadcast;
use tracing::debug;

pub fn run_activity_event(
    run_id: &str,
    seq: i64,
    ts: i64,
    event_type: &str,
    extra: serde_json::Value,
) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    obj.insert("v".into(), serde_json::Value::Number(1.into()));
    obj.insert("runId".into(), serde_json::Value::String(run_id.to_string()));
    obj.insert("seq".into(), serde_json::Value::Number(serde_json::Number::from(seq)));
    obj.insert("ts".into(), serde_json::Value::Number(serde_json::Number::from(ts)));
    obj.insert("type".into(), serde_json::Value::String(event_type.to_string()));
    if let serde_json::Value::Object(extra_map) = extra {
        for (k, v) in extra_map {
            obj.insert(k, v);
        }
    }
    serde_json::Value::Object(obj)
}

#[derive(Debug, Clone)]
pub enum AppEvent {
    WorkspaceOpened(String),
    WorkspaceClosed,
    RetrievalStatusChanged(String),
    TaskCreated(String),
    ApprovalRequested(String),
    ApprovalDecided(String),
    AgentRunChanged(String),
    PatchSetChanged(String),
    TerminalStream(String),
    ModelStream(String),
    ConfigChanged,
    FileChanged { path: String },
    /// 剪贴板历史新增/变更，携带最新条目 id。
    ClipboardChanged(String),
}

#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<AppEvent>,
    emitted: Arc<AtomicUsize>,
    by_type: Arc<std::sync::Mutex<BTreeMap<String, Arc<AtomicUsize>>>>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self {
            tx,
            emitted: Arc::new(AtomicUsize::new(0)),
            by_type: Arc::new(std::sync::Mutex::new(BTreeMap::new())),
        }
    }

    pub fn emit(&self, event: AppEvent) {
        debug!(?event, "event emitted");
        self.emitted.fetch_add(1, Ordering::Relaxed);
        let key = event.kind().to_string();
        let counter = {
            let mut by_type = self.by_type.lock().unwrap_or_else(|e| e.into_inner());
            by_type.entry(key).or_insert_with(|| Arc::new(AtomicUsize::new(0))).clone()
        };
        counter.fetch_add(1, Ordering::Relaxed);
        let _ = self.tx.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
        self.tx.subscribe()
    }

    pub fn diagnostics(&self) -> (usize, BTreeMap<String, usize>) {
        let by_type = self.by_type.lock().unwrap_or_else(|e| e.into_inner());
        let map = by_type.iter().map(|(k, v)| (k.clone(), v.load(Ordering::Relaxed))).collect();
        (self.emitted.load(Ordering::Relaxed), map)
    }
}

impl AppEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::WorkspaceOpened(_) => "workspace.opened",
            Self::WorkspaceClosed => "workspace.closed",
            Self::RetrievalStatusChanged(_) => "retrieval.status-changed",
            Self::TaskCreated(_) => "task.created",
            Self::ApprovalRequested(_) => "approval.requested",
            Self::ApprovalDecided(_) => "approval.decided",
            Self::AgentRunChanged(_) => "agent.run-changed",
            Self::PatchSetChanged(_) => "patch.changed",
            Self::TerminalStream(_) => "terminal.stream",
            Self::ModelStream(_) => "model.stream",
            Self::ConfigChanged => "config.changed",
            Self::FileChanged { .. } => "workspace.file-changed",
            Self::ClipboardChanged(_) => "clipboard.changed",
        }
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(256)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn event_bus_delivers() {
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        bus.emit(AppEvent::ConfigChanged);
        let event = rx.recv().await.unwrap();
        assert!(matches!(event, AppEvent::ConfigChanged));
    }
}
