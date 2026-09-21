use std::path::Path;
use std::sync::Mutex;

use adl_errors::AppError;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

/// 单行树 JSON 字节上限（8MB）：超限拒绝写入，返回 `Ok` 并记 `debug`，不报错。
const MAX_TREE_JSON_BYTES: usize = 8 * 1024 * 1024;

const DB_FILE_NAME: &str = "tree-cache.db";

const DEFAULT_TTL_MINUTES: u64 = 15;

const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS tree_cache (
    workspace_path TEXT PRIMARY KEY,
    tree_json      TEXT NOT NULL,
    captured_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tree_cache_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);";

/// SQLite 落盘的一行树缓存（调用方按 `captured_at` 判定 TTL，本模块不判定）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedTreeRow {
    pub tree_json: String,
    pub captured_at: i64,
}

/// 设置页展示用的缓存统计（空表时计数为 0、时间为 `None`；
/// `enabled`/`ttl_minutes` 与 `get_options()` 同源，供校准门直接消费）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeCacheStats {
    pub workspace_count: u64,
    pub total_bytes: u64,
    pub oldest_captured_at: Option<i64>,
    pub newest_captured_at: Option<i64>,
    pub enabled: bool,
    pub ttl_minutes: u64,
}

/// 树缓存开关与 TTL（分钟）；缺省 `enabled=true, ttl_minutes=15`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeCacheOptions {
    pub enabled: bool,
    pub ttl_minutes: u64,
}

impl Default for TreeCacheOptions {
    fn default() -> Self {
        Self { enabled: true, ttl_minutes: DEFAULT_TTL_MINUTES }
    }
}

pub struct TreeCacheStore {
    db: Mutex<Connection>,
}

fn read_meta(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    let mut stmt = conn
        .prepare("SELECT value FROM tree_cache_meta WHERE key = ?1")
        .map_err(|e| AppError::Storage(format!("prepare read tree cache meta: {e}")))?;
    let mut rows = stmt
        .query_map(params![key], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Storage(format!("query tree cache meta: {e}")))?;
    match rows.next() {
        None => Ok(None),
        Some(r) => r.map(Some).map_err(|e| AppError::Storage(format!("read tree cache meta: {e}"))),
    }
}

