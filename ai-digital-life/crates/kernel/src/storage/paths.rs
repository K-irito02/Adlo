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
    pub tree_cache_db: PathBuf,
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
            StorageCategory::TreeCache => self.tree_cache_db.clone(),
            StorageCategory::Config => self.config_dir.clone(),
            StorageCategory::Clipboard => self.clipboard_dir.clone(),
            StorageCategory::Snapshot => self.snapshot_dir.clone(),
            StorageCategory::Dsh => self.dsh_versions_dir.clone(),
            StorageCategory::Logs => self.logs_dir.clone(),
            StorageCategory::CredentialsFallback => self.credentials_dir.clone(),
            StorageCategory::DownloadsDefault => self.downloads_default_dir.clone(),
        }
    }

    /// `TreeCacheStore::open` 用目录：`dir(TreeCache)` 是 `tree-cache.db` 文件路径，
    /// 取其父目录（`open` 在其下再拼文件名，见 workspace `tree_cache_store.rs:DB_FILE_NAME`）。
    /// 相对路径回 `None`（防 CWD 漂移建库，与 workspace `tree_cache_dir` 的
    /// `absolute_only` 同口径）；调用方决定回落统一根或报错。
    pub fn tree_cache_store_dir(&self) -> Option<PathBuf> {
        let parent = self.dir(StorageCategory::TreeCache).parent().map(Path::to_path_buf)?;
        parent.is_absolute().then_some(parent)
    }

    /// `dir()` 的逆运算：由该分类**实际路径**还原 per-category 覆盖值语义的目录，
    /// 与 `resolve` 的拼接规则互逆（DB 四类实际路径是固定文件名拼接结果 `X/data.db`
    /// → 覆盖值 `X`；dsh 实际路径是子目录 `X/dsh-versions` → 覆盖值 `X`；其余分类
    /// 覆盖值即其目录本身）。
    ///
    /// 状态回报（`category_statuses.path`）用此值，保证「状态 → 前端草稿 → patch
    /// 回传 → resolve」round-trip 恒等——未修改分类不再产生 `data.db/data.db`
    /// 假路径（事项 9 根因）。
    pub fn override_dir(&self, category: StorageCategory) -> PathBuf {
        let actual = self.dir(category);
        match category {
            StorageCategory::Database
            | StorageCategory::DownloadsDb
            | StorageCategory::SiteMetaDb
            | StorageCategory::TreeCache
            | StorageCategory::Dsh => {
                // `Path::parent()` 对无父目录的裸文件名返回 `Some("")` 而非 `None`——
                // 空父目录同样回退实际路径，禁止返回空路径（Phase 4 R2-R9-L1）。
                actual
                    .parent()
                    .filter(|p| !p.as_os_str().is_empty())
                    .map(Path::to_path_buf)
                    .unwrap_or(actual)
            },
            _ => actual,
        }
    }

    /// 由 locator 解析出全部路径。
    ///
    /// 规则：先取 unified 根（`selection.root` 或 `defaults.root`），逐字段按该根拼接；
    /// 仅当 `mode == PerCategory` 时，`categories` 中的覆盖才生效（凭据回退与默认下载
    /// 目录的「未覆盖」值是平台默认，而非根下子路径）。`dsh` 覆盖值视为 DSH 根，
    /// 两个子目录为 `X/dsh-versions`、`X/dsh-bundle`；四个 DB 分类的覆盖值视为**目录**，
    /// 固定的数据库文件名（`data.db` / `downloads.db` / `site-meta-cache.db` / `tree-cache.db`）拼在其下。
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
            data_db: overridden(StorageCategory::Database)
                .map(|d| d.join("data.db"))
                .unwrap_or_else(|| root.join("data.db")),
            downloads_db: overridden(StorageCategory::DownloadsDb)
                .map(|d| d.join("downloads.db"))
                .unwrap_or_else(|| root.join("downloads.db")),
            site_meta_db: overridden(StorageCategory::SiteMetaDb)
                .map(|d| d.join("site-meta-cache.db"))
                .unwrap_or_else(|| root.join("site-meta-cache.db")),
            tree_cache_db: overridden(StorageCategory::TreeCache)
                .map(|d| d.join("tree-cache.db"))
                .unwrap_or_else(|| root.join("tree-cache.db")),
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
    default_root: PathBuf,
}

