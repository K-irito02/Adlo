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
    pub favicon_url: String,
    pub favicon_data_uri: String,
    pub fetched_at: i64,
}

const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS site_meta_cache (
    url              TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    favicon_url      TEXT NOT NULL DEFAULT '',
    favicon_data_uri TEXT NOT NULL DEFAULT '',
    fetched_at       INTEGER NOT NULL
);";

pub struct SiteMetaCacheStore {
    db: Mutex<Connection>,
}

impl SiteMetaCacheStore {
    pub fn open(data_dir: &Path) -> Result<Arc<Self>, AppError> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("site-meta-cache.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::Storage(format!("open site-meta-cache.db: {e}")))?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::Storage(format!("set WAL: {e}")))?;
        conn.execute_batch(CREATE_TABLE_SQL)
            .map_err(|e| AppError::Storage(format!("create site_meta_cache table: {e}")))?;
        Ok(Arc::new(Self { db: Mutex::new(conn) }))
    }

    pub fn get_all(&self) -> Result<HashMap<String, SiteMetaCacheEntry>, AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare(
                "SELECT url, title, favicon_url, favicon_data_uri, fetched_at FROM site_meta_cache",
            )
            .map_err(|e| AppError::Storage(format!("prepare select: {e}")))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    SiteMetaCacheEntry {
                        title: row.get(1)?,
                        favicon_url: row.get(2)?,
                        favicon_data_uri: row.get(3)?,
                        fetched_at: row.get(4)?,
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
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        for (url, entry) in entries {
            conn.execute(
                "INSERT OR REPLACE INTO site_meta_cache (url, title, favicon_url, favicon_data_uri, fetched_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![url, entry.title, entry.favicon_url, entry.favicon_data_uri, entry.fetched_at],
            )
            .map_err(|e| AppError::Storage(format!("upsert {url}: {e}")))?;
        }
        Ok(())
    }

    pub fn remove(&self, urls: &[String]) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        for url in urls {
            conn.execute("DELETE FROM site_meta_cache WHERE url = ?1", params![url])
                .map_err(|e| AppError::Storage(format!("delete {url}: {e}")))?;
        }
        Ok(())
    }

    pub fn clear(&self) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute_batch("DELETE FROM site_meta_cache")
            .map_err(|e| AppError::Storage(format!("clear site_meta_cache: {e}")))?;
        Ok(())
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
            favicon_url: format!("https://{title}/favicon.ico"),
            favicon_data_uri: "data:image/png;base64,AAAA".to_string(),
            fetched_at: 1700000000000,
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
    fn empty_store_returns_empty_map() {
        let store = open_test_store("empty");
        assert!(store.get_all().unwrap().is_empty());
    }
}
