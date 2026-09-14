//! 存储位置指针文件（`storage-locator.json`）的类型定义。
//!
//! 该文件是整个存储路径能力的唯一真源。它**不含业务数据**，只有路径指针，
//! 且固定位于系统配置目录（见 `path()`），因此永远不会随用户数据一起迁移 ——
//! 这避免了「把根路径存进 `<root>/config/config.json`」的循环依赖。

use super::category::StorageCategory;
use adl_errors::AppError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// `storage-locator.json` 的版本号。
pub const LOCATOR_VERSION: u32 = 1;

/// 统一的「模式 + 根目录 + 每类覆盖」选择，同时用于当前值与待迁移的目标值。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSelection {
    #[serde(default)]
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageMode {
    #[default]
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
    /// 上次执行失败；不自动重试，等待用户在设置中「重试」或「取消」。
    #[serde(default)]
    pub failed: bool,
    /// 上次失败原因（`failed == true` 时存在）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
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

/// 写入指针文件。
pub fn save_locator(loc: &StorageLocator) -> Result<(), AppError> {
    save_locator_to(&locator_path(), loc)
}

/// 写入指定路径（测试用注入点）。
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_locator(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("adl-locator-test-{}-{name}", std::process::id()));
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

    #[test]
    fn default_locator_is_versioned_unified_empty() {
        let loc = StorageLocator::default();
        assert_eq!(loc.version, LOCATOR_VERSION);
        assert_eq!(loc.selection.mode, StorageMode::Unified);
        assert!(loc.selection.root.is_none());
        assert!(loc.selection.categories.is_empty());
        assert!(loc.pending_migration.is_none());
        assert!(loc.last_report.is_none());
    }

    #[test]
    fn full_locator_json_round_trips() {
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::PerCategory;
        loc.selection.root = Some(std::path::PathBuf::from(r"D:\adl-data"));
        loc.selection
            .categories
            .insert(StorageCategory::Database, std::path::PathBuf::from(r"E:\adl\db"));
        loc.pending_migration = Some(PendingMigration {
            from: StorageSelection::default(),
            to: loc.selection.clone(),
            retain_source: true,
            requested_at: 1726000000,
            failed: false,
            error: None,
        });
        loc.last_report = Some(MigrationReport {
            at: 1726000001,
            ok: true,
            moved_files: 3,
            moved_bytes: 1024,
            removed_dirs: vec![std::path::PathBuf::from(r"D:\adl-old")],
            kept_dirs: vec![KeptDir {
                path: std::path::PathBuf::from(r"D:\adl-old\logs"),
                foreign_files: vec!["foreign.txt".to_string()],
            }],
            retained: false,
            error: None,
        });
        let json = serde_json::to_string(&loc).unwrap();
        let back: StorageLocator = serde_json::from_str(&json).unwrap();
        assert_eq!(back, loc);
    }

    #[test]
    fn minimal_json_parses_with_defaults() {
        let loc: StorageLocator = serde_json::from_str(r#"{"version":1}"#).unwrap();
        assert_eq!(loc, StorageLocator::default());
    }

    #[test]
    fn pending_migration_failure_fields_default_and_round_trip() {
        // 缺失新字段的旧 JSON 回退默认值。
        let pm: PendingMigration = serde_json::from_str(
            r#"{"from":{"mode":"unified"},"to":{"mode":"unified"},"requestedAt":1726000000}"#,
        )
        .unwrap();
        assert!(!pm.failed);
        assert!(pm.error.is_none());

        let mut failed = pm.clone();
        failed.failed = true;
        failed.error = Some("disk full".to_string());
        let back: PendingMigration =
            serde_json::from_str(&serde_json::to_string(&failed).unwrap()).unwrap();
        assert!(back.failed);
        assert_eq!(back.error.as_deref(), Some("disk full"));

        // failed == false 时 `error` 不序列化。
        assert!(!serde_json::to_string(&pm).unwrap().contains("\"error\""));
    }
}
