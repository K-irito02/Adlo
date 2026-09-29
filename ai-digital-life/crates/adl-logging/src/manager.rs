use crate::config::{LogConfig, log_file_path, session_log_path};
use crate::error::{LogError, LogResult};
use crate::mode::{LogMode, LogTarget};
use crate::session::{PruneReport, SessionTracker};

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

use tokio::task::spawn_blocking;

use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer, Registry, fmt};

// ── CST (UTC+8) time formatter ──

struct CstTime;

impl tracing_subscriber::fmt::time::FormatTime for CstTime {
    fn format_time(&self, w: &mut tracing_subscriber::fmt::format::Writer<'_>) -> std::fmt::Result {
        let now = chrono::Local::now();
        write!(w, "{}", now.format("%Y-%m-%dT%H:%M:%S%.3f"))
    }
}

// ── Shared file state ──

struct TerminalFileState {
    writer: BufWriter<File>,
    mode: LogMode,
    session_ts: Option<String>,
}

// ── LogManager ──

pub struct LogManager {
    config: Arc<RwLock<LogConfig>>,
    log_dir: PathBuf,
    terminal_sessions: Arc<Mutex<SessionTracker>>,
    debug_sessions: Arc<Mutex<SessionTracker>>,
    #[allow(dead_code)]
    // Lifetime anchor: keeps the Arc alive so TerminalMakeWriter's clone remains valid
    terminal_file: Arc<Mutex<Option<TerminalFileState>>>,
}

