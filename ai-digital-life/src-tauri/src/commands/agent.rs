use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    create_id, now_ms, AgentRunDetail, AgentRunStatus, ConversationRole, ConversationScenario,
    ConversationSendResult, DigitalLifeRunActivityEventV1, IpcResult, ModelResponse,
};
use adl_storage::EntityTable;
use tauri::Emitter;

const MODEL_STREAM_CHARS: usize = 120;
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
    // Store `run_id` in the generic `status` column for efficient filtering via `list_entities_by_status`.
    state.db.save_entity(
        EntityTable::RunActivityEvents,
        &create_id("runact"),
        Some(workspace_id),
        Some(session_id),
        Some(run_id),
        event,
    )?;
    // Best-effort: keep per-run history bounded to prevent unbounded DB growth in long sessions.
    // (global retention/row caps are handled at startup; this is a tighter per-run guardrail)
    let _ = state.db.prune_run_activity_events_for_run(run_id, 5_000);
    Ok(())
}

fn emit_model_stream_events(app: &tauri::AppHandle, run_id: &str, response: &ModelResponse) {
    let reason = response
        .route
        .as_ref()
        .map(|r| r.reason.as_str())
        .unwrap_or("primary route");
    let _ = app.emit(
        "digital-life://model-stream",
        serde_json::json!({
            "v": 1,
            "runId": run_id,
            "seq": 0,
            "type": "route",
            "providerId": response.provider_id,
            "modelId": response.model_id,
            "reason": reason,
        }),
    );
    if let Some(usage) = &response.usage {
        let _ = app.emit(
            "digital-life://model-stream",
            serde_json::json!({
                "v": 1,
                "runId": run_id,
                "seq": 1,
                "type": "usage",
                "usage": usage,
            }),
        );
    }
    let mut seq = 2usize;
    let content = &response.content;
    if content.is_empty() {
        let _ = app.emit(
            "digital-life://model-stream",
            serde_json::json!({
                "v": 1,
                "runId": run_id,
                "seq": seq,
                "type": "done"
            }),
        );
        return;
    }
    let mut buf = String::new();
    let mut char_count = 0usize;
    for ch in content.chars() {
        buf.push(ch);
        char_count += 1;
        if char_count >= MODEL_STREAM_CHARS {
            let _ = app.emit(
                "digital-life://model-stream",
                serde_json::json!({
                    "v": 1,
                    "runId": run_id,
                    "seq": seq,
                    "type": "delta",
                    "text": &buf,
                }),
            );
            seq += 1;
            buf.clear();
            char_count = 0;
        }
    }
    if !buf.is_empty() {
        let _ = app.emit(
            "digital-life://model-stream",
            serde_json::json!({
                "v": 1,
                "runId": run_id,
                "seq": seq,
                "type": "delta",
                "text": &buf,
            }),
        );
        seq += 1;
    }
    let _ = app.emit(
        "digital-life://model-stream",
        serde_json::json!({
            "v": 1,
            "runId": run_id,
            "seq": seq,
            "type": "done"
        }),
    );
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
                adl_events::run_activity_event(
                    &run_id,
                    seq,
                    ts,
                    &event_type,
                    serde_json::Value::Object(obj),
                )
            }
            other => adl_events::run_activity_event(
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

fn prepare_run(
    state: &AppState,
    session: &adl_kernel::ConversationSessionRecord,
    input: &StartRunInput,
    scenario: ConversationScenario,
    detail: &AgentRunDetail,
    emit_activity: impl Fn(serde_json::Value),
) -> Result<adl_kernel::ConversationMessageRecord, AppError> {
    emit_activity(serde_json::json!({
      "type": "run-start",
      "scenario": scenario
    }));
    let user_message = adl_conversation::create_message(
        &session.id,
        ConversationRole::User,
        input.prompt.clone(),
        vec![],
        Some(detail.run.id.clone()),
    );
    crate::commands::conversation::save_message(state, &session.workspace_id, &user_message)?;
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &session.workspace_id,
        Some(&session.id),
        "approval",
        adl_kernel::RiskLevel::Low,
        format!("Agent run started in {:?} mode.", scenario),
        Some("auto"),
        Some(format!("runId={}", detail.run.id)),
    );
    Ok(user_message)
}

