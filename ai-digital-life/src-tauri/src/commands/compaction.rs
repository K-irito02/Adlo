use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_agent_runtime::compaction::compact_messages;
use adl_agent_runtime::compaction_summary::{build_context_from_messages, build_summary_prompt};
use adl_agent_runtime::token_counter::TokenCounter;
use adl_errors::AppError;
use adl_model_gateway::ModelGateway;
use adl_types::conversation::ConversationMessageRecord;
use adl_types::{ConversationRole, ConversationScenario, IpcResult, ModelChatMessage};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactSessionInput {
    pub session_id: String,
    pub messages_json: String,
    pub previous_summary: Option<String>,
    pub provider: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactSessionResult {
    pub preserved_messages: Vec<ConversationMessageRecord>,
    pub pruned_count: usize,
    pub summary: Option<String>,
    pub summary_needed: bool,
}

/// Compact a conversation and (when needed) generate an anchored summary via the model gateway.
///
/// When `summary_needed` is true the pruned messages are formatted as context
/// and sent to the LLM along with the OpenCode summary template. The response
/// (including synthetic fallbacks) is returned as `summary`.
#[tauri::command]
pub async fn compact_session_cmd(
    state: tauri::State<'_, AppState>,
    input: CompactSessionInput,
) -> Result<IpcResult<CompactSessionResult>, CommandError> {
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
            ModelGateway::new(config.model_preferences.clone(), state.provider_registry.clone())?
        };

        let (response, _audit) = gateway
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

    Ok(ipc(Ok(CompactSessionResult {
        preserved_messages: compaction_result.preserved,
        pruned_count: compaction_result.pruned_count,
        summary,
        summary_needed: compaction_result.summary_needed,
    })))
}
