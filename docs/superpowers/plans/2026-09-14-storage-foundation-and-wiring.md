# 存储路径设置：Plan A —— StorageService 基础与消费方接入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `adl-kernel` 中建立存储路径的单一解析真源（`StorageService` + `storage-locator.json`），并把壳层与 adl-server 的 12 处数据落点接入该解析，默认行为（统一根 = `app_data_dir`）保持不变。

**Architecture:** 新增 `adl-kernel::storage` 子模块，包含 `StorageCategory`（10 类）、`StorageMode`（unified/per_category）、`StorageLocator`（持久化于系统配置目录的指针文件）、`StoragePaths`（解析结果）与 `owns_file` 白名单谓词。壳层用 Tauri `app_data_dir()` 作为默认根解析出 `StoragePaths` 并传给 `AppState`；adl-server 用 `--data-dir` 作为默认根、自行加载同一 locator 解析出 `StoragePaths` 传给 `ServerState`。所有原有 `data_dir.join("x")` 改为读取 `StoragePaths` 对应字段。本计划不实现迁移执行（Plan B）与 UI/IPC（Plan C），也不改变任何数据的存储技术。

**Tech Stack:** Rust stable、`serde`/`serde_json`、`dirs` v5（workspace 依赖）、`tracing`、Tauri 2.x、`adl-errors::AppError`。

**Spec:** `docs/superpowers/specs/2026-09-14-storage-path-settings-design.md`

## Global Constraints

- 默认 = 现有行为：`mode=unified` 且 `root=None` 时，路径与当前完全一致（`<app_data_dir>/data.db` 等）。
- **只移动位置，不改技术方案**：SQLite 仍 SQLite、文件仍文件、加密仍加密。
- 未发布产品禁止版本兼容代码：本计划不写任何「读取旧格式」的分支。
- 不新增硬编码中文文案到 UI；本计划不涉及 UI。
- 新增 Rust 公开 API 必须有同文件 `#[cfg(test)]` 单测；每个 Task 结束必须 `cargo test` 通过。
- 质量门：`cargo clippy --workspace --all-targets -- -D warnings` 与 `cargo fmt` 必须干净。
- `storage-locator.json` 是存储路径的唯一真源；它**不**进入 `AppConfig`。
- 路径字符串一律用 `PathBuf`/`Path`，禁止拼字符串。

---

### Task 1: 存储分类与配置类型

**Files:**
- Create: `ai-digital-life/crates/kernel/src/storage/category.rs`
- Create: `ai-digital-life/crates/kernel/src/storage/locator.rs`
- Create: `ai-digital-life/crates/kernel/src/storage/mod.rs`
- Modify: `ai-digital-life/crates/kernel/src/lib.rs:1-4`
- Modify: `ai-digital-life/crates/kernel/Cargo.toml:9-23`

**Interfaces:**
- Consumes: `adl_errors::AppError`（已有）
- Produces:
  - `pub enum StorageCategory { Database, DownloadsDb, SiteMetaDb, Config, Clipboard, Snapshot, Dsh, Logs, CredentialsFallback, DownloadsDefault }`，`StorageCategory::ALL: [StorageCategory; 10]`，`fn key(self) -> &'static str`
  - `pub enum StorageMode { Unified, PerCategory }`
  - `pub struct StorageSelection { pub mode: StorageMode, pub root: Option<PathBuf>, pub categories: BTreeMap<StorageCategory, PathBuf> }`（`Default` = Unified/None/空）
  - `pub struct PendingMigration { pub from: StorageSelection, pub to: StorageSelection, pub retain_source: bool, pub requested_at: i64 }`
  - `pub struct KeptDir { pub path: PathBuf, pub foreign_files: Vec<String> }`
  - `pub struct MigrationReport { pub at: i64, pub ok: bool, pub moved_files: usize, pub moved_bytes: u64, pub removed_dirs: Vec<PathBuf>, pub kept_dirs: Vec<KeptDir>, pub retained: bool, pub error: Option<String> }`
  - `pub struct StorageLocator { pub version: u32, pub selection: StorageSelection, pub pending_migration: Option<PendingMigration>, pub last_report: Option<MigrationReport> }`（`Default` = version 1 + 默认 selection）

- [ ] **Step 1: 加 `dirs` 依赖**

在 `ai-digital-life/crates/kernel/Cargo.toml` 的 `[dependencies]` 段（第 9-23 行）追加一行：

```toml
dirs.workspace = true
```

（workspace 根 `Cargo.toml` 已有 `dirs = "5"`。）

- [ ] **Step 2: 写失败测试 `crates/kernel/src/storage/category.rs`**

```rust
//! 存储分类：应用数据的 10 个可配置落点。

use serde::{Deserialize, Serialize};

/// 应用数据的逻辑分类。每个分类对应一个可独立配置（per_category 模式）的落点。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageCategory {
    Database,
    DownloadsDb,
    SiteMetaDb,
    Config,
    Clipboard,
    Snapshot,
    Dsh,
    Logs,
    CredentialsFallback,
    DownloadsDefault,
}

impl StorageCategory {
    /// 全部 10 类，UI 展开顺序与此一致。
    pub const ALL: [StorageCategory; 10] = [
        StorageCategory::Database,
        StorageCategory::DownloadsDb,
        StorageCategory::SiteMetaDb,
        StorageCategory::Config,
        StorageCategory::Clipboard,
        StorageCategory::Snapshot,
        StorageCategory::Dsh,
        StorageCategory::Logs,
        StorageCategory::CredentialsFallback,
        StorageCategory::DownloadsDefault,
    ];

    /// 稳定序列化键（用于 `storage-locator.json` 的 categories 映射与 IPC）。
    pub fn key(self) -> &'static str {
        match self {
            StorageCategory::Database => "database",
            StorageCategory::DownloadsDb => "downloads_db",
            StorageCategory::SiteMetaDb => "site_meta_db",
            StorageCategory::Config => "config",
            StorageCategory::Clipboard => "clipboard",
            StorageCategory::Snapshot => "snapshot",
            StorageCategory::Dsh => "dsh",
            StorageCategory::Logs => "logs",
            StorageCategory::CredentialsFallback => "credentials_fallback",
            StorageCategory::DownloadsDefault => "downloads_default",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_covers_every_variant_once() {
        let mut keys: Vec<&str> = StorageCategory::ALL.iter().map(|c| c.key()).collect();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), 10, "ALL must contain 10 distinct categories");
    }

    #[test]
    fn category_serializes_to_snake_case_string() {
        let json = serde_json::to_string(&StorageCategory::CredentialsFallback).unwrap();
        assert_eq!(json, "\"credentials_fallback\"");
    }

    #[test]
    fn category_round_trips_and_works_as_map_key() {
        let mut map = std::collections::BTreeMap::new();
        map.insert(StorageCategory::Dsh, "/tmp/dsh".to_string());
        let json = serde_json::to_string(&map).unwrap();
        assert_eq!(json, "{\"dsh\":\"/tmp/dsh\"}");
        let back: std::collections::BTreeMap<StorageCategory, String> =
            serde_json::from_str(&json).unwrap();
        assert_eq!(back.get(&StorageCategory::Dsh).map(String::as_str), Some("/tmp/dsh"));
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cargo test -p adl-kernel storage::category -v`
Expected: FAIL（`storage` 模块与文件尚不存在，编译错误）

- [ ] **Step 4: 写 `crates/kernel/src/storage/locator.rs`**

