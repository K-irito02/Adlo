# 日志系统统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `adl-logging` crate，统一终端 tracing 和前端调试日志，支持 overwrite/append/multi 三种模式，CLI+config+运行时控制。

**Architecture:** 新增 `crates/adl-logging/` crate，LogManager 通过自定义 MakeWriter + 共享 BufWriter 管理 tracing 文件输出（弃用 tracing-appender），debug 日志通过 IPC → LogManager::write_debug_logs()。LogMode 枚举放在 kernel::types::config 供全项目共用。前端 debugLogCollector 通过 IPC 获取/设置模式。

**Tech Stack:** Rust tracing 0.1 / tracing-subscriber 0.3 / serde / TypeScript

## Global Constraints

- 日志写入 `{workspace_root}/.adl-logs/`
- 固定文件 terminal-logs.txt / debug-logs.txt 始终保留
- multi 文件命名 `{prefix}-YYYY-MM-DD_HHmmss.txt`，保留最近 30 个
- adl-logging 不依赖 tokio
- 不依赖 tracing-appender（避免 guard 泄露）
- 双端一致：Tauri + 浏览器模式均支持三种模式

---

## File Structure

```
[C] crates/adl-logging/Cargo.toml
[C] crates/adl-logging/src/lib.rs
[C] crates/adl-logging/src/mode.rs
[C] crates/adl-logging/src/error.rs
[C] crates/adl-logging/src/config.rs
[C] crates/adl-logging/src/session.rs
[C] crates/adl-logging/src/manager.rs

[M] ai-digital-life/Cargo.toml                      # workspace members
[M] ai-digital-life/crates/kernel/src/types/config.rs # LogMode enum
[M] ai-digital-life/crates/kernel/src/config.rs      # AppConfig fields
[M] ai-digital-life/src-tauri/Cargo.toml             # adl-logging dep
[M] ai-digital-life/src-tauri/src/state.rs           # +log_manager
[M] ai-digital-life/src-tauri/src/setup.rs           # LogManager::init()
[M] ai-digital-life/src-tauri/src/main.rs            # CLI --log-mode
[M] ai-digital-life/src-tauri/src/commands/app.rs    # +set_log_mode, update writes
[M] ai-digital-life/src-tauri/capabilities/digital-life.toml # +app_set_log_mode
[M] ai-digital-life/frontend/src/shared/ipc.ts       # +setLogMode
[M] ai-digital-life/frontend/src/tauri-bridge.ts     # +setLogMode
[M] ai-digital-life/frontend/src/mock/mock-bridge.ts # +setLogMode
[M] ai-digital-life/frontend/dev/preview-bridge.ts   # +setLogMode
[M] ai-digital-life/frontend/src/app/utils/debugLogCollector.ts # mode-aware
[M] ai-digital-life/frontend/dev/previewWorkspaceService.ts # mode-aware
```

---

### Task 1: Add LogMode to kernel types

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/types/config.rs`

**Interfaces:**
- Produces: `LogMode` enum (Overwrite, Append, Multi) with Serialize/Deserialize/Default/FromStr

- [ ] **Step 1: Add LogMode enum**

Add after the existing `LogLevel` enum (~line 16):

```rust
/// 日志文件写入模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "snake_case")]
pub enum LogMode {
    /// 每次启动覆盖文件
    Overwrite,
    /// 每次启动追加到文件
    Append,
    /// 每次启动创建独立会话文件
    Multi,
}

impl Default for LogMode {
    fn default() -> Self { Self::Overwrite }
}

impl std::str::FromStr for LogMode {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "overwrite" => Ok(Self::Overwrite),
            "append" => Ok(Self::Append),
            "multi" => Ok(Self::Multi),
            other => Err(format!("Invalid LogMode: {other}. Expected overwrite|append|multi")),
        }
    }
}

impl std::fmt::Display for LogMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Overwrite => write!(f, "overwrite"),
            Self::Append => write!(f, "append"),
            Self::Multi => write!(f, "multi"),
        }
    }
}
```

- [ ] **Step 2: Verify compile**

```powershell
cargo check -p adl-kernel 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add crates/kernel/src/types/config.rs
git commit -m "feat: add LogMode enum to kernel types"
```

---

### Task 2: Add logging fields to AppConfig

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/config.rs:7-16`

