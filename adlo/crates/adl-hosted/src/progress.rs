use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProgressPhase {
    Preparing,
    Installing,
    Removing,
    Finalizing,
}

/// 通用进度快照：字段/形状与 dsh 版本任务的原 DTO 对齐，
/// 仅 `kind` 由枚举泛化为 `String`（调用方传 `"dsh-install"` /
/// `"env-{dep}-install"`），另增 `error` 供失败原因展示。
/// 线装 camelCase 由各调用方 DTO 负责，本结构保持 snake_case。
#[derive(Debug, Clone, Serialize)]
pub struct ProgressSnapshot {
    pub kind: String,
    pub version: String,
    pub phase: ProgressPhase,
    pub percent: Option<u8>,
    pub done: u64,
    pub total: u64,
    pub cancellable: bool,
    pub error: Option<String>,
}

#[derive(Clone, Default)]
pub struct ProgressTask {
    state: Arc<Mutex<Option<ProgressSnapshot>>>,
    cancelled: Arc<AtomicBool>,
}

/// 进度任务上报器：调用契约——长操作开始前必须先 `begin` 建任务，否则
/// `update`/`set_version`/`set_error` 静默 no-op。静默是有意设计：快照轮询
/// 只看 `begin` 过的任务；未 begin 即长操作属于调用方 bug，由进度 UI
/// 缺失直接暴露，此处不打 warn。
impl ProgressTask {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn begin(&self, kind: &str, label: &str) -> bool {
        self.begin_with(kind, label, true)
    }

    /// Begin a task with an explicit cancellability flag. Tasks covered by no
    /// cancel route (`/env/*`) pass `false` so the UI never offers a cancel
    /// affordance that cannot work.
    ///
    /// A snapshot carrying an `error` is a *finished-but-failed* task, not a
    /// running one: it must not block the next `begin` (a panicking/dead task
    /// must never wedge later installs). The errored snapshot is replaced.
    pub fn begin_with(&self, kind: &str, label: &str, cancellable: bool) -> bool {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_ref().is_some_and(|task| task.error.is_none()) {
            return false;
        }
        self.cancelled.store(false, Ordering::SeqCst);
        *guard = Some(ProgressSnapshot {
            kind: kind.to_string(),
            version: label.to_string(),
            phase: ProgressPhase::Preparing,
            percent: Some(0),
            done: 0,
            total: 0,
            cancellable,
            error: None,
        });
        true
    }

    pub fn update(
        &self,
        phase: ProgressPhase,
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

    pub fn set_error(&self, message: &str) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(task) = guard.as_mut() {
            task.error = Some(message.to_string());
        }
    }

    /// Fail the task and release the "running" slot without discarding the
    /// reason: the error snapshot stays pollable, and `begin`/`begin_with`
    /// treats it as finished (see [`ProgressTask::begin_with`]).
    pub fn abort_with(&self, message: &str) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(task) = guard.as_mut() {
            task.error = Some(message.to_string());
            task.cancellable = false;
            task.phase = ProgressPhase::Finalizing;
        }
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn snapshot(&self) -> Option<ProgressSnapshot> {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Drop a finished-but-failed snapshot (e.g. an explicit `/env/recheck`)
    /// without touching a running task. An errored snapshot is terminal, so
    /// clearing it lets the next status request probe again.
    pub fn clear_errored(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_ref().is_some_and(|task| task.error.is_some()) {
            *guard = None;
        }
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
            task.phase = ProgressPhase::Finalizing;
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
    fn second_begin_while_running_returns_false_and_cancel_marks() {
        let t = ProgressTask::new();
        assert!(t.begin("install", "node 22.14.0"));
        assert!(!t.begin("install", "node 22.14.0"));
        t.cancel();
        assert!(t.is_cancelled());
        t.finish();
        assert!(t.snapshot().is_none());
        assert!(t.begin("install", "node 22.14.0"));
    }

    #[test]
    fn begin_update_set_version_set_error_finish() {
        let task = ProgressTask::new();
        // 未 begin 时静默 no-op。
        task.update(ProgressPhase::Installing, Some(10), 1, 2, true);
        task.set_version("x");
        task.set_error("boom");
        assert!(task.snapshot().is_none());

        assert!(task.begin("dsh-install", "1.2.3"));
        let snap = task.snapshot().expect("task");
        assert_eq!(snap.kind, "dsh-install");
        assert_eq!(snap.version, "1.2.3");
        assert_eq!(snap.phase, ProgressPhase::Preparing);
        assert_eq!(snap.percent, Some(0));
        assert!(snap.error.is_none());

        task.update(ProgressPhase::Installing, Some(142), 10, 20, true);
        task.set_version("2.0.0");
        task.set_error("mirror timeout");
        let snap = task.snapshot().expect("task");
        assert_eq!(snap.phase, ProgressPhase::Installing);
        assert_eq!(snap.percent, Some(100));
        assert_eq!(snap.done, 10);
        assert_eq!(snap.total, 20);
        assert_eq!(snap.version, "2.0.0");
        assert_eq!(snap.error.as_deref(), Some("mirror timeout"));

        task.finish();
        assert!(task.snapshot().is_none());
        assert!(!task.is_cancelled());
    }

    #[test]
    fn snapshot_serializes_snake_case_for_caller_dto() {
        let task = ProgressTask::new();
        assert!(task.begin("env-node-install", "node 22.14.0"));
        let json = serde_json::to_value(task.snapshot().expect("task")).expect("json");
        assert_eq!(json["kind"], "env-node-install");
        assert_eq!(json["phase"], "preparing");
        assert_eq!(json["version"], "node 22.14.0");
    }

    #[test]
    fn clear_errored_only_drops_failed_snapshots() {
        let task = ProgressTask::new();
        assert!(task.begin_with("env-node-install", "node 22.14.0", false));
        task.clear_errored();
        assert!(task.snapshot().is_some(), "running task must stay");

        task.set_error("boom");
        task.clear_errored();
        assert!(task.snapshot().is_none(), "errored snapshot must be cleared");

        task.clear_errored();
        assert!(task.snapshot().is_none(), "no-op when empty");
    }

    #[test]
    fn begin_with_sets_cancellable_false_for_env_tasks() {
        let task = ProgressTask::new();
        assert!(task.begin_with("env-node-install", "node 22.14.0", false));
        assert!(!task.snapshot().expect("task").cancellable);
        task.finish();
        assert!(task.begin("dsh-install", "1.2.3"));
        assert!(task.snapshot().expect("task").cancellable);
    }

    /// 失败快照不是运行中任务：`abort_with` 留错因但不阻塞下一次 `begin`
    ///（防 panic/提前返回把后续安装永久卡在 "another task is running"）。
    #[test]
    fn abort_with_keeps_error_and_unblocks_next_begin() {
        let task = ProgressTask::new();
        assert!(task.begin_with("env-node-install", "node 22.14.0", false));
        task.abort_with("task aborted unexpectedly");
        let snap = task.snapshot().expect("error snapshot stays pollable");
        assert_eq!(snap.error.as_deref(), Some("task aborted unexpectedly"));
        assert!(!snap.cancellable);
        assert!(task.begin_with("env-node-install", "node 22.14.0", false));
        assert!(task.snapshot().expect("fresh task").error.is_none());
    }
}
