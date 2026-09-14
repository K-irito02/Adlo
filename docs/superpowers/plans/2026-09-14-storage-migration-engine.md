# 存储路径设置：Plan B —— 迁移引擎与启动钩子 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `MigrationEngine`：按自有文件白名单把旧路径数据复制到新路径、校验、原子切换 `storage-locator.json`、清理旧目录（保留含外部文件的目录），并在下次进程启动、任何 DB/日志句柄打开之前执行待迁移。

**Architecture:** 新增 `adl-kernel::storage::migration` 模块。`StorageLocator.pending_migration` 记录 `from`/`to` 两个 `StorageSelection`；启动时（壳层 `setup()` / adl-server `bin`）在任何 DB 打开前，把两者各自 `resolve` 为 `StoragePaths`，对「路径发生变化的分类」执行「复制 → 校验 → 切换指针 → 清理旧源」，失败则不切换指针、不动源文件。本计划不做 UI 与 IPC（Plan C），迁移触发只能通过写入 locator 或测试直接调用。

**Tech Stack:** Rust stable、`std`（`std::fs`、`walkdir` 若已在 workspace 依赖中，否则手写递归）、`serde_json`、`tracing`、`adl-errors::AppError`。

**Spec:** `docs/superpowers/specs/2026-09-14-storage-path-settings-design.md`

**前置：** Plan A（`docs/superpowers/plans/2026-09-14-storage-foundation-and-wiring.md`）必须先完成。

## Global Constraints

- **只迁移自有文件**：判定唯一依据是 Plan A 的 `adl_kernel::storage::owns_file` / `is_own_dir`；白名单外的文件不复制、不删除，其父目录保留。
- **源文件只在「复制 + 校验全部通过」之后才删除**；指针切换是清理之前的最后一步。
- **失败即回滚**：任一步失败 → 不切换指针、不删源；best-effort 删除本次新建的目标文件；标记 `pending_migration.failed = true` 并记录错误，不自动重试。
- **幂等**：中断后重跑，目标已存在且大小一致的文件跳过；不把「目标已有我们的文件」当作错误。
- **不新增重依赖到 `adl-kernel`**：磁盘剩余空间的 UX 预检放在 Plan C（壳层用已有 `sysinfo`）。本计划只做无依赖的预检（源=目标、目标在源内部、可写）。
- 每个 Task 结束 `cargo test -p adl-kernel` 必须全绿；最终 `cargo clippy --workspace --all-targets -- -D warnings` 与 `cargo fmt` 干净。

---

### Task 1: 扩展 PendingMigration + 迁移进度/预检类型

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/locator.rs`
- Create: `ai-digital-life/crates/kernel/src/storage/migration.rs`
- Modify: `ai-digital-life/crates/kernel/src/storage/mod.rs`

**Interfaces:**
- Consumes: Plan A 的 `StorageCategory`、`StorageSelection`、`StoragePaths`、`StorageDefaults`
- Produces:
  - `PendingMigration` 新增 `#[serde(default)] pub failed: bool` 与 `#[serde(default, skip_serializing_if = "Option::is_none")] pub error: Option<String>`
  - `pub enum Severity { Error, Warning }`
  - `pub struct PreflightIssue { pub severity: Severity, pub category: Option<StorageCategory>, pub message: String }`
  - `pub struct PreflightReport { pub issues: Vec<PreflightIssue>, pub total_files: usize, pub total_bytes: u64 }`，`impl PreflightReport { pub fn has_errors(&self) -> bool }`
  - `pub struct ForeignScan { pub category: StorageCategory, pub root: PathBuf, pub foreign_files: Vec<String> }`
  - `pub enum MigrationProgress { Category { category: StorageCategory, index: usize, total: usize }, Copying { category: StorageCategory, file: String, done: usize, total: usize }, Verifying { category: StorageCategory }, Cleaning { category: StorageCategory }, Done }`
  - `pub fn plan_categories(from: &StoragePaths, to: &StoragePaths) -> Vec<StorageCategory>`
  - `pub fn scan_foreign(paths: &StoragePaths) -> Vec<ForeignScan>`
  - `pub fn preflight(from: &StoragePaths, to: &StoragePaths) -> PreflightReport`
  - `pub fn run(from: &StoragePaths, to: &StoragePaths, retain_source: bool, progress: impl FnMut(MigrationProgress)) -> MigrationReport`
  - `pub fn apply_pending(locator: &mut StorageLocator, defaults: &StorageDefaults, progress: impl FnMut(MigrationProgress)) -> Option<MigrationReport>`

