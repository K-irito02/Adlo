//! 存储迁移引擎：复制 → 校验 → 切换指针 → 清理旧源。
//!
//! 调度收敛于「下次进程启动、任何 DB/日志句柄打开之前」执行，因此不存在
//! 持有 SQLite 句柄时搬文件的问题。

use super::category::StorageCategory;
use super::locator::{KeptDir, MigrationReport, StorageLocator};
use super::paths::{StorageDefaults, StoragePaths};
use super::whitelist::{is_own_dir, owns_file};
use adl_errors::AppError;
use adl_types::now_ms;
use std::path::{Path, PathBuf};

/// 预检问题严重级。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

/// 单条预检问题。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreflightIssue {
    pub severity: Severity,
    pub category: Option<StorageCategory>,
    pub message: String,
}

/// 预检报告。`has_errors()` 为 true 时不得执行迁移。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreflightReport {
    pub issues: Vec<PreflightIssue>,
    pub total_files: usize,
    pub total_bytes: u64,
}

impl PreflightReport {
    pub fn has_errors(&self) -> bool {
        self.issues.iter().any(|i| i.severity == Severity::Error)
    }
}

/// 某分类源目录中「不属于本应用」的文件清单。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForeignScan {
    pub category: StorageCategory,
    pub root: PathBuf,
    pub foreign_files: Vec<String>,
}

/// 迁移进度（供启动期日志与 Plan C 的 UI 使用）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrationProgress {
    Category { category: StorageCategory, index: usize, total: usize },
    Copying { category: StorageCategory, file: String, done: usize, total: usize },
    Verifying { category: StorageCategory },
    Cleaning { category: StorageCategory },
    Done,
}

/// 两个解析结果之间路径发生变化的分类。
pub fn plan_categories(from: &StoragePaths, to: &StoragePaths) -> Vec<StorageCategory> {
    StorageCategory::ALL.into_iter().filter(|c| from.dir(*c) != to.dir(*c)).collect()
}

/// 逐类扫描源目录中的外部文件（不修改任何文件）。
pub fn scan_foreign(paths: &StoragePaths) -> Vec<ForeignScan> {
    let mut out = Vec::new();
    for category in StorageCategory::ALL {
        // 单文件类与用户下载目录不参与外部文件扫描。
        if matches!(
            category,
            StorageCategory::Database
                | StorageCategory::DownloadsDb
                | StorageCategory::SiteMetaDb
                | StorageCategory::DownloadsDefault
        ) {
            continue;
        }
        for root in super::whitelist::category_roots(category, paths) {
            if !root.is_dir() {
                continue;
            }
            let foreign: Vec<String> = collect_files(&root)
                .into_iter()
                .filter(|f| !owns_file(category, &root, f))
                .map(|f| f.to_string_lossy().to_string())
                .collect();
            if !foreign.is_empty() {
                out.push(ForeignScan { category, root, foreign_files: foreign });
            }
        }
    }
    out
}

/// 预检：源 = 目标、目标位于源内部、目标不可写。
pub fn preflight(from: &StoragePaths, to: &StoragePaths) -> PreflightReport {
    let mut issues = Vec::new();
    let mut total_files = 0usize;
    let mut total_bytes = 0u64;

    // 完全相同的解析结果 → 无处可迁。
    if from == to {
        issues.push(PreflightIssue {
            severity: Severity::Error,
            category: None,
            message: "source and target are identical".to_string(),
        });
        return PreflightReport { issues, total_files, total_bytes };
    }

    // 统一根位于彼此内部 → 自复制。
    if from.root != to.root && (to.root.starts_with(&from.root) || from.root.starts_with(&to.root))
    {
        issues.push(PreflightIssue {
            severity: Severity::Error,
            category: None,
            message: format!(
                "target root {} is inside source root {} (or vice versa)",
                to.root.display(),
                from.root.display()
            ),
        });
    }

    for category in plan_categories(from, to) {
        let src = from.dir(category);
        let dst = to.dir(category);
        // 目标位于源内部 → 自复制。
        if dst.starts_with(&src) || src.starts_with(&dst) {
            issues.push(PreflightIssue {
                severity: Severity::Error,
                category: Some(category),
                message: format!(
                    "target {} is inside source {} (or vice versa)",
                    dst.display(),
                    src.display()
                ),
            });
        }
        // 目标可写性：尝试创建目标父目录并写探测文件。
        if let Some(parent) = dst.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                issues.push(PreflightIssue {
                    severity: Severity::Error,
                    category: Some(category),
                    message: format!("cannot create target parent {}: {e}", parent.display()),
                });
            }
        }
        if let Err(e) = probe_writable(&dst) {
            issues.push(PreflightIssue {
                severity: Severity::Error,
                category: Some(category),
                message: format!("target {} is not writable: {e}", dst.display()),
            });
        }
        // 统计待迁移体积。
        if src.exists() {
            for file in owned_files(category, &src) {
                total_files += 1;
                total_bytes += std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0);
            }
        }
    }

    PreflightReport { issues, total_files, total_bytes }
}

