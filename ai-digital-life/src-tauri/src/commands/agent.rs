use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    AgentRunDetail, AgentRunStatus, ConversationRole, ConversationScenario, ConversationSendResult,
    IpcResult,
};
use adl_storage::EntityTable;
use tauri::Emitter;

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

async fn start_run_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    input: StartRunInput,
) -> Result<ConversationSendResult, AppError> {
    let workspace = crate::commands::workspace::current_workspace(state)?;
    let mut session = crate::commands::conversation::require_session(state, &input.session_id)?;
    let scenario = input.scenario.unwrap_or(ConversationScenario::CodeEdit);
    let mut detail =
        adl_agent_runtime::create_run(&workspace.id, &session.id, &input.prompt, scenario);
    let user_message = adl_conversation::create_message(
        &session.id,
        ConversationRole::User,
        input.prompt.clone(),
        vec![],
        Some(detail.run.id.clone()),
    );
    crate::commands::conversation::save_message(state, &workspace.id, &user_message)?;

    let context = vec![adl_context_engine::workspace_context(&workspace)];
    let messages =
        adl_agent_runtime::build_model_messages(&workspace, &input.prompt, scenario, &context);
    let gateway = {
        let config = state.config.lock().expect("config mutex poisoned");
        adl_model_gateway::ModelGateway::new(config.model_preferences.clone())?
    };
    let (model_response, model_audit) = gateway
        .chat(
            &workspace.id,
            &session.id,
            Some(detail.run.id.clone()),
            scenario,
            messages,
        )
        .await;
    state.db.save_entity(
        EntityTable::ModelCallAudit,
        &model_audit.id,
        Some(&workspace.id),
        Some(&session.id),
        Some(if model_response.synthetic {
            "synthetic"
        } else {
            "ok"
        }),
        &model_audit,
    )?;
    let _ = app.emit(
        "digital-life://model-stream",
        serde_json::json!({
            "v": 1,
            "runId": detail.run.id,
            "seq": 1,
            "type": "done"
        }),
    );

    let patch_set = match adl_agent_runtime::target_file_from_prompt(&input.prompt) {
        Some(path) => {
            let document =
                adl_workspace::read_file(std::path::Path::new(&workspace.root_path), &path)?;
            Some(adl_agent_runtime::create_patch_from_document(
                &workspace.id,
                &session.id,
                Some(detail.run.id.clone()),
                &input.prompt,
                &document,
            ))
        }
        None => None,
    };
    if let Some(patch_set) = &patch_set {
        state.db.save_entity(
            EntityTable::PatchSets,
            &patch_set.id,
            Some(&workspace.id),
            Some(&session.id),
            Some("ready"),
            patch_set,
        )?;
        for file_patch in &patch_set.file_patches {
            state.db.save_entity(
                EntityTable::FilePatches,
                &file_patch.id,
                Some(&workspace.id),
                Some(&session.id),
                Some("ready"),
                file_patch,
            )?;
            for hunk in &file_patch.hunks {
                state.db.save_entity(
                    EntityTable::PatchHunks,
                    &hunk.id,
                    Some(&workspace.id),
                    Some(&session.id),
                    Some("pending"),
                    hunk,
                )?;
            }
        }
    }
    detail = adl_agent_runtime::complete_plan(detail, patch_set.as_ref());
    save_run_detail(state, &detail)?;

    let blocks = adl_agent_runtime::assistant_blocks(&detail, patch_set.as_ref());
    let assistant_message = adl_conversation::create_message(
        &session.id,
        ConversationRole::Assistant,
        model_response.content,
        blocks,
        Some(detail.run.id.clone()),
    );
    crate::commands::conversation::save_message(state, &workspace.id, &assistant_message)?;
    adl_conversation::touch_session(&mut session, assistant_message.created_at);
    crate::commands::conversation::save_session(state, &session)?;
    state
        .event_bus
        .emit(adl_events::AppEvent::AgentRunChanged(detail.run.id.clone()));

    Ok(ConversationSendResult {
        session,
        user_message,
        assistant_message,
        run_detail: detail,
        patch_set,
    })
}

pub fn load_run_detail(state: &AppState, run_id: &str) -> Result<Option<AgentRunDetail>, AppError> {
    let Some(run) = state
        .db
        .load_entity::<adl_kernel::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
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
