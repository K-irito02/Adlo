use adl_errors::AppError;
use adl_storage::Database;
use rusqlite::OptionalExtension;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;

pub(crate) fn cache_chart_data<T: Serialize>(
    db: &Database,
    root_path: &str,
    year: i32,
    chart_type: &str,
    data: &T,
) -> Result<(), AppError> {
    let json = serde_json::to_string(data)
        .map_err(|e| AppError::Internal(format!("failed to serialize cache data: {e}")))?;
    db.execute(
        "INSERT OR REPLACE INTO git_vis_cache (root_path, year, chart_type, data) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![root_path, year, chart_type, json],
    )?;
    Ok(())
}

pub(crate) fn read_cached_chart<T: DeserializeOwned>(
    db: &Database,
    root_path: &str,
    year: i32,
    chart_type: &str,
) -> Result<Option<T>, AppError> {
    let conn = db.conn()?;
    let result: Option<String> = conn
        .query_row(
            "SELECT data FROM git_vis_cache WHERE root_path = ?1 AND year = ?2 AND chart_type = ?3",
            rusqlite::params![root_path, year, chart_type],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    match result {
        Some(json) => {
            let data: T = serde_json::from_str(&json)
                .map_err(|e| AppError::Internal(format!("failed to deserialize cache: {e}")))?;
            Ok(Some(data))
        },
        None => Ok(None),
    }
}

pub(crate) fn invalidate_cache_for_root(db: &Database, root_path: &str) -> Result<(), AppError> {
    db.execute("DELETE FROM git_vis_cache WHERE root_path = ?1", rusqlite::params![root_path])?;
    Ok(())
}

pub(crate) async fn get_first_commit_year(root: &Path) -> Result<Option<i32>, AppError> {
    let root_owned = root.to_path_buf();
    let result = tokio::time::timeout(std::time::Duration::from_secs(30), async move {
        tokio::task::spawn_blocking(move || {
            let output = std::process::Command::new("git")
                .args(["log", "--reverse", "--pretty=format:%aI"])
                .current_dir(&root_owned)
                .output()
                .ok()?;
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_line = stdout.lines().next()?;
                if first_line.len() >= 4 {
                    first_line[..4].parse::<i32>().ok()
                } else {
                    None
                }
            } else {
                None
            }
        })
        .await
        .ok()?
    })
    .await;

    Ok(result.ok().flatten())
}
