use adl_types::agent::AgentId;
use adl_types::conversation::ConversationScenario;

/// Select the agent to handle a user message.
/// Rules (first match wins):
/// 1. Scenario::Plan → AgentId::Plan
/// 2. User explicitly invoked /plan → AgentId::Plan
/// 3. Default → AgentId::Build
pub fn select(scenario: ConversationScenario, user_prompt: &str) -> AgentId {
    if scenario == ConversationScenario::Plan {
        return AgentId::Plan;
    }
    let trimmed = user_prompt.trim_start();
    if trimmed == "/plan" || trimmed.starts_with("/plan ") {
        return AgentId::Plan;
    }
    AgentId::Build
}

/// Select agent for sub-agent dispatch (only subagents are valid).
pub fn select_subagent(subagent_type: &str) -> Option<AgentId> {
    match subagent_type {
        "general" => Some(AgentId::General),
        "explore" => Some(AgentId::Explore),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_scenario_selects_plan_agent() {
        let agent = select(ConversationScenario::Plan, "any prompt");
        assert_eq!(agent, AgentId::Plan);
    }

    #[test]
    fn plan_slash_command_selects_plan_agent() {
        let agent = select(ConversationScenario::Chat, "/plan analyze the auth flow");
        assert_eq!(agent, AgentId::Plan);
    }

    #[test]
    fn default_selects_build_agent() {
        let agent = select(ConversationScenario::Chat, "add a login form");
        assert_eq!(agent, AgentId::Build);
    }

    #[test]
    fn code_edit_scenario_selects_build_agent() {
        let agent = select(ConversationScenario::CodeEdit, "refactor the parser");
        assert_eq!(agent, AgentId::Build);
    }

    #[test]
    fn plan_slash_command_exact_only() {
        let agent = select(ConversationScenario::Chat, "/plan");
        assert_eq!(agent, AgentId::Plan);
    }

    #[test]
    fn plan_slash_command_with_args() {
        let agent = select(ConversationScenario::Chat, "/plan analyze auth");
        assert_eq!(agent, AgentId::Plan);
    }

    #[test]
    fn planning_does_not_trigger_plan_mode() {
        let agent = select(ConversationScenario::Chat, "/planning the next steps");
        assert_ne!(agent, AgentId::Plan);
    }

    #[test]
    fn select_subagent_general() {
        assert_eq!(select_subagent("general"), Some(AgentId::General));
    }

    #[test]
    fn select_subagent_explore() {
        assert_eq!(select_subagent("explore"), Some(AgentId::Explore));
    }

    #[test]
    fn select_subagent_unknown_returns_none() {
        assert_eq!(select_subagent("unknown"), None);
    }

    #[test]
    fn select_subagent_primary_returns_none() {
        assert_eq!(select_subagent("build"), None);
    }
}
