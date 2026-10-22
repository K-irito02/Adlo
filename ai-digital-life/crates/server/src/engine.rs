use crate::state::ServerState;
use adl_clipboard::ClipboardMonitor;
use adl_errors::AppError;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_logging::LogManager;
use adl_pty::AsyncSessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_types::{WorkspaceMeta, now_ms};
use std::io::Write;
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex, RwLock};
use tokio::sync::Mutex as AsyncMutex;
use tokio::sync::broadcast::error::RecvError;
use tracing::info;

/// 由 locator + 默认根构造存储服务。adl-server 的默认根即 `--data-dir`。
pub fn storage_from_locator(
    locator: &adl_kernel::storage::StorageLocator,
    default_root: &Path,
) -> std::sync::Arc<adl_kernel::storage::StorageService> {
    let defaults = adl_kernel::storage::StorageDefaults {
        root: default_root.to_path_buf(),
        credentials_dir: adl_kernel::storage::locator::locator_dir().join("credentials"),
        // adl-server 不管理默认下载目录；用 root 占位，壳层才提供真实启发式值。
        downloads_dir: default_root.to_path_buf(),
    };
    std::sync::Arc::new(adl_kernel::storage::StorageService::from_locator(locator, &defaults))
}

/// 生成一行人类可读的迁移摘要（日志与报告复用）。
pub fn summarize_migration(report: &adl_kernel::storage::MigrationReport) -> String {
    if report.ok {
        format!(
            "storage migration ok: {} files / {} bytes moved, {} dirs removed, {} dirs kept",
            report.moved_files,
            report.moved_bytes,
            report.removed_dirs.len(),
            report.kept_dirs.len()
        )
    } else {
        format!("storage migration failed: {}", report.error.as_deref().unwrap_or("unknown"))
    }
}

/// 在打开任何 DB/日志句柄之前执行待迁移。返回执行的报告（无待迁移时 None）。
pub fn run_startup_migration(
    defaults: &adl_kernel::storage::StorageDefaults,
) -> Option<adl_kernel::storage::MigrationReport> {
    let mut locator = adl_kernel::storage::load_locator();
    locator.pending_migration.as_ref()?;
    let report = adl_kernel::storage::apply_pending(&mut locator, defaults, |progress| {
        eprintln!("[adl-server] migration: {progress:?}");
    });
    if let Err(e) = adl_kernel::storage::save_locator(&locator) {
        eprintln!("[adl-server] failed to persist storage locator: {e}");
    }
    if let Some(r) = report.as_ref() {
        eprintln!("[adl-server] {}", summarize_migration(r));
    }
    report
}

/// A11：先迁移、再读 locator、最后构造 `StorageService`。
///
/// 顺序不变量（load-bearing）：迁移会改写 locator 的 `selection.root`，因此 storage
/// **必须**在迁移之后从（新）locator 构造；否则 standalone adl-server 会在本次进程用
/// 迁移前的旧根打开 DB，导致「数据看似丢失」。为避免触碰真实 `%APPDATA%` locator 的
/// 单测，本函数把 `migrate` / `load` 作为注入点交给私有 `*_with` 变体。
pub fn build_storage_after_migration(
    defaults: &adl_kernel::storage::StorageDefaults,
    data_dir: &Path,
) -> std::sync::Arc<adl_kernel::storage::StorageService> {
    build_storage_after_migration_with(
        defaults,
        data_dir,
        run_startup_migration,
        adl_kernel::storage::load_locator,
    )
}

fn build_storage_after_migration_with(
    defaults: &adl_kernel::storage::StorageDefaults,
    data_dir: &Path,
    migrate: impl FnOnce(
        &adl_kernel::storage::StorageDefaults,
    ) -> Option<adl_kernel::storage::MigrationReport>,
    load: impl FnOnce() -> adl_kernel::storage::StorageLocator,
) -> std::sync::Arc<adl_kernel::storage::StorageService> {
    // 顺序不变量：migrate → load → build。切勿交换前两步。
    let _ = migrate(defaults);
    let locator = load();
    storage_from_locator(&locator, data_dir)
}