```rust
//! 存储位置指针文件（`storage-locator.json`）的类型定义。
//!
//! 该文件是整个存储路径能力的唯一真源。它**不含业务数据**，只有路径指针，
//! 且固定位于系统配置目录（见 `path()`），因此永远不会随用户数据一起迁移 ——
//! 这避免了「把根路径存进 `<root>/config/config.json`」的循环依赖。

use super::category::StorageCategory;
use std::collections::BTreeMap;
use std::path::PathBuf;

/// `storage-locator.json` 的版本号。
pub const LOCATOR_VERSION: u32 = 1;

/// 统一的「模式 + 根目录 + 每类覆盖」选择，同时用于当前值与待迁移的目标值。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSelection {
    pub mode: StorageMode,
    /// unified 模式下的自定义根目录；`None` = 使用平台默认（`app_data_dir`）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub root: Option<PathBuf>,
    /// per_category 模式下的逐类覆盖；缺省键回退到 unified 规则。
    #[serde(default)]
    pub categories: BTreeMap<StorageCategory, PathBuf>,
}

impl Default for StorageSelection {
    fn default() -> Self {
        Self { mode: StorageMode::Unified, root: None, categories: BTreeMap::new() }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageMode {
    Unified,
    PerCategory,
}

/// 已登记但尚未执行的迁移（真正的迁移发生在下次进程启动、DB 打开之前）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMigration {
    pub from: StorageSelection,
    pub to: StorageSelection,
    /// true = 迁移成功后保留旧路径数据（不删除）。
    #[serde(default)]
    pub retain_source: bool,
    pub requested_at: i64,
}

/// 迁移清理阶段因含外部文件而被保留的旧目录。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptDir {
    pub path: PathBuf,
    pub foreign_files: Vec<String>,
}

/// 最近一次迁移的报告（成功或失败）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub at: i64,
    pub ok: bool,
    pub moved_files: usize,
    pub moved_bytes: u64,
    pub removed_dirs: Vec<PathBuf>,
    pub kept_dirs: Vec<KeptDir>,
    #[serde(default)]
    pub retained: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// `storage-locator.json` 的完整结构。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocator {
    pub version: u32,
    #[serde(flatten)]
    pub selection: StorageSelection,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_migration: Option<PendingMigration>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_report: Option<MigrationReport>,
}

impl Default for StorageLocator {
    fn default() -> Self {
        Self {
            version: LOCATOR_VERSION,
            selection: StorageSelection::default(),
            pending_migration: None,
            last_report: None,
        }
    }
}
```

> 注意：`locator.rs` 顶部需要 `use serde::{Deserialize, Serialize};`（示例省略了这行 import，实现时必须加上）。

- [ ] **Step 5: 写 `crates/kernel/src/storage/mod.rs` 并注册模块**

```rust
//! 存储路径解析：把「用户选择的存储位置」解析为各类数据的绝对路径。
//!
//! - `category`：10 个可配置分类
//! - `locator`：`storage-locator.json` 类型与读写
//! - `paths`：解析结果 `StoragePaths`
//! - `whitelist`：自有文件白名单（迁移与清理的唯一依据）

pub mod category;
pub mod locator;
pub mod paths;
pub mod whitelist;

pub use category::StorageCategory;
pub use locator::{
    KeptDir, LOCATOR_VERSION, MigrationReport, PendingMigration, StorageLocator, StorageMode,
    StorageSelection,
};
pub use paths::{StorageDefaults, StoragePaths, StorageService};
```

（Plan A 需同时创建 `paths.rs` 与 `whitelist.rs` —— 见 Task 3 与 Task 4；若按任务顺序执行，本步先创建空的 `paths.rs`/`whitelist.rs` 占位并注释掉对应 `pub mod`/`pub use`，在 Task 3/4 中启用。更简单的做法：Task 1 只声明 `category` 与 `locator` 两个模块，Task 3/4 再在 `mod.rs` 追加。）

因此 **Task 1 的 `mod.rs` 实际内容**为：

```rust
pub mod category;
pub mod locator;

pub use category::StorageCategory;
pub use locator::{
    KeptDir, LOCATOR_VERSION, MigrationReport, PendingMigration, StorageLocator, StorageMode,
    StorageSelection,
};
```

并在 `crates/kernel/src/lib.rs` 追加一行：

```rust
pub mod storage;
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage -v`
Expected: PASS（3 个 category 测试全绿）

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/crates/kernel/Cargo.toml ai-digital-life/crates/kernel/src/lib.rs ai-digital-life/crates/kernel/src/storage
git commit -m "feat(storage): add storage category and locator types"
```

---

### Task 2: locator 路径解析与读写

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/locator.rs`

**Interfaces:**
- Consumes: Task 1 的 `StorageLocator`
- Produces:
  - `pub const APP_CONFIG_SUBDIR: &str = "ai-digital-life"`
  - `pub const LOCATOR_FILE: &str = "storage-locator.json"`
  - `pub fn locator_dir() -> PathBuf`
  - `pub fn locator_path() -> PathBuf`
  - `pub fn load_locator() -> StorageLocator`
  - `pub fn load_locator_from(path: &Path) -> StorageLocator`
  - `pub fn save_locator(loc: &StorageLocator) -> Result<(), AppError>`
  - `pub fn save_locator_to(path: &Path, loc: &StorageLocator) -> Result<(), AppError>`

- [ ] **Step 1: 写失败测试**

在 `crates/kernel/src/storage/locator.rs` 末尾追加：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn temp_locator(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("adl-locator-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join(LOCATOR_FILE)
    }

    #[test]
    fn missing_file_loads_as_default_unified() {
        let p = temp_locator("missing");
        let loc = load_locator_from(&p);
        assert_eq!(loc.version, LOCATOR_VERSION);
        assert_eq!(loc.selection.mode, StorageMode::Unified);
        assert!(loc.selection.root.is_none());
        assert!(loc.selection.categories.is_empty());
        assert!(loc.pending_migration.is_none());
    }

    #[test]
    fn save_then_load_round_trips_per_category_selection() {
        let p = temp_locator("roundtrip");
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::PerCategory;
        loc.selection.root = Some(std::path::PathBuf::from(r"D:\adl-data"));
        loc.selection
            .categories
            .insert(StorageCategory::Clipboard, std::path::PathBuf::from(r"E:\adl\clip"));
        save_locator_to(&p, &loc).unwrap();
        let back = load_locator_from(&p);
        assert_eq!(back, loc);
    }

    #[test]
    fn corrupted_file_falls_back_to_default() {
        let p = temp_locator("corrupt");
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "{ not json").unwrap();
        let loc = load_locator_from(&p);
        assert_eq!(loc.selection.mode, StorageMode::Unified);
    }

    #[test]
    fn save_creates_parent_dirs() {
        let p = temp_locator("mkdir");
        save_locator_to(&p, &StorageLocator::default()).unwrap();
        assert!(p.exists());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-kernel storage::locator -v`
Expected: FAIL（`load_locator_from`/`save_locator_to`/`LOCATOR_FILE` 未定义）

- [ ] **Step 3: 实现**

在 `crates/kernel/src/storage/locator.rs` 的 `use` 段补充：

```rust
use adl_errors::AppError;
use std::path::{Path, PathBuf};
```

（保留 Task 1 已有的 `serde`、`BTreeMap`、`PathBuf`、`StorageCategory` import —— 合并去重。）

在 `StorageLocator` 的 `impl`/定义之后追加：

```rust
/// 系统配置目录下的应用子目录（与 `crates/credential` 的 `ai-digital-life` 命名保持一致）。
pub const APP_CONFIG_SUBDIR: &str = "ai-digital-life";
/// 指针文件名。
pub const LOCATOR_FILE: &str = "storage-locator.json";

/// 系统配置目录下的应用配置目录。`dirs::config_dir()` 在
/// Windows = `%APPDATA%`、macOS = `~/Library/Application Support`、Linux = `~/.config`。
/// 壳层与 adl-server 共用此函数，保证两者解析到同一个 locator。
pub fn locator_dir() -> PathBuf {
    dirs::config_dir().unwrap_or_else(|| PathBuf::from(".")).join(APP_CONFIG_SUBDIR)
}

/// 指针文件的绝对路径。
pub fn locator_path() -> PathBuf {
    locator_dir().join(LOCATOR_FILE)
}

/// 读取指针文件；缺失或损坏时返回默认（unified 默认根），绝不报错阻塞启动。
pub fn load_locator() -> StorageLocator {
    load_locator_from(&locator_path())
}

/// 从指定路径读取指针文件（测试用注入点）。
pub fn load_locator_from(path: &Path) -> StorageLocator {
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => StorageLocator::default(),
    }
}

/// 写入指针文件（原子替换语义由调用方在需要时加锁保证；此处为直写）。
pub fn save_locator(loc: &StorageLocator) -> Result<(), AppError> {
    save_locator_to(&locator_path(), loc)
}

/// 写入指定路径（测试用注入点）。
pub fn save_locator_to(path: &Path, loc: &StorageLocator) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(loc)?;
    std::fs::write(path, content)?;
    Ok(())
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage::locator -v`
Expected: PASS（4 个测试全绿）

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage/locator.rs
git commit -m "feat(storage): add locator path resolution and load/save"
```

