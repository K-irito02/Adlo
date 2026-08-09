use crate::ServerState;
use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

pub async fn health(State(state): State<ServerState>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "port": state.server_port.load(std::sync::atomic::Ordering::Relaxed),
        "startedAt": state.started_at,
    }))
}