- [ ] **Step 1: 写失败测试（分类差异与预检）**

创建 `ai-digital-life/crates/kernel/src/storage/migration.rs`，仅含测试模块：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::locator::{StorageLocator, StorageMode};
    use crate::storage::paths::{StorageDefaults, StoragePaths};
    use std::path::PathBuf;

    fn defaults(root: &str) -> StorageDefaults {
        StorageDefaults {
            root: PathBuf::from(root),
            credentials_dir: PathBuf::from("/creds"),
            downloads_dir: PathBuf::from("/dl"),
        }
    }

    fn paths_for(selection: &crate::storage::locator::StorageSelection, root: &str) -> StoragePaths {
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
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-kernel storage::migration -v`
Expected: FAIL（`plan_categories`/`preflight` 未定义）

- [ ] **Step 3: 扩展 `PendingMigration`（`locator.rs`）**

在 `PendingMigration` 结构体的 `requested_at` 之后追加两个字段：

```rust
    /// 上次执行失败；不自动重试，等待用户在设置中「重试」或「取消」。
    #[serde(default)]
    pub failed: bool,
    /// 上次失败原因（`failed == true` 时存在）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
```

- [ ] **Step 4: 实现类型与 `plan_categories` / `scan_foreign` / `preflight`**

在 `migration.rs` 的测试模块前插入：

```rust
//! 存储迁移引擎：复制 → 校验 → 切换指针 → 清理旧源。
//!
//! 调度收敛于「下次进程启动、任何 DB/日志句柄打开之前」执行，因此不存在
//! 持有 SQLite 句柄时搬文件的问题。

use super::category::StorageCategory;
use super::locator::{MigrationReport, StorageLocator};
use super::paths::{StorageDefaults, StoragePaths};
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
    StorageCategory::ALL
        .into_iter()
        .filter(|c| from.dir(*c) != to.dir(*c))
        .collect()
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
                .filter(|f| !owns_file(category, f))
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
        return if owns_file(category, base) { vec![base.to_path_buf()] } else { Vec::new() };
    }
    collect_files(base).into_iter().filter(|f| owns_file(category, f)).collect()
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
```

在 `crates/kernel/src/storage/mod.rs` 追加：

```rust
pub mod migration;

pub use migration::{
    apply_pending, plan_categories, preflight, run, scan_foreign, ForeignScan, MigrationProgress,
    PreflightIssue, PreflightReport, Severity,
};
```

> `apply_pending` 与 `run` 在 Task 2/3 实现；本 Task 先实现 `mod.rs` 中除这两个外的导出，Task 2/3 再补。为避免中间态编译失败，**本 Task 的 `mod.rs` 只导出已实现项**：

```rust
pub mod migration;

pub use migration::{
    plan_categories, preflight, scan_foreign, ForeignScan, MigrationProgress, PreflightIssue,
    PreflightReport, Severity,
};
```

（`apply_pending`/`run` 的导出在 Task 2/3 追加。）

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage::migration -v`
Expected: PASS（4 个测试全绿）

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage
git commit -m "feat(storage): add migration preflight, foreign scan and progress types"
```

---

### Task 2: 复制与校验（幂等）

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/migration.rs`
- Modify: `ai-digital-life/crates/kernel/src/storage/mod.rs`

**Interfaces:**
- Consumes: Task 1 的 `plan_categories`/`owned_files`/`MigrationProgress`
- Produces:
  - `pub fn copy_category(category: StorageCategory, from: &StoragePaths, to: &StoragePaths, progress: &mut dyn FnMut(MigrationProgress)) -> Result<Vec<(PathBuf, u64)>, AppError>` — 返回 (新路径, 字节数)
  - `pub fn verify_category(category: StorageCategory, from: &StoragePaths, to: &StoragePaths) -> Result<(), AppError>` — 数量/大小一致；SQLite 类附加 `PRAGMA quick_check`

> 设计：**文件→文件** 直接映射（`database`/`downloads_db`/`site_meta_db` 的 `data.db` 等）；**目录→目录** 保留相对路径（`config`/`clipboard`/`snapshot`/`dsh`/`logs`/`credentials_fallback`）。

- [ ] **Step 1: 写失败测试**

在 `migration.rs` 的 `tests` 模块内追加：

