use crate::config::{LogConfig, log_file_path, session_log_path};
use crate::error::{LogError, LogResult};
use crate::mode::{LogMode, LogTarget};
use crate::session::{PruneReport, SessionTracker};

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

use adl_types::types::config::LogLevel;
use tokio::task::spawn_blocking;
use tracing::{Level, Metadata};

use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::layer::{Context, Filter, SubscriberExt};
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer, Registry, fmt};

/// 日志文件前缀：终端日志（stdout 层镜像）按进程角色分文件，避免 shell 与
/// adl-server 两个进程以 Overwrite 模式互写同一文件而互相截断。
pub const SHELL_TERMINAL_PREFIX: &str = "terminal-logs";
pub const SERVER_TERMINAL_PREFIX: &str = "adl-server-logs";
/// 调试日志仅由 shell 侧 `write_debug_logs` 写入，无进程冲突。
pub const DEBUG_LOG_PREFIX: &str = "debug-logs";

fn to_tracing_level(level: LogLevel) -> Level {
    match level {
        LogLevel::Error => Level::ERROR,
        LogLevel::Warn => Level::WARN,
        LogLevel::Info => Level::INFO,
        LogLevel::Debug => Level::DEBUG,
        LogLevel::Trace => Level::TRACE,
    }
}

/// 全局基础 filter：`RUST_LOG` 已设置时采用它（tracing 惯例），否则用 `trace`
/// 放行到逐层 gate 再各自收紧。
///
/// 注意这是**硬顶**（多层 filter 按 AND 语义组合）：`RUST_LOG=error` 会同时掐掉
/// stdout 层和文件层低于 error 的一切事件，CLI `--log-level trace` 也无法将其顶开。
/// 想要运行期调高级别，先 unset `RUST_LOG`。缺省必须保持最宽松级别 —— 收紧此处
/// 会破坏 `set_log_level` 的运行期热生效（全局 max 被收紧后 interest-cache 不再
/// 向上传递，调高级别静默失效且极难排查）。
fn initial_base_filter() -> EnvFilter {
    EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("trace"))
}

/// 运行时可变级别过滤器：从共享的 `Arc<RwLock<LogLevel>>` 读当前级别，按层需求
/// （可选下限）决定放行。用于替代 `reload::Handle` —— 后者的 `S` 依赖其被组合的
/// 位置（`Filtered<.., S>` / `Layered<.., S>`），无法在结构体字段中命名。
struct LevelGate {
    level: Arc<RwLock<LogLevel>>,
    /// `Some(floor)` ⇒ 有效级别 = `max(level, floor)`（文件层的 debug 下限）。
    floor: Option<LogLevel>,
}

impl LevelGate {
    fn effective_level(&self) -> Option<Level> {
        let level = *self.level.read().ok()?;
        let effective = match self.floor {
            Some(floor) => LogLevel::max_verbosity(level, floor),
            None => level,
        };
        Some(to_tracing_level(effective))
    }
}

impl<S: tracing::Subscriber> Filter<S> for LevelGate {
    fn enabled(&self, meta: &Metadata<'_>, _cx: &Context<'_, S>) -> bool {
        self.effective_level().is_some_and(|max| *meta.level() <= max)
    }

    fn max_level_hint(&self) -> Option<LevelFilter> {
        // poison 时 effective_level 为 None：enabled() 恒 false（fail-closed，
        // 刻意选择——脏配置下不写日志）；hint 回 None 仅表示"无优化提示"，
        // 仍逐事件调 enabled()，故 hint 与 enabled 无实质矛盾（Closing L3 结论）。
        self.effective_level().map(LevelFilter::from_level)
    }
}

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

/// prune 失败聚合日志上限：只打印前 N 条明细，避免权限风暴下刷屏 + 路径 PII 堆积。
const MAX_PRUNE_LOG_SAMPLE: usize = 5;

