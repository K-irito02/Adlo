use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    ApprovalDecision, ApprovalRecord, ApprovalRequestSummary, CheckpointPayloadPreview,
    CheckpointRecord, IpcResult, TaskCenterSnapshot, TaskRecord, TaskStatus,
};
use adl_storage::EntityTable;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecisionInput {
    pub approval_id: String,
    pub decision: ApprovalDecision,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn task_get_snapshot(state: tauri::State<'_, AppState>) -> IpcResult<TaskCenterSnapshot> {
    ipc(snapshot(&state))
}

#[tauri::command]
pub fn task_list_pending_approvals(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<ApprovalRequestSummary>> {
    crate::commands::ipc_try(|| {
        let approvals: Vec<ApprovalRecord> = state
            .db
            .list_entities_by_status(EntityTable::Approvals, "pending")?;
        Ok(approvals
            .into_iter()
            .map(|approval| approval.request)
            .collect())
    })
}

#[tauri::command]
pub fn task_decide_approval(
    state: tauri::State<'_, AppState>,
    input: ApprovalDecisionInput,
) -> IpcResult<TaskCenterSnapshot> {
    crate::commands::ipc_try(|| {
        let mut approval: ApprovalRecord = state
            .db
            .load_entity(EntityTable::Approvals, &input.approval_id)?
            .ok_or_else(|| AppError::NotFound(format!("approval {}", input.approval_id)))?;
        approval.decision = Some(input.decision);
        approval.reason = input.reason;
        approval.decided_at = Some(adl_kernel::now_ms());
        state.db.save_entity(
            EntityTable::Approvals,
            &approval.id,
            Some(&approval.workspace_id),
            Some("approval"),
            Some(match input.decision {
                ApprovalDecision::Approved => "approved",
                ApprovalDecision::Rejected => "rejected",
                ApprovalDecision::Timeout => "timeout",
            }),
            &approval,
        )?;
        if let Some(mut task) = state
            .db
            .load_entity::<TaskRecord>(EntityTable::Tasks, &approval.task_id)?
        {
            task.status = match input.decision {
                ApprovalDecision::Approved => TaskStatus::Approved,
                ApprovalDecision::Rejected => TaskStatus::Rejected,
                ApprovalDecision::Timeout => TaskStatus::Failed,
            };
            task.updated_at = adl_kernel::now_ms();
            state.db.save_entity(
                EntityTable::Tasks,
                &task.id,
                Some(&task.workspace_id),
                Some(&task.session_id),
                Some(match task.status {
                    TaskStatus::Approved => "approved",
                    TaskStatus::Rejected => "rejected",
                    TaskStatus::Failed => "failed",
                    _ => "updated",
                }),
                &task,
            )?;
        }
        snapshot(&state)
    })
}

#[tauri::command]
pub fn task_get_checkpoint_preview(
    state: tauri::State<'_, AppState>,
    checkpoint_id: String,
) -> IpcResult<Option<CheckpointPayloadPreview>> {
    ipc(adl_fs_ops::read_checkpoint_preview(
        &state.data_dir.join("state").join("checkpoints"),
        &checkpoint_id,
    ))
}

#[tauri::command]
pub fn task_restore_checkpoint(
    state: tauri::State<'_, AppState>,
    checkpoint_id: String,
) -> IpcResult<TaskCenterSnapshot> {
    crate::commands::ipc_try(|| {
        let _ = adl_fs_ops::restore_checkpoint_payload(
            &state.data_dir.join("state").join("checkpoints"),
            &checkpoint_id,
        )?;
        snapshot(&state)
    })
}

fn snapshot(state: &AppState) -> Result<TaskCenterSnapshot, AppError> {
    let tasks: Vec<TaskRecord> = state.db.list_entities(EntityTable::Tasks)?;
    let mut approvals: Vec<ApprovalRecord> = state.db.list_entities(EntityTable::Approvals)?;
    approvals.retain(|approval| approval.decision.is_none());
    let mut checkpoints: Vec<CheckpointRecord> =
        state.db.list_entities(EntityTable::Checkpoints)?;
    checkpoints.sort_by_key(|checkpoint| std::cmp::Reverse(checkpoint.created_at));
    Ok(TaskCenterSnapshot {
        tasks: tasks.iter().map(adl_task::task_summary).collect(),
        pending_approvals: approvals
            .into_iter()
            .map(|approval| approval.request)
            .collect(),
        policy: adl_task::default_policy(),
        current_session: None,
        latest_checkpoint: checkpoints.into_iter().next(),
    })
}
