use crate::config::{log_file_path, session_log_path, LogConfig};
use crate::error::{LogError, LogResult};
use crate::mode::{LogMode, LogTarget};
use crate::session::SessionTracker;

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter, Layer, Registry};

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

        let filter =
            || EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

        let stdout_layer = fmt::layer()
            .with_timer(CstTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_filter(filter());

        let file_layer = fmt::layer()
            .with_ansi(false)
            .with_timer(CstTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(make_writer)
            .with_filter(filter());

        Registry::default().with(stdout_layer).with(file_layer).init();

        if let Err(e) = terminal_sessions.lock().unwrap().prune_old_sessions() {
            tracing::warn!("Initial terminal session prune failed: {e}");
        }
        if let Err(e) = debug_sessions.lock().unwrap().prune_old_sessions() {
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
        let mut config =
            self.config.write().map_err(|_| LogError::Config("config lock poisoned".into()))?;

        match target {
            LogTarget::Terminal => {
                config.terminal_log_mode = mode;
                tracing::info!(%mode, "[ADL-LOG] terminal log mode changed");
            },
            LogTarget::Debug => {
                config.debug_log_mode = mode;
            },
        }

        if mode == LogMode::Multi {
            match target {
                LogTarget::Terminal => {
                    let _ = self
                        .terminal_sessions
                        .lock()
                        .map_err(|_| LogError::ModeSwitch("session lock".into()))?
                        .prune_old_sessions();
                },
                LogTarget::Debug => {
                    let _ = self
                        .debug_sessions
                        .lock()
                        .map_err(|_| LogError::ModeSwitch("session lock".into()))?
                        .prune_old_sessions();
                },
            }
        }

        Ok(())
    }

    pub fn prune_sessions(&self, target: LogTarget) -> LogResult<usize> {
        match target {
            LogTarget::Terminal => self
                .terminal_sessions
                .lock()
                .map_err(|_| LogError::Session("terminal session lock poisoned".into()))?
                .prune_old_sessions(),
            LogTarget::Debug => self
                .debug_sessions
                .lock()
                .map_err(|_| LogError::Session("debug session lock poisoned".into()))?
                .prune_old_sessions(),
        }
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
        guard.as_mut().unwrap().writer.write(buf)
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
}