---

### Task 3: StoragePaths 解析规则

**Files:**
- Create: `ai-digital-life/crates/kernel/src/storage/paths.rs`
- Modify: `ai-digital-life/crates/kernel/src/storage/mod.rs`

**Interfaces:**
- Consumes: `StorageSelection`、`StorageCategory`（Task 1）、`StorageLocator`（Task 1/2）
- Produces:
  - `pub struct StorageDefaults { pub root: PathBuf, pub credentials_dir: PathBuf, pub downloads_dir: PathBuf }`
  - `pub struct StoragePaths { pub root: PathBuf, pub data_db: PathBuf, pub downloads_db: PathBuf, pub site_meta_db: PathBuf, pub config_dir: PathBuf, pub clipboard_dir: PathBuf, pub snapshot_dir: PathBuf, pub dsh_versions_dir: PathBuf, pub dsh_bundle_dir: PathBuf, pub logs_dir: PathBuf, pub credentials_dir: PathBuf, pub downloads_default_dir: PathBuf }`
  - `impl StoragePaths { pub fn dir(&self, c: StorageCategory) -> PathBuf; pub fn resolve(selection: &StorageSelection, defaults: &StorageDefaults) -> Self; pub fn from_locator(loc: &StorageLocator, defaults: &StorageDefaults) -> Self }`
  - `pub struct StorageService { paths: StoragePaths, selection: StorageSelection }`，`impl StorageService { pub fn from_locator(loc: &StorageLocator, defaults: &StorageDefaults) -> Self; pub fn paths(&self) -> &StoragePaths; pub fn selection(&self) -> &StorageSelection }`

- [ ] **Step 1: 写失败测试**

创建 `crates/kernel/src/storage/paths.rs`：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::locator::{StorageMode, StorageLocator};
    use std::path::PathBuf;

    fn defaults() -> StorageDefaults {
        StorageDefaults {
            root: PathBuf::from("/default/root"),
            credentials_dir: PathBuf::from("/default/creds"),
            downloads_dir: PathBuf::from("/default/downloads"),
        }
    }

    #[test]
    fn unified_default_root_matches_current_layout() {
        let loc = StorageLocator::default();
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.root, PathBuf::from("/default/root"));
        assert_eq!(p.data_db, PathBuf::from("/default/root/data.db"));
        assert_eq!(p.downloads_db, PathBuf::from("/default/root/downloads.db"));
        assert_eq!(p.site_meta_db, PathBuf::from("/default/root/site-meta-cache.db"));
        assert_eq!(p.config_dir, PathBuf::from("/default/root/config"));
        assert_eq!(p.clipboard_dir, PathBuf::from("/default/root/clipboard"));
        assert_eq!(p.snapshot_dir, PathBuf::from("/default/root/snapshot"));
        assert_eq!(p.dsh_versions_dir, PathBuf::from("/default/root/dsh-versions"));
        assert_eq!(p.dsh_bundle_dir, PathBuf::from("/default/root/dsh-bundle"));
        assert_eq!(p.logs_dir, PathBuf::from("/default/root/logs"));
        assert_eq!(p.credentials_dir, PathBuf::from("/default/creds"));
        assert_eq!(p.downloads_default_dir, PathBuf::from("/default/downloads"));
    }

    #[test]
    fn unified_custom_root_relocates_all_but_os_defaults() {
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(PathBuf::from("D:/adl"));
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.root, PathBuf::from("D:/adl"));
        assert_eq!(p.data_db, PathBuf::from("D:/adl/data.db"));
        assert_eq!(p.logs_dir, PathBuf::from("D:/adl/logs"));
        // 未独立覆盖时，凭据回退与默认下载目录保持其平台默认。
        assert_eq!(p.credentials_dir, PathBuf::from("/default/creds"));
        assert_eq!(p.downloads_default_dir, PathBuf::from("/default/downloads"));
    }

    #[test]
    fn per_category_override_wins_over_unified_root() {
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::PerCategory;
        loc.selection.root = Some(PathBuf::from("D:/adl"));
        loc.selection.categories.insert(StorageCategory::Clipboard, PathBuf::from("E:/clip"));
        loc.selection.categories.insert(StorageCategory::CredentialsFallback, PathBuf::from("E:/creds"));
        loc.selection.categories.insert(StorageCategory::DownloadsDefault, PathBuf::from("E:/dl"));
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.clipboard_dir, PathBuf::from("E:/clip"));
        assert_eq!(p.credentials_dir, PathBuf::from("E:/creds"));
        assert_eq!(p.downloads_default_dir, PathBuf::from("E:/dl"));
        // 未覆盖的类仍用 unified 根。
        assert_eq!(p.data_db, PathBuf::from("D:/adl/data.db"));
    }

    #[test]
    fn per_category_ignored_in_unified_mode() {
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::Unified;
        loc.selection.categories.insert(StorageCategory::Clipboard, PathBuf::from("E:/clip"));
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.clipboard_dir, PathBuf::from("/default/root/clipboard"));
    }

    #[test]
    fn dir_accessor_maps_every_category() {
        let p = StoragePaths::from_locator(&StorageLocator::default(), &defaults());
        for c in StorageCategory::ALL {
            let d = p.dir(c);
            assert!(d.is_absolute() || d.starts_with("/default"), "{:?} -> {:?}", c, d);
        }
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-kernel storage::paths -v`
Expected: FAIL（`StoragePaths` 未定义）

- [ ] **Step 3: 实现**

在 `crates/kernel/src/storage/paths.rs` 的测试模块**之前**插入：

```rust
//! 存储路径解析结果与解析规则。

use super::category::StorageCategory;
use super::locator::{StorageLocator, StorageMode, StorageSelection};
use std::path::PathBuf;

/// 平台相关的默认位置（由调用方提供，因为壳层用 Tauri `app_data_dir()`，
/// 而 adl-server 用 `--data-dir`，两者无法在 kernel 内自行取得同一个值）。
#[derive(Debug, Clone)]
pub struct StorageDefaults {
    /// 默认数据根（壳层 = `app_data_dir()`；adl-server = `--data-dir`）。
    pub root: PathBuf,
    /// 凭据回退文件目录的默认位置（`dirs::config_dir()/ai-digital-life/credentials`）。
    pub credentials_dir: PathBuf,
    /// 默认下载目标目录（由 `adl_browser::get_default_download_path()` 给出的启发式值）。
    pub downloads_dir: PathBuf,
}

/// 解析后的各分类绝对路径。壳层与 adl-server 各持一份。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoragePaths {
    pub root: PathBuf,
    pub data_db: PathBuf,
    pub downloads_db: PathBuf,
    pub site_meta_db: PathBuf,
    pub config_dir: PathBuf,
    pub clipboard_dir: PathBuf,
    pub snapshot_dir: PathBuf,
    pub dsh_versions_dir: PathBuf,
    pub dsh_bundle_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub credentials_dir: PathBuf,
    pub downloads_default_dir: PathBuf,
}

impl StoragePaths {
    /// 按分类取路径（供按分类迭代的调用方使用）。
    pub fn dir(&self, category: StorageCategory) -> PathBuf {
        match category {
            StorageCategory::Database => self.data_db.clone(),
            StorageCategory::DownloadsDb => self.downloads_db.clone(),
            StorageCategory::SiteMetaDb => self.site_meta_db.clone(),
            StorageCategory::Config => self.config_dir.clone(),
            StorageCategory::Clipboard => self.clipboard_dir.clone(),
            StorageCategory::Snapshot => self.snapshot_dir.clone(),
            StorageCategory::Dsh => self.dsh_versions_dir.clone(),
            StorageCategory::Logs => self.logs_dir.clone(),
            StorageCategory::CredentialsFallback => self.credentials_dir.clone(),
            StorageCategory::DownloadsDefault => self.downloads_default_dir.clone(),
        }
    }

    /// 由 locator 解析出全部路径。
    ///
    /// 规则：先取 unified 根（`selection.root` 或 `defaults.root`），逐字段按该根拼接；
    /// 仅当 `mode == PerCategory` 时，`categories` 中的覆盖才生效（凭据回退与默认下载
    /// 目录的「未覆盖」值是平台默认，而非根下子路径）。
    pub fn from_locator(loc: &StorageLocator, defaults: &StorageDefaults) -> Self {
        Self::resolve(&loc.selection, defaults)
    }

