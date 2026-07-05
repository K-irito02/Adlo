use crate::commands::ipc;
use crate::error::CommandError;
use adl_errors::AppError;
use adl_kernel::IpcResult;
use adl_kernel::{create_id, now_ms};
use adl_subagent::{
    SubagentId, SubagentManager, SubagentStatus, SubagentTask, TaskToolInput, TaskToolOutput,
};
use std::sync::OnceLock;

/// Global sub-agent manager instance (shared across all commands).
static SUBAGENT_MANAGER: OnceLock<SubagentManager> = OnceLock::new();

fn subagent_manager() -> &'static SubagentManager {
    SUBAGENT_MANAGER.get_or_init(SubagentManager::new)
}

#[tauri::command]
pub async fn spawn_subagent(
    input: TaskToolInput,
) -> Result<IpcResult<TaskToolOutput>, CommandError> {
    Ok(ipc(spawn_subagent_inner(input).await))
}

async fn spawn_subagent_inner(input: TaskToolInput) -> Result<TaskToolOutput, AppError> {
    let task_id = input.task_id.as_deref().map(SubagentId::from_str).unwrap_or_default();

    let task = SubagentTask {
        id: task_id.clone(),
        parent_session_id: String::new(),
        child_session_id: create_id("sess"),
        subagent_type: input.subagent_type.clone(),
        prompt: input.prompt.clone(),
        background: input.background,
        status: SubagentStatus::Pending,
        created_at: now_ms(),
        completed_at: None,
    };

    let manager = subagent_manager();
    manager.register(task).await;

    if input.background {
        let manager_clone = manager.clone();
        let task_id_clone = task_id.clone();
        let subagent_type = input.subagent_type.clone();
        let prompt = input.prompt.clone();
        tokio::spawn(async move {
            manager_clone.update_status(&task_id_clone, SubagentStatus::Running).await;
            tracing::info!("Background subagent {} running for: {}", subagent_type, prompt);
            manager_clone.update_status(&task_id_clone, SubagentStatus::Completed).await;
        });

        return Ok(TaskToolOutput {
            task_id: task_id.as_str().to_string(),
            state: "running".to_string(),
            summary: format!("Subagent {} spawned in background", input.subagent_type),
            result: None,
            error: None,
        });
    }

    manager.update_status(&task_id, SubagentStatus::Running).await;
    manager.update_status(&task_id, SubagentStatus::Completed).await;

    Ok(TaskToolOutput {
        task_id: task_id.as_str().to_string(),
        state: "completed".to_string(),
        summary: format!("Subagent {} completed", input.subagent_type),
        result: Some(format!("Processed: {}", input.description)),
        error: None,
    })
}

#[tauri::command]
pub async fn get_subagent_task(
    task_id: String,
) -> Result<IpcResult<Option<SubagentTask>>, CommandError> {
    Ok(ipc(get_subagent_task_inner(task_id).await))
}

async fn get_subagent_task_inner(task_id: String) -> Result<Option<SubagentTask>, AppError> {
    let id = SubagentId::from_str(&task_id);
    Ok(subagent_manager().get(&id).await)
}

#[tauri::command]
pub async fn list_active_subagents(
    _workspace_id: String,
) -> Result<IpcResult<Vec<SubagentTask>>, CommandError> {
    Ok(ipc(list_active_subagents_inner().await))
}

async fn list_active_subagents_inner() -> Result<Vec<SubagentTask>, AppError> {
    Ok(subagent_manager().list_active().await)
}

#[tauri::command]
pub async fn cancel_subagent(task_id: String) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(cancel_subagent_inner(task_id).await))
}

async fn cancel_subagent_inner(task_id: String) -> Result<bool, AppError> {
    let id = SubagentId::from_str(&task_id);
    subagent_manager().update_status(&id, SubagentStatus::Aborted).await;
    Ok(true)
}
