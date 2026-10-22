use adl_clipboard::ClipboardStore;
use adl_kernel::config::AppConfig;
use adl_kernel::events::EventBus;
use adl_pty::AsyncSessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_sysmon::SystemMonitor;
use adl_types::WorkspaceMeta;
use adl_webapp_host::HostedProcess;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::AtomicU16;
use std::sync::{Arc, Mutex as StdMutex, RwLock};
use tokio::sync::Mutex as AsyncMutex;

/// 宿主持有的一次 dsh 拉起：子进程句柄 + 本次 spawn 的来源版本与来源类型。
/// （`HostedProcess` 未实现 `Debug`，此处不派生；需打印时逐字段记。）
pub struct ManagedDsh {
    pub process: HostedProcess,
    pub version: Option<String>,
    /// 本次 spawn 的来源（host=宿主安装版本 / system=系统安装命令）。
    /// `running.source` 对外暴露 `host|system|external`，external 只用于
    /// 非宿主持有（外部复用）进程，不会写入本结构。
    pub source: DshSpawnSource,
}

/// 宿主持有进程的 spawn 来源（对外序列化为 `host` / `system`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DshSpawnSource {
    Host,
    System,
}

impl DshSpawnSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Host => "host",
            Self::System => "system",
        }
    }
}

#[derive(Clone)]
pub struct ServerState {
    pub data_dir: PathBuf,
    pub storage: std::sync::Arc<adl_kernel::storage::StorageService>,
    pub db: Database,
    pub config: Arc<RwLock<AppConfig>>,
    pub event_bus: EventBus,
    /// adl-server 进程自身的日志管理器（`/app/preferences` 运行时切换级别/模式用）。
    pub log_manager: Arc<adl_logging::LogManager>,
    /// 本次进程的会话级日志覆盖（CLI/env）；`/app/preferences` 不覆盖被其锁定的字段。
    pub log_overrides: adl_logging::LogOverrides,
    pub current_workspace: Arc<RwLock<Option<WorkspaceMeta>>>,
    pub editor_dirty_paths: Arc<StdMutex<HashSet<String>>>,
    pub pty_sessions: Arc<AsyncSessionManager>,
    pub started_at: i64,
    pub durable_manager: DurableSessionManager,
    pub server_port: Arc<AtomicU16>,
    pub clipboard_store: Arc<ClipboardStore>,
    pub sysmon: Arc<StdMutex<SystemMonitor>>,
    /// dsh 宿主壳运行时状态：当前被拉起的 dsh 进程（`None` 表示未运行）。
    /// 用 tokio AsyncMutex 共享，`HostedProcess` 内含
    /// `tokio::process::Child` 不能 Clone，故整体包在 Option 中由锁保护。
    /// `version` 记录本次 spawn 的来源版本（事项 2026-10-20/1：运行中显示真实版
    /// 本用；外部复用进程无 Child 可持有，不写入此锁，`source-status` 据此区分
    /// “宿主拉起（版本已知）”与“外部运行（版本未知）”）。
    pub dsh_state: Arc<AsyncMutex<Option<ManagedDsh>>>,
    /// 串行化 dsh 启动（free_stale + spawn）的独立锁：与 `dsh_state` 分离，
    /// 使 close/revert/uninstall 在启动期间不被阻塞，同时避免两个并发
    /// `/dsh/open` 各自 spawn、或第二个的 free-stale 误杀第一个刚起的进程。
    pub dsh_start_lock: Arc<AsyncMutex<()>>,
    /// 串行化版本目录变更（安装/卸载/切换/重装），避免并发写入同一目录。
    pub dsh_version_lock: Arc<AsyncMutex<()>>,
    /// 当前版本任务进度（安装/卸载/重装的真实进度与取消标志）。
    pub dsh_version_task: adl_dsh_version::TaskReporter,
    /// dsh 来源缓存：避免每次打开 dsh 时都重新检测来源
    pub dsh_source_cache: Arc<RwLock<Option<adl_dsh_version::DshSource>>>,
    /// 官方版本目录缓存（聚合快照 `/dsh/settings-snapshot` 用）：TTL 内直接复用，
    /// 避免每次进入设置面板都走一次 registry 网络请求；拉取失败时回退旧值。
    pub dsh_catalog_cache:
        Arc<RwLock<Option<(std::time::Instant, adl_dsh_version::VersionCatalog)>>>,
    /// 活动工作区文件监听器（warn+降级：启动失败时保持 `None`，功能退化为无自动刷新）
    pub workspace_watcher: Arc<StdMutex<Option<adl_workspace::WorkspaceWatcher>>>,
}
