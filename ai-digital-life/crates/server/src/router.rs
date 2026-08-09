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
}
