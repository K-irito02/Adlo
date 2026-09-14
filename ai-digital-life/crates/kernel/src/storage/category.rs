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
