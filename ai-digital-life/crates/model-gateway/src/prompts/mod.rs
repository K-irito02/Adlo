use adl_kernel::types::config::ModelProviderId;

const DEFAULT_PROMPT: &str = include_str!("default.txt");
const ANTHROPIC_PROMPT: &str = include_str!("anthropic.txt");
const OPENAI_PROMPT: &str = include_str!("openai.txt");
const GEMINI_PROMPT: &str = include_str!("gemini.txt");
const PLAN_MODE_PROMPT: &str = include_str!("plan_mode.txt");

/// Returns the provider-specific system prompt.
pub fn provider_prompt(provider: ModelProviderId) -> &'static str {
    match provider {
        ModelProviderId::Anthropic => ANTHROPIC_PROMPT,
        ModelProviderId::Openai => OPENAI_PROMPT,
        ModelProviderId::Google => GEMINI_PROMPT,
        ModelProviderId::Deepseek => OPENAI_PROMPT,
        ModelProviderId::Minimax => OPENAI_PROMPT,
        ModelProviderId::Ollama => DEFAULT_PROMPT,
        ModelProviderId::Openrouter => DEFAULT_PROMPT,
    }
}

/// Returns the plan mode reminder prompt.
pub fn plan_mode_prompt() -> &'static str {
    PLAN_MODE_PROMPT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_provider_has_prompt() {
        for provider in [
            ModelProviderId::Deepseek,
            ModelProviderId::Minimax,
            ModelProviderId::Openai,
            ModelProviderId::Anthropic,
            ModelProviderId::Google,
            ModelProviderId::Ollama,
            ModelProviderId::Openrouter,
        ] {
            let prompt = provider_prompt(provider);
            assert!(!prompt.is_empty(), "Provider {:?} has empty prompt", provider);
        }
    }

    #[test]
    fn anthropic_prompt_mentions_xml() {
        let prompt = provider_prompt(ModelProviderId::Anthropic);
        assert!(prompt.to_lowercase().contains("xml"));
    }

    #[test]
    fn plan_mode_prompt_forbids_edits() {
        let prompt = plan_mode_prompt();
        let lower = prompt.to_lowercase();
        assert!(lower.contains("do not edit"));
        assert!(lower.contains("plan mode"));
    }
}