```rust
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
        let mut new_sel = StorageSelection::default();
        new_sel.root = Some(base.join("new"));
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
        assert!(!newp.clipboard_dir.join("user-note.txt").exists(), "foreign file must not be copied");

        // 幂等：再跑一次不报错。
        copy_category(StorageCategory::Clipboard, &old, &newp, &mut noop).unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn verify_detects_size_mismatch() {
        let base = std::env::temp_dir().join(format!("adl-mig-verify-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let old = paths_for(&StorageSelection::default(), &base.join("old").to_string_lossy());
        let mut new_sel = StorageSelection::default();
        new_sel.root = Some(base.join("new"));
        let newp = paths_for(&new_sel, &base.join("old").to_string_lossy());

        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");
        let mut noop = |_p: MigrationProgress| {};
        copy_category(StorageCategory::Clipboard, &old, &newp, &mut noop).unwrap();
        // 篡改目标大小 → 校验必须失败。
        std::fs::write(newp.clipboard_dir.join("images/a.png"), b"A").unwrap();
        assert!(verify_category(StorageCategory::Clipboard, &old, &newp).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-kernel storage::migration -v`
Expected: FAIL（`copy_category`/`verify_category` 未定义）

- [ ] **Step 3: 实现**

在 `migration.rs` 中实现（测试模块之前）追加：

```rust
use adl_errors::AppError;

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
fn dir_pairs(category: StorageCategory, from: &StoragePaths, to: &StoragePaths) -> Vec<(PathBuf, PathBuf)> {
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
            let name = src_root_file.file_name().unwrap();
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
            let name = src.file_name().unwrap();
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
```

> **依赖**：`adl-kernel` 需已在 Task 1 或本 Task 加入 `rusqlite.workspace = true`（用于 `quick_check`）。确认 workspace 根 `Cargo.toml` 的 `[workspace.dependencies]` 含 `rusqlite`；若为带 feature 的声明（如 `rusqlite = { version = "...", features = ["bundled"] }`），在 `crates/kernel/Cargo.toml` 用 `rusqlite.workspace = true` 继承。若该继承会引入 `bundled` 重编译，可改为在 `adl-storage` 暴露 `pub fn quick_check(path: &Path) -> Result<(), AppError>` 并让 kernel 调用 `adl-storage`（kernel 目前不依赖 adl-storage；二选一，择更轻者）。

在 `mod.rs` 追加导出：

```rust
pub use migration::{copy_category, verify_category};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage::migration -v`
Expected: PASS（6 个测试全绿）

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage ai-digital-life/crates/kernel/Cargo.toml
git commit -m "feat(storage): add idempotent copy and verification for migration"
```

---

### Task 3: 清理旧源 + 编排 `run` / `apply_pending`

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/migration.rs`
- Modify: `ai-digital-life/crates/kernel/src/storage/mod.rs`

**Interfaces:**
- Consumes: Task 1/2
- Produces:
  - `pub fn cleanup_category(category: StorageCategory, from: &StoragePaths) -> Result<(Vec<PathBuf>, Vec<KeptDir>), AppError>` — (已删目录, 保留目录及外部文件)
  - `pub fn run(from: &StoragePaths, to: &StoragePaths, retain_source: bool, progress: impl FnMut(MigrationProgress)) -> MigrationReport`
  - `pub fn apply_pending(locator: &mut StorageLocator, defaults: &StorageDefaults, progress: impl FnMut(MigrationProgress)) -> Option<MigrationReport>`

- [ ] **Step 1: 写失败测试**

在 `tests` 模块追加：

```rust
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
        let mut sel = StorageSelection::default();
        sel.root = Some(base.join("new"));
        let newp = paths_for(&sel, &base.join("old").to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");
        write(&old.data_db, b"not-a-real-sqlite"); // 单文件类：无 wal/shm

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
        let mut sel = StorageSelection::default();
        sel.root = Some(base.join("new"));
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
        // 让源目录有内容，避免空跑歧义。
        let old = paths_for(&StorageSelection::default(), &base.to_string_lossy());
        write(&old.clipboard_dir.join("images/a.png"), b"AAAA");

        let report = apply_pending(&mut loc, &defaults(&base.to_string_lossy()), |_p| {});
        assert!(report.is_some());
        assert!(loc.pending_migration.is_none(), "pending cleared on success");
        assert!(loc.last_report.is_some());
        let _ = std::fs::remove_dir_all(&base);
    }
```