impl TreeCacheStore {
    pub fn open(dir: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(dir)?;
        let db_path = dir.join(DB_FILE_NAME);
        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::Storage(format!("open {DB_FILE_NAME}: {e}")))?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::Storage(format!("set WAL: {e}")))?;
        conn.execute_batch(CREATE_TABLE_SQL)
            .map_err(|e| AppError::Storage(format!("create tree_cache tables: {e}")))?;
        Ok(Self { db: Mutex::new(conn) })
    }

    pub fn get(&self, workspace_path: &str) -> Result<Option<CachedTreeRow>, AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare("SELECT tree_json, captured_at FROM tree_cache WHERE workspace_path = ?1")
            .map_err(|e| AppError::Storage(format!("prepare get tree row: {e}")))?;
        let mut rows = stmt
            .query_map(params![workspace_path], |row| {
                Ok(CachedTreeRow { tree_json: row.get(0)?, captured_at: row.get(1)? })
            })
            .map_err(|e| AppError::Storage(format!("query tree row: {e}")))?;
        match rows.next() {
            None => Ok(None),
            Some(r) => r.map(Some).map_err(|e| AppError::Storage(format!("read tree row: {e}"))),
        }
    }

    pub fn put(
        &self,
        workspace_path: &str,
        tree_json: &str,
        captured_at: i64,
    ) -> Result<(), AppError> {
        if tree_json.len() > MAX_TREE_JSON_BYTES {
            tracing::debug!(
                workspace_path,
                bytes = tree_json.len(),
                "tree cache row oversized, refusing write"
            );
            return Ok(());
        }
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT OR REPLACE INTO tree_cache (workspace_path, tree_json, captured_at)
             VALUES (?1, ?2, ?3)",
            params![workspace_path, tree_json, captured_at],
        )
        .map_err(|e| AppError::Storage(format!("put tree row: {e}")))?;
        Ok(())
    }

    pub fn remove(&self, workspace_path: &str) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute("DELETE FROM tree_cache WHERE workspace_path = ?1", params![workspace_path])
            .map_err(|e| AppError::Storage(format!("remove tree row: {e}")))?;
        Ok(())
    }

    /// 删除全部缓存行（设置页"清除缓存"语义）；`tree_cache_meta`（开关/TTL）保留。
    pub fn clear(&self) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute("DELETE FROM tree_cache", [])
            .map_err(|e| AppError::Storage(format!("clear tree_cache: {e}")))?;
        Ok(())
    }

    pub fn stats(&self) -> Result<TreeCacheStats, AppError> {
        // 行统计与 meta 查询分两次加锁：`get_options` 内部另行加锁，同守卫内调用会死锁。
        let (workspace_count, total_bytes, oldest_captured_at, newest_captured_at) = {
            let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
            conn.query_row(
                "SELECT COUNT(*), COALESCE(SUM(LENGTH(tree_json)), 0), MIN(captured_at), MAX(captured_at)
                 FROM tree_cache",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? as u64,
                        row.get::<_, i64>(1)? as u64,
                        row.get::<_, Option<i64>>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                    ))
                },
            )
            .map_err(|e| AppError::Storage(format!("stats tree_cache: {e}")))?
        };
        let opts = self.get_options()?;
        Ok(TreeCacheStats {
            workspace_count,
            total_bytes,
            oldest_captured_at,
            newest_captured_at,
            enabled: opts.enabled,
            ttl_minutes: opts.ttl_minutes,
        })
    }

    pub fn get_options(&self) -> Result<TreeCacheOptions, AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let enabled = match read_meta(&conn, "enabled")? {
            None => true,
            Some(v) => v == "1",
        };
        let ttl_minutes = match read_meta(&conn, "ttl_minutes")? {
            None => DEFAULT_TTL_MINUTES,
            Some(v) => v
                .parse::<u64>()
                .map_err(|e| AppError::Storage(format!("parse ttl_minutes: {e}")))?,
        };
        Ok(TreeCacheOptions { enabled, ttl_minutes })
    }

    pub fn set_options(&self, enabled: bool, ttl_minutes: u64) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT OR REPLACE INTO tree_cache_meta (key, value) VALUES ('enabled', ?1)",
            params![if enabled { "1" } else { "0" }],
        )
        .map_err(|e| AppError::Storage(format!("set tree cache enabled: {e}")))?;
        conn.execute(
            "INSERT OR REPLACE INTO tree_cache_meta (key, value) VALUES ('ttl_minutes', ?1)",
            params![ttl_minutes.to_string()],
        )
        .map_err(|e| AppError::Storage(format!("set tree cache ttl: {e}")))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TC_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir(prefix: &str) -> std::path::PathBuf {
        let id = TC_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("{prefix}-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    #[test]
    fn put_then_get_roundtrips() {
        let dir = unique_tmp_dir("tc-roundtrip");
        let store = TreeCacheStore::open(&dir).unwrap();
        store.put("/ws/a", r#"[{"path":"a.txt"}]"#, 1000).unwrap();
        let row = store.get("/ws/a").unwrap().expect("row must exist");
        assert_eq!(row.captured_at, 1000);
        assert!(row.tree_json.contains("a.txt"));
    }

    #[test]
    fn remove_deletes_row() {
        let dir = unique_tmp_dir("tc-remove");
        let store = TreeCacheStore::open(&dir).unwrap();
        store.put("/ws/a", "[]", 1000).unwrap();
        store.remove("/ws/a").unwrap();
        assert!(store.get("/ws/a").unwrap().is_none());
    }

    #[test]
    fn oversized_row_is_refused_silently() {
        let dir = unique_tmp_dir("tc-big");
        let store = TreeCacheStore::open(&dir).unwrap();
        let big = "x".repeat(8 * 1024 * 1024 + 1);
        store.put("/ws/a", &big, 1000).unwrap();
        assert!(store.get("/ws/a").unwrap().is_none());
    }

    #[test]
    fn options_default_and_roundtrip() {
        let dir = unique_tmp_dir("tc-opts");
        let store = TreeCacheStore::open(&dir).unwrap();
        let opts = store.get_options().unwrap();
        assert!(opts.enabled);
        assert_eq!(opts.ttl_minutes, 15);
        store.set_options(false, 60).unwrap();
        let opts = store.get_options().unwrap();
        assert!(!opts.enabled);
        assert_eq!(opts.ttl_minutes, 60);
    }

    #[test]
    fn stats_carries_current_options() {
        let dir = unique_tmp_dir("tc-stats-opts");
        let store = TreeCacheStore::open(&dir).unwrap();
        let stats = store.stats().unwrap();
        assert!(stats.enabled);
        assert_eq!(stats.ttl_minutes, 15);
        store.set_options(false, 60).unwrap();
        store.put("/ws/a", "[]", 1000).unwrap();
        let stats = store.stats().unwrap();
        assert_eq!(stats.workspace_count, 1);
        assert!(!stats.enabled);
        assert_eq!(stats.ttl_minutes, 60);
    }

    #[test]
    fn clear_removes_all_rows_but_keeps_options() {
        let dir = unique_tmp_dir("tc-clear");
        let store = TreeCacheStore::open(&dir).unwrap();
        store.put("/ws/a", "[]", 1000).unwrap();
        store.put("/ws/b", "[]", 2000).unwrap();
        store.set_options(false, 60).unwrap();
        store.clear().unwrap();
        assert!(store.get("/ws/a").unwrap().is_none());
        assert!(store.get("/ws/b").unwrap().is_none());
        let stats = store.stats().unwrap();
        assert_eq!(stats.workspace_count, 0);
        assert_eq!(stats.total_bytes, 0);
        let opts = store.get_options().unwrap();
        assert!(!opts.enabled);
        assert_eq!(opts.ttl_minutes, 60);
    }
}