    pub fn resolve(selection: &StorageSelection, defaults: &StorageDefaults) -> Self {
        let root = selection.root.clone().unwrap_or_else(|| defaults.root.clone());
        let per_category = selection.mode == StorageMode::PerCategory;

        let overridden = |c: StorageCategory| -> Option<PathBuf> {
            if per_category { selection.categories.get(&c).cloned() } else { None }
        };

        Self {
            data_db: overridden(StorageCategory::Database).unwrap_or_else(|| root.join("data.db")),
            downloads_db: overridden(StorageCategory::DownloadsDb)
                .unwrap_or_else(|| root.join("downloads.db")),
            site_meta_db: overridden(StorageCategory::SiteMetaDb)
                .unwrap_or_else(|| root.join("site-meta-cache.db")),
            config_dir: overridden(StorageCategory::Config).unwrap_or_else(|| root.join("config")),
            clipboard_dir: overridden(StorageCategory::Clipboard)
                .unwrap_or_else(|| root.join("clipboard")),
            snapshot_dir: overridden(StorageCategory::Snapshot)
                .unwrap_or_else(|| root.join("snapshot")),
            dsh_versions_dir: overridden(StorageCategory::Dsh)
                .unwrap_or_else(|| root.join("dsh-versions")),
            dsh_bundle_dir: overridden(StorageCategory::Dsh)
                .unwrap_or_else(|| root.join("dsh-bundle")),
            logs_dir: overridden(StorageCategory::Logs).unwrap_or_else(|| root.join("logs")),
            credentials_dir: overridden(StorageCategory::CredentialsFallback)
                .unwrap_or_else(|| defaults.credentials_dir.clone()),
            downloads_default_dir: overridden(StorageCategory::DownloadsDefault)
                .unwrap_or_else(|| defaults.downloads_dir.clone()),
            root,
        }
    }
}

/// 持有解析结果与来源 selection 的服务对象，注入 `AppState` / `ServerState`。
#[derive(Debug, Clone)]
pub struct StorageService {
    paths: StoragePaths,
    selection: StorageSelection,
}

impl StorageService {
    pub fn from_locator(loc: &StorageLocator, defaults: &StorageDefaults) -> Self {
        Self { paths: StoragePaths::from_locator(loc, defaults), selection: loc.selection.clone() }
    }

    pub fn paths(&self) -> &StoragePaths {
        &self.paths
    }

    pub fn selection(&self) -> &StorageSelection {
        &self.selection
    }
}
```

在 `crates/kernel/src/storage/mod.rs` 追加：

```rust
pub mod paths;

pub use paths::{StorageDefaults, StoragePaths, StorageService};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage::paths -v`
Expected: PASS（5 个测试全绿）

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage
git commit -m "feat(storage): resolve storage paths from locator selection"
```

---

### Task 4: 自有文件白名单谓词

**Files:**
- Create: `ai-digital-life/crates/kernel/src/storage/whitelist.rs`
- Modify: `ai-digital-life/crates/kernel/src/storage/mod.rs`

**Interfaces:**
- Consumes: `StorageCategory`、`StoragePaths`
- Produces:
  - `pub fn owns_file(category: StorageCategory, path: &Path) -> bool`
  - `pub fn is_own_dir(category: StorageCategory, dir: &Path) -> bool`
  - `pub fn category_roots(category: StorageCategory, paths: &StoragePaths) -> Vec<PathBuf>`（该分类允许的根目录集合，供迁移枚举）

- [ ] **Step 1: 写失败测试**

创建 `crates/kernel/src/storage/whitelist.rs`（仅测试模块，实现留到 Step 3）：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn database_owns_db_and_wal_shm_only() {
        assert!(owns_file(StorageCategory::Database, Path::new("/d/data.db")));
        assert!(owns_file(StorageCategory::Database, Path::new("/d/data.db-wal")));
        assert!(owns_file(StorageCategory::Database, Path::new("/d/data.db-shm")));
        assert!(!owns_file(StorageCategory::Database, Path::new("/d/other.db")));
        assert!(!owns_file(StorageCategory::Database, Path::new("/d/user-note.txt")));
    }

    #[test]
    fn clipboard_owns_images_and_thumbs_subtrees() {
        assert!(owns_file(StorageCategory::Clipboard, Path::new("/d/clipboard/images/a.png")));
        assert!(owns_file(StorageCategory::Clipboard, Path::new("/d/clipboard/thumbs/a.png")));
        assert!(!owns_file(StorageCategory::Clipboard, Path::new("/d/clipboard/user.txt")));
        assert!(!owns_file(StorageCategory::Clipboard, Path::new("/d/clipboard/other/a.png")));
    }

    #[test]
    fn snapshot_owns_only_hash_subdirs() {
        assert!(owns_file(StorageCategory::Snapshot, Path::new("/d/snapshot/abc123/f/x.ts")));
        assert!(is_own_dir(StorageCategory::Snapshot, Path::new("/d/snapshot/abc123")));
        assert!(!is_own_dir(StorageCategory::Snapshot, Path::new("/d/snapshot")));
    }

    #[test]
    fn logs_owns_known_log_file_names() {
        assert!(owns_file(StorageCategory::Logs, Path::new("/d/logs/terminal-logs.txt")));
        assert!(owns_file(StorageCategory::Logs, Path::new("/d/logs/debug-logs-2026.txt")));
        assert!(!owns_file(StorageCategory::Logs, Path::new("/d/logs/notes.txt")));
    }

    #[test]
    fn credentials_owns_only_enc_files() {
        assert!(owns_file(
            StorageCategory::CredentialsFallback,
            Path::new("/c/ai-digital-life/credentials/ai-digital-life.ci-access-token.enc")
        ));
        assert!(!owns_file(StorageCategory::CredentialsFallback, Path::new("/c/creds/plain.txt")));
    }

    #[test]
    fn downloads_default_owns_nothing() {
        assert!(!owns_file(StorageCategory::DownloadsDefault, Path::new("/d/downloads/a.zip")));
        assert!(!is_own_dir(StorageCategory::DownloadsDefault, Path::new("/d/downloads")));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-kernel storage::whitelist -v`
Expected: FAIL（`owns_file`/`is_own_dir` 未定义）

- [ ] **Step 3: 实现**

在测试模块前插入：

```rust
//! 自有文件白名单：判断某个文件/目录是否属于本应用，是迁移复制与旧目录清理的**唯一依据**。
//!
//! 不在此白名单内的任何文件一律视为「用户外部文件」：不复制、不删除、其父目录不删除。

use super::category::StorageCategory;
use super::paths::StoragePaths;
use std::path::{Component, Path, PathBuf};

/// 把路径拆成普通组件（忽略盘符根、`.`、`..` 与分隔符）。
fn parts(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str().map(str::to_string),
            _ => None,
        })
        .collect()
}

/// `parts` 中是否存在与 `window` 完全一致的**连续**子序列。
fn contains_window(parts: &[String], window: &[&str]) -> bool {
    window_index(parts, window).is_some()
}

/// `window` 连续子序列的起始下标（不存在则 `None`）。
fn window_index(parts: &[String], window: &[&str]) -> Option<usize> {
    if window.is_empty() || parts.len() < window.len() {
        return None;
    }
    let w: Vec<String> = window.iter().map(|s| (*s).to_string()).collect();
    parts.windows(w.len()).position(|win| win == w.as_slice())
}

