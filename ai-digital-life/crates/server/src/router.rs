use crate::handlers::health;
use crate::sse_server::{reply_handler_state, sse_handler_state};
use crate::state::ServerState;
use axum::Router;
use axum::routing::{get, post};

/// Compose the full ad-server HTTP router over [`ServerState`]: `/health`, the
/// SSE stream `/event` and the `/question/{request_id}/reply` endpoint. All
/// handlers take `State<ServerState>`.
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
        .route("/question/{request_id}/reply", post(reply_handler_state))
}
