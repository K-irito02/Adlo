//! Patch domain HTTP handlers — migrated from `src-tauri/src/commands/patch.rs`
//! (`patch_get_patch_set`, `patch_set_hunk_decision`, `patch_apply_patch_set`,
//! `patch_rollback_patch_set`). Patch application drives `adl_change_engine`
//! against the active workspace root.
//!
//! Emit mapping: the Tauri `patch_apply_patch_set` / `patch_rollback_patch_set`
//! emitted `digital-life://patch-rolled-back` and legacy
//! `digital-life://run-activity` ("patch" phase) UI events. Neither has a
//! `SessionPartEvent` equivalent on the SSE bridge, so both are `tracing::warn`
//! and report here (not silently dropped).

use crate::handlers::workspace::current_workspace;
use crate::ipc;
use adl_change_engine;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{PatchHunkDecision, PatchSet, PatchSetStatus};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use std::collections::HashSet;
use std::path::PathBuf;

use crate::ServerState;

/// POST `/patch/apply` — apply a patch set to the active workspace. Requires an
/// active workspace and at least one accepted hunk.
pub async fn apply_patch_set(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: PatchSetIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = apply_patch_set_inner(&state, &input.patch_set_id).await;
    ipc::to_response(result)
}

async fn apply_patch_set_inner(
    state: &ServerState,
    patch_set_id: &str,
) -> Result<serde_json::Value, AppError> {
    let workspace = current_workspace(state)?;
    let root = PathBuf::from(&workspace.root_path);
    let workspace_id = workspace.id.clone();

    // Snapshot the editor dirty-path set (in-memory) so the blocking closure
    // does not borrow `state`.
    let dirty: HashSet<String> = match state.editor_dirty_paths.lock() {
        Ok(d) => d.clone(),
        Err(_) => return Err(AppError::Internal("editor dirty paths mutex poisoned".into())),
    };

    // Phase 1 (blocking): load the patch set + validate against dirty paths.
    let db = state.db.clone();
    let patch_set_id_for_db = patch_set_id.to_string();
    let patch_set = tokio::task::spawn_blocking(move || {
        let patch_set = require_patch_set_with_db(&db, &patch_set_id_for_db)?;
        for file_patch in &patch_set.file_patches {
            let norm = file_patch.relative_path.replace('\\', "/");
            if file_patch.hunks.iter().any(|h| h.decision == PatchHunkDecision::Accepted)
                && dirty.contains(&norm)
            {
                return Err(AppError::Patch(format!(
                    "编辑器中有未保存修改，无法应用补丁：{norm}。请先保存或放弃更改。"
                )));
            }
        }
        Ok(patch_set)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    // Phase 2 (blocking): apply the patch set (files + checkpoint) and persist
    // checkpoint / patch set.
    let db = state.db.clone();
    let workspace_id_for_apply = workspace_id.clone();
    let root_for_apply = root.clone();
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let patch_set = tokio::task::spawn_blocking(move || -> Result<PatchSet, AppError> {
        tracing::warn!(
            "patch_apply: legacy 'digital-life://run-activity' (patch phase) UI emit has no \
             SSE equivalent; the patch apply progress is not streamed — S1 bridge must poll \
             patch_set status"
        );
        let (patch_set, _checkpoint) =
            adl_change_engine::apply_patch_set(patch_set, &root_for_apply, &checkpoints_dir)?;
        db.save_entity(
            EntityTable::Checkpoints,
            &_checkpoint.id,
            Some(&workspace_id_for_apply),
            Some(&patch_set.session_id),
            Some("created"),
            &_checkpoint,
        )?;
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(patch_set)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    let result = adl_change_engine::application_result(patch_set, None, None, false);
    Ok(serde_json::to_value(result)?)
}

/// GET `/patch/:patch_set_id` — a patch set or `null` (covers
/// `PatchBridge.getPatchSet`).
pub async fn get_patch_set(
    State(state): State<ServerState>,
    Path(patch_set_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let patch_set = db.load_entity::<PatchSet>(EntityTable::PatchSets, &patch_set_id)?;
        Ok(serde_json::to_value(patch_set)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

/// POST `/patch/hunk-decision` — set an individual hunk's decision and persist
/// the patch set (covers `PatchBridge.setHunkDecision`).
pub async fn set_hunk_decision(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: HunkDecisionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let patch_set = require_patch_set_with_db(&db, &input.patch_set_id)?;
        let patch_set =
            adl_change_engine::set_hunk_decision(patch_set, &input.hunk_id, input.decision)?;
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(serde_json::to_value(patch_set)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

/// POST `/patch/rollback` — revert an applied patch set on disk (covers
/// `PatchBridge.rollbackPatchSet`).
pub async fn rollback_patch_set(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: PatchSetIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace = match current_workspace(&state) {
        Ok(ws) => ws,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = PathBuf::from(&workspace.root_path);
    let db = state.db.clone();
    let patch_set_id_for_db = input.patch_set_id.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut patch_set = require_patch_set_with_db(&db, &patch_set_id_for_db)?;
        patch_set = adl_change_engine::rollback_patch_set(patch_set, std::path::Path::new(&root))?;
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(serde_json::to_value(&patch_set)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    if let Ok(Ok(_)) = &result {
        tracing::warn!(
            patch_set_id = %input.patch_set_id,
            "patch_rollback: legacy 'digital-life://patch-rolled-back' UI emit has no SSE \
             equivalent; the S1 bridge must surface rollbacks via the patch_set status"
        );
    }
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bodies / helpers
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchSetIdBody {
    patch_set_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HunkDecisionInput {
    patch_set_id: String,
    hunk_id: String,
    decision: PatchHunkDecision,
}

fn require_patch_set_with_db(
    db: &adl_storage::Database,
    patch_set_id: &str,
) -> Result<PatchSet, AppError> {
    db.load_entity::<PatchSet>(EntityTable::PatchSets, patch_set_id)?
        .ok_or_else(|| AppError::NotFound(format!("patch_set {patch_set_id}")))
}

fn save_patch_set_with_db(
    db: &adl_storage::Database,
    patch_set: &PatchSet,
) -> Result<(), AppError> {
    let status = match patch_set.status {
        PatchSetStatus::Draft => "draft",
        PatchSetStatus::Ready => "ready",
        PatchSetStatus::Applying => "applying",
        PatchSetStatus::Applied => "applied",
        PatchSetStatus::Failed => "failed",
        PatchSetStatus::RolledBack => "rolled-back",
    };
    db.save_entity(
        EntityTable::PatchSets,
        &patch_set.id,
        Some(&patch_set.workspace_id),
        Some(&patch_set.session_id),
        Some(status),
        patch_set,
    )
}
