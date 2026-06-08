use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{AgentRunDetail, ConversationScenario, ConversationSendResult, ModelResponse};
use adl_storage::EntityTable;
use tauri::Emitter;

use super::audit::AuditBatchEntry;
use crate::commands::agent::StartRunInput;
use crate::commands::conversation;

const MODEL_STREAM_CHARS: usize = 120;

pub(crate) fn emit_model_stream_events(
    app: &tauri::AppHandle,
    run_id: &str,
    response: &ModelResponse,
) {
    let reason = response.route.as_ref().map(|r| r.reason.as_str()).unwrap_or("primary route");
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

pub(crate) fn prepare_run(
    state: &AppState,
    session: &adl_kernel::ConversationSessionRecord,
    input: &StartRunInput,
    scenario: ConversationScenario,
    detail: &AgentRunDetail,
    emit_activity: impl Fn(serde_json::Value),
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Result<adl_kernel::ConversationMessageRecord, AppError> {
    emit_activity(serde_json::json!({
      "type": "run-start",
      "scenario": scenario
    }));
    let user_message = adl_conversation::create_message(
        &session.id,
        adl_kernel::ConversationRole::User,
        input.prompt.clone(),
        vec![],
        Some(detail.run.id.clone()),
    );
    conversation::save_message(state, &session.workspace_id, &user_message)?;
    audit_batch.push(AuditBatchEntry {
        workspace_id: session.workspace_id.clone(),
        session_id: Some(session.id.clone()),
        operation_type: "approval".into(),
        risk_level: adl_kernel::RiskLevel::Low,
        summary: format!("Agent run started in {:?} mode.", scenario),
        decision: Some("auto".into()),
        detail: Some(format!("runId={}", detail.run.id)),
    });
    Ok(user_message)
}

pub(crate) fn collect_context(
    workspace: &adl_kernel::WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: impl Fn(serde_json::Value),
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Result<Vec<adl_kernel::ContextEntry>, AppError> {
    let ws_ctx = adl_context::workspace_context(workspace);
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
                    adl_context::file_context(&rel, &doc.content, FILE_CONTEXT_MAX_TOKENS);
                let truncated = file_ctx.content.len() != doc.content.len();
                emit_activity(serde_json::json!({
                  "type": "file-read",
                  "path": rel,
                  "bytes": doc.content.len(),
                  "tokenEstimate": file_ctx.token_estimate,
                  "truncated": truncated
                }));
                audit_batch.push(AuditBatchEntry {
                    workspace_id: workspace_scope_id.to_string(),
                    session_id: Some(session_id.to_string()),
                    operation_type: "file-read".into(),
                    risk_level: adl_kernel::RiskLevel::Low,
                    summary: format!("Read file context: {rel}"),
                    decision: Some("auto".into()),
                    detail: Some(format!("runId={}; bytes={}", detail.run.id, doc.content.len())),
                });
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
                    if let Some(outline) = adl_context::outline_context(&rel, &items, 16) {
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
        context.push(adl_context::symbol_context(&sym));
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
                audit_batch.push(AuditBatchEntry {
                    workspace_id: workspace_scope_id.to_string(),
                    session_id: Some(session_id.to_string()),
                    operation_type: "search".into(),
                    risk_level: adl_kernel::RiskLevel::Low,
                    summary: format!("Workspace search for `{sym}` ({}) hits.", hits.len()),
                    decision: Some("auto".into()),
                    detail: Some(format!("runId={}", detail.run.id)),
                });
                context.extend(adl_context::search_hit_contexts(&sym, &hits, 6));
            }
        }
    }
    Ok(adl_context::sort_context(context))
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn call_model(
    state: &AppState,
    workspace: &adl_kernel::WorkspaceMeta,
    session: &adl_kernel::ConversationSessionRecord,
    scenario: ConversationScenario,
    context: Vec<adl_kernel::ContextEntry>,
    detail: &AgentRunDetail,
    input: &StartRunInput,
    app: &tauri::AppHandle,
    emit_activity: impl Fn(serde_json::Value),
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Result<(adl_kernel::ModelResponse, adl_kernel::ModelCallAuditRecord), AppError> {
    let messages =
        adl_agent_runtime::build_model_messages(workspace, &input.prompt, scenario, &context);
    let gateway = {
        let config =
            state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        adl_model_gateway::ModelGateway::new(config.model_preferences.clone())?
    };
    let (model_response, model_audit) = gateway
        .chat(&workspace.id, &session.id, Some(detail.run.id.clone()), scenario, messages)
        .await;
    state.db.save_entity(
        EntityTable::ModelCallAudit,
        &model_audit.id,
        Some(&workspace.id),
        Some(&session.id),
        Some(if model_response.synthetic { "synthetic" } else { "ok" }),
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
    audit_batch.push(AuditBatchEntry {
        workspace_id: workspace.id.clone(),
        session_id: Some(session.id.clone()),
        operation_type: "model".into(),
        risk_level: adl_kernel::RiskLevel::Low,
        summary: format!(
            "Model call done: {:?}/{}",
            model_response.provider_id, model_response.model_id
        ),
        decision: Some("auto".into()),
        detail: Some(format!("runId={}", detail.run.id)),
    });
    Ok((model_response, model_audit))
}

pub(crate) fn generate_patches(
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
        state.db.transaction(|conn| {
            state.db.save_entity_on_conn(
                conn,
                EntityTable::PatchSets,
                &patch_set.id,
                Some(&workspace.id),
                Some(&session.id),
                Some("ready"),
                patch_set,
            )?;
            for file_patch in &patch_set.file_patches {
                state.db.save_entity_on_conn(
                    conn,
                    EntityTable::FilePatches,
                    &file_patch.id,
                    Some(&workspace.id),
                    Some(&session.id),
                    Some("ready"),
                    file_patch,
                )?;
                for hunk in &file_patch.hunks {
                    state.db.save_entity_on_conn(
                        conn,
                        EntityTable::PatchHunks,
                        &hunk.id,
                        Some(&workspace.id),
                        Some(&session.id),
                        Some("pending"),
                        hunk,
                    )?;
                }
            }
            Ok(())
        })?;
    }
    Ok(patch_set)
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn finalize_run(
    state: &AppState,
    workspace: &adl_kernel::WorkspaceMeta,
    session: &mut adl_kernel::ConversationSessionRecord,
    detail: AgentRunDetail,
    model_response: &adl_kernel::ModelResponse,
    patch_set: Option<&adl_kernel::PatchSet>,
    scenario: ConversationScenario,
    user_message: adl_kernel::ConversationMessageRecord,
    emit_activity: impl Fn(serde_json::Value),
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Result<ConversationSendResult, AppError> {
    let detail = adl_agent_runtime::complete_plan(detail, patch_set, scenario);
    crate::commands::agent::save_run_detail(state, &detail)?;
    audit_batch.push(AuditBatchEntry {
        workspace_id: workspace.id.clone(),
        session_id: Some(session.id.clone()),
        operation_type: if patch_set.is_some() { "patch-apply".into() } else { "approval".into() },
        risk_level: if patch_set.is_some() {
            adl_kernel::RiskLevel::Medium
        } else {
            adl_kernel::RiskLevel::Low
        },
        summary: detail.run.summary.clone().unwrap_or_else(|| "Agent run updated.".into()),
        decision: Some("auto".into()),
        detail: Some(format!("runId={}", detail.run.id)),
    });

    let blocks = adl_agent_runtime::assistant_blocks(&detail, patch_set, scenario);
    let assistant_message = adl_conversation::create_message(
        &session.id,
        adl_kernel::ConversationRole::Assistant,
        model_response.content.clone(),
        blocks,
        Some(detail.run.id.clone()),
    );
    conversation::save_message(state, &workspace.id, &assistant_message)?;
    adl_conversation::touch_session(session, assistant_message.created_at);
    conversation::save_session(state, session)?;
    state.event_bus.emit(adl_kernel::events::AppEvent::AgentRunChanged(detail.run.id.clone()));

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
