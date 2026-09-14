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
        StorageCategory::Logs => {
            name.starts_with("terminal-logs") || name.starts_with("debug-logs")
        },
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
