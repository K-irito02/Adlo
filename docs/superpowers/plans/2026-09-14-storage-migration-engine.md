# 存储路径设置：Plan B —— 迁移引擎与启动钩子 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `MigrationEngine`：按自有文件白名单把旧路径数据复制到新路径、校验、原子切换 `storage-locator.json`、清理旧目录（保留含外部文件的目录），并在下次进程启动、任何 DB/日志句柄打开之前执行待迁移。

**Architecture:** 新增 `adl-kernel::storage::migration` 模块。`StorageLocator.pending_migration` 记录 `from`/`to` 两个 `StorageSelection`；启动时（壳层 `setup()` / adl-server `bin`）在任何 DB 打开前，把两者各自 `resolve` 为 `StoragePaths`，对「路径发生变化的分类」执行「复制 → 校验 → 切换指针 → 清理旧源」，失败则不切换指针、不动源文件。本计划不做 UI 与 IPC（Plan C），迁移触发只能通过写入 locator 或测试直接调用。

**Tech Stack:** Rust stable、`std`（`std::fs`、`walkdir` 若已在 workspace 依赖中，否则手写递归）、`serde_json`、`tracing`、`adl-errors::AppError`。

**Spec:** `docs/superpowers/specs/2026-09-14-storage-path-settings-design.md`

**前置：** Plan A（`docs/superpowers/plans/2026-09-14-storage-foundation-and-wiring.md`）必须先完成。

## Global Constraints

- **只迁移自有文件**：判定唯一依据是 `adl_kernel::storage::owns_file(category, base, path)` / `is_own_dir(category, base, dir)`（base-aware，Task 0 落地）；白名单外的文件不复制、不删除，其父目录保留。
- **源文件只在「复制 + 校验全部通过」之后才删除**；指针切换是清理之前的最后一步。
- **失败即回滚**：任一步失败 → 不切换指针、不删源；best-effort 删除本次新建的目标文件；标记 `pending_migration.failed = true` 并记录错误，不自动重试。
- **幂等**：中断后重跑，目标已存在且大小一致的文件跳过；不把「目标已有我们的文件」当作错误。
- **不新增重依赖到 `adl-kernel`**：磁盘剩余空间的 UX 预检放在 Plan C（壳层用已有 `sysinfo`）。本计划只做无依赖的预检（源=目标、目标在源内部、可写）。
- 每个 Task 结束 `cargo test -p adl-kernel` 必须全绿；最终 `cargo clippy --workspace --all-targets -- -D warnings` 与 `cargo fmt` 干净。

---

## Plan B 重审修订（2026-09-14，执行前；吸收 Plan A 落地经验与最终复核结论）

Plan A 已合并到 `refactor/strip-20260903`。执行前重审发现 Plan B 文本与实际落地接口有 4 处落差，须一并修订：

