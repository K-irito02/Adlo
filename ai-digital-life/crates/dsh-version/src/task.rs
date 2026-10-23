//! dsh 版本任务进度：实现已收敛至 `adl_hosted::ProgressTask`（与 env 侧共用同一上报器）。
//!
//! 本文件仅做重导出 + 旧名别名，防外部 `use adl_dsh_version::task::...` 路径断裂。
//! `VersionTaskKind` 由枚举泛化为字符串常量（调用方传 `"dsh-install"` 等），
//! 与 env 侧 `"env-*"` 命名空间区分；`VersionTaskPhase` 变体名与语义不变。

pub use adl_hosted::ProgressPhase as VersionTaskPhase;
pub use adl_hosted::ProgressSnapshot as VersionTask;
pub use adl_hosted::ProgressTask;

/// 旧名别名：`TaskReporter = ProgressTask`（调用点签名零改）。
pub type TaskReporter = ProgressTask;

/// dsh 版本任务 kind 字符串（`ProgressTask::begin(kind, version)` 首参）。
///
/// 旧枚举的命名空间保留：调用方仍写 `VersionTaskKind::INSTALL`，值已是字符串。
pub struct VersionTaskKind;

impl VersionTaskKind {
    pub const INSTALL: &str = "dsh-install";
    pub const UNINSTALL: &str = "dsh-uninstall";
    pub const REINSTALL: &str = "dsh-reinstall";
    /// 升级到最新（与“安装指定版本”区分展示/埋点）。
    pub const UPDATE: &str = "dsh-update";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn begin_update_cancel_finish() {
        let reporter = TaskReporter::new();
        assert!(reporter.begin(VersionTaskKind::INSTALL, "1.2.3"));
        assert!(!reporter.begin(VersionTaskKind::UNINSTALL, "9.9.9"));

        let task = reporter.snapshot().expect("task");
        assert_eq!(task.kind, VersionTaskKind::INSTALL);
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
    fn serializes_dsh_kind_and_lowercase_phase() {
        let reporter = TaskReporter::new();
        reporter.begin(VersionTaskKind::REINSTALL, "1.0.0");
        let json = serde_json::to_value(reporter.snapshot().expect("task")).unwrap();
        assert_eq!(json["kind"], "dsh-reinstall");
        assert_eq!(json["phase"], "preparing");
        assert_eq!(json["version"], "1.0.0");
    }
}
