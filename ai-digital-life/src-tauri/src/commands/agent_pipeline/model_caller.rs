use adl_agent_runtime::plugins::hooks::{HookResult, PluginHook};
use adl_errors::AppError;
use adl_kernel::{ConversationScenario, ModelCallAuditRecord, ModelChatMessage, ModelResponse};
use adl_storage::EntityTable;

use crate::commands::agent_pipeline_stream::consume_stream_to_response;
use crate::commands::agent_pipeline_types::CallModelContext;
use crate::commands::audit::AuditBatchEntry;
use crate::commands::plugin::PLUGIN_REGISTRY;

pub async fn call_model<F: Fn(serde_json::Value)>(
    ctx: CallModelContext<'_, F>,
) -> Result<(ModelResponse, ModelCallAuditRecord), AppError> {
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
                            ModelChatMessage {
                                role: adl_kernel::ConversationRole::System,
                                content: plan_prompt.to_string(),
                            },
                        );
                    }
                } else {
                    messages.insert(
                        0,
                        ModelChatMessage {
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
        if let Ok(modified) = serde_json::from_value::<Vec<ModelChatMessage>>(val) {
            messages = modified;
        }
    }

    // Heartbeat before model call to mark session as active
    ctx.state.durable_manager.heartbeat(&ctx.session.id).await;

    // Resolve provider and model for streaming
    let (provider_id, model_id) = {
        let config = ctx
            .state
            .config
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        if let (Some(pid), Some(mid)) = (&ctx.provider_id, &ctx.model_id) {
            (pid.clone(), mid.clone())
        } else {
            let mut providers: Vec<(String, i32)> = config
                .model_preferences
                .providers
                .iter()
                .filter(|(_, pref)| pref.enabled)
                .map(|(pid, pref)| (pid.clone(), pref.priority))
                .collect();
            providers.sort_by_key(|(_, priority)| *priority);
            let first =
                providers.first().map(|(p, _)| p.clone()).unwrap_or_else(|| "deepseek".to_string());
            let model = config
                .model_preferences
                .providers
                .get(&first)
                .map(|p| p.model_id.clone())
                .unwrap_or_else(|| "deepseek-chat".to_string());
            (first, model)
        }
    };

    let gateway = {
        let config = ctx
            .state
            .config
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        adl_model_gateway::ModelGateway::new(
            config.model_preferences.clone(),
            ctx.state.provider_registry.clone(),
        )?
    };

    let started = std::time::Instant::now();
    let stream = gateway.chat_stream_for_model(&provider_id, &model_id, messages).await?;
    let mut model_response =
        consume_stream_to_response(ctx.app, &ctx.detail.run.id, stream, &provider_id, &model_id)
            .await;

    // === Plugin Hook: ChatResponseAfter ===
    let hook_resp = PluginHook::ChatResponseAfter {
        response: serde_json::to_value(&model_response).unwrap_or_default(),
    };
    if let HookResult::Modify(val) = PLUGIN_REGISTRY.fire_hook(&hook_resp).await {
        if let Ok(modified) = serde_json::from_value::<ModelResponse>(val) {
            model_response = modified;
        }
    }

    let model_audit = ModelCallAuditRecord {
        id: adl_kernel::create_id("modelaudit"),
        request_id: adl_kernel::create_id("modelreq"),
        workspace_id: ctx.workspace.id.clone(),
        session_id: ctx.session.id.clone(),
        run_id: Some(ctx.detail.run.id.clone()),
        provider_id: model_response.provider_id.clone(),
        model_id: model_response.model_id.clone(),
        scenario: ctx.scenario,
        route_meta: adl_kernel::ModelRouteDecision {
            reason: "streaming dispatch".into(),
            chain: vec![provider_id.clone()],
            synthetic: None,
        },
        prompt_tokens: model_response.usage.as_ref().and_then(|u| u.prompt_tokens),
        completion_tokens: model_response.usage.as_ref().and_then(|u| u.completion_tokens),
        latency_ms: started.elapsed().as_millis() as i64,
        error: None,
        streamed: true,
        created_at: adl_kernel::now_ms(),
    };

    ctx.state.db.save_entity(
        EntityTable::ModelCallAudit,
        &model_audit.id,
        Some(&ctx.workspace.id),
        Some(&ctx.session.id),
        Some(if model_response.synthetic { "synthetic" } else { "ok" }),
        &model_audit,
    )?;

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

#[cfg(test)]
mod tests {
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
}