| # | 落差 | 影响 | 裁决 |
|---|---|---|---|
| A1 | Plan A 落地的 `owns_file(category, path)` / `is_own_dir(category, dir)` 按**固定路径窗口**（`["clipboard","images"]`、`["snapshot"]`）判定 | per-category 自定义根（如 `E:/clip/images/a.png`、`E:/snap/<hash>/f`）会被误判为**外部文件** → 迁移漏文件、清理不删目录 | **必须修**：白名单改为 **base-aware**（按相对 base 的结构判定），签名加 `base` 参数，见 Task 0 |
| A2 | 凭据回退白名单接受任意 `*.enc` | 用户自放的 `backup.enc` 会被迁移/删除，宽于 spec §5.2 | **必须修**：收紧为 `<service>.<account>.enc` 形态，见 Task 0 |
| A3 | `save_locator_to` 为直写，非原子 | Plan B 会写 locator；崩溃/断电可能撕裂 `storage-locator.json` → 应用回退默认目录 | **必须修**：tmp + rename 原子写，见 Task 0 |
| A4 | `ServerState.data_dir`（= `--data-dir`）与 `storage.paths().root`（locator 驱动）可分叉 | 独立运行 adl-server 且 locator 指定 `root=X` 时，会 `create_dir_all(Y)` 而 DB 开在 X | **必须修**：`init_server_state` 以 `storage.paths().root` 为唯一根（`data_dir` 收敛），见 Task 4 追加步骤 |
| A5 | `category_roots` 无直接单测（Plan A 复核 carry-forward） | 迁移枚举的起点无保护 | Task 0 补测试 |
| A6 | Task 1 落地后 `preflight` 里 `src == dst` 分支不可达（`plan_categories` 已保证不相等）；且其单测用 `/old`、`/other`、`/new` 在 Windows 上解析为盘根路径、测试会创建 `E:\old` 等目录 | 死代码 + 测试污染盘根 | Task 2 顺带清理：删除死分支；把 Task 1 遗留的盘根测试路径改为 `std::env::temp_dir()` 基目录 |
| A7 | Plan A `paths.rs` 把 Database/DownloadsDb/SiteMetaDb 的 per-category 覆盖当作**文件路径**（`overridden(Database)` 直接赋给 `data_db`），与其它分类（覆盖=目录）不一致；Task 2 `single_files` 又用 `paths.root.join(name)` 忽略覆盖 | per-category DB 迁移目标错误；与 Plan C「选目录」UI 冲突 | **必须修**：统一为「覆盖 = 目录」。`paths.rs` 改为 `overridden(Database).map(\|d\| d.join("data.db")).unwrap_or(root.join("data.db"))`（三者同理）；`migration.rs` 用 `primary_db_file`/`db_files` 由 `paths.dir(category)` 派生主文件与 `-wal`/`-shm` 后缀；copy/verify/cleanup 一律用 `db_files` |
| — | 裸 adl-server 启动出现瞬时 `r2d2: database is locked`（非致命，Plan A Task 8 观察到） | 与本计划无关（无 locator 时也出现） | **仅记录**，不在本计划修复；若 Task 4 后复现且与迁移相关再处理 |

> Task 1/2/3 中所有 `owns_file(category, path)` / `is_own_dir(category, dir)` 调用在本修订后一律改为 base-aware 形式；下方对应片段已同步更新。

---

