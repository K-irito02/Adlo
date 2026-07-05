use adl_agent_runtime::compaction::compact_messages;
use adl_agent_runtime::token_counter::TokenCounter;
use adl_kernel::types::config::ModelProviderId;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CompactionResultDto {
    preserved_tokens: usize,
    pruned_count: usize,
    pruned_tokens: usize,
    summary_needed: bool,
}

#[tauri::command]
pub async fn compact_session_cmd(
    messages_json: String,
    provider: String,
) -> Result<CompactionResultDto, adl_errors::AppError> {
    let provider_id: ModelProviderId = serde_json::from_str(&format!("\"{}\"", provider))?;
    let messages: Vec<adl_kernel::types::conversation::ConversationMessageRecord> =
        serde_json::from_str(&messages_json)?;
    let counter = TokenCounter::new();
    let result = compact_messages(&messages, provider_id, &counter);
    Ok(CompactionResultDto {
        preserved_tokens: result.preserved_tokens,
        pruned_count: result.pruned_count,
        pruned_tokens: result.pruned_tokens,
        summary_needed: result.summary_needed,
    })
}
