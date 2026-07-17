use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    ApprovalRecord, AuditEntry, CheckpointPayloadPreview, CheckpointRecord,
    ConversationSessionRecord, IpcResult, TaskCenterSnapshot, TaskRecord, WorkspaceMeta,
};
use tauri::Manager;

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

pub(super) fn snapshot(state: &AppState) -> Result<TaskCenterSnapshot, AppError> {
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
        let conversation_sessions: Vec<ConversationSessionRecord> =
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