pub async fn init_server_state(
    _data_dir: &Path,
    storage: std::sync::Arc<adl_kernel::storage::StorageService>,
) -> Result<ServerState, AppError> {
    // 收敛为 locator 驱动的唯一根；`--data-dir` 仅作为解析默认根时的输入。
    let data_dir: &Path = &storage.paths().root;
    std::fs::create_dir_all(data_dir).ok();
    eprintln!("[ad-server] init_server_state start, data_dir={}", data_dir.display());
    let dev_project_root = if cfg!(debug_assertions) {
        Some(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .and_then(std::path::Path::parent)
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from(".")),
        )
    } else {
        None
    };
    let log_dir =
        adl_kernel::storage::resolve_log_dir(storage.paths(), dev_project_root.as_deref());
    std::fs::create_dir_all(&log_dir).ok();
    // 日志设置真源 = config.json；CLI/env 会话级覆盖（不落盘）随后叠加。
    eprintln!("[ad-server] loading config...");
    let mut config = adl_config::load_from(&storage.paths().config_dir)
        .map_err(|e| AppError::Internal(format!("Config load failed: {e}")))?;
    eprintln!("[ad-server] config loaded");
    let log_overrides = adl_logging::LogOverrides::from_env();
    let has_log_overrides = log_overrides.any();
    if has_log_overrides {
        config.apply_log_overrides(&log_overrides);
    }
    eprintln!("[ad-server] initializing LogManager...");
    let log_manager =
        LogManager::init(&config.to_log_config(), &log_dir, adl_logging::SERVER_TERMINAL_PREFIX)
            .map_err(|e| AppError::Internal(format!("LogManager init failed: {e}")))?;
    eprintln!(
        "[ADL-LOG] logger ready level={} prefix={} dir={}",
        config.log_level,
        log_manager.terminal_prefix(),
        log_dir.display()
    );
    if has_log_overrides {
        eprintln!("[ADL-CLI] {} (session override, not persisted)", log_overrides.summary());
    }

    let db_path = storage.paths().data_db.clone();
    eprintln!("[ad-server] opening database at {}...", db_path.display());
    let db = Database::open(&db_path)
        .map_err(|e| AppError::Internal(format!("Database open failed: {e}")))?;
    // 确保 schema（包括 durable_session_state、clipboard_items 等）就绪。生产环境
    // 由内核在 spawn 前迁移过 data.db，但此处幂等（CREATE TABLE IF NOT EXISTS），
    // 使本函数在全新 data_dir 上也能自给自足（测试直接构造 state 时同样可用）。
    db.init_schema()
        .map_err(|e| AppError::Internal(format!("Database init_schema failed: {e}")))?;
    // 运行待处理的 schema 迁移
    adl_migration::run_pending(&db)
        .map_err(|e| AppError::Internal(format!("Database migration failed: {e}")))?;
    eprintln!("[ad-server] database opened");

    // 方案 A：从 DB 恢复上次激活的工作区（current_workspace），使重启后前端
    // bootstrap 能走"有当前工作区"分支并预加载其文件树，避免每次点击都触发
    // 全量扫描。`open` 把 meta 以 JSON 字符串写入 app_state["current_workspace"]，
    // `clear_current` 写入字面量 "null"。此处读取并解析，缺失/null → None。
    let restored_current_workspace = restore_current_workspace(&db)?;
    if restored_current_workspace.is_some() {
        eprintln!(
            "[ad-server] restored current workspace: {}",
            restored_current_workspace.as_ref().map(|w| w.name.as_str()).unwrap_or("")
        );
    }

    let event_bus = EventBus::new(256);
    let restored_root = restored_current_workspace.as_ref().map(|w| w.root_path.clone());
    let current_workspace = Arc::new(RwLock::new(restored_current_workspace));
    let editor_dirty_paths = Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
    let pty_sessions = Arc::new(AsyncSessionManager::new());
    let durable_manager = DurableSessionManager::new(db.clone());
    let server_port = Arc::new(std::sync::atomic::AtomicU16::new(0));
    eprintln!("[ad-server] init_server_state complete");

    // 剪贴板/系统监控（浏览器预览端，等价桌面能力）。剪贴板 store 与监听线程共享同一
    // db（r2d2 连接池，Arc），供 clipboard_* handler 读写。监听线程在 `serve()` 里
    // 通过 `start_background_services` 启动（不在 `init_server_state` 启动，避免测试
    // 直接构造 state 时泄漏监听线程）。
    let clipboard_store =
        Arc::new(adl_clipboard::ClipboardStore::new(db.clone(), &storage.paths().clipboard_dir));
    let sysmon = Arc::new(StdMutex::new(adl_sysmon::SystemMonitor::new()));
    let dsh_state = Arc::new(AsyncMutex::new(None));
    let dsh_start_lock = Arc::new(AsyncMutex::new(()));
    let dsh_version_lock = Arc::new(AsyncMutex::new(()));
    let dsh_version_task = adl_dsh_version::TaskReporter::new();
    let dsh_source_cache = Arc::new(RwLock::new(None));
    let dsh_catalog_cache = Arc::new(RwLock::new(None));

    let state = ServerState {
        data_dir: data_dir.to_path_buf(),
        storage: storage.clone(),
        db,
        config: Arc::new(RwLock::new(config)),
        event_bus,
        log_manager: Arc::new(log_manager),
        log_overrides,
        current_workspace,
        editor_dirty_paths,
        pty_sessions,
        started_at: now_ms(),
        durable_manager,
        server_port,
        clipboard_store,
        sysmon,
        dsh_state,
        dsh_start_lock,
        dsh_version_lock,
        dsh_version_task,
        dsh_source_cache,
        dsh_catalog_cache,
        workspace_watcher: Arc::new(StdMutex::new(None)),
    };
    if let Some(root) = restored_root.as_ref() {
        restart_workspace_watcher(&state, Path::new(root));
    }
    Ok(state)
}

