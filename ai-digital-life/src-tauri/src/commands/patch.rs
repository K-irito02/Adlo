use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{IpcResult, PatchApplicationResult, PatchHunkDecision, PatchSet, PatchSetStatus};
use adl_storage::EntityTable;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HunkDecisionInput {
    pub patch_set_id: String,
    pub hunk_id: String,
    pub decision: PatchHunkDecision,
}

#[tauri::command]
pub fn patch_get_patch_set(
    state: tauri::State<'_, AppState>,
    patch_set_id: String,
) -> IpcResult<Option<PatchSet>> {
    ipc(state.db.load_entity(EntityTable::PatchSets, &patch_set_id))
}

#[tauri::command]
pub fn patch_set_hunk_decision(
    state: tauri::State<'_, AppState>,
    input: HunkDecisionInput,
) -> IpcResult<PatchSet> {
    crate::commands::ipc_try(|| {
        let patch_set = require_patch_set(&state, &input.patch_set_id)?;
        let patch_set =
            adl_change_engine::set_hunk_decision(patch_set, &input.hunk_id, input.decision)?;
        save_patch_set(&state, &patch_set)?;
        Ok(patch_set)
    })
}

#[tauri::command]
pub async fn patch_apply_patch_set(
    state: tauri::State<'_, AppState>,
    patch_set_id: String,
) -> Result<IpcResult<PatchApplicationResult>, CommandError> {
    Ok(ipc(apply_patch_set_inner(&state, &patch_set_id).await))
}

#[tauri::command]
pub fn patch_rollback_patch_set(
    state: tauri::State<'_, AppState>,
    patch_set_id: String,
) -> IpcResult<PatchSet> {
    crate::commands::ipc_try(|| {
        let patch_set = require_patch_set(&state, &patch_set_id)?;
        let workspace = crate::commands::workspace::current_workspace(&state)?;
        let patch_set = adl_change_engine::rollback_patch_set(
            patch_set,
            std::path::Path::new(&workspace.root_path),
        )?;
        save_patch_set(&state, &patch_set)?;
        Ok(patch_set)
    })
}

async fn apply_patch_set_inner(
    state: &AppState,
    patch_set_id: &str,
) -> Result<PatchApplicationResult, AppError> {
    let patch_set = require_patch_set(state, patch_set_id)?;
    let workspace = crate::commands::workspace::current_workspace(state)?;
    let root = std::path::Path::new(&workspace.root_path);
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let (mut patch_set, checkpoint) =
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

    let command_request =
        adl_terminal::validation_command(root, &workspace.id, patch_set.run_id.clone());
    let command_result = if let Some(request) = command_request {
        Some(adl_terminal::run_command(root, request, Some(120)).await?)
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

    let mut rolled_back = false;
    if validation.status == "failed" {
        patch_set = adl_change_engine::rollback_patch_set(patch_set, root)?;
        rolled_back = true;
    } else {
        patch_set.status = PatchSetStatus::Applied;
    }
    save_patch_set(state, &patch_set)?;
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
