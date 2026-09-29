use crate::error::{LogError, LogResult};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_SESSIONS: usize = 30;

/// prune 结果：删除成功数 + 删除失败明细。失败明细由调用方在锁外打日志 ——
// 本函数自身禁止 tracing（调用方持有 sessions `Mutex` 期间调本函数，函数内打日志会经
// 文件层重入同一把非重入锁而自死锁，见根因事项）。
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PruneReport {
    pub removed: usize,
    pub failed: Vec<PruneFailure>,
}

/// 单文件删除失败明细（含原因，避免相对修复前的可观测性退化）。
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PruneFailure {
    pub path: PathBuf,
    pub error: String,
}

/// Per-target session-file tracker (prefix + log dir + current timestamp).
/// 经 crate root 重导出（barrel 规则），供未来外部消费者直接引用。
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

    pub fn prune_old_sessions(&self) -> LogResult<PruneReport> {
        // IO-UNDER-LOCK 注记：调用方在持有 sessions `Mutex` 期间调本函数，
        // `read_dir` + `remove_file` 的 I/O 会短暂阻塞其它等锁线程（stall，非死锁；
        // 持锁者只做 I/O 必释放）。无快照重构是刻意取舍：tracker 仅 3 字段，
        // 拆快照 API 的 churn 收益不及成本；慢盘 + 文件超 30 个时才可观测。
        let sessions = list_session_files(&self.log_dir, &self.prefix)?;

        if sessions.len() <= MAX_SESSIONS {
            return Ok(PruneReport::default());
        }

        let mut sessions = sessions;
        sessions.sort();
        let to_remove = sessions.len() - MAX_SESSIONS;
        let mut report = PruneReport::default();

        for path in sessions.iter().take(to_remove) {
            if let Err(e) = remove_session_file(path) {
                // 锁内禁 tracing：失败明细只收集，由调用方在 sessions 锁外统一打日志。
                report.failed.push(PruneFailure { path: path.clone(), error: e.to_string() });
            } else {
                report.removed += 1;
            }
        }

        Ok(report)
    }
}

fn list_session_files(log_dir: &Path, prefix: &str) -> LogResult<Vec<PathBuf>> {
    let entries = std::fs::read_dir(log_dir)
        .map_err(|e| LogError::Session(format!("read_dir failed: {e}")))?;
    Ok(entries
        // 刻意跳过单条目错误（权限/瞬时 I/O）：prune 是尽力清理，
        // 目录级失败仍经 `?` 传播；单条目失败不值得 abort 整轮。
        .filter_map(|entry| entry.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|name| name.starts_with(&format!("{prefix}-")) && name.ends_with(".txt"))
                .unwrap_or(false)
        })
        .collect())
}

fn remove_session_file(path: &Path) -> std::io::Result<()> {
    std::fs::remove_file(path)
}

fn session_timestamp() -> String {
    // 时钟早于 epoch（虚拟机/测试时钟偏移）时回退 1970 时间戳：仅病态时钟可达，
    // 可能与真实会话文件碰撞改变 prune 排序；可接受，不做兼容处理。
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
        assert!(removed.removed >= 5, "removed {}, expected >=5", removed.removed);

        let remaining: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).collect();
        assert!(remaining.len() <= MAX_SESSIONS);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 回归 R2：持 sessions 锁调 prune，失败路径不得打日志（否则经文件层重入同一把
    /// 非重入 `Mutex` 自死锁）。用删不掉的目录项（`remove_file` 在目录上失败）强制走
    /// 失败路径：修复前 `tracing::warn!` → writer 锁 sessions → 超时；修复后收集返回。
    #[test]
    fn prune_failure_does_not_log_while_holding_session_lock() {
        use std::sync::{Arc, Mutex, mpsc};
        use std::time::Duration;
        use tracing_subscriber::fmt::writer::MakeWriter;

        /// 与生产 `TerminalWriter` 同构：事件落盘前先锁 sessions。
        #[derive(Clone)]
        struct SessionLockingMakeWriter {
            sessions: Arc<Mutex<SessionTracker>>,
        }
        struct SessionLockingWriter {
            sessions: Arc<Mutex<SessionTracker>>,
        }
        impl<'a> MakeWriter<'a> for SessionLockingMakeWriter {
            type Writer = SessionLockingWriter;
            fn make_writer(&'a self) -> Self::Writer {
                SessionLockingWriter { sessions: self.sessions.clone() }
            }
        }
        impl std::io::Write for SessionLockingWriter {
            fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
                let _guard = self
                    .sessions
                    .lock()
                    .map_err(|_| std::io::Error::other("session lock poisoned"))?;
                Ok(buf.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }

        let dir = std::env::temp_dir().join("adl-log-session-prune-fail");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // 删不掉的条目：目录满足会话文件名前缀/后缀过滤，但 `remove_file` 必失败。
        // 排序最前，保证落在待删除窗口内。
        std::fs::create_dir(dir.join("test-000000.txt")).unwrap();
        for i in 0..35 {
            let path = dir.join(format!("test-2026-06-27_{:02}0000.txt", i));
            std::fs::write(&path, "data").unwrap();
        }

        let sessions = Arc::new(Mutex::new(SessionTracker::new(&dir, "test")));
        let subscriber = tracing_subscriber::fmt()
            .with_writer(SessionLockingMakeWriter { sessions: sessions.clone() })
            .with_ansi(false)
            .finish();

        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let r = tracing::subscriber::with_default(subscriber, || {
                // 持锁调 prune：与 `set_mode(Multi)` / `prune_sessions_sync` 同构。
                let guard = sessions.lock().unwrap();
                guard.prune_old_sessions()
            });
            let _ = tx.send(r);
        });

        let report = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("prune timed out: failure path logged while holding the session lock")
            .unwrap();
        assert_eq!(report.failed.len(), 1);
        assert!(!report.failed[0].error.is_empty());
        assert!(report.removed >= 1);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