/// 启动/重建活动工作区 watcher：把批次转成 `AppEvent::FilesChanged` 广播给 WS 订阅者。
/// 失败仅告警（降级为无自动刷新），不影响应用启动。
///
/// 生命周期不变量（事项 45 Phase 4 R3 核验结论）：改变"当前工作区"的出口只有
/// `open`（重建）、`clear-current`（停止）、进程启动恢复（重建）；分支切换等
/// 只更新元数据（同根），无需重建。`emit` 是 broadcast 非阻塞发送，watcher
/// 回调永不被反压（慢订阅者侧以 `Lagged→overflow` 降级）。
pub(crate) fn restart_workspace_watcher(state: &ServerState, root: &std::path::Path) {
    // 先短持锁取出旧实例，锁外 stop/start：持锁 join 线程会占用 executor，
    // 且未来回调若需此锁即死锁（事项 45 Phase 4 D1）。
    let previous = match state.workspace_watcher.lock() {
        Ok(mut slot) => slot.take(),
        Err(poisoned) => {
            tracing::warn!("workspace watcher slot poisoned; recovering");
            poisoned.into_inner().take()
        },
    };
    if let Some(previous) = previous {
        previous.stop();
    }
    let bus = state.event_bus.clone();
    let callback = std::sync::Arc::new(move |batch: adl_workspace::FilesChangedBatch| {
        bus.emit(adl_kernel::events::AppEvent::FilesChanged {
            changed: batch.changed,
            removed: batch.removed,
            overflow: batch.overflow,
        });
    });
    match adl_workspace::WorkspaceWatcher::start(root, callback) {
        Ok(watcher) => match state.workspace_watcher.lock() {
            Ok(mut slot) => *slot = Some(watcher),
            Err(poisoned) => {
                tracing::warn!("workspace watcher slot poisoned; recovering");
                *poisoned.into_inner() = Some(watcher);
            },
        },
        Err(err) => {
            tracing::warn!(error = %err, root = %root.display(), "workspace watcher disabled")
        },
    }
}