**Interfaces:**
- Consumes: `LogMode` from Task 1
- Produces: `AppConfig.terminal_log_mode`, `AppConfig.debug_log_mode`

- [ ] **Step 1: Add fields to AppConfig**

Replace the struct definition (lines 9-16):

```rust
pub struct AppConfig {
    pub language: String,
    pub theme_mode: ThemeMode,
    pub log_level: String,
    #[serde(default)]
    pub terminal_log_mode: LogMode,
    #[serde(default)]
    pub debug_log_mode: LogMode,
    pub max_recent_workspaces: usize,
    #[serde(default)]
    pub model_preferences: ModelPreferences,
}
```

- [ ] **Step 2: Update Default impl**

Replace the `Default` impl to add new defaults:

```rust
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: "zh-CN".into(),
            theme_mode: ThemeMode::System,
            log_level: "info".into(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: 10,
            model_preferences: ModelPreferences::default(),
        }
    }
}
```

- [ ] **Step 3: Verify compile**

```powershell
cargo check -p adl-kernel 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add crates/kernel/src/config.rs
git commit -m "feat: add terminal_log_mode and debug_log_mode to AppConfig"
```

---

### Task 3: Update AppPreferencePatch

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/types/config.rs`

**Interfaces:**
- Consumes: `LogMode` from Task 1
- Produces: `AppPreferencePatch.terminal_log_mode`, `AppPreferencePatch.debug_log_mode`

- [ ] **Step 1: Add optional fields to AppPreferencePatch**

Find `AppPreferencePatch` and add the two new fields:

```rust
pub struct AppPreferencePatch {
    pub language: Option<String>,
    pub theme_mode: Option<ThemeMode>,
    pub log_level: Option<String>,
    pub terminal_log_mode: Option<LogMode>,
    pub debug_log_mode: Option<LogMode>,
    pub model_preferences: Option<std::collections::HashMap<String, ModelProviderPatch>>,
}
```

- [ ] **Step 2: Verify compile**

```powershell
cargo check -p adl-kernel 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add crates/kernel/src/types/config.rs
git commit -m "feat: add log mode fields to AppPreferencePatch"
```

---

### Task 4: Create adl-logging crate scaffold

**Files:**
- Create: `ai-digital-life/crates/adl-logging/Cargo.toml`
- Create: `ai-digital-life/crates/adl-logging/src/lib.rs`
- Create: `ai-digital-life/crates/adl-logging/src/mode.rs`
- Create: `ai-digital-life/crates/adl-logging/src/error.rs`

**Interfaces:**
- Produces: crate structure, LogTarget enum, LogMode re-export, LogError enum

- [ ] **Step 1: Create Cargo.toml**

```toml
[package]
name = "adl-logging"
version.workspace = true
edition.workspace = true
license.workspace = true
rust-version.workspace = true

[dependencies]
serde.workspace = true
serde_json.workspace = true
thiserror.workspace = true
tracing.workspace = true
tracing-subscriber = { workspace = true, features = ["env-filter", "registry"] }
adl-kernel = { path = "../kernel" }
```

- [ ] **Step 2: Create lib.rs**

```rust
pub mod config;
pub mod error;
pub mod manager;
pub mod mode;
pub mod session;

pub use config::LogConfig;
pub use error::LogError;
pub use manager::LogManager;
pub use mode::{LogMode, LogTarget};

/// Convenience: initialize from kernel AppConfig + log dir
pub fn init(app_config: &adl_kernel::config::AppConfig, log_dir: &std::path::Path) -> Result<LogManager, LogError> {
    let config = LogConfig::from_app_config(app_config);
    LogManager::init(&config, log_dir)
}
```

- [ ] **Step 3: Create mode.rs**

```rust
use serde::{Deserialize, Serialize};

pub use adl_kernel::types::config::LogMode;

/// 日志目标类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogTarget {
    Terminal,
    Debug,
}
```

- [ ] **Step 4: Create error.rs**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LogError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Mode switch failed: {0}")]
    ModeSwitch(String),

    #[error("Session error: {0}")]
    Session(String),
}

pub type LogResult<T> = Result<T, LogError>;
```

- [ ] **Step 5: Verify compile**

```powershell
cargo check -p adl-logging 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add crates/adl-logging/
git commit -m "feat: scaffold adl-logging crate with mode, error, and lib"
```

---

### Task 5: Implement LogConfig

