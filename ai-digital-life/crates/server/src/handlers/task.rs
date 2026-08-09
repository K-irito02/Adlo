//! Task-center / approval domain HTTP handlers — migrated from
//! `src-tauri/src/commands/task/{approval,snapshot}.rs` (`task_*` tauri
//! commands). The task center is a snapshot over `Tasks` / `Approvals` /
//! `Checkpoints` plus the active workspace's current session; the approval
//! decide flow persists the decision, executes approved `command.run` tasks via
//! `adl_command::run_approved_command`, writes an audit entry and returns a
//! fresh snapshot.
//!
//! Emit mapping: the Tauri `task_decide_approval` emitted legacy
//! `digital-life://run-activity` UI events (`approval`/`command` phases) on
//! approval, command start and command done. None has a `SessionPartEvent`
//! equivalent on the SSE bridge, so each is `tracing::warn` + report here (not
//! silently dropped). The audit helper is inlined (same as the command / patch
//! domains — the audit domain migrates in a later batch).

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_command::run_approved_command;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    ApprovalDecision, ApprovalRecord, ApprovalRequestSummary, AuditEntry, CheckpointPayloadPreview,
    CheckpointRecord, CommandRequest, ConversationSessionRecord, RiskLevel, TaskCenterSnapshot,
    TaskRecord, TaskStatus, WorkspaceMeta, create_id, now_ms,
};
use axum::extract::State;
use axum::response::IntoResponse;