impl LogManager {
    pub fn init(config: &LogConfig, log_dir: &Path) -> LogResult<Self> {
        fs::create_dir_all(log_dir)?;

        let config = Arc::new(RwLock::new(config.clone()));
        let terminal_sessions = Arc::new(Mutex::new(SessionTracker::new(log_dir, "terminal-logs")));
        let debug_sessions = Arc::new(Mutex::new(SessionTracker::new(log_dir, "debug-logs")));
        let terminal_file: Arc<Mutex<Option<TerminalFileState>>> = Arc::new(Mutex::new(None));

        let make_writer = TerminalMakeWriter {
            log_dir: log_dir.to_path_buf(),
            config: config.clone(),
            sessions: terminal_sessions.clone(),
            inner: terminal_file.clone(),
        };

        let stdout_filter =
            || EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

        // File layer writes ALL levels (debug+) so diagnostic tracing::debug!
        // calls are preserved in terminal-logs.txt for post-mortem analysis.
        let file_filter =
            || EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"));

        let stdout_layer = fmt::layer()
            .with_timer(CstTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_filter(stdout_filter());

        let file_layer = fmt::layer()
            .with_ansi(false)
            .with_timer(CstTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(make_writer)
            .with_filter(file_filter());

        // Tolerate a second init in the same process (integration tests spin up
        // multiple engine instances per binary). The production path calls this
        // exactly once; re-init only means "subscriber already installed".
        if let Err(e) = Registry::default().with(stdout_layer).with(file_layer).try_init() {
            tracing::warn!("global tracing subscriber already set, reusing it ({e})");
        }

        // 锁内禁 tracing：prune 只收集失败，守卫释放后再打日志（R2 同类死锁治理）。
        // 注意不用 `lock().map(...)` 链：Err 分支的 PoisonError 会持有守卫并延长借用。
        let terminal_prune: Option<LogResult<PruneReport>> = match terminal_sessions.lock() {
            Ok(sessions) => Some(sessions.prune_old_sessions()),
            Err(_) => {
                tracing::warn!("terminal_sessions lock poisoned, skipping initial prune");
                None
            },
        };
        if let Some(Ok(report)) = &terminal_prune {
            if !report.failed.is_empty() {
                tracing::warn!(
                    "Initial terminal session prune failed for {} files: {:?}",
                    report.failed.len(),
                    report.failed
                );
            }
        } else if let Some(Err(e)) = &terminal_prune {
            tracing::warn!("Initial terminal session prune failed: {e}");
        }
        let debug_prune: Option<LogResult<PruneReport>> = match debug_sessions.lock() {
            Ok(sessions) => Some(sessions.prune_old_sessions()),
            Err(_) => {
                tracing::warn!("debug_sessions lock poisoned, skipping initial prune");
                None
            },
        };
        if let Some(Ok(report)) = &debug_prune {
            if !report.failed.is_empty() {
                tracing::warn!(
                    "Initial debug session prune failed for {} files: {:?}",
                    report.failed.len(),
                    report.failed
                );
            }
        } else if let Some(Err(e)) = &debug_prune {
            tracing::warn!("Initial debug session prune failed: {e}");
        }

        Ok(Self {
            config,
            log_dir: log_dir.to_path_buf(),
            terminal_sessions,
            debug_sessions,
            terminal_file,
        })
    }

    pub fn write_debug_logs(&self, content: &str) -> LogResult<()> {
        let mode = self
            .config
            .read()
            .map_err(|_| LogError::Config("config lock poisoned".into()))?
            .debug_log_mode;

        let fixed_path = log_file_path(&self.log_dir, "debug-logs");

        match mode {
            LogMode::Overwrite => {
                fs::write(&fixed_path, content)?;
            },
            LogMode::Append => {
                let mut file = OpenOptions::new().append(true).create(true).open(&fixed_path)?;
                file.write_all(content.as_bytes())?;
            },
            LogMode::Multi => {
                let ts = self
                    .debug_sessions
                    .lock()
                    .map_err(|_| LogError::Config("session lock poisoned".into()))?
                    .current_timestamp()
                    .to_string();
                let session_path = session_log_path(&self.log_dir, "debug-logs", &ts);
                fs::write(&fixed_path, content)?;
                fs::write(&session_path, content)?;
            },
        }

        Ok(())
    }

    pub fn set_mode(&self, target: LogTarget, mode: LogMode) -> LogResult<()> {
        // 写守卫仅覆盖字段变更：守卫存活期间禁止打日志 —— tracing 文件层
        // （`TerminalWriter::write`）会在同线程读同一把非重入配置 `RwLock`，
        // 守卫内打日志即自死锁（终端日志模式一切换就卡死全进程，见回归测试）。
        // 同理 Multi 分支 prune 期间持有 sessions 锁，prune 内同样禁 tracing（R2）。
        {
            let mut config =
                self.config.write().map_err(|_| LogError::Config("config lock poisoned".into()))?;

            match target {
                LogTarget::Terminal => {
                    config.terminal_log_mode = mode;
                },
                LogTarget::Debug => {
                    config.debug_log_mode = mode;
                },
            }
        }

        if target == LogTarget::Terminal {
            tracing::info!(%mode, "[ADL-LOG] terminal log mode changed");
        }

        if mode == LogMode::Multi {
            // 持 sessions 锁调 prune，prune 内禁 tracing；失败路径守卫释放后打日志（R2）。
            match target {
                LogTarget::Terminal => {
                    let report = self
                        .terminal_sessions
                        .lock()
                        .map_err(|_| LogError::ModeSwitch("session lock".into()))?
                        .prune_old_sessions()?;
                    if !report.failed.is_empty() {
                        tracing::warn!(
                            "terminal session prune failed for {} files: {:?}",
                            report.failed.len(),
                            report.failed
                        );
                    }
                },
                LogTarget::Debug => {
                    let report = self
                        .debug_sessions
                        .lock()
                        .map_err(|_| LogError::ModeSwitch("session lock".into()))?
                        .prune_old_sessions()?;
                    if !report.failed.is_empty() {
                        tracing::warn!(
                            "debug session prune failed for {} files: {:?}",
                            report.failed.len(),
                            report.failed
                        );
                    }
                },
            }
        }

        Ok(())
    }

    pub fn prune_sessions_sync(&self, target: LogTarget) -> LogResult<usize> {
        // 同 R2：锁内禁 tracing，失败守卫释放后打日志；返回语义不变（成功数）。
        let report = match target {
            LogTarget::Terminal => self
                .terminal_sessions
                .lock()
                .map_err(|_| LogError::Session("terminal session lock poisoned".into()))?
                .prune_old_sessions()?,
            LogTarget::Debug => self
                .debug_sessions
                .lock()
                .map_err(|_| LogError::Session("debug session lock poisoned".into()))?
                .prune_old_sessions()?,
        };
        if !report.failed.is_empty() {
            tracing::warn!(
                "session prune failed for {} files: {:?}",
                report.failed.len(),
                report.failed
            );
        }
        Ok(report.removed)
    }

    pub fn prune_sessions(&self, target: LogTarget) -> LogResult<usize> {
        self.prune_sessions_sync(target)
    }

    pub async fn prune_sessions_async(&self, target: LogTarget) -> LogResult<usize> {
        let terminal_sessions = self.terminal_sessions.clone();
        let debug_sessions = self.debug_sessions.clone();
        spawn_blocking(move || {
            let report = match target {
                LogTarget::Terminal => terminal_sessions
                    .lock()
                    .map_err(|_| LogError::Session("terminal session lock poisoned".into()))?
                    .prune_old_sessions()?,
                LogTarget::Debug => debug_sessions
                    .lock()
                    .map_err(|_| LogError::Session("debug session lock poisoned".into()))?
                    .prune_old_sessions()?,
            };
            if !report.failed.is_empty() {
                tracing::warn!(
                    "session prune failed for {} files: {:?}",
                    report.failed.len(),
                    report.failed
                );
            }
            Ok(report.removed)
        })
        .await
        .map_err(|e| LogError::Session(format!("spawn_blocking failed: {e}")))?
    }

    pub fn config(&self) -> Result<LogConfig, LogError> {
        self.config
            .read()
            .map(|c| c.clone())
            .map_err(|_| LogError::Config("config lock poisoned".into()))
    }
}

// ── Terminal MakeWriter ──

struct TerminalMakeWriter {
    log_dir: PathBuf,
    config: Arc<RwLock<LogConfig>>,
    sessions: Arc<Mutex<SessionTracker>>,
    inner: Arc<Mutex<Option<TerminalFileState>>>,
}

impl<'a> tracing_subscriber::fmt::writer::MakeWriter<'a> for TerminalMakeWriter {
    type Writer = TerminalWriter;

    fn make_writer(&'a self) -> Self::Writer {
        TerminalWriter {
            log_dir: self.log_dir.clone(),
            config: self.config.clone(),
            sessions: self.sessions.clone(),
            inner: self.inner.clone(),
        }
    }
}

struct TerminalWriter {
    log_dir: PathBuf,
    config: Arc<RwLock<LogConfig>>,
    sessions: Arc<Mutex<SessionTracker>>,
    inner: Arc<Mutex<Option<TerminalFileState>>>,
}

impl Drop for TerminalWriter {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(ref mut state) = *guard {
                let _ = state.writer.flush();
            }
        }
    }
}

