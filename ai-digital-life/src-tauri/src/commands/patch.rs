use crate::commands::RunActivityContext;
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_command::{run_command, validation_command};
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{IpcResult, PatchApplicationResult, PatchHunkDecision, PatchSet, PatchSetStatus};
use tauri::{Emitter, Manager};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HunkDecisionInput {
    pub patch_set_id: String,
    pub hunk_id: String,
    pub decision: PatchHunkDecision,
}

#[tauri::command]
pub async fn patch_get_patch_set(
    app: tauri::AppHandle,
    patch_set_id: String,
) -> Result<IpcResult<Option<PatchSet>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let patch_set = tokio::task::spawn_blocking(move || {
        db.load_entity::<PatchSet>(EntityTable::PatchSets, &patch_set_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(patch_set)))
}

#[tauri::command]
pub async fn patch_set_hunk_decision(
    app: tauri::AppHandle,
    input: HunkDecisionInput,
) -> Result<IpcResult<PatchSet>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let patch_set = tokio::task::spawn_blocking(move || -> Result<PatchSet, AppError> {
        let patch_set = require_patch_set_with_db(&db, &input.patch_set_id)?;
        let patch_set =
            adl_change_engine::set_hunk_decision(patch_set, &input.hunk_id, input.decision)?;
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(patch_set)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(patch_set)))
}

#[tauri::command]
pub async fn patch_apply_patch_set(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    patch_set_id: String,
) -> Result<IpcResult<PatchApplicationResult>, CommandError> {
    Ok(ipc(apply_patch_set_inner(&app, &state, &patch_set_id).await))
}

#[tauri::command]
pub async fn patch_rollback_patch_set(
    app: tauri::AppHandle,
    patch_set_id: String,
) -> Result<IpcResult<PatchSet>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let workspace = crate::commands::workspace::current_workspace(&state)?;
    let root_path = workspace.root_path.clone();
    let workspace_id = workspace.id.clone();

    let patch_set = tokio::task::spawn_blocking(move || -> Result<PatchSet, AppError> {
        let patch_set = require_patch_set_with_db(&db, &patch_set_id)?;
        let patch_set =
            adl_change_engine::rollback_patch_set(patch_set, std::path::Path::new(&root_path))?;
        let _ = crate::commands::audit::save_audit_entry_with_db(
            &db,
            &workspace_id,
            Some(&patch_set.session_id),
            "patch-rollback",
            adl_types::RiskLevel::Medium,
            format!("Rolled back {} on user request.", patch_set.title),
            Some("approved"),
            None,
        );
        if let Some(run_id) = &patch_set.run_id {
            let Some(run) =
                db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
            else {
                return Ok(patch_set);
            };
            let mut steps: Vec<adl_types::AgentPlanStep> =
                db.list_entities_by_run(EntityTable::AgentSteps, run_id)?;
            steps.sort_by_key(|step| step.created_at);
            let mut detail = adl_types::AgentRunDetail { run: run.clone(), steps };
            detail.run.status = adl_types::AgentRunStatus::RolledBack;
            detail.run.updated_at = adl_types::now_ms();
            crate::commands::agent::save_run_detail_with_db(&db, &detail)?;
        }
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(patch_set)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    let _ = app.emit("digital-life://patch-rolled-back", &patch_set);
    Ok(ipc(Ok(patch_set)))
}

async fn apply_patch_set_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    patch_set_id: &str,
) -> Result<PatchApplicationResult, AppError> {
    let patch_set = require_patch_set(state, patch_set_id)?;
    let workspace = crate::commands::workspace::current_workspace(state)?;
    let root = std::path::Path::new(&workspace.root_path);

    validate_patch_set(state, &patch_set)?;
    emit_patch_apply_event(app, state, &workspace, &patch_set)?;

    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let (patch_set, checkpoint) =
        adl_change_engine::apply_patch_set(patch_set, root, &checkpoints_dir)?;
    state.db.save_entity(
        EntityTable::Checkpoints,
        &checkpoint.id,
        Some(&workspace.id),
        Some(&patch_set.session_id),
        Some("created"),
        &checkpoint,
    )?;
    save_patch_set(state, &patch_set)?;
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some(&patch_set.session_id),
        "patch-apply",
        adl_types::RiskLevel::Medium,
        format!("Applied accepted hunks for {}.", patch_set.title),
        Some("auto"),
        Some(&format!("checkpointId={}", checkpoint.id)),
    );

    save_and_verify_patch(state, app, &workspace, patch_set, root).await
}

fn validate_patch_set(state: &AppState, patch_set: &PatchSet) -> Result<(), AppError> {
    let dirty = state
        .editor_dirty_paths
        .lock()
        .map_err(|_| AppError::Internal("editor dirty paths mutex poisoned".into()))?;
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
    Ok(())
}

