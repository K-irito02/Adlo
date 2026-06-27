use adl_kernel::{
    estimate_tokens, ConversationRole, ModelChatMessage, ModelProviderId, ModelTokenUsage,
};

pub(crate) fn default_model(provider: ModelProviderId) -> &'static str {
    match provider {
        ModelProviderId::Deepseek => "deepseek-v4-pro",
        ModelProviderId::Minimax => "MiniMax-M2.7",
    }
}

pub(crate) fn deterministic_fallback(messages: &[ModelChatMessage], error: Option<&str>) -> String {
    let user = messages
        .iter()
        .rev()
        .find(|message| message.role == ConversationRole::User)
        .map(|message| message.content.as_str())
        .unwrap_or("");
    format!(
        "Provider route unavailable. Generated a local thin-slice response for: {user}\n{}",
        error
            .map(|value| format!("Last provider error: {value}"))
            .unwrap_or_else(|| "No provider error was available.".into())
    )
}

pub(crate) fn estimate_usage(messages: &[ModelChatMessage]) -> ModelTokenUsage {
    let prompt_tokens =
        messages.iter().map(|message| estimate_tokens(&message.content)).sum::<usize>() as u32;
    ModelTokenUsage {
        prompt_tokens: Some(prompt_tokens),
        completion_tokens: Some(64),
        total_tokens: Some(prompt_tokens + 64),
        estimated: Some(true),
    }
}
