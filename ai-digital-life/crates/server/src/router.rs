use crate::ServerState;
use crate::handlers::{self, health};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{get, post};

async fn cors_layer(request: axum::http::Request<Body>, next: Next) -> Response<Body> {
    let is_preflight = request.method() == Method::OPTIONS;
    let mut response = if is_preflight {
        let mut resp = Response::new(Body::empty());
        *resp.status_mut() = StatusCode::OK;
        resp
    } else {
        next.run(request).await
    };
    let headers = response.headers_mut();
    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, header::HeaderValue::from_static("*"));
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        header::HeaderValue::from_static("GET, POST, PATCH, DELETE, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        header::HeaderValue::from_static(
            "content-type, last-event-id, x-ci-access-token, authorization",
        ),
    );
    response
}

pub fn app_router(_state: ServerState) -> Router<ServerState> {
    Router::new()
        .route("/health", get(health::health))
        // Workspace domain
        .route("/workspace/open", post(handlers::workspace::open))
        .route("/workspace/current", get(handlers::workspace::get_current))
        .route("/workspace/clear-current", post(handlers::workspace::clear_current))
        .route("/workspace/file", post(handlers::workspace::create_file))
        .route("/workspace/folder", post(handlers::workspace::create_folder))
        .route("/workspace/read", post(handlers::workspace::read_file))
        .route("/workspace/change-preview", post(handlers::workspace::get_change_preview))
        .route("/workspace/tree", post(handlers::workspace::list_tree))
        .route("/workspace/search", post(handlers::workspace::search))
        .route("/workspace/search-in-files", post(handlers::workspace::search_in_files))
        .route("/workspace/outline", post(handlers::workspace::outline))
        .route("/workspace/editor-dirty-paths", post(handlers::workspace::set_editor_dirty_paths))
        .route("/workspace/emit-file-changed", post(handlers::workspace::emit_file_changed))
        .route("/workspace/rename", post(handlers::workspace::rename_file))
        .route("/workspace/delete", post(handlers::workspace::delete_file))
        .route("/workspace/duplicate", post(handlers::workspace::duplicate_file))
        .route("/workspace/absolute-path", post(handlers::workspace::get_absolute_path))
        .route("/workspace/move", post(handlers::workspace::move_file))
        // Snapshot domain
        .route("/snapshot/create", post(handlers::snapshot::create))
        .route("/snapshot/list", post(handlers::snapshot::list))
        .route("/snapshot/revert", post(handlers::snapshot::revert))
        .route("/snapshot/prune", post(handlers::snapshot::prune))
        // Patch domain
        .route("/patch/:patch_set_id", get(handlers::patch::get_patch_set))
        .route("/patch/hunk-decision", post(handlers::patch::set_hunk_decision))
        .route("/patch/apply", post(handlers::patch::apply_patch_set))
        .route("/patch/rollback", post(handlers::patch::rollback_patch_set))
        // Durable-session domain
        .route("/durable/register", post(handlers::durable::register))
        .route("/durable/heartbeat", post(handlers::durable::heartbeat))
        .route("/durable/crashed", post(handlers::durable::crashed))
        .route("/durable/recover", post(handlers::durable::recover))
        // Reference domain
        .route("/reference/list", post(handlers::reference::list))
        .route("/reference/add", post(handlers::reference::add))
        .route("/reference/remove", post(handlers::reference::remove))
        // Retrieval domain
        .route("/retrieval/status", get(handlers::retrieval::get_status))
        .route("/retrieval/rebuild", post(handlers::retrieval::rebuild_index))
        // Clipboard domain
        .route("/clipboard/list", get(handlers::clipboard::list))
        .route("/clipboard/remove", post(handlers::clipboard::remove))
        .route("/clipboard/clear", post(handlers::clipboard::clear))
        .route("/clipboard/write-image", post(handlers::clipboard::write_image))
        .route("/clipboard/thumb/:filename", get(handlers::clipboard::thumb))
        .route("/clipboard/image/:filename", get(handlers::clipboard::image))
        // System-monitor domain
        .route("/sysmon/snapshot", get(handlers::system_monitor::snapshot))
        // Dsh-harness domain
        .route("/dsh/open", post(handlers::dsh::open))
        .route("/dsh/get-version-status", post(handlers::dsh::get_version_status))
        .route("/dsh/update", post(handlers::dsh::update))
        .route("/dsh/revert", post(handlers::dsh::revert))
        .route("/dsh/uninstall", post(handlers::dsh::uninstall))
        .route("/dsh/reinstall", post(handlers::dsh::reinstall))
        .route("/dsh/source-status", post(handlers::dsh::get_source_status))
        .route("/dsh/source-config", post(handlers::dsh::save_source_config))
        .route("/dsh/test-source", post(handlers::dsh::test_source))
        // CI / GitHub domain
        .route("/ci/status", post(handlers::ci::get_status))
        .route("/ci/status-without-token", post(handlers::ci::get_status_without_token))
        .route("/ci/access-token", post(handlers::ci::set_access_token))
        .route("/ci/access-token/clear", post(handlers::ci::clear_access_token))
        .route("/ci/access-token/has", post(handlers::ci::has_access_token))
        .route("/ci/job-logs", post(handlers::ci::get_job_logs))
        // Workspace-sidebar domain
        .route("/sidebar/list", post(handlers::workspace_sidebar::list_recent))
        .route("/sidebar/remove", post(handlers::workspace_sidebar::remove_from_sidebar))
        // Workspace-git domain
        .route("/workspace/git/status", post(handlers::workspace_git::get_git_status))
        .route("/workspace/git/branches", post(handlers::workspace_git::list_git_branches))
        .route("/workspace/git/switch", post(handlers::workspace_git::switch_git_branch))
        .route("/workspace/git/create", post(handlers::workspace_git::create_git_branch))
        .route("/workspace/git/stage", post(handlers::workspace_git::git_stage_file))
        .route("/workspace/git/unstage", post(handlers::workspace_git::git_unstage_file))
        .route("/workspace/git/discard", post(handlers::workspace_git::git_discard_file))
        // Workspace-git-visualization domain
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
        // Storage domain (Plan C Task 2 — browser-mode mirror of the shell
        // storage commands; B5: no `/storage/restart-backend`, adl-server never
        // restarts itself).
        .route("/storage/status", post(handlers::storage::status))
        .route("/storage/scan-foreign", post(handlers::storage::scan_foreign))
        .route("/storage/preflight", post(handlers::storage::preflight))
        .route("/storage/set-paths", post(handlers::storage::set_paths))
        .route("/storage/cancel-pending", post(handlers::storage::cancel_pending))
        .route("/storage/tree-cache/stats", post(handlers::storage::tree_cache_stats))
        .route("/storage/tree-cache/options", post(handlers::storage::tree_cache_options))
        .route("/storage/tree-cache/clear", post(handlers::storage::tree_cache_clear))
        // PTY WebSocket domain
        .route("/pty", get(crate::pty_ws::ws_handler))
        // Workspace event stream (file watcher push)
        .route("/ws/workspace", get(crate::ws_workspace::ws_handler))
        .layer(middleware::from_fn(cors_layer))
}