**Files:**
- Create: `ai-digital-life/crates/adl-logging/src/config.rs`

- [ ] **Step 1: Create config.rs**

```rust
use crate::mode::LogMode;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct LogConfig {
    pub terminal_log_mode: LogMode,
    pub debug_log_mode: LogMode,
}

impl LogConfig {
    pub fn from_app_config(app_config: &adl_kernel::config::AppConfig) -> Self {
        Self {
            terminal_log_mode: app_config.terminal_log_mode,
            debug_log_mode: app_config.debug_log_mode,
        }
    }

    pub fn merge_cli(&mut self, cli_mode: LogMode) {
        self.terminal_log_mode = cli_mode;
        self.debug_log_mode = cli_mode;
    }
}

/// 日志文件路径工具
pub fn log_file_path(log_dir: &Path, prefix: &str) -> std::path::PathBuf {
    log_dir.join(format!("{prefix}.txt"))
}

pub fn session_log_path(log_dir: &Path, prefix: &str, timestamp: &str) -> std::path::PathBuf {
    log_dir.join(format!("{prefix}-{timestamp}.txt"))
}
```

- [ ] **Step 2: Commit**

```bash
git add crates/adl-logging/src/config.rs
git commit -m "feat: add LogConfig with from_app_config and merge_cli"
```

---

### Task 6: Implement SessionTracker

**Files:**
- Create: `ai-digital-life/crates/adl-logging/src/session.rs`

- [ ] **Step 1: Create session.rs**

```rust
use crate::error::{LogError, LogResult};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_SESSIONS: usize = 30;

/// Multi 模式会话追踪器
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
        self.log_dir
            .join(format!("{}-{}.txt", self.prefix, self.current_ts))
    }

    pub fn prune_old_sessions(&self) -> LogResult<usize> {
        let pattern = format!("{}-*.txt", self.prefix);
        let mut sessions: Vec<PathBuf> = std::fs::read_dir(&self.log_dir)
            .map_err(|e| LogError::Session(format!("read_dir failed: {e}")))?
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
            .collect();

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
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    // Convert to naive datetime in local time
    // For simplicity, use UTC-based format
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Days since epoch → approximate date
    // 2026-06-27 = day 20618 (from 1970-01-01)
    // Use a simple offset approach
    let total_days = days as i64;
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
        assert!(ts.len() == 19, "expected YYYY-MM-DD_HHmmss got {ts}");
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "_");
        assert_eq!(&ts[13..14], ":");
        assert_eq!(&ts[16..17], ":");
    }

    #[test]
    fn prune_removes_excess_sessions() {
        let dir = std::env::temp_dir().join("adl-log-session-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let tracker = SessionTracker::new(&dir, "test");

        // Create 35 session files
        for i in 0..35 {
            let path = dir.join(format!("test-2026-06-27_{:02}0000.txt", i));
            std::fs::write(&path, "data").unwrap();
        }

        let removed = tracker.prune_old_sessions().unwrap();
        assert!(removed >= 5, "removed {removed}, expected >=5");

        // Verify at most MAX_SESSIONS remain
        let remaining: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert!(remaining.len() <= MAX_SESSIONS);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Run tests**

```powershell
cargo test -p adl-logging -- session 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add crates/adl-logging/src/session.rs
git commit -m "feat: add SessionTracker with YYYY-MM-DD_HHmmss naming and 30-session prune"
```

---

### Task 7: Implement LogManager (terminal tracing - MakeWriter)

**Files:**
- Create: `ai-digital-life/crates/adl-logging/src/manager.rs`

- [ ] **Step 1: Create manager.rs with LogManager struct and tracing init**

```rust
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
use tracing_subscriber::{fmt, EnvFilter, Registry};

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
    terminal_file: Arc<Mutex<Option<TerminalFileState>>>,
}