fn emit_patch_apply_event(
    app: &tauri::AppHandle,
    state: &AppState,
    workspace: &adl_types::WorkspaceMeta,
    patch_set: &PatchSet,
) -> Result<(), AppError> {
    if let Some(run_id) = &patch_set.run_id {
        let ts = adl_types::now_ms();
        let seq = adl_agent_runtime::run_activity_seq::next_run_activity_seq(ts);
        let event = adl_types::DigitalLifeRunActivityEventV1::Patch {
            v: 1,
            run_id: run_id.to_string(),
            seq,
            ts,
            phase: "applied".into(),
            patch_set_id: patch_set.id.clone(),
            file_count: Some(patch_set.file_patches.len()),
            hunk_count: Some(patch_set.file_patches.iter().map(|f| f.hunks.len()).sum::<usize>()),
        };
        let payload = serde_json::json!({
            "phase": "applied",
            "patchSetId": patch_set.id,
            "fileCount": patch_set.file_patches.len(),
            "hunkCount": patch_set.file_patches.iter().map(|f| f.hunks.len()).sum::<usize>()
        });
        crate::commands::save_and_emit_run_activity(RunActivityContext {
            state,
            app,
            workspace_id: &workspace.id,
            session_id: &patch_set.session_id,
            run_id,
            event: &event,
            event_type: "patch",
            seq,
            ts,
            extra: payload,
        });
        if let Some(detail) = crate::commands::agent::load_run_detail(state, run_id)? {
            crate::commands::agent::save_run_detail(
                state,
                &adl_agent_runtime::mark_applying(detail),
            )?;
        }
    }
    Ok(())
}

async fn save_and_verify_patch(
    state: &AppState,
    _app: &tauri::AppHandle,
    workspace: &adl_types::WorkspaceMeta,
    mut patch_set: PatchSet,
    root: &std::path::Path,
) -> Result<PatchApplicationResult, AppError> {
    let command_request = validation_command(root, &workspace.id, patch_set.run_id.clone());
    if let Some(run_id) = &patch_set.run_id {
        if let Some(detail) = crate::commands::agent::load_run_detail(state, run_id)? {
            crate::commands::agent::save_run_detail(
                state,
                &adl_agent_runtime::mark_verifying(detail),
            )?;
        }
    }
    let command_result = if let Some(request) = command_request {
        Some(run_command(root, request, Some(120)).await?)
    } else {
        None
    };
    let validation = adl_change_engine::validation_result_from_command(
        &workspace.id,
        patch_set.run_id.clone(),
        Some(patch_set.id.clone()),
        command_result.as_ref(),
    );
    state.db.save_entity(
        EntityTable::ValidationResults,
        &validation.id,
        Some(&workspace.id),
        Some(&patch_set.session_id),
        Some(&validation.status),
        &validation,
    )?;
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some(&patch_set.session_id),
        "command",
        adl_types::RiskLevel::Low,
        validation.summary.clone(),
        Some("auto"),
        Some(&format!("validationStatus={}", validation.status)),
    );

    let mut rolled_back = false;
    if validation.status == "failed" {
        patch_set = adl_change_engine::rollback_patch_set(patch_set, root)?;
        rolled_back = true;
        let _ = crate::commands::audit::save_audit_entry(
            state,
            &workspace.id,
            Some(&patch_set.session_id),
            "patch-rollback",
            adl_types::RiskLevel::Medium,
            format!("Rolled back {} after failed validation.", patch_set.title),
            Some("auto"),
            Some(&validation.summary),
        );
    } else {
        patch_set.status = PatchSetStatus::Applied;
    }
    save_patch_set(state, &patch_set)?;
    if let Some(run_id) = &patch_set.run_id {
        if let Some(detail) = crate::commands::agent::load_run_detail(state, run_id)? {
            let detail = adl_agent_runtime::complete_after_patch(detail, &validation, rolled_back);
            crate::commands::agent::save_run_detail(state, &detail)?;
        }
    }
    Ok(adl_change_engine::application_result(
        patch_set,
        Some(validation),
        command_result,
        rolled_back,
    ))
}

fn require_patch_set(state: &AppState, patch_set_id: &str) -> Result<PatchSet, AppError> {
    state
        .db
        .load_entity(EntityTable::PatchSets, patch_set_id)?
        .ok_or_else(|| AppError::NotFound(format!("patch set {patch_set_id}")))
}

fn save_patch_set(state: &AppState, patch_set: &PatchSet) -> Result<(), AppError> {
    let status = match patch_set.status {
        PatchSetStatus::Draft => "draft",
        PatchSetStatus::Ready => "ready",
        PatchSetStatus::Applying => "applying",
        PatchSetStatus::Applied => "applied",
        PatchSetStatus::Failed => "failed",
        PatchSetStatus::RolledBack => "rolled-back",
    };
    state.db.save_entity(
        EntityTable::PatchSets,
        &patch_set.id,
        Some(&patch_set.workspace_id),
        Some(&patch_set.session_id),
        Some(status),
        patch_set,
    )
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
