#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod commands;
mod error;
mod run_activity_seq;
mod setup;
mod state;
mod terminal;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = setup::resolve_data_dir(app)?;
            let app_state = setup::init_app_state(data_dir)?;
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_get_info,
            commands::app::app_get_health,
            commands::app::app_get_diagnostics,
            commands::app::app_get_model_health,
            commands::app::app_update_preferences,
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
            commands::browser::browser_create,
            commands::browser::browser_destroy,
            commands::browser::browser_hide,
            commands::browser::browser_show,
            commands::browser::browser_navigate,
            commands::browser::browser_go_back,
            commands::browser::browser_go_forward,
            commands::browser::browser_reload,
            commands::browser::browser_set_bounds,
            commands::browser::browser_eval,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
