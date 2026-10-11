use std::path::Path;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use anyhow::Context;
use tauri::Manager;
use tracing::{info, warn};

use crate::adl_server::AdServerHandle;
use crate::state::AppState;
use adl_kernel::config_watcher::ConfigWatcher;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_types::now_ms;

fn resolve_project_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 构造壳层的存储默认值。默认数据根优先取「与安装目录同级的 `<安装目录名>-data`」；
/// 该路径不可写（如 Program Files 等 Windows 拦截/只读位置）时回退到系统用户数据目录；
/// 凭据目录与默认下载目录分别取平台默认与 `adl_browser` 的启发式值。
pub fn resolve_defaults(app: &tauri::App) -> anyhow::Result<adl_kernel::storage::StorageDefaults> {
    let app_data_root = app.path().app_data_dir().context("failed to resolve app data dir")?;
    let root = default_data_root(app_data_root.clone());
    let credentials_dir = adl_kernel::storage::locator::locator_dir().join("credentials");
    let downloads_dir = adl_browser::download_manager::get_default_download_path();
    Ok(adl_kernel::storage::StorageDefaults { root, credentials_dir, downloads_dir })
}

/// 计算默认数据根：优先「与安装目录同级的新建 `<安装目录名>-data」目录」；
/// 该路径不可写时回退到已解析的系统用户数据目录。
/// 说明：仅打包（release）产物启用该同级策略；debug 构建 exe 位于 `target/debug`，
/// 同级目录会落在 `target/` 内，被 `cargo clean`/`clean-target.ps1` 物理删除，故直接回落系统数据目录。
fn default_data_root(fallback: PathBuf) -> PathBuf {
    if cfg!(debug_assertions) {
        return fallback;
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .map_or(fallback.clone(), |install_dir| preferred_default_root(&install_dir, fallback))
}

/// 在两个候选路径 `install_dir`、`fallback` 间选出默认数据根：
/// `install_dir` 与 `<install_dir 名>-data` 同级，若该候选可写则用它，否则用 `fallback`。
fn preferred_default_root(install_dir: &Path, fallback: PathBuf) -> PathBuf {
    let Some(name) = install_dir.file_name().map(|n| n.to_string_lossy().into_owned()) else {
        return fallback;
    };
    let parent = install_dir.parent().unwrap_or(install_dir);
    let candidate = parent.join(format!("{name}-data"));
    if is_writable(&candidate) { candidate } else { fallback }
}

/// 判定候选数据根可写：复用 `adl-kernel::storage::probe_writable`（创建目录并写入/删除探针文件），
/// 保证 `.adl-write-probe` 探针契约与存储预检单点一致。
/// 说明：该探测依赖 exe manifest 已禁用 UAC 文件虚拟化（Tauri v2 默认 `asInvoker`）；
/// 否则对 Program Files 等受保护位置的写入会被静默重定向到 VirtualStore，导致误判为可写。
fn is_writable(dir: &Path) -> bool {
    adl_kernel::storage::probe_writable(dir).is_ok()
}

/// 壳层启动迁移：在打开任何 DB/日志句柄之前执行待迁移。
pub fn run_startup_migration(
    defaults: &adl_kernel::storage::StorageDefaults,
) -> Option<adl_kernel::storage::MigrationReport> {
    let mut locator = adl_kernel::storage::load_locator();
    locator.pending_migration.as_ref()?;
    let report = adl_kernel::storage::apply_pending(&mut locator, defaults, |progress| {
        info!(?progress, "storage migration progress");
    });
    if let Err(e) = adl_kernel::storage::save_locator(&locator) {
        tracing::error!(error = %e, "failed to persist storage locator after migration");
    }
    if let Some(r) = report.as_ref() {
        info!(ok = r.ok, files = r.moved_files, "storage migration finished");
    }
    report
}

/// Build the system-only shell state. Business (DB, workspace, providers,
/// durable sessions, SSE) lives in the spawned `adl-server` process — the shell
/// keeps config + log manager + browser manager, then spawns the adl-server child.
pub fn init_app_state(
    data_dir: PathBuf,
    storage: Arc<adl_kernel::storage::StorageService>,
    defaults: adl_kernel::storage::StorageDefaults,
) -> anyhow::Result<AppState> {
    let t0 = std::time::Instant::now();

    let mut config = match adl_config::load_from(&storage.paths().config_dir) {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "config load failed, using default");
            adl_config::AppConfig::default()
        },
    };
    info!("[ADL-PERF] config load: {}ms", t0.elapsed().as_millis());

    // CLI / env 会话级日志覆盖（不写回 config.json）：优先级 CLI flag > env > config.json。
    // （RUST_LOG 另作全局硬顶，由 LogManager 内部处理。）
    let log_overrides = adl_logging::LogOverrides::from_env();
    let has_log_overrides = log_overrides.any();
    if has_log_overrides {
        config.apply_log_overrides(&log_overrides);
    }

    // 开发态（debug）保留写仓库根 .adl-logs，release 使用 <root>/logs。
    let dev_project_root = if cfg!(debug_assertions) { Some(resolve_project_root()) } else { None };
    let log_dir =
        adl_kernel::storage::resolve_log_dir(storage.paths(), dev_project_root.as_deref());
    std::fs::create_dir_all(&log_dir)?;

    let t1 = std::time::Instant::now();
    // shell 侧终端日志前缀：与 adl-server 分离，避免两进程 Overwrite 互踩同一文件。
    let log_manager = adl_logging::LogManager::init(
        &config.to_log_config(),
        &log_dir,
        adl_logging::SHELL_TERMINAL_PREFIX,
    )
    .context("failed to init log manager")?;
    info!("[ADL-PERF] log init: {}ms", t1.elapsed().as_millis());

    info!(
        level = %config.log_level,
        prefix = log_manager.terminal_prefix(),
        dir = %log_dir.display(),
        "[ADL-LOG] logger ready"
    );
    if has_log_overrides {
        info!("[ADL-CLI] {} (session override, not persisted)", log_overrides.summary());
    }

    let event_bus = EventBus::default();

    let config_arc = Arc::new(RwLock::new(config));

    // Spawn the adl-server child (business engine). Graceful: a missing binary or
    // failed spawn leaves `base_url: None` and the shell runs system-only.
    let ad_server = AdServerHandle::spawn(&data_dir);
    info!("[ADL-PERF] adl-server spawn: {}ms", t0.elapsed().as_millis());

    info!("[ADL-PERF] init_app_state TOTAL: {}ms", t0.elapsed().as_millis());

    let site_meta_cache = adl_browser::SiteMetaCacheStore::open(&storage.paths().root)
        .map_err(|e| anyhow::anyhow!("failed to open site-meta-cache store: {e}"))?;
    let browser_manager = adl_browser::BrowserManager::new(site_meta_cache);

    let download_db_path = storage.paths().downloads_db.clone();
    let download_db = adl_storage::Database::open(&download_db_path)
        .map_err(|e| anyhow::anyhow!("failed to open download database: {e}"))?;
    download_db
        .init_schema()
        .map_err(|e| anyhow::anyhow!("failed to init download schema: {e}"))?;
    adl_migration::run_pending(&download_db)
        .map_err(|e| anyhow::anyhow!("failed to apply download migrations: {e}"))?;
    let download_manager = adl_browser::download_handler::create_download_manager(download_db);
    download_manager.set_default_dir_override(Some(storage.paths().downloads_default_dir.clone()));

    Ok(AppState {
        storage: storage.clone(),
        storage_defaults: defaults,
        config: config_arc,
        event_bus,
        browser_manager,
        log_manager: Arc::new(log_manager),
        log_overrides,
        started_at: now_ms(),
        ad_server,
        download_manager,
    })
}

