#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// The MSVC linker prints an informational "creating library .lib/.exp" message
// for the Tauri import library. Harmless output, not an actual error, so allow
// the linker_messages lint to avoid a spurious warning on every build.
#![allow(linker_messages)]

use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri::webview::PageLoadEvent;
use tracing::info;

mod adl_server;
mod app_identity;
mod commands;
mod error;
mod setup;
mod state;
mod tauri_webview_handle;
mod webview_event_bridge;

const BROWSER_TITLE_SCRIPT: &str = include_str!("../scripts/browser-title-eval.js");

fn main() {
    tracing::info!("[ADL-PERF] app start");

    // 应用身份（AUMID）必须在窗口 / WebView2 创建前落定：WebView2 在宿主未设置时会
    // 自造一个未注册的 AUMID，Windows 媒体卡片因此显示「未知应用」且没有图标（事项 17）。
    app_identity::init_app_identity();

    // CLI 日志覆盖（session-only，不写 config.json）：解析成环境变量，供本 shell 与
    // 它派生的 adl-server 子进程共同读取（子进程继承环境变量）。
    // 支持 --log-level / --terminal-log-mode / --debug-log-mode 与兼容简写 --log-mode。
    // 跳过 argv[0]（exe 路径）：与 server 入口同口径（Closing L11；虽无害但统一）。
    adl_logging::LogOverrides::from_cli_args(&std::env::args().skip(1).collect::<Vec<String>>())
        .export_to_env();

    // 移除了 --disable-gpu-compositing 以启用 GPU 合成加速，
    // 解决软件渲染导致的启动绘制缓慢和主线程阻塞问题。
    //
    // 事项 17 路线 A：`MediaSessionService` 关掉 Chromium 自带的媒体会话（它归属
    // `msedgewebview2.exe`，卡片恒显示「未知应用」），改由 Rust 侧自建 SMTC
    // （见 `commands::media_session`）。与 `tauri.conf.json` 的 additionalBrowserArgs 同步。
    // SAFETY: Called once at startup before any other threads. Safe despite
    // Rust 2024 marking set_var as unsafe (no concurrent reads of these vars).
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,MediaSessionService",
        );
    }

    let builder = tauri::Builder::default();
    // Desktop E2E (feature `e2e`): the embedded WebDriver server is only linked in
    // test builds, and only starts when the WDIO runner sets TAURI_WEBDRIVER_PORT.
    // Normal `cargo run` / `tauri dev` runs stay identical to production.
    #[cfg(feature = "e2e")]
    let builder = if std::env::var_os("TAURI_WEBDRIVER_PORT").is_some() {
        builder.plugin(tauri_plugin_wdio_webdriver::init()).plugin(tauri_plugin_wdio::init())
    } else {
        builder
    };

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            app.manage(commands::update::UpdateState::default());
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                tracing::info!("[ADL-PERF] main webview page load finished: url={}", payload.url());
                // 窗口配置了 visible: false，在页面加载完成后才显示窗口，
                // 消除 WebView2 默认白色背景导致的启动闪烁。
                let window = webview.window();
                // 事项 17：WebView2 会在创建期给根窗口写入「生成的 AUMID」，系统媒体卡片
                // 也因此显示「未知应用」。WebView 就绪后再写一次窗口身份，覆盖该生成值。
                app_identity::apply_window_identity(&window);
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
            // 通知前端该标签页面已加载完成（用于把新建的屏外 WebView2 在内容就绪后揭示，
            // 避免空白首帧闪烁）。标签格式 `adl-browser-view-{tabId}`。
            // 只对真实可渲染页面发（跳过初始 about:blank，否则会在真实页面加载前就揭示）。
            // `file` 也必须发：本地文件没有 page-ready 时只能等兜底定时器揭示，
            // 表现为"打开本地文件明显变慢"。
            if matches!(payload.url().scheme(), "http" | "https" | "file") {
                if let Some(tab_id) = webview.label().strip_prefix("adl-browser-view-") {
                    let _ = webview.app_handle().emit(
                        "digital-life://browser-page-ready",
                        serde_json::json!({ "tabId": tab_id }),
                    );
                }
            }
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
            commands::app::app_get_server_info,
            commands::update::app_update_check,
            commands::update::app_update_download,
            commands::update::app_update_install,
            commands::workspace::workspace_pick_directory,
            commands::file_save::app_save_file,
            commands::platform::workspace_reveal_in_file_manager,
            commands::platform::workspace_open_in_default_app,
            commands::media_session::media_session_update,
            commands::media_session::media_session_clear,
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
            commands::browser::browser_media_control_tab,
            commands::browser::browser_set_color_scheme,
            commands::browser::browser_set_agent_intercept,
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
            commands::browser::browser_page_meta_fetch_http,
            commands::browser::browser_page_meta_get_silent,
            commands::browser::browser_memory_pressure,
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
            commands::platform::platform_open_path,
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

#[cfg(test)]
mod tests {
    /// `generate_handler!` 里注册的每条命令都必须在
    /// `permissions/digital-life.toml` 的 `commands.allow` 白名单中登记。
    ///
    /// Tauri v2 在 invoke 层做能力校验：漏登记的命令会被直接拒绝，前端只会看到
    /// 一个没有原因的 `INVOKE_ERROR`（开发期表现为"点了没反应"）。白名单是手工维护的，
    /// 新增命令极易漏登（`app_save_file` 就这样漏过一次），故在此做机器校验。
    #[test]
    fn every_registered_command_is_allowlisted() {
        let main_src = include_str!("main.rs");
        let permissions = include_str!("../permissions/digital-life.toml");

        let handler = main_src
            .split_once("generate_handler![")
            .and_then(|(_, rest)| rest.split_once("])"))
            .map(|(body, _)| body)
            .expect("generate_handler! block not found in main.rs");
        let allowlist = permissions
            .split_once("commands.allow = [")
            .and_then(|(_, rest)| rest.split_once(']'))
            .map(|(body, _)| body)
            .expect("commands.allow list not found in digital-life.toml");

        let missing: Vec<&str> = handler
            .split(',')
            .filter_map(|entry| entry.trim().rsplit("::").next())
            .filter(|name| !name.is_empty())
            .filter(|name| !allowlist.contains(&format!("\"{name}\"")))
            .collect();

        assert!(
            missing.is_empty(),
            "commands registered in generate_handler! but missing from \
             permissions/digital-life.toml commands.allow (Tauri will reject them \
             at invoke time with a bare INVOKE_ERROR): {missing:?}"
        );
    }
}
