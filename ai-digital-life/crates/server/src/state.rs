use adl_clipboard::ClipboardStore;
use adl_kernel::config::AppConfig;
use adl_kernel::events::EventBus;
use adl_pty::SessionManager;
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

#[derive(Clone)]
pub struct ServerState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: Arc<RwLock<AppConfig>>,
    pub event_bus: EventBus,
    pub current_workspace: Arc<RwLock<Option<WorkspaceMeta>>>,
    pub editor_dirty_paths: Arc<StdMutex<HashSet<String>>>,
    pub pty_sessions: Arc<StdMutex<SessionManager>>,
    pub started_at: i64,
    pub durable_manager: DurableSessionManager,
    pub server_port: Arc<AtomicU16>,
    pub clipboard_store: Arc<ClipboardStore>,
    pub sysmon: Arc<StdMutex<SystemMonitor>>,
    /// dsh 宿主壳运行时状态：当前被拉起的 dsh 进程（`None` 表示未运行）。
    /// 用 tokio AsyncMutex 共享，`HostedProcess` 内含
    /// `tokio::process::Child` 不能 Clone，故整体包在 Option 中由锁保护。
    pub dsh_state: Arc<AsyncMutex<Option<HostedProcess>>>,
    /// 串行化 dsh 启动（free_stale + spawn）的独立锁：与 `dsh_state` 分离，
    /// 使 close/revert/uninstall 在启动期间不被阻塞，同时避免两个并发
    /// `/dsh/open` 各自 spawn、或第二个的 free-stale 误杀第一个刚起的进程。
    pub dsh_start_lock: Arc<AsyncMutex<()>>,
    /// dsh 来源缓存：避免每次打开 dsh 时都重新检测来源
    pub dsh_source_cache: Arc<RwLock<Option<adl_dsh_version::DshSource>>>,
}
