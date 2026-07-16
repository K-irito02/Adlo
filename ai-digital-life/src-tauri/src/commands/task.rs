use crate::commands::ipc;
use crate::commands::RunActivityContext;
use crate::error::CommandError;
use crate::state::AppState;
use adl_command::run_approved_command;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    ApprovalDecision, ApprovalRecord, ApprovalRequestSummary, AuditEntry, CheckpointPayloadPreview,
    CheckpointRecord, CommandExecutionResult, CommandRequest, IpcResult, TaskCenterSnapshot,
    TaskRecord, TaskStatus, WorkspaceMeta,
};
use tauri::Manager;

/// 审批决策输入
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecisionInput {
    pub approval_id: String,
    pub decision: ApprovalDecision,
    pub reason: Option<String>,
}

/// 获取任务中心快照
#[tauri::command]
pub async fn task_get_snapshot(
    app: tauri::AppHandle,
) -> Result<IpcResult<TaskCenterSnapshot>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let current_workspace = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone();
    let snapshot = tokio::task::spawn_blocking(move || snapshot_with_db(&db, current_workspace))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(snapshot)))
}

/// 列出待审批请求
#[tauri::command]
pub async fn task_list_pending_approvals(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<ApprovalRequestSummary>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let approvals = tokio::task::spawn_blocking(move || -> Result<Vec<ApprovalRequestSummary>, AppError> {
        let approvals: Vec<ApprovalRecord> =
            db.list_entities_by_status(EntityTable::Approvals, "pending")?;
        Ok(approvals.into_iter().map(|approval| approval.request).collect())
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(approvals)))
}

