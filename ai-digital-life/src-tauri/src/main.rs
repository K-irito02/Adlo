#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use adl_kernel::types::config::LogMode;
use tauri::webview::PageLoadEvent;
use tauri::Manager;

mod commands;
mod error;
mod run_activity_seq;
mod setup;
mod state;
mod terminal;

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
    if let Some(mode) = parse_cli_log_mode() {
        std::env::set_var("ADL_CLI_LOG_MODE", mode.to_string());
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = setup::resolve_data_dir(app)?;
            let app_state = setup::init_app_state(data_dir)?;
            app.manage(app_state);
            Ok(())
        })
        .on_page_load(|webview, payload| {
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
            std::thread::spawn(move || {
                for attempt in 1..=3 {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    if let Some(wv) = app.get_webview(&wv_label) {
                        tracing::info!("browser on_page_load: calling eval");
                        match wv.eval(
                            r#"(function(){
                                var attempts = 0;
                                function tryReport() {
                                    var t = document.title;
                                    if (t && t.trim()) {
                                        try {
                                            chrome.webview.postMessage(JSON.stringify({
                                                type: 'meta',
                                                title: t,
                                                favicon: '',
                                                url: location.href
                                            }));
                                        } catch(e) {
                                            try { window.open('adl-title:' + encodeURIComponent(t.trim()) + '?url=' + encodeURIComponent(location.href), '_blank'); } catch(e2) {}
                                        }
                                        return;
                                    }
                                    attempts++;
                                    if (attempts < 10) { setTimeout(tryReport, 1000); }
                                }
                                setTimeout(tryReport, 200);
                            })()"#
                        ) {
                            Ok(()) => tracing::info!("browser on_page_load: eval ok"),
                            Err(e) => tracing::error!("browser on_page_load: eval failed: {e}"),
                        }
                        return;
                    } else {
                        tracing::warn!("browser on_page_load: webview not found (attempt {}/3)", attempt);
                    }
                }
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_get_info,
            commands::app::app_get_health,
            commands::app::app_get_diagnostics,
            commands::app::app_get_model_health,
            commands::app::app_update_preferences,
            commands::app::write_debug_logs,
            commands::app::write_debug_logs_to_project,
            commands::app::app_set_log_mode,
            commands::workspace::workspace_open,
            commands::workspace::workspace_clear_current,
            commands::workspace::workspace_pick_directory,
            commands::workspace::workspace_create_file,
            commands::workspace::workspace_create_folder,
            commands::workspace::workspace_read_file,
            commands::workspace::workspace_get_change_preview,
            commands::workspace::workspace_list_tree,
            commands::workspace::workspace_search,
            commands::workspace::workspace_outline,
            commands::workspace::workspace_set_editor_dirty_paths,
            commands::workspace::workspace_emit_file_changed,
            commands::workspace::workspace_rename_file,
            commands::workspace::workspace_delete_file,
            commands::workspace::workspace_duplicate_file,
            commands::workspace::workspace_get_absolute_path,
            commands::workspace::workspace_move_file,
            commands::workspace_sidebar::workspace_list_recent,
            commands::workspace_sidebar::workspace_pin,
            commands::workspace_sidebar::workspace_unpin,
            commands::workspace_sidebar::workspace_reorder,
            commands::workspace_sidebar::workspace_remove_from_sidebar,
            commands::workspace_sidebar::workspace_restore_to_sidebar,
            commands::workspace_sidebar::workspace_hide_from_right_panels,
            commands::workspace_sidebar::workspace_show_in_right_panels,
            commands::workspace_git::workspace_get_git_status,
            commands::workspace_git::workspace_list_git_branches,
            commands::workspace_git::workspace_switch_git_branch,
            commands::workspace_git::workspace_create_git_branch,
            commands::platform::workspace_reveal_in_file_manager,
            commands::retrieval::retrieval_get_status,
            commands::retrieval::retrieval_rebuild_index,
            commands::conversation::conversation_create_session,
            commands::conversation::conversation_list_sessions,
            commands::conversation::conversation_get_session,
            commands::conversation::conversation_send_message,
            commands::conversation::conversation_rename_session,
            commands::conversation::conversation_pin_session,
            commands::conversation::conversation_unpin_session,
            commands::conversation::conversation_reorder_sessions,
            commands::conversation::conversation_archive_session,
            commands::conversation::conversation_archive_all_in_workspace,
            commands::conversation::conversation_delete_session,
            commands::conversation::conversation_mark_session_read,
            commands::conversation::conversation_mark_session_unread,
            commands::conversation::conversation_cancel_message,
            commands::agent::agent_start_run,
            commands::agent::agent_get_run,
            commands::agent::agent_retry_run,
            commands::agent::agent_abort_run,
            commands::patch::patch_get_patch_set,
            commands::patch::patch_set_hunk_decision,
            commands::patch::patch_apply_patch_set,
            commands::patch::patch_rollback_patch_set,
            commands::command::command_run,
            commands::command::command_list_recent,
            commands::pty_commands::pty_create,
            commands::pty_commands::pty_input,
            commands::pty_commands::pty_resize,
            commands::pty_commands::pty_kill,
            commands::pty_commands::pty_list,
            commands::task::task_get_snapshot,
            commands::task::task_list_pending_approvals,
            commands::task::task_list_audit_entries,
            commands::task::task_decide_approval,
            commands::task::task_get_checkpoint_preview,
            commands::task::task_restore_checkpoint,
            commands::run_activity::run_activity_list_by_run_id,
            commands::model::model_set_provider_secret,
            commands::model::model_clear_provider_secret,
            commands::browser::browser_create_for_tab,
            commands::browser::browser_activate_tab,
            commands::browser::browser_destroy_tab,
            commands::browser::browser_navigate_tab,
            commands::browser::browser_set_tab_bounds,
            commands::browser::browser_go_back_tab,
            commands::browser::browser_go_forward_tab,
            commands::browser::browser_reload_tab,
            commands::browser::browser_fetch_page_meta,
            commands::browser::browser_mute_tab,
            commands::browser::browser_set_color_scheme,
            commands::browser::browser_set_zoom,
            commands::browser::browser_clear_cookies,
            commands::browser::browser_clear_cache,
            commands::ci::ci_get_status,
            commands::ci::ci_get_status_without_token,
            commands::ci::ci_set_access_token,
            commands::ci::ci_clear_access_token,
            commands::ci::ci_has_access_token,
            commands::ci::ci_get_job_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
