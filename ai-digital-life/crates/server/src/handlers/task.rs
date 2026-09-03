//! Task-center / checkpoint HTTP handlers — migrated from
//! `src-tauri/src/commands/task/{approval,snapshot}.rs` (`task_*` tauri
//! commands). The task center is a snapshot over `Tasks` / `Checkpoints`
//! plus the active workspace's current session. The interactive approval
//! decision flow (approve → run approved command) is removed: approvals are
//! owned by the host (dsh) and the server no longer writes or decides
//! approval records.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    CheckpointPayloadPreview, CheckpointRecord, ConversationSessionRecord, TaskCenterSnapshot,
    TaskRecord, WorkspaceMeta,
};
use axum::extract::State;
use axum::response::IntoResponse;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckpointIdBody {
    checkpoint_id: String,
}

/// POST `/task/snapshot` — the full task-center snapshot (covers
/// `TaskBridge.getSnapshot`).
pub async fn snapshot(State(state): State<ServerState>) -> impl IntoResponse {
    to_value_response(snapshot_with_state(&state).await)
}

async fn snapshot_with_state(state: &ServerState) -> Result<TaskCenterSnapshot, AppError> {
    let current_workspace = match state.current_workspace.read() {
        Ok(guard) => guard.clone(),
        Err(_) => return Err(AppError::Internal("workspace mutex poisoned".into())),
    };
    let db = state.db.clone();
    agent_loop::run_blocking(move || snapshot_with_db(&db, current_workspace)).await
}

/// POST `/task/checkpoint-preview` — the checkpoint payload preview or `null`
/// (covers `TaskBridge.getCheckpointPreview`).
pub async fn checkpoint_preview(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: CheckpointIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let checkpoint_id = input.checkpoint_id.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let preview: Option<CheckpointPayloadPreview> =
            adl_fs_ops::read_checkpoint_preview(&checkpoints_dir, &checkpoint_id)?;
        Ok(serde_json::to_value(preview)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/task/restore-checkpoint` — restore a checkpoint's files and return the
/// updated task-center snapshot (covers `TaskBridge.restoreCheckpoint`).
pub async fn restore_checkpoint(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: CheckpointIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = restore_checkpoint_inner(&state, &input.checkpoint_id).await;
    to_value_response(result)
}

async fn restore_checkpoint_inner(
    state: &ServerState,
    checkpoint_id: &str,
) -> Result<TaskCenterSnapshot, AppError> {
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let current_workspace = match state.current_workspace.read() {
        Ok(guard) => guard.clone(),
        Err(_) => return Err(AppError::Internal("workspace mutex poisoned".into())),
    };
    let db = state.db.clone();
    let checkpoint_id = checkpoint_id.to_string();
    agent_loop::run_blocking(move || -> Result<TaskCenterSnapshot, AppError> {
        let _ = adl_fs_ops::restore_checkpoint_payload(&checkpoints_dir, &checkpoint_id)?;
        snapshot_with_db(&db, current_workspace)
    })
    .await
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Wrap a typed `Result<T, AppError>` into the shared `IpcResult` shape,
/// serializing the payload value (used by the snapshot-returning handlers).
fn to_value_response<T: serde::Serialize>(
    result: Result<T, AppError>,
) -> (axum::http::StatusCode, axum::Json<serde_json::Value>) {
    match result {
        Ok(value) => match serde_json::to_value(&value) {
            Ok(v) => ipc::to_response(Ok(v)),
            Err(e) => ipc::to_response(Err(AppError::from(e))),
        },
        Err(e) => ipc::to_response(Err(e)),
    }
}

fn snapshot_with_db(
    db: &adl_storage::Database,
    current_workspace: Option<WorkspaceMeta>,
) -> Result<TaskCenterSnapshot, AppError> {
    let tasks: Vec<TaskRecord> = db.list_entities(EntityTable::Tasks)?;
    let mut checkpoints: Vec<CheckpointRecord> = db.list_entities(EntityTable::Checkpoints)?;
    checkpoints.sort_by_key(|checkpoint| std::cmp::Reverse(checkpoint.created_at));
    let current_session = if let Some(workspace) = current_workspace {
        let conversation_sessions: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &workspace.id)?;
        conversation_sessions
            .into_iter()
            .filter(|session| session.status != "archived")
            .max_by_key(|session| session.updated_at)
            .map(|session| {
                let current_task_id = tasks
                    .iter()
                    .filter(|task| task.session_id == session.id)
                    .max_by_key(|task| task.updated_at)
                    .map(|task| task.id.clone());
                adl_types::SessionMeta {
                    id: session.id,
                    workspace_id: session.workspace_id,
                    status: adl_types::SessionStatus::Active,
                    approval_mode: "manual".into(),
                    current_task_id,
                    summary: adl_types::SessionSummary::default(),
                    created_at: session.created_at,
                    updated_at: session.updated_at,
                }
            })
    } else {
        None
    };
    Ok(TaskCenterSnapshot {
        tasks: tasks.iter().map(adl_task::task_summary).collect(),
        pending_approvals: Vec::new(),
        policy: adl_task::default_policy(),
        current_session,
        latest_checkpoint: checkpoints.into_iter().next(),
    })
}
