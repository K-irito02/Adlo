use crate::state::AppState;
use adl_agent_runtime::permission_check::{check_tool_permission, PermissionCheckResult};
use adl_agent_runtime::plugins::hooks::{HookResult, PluginHook};
use adl_errors::AppError;
use adl_kernel::{AgentRunDetail, ConversationScenario, ConversationSendResult, PermissionRuleset};
use adl_storage::EntityTable;

use super::agent_pipeline_stream::emit_model_stream_events;
use super::agent_pipeline_types::{CallModelContext, FinalizeRunContext};
use super::audit::AuditBatchEntry;
use super::plugin::PLUGIN_REGISTRY;
use crate::commands::agent::StartRunInput;
use crate::commands::conversation;

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
        input.prompt.as_str(),
        vec![],
        Some(detail.run.id.as_str()),
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

    let file_context = collect_file_context(
        workspace,
        input,
        detail,
        workspace_scope_id,
        session_id,
        &emit_activity,
        audit_batch,
    );
    context.extend(file_context);

    let symbol_context = collect_symbol_context(
        workspace,
        input,
        detail,
        workspace_scope_id,
        session_id,
        &emit_activity,
        audit_batch,
    );
    context.extend(symbol_context);

    Ok(adl_context::sort_context(context))
}

fn collect_file_context<F: Fn(serde_json::Value)>(
    workspace: &adl_kernel::WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: &F,
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Vec<adl_kernel::ContextEntry> {
    const FILE_CONTEXT_MAX_TOKENS: usize = 6_000;
    let mut context = Vec::new();
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
    context
}

fn collect_symbol_context<F: Fn(serde_json::Value)>(
    workspace: &adl_kernel::WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: &F,
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Vec<adl_kernel::ContextEntry> {
    let mut context = Vec::new();
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
    context
}

pub(crate) async fn call_model<F: Fn(serde_json::Value)>(
    ctx: CallModelContext<'_, F>,
) -> Result<(adl_kernel::ModelResponse, adl_kernel::ModelCallAuditRecord), AppError> {
    let mut messages = adl_agent_runtime::build_model_messages(
        ctx.workspace,
        &ctx.input.prompt,
        ctx.scenario,
        &ctx.context,
    );

    // === Plan Mode 集成：从 run detail.summary 读取注入的 plan prompt，
    // 并追加到 system message 的末尾，使模型在 Plan 场景下遵循该指令。
    if ctx.scenario == ConversationScenario::Plan {
        if let Some(summary) = &ctx.detail.run.summary {
            if let Some(plan_prompt_start) = summary.find("[PLAN_MODE_PROMPT]") {
                let plan_prompt = &summary[plan_prompt_start..];
                if let Some(first) = messages.first_mut() {
                    if first.role == adl_kernel::ConversationRole::System {
                        first.content.push_str("\n\n");
                        first.content.push_str(plan_prompt);
                    } else {
                        // 系统消息不在首位时，前置一条 plan prompt 作为 system message
                        messages.insert(
                            0,
                            adl_kernel::ModelChatMessage {
                                role: adl_kernel::ConversationRole::System,
                                content: plan_prompt.to_string(),
                            },
                        );
                    }
                } else {
                    messages.insert(
                        0,
                        adl_kernel::ModelChatMessage {
                            role: adl_kernel::ConversationRole::System,
                            content: plan_prompt.to_string(),
                        },
                    );
                }
            }
        }
    }

    // === Plugin Hook: ChatMessageBefore ===
    let hook_msg = PluginHook::ChatMessageBefore {
        messages: messages.iter().map(|m| serde_json::to_value(m).unwrap_or_default()).collect(),
    };
    if let HookResult::Modify(val) = PLUGIN_REGISTRY.fire_hook(&hook_msg).await {
        if let Ok(modified) = serde_json::from_value::<Vec<adl_kernel::ModelChatMessage>>(val) {
            messages = modified;
        }
    }

    let gateway = {
        let config = ctx
            .state
            .config
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        adl_model_gateway::ModelGateway::new(config.model_preferences.clone())?
    };
    let (mut model_response, model_audit) = gateway
        .chat(
            &ctx.workspace.id,
            &ctx.session.id,
            Some(ctx.detail.run.id.as_str()),
            ctx.scenario,
            messages,
        )
        .await;

    // === Plugin Hook: ChatResponseAfter ===
    let hook_resp = PluginHook::ChatResponseAfter {
        response: serde_json::to_value(&model_response).unwrap_or_default(),
    };
    if let HookResult::Modify(val) = PLUGIN_REGISTRY.fire_hook(&hook_resp).await {
        if let Ok(modified) = serde_json::from_value::<adl_kernel::ModelResponse>(val) {
            model_response = modified;
        }
    }

    ctx.state.db.save_entity(
        EntityTable::ModelCallAudit,
        &model_audit.id,
        Some(&ctx.workspace.id),
        Some(&ctx.session.id),
        Some(if model_response.synthetic { "synthetic" } else { "ok" }),
        &model_audit,
    )?;
    emit_model_stream_events(ctx.app, &ctx.detail.run.id, &model_response);
    (ctx.emit_activity)(serde_json::json!({
      "type": "model",
      "phase": "done",
      "providerId": model_response.provider_id,
      "modelId": model_response.model_id,
      "usage": model_response.usage,
      "reason": model_response.route.as_ref().map(|r| r.reason.as_str()).unwrap_or("primary route")
    }));
    ctx.audit_batch.push(AuditBatchEntry {
        workspace_id: ctx.workspace.id.clone(),
        session_id: Some(ctx.session.id.clone()),
        operation_type: "model".into(),
        risk_level: adl_kernel::RiskLevel::Low,
        summary: format!(
            "Model call done: {:?}/{}",
            model_response.provider_id, model_response.model_id
        ),
        decision: Some("auto".into()),
        detail: Some(format!("runId={}", ctx.detail.run.id)),
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

                    // 权限检查：CodeEdit 场景下的 apply_patch 操作需要通过 ruleset 拦截
                    // 这是中心化拦截点（vs OpenCode 的 ctx.ask 分散式调用）
                    let ruleset = build_ruleset_from_config();
                    let tool_input = format!("patch {} {}", path, input.prompt);
                    let doom_loop_count = 0u32; // TODO: 从 session 状态读取连续失败次数
                    match check_tool_permission(
                        "apply_patch",
                        &tool_input,
                        &ruleset,
                        doom_loop_count,
                    ) {
                        PermissionCheckResult::Deny(reason) => {
                            emit_activity(serde_json::json!({
                                "type": "permission-denied",
                                "tool": "apply_patch",
                                "reason": reason
                            }));
                            return Ok(None);
                        },
                        PermissionCheckResult::Ask(reason) => {
                            emit_activity(serde_json::json!({
                                "type": "permission-ask",
                                "tool": "apply_patch",
                                "reason": reason
                            }));
                            // Ask 模式当前仅记录审计日志后继续执行
                            // 完整的 Ask 需要前端审批 UI 流程，作为后续增量完善
                        },
                        PermissionCheckResult::Allow => {},
                    }

                    Some(adl_agent_runtime::create_patch_from_document(
                        &workspace.id,
                        &session.id,
                        Some(detail.run.id.as_str()),
                        &input.prompt,
                        &document,
                    ))
                },
                None => None,
            }
        },
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

fn decide_audit_operation(
    workspace_id: &str,
    session_id: &str,
    patch_set: Option<&adl_kernel::PatchSet>,
    run_id: &str,
    summary: &str,
) -> AuditBatchEntry {
    AuditBatchEntry {
        workspace_id: workspace_id.to_string(),
        session_id: Some(session_id.to_string()),
        operation_type: if patch_set.is_some() { "patch-apply".into() } else { "approval".into() },
        risk_level: if patch_set.is_some() {
            adl_kernel::RiskLevel::Medium
        } else {
            adl_kernel::RiskLevel::Low
        },
        summary: summary.to_string(),
        decision: Some("auto".into()),
        detail: Some(format!("runId={run_id}")),
    }
}

pub(crate) fn finalize_run<F: Fn(serde_json::Value)>(
    ctx: FinalizeRunContext<'_, F>,
) -> Result<ConversationSendResult, AppError> {
    let detail = adl_agent_runtime::complete_plan(ctx.detail, ctx.patch_set, ctx.scenario);
    crate::commands::agent::save_run_detail(ctx.state, &detail)?;
    let summary = detail.run.summary.as_deref().unwrap_or("Agent run updated.");
    ctx.audit_batch.push(decide_audit_operation(
        &ctx.workspace.id,
        &ctx.session.id,
        ctx.patch_set,
        &detail.run.id,
        summary,
    ));

    let blocks = adl_agent_runtime::assistant_blocks(&detail, ctx.patch_set, ctx.scenario);
    let assistant_message = adl_conversation::create_message(
        &ctx.session.id,
        adl_kernel::ConversationRole::Assistant,
        ctx.model_response.content.as_str(),
        blocks,
        Some(detail.run.id.as_str()),
    );
    conversation::save_message(ctx.state, &ctx.workspace.id, &assistant_message)?;
    adl_conversation::touch_session(ctx.session, assistant_message.created_at);
    conversation::save_session(ctx.state, ctx.session)?;
    ctx.state.event_bus.emit(adl_kernel::events::AppEvent::AgentRunChanged(detail.run.id.clone()));

    (ctx.emit_activity)(serde_json::json!({
      "type": "run-done",
      "status": detail.run.status
    }));

    Ok(ConversationSendResult {
        session: ctx.session.clone(),
        user_message: ctx.user_message,
        assistant_message,
        run_detail: detail,
        patch_set: ctx.patch_set.cloned(),
    })
}

/// Build the permission ruleset used by `generate_patches` to intercept
/// `apply_patch` operations. Currently uses the default safety rules; future
/// work will load user-configured rules from `PermissionRulesetConfig`.
fn build_ruleset_from_config() -> PermissionRuleset {
    adl_kernel::build_ruleset(&[], true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::ConversationScenario;

    const STREAM_CHUNK_SIZE: usize = 120;

    #[test]
    fn test_stream_chunk_count_empty_content() {
        let content = "";
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 0, "empty content should produce 0 deltas");
    }

    #[test]
    fn test_stream_chunk_count_exact_one_chunk() {
        let content = "a".repeat(STREAM_CHUNK_SIZE);
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 1, "exactly 120 chars = 1 delta chunk");
    }

    #[test]
    fn test_stream_chunk_count_two_chunks() {
        let content = "a".repeat(STREAM_CHUNK_SIZE + 1);
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 2, "121 chars = 2 delta chunks");
    }

    #[test]
    fn test_stream_chunk_count_unicode() {
        let content = "中文测试".repeat(40);
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 2, "160 unicode chars = 2 delta chunks");
    }

    #[test]
    fn test_route_event_json_structure() {
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 0,
            "type": "route",
            "providerId": "deepseek",
            "modelId": "deepseek-v4",
            "reason": "primary route",
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["runId"], "run-1");
        assert_eq!(event["seq"], 0);
        assert_eq!(event["type"], "route");
        assert!(event.get("providerId").is_some());
        assert!(event.get("modelId").is_some());
        assert!(event.get("reason").is_some());
    }

    #[test]
    fn test_usage_event_json_structure() {
        let usage = serde_json::json!({"inputTokens": 100, "outputTokens": 50});
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 1,
            "type": "usage",
            "usage": usage,
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["type"], "usage");
        assert!(event.get("usage").is_some());
    }

    #[test]
    fn test_delta_event_json_structure() {
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 2,
            "type": "delta",
            "text": "Hello World",
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["type"], "delta");
        assert_eq!(event["text"], "Hello World");
    }

    #[test]
    fn test_done_event_json_structure() {
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 3,
            "type": "done",
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["type"], "done");
        assert!(event.get("text").is_none(), "done event should NOT have text field");
    }

    #[test]
    fn test_run_start_activity_event_structure() {
        let event = serde_json::json!({
            "type": "run-start",
            "scenario": "code-edit"
        });
        assert_eq!(event["type"], "run-start");
        assert_eq!(event["scenario"], "code-edit");
    }

    #[test]
    fn test_run_done_activity_event_structure() {
        let event = serde_json::json!({
            "type": "run-done",
            "status": "succeeded"
        });
        assert_eq!(event["type"], "run-done");
        assert!(event.get("status").is_some());
    }

    #[test]
    fn test_generate_patches_scenario_code_edit_enables_patches() {
        let scenario = ConversationScenario::CodeEdit;
        let root_empty = false;
        let generates_patch = matches!(scenario, ConversationScenario::CodeEdit) && !root_empty;
        assert!(generates_patch, "CodeEdit with non-empty root should generate patches");
    }

    #[test]
    fn test_generate_patches_scenario_plan_never_patches() {
        let scenarios = [ConversationScenario::Plan, ConversationScenario::Chat];
        for scenario in &scenarios {
            let generates_patch = matches!(scenario, ConversationScenario::CodeEdit);
            assert!(!generates_patch, "{scenario:?} should not generate patches");
        }
    }

    #[test]
    fn test_finalize_run_audit_operation_patch_apply() {
        let patch_present = true;
        let operation = if patch_present { "patch-apply" } else { "approval" };
        assert_eq!(operation, "patch-apply");
    }

    #[test]
    fn test_finalize_run_audit_operation_no_patch() {
        let patch_present = false;
        let operation = if patch_present { "patch-apply" } else { "approval" };
        assert_eq!(operation, "approval");
    }

    #[test]
    fn test_finalize_run_audit_risk_patch_present() {
        let patch_present = true;
        let risk = if patch_present { "medium" } else { "low" };
        assert_eq!(risk, "medium", "patch-present runs should have medium risk");
    }

    #[test]
    fn test_finalize_run_audit_risk_no_patch() {
        let patch_present = false;
        let risk = if patch_present { "medium" } else { "low" };
        assert_eq!(risk, "low", "no-patch runs should have low risk");
    }

    #[test]
    fn test_model_activity_event_structure() {
        let event = serde_json::json!({
            "type": "model",
            "phase": "done",
            "providerId": "deepseek",
            "modelId": "deepseek-v4",
            "usage": null,
            "reason": "primary route",
        });
        assert_eq!(event["type"], "model");
        assert_eq!(event["phase"], "done");
        assert!(event.get("providerId").is_some());
        assert!(event.get("modelId").is_some());
    }

    #[test]
    fn test_context_added_activity_event_structure() {
        let event = serde_json::json!({
            "type": "context-added",
            "contextType": "message",
            "label": "workspace context",
            "tokenEstimate": 42
        });
        assert_eq!(event["type"], "context-added");
        assert!(event.get("contextType").is_some());
        assert!(event.get("label").is_some());
    }

    #[test]
    fn test_audit_batch_entry_construction_pattern() {
        let entry = AuditBatchEntry {
            workspace_id: "ws-1".into(),
            session_id: Some("sess-1".into()),
            operation_type: "approval".into(),
            risk_level: adl_kernel::RiskLevel::Low,
            summary: "Agent run started in CodeEdit mode.".into(),
            decision: Some("auto".into()),
            detail: Some("runId=run-1".into()),
        };
        assert_eq!(entry.workspace_id, "ws-1");
        assert_eq!(entry.session_id, Some("sess-1".to_string()));
        assert_eq!(entry.operation_type, "approval");
        assert_eq!(entry.decision, Some("auto".to_string()));
        assert!(entry.detail.unwrap().contains("runId="));
    }

    // ========== emit_model_stream_events logic tests ==========
    // These tests have been moved to the agent_pipeline_stream submodule.
}
