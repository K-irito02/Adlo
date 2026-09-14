//! 存储路径解析结果与解析规则。

use super::category::StorageCategory;
use super::locator::{StorageLocator, StorageMode, StorageSelection};
use std::path::{Path, PathBuf};

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
    /// 目录的「未覆盖」值是平台默认，而非根下子路径）。`dsh` 覆盖值视为 DSH 根，
    /// 两个子目录为 `X/dsh-versions`、`X/dsh-bundle`。
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
                .map(|x| x.join("dsh-versions"))
                .unwrap_or_else(|| root.join("dsh-versions")),
            dsh_bundle_dir: overridden(StorageCategory::Dsh)
                .map(|x| x.join("dsh-bundle"))
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

/// 解析日志目录。
///
/// - `project_root = Some(p)` 时（开发态覆盖）：写入 `<p>/.adl-logs`，保持既有调试工作流。
/// - `None` 时：使用 `paths.logs_dir`（默认 `<root>/logs`）。
///
/// 覆盖开关由调用方决定：debug 构建传入 `Some(仓库根)`，release 传 `None`。
pub fn resolve_log_dir(paths: &StoragePaths, project_root: Option<&Path>) -> PathBuf {
    match project_root {
        Some(root) => root.join(".adl-logs"),
        None => paths.logs_dir.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::locator::{StorageLocator, StorageMode};
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
        loc.selection
            .categories
            .insert(StorageCategory::CredentialsFallback, PathBuf::from("E:/creds"));
        loc.selection.categories.insert(StorageCategory::DownloadsDefault, PathBuf::from("E:/dl"));
        loc.selection.categories.insert(StorageCategory::Dsh, PathBuf::from("E:/dsh"));
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.clipboard_dir, PathBuf::from("E:/clip"));
        assert_eq!(p.credentials_dir, PathBuf::from("E:/creds"));
        assert_eq!(p.downloads_default_dir, PathBuf::from("E:/dl"));
        assert_eq!(p.dsh_versions_dir, PathBuf::from("E:/dsh/dsh-versions"));
        assert_eq!(p.dsh_bundle_dir, PathBuf::from("E:/dsh/dsh-bundle"));
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
            assert!(d.is_absolute() || d.starts_with("/default"), "{c:?} -> {d:?}");
        }
    }

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
}
