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
        .route("/pty", get(crate::pty_ws::ws_handler))
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
        // Commands-config domain (`commands_config_*` tauri commands — custom
        // slash-command config CRUD + template rendering).
        .route("/commands-config/list", post(handlers::commands_config::list_commands))
        .route("/commands-config/add", post(handlers::commands_config::add_command))
        .route("/commands-config/update", post(handlers::commands_config::update_command))
        .route("/commands-config/delete", post(handlers::commands_config::delete_command))
        .route("/commands-config/render", post(handlers::commands_config::render_template))
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
        // Agent pipeline / loop domain (real commands `agent_loop_run` /
        // `agent_loop_abort` from agent_loop.rs — the loop machinery shared via
        // `crate::agent_loop::run_loop`).
        .route("/agent/turn/run", post(handlers::agent_pipeline::loop_run))
        .route("/agent/turn/abort", post(handlers::agent_pipeline::loop_abort))
        // Patch domain (`patch_*` tauri commands).
        .route("/patch/:patch_set_id", get(handlers::patch::get_patch_set))
        .route("/patch/hunk-decision", post(handlers::patch::set_hunk_decision))
        .route("/patch/apply", post(handlers::patch::apply_patch_set))
        .route("/patch/rollback", post(handlers::patch::rollback_patch_set))
        // Session-fork domain (`session_fork_*` tauri commands).
        .route("/session-fork", post(handlers::session_fork::fork_session))
        .route("/session-fork/list", post(handlers::session_fork::list_session_forks))
        // Permission ruleset domain (`permission_*` tauri commands).
        .route("/permission/list", post(handlers::permission::list_rules))
        .route("/permission/add", post(handlers::permission::add_rule))
        .route("/permission/delete", post(handlers::permission::delete_rule))
        .route("/permission/include-defaults", post(handlers::permission::set_include_defaults))
        .route("/permission/evaluate", post(handlers::permission::evaluate))
        // Custom-agent registry domain (`custom_agent_*` tauri commands).
        .route("/custom-agent/list", post(handlers::custom_agent::list_agents))
        .route("/custom-agent/add", post(handlers::custom_agent::add_agent))
        .route("/custom-agent/delete", post(handlers::custom_agent::delete_agent))
        .route("/custom-agent/update", post(handlers::custom_agent::update_agent))
        // Task-center / approval domain (`task_*` tauri commands).
        .route("/task/snapshot", post(handlers::task::snapshot))
        .route("/task/pending-approvals", post(handlers::task::list_pending_approvals))
        .route("/task/audit-entries", post(handlers::task::list_audit_entries))
        .route("/task/checkpoint-preview", post(handlers::task::checkpoint_preview))
        .route("/task/restore-checkpoint", post(handlers::task::restore_checkpoint))
        .route("/task/decide-approval", post(handlers::task::decide_approval))
        // Durable-session domain (`durable_*` tauri commands).
        .route("/durable/register", post(handlers::durable::register))
        .route("/durable/heartbeat", post(handlers::durable::heartbeat))
        .route("/durable/crashed", post(handlers::durable::crashed))
        .route("/durable/recover", post(handlers::durable::recover))
        // LSP domain (`lsp_*` tauri commands — language server lifecycle).
        .route("/lsp/start", post(handlers::lsp::start_server))
        .route("/lsp/stop", post(handlers::lsp::stop_server))
        .route("/lsp/symbols", post(handlers::lsp::get_symbols))
        .route("/lsp/diagnostics", post(handlers::lsp::get_diagnostics))
        .route("/lsp/goto-definition", post(handlers::lsp::goto_definition))
        // MCP domain (`mcp_*` tauri commands — server management + catalog).
        .route("/mcp/list", post(handlers::mcp::list_servers))
        .route("/mcp/add", post(handlers::mcp::add_server))
        .route("/mcp/remove", post(handlers::mcp::remove_server))
        .route("/mcp/connect", post(handlers::mcp::connect_server))
        .route("/mcp/disconnect", post(handlers::mcp::disconnect_server))
        .route("/mcp/catalog", post(handlers::mcp::catalog))
        .route("/mcp/load-config", post(handlers::mcp::load_config))
        // Reference-domain (`reference_*` tauri commands).
        .route("/reference/list", post(handlers::reference::list))
        .route("/reference/add", post(handlers::reference::add))
        .route("/reference/remove", post(handlers::reference::remove))
        .route("/reference/prompt", post(handlers::reference::prompt))
        // Sub-agent domain (`subagent_*` tauri commands).
        .route("/subagent/spawn", post(handlers::subagent::spawn))
        .route("/subagent/get", post(handlers::subagent::get))
        .route("/subagent/list-active", post(handlers::subagent::list_active))
        .route("/subagent/cancel", post(handlers::subagent::cancel))
        // Retrieval domain (`retrieval_*` tauri commands).
        .route("/retrieval/status", get(handlers::retrieval::get_status))
        .route("/retrieval/rebuild", post(handlers::retrieval::rebuild_index))
        // Run-activity domain (`run_activity_*` tauri commands — history only).
        .route("/run-activity/list", post(handlers::run_activity::list_by_run_id))
        // Web-tools domain (`web_fetch` / `web_search` tauri commands).
        .route("/web-tools/fetch", post(handlers::web_tools::web_fetch))
        .route("/web-tools/search", post(handlers::web_tools::web_search))
        // Audit domain (`audit_*` tauri helpers — read surface).
        .route("/audit/list", post(handlers::audit::list_audit_entries))
        // CI / GitHub domain (`ci_*` tauri commands). The access token is
        // write-only: set/clear/has only — never read back over HTTP.
        .route("/ci/status", post(handlers::ci::get_status))
        .route("/ci/status-without-token", post(handlers::ci::get_status_without_token))
        .route("/ci/access-token", post(handlers::ci::set_access_token))
        .route("/ci/access-token/clear", post(handlers::ci::clear_access_token))
        .route("/ci/access-token/has", post(handlers::ci::has_access_token))
        .route("/ci/job-logs", post(handlers::ci::get_job_logs))
        // Workspace-sidebar domain (`workspace_*` recent/pin/unpin/reorder/
        // remove-from-sidebar/restore/hide/show tauri commands).
        .route("/sidebar/list", post(handlers::workspace_sidebar::list_recent))
        .route("/sidebar/pin", post(handlers::workspace_sidebar::pin))
        .route("/sidebar/unpin", post(handlers::workspace_sidebar::unpin))
        .route("/sidebar/reorder", post(handlers::workspace_sidebar::reorder))
        .route("/sidebar/remove", post(handlers::workspace_sidebar::remove_from_sidebar))
        .route("/sidebar/restore", post(handlers::workspace_sidebar::restore_to_sidebar))
        .route("/sidebar/hide", post(handlers::workspace_sidebar::hide_from_right_panels))
        .route("/sidebar/show", post(handlers::workspace_sidebar::show_in_right_panels))
        // Workspace-git domain (`workspace_*_git_*` tauri commands).
        .route("/workspace/git/status", post(handlers::workspace_git::get_git_status))
        .route("/workspace/git/branches", post(handlers::workspace_git::list_git_branches))
        .route("/workspace/git/switch", post(handlers::workspace_git::switch_git_branch))
        .route("/workspace/git/create", post(handlers::workspace_git::create_git_branch))
        .route("/workspace/git/stage", post(handlers::workspace_git::git_stage_file))
        .route("/workspace/git/unstage", post(handlers::workspace_git::git_unstage_file))
        .route("/workspace/git/discard", post(handlers::workspace_git::git_discard_file))
        // Workspace-git-visualization domain (`workspace_git_vis_*` tauri
        // commands).
        .route("/workspace/git-vis/commit-stats", post(handlers::workspace_git_vis::commit_stats))
        .route(
            "/workspace/git-vis/first-commit-year",
            post(handlers::workspace_git_vis::first_commit_year),
        )
        .route(
            "/workspace/git-vis/code-evolution",
            post(handlers::workspace_git_vis::code_evolution),
        )
        .route(
            "/workspace/git-vis/contributor-modules",
            post(handlers::workspace_git_vis::contributor_modules),
        )
        .route("/workspace/git-vis/branch-graph", post(handlers::workspace_git_vis::branch_graph))
        .route("/workspace/git-vis/file-hotspots", post(handlers::workspace_git_vis::file_hotspots))
}
