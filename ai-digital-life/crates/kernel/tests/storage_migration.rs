//! 启动期存储迁移的端到端（hermetic）验证。
//!
//! 直接调用**公开** API `adl_kernel::storage::apply_pending` —— 与 Tauri 壳层
//! （`setup::run_startup_migration`）和 adl-server（`engine::run_startup_migration`）
//! 在「进程启动、任何 DB/日志句柄打开之前」所走的路径完全一致。
//!
//! 隔离性说明：`apply_pending` 通过固定的 `storage-locator.json` 路径
//! （`dirs::config_dir()/ai-digital-life`）落盘切换后的指针，而该路径在 Windows 上
//! 由 `SHGetKnownFolderPath` 解析、无法用环境变量重定向。因此本测试在调用前对真实
//! 指针文件做快照、调用后恢复（见 `LocatorGuard`），并用进程级互斥锁串行化本文件中的
//! 用例。迁移的数据根全部位于临时目录，真实用户数据不会被触碰。

use adl_kernel::storage::{
    MigrationProgress, PendingMigration, StorageDefaults, StorageLocator, StorageSelection,
    apply_pending, locator_path,
};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

/// 串行化所有会经过真实 locator 路径的用例（env 无法重定向该路径）。
static LOCATOR_LOCK: Mutex<()> = Mutex::new(());

/// 在测试期间保护真实 `storage-locator.json`：进入时快照，离开（含 panic 展开）时恢复。
struct LocatorGuard {
    _lock: MutexGuard<'static, ()>,
    path: PathBuf,
    original: Option<Vec<u8>>,
}

impl LocatorGuard {
    fn new() -> Self {
        let lock = LOCATOR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let path = locator_path();
        let original = std::fs::read(&path).ok();
        Self { _lock: lock, path, original }
    }
}

impl Drop for LocatorGuard {
    fn drop(&mut self) {
        match &self.original {
            Some(bytes) => {
                if let Some(parent) = self.path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&self.path, bytes);
            },
            None => {
                let _ = std::fs::remove_file(&self.path);
            },
        }
    }
}

