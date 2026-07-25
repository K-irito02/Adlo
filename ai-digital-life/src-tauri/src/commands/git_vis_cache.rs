use adl_errors::AppError;
use adl_storage::Database;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

pub const CHART_TYPE_DAILY_COMMITS: &str = "daily_commits";

pub(crate) fn read_cached_chart<T: DeserializeOwned>(
    db: &Database,
    root_path: &str,
    year: i32,
    chart_type: &str,
) -> Result<Option<T>, AppError> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT data FROM git_vis_cache WHERE root_path = ?1 AND year = ?2 AND chart_type = ?3",
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let result: Option<String> = stmt
        .query_row(rusqlite::params![root_path, year, chart_type], |row| row.get(0))
        .map_err(|e| AppError::Storage(e.to_string()))
        .ok();

    match result {
        Some(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| AppError::Internal(format!("cache deserialize: {e}"))),
        None => Ok(None),
    }
}

pub(crate) fn cache_chart_data<T: Serialize>(
    db: &Database,
    root_path: &str,
    year: i32,
    chart_type: &str,
    data: &T,
) -> Result<(), AppError> {
    let json = serde_json::to_string(data)
        .map_err(|e| AppError::Internal(format!("cache serialize: {e}")))?;
    db.execute(
        "INSERT OR REPLACE INTO git_vis_cache (root_path, year, chart_type, data) VALUES (?1, ?2, ?3, ?4)",
        &[&root_path.to_string(), &year.to_string(), &chart_type.to_string(), &json],
    )?;
    Ok(())
}

pub fn extract_year(date_str: &str) -> Option<i32> {
    if date_str.len() >= 4 {
        date_str[0..4].parse().ok()
    } else {
        None
    }
}

pub fn is_historical_year(year: i32) -> bool {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let current_year = 1970 + (secs / 31_557_600) as i32;
    year < current_year
}

pub(crate) async fn get_first_commit_year(root_path: &Path) -> Result<Option<i32>, AppError> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root_path.as_os_str())
        .args(["log", "--reverse", "--format=%aI", "--max-count=1"])
        .output()
        .await
        .map_err(|e| AppError::Workspace(format!("git log --reverse failed: {e}")))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let date_str = stdout.trim();
        if date_str.len() >= 4 {
            let year: i32 = date_str[0..4].parse().map_err(|_| {
                AppError::Workspace("failed to parse year from git log output".into())
            })?;
            Ok(Some(year))
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}
