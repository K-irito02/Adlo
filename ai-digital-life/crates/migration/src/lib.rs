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
