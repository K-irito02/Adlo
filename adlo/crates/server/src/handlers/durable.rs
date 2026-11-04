//! Durable-session domain HTTP handlers — migrated from
//! `src-tauri/src/commands/durable.rs` (`durable_*` tauri commands). The
//! `DurableSessionManager` already lives on [`ServerState::durable_manager`]
//! (no new field needed); every operation is already async, so the handlers
//! call it directly. No events are emitted by the Tauri originals — faithful
//! parity.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::durable::DurableSessionState;
use axum::extract::State;
use axum::response::IntoResponse;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterBody {
    session_id: String,
    run_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionIdBody {
    session_id: String,
}

/// POST `/durable/register` — persist a running durable session (covers
/// `DurableBridge.registerDurableSession`).
pub async fn register(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RegisterBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let manager = state.durable_manager.clone();
    let result = manager.register_session(&input.session_id, &input.run_id).await;
    ipc::to_response(result.map(|()| serde_json::json!(null)))
}

/// POST `/durable/heartbeat` — refresh a session's heartbeat (no-op for an
/// unknown session; covers `DurableBridge.heartbeatDurableSession`).
pub async fn heartbeat(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SessionIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let manager = state.durable_manager.clone();
    manager.heartbeat(&input.session_id).await;
    ipc::to_response(Ok(serde_json::json!(null)))
}

/// POST `/durable/crashed` — sessions whose heartbeat went stale (covers
/// `DurableBridge.findCrashedSessions`).
pub async fn crashed(State(state): State<ServerState>) -> impl IntoResponse {
    let manager = state.durable_manager.clone();
    let sessions: Vec<DurableSessionState> = manager.find_crashed_sessions().await;
    ipc::to_response(serde_json::to_value(sessions).map_err(AppError::from))
}

/// POST `/durable/recover` — start recovery for a session (covers
/// `DurableBridge.recoverSession`).
pub async fn recover(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SessionIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let manager = state.durable_manager.clone();
    let recovered = manager.start_recovery(&input.session_id).await;
    ipc::to_response(Ok(serde_json::json!(recovered)))
}