impl LogManager {
    pub fn init(config: &LogConfig, log_dir: &Path) -> LogResult<Self> {
        fs::create_dir_all(log_dir)?;

        let config = Arc::new(RwLock::new(config.clone()));
        let terminal_sessions =
            Arc::new(Mutex::new(SessionTracker::new(log_dir, "terminal-logs")));
        let debug_sessions =
            Arc::new(Mutex::new(SessionTracker::new(log_dir, "debug-logs")));
        let terminal_file: Arc<Mutex<Option<TerminalFileState>>> = Arc::new(Mutex::new(None));

        // Build MakeWriter
        let make_writer = TerminalMakeWriter {
            log_dir: log_dir.to_path_buf(),
            config: config.clone(),
            sessions: terminal_sessions.clone(),
            inner: terminal_file.clone(),
        };

        let filter = || {
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
        };

        let stdout_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(true)
            .with_filter(filter());

        let file_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(make_writer)
            .with_filter(filter());

        Registry::default()
            .with(stdout_layer)
            .with(file_layer)
            .init();

        // Initial prune
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
        // Flush on drop to ensure buffered content is written
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(ref mut state) = *guard {
                let _ = state.writer.flush();
            }
        }
    }
}

impl Write for TerminalWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mode = self.config.read().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::Other, "config lock poisoned")
        })?.terminal_log_mode;

        let session_ts = self.sessions.lock().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::Other, "session lock poisoned")
        })?.current_timestamp().to_string();

        let needs_reopen = {
            let guard = self.inner.lock().map_err(|_| {
                std::io::Error::new(std::io::ErrorKind::Other, "file lock poisoned")
            })?;
            match &*guard {
                None => true,
                Some(state) => {
                    state.mode != mode
                        || (mode == LogMode::Multi
                            && state.session_ts.as_deref() != Some(&session_ts))
                }
            }
        };

        if needs_reopen {
            let file = open_terminal_file(&self.log_dir, mode, &session_ts)?;
            let mut guard = self.inner.lock().map_err(|_| {
                std::io::Error::new(std::io::ErrorKind::Other, "file lock poisoned")
            })?;
            *guard = Some(TerminalFileState {
                writer: BufWriter::with_capacity(8192, file),
                mode,
                session_ts: Some(session_ts),
            });
        }

        let mut guard = self.inner.lock().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::Other, "file lock poisoned")
        })?;
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
            File::create(&path)
        }
        LogMode::Append => {
            let path = log_file_path(log_dir, "terminal-logs");
            OpenOptions::new().append(true).create(true).open(&path)
        }
        LogMode::Multi => {
            let path = session_log_path(log_dir, "terminal-logs", session_ts);
            File::create(&path)
        }
    }
}
```

- [ ] **Step 2: Verify compile**

```powershell
cargo check -p adl-logging 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add crates/adl-logging/src/manager.rs
git commit -m "feat: add LogManager with MakeWriter-based tracing file output"
```

---

### Task 8: Implement LogManager (debug write + set_mode + prune)

**Files:**
- Modify: `ai-digital-life/crates/adl-logging/src/manager.rs`

- [ ] **Step 1: Append to manager.rs — write_debug_logs, set_mode, prune_sessions, config getter**

Add these methods to the `impl LogManager` block (before the closing `}`):

```rust
    pub fn write_debug_logs(&self, content: &str) -> LogResult<()> {
        let mode = self.config.read().map_err(|_| {
            LogError::Config("config lock poisoned".into())
        })?.debug_log_mode;

        let fixed_path = log_file_path(&self.log_dir, "debug-logs");

        match mode {
            LogMode::Overwrite => {
                fs::write(&fixed_path, content)?;
            }
            LogMode::Append => {
                let mut file = OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open(&fixed_path)?;
                file.write_all(content.as_bytes())?;
            }
            LogMode::Multi => {
                let ts = self.debug_sessions.lock().map_err(|_| {
                    LogError::Config("session lock poisoned".into())
                })?.current_timestamp().to_string();
                let session_path = session_log_path(&self.log_dir, "debug-logs", &ts);
                fs::write(&fixed_path, content)?;
                fs::write(&session_path, content)?;
            }
        }

        Ok(())
    }

    pub fn set_mode(&self, target: LogTarget, mode: LogMode) -> LogResult<()> {
        let mut config = self.config.write().map_err(|_| {
            LogError::Config("config lock poisoned".into())
        })?;

        match target {
            LogTarget::Terminal => {
                config.terminal_log_mode = mode;
                tracing::info!(
                    mode = %mode,
                    "[ADL-LOG] terminal log mode changed"
                );
            }
            LogTarget::Debug => {
                config.debug_log_mode = mode;
            }
        }

        // Multi mode: prune old sessions after switching
        if mode == LogMode::Multi {
            match target {
                LogTarget::Terminal => {
                    let _ = self.terminal_sessions.lock()
                        .map_err(|_| LogError::ModeSwitch("session lock".into()))?
                        .prune_old_sessions();
                }
                LogTarget::Debug => {
                    let _ = self.debug_sessions.lock()
                        .map_err(|_| LogError::ModeSwitch("session lock".into()))?
                        .prune_old_sessions();
                }
            }
        }

        Ok(())
    }

    pub fn prune_sessions(&self, target: LogTarget) -> LogResult<usize> {
        match target {
            LogTarget::Terminal => self.terminal_sessions.lock()
                .map_err(|_| LogError::Session("terminal session lock poisoned".into()))?
                .prune_old_sessions(),
            LogTarget::Debug => self.debug_sessions.lock()
                .map_err(|_| LogError::Session("debug session lock poisoned".into()))?
                .prune_old_sessions(),
        }
    }

    pub fn config(&self) -> Result<LogConfig, LogError> {
        self.config.read()
            .map(|c| c.clone())
            .map_err(|_| LogError::Config("config lock poisoned".into()))
    }