impl StorageService {
    pub fn from_locator(loc: &StorageLocator, defaults: &StorageDefaults) -> Self {
        Self {
            paths: StoragePaths::from_locator(loc, defaults),
            selection: loc.selection.clone(),
            default_root: defaults.root.clone(),
        }
    }

    pub fn paths(&self) -> &StoragePaths {
        &self.paths
    }

    pub fn selection(&self) -> &StorageSelection {
        &self.selection
    }

    pub fn default_root(&self) -> &Path {
        &self.default_root
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
    fn service_remembers_default_root() {
        let defaults = defaults();
        let loc = StorageLocator::default();
        debug_assert_eq!(loc.selection.mode, StorageMode::Unified);
        debug_assert!(loc.selection.root.is_none());
        debug_assert!(loc.selection.categories.is_empty());
        let svc = StorageService::from_locator(&loc, &defaults);
        assert_eq!(svc.default_root(), &defaults.root);
    }

    #[test]
    fn unified_default_root_matches_current_layout() {
        let loc = StorageLocator::default();
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.root, PathBuf::from("/default/root"));
        assert_eq!(p.data_db, PathBuf::from("/default/root/data.db"));
        assert_eq!(p.downloads_db, PathBuf::from("/default/root/downloads.db"));
        assert_eq!(p.site_meta_db, PathBuf::from("/default/root/site-meta-cache.db"));
        assert_eq!(p.tree_cache_db, PathBuf::from("/default/root/tree-cache.db"));
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
    fn per_category_db_override_is_a_directory() {
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::PerCategory;
        loc.selection.categories.insert(StorageCategory::Database, PathBuf::from("/xdb"));
        loc.selection.categories.insert(StorageCategory::DownloadsDb, PathBuf::from("/xdl"));
        loc.selection.categories.insert(StorageCategory::SiteMetaDb, PathBuf::from("/xmeta"));
        loc.selection.categories.insert(StorageCategory::TreeCache, PathBuf::from("/xtree"));
        let p = StoragePaths::from_locator(&loc, &defaults());
        // 覆盖值是目录：数据库文件名拼在其下（与其它分类的目录语义一致）。
        assert_eq!(p.data_db, PathBuf::from("/xdb/data.db"));
        assert_eq!(p.downloads_db, PathBuf::from("/xdl/downloads.db"));
        assert_eq!(p.site_meta_db, PathBuf::from("/xmeta/site-meta-cache.db"));
        assert_eq!(p.tree_cache_db, PathBuf::from("/xtree/tree-cache.db"));
        // dir() 与字段保持一致。
        assert_eq!(p.dir(StorageCategory::Database), PathBuf::from("/xdb/data.db"));
    }

    /// 事项 9 根因锁定：状态回报（`override_dir`）→ patch 回传 → `resolve`
    /// 必须 round-trip 恒等——未修改分类不得产生 `data.db/data.db` 假路径。
    /// 统一从 unified 布局与 per-category 覆盖布局两个方向验证全部 11 类。
    #[test]
    fn override_dir_round_trips_through_resolve() {
        // 方向 1：unified 布局（无覆盖）→ override_dir → per_category resolve 恒等。
        let unified = StoragePaths::from_locator(&StorageLocator::default(), &defaults());
        for category in StorageCategory::ALL {
            let mut loc = StorageLocator::default();
            loc.selection.mode = StorageMode::PerCategory;
            loc.selection.categories.insert(category, unified.override_dir(category));
            let roundtrip = StoragePaths::from_locator(&loc, &defaults());
            assert_eq!(
                roundtrip.dir(category),
                unified.dir(category),
                "unified round-trip mismatch for {}",
                category.key()
            );
        }

        // 方向 2：per-category 覆盖布局 → override_dir → 再 resolve 恒等。
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::PerCategory;
        loc.selection.root = Some(PathBuf::from("D:/adl"));
        loc.selection.categories.insert(StorageCategory::Database, PathBuf::from("/xdb"));
        loc.selection.categories.insert(StorageCategory::DownloadsDb, PathBuf::from("/xdl"));
        loc.selection.categories.insert(StorageCategory::SiteMetaDb, PathBuf::from("/xmeta"));
        loc.selection.categories.insert(StorageCategory::TreeCache, PathBuf::from("/xtree"));
        loc.selection.categories.insert(StorageCategory::Dsh, PathBuf::from("E:/dsh"));
        loc.selection.categories.insert(StorageCategory::Clipboard, PathBuf::from("E:/clip"));
        loc.selection
            .categories
            .insert(StorageCategory::DownloadsDefault, PathBuf::from("E:/dl"));
        let first = StoragePaths::from_locator(&loc, &defaults());
        let mut loc2 = StorageLocator::default();
        loc2.selection.mode = StorageMode::PerCategory;
        for category in StorageCategory::ALL {
            loc2.selection
                .categories
                .insert(category, first.override_dir(category));
        }
        let second = StoragePaths::from_locator(&loc2, &defaults());
        for category in StorageCategory::ALL {
            assert_eq!(
                second.dir(category),
                first.dir(category),
                "per-category round-trip mismatch for {}",
                category.key()
            );
        }
        // 关键防回归：DB 类不得出现双重嵌套（data.db/data.db）。
        assert!(!second.data_db.to_string_lossy().contains("data.db/data.db"));
        assert_eq!(second.dsh_versions_dir, PathBuf::from("E:/dsh/dsh-versions"));
    }

    #[test]
    fn override_dir_never_returns_empty_parent() {
        // `Path::parent()` 对裸文件名返回 `Some("")`——守卫必须回退实际路径
        // 而非空路径（Phase 4 R2-R9-L1；`resolve` 恒拼接根目录，生产不可达）。
        let mut paths =
            StoragePaths::from_locator(&StorageLocator::default(), &defaults());
        paths.data_db = PathBuf::from("data.db");
        assert_eq!(
            paths.override_dir(StorageCategory::Database),
            PathBuf::from("data.db")
        );
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
    fn tree_cache_store_dir_is_parent_of_db_file() {
        // Windows 下 `/x` 无盘符不算绝对路径：用 temp_dir 构造本平台绝对根。
        let root = std::env::temp_dir().join("adl-tc-store-dir");
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(root.clone());
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.tree_cache_db.file_name().and_then(|n| n.to_str()), Some("tree-cache.db"));
        assert_eq!(p.tree_cache_store_dir(), Some(root));
    }

    #[test]
    fn tree_cache_store_dir_honors_per_category_override() {
        let dir = std::env::temp_dir().join("adl-tc-store-override");
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::PerCategory;
        loc.selection.categories.insert(StorageCategory::TreeCache, dir.clone());
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.tree_cache_store_dir(), Some(dir));
    }

