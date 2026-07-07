const DEFAULT_PROMPT: &str = include_str!("default.txt");
const ANTHROPIC_PROMPT: &str = include_str!("anthropic.txt");
const OPENAI_PROMPT: &str = include_str!("openai.txt");
const GEMINI_PROMPT: &str = include_str!("gemini.txt");
const PLAN_MODE_PROMPT: &str = include_str!("plan_mode.txt");

/// Returns the provider-specific system prompt.
pub fn provider_prompt(provider: &str) -> &'static str {
    match provider {
        "anthropic" => ANTHROPIC_PROMPT,
        "openai" => OPENAI_PROMPT,
        "google" => GEMINI_PROMPT,
        "deepseek" => OPENAI_PROMPT,
        "minimax" => OPENAI_PROMPT,
        "ollama" => DEFAULT_PROMPT,
        "openrouter" => DEFAULT_PROMPT,
        _ => DEFAULT_PROMPT,
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
            "deepseek", "minimax", "openai", "anthropic", "google", "ollama", "openrouter",
        ] {
            let prompt = provider_prompt(provider);
            assert!(!prompt.is_empty(), "Provider {provider} has empty prompt");
        }
    }

    #[test]
    fn anthropic_prompt_mentions_xml() {
        let prompt = provider_prompt("anthropic");
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
