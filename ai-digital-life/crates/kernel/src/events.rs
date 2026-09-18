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
    PatchSetChanged(String),
    TerminalStream(String),
    ModelStream(String),
    ConfigChanged,
    FileChanged {
        path: String,
    },
    /// 活动工作区内的文件批量变更（由 `adl-workspace` 的 watcher 产出，经 WS 推送）。
    FilesChanged {
        changed: Vec<String>,
        removed: Vec<String>,
        overflow: bool,
    },
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
            Self::PatchSetChanged(_) => "patch.changed",
            Self::TerminalStream(_) => "terminal.stream",
            Self::ModelStream(_) => "model.stream",
            Self::ConfigChanged => "config.changed",
            // 单文件通道为历史兼容保留（旧 `emit-file-changed` 路径仍 emit）；
            // 新代码一律走批量 `FilesChanged`，两者不得并存触发同一刷新。
            Self::FileChanged { .. } => "workspace.file-changed",
            Self::FilesChanged { .. } => "workspace.files-changed",
            Self::ClipboardChanged(_) => "clipboard.changed",
        }
    }

    /// 诊断用序列化（`type` 契约，供日志/测试断言）。
    /// WS 推送帧另有 `kind` 契约（见 `adl-server::ws_workspace::files_changed_frame`，
    /// 由单测锁定），两者不得混用。
    pub fn to_json(&self) -> serde_json::Value {
        let mut obj = serde_json::Map::new();
        obj.insert("type".into(), serde_json::Value::String(self.kind().to_string()));
        if let Self::FilesChanged { changed, removed, overflow } = self {
            obj.insert("changed".into(), serde_json::json!(changed));
            obj.insert("removed".into(), serde_json::json!(removed));
            obj.insert("overflow".into(), serde_json::json!(overflow));
        }
        serde_json::Value::Object(obj)
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

    #[test]
    fn files_changed_event_kind_and_payload() {
        let event = AppEvent::FilesChanged {
            changed: vec!["a.txt".to_string()],
            removed: vec![],
            overflow: false,
        };
        assert_eq!(event.kind(), "workspace.files-changed");
        let json = event.to_json();
        assert_eq!(json["type"], "workspace.files-changed");
        assert_eq!(json["changed"][0], "a.txt");
        assert_eq!(json["removed"].as_array().unwrap().len(), 0);
        assert_eq!(json["overflow"], false);
    }
}