/// 计算需要同步到 LogManager 的字段：仅当值变化**且**该字段未被 CLI/env 会话覆盖。
fn log_settings_delta(
    current: &adl_logging::LogConfig,
    reloaded: &adl_config::AppConfig,
    overrides: &adl_logging::LogOverrides,
) -> adl_logging::LogSettingsChange {
    adl_logging::LogSettingsChange {
        log_level: (overrides.log_level.is_none() && reloaded.log_level != current.log_level)
            .then_some(reloaded.log_level),
        terminal_log_mode: (overrides.terminal_log_mode.is_none()
            && reloaded.terminal_log_mode != current.terminal_log_mode)
            .then_some(reloaded.terminal_log_mode),
        debug_log_mode: (overrides.debug_log_mode.is_none()
            && reloaded.debug_log_mode != current.debug_log_mode)
            .then_some(reloaded.debug_log_mode),
    }
}

/// Start background tasks for the system shell: hot-reload `config.json` into
/// the shell's in-memory config (used by the kept app commands). The in-process
/// SSE server and durable-session recovery now live in the adl-server process —
/// this shell no longer runs them.
pub fn start_background_tasks(state: &AppState) {
    let config_dir = state.storage.paths().config_dir.clone();
    let config_arc = state.config.clone();
    let log_manager = state.log_manager.clone();
    let log_overrides = state.log_overrides;
    let page_meta_svc = state.browser_manager.page_meta_service().clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("failed to create background tokio runtime");
        rt.block_on(async move {
            // Site-meta 缓存冷启动预载：将磁盘持久化条目载入内存，使
            // browser_page_meta_get 的缓存优先 peek 在重启后立即命中，
            // 避免每个 URL 首次访问都重复建一次静默 WebView。
            tokio::spawn(async move {
                if let Err(e) = page_meta_svc.preload().await {
                    tracing::warn!(error = %e, "site-meta-cache preload failed");
                }
            });
            // ConfigWatcher hot-reloads config.json into the shell config.
            let initial_config = match config_arc.read() {
                Ok(g) => (*g).clone(),
                Err(poisoned) => {
                    tracing::warn!("AppConfig RwLock poisoned during ConfigWatcher init; recovering with into_inner()");
                    (*poisoned.into_inner()).clone()
                },
            };
            let config_watcher = ConfigWatcher::new(initial_config);
            let mut watcher_rx = config_watcher.subscribe();

            let config_arc_watcher = config_arc.clone();
            let watcher_handle = tokio::spawn(async move {
                config_watcher.start_watching(config_dir).await;
            });

            let config_update_handle = tokio::spawn(async move {
                while watcher_rx.changed().await.is_ok() {
                    let new_config = watcher_rx.borrow().clone();
                    // 外部改 config.json → 同步日志子系统（跳过 CLI/env 会话覆盖字段）。
                    match log_manager.config() {
                        Ok(current) => {
                            let delta = log_settings_delta(&current, &new_config, &log_overrides);
                            if !delta.is_empty() {
                                if let Err(e) = log_manager.apply_change(&delta) {
                                    tracing::warn!(error = %e, "failed to apply reloaded log settings");
                                }
                            }
                        },
                        Err(_) => {
                            // 锁 poison 时本次外部变更的日志差集被丢弃（Phase 4 D7）：
                            // 仅告警，不改变控制流；触发概率极低。
                            tracing::warn!("log manager config lock poisoned; skipping reloaded log settings");
                        },
                    }
                    // 语义声明（Phase 4 F15）：内存被磁盘值整体替换 —— 若某字段正被
                    // CLI/env 会话覆盖，内存显示值会回到磁盘值，而运行期保持 CLI 值
                    // （显示与运行期分歧，但与 server 侧"持久化新值/运行期旧值"的
                    // session-only 语义自洽；`get_info` 返回磁盘值，下次无覆盖启动生效）。
                    match config_arc_watcher.write() {
                        Ok(mut cfg) => *cfg = (*new_config).clone(),
                        Err(poisoned) => {
                            tracing::warn!("AppConfig RwLock poisoned in background config updater; recovering with into_inner()");
                            let mut cfg = poisoned.into_inner();
                            *cfg = (*new_config).clone();
                        },
                    }
                }
            });

            let _ = tokio::try_join!(watcher_handle, config_update_handle);
        });
    });
}

