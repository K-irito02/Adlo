use adl_errors::AppError;
use adl_storage::Database;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::future::Future;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

pub const CHART_TYPE_DAILY_COMMITS: &str = "daily_commits";
pub const CHART_TYPE_CODE_EVOLUTION: &str = "code_evolution_daily";
pub const CHART_TYPE_CONTRIBUTOR_MODULES: &str = "contributor_modules";

pub(crate) async fn with_cached<T, F, Fut>(
    db: &Database,
    root_path: &str,
    since: Option<&str>,
    until: Option<&str>,
    chart_type: &str,
    fetcher: F,
) -> Result<T, AppError>
where
    T: DeserializeOwned + Serialize,
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    // Only cache fully-historical ranges: any range touching the current year
    // changes as new commits land, so it must always be recomputed.
    let cacheable = match (since.and_then(extract_year), until.and_then(extract_year)) {
        (Some(_sy), Some(uy)) => is_historical_year(uy),
        _ => false,
    };

    if cacheable {
        if let Some(cached) = read_cached_chart::<T>(db, root_path, since, until, chart_type)? {
            return Ok(cached);
        }
    }

    let data = fetcher().await?;

    if cacheable {
        if let Err(e) = cache_chart_data(db, root_path, since, until, chart_type, &data) {
            tracing::warn!("[ADL-CACHE] failed to write cache: {e}");
        }
    }

    Ok(data)
}

pub(crate) fn read_cached_chart<T: DeserializeOwned>(
    db: &Database,
    root_path: &str,
    since: Option<&str>,
    until: Option<&str>,
    chart_type: &str,
) -> Result<Option<T>, AppError> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT data FROM git_vis_cache WHERE root_path = ?1 AND since = ?2 AND until = ?3 AND chart_type = ?4",
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let result: Option<String> = stmt
        .query_row(
            rusqlite::params![root_path, since.unwrap_or(""), until.unwrap_or(""), chart_type],
            |row| row.get(0),
        )
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
    since: Option<&str>,
    until: Option<&str>,
    chart_type: &str,
    data: &T,
) -> Result<(), AppError> {
    let json = serde_json::to_string(data)
        .map_err(|e| AppError::Internal(format!("cache serialize: {e}")))?;
    db.execute(
        "INSERT OR REPLACE INTO git_vis_cache (root_path, since, until, chart_type, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        &[
            &root_path.to_string(),
            &since.unwrap_or("").to_string(),
            &until.unwrap_or("").to_string(),
            &chart_type.to_string(),
            &json,
        ],
    )?;
    Ok(())
}

pub fn extract_year(date_str: &str) -> Option<i32> {
    if date_str.len() >= 4 { date_str[0..4].parse().ok() } else { None }
}

pub fn is_historical_year(year: i32) -> bool {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static CACHE_DB_SEQ: AtomicUsize = AtomicUsize::new(0);

    fn temp_db_path() -> PathBuf {
        let id = CACHE_DB_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("adl-git-vis-cache-{id}.db"));
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
        path
    }

    #[test]
    fn test_extract_year() {
        assert_eq!(extract_year("2024-01-01"), Some(2024));
        assert_eq!(extract_year("202"), None);
    }

    #[test]
    fn test_is_historical_year() {
        assert!(is_historical_year(2020));
        assert!(!is_historical_year(2099));
    }

    fn current_year() -> i32 {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        1970 + (secs / 31_557_600) as i32
    }

    #[test]
    fn with_cached_reuses_cache_for_identical_historical_range() {
        let db = Database::open(&temp_db_path()).expect("db opens");
        db.init_schema().expect("schema inits");
        let calls = AtomicUsize::new(0);

        let fetch = || {
            calls.fetch_add(1, Ordering::SeqCst);
            async { Ok::<_, AppError>("data-v1".to_string()) }
        };

        let r1 = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(with_cached(
                &db,
                "/ws",
                Some("2020-01-01"),
                Some("2020-03-31"),
                "chart",
                fetch,
            ))
            .unwrap();
        assert_eq!(r1, "data-v1");
        let r2 = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(with_cached(
                &db,
                "/ws",
                Some("2020-01-01"),
                Some("2020-03-31"),
                "chart",
                fetch,
            ))
            .unwrap();
        assert_eq!(r2, "data-v1");
        assert_eq!(calls.load(Ordering::SeqCst), 1, "identical range must hit cache");
    }

    #[test]
    fn with_cached_different_range_same_year_misses() {
        let db = Database::open(&temp_db_path()).expect("db opens");
        db.init_schema().expect("schema inits");
        let calls = AtomicUsize::new(0);
        let calls_ref = &calls;
        let make_fetch = |val: &'static str| {
            let v = val.to_string();
            move || {
                calls_ref.fetch_add(1, Ordering::SeqCst);
                let v = v.clone();
                async move { Ok::<_, AppError>(v) }
            }
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let a = rt
            .block_on(with_cached(
                &db,
                "/ws",
                Some("2020-01-01"),
                Some("2020-03-31"),
                "chart",
                make_fetch("jan-mar"),
            ))
            .unwrap();
        assert_eq!(a, "jan-mar");
        // Same year, different months → must NOT be served from the first cache row.
        let b = rt
            .block_on(with_cached(
                &db,
                "/ws",
                Some("2020-04-01"),
                Some("2020-06-30"),
                "chart",
                make_fetch("apr-jun"),
            ))
            .unwrap();
        assert_eq!(b, "apr-jun");
        assert_eq!(calls.load(Ordering::SeqCst), 2, "different ranges must not collide");
    }

    #[test]
    fn with_cached_does_not_cache_ranges_touching_current_year() {
        let db = Database::open(&temp_db_path()).expect("db opens");
        db.init_schema().expect("schema inits");
        let calls = AtomicUsize::new(0);
        let now_year = current_year();
        let since = format!("{now_year}-01-01");
        let until = format!("{now_year}-12-31");

        let fetch = || {
            calls.fetch_add(1, Ordering::SeqCst);
            async { Ok::<_, AppError>("live".to_string()) }
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let a = rt
            .block_on(with_cached(&db, "/ws", Some(&since), Some(&until), "chart", fetch))
            .unwrap();
        assert_eq!(a, "live");
        let b = rt
            .block_on(with_cached(&db, "/ws", Some(&since), Some(&until), "chart", fetch))
            .unwrap();
        assert_eq!(b, "live");
        assert_eq!(calls.load(Ordering::SeqCst), 2, "current-year ranges must always recompute");
    }

    #[test]
    fn with_cached_no_range_does_not_cache() {
        let db = Database::open(&temp_db_path()).expect("db opens");
        db.init_schema().expect("schema inits");
        let calls = AtomicUsize::new(0);
        let fetch = || {
            calls.fetch_add(1, Ordering::SeqCst);
            async { Ok::<_, AppError>("all".to_string()) }
        };
        let rt = tokio::runtime::Runtime::new().unwrap();
        let a = rt.block_on(with_cached(&db, "/ws", None, None, "chart", fetch)).unwrap();
        assert_eq!(a, "all");
        let b = rt.block_on(with_cached(&db, "/ws", None, None, "chart", fetch)).unwrap();
        assert_eq!(b, "all");
        assert_eq!(calls.load(Ordering::SeqCst), 2, "no-filter queries must always recompute");
    }
}
