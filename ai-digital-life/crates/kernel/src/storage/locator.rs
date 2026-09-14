//! 存储位置指针文件（`storage-locator.json`）的类型定义。
//!
//! 该文件是整个存储路径能力的唯一真源。它**不含业务数据**，只有路径指针，
//! 且固定位于系统配置目录（见 `path()`），因此永远不会随用户数据一起迁移 ——
//! 这避免了「把根路径存进 `<root>/config/config.json`」的循环依赖。

use super::category::StorageCategory;
use serde::{Deserialize, Serialize};
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
