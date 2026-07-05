use adl_kernel::types::agent::{AgentConfig, AgentMode};

/// Derive the permission configuration for a sub-agent from its parent.
/// Sub-agents inherit a restricted subset of the parent's permissions:
/// - Never get write tools (even if parent is Primary)
/// - Inherit the parent's allowed read tools
pub fn derive_subagent_permission(_parent: &AgentConfig, subagent: &AgentConfig) -> AgentConfig {
    let mut derived = subagent.clone();
    // Sub-agents never get write tools regardless of parent
    derived.allows_write_tools = false;
    derived.mode = AgentMode::Subagent;
    derived
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::types::agent::AgentId;

    #[test]
    fn subagent_never_gets_write_tools() {
        let parent = AgentConfig::built_in(AgentId::Build);
        let mut subagent = AgentConfig::built_in(AgentId::General);
        subagent.allows_write_tools = true; // try to give it write tools
        let derived = derive_subagent_permission(&parent, &subagent);
        assert!(!derived.allows_write_tools);
        assert_eq!(derived.mode, AgentMode::Subagent);
    }
}
