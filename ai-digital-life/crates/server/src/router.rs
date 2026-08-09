use crate::sse_server::{SseState, sse_router};
use axum::Router;

/// Compose the full ad-server HTTP router. Today this is just the SSE routes;
/// health/dialogue/etc. routes land here in later tasks so every entry point
/// (the `spawn_http_server` server process and the desktop shell's transitional
/// `spawn_sse_server`) stays mounted behind the same router.
pub fn app_router(state: SseState) -> Router {
    Router::new().merge(sse_router(state))
}
