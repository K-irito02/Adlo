use adl_errors::AppError;
use adl_kernel::{
    AgentRunDetail, ConversationMessageRecord, ConversationScenario, ConversationSessionRecord,
};

use crate::commands::audit::AuditBatchEntry;
use crate::commands::agent::StartRunInput;
use crate::commands::conversation;
use crate::state::AppState;

pub fn prepare_run(
    state: &AppState,
    session: &ConversationSessionRecord,
    input: &StartRunInput,
    scenario: ConversationScenario,
    detail: &AgentRunDetail,
    emit_activity: impl Fn(serde_json::Value),
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Result<ConversationMessageRecord, AppError> {
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
