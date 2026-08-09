//! Session-fork domain HTTP handlers — migrated from
//! `src-tauri/src/commands/session_fork.rs` (`fork_session_cmd`,
//! `list_session_forks`). Faithful to the Tauri originals: `fork_session` only
//! *computes* the child session (the frontend persists it via `create_session`),
//! and `list_session_forks` filters the workspace's sessions by `parent_id`.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_conversation::fork::fork_session as compute_fork;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::conversation::ConversationSessionRecord;
use axum::extract::State;
use axum::response::IntoResponse;

/// POST `/session-fork` — compute a child session forked from a parent at a
/// message (covers `SessionForkBridge.forkSession`). Does NOT persist; the
/// caller persists the returned session.
pub async fn fork_session(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ForkSessionBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let existing_fork_count = db
            .list_entities_by_workspace::<ConversationSessionRecord>(
                EntityTable::Sessions,
                &input.parent_session.workspace_id,
            )?
            .into_iter()
            .filter(|s| s.parent_id.as_deref() == Some(&input.parent_session.id))
            .count() as u32;
        let child = compute_fork(&input.parent_session, existing_fork_count);
        Ok(serde_json::to_value(child)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/session-fork/list` — the workspace sessions whose `parent_id` matches
/// (covers `SessionForkBridge.listSessionForks`).
pub async fn list_session_forks(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ListForksBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let forks: Vec<ConversationSessionRecord> = db
            .list_entities_by_workspace::<ConversationSessionRecord>(
                EntityTable::Sessions,
                &input.workspace_id,
            )?
            .into_iter()
            .filter(|s| s.parent_id.as_deref() == Some(&input.parent_session_id))
            .collect();
        Ok(serde_json::to_value(forks)?)
    })
    .await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForkSessionBody {
    parent_session: ConversationSessionRecord,
    /// Accepted for contract compatibility; the fork point message id is not
    /// used by `adl_conversation::fork::fork_session` (faithful to the Tauri
    /// `_fork_message_id`).
    #[serde(rename = "forkMessageId")]
    _fork_message_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListForksBody {
    workspace_id: String,
    parent_session_id: String,
}
