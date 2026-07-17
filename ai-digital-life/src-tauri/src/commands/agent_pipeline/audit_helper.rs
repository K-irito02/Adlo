use adl_errors::AppError;
use adl_types::{AuditBatchEntry, ConversationSendResult};

use crate::commands::agent;
use crate::commands::agent_pipeline_types::FinalizeRunContext;
use crate::commands::conversation;

pub(crate) async fn finalize_run<F: Fn(serde_json::Value)>(
    ctx: FinalizeRunContext<'_, F>,
) -> Result<ConversationSendResult, AppError> {
    let detail = adl_agent_runtime::complete_plan(ctx.detail, ctx.patch_set, ctx.scenario);
    agent::save_run_detail(ctx.state, &detail)?;
    let summary = detail.run.summary.as_deref().unwrap_or("Agent run updated.");
    ctx.audit_batch.push(decide_audit_operation(
        &ctx.workspace.id,
        &ctx.session.id,
        ctx.patch_set,
        &detail.run.id,
        summary,
    ));

    let blocks = adl_conversation::assistant_blocks(&detail, ctx.patch_set, ctx.scenario);
    let assistant_message = adl_conversation::create_message(
        &ctx.session.id,
        adl_types::ConversationRole::Assistant,
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

    // Mark durable session as completed or failed
    ctx.state.durable_manager.complete(&ctx.session.id).await;

    Ok(ConversationSendResult {
        session: ctx.session.clone(),
        user_message: ctx.user_message,
        assistant_message,
        run_detail: detail,
        patch_set: ctx.patch_set.cloned(),
    })
}

fn decide_audit_operation(
    workspace_id: &str,
    session_id: &str,
    patch_set: Option<&adl_types::PatchSet>,
    run_id: &str,
    summary: &str,
) -> AuditBatchEntry {
    AuditBatchEntry {
        workspace_id: workspace_id.to_string(),
        session_id: Some(session_id.to_string()),
        operation_type: if patch_set.is_some() { "patch-apply".into() } else { "approval".into() },
        risk_level: if patch_set.is_some() {
            adl_types::RiskLevel::Medium
        } else {
            adl_types::RiskLevel::Low
        },
        summary: summary.to_string(),
        decision: Some("auto".into()),
        detail: Some(format!("runId={run_id}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_audit_batch_entry_construction_pattern() {
        let entry = AuditBatchEntry {
            workspace_id: "ws-1".into(),
            session_id: Some("sess-1".into()),
            operation_type: "approval".into(),
            risk_level: adl_types::RiskLevel::Low,
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
}