> 注意：`paths_for(&StorageSelection::default(), base)` 的默认根 = `base`，而 `loc.selection.root = base/new` 的目标根在 `base/new` 之内 → 会触发「目标在源内部」预检错误。因此 `apply_pending` 测试里的源根需与目标根分开：把 `defaults` 的默认根设为 `base/old`，并让 `loc.selection.root = base/new`。实现测试时按此修正（`defaults(&format!("{}/old", base.display()))`）。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-kernel storage::migration -v`
Expected: FAIL（`cleanup_category`/`run`/`apply_pending` 未定义）

- [ ] **Step 3: 实现**

在 `migration.rs` 追加（测试模块之前）：

```rust
use super::locator::KeptDir;
use super::whitelist::is_own_dir;
use adl_types::now_ms;

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
        single_files(category, from).into_iter().map(|(f, _)| f).collect()
    } else {
        dir_pairs(category, from, from).into_iter().map(|(d, _)| d).collect()
    };

    for root in roots {
        // 单文件类：直接删文件。
        if root.is_file() {
            if owns_file(category, &root) {
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
            if dir == root {
                continue;
            }
            if !is_own_dir(category, &dir) {
                continue;
            }
            match std::fs::read_dir(&dir) {
                Ok(mut it) if it.next().is_none() => {
                    if std::fs::remove_dir(&dir).is_ok() {
                        removed_dirs.push(dir);
                    }
                },
                _ => {},
            }
        }
        // 根目录本身：若无外部文件且为空则删除；否则记录保留。
        match std::fs::read_dir(&root) {
            Ok(mut it) if it.next().is_none() => {
                if std::fs::remove_dir(&root).is_ok() {
                    removed_dirs.push(root);
                }
            },
            Ok(_) => {
                let foreign: Vec<String> = collect_files(&root)
                    .into_iter()
                    .map(|f| f.to_string_lossy().to_string())
                    .collect();
                if !foreign.is_empty() {
                    kept_dirs.push(KeptDir { path: root, foreign_files: foreign });
                }
            },
            Err(_) => {},
        }
    }

    Ok((removed_dirs, kept_dirs))
}

/// 收集目录及其全部子目录。
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

