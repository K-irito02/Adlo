//! 存储迁移引擎：复制 → 校验 → 切换指针 → 清理旧源。
//!
//! 调度收敛于「下次进程启动、任何 DB/日志句柄打开之前」执行，因此不存在
//! 持有 SQLite 句柄时搬文件的问题。

use super::category::StorageCategory;
use super::locator::{KeptDir, MigrationReport, StorageLocator, save_locator};
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
                | StorageCategory::TreeCache
                | StorageCategory::DownloadsDefault
        ) {
            continue;
        }
        for root in super::whitelist::category_roots(category, paths) {
            if !root.is_dir() {
                continue;
            }
            // 状态查询用有界遍历：超大目录即停，避免 getStatus 卡死。
            let foreign: Vec<String> = walk_files(&root, WalkLimits::status())
                .0
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
        // 统计待迁移体积。遍历截断即硬预检错误（不得吞掉：静默少计会导致目标空间误判）。
        if src.exists() {
            match owned_files(category, &src) {
                Ok(files) => {
                    for file in files {
                        total_files += 1;
                        total_bytes += std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0);
                    }
                },
                Err(e) => {
                    issues.push(PreflightIssue {
                        severity: Severity::Error,
                        category: Some(category),
                        message: e.to_string(),
                    });
                },
            }
        }
    }

    PreflightReport { issues, total_files, total_bytes }
}

/// 文件遍历预算。
#[derive(Debug, Clone, Copy)]
pub struct WalkLimits {
    /// 最大目录深度（防病态嵌套）。
    pub max_depth: usize,
    /// 最大收集文件数；`None` = 完整遍历（迁移路径用，配合循环保护保证终止）。
    pub max_files: Option<usize>,
}

impl WalkLimits {
    /// 迁移用：完整但防循环。
    pub fn complete() -> Self {
        Self { max_depth: 128, max_files: None }
    }

    /// 状态查询用：有界快速。
    pub fn status() -> Self {
        Self { max_depth: 64, max_files: Some(200_000) }
    }
}

/// 有界收集目录下所有普通文件。
///
/// 跳过符号链接与挂载点（Windows directory junction 的 `file_type()` 是 dir，
/// 必须用 `is_symlink()`（`symlink_metadata`）判定）。循环保证来自 canonical
/// 化目录路径的 visited 去重集合 + `max_depth` 深度上限（`is_symlink` 跳过只是
/// 尽早剪枝，不单独构成循环保证）。
/// 返回 (文件列表, 是否因超预算/深度被截断)。
/// 截断时经 `tracing::warn!` 记录根路径，调用方无需重复处理。
pub fn walk_files(root: &Path, limits: WalkLimits) -> (Vec<PathBuf>, bool) {
    use std::collections::HashSet;
    let mut out = Vec::new();
    let mut truncated = false;
    let mut visited: HashSet<PathBuf> = HashSet::new();
    if let Ok(canon) = std::fs::canonicalize(root) {
        visited.insert(canon);
    }
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        if let Some(max) = limits.max_files {
            if out.len() >= max {
                truncated = true;
                break;
            }
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_symlink() {
                continue;
            }
            match entry.file_type() {
                Ok(ft) if ft.is_dir() => {
                    if depth + 1 > limits.max_depth {
                        truncated = true;
                        continue;
                    }
                    match std::fs::canonicalize(&path) {
                        Ok(canon) => {
                            if visited.insert(canon) {
                                stack.push((path, depth + 1));
                            } else {
                                truncated = true;
                            }
                        },
                        Err(_) => {
                            // 子目录不可解析（删除竞态/权限）：该子树被丢弃，计为截断。
                            truncated = true;
                        },
                    }
                },
                Ok(ft) if ft.is_file() => {
                    if let Some(max) = limits.max_files {
                        if out.len() >= max {
                            truncated = true;
                            break;
                        }
                    }
                    out.push(path);
                },
                _ => {},
            }
        }
    }
    if truncated {
        // H1：超预算截断必须可见。集中在此处告警，覆盖全部调用方（scan_foreign /
        // dir_usage_limited / 迁移路径），调用方无需重复处理 flag，DTO 不变。
        tracing::warn!(root = %root.display(), "walk_files truncated: tree exceeds limits, results are partial");
    }
    (out, truncated)
}