/// Approval-decision input (mirror of the Tauri `ApprovalDecisionInput`).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalDecisionInput {
    approval_id: String,
    decision: ApprovalDecision,
    reason: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckpointIdBody {
    checkpoint_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditEntriesBody {
    #[serde(default)]
    limit: Option<usize>,
}

/// POST `/task/pending-approvals` — the pending approvals (covers
/// `TaskBridge.listPendingApprovals`).
pub async fn list_pending_approvals(State(state): State<ServerState>) -> impl IntoResponse {
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let approvals: Vec<ApprovalRecord> =
            db.list_entities_by_status(EntityTable::Approvals, "pending")?;
        let summaries: Vec<ApprovalRequestSummary> =
            approvals.into_iter().map(|approval| approval.request).collect();
        Ok(serde_json::to_value(summaries)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/task/decide-approval` — apply an approval decision and return the
/// updated task-center snapshot (covers `TaskBridge.decideApproval`).
pub async fn decide_approval(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ApprovalDecisionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = decide_approval_inner(&state, input).await;
    to_value_response(result)
}

async fn decide_approval_inner(
    state: &ServerState,
    input: ApprovalDecisionInput,
) -> Result<TaskCenterSnapshot, AppError> {
    // Phase 1 (blocking): load the approval, persist the decision, update the
    // linked task's status.
    let db = state.db.clone();
    let approval_id = input.approval_id.clone();
    let decision = input.decision;
    let reason = input.reason.clone();
    let task_after_decide =
        agent_loop::run_blocking(move || -> Result<Option<TaskRecord>, AppError> {
            let mut approval: ApprovalRecord = db
                .load_entity(EntityTable::Approvals, &approval_id)?
                .ok_or_else(|| AppError::NotFound(format!("approval {}", approval_id)))?;
            save_approval_decision_with_db(&db, &mut approval, decision, reason)?;
            let Some(mut task) =
                db.load_entity::<TaskRecord>(EntityTable::Tasks, &approval.task_id)?
            else {
                return Ok(None);
            };
            task.status = match decision {
                ApprovalDecision::Approved => TaskStatus::Approved,
                ApprovalDecision::Rejected => TaskStatus::Rejected,
                ApprovalDecision::Timeout => TaskStatus::Failed,
            };
            task.updated_at = now_ms();
            db.save_entity(
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
            Ok(Some(task))
        })
        .await?;

    // Phase 2 (async): execute the approved command.run task when present.
    if matches!(input.decision, ApprovalDecision::Approved) {
        if let Some(mut task) = task_after_decide {
            maybe_execute_approved_command(state, &mut task).await?;
        }
    }

    // Phase 3 (blocking): audit the decision, then build the snapshot.
    let decision_str = match input.decision {
        ApprovalDecision::Approved => "approved",
        ApprovalDecision::Rejected => "rejected",
        ApprovalDecision::Timeout => "rejected",
    };
    let db = state.db.clone();
    let approval_id_for_audit = input.approval_id.clone();
    let decision_str_for_audit = decision_str.to_string();
    let reason_for_audit = input.reason.clone();
    agent_loop::run_blocking(move || -> Result<(), AppError> {
        let approval = db
            .load_entity::<ApprovalRecord>(EntityTable::Approvals, &approval_id_for_audit)?
            .ok_or_else(|| AppError::NotFound(format!("approval {}", approval_id_for_audit)))?;
        if let Err(e) = save_audit_entry_with_db(
            &db,
            &approval.workspace_id,
            Some("approval"),
            "approval",
            approval.risk_level,
            format!("Approval {} was {}.", approval.request.title, decision_str_for_audit),
            Some(&decision_str_for_audit),
            reason_for_audit.as_deref(),
        ) {
            tracing::warn!(error = %e, "failed to save approval audit entry");
        }
        Ok(())
    })
    .await?;

    // Legacy run-activity "approval.decided" UI emit → warn + report.
    tracing::warn!(
        approval_id = %input.approval_id,
        decision = decision_str,
        "task_decide_approval: legacy 'digital-life://run-activity' (approval.decided) UI emit has \
         no SSE equivalent; the S1 bridge must surface decisions via the task-center snapshot"
    );

    snapshot_with_state(state).await
}

/// Execute an approved command.run task (faithful port of the Tauri
/// `maybe_execute_approved_command`, minus the Tauri run-activity emits).
async fn maybe_execute_approved_command(
    state: &ServerState,
    task: &mut TaskRecord,
) -> Result<(), AppError> {
    let Some(operation) = task.operations.first_mut() else {
        return Ok(());
    };
    if operation.kind != "command.run" {
        return Ok(());
    }
    let request: CommandRequest = serde_json::from_value(std::mem::take(&mut operation.params))?;
    let workspace_id = task.workspace_id.clone();

    // Blocking: load the workspace + set the task running.
    let db = state.db.clone();
    let current = state.current_workspace.clone();
    let task_snapshot = task.clone();
    let workspace = agent_loop::run_blocking(move || -> Result<WorkspaceMeta, AppError> {
        let workspace = load_workspace_for_task_with_db(&db, current, &workspace_id)?;
        let mut t = task_snapshot;
        t.status = TaskStatus::Running;
        t.started_at = Some(now_ms());
        t.updated_at = now_ms();
        db.save_entity(
            EntityTable::Tasks,
            &t.id,
            Some(&t.workspace_id),
            Some(&t.session_id),
            Some("running"),
            &t,
        )?;
        Ok(workspace)
    })
    .await?;
    task.status = TaskStatus::Running;
    task.started_at = Some(now_ms());
    task.updated_at = now_ms();

    if let Some(run_id) = &request.run_id {
        tracing::warn!(
            run_id = %run_id,
            command = %request.command,
            "task_decide_approval: legacy 'digital-life://run-activity' (command.start) UI emit has \
             no SSE equivalent; the S1 bridge must surface command runs via the task-center snapshot"
        );
    }

    let result = run_approved_command(
        std::path::Path::new(&workspace.root_path),
        request.clone(),
        Some(120),
    )
    .await?;

    // Blocking: persist the command execution result + task completion + audit.
    let db = state.db.clone();
    let workspace_id_for_save = workspace.id.clone();
    let task_for_save = task.clone();
    let request_for_save = request.clone();
    let result_for_save = result.clone();
    let updated_task = agent_loop::run_blocking(move || -> Result<TaskRecord, AppError> {
        db.save_entity(
            EntityTable::CommandExecutions,
            &result_for_save.request.id,
            Some(&workspace_id_for_save),
            Some(&task_for_save.session_id),
            Some(if result_for_save.success { "completed" } else { "failed" }),
            &result_for_save,
        )?;
        let mut t = task_for_save;
        t.status = if result_for_save.success { TaskStatus::Completed } else { TaskStatus::Failed };
        t.result_json = Some(serde_json::to_string(&result_for_save)?);
        t.completed_at = Some(now_ms());
        t.updated_at = now_ms();
        db.save_entity(
            EntityTable::Tasks,
            &t.id,
            Some(&t.workspace_id),
            Some(&t.session_id),
            Some(if t.status == TaskStatus::Completed { "completed" } else { "failed" }),
            &t,
        )?;
        if let Err(e) = save_audit_entry_with_db(
            &db,
            &workspace_id_for_save,
            Some(&t.session_id),
            "command",
            request_for_save.risk_level,
            result_for_save.summary.clone(),
            Some("approved"),
            Some(&format!(
                "command={} {}",
                request_for_save.command,
                request_for_save.args.join(" ")
            )),
        ) {
            tracing::warn!(error = %e, "failed to save command audit entry");
        }
        Ok(t)
    })
    .await?;
    *task = updated_task;

    if let Some(run_id) = &request.run_id {
        tracing::warn!(
            run_id = %run_id,
            exit_code = result.exit_code,
            "task_decide_approval: legacy 'digital-life://run-activity' (command.done) UI emit has \
             no SSE equivalent; the S1 bridge must surface command runs via the task-center snapshot"
        );
    }
    Ok(())
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

/// POST `/task/audit-entries` — most recent audit entries, default limit 50
/// (covers `TaskBridge.listAuditEntries`).
pub async fn list_audit_entries(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: AuditEntriesBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let limit = input.limit.unwrap_or(50);
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let entries: Vec<AuditEntry> =
            db.list_entities_with_limit(EntityTable::AuditRecords, limit)?;
        Ok(serde_json::to_value(entries)?)
    })
    .await;
    ipc::to_response(result)
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
        if let Some(checkpoint) =
            db.load_entity::<CheckpointRecord>(EntityTable::Checkpoints, &checkpoint_id)?
        {
            if let Err(e) = save_audit_entry_with_db(
                &db,
                &checkpoint.workspace_id,
                Some(&checkpoint.session_id),
                "patch-rollback",
                RiskLevel::Medium,
                format!("Restored checkpoint {}.", checkpoint.id),
                Some("approved"),
                Some(&checkpoint.description),
            ) {
                tracing::warn!(error = %e, "failed to save checkpoint-restore audit entry");
            }
        }
        snapshot_with_db(&db, current_workspace)
    })
    .await
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (faithful ports of the Tauri task/snapshot.rs + approval.rs helpers)
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

fn save_approval_decision_with_db(
    db: &adl_storage::Database,
    approval: &mut ApprovalRecord,
    decision: ApprovalDecision,
    reason: Option<String>,
) -> Result<(), AppError> {
    approval.decision = Some(decision);
    approval.reason = reason;
    approval.decided_at = Some(now_ms());
    db.save_entity(
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

fn load_workspace_for_task_with_db(
    db: &adl_storage::Database,
    current: std::sync::Arc<std::sync::RwLock<Option<WorkspaceMeta>>>,
    workspace_id: &str,
) -> Result<WorkspaceMeta, AppError> {
    db.load_entity::<WorkspaceMeta>(EntityTable::Workspaces, workspace_id)?
        .or_else(|| current.read().ok()?.clone())
        .ok_or_else(|| AppError::NotFound(format!("workspace {}", workspace_id)))
}

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
        pending_approvals: approvals.into_iter().map(|approval| approval.request).collect(),
        policy: adl_task::default_policy(),
        current_session,
        latest_checkpoint: checkpoints.into_iter().next(),
    })
}

/// Save an audit entry via `&Database` (faithful port of the audit domain's
/// `save_audit_entry_with_db`, inlined — same as the command / patch domains).
fn save_audit_entry_with_db(
    db: &adl_storage::Database,
    workspace_id: &str,
    session_id: Option<&str>,
    operation_type: &str,
    risk_level: RiskLevel,
    summary: impl Into<String>,
    decision: Option<&str>,
    detail: Option<&str>,
) -> Result<AuditEntry, AppError> {
    let entry = AuditEntry {
        id: create_id("audit"),
        timestamp: now_ms(),
        operation_type: operation_type.to_string(),
        summary: summary.into(),
        risk_level,
        decision: decision.map(str::to_string),
        detail: detail.map(str::to_string),
    };
    db.save_entity(
        EntityTable::AuditRecords,
        &entry.id,
        Some(workspace_id),
        session_id,
        Some(operation_type),
        &entry,
    )?;
    Ok(entry)
}
