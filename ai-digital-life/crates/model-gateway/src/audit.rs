//! Audit record generation for model API calls.

use adl_types::{
    ConversationScenario, ModelCallAuditRecord, ModelRouteDecision, ModelTokenUsage, create_id,
    now_ms,
};
use std::time::Instant;

pub(crate) struct AuditInput<'a> {
    pub(crate) workspace_id: &'a str,
    pub(crate) session_id: &'a str,
    pub(crate) run_id: Option<&'a str>,
    pub(crate) provider_id: String,
    pub(crate) model_id: String,
    pub(crate) scenario: ConversationScenario,
    pub(crate) route_meta: ModelRouteDecision,
    pub(crate) started: Instant,
    pub(crate) usage: Option<ModelTokenUsage>,
    pub(crate) error: Option<String>,
}

pub(crate) fn audit_record(input: AuditInput<'_>) -> ModelCallAuditRecord {
    ModelCallAuditRecord {
        id: create_id("modelaudit"),
        request_id: create_id("modelreq"),
        workspace_id: input.workspace_id.to_string(),
        session_id: input.session_id.to_string(),
        run_id: input.run_id.map(|s| s.to_string()),
        provider_id: input.provider_id,
        model_id: input.model_id,
        scenario: input.scenario,
        route_meta: input.route_meta,
        prompt_tokens: input.usage.as_ref().and_then(|usage| usage.prompt_tokens),
        completion_tokens: input.usage.as_ref().and_then(|usage| usage.completion_tokens),
        latency_ms: input.started.elapsed().as_millis() as i64,
        error: input.error,
        streamed: false,
        created_at: now_ms(),
    }
}