/// 有界目录占用统计（状态查询用）。超预算即停，返回部分统计。
pub fn dir_usage_limited(path: &Path) -> (u64, u64) {
    if path.is_file() {
        let len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        return (len, 1);
    }
    if !path.is_dir() {
        return (0, 0);
    }
    let (files, _) = walk_files(path, WalkLimits::status());
    let mut bytes = 0u64;
    let mut count = 0u64;
    for f in files {
        bytes += std::fs::metadata(&f).map(|m| m.len()).unwrap_or(0);
        count += 1;
    }
    (bytes, count)
}

/// 是否为单文件类（落点为单个 .db 主库文件，伴生 `-wal`/`-shm` 同目录同名前缀）。
fn is_single_file_category(category: StorageCategory) -> bool {
    matches!(
        category,
        StorageCategory::Database
            | StorageCategory::DownloadsDb
            | StorageCategory::SiteMetaDb
            | StorageCategory::TreeCache
    )
}

/// 单文件类的主库路径 `path` 加上伴生后缀（不改变文件名前缀）。
fn companion_paths(path: &Path) -> Vec<PathBuf> {
    let s = path.to_string_lossy().to_string();
    vec![path.to_path_buf(), PathBuf::from(format!("{s}-wal")), PathBuf::from(format!("{s}-shm"))]
}

/// 某分类的占用统计（双端 `category_statuses` 共用，事项 11c 统一口径）：
/// - `downloads_default` 只是设置值（用户文件落点，本应用不拥有其中任何文件）→ (0, 0)；
/// - 单文件类：主库 + **已存在**的 `-wal`/`-shm` 伴生文件（与 `db_files`/复制/清理同源，
///   不再只数主库——否则重启后 SQLite 重建伴生文件会造成「新位置 3 文件、统计 1 文件」的口径分裂）；
/// - 目录类：有界遍历统计（`dir_usage_limited`，防超大目录/循环挂载卡死状态查询）。
pub fn category_usage(category: StorageCategory, path: &Path) -> (u64, u64) {
    if matches!(category, StorageCategory::DownloadsDefault) {
        return (0, 0);
    }
    if is_single_file_category(category) {
        if !path.exists() {
            return (0, 0);
        }
        if path.is_dir() {
            // 防御：单文件类落点不应是目录，退化为有界目录统计而非静默 (0,0)；
            // warn 留痕，防"落点配成目录"的配置错误被正常占用值掩盖（Phase 4 R3-L6）。
            tracing::warn!(
                category = ?category,
                path = %path.display(),
                "single-file category path is a directory; falling back to bounded dir walk"
            );
            return dir_usage_limited(path);
        }
        let mut bytes = 0u64;
        let mut files = 0u64;
        for p in companion_paths(path) {
            if let Ok(meta) = std::fs::metadata(&p) {
                if meta.is_file() {
                    bytes += meta.len();
                    files += 1;
                }
            }
        }
        return (bytes, files);
    }
    dir_usage_limited(path)
}

/// 递归收集目录下所有普通文件（迁移路径用：完整遍历 + 循环保护，保证终止）。
/// 超深（>128 层）/循环导致的截断返回 `Err`，调用方必须大声失败，禁止静默丢文件。
fn collect_files(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let (files, truncated) = walk_files(root, WalkLimits::complete());
    if truncated {
        return Err(AppError::Storage(format!(
            "directory walk truncated (exceeds depth/file limits): {}",
            root.display()
        )));
    }
    Ok(files)
}

/// 收集某分类在 `base` 目录下的自有文件（按 `owns_file` 过滤）。
/// 遍历截断时返回 `Err`（超深目录树不得静默迁移部分文件）。
fn owned_files(category: StorageCategory, base: &Path) -> Result<Vec<PathBuf>, AppError> {
    if !base.exists() {
        return Ok(Vec::new());
    }
    if base.is_file() {
        if !owns_file(category, base, base) {
            return Ok(Vec::new());
        }
        // 单文件类：主库 + 已存在的 `-wal`/`-shm` 伴生文件（与 `db_files`/复制同源，事项 11c：
        // 预检 total_files 与实际搬移文件数一致）。伴生文件不走 `owns_file`——其 `strip_prefix`
        // 以主库文件为基，伴生路径天然不在其下（白名单语义按目录结构判定，此处已验主库归属）。
        // 后缀构造复用 `companion_paths`（Phase 4 R3-11c-L1 去重），只收已存在文件。
        if is_single_file_category(category) {
            return Ok(companion_paths(base).into_iter().filter(|p| p.is_file()).collect());
        }
        return Ok(vec![base.to_path_buf()]);
    }
    Ok(collect_files(base)?.into_iter().filter(|f| owns_file(category, base, f)).collect())
}

