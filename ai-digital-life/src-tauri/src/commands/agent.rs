use crate::commands::agent_pipeline;
use crate::commands::audit::AuditBatchEntry;
use crate::commands::ipc;
use crate::commands::{CallModelContext, FinalizeRunContext};
use crate::error::CommandError;
use crate::state::AppState;
use adl_agent_runtime::plan_mode::PlanModeState;
use adl_agent_runtime::registry::AgentRegistry;
use adl_agent_runtime::router;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::agent::AgentConfig;
use adl_types::{
    create_id, now_ms, AgentRunDetail, AgentRunStatus, ConversationScenario,
    ConversationSendResult, DigitalLifeRunActivityEventV1, IpcResult,
};
use std::path::PathBuf;
use std::sync::Mutex;
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
        detail.run.updated_at = adl_types::now_ms();
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
    workspace_scope_id: &str,
    session_id: &str,
    run_id: &str,
) -> impl Fn(serde_json::Value) + 'a {
    let workspace_scope_id = workspace_scope_id.to_string();
    let session_id = session_id.to_string();
    let run_id = run_id.to_string();
    move |event: serde_json::Value| {
        let ts = now_ms();
        let seq = adl_agent_runtime::run_activity_seq::next_run_activity_seq(ts);
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
            },
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

    // === Plan Mode 集成：检查状态并强制使用 Plan scenario ===
    let plan_mode_active = is_plan_mode_active(&workspace_scope_id);
    let scenario = if plan_mode_active {
        ConversationScenario::Plan
    } else {
        input.scenario.unwrap_or(ConversationScenario::CodeEdit)
    };
    let mut detail =
        adl_agent_runtime::create_run(&workspace_scope_id, &session.id, &input.prompt, scenario);

    // === Plan Mode 集成：注入 system prompt 到 run detail ===
    if plan_mode_active {
        if let Some(plan_file) = get_plan_file_path(&workspace_scope_id) {
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
        make_activity_emitter(app, state, &workspace_scope_id, &session_id, &detail.run.id);
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

/// Returns `true` if Plan Mode is currently active for the given workspace.
fn is_plan_mode_active(workspace_id: &str) -> bool {
    let mutex = plan_mode_states();
    let states = mutex.lock().unwrap_or_else(|e| e.into_inner());
    states.get(workspace_id).map(|s| s.is_active()).unwrap_or(false)
}

/// Returns the plan file path configured for the active Plan Mode session in
/// the given workspace, if any.
fn get_plan_file_path(workspace_id: &str) -> Option<std::path::PathBuf> {
    let mutex = plan_mode_states();
    let states = mutex.lock().unwrap_or_else(|e| e.into_inner());
    states.get(workspace_id).and_then(|s| s.plan_file.clone())
}

pub fn load_run_detail(state: &AppState, run_id: &str) -> Result<Option<AgentRunDetail>, AppError> {
    let Some(run) =
        state.db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
    else {
        return Ok(None);
    };
    let mut steps: Vec<adl_types::AgentPlanStep> =
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

/// Global plan mode state per workspace (keyed by workspace_id).
static PLAN_MODE_STATES: std::sync::OnceLock<
    Mutex<std::collections::HashMap<String, PlanModeState>>,
> = std::sync::OnceLock::new();

fn plan_mode_states() -> &'static Mutex<std::collections::HashMap<String, PlanModeState>> {
    PLAN_MODE_STATES.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

#[tauri::command]
pub async fn list_agents() -> Result<IpcResult<Vec<AgentConfig>>, AppError> {
    Ok(ipc(list_agents_inner()))
}

fn list_agents_inner() -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let registry = AgentRegistry::new();
    Ok(registry.list_primary().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn select_agent(
    scenario: String,
    user_prompt: String,
) -> Result<IpcResult<AgentConfig>, AppError> {
    Ok(ipc(select_agent_inner(&scenario, &user_prompt)))
}

fn select_agent_inner(
    scenario: &str,
    user_prompt: &str,
) -> Result<AgentConfig, adl_errors::AppError> {
    let conv_scenario = match scenario {
        "plan" => ConversationScenario::Plan,
        "code_edit" => ConversationScenario::CodeEdit,
        _ => ConversationScenario::Chat,
    };
    let agent_id = router::select(conv_scenario, user_prompt);
    let registry = AgentRegistry::new();
    registry
        .get(agent_id)
        .cloned()
        .ok_or_else(|| adl_errors::AppError::Internal(format!("agent {:?} not found", agent_id)))
}

#[tauri::command]
pub async fn enter_plan_mode(
    workspace_id: String,
    workspace_root: String,
) -> Result<IpcResult<String>, AppError> {
    Ok(ipc({
        let mutex = plan_mode_states();
        let mut states = mutex.lock().unwrap_or_else(|e| e.into_inner());
        let state = states.entry(workspace_id).or_default();
        let path = state.enter(&PathBuf::from(workspace_root));
        Ok(path.to_string_lossy().to_string())
    }))
}

#[tauri::command]
pub async fn exit_plan_mode(workspace_id: String) -> Result<IpcResult<Option<String>>, AppError> {
    Ok(ipc({
        let mutex = plan_mode_states();
        let mut states = mutex.lock().unwrap_or_else(|e| e.into_inner());
        let state = states.entry(workspace_id).or_default();
        Ok(state.exit().map(|p| p.to_string_lossy().to_string()))
    }))
}

#[tauri::command]
pub async fn get_plan_mode_state(workspace_id: String) -> Result<IpcResult<bool>, AppError> {
    Ok(ipc({
        let mutex = plan_mode_states();
        let states = mutex.lock().unwrap_or_else(|e| e.into_inner());
        Ok(states.get(&workspace_id).map(|s| s.is_active()).unwrap_or(false))
    }))
}

#[cfg(test)]
mod multi_agent_tests {
    use super::*;

    #[test]
    fn list_agents_returns_built_in() {
        let result = list_agents_inner();
        assert!(result.is_ok());
        let agents = result.unwrap();
        let names: Vec<&str> = agents.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"plan"));
    }

    #[test]
    fn select_agent_for_plan_scenario() {
        let result = select_agent_inner("plan", "analyze auth");
        assert!(result.is_ok());
        let agent = result.unwrap();
        assert_eq!(agent.id, adl_types::types::agent::AgentId::Plan);
    }
}