/// 执行一次完整迁移（不含 locator 持久化）。失败时 best-effort 清理本次新建的目标文件，
/// 且**绝不删除源文件**。
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
            Err(e) => return fail(&mut created, e, from, to),
        };
        for (path, bytes) in &copied {
            moved_files += 1;
            moved_bytes += bytes;
            created.push(path.clone());
        }
        progress(MigrationProgress::Verifying { category: *category });
        if let Err(e) = verify_category(*category, from, to) {
            return fail(&mut created, e, from, to);
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
                Err(e) => return fail(&mut created, e, from, to),
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
fn fail(
    created: &mut [PathBuf],
    error: AppError,
    _from: &StoragePaths,
    _to: &StoragePaths,
) -> MigrationReport {
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
/// 失败则保留 pending 并标记 failed，不切换指针。
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
```

> `Copying` 进度里的 `done`/`total` 在本实现中未填充计数（保持 `copy_category` 签名简单的取舍）；如需精确进度，可在 `copy_category` 内先算 `owned_files().len()` 作为 total 并在循环内递增。若要求精确，按此实现。

在 `mod.rs` 追加导出：

```rust
pub use migration::{apply_pending, cleanup_category, run};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage -v`
Expected: PASS（全部 storage 测试绿）

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage
git commit -m "feat(storage): add migration cleanup, run orchestration and apply_pending"
```

---

### Task 4: 启动钩子（壳层 + adl-server）

**Files:**
- Modify: `ai-digital-life/src-tauri/src/setup.rs`（`resolve_data_dir` 之后新增 `run_startup_migration`）
- Modify: `ai-digital-life/src-tauri/src/main.rs:56-64`
- Modify: `ai-digital-life/crates/server/src/bin/adl-server.rs`

**Interfaces:**
- Consumes: `adl_kernel::storage::{load_locator, save_locator, apply_pending, MigrationProgress}`
- Produces: `pub fn run_startup_migration(defaults: &StorageDefaults) -> Option<MigrationReport>`（壳层与 bin 各一份薄封装；核心逻辑在 kernel）

- [ ] **Step 1: 写失败测试（adl-server 启动迁移日志格式化）**

在 `crates/server/src/engine.rs` 末尾追加：

```rust
#[cfg(test)]
mod startup_migration_tests {
    use super::*;

    #[test]
    fn summarize_migration_reports_success_or_failure() {
        let ok = adl_kernel::storage::MigrationReport {
            at: 1,
            ok: true,
            moved_files: 3,
            moved_bytes: 2048,
            removed_dirs: vec![],
            kept_dirs: vec![],
            retained: false,
            error: None,
        };
        assert!(summarize_migration(&ok).contains("3"));
        let bad = adl_kernel::storage::MigrationReport {
            at: 1,
            ok: false,
            moved_files: 0,
            moved_bytes: 0,
            removed_dirs: vec![],
            kept_dirs: vec![],
            retained: false,
            error: Some("disk full".into()),
        };
        assert!(summarize_migration(&bad).contains("disk full"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-server --lib startup_migration_tests -v`
Expected: FAIL（`summarize_migration` 未定义）

- [ ] **Step 3: 实现 adl-server 启动迁移**

在 `crates/server/src/engine.rs` 新增：

```rust
/// 生成一行人类可读的迁移摘要（日志与报告复用）。
pub fn summarize_migration(report: &adl_kernel::storage::MigrationReport) -> String {
    if report.ok {
        format!(
            "storage migration ok: {} files / {} bytes moved, {} dirs removed, {} dirs kept",
            report.moved_files,
            report.moved_bytes,
            report.removed_dirs.len(),
            report.kept_dirs.len()
        )
    } else {
        format!("storage migration failed: {}", report.error.as_deref().unwrap_or("unknown"))
    }
}

/// 在打开任何 DB/日志句柄之前执行待迁移。返回执行的报告（无待迁移时 None）。
pub fn run_startup_migration(
    defaults: &adl_kernel::storage::StorageDefaults,
) -> Option<adl_kernel::storage::MigrationReport> {
    let mut locator = adl_kernel::storage::load_locator();
    if locator.pending_migration.is_none() {
        return None;
    }
    let report = adl_kernel::storage::apply_pending(&mut locator, defaults, |progress| {
        eprintln!("[adl-server] migration: {progress:?}");
    });
    if let Err(e) = adl_kernel::storage::save_locator(&locator) {
        eprintln!("[adl-server] failed to persist storage locator: {e}");
    }
    if let Some(r) = report.as_ref() {
        eprintln!("[adl-server] {}", summarize_migration(r));
    }
    report
}
```

在 `crates/server/src/bin/adl-server.rs` 中，`storage` 构造之后、`init_server_state` 之前插入：

```rust
    // 迁移必须在任何 DB/日志句柄打开之前完成。
    let defaults = adl_kernel::storage::StorageDefaults {
        root: data_dir.clone(),
        credentials_dir: adl_kernel::storage::locator::locator_dir().join("credentials"),
        downloads_dir: data_dir.clone(),
    };
    let _ = adl_server::engine::run_startup_migration(&defaults);
```

- [ ] **Step 4: 实现壳层启动迁移**

在 `src-tauri/src/setup.rs` 新增：

```rust
/// 壳层启动迁移：在打开任何 DB/日志句柄之前执行待迁移。
pub fn run_startup_migration(
    defaults: &adl_kernel::storage::StorageDefaults,
) -> Option<adl_kernel::storage::MigrationReport> {
    let mut locator = adl_kernel::storage::load_locator();
    if locator.pending_migration.is_none() {
        return None;
    }
    let report = adl_kernel::storage::apply_pending(&mut locator, defaults, |progress| {
        info!(?progress, "storage migration progress");
    });
    if let Err(e) = adl_kernel::storage::save_locator(&locator) {
        tracing::error!(error = %e, "failed to persist storage locator after migration");
    }
    if let Some(r) = report.as_ref() {
        info!(ok = r.ok, files = r.moved_files, "storage migration finished");
    }
    report
}
```

在 `main.rs` 的 `setup` 闭包中，`resolve_defaults` 之后、`load_locator`/`StorageService` 之前插入：

```rust
            // 迁移必须先于任何 DB/日志句柄打开执行。
            let _migration_report = setup::run_startup_migration(&defaults);
```

- [ ] **Step 5: 运行编译与测试**

Run: `cargo test -p adl-kernel storage -v && cargo test -p adl-server --lib && cargo build -p adl-server`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/src-tauri/src ai-digital-life/crates/server/src
git commit -m "feat(storage): run pending migration before opening DBs at startup"
```

---

### Task 5: 手工验证 + 文档

**Files:**
- Modify: `ai-digital-life/AGENTS.md`

- [ ] **Step 1: 手工验证（临时 locator 触发迁移）**

1. 启动应用一次（生成默认目录数据：工作区/剪贴板/日志等）。
2. 找到 locator 路径：`"$env:APPDATA\ai-digital-life\storage-locator.json"`。
3. 手写 `pendingMigration`（等价于 Plan C 的「下次启动迁移」）：

```jsonc
{
  "version": 1,
  "mode": "unified",
  "root": "<新目录绝对路径>",
  "categories": {},
  "pendingMigration": {
    "from": { "mode": "unified", "categories": {} },
    "to": { "mode": "unified", "root": "<新目录绝对路径>", "categories": {} },
    "retainSource": false,
    "requestedAt": 1
  }
}
```

4. 重启应用，确认：
   - 控制台/日志出现 `storage migration ok: ...`；
   - 新目录下出现 `data.db`、`config/`、`clipboard/` 等；
   - 旧目录下自有文件被删除，含外部文件的目录被保留且出现在 `lastReport.keptDirs`；
   - 应用功能正常（工作区、剪贴板、终端历史）。

- [ ] **Step 2: 失败路径验证**

1. 把目标设为一个不可写路径（如只读挂载或受保护目录的父级）。
2. 重启应用，确认：`pendingMigration.failed = true`、`lastReport.error` 有值、**旧目录数据完好**、应用仍以旧路径正常启动。

- [ ] **Step 3: 文档同步**

在 `ai-digital-life/AGENTS.md` 追加小节：迁移在「下次进程启动、DB 打开前」执行；成功切换指针并清理旧源（保留外部文件与所在目录）；失败保留旧路径并记录 `lastReport`，不自动重试。

- [ ] **Step 4: 质量门**

Run:
```
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
Expected: fmt 无 diff、clippy 0 warning、测试全绿。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/AGENTS.md
git commit -m "docs(storage): document startup migration semantics"
```

---

## Self-Review

**1. Spec coverage（对照 spec §7 / §9 / §11）**
- §7.1 单一执行路径（都收敛到启动期）→ Task 4 ✅
- §7.2 时机选择（立即/下次）→ 引擎不区分，Plan C 的 IPC 只写 pending + 触发重启 ✅
- §7.3 算法（预检/复制/校验/切换指针/清理/报告/回滚）→ Task 1-3 ✅
- §7.4 幂等与中断安全 → Task 2 `copy_one`（大小一致跳过）+ Task 3 删除在切换之后 ✅
- §7.5 外部文件处理 → Task 1 `scan_foreign` + Task 3 `cleanup_category`/`kept_dirs` ✅
- §5.2 白名单 → 全部复用 Plan A `owns_file`/`is_own_dir` ✅
- §9 提示（预检失败/成功/失败/保留）→ 引擎产出 `PreflightReport`/`MigrationReport`；文案与渲染在 Plan C ✅
- §11 测试 → Task 1-4 单测 + Task 5 手工验证 ✅
- §7.3 磁盘空间预检 → 明确移到 Plan C（壳层用 `sysinfo`），本计划以复制失败触发回滚兜底 ✅

**2. Placeholder scan:** 无 TBD/TODO；`Copying` 进度的 `done/total` 未精确计数的取舍已显式标注并给出补法。

**3. Type consistency:** `copy_category`/`verify_category`/`cleanup_category`/`run`/`apply_pending` 的签名在 Task 2/3/4 中一致；`MigrationReport`/`KeptDir`/`PendingMigration`（含新增 `failed`/`error`）在 Plan A 定义、本计划扩展并复用；`summarize_migration` 在 Task 4 两次引用一致。

**已知取舍与风险：**
- `quick_check` 需要 kernel 依赖 `rusqlite`（或在 `adl-storage` 暴露包装）。Task 2 给出了两种选择与判定依据，执行时择轻者。
- 根目录级「已删目录」的判定：`cleanup_category` 对**根目录本身**仅在完全为空时删除；根目录若含其它分类文件（统一根下 `data.db` 与 `clipboard/` 同级），不会被误删（因为不为空）。逐分类清理后，统一根通常在最后一类清空时才被移除 —— 这是安全的，但执行时需在手工验证中确认不会过早删除仍被其它分类使用的根。
- 本计划不处理「迁移到系统盘」的警告与磁盘空间 UX 预检（Plan C）。