/// 判断 `path` 是否属于 `category`。
pub fn owns_file(category: StorageCategory, path: &Path) -> bool {
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    let p = parts(path);
    match category {
        StorageCategory::Database => matches!(name, "data.db" | "data.db-wal" | "data.db-shm"),
        StorageCategory::DownloadsDb => {
            matches!(name, "downloads.db" | "downloads.db-wal" | "downloads.db-shm")
        },
        StorageCategory::SiteMetaDb => matches!(
            name,
            "site-meta-cache.db" | "site-meta-cache.db-wal" | "site-meta-cache.db-shm"
        ),
        // config 目录整体归本应用所有，其下任何文件均属自有。
        StorageCategory::Config => true,
        StorageCategory::Clipboard => {
            contains_window(&p, &["clipboard", "images"])
                || contains_window(&p, &["clipboard", "thumbs"])
        },
        // 仅 `<snapshot>/<hash>/...` 下的文件属于我们；用户直接丢在 snapshot/ 下的不算。
        StorageCategory::Snapshot => {
            window_index(&p, &["snapshot"]).map(|i| i + 3 <= p.len()).unwrap_or(false)
        },
        StorageCategory::Dsh => {
            contains_window(&p, &["dsh-versions"]) || contains_window(&p, &["dsh-bundle"])
        },
        StorageCategory::Logs => name.starts_with("terminal-logs") || name.starts_with("debug-logs"),
        StorageCategory::CredentialsFallback => {
            path.extension().and_then(|e| e.to_str()) == Some("enc")
        },
        StorageCategory::DownloadsDefault => false,
    }
}

/// 判断 `dir` 是否是该分类允许的**自有目录**（用于决定清理时能否 `remove_dir`）。
pub fn is_own_dir(category: StorageCategory, dir: &Path) -> bool {
    let p = parts(dir);
    let ends_with = |w: &[&str]| -> bool {
        p.len() >= w.len()
            && p[p.len() - w.len()..].iter().map(String::as_str).eq(w.iter().copied())
    };
    match category {
        StorageCategory::Config => true,
        StorageCategory::Clipboard => {
            ends_with(&["clipboard", "images"]) || ends_with(&["clipboard", "thumbs"])
        },
        // snapshot 自身的任意子目录（含更深层）均自有；`snapshot` 目录本身不算。
        StorageCategory::Snapshot => {
            window_index(&p, &["snapshot"]).map(|i| i + 2 <= p.len()).unwrap_or(false)
        },
        StorageCategory::Dsh => ends_with(&["dsh-versions"]) || ends_with(&["dsh-bundle"]),
        StorageCategory::Logs => ends_with(&["logs"]) || ends_with(&[".adl-logs"]),
        // 主库/下载库/站点元库直接位于共享根，凭据目录由 OS 配置目录承载，均不视为可删自有目录。
        StorageCategory::Database
        | StorageCategory::DownloadsDb
        | StorageCategory::SiteMetaDb
        | StorageCategory::CredentialsFallback
        | StorageCategory::DownloadsDefault => false,
    }
}

/// 该分类允许出现的根目录集合（迁移枚举起点）。
pub fn category_roots(category: StorageCategory, paths: &StoragePaths) -> Vec<PathBuf> {
    match category {
        StorageCategory::Database => vec![paths.root.clone()],
        StorageCategory::DownloadsDb => vec![paths.root.clone()],
        StorageCategory::SiteMetaDb => vec![paths.root.clone()],
        StorageCategory::Config => vec![paths.config_dir.clone()],
        StorageCategory::Clipboard => vec![paths.clipboard_dir.clone()],
        StorageCategory::Snapshot => vec![paths.snapshot_dir.clone()],
        StorageCategory::Dsh => vec![paths.dsh_versions_dir.clone(), paths.dsh_bundle_dir.clone()],
        StorageCategory::Logs => vec![paths.logs_dir.clone()],
        StorageCategory::CredentialsFallback => vec![paths.credentials_dir.clone()],
        StorageCategory::DownloadsDefault => Vec::new(),
    }
}
```

在 `crates/kernel/src/storage/mod.rs` 追加：

```rust
pub mod whitelist;

pub use whitelist::{category_roots, is_own_dir, owns_file};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage::whitelist -v`
Expected: PASS（6 个测试全绿）

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage
git commit -m "feat(storage): add own-file whitelist for migration and cleanup"
```

---

### Task 6: 日志目录解析（统一两处不一致 + 开发态覆盖）

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/paths.rs`
- Modify: `ai-digital-life/src-tauri/src/setup.rs:51-53`
- Modify: `ai-digital-life/crates/server/src/engine.rs:16-27`

**Interfaces:**
- Consumes: Task 3 的 `StoragePaths.logs_dir`
- Produces: `pub fn resolve_log_dir(paths: &StoragePaths, project_root: Option<&Path>) -> PathBuf`（新增到 `paths.rs`）

**背景（已核实）：** 当前存在两处不一致日志目录 —— `setup.rs:51-53` 写 `<仓库根>/.adl-logs`（`CARGO_MANIFEST_DIR/../..`），`engine.rs:16-22` 写 `<ai-digital-life>/.adl-logs`（少一层）。本任务统一为 `paths.logs_dir`，并在 debug 构建保留仓库根覆盖，避免破坏现有调试工作流。

- [ ] **Step 1: 写失败测试**

在 `crates/kernel/src/storage/paths.rs` 的 `tests` 模块内追加：

```rust
    #[test]
    fn resolve_log_dir_prefers_project_root_in_debug_override() {
        let p = StoragePaths::from_locator(&StorageLocator::default(), &defaults());
        let project_root = PathBuf::from("/repo");
        assert_eq!(resolve_log_dir(&p, Some(&project_root)), PathBuf::from("/repo/.adl-logs"));
    }

    #[test]
    fn resolve_log_dir_uses_storage_paths_when_no_override() {
        let p = StoragePaths::from_locator(&StorageLocator::default(), &defaults());
        assert_eq!(resolve_log_dir(&p, None), PathBuf::from("/default/root/logs"));
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-kernel storage::paths::tests::resolve_log_dir -v`
Expected: FAIL（`resolve_log_dir` 未定义）

- [ ] **Step 3: 实现**

在 `crates/kernel/src/storage/paths.rs` 的 `StorageService` impl 之后追加：

```rust
/// 解析日志目录。
///
/// - `project_root = Some(p)` 时（开发态覆盖）：写入 `<p>/.adl-logs`，保持既有调试工作流。
/// - `None` 时：使用 `paths.logs_dir`（默认 `<root>/logs`）。
///
/// 覆盖开关由调用方决定：debug 构建传入 `Some(仓库根)`，release 传 `None`。
pub fn resolve_log_dir(paths: &StoragePaths, project_root: Option<&std::path::Path>) -> PathBuf {
    match project_root {
        Some(root) => root.join(".adl-logs"),
        None => paths.logs_dir.clone(),
    }
}
```

在 `paths.rs` 顶部 `use` 段确保有 `use std::path::Path;`。

在 `crates/kernel/src/storage/mod.rs` 追加导出：

```rust
pub use paths::resolve_log_dir;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-kernel storage::paths -v`
Expected: PASS（7 个测试全绿）

- [ ] **Step 5: 壳层改用统一解析（`setup.rs`）**

将 `ai-digital-life/src-tauri/src/setup.rs:51-53`：

```rust
    let project_root = resolve_project_root();
    let log_dir = project_root.join(".adl-logs");
    std::fs::create_dir_all(&log_dir)?;
```

替换为（`init_app_state` 已在 Task 5 接收 `storage`，直接用 `storage.paths()`）：

```rust
    // 开发态（debug）保留写仓库根 .adl-logs，release 使用 <root>/logs。
    let dev_project_root = if cfg!(debug_assertions) { Some(resolve_project_root()) } else { None };
    let log_dir = adl_kernel::storage::resolve_log_dir(storage.paths(), dev_project_root.as_deref());
    std::fs::create_dir_all(&log_dir)?;
```

- [ ] **Step 6: adl-server 改用统一解析（`engine.rs`）**

删除 `ai-digital-life/crates/server/src/engine.rs:16-22` 的 `resolve_log_dir()` 函数，并把第 26-27 行：

```rust
    let log_dir = resolve_log_dir();
    std::fs::create_dir_all(&log_dir).ok();
```

替换为：

```rust
    let dev_project_root = if cfg!(debug_assertions) {
        Some(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .and_then(std::path::Path::parent)
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from(".")),
        )
    } else {
        None
    };
    let log_dir =
        adl_kernel::storage::resolve_log_dir(storage.paths(), dev_project_root.as_deref());
    std::fs::create_dir_all(&log_dir).ok();
