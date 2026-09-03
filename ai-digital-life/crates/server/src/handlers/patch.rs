//! Patch domain HTTP handlers — migrated from `src-tauri/src/commands/patch.rs`
//! (`patch_get_patch_set`, `patch_set_hunk_decision`, `patch_apply_patch_set`,
//! `patch_rollback_patch_set`). Patch application drives `adl_change_engine`
//! against the active workspace root and, when the workspace defines a
//! validation command, runs it; the audit helper is inlined here (the audit
//! domain migrates in a later batch).
//!
//! Emit mapping: the Tauri `patch_apply_patch_set` / `patch_rollback_patch_set`
//! emitted `digital-life://patch-rolled-back` and legacy
//! `digital-life://run-activity` ("patch" phase) UI events. Neither has a
//! `SessionPartEvent` equivalent on the SSE bridge, so both are `tracing::warn`
//! and report here (not silently dropped); run-detail status transitions
//! (`mark_applying` / `mark_verifying` / `complete_after_patch`) are preserved
//! as DB writes.

use crate::ServerState;
use crate::agent_loop;
use crate::handlers::agent as agent_handlers;
use crate::handlers::workspace::current_workspace;
use crate::ipc;
use adl_change_engine;
use adl_command::{run_command, validation_command};
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{CommandRequest, PatchHunkDecision, PatchSet, PatchSetStatus, now_ms};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use std::collections::HashSet;
use std::path::PathBuf;

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
    let patch_set = agent_loop::run_blocking(move || {
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
    .await?;

    // Phase 2 (blocking): legacy run-activity "patch" emit → warn+report; the
    // run-detail `mark_applying` transition; apply the patch set (files +
    // checkpoint) and persist checkpoint / patch set / audit.
    let db = state.db.clone();
    let workspace_id_for_apply = workspace_id.clone();
    let run_id = patch_set.run_id.clone();
    let root_for_apply = root.clone();
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let (patch_set, validation_command_req) = agent_loop::run_blocking(
        move || -> Result<(PatchSet, Option<CommandRequest>), AppError> {
            if let Some(rid) = &run_id {
                if let Some(detail) = agent_handlers::load_run_detail(&db, rid)? {
                    agent_handlers::save_run_detail_with_db(
                        &db,
                        &adl_agent_runtime::mark_applying(detail),
                    )?;
                }
            }
            tracing::warn!(
                run_id = ?run_id,
                "patch_apply: legacy 'digital-life://run-activity' (patch phase) UI emit has no \
                 SSE equivalent; the patch apply progress is not streamed — S1 bridge must poll \
                 patch_set status"
            );
            let (patch_set, checkpoint) =
                adl_change_engine::apply_patch_set(patch_set, &root_for_apply, &checkpoints_dir)?;
            db.save_entity(
                EntityTable::Checkpoints,
                &checkpoint.id,
                Some(&workspace_id_for_apply),
                Some(&patch_set.session_id),
                Some("created"),
                &checkpoint,
            )?;
            save_patch_set_with_db(&db, &patch_set)?;
            let command_req = validation_command(
                &root_for_apply,
                &workspace_id_for_apply,
                patch_set.run_id.clone(),
            );
            Ok((patch_set, command_req))
        },
    )
    .await?;

    // Phase 3 (blocking): `mark_verifying` run transition.
    {
        let db = state.db.clone();
        let run_id = patch_set.run_id.clone();
        agent_loop::run_blocking(move || -> Result<(), AppError> {
            if let Some(rid) = &run_id {
                if let Some(detail) = agent_handlers::load_run_detail(&db, rid)? {
                    agent_handlers::save_run_detail_with_db(
                        &db,
                        &adl_agent_runtime::mark_verifying(detail),
                    )?;
                }
            }
            Ok(())
        })
        .await?;
    }

    // Phase 4 (async): run the workspace's validation command when one exists.
    let command_result = if let Some(request) = validation_command_req {
        Some(run_command(&root, request, Some(120)).await?)
    } else {
        None
    };

    // Phase 5 (blocking): build + persist the validation result, audit, roll
    // back on failure, persist the final patch set + run completion.
    let db = state.db.clone();
    let workspace_id_for_verify = workspace_id.clone();
    let root_for_verify = root.clone();
    let command_result_for_verify = command_result.clone();
    let patch_set_for_verify = patch_set.clone();
    let (patch_set, validation, rolled_back) = agent_loop::run_blocking(
        move || -> Result<(PatchSet, adl_types::ValidationResult, bool), AppError> {
            let validation = adl_change_engine::validation_result_from_command(
                &workspace_id_for_verify,
                patch_set_for_verify.run_id.clone(),
                Some(patch_set_for_verify.id.clone()),
                command_result_for_verify.as_ref(),
            );
            db.save_entity(
                EntityTable::ValidationResults,
                &validation.id,
                Some(&workspace_id_for_verify),
                Some(&patch_set_for_verify.session_id),
                Some(&validation.status),
                &validation,
            )?;
            let (mut patch_set, mut rolled_back) = (patch_set_for_verify, false);
            if validation.status == "failed" {
                patch_set = adl_change_engine::rollback_patch_set(patch_set, &root_for_verify)?;
                rolled_back = true;
            } else {
                patch_set.status = PatchSetStatus::Applied;
            }
            save_patch_set_with_db(&db, &patch_set)?;
            if let Some(rid) = &patch_set.run_id {
                if let Some(detail) = agent_handlers::load_run_detail(&db, rid)? {
                    agent_handlers::save_run_detail_with_db(
                        &db,
                        &adl_agent_runtime::complete_after_patch(detail, &validation, rolled_back),
                    )?;
                }
            }
            Ok((patch_set, validation, rolled_back))
        },
    )
    .await?;

    let result = adl_change_engine::application_result(
        patch_set,
        Some(validation),
        command_result,
        rolled_back,
    );
    Ok(serde_json::to_value(result)?)
}

/// GET `/patch/:patch_set_id` — a patch set or `null` (covers
/// `PatchBridge.getPatchSet`).
pub async fn get_patch_set(
    State(state): State<ServerState>,
    Path(patch_set_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let patch_set = db.load_entity::<PatchSet>(EntityTable::PatchSets, &patch_set_id)?;
        Ok(serde_json::to_value(patch_set)?)
    })
    .await;
    ipc::to_response(result)
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
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let patch_set = require_patch_set_with_db(&db, &input.patch_set_id)?;
        let patch_set =
            adl_change_engine::set_hunk_decision(patch_set, &input.hunk_id, input.decision)?;
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(serde_json::to_value(patch_set)?)
    })
    .await;
    ipc::to_response(result)
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
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut patch_set = require_patch_set_with_db(&db, &patch_set_id_for_db)?;
        patch_set = adl_change_engine::rollback_patch_set(patch_set, std::path::Path::new(&root))?;
        if let Some(run_id) = &patch_set.run_id {
            let Some(mut detail) = agent_handlers::load_run_detail(&db, run_id)? else {
                return Ok(serde_json::to_value(&patch_set)?);
            };
            detail.run.status = adl_types::AgentRunStatus::RolledBack;
            detail.run.updated_at = now_ms();
            agent_handlers::save_run_detail_with_db(&db, &detail)?;
        }
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(serde_json::to_value(&patch_set)?)
    })
    .await;
    if result.is_ok() {
        tracing::warn!(
            patch_set_id = %input.patch_set_id,
            "patch_rollback: legacy 'digital-life://patch-rolled-back' UI emit has no SSE \
             equivalent; the S1 bridge must surface rollbacks via the patch_set status"
        );
    }
    ipc::to_response(result)
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
