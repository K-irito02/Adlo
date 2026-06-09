use crate::commands::agent_pipeline;
use crate::commands::audit::AuditBatchEntry;
use crate::commands::ipc;
use crate::commands::{CallModelContext, FinalizeRunContext};
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    create_id, now_ms, AgentRunDetail, AgentRunStatus, ConversationScenario,
    ConversationSendResult, DigitalLifeRunActivityEventV1, IpcResult,
};
use adl_storage::EntityTable;
use tauri::Emitter;

const RUN_ACTIVITY_EVENT: &str = "digital-life://run-activity";

fn emit_run_activity(app: &tauri::AppHandle, payload: serde_json::Value) {
    let _ = app.emit(RUN_ACTIVITY_EVENT, payload);
}

fn persist_run_activity(
    state: &AppState,
    workspace_id: &str,
    session_id: &str,
    run_id: &str,
    event: &DigitalLifeRunActivityEventV1,
) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::RunActivityEvents,
        &create_id("runact"),
        Some(workspace_id),
        Some(session_id),
        Some(run_id),
        event,
    )
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunInput {
    pub session_id: String,
    pub prompt: String,
    pub scenario: Option<ConversationScenario>,
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
pub fn agent_get_run(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> IpcResult<Option<AgentRunDetail>> {
    ipc(load_run_detail(&state, &run_id))
}

#[tauri::command]
pub fn agent_retry_run(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> IpcResult<Option<AgentRunDetail>> {
    crate::commands::ipc_try(|| {
        let Some(mut detail) = load_run_detail(&state, &run_id)? else {
            return Ok(None);
        };
        detail.run.status = AgentRunStatus::Ready;
        detail.run.updated_at = adl_kernel::now_ms();
        save_run_detail(&state, &detail)?;
        Ok(Some(detail))
    })
}

#[tauri::command]
pub fn agent_abort_run(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> IpcResult<Option<AgentRunDetail>> {
    crate::commands::ipc_try(|| {
        let Some(detail) = load_run_detail(&state, &run_id)? else {
            return Ok(None);
        };
        let detail = adl_agent_runtime::abort_run(detail);
        save_run_detail(&state, &detail)?;
        Ok(Some(detail))
    })
}

fn make_activity_emitter<'a>(
    app: &'a tauri::AppHandle,
    state: &'a AppState,
    workspace_scope_id: String,
    session_id: String,
    run_id: String,
) -> impl Fn(serde_json::Value) + 'a {
    move |event: serde_json::Value| {
        let ts = now_ms();
        let seq = crate::run_activity_seq::next_run_activity_seq(ts);
        let payload = match event {
            serde_json::Value::Object(mut obj) => {
                let event_type = obj
                    .remove("type")
                    .and_then(|v| match v {
                        serde_json::Value::String(s) => Some(s),
                        _ => None,
                    })
                    .unwrap_or_else(|| "error".into());
                adl_kernel::events::run_activity_event(
                    &run_id,
                    seq,
                    ts,
                    &event_type,
                    serde_json::Value::Object(obj),
                )
            }
            other => adl_kernel::events::run_activity_event(
                &run_id,
                seq,
                ts,
                "error",
                serde_json::json!({
                    "message": format!("Invalid run-activity payload: {other:?}")
                }),
            ),
        };
        if let Ok(typed) = serde_json::from_value::<DigitalLifeRunActivityEventV1>(payload.clone())
        {
            let _ = persist_run_activity(state, &workspace_scope_id, &session_id, &run_id, &typed);
        }
        emit_run_activity(app, payload);
    }
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
    let scenario = input.scenario.unwrap_or(ConversationScenario::CodeEdit);
    let mut detail =
        adl_agent_runtime::create_run(&workspace_scope_id, &session.id, &input.prompt, scenario);

    let emit_activity = make_activity_emitter(
        app,
        state,
        workspace_scope_id.clone(),
        session_id.clone(),
        detail.run.id.clone(),
    );
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
    let (model_response, _model_audit) = agent_pipeline::call_model(
        CallModelContext {
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
        },
    )
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
    let result = agent_pipeline::finalize_run(
        FinalizeRunContext {
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
        },
    )?;
    crate::commands::audit::batch_save_audit_entries(state, audit_batch)?;

    Ok(result)
}

pub fn load_run_detail(state: &AppState, run_id: &str) -> Result<Option<AgentRunDetail>, AppError> {
    let Some(run) =
        state.db.load_entity::<adl_kernel::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
    else {
        return Ok(None);
    };
    let mut steps: Vec<adl_kernel::AgentPlanStep> =
        state.db.list_entities(EntityTable::AgentSteps)?;
    steps.retain(|step| step.run_id == run_id);
    steps.sort_by_key(|step| step.created_at);
    Ok(Some(AgentRunDetail { run, steps }))
}

pub fn save_run_detail(state: &AppState, detail: &AgentRunDetail) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::AgentRuns,
        &detail.run.id,
        Some(&detail.run.workspace_id),
        Some(&detail.run.session_id),
        Some(match detail.run.status {
            AgentRunStatus::Draft => "draft",
            AgentRunStatus::Planning => "planning",
            AgentRunStatus::Ready => "ready",
            AgentRunStatus::Executing => "executing",
            AgentRunStatus::WaitingApproval => "waiting-approval",
            AgentRunStatus::Applying => "applying",
            AgentRunStatus::Verifying => "verifying",
            AgentRunStatus::Succeeded => "succeeded",
            AgentRunStatus::Failed => "failed",
            AgentRunStatus::RolledBack => "rolled-back",
            AgentRunStatus::Aborted => "aborted",
        }),
        &detail.run,
    )?;
    for step in &detail.steps {
        state.db.save_entity(
            EntityTable::AgentSteps,
            &step.id,
            Some(&detail.run.workspace_id),
            Some(&detail.run.session_id),
            Some(&step.status),
            step,
        )?;
    }
    Ok(())
}
