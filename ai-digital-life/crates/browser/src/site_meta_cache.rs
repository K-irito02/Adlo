use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use adl_errors::AppError;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteMetaCacheEntry {
    pub title: String,
    pub title_source: String,
    pub favicon_url: String,
    pub favicon_data_uri: String,
    pub fetched_at: i64,
    pub last_ok_at: i64,
    pub next_retry_at: i64,
    pub fail_count: u32,
}

const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS site_meta_cache (
    url              TEXT PRIMARY KEY,
    title            TEXT NOT NULL DEFAULT '',
    title_source     TEXT NOT NULL DEFAULT '',
    favicon_url      TEXT NOT NULL DEFAULT '',
    favicon_data_uri TEXT NOT NULL DEFAULT '',
    fetched_at       INTEGER NOT NULL,
    last_ok_at       INTEGER NOT NULL DEFAULT 0,
    next_retry_at    INTEGER NOT NULL DEFAULT 0,
    fail_count       INTEGER NOT NULL DEFAULT 0
);";

pub struct SiteMetaCacheStore {
    db: Mutex<Connection>,
}

/// 测试专用：用给定连接构造 store（用于注入 query_only 等失败连接）。
#[cfg(test)]
pub(crate) fn from_connection_for_test(conn: Connection) -> SiteMetaCacheStore {
    SiteMetaCacheStore { db: Mutex::new(conn) }
}

/// 与前端 `normalizeUrlForCache` 同构：去 hash、去尾部多余斜杠、去一次性认证参数。
/// `token`（如 dsh `?token=`）绝不是页面身份，且属凭据：去之既防 token 轮换分裂
/// 缓存行，也防凭据进 SQLite 落盘（R1-Medium；抓取仍用原始 URL，不走本函数）。
pub fn normalize_cache_key(url: &str) -> String {
    if let Ok(mut u) = url::Url::parse(url) {
        u.set_fragment(None);
        // 字符串级剔除（不重编码其余参数，保持与前端同字节口径）。
        // 全 owned 中转（E0716：query 借用与 set_query 可变借用 + 临时 join 串的
        // 生命周期三者冲突，一律先落盘为局部 owned 再写回）。
        if let Some(q) = u.query().map(str::to_owned) {
            let kept: Vec<&str> =
                q.split('&').filter(|p| p.split('=').next().unwrap_or("") != "token").collect();
            let new_query: Option<String> =
                if kept.is_empty() { None } else { Some(kept.join("&")) };
            u.set_query(new_query.as_deref());
        }
        let mut path = u.path().to_string();
        if path.len() > 1 && path.ends_with('/') {
            while path.len() > 1 && path.ends_with('/') {
                path.pop();
            }
            u.set_path(&path);
        }
        u.to_string()
    } else {
        let no_hash = url.split('#').next().unwrap_or(url);
        let mut s = no_hash.to_string();
        if s.len() > 8 && s.ends_with('/') {
            while s.len() > 8 && s.ends_with('/') {
                s.pop();
            }
        }
        s
    }
}