fn collect_context(
    state: &AppState,
    workspace: &adl_kernel::WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: impl Fn(serde_json::Value),
) -> Result<Vec<adl_kernel::ContextEntry>, AppError> {
    let ws_ctx = adl_context_engine::workspace_context(workspace);
    emit_activity(serde_json::json!({
      "type": "context-added",
      "contextType": "message",
      "label": ws_ctx.label,
      "tokenEstimate": ws_ctx.token_estimate
    }));
    let mut context = vec![ws_ctx];
    const FILE_CONTEXT_MAX_TOKENS: usize = 6_000;
    if !workspace.root_path.is_empty() {
        if let Some(rel) = adl_agent_runtime::target_file_from_prompt(&input.prompt) {
            if let Ok(doc) =
                adl_workspace::read_file(std::path::Path::new(&workspace.root_path), &rel)
            {
                let file_ctx =
                    adl_context_engine::file_context(&rel, &doc.content, FILE_CONTEXT_MAX_TOKENS);
                let truncated = file_ctx.content.len() != doc.content.len();
                emit_activity(serde_json::json!({
                  "type": "file-read",
                  "path": rel,
                  "bytes": doc.content.len(),
                  "tokenEstimate": file_ctx.token_estimate,
                  "truncated": truncated
                }));
                let _ = crate::commands::audit::save_audit_entry(
                    state,
                    workspace_scope_id,
                    Some(session_id),
                    "file-read",
                    adl_kernel::RiskLevel::Low,
                    format!("Read file context: {rel}"),
                    Some("auto"),
                    Some(format!(
                        "runId={}; bytes={}",
                        detail.run.id,
                        doc.content.len()
                    )),
                );
                emit_activity(serde_json::json!({
                  "type": "context-added",
                  "contextType": "file",
                  "label": file_ctx.label,
                  "path": file_ctx.path,
                  "tokenEstimate": file_ctx.token_estimate,
                  "truncated": truncated
                }));
                context.push(file_ctx);
                if let Ok(items) =
                    adl_workspace::outline(std::path::Path::new(&workspace.root_path), &rel)
                {
                    if let Some(outline) = adl_context_engine::outline_context(&rel, &items, 16) {
                        emit_activity(serde_json::json!({
                          "type": "context-added",
                          "contextType": "outline",
                          "label": outline.label,
                          "path": outline.path,
                          "tokenEstimate": outline.token_estimate
                        }));
                        context.push(outline);
                    }
                }
            }
        }
    }
    if let Some(sym) = adl_agent_runtime::target_symbol_from_prompt(&input.prompt) {
        context.push(adl_context_engine::symbol_context(&sym));
        emit_activity(serde_json::json!({
          "type": "context-added",
          "contextType": "symbol",
          "label": format!("@{sym}"),
        }));
        if !workspace.root_path.is_empty() {
            if let Ok(hits) =
                adl_workspace::search_text(std::path::Path::new(&workspace.root_path), &sym)
            {
                emit_activity(serde_json::json!({
                  "type": "search",
                  "query": sym,
                  "hitCount": hits.len(),
                  "samplePaths": hits.iter().take(6).map(|h| h.path.clone()).collect::<Vec<_>>(),
                }));
                let _ = crate::commands::audit::save_audit_entry(
                    state,
                    workspace_scope_id,
                    Some(session_id),
                    "search",
                    adl_kernel::RiskLevel::Low,
                    format!("Workspace search for `{sym}` ({}) hits.", hits.len()),
                    Some("auto"),
                    Some(format!("runId={}", detail.run.id)),
                );
                context.extend(adl_context_engine::search_hit_contexts(&sym, &hits, 6));
            }
        }
    }
    Ok(adl_context_engine::sort_context(context))
}

async fn call_model(
    state: &AppState,
    workspace: &adl_kernel::WorkspaceMeta,
    session: &adl_kernel::ConversationSessionRecord,
    scenario: ConversationScenario,
    context: Vec<adl_kernel::ContextEntry>,
    detail: &AgentRunDetail,
    input: &StartRunInput,
    app: &tauri::AppHandle,
    emit_activity: impl Fn(serde_json::Value),
) -> Result<(adl_kernel::ModelResponse, adl_kernel::ModelCallAuditRecord), AppError> {
    let messages =
        adl_agent_runtime::build_model_messages(workspace, &input.prompt, scenario, &context);
    let gateway = {
        let config = state
            .config
            .lock()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
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
    emit_model_stream_events(app, &detail.run.id, &model_response);
    emit_activity(serde_json::json!({
      "type": "model",
      "phase": "done",
      "providerId": model_response.provider_id,
      "modelId": model_response.model_id,
      "usage": model_response.usage,
      "reason": model_response.route.as_ref().map(|r| r.reason.clone()).unwrap_or_else(|| "primary route".into())
    }));
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some(&session.id),
        "model",
        adl_kernel::RiskLevel::Low,
        format!(
            "Model call done: {:?}/{}",
            model_response.provider_id, model_response.model_id
        ),
        Some("auto"),
        Some(format!("runId={}", detail.run.id)),
    );
    Ok((model_response, model_audit))
}

