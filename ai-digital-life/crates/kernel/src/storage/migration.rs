//! 存储迁移引擎：复制 → 校验 → 切换指针 → 清理旧源。
//!
//! 调度收敛于「下次进程启动、任何 DB/日志句柄打开之前」执行，因此不存在
//! 持有 SQLite 句柄时搬文件的问题。

use super::category::StorageCategory;
use super::paths::StoragePaths;
use super::whitelist::owns_file;
use adl_errors::AppError;
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

/// 单文件类：源文件不会同时包含 wal/shm，逐个按存在性处理。
fn single_files(category: StorageCategory, paths: &StoragePaths) -> Vec<(PathBuf, PathBuf)> {
    let names: &[&str] = match category {
        StorageCategory::Database => &["data.db", "data.db-wal", "data.db-shm"],
        StorageCategory::DownloadsDb => &["downloads.db", "downloads.db-wal", "downloads.db-shm"],
        StorageCategory::SiteMetaDb => {
            &["site-meta-cache.db", "site-meta-cache.db-wal", "site-meta-cache.db-shm"]
        },
        _ => &[],
    };
    names.iter().map(|n| (paths.root.join(n), paths.root.join(n))).collect()
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
    // 单文件类：源文件名 → 目标根下同名文件。
    if matches!(
        category,
        StorageCategory::Database | StorageCategory::DownloadsDb | StorageCategory::SiteMetaDb
    ) {
        let mut moved = Vec::new();
        for (src_root_file, _) in single_files(category, from) {
            if !src_root_file.is_file() {
                continue;
            }
            let Some(name) = src_root_file.file_name() else {
                continue;
            };
            let dst = to.root.join(name);
            let bytes = copy_one(&src_root_file, &dst, progress, category)?;
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
        for (src, _) in single_files(category, from) {
            if !src.is_file() {
                continue;
            }
            let Some(name) = src.file_name() else {
                continue;
            };
            let dst = to.root.join(name);
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
        let db = to.dir(category);
        if db.is_file() {
            quick_check(&db)?;
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

    use crate::storage::locator::StorageSelection;

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
}
