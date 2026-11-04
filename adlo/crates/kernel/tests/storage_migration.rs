//! 启动期存储迁移的端到端（hermetic）验证。
//!
//! 直接调用**公开** API `adl_kernel::storage::apply_pending` —— 与 Tauri 壳层
//! （`setup::run_startup_migration`）和 adl-server（`engine::run_startup_migration`）
//! 在「进程启动、任何 DB/日志句柄打开之前」所走的路径完全一致。
//!
//! 隔离性：`apply_pending` 经由 `save_locator` 落盘切换后的指针，落点由
//! `locator_path()` 决定。本测试通过环境变量 `ADL_STORAGE_LOCATOR_PATH` 把它重定向到
//! 临时文件，因此**从不读写真实 `%APPDATA%/adlo/storage-locator.json`**；
//! 迁移的数据根也全部位于临时目录。
//!
//! `ADL_STORAGE_LOCATOR_PATH` 是进程级变量，故本文件用例用互斥锁串行化。

use adl_kernel::storage::{
    LOCATOR_FILE, MigrationProgress, PendingMigration, StorageDefaults, StorageLocator,
    StorageSelection, apply_pending, load_locator_from, locator_dir, locator_path, save_locator,
};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

/// 串行化本文件用例：`ADL_STORAGE_LOCATOR_PATH` 为进程级变量。
static ENV_LOCK: Mutex<()> = Mutex::new(());

/// 把 locator 落点重定向到临时文件；Drop 时移除该环境变量（含 panic 展开路径）。
struct LocatorEnv {
    _lock: MutexGuard<'static, ()>,
    path: PathBuf,
}

impl LocatorEnv {
    fn new(temp_locator: &Path) -> Self {
        let lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: 持锁期间设置；本测试二进制内无其它线程读取该变量。
        unsafe { std::env::set_var("ADL_STORAGE_LOCATOR_PATH", temp_locator) };
        Self { _lock: lock, path: temp_locator.to_path_buf() }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for LocatorEnv {
    fn drop(&mut self) {
        // SAFETY: 同 `new`。
        unsafe { std::env::remove_var("ADL_STORAGE_LOCATOR_PATH") };
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
    let base = temp_root("success");
    let temp_locator = base.join(LOCATOR_FILE);
    let env = LocatorEnv::new(&temp_locator);

    // 覆盖生效后 `locator_dir()` 也跟随覆盖文件所在目录（实例隔离语义），
    // 但仍必须落在临时根、绝不触碰真实 `%APPDATA%` locator。
    assert_eq!(locator_dir(), base, "locator_dir must follow the override");
    assert!(locator_dir().starts_with(std::env::temp_dir()), "must stay inside the temp root");
    assert_eq!(locator_path(), temp_locator, "override must be active");

    let old_root = base.join("old");
    let new_root = base.join("new");

    // 源：合法 SQLite 空库（SQLite 视零长度文件为空数据库）、配置、剪贴板图片，
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

    // 指针确实落盘到了**临时** locator 文件（真实 %APPDATA% locator 从未被读写）。
    // `apply_pending` 内部只落盘"指针切换"这一步（保留旧的 pending/lastReport），
    // 因此壳层/adl-server 会在其后补一次 `save_locator` 落盘最终状态 —— 此处照做。
    save_locator(&locator).expect("persist final locator");
    assert!(env.path().is_file(), "switched locator must be persisted to the temp path");
    let persisted = load_locator_from(env.path());
    assert_eq!(persisted.selection.root.as_deref(), Some(new_root.as_path()));
    assert!(persisted.pending_migration.is_none(), "persisted pending must be cleared");
    assert_eq!(persisted.last_report.as_ref().map(|r| r.ok), Some(true));

    let _ = std::fs::remove_dir_all(&base);
}

/// 失败路径：目标目录被同名文件占据 → 复制阶段失败 → 不切换指针、不清理源、pending 标记失败。
#[test]
fn apply_pending_failure_keeps_source_and_marks_pending_failed() {
    let base = temp_root("failure");
    let temp_locator = base.join(LOCATOR_FILE);
    let env = LocatorEnv::new(&temp_locator);

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

    // 与壳层/adl-server 一致：随后补一次落盘（失败状态 + 保留的 pending）。
    save_locator(&locator).expect("persist final locator");
    let persisted = load_locator_from(env.path());
    assert!(persisted.selection.root.is_none(), "persisted pointer must stay on the old root");
    let persisted_pending =
        persisted.pending_migration.as_ref().expect("persisted pending must be retained");
    assert!(persisted_pending.failed, "persisted pending must be marked failed");
    assert!(persisted_pending.error.is_some(), "persisted pending must carry the error");
    assert_eq!(persisted.last_report.as_ref().map(|r| r.ok), Some(false));

    let _ = std::fs::remove_dir_all(&base);
}