/// Save `config` to `config_dir`. The caller is expected to clone the config
/// out under a read lock first — this function performs no locking itself,
/// making it safe to call inside `spawn_blocking`.
pub fn save_config_to_dir(config_dir: &Path, config: &adl_config::AppConfig) -> anyhow::Result<()> {
    adl_config::save_to(config_dir, config)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("adl-setup-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn preferred_root_prefers_writable_sibling_data_dir() {
        let root = temp_root("writable");
        // installDir = <root>/MyApp → 同级 <root>/MyApp-data 可写，应选中。
        let install = root.join("MyApp");
        std::fs::create_dir_all(&install).unwrap();
        let fallback = root.join("fallback-data");
        let chosen = preferred_default_root(&install, fallback.clone());
        assert_eq!(chosen, root.join("MyApp-data"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn preferred_root_falls_back_when_sibling_not_creatable() {
        let root = temp_root("blocked");
        // 让候选的同级父路径是一个「文件」→ create_dir_all 失败 → 回退 fallback。
        let file = root.join("f.txt");
        std::fs::write(&file, b"f").unwrap();
        let install = file.join("app"); // <file>/app：其 parent 是文件，无法在其下建 <file>/app-data
        let fallback = root.join("fallback-data");
        let chosen = preferred_default_root(&install, fallback.clone());
        assert_eq!(chosen, fallback);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn preferred_root_without_name_falls_back() {
        let root = Path::new("/");
        let fallback = PathBuf::from("C:/fallback");
        assert_eq!(preferred_default_root(root, fallback.clone()), fallback);
        assert_eq!(preferred_default_root(Path::new(""), fallback.clone()), fallback);
    }

    #[test]
    fn is_writable_true_on_creatable_dir() {
        let root = temp_root("probe");
        assert!(is_writable(&root));
        // 探针写入后应已清理。
        assert!(!root.join(".adl-write-probe").exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    fn log_config(level: adl_types::types::config::LogLevel) -> adl_logging::LogConfig {
        adl_logging::LogConfig {
            terminal_log_mode: adl_logging::LogMode::Overwrite,
            debug_log_mode: adl_logging::LogMode::Overwrite,
            log_level: level,
        }
    }

    #[test]
    fn delta_empty_when_config_unchanged() {
        let current = log_config(adl_types::types::config::LogLevel::Info);
        let reloaded = adl_config::AppConfig::default();
        let delta = log_settings_delta(&current, &reloaded, &adl_logging::LogOverrides::default());
        assert!(delta.is_empty());
    }

    #[test]
    fn delta_reports_changed_fields() {
        let current = log_config(adl_types::types::config::LogLevel::Info);
        let reloaded = adl_config::AppConfig {
            log_level: adl_types::types::config::LogLevel::Trace,
            debug_log_mode: adl_logging::LogMode::Multi,
            ..adl_config::AppConfig::default()
        };
        let delta = log_settings_delta(&current, &reloaded, &adl_logging::LogOverrides::default());
        assert_eq!(delta.log_level, Some(adl_types::types::config::LogLevel::Trace));
        assert_eq!(delta.debug_log_mode, Some(adl_logging::LogMode::Multi));
        assert_eq!(delta.terminal_log_mode, None);
    }

    #[test]
    fn delta_skips_session_overridden_fields() {
        let current = log_config(adl_types::types::config::LogLevel::Info);
        let reloaded = adl_config::AppConfig {
            log_level: adl_types::types::config::LogLevel::Trace,
            debug_log_mode: adl_logging::LogMode::Multi,
            ..adl_config::AppConfig::default()
        };
        let overrides = adl_logging::LogOverrides {
            log_level: Some(adl_types::types::config::LogLevel::Error),
            debug_log_mode: Some(adl_logging::LogMode::Append),
            ..Default::default()
        };
        let delta = log_settings_delta(&current, &reloaded, &overrides);
        assert!(delta.is_empty(), "session-overridden fields must not be synced: {delta:?}");
    }
}
