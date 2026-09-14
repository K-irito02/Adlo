//! 存储迁移引擎：复制 → 校验 → 切换指针 → 清理旧源。
//!
//! 调度收敛于「下次进程启动、任何 DB/日志句柄打开之前」执行，因此不存在
//! 持有 SQLite 句柄时搬文件的问题。

use super::category::StorageCategory;
use super::paths::StoragePaths;
use super::whitelist::owns_file;
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
        if src == dst {
            issues.push(PreflightIssue {
                severity: Severity::Error,
                category: Some(category),
                message: format!("source and target are identical: {}", src.display()),
            });
            continue;
        }
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

    #[test]
    fn plan_categories_reports_only_changed() {
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(PathBuf::from("/new"));
        let from = paths_for(&StorageLocator::default().selection, "/old");
        let to = paths_for(&loc.selection, "/old");
        let cats = plan_categories(&from, &to);
        // 改根目录 → 根下所有类都变；凭据/下载默认值不变。
        assert!(cats.contains(&StorageCategory::Database));
        assert!(cats.contains(&StorageCategory::Logs));
        assert!(!cats.contains(&StorageCategory::CredentialsFallback));
        assert!(!cats.contains(&StorageCategory::DownloadsDefault));
    }

    #[test]
    fn preflight_rejects_identical_paths() {
        let p = paths_for(&StorageLocator::default().selection, "/old");
        let report = preflight(&p, &p);
        assert!(report.has_errors());
    }

    #[test]
    fn preflight_rejects_target_inside_source() {
        let from = paths_for(&StorageLocator::default().selection, "/old");
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(PathBuf::from("/old/sub"));
        let to = paths_for(&loc.selection, "/old");
        let report = preflight(&from, &to);
        assert!(report.has_errors(), "target inside source must be rejected");
    }

    #[test]
    fn preflight_warnings_do_not_block() {
        let from = paths_for(&StorageLocator::default().selection, "/old");
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(PathBuf::from("/other"));
        let to = paths_for(&loc.selection, "/old");
        let report = preflight(&from, &to);
        assert!(!report.has_errors());
    }

    #[test]
    fn scan_foreign_on_missing_dirs_is_empty() {
        let p = paths_for(&StorageLocator::default().selection, "/adl-nonexistent-9f3a7c1e-scan");
        assert!(scan_foreign(&p).is_empty());
    }
}