fn temp_root(tag: &str) -> PathBuf {
    let base = std::env::temp_dir().join(format!("adl-storage-e2e-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    std::fs::create_dir_all(&base).expect("create temp root");
    base
}

fn write(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("create parent dir");
    }
    std::fs::write(path, bytes).expect("write fixture file");
}

fn defaults(root: &Path) -> StorageDefaults {
    StorageDefaults {
        root: root.to_path_buf(),
        credentials_dir: root.join("..").join("creds"),
        downloads_dir: root.join("..").join("dl"),
    }
}

fn pending_to(to: StorageSelection) -> PendingMigration {
    PendingMigration {
        from: StorageSelection::default(),
        to,
        retain_source: false,
        requested_at: 1,
        failed: false,
        error: None,
    }
}

/// 成功路径：复制 → 校验 → 切换指针 → 清理旧源；外部文件与其目录被保留。
#[test]
fn apply_pending_migrates_end_to_end_and_keeps_foreign_files() {
    let _guard = LocatorGuard::new();

    let base = temp_root("success");
    let old_root = base.join("old");
    let new_root = base.join("new");

    // 源：真实 SQLite 库（零字节文件被 SQLite 视为合法的空数据库）、配置、剪贴板图片，
    // 以及一个不属于本应用的外部文件。
    std::fs::create_dir_all(&old_root).unwrap();
    write(&old_root.join("data.db"), b"");
    write(&old_root.join("config/config.json"), br#"{"theme":"dark"}"#);
    write(&old_root.join("clipboard/images/x.png"), b"PNGDATA");
    write(&old_root.join("clipboard/user-note.txt"), b"do not migrate me");

    let defaults = defaults(&old_root);

    // 当前选择使用默认根（= 旧的临时根），待迁移目标为新的临时根。
    let mut locator = StorageLocator {
        pending_migration: Some(pending_to(StorageSelection {
            root: Some(new_root.clone()),
            ..Default::default()
        })),
        ..Default::default()
    };

    let mut seen: Vec<MigrationProgress> = Vec::new();
    let report = apply_pending(&mut locator, &defaults, |p| seen.push(p))
        .expect("pending migration must be returned");

    assert!(report.ok, "migration must succeed: {:?}", report.error);

    // 新根收到全部自有文件。
    assert!(new_root.join("data.db").is_file(), "data.db must be copied");
    assert!(new_root.join("config/config.json").is_file(), "config must be copied");
    assert!(new_root.join("clipboard/images/x.png").is_file(), "clipboard image must be copied");
    // 外部文件绝不复制。
    assert!(!new_root.join("clipboard/user-note.txt").exists(), "foreign file must not be copied");

    // 外部文件在旧路径存活，其所在目录被记入 kept_dirs。
    let foreign = old_root.join("clipboard/user-note.txt");
    assert!(foreign.is_file(), "foreign file must survive cleanup");
    assert!(
        report.kept_dirs.iter().any(|k| {
            k.path == old_root.join("clipboard")
                && k.foreign_files.iter().any(|f| f.ends_with("user-note.txt"))
        }),
        "kept_dirs must record the foreign file's directory: {:?}",
        report.kept_dirs
    );

    // 旧根的自有文件与自有目录已被清理。
    assert!(!old_root.join("data.db").exists(), "old data.db must be cleaned");
    assert!(!old_root.join("config").exists(), "emptied old config dir must be removed");
    assert!(!old_root.join("clipboard/images").exists(), "emptied images dir must be removed");

    // 指针切换、pending 清除、报告落定。
    assert_eq!(locator.selection.root.as_deref(), Some(new_root.as_path()), "pointer switched");
    assert!(locator.pending_migration.is_none(), "pending cleared on success");
    assert_eq!(locator.last_report.as_ref().map(|r| r.ok), Some(true), "last_report recorded");
    assert!(matches!(seen.last(), Some(MigrationProgress::Done)), "progress ends with Done");

    let _ = std::fs::remove_dir_all(&base);
}

/// 失败路径：目标目录被同名文件占据 → 复制阶段失败 → 不切换指针、不清理源、pending 标记失败。
#[test]
fn apply_pending_failure_keeps_source_and_marks_pending_failed() {
    let _guard = LocatorGuard::new();

    let base = temp_root("failure");
    let old_root = base.join("old");
    let blocked_root = base.join("blocked");

    write(&old_root.join("data.db"), b"");
    write(&old_root.join("clipboard/images/x.png"), b"PNGDATA");
    // 在「新根」位置放一个普通文件：所有 create_dir_all 都会失败。
    write(&blocked_root, b"not a directory");

    let defaults = defaults(&old_root);
    let mut locator = StorageLocator {
        pending_migration: Some(pending_to(StorageSelection {
            root: Some(blocked_root.clone()),
            ..Default::default()
        })),
        ..Default::default()
    };

    let report = apply_pending(&mut locator, &defaults, |_| {}).expect("pending must be returned");

    assert!(!report.ok, "blocked target must fail the run");
    assert!(report.error.is_some(), "failure must carry an error");

    // 源完好（未清理）、指针未切换。
    assert!(old_root.join("data.db").is_file(), "source db must stay intact");
    assert!(old_root.join("clipboard/images/x.png").is_file(), "source image must stay intact");
    assert!(locator.selection.root.is_none(), "pointer must not switch on failure");

    // pending 保留并标记失败，供设置页展示/重试；不自动重试。
    let pending = locator.pending_migration.as_ref().expect("pending retained on failure");
    assert!(pending.failed, "failed flag must be set");
    assert!(pending.error.is_some(), "error must be recorded on pending");
    assert_eq!(locator.last_report.as_ref().map(|r| r.ok), Some(false), "failed last_report");

    let _ = std::fs::remove_dir_all(&base);
}