impl Write for TerminalWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mode = self
            .config
            .read()
            .map_err(|_| std::io::Error::other("config lock poisoned"))?
            .terminal_log_mode;

        let session_ts = self
            .sessions
            .lock()
            .map_err(|_| std::io::Error::other("session lock poisoned"))?
            .current_timestamp()
            .to_string();

        let needs_reopen = {
            let guard =
                self.inner.lock().map_err(|_| std::io::Error::other("file lock poisoned"))?;
            match &*guard {
                None => true,
                Some(state) => {
                    state.mode != mode
                        || (mode == LogMode::Multi
                            && state.session_ts.as_deref() != Some(&session_ts))
                },
            }
        };

        if needs_reopen {
            let file = open_terminal_file(&self.log_dir, mode, &session_ts)?;
            let mut guard =
                self.inner.lock().map_err(|_| std::io::Error::other("file lock poisoned"))?;
            *guard = Some(TerminalFileState {
                writer: BufWriter::with_capacity(8192, file),
                mode,
                session_ts: Some(session_ts),
            });
        }

        let mut guard =
            self.inner.lock().map_err(|_| std::io::Error::other("file lock poisoned"))?;
        match guard.as_mut() {
            Some(state) => state.writer.write(buf),
            None => Err(std::io::Error::other("file state must be Some after needs_reopen check")),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(ref mut state) = *guard {
                return state.writer.flush();
            }
        }
        Ok(())
    }
}

