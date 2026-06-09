use adl_errors::AppError;
use adl_kernel::now_ms;
use rusqlite::params;

use crate::connection::Database;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecentWorkspaceRow {
    pub root_path: String,
    pub name: String,
    pub last_opened: String,
    pub json: Option<String>,
}

pub struct WorkspaceRepository<'a> {
    db: &'a Database,
}

impl<'a> WorkspaceRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn list_recent(&self) -> Result<Vec<RecentWorkspaceRow>, AppError> {
        let conn = self.db.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT root_path, name, last_opened, json \
                 FROM recent_workspaces ORDER BY last_opened DESC",
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(RecentWorkspaceRow {
                    root_path: row.get(0)?,
                    name: row.get(1)?,
                    last_opened: row.get(2)?,
                    json: row.get(3)?,
                })
            })
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(rows)
    }

    pub fn find_by_root(&self, root_path: &str) -> Result<Option<RecentWorkspaceRow>, AppError> {
        let conn = self.db.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT root_path, name, last_opened, json \
                 FROM recent_workspaces WHERE root_path = ?1",
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let mut rows = stmt
            .query_map(params![root_path], |row| {
                Ok(RecentWorkspaceRow {
                    root_path: row.get(0)?,
                    name: row.get(1)?,
                    last_opened: row.get(2)?,
                    json: row.get(3)?,
                })
            })
            .map_err(|e| AppError::Storage(e.to_string()))?;
        match rows.next() {
            Some(Ok(row)) => Ok(Some(row)),
            Some(Err(e)) => Err(AppError::Storage(e.to_string())),
            None => Ok(None),
        }
    }

    pub fn upsert_recent(&self, root_path: &str, name: &str, json: &str) -> Result<(), AppError> {
        let now = now_ms().to_string();
        self.db.execute(
            "INSERT OR REPLACE INTO recent_workspaces (root_path, name, last_opened, json) \
             VALUES (?1, ?2, ?3, ?4)",
            &[&root_path as &dyn rusqlite::types::ToSql, &name, &now, &json],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    fn temp_db(name: &str) -> Database {
        let path = temp_dir().join(format!("adl-repo-test-{name}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[test]
    fn test_list_recent_empty() {
        let db = temp_db("list-empty");
        let repo = WorkspaceRepository::new(&db);
        let rows = repo.list_recent().unwrap();
        assert!(rows.is_empty());
        let _ = std::fs::remove_file(temp_dir().join("adl-repo-test-list-empty.db"));
    }

    #[test]
    fn test_upsert_and_list() {
        let db = temp_db("upsert-list");
        let repo = WorkspaceRepository::new(&db);

        repo.upsert_recent("/tmp/a", "Workspace A", r#"{"key":"a"}"#).unwrap();
        repo.upsert_recent("/tmp/b", "Workspace B", r#"{"key":"b"}"#).unwrap();

        let rows = repo.list_recent().unwrap();
        assert_eq!(rows.len(), 2);

        let names: Vec<&str> = rows.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"Workspace A"));
        assert!(names.contains(&"Workspace B"));

        let _ = std::fs::remove_file(temp_dir().join("adl-repo-test-upsert-list.db"));
    }

    #[test]
    fn test_find_by_root() {
        let db = temp_db("find-root");
        let repo = WorkspaceRepository::new(&db);

        repo.upsert_recent("/tmp/find-me", "Find Me", r#"{"id":"find"}"#).unwrap();

        let found = repo.find_by_root("/tmp/find-me").unwrap();
        assert!(found.is_some());
        let row = found.unwrap();
        assert_eq!(row.root_path, "/tmp/find-me");
        assert_eq!(row.name, "Find Me");
        assert_eq!(row.json.as_deref(), Some(r#"{"id":"find"}"#));

        let _ = std::fs::remove_file(temp_dir().join("adl-repo-test-find-root.db"));
    }

    #[test]
    fn test_find_by_root_not_found() {
        let db = temp_db("find-miss");
        let repo = WorkspaceRepository::new(&db);

        repo.upsert_recent("/tmp/exists", "Exists", "{}").unwrap();
        let found = repo.find_by_root("/tmp/nope").unwrap();
        assert!(found.is_none());

        let _ = std::fs::remove_file(temp_dir().join("adl-repo-test-find-miss.db"));
    }

    #[test]
    fn test_upsert_replaces_existing() {
        let db = temp_db("upsert-replace");
        let repo = WorkspaceRepository::new(&db);

        repo.upsert_recent("/tmp/dup", "Old Name", r#"{"v":1}"#).unwrap();
        repo.upsert_recent("/tmp/dup", "New Name", r#"{"v":2}"#).unwrap();

        let rows = repo.list_recent().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "New Name");
        assert_eq!(rows[0].json.as_deref(), Some(r#"{"v":2}"#));

        let _ = std::fs::remove_file(temp_dir().join("adl-repo-test-upsert-replace.db"));
    }
}