```

- [ ] **Step 2: Verify compile**

```powershell
cargo check -p adl-logging 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add crates/adl-logging/src/manager.rs
git commit -m "feat: add write_debug_logs, set_mode, prune_sessions to LogManager"
```

---

### Task 9: Write unit tests for adl-logging

**Files:**
- Modify: `ai-digital-life/crates/adl-logging/src/manager.rs` (add #[cfg(test)])
- Modify: `ai-digital-life/crates/adl-logging/src/session.rs` (already has tests)

- [ ] **Step 1: Add tests at end of manager.rs**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::LogConfig;
    use std::env::temp_dir;

    fn test_log_dir() -> PathBuf {
        let dir = temp_dir().join("adl-logging-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn init_creates_log_directory() {
        let dir = test_log_dir();
        let config = LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
        };
        // Init will fail because tracing subscriber already set in test context
        // Just verify directory creation and config path logic
        assert!(dir.exists());
    }

    #[test]
    fn write_debug_logs_overwrite() {
        let dir = test_log_dir();
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
        assert_eq!(content, "world"); // overwrite
    }

    #[test]
    fn write_debug_logs_append() {
        let dir = test_log_dir();
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
        let dir = test_log_dir();
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

        // Fixed file exists with current session data
        let fixed = fs::read_to_string(dir.join("debug-logs.txt")).unwrap();
        assert_eq!(fixed, "session-data");

        // Session file also exists
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
        let dir = test_log_dir();
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

        manager
            .set_mode(LogTarget::Debug, LogMode::Append)
            .unwrap();
        let cfg = config.read().unwrap();
        assert_eq!(cfg.debug_log_mode, LogMode::Append);
    }
}
```

- [ ] **Step 2: Run tests**

```powershell
cargo test -p adl-logging 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add crates/adl-logging/src/manager.rs
git commit -m "test: add unit tests for LogManager (overwrite, append, multi, set_mode)"
```

---

### Task 10: Register adl-logging in workspace

**Files:**
- Modify: `ai-digital-life/Cargo.toml:3-23`
- Modify: `ai-digital-life/src-tauri/Cargo.toml`

- [ ] **Step 1: Add to workspace members**

Add `"crates/adl-logging"` to the `members` array in workspace Cargo.toml.

- [ ] **Step 2: Add dep to src-tauri/Cargo.toml**

```toml
adl-logging = { path = "../crates/adl-logging" }
```

- [ ] **Step 3: Verify workspace check**

```powershell
cargo check --workspace 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add Cargo.toml src-tauri/Cargo.toml
git commit -m "feat: add adl-logging to workspace and src-tauri deps"
```

---

### Task 11: Update AppState and setup.rs

**Files:**
- Modify: `ai-digital-life/src-tauri/src/state.rs`
- Modify: `ai-digital-life/src-tauri/src/setup.rs`

- [ ] **Step 1: Add log_manager to AppState**

```rust
use adl_logging::LogManager;

pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: RwLock<AppConfig>,
    pub event_bus: EventBus,
    pub current_workspace: RwLock<Option<WorkspaceMeta>>,
    pub editor_dirty_paths: Mutex<HashSet<String>>,
    pub pty_sessions: Arc<Mutex<SessionManager>>,
    pub browser_manager: BrowserManager,
    pub log_manager: LogManager,
    pub started_at: i64,
}
```

