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
        let _ = crate::commands::audit::save_audit_entry(
            &state,
            &workspace.id,
            Some(&patch_set.session_id),
            "patch-rollback",
            adl_kernel::RiskLevel::Medium,
            format!("Rolled back {} on user request.", patch_set.title),
            Some("approved"),
            None,
        );
        if let Some(run_id) = &patch_set.run_id {
            if let Some(detail) = crate::commands::agent::load_run_detail(&state, run_id)? {
                let validation = adl_kernel::ValidationResult {
                    id: adl_kernel::create_id("validation"),
                    workspace_id: workspace.id.clone(),
                    run_id: Some(run_id.clone()),
                    patch_set_id: Some(patch_set.id.clone()),
                    status: "failed".into(),
                    summary: "User requested rollback.".into(),
                    diagnostics: vec![],
                    created_at: adl_kernel::now_ms(),
                };
                let detail = adl_agent_runtime::complete_after_patch(detail, &validation, true);
                crate::commands::agent::save_run_detail(&state, &detail)?;
            }
        }
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
    {
        let dirty = state
            .editor_dirty_paths
            .lock()
            .expect("editor dirty paths mutex poisoned");
        for file_patch in &patch_set.file_patches {
            let norm = file_patch.relative_path.replace('\\', "/");
            if file_patch
                .hunks
                .iter()
                .any(|h| h.decision == PatchHunkDecision::Accepted)
                && dirty.contains(&norm)
            {
                return Err(AppError::Patch(format!(
                    "编辑器中有未保存修改，无法应用补丁：{norm}。请先保存或放弃更改。"
                )));
            }
        }
    }
    if let Some(run_id) = &patch_set.run_id {
        if let Some(detail) = crate::commands::agent::load_run_detail(state, run_id)? {
            crate::commands::agent::save_run_detail(state, &adl_agent_runtime::mark_applying(detail))?;
        }
    }
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
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some(&patch_set.session_id),
        "patch-apply",
        adl_kernel::RiskLevel::Medium,
        format!("Applied accepted hunks for {}.", patch_set.title),
        Some("auto"),
        Some(format!("checkpointId={}", checkpoint.id)),
    );

    let command_request =
        adl_terminal::validation_command(root, &workspace.id, patch_set.run_id.clone());
    if let Some(run_id) = &patch_set.run_id {
        if let Some(detail) = crate::commands::agent::load_run_detail(state, run_id)? {
            crate::commands::agent::save_run_detail(state, &adl_agent_runtime::mark_verifying(detail))?;
        }
    }
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
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some(&patch_set.session_id),
        "command",
        adl_kernel::RiskLevel::Low,
        validation.summary.clone(),
        Some("auto"),
        Some(format!("validationStatus={}", validation.status)),
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
            adl_kernel::RiskLevel::Medium,
            format!("Rolled back {} after failed validation.", patch_set.title),
            Some("auto"),
            Some(validation.summary.clone()),
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
