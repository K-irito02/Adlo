#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// The MSVC linker prints an informational "creating library .lib/.exp" message
// for the Tauri import library. Harmless output, not an actual error, so allow
// the linker_messages lint to avoid a spurious warning on every build.
#![allow(linker_messages)]

use adl_logging::LogMode;
use std::sync::Arc;
use tauri::Manager;
use tauri::webview::PageLoadEvent;
use tracing::info;

mod adl_server;
mod commands;
mod error;
mod setup;
mod state;
mod tauri_webview_handle;
mod webview_event_bridge;

const BROWSER_TITLE_SCRIPT: &str = include_str!("../scripts/browser-title-eval.js");

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

fn main() {
    tracing::info!("[ADL-PERF] app start");

    // 移除了 --disable-gpu-compositing 以启用 GPU 合成加速，
    // 解决软件渲染导致的启动绘制缓慢和主线程阻塞问题。
    // SAFETY: Called once at startup before any other threads. Safe despite
    // Rust 2024 marking set_var as unsafe (no concurrent reads of these vars).
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection",
        );
    }

    if let Some(mode) = parse_cli_log_mode() {
        // SAFETY: Called once at startup before any other threads.
        unsafe { std::env::set_var("ADL_CLI_LOG_MODE", mode.to_string()) };
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let t0 = std::time::Instant::now();
            let defaults = setup::resolve_defaults(app)?;
            std::fs::create_dir_all(&defaults.root)?;
            // 迁移必须先于任何 DB/日志句柄打开执行。
            let _migration_report = setup::run_startup_migration(&defaults);
            let locator = adl_kernel::storage::load_locator();
            let storage =
                Arc::new(adl_kernel::storage::StorageService::from_locator(&locator, &defaults));
            let data_dir = storage.paths().root.clone();
            let app_state =
                setup::init_app_state(data_dir.clone(), storage.clone(), defaults.clone())?;
            info!("[ADL-PERF] setup COMPLETE: {}ms", t0.elapsed().as_millis());

            // 剪贴板/系统监控全走 adl-server HTTP（adl-server 的 init_server_state 已启动
            // 唯一剪贴板监听并写 data.db；桌面/浏览器前端均读 data.db），桌面壳不注入
            // Managed 剪贴板/系统监控 state，也不启动重复监听。
            setup::start_background_tasks(&app_state);
            app.manage(app_state);
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                tracing::info!("[ADL-PERF] main webview page load finished: url={}", payload.url());
                // 窗口配置了 visible: false，在页面加载完成后才显示窗口，
                // 消除 WebView2 默认白色背景导致的启动闪烁。
                let window = webview.window();
                let _ = window.show();
                tracing::info!("[ADL-PERF] main window shown after page load");
            }
            if !webview.label().starts_with("adl-browser-view") {
                return;
            }
            if !matches!(payload.event(), PageLoadEvent::Finished) {
                return;
            }
            // Ignore hash-only navigations (set by our eval'd script)
            if payload.url().fragment().is_some_and(|f| f.starts_with("adl-title=")) {
                return;
            }
            tracing::info!(url = %payload.url(), "browser page finished loading");
            let app = webview.app_handle().clone();
            let wv_label = webview.label().to_string();
            // Use std::thread instead of tokio::spawn because on_page_load runs
            // outside the tokio runtime context. The thread exits within ~600ms
            // (3 retries × 200ms sleep), so OS thread churn is negligible.
            std::thread::spawn(move || {
                for attempt in 1..=3 {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    if let Some(wv) = app.get_webview(&wv_label) {
                        match wv.eval(BROWSER_TITLE_SCRIPT) {
                            Ok(()) => tracing::info!("browser on_page_load: eval ok"),
                            Err(e) => tracing::error!("browser on_page_load: eval failed: {e}"),
                        }
                        return;
                    } else {
                        tracing::warn!(
                            "browser on_page_load: webview not found (attempt {}/3)",
                            attempt
                        );
                    }
                }
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_get_info,
            commands::app::app_get_health,
            commands::app::app_get_diagnostics,
            commands::app::app_update_preferences,
            commands::app::write_debug_logs,
            commands::app::write_debug_logs_to_project,
            commands::app::app_set_log_mode,
            commands::app::app_get_server_info,
            commands::workspace::workspace_pick_directory,
            commands::platform::workspace_reveal_in_file_manager,
            commands::browser::browser_create_for_tab,
            commands::browser::browser_activate_tab,
            commands::browser::browser_destroy_tab,
            commands::browser::browser_navigate_tab,
            commands::browser::browser_set_tab_bounds,
            commands::browser::browser_go_back_tab,
            commands::browser::browser_go_forward_tab,
            commands::browser::browser_can_go_back_tab,
            commands::browser::browser_can_go_forward_tab,
            commands::browser::browser_reload_tab,
            commands::browser::browser_mute_tab,
            commands::browser::browser_set_color_scheme,
            commands::browser::browser_set_zoom,
            commands::browser::browser_clear_cookies,
            commands::browser::browser_clear_cache,
            commands::browser::browser_site_meta_get_all,
            commands::browser::browser_site_meta_clear,
            commands::browser::browser_site_meta_upsert,
            commands::browser::browser_site_meta_remove,
            commands::browser::browser_page_meta_get,
            commands::browser::browser_page_meta_report,
            commands::browser::browser_page_meta_refresh,
            commands::browser::browser_page_meta_warmup,
            commands::browser::browser_page_meta_get_silent,
            commands::browser::browser_memory_pressure,
            commands::browser::browser_create_dsh_view,
            commands::browser::browser_destroy_dsh_view,
            commands::browser::browser_set_dsh_bounds,
            commands::divider_strip::divider_strip_show,
            commands::divider_strip::divider_strip_set_bounds,
            commands::divider_strip::divider_strip_hide,
            commands::divider_strip::divider_strip_drag,
            commands::reserved::acp_get_status,
            commands::reserved::acp_get_config,
            commands::reserved::http_api_get_status,
            commands::reserved::http_api_get_config,
            commands::reserved::codemode_execute,
            commands::reserved::codemode_get_config,
            commands::download_commands::download_list,
            commands::download_commands::download_get_settings,
            commands::download_commands::download_update_settings,
            commands::download_commands::download_change_default_path,
            commands::download_commands::download_clear_history,
            commands::download_commands::download_delete_file_and_record,
            commands::download_commands::download_remove_record,
            commands::download_commands::download_resolve_conflict_path,
            commands::download_commands::download_check_disk_space,
            commands::download_commands::download_get_default_path,
            commands::download_commands::download_open_default_folder,
            commands::download_commands::download_open_file,
            commands::download_commands::download_show_in_folder,
            commands::download_commands::download_pause,
            commands::download_commands::download_resume,
            commands::download_commands::download_cancel,
            commands::download_commands::download_save_blob,
            commands::platform::workspace_open_in_file_manager,
            commands::port_scan::browser_scan_ports,
            commands::port_scan::browser_get_port_details,
            commands::storage::storage_get_status,
            commands::storage::storage_scan_foreign_cmd,
            commands::storage::storage_preflight_cmd,
            commands::storage::storage_set_paths,
            commands::storage::storage_cancel_pending,
            commands::storage::storage_tree_cache_stats,
            commands::storage::storage_tree_cache_options,
            commands::storage::storage_tree_cache_clear,
            commands::storage::app_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
