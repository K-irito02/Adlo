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
        StorageCategory::TreeCache => {
            matches!(name, "tree-cache.db" | "tree-cache.db-wal" | "tree-cache.db-shm")
        },
        // config 基目录下所有文件均属自有。
        StorageCategory::Config => !rel.is_empty(),
        // `<base>/images/**` 或 `<base>/thumbs/**`
        StorageCategory::Clipboard => {
            matches!(rel.first().map(String::as_str), Some("images") | Some("thumbs"))
        },
        // `<base>/<hash>/...`：文件必须在 hash 子目录之下。
        StorageCategory::Snapshot => rel.len() >= 2,
        // base 本身即 harness 版本目录的公共父目录（其下按工具分 `dsh/`、`opencode/`）。
        StorageCategory::Harnesses => !rel.is_empty(),
        StorageCategory::Logs => {
            name.starts_with("terminal-logs") || name.starts_with("debug-logs")
        },
        // 仅 `<service>.<account>.enc` 形态（两段非空且以 .enc 结尾），非任意 *.enc。
        StorageCategory::CredentialsFallback => {
            name.ends_with(".enc")
                && name.split('.').count() == 3
                && name.split('.').all(|seg| !seg.is_empty())
        },
        StorageCategory::DownloadsDefault => false,
    }
}

/// 该分类的自有判定是否覆盖「基目录下任意深度的全部文件」（除 `owns_file` 无法判定的边角，
/// 例如非 UTF-8 文件名；这些边角在旧实现里本就被误报为外部文件，跳过更接近事实）。
///
/// 与 [`owns_file`] 必须**同文件维护**：`scan_foreign` 依赖本函数跳过整树自有的分类
/// （`dsh-versions` 六万级文件，遍历纯属浪费）。若将来收紧对应 `owns_file` 分支，
/// 必须同步撤销这里的 true，否则外部文件提示会静默漏报。
pub fn owns_entire_tree(category: StorageCategory) -> bool {
    matches!(category, StorageCategory::Config | StorageCategory::Harnesses)
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
        StorageCategory::Harnesses => !rel.is_empty(),
        StorageCategory::Logs => rel.is_empty(),
        // 主库/下载库/站点元库/树缓存库直接位于共享根，凭据目录由 OS 配置目录承载，均不视为可删自有目录。
        StorageCategory::Database
        | StorageCategory::DownloadsDb
        | StorageCategory::SiteMetaDb
        | StorageCategory::TreeCache
        | StorageCategory::CredentialsFallback
        | StorageCategory::DownloadsDefault => false,
    }
}