fn open_terminal_file(log_dir: &Path, mode: LogMode, session_ts: &str) -> std::io::Result<File> {
    match mode {
        LogMode::Overwrite => {
            let path = log_file_path(log_dir, "terminal-logs");
            OpenOptions::new().write(true).create(true).truncate(true).open(&path)
        },
        LogMode::Append => {
            let path = log_file_path(log_dir, "terminal-logs");
            OpenOptions::new().append(true).create(true).open(&path)
        },
        LogMode::Multi => {
            let path = session_log_path(log_dir, "terminal-logs", session_ts);
            File::create(&path)
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;
    use tempfile::tempdir;

    fn test_log_dir(prefix: &str) -> PathBuf {
        let dir = temp_dir().join(format!("adl-logging-{prefix}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_debug_logs_overwrite() {
        let dir = test_log_dir("overwrite");
        let config = Arc::new(RwLock::new(LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
        }));
        let manager = LogManager {
            config: config.clone(),
            log_dir: dir.clone(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "terminal-logs"))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "debug-logs"))),
            terminal_file: Arc::new(Mutex::new(None)),
        };

        manager.write_debug_logs("hello").unwrap();
        let content = fs::read_to_string(dir.join("debug-logs.txt")).unwrap();
        assert_eq!(content, "hello");

        manager.write_debug_logs("world").unwrap();
        let content = fs::read_to_string(dir.join("debug-logs.txt")).unwrap();
        assert_eq!(content, "world");
    }

    #[test]
    fn write_debug_logs_append() {
        let dir = test_log_dir("append");
        let config = Arc::new(RwLock::new(LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Append,
        }));
        let manager = LogManager {
            config,
            log_dir: dir.clone(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "terminal-logs"))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "debug-logs"))),
            terminal_file: Arc::new(Mutex::new(None)),
        };

        manager.write_debug_logs("line1\n").unwrap();
        manager.write_debug_logs("line2\n").unwrap();
        let content = fs::read_to_string(dir.join("debug-logs.txt")).unwrap();
        assert_eq!(content, "line1\nline2\n");
    }

    #[test]
    fn write_debug_logs_multi() {
        let dir = test_log_dir("multi");
        let config = Arc::new(RwLock::new(LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Multi,
        }));
        let manager = LogManager {
            config,
            log_dir: dir.clone(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "terminal-logs"))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "debug-logs"))),
            terminal_file: Arc::new(Mutex::new(None)),
        };

        manager.write_debug_logs("session-data").unwrap();

        let fixed = fs::read_to_string(dir.join("debug-logs.txt")).unwrap();
        assert_eq!(fixed, "session-data");

        let entries: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_str()
                    .map(|n| n.starts_with("debug-logs-") && n != "debug-logs.txt")
                    .unwrap_or(false)
            })
            .collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn set_mode_persists() {
        let dir = test_log_dir("setmode");
        let config = Arc::new(RwLock::new(LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
        }));
        let manager = LogManager {
            config: config.clone(),
            log_dir: dir.clone(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "terminal-logs"))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "debug-logs"))),
            terminal_file: Arc::new(Mutex::new(None)),
        };

        manager.set_mode(LogTarget::Debug, LogMode::Append).unwrap();
        let cfg = config.read().unwrap();
        assert_eq!(cfg.debug_log_mode, LogMode::Append);
    }

    /// 回归：终端日志模式切换不得自死锁（事项：设置面板下拉/复选框卡死→未响应→崩溃）。
    ///
    /// 生产链路：`set_mode(Terminal)` 在持有配置写锁期间打 `tracing::info!`，
    /// 文件层 `TerminalWriter::write` 在同线程读同一把非重入 `RwLock` → 永久 park，
    /// 并泄漏写锁，拖死后续所有 tracing 事件与偏好写入。
    /// 本测试用同构 writer（落盘前先读同一把锁）复现：修复前超时失败，修复后毫秒级通过。
    #[test]
    fn set_mode_terminal_does_not_deadlock_event_writer() {
        use std::sync::mpsc;
        use std::time::Duration;
        use tracing_subscriber::fmt::writer::MakeWriter;

        /// 与生产 `TerminalWriter::write` 首行同构：事件落盘前先读配置锁。
        #[derive(Clone)]
        struct ConfigReadingMakeWriter {
            config: Arc<RwLock<LogConfig>>,
        }
        struct ConfigReadingWriter {
            config: Arc<RwLock<LogConfig>>,
        }
        impl<'a> MakeWriter<'a> for ConfigReadingMakeWriter {
            type Writer = ConfigReadingWriter;
            fn make_writer(&'a self) -> Self::Writer {
                ConfigReadingWriter { config: self.config.clone() }
            }
        }
        impl std::io::Write for ConfigReadingWriter {
            fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
                let _mode = self
                    .config
                    .read()
                    .map(|c| c.terminal_log_mode)
                    .map_err(|_| std::io::Error::other("config lock poisoned"))?;
                Ok(buf.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }

        let dir = test_log_dir("setmode-deadlock");
        let config = Arc::new(RwLock::new(LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
        }));
        let manager = Arc::new(LogManager {
            config: config.clone(),
            log_dir: dir.clone(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "terminal-logs"))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "debug-logs"))),
            terminal_file: Arc::new(Mutex::new(None)),
        });

        let subscriber = tracing_subscriber::fmt()
            .with_writer(ConfigReadingMakeWriter { config: config.clone() })
            .with_ansi(false)
            .finish();

        let (tx, rx) = mpsc::channel();
        let m = manager.clone();
        std::thread::spawn(move || {
            let r = tracing::subscriber::with_default(subscriber, || {
                m.set_mode(LogTarget::Terminal, LogMode::Append)
            });
            let _ = tx.send(r);
        });

        let result = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("set_mode(Terminal) timed out: writer re-entered the config lock (deadlock)");
        result.unwrap();
        assert_eq!(config.read().unwrap().terminal_log_mode, LogMode::Append);
    }

    #[tokio::test]
    async fn prune_sessions_async_works() {
        let dir = tempdir().unwrap();
        let config = Arc::new(RwLock::new(LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
        }));
        let manager = LogManager {
            config: config.clone(),
            log_dir: dir.path().to_path_buf(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(
                dir.path(),
                "terminal-logs",
            ))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(dir.path(), "debug-logs"))),
            terminal_file: Arc::new(Mutex::new(None)),
        };

        for i in 0..35 {
            let path = dir.path().join(format!("terminal-logs-2026-06-27_{:02}0000.txt", i));
            std::fs::write(&path, "data").unwrap();
        }

        let removed = manager.prune_sessions_async(LogTarget::Terminal).await.unwrap();
        assert!(removed >= 5, "removed {removed}, expected >=5");
    }
}