```

> `init_server_state` 已在 Task 5 接收 `storage: &StorageService`，本 Task 直接使用；无需临时局部变量，本 Task 可独立编译提交。

- [ ] **Step 7: 运行编译与测试**

Run: `cargo test -p adl-kernel storage -v && cargo build -p adl-server`
Expected: PASS（编译通过、日志测试通过）

- [ ] **Step 8: 提交**

```bash
git add ai-digital-life/crates/kernel/src/storage ai-digital-life/src-tauri/src/setup.rs ai-digital-life/crates/server/src/engine.rs
git commit -m "refactor(storage): unify log dir resolution via StoragePaths"
```

---

### Task 5: 壳层与 adl-server 接入 StorageService

**Files:**
- Modify: `ai-digital-life/src-tauri/src/setup.rs`（`resolve_data_dir`、`init_app_state`、`start_background_tasks`）
- Modify: `ai-digital-life/src-tauri/src/state.rs`（`AppState`）
- Modify: `ai-digital-life/src-tauri/src/main.rs:58-60`
- Modify: `ai-digital-life/src-tauri/src/adl_server.rs:97-113`
- Modify: `ai-digital-life/crates/server/src/bin/adl-server.rs:11-42`
- Modify: `ai-digital-life/crates/server/src/engine.rs`
- Modify: `ai-digital-life/crates/server/src/state.rs`（`ServerState`）

**Interfaces:**
- Consumes: `adl_kernel::storage::{StorageService, StorageDefaults, StoragePaths, load_locator, resolve_log_dir}`
- Produces:
  - `AppState { pub storage: std::sync::Arc<adl_kernel::storage::StorageService>, pub storage_defaults: adl_kernel::storage::StorageDefaults, ... }`（保留 `data_dir: PathBuf` = `storage.paths().root` 以最小化调用点改动；`storage_defaults` 供 Plan C 的预检命令复用同一默认基准）
  - `ServerState { pub storage: std::sync::Arc<adl_kernel::storage::StorageService>, pub data_dir: PathBuf, ... }`
  - `pub fn resolve_defaults(app: &tauri::App) -> anyhow::Result<adl_kernel::storage::StorageDefaults>`

- [ ] **Step 1: 写失败测试（adl-server 存储构造）**

在 `ai-digital-life/crates/server/src/engine.rs` 末尾追加：

```rust
#[cfg(test)]
mod storage_tests {
    use super::*;

    #[test]
    fn storage_from_locator_uses_default_root_for_data_db() {
        let root = std::path::PathBuf::from("/test-root");
        let svc = storage_from_locator(&adl_kernel::storage::StorageLocator::default(), &root);
        assert_eq!(svc.paths().data_db, root.join("data.db"));
        assert_eq!(svc.paths().logs_dir, root.join("logs"));
    }