fn generate_patches(
    workspace: &adl_kernel::WorkspaceMeta,
    input: &StartRunInput,
    scenario: ConversationScenario,
    detail: &mut AgentRunDetail,
    state: &AppState,
    session: &adl_kernel::ConversationSessionRecord,
    emit_activity: impl Fn(serde_json::Value),
) -> Result<Option<adl_kernel::PatchSet>, AppError> {
    let patch_set = match scenario {
        ConversationScenario::CodeEdit if !workspace.root_path.is_empty() => {
            match adl_agent_runtime::target_file_from_prompt(&input.prompt) {
                Some(path) => {
                    let document = adl_workspace::read_file(
                        std::path::Path::new(&workspace.root_path),
                        &path,
                    )?;
                    Some(adl_agent_runtime::create_patch_from_document(
                        &workspace.id,
                        &session.id,
                        Some(detail.run.id.clone()),
                        &input.prompt,
                        &document,
                    ))
                }
                None => None,
            }
        }
        ConversationScenario::CodeEdit
        | ConversationScenario::Plan
        | ConversationScenario::Chat => None,
    };
    if let Some(patch_set) = &patch_set {
        emit_activity(serde_json::json!({
          "type": "patch",
          "phase": "proposed",
          "patchSetId": patch_set.id,
          "fileCount": patch_set.file_patches.len(),
          "hunkCount": patch_set.file_patches.iter().map(|f| f.hunks.len()).sum::<usize>()
        }));
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
    Ok(patch_set)
}

fn finalize_run(
    state: &AppState,
    workspace: &adl_kernel::WorkspaceMeta,
    session: &mut adl_kernel::ConversationSessionRecord,
    detail: AgentRunDetail,
    model_response: &adl_kernel::ModelResponse,
    patch_set: Option<&adl_kernel::PatchSet>,
    scenario: ConversationScenario,
    user_message: adl_kernel::ConversationMessageRecord,
    emit_activity: impl Fn(serde_json::Value),
) -> Result<ConversationSendResult, AppError> {
    let detail = adl_agent_runtime::complete_plan(detail, patch_set, scenario);
    save_run_detail(state, &detail)?;
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some(&session.id),
        if patch_set.is_some() {
            "patch-apply"
        } else {
            "approval"
        },
        if patch_set.is_some() {
            adl_kernel::RiskLevel::Medium
        } else {
            adl_kernel::RiskLevel::Low
        },
        detail
            .run
            .summary
            .clone()
            .unwrap_or_else(|| "Agent run updated.".into()),
        Some("auto"),
        Some(format!("runId={}", detail.run.id)),
    );

    let blocks = adl_agent_runtime::assistant_blocks(&detail, patch_set, scenario);
    let assistant_message = adl_conversation::create_message(
        &session.id,
        ConversationRole::Assistant,
        model_response.content.clone(),
        blocks,
        Some(detail.run.id.clone()),
    );
    crate::commands::conversation::save_message(state, &workspace.id, &assistant_message)?;
    adl_conversation::touch_session(session, assistant_message.created_at);
    crate::commands::conversation::save_session(state, session)?;
    state
        .event_bus
        .emit(adl_events::AppEvent::AgentRunChanged(detail.run.id.clone()));

    emit_activity(serde_json::json!({
      "type": "run-done",
      "status": detail.run.status
    }));

    Ok(ConversationSendResult {
        session: session.clone(),
        user_message,
        assistant_message,
        run_detail: detail,
        patch_set: patch_set.cloned(),
    })
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

    let emit_activity = make_activity_emitter(app, state,
        workspace_scope_id.clone(), session_id.clone(), detail.run.id.clone());
    let user_message = prepare_run(state, &session, &input, scenario, &detail, &emit_activity)?;
    let context = collect_context(state, &workspace, &input, &detail, &workspace_scope_id, &session_id, &emit_activity)?;
    let (model_response, _model_audit) = call_model(state, &workspace, &session, scenario, context, &detail, &input, app, &emit_activity).await?;
    let patch_set = generate_patches(&workspace, &input, scenario, &mut detail, state, &session, &emit_activity)?;
    let result = finalize_run(
        state, &workspace, &mut session, detail, &model_response, patch_set.as_ref(), scenario,
        user_message, &emit_activity,
    )?;

    Ok(result)
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