impl SiteMetaCacheStore {
    pub fn open(data_dir: &Path) -> Result<Arc<Self>, AppError> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("site-meta-cache.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::Storage(format!("open site-meta-cache.db: {e}")))?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::Storage(format!("set WAL: {e}")))?;
        // 早期迭代创建的旧表缺 4 列（title_source/last_ok_at/next_retry_at/fail_count）；
        // CREATE TABLE IF NOT EXISTS 不会补列 → 读取/写入会因 "no such column" 失败。
        // 未发布阶段直接丢弃式重建（PRAGMA 校验缺列 → DROP + CREATE）。
        let required = [
            "url",
            "title",
            "title_source",
            "favicon_url",
            "favicon_data_uri",
            "fetched_at",
            "last_ok_at",
            "next_retry_at",
            "fail_count",
        ];
        let has_table = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='site_meta_cache'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| AppError::Storage(format!("check table existence: {e}")))?;
        if has_table > 0 {
            let mut stmt = conn
                .prepare("PRAGMA table_info(site_meta_cache)")
                .map_err(|e| AppError::Storage(format!("prepare table_info: {e}")))?;
            let cols: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| AppError::Storage(format!("query table_info: {e}")))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| AppError::Storage(format!("read table_info: {e}")))?;
            if !required.iter().all(|c| cols.iter().any(|x| x == c)) {
                conn.execute_batch("DROP TABLE site_meta_cache;").map_err(|e| {
                    AppError::Storage(format!("drop stale site_meta_cache table: {e}"))
                })?;
            }
        }
        conn.execute_batch(CREATE_TABLE_SQL)
            .map_err(|e| AppError::Storage(format!("create site_meta_cache table: {e}")))?;
        Ok(Arc::new(Self { db: Mutex::new(conn) }))
    }

    pub fn get_all(&self) -> Result<HashMap<String, SiteMetaCacheEntry>, AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare(
                "SELECT url, title, title_source, favicon_url, favicon_data_uri, fetched_at, last_ok_at, next_retry_at, fail_count FROM site_meta_cache",
            )
            .map_err(|e| AppError::Storage(format!("prepare select: {e}")))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    SiteMetaCacheEntry {
                        title: row.get(1)?,
                        title_source: row.get(2)?,
                        favicon_url: row.get(3)?,
                        favicon_data_uri: row.get(4)?,
                        fetched_at: row.get(5)?,
                        last_ok_at: row.get(6)?,
                        next_retry_at: row.get(7)?,
                        fail_count: row.get(8)?,
                    },
                ))
            })
            .map_err(|e| AppError::Storage(format!("query rows: {e}")))?;
        let mut map = HashMap::new();
        for r in rows {
            let (k, v) = r.map_err(|e| AppError::Storage(format!("row: {e}")))?;
            map.insert(k, v);
        }
        Ok(map)
    }

    pub fn upsert(&self, entries: &HashMap<String, SiteMetaCacheEntry>) -> Result<(), AppError> {
        let mut conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Storage(format!("begin upsert transaction: {e}")))?;
        for (url, entry) in entries {
            tx.execute(
                "INSERT OR REPLACE INTO site_meta_cache (url, title, title_source, favicon_url, favicon_data_uri, fetched_at, last_ok_at, next_retry_at, fail_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    url,
                    entry.title,
                    entry.title_source,
                    entry.favicon_url,
                    entry.favicon_data_uri,
                    entry.fetched_at,
                    entry.last_ok_at,
                    entry.next_retry_at,
                    entry.fail_count
                ],
            )
            .map_err(|e| AppError::Storage(format!("upsert {url}: {e}")))?;
        }
        tx.commit().map_err(|e| AppError::Storage(format!("commit upsert: {e}")))?;
        Ok(())
    }

    pub fn remove(&self, urls: &[String]) -> Result<(), AppError> {
        let mut conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Storage(format!("begin remove transaction: {e}")))?;
        for url in urls {
            tx.execute("DELETE FROM site_meta_cache WHERE url = ?1", params![url])
                .map_err(|e| AppError::Storage(format!("delete {url}: {e}")))?;
        }
        tx.commit().map_err(|e| AppError::Storage(format!("commit remove: {e}")))?;
        Ok(())
    }

    pub fn clear(&self) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute_batch("DELETE FROM site_meta_cache")
            .map_err(|e| AppError::Storage(format!("clear site_meta_cache: {e}")))?;
        Ok(())
    }

    /// 只读计数（不载入整表——含 512KB data-URI 行时 get_all 内存开销大）。
    pub fn count(&self) -> Result<usize, AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row("SELECT COUNT(*) FROM site_meta_cache", [], |row| row.get::<_, i64>(0))
            .map(|n| n as usize)
            .map_err(|e| AppError::Storage(format!("count site_meta_cache: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    fn open_test_store(name: &str) -> Arc<SiteMetaCacheStore> {
        let dir = temp_dir().join(format!("adl-site-meta-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        SiteMetaCacheStore::open(&dir).unwrap()
    }

    fn entry(title: &str) -> SiteMetaCacheEntry {
        SiteMetaCacheEntry {
            title: title.to_string(),
            title_source: "".into(),
            favicon_url: format!("https://{title}/favicon.ico"),
            favicon_data_uri: "data:image/png;base64,AAAA".to_string(),
            fetched_at: 1700000000000,
            last_ok_at: 0,
            next_retry_at: 0,
            fail_count: 0,
        }
    }

    #[test]
    fn upsert_then_get_all_roundtrips() {
        let store = open_test_store("roundtrip");
        let mut map = HashMap::new();
        map.insert("https://a.com/".to_string(), entry("A"));
        map.insert("https://b.com/x".to_string(), entry("B"));
        store.upsert(&map).unwrap();
        let all = store.get_all().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.get("https://a.com/").unwrap().title, "A");
        assert_eq!(all.get("https://b.com/x").unwrap().fetched_at, 1700000000000);
    }

    #[test]
    fn upsert_replaces_existing_row() {
        let store = open_test_store("replace");
        let mut m1 = HashMap::new();
        m1.insert("https://a.com/".to_string(), entry("old"));
        store.upsert(&m1).unwrap();
        let mut m2 = HashMap::new();
        m2.insert("https://a.com/".to_string(), entry("new"));
        store.upsert(&m2).unwrap();
        assert_eq!(store.get_all().unwrap().len(), 1);
        assert_eq!(store.get_all().unwrap().get("https://a.com/").unwrap().title, "new");
    }

    #[test]
    fn remove_deletes_rows() {
        let store = open_test_store("remove");
        let mut map = HashMap::new();
        map.insert("https://a.com/".to_string(), entry("A"));
        map.insert("https://b.com/x".to_string(), entry("B"));
        store.upsert(&map).unwrap();
        store.remove(&["https://a.com/".to_string()]).unwrap();
        let all = store.get_all().unwrap();
        assert_eq!(all.len(), 1);
        assert!(all.contains_key("https://b.com/x"));
    }

    #[test]
    fn clear_empties_store() {
        let store = open_test_store("clear");
        let mut map = HashMap::new();
        map.insert("https://a.com/".to_string(), entry("A"));
        store.upsert(&map).unwrap();
        store.clear().unwrap();
        assert!(store.get_all().unwrap().is_empty());
    }

    #[test]
    fn count_matches_upserted_rows() {
        let store = open_test_store("count");
        assert_eq!(store.count().unwrap(), 0);
        let mut map = HashMap::new();
        map.insert("https://a.com/".to_string(), entry("A"));
        map.insert("https://b.com/x".to_string(), entry("B"));
        store.upsert(&map).unwrap();
        assert_eq!(store.count().unwrap(), 2, "count 应反映 upsert 后的行数");
        store.remove(&["https://a.com/".to_string()]).unwrap();
        assert_eq!(store.count().unwrap(), 1);
        store.clear().unwrap();
        assert_eq!(store.count().unwrap(), 0);
    }

    #[test]
    fn empty_store_returns_empty_map() {
        let store = open_test_store("empty");
        assert!(store.get_all().unwrap().is_empty());
    }

    #[test]
    fn entry_with_new_fields_roundtrips() {
        let dir = temp_dir().join(format!("adl-site-meta-newfields-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let store = SiteMetaCacheStore::open(&dir).unwrap();
        let mut map = HashMap::new();
        map.insert(
            "https://a.com/".to_string(),
            SiteMetaCacheEntry {
                title: "A".into(),
                title_source: "http".into(),
                favicon_url: "https://a.com/icon.png".into(),
                favicon_data_uri: "data:image/png;base64,AAAA".into(),
                fetched_at: 1,
                last_ok_at: 2,
                next_retry_at: 3,
                fail_count: 4,
            },
        );
        store.upsert(&map).unwrap();
        let all = store.get_all().unwrap();
        let e = all.get("https://a.com/").unwrap();
        assert_eq!(e.title_source, "http");
        assert_eq!(e.last_ok_at, 2);
        assert_eq!(e.next_retry_at, 3);
        assert_eq!(e.fail_count, 4);
    }

    #[test]
    fn normalize_cache_key_strips_hash_and_trailing_slash() {
        // 预期与前端 normalizeUrlForCache 一致（siteMetaCache.test.ts）：路径的尾部斜杠全部去除。
        assert_eq!(normalize_cache_key("https://a.com/path/#sec"), "https://a.com/path");
        assert_eq!(normalize_cache_key("https://a.com/path//"), "https://a.com/path");
        assert_eq!(normalize_cache_key("https://a.com"), "https://a.com/");
    }

    #[test]
    fn normalize_cache_key_strips_auth_token() {
        // 一次性认证参数不进缓存键（R1-Medium；与前端 siteMetaCache.test.ts 同断言）。
        assert_eq!(
            normalize_cache_key("http://127.0.0.1:3080/?token=abc"),
            "http://127.0.0.1:3080/"
        );
        assert_eq!(
            normalize_cache_key("https://a.com/p?x=1&token=abc&y=2"),
            "https://a.com/p?x=1&y=2"
        );
        // 非 token 参数不受影响。
        assert_eq!(normalize_cache_key("https://a.com/p?x=1"), "https://a.com/p?x=1");
    }

    #[test]
    fn open_rebuilds_stale_table_missing_new_columns() {
        // 模拟早期迭代创建的旧表（仅 5 列，无 title_source/last_ok_at/next_retry_at/fail_count）。
        // CREATE TABLE IF NOT EXISTS 不会补列 → 旧库 get_all/upsert 会因 "no such column" 失败。
        let dir = temp_dir().join(format!("adl-site-meta-stale-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("site-meta-cache.db");
        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "CREATE TABLE site_meta_cache (
                    url              TEXT PRIMARY KEY,
                    title            TEXT NOT NULL DEFAULT '',
                    favicon_url      TEXT NOT NULL DEFAULT '',
                    favicon_data_uri TEXT NOT NULL DEFAULT '',
                    fetched_at       INTEGER NOT NULL
                );",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO site_meta_cache (url, title, favicon_url, favicon_data_uri, fetched_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params!["https://stale.com/", "旧标题", "https://stale.com/f.ico", "", 1700000000000i64],
            )
            .unwrap();
        }

        let store = SiteMetaCacheStore::open(&dir).unwrap();
        // 旧表被丢弃重建（PRAGMA 校验缺列 → drop + recreate）
        let mut map = HashMap::new();
        map.insert(
            "https://stale.com/".to_string(),
            SiteMetaCacheEntry {
                title: "新标题".into(),
                title_source: "http".into(),
                favicon_url: "https://stale.com/f.ico".into(),
                favicon_data_uri: "".into(),
                fetched_at: 1700000000000,
                last_ok_at: 1,
                next_retry_at: 0,
                fail_count: 0,
            },
        );
        store.upsert(&map).unwrap();
        let all = store.get_all().unwrap();
        let e = all.get("https://stale.com/").unwrap();
        assert_eq!(e.title, "新标题");
        assert_eq!(e.title_source, "http");
        assert_eq!(e.last_ok_at, 1);
    }
}