/// prune 失败聚合日志（必须在 sessions 锁外调用）：空失败静默，只记数 + 前 N 条明细。
fn log_prune_failures(ctx: &str, report: &PruneReport) {
    if report.failed.is_empty() {
        return;
    }
    let sample_end = report.failed.len().min(MAX_PRUNE_LOG_SAMPLE);
    tracing::warn!(
        "{ctx} ({} files, showing {sample_end}): {:?}",
        report.failed.len(),
        &report.failed[..sample_end],
    );
}

/// 启动期单类会话 prune：锁内只收集、守卫释放后再日志。terminal/debug 共用，防双分支漂移。
fn prune_initial(sessions: &Mutex<SessionTracker>, name: &str) {
    // 锁内禁 tracing：不用 `lock().map(...)` 链，Err 分支的 PoisonError 会持有守卫延长借用。
    let result: Option<LogResult<PruneReport>> = match sessions.lock() {
        Ok(guard) => Some(guard.prune_old_sessions()),
        Err(_) => {
            tracing::warn!("{name}_sessions lock poisoned, skipping initial prune");
            None
        },
    };
    match &result {
        // 空失败不组装 ctx 字符串：helper 虽早返，format! 的 alloc 省得省（R2-2）。
        Some(Ok(report)) if !report.failed.is_empty() => {
            log_prune_failures(&format!("Initial {name} session prune failed"), report);
        },
        Some(Ok(_)) => {},
        Some(Err(e)) => tracing::warn!("Initial {name} session prune failed: {e}"),
        None => {},
    }
}

pub struct LogManager {
    config: Arc<RwLock<LogConfig>>,
    log_dir: PathBuf,
    /// 终端日志文件前缀（按进程角色区分：shell / adl-server）。
    terminal_prefix: String,
    terminal_sessions: Arc<Mutex<SessionTracker>>,
    debug_sessions: Arc<Mutex<SessionTracker>>,
    /// stdout / 文件两层共享的运行时级别单元（`set_log_level` 直接改写）。
    level_cell: Arc<RwLock<LogLevel>>,
    #[allow(dead_code)]
    // Lifetime anchor: keeps the Arc alive so TerminalMakeWriter's clone remains valid
    terminal_file: Arc<Mutex<Option<TerminalFileState>>>,
}