    #[test]
    fn storage_from_locator_honors_per_category_override() {
        let root = std::path::PathBuf::from("/test-root");
        let mut loc = adl_kernel::storage::StorageLocator::default();
        loc.selection.mode = adl_kernel::storage::StorageMode::PerCategory;
        loc.selection
            .categories
            .insert(adl_kernel::storage::StorageCategory::Clipboard, std::path::PathBuf::from("/clip"));
        let svc = storage_from_locator(&loc, &root);
        assert_eq!(svc.paths().clipboard_dir, std::path::PathBuf::from("/clip"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-server --lib storage_tests -v`
Expected: FAIL（`storage_from_locator` 未定义）

- [ ] **Step 3: 实现 `storage_from_locator` 并接入壳层与 adl-server**

先在 `crates/server/src/engine.rs` 中新增（供 bin 与测试复用）：

```rust
/// 由 locator + 默认根构造存储服务。adl-server 的默认根即 `--data-dir`。
pub fn storage_from_locator(
    locator: &adl_kernel::storage::StorageLocator,
    default_root: &Path,
) -> std::sync::Arc<adl_kernel::storage::StorageService> {
    let defaults = adl_kernel::storage::StorageDefaults {
        root: default_root.to_path_buf(),
        credentials_dir: adl_kernel::storage::locator::locator_dir().join("credentials"),
        // adl-server 不管理默认下载目录；用 root 占位，壳层才提供真实启发式值。
        downloads_dir: default_root.to_path_buf(),
    };
    std::sync::Arc::new(adl_kernel::storage::StorageService::from_locator(locator, &defaults))
}
```

把 `crates/server/src/bin/adl-server.rs` 中 `let state = match init_server_state(...)` 之前改为：

```rust
    let locator = adl_kernel::storage::load_locator();
    let storage = adl_server::engine::storage_from_locator(&locator, &data_dir);

    let state = match init_server_state(&data_dir, storage.clone()).await {
```

（`init_server_state` 的签名与函数体改造、以及壳层接入见下方。）

在 `setup.rs` 中新增：

```rust
/// 构造壳层的存储默认值：默认根 = Tauri `app_data_dir()`；凭据目录与默认下载目录
/// 分别取平台默认与 `adl_browser` 的启发式值。
pub fn resolve_defaults(app: &tauri::App) -> anyhow::Result<adl_kernel::storage::StorageDefaults> {
    let root = app.path().app_data_dir().context("failed to resolve app data dir")?;
    let credentials_dir = adl_kernel::storage::locator::locator_dir().join("credentials");
    let downloads_dir = adl_browser::download_manager::get_default_download_path();
    Ok(adl_kernel::storage::StorageDefaults { root, credentials_dir, downloads_dir })
}
```

把 `resolve_data_dir`（第 21-26 行）替换为：

```rust
/// 解析并创建数据根目录（默认根）。真正的逐类路径由 `StorageService` 给出。
pub fn resolve_data_dir(app: &tauri::App) -> anyhow::Result<PathBuf> {
    let defaults = resolve_defaults(app)?;
    std::fs::create_dir_all(&defaults.root)?;
    info!(root = ?defaults.root, "default data root resolved");
    Ok(defaults.root)
}
```

把 `init_app_state` 签名改为接收 `storage` 与 `defaults`：

```rust
pub fn init_app_state(
    data_dir: PathBuf,
    storage: Arc<adl_kernel::storage::StorageService>,
    defaults: adl_kernel::storage::StorageDefaults,
) -> anyhow::Result<AppState> {
```

并在函数体内把 `adl_config::load(&data_dir)`（第 34 行）改为 `adl_config::load(&storage.paths().root)`。

> `load` 的入参在 Task 7 会被改为「config 目录」。本 Task 先传 `root`，统一模式下与现状**完全等价**；`per_category` 下 `config` 分类的覆盖由 Task 7 兑现（Task 7 将此处改为 `load_from(&storage.paths().config_dir)`）。这样 Task 5、Task 7 可各自独立编译提交。

`init_app_state` 内的三处落点改为 `storage.paths()`：

```rust
    let site_meta_cache = adl_browser::SiteMetaCacheStore::open(&storage.paths().root)
        .map_err(|e| anyhow::anyhow!("failed to open site-meta-cache store: {e}"))?;
    ...
    let download_db_path = storage.paths().downloads_db.clone();
```

并在 `AppState { ... }` 字面量中新增 `storage: storage.clone(), storage_defaults: defaults,`。

`AppState`（`state.rs`）新增字段：

```rust
    /// 解析后的存储路径（唯一真源：`storage-locator.json`）。
    pub storage: Arc<adl_kernel::storage::StorageService>,
    /// 构造 `storage` 时使用的默认基准（供 Plan C 预检命令复用）。
    pub storage_defaults: adl_kernel::storage::StorageDefaults,
```

`main.rs:58-60` 改为：

```rust
            let defaults = setup::resolve_defaults(app)?;
            std::fs::create_dir_all(&defaults.root)?;
            let locator = adl_kernel::storage::load_locator();
            let storage = Arc::new(adl_kernel::storage::StorageService::from_locator(
                &locator, &defaults,
            ));
            let data_dir = storage.paths().root.clone();
            let app_state =
                setup::init_app_state(data_dir.clone(), storage.clone(), defaults.clone())?;
```

（`main.rs` 需 `use std::sync::Arc;`。）

`adl_server.rs` 的 `AdServerHandle::spawn`（第 97 行起）保持传 `data_dir`（= 默认根），adl-server 侧自行加载 locator：

```rust
        cmd.arg("--data-dir").arg(data_dir).arg("--port").arg("0");
```

（无需改动；locator 由子进程读取。）

`crates/server/src/bin/adl-server.rs` 的改动已在 Step 3 给出（调用 `adl_server::engine::storage_from_locator`），此处不重复。

`engine.rs` 的 `init_server_state` 签名改为：

```rust
pub async fn init_server_state(
    data_dir: &Path,
    storage: std::sync::Arc<adl_kernel::storage::StorageService>,
) -> Result<ServerState, AppError> {
```

并把 `let db_path = data_dir.join("data.db");` 改为 `let db_path = storage.paths().data_db.clone();`，`adl_config::load(data_dir)` 改为 `adl_config::load(&storage.paths().root)`（Task 7 改为 `config_dir`），`ClipboardStore::new(db.clone(), data_dir)` 改为 `ClipboardStore::new(db.clone(), &storage.paths().clipboard_dir)`，`data_dir: data_dir.to_path_buf()` 改为 `data_dir: data_dir.to_path_buf(), storage: storage.clone(),`。

`crates/server/src/state.rs` 的 `ServerState` 新增：

```rust
    pub storage: std::sync::Arc<adl_kernel::storage::StorageService>,
```

**测试构造点**：`crates/server/src/test_util.rs` 的 `test_server_state` 若直接构造 `ServerState`，需补 `storage` 字段。构造方式：

```rust
    let root = data_dir.to_path_buf();
    let defaults = adl_kernel::storage::StorageDefaults {
        root: root.clone(),
        credentials_dir: root.join("credentials"),
        downloads_dir: root.clone(),
    };
    let storage = std::sync::Arc::new(adl_kernel::storage::StorageService::from_locator(
        &adl_kernel::storage::StorageLocator::default(),
        &defaults,
    ));
```

（先运行 `rg -n "ServerState \{" crates/server/src crates/server/tests` 找出全部构造点并逐一补字段。）

- [ ] **Step 4: 运行编译与测试**

Run: `cargo build -p adl-server && cargo test -p adl-kernel storage -v && cargo test -p adl-server --lib`
Expected: PASS

> 若 `test_server_state` 等构造点报「missing field storage」，按 Step 3 末尾的方式补齐后再跑。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/src-tauri/src ai-digital-life/crates/server/src
git commit -m "feat(storage): wire shell and adl-server through StorageService"
```

---

### Task 7: config / dsh / snapshot / site-meta / 凭据 / 下载目录接入

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/config.rs:109-138`（`config_dir`/`config_path`/`load`/`save` 改为接收 config 目录）
- Modify: `ai-digital-life/crates/kernel/src/config_watcher.rs:17`
- Modify: `ai-digital-life/src-tauri/src/setup.rs:134,162-164`
- Modify: `ai-digital-life/crates/server/src/engine.rs:65`
- Modify: `ai-digital-life/crates/server/src/handlers/dsh.rs:27-33,58,250,283-284,317,340,389,435,486-533`
- Modify: `ai-digital-life/crates/server/src/handlers/reference.rs:12,30,51,67-69`
- Modify: `ai-digital-life/crates/server/src/handlers/commands_config.rs`（`data_dir()` 调用点）
- Modify: `ai-digital-life/crates/change-engine/src/snapshot.rs:29-30`
- Modify: `ai-digital-life/crates/credential/src/lib.rs:59`（回退目录注入）
- Modify: `ai-digital-life/crates/browser/src/download_manager.rs:2029-2055`（默认目录可注入）

**Interfaces:**
- Consumes: `StoragePaths`（Task 3）
- Produces:
  - `pub fn config_dir_for(config_dir: &Path) -> PathBuf`（`config.rs`，替代 `config_dir(data_dir)`）
  - `pub fn config_path_for(config_dir: &Path) -> PathBuf`
  - `pub fn load_from(config_dir: &Path) -> Result<AppConfig, AppError>`
  - `pub fn save_to(config_dir: &Path, config: &AppConfig) -> Result<(), AppError>`
  - `SnapshotManager::new(snapshot_root: &Path, project_hash: &str)`
  - `CredentialStore::new_with_credentials_dir(service, account, credentials_dir: PathBuf)`
  - `DownloadManager::set_default_dir_override(dir: Option<PathBuf>)`

> **为什么 `load`/`save` 要改成直接接收 config 目录：** per_category 模式下 `config` 可独立于根目录，`load(data_dir)` 内部 `join("config")` 的假设不再成立。直接接收 config 目录是唯一正确语义。所有调用点（`setup.rs`、`engine.rs`、`handlers/reference.rs`、`handlers/commands_config.rs`）随之改为传 `storage.paths().config_dir`。

- [ ] **Step 1: 写失败测试（config 目录语义）**

在 `crates/kernel/src/config.rs` 的 `tests` 模块内追加：

```rust
    #[test]
    fn load_save_accept_config_dir_directly() {
        let dir = temp_dir().join("adl-config-dir-direct-test");
        let cfg_dir = dir.join("custom-config");
        let _ = std::fs::remove_dir_all(&dir);
        let cfg = AppConfig::default();
        save_to(&cfg_dir, &cfg).unwrap();
        assert!(config_path_for(&cfg_dir).exists());
        let loaded = load_from(&cfg_dir).unwrap();
        assert_eq!(loaded.language, DEFAULT_LANGUAGE);
        let _ = std::fs::remove_dir_all(&dir);
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-kernel config::tests::load_save_accept_config_dir_directly -v`
Expected: FAIL（`save_to`/`load_from`/`config_path_for` 未定义）

- [ ] **Step 3: 实现 config 目录语义**

在 `crates/kernel/src/config.rs` 中，把第 109-138 行替换为：

```rust
/// 应用的配置文件目录名（`<config_dir>` 本身由 `StoragePaths` 决定）。
pub fn config_path_for(config_dir: &Path) -> PathBuf {
    config_dir.join("config.json")
}

pub fn load_from(config_dir: &Path) -> Result<AppConfig, AppError> {
    let path = config_path_for(config_dir);
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Config(format!("Failed to read config: {e}")))?;
    serde_json::from_str(&content).map_err(|e| {
        AppError::Config(format!(
            "Failed to parse config; falling back requires a valid rewrite: {e}"
        ))
    })
}

pub fn save_to(config_dir: &Path, config: &AppConfig) -> Result<(), AppError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_path_for(config_dir);
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}
```

删除旧的 `config_dir`/`config_path`/`load`/`save` 四个函数。更新同文件 `tests` 模块中的旧用例（`default_config_round_trips`、`app_config_round_trips_workspace_loading_fields`、`app_config_loads_old_config_without_workspace_fields`）为使用 `save_to(&dir, ...)` / `load_from(&dir)` / `config_path_for(&dir)`，并把 `config_dir(&dir)` 调用改为 `dir.join("config")`。

- [ ] **Step 4: 更新 config 的所有调用点**

- `crates/kernel/src/config_watcher.rs:17`：`start_watching(config_path, data_dir)` 的两个参数语义不变（config 文件路径、数据库所在根）。改由调用方传 `config_path_for(config_dir)` 与 `paths.root`。
- `src-tauri/src/setup.rs:134`：`adl_config::config_path(&data_dir)` → `adl_kernel::config::config_path_for(&storage.paths().config_dir)`；`setup.rs:162-164` `save_config_to_dir(data_dir, ...)` → `adl_kernel::config::save_to(&storage.paths().config_dir, config)`（`save_config_to_dir` 保留为薄包装或直接删除并把命令层改为 `save_to`；禁止保留向后兼容重导出）。
- `crates/server/src/engine.rs:65`：`adl_config::load(data_dir)` → `adl_config::load_from(&storage.paths().config_dir)`。
- `crates/server/src/handlers/reference.rs`：`data_dir(explicit)` → `config_dir_of(state)`；`adl_kernel::config::load(&dir)` → `load_from(&dir)`、`save(&dir, ...)` → `save_to(&dir, ...)`。`config_dir_of` 从 `ServerState` 的 `storage.paths().config_dir` 取，或用请求 body 的 `dataDir` 覆盖（保持现有显式覆盖语义：覆盖值视为 config 目录）。
- `crates/server/src/handlers/commands_config.rs`：同上，把 `data_dir()` 调用点改为 `state.storage.paths().config_dir`。

Run: `rg -n "adl_config::(load|save|config_path|config_dir)\b|config::(load|save)\(" ai-digital-life/crates ai-digital-life/src-tauri` 确认无遗漏。

- [ ] **Step 5: dsh 接入**

`crates/server/src/handlers/dsh.rs:32-33` 的 `dsh_root_dir(data_dir)` 改为接收 `paths`：

```rust
fn dsh_root_dir(paths: &adl_kernel::storage::StoragePaths) -> PathBuf {
    paths.dsh_versions_dir.clone()
}
```

`dsh_root(state)`（第 27-29 行）改为：

```rust
pub fn dsh_root(state: &ServerState) -> PathBuf {
    dsh_root_dir(state.storage.paths())
}
```

把第 58、250、283-284、317、340、389、435、486-533 行中传给 `adl_dsh_version::*` / `adl_dsh_bundle::*` / `adl_download_source::*` 的 `&state.data_dir` 或 `data_dir` 改为传 `state.storage.paths().root`（config 相关传 `paths.config_dir`）与 `paths.dsh_versions_dir`/`paths.dsh_bundle_dir`。逐处检查函数签名：`adl_download_source::load(dir)` 期望 config 目录 → 传 `state.storage.paths().config_dir`；`adl_dsh_bundle::detect(dir)` 期望 data_root → 传 `state.storage.paths().root`。

Run: `cargo build -p adl-server` 逐步修正类型不匹配，直到编译通过。

- [ ] **Step 6: snapshot 接入**

`crates/change-engine/src/snapshot.rs:29-30` 改为：

```rust
    pub fn new(snapshot_root: &Path, project_hash: &str) -> Self {
        let snapshot_root = snapshot_root.join(project_hash);
        Self { snapshot_root }
    }
```

调用点（`crates/server` 内构造快照处）改为传 `storage.paths().snapshot_dir`。Run: `rg -n "SnapshotManager::new" ai-digital-life` 找全部调用点并更新。

- [ ] **Step 7: 凭据回退目录接入**

`crates/credential/src/lib.rs`：新增

```rust
    /// 使用显式回退目录构造（当 OS keyring 不可用时使用 `credentials_dir`）。
    pub fn new_with_credentials_dir(service: &str, account: &str, credentials_dir: PathBuf) -> Self {
        let machine_key = derive_machine_key();
        CredentialStore {
            service: service.to_string(),
            account: account.to_string(),
            store: StoreBackend::EncryptedFile { config_dir: credentials_dir, machine_key },
        }
    }
```

调用点（`crates/server/src/handlers/ci.rs`）改为传 `state.storage.paths().credentials_dir`。`new()` 的默认行为保持不变（`dirs::config_dir()/ai-digital-life/credentials`，与 `StoragePaths` 默认一致）。

- [ ] **Step 8: 默认下载目录接入**

`crates/browser/src/download_manager.rs`：`DownloadManager` 增加字段 `default_dir_override: Mutex<Option<PathBuf>>` 与 setter：

```rust
    /// 覆盖默认下载目录（来自 StoragePaths.downloads_default_dir）。
    pub fn set_default_dir_override(&self, dir: Option<PathBuf>) {
        if let Ok(mut guard) = self.default_dir_override.lock() {
            *guard = dir;
        }
    }
```

`get_default_download_path()` 改为先读 override（有则返回），否则走原启发式。壳层在 `setup.rs` 构造 `download_manager` 后调用 `download_manager.set_default_dir_override(Some(storage.paths().downloads_default_dir.clone()))`。

- [ ] **Step 9: 运行测试**

Run: `cargo test --workspace`
Expected: PASS（全部既有测试 + 新增测试）

- [ ] **Step 10: 提交**

```bash
git add ai-digital-life
git commit -m "refactor(storage): route config, dsh, snapshot, credentials and downloads through StoragePaths"
```

---

### Task 8: 回归验证、质量门与文档同步

**Files:**
- Modify: `ai-digital-life/AGENTS.md`（存储说明）
- Modify: `docs/superpowers/specs/2026-09-14-terminal-history-regions-design.md:604-620`（§15.1 标注子项目 A 已立项实施）

- [ ] **Step 1: 双端手动回归（默认行为不变）**

运行应用（参考 `run-project-surfaces` 技能），确认：
- 启动日志仍写到仓库根 `.adl-logs`（debug 构建）。
- 工作区、会话、终端历史、剪贴板、浏览器标签/图标、补丁快照、DSH 全部正常。
- `storage-locator.json` **尚未**被创建（本计划不写 locator，只读；写入发生在 Plan C）。确认 `load_locator()` 缺失时回退默认且不影响启动。

Run: `Get-ChildItem "$env:APPDATA\ai-digital-life" -ErrorAction SilentlyContinue`
Expected: 无 `storage-locator.json`（或不存在该目录），应用仍正常。

- [ ] **Step 2: 质量门**

Run:
```
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
Expected: fmt 无 diff、clippy 0 warning、测试全绿。

- [ ] **Step 3: 前端回归（确认无破坏）**

Run: `pnpm --dir ai-digital-life/frontend run lint && pnpm --dir ai-digital-life/frontend run test`
Expected: PASS（本计划不改前端，用于确认后端契约变化未破坏 bridge）

- [ ] **Step 4: 文档同步**

- 在 `ai-digital-life/AGENTS.md` 的「技术栈」或新增小节中记录：存储路径由 `adl-kernel::storage` 的 `StoragePaths` 解析，locator 为 `<dirs::config_dir()>/ai-digital-life/storage-locator.json`，默认统一根 = `app_data_dir()`；日志 dev 写仓库根、release 写 `<root>/logs`。
- 在终端 spec 的 §15.1 顶部加一行「→ 已立项并实施：`2026-09-14-storage-path-settings-design.md`（Plan A/B/C）」。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/AGENTS.md docs/superpowers/specs/2026-09-14-terminal-history-regions-design.md
git commit -m "docs(storage): document StoragePaths resolution and subproject A kickoff"
```

---

## Self-Review

**1. Spec coverage（对照 spec）**
- §3.1 `StorageService`/`StorageLocator` → Task 1-3 ✅
- §3.2 locator 位于系统配置目录、避免循环依赖 → Task 2 ✅
- §3.3 迁移发生在 DB 打开前 → Plan B（本计划只保证解析在 open 之前）；本计划 `load_locator()` 在 `init_app_state`/`init_server_state` 之前调用 ✅（Task 5）
- §4 配置模型 → Task 1/2 ✅（`pendingMigration`/`lastReport` 类型已就绪，写入逻辑在 Plan B/C）
- §5.1 布局 → Task 3 ✅
- §5.2 白名单 → Task 4 ✅
- §5.3 项目自身不变量 → Task 4 白名单 + Task 7 落点收敛 ✅
- §6.3 日志 L2 + 开发态覆盖 → Task 6 ✅
- §10 影响面清单 → Task 5/7 ✅（`adl-server` 由 locator 驱动见 Task 5）
- §11 测试 → 每 Task 单测 + Task 8 回归 ✅
- §6 UI / §8 IPC / §7 迁移执行 → Plan B/C（明确不在本计划）
- §12 风险（误删 locator）→ Plan C UI 提示；本计划保证缺失时回退默认 ✅

**2. Placeholder scan:** 无 TBD/TODO；每个代码步骤含可编译代码或精确替换指令；Task 5 先于 Task 6，二者可独立编译提交（见下）。

**3. Type consistency:** `StorageCategory::key`、`StoragePaths` 字段名（`data_db`/`downloads_db`/`site_meta_db`/`config_dir`/`clipboard_dir`/`snapshot_dir`/`dsh_versions_dir`/`dsh_bundle_dir`/`logs_dir`/`credentials_dir`/`downloads_default_dir`）在 Task 3/5/6/7 中一致；`load_from`/`save_to`/`config_path_for` 在 Task 7 全流程一致；`resolve_log_dir(paths, project_root)` 在 Task 6 两处一致。所有「写失败测试」步骤均为真实缺失符号（如 `storage_from_locator`、`load_from`、`owns_file`），失败→实现的红绿闭环成立。

**执行顺序说明：** Task 5（接入 StorageService）先于 Task 6（日志目录统一），因此 Task 6 可直接使用已注入的 `storage` 参数，两者可各自独立编译并提交。Task 5 中 config 暂以 `root` 传入 `load`（统一模式下与现状等价）；Task 7 将 `load`/`save` 改为直接接收 config 目录，并同步全部调用点 —— 这是 `per_category` 下 `config` 覆盖生效的时点。