/// 列出审计条目
#[tauri::command]
pub async fn task_list_audit_entries(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<IpcResult<Vec<AuditEntry>>, CommandError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let limit_val = limit.unwrap_or(50);
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<AuditEntry>, AppError> {
        crate::commands::audit::list_audit_entries_with_db(&db, limit_val)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

/// 处理审批决策
#[tauri::command]
pub async fn task_decide_approval(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: ApprovalDecisionInput,
) -> Result<IpcResult<TaskCenterSnapshot>, CommandError> {
    Ok(ipc(decide_approval_inner(&app, &state, input).await))
}

/// 审批决策的内部实现
async fn decide_approval_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    input: ApprovalDecisionInput,
) -> Result<TaskCenterSnapshot, AppError> {
    let mut approval: ApprovalRecord = state
        .db
        .load_entity(EntityTable::Approvals, &input.approval_id)?
        .ok_or_else(|| AppError::NotFound(format!("approval {}", input.approval_id)))?;
    save_approval_decision(state, &mut approval, input.decision, input.reason)?;
    if let Some(mut task) =
        state.db.load_entity::<TaskRecord>(EntityTable::Tasks, &approval.task_id)?
    {
        task.status = match input.decision {
            ApprovalDecision::Approved => TaskStatus::Approved,
            ApprovalDecision::Rejected => TaskStatus::Rejected,
            ApprovalDecision::Timeout => TaskStatus::Failed,
        };
        task.updated_at = adl_types::now_ms();
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
        format!("Approval {} was {:?}.", approval.request.title, input.decision),
        Some(match input.decision {
            ApprovalDecision::Approved => "approved",
            ApprovalDecision::Rejected => "rejected",
            ApprovalDecision::Timeout => "rejected",
        }),
        approval.reason.as_deref(),
    );

    if let Some(run_id) = approval.run_id.as_deref() {
        emit_approval_decided_event(app, state, &approval, run_id, input.decision)?;
    }
    snapshot(state)
}

/// 保存审批决策
fn save_approval_decision(
    state: &AppState,
    approval: &mut ApprovalRecord,
    decision: ApprovalDecision,
    reason: Option<String>,
) -> Result<(), AppError> {
    approval.decision = Some(decision);
    approval.reason = reason;
    approval.decided_at = Some(adl_types::now_ms());
    state.db.save_entity(
        EntityTable::Approvals,
        &approval.id,
        Some(&approval.workspace_id),
        Some("approval"),
        Some(match decision {
            ApprovalDecision::Approved => "approved",
            ApprovalDecision::Rejected => "rejected",
            ApprovalDecision::Timeout => "timeout",
        }),
        approval,
    )
}

/// 发射审批已决定事件
fn emit_approval_decided_event(
    app: &tauri::AppHandle,
    state: &AppState,
    approval: &ApprovalRecord,
    run_id: &str,
    decision: ApprovalDecision,
) -> Result<(), AppError> {
    let task_session_id = state
        .db
        .load_entity::<TaskRecord>(EntityTable::Tasks, &approval.task_id)?
        .map(|task| task.session_id)
        .unwrap_or_else(|| approval.task_id.clone());
    let ts = adl_types::now_ms();
    let seq = adl_agent_runtime::run_activity_seq::next_run_activity_seq(ts);
    let decision_str = match decision {
        ApprovalDecision::Approved => "approved",
        ApprovalDecision::Rejected => "rejected",
        ApprovalDecision::Timeout => "timeout",
    };
    let event = adl_types::DigitalLifeRunActivityEventV1::Approval {
        v: 1,
        run_id: run_id.to_string(),
        seq,
        ts,
        phase: "decided".into(),
        approval_id: approval.id.clone(),
        decision: Some(decision_str.into()),
        reason: approval.reason.clone(),
    };
    let payload = serde_json::json!({
        "phase": "decided",
        "approvalId": approval.id,
        "decision": decision_str,
        "reason": approval.reason
    });
    crate::commands::save_and_emit_run_activity(RunActivityContext {
        state,
        app,
        workspace_id: &approval.workspace_id,
        session_id: &task_session_id,
        run_id,
        event: &event,
        event_type: "approval",
        seq,
        ts,
        extra: payload,
    });
    Ok(())
}

/// 获取检查点预览
#[tauri::command]
pub async fn task_get_checkpoint_preview(
    app: tauri::AppHandle,
    checkpoint_id: String,
) -> Result<IpcResult<Option<CheckpointPayloadPreview>>, AppError> {
    let state = app.state::<AppState>();
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let preview = tokio::task::spawn_blocking(move || {
        adl_fs_ops::read_checkpoint_preview(&checkpoints_dir, &checkpoint_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(preview)))
}

/// 恢复检查点
#[tauri::command]
pub async fn task_restore_checkpoint(
    app: tauri::AppHandle,
    checkpoint_id: String,
) -> Result<IpcResult<TaskCenterSnapshot>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let current_workspace = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone();
    let snapshot = tokio::task::spawn_blocking(move || -> Result<TaskCenterSnapshot, AppError> {
        let _ = adl_fs_ops::restore_checkpoint_payload(&checkpoints_dir, &checkpoint_id)?;
        if let Some(checkpoint) =
            db.load_entity::<CheckpointRecord>(EntityTable::Checkpoints, &checkpoint_id)?
        {
            let _ = crate::commands::audit::save_audit_entry_with_db(
                &db,
                &checkpoint.workspace_id,
                Some(&checkpoint.session_id),
                "patch-rollback",
                adl_types::RiskLevel::Medium,
                format!("Restored checkpoint {}.", checkpoint.id),
                Some("approved"),
                Some(&checkpoint.description),
            );
        }
        snapshot_with_db(&db, current_workspace)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(snapshot)))
}

/// 可能执行已批准的命令（仅当任务包含 command.run 操作时）
async fn maybe_execute_approved_command(
    app: &tauri::AppHandle,
    state: &AppState,
    task: &mut TaskRecord,
) -> Result<(), AppError> {
    let Some(operation) = task.operations.first_mut() else {
        return Ok(());
    };
    if operation.kind != "command.run" {
        return Ok(());
    }
    let request: CommandRequest = deserialize_params(std::mem::take(&mut operation.params))?;
    let workspace = load_workspace_for_task(state, task)?;
    update_task_to_running(state, task)?;

    if let Some(run_id) = &request.run_id {
        emit_run_activity_start_event(app, state, &workspace, task, &request, run_id);
    }

    let result = run_approved_command(
        std::path::Path::new(&workspace.root_path),
        request.clone(),
        Some(120),
    )
    .await?;
    save_command_result(state, task, &workspace, &request, &result)?;

    if let Some(run_id) = &request.run_id {
        emit_run_activity_done_event(app, state, &workspace, task, &request, run_id, &result);
    }
    Ok(())
}

/// 反序列化命令请求
fn deserialize_params(params: serde_json::Value) -> Result<CommandRequest, AppError> {
    Ok(serde_json::from_value(params)?)
}

/// 为任务加载工作区
fn load_workspace_for_task(state: &AppState, task: &TaskRecord) -> Result<WorkspaceMeta, AppError> {
    state
        .db
        .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &task.workspace_id)?
        .or_else(|| state.current_workspace.read().ok()?.clone())
        .ok_or_else(|| AppError::NotFound(format!("workspace {}", task.workspace_id)))
}

