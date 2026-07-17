use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{ConversationSendResult, IpcResult};
use tauri::Manager;

#[tauri::command]
pub async fn conversation_send_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: super::SendMessageInput,
) -> Result<IpcResult<ConversationSendResult>, CommandError> {
    crate::commands::agent::agent_start_run(
        app,
        state,
        crate::commands::agent::StartRunInput {
            session_id: input.session_id,
            prompt: input.content,
            scenario: input.scenario,
            provider_id: input.provider_id,
            model_id: input.model_id,
        },
    )
    .await
}

#[tauri::command]
pub async fn conversation_cancel_message(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<adl_types::AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(
        move || -> Result<Option<adl_types::AgentRunDetail>, AppError> {
            let Some(run) =
                db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?
            else {
                return Ok(None);
            };
            let mut steps: Vec<adl_types::AgentPlanStep> =
                db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
            steps.sort_by_key(|step| step.created_at);
            let detail = adl_types::AgentRunDetail { run, steps };
            let detail = adl_agent_runtime::abort_run(detail);
            crate::commands::agent::save_run_detail_with_db(&db, &detail)?;
            Ok(Some(detail))
        },
    )
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}
