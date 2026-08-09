use crate::handlers::{self, health};
use crate::sse_server::{reply_handler_state, sse_handler_state};
use crate::state::ServerState;
use axum::Router;
use axum::routing::{delete, get, patch, post};

/// Compose the full ad-server HTTP router over [`ServerState`]: `/health`, the
/// SSE stream `/event`, the `/question/:request_id/reply` endpoint and the
/// conversation domain (`/session*`). All handlers take `State<ServerState>`.
///
/// NOTE: axum 0.7.9 path params use `:name` syntax, not `{name}`.
///
/// The router is generic over [`ServerState`] — it does NOT call `.with_state`
/// here. Callers supply the concrete state before serving, e.g.
/// `app_router(state.clone()).with_state(state)`. The `state` value accepted
/// here pins the router's state type; the concrete clone is what `.with_state`
/// later consumes.
pub fn app_router(_state: ServerState) -> Router<ServerState> {
    Router::new()
        .route("/health", get(health::health))
        .route("/event", get(sse_handler_state))
        .route("/question/:request_id/reply", post(reply_handler_state))
        .route("/session", post(handlers::conversation::create_session))
        .route("/sessions", get(handlers::conversation::list_sessions))
        .route("/sessions/reorder", post(handlers::conversation::reorder_sessions))
        .route("/sessions/archive-all", post(handlers::conversation::archive_all_in_workspace))
        .route("/session/:session_id", get(handlers::conversation::get_session))
        .route("/session/:session_id", patch(handlers::conversation::update_session))
        .route("/session/:session_id", delete(handlers::conversation::delete_session))
        .route("/session/:session_id/message", get(handlers::conversation::get_session_messages))
        .route("/session/:session_id/message", post(handlers::conversation::send_message))
        .route("/session/:session_id/cancel", post(handlers::conversation::cancel_message))
        // Workspace domain (`workspace_*` tauri commands).
        .route("/workspace/open", post(handlers::workspace::open))
        .route("/workspace/clear-current", post(handlers::workspace::clear_current))
        .route("/workspace/file", post(handlers::workspace::create_file))
        .route("/workspace/folder", post(handlers::workspace::create_folder))
        .route("/workspace/read", post(handlers::workspace::read_file))
        .route("/workspace/change-preview", post(handlers::workspace::get_change_preview))
        .route("/workspace/tree", post(handlers::workspace::list_tree))
        .route("/workspace/search", post(handlers::workspace::search))
        .route("/workspace/outline", post(handlers::workspace::outline))
        .route("/workspace/editor-dirty-paths", post(handlers::workspace::set_editor_dirty_paths))
        .route("/workspace/emit-file-changed", post(handlers::workspace::emit_file_changed))
        .route("/workspace/rename", post(handlers::workspace::rename_file))
        .route("/workspace/delete", post(handlers::workspace::delete_file))
        .route("/workspace/duplicate", post(handlers::workspace::duplicate_file))
        .route("/workspace/absolute-path", post(handlers::workspace::get_absolute_path))
        .route("/workspace/move", post(handlers::workspace::move_file))
        // Provider domain (`provider_*` tauri commands). API keys travel in the
        // body (frontend `ProviderBridge` contract) and are stored via the
        // credential store — never plaintext in config/DB/logs.
        .route("/provider/list", get(handlers::provider::list_providers))
        .route("/provider/supported", get(handlers::provider::list_supported_providers))
        .route("/provider/test-connection", post(handlers::provider::test_connection))
        .route("/provider/fetch-models", post(handlers::provider::fetch_models))
        .route("/provider/custom", post(handlers::provider::add_custom_provider))
        .route("/provider/custom/remove", post(handlers::provider::remove_custom_provider))
        .route("/provider/api-key", post(handlers::provider::set_api_key))
        .route("/provider/api-key/clear", post(handlers::provider::clear_api_key))
        .route("/provider/api-key/has", post(handlers::provider::has_api_key))
        .route("/provider/api-key/get", post(handlers::provider::get_api_key))
        .route("/provider/config", post(handlers::provider::save_provider_config))
        // Command domain (`command_*` tauri commands — custom slash-commands).
        .route("/command/run", post(handlers::command::run))
        .route("/command/recent", post(handlers::command::list_recent))
        // Snapshot domain (`snapshot_*` tauri commands).
        .route("/snapshot/create", post(handlers::snapshot::create))
        .route("/snapshot/list", post(handlers::snapshot::list))
        .route("/snapshot/revert", post(handlers::snapshot::revert))
        .route("/snapshot/prune", post(handlers::snapshot::prune))
        // Compaction domain (`compaction_*` tauri commands).
        .route("/compaction/session", post(handlers::compaction::compact_session))
        // Agent domain (`agent_*` tauri commands — run CRUD, agent listing,
        // scenario selection and Plan Mode state).
        .route("/agent/start-run", post(handlers::agent::start_run))
        .route("/agent/run/:run_id", get(handlers::agent::get_run))
        .route("/agent/run/:run_id/retry", post(handlers::agent::retry_run))
        .route("/agent/run/:run_id/abort", post(handlers::agent::abort_run))
        .route("/agent/list", get(handlers::agent::list_agents))
        .route("/agent/select", post(handlers::agent::select_agent))
        .route("/agent/plan-mode/enter", post(handlers::agent::enter_plan_mode))
        .route("/agent/plan-mode/exit", post(handlers::agent::exit_plan_mode))
        .route("/agent/plan-mode/state", post(handlers::agent::get_plan_mode_state))
}