/// 探测目录可写：创建并删除一个临时文件。供存储预检与壳层默认数据根判定共用，
/// 保证 `.adl-write-probe` 探针契约单点维护。
pub fn probe_writable(target: &Path) -> std::io::Result<()> {
    let dir = if target.is_dir() || target.extension().is_none() {
        target
    } else {
        target.parent().unwrap_or(Path::new("."))
    };
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(".adl-write-probe");
    std::fs::write(&probe, b"")?;
    if let Err(e) = std::fs::remove_file(&probe) {
        tracing::warn!(error = %e, path = %probe.display(), "failed to remove write probe file");
    }
    Ok(())
}

/// 单文件类的主文件路径（Database/DownloadsDb/SiteMetaDb/TreeCache 的 .db 文件）。
fn primary_db_file(category: StorageCategory, paths: &StoragePaths) -> Option<PathBuf> {
    match category {
        StorageCategory::Database
        | StorageCategory::DownloadsDb
        | StorageCategory::SiteMetaDb
        | StorageCategory::TreeCache => Some(paths.dir(category)),
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
    // 后缀构造与 `companion_paths` 同源（存在不过滤：复制层跳过缺失项，
    // 与过滤调用方语义区分，Phase 4 R2-R9-L2 去重）。
    companion_paths(&primary)
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
        StorageCategory::Database
            | StorageCategory::DownloadsDb
            | StorageCategory::SiteMetaDb
            | StorageCategory::TreeCache
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
        for file in owned_files(category, &src_dir)? {
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
        StorageCategory::Database
            | StorageCategory::DownloadsDb
            | StorageCategory::SiteMetaDb
            | StorageCategory::TreeCache
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
        // 主库/下载库/站点元库/树缓存库：quick_check（只对存在的 .db 文件）。
        if let Some(db) = primary_db_file(category, to) {
            if db.is_file() {
                quick_check(&db)?;
            }
        }
        return Ok(());
    }

    for (src_dir, dst_dir) in dir_pairs(category, from, to) {
        for file in owned_files(category, &src_dir)? {
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
        StorageCategory::Database
            | StorageCategory::DownloadsDb
            | StorageCategory::SiteMetaDb
            | StorageCategory::TreeCache
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
        // 删自有文件（截断即 `Err` 大声失败，不静默删部分文件）。
        for file in owned_files(category, &root)? {
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
            let foreign: Vec<String> = collect_files(&root)?
                .into_iter()
                .map(|f| f.to_string_lossy().to_string())
                .collect();
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

/// 执行一次完整迁移：复制 → 校验 → **切换指针** → 清理旧源。
///
/// `switch_pointer` 在对全部分类复制 + 校验通过之后、清理旧源之前调用（`FnOnce`），
/// 是「清理之前的最后一步」。其返回 `Err` 时执行失败路径：best-effort 清理本次新建的
/// 目标文件，**绝不删除源文件**，也不再执行清理。
pub fn run(
    from: &StoragePaths,
    to: &StoragePaths,
    retain_source: bool,
    switch_pointer: impl FnOnce() -> Result<(), AppError>,
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

    // 2) 切换指针（清理之前的最后一步）。失败 → 不清理、不删源。
    if let Err(e) = switch_pointer() {
        return fail(&mut created, e);
    }

    // 3) 清理旧源（保留模式跳过）。
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
                Err(e) => {
                    // 指针已落盘指向新根：新根即权威数据。清理失败绝不能走 `fail()`
                    // （那会删除刚复制好的新数据），也不再继续清理；报告 ok=false 但
                    // switched=true，调用方据此清除 pending，避免重试重新复制旧源覆盖新数据。
                    return MigrationReport {
                        at: now_ms(),
                        ok: false,
                        switched: true,
                        moved_files,
                        moved_bytes,
                        removed_dirs,
                        kept_dirs,
                        retained: retain_source,
                        error: Some(e.to_string()),
                    };
                },
            }
        }
        // 3b) 旧统一根若已空则一并删除（其它分类数据可能仍在其下 → 仅在空目录时删除）。
        if from.root != to.root
            && is_empty_dir(&from.root)
            && std::fs::remove_dir(&from.root).is_ok()
        {
            removed_dirs.push(from.root.clone());
        }
    }

    progress(MigrationProgress::Done);
    MigrationReport {
        at: now_ms(),
        ok: true,
        switched: true,
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
        switched: false,
        moved_files: 0,
        moved_bytes: 0,
        removed_dirs: Vec::new(),
        kept_dirs: Vec::new(),
        retained: false,
        error: Some(error.to_string()),
    }
}

/// 执行 locator 中的待迁移（若有）：成功则清 pending、写 last_report；失败则保留 pending
/// 并标记 `failed`，不自动重试。
///
/// 指针切换（`locator.selection = pending.to` + 落盘）由 `run` 在复制 + 校验通过之后、
/// 清理旧源之前执行，保证崩溃窗口内源文件仍完整。
pub fn apply_pending(
    locator: &mut StorageLocator,
    defaults: &StorageDefaults,
    progress: impl FnMut(MigrationProgress),
) -> Option<MigrationReport> {
    apply_pending_with(locator, defaults, save_locator, progress)
}

/// `apply_pending` 的实现，注入指针落盘函数以便单测使用临时路径（不写真实 locator）。
fn apply_pending_with(
    locator: &mut StorageLocator,
    defaults: &StorageDefaults,
    mut save: impl FnMut(&StorageLocator) -> Result<(), AppError>,
    mut progress: impl FnMut(MigrationProgress),
) -> Option<MigrationReport> {
    let pending = locator.pending_migration.clone()?;
    let from = StoragePaths::resolve(&pending.from, defaults);
    let to = StoragePaths::resolve(&pending.to, defaults);
    let target = pending.to.clone();

    // 预检（规范 §7.3）：源 = 目标、目标位于源内部、目标不可写等 → 只读失败，
    // 不复制、不切换指针，并标记 pending 失败等待用户处理。
    let pre = preflight(&from, &to);
    if pre.has_errors() {
        let error = pre
            .issues
            .iter()
            .filter(|i| i.severity == Severity::Error)
            .map(|i| i.message.clone())
            .collect::<Vec<_>>()
            .join("; ");
        let report = MigrationReport {
            at: now_ms(),
            ok: false,
            switched: false,
            moved_files: 0,
            moved_bytes: 0,
            removed_dirs: Vec::new(),
            kept_dirs: Vec::new(),
            retained: pending.retain_source,
            error: Some(error),
        };
        if let Some(still) = locator.pending_migration.as_mut() {
            still.failed = true;
            still.error = report.error.clone();
        }
        locator.last_report = Some(report.clone());
        return Some(report);
    }

    let report = run(
        &from,
        &to,
        pending.retain_source,
        || {
            // A10：先落盘候选，成功后再改内存，避免 save 失败时内存 selection 指向
            // 新位置而磁盘仍是旧值（内存 drift）。只改 selection，保留 pending/last_report。
            let mut candidate = locator.clone();
            candidate.selection = target.clone();
            save(&candidate)?;
            locator.selection = target.clone();
            Ok(())
        },
        &mut progress,
    );
    // 指针一旦落盘（ok 或 switched），pending 即视为已消费：绝不能重试重复制，
    // 否则会用旧源覆盖迁移期间写入新根的新数据。仅当失败且未切换指针时才标记 failed。
    if report.ok || report.switched {
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

    #[test]
    fn walk_files_respects_max_depth() {
        let base = std::env::temp_dir().join(format!("adl-walk-depth-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        // 建 5 层嵌套，每层一个文件。
        let mut dir = base.clone();
        for i in 0..5 {
            dir = dir.join(format!("l{i}"));
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("f.txt"), b"x").unwrap();
        }
        let limits = WalkLimits { max_depth: 2, max_files: None };
        let (files, truncated) = walk_files(&base, limits);
        assert!(truncated, "depthExceeded must be reported");
        // base 下无文件；l0/f.txt（深度 1）与 l1/f.txt（深度 2）在内，第 3 层起被截断。
        assert_eq!(files.len(), 2);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn walk_files_respects_max_files() {
        let base = std::env::temp_dir().join(format!("adl-walk-count-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        for i in 0..10 {
            std::fs::write(base.join(format!("f{i}.txt")), b"x").unwrap();
        }
        let limits = WalkLimits { max_depth: 64, max_files: Some(4) };
        let (files, truncated) = walk_files(&base, limits);
        assert!(truncated);
        assert_eq!(files.len(), 4);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn walk_files_truncation_flag_on_zero_depth_budget() {
        // H1：截断只断言 flag（不匹配日志文本）；零深度预算下任何子目录即截断，
        // 顶层文件仍返回（部分结果）。
        let base = std::env::temp_dir().join(format!("adl-walk-zerodepth-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("sub")).unwrap();
        std::fs::write(base.join("top.txt"), b"x").unwrap();
        std::fs::write(base.join("sub/nested.txt"), b"y").unwrap();
        let limits = WalkLimits { max_depth: 0, max_files: None };
        let (files, truncated) = walk_files(&base, limits);
        assert!(truncated, "subdirectory beyond zero depth budget must set the flag");
        assert_eq!(files.len(), 1);
        assert!(files.iter().any(|f| f.ends_with("top.txt")));
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 超深目录树夹具根（>128 层，触发 `WalkLimits::complete` 截断）。
    /// Windows 下加 `\\?\` 前缀绕过 260 字符 MAX_PATH 限制。
    fn deep_base(tag: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("adl-{tag}-{}", std::process::id()));
        #[cfg(windows)]
        let base = PathBuf::from(format!(r"\\?\{}", base.display()));
        let _ = std::fs::remove_dir_all(&base);
        base
    }

    /// 在 `root` 下建 `depth` 层单链嵌套（每层 1 字符目录名），底层放一个文件。
    fn make_over_depth_tree(root: &Path, depth: usize) -> PathBuf {
        let mut dir = root.to_path_buf();
        for _ in 0..depth {
            dir = dir.join("d");
            std::fs::create_dir_all(&dir).unwrap();
        }
        let file = dir.join("f.txt");
        std::fs::write(&file, b"x").unwrap();
        file
    }

    #[test]
    fn owned_files_errors_on_over_depth_tree() {
        // M1：128 层以上的树不得静默丢文件，必须 `Err` 大声失败。
        let base = deep_base("own-deep");
        std::fs::create_dir_all(&base).unwrap();
        make_over_depth_tree(&base, 135);
        let err =
            owned_files(StorageCategory::Config, &base).expect_err("over-depth tree must fail");
        assert!(err.to_string().contains("truncated"), "error must name the truncation: {err}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn copy_category_refuses_truncated_source() {
        // M1：截断的源目录不得复制部分文件，`copy_category` 直接返回 `Err`。
        let base = deep_base("copy-deep");
        let old_root = base.join("old");
        let new_root = base.join("new");
        let old = paths_for(&StorageSelection::default(), &old_root.to_string_lossy());
        let new_sel = StorageSelection { root: Some(new_root.clone()), ..Default::default() };
        let newp = paths_for(&new_sel, &old_root.to_string_lossy());
        std::fs::create_dir_all(&old.config_dir).unwrap();
        make_over_depth_tree(&old.config_dir, 135);

        let mut noop = |_p: MigrationProgress| {};
        let err = copy_category(StorageCategory::Config, &old, &newp, &mut noop)
            .expect_err("truncated source must be refused");
        assert!(err.to_string().contains("truncated"), "error must name the truncation: {err}");
        assert!(
            !newp.config_dir.exists()
                || walk_files(&newp.config_dir, WalkLimits::complete()).0.is_empty(),
            "no partial copy may be left behind"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn walk_files_skips_symlinks() {
        let base = std::env::temp_dir().join(format!("adl-walk-link-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("real.txt"), b"x").unwrap();
        // Windows 建符号链接需特权；失败则跳过本用例（不判失败）。
        #[cfg(windows)]
        let link_ok =
            std::os::windows::fs::symlink_file(base.join("real.txt"), base.join("link.txt"))
                .is_ok();
        #[cfg(not(windows))]
        let link_ok =
            std::os::unix::fs::symlink(base.join("real.txt"), base.join("link.txt")).is_ok();
        let (files, _) = walk_files(&base, WalkLimits::status());
        assert!(files.iter().any(|f| f.ends_with("real.txt")));
        if link_ok {
            assert!(
                !files.iter().any(|f| f.ends_with("link.txt")),
                "symlinks must never be collected"
            );
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn dir_usage_limited_counts_and_stops() {
        let base = std::env::temp_dir().join(format!("adl-walk-usage-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("sub")).unwrap();
        std::fs::write(base.join("a.bin"), [0u8; 7]).unwrap();
        std::fs::write(base.join("sub/b.bin"), [0u8; 5]).unwrap();
        assert_eq!(dir_usage_limited(&base), (12, 2));
        assert_eq!(dir_usage_limited(&base.join("missing")), (0, 0));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn category_usage_counts_db_and_existing_companions() {
        let base = temp_base("category-usage-db");
        let db = base.join("data.db");
        write(&db, &[0u8; 7]);
        assert_eq!(category_usage(StorageCategory::Database, &db), (7, 1));
        // 重启后 SQLite 重建的伴生文件必须计入（事项 11c 口径分裂根因修复）。
        write(&base.join("data.db-wal"), &[0u8; 5]);
        write(&base.join("data.db-shm"), &[0u8; 3]);
        assert_eq!(category_usage(StorageCategory::Database, &db), (15, 3));
        // downloads_default 是设置值：恒 0，不遍历用户目录。
        assert_eq!(category_usage(StorageCategory::DownloadsDefault, &base), (0, 0));
        // 目录类保持有界遍历口径（本夹具 3 文件 / 15 字节）。
        assert_eq!(category_usage(StorageCategory::Config, &base), (15, 3));
        // 缺失落点 → (0, 0)。
        assert_eq!(category_usage(StorageCategory::Database, &base.join("missing.db")), (0, 0));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn owned_files_single_file_includes_existing_companions() {
        let base = temp_base("owned-db-companions");
        let db = base.join("data.db");
        write(&db, &[0u8; 7]);
        // 主库无伴生 → 仅主库（与旧行为一致）。
        assert_eq!(owned_files(StorageCategory::Database, &db).unwrap(), vec![db.clone()]);
        // 主库 + 既有伴生 → 全部返回（与 db_files/复制同源，事项 11c）。
        write(&base.join("data.db-wal"), &[0u8; 5]);
        write(&base.join("data.db-shm"), &[0u8; 3]);
        let mut files = owned_files(StorageCategory::Database, &db).unwrap();
        files.sort();
        let mut expected = vec![db, base.join("data.db-shm"), base.join("data.db-wal")];
        expected.sort();
        assert_eq!(files, expected);
        // 非自有单文件名 → 不返回（白名单语义保持）。
        let foreign = base.join("foreign.bin");
        write(&foreign, &[0u8; 2]);
        assert!(owned_files(StorageCategory::Database, &foreign).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn preflight_totals_include_existing_db_companions() {
        let base = temp_base("preflight-db-companions");
        let old_root = base.join("old");
        let other_root = base.join("other");
        let from = paths_for(&StorageLocator::default().selection, &old_root.to_string_lossy());
        let db = from.dir(StorageCategory::Database);
        write(&db, &[0u8; 7]);
        let s = db.to_string_lossy().to_string();
        write(&std::path::PathBuf::from(format!("{s}-wal")), &[0u8; 5]);
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(other_root);
        let to = paths_for(&loc.selection, &old_root.to_string_lossy());
        let report = preflight(&from, &to);
        assert!(!report.has_errors(), "issues: {:?}", report.issues);
        // 主库 7 字节 + 既有 wal 5 字节：total 与复制搬移口径一致（事项 11c）。
        assert_eq!(report.total_files, 2);
        assert_eq!(report.total_bytes, 12);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn single_file_category_set_matches_db_file_coverage() {
        // "单文件类"集合必须与 `db_files`/`primary_db_file` 覆盖类一致（文本级同源，
        // Phase 4 R3-L5）：未来新增 DB 类若只改一处，此断言失败。
        let base = temp_base("db-category-consistency");
        let old_root = base.join("old");
        let paths = paths_for(&StorageLocator::default().selection, &old_root.to_string_lossy());
        for category in StorageCategory::ALL {
            assert_eq!(
                is_single_file_category(category),
                primary_db_file(category, &paths).is_some(),
                "single-file set must match db_files coverage for {:?}",
                category
            );
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    use crate::storage::locator::{StorageMode, StorageSelection};

    fn write(path: &std::path::Path, bytes: &[u8]) {
        if let Some(p) = path.parent() {
            std::fs::create_dir_all(p).unwrap();
        }
        std::fs::write(path, bytes).unwrap();
    }

    /// Windows：以 `share_mode(0)` 独占打开源文件，使后续 `std::fs::remove_file`
    /// 报分享冲突（`cleanup_category` 失败）。返回的句柄必须存活到 `run/apply_pending`
    /// 之后。注意 `std::fs::metadata` 走的是 `GetFileAttributesEx`，不受此锁影响，
    /// 因此校验阶段仍可读取尺寸。
    #[cfg(windows)]
    fn lock_exclusive(path: &std::path::Path) -> std::fs::File {
        use std::os::windows::fs::OpenOptionsExt;
        std::fs::OpenOptions::new().read(true).share_mode(0).open(path).unwrap()
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

        let report = run(&old, &newp, false, || Ok(()), |_p| {});
        assert!(report.ok, "run should succeed: {:?}", report.error);
        assert!(report.switched, "successful run must record the pointer switch");
        assert!(report.moved_files >= 2);
        assert!(newp.clipboard_dir.join("images/a.png").exists());
        assert!(!old.clipboard_dir.join("images/a.png").exists(), "source cleaned");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn run_switch_pointer_failure_keeps_source() {
        // A9：指针切换失败（复制 + 校验已通过）时绝不清理源文件。
        let base = std::env::temp_dir().join(format!("adl-mig-switch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let old = paths_for(&StorageSelection::default(), &base.join("old").to_string_lossy());
        let sel = StorageSelection { root: Some(base.join("new")), ..Default::default() };
        let newp = paths_for(&sel, &base.join("old").to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");

        let report = run(&old, &newp, false, || Err(AppError::Storage("boom".into())), |_p| {});
        assert!(!report.ok, "switch failure must fail the run");
        assert!(
            report.error.as_deref().is_some_and(|e| e.contains("boom")),
            "error should surface the switch failure: {:?}",
            report.error
        );
        assert!(
            old.clipboard_dir.join("images/a.png").exists(),
            "source must stay intact when pointer switch fails"
        );
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
        let report = run(&old, &newp, true, || Ok(()), |_p| {});
        assert!(report.ok);
        assert!(report.retained);
        assert!(old.clipboard_dir.join("images/a.png").exists(), "source retained");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Finding 1：指针切换成功后清理失败 → 绝不删除刚复制的新数据，报告 switched=true。
    #[cfg(windows)]
    #[test]
    fn run_cleanup_failure_after_switch_keeps_target_files() {
        let base = temp_base("cleanup-post-switch");
        let old_root = base.join("old");
        let new_root = base.join("new");
        let old = paths_for(&StorageSelection::default(), &old_root.to_string_lossy());
        let sel = StorageSelection { root: Some(new_root.clone()), ..Default::default() };
        let newp = paths_for(&sel, &old_root.to_string_lossy());

        let image = old.clipboard_dir.join("images/a.png");
        write(&image, b"AAAA");
        // 预置等长目标：`copy_one` 幂等跳过（不打开源），因此可以在复制前独占锁定源文件，
        // 让清理阶段（指针切换之后）在删除源文件时报分享冲突。
        write(&newp.clipboard_dir.join("images/a.png"), b"AAAA");
        let lock = lock_exclusive(&image);

        let report = run(&old, &newp, false, || Ok(()), |_p| {});
        assert!(!report.ok, "post-switch cleanup failure must fail the report");
        assert!(report.switched, "pointer switch happened before the cleanup failure");
        assert!(report.error.is_some(), "cleanup error must be surfaced");
        assert!(
            newp.clipboard_dir.join("images/a.png").exists(),
            "freshly-copied target data must NOT be deleted after the pointer switch"
        );

        drop(lock);
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Finding 3：迁移后旧的统一根若已空，则一并删除并记入 removed_dirs。
    #[test]
    fn run_removes_emptied_old_unified_root() {
        let base = temp_base("remove-old-root");
        let old_root = base.join("old");
        let new_root = base.join("new");
        let old = paths_for(&StorageSelection::default(), &old_root.to_string_lossy());
        let sel = StorageSelection { root: Some(new_root), ..Default::default() };
        let newp = paths_for(&sel, &old_root.to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");

        let report = run(&old, &newp, false, || Ok(()), |_p| {});
        assert!(report.ok, "run should succeed: {:?}", report.error);
        assert!(!old_root.exists(), "emptied old unified root must be removed");
        assert!(
            report.removed_dirs.iter().any(|d| d == &old_root),
            "removed_dirs must record the old unified root: {:?}",
            report.removed_dirs
        );
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

        // 用临时 locator 路径落盘，避免污染真实 `%APPDATA%/ai-digital-life/storage-locator.json`。
        let loc_path = base.join("storage-locator.json");
        let report = apply_pending_with(
            &mut loc,
            &defaults(&base.join("old").to_string_lossy()),
            |l| crate::storage::locator::save_locator_to(&loc_path, l),
            |_p| {},
        );
        assert!(report.is_some());
        assert!(loc.pending_migration.is_none(), "pending cleared on success");
        assert!(loc.last_report.is_some());
        // 指针切换在 `run` 内部、清理之前发生，因此 selection 已更新且已落盘。
        assert!(loc_path.exists(), "switched locator must be persisted");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Finding 2：预检失败（目标位于源内部）→ 不复制、不切换、pending 标记失败。
    #[test]
    fn apply_pending_preflight_blocks_target_inside_source() {
        let base = temp_base("apply-preflight-inside");
        let old_root = base.join("old");
        let nested = old_root.join("nested");
        let mut loc = StorageLocator {
            pending_migration: Some(crate::storage::locator::PendingMigration {
                from: StorageSelection::default(),
                to: StorageSelection { root: Some(nested.clone()), ..Default::default() },
                retain_source: false,
                requested_at: 1,
                failed: false,
                error: None,
            }),
            ..Default::default()
        };
        let old = paths_for(&StorageSelection::default(), &old_root.to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");

        let loc_path = base.join("storage-locator.json");
        let report = apply_pending_with(
            &mut loc,
            &defaults(&old_root.to_string_lossy()),
            |l| crate::storage::locator::save_locator_to(&loc_path, l),
            |_p| {},
        )
        .expect("pending must be returned");

        assert!(!report.ok, "preflight failure must fail the report");
        assert!(!report.switched, "preflight failure must not switch the pointer");
        assert!(report.error.is_some(), "preflight issues must be surfaced");
        assert!(
            !nested.join("clipboard/images/a.png").exists(),
            "preflight failure must not copy anything"
        );
        assert!(loc.selection.root.is_none(), "pointer must stay on the old root");
        assert!(old.clipboard_dir.join("images/a.png").exists(), "source must stay intact");
        let pending = loc.pending_migration.as_ref().expect("pending retained on failure");
        assert!(pending.failed, "preflight failure must mark pending failed");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Finding 1(c)：指针落盘后清理失败 → `apply_pending` 仍清除 pending（绝不重复制）。
    #[cfg(windows)]
    #[test]
    fn apply_pending_clears_pending_after_post_switch_cleanup_failure() {
        let base = temp_base("apply-post-switch");
        let old_root = base.join("old");
        let new_root = base.join("new");
        let mut loc = StorageLocator {
            pending_migration: Some(crate::storage::locator::PendingMigration {
                from: StorageSelection::default(),
                to: StorageSelection { root: Some(new_root.clone()), ..Default::default() },
                retain_source: false,
                requested_at: 1,
                failed: false,
                error: None,
            }),
            ..Default::default()
        };
        let old = paths_for(&StorageSelection::default(), &old_root.to_string_lossy());
        let image = old.clipboard_dir.join("images/a.png");
        write(&image, b"AAAA");
        // 等长目标让 `copy_one` 幂等跳过；独占锁定源文件 → 指针切换后的清理失败。
        write(&new_root.join("clipboard/images/a.png"), b"AAAA");
        let lock = lock_exclusive(&image);

        let loc_path = base.join("storage-locator.json");
        let report = apply_pending_with(
            &mut loc,
            &defaults(&old_root.to_string_lossy()),
            |l| crate::storage::locator::save_locator_to(&loc_path, l),
            |_p| {},
        )
        .expect("pending must be returned");

        assert!(!report.ok, "cleanup failure must be reported");
        assert!(report.switched, "pointer switched before the cleanup failure");
        assert!(
            loc.pending_migration.is_none(),
            "pending must be consumed once the pointer is durable (never re-copy)"
        );
        assert_eq!(loc.selection.root.as_deref(), Some(new_root.as_path()), "pointer switched");
        assert!(new_root.join("clipboard/images/a.png").exists(), "target data kept");
        // 落盘的指针必须已切到新根（否则下次启动会以旧源重复制覆盖新数据）。
        let persisted = crate::storage::locator::load_locator_from(&loc_path);
        assert_eq!(persisted.selection.root.as_deref(), Some(new_root.as_path()));

        drop(lock);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn apply_pending_without_pending_is_none() {
        let mut loc = StorageLocator::default();
        let report = apply_pending(&mut loc, &defaults("/adl-nonexistent-noop-apply"), |_p| {});
        assert!(report.is_none());
    }
}