/// 更新任务状态为运行中
fn update_task_to_running(state: &AppState, task: &mut TaskRecord) -> Result<(), AppError> {
    task.status = TaskStatus::Running;
    task.started_at = Some(adl_types::now_ms());
    task.updated_at = adl_types::now_ms();
    state.db.save_entity(
        EntityTable::Tasks,
        &task.id,
        Some(&task.workspace_id),
        Some(&task.session_id),
        Some("running"),
        task,
    )
}

/// 发射运行活动事件的辅助函数，用于统一处理 start 和 done 事件
fn emit_command_activity_event(
    app: &tauri::AppHandle,
    state: &AppState,
    workspace: &WorkspaceMeta,
    task: &TaskRecord,
    request: &CommandRequest,
    run_id: &str,
    phase: &str,
    exit_code: Option<i32>,
) {
    let ts = adl_types::now_ms();
    let seq = adl_agent_runtime::run_activity_seq::next_run_activity_seq(ts);
    let event = adl_types::DigitalLifeRunActivityEventV1::Command {
        v: 1,
        run_id: run_id.to_string(),
        seq,
        ts,
        phase: phase.into(),
        command: request.command.clone(),
        args: Some(request.args.clone()),
        exit_code,
    };

    let mut payload = serde_json::json!({
        "phase": phase,
        "command": request.command,
        "args": request.args,
    });

    if let Some(code) = exit_code {
        payload["exitCode"] = serde_json::json!(code);
    }

    crate::commands::save_and_emit_run_activity(RunActivityContext {
        state,
        app,
        workspace_id: &workspace.id,
        session_id: &task.session_id,
        run_id,
        event: &event,
        event_type: "command",
        seq,
        ts,
        extra: payload,
    });
}

/// 发射命令运行开始事件
fn emit_run_activity_start_event(
    app: &tauri::AppHandle,
    state: &AppState,
    workspace: &WorkspaceMeta,
    task: &TaskRecord,
    request: &CommandRequest,
    run_id: &str,
) {
    emit_command_activity_event(app, state, workspace, task, request, run_id, "start", None);
}

/// 发射命令运行完成事件
fn emit_run_activity_done_event(
    app: &tauri::AppHandle,
    state: &AppState,
    workspace: &WorkspaceMeta,
    task: &TaskRecord,
    request: &CommandRequest,
    run_id: &str,
    result: &CommandExecutionResult,
) {
    emit_command_activity_event(
        app,
        state,
        workspace,
        task,
        request,
        run_id,
        "done",
        result.exit_code,
    );
}