/// 递归收集目录下所有普通文件（不跟随符号链接）。
fn collect_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            match entry.file_type() {
                Ok(ft) if ft.is_dir() => stack.push(path),
                Ok(ft) if ft.is_file() => out.push(path),
                _ => {},
            }
        }
    }
    out
}

/// 收集某分类在 `base` 目录下的自有文件（按 `owns_file` 过滤）。
fn owned_files(category: StorageCategory, base: &Path) -> Vec<PathBuf> {
    if !base.exists() {
        return Vec::new();
    }
    if base.is_file() {
        return if owns_file(category, base, base) { vec![base.to_path_buf()] } else { Vec::new() };
    }
    collect_files(base).into_iter().filter(|f| owns_file(category, base, f)).collect()
}

/// 探测目录可写：创建并删除一个临时文件。
fn probe_writable(target: &Path) -> std::io::Result<()> {
    let dir = if target.is_dir() || target.extension().is_none() {
        target
    } else {
        target.parent().unwrap_or(Path::new("."))
    };
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(".adl-write-probe");
    std::fs::write(&probe, b"")?;
    let _ = std::fs::remove_file(&probe);
    Ok(())
}

/// 单文件类的主文件路径（Database/DownloadsDb/SiteMetaDb 的 .db 文件）。
fn primary_db_file(category: StorageCategory, paths: &StoragePaths) -> Option<PathBuf> {
    match category {
        StorageCategory::Database | StorageCategory::DownloadsDb | StorageCategory::SiteMetaDb => {
            Some(paths.dir(category))
        },
        _ => None,
    }
}

/// 单文件类的主文件 + WAL/SHM 伴随文件（按后缀，不改变文件名）。
///
/// NOTE (Task 3): 清理旧源时也必须用 `db_files(category, from)` 才能一并删除
/// `.db-wal` / `.db-shm`，不要只删主库文件。
fn db_files(category: StorageCategory, paths: &StoragePaths) -> Vec<PathBuf> {
    let Some(primary) = primary_db_file(category, paths) else {
        return Vec::new();
    };
    let s = primary.to_string_lossy().to_string();
    vec![primary, PathBuf::from(format!("{s}-wal")), PathBuf::from(format!("{s}-shm"))]
}

/// 该分类的「目录 → 目录」映射（单文件类返回空）。
fn dir_pairs(
    category: StorageCategory,
    from: &StoragePaths,
    to: &StoragePaths,
) -> Vec<(PathBuf, PathBuf)> {
    match category {
        StorageCategory::Config => vec![(from.config_dir.clone(), to.config_dir.clone())],
        StorageCategory::Clipboard => vec![(from.clipboard_dir.clone(), to.clipboard_dir.clone())],
        StorageCategory::Snapshot => vec![(from.snapshot_dir.clone(), to.snapshot_dir.clone())],
        StorageCategory::Dsh => vec![
            (from.dsh_versions_dir.clone(), to.dsh_versions_dir.clone()),
            (from.dsh_bundle_dir.clone(), to.dsh_bundle_dir.clone()),
        ],
        StorageCategory::Logs => vec![(from.logs_dir.clone(), to.logs_dir.clone())],
        StorageCategory::CredentialsFallback => {
            vec![(from.credentials_dir.clone(), to.credentials_dir.clone())]
        },
        _ => Vec::new(),
    }
}