/// 该分类允许出现的根目录集合（迁移枚举起点）。
pub fn category_roots(category: StorageCategory, paths: &StoragePaths) -> Vec<PathBuf> {
    // 单文件类：`dir(category)` 是 `.db` 文件路径，其父目录即承载目录（统一模式 = `root`，
    // per-category 覆盖下 = 覆盖目录），与其它分类的「覆盖 = 目录」语义保持一致。
    let db_root = |category: StorageCategory| {
        paths.dir(category).parent().map(Path::to_path_buf).unwrap_or_else(|| paths.root.clone())
    };
    match category {
        StorageCategory::Database => vec![db_root(StorageCategory::Database)],
        StorageCategory::DownloadsDb => vec![db_root(StorageCategory::DownloadsDb)],
        StorageCategory::SiteMetaDb => vec![db_root(StorageCategory::SiteMetaDb)],
        StorageCategory::TreeCache => vec![db_root(StorageCategory::TreeCache)],
        StorageCategory::Config => vec![paths.config_dir.clone()],
        StorageCategory::Clipboard => vec![paths.clipboard_dir.clone()],
        StorageCategory::Snapshot => vec![paths.snapshot_dir.clone()],
        StorageCategory::Harnesses => vec![paths.harnesses_dir.clone()],
        StorageCategory::Logs => vec![paths.logs_dir.clone()],
        StorageCategory::CredentialsFallback => vec![paths.credentials_dir.clone()],
        StorageCategory::DownloadsDefault => Vec::new(),
    }
}

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
        assert!(is_own_dir(
            StorageCategory::Snapshot,
            &p.snapshot_dir,
            Path::new("/d/snapshot/abc123")
        ));
        assert!(!is_own_dir(StorageCategory::Snapshot, &p.snapshot_dir, Path::new("/d/snapshot")));
        assert!(owns_file(
            StorageCategory::Snapshot,
            Path::new("E:/snap"),
            Path::new("E:/snap/abc/f.ts")
        ));
        assert!(is_own_dir(
            StorageCategory::Snapshot,
            Path::new("E:/snap"),
            Path::new("E:/snap/abc")
        ));
    }

    #[test]
    fn harnesses_own_everything_under_the_shared_root() {
        let p = default_paths();
        assert!(owns_file(
            StorageCategory::Harnesses,
            &p.harnesses_dir,
            &p.harnesses_dir.join("dsh/versions/v1/x.bin")
        ));
        assert!(owns_file(
            StorageCategory::Harnesses,
            &p.harnesses_dir,
            &p.harnesses_dir.join("opencode/versions/1.0.0/bin/opencode.exe")
        ));
        assert!(is_own_dir(
            StorageCategory::Harnesses,
            &p.harnesses_dir,
            Path::new("/d/harnesses/dsh")
        ));
    }

    #[test]
    fn logs_owns_known_log_file_names() {
        let p = default_paths();
        assert!(owns_file(
            StorageCategory::Logs,
            &p.logs_dir,
            Path::new("/d/logs/terminal-logs.txt")
        ));
        assert!(owns_file(
            StorageCategory::Logs,
            &p.logs_dir,
            Path::new("/d/logs/debug-logs-2026.txt")
        ));
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
        assert!(!owns_file(
            StorageCategory::CredentialsFallback,
            base,
            Path::new("/c/creds/backup.enc")
        ));
        assert!(!owns_file(
            StorageCategory::CredentialsFallback,
            base,
            Path::new("/c/creds/plain.txt")
        ));
        assert!(!owns_file(
            StorageCategory::CredentialsFallback,
            base,
            Path::new("/c/creds/a..enc")
        ));
    }

    #[test]
    fn downloads_default_owns_nothing() {
        let p = default_paths();
        assert!(!owns_file(
            StorageCategory::DownloadsDefault,
            &p.downloads_default_dir,
            Path::new("/dl/a.zip")
        ));
        assert!(!is_own_dir(
            StorageCategory::DownloadsDefault,
            &p.downloads_default_dir,
            Path::new("/dl")
        ));
    }

    #[test]
    fn owns_entire_tree_covers_exactly_the_always_owned_categories() {
        // 与 `owns_file` 的 `!rel.is_empty()` 分支同步：这两类基目录下任意深度的文件都归自有。
        for category in [StorageCategory::Config, StorageCategory::Harnesses] {
            assert!(owns_entire_tree(category), "{category:?} must own its whole tree");
        }
        for category in StorageCategory::ALL {
            if matches!(category, StorageCategory::Config | StorageCategory::Harnesses) {
                continue;
            }
            assert!(
                !owns_entire_tree(category),
                "{category:?} must not be treated as owning its whole tree"
            );
        }
    }

    /// 漂移防护：`owns_entire_tree` 必须与 `owns_file(该分类根下的直接文件)` 的结论一致。
    /// 若将来收紧 `owns_file(Config)`（例如只认 `*.json`），本用例会先失败，
    /// 而不是让 `scan_foreign` 静默漏报外部文件。
    #[test]
    fn owns_entire_tree_agrees_with_owns_file_for_direct_children() {
        let p = default_paths();
        for category in StorageCategory::ALL {
            let Some(base) = category_roots(category, &p).into_iter().next() else {
                // DownloadsDefault 没有任何扫描根（不拥有任何文件），与整树自有无关。
                continue;
            };
            let probe = base.join("probe.txt");
            assert_eq!(
                owns_entire_tree(category),
                owns_file(category, &base, &probe),
                "{category:?}: owns_entire_tree must match owns_file for a direct child"
            );
        }
    }

    #[test]
    fn files_outside_base_are_never_owned() {
        assert!(!owns_file(
            StorageCategory::Clipboard,
            Path::new("E:/clip"),
            Path::new("/d/clipboard/images/a.png")
        ));
        assert!(!is_own_dir(
            StorageCategory::Snapshot,
            Path::new("E:/snap"),
            Path::new("/d/snapshot/abc")
        ));
    }

    #[test]
    fn category_roots_covers_each_category_once() {
        let p = default_paths();
        assert_eq!(category_roots(StorageCategory::Database, &p), vec![p.root.clone()]);
        assert_eq!(category_roots(StorageCategory::Config, &p), vec![p.config_dir.clone()]);
        assert_eq!(category_roots(StorageCategory::Clipboard, &p), vec![p.clipboard_dir.clone()]);
        assert_eq!(category_roots(StorageCategory::Snapshot, &p), vec![p.snapshot_dir.clone()]);
        assert_eq!(category_roots(StorageCategory::Harnesses, &p), vec![p.harnesses_dir.clone()]);
        assert_eq!(category_roots(StorageCategory::Logs, &p), vec![p.logs_dir.clone()]);
        assert_eq!(
            category_roots(StorageCategory::CredentialsFallback, &p),
            vec![p.credentials_dir.clone()]
        );
        assert!(category_roots(StorageCategory::DownloadsDefault, &p).is_empty());
        for c in [
            StorageCategory::Database,
            StorageCategory::DownloadsDb,
            StorageCategory::SiteMetaDb,
            StorageCategory::TreeCache,
        ] {
            assert_eq!(category_roots(c, &p), vec![p.root.clone()]);
        }

        // A8：per-category 的 DB 覆盖值是目录，`category_roots` 必须返回该覆盖目录
        // （而非统一根）。统一模式下 `dir(c).parent() == root`，上面的断言不变。
        let mut sel = crate::storage::locator::StorageSelection {
            mode: crate::storage::locator::StorageMode::PerCategory,
            ..Default::default()
        };
        sel.categories.insert(StorageCategory::Database, PathBuf::from("E:/xdb"));
        sel.categories.insert(StorageCategory::DownloadsDb, PathBuf::from("E:/xdl"));
        sel.categories.insert(StorageCategory::SiteMetaDb, PathBuf::from("E:/xmeta"));
        sel.categories.insert(StorageCategory::TreeCache, PathBuf::from("E:/xtree"));
        let q = StoragePaths::resolve(
            &sel,
            &StorageDefaults {
                root: PathBuf::from("/d"),
                credentials_dir: PathBuf::from("/c/creds"),
                downloads_dir: PathBuf::from("/dl"),
            },
        );
        assert_eq!(category_roots(StorageCategory::Database, &q), vec![PathBuf::from("E:/xdb")]);
        assert_eq!(category_roots(StorageCategory::DownloadsDb, &q), vec![PathBuf::from("E:/xdl")]);
        assert_eq!(
            category_roots(StorageCategory::SiteMetaDb, &q),
            vec![PathBuf::from("E:/xmeta")]
        );
        assert_eq!(category_roots(StorageCategory::TreeCache, &q), vec![PathBuf::from("E:/xtree")]);
    }
}
