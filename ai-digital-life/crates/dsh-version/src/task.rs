use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VersionTaskKind {
    Install,
    Uninstall,
    Reinstall,
    /// 升级到最新（与“安装指定版本”区分展示/埋点）。
    Update,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VersionTaskPhase {
    Preparing,
    Installing,
    Removing,
    Finalizing,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionTask {
    pub kind: VersionTaskKind,
    pub version: String,
    pub phase: VersionTaskPhase,
    pub percent: Option<u8>,
    pub done: u64,
    pub total: u64,
    pub cancellable: bool,
}

#[derive(Clone, Default)]
pub struct TaskReporter {
    state: Arc<Mutex<Option<VersionTask>>>,
    cancelled: Arc<AtomicBool>,
}

/// 任务上报器：调用契约——长操作开始前必须先 `begin` 建任务，否则
/// `update`/`set_version` 静默 no-op。静默是有意设计：`update()` 等非 task
/// 包装器自带一次性 reporter，快照轮询只看 server 侧 `begin` 过的任务；
/// server 未 begin 即长操作属于调用方 bug，由进度 UI 缺失直接暴露，
/// 此处不打 warn（避免包装器路径每次刷屏）。
impl TaskReporter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn begin(&self, kind: VersionTaskKind, version: &str) -> bool {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_some() {
            return false;
        }
        self.cancelled.store(false, Ordering::SeqCst);
        *guard = Some(VersionTask {
            kind,
            version: version.to_string(),
            phase: VersionTaskPhase::Preparing,
            percent: Some(0),
            done: 0,
            total: 0,
            cancellable: true,
        });
        true
    }

    pub fn update(
        &self,
        phase: VersionTaskPhase,
        percent: Option<u8>,
        done: u64,
        total: u64,
        cancellable: bool,
    ) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(task) = guard.as_mut() {
            task.phase = phase;
            task.percent = percent.map(|p| p.min(100));
            task.done = done;
            task.total = total;
            task.cancellable = cancellable;
        }
    }

    pub fn set_version(&self, version: &str) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(task) = guard.as_mut() {
            task.version = version.to_string();
        }
    }

    pub fn snapshot(&self) -> Option<VersionTask> {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn finish(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(task) = guard.as_mut() {
            task.cancellable = false;
            task.phase = VersionTaskPhase::Finalizing;
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn begin_update_cancel_finish() {
        let reporter = TaskReporter::new();
        assert!(reporter.begin(VersionTaskKind::Install, "1.2.3"));
        assert!(!reporter.begin(VersionTaskKind::Uninstall, "9.9.9"));

        let task = reporter.snapshot().expect("task");
        assert_eq!(task.kind, VersionTaskKind::Install);
        assert_eq!(task.version, "1.2.3");
        assert_eq!(task.percent, Some(0));

        reporter.update(VersionTaskPhase::Installing, Some(42), 10, 20, true);
        let task = reporter.snapshot().expect("task");
        assert_eq!(task.phase, VersionTaskPhase::Installing);
        assert_eq!(task.percent, Some(42));
        assert_eq!(task.done, 10);
        assert_eq!(task.total, 20);

        reporter.cancel();
        let task = reporter.snapshot().expect("task");
        assert!(reporter.is_cancelled());
        assert!(!task.cancellable);
        assert_eq!(task.phase, VersionTaskPhase::Finalizing);

        reporter.finish();
        assert!(reporter.snapshot().is_none());
        assert!(!reporter.is_cancelled());
    }

    #[test]
    fn serializes_lowercase_kind_and_phase() {
        let reporter = TaskReporter::new();
        reporter.begin(VersionTaskKind::Reinstall, "1.0.0");
        let json = serde_json::to_value(reporter.snapshot().expect("task")).unwrap();
        assert_eq!(json["kind"], "reinstall");
        assert_eq!(json["phase"], "preparing");
        assert_eq!(json["version"], "1.0.0");
    }
}