    #[test]
    fn tree_cache_store_dir_rejects_relative_unified_root() {
        let mut loc = StorageLocator::default();
        loc.selection.root = Some(PathBuf::from("rel/root"));
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.tree_cache_store_dir(), None);
    }

    #[test]
    fn tree_cache_store_dir_rejects_relative_per_category_override() {
        let mut loc = StorageLocator::default();
        loc.selection.mode = StorageMode::PerCategory;
        loc.selection.categories.insert(StorageCategory::TreeCache, PathBuf::from("rel/tree"));
        let p = StoragePaths::from_locator(&loc, &defaults());
        assert_eq!(p.tree_cache_store_dir(), None);
    }

    #[test]
    fn tree_cache_store_dir_rejects_bare_file_name() {
        // `dir()` 经 resolve 恒为 `根/覆盖.join("tree-cache.db")`，parent 不可能为空；
        // 此例锁定极端输入（裸文件名）的守卫语义：非绝对 → None。
        let p = StoragePaths {
            root: PathBuf::from("rel"),
            data_db: PathBuf::from("rel/data.db"),
            downloads_db: PathBuf::from("rel/downloads.db"),
            site_meta_db: PathBuf::from("rel/site-meta-cache.db"),
            tree_cache_db: PathBuf::from("tree-cache.db"),
            config_dir: PathBuf::from("rel/config"),
            clipboard_dir: PathBuf::from("rel/clipboard"),
            snapshot_dir: PathBuf::from("rel/snapshot"),
            dsh_versions_dir: PathBuf::from("rel/dsh-versions"),
            dsh_bundle_dir: PathBuf::from("rel/dsh-bundle"),
            logs_dir: PathBuf::from("rel/logs"),
            credentials_dir: PathBuf::from("rel/creds"),
            downloads_default_dir: PathBuf::from("rel/dl"),
        };
        assert_eq!(p.tree_cache_store_dir(), None);
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
