use adl_kernel::types::agent::{AgentConfig, AgentId, AgentMode};
use std::collections::HashMap;

/// Registry of available agents (built-in + custom).
#[derive(Debug, Clone)]
pub struct AgentRegistry {
    agents: HashMap<AgentId, AgentConfig>,
}

impl AgentRegistry {
    pub fn new() -> Self {
        let mut agents = HashMap::new();
        for config in AgentConfig::all_built_in() {
            agents.insert(config.id, config);
        }
        Self { agents }
    }

    pub fn get(&self, id: AgentId) -> Option<&AgentConfig> {
        self.agents.get(&id)
    }

    pub fn list_primary(&self) -> Vec<&AgentConfig> {
        self.agents.values().filter(|c| c.mode == AgentMode::Primary && !c.hidden).collect()
    }

    pub fn list_subagent(&self) -> Vec<&AgentConfig> {
        self.agents.values().filter(|c| c.mode == AgentMode::Subagent && !c.hidden).collect()
    }

    pub fn list_hidden(&self) -> Vec<&AgentConfig> {
        self.agents.values().filter(|c| c.mode == AgentMode::Hidden).collect()
    }

    pub fn register(&mut self, config: AgentConfig) {
        self.agents.insert(config.id, config);
    }

    pub fn all(&self) -> Vec<&AgentConfig> {
        self.agents.values().collect()
    }
}

impl Default for AgentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_all_built_in_agents() {
        let registry = AgentRegistry::new();
        assert!(registry.get(AgentId::Build).is_some());
        assert!(registry.get(AgentId::Plan).is_some());
        assert!(registry.get(AgentId::General).is_some());
        assert!(registry.get(AgentId::Explore).is_some());
        assert!(registry.get(AgentId::Compaction).is_some());
        assert!(registry.get(AgentId::Title).is_some());
        assert!(registry.get(AgentId::Summary).is_some());
    }

    #[test]
    fn list_primary_returns_build_and_plan() {
        let registry = AgentRegistry::new();
        let primary = registry.list_primary();
        let names: Vec<&str> = primary.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"plan"));
        assert_eq!(primary.len(), 2);
    }

    #[test]
    fn list_subagent_returns_general_and_explore() {
        let registry = AgentRegistry::new();
        let subagents = registry.list_subagent();
        let names: Vec<&str> = subagents.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"general"));
        assert!(names.contains(&"explore"));
        assert_eq!(subagents.len(), 2);
    }

    #[test]
    fn list_hidden_returns_system_agents() {
        let registry = AgentRegistry::new();
        let hidden = registry.list_hidden();
        assert_eq!(hidden.len(), 3);
    }

    #[test]
    fn register_adds_custom_agent() {
        let mut registry = AgentRegistry::new();
        let custom = AgentConfig::built_in(AgentId::Custom);
        registry.register(custom);
        assert!(registry.get(AgentId::Custom).is_some());
    }
}
