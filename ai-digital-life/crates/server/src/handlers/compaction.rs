//! Compaction domain HTTP handlers — migrated from `src-tauri/src/commands/
//! compaction.rs`. Compacts a conversation and (when needed) generates an
//! anchored summary via the model gateway.

use crate::ServerState;
use crate::ipc;
use adl_agent_runtime::compaction::compact_messages;
use adl_agent_runtime::compaction_summary::{build_context_from_messages, build_summary_prompt};
use adl_agent_runtime::token_counter::TokenCounter;
use adl_errors::AppError;
use adl_types::conversation::ConversationMessageRecord;
use adl_types::{ConversationRole, ConversationScenario, ModelChatMessage};
use axum::extract::State;
use axum::response::IntoResponse;
use serde::Serialize;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompactSessionInput {
    session_id: String,
    messages_json: String,
    #[serde(default)]
    previous_summary: Option<String>,
    #[serde(default)]
    provider: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompactSessionResult {
    preserved_messages: Vec<ConversationMessageRecord>,
    pruned_count: usize,
    summary: Option<String>,
    summary_needed: bool,
}

/// POST `/compaction/session`.
pub async fn compact_session(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: CompactSessionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = compact_session_inner(&state, input).await;
    ipc::to_response(result)
}

async fn compact_session_inner(
    state: &ServerState,
    input: CompactSessionInput,
) -> Result<serde_json::Value, AppError> {
    let messages: Vec<ConversationMessageRecord> = serde_json::from_str(&input.messages_json)
        .map_err(|e| AppError::Internal(format!("invalid messages_json: {e}")))?;

    let provider = input.provider.unwrap_or_else(|| "deepseek".to_string());
    let counter = TokenCounter::new();
    let compaction_result = compact_messages(messages, &provider, &counter);

    let summary = if compaction_result.summary_needed {
        let context = build_context_from_messages(&compaction_result.pruned);
        let prompt = build_summary_prompt(input.previous_summary.as_deref(), &context);

        let model_messages = vec![
            ModelChatMessage {
                role: ConversationRole::System,
                content: "You are an anchored context summarization assistant for coding sessions."
                    .to_string(),
            },
            ModelChatMessage { role: ConversationRole::User, content: prompt },
        ];

        let gateway = {
            let config = state
                .config
                .read()
                .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
            adl_model_gateway::ModelGateway::new(
                config.model_preferences.clone(),
                state.provider_registry.clone(),
            )?
        };

        let response = gateway
            .chat(
                &input.session_id,
                &input.session_id,
                None,
                ConversationScenario::Chat,
                model_messages,
            )
            .await;

        if response.synthetic {
            tracing::warn!("Compaction summary used synthetic fallback: {}", response.content);
        }
        Some(response.content)
    } else {
        None
    };

    let result = CompactSessionResult {
        preserved_messages: compaction_result.preserved,
        pruned_count: compaction_result.pruned_count,
        summary,
        summary_needed: compaction_result.summary_needed,
    };
    Ok(serde_json::to_value(&result)?)
}