/// Start the ad-server background services tied to the process lifetime: the
/// clipboard listener (writes history to `data.db`) plus a parked keep-alive
/// thread that holds the listener handle alive. Called from `serve()` so tests
/// that build `ServerState` directly (`init_server_state`) never spawn these.
///
/// Also bridges the clipboard monitor's broadcast into `EventBus` as
/// `AppEvent::ClipboardChanged`, so `/ws/workspace` can push an instant
/// "clipboard changed" frame (previously the broadcast had no subscriber and
/// the event was never emitted — the UI fell back to a 10 s poll).
pub fn start_background_services(state: &ServerState) {
    // 启动剪贴板监听。句柄必须存续至进程生命周期，否则 Drop 会触发监听线程立即退出；
    // 放入独立 thread，持句柄阻塞保活（与其它后台服务的保活线程同思路）。
    //
    // 订阅必须先于 `spawn`：`spawn` 以值语义消费 `monitor`，之后无法再 `subscribe`。
    let monitor = ClipboardMonitor::new();
    let mut changes = monitor.subscribe();
    let monitor_handle = monitor.spawn(state.clipboard_store.clone());

    // 监听广播 → 事件总线：此前该 broadcast 无订阅者、ClipboardChanged 从未 emit，
    // 前端只能靠轮询。`EventBus` 为 `Clone`，桥接线程持有其克隆即可。
    // 用 `blocking_recv()` 阻塞等待：该线程非 async 上下文，可用 tokio sync 的阻塞原语
    // （不会忙等）。`Lagged` 仅表示落后于广播环形缓冲，non-terminal：记录后继续，
    // 否则线程永久退出会静默掐断推送路径；`Closed`（发送端消失）才终止。
    let bus = state.event_bus.clone();
    std::thread::spawn(move || {
        loop {
            match changes.blocking_recv() {
                Ok(_signal) => bus.emit(adl_kernel::events::AppEvent::ClipboardChanged),
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(
                        skipped,
                        "clipboard bridge: monitor broadcast lagged; continuing"
                    );
                },
                Err(RecvError::Closed) => break,
            }
        }
    });

    std::thread::spawn(move || {
        let _handle = monitor_handle; // 保持监听线程存活
        std::thread::park();
    });
}

pub async fn serve(state: ServerState, port: u16) -> u16 {
    start_background_services(&state);

    // 内置包收编：把安装器投放的内置包变成一条普通宿主版本（一次性，收编后该目录即删除）。
    // 必须在端口监听之前同步完成——否则 /dsh/open、/dsh/source-status 可能在收编进行中
    // 先看到「无可用来源」，而结果又被 `dsh_source_cache` 缓存住，直到重启才恢复。
    // 常规情形只是一次同卷 rename（O(1)）；只有跨卷时才退化为复制，属首次启动的一次性开销。
    crate::handlers::dsh::adopt_bundled_version(&state).await;

    // Pre-start dsh in background — by the time the splash screen ends (~3.5-8s),
    // dsh should already be running, making the user's click instant.
    let pre_start_state = state.clone();
    tokio::spawn(async move {
        crate::handlers::dsh::pre_start_dsh(&pre_start_state).await;
    });

    // 官方版本目录预热：首屏聚合快照通常直接命中缓存（不阻塞启动）。
    let prewarm_state = state.clone();
    tokio::spawn(async move {
        crate::handlers::dsh::prewarm_catalog(&prewarm_state).await;
    });

    let app = crate::router::app_router(state.clone()).with_state(state.clone());
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("failed to bind TCP listener");
    let bound_port = listener.local_addr().expect("failed to get local address").port();
    state.server_port.store(bound_port, std::sync::atomic::Ordering::Relaxed);
    println!("AD_SERVER_PORT={bound_port}");
    let _ = std::io::stdout().flush();
    info!("[ad-server] listening on 127.0.0.1:{bound_port}");

    let _ = axum::serve(listener, app).await;
    bound_port
}