### Task 0: 白名单 base-aware 化 + 凭据形态收紧 + 原子写 locator

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/whitelist.rs`
- Modify: `ai-digital-life/crates/kernel/src/storage/locator.rs`

**Interfaces:**
- Produces:
  - `pub fn owns_file(category: StorageCategory, base: &Path, path: &Path) -> bool`
  - `pub fn is_own_dir(category: StorageCategory, base: &Path, dir: &Path) -> bool`
  - `pub fn category_roots(category: StorageCategory, paths: &StoragePaths) -> Vec<PathBuf>`（不变）
  - `save_locator_to` 改为原子写（签名不变）

- [ ] **Step 1: 改写白名单测试（base-aware + 凭据形态 + category_roots）**

替换 `crates/kernel/src/storage/whitelist.rs` 的整个 `tests` 模块内容为：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::locator::StorageLocator;
    use crate::storage::paths::{StorageDefaults, StoragePaths};
    use std::path::Path;

    /// 统一模式默认根下的解析结果（base 与今日布局一致）。
    fn default_paths() -> StoragePaths {
        let defaults = StorageDefaults {
            root: std::path::PathBuf::from("/d"),
            credentials_dir: std::path::PathBuf::from("/c/creds"),
            downloads_dir: std::path::PathBuf::from("/dl"),
        };
        StoragePaths::from_locator(&StorageLocator::default(), &defaults)
    }

    #[test]
    fn database_owns_db_and_wal_shm_only() {
        let p = default_paths();
        let base = &p.root;
        assert!(owns_file(StorageCategory::Database, base, Path::new("/d/data.db")));
        assert!(owns_file(StorageCategory::Database, base, Path::new("/d/data.db-wal")));
        assert!(owns_file(StorageCategory::Database, base, Path::new("/d/data.db-shm")));
        assert!(!owns_file(StorageCategory::Database, base, Path::new("/d/other.db")));
        assert!(!owns_file(StorageCategory::Database, base, Path::new("/d/user-note.txt")));
    }

    #[test]
    fn clipboard_owns_images_and_thumbs_subtrees_under_any_base() {
        let p = default_paths();
        assert!(owns_file(
            StorageCategory::Clipboard,
            &p.clipboard_dir,
            Path::new("/d/clipboard/images/a.png")
        ));
        assert!(owns_file(
            StorageCategory::Clipboard,
            &p.clipboard_dir,
            Path::new("/d/clipboard/thumbs/a.png")
        ));
        assert!(!owns_file(
            StorageCategory::Clipboard,
            &p.clipboard_dir,
            Path::new("/d/clipboard/user.txt")
        ));
        assert!(!owns_file(
            StorageCategory::Clipboard,
            &p.clipboard_dir,
            Path::new("/d/clipboard/other/a.png")
        ));
        // A1 关键用例：per-category 自定义根
        assert!(owns_file(
            StorageCategory::Clipboard,
            Path::new("E:/clip"),
            Path::new("E:/clip/images/a.png")
        ));
        assert!(!owns_file(
            StorageCategory::Clipboard,
            Path::new("E:/clip"),
            Path::new("E:/clip/user.txt")
        ));
    }

    #[test]
    fn snapshot_requires_hash_subdir_under_any_base() {
        let p = default_paths();
        assert!(owns_file(
            StorageCategory::Snapshot,
            &p.snapshot_dir,
            Path::new("/d/snapshot/abc123/f/x.ts")
        ));
        assert!(!owns_file(
            StorageCategory::Snapshot,
            &p.snapshot_dir,
            Path::new("/d/snapshot/loose.txt")
        ));
        assert!(is_own_dir(StorageCategory::Snapshot, &p.snapshot_dir, Path::new("/d/snapshot/abc123")));
        assert!(!is_own_dir(StorageCategory::Snapshot, &p.snapshot_dir, Path::new("/d/snapshot")));
        assert!(owns_file(
            StorageCategory::Snapshot,
            Path::new("E:/snap"),
            Path::new("E:/snap/abc/f.ts")
        ));
        assert!(is_own_dir(StorageCategory::Snapshot, Path::new("E:/snap"), Path::new("E:/snap/abc")));
    }

    #[test]
    fn dsh_owns_everything_under_its_two_bases() {
        let p = default_paths();
        assert!(owns_file(
            StorageCategory::Dsh,
            &p.dsh_versions_dir,
            &p.dsh_versions_dir.join("v1/x.bin")
        ));
        assert!(owns_file(
            StorageCategory::Dsh,
            &p.dsh_bundle_dir,
            &p.dsh_bundle_dir.join("version.txt")
        ));
        assert!(is_own_dir(StorageCategory::Dsh, &p.dsh_versions_dir, Path::new("/d/dsh-versions/v1")));
    }

    #[test]
    fn logs_owns_known_log_file_names() {
        let p = default_paths();
        assert!(owns_file(StorageCategory::Logs, &p.logs_dir, Path::new("/d/logs/terminal-logs.txt")));
        assert!(owns_file(StorageCategory::Logs, &p.logs_dir, Path::new("/d/logs/debug-logs-2026.txt")));
        assert!(!owns_file(StorageCategory::Logs, &p.logs_dir, Path::new("/d/logs/notes.txt")));
    }

    #[test]
    fn credentials_owns_only_service_account_enc_shape() {
        let base = Path::new("/c/creds");
        assert!(owns_file(
            StorageCategory::CredentialsFallback,
            base,
            Path::new("/c/creds/ai-digital-life.ci-access-token.enc")
        ));
        // A2：宽泛的 *.enc 不再算自有。
        assert!(!owns_file(StorageCategory::CredentialsFallback, base, Path::new("/c/creds/backup.enc")));
        assert!(!owns_file(StorageCategory::CredentialsFallback, base, Path::new("/c/creds/plain.txt")));
        assert!(!owns_file(StorageCategory::CredentialsFallback, base, Path::new("/c/creds/a..enc")));
    }

    #[test]
    fn downloads_default_owns_nothing() {
        let p = default_paths();
        assert!(!owns_file(
            StorageCategory::DownloadsDefault,
            &p.downloads_default_dir,
            Path::new("/dl/a.zip")
        ));
        assert!(!is_own_dir(StorageCategory::DownloadsDefault, &p.downloads_default_dir, Path::new("/dl")));
    }

    #[test]
    fn files_outside_base_are_never_owned() {
        assert!(!owns_file(
            StorageCategory::Clipboard,
            Path::new("E:/clip"),
            Path::new("/d/clipboard/images/a.png")
        ));
        assert!(!is_own_dir(StorageCategory::Snapshot, Path::new("E:/snap"), Path::new("/d/snapshot/abc")));
    }

    #[test]
    fn category_roots_covers_each_category_once() {
        let p = default_paths();
        assert_eq!(category_roots(StorageCategory::Database, &p), vec![p.root.clone()]);
        assert_eq!(category_roots(StorageCategory::Config, &p), vec![p.config_dir.clone()]);
        assert_eq!(category_roots(StorageCategory::Clipboard, &p), vec![p.clipboard_dir.clone()]);
        assert_eq!(category_roots(StorageCategory::Snapshot, &p), vec![p.snapshot_dir.clone()]);
        assert_eq!(
            category_roots(StorageCategory::Dsh, &p),
            vec![p.dsh_versions_dir.clone(), p.dsh_bundle_dir.clone()]
        );
        assert_eq!(category_roots(StorageCategory::Logs, &p), vec![p.logs_dir.clone()]);
        assert_eq!(
            category_roots(StorageCategory::CredentialsFallback, &p),
            vec![p.credentials_dir.clone()]
        );
        assert!(category_roots(StorageCategory::DownloadsDefault, &p).is_empty());
        for c in [StorageCategory::Database, StorageCategory::DownloadsDb, StorageCategory::SiteMetaDb] {
            assert_eq!(category_roots(c, &p), vec![p.root.clone()]);
        }
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-kernel storage::whitelist -v`
Expected: FAIL（签名不匹配 / 新断言失败）

