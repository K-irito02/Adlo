use adl_types::agent::AgentId;

/// Returns the system prompt for the given agent.
/// These are minimal stubs; Phase 2-B will expand with provider-specific prompts.
pub fn agent_system_prompt(id: AgentId) -> String {
    match id {
        AgentId::Build => BUILD_PROMPT.to_string(),
        AgentId::Plan => PLAN_PROMPT.to_string(),
        AgentId::General => GENERAL_PROMPT.to_string(),
        AgentId::Explore => EXPLORE_PROMPT.to_string(),
        AgentId::Compaction => COMPACTION_PROMPT.to_string(),
        AgentId::Title => TITLE_PROMPT.to_string(),
        AgentId::Summary => SUMMARY_PROMPT.to_string(),
        AgentId::Custom => CUSTOM_PROMPT.to_string(),
    }
}

const CUSTOM_PROMPT: &str = "You are a custom agent configured by the user. Follow the user's custom instructions to complete the task.";

/// Reminder injected into plan mode to prevent edits.
pub fn plan_mode_reminder() -> &'static str {
    "You are in plan mode. Do NOT edit files, run commands that modify state, or apply patches. Only analyze and produce a plan."
}

const BUILD_PROMPT: &str = "You are the build agent. Your job is to help the user build and edit code. Use available tools to read files, search the codebase, create patches, and apply them after approval. Always explain your changes before applying.";

const PLAN_PROMPT: &str = "You are the plan agent. Your job is to analyze the user's request and produce a detailed implementation plan WITHOUT making any changes. Read files, search the codebase, and think through the design. Output a plan in markdown with clear steps. Do not use write tools.";

const GENERAL_PROMPT: &str = "You are the general sub-agent. You handle multi-step tasks delegated by the primary agent. Break down the task, use tools as needed, and return a concise summary of your findings or results.";

const EXPLORE_PROMPT: &str = "You are the explore sub-agent. Your job is to explore the codebase and answer questions about it. Use read, glob, grep, and outline tools. Do not modify any files. Return a structured summary of what you found.";

const COMPACTION_PROMPT: &str = "You are the compaction system agent. Your job is to summarize a conversation so far, preserving key decisions, file paths, and context. Output a concise summary that retains enough information to continue the work.";

const TITLE_PROMPT: &str = "You are the title system agent. Generate a short (3-6 words) descriptive title for the conversation based on its content. Output only the title, no other text.";

const SUMMARY_PROMPT: &str = "You are the summary system agent. Generate a concise summary of what was accomplished in this session. Output a markdown summary with key changes and outcomes.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_prompt_mentions_tools() {
        let prompt = agent_system_prompt(AgentId::Build);
        assert!(prompt.to_lowercase().contains("tool"));
    }

    #[test]
    fn plan_prompt_forbids_edits() {
        let prompt = agent_system_prompt(AgentId::Plan);
        let lower = prompt.to_lowercase();
        assert!(lower.contains("not") || lower.contains("do not") || lower.contains("without"));
    }

    #[test]
    fn explore_prompt_is_readonly() {
        let prompt = agent_system_prompt(AgentId::Explore);
        assert!(prompt.to_lowercase().contains("do not modify"));
    }

    #[test]
    fn plan_mode_reminder_is_nonempty() {
        assert!(!plan_mode_reminder().is_empty());
        assert!(plan_mode_reminder().to_lowercase().contains("plan mode"));
    }

    #[test]
    fn every_agent_has_prompt() {
        for id in [
            AgentId::Build,
            AgentId::Plan,
            AgentId::General,
            AgentId::Explore,
            AgentId::Compaction,
            AgentId::Title,
            AgentId::Summary,
            AgentId::Custom,
        ] {
            let prompt = agent_system_prompt(id);
            assert!(!prompt.is_empty(), "Agent {:?} has empty prompt", id);
        }
    }
}
