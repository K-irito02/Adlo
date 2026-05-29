use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_command::run_approved_command;
use adl_errors::AppError;
use adl_kernel::{
    ApprovalDecision, ApprovalRecord, ApprovalRequestSummary, AuditEntry, CheckpointPayloadPreview,
    CheckpointRecord, CommandRequest, IpcResult, TaskCenterSnapshot, TaskRecord, TaskStatus,
    WorkspaceMeta,
};
use adl_storage::EntityTable;
use tauri::Emitter;

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
pub fn task_list_audit_entries(
    state: tauri::State<'_, AppState>,
    limit: Option<usize>,
) -> IpcResult<Vec<AuditEntry>> {
    ipc(crate::commands::audit::list_audit_entries(&state, limit))
}

#[tauri::command]
pub async fn task_decide_approval(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: ApprovalDecisionInput,
) -> Result<IpcResult<TaskCenterSnapshot>, CommandError> {
    Ok(ipc(decide_approval_inner(&app, &state, input).await))
}

async fn decide_approval_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    input: ApprovalDecisionInput,
) -> Result<TaskCenterSnapshot, AppError> {
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
        if matches!(input.decision, ApprovalDecision::Approved) {
            maybe_execute_approved_command(app, state, &mut task).await?;
        }
    }
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &approval.workspace_id,
        Some("approval"),
        "approval",
        approval.risk_level,
        format!(
            "Approval {} was {:?}.",
            approval.request.title, input.decision
        ),
        Some(match input.decision {
            ApprovalDecision::Approved => "approved",
            ApprovalDecision::Rejected => "rejected",
            ApprovalDecision::Timeout => "rejected",
        }),
        approval.reason.clone(),
    );

    if let Some(run_id) = approval.run_id.clone() {
        let task_session_id = state
            .db
            .load_entity::<TaskRecord>(EntityTable::Tasks, &approval.task_id)?
            .map(|task| task.session_id)
            .unwrap_or_else(|| approval.task_id.clone());
        let ts = adl_kernel::now_ms();
        let seq = crate::run_activity_seq::next_run_activity_seq(ts);
        let decision = match input.decision {
            ApprovalDecision::Approved => "approved",
            ApprovalDecision::Rejected => "rejected",
            ApprovalDecision::Timeout => "timeout",
        };
        let event = adl_kernel::DigitalLifeRunActivityEventV1::Approval {
            v: 1,
            run_id: run_id.clone(),
            seq,
            ts,
            phase: "decided".into(),
            approval_id: approval.id.clone(),
            decision: Some(decision.into()),
            reason: approval.reason.clone(),
        };
        let _ = state.db.save_entity(
            EntityTable::RunActivityEvents,
            &adl_kernel::create_id("runact"),
            Some(&approval.workspace_id),
            Some(&task_session_id),
            Some(&run_id),
            &event,
        );
        let _ = app.emit(
            "digital-life://run-activity",
            adl_events::run_activity_event(
                &run_id,
                seq,
                ts,
                "approval",
                serde_json::json!({
                    "phase": "decided",
                    "approvalId": approval.id,
                    "decision": decision,
                    "reason": approval.reason
                }),
            ),
        );
    }
    snapshot(state)
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
        if let Some(checkpoint) = state
            .db
            .load_entity::<CheckpointRecord>(EntityTable::Checkpoints, &checkpoint_id)?
        {
            let _ = crate::commands::audit::save_audit_entry(
                &state,
                &checkpoint.workspace_id,
                Some(&checkpoint.session_id),
                "patch-rollback",
                adl_kernel::RiskLevel::Medium,
                format!("Restored checkpoint {}.", checkpoint.id),
                Some("approved"),
                Some(checkpoint.description),
            );
        }
        snapshot(&state)
    })
}