/// 复制某分类的自有文件；返回 (新文件路径, 字节数)。幂等：目标存在且大小一致则跳过。
pub fn copy_category(
    category: StorageCategory,
    from: &StoragePaths,
    to: &StoragePaths,
    progress: &mut dyn FnMut(MigrationProgress),
) -> Result<Vec<(PathBuf, u64)>, AppError> {
    // 单文件类：主库 + 伴随 wal/shm，源与目标逐一同名映射（覆盖值按目录解析）。
    if matches!(
        category,
        StorageCategory::Database | StorageCategory::DownloadsDb | StorageCategory::SiteMetaDb
    ) {
        let mut moved = Vec::new();
        for (src, dst) in db_files(category, from).into_iter().zip(db_files(category, to)) {
            if !src.is_file() {
                continue;
            }
            let bytes = copy_one(&src, &dst, progress, category)?;
            moved.push((dst, bytes));
        }
        return Ok(moved);
    }

    // 目录类：保留相对路径。
    let mut moved = Vec::new();
    for (src_dir, dst_dir) in dir_pairs(category, from, to) {
        for file in owned_files(category, &src_dir) {
            let rel = match file.strip_prefix(&src_dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let dst = dst_dir.join(rel);
            let bytes = copy_one(&file, &dst, progress, category)?;
            moved.push((dst, bytes));
        }
    }
    Ok(moved)
}

/// 复制单个文件（幂等 + 进度）。
fn copy_one(
    src: &Path,
    dst: &Path,
    progress: &mut dyn FnMut(MigrationProgress),
    category: StorageCategory,
) -> Result<u64, AppError> {
    let src_len = std::fs::metadata(src)?.len();
    if let Ok(meta) = std::fs::metadata(dst) {
        if meta.len() == src_len {
            // 上次中断留下的完整副本 → 跳过。
            return Ok(src_len);
        }
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    progress(MigrationProgress::Copying {
        category,
        file: dst.to_string_lossy().to_string(),
        done: 0,
        total: 0,
    });
    let tmp = dst.with_extension("adl-part");
    std::fs::copy(src, &tmp)?;
    std::fs::rename(&tmp, dst)?;
    Ok(src_len)
}

/// 校验某分类：源自有文件数量 = 目标对应文件数量，且逐个大小一致；SQLite 附加 quick_check。
pub fn verify_category(
    category: StorageCategory,
    from: &StoragePaths,
    to: &StoragePaths,
) -> Result<(), AppError> {
    if matches!(
        category,
        StorageCategory::Database | StorageCategory::DownloadsDb | StorageCategory::SiteMetaDb
    ) {
        for (src, dst) in db_files(category, from).into_iter().zip(db_files(category, to)) {
            if !src.is_file() {
                continue;
            }
            let s = std::fs::metadata(&src)?.len();
            let d = std::fs::metadata(&dst)
                .map_err(|e| AppError::Storage(format!("missing target {}: {e}", dst.display())))?
                .len();
            if s != d {
                return Err(AppError::Storage(format!(
                    "size mismatch for {}: source {s} vs target {d}",
                    dst.display()
                )));
            }
        }
        // 主库/下载库/站点元库：quick_check（只对存在的 .db 文件）。
        if let Some(db) = primary_db_file(category, to) {
            if db.is_file() {
                quick_check(&db)?;
            }
        }
        return Ok(());
    }

    for (src_dir, dst_dir) in dir_pairs(category, from, to) {
        for file in owned_files(category, &src_dir) {
            let rel = file.strip_prefix(&src_dir).unwrap_or(&file);
            let dst = dst_dir.join(rel);
            let s = std::fs::metadata(&file)?.len();
            let d = std::fs::metadata(&dst)
                .map_err(|e| AppError::Storage(format!("missing target {}: {e}", dst.display())))?
                .len();
            if s != d {
                return Err(AppError::Storage(format!(
                    "size mismatch for {}: source {s} vs target {d}",
                    dst.display()
                )));
            }
        }
    }
    Ok(())
}

/// SQLite 完整性快检。
fn quick_check(db: &Path) -> Result<(), AppError> {
    let conn = rusqlite::Connection::open(db)
        .map_err(|e| AppError::Storage(format!("quick_check open failed: {e}")))?;
    let result: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|e| AppError::Storage(format!("quick_check failed: {e}")))?;
    if result != "ok" {
        return Err(AppError::Storage(format!("quick_check reported: {result}")));
    }
    Ok(())
}

/// 删除某分类的旧自有文件，并自底向上删除已空的自有目录。
///
/// 返回 `(已删除目录, 因含外部文件而保留的目录)`。外部文件永不删除。
pub fn cleanup_category(
    category: StorageCategory,
    from: &StoragePaths,
) -> Result<(Vec<PathBuf>, Vec<KeptDir>), AppError> {
    let mut removed_dirs = Vec::new();
    let mut kept_dirs = Vec::new();

    let roots: Vec<PathBuf> = if matches!(
        category,
        StorageCategory::Database | StorageCategory::DownloadsDb | StorageCategory::SiteMetaDb
    ) {
        // A7/A8：单文件类统一走 db_files（覆盖感知，含 -wal/-shm 伴生文件）。
        db_files(category, from)
    } else {
        dir_pairs(category, from, from).into_iter().map(|(d, _)| d).collect()
    };

    for root in roots {
        // 单文件类：直接删主库/伴随文件。
        if root.is_file() {
            if owns_file(category, &root, &root) {
                std::fs::remove_file(&root)?;
            }
            continue;
        }
        if !root.is_dir() {
            continue;
        }
        // 删自有文件。
        for file in owned_files(category, &root) {
            std::fs::remove_file(&file)?;
        }
        // 自底向上删除空的自有目录。
        let mut dirs = all_dirs(&root);
        dirs.sort_by_key(|d| std::cmp::Reverse(d.components().count()));
        for dir in dirs {
            if dir == root || !is_own_dir(category, &root, &dir) || !is_empty_dir(&dir) {
                continue;
            }
            if std::fs::remove_dir(&dir).is_ok() {
                removed_dirs.push(dir);
            }
        }
        // 根目录本身：若已空则删除；否则记录残留的外部文件（外部文件永不删除）。
        if is_empty_dir(&root) {
            if std::fs::remove_dir(&root).is_ok() {
                removed_dirs.push(root);
            }
        } else {
            let foreign: Vec<String> =
                collect_files(&root).into_iter().map(|f| f.to_string_lossy().to_string()).collect();
            if !foreign.is_empty() {
                kept_dirs.push(KeptDir { path: root, foreign_files: foreign });
            }
        }
    }

    Ok((removed_dirs, kept_dirs))
}

/// 目录存在且为空时为 true（不可读视为「非空」，避免误删）。
fn is_empty_dir(dir: &Path) -> bool {
    match std::fs::read_dir(dir) {
        Ok(mut it) => it.next().is_none(),
        Err(_) => false,
    }
}

/// 收集目录及其全部子目录（不跟随符号链接）。
fn all_dirs(root: &Path) -> Vec<PathBuf> {
    let mut out = vec![root.to_path_buf()];
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    out.push(entry.path());
                    stack.push(entry.path());
                }
            }
        }
    }
    out
}