- [ ] **Step 3: 实现 base-aware 白名单**

用以下内容替换 `whitelist.rs` 中 `owns_file` 与 `is_own_dir` 的函数体（保留 `parts` 与 `category_roots`；`contains_window`/`window_index` 若不再被引用则删除，避免 clippy `dead_code`）：

```rust
/// 判断 `path` 是否属于 `category`。
///
/// `base` 是该分类在**当前解析结果**中的基目录（来自 `category_roots`）。判定基于
/// `path` 相对 `base` 的结构，因此对 per-category 自定义根同样成立。
/// `path` 不在 `base` 之下时一律判否。
pub fn owns_file(category: StorageCategory, base: &Path, path: &Path) -> bool {
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    let rel: Vec<String> = match path.strip_prefix(base) {
        Ok(r) => parts(r),
        Err(_) => return false,
    };
    match category {
        StorageCategory::Database => matches!(name, "data.db" | "data.db-wal" | "data.db-shm"),
        StorageCategory::DownloadsDb => {
            matches!(name, "downloads.db" | "downloads.db-wal" | "downloads.db-shm")
        },
        StorageCategory::SiteMetaDb => matches!(
            name,
            "site-meta-cache.db" | "site-meta-cache.db-wal" | "site-meta-cache.db-shm"
        ),
        // config 基目录下所有文件均属自有。
        StorageCategory::Config => !rel.is_empty(),
        // `<base>/images/**` 或 `<base>/thumbs/**`
        StorageCategory::Clipboard => {
            matches!(rel.first().map(String::as_str), Some("images") | Some("thumbs"))
        },
        // `<base>/<hash>/...`：文件必须在 hash 子目录之下。
        StorageCategory::Snapshot => rel.len() >= 2,
        // base 本身即 dsh-versions 或 dsh-bundle 目录。
        StorageCategory::Dsh => !rel.is_empty(),
        StorageCategory::Logs => name.starts_with("terminal-logs") || name.starts_with("debug-logs"),
        // 仅 `<service>.<account>.enc` 形态（两段非空且以 .enc 结尾），非任意 *.enc。
        StorageCategory::CredentialsFallback => {
            name.ends_with(".enc")
                && name.split('.').count() == 3
                && name.split('.').all(|seg| !seg.is_empty())
        },
        StorageCategory::DownloadsDefault => false,
    }
}

/// 判断 `dir` 是否是该分类允许的**自有目录**（用于清理时能否 `remove_dir`）。
pub fn is_own_dir(category: StorageCategory, base: &Path, dir: &Path) -> bool {
    let rel: Vec<String> = match dir.strip_prefix(base) {
        Ok(r) => parts(r),
        Err(_) => return false,
    };
    match category {
        StorageCategory::Config => true,
        StorageCategory::Clipboard => {
            matches!(rel.first().map(String::as_str), Some("images") | Some("thumbs"))
        },
        StorageCategory::Snapshot => !rel.is_empty(),
        StorageCategory::Dsh => !rel.is_empty(),
        StorageCategory::Logs => rel.is_empty(),
        // 主库/下载库/站点元库直接位于共享根，凭据目录由 OS 配置目录承载，均不视为可删自有目录。
        StorageCategory::Database
        | StorageCategory::DownloadsDb
        | StorageCategory::SiteMetaDb
        | StorageCategory::CredentialsFallback
        | StorageCategory::DownloadsDefault => false,
    }
}
```

- [ ] **Step 4: 运行白名单测试确认通过**

Run: `cargo test -p adl-kernel storage::whitelist -v`
Expected: PASS（9 个测试全绿）

- [ ] **Step 5: 原子写 locator（A3）**

在 `crates/kernel/src/storage/locator.rs` 中，把 `save_locator_to` 改为 tmp + rename：

```rust
pub fn save_locator_to(path: &Path, loc: &StorageLocator) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(loc)?;
    // 原子写：先写同目录临时文件，再 rename 覆盖，避免崩溃时撕裂指针文件。
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
```

- [ ] **Step 6: 运行 locator 测试确认通过**

Run: `cargo test -p adl-kernel storage::locator -v`
Expected: PASS（原子写不改变可观察行为）

- [ ] **Step 7: 全 kernel 测试与质量门**

Run: `cargo test -p adl-kernel storage -v && cargo clippy -p adl-kernel --all-targets -- -D warnings && cargo fmt --check -p adl-kernel`
Expected: PASS / 0 warning / 无 diff

- [ ] **Step 8: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage
git commit -m "fix(storage): make whitelist base-aware and locator writes atomic"
```

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
  - `pub fn run(from: &StoragePaths, to: &StoragePaths, retain_source: bool, switch_pointer: impl FnOnce() -> Result<(), AppError>, progress: impl FnMut(MigrationProgress)) -> MigrationReport`
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

> **依赖（已裁决）**：在 `crates/kernel/Cargo.toml` 的 `[dependencies]` 加入 `rusqlite.workspace = true`（workspace 根声明为 `{ version = "0.39", features = ["bundled", "serde_json"] }`；`adl-storage` 已启用 `bundled`，feature 统一后不产生额外构建成本）。直接使用 `rusqlite` 实现 `quick_check`，不新增 kernel→adl-storage 依赖边。

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

**Task 3 附加修正（controller 裁决 A8，必须一并完成）**

1. **`category_roots` 对 DB 分类改为取父目录**（A7 的收尾）：`crates/kernel/src/storage/whitelist.rs` 中 `Database`/`DownloadsDb`/`SiteMetaDb` 三支由 `vec![paths.root.clone()]` 改为 `vec![paths.dir(category).parent().map(Path::to_path_buf).unwrap_or_else(|| paths.root.clone())]`（统一模式下仍等于 `root`，per-category 下为覆盖目录）。同步更新 `category_roots_covers_each_category_once` 断言（统一模式断言不变）。
2. **`cleanup_category` 必须用 `db_files`**：Task 2 已把单文件类改为 `db_files(category, paths) -> Vec<PathBuf>`（`primary_db_file` + `-wal`/`-shm`）。Task 3 的 `cleanup_category` 单文件分支不得再引用已删除的 `single_files`。

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/migration.rs`
- Modify: `ai-digital-life/crates/kernel/src/storage/mod.rs`

**Interfaces:**
- Consumes: Task 1/2
- Produces:
  - `pub fn cleanup_category(category: StorageCategory, from: &StoragePaths) -> Result<(Vec<PathBuf>, Vec<KeptDir>), AppError>` — (已删目录, 保留目录及外部文件)
  - `pub fn run(from: &StoragePaths, to: &StoragePaths, retain_source: bool, switch_pointer: impl FnOnce() -> Result<(), AppError>, progress: impl FnMut(MigrationProgress)) -> MigrationReport`
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
        // 单文件类：必须是真实 SQLite —— verify_category 会跑 PRAGMA quick_check。
        rusqlite::Connection::open(&old.data_db).unwrap().execute_batch("CREATE TABLE t(x);").unwrap();

        let report = run(&old, &newp, false, || Ok(()), |_p| {});
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
        let report = run(&old, &newp, true, || Ok(()), |_p| {});
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

        let report = apply_pending(&mut loc, &defaults(&base.join("old").to_string_lossy()), |_p| {});
        assert!(report.is_some());
        assert!(loc.pending_migration.is_none(), "pending cleared on success");
        assert!(loc.last_report.is_some());
        let _ = std::fs::remove_dir_all(&base);
    }
```

> 注意：上面的测试已按「源根 `<base>/old`、目标根 `<base>/new`」写好（避免触发根级包含预检）。若你的 `paths_for`/`defaults` helper 命名与 Task 1 落地不一致，按实际名称调整，语义不变。

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
        // A7/A8：单文件类统一走 db_files（覆盖感知）。
        db_files(category, from)
    } else {
        dir_pairs(category, from, from).into_iter().map(|(d, _)| d).collect()
    };

    for root in roots {
        // 单文件类：直接删文件。
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
            if dir == root {
                continue;
            }
            if !is_own_dir(category, &root, &dir) {
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

/// 执行一次完整迁移。顺序严格为「复制 + 校验 → 切换指针 → 清理旧源」，以满足全局约束
/// 「源文件只在复制+校验全部通过之后才删除；指针切换是清理之前的最后一步」。
///
/// `switch_pointer` 由调用方提供（`apply_pending` 传入「更新 locator.selection 并持久化」）。
/// 它失败时立即回滚（best-effort 删除本次新建的目标文件），**不清理源**。失败时也绝不删除源文件。
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

    // 2) 切换指针（必须在清理之前；失败则不清理源）。
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

/// 失败路径：不删源；best-effort 删除本次新建的目标文件。
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
/// 失败则保留 pending 并标记 failed，不切换指针。
pub fn apply_pending(
    locator: &mut StorageLocator,
    defaults: &StorageDefaults,
    mut progress: impl FnMut(MigrationProgress),
) -> Option<MigrationReport> {
    let pending = locator.pending_migration.clone()?;
    let from = StoragePaths::resolve(&pending.from, defaults);
    let to = StoragePaths::resolve(&pending.to, defaults);
    let target = pending.to.clone();

    // 指针切换回调：复制+校验通过后、清理之前执行。持久化失败即回滚（不清理源）。
    let report = run(
        &from,
        &to,
        pending.retain_source,
        || {
            locator.selection = target.clone();
            save_locator(locator)
        },
        &mut progress,
    );
    if report.ok {
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

- [ ] **Step 4b: 单根收敛（A4，adl-server）**

迁移会改变 locator 的根，因此 `init_server_state` 必须以 `storage.paths().root` 为**唯一**根，避免 `data_dir`（`--data-dir`）与 locator 分叉时 `create_dir_all(dir)` 建错目录。

在 `crates/server/src/engine.rs` 的 `init_server_state` 开头（`data_dir` 参数解析处）：

```rust
pub async fn init_server_state(
    data_dir: &Path,
    storage: std::sync::Arc<adl_kernel::storage::StorageService>,
) -> Result<ServerState, AppError> {
    // 收敛为 locator 驱动的唯一根；`--data-dir` 仅作为解析默认根时的输入。
    let data_dir: &Path = &storage.paths().root;
    std::fs::create_dir_all(data_dir).ok();
    ...
```

并在同文件 `ServerState { ... }` 字面量处，把 `data_dir: data_dir.to_path_buf()` 保留（此时即 `storage.paths().root`）。`bin/adl-server.rs` 中 `--data-dir` 的 `create_dir_all` 可保留（解析默认根前的兜底），但引擎内的创建以收敛后的根为准。

新增断言测试（放入 `storage_tests` 模块）：

```rust
    #[test]
    fn storage_root_is_the_canonical_data_dir() {
        let root = std::path::PathBuf::from("/canon");
        let svc = storage_from_locator(&adl_kernel::storage::StorageLocator::default(), &root);
        assert_eq!(svc.paths().root, root);
    }
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
- §5.2 白名单 → 全部复用 base-aware `owns_file`/`is_own_dir`（Task 0 改造）✅
- 重审修订 A1–A5（base-aware / 凭据形态 / 原子写 / 单根收敛 / category_roots 测试）→ Task 0 与 Task 4 Step 4b ✅
- §9 提示（预检失败/成功/失败/保留）→ 引擎产出 `PreflightReport`/`MigrationReport`；文案与渲染在 Plan C ✅
- §11 测试 → Task 1-4 单测 + Task 5 手工验证 ✅
- §7.3 磁盘空间预检 → 明确移到 Plan C（壳层用 `sysinfo`），本计划以复制失败触发回滚兜底 ✅

**2. Placeholder scan:** 无 TBD/TODO；`Copying` 进度的 `done/total` 未精确计数的取舍已显式标注并给出补法。

**3. Type consistency:** `copy_category`/`verify_category`/`cleanup_category`/`run`/`apply_pending` 的签名在 Task 2/3/4 中一致；`MigrationReport`/`KeptDir`/`PendingMigration`（含新增 `failed`/`error`）在 Plan A 定义、本计划扩展并复用；`summarize_migration` 在 Task 4 两次引用一致。

**已知取舍与风险：**
- `quick_check` 需要 kernel 依赖 `rusqlite`（或在 `adl-storage` 暴露包装）。Task 2 给出了两种选择与判定依据，执行时择轻者。
- 根目录级「已删目录」的判定：`cleanup_category` 对**根目录本身**仅在完全为空时删除；根目录若含其它分类文件（统一根下 `data.db` 与 `clipboard/` 同级），不会被误删（因为不为空）。逐分类清理后，统一根通常在最后一类清空时才被移除 —— 这是安全的，但执行时需在手工验证中确认不会过早删除仍被其它分类使用的根。
- 本计划不处理「迁移到系统盘」的警告与磁盘空间 UX 预检（Plan C）。