impl LogManager {
    /// 初始化全局 tracing 订阅者。`terminal_prefix` 区分进程角色
    /// （`SHELL_TERMINAL_PREFIX` / `SERVER_TERMINAL_PREFIX`），避免两进程互写同一
    /// 终端日志文件而互相截断。
    pub fn init(config: &LogConfig, log_dir: &Path, terminal_prefix: &str) -> LogResult<Self> {
        fs::create_dir_all(log_dir)?;

        let level = config.log_level;
        let level_cell = Arc::new(RwLock::new(level));
        let config = Arc::new(RwLock::new(config.clone()));
        let terminal_sessions = Arc::new(Mutex::new(SessionTracker::new(log_dir, terminal_prefix)));
        let debug_sessions = Arc::new(Mutex::new(SessionTracker::new(log_dir, DEBUG_LOG_PREFIX)));
        let terminal_file: Arc<Mutex<Option<TerminalFileState>>> = Arc::new(Mutex::new(None));

        let make_writer = TerminalMakeWriter {
            log_dir: log_dir.to_path_buf(),
            config: config.clone(),
            sessions: terminal_sessions.clone(),
            inner: terminal_file.clone(),
            prefix: terminal_prefix.to_string(),
        };

        // File layer writes at max(log_level, debug) so diagnostic tracing::debug!
        // calls are preserved in the terminal log for post-mortem analysis, while
        // stdout stays at the user-selected level.
        let stdout_layer = fmt::layer()
            .with_timer(CstTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_filter(LevelGate { level: level_cell.clone(), floor: None });

        let file_layer = fmt::layer()
            .with_ansi(false)
            .with_timer(CstTime)
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(make_writer)
            .with_filter(LevelGate { level: level_cell.clone(), floor: Some(LogLevel::Debug) });

        let subscriber =
            Registry::default().with(initial_base_filter()).with(stdout_layer).with(file_layer);

        // Tolerate a second init in the same process (integration tests spin up
        // multiple engine instances per binary). The production path calls this
        // exactly once; re-init only means "subscriber already installed".
        // 注意：复用旧订阅者时，旧 gate 指向首次 init 的 manager 的 level_cell，
        // 新 manager 的 `set_log_level` 对实际生效的订阅者无影响 —— 运行期调级别
        // 请使用首次返回的 manager（生产路径单次 init，不受影响）。
        if let Err(e) = subscriber.try_init() {
            tracing::warn!("global tracing subscriber already set, reusing it ({e})");
        }

        // 锁内禁 tracing：prune 只收集失败，守卫释放后再打日志（R2 同类死锁治理）。
        prune_initial(&terminal_sessions, terminal_prefix);
        prune_initial(&debug_sessions, DEBUG_LOG_PREFIX);

        Ok(Self {
            config,
            log_dir: log_dir.to_path_buf(),
            terminal_prefix: terminal_prefix.to_string(),
            terminal_sessions,
            debug_sessions,
            level_cell,
            terminal_file,
        })
    }

    /// 运行时切换日志级别：stdout 层 = `level`，文件层 = `max(level, debug)`。
    ///
    /// 与 [`Self::set_mode`] 同约束：写守卫仅覆盖字段变更，守卫存活期间禁止打日志
    /// （tracing 文件层会在同线程读同一把非重入配置 `RwLock`，守卫内打日志即自死锁）。
    pub fn set_log_level(&self, level: LogLevel) -> LogResult<()> {
        {
            let mut config =
                self.config.write().map_err(|_| LogError::Config("config lock poisoned".into()))?;
            config.log_level = level;
        }
        // 守卫已释放：改写共享级别单元即对两层 filter 生效（无重入锁风险）。
        {
            let mut cell = self
                .level_cell
                .write()
                .map_err(|_| LogError::Config("level cell lock poisoned".into()))?;
            *cell = level;
        }
        // 重建全局 interest 缓存：tracing 会按 `max_level_hint`/callsite interest
        // 缓存各层的放行结论，调低后被记为 `never` 的 callsite 在调高后不会自动重算，
        // `enabled()` 根本不再被调用 → "调高静默失效"（Closing H1 实证）。
        // 级别切换是罕见操作，重建成本可接受。
        tracing::callsite::rebuild_interest_cache();

        tracing::warn!(%level, "[ADL-LOG] log level changed");
        Ok(())
    }

    pub fn log_level(&self) -> LogResult<LogLevel> {
        Ok(self
            .config
            .read()
            .map_err(|_| LogError::Config("config lock poisoned".into()))?
            .log_level)
    }

    /// 应用运行期日志变更集（偏好补丁 / 外部配置重载）。
    /// 任一字段失败即提前返回；已生效的字段保持生效（调用方决定是否回滚，
    /// 见 shell `app_update_preferences` / server `update_preferences`）。
    pub fn apply_change(&self, change: &crate::overrides::LogSettingsChange) -> LogResult<()> {
        if let Some(level) = change.log_level {
            if let Err(e) = self.set_log_level(level) {
                tracing::warn!(%level, error = %e, "[ADL-LOG] log level change failed; no fields applied yet");
                return Err(e);
            }
        }
        if let Some(mode) = change.terminal_log_mode {
            if let Err(e) = self.set_mode(LogTarget::Terminal, mode) {
                tracing::warn!(?mode, error = %e, "[ADL-LOG] terminal mode change failed; log level (if any) already applied");
                return Err(e);
            }
        }
        if let Some(mode) = change.debug_log_mode {
            if let Err(e) = self.set_mode(LogTarget::Debug, mode) {
                tracing::warn!(?mode, error = %e, "[ADL-LOG] debug mode change failed; earlier fields already applied");
                return Err(e);
            }
        }
        if !change.is_empty() {
            // 自证行：设置项经 UI/HTTP 生效时留痕，便于用户与 agent 核对
            // （guards 均已释放，此处打日志不触达非重入锁）。
            // 用 warn 级别：调到 warn/error 后 info 行会被新门限自己过滤，
            // 用户将看到"无任何回显"而误判设置未生效。
            tracing::warn!(
                level = ?change.log_level,
                terminal = ?change.terminal_log_mode,
                debug = ?change.debug_log_mode,
                "[ADL-SETTINGS] runtime log settings applied"
            );
        }
        Ok(())
    }

    /// 终端日志文件前缀（供启动日志行自证进程角色）。
    pub fn terminal_prefix(&self) -> &str {
        &self.terminal_prefix
    }

    /// 有效日志目录（debug 构建为仓库根 `.adl-logs`，release 为数据根 `logs`）。
    /// 「关于 → 打开日志目录」等只读入口用它，避免指向未实际使用的目录。
    pub fn log_dir(&self) -> &std::path::Path {
        &self.log_dir
    }

    pub fn write_debug_logs(&self, content: &str) -> LogResult<()> {
        let mode = self
            .config
            .read()
            .map_err(|_| LogError::Config("config lock poisoned".into()))?
            .debug_log_mode;

        let fixed_path = log_file_path(&self.log_dir, DEBUG_LOG_PREFIX);

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
                let session_path = session_log_path(&self.log_dir, DEBUG_LOG_PREFIX, &ts);
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
            // 与 set_log_level/apply_change 同口径用 warn：先调级别到 error 再切模式时，
            // info 确认行会被新门限自己过滤（R4 同类误判），warn 恒可见。
            tracing::warn!(%mode, "[ADL-LOG] terminal log mode changed");
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
                    log_prune_failures("terminal session prune failed", &report);
                },
                LogTarget::Debug => {
                    let report = self
                        .debug_sessions
                        .lock()
                        .map_err(|_| LogError::ModeSwitch("session lock".into()))?
                        .prune_old_sessions()?;
                    log_prune_failures("debug session prune failed", &report);
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
        // helper 内空失败早返，此处不再重复门控（与 set_mode/async 三处无条件调用保持一致）。
        log_prune_failures("session prune failed", &report);
        Ok(report.removed)
    }

    pub async fn prune_sessions_async(&self, target: LogTarget) -> LogResult<usize> {
        let terminal_sessions = self.terminal_sessions.clone();
        let debug_sessions = self.debug_sessions.clone();
        // 日志在 `.await` 之后打：blocking 池线程不继承调用方 Span，且排序确定。
        let report = spawn_blocking(move || -> LogResult<PruneReport> {
            match target {
                LogTarget::Terminal => terminal_sessions
                    .lock()
                    .map_err(|_| LogError::Session("terminal session lock poisoned".into()))?
                    .prune_old_sessions(),
                LogTarget::Debug => debug_sessions
                    .lock()
                    .map_err(|_| LogError::Session("debug session lock poisoned".into()))?
                    .prune_old_sessions(),
            }
        })
        .await
        .map_err(|e| LogError::Session(format!("spawn_blocking failed: {e}")))?;
        let report = report?;
        log_prune_failures("session prune failed", &report);
        Ok(report.removed)
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
    prefix: String,
}

impl<'a> tracing_subscriber::fmt::writer::MakeWriter<'a> for TerminalMakeWriter {
    type Writer = TerminalWriter;

    fn make_writer(&'a self) -> Self::Writer {
        TerminalWriter {
            log_dir: self.log_dir.clone(),
            config: self.config.clone(),
            sessions: self.sessions.clone(),
            inner: self.inner.clone(),
            prefix: self.prefix.clone(),
        }
    }
}

struct TerminalWriter {
    log_dir: PathBuf,
    config: Arc<RwLock<LogConfig>>,
    sessions: Arc<Mutex<SessionTracker>>,
    inner: Arc<Mutex<Option<TerminalFileState>>>,
    prefix: String,
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
            let file = open_terminal_file(&self.log_dir, &self.prefix, mode, &session_ts)?;
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

fn open_terminal_file(
    log_dir: &Path,
    prefix: &str,
    mode: LogMode,
    session_ts: &str,
) -> std::io::Result<File> {
    match mode {
        LogMode::Overwrite => {
            let path = log_file_path(log_dir, prefix);
            OpenOptions::new().write(true).create(true).truncate(true).open(&path)
        },
        LogMode::Append => {
            let path = log_file_path(log_dir, prefix);
            OpenOptions::new().append(true).create(true).open(&path)
        },
        LogMode::Multi => {
            let path = session_log_path(log_dir, prefix, session_ts);
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

    fn test_config(terminal: LogMode, debug: LogMode) -> LogConfig {
        LogConfig { terminal_log_mode: terminal, debug_log_mode: debug, log_level: LogLevel::Info }
    }

    /// 直接构造 LogManager（跳过 `init` 的全局订阅者安装），并补齐 reload 句柄。
    fn test_manager_with(
        dir: &Path,
        config: Arc<RwLock<LogConfig>>,
        terminal_prefix: &str,
    ) -> LogManager {
        let level_cell = Arc::new(RwLock::new(config.read().unwrap().log_level));
        LogManager {
            config,
            log_dir: dir.to_path_buf(),
            terminal_prefix: terminal_prefix.to_string(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(dir, terminal_prefix))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(dir, DEBUG_LOG_PREFIX))),
            level_cell,
            terminal_file: Arc::new(Mutex::new(None)),
        }
    }

    fn test_manager(dir: &Path, config: LogConfig, prefix: &str) -> LogManager {
        test_manager_with(dir, Arc::new(RwLock::new(config)), prefix)
    }

    /// 与生产 `TerminalMakeWriter` 同构，用于断言文件层落到哪个前缀。
    fn test_make_writer(
        dir: &Path,
        config: Arc<RwLock<LogConfig>>,
        prefix: &str,
    ) -> TerminalMakeWriter {
        TerminalMakeWriter {
            log_dir: dir.to_path_buf(),
            config,
            sessions: Arc::new(Mutex::new(SessionTracker::new(dir, prefix))),
            inner: Arc::new(Mutex::new(None)),
            prefix: prefix.to_string(),
        }
    }

    #[test]
    fn write_debug_logs_overwrite() {
        let dir = test_log_dir("overwrite");
        let manager = test_manager(
            &dir,
            test_config(LogMode::Overwrite, LogMode::Overwrite),
            SHELL_TERMINAL_PREFIX,
        );

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
        let manager = test_manager(
            &dir,
            test_config(LogMode::Overwrite, LogMode::Append),
            SHELL_TERMINAL_PREFIX,
        );

        manager.write_debug_logs("line1\n").unwrap();
        manager.write_debug_logs("line2\n").unwrap();
        let content = fs::read_to_string(dir.join("debug-logs.txt")).unwrap();
        assert_eq!(content, "line1\nline2\n");
    }

    #[test]
    fn write_debug_logs_multi() {
        let dir = test_log_dir("multi");
        let manager = test_manager(
            &dir,
            test_config(LogMode::Overwrite, LogMode::Multi),
            SHELL_TERMINAL_PREFIX,
        );

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
        let config = Arc::new(RwLock::new(test_config(LogMode::Overwrite, LogMode::Overwrite)));
        let manager = test_manager_with(&dir, config.clone(), SHELL_TERMINAL_PREFIX);

        manager.set_mode(LogTarget::Debug, LogMode::Append).unwrap();
        let cfg = config.read().unwrap();
        assert_eq!(cfg.debug_log_mode, LogMode::Append);
    }

    #[test]
    fn set_log_level_updates_config_and_getter() {
        let dir = test_log_dir("setlevel");
        let manager = test_manager(
            &dir,
            test_config(LogMode::Overwrite, LogMode::Overwrite),
            SHELL_TERMINAL_PREFIX,
        );
        assert_eq!(manager.log_level().unwrap(), LogLevel::Info);

        manager.set_log_level(LogLevel::Trace).unwrap();
        assert_eq!(manager.log_level().unwrap(), LogLevel::Trace);
    }

    #[test]
    fn set_log_level_rejects_nothing_but_persists_every_valid_level() {
        let dir = test_log_dir("setlevel-all");
        let manager = test_manager(
            &dir,
            test_config(LogMode::Overwrite, LogMode::Overwrite),
            SHELL_TERMINAL_PREFIX,
        );
        for level in [LogLevel::Error, LogLevel::Warn, LogLevel::Debug, LogLevel::Trace] {
            manager.set_log_level(level).unwrap();
            assert_eq!(manager.log_level().unwrap(), level);
        }
    }

    /// 运行期热切换语义回归（Phase 4 R8）：`LevelGate` 直接读共享级别单元，
    /// stdout 层有效级别 = 当前级别，文件层 = `max(level, debug)`。此测试钉住
    /// 门控逻辑本身；其"调高即时生效"还依赖全局 base filter 缺省最宽松
    /// （见 `initial_base_filter` 注释），后者由启动期 e2e 覆盖。
    #[test]
    fn level_gate_tracks_runtime_level_changes() {
        use std::sync::{Arc, RwLock};
        let cell = Arc::new(RwLock::new(LogLevel::Info));
        let stdout_gate = LevelGate { level: cell.clone(), floor: None };
        let file_gate = LevelGate { level: cell.clone(), floor: Some(LogLevel::Debug) };

        assert_eq!(stdout_gate.effective_level(), Some(tracing::Level::INFO));
        assert_eq!(file_gate.effective_level(), Some(tracing::Level::DEBUG));

        *cell.write().unwrap() = LogLevel::Trace;
        assert_eq!(stdout_gate.effective_level(), Some(tracing::Level::TRACE));
        assert_eq!(file_gate.effective_level(), Some(tracing::Level::TRACE));

        *cell.write().unwrap() = LogLevel::Error;
        assert_eq!(stdout_gate.effective_level(), Some(tracing::Level::ERROR));
        // 文件层下限恒为 debug：调到 error 仍保留 post-mortem 能力。
        assert_eq!(file_gate.effective_level(), Some(tracing::Level::DEBUG));
    }

    /// 线程级共享缓冲 writer（供 live 订阅者实验）：每次写入时加锁追加，
    /// 避免返回借用内部缓冲的 guard（生命周期无法满足 `MakeWriter`）。
    #[derive(Clone)]
    struct SharedVecWriter {
        buf: Arc<Mutex<Vec<u8>>>,
    }

    impl std::io::Write for SharedVecWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.buf.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl<'a> tracing_subscriber::fmt::writer::MakeWriter<'a> for SharedVecWriter {
        type Writer = SharedVecWriter;

        fn make_writer(&'a self) -> Self::Writer {
            self.clone()
        }
    }

    /// 运行期"调高即时生效"的 live 实证（Closing H1）：经真实订阅者验证，
    /// error → trace 热切换后 trace 事件真实到达 writer（排除 interest-cache
    /// 陈旧导致的"调高静默失效"）。用线程级 `set_default` 隔离，不碰全局订阅者；
    /// 门控与 manager 共用同一级别单元，走真实路径实证。
    #[test]
    fn runtime_level_raise_reaches_live_subscriber() {
        let buf = Arc::new(Mutex::new(Vec::<u8>::new()));
        let level_cell = Arc::new(RwLock::new(LogLevel::Error));
        let layer = fmt::layer()
            .with_ansi(false)
            .with_writer(SharedVecWriter { buf: buf.clone() })
            .with_filter(LevelGate { level: level_cell.clone(), floor: None });
        let subscriber = Registry::default().with(layer);
        let _guard = tracing::subscriber::set_default(subscriber);
        // 门控与 manager 共用同一级别单元，走真实 `set_log_level` 路径（含重建缓存）。
        let dir = test_log_dir("live-raise");
        let config = Arc::new(RwLock::new(LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
            log_level: LogLevel::Error,
        }));
        let manager = LogManager {
            config,
            log_dir: dir.clone(),
            terminal_prefix: SHELL_TERMINAL_PREFIX.to_string(),
            terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(
                &dir,
                SHELL_TERMINAL_PREFIX,
            ))),
            debug_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, DEBUG_LOG_PREFIX))),
            level_cell: level_cell.clone(),
            terminal_file: Arc::new(Mutex::new(None)),
        };

        tracing::debug!("hidden-before-raise");
        assert!(
            !String::from_utf8_lossy(&buf.lock().unwrap()).contains("hidden-before-raise"),
            "error 门限下 debug 事件必须被过滤"
        );

        manager.set_log_level(LogLevel::Trace).unwrap();
        tracing::debug!("shown-after-raise");
        assert!(
            String::from_utf8_lossy(&buf.lock().unwrap()).contains("shown-after-raise"),
            "调高到 trace 后 debug 事件必须到达（interest-cache 不得过期）"
        );
    }

    /// F1：不同进程前缀的终端日志写入不同文件，互不截断。
    #[test]
    fn distinct_terminal_prefixes_write_to_distinct_files() {
        use tracing_subscriber::fmt::writer::MakeWriter;

        let dir = test_log_dir("f1-split");
        let shell = test_make_writer(
            &dir,
            Arc::new(RwLock::new(test_config(LogMode::Overwrite, LogMode::Overwrite))),
            SHELL_TERMINAL_PREFIX,
        );
        let server = test_make_writer(
            &dir,
            Arc::new(RwLock::new(test_config(LogMode::Overwrite, LogMode::Overwrite))),
            SERVER_TERMINAL_PREFIX,
        );

        {
            let mut w = shell.make_writer();
            w.write_all(b"shell-line\n").unwrap();
        }
        {
            let mut w = server.make_writer();
            w.write_all(b"server-line\n").unwrap();
        }

        assert_eq!(fs::read_to_string(dir.join("terminal-logs.txt")).unwrap(), "shell-line\n");
        assert_eq!(fs::read_to_string(dir.join("adl-server-logs.txt")).unwrap(), "server-line\n");
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
        let config = Arc::new(RwLock::new(test_config(LogMode::Overwrite, LogMode::Overwrite)));
        let manager = Arc::new(test_manager_with(&dir, config.clone(), SHELL_TERMINAL_PREFIX));

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

    /// 与上同构：`set_log_level` 在守卫外 reload，不得死锁。
    #[test]
    fn set_log_level_does_not_deadlock_event_writer() {
        use std::sync::mpsc;
        use std::time::Duration;
        use tracing_subscriber::fmt::writer::MakeWriter;

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
                let _level = self
                    .config
                    .read()
                    .map(|c| c.log_level)
                    .map_err(|_| std::io::Error::other("config lock poisoned"))?;
                Ok(buf.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }

        let dir = test_log_dir("setlevel-deadlock");
        let config = Arc::new(RwLock::new(test_config(LogMode::Overwrite, LogMode::Overwrite)));
        let manager = Arc::new(test_manager_with(&dir, config.clone(), SHELL_TERMINAL_PREFIX));

        let subscriber = tracing_subscriber::fmt()
            .with_writer(ConfigReadingMakeWriter { config: config.clone() })
            .with_ansi(false)
            .finish();

        let (tx, rx) = mpsc::channel();
        let m = manager.clone();
        std::thread::spawn(move || {
            let r =
                tracing::subscriber::with_default(subscriber, || m.set_log_level(LogLevel::Trace));
            let _ = tx.send(r);
        });

        let result = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("set_log_level timed out: writer re-entered the config lock (deadlock)");
        result.unwrap();
        assert_eq!(config.read().unwrap().log_level, LogLevel::Trace);
    }

    #[tokio::test]
    async fn prune_sessions_async_works() {
        let dir = tempdir().unwrap();
        let manager = test_manager(
            dir.path(),
            test_config(LogMode::Overwrite, LogMode::Overwrite),
            SHELL_TERMINAL_PREFIX,
        );

        for i in 0..35 {
            let path = dir.path().join(format!("terminal-logs-2026-06-27_{:02}0000.txt", i));
            std::fs::write(&path, "data").unwrap();
        }

        let removed = manager.prune_sessions_async(LogTarget::Terminal).await.unwrap();
        assert!(removed >= 5, "removed {removed}, expected >=5");
    }
}