/// 执行一次完整迁移（不含 locator 持久化）：复制 → 校验 → 清理旧源。
///
/// 失败时 best-effort 清理本次新建的目标文件，且**绝不删除源文件**、不切换指针。
pub fn run(
    from: &StoragePaths,
    to: &StoragePaths,
    retain_source: bool,
    mut progress: impl FnMut(MigrationProgress),
) -> MigrationReport {
    let categories = plan_categories(from, to);
    let total = categories.len();
    let mut created: Vec<PathBuf> = Vec::new();
    let mut moved_files = 0usize;
    let mut moved_bytes = 0u64;

    // 1) 复制 + 校验（全部通过才切换指针）。
    for (index, category) in categories.iter().enumerate() {
        progress(MigrationProgress::Category { category: *category, index, total });
        let copied = match copy_category(*category, from, to, &mut progress) {
            Ok(moved) => moved,
            Err(e) => return fail(&mut created, e),
        };
        for (path, bytes) in &copied {
            moved_files += 1;
            moved_bytes += bytes;
            created.push(path.clone());
        }
        progress(MigrationProgress::Verifying { category: *category });
        if let Err(e) = verify_category(*category, from, to) {
            return fail(&mut created, e);
        }
    }

    // 2) 清理旧源（保留模式跳过）。
    let mut removed_dirs = Vec::new();
    let mut kept_dirs = Vec::new();
    if !retain_source {
        for category in &categories {
            progress(MigrationProgress::Cleaning { category: *category });
            match cleanup_category(*category, from) {
                Ok((removed, kept)) => {
                    removed_dirs.extend(removed);
                    kept_dirs.extend(kept);
                },
                Err(e) => return fail(&mut created, e),
            }
        }
    }

    progress(MigrationProgress::Done);
    MigrationReport {
        at: now_ms(),
        ok: true,
        moved_files,
        moved_bytes,
        removed_dirs,
        kept_dirs,
        retained: retain_source,
        error: None,
    }
}