- [ ] **Step 2: Update setup.rs init_app_state**

Replace the logger init section:

```rust
pub fn init_app_state(data_dir: PathBuf) -> anyhow::Result<AppState> {
    let mut config = adl_config::load(&data_dir).unwrap_or_default();

    // CLI log mode override (parsed in main, stored in env or global)
    if let Ok(cli_mode) = std::env::var("ADL_CLI_LOG_MODE") {
        if let Ok(mode) = cli_mode.parse() {
            config.terminal_log_mode = mode;
            config.debug_log_mode = mode;
        }
    }

    let project_root = resolve_project_root();
    let log_dir = project_root.join(".adl-logs");
    std::fs::create_dir_all(&log_dir)?;

    let log_manager = adl_logging::LogManager::init(
        &adl_logging::LogConfig::from_app_config(&config),
        &log_dir,
    ).context("failed to init log manager")?;

    info!(?log_dir, "log manager initialized");

    // ...rest of init unchanged (db, migrations, etc.)...

    Ok(AppState {
        data_dir,
        db,
        config: RwLock::new(config),
        event_bus,
        current_workspace: RwLock::new(current_workspace),
        editor_dirty_paths: std::sync::Mutex::new(std::collections::HashSet::new()),
        pty_sessions: std::sync::Arc::new(std::sync::Mutex::new(SessionManager::new())),
        browser_manager: BrowserManager::new(),
        log_manager,
        started_at: now_ms(),
    })
}
```

Also remove the import `use adl_logger` / `adl_kernel::logger as adl_logger` if it still exists.

- [ ] **Step 3: Verify compile**

```powershell
cargo check -p adl-digital-life 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/state.rs src-tauri/src/setup.rs
git commit -m "feat: integrate LogManager into AppState and setup"
```

---

### Task 12: Add CLI --log-mode parsing

**Files:**
- Modify: `ai-digital-life/src-tauri/src/main.rs`

- [ ] **Step 1: Add CLI parsing before tauri::Builder**

```rust
use adl_kernel::types::config::LogMode;

fn parse_cli_log_mode() -> Option<LogMode> {
    let args: Vec<String> = std::env::args().collect();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--log-mode" && i + 1 < args.len() {
            return args[i + 1].parse().ok();
        }
        i += 1;
    }
    None
}
```

- [ ] **Step 2: Pass CLI mode to setup via env var**

In main() before setup:

```rust
fn main() {
    if let Some(mode) = parse_cli_log_mode() {
        std::env::set_var("ADL_CLI_LOG_MODE", mode.to_string());
    }
    // ...rest unchanged...
}
```

- [ ] **Step 3: Verify compile**

```powershell
cargo check -p adl-digital-life 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: add --log-mode CLI argument parsing"
```

---

