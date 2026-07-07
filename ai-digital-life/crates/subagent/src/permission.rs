use adl_kernel::types::agent::{AgentConfig, AgentMode};

/// Derive the permission configuration for a sub-agent from its parent.
/// Sub-agents inherit a restricted subset of the parent's permissions:
/// - Never get write tools (even if parent is Primary)
/// - Inherit the parent's allowed read tools
pub fn derive_subagent_permission(parent: &AgentConfig, subagent: &AgentConfig) -> AgentConfig {
    let mut derived = subagent.clone();

    // Inherit parent's allowed tools, filtering out write tools
    let write_tools = ["write", "apply_patch", "edit"];
    derived.allowed_tools = parent
        .allowed_tools
        .iter()
        .filter(|tool| !write_tools.contains(&tool.as_str()))
        .cloned()
        .collect();

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

    #[test]
    fn subagent_inherits_parent_allowed_tools() {
        let mut parent = AgentConfig::built_in(AgentId::Build);
        parent.allowed_tools = vec!["read".into(), "write".into(), "bash".into(), "search".into()];

        let subagent = AgentConfig::built_in(AgentId::General);
        let derived = derive_subagent_permission(&parent, &subagent);

        // Subagent should inherit parent's read tools but not write tools
        assert!(derived.allowed_tools.contains(&"read".to_string()));
        assert!(derived.allowed_tools.contains(&"search".to_string()));
        assert!(derived.allowed_tools.contains(&"bash".to_string()));
        assert!(!derived.allowed_tools.contains(&"write".to_string()));
        assert!(!derived.allows_write_tools);
        assert_eq!(derived.mode, AgentMode::Subagent);
    }

    #[test]
    fn subagent_with_no_parent_tools_gets_empty() {
        let parent = AgentConfig::built_in(AgentId::Build);
        // parent.allowed_tools is empty by default
        let subagent = AgentConfig::built_in(AgentId::General);
        let derived = derive_subagent_permission(&parent, &subagent);

        // With no parent tools, subagent should have empty allowed_tools
        assert!(derived.allowed_tools.is_empty());
        assert!(!derived.allows_write_tools);
    }

    #[test]
    fn subagent_filters_all_write_tool_variants() {
        let mut parent = AgentConfig::built_in(AgentId::Build);
        parent.allowed_tools = vec![
            "read".into(),
            "write".into(),
            "apply_patch".into(),
            "edit".into(),
            "search".into(),
        ];

        let subagent = AgentConfig::built_in(AgentId::Explore);
        let derived = derive_subagent_permission(&parent, &subagent);

        // All write tools should be filtered out
        assert!(!derived.allowed_tools.contains(&"write".to_string()));
        assert!(!derived.allowed_tools.contains(&"apply_patch".to_string()));
        assert!(!derived.allowed_tools.contains(&"edit".to_string()));
        // Read tools should remain
        assert!(derived.allowed_tools.contains(&"read".to_string()));
        assert!(derived.allowed_tools.contains(&"search".to_string()));
        assert_eq!(derived.allowed_tools.len(), 2);
    }
}
