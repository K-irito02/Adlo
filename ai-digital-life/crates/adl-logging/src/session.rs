use crate::error::{LogError, LogResult};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_SESSIONS: usize = 30;

#[derive(Debug)]
pub struct SessionTracker {
    prefix: String,
    log_dir: PathBuf,
    current_ts: String,
}

impl SessionTracker {
    pub fn new(log_dir: &Path, prefix: &str) -> Self {
        Self {
            prefix: prefix.to_string(),
            log_dir: log_dir.to_path_buf(),
            current_ts: session_timestamp(),
        }
    }

    pub fn current_timestamp(&self) -> &str {
        &self.current_ts
    }

    pub fn session_file_path(&self) -> PathBuf {
        self.log_dir.join(format!("{}-{}.txt", self.prefix, self.current_ts))
    }

    pub fn prune_old_sessions(&self) -> LogResult<usize> {
        let mut sessions: Vec<PathBuf> = match std::fs::read_dir(&self.log_dir) {
            Ok(entries) => entries
                .filter_map(|entry| entry.ok())
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|name| {
                            name.starts_with(&format!("{}-", self.prefix)) && name.ends_with(".txt")
                        })
                        .unwrap_or(false)
                })
                .collect(),
            Err(e) => return Err(LogError::Session(format!("read_dir failed: {e}"))),
        };

        if sessions.len() <= MAX_SESSIONS {
            return Ok(0);
        }

        sessions.sort();
        let to_remove = sessions.len() - MAX_SESSIONS;
        let mut removed = 0;

        for path in sessions.iter().take(to_remove) {
            if let Err(e) = std::fs::remove_file(path) {
                tracing::warn!("Failed to prune session file {:?}: {e}", path);
            } else {
                removed += 1;
            }
        }

        Ok(removed)
    }
}

fn session_timestamp() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = now.as_secs();
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let total_days = (secs / 86400) as i64;
    let (y, m, d) = days_since_epoch_to_date(total_days);
    format!("{:04}-{:02}-{:02}_{:02}{:02}{:02}", y, m, d, hours, minutes, seconds)
}

fn days_since_epoch_to_date(days: i64) -> (i64, u32, u32) {
    let mut y = 1970i64;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 1u32;
    for &md in &month_days {
        if remaining < md as i64 {
            break;
        }
        remaining -= md as i64;
        m += 1;
    }
    (y, m, (remaining + 1) as u32)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_timestamp_format() {
        let ts = session_timestamp();
        assert_eq!(ts.len(), 17, "expected YYYY-MM-DD_HHMMSS got {ts}");
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "_");
    }

    #[test]
    fn prune_removes_excess_sessions() {
        let dir = std::env::temp_dir().join("adl-log-session-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let tracker = SessionTracker::new(&dir, "test");

        for i in 0..35 {
            let path = dir.join(format!("test-2026-06-27_{:02}0000.txt", i));
            std::fs::write(&path, "data").unwrap();
        }

        let removed = tracker.prune_old_sessions().unwrap();
        assert!(removed >= 5, "removed {removed}, expected >=5");

        let remaining: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).collect();
        assert!(remaining.len() <= MAX_SESSIONS);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