/// 失败路径：不切换指针、不删源；best-effort 删除本次新建的目标文件。
fn fail(created: &mut [PathBuf], error: AppError) -> MigrationReport {
    for path in created.iter() {
        let _ = std::fs::remove_file(path);
    }
    MigrationReport {
        at: now_ms(),
        ok: false,
        moved_files: 0,
        moved_bytes: 0,
        removed_dirs: Vec::new(),
        kept_dirs: Vec::new(),
        retained: false,
        error: Some(error.to_string()),
    }
}

/// 执行 locator 中的待迁移（若有）：成功则更新 selection、清 pending、写 last_report；
/// 失败则保留 pending 并标记 `failed`，不切换指针、不自动重试。
pub fn apply_pending(
    locator: &mut StorageLocator,
    defaults: &StorageDefaults,
    mut progress: impl FnMut(MigrationProgress),
) -> Option<MigrationReport> {
    let pending = locator.pending_migration.clone()?;
    let from = StoragePaths::resolve(&pending.from, defaults);
    let to = StoragePaths::resolve(&pending.to, defaults);

    let report = run(&from, &to, pending.retain_source, &mut progress);
    if report.ok {
        locator.selection = pending.to.clone();
        locator.pending_migration = None;
    } else if let Some(still) = locator.pending_migration.as_mut() {
        still.failed = true;
        still.error = report.error.clone();
    }
    locator.last_report = Some(report.clone());
    Some(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::locator::StorageLocator;
    use crate::storage::paths::{StorageDefaults, StoragePaths};
    use std::path::PathBuf;

    fn defaults(root: &str) -> StorageDefaults {
        StorageDefaults {
            root: PathBuf::from(root),
            credentials_dir: PathBuf::from("/creds"),
            downloads_dir: PathBuf::from("/dl"),
        }
    }

    fn paths_for(
        selection: &crate::storage::locator::StorageSelection,
        root: &str,
    ) -> StoragePaths {
        StoragePaths::resolve(selection, &defaults(root))
    }

    /// 每个测试用例独立的临时根，避免污染盘根并避免并行用例互相干扰。
    fn temp_base(tag: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("adl-mig-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        base
    }

    #[test]
    fn plan_categories_reports_only_changed() {
        let base = temp_base("plan");
        let old_root = base.join("old");
        let new_root = base.join("new");
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(new_root);
        let from = paths_for(&StorageLocator::default().selection, &old_root.to_string_lossy());
        let to = paths_for(&loc.selection, &old_root.to_string_lossy());
        let cats = plan_categories(&from, &to);
        // 改根目录 → 根下所有类都变；凭据/下载默认值不变。
        assert!(cats.contains(&StorageCategory::Database));
        assert!(cats.contains(&StorageCategory::Logs));
        assert!(!cats.contains(&StorageCategory::CredentialsFallback));
        assert!(!cats.contains(&StorageCategory::DownloadsDefault));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn preflight_rejects_identical_paths() {
        let base = temp_base("preflight-identical");
        let old_root = base.join("old");
        let p = paths_for(&StorageLocator::default().selection, &old_root.to_string_lossy());
        let report = preflight(&p, &p);
        assert!(report.has_errors());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn preflight_rejects_target_inside_source() {
        let base = temp_base("preflight-inside");
        let old_root = base.join("old");
        let from = paths_for(&StorageLocator::default().selection, &old_root.to_string_lossy());
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(old_root.join("sub"));
        let to = paths_for(&loc.selection, &old_root.to_string_lossy());
        let report = preflight(&from, &to);
        assert!(report.has_errors(), "target inside source must be rejected");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn preflight_warnings_do_not_block() {
        let base = temp_base("preflight-other");
        let old_root = base.join("old");
        let other_root = base.join("other");
        let from = paths_for(&StorageLocator::default().selection, &old_root.to_string_lossy());
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(other_root);
        let to = paths_for(&loc.selection, &old_root.to_string_lossy());
        let report = preflight(&from, &to);
        assert!(!report.has_errors());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn scan_foreign_on_missing_dirs_is_empty() {
        let p = paths_for(&StorageLocator::default().selection, "/adl-nonexistent-9f3a7c1e-scan");
        assert!(scan_foreign(&p).is_empty());
    }

    use crate::storage::locator::{StorageMode, StorageSelection};

    fn write(path: &std::path::Path, bytes: &[u8]) {
        if let Some(p) = path.parent() {
            std::fs::create_dir_all(p).unwrap();
        }
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn copy_and_verify_directory_category_is_idempotent() {
        let base = std::env::temp_dir().join(format!("adl-mig-copy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let sel = StorageSelection::default();
        let old = paths_for(&sel, &base.join("old").to_string_lossy());
        let new_sel = StorageSelection { root: Some(base.join("new")), ..Default::default() };
        let newp = paths_for(&new_sel, &base.join("old").to_string_lossy());

        write(&old.clipboard_dir.join("images/a.png"), b"AAA");
        write(&old.clipboard_dir.join("thumbs/a.png"), b"T");
        // 外部文件不得被复制。
        write(&old.clipboard_dir.join("user-note.txt"), b"USER");

        let mut noop = |_p: MigrationProgress| {};
        copy_category(StorageCategory::Clipboard, &old, &newp, &mut noop).unwrap();
        verify_category(StorageCategory::Clipboard, &old, &newp).unwrap();
        assert!(newp.clipboard_dir.join("images/a.png").exists());
        assert!(newp.clipboard_dir.join("thumbs/a.png").exists());
        assert!(
            !newp.clipboard_dir.join("user-note.txt").exists(),
            "foreign file must not be copied"
        );

        // 幂等：再跑一次不报错。
        copy_category(StorageCategory::Clipboard, &old, &newp, &mut noop).unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn verify_detects_size_mismatch() {
        let base = std::env::temp_dir().join(format!("adl-mig-verify-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let old = paths_for(&StorageSelection::default(), &base.join("old").to_string_lossy());
        let new_sel = StorageSelection { root: Some(base.join("new")), ..Default::default() };
        let newp = paths_for(&new_sel, &base.join("old").to_string_lossy());

        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");
        let mut noop = |_p: MigrationProgress| {};
        copy_category(StorageCategory::Clipboard, &old, &newp, &mut noop).unwrap();
        // 篡改目标大小 → 校验必须失败。
        std::fs::write(newp.clipboard_dir.join("images/a.png"), b"A").unwrap();
        assert!(verify_category(StorageCategory::Clipboard, &old, &newp).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn copy_and_verify_migrates_per_category_db_override() {
        let base = std::env::temp_dir().join(format!("adl-mig-db-override-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let old_root = base.join("old");
        let new_db_dir = base.join("newdb");

        // 源：统一根 <tmp>/old，写一个真实 SQLite 库。
        let old = paths_for(&StorageSelection::default(), &old_root.to_string_lossy());
        std::fs::create_dir_all(&old_root).unwrap();
        {
            let conn = rusqlite::Connection::open(old_root.join("data.db")).unwrap();
            conn.execute_batch("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1);").unwrap();
        }

        // 目标：per_category 覆盖 Database → 目录 <tmp>/newdb（覆盖值是目录）。
        let mut categories = std::collections::BTreeMap::new();
        categories.insert(StorageCategory::Database, new_db_dir.clone());
        let new_sel = StorageSelection {
            mode: StorageMode::PerCategory,
            root: Some(old_root.clone()),
            categories,
        };
        let newp = paths_for(&new_sel, &old_root.to_string_lossy());
        assert_eq!(newp.data_db, new_db_dir.join("data.db"));

        let mut noop = |_p: MigrationProgress| {};
        copy_category(StorageCategory::Database, &old, &newp, &mut noop).unwrap();
        verify_category(StorageCategory::Database, &old, &newp).unwrap();
        assert!(new_db_dir.join("data.db").exists(), "override dir must receive data.db");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn cleanup_removes_own_files_and_keeps_dir_with_foreign() {
        let base = std::env::temp_dir().join(format!("adl-mig-clean-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let p = paths_for(&StorageSelection::default(), &base.to_string_lossy());
        write(&p.clipboard_dir.join("images/a.png"), b"AAA");
        write(&p.clipboard_dir.join("user-note.txt"), b"USER");

        let (removed, kept) = cleanup_category(StorageCategory::Clipboard, &p).unwrap();
        assert!(!p.clipboard_dir.join("images/a.png").exists());
        assert!(p.clipboard_dir.join("user-note.txt").exists(), "foreign file kept");
        assert!(kept.iter().any(|k| k.foreign_files.iter().any(|f| f.ends_with("user-note.txt"))));
        let _ = removed; // images/ 目录被删则计入 removed
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn run_moves_data_and_reports() {
        let base = std::env::temp_dir().join(format!("adl-mig-run-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let old = paths_for(&StorageSelection::default(), &base.join("old").to_string_lossy());
        let sel = StorageSelection { root: Some(base.join("new")), ..Default::default() };
        let newp = paths_for(&sel, &base.join("old").to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");
        // 单文件类：必须是真实 SQLite —— verify_category 会跑 PRAGMA quick_check。
        rusqlite::Connection::open(&old.data_db)
            .unwrap()
            .execute_batch("CREATE TABLE t(x);")
            .unwrap();

        let report = run(&old, &newp, false, |_p| {});
        assert!(report.ok, "run should succeed: {:?}", report.error);
        assert!(report.moved_files >= 2);
        assert!(newp.clipboard_dir.join("images/a.png").exists());
        assert!(!old.clipboard_dir.join("images/a.png").exists(), "source cleaned");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn run_retain_source_keeps_old_files() {
        let base = std::env::temp_dir().join(format!("adl-mig-retain-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let old = paths_for(&StorageSelection::default(), &base.join("old").to_string_lossy());
        let sel = StorageSelection { root: Some(base.join("new")), ..Default::default() };
        let newp = paths_for(&sel, &base.join("old").to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");
        let report = run(&old, &newp, true, |_p| {});
        assert!(report.ok);
        assert!(report.retained);
        assert!(old.clipboard_dir.join("images/a.png").exists(), "source retained");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn apply_pending_clears_pending_and_sets_report() {
        let base = std::env::temp_dir().join(format!("adl-mig-apply-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(base.join("new"));
        loc.pending_migration = Some(crate::storage::locator::PendingMigration {
            from: StorageSelection::default(),
            to: loc.selection.clone(),
            retain_source: false,
            requested_at: 1,
            failed: false,
            error: None,
        });
        // 让源目录有内容，避免空跑歧义。默认根设为 <base>/old，目标根为 <base>/new，
        // 避免触发「目标在源内部」的根级包含预检。
        let old = paths_for(&StorageSelection::default(), &base.join("old").to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");

        let report =
            apply_pending(&mut loc, &defaults(&base.join("old").to_string_lossy()), |_p| {});
        assert!(report.is_some());
        assert!(loc.pending_migration.is_none(), "pending cleared on success");
        assert!(loc.last_report.is_some());
        let _ = std::fs::remove_dir_all(&base);
    }
}
