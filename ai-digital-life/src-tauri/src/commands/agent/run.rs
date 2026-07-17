use crate::commands::agent_pipeline;
use crate::commands::ipc;
use crate::commands::{CallModelContext, FinalizeRunContext};
use crate::error::CommandError;
use crate::state::AppState;
use adl_agent_runtime::router;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::agent::AgentConfig;
use adl_types::{
    now_ms, AgentRunDetail, AgentRunStatus, AuditBatchEntry, ConversationScenario,
    ConversationSendResult, IpcResult,
};
use tauri::{Emitter, Manager};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunInput {
    pub session_id: String,
    pub prompt: String,
    pub scenario: Option<ConversationScenario>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

#[tauri::command]
pub async fn agent_start_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: StartRunInput,
) -> Result<IpcResult<ConversationSendResult>, CommandError> {
    Ok(ipc(start_run_inner(&app, &state, input).await))
}

#[tauri::command]
pub async fn agent_get_run(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || {
        let run = db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?;
        let Some(run) = run else {
            return Ok(None);
        };
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
        steps.sort_by_key(|step| step.created_at);
        Ok::<_, AppError>(Some(AgentRunDetail { run, steps }))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}

#[tauri::command]
pub async fn agent_retry_run(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || {
        let run = db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?;
        let Some(run) = run else {
            return Ok(None);
        };
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
        steps.sort_by_key(|step| step.created_at);
        let mut detail = AgentRunDetail { run, steps };
        detail.run.status = AgentRunStatus::Ready;
        detail.run.updated_at = now_ms();
        crate::commands::agent::save_run_detail_with_db(&db, &detail)?;
        Ok::<_, AppError>(Some(detail))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}

#[tauri::command]
pub async fn agent_abort_run(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || {
        let run = db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?;
        let Some(run) = run else {
            return Ok(None);
        };
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
        steps.sort_by_key(|step| step.created_at);
        let detail = AgentRunDetail { run, steps };
        let detail = adl_agent_runtime::abort_run(detail);
        crate::commands::agent::save_run_detail_with_db(&db, &detail)?;
        Ok::<_, AppError>(Some(detail))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}

async fn start_run_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    input: StartRunInput,
) -> Result<ConversationSendResult, AppError> {
    let mut session = crate::commands::conversation::require_session(state, &input.session_id)?;
    let workspace = crate::commands::workspace::current_workspace(state)
        .unwrap_or_else(|_| crate::commands::workspace::virtual_global_workspace());
    let workspace_scope_id = session.workspace_id.clone();
    let session_id = session.id.clone();

    // === Plan Mode 集成：检查状态并强制使用 Plan scenario ===
    let plan_mode_active = crate::commands::agent::is_plan_mode_active(&workspace_scope_id);
    let scenario = if plan_mode_active {
        ConversationScenario::Plan
    } else {
        input.scenario.unwrap_or(ConversationScenario::CodeEdit)
    };
    let mut detail =
        adl_agent_runtime::create_run(&workspace_scope_id, &session.id, &input.prompt, scenario);

    // === Plan Mode 集成：注入 system prompt 到 run detail ===
    if plan_mode_active {
        if let Some(plan_file) = crate::commands::agent::get_plan_file_path(&workspace_scope_id) {
            let plan_exists = std::path::Path::new(&plan_file).exists();
            let plan_prompt = adl_agent_runtime::plan_mode::plan_mode_system_prompt(
                &plan_file.to_string_lossy(),
                plan_exists,
            );
            detail = adl_agent_runtime::inject_plan_mode_prompt(detail, &plan_prompt);
        }
    }

    // Register durable session for crash recovery
    state.durable_manager.register_session(&session.id, &detail.run.id).await?;

    let emit_activity =
        crate::commands::agent::make_activity_emitter(app, state, &workspace_scope_id, &session_id, &detail.run.id);
    let mut audit_batch: Vec<AuditBatchEntry> = Vec::with_capacity(5);
    let user_message = agent_pipeline::prepare_run(
        state,
        &session,
        &input,
        scenario,
        &detail,
        &emit_activity,
        &mut audit_batch,
    )?;
    let context = agent_pipeline::collect_context(
        &workspace,
        &input,
        &detail,
        &workspace_scope_id,
        &session_id,
        &emit_activity,
        &mut audit_batch,
    )?;
    let (model_response, _model_audit) = agent_pipeline::call_model(CallModelContext {
        state,
        workspace: &workspace,
        session: &session,
        scenario,
        context,
        detail: &detail,
        input: &input,
        app,
        emit_activity: &emit_activity,
        audit_batch: &mut audit_batch,
        provider_id: input.provider_id.clone(),
        model_id: input.model_id.clone(),
    })
    .await?;
    let patch_set = agent_pipeline::generate_patches(
        &workspace,
        &input,
        scenario,
        &mut detail,
        state,
        &session,
        &emit_activity,
    )?;
    let result = agent_pipeline::finalize_run(FinalizeRunContext {
        state,
        workspace: &workspace,
        session: &mut session,
        detail,
        model_response: &model_response,
        patch_set: patch_set.as_ref(),
        scenario,
        user_message,
        emit_activity: &emit_activity,
        audit_batch: &mut audit_batch,
    })
    .await?;
    crate::commands::audit::batch_save_audit_entries(state, audit_batch)?;

    Ok(result)
}
