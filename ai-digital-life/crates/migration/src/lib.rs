use adl_errors::AppError;
use adl_storage::Database;
use tracing::info;

pub struct Migration {
    pub version: i64,
    pub description: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    description: "Initial schema",
    sql: "", // schema_version + recent_workspaces + app_state created by Database::init_schema
}];

pub fn current_version(db: &Database) -> Result<i64, AppError> {
    let conn = db.conn();
    let version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |r| r.get(0),
        )
        .map_err(|e| AppError::Migration(e.to_string()))?;
    Ok(version)
}

pub fn run_pending(db: &Database) -> Result<(), AppError> {
    let current = current_version(db)?;
    for m in MIGRATIONS.iter().filter(|m| m.version > current) {
        if !m.sql.is_empty() {
            db.conn()
                .execute_batch(m.sql)
                .map_err(|e| AppError::Migration(format!("v{}: {e}", m.version)))?;
        }
        db.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            &[&m.version as &dyn rusqlite::types::ToSql],
        )?;
        info!(
            version = m.version,
            desc = m.description,
            "migration applied"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_version_returns_zero_when_no_migrations() {
        let path = std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 0);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn current_version_returns_max_applied_version() {
        let path = std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            &[&1 as &dyn rusqlite::types::ToSql],
        )
        .unwrap();
        db.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            &[&2 as &dyn rusqlite::types::ToSql],
        )
        .unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 2);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn run_pending_applies_pending_migrations() {
        let path = std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        let result = run_pending(&db);
        assert!(result.is_ok());
        let version = current_version(&db).unwrap();
        assert_eq!(version, 1);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn run_pending_is_idempotent() {
        let path = std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        run_pending(&db).unwrap();
        run_pending(&db).unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 1);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn migration_records_have_correct_structure() {
        assert_eq!(MIGRATIONS.len(), 1);
        let m = &MIGRATIONS[0];
        assert_eq!(m.version, 1);
        assert_eq!(m.description, "Initial schema");
    }
}