/// 保存命令执行结果
fn save_command_result(
    state: &AppState,
    task: &mut TaskRecord,
    workspace: &WorkspaceMeta,
    request: &CommandRequest,
    result: &CommandExecutionResult,
) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::CommandExecutions,
        &result.request.id,
        Some(&workspace.id),
        Some(&task.session_id),
        Some(if result.success { "completed" } else { "failed" }),
        result,
    )?;
    task.status = if result.success { TaskStatus::Completed } else { TaskStatus::Failed };
    task.result_json = Some(serde_json::to_string(result)?);
    task.completed_at = Some(adl_types::now_ms());
    task.updated_at = adl_types::now_ms();
    state.db.save_entity(
        EntityTable::Tasks,
        &task.id,
        Some(&task.workspace_id),
        Some(&task.session_id),
        Some(if result.success { "completed" } else { "failed" }),
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
        Some(&format!("command={} {}", request.command, request.args.join(" "))),
    );
    Ok(())
}

/// 获取任务中心快照
fn snapshot(state: &AppState) -> Result<TaskCenterSnapshot, AppError> {
    let tasks: Vec<TaskRecord> = state.db.list_entities(EntityTable::Tasks)?;
    let mut approvals: Vec<ApprovalRecord> = state.db.list_entities(EntityTable::Approvals)?;
    approvals.retain(|approval| approval.decision.is_none());
    let mut checkpoints: Vec<CheckpointRecord> =
        state.db.list_entities(EntityTable::Checkpoints)?;
    checkpoints.sort_by_key(|checkpoint| std::cmp::Reverse(checkpoint.created_at));
    let current_session = if let Some(workspace) = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone()
    {
        let conversation_sessions: Vec<adl_types::ConversationSessionRecord> =
            state.db.list_entities_by_workspace(EntityTable::Sessions, &workspace.id)?;
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
        pending_approvals: approvals.into_iter().map(|approval| approval.request).collect(),
        policy: adl_task::default_policy(),
        current_session,
        latest_checkpoint: checkpoints.into_iter().next(),
    })
}

/// 与 [`snapshot`] 相同，但接受 `&Database` 而非 `&AppState`，便于在 `spawn_blocking` 中调用
fn snapshot_with_db(
    db: &adl_storage::Database,
    current_workspace: Option<WorkspaceMeta>,
) -> Result<TaskCenterSnapshot, AppError> {
    let tasks: Vec<TaskRecord> = db.list_entities(EntityTable::Tasks)?;
    let mut approvals: Vec<ApprovalRecord> = db.list_entities(EntityTable::Approvals)?;
    approvals.retain(|approval| approval.decision.is_none());
    let mut checkpoints: Vec<CheckpointRecord> = db.list_entities(EntityTable::Checkpoints)?;
    checkpoints.sort_by_key(|checkpoint| std::cmp::Reverse(checkpoint.created_at));
    let current_session = if let Some(workspace) = current_workspace {
        let conversation_sessions: Vec<adl_types::ConversationSessionRecord> =
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
        pending_approvals: approvals.into_iter().map(|approval| approval.request).collect(),
        policy: adl_task::default_policy(),
        current_session,
        latest_checkpoint: checkpoints.into_iter().next(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_params_valid_json() {
        let params = serde_json::json!({
            "id": "cmd-1",
            "workspaceId": "ws-1",
            "runId": null,
            "profile": "custom",
            "command": "echo hello",
            "args": [],
            "shell": false,
            "riskLevel": "low",
            "createdAt": 0
        });
        let result = deserialize_params(params).unwrap();
        assert_eq!(result.id, "cmd-1");
        assert_eq!(result.command, "echo hello");
    }

    #[test]
    fn deserialize_params_missing_field() {
        let params = serde_json::json!({ "id": "cmd-2" });
        let result = deserialize_params(params);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::Internal(_)));
    }

    #[test]
    fn deserialize_params_empty_object() {
        let params = serde_json::json!({});
        let result = deserialize_params(params);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::Internal(_)));
    }

    #[test]
    fn deserialize_params_consumes_value() {
        let mut params = serde_json::json!({"id":"cmd-3","workspaceId":"ws-1","runId":null,"profile":"custom","command":"ls","args":[],"shell":false,"riskLevel":"low","createdAt":0});
        let _ = deserialize_params(std::mem::take(&mut params));
        assert_eq!(params, serde_json::Value::Null);
    }
}
