//! Retrieval domain HTTP handlers — migrated from
//! `src-tauri/src/commands/retrieval.rs`. Follows the conversation-domain
//! recipe: `State(state): State<ServerState>` replaces `app: tauri::AppHandle`,
//! blocking snapshot work runs in `spawn_blocking`, and responses are wrapped
//! with [`crate::ipc::to_response`].
//!
//! The legacy `digital-life://retrieval-status` UI emit from the Tauri
//! original has no [`crate::sse`] equivalent — it is warn+reported (not dropped
//! silently); the kernel `AppEvent::RetrievalStatusChanged` is emitted on
//! `state.event_bus` exactly as before.

use crate::ServerState;
use crate::handlers::workspace::current_workspace;
use crate::ipc;
use adl_errors::AppError;
use adl_kernel::events::AppEvent;
use adl_storage::EntityTable;
use adl_types::RetrievalSnapshot;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

/// GET `/retrieval/status` — latest retrieval snapshot for the active
/// workspace, or `null` when no workspace is open (covers
/// `RetrievalBridge.getStatus` / `getRepoMap`). Faithful to the Tauri
/// `retrieval_get_status` → `latest_retrieval` read path.
pub async fn get_status(State(state): State<ServerState>) -> impl IntoResponse {
    let result = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))
        .and_then(|ws| {
            let Some(ws) = ws.clone() else {
                return Ok(None);
            };
            state.db.load_entity::<RetrievalSnapshot>(EntityTable::RetrievalSnapshots, &ws.id)
        })
        .and_then(|opt| serde_json::to_value(&opt).map_err(AppError::from));
    ipc::to_response(result)
}

/// POST `/retrieval/rebuild` — rebuild the retrieval snapshot for the active
/// workspace and persist it (covers `RetrievalBridge.rebuildIndex`).
pub async fn rebuild_index(State(state): State<ServerState>) -> impl IntoResponse {
    let workspace = match current_workspace(&state) {
        Ok(ws) => ws,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let workspace_id = workspace.id.clone();
    let workspace_id_for_blocking = workspace_id.clone();
    let root_path = workspace.root_path.clone();
    let db = state.db.clone();
    let result = crate::agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let snapshot = adl_workspace::build_retrieval_snapshot(
            &workspace_id_for_blocking,
            PathBuf::from(&root_path).as_path(),
        )?;
        db.save_entity(
            EntityTable::RetrievalSnapshots,
            &workspace_id_for_blocking,
            Some(&workspace_id_for_blocking),
            None,
            Some("completed"),
            &snapshot,
        )?;
        Ok(serde_json::to_value(&snapshot)?)
    })
    .await;
    if let Err(e) = result {
        return ipc::to_response(Err(e));
    }

    state.event_bus.emit(AppEvent::RetrievalStatusChanged(workspace_id.clone()));
    tracing::warn!(
        workspace_id = %workspace_id,
        "retrieval_rebuild_index: legacy 'digital-life://retrieval-status' UI emit has no SSE \
         equivalent; the S1 bridge must poll the snapshot row"
    );

    ipc::to_response(Ok(serde_json::json!(true)))
}