async fn maybe_execute_approved_command(
    app: &tauri::AppHandle,
    state: &AppState,
    task: &mut TaskRecord,
) -> Result<(), AppError> {
    let Some(operation) = task.operations.first() else {
        return Ok(());
    };
    if operation.kind != "command.run" {
        return Ok(());
    }
    let request: CommandRequest = serde_json::from_value(operation.params.clone())?;
    let workspace = state
        .db
        .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &task.workspace_id)?
        .or_else(|| {
            state
                .current_workspace
                .lock()
                .expect("workspace mutex poisoned")
                .clone()
        })
        .ok_or_else(|| AppError::NotFound(format!("workspace {}", task.workspace_id)))?;
    task.status = TaskStatus::Running;
    task.started_at = Some(adl_kernel::now_ms());
    task.updated_at = adl_kernel::now_ms();
    state.db.save_entity(
        EntityTable::Tasks,
        &task.id,
        Some(&task.workspace_id),
        Some(&task.session_id),
        Some("running"),
        task,
    )?;

    if let Some(run_id) = &request.run_id {
        let ts = adl_kernel::now_ms();
        let seq = crate::run_activity_seq::next_run_activity_seq(ts);
        let event = adl_kernel::DigitalLifeRunActivityEventV1::Command {
            v: 1,
            run_id: run_id.clone(),
            seq,
            ts,
            phase: "start".into(),
            command: request.command.clone(),
            args: Some(request.args.clone()),
            exit_code: None,
        };
        let _ = state.db.save_entity(
            EntityTable::RunActivityEvents,
            &adl_kernel::create_id("runact"),
            Some(&workspace.id),
            Some(&task.session_id),
            Some(run_id),
            &event,
        );
        let _ = app.emit(
            "digital-life://run-activity",
            adl_events::run_activity_event(
                run_id,
                seq,
                ts,
                "command",
                serde_json::json!({
                    "phase": "start",
                    "command": request.command,
                    "args": request.args,
                }),
            ),
        );
    }

    let result = run_approved_command(
        std::path::Path::new(&workspace.root_path),
        request.clone(),
        Some(120),
    )
    .await?;
    state.db.save_entity(
        EntityTable::CommandExecutions,
        &result.request.id,
        Some(&workspace.id),
        Some(&task.session_id),
        Some(if result.success {
            "completed"
        } else {
            "failed"
        }),
        &result,
    )?;
    task.status = if result.success {
        TaskStatus::Completed
    } else {
        TaskStatus::Failed
    };
    task.result_json = Some(serde_json::to_string(&result)?);
    task.completed_at = Some(adl_kernel::now_ms());
    task.updated_at = adl_kernel::now_ms();
    state.db.save_entity(
        EntityTable::Tasks,
        &task.id,
        Some(&task.workspace_id),
        Some(&task.session_id),
        Some(if result.success {
            "completed"
        } else {
            "failed"
        }),
        task,
    )?;
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some(&task.session_id),
        "command",
        request.risk_level,
        result.summary.clone(),
        Some("approved"),
        Some(format!(
            "command={} {}",
            request.command,
            request.args.join(" ")
        )),
    );

    if let Some(run_id) = &request.run_id {
        let ts = adl_kernel::now_ms();
        let seq = crate::run_activity_seq::next_run_activity_seq(ts);
        let _ = state.db.save_entity(
            EntityTable::RunActivityEvents,
            &adl_kernel::create_id("runact"),
            Some(&workspace.id),
            Some(&task.session_id),
            Some(run_id),
            &adl_kernel::DigitalLifeRunActivityEventV1::Command {
                v: 1,
                run_id: run_id.clone(),
                seq,
                ts,
                phase: "done".into(),
                command: request.command.clone(),
                args: Some(request.args.clone()),
                exit_code: result.exit_code,
            },
        );
        let _ = app.emit(
            "digital-life://run-activity",
            adl_events::run_activity_event(
                run_id,
                seq,
                ts,
                "command",
                serde_json::json!({
                    "phase": "done",
                    "command": request.command,
                    "args": request.args,
                    "exitCode": result.exit_code,
                }),
            ),
        );
    }
    Ok(())
}

fn snapshot(state: &AppState) -> Result<TaskCenterSnapshot, AppError> {
    let tasks: Vec<TaskRecord> = state.db.list_entities(EntityTable::Tasks)?;
    let mut approvals: Vec<ApprovalRecord> = state.db.list_entities(EntityTable::Approvals)?;
    approvals.retain(|approval| approval.decision.is_none());
    let mut checkpoints: Vec<CheckpointRecord> =
        state.db.list_entities(EntityTable::Checkpoints)?;
    checkpoints.sort_by_key(|checkpoint| std::cmp::Reverse(checkpoint.created_at));
    let current_session = if let Some(workspace) = state
        .current_workspace
        .lock()
        .expect("workspace mutex poisoned")
        .clone()
    {
        let conversation_sessions: Vec<adl_kernel::ConversationSessionRecord> = state
            .db
            .list_entities_by_workspace(EntityTable::Sessions, &workspace.id)?;
        conversation_sessions
            .into_iter()
            .filter(|session| session.status != "archived")
            .max_by_key(|session| session.updated_at)
            .map(|session| {
                let session_id = session.id.clone();
                adl_kernel::SessionMeta {
                    id: session.id,
                    workspace_id: session.workspace_id,
                    status: adl_kernel::SessionStatus::Active,
                    approval_mode: "manual".into(),
                    current_task_id: tasks
                        .iter()
                        .filter(|task| task.session_id == session_id)
                        .max_by_key(|task| task.updated_at)
                        .map(|task| task.id.clone()),
                    summary: adl_kernel::SessionSummary::default(),
                    created_at: session.created_at,
                    updated_at: session.updated_at,
                }
            })
    } else {
        None
    };
    Ok(TaskCenterSnapshot {
        tasks: tasks.iter().map(adl_task::task_summary).collect(),
        pending_approvals: approvals
            .into_iter()
            .map(|approval| approval.request)
            .collect(),
        policy: adl_task::default_policy(),
        current_session,
        latest_checkpoint: checkpoints.into_iter().next(),
    })
}