/// 从 DB `app_state["current_workspace"]` 恢复上次激活的工作区元数据。
///
/// - 键不存在 → None（从未打开过任何工作区）
/// - 值为 JSON 字符串 `"null"` → None（上次执行了 clear-current）
/// - 值为 WorkspaceMeta 的 JSON → 解析返回 Some(meta)
///
/// 解析失败时按 None 处理（不阻塞启动），记录告警供诊断。
fn restore_current_workspace(db: &Database) -> Result<Option<WorkspaceMeta>, AppError> {
    let raw = match db.get_state("current_workspace")? {
        Some(v) => v,
        None => return Ok(None),
    };
    if raw.trim() == "null" || raw.trim().is_empty() {
        return Ok(None);
    }
    match serde_json::from_str::<WorkspaceMeta>(&raw) {
        Ok(meta) => {
            tracing::info!(workspace_id = %meta.id, root = %meta.root_path, "restored current_workspace from db");
            Ok(Some(meta))
        },
        Err(e) => {
            tracing::warn!(error = %e, "failed to deserialize persisted current_workspace; starting with none");
            Ok(None)
        },
    }
}

#[cfg(test)]
mod storage_tests {
    use super::*;

    #[test]
    fn storage_from_locator_uses_default_root_for_data_db() {
        let root = std::path::PathBuf::from("/test-root");
        let svc = storage_from_locator(&adl_kernel::storage::StorageLocator::default(), &root);
        assert_eq!(svc.paths().data_db, root.join("data.db"));
        assert_eq!(svc.paths().logs_dir, root.join("logs"));
    }

    #[test]
    fn storage_from_locator_honors_per_category_override() {
        let root = std::path::PathBuf::from("/test-root");
        let mut loc = adl_kernel::storage::StorageLocator::default();
        loc.selection.mode = adl_kernel::storage::StorageMode::PerCategory;
        loc.selection.categories.insert(
            adl_kernel::storage::StorageCategory::Clipboard,
            std::path::PathBuf::from("/clip"),
        );
        let svc = storage_from_locator(&loc, &root);
        assert_eq!(svc.paths().clipboard_dir, std::path::PathBuf::from("/clip"));
    }

    #[test]
    fn storage_root_is_the_canonical_data_dir() {
        let root = std::path::PathBuf::from("/canon");
        let svc = storage_from_locator(&adl_kernel::storage::StorageLocator::default(), &root);
        assert_eq!(svc.paths().root, root);
    }
}

#[cfg(test)]
mod startup_migration_tests {
    use super::*;

    #[test]
    fn summarize_migration_reports_success_or_failure() {
        let ok = adl_kernel::storage::MigrationReport {
            at: 1,
            ok: true,
            switched: true,
            moved_files: 3,
            moved_bytes: 2048,
            removed_dirs: vec![],
            kept_dirs: vec![],
            retained: false,
            error: None,
        };
        assert!(summarize_migration(&ok).contains("3"));
        let bad = adl_kernel::storage::MigrationReport {
            at: 1,
            ok: false,
            switched: false,
            moved_files: 0,
            moved_bytes: 0,
            removed_dirs: vec![],
            kept_dirs: vec![],
            retained: false,
            error: Some("disk full".into()),
        };
        assert!(summarize_migration(&bad).contains("disk full"));
    }

    /// A11 顺序不变量：migrate → load → build，且 storage 根取自（迁移后的）locator，
    /// 而非 `data_dir`。用注入点实现，不触碰真实 `%APPDATA%` locator。
    #[test]
    fn storage_is_built_from_post_migration_locator_root() {
        use std::cell::RefCell;
        use std::path::PathBuf;

        let order: RefCell<Vec<&str>> = RefCell::new(Vec::new());
        let mut loc = adl_kernel::storage::StorageLocator::default();
        loc.selection.root = Some(PathBuf::from("/migrated-root"));

        let defaults = adl_kernel::storage::StorageDefaults {
            root: PathBuf::from("/data-dir"),
            credentials_dir: PathBuf::from("/creds"),
            downloads_dir: PathBuf::from("/dl"),
        };

        let svc = build_storage_after_migration_with(
            &defaults,
            std::path::Path::new("/data-dir"),
            |_d| {
                order.borrow_mut().push("migrate");
                None
            },
            || {
                order.borrow_mut().push("load");
                loc.clone()
            },
        );

        assert_eq!(*order.borrow(), vec!["migrate", "load"], "migration must precede locator load");
        assert_eq!(svc.paths().root, PathBuf::from("/migrated-root"));
        assert_ne!(svc.paths().root, PathBuf::from("/data-dir"));
    }
}