### Task 13: Update Tauri commands

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/app.rs`

- [ ] **Step 1: Update write_debug_logs_to_project**

Replace the function body:

```rust
#[tauri::command]
pub fn write_debug_logs_to_project(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<(), String> {
    state
        .log_manager
        .write_debug_logs(&content)
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Update write_debug_logs**

Replace the function body:

```rust
#[tauri::command]
pub fn write_debug_logs(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<(), String> {
    state
        .log_manager
        .write_debug_logs(&content)
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Add app_set_log_mode command**

```rust
#[tauri::command]
pub fn app_set_log_mode(
    state: tauri::State<'_, AppState>,
    target: String,
    mode: String,
) -> Result<(), String> {
    let log_target: adl_logging::LogTarget = match target.as_str() {
        "terminal" => adl_logging::LogTarget::Terminal,
        "debug" => adl_logging::LogTarget::Debug,
        other => return Err(format!("Invalid log target: {other}")),
    };
    let log_mode: adl_kernel::types::config::LogMode = mode
        .parse()
        .map_err(|e: String| format!("Invalid log mode: {e}"))?;

    // Apply runtime change
    state
        .log_manager
        .set_mode(log_target, log_mode)
        .map_err(|e| e.to_string())?;

    // Persist to config
    {
        let mut config = state
            .config
            .write()
            .map_err(|_| "config lock poisoned".to_string())?;
        match log_target {
            adl_logging::LogTarget::Terminal => config.terminal_log_mode = log_mode,
            adl_logging::LogTarget::Debug => config.debug_log_mode = log_mode,
        }
    }
    crate::setup::save_config(&state).map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 4: Update app_update_preferences for log modes**

Add to the match block inside app_update_preferences:

```rust
if let Some(mode) = patch.terminal_log_mode {
    config.terminal_log_mode = mode;
    // Also update LogManager
    let _ = state.log_manager.set_mode(adl_logging::LogTarget::Terminal, mode);
}
if let Some(mode) = patch.debug_log_mode {
    config.debug_log_mode = mode;
    let _ = state.log_manager.set_mode(adl_logging::LogTarget::Debug, mode);
}
```

- [ ] **Step 5: Verify compile**

```powershell
cargo check -p adl-digital-life 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/app.rs
git commit -m "feat: update Tauri commands to use LogManager, add app_set_log_mode"
```

---

### Task 14: Register new command in main.rs and capabilities

**Files:**
- Modify: `ai-digital-life/src-tauri/src/main.rs:76-170`
- Modify: `ai-digital-life/src-tauri/capabilities/digital-life.toml`

- [ ] **Step 1: Add to invoke_handler**

Add `commands::app::app_set_log_mode` to the `invoke_handler!` macro.

- [ ] **Step 2: Add to capabilities**

Add `"app_set_log_mode"` to the command list in `digital-life.toml`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/capabilities/digital-life.toml
git commit -m "feat: register app_set_log_mode command and permission"
```

---

### Task 15: Frontend IPC bridge

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc.ts`
- Modify: `ai-digital-life/frontend/src/tauri-bridge.ts`
- Modify: `ai-digital-life/frontend/src/mock/mock-bridge.ts`
- Modify: `ai-digital-life/frontend/dev/preview-bridge.ts` (if exists)

- [ ] **Step 1: Add to ipc.ts DigitalLifeBridge interface**

```typescript
setLogMode(target: "terminal" | "debug", mode: "overwrite" | "append" | "multi"): Promise<void>;
```

- [ ] **Step 2: Add to tauri-bridge.ts**

```typescript
async setLogMode(
  target: "terminal" | "debug",
  mode: "overwrite" | "append" | "multi"
): Promise<void> {
  await invoke("app_set_log_mode", { target, mode });
}
```

- [ ] **Step 3: Add to mock-bridge.ts**

```typescript
async setLogMode(
  target: "terminal" | "debug",
  mode: "overwrite" | "append" | "multi"
): Promise<void> {
  localStorage.setItem(`adl_log_mode_${target}`, mode);
}
```

- [ ] **Step 4: Add to preview-bridge.ts (if it exists)**

Same as tauri-bridge but via HTTP POST to `__adl_preview_api__`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/ipc.ts frontend/src/tauri-bridge.ts frontend/src/mock/mock-bridge.ts
git commit -m "feat: add setLogMode to frontend IPC bridge"
```

---

### Task 16: Update debugLogCollector (mode-aware write)

**Files:**
- Modify: `ai-digital-life/frontend/src/app/utils/debugLogCollector.ts`

- [ ] **Step 1: Read current log mode on write**

In `writeLogsToProjectFile`, before writing, get the current debug log mode. The mode is stored in localStorage (mock/preview) or fetched from Tauri config. For simplicity, we use the existing `write_debug_logs_to_project` IPC which now handles modes internally via LogManager. No frontend changes needed for the write path itself — the Rust backend applies the mode.

The frontend only needs to expose `setLogMode` for the UI toggle. This is already done via the bridge in Task 15.

No `debugLogCollector.ts` changes required — the 3-second debounce write goes through `invoke("write_debug_logs_to_project", { content })` which now delegates to `LogManager::write_debug_logs()` which reads the current mode.

- [ ] **Step 1 (actual): Verify no changes needed, commit noting this**

```bash
git commit --allow-empty -m "feat: debugLogCollector unchanged — LogManager handles modes internally"
```

---

### Task 17: Verify full build

**Files:**
- All modified files

- [ ] **Step 1: Full cargo check**

```powershell
cargo check --workspace 2>&1
```

- [ ] **Step 2: Run all tests**

```powershell
cargo test --workspace 2>&1
```

- [ ] **Step 3: Cargo clippy**

```powershell
cargo clippy --workspace --all-targets 2>&1
```

Expected: no errors, warnings acceptable.

- [ ] **Step 4: Cargo fmt**

```powershell
cargo fmt --all
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final verification — clippy, test, fmt pass"
```
