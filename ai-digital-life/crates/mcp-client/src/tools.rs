use crate::catalog::McpToolEntry;
use serde::{Deserialize, Serialize};

/// An MCP tool converted to the agent's internal tool format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentToolAdapter {
    pub server_name: String,
    pub tool_name: String,
    pub full_name: String, // "mcp__<server>__<tool>"
    pub description: String,
    pub input_schema: serde_json::Value,
}

impl AgentToolAdapter {
    pub fn from_mcp_entry(entry: &McpToolEntry) -> Self {
        Self {
            server_name: entry.server_name.clone(),
            tool_name: entry.name.clone(),
            full_name: format!("mcp__{}__{}", entry.server_name, entry.name),
            description: entry.description.clone(),
            input_schema: entry.input_schema.clone(),
        }
    }
}

/// Check for naming conflicts between MCP tools and built-in tools.
pub fn detect_naming_conflict(mcp_tool_name: &str, builtin_tool_names: &[&str]) -> bool {
    builtin_tool_names.contains(&mcp_tool_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_name_format() {
        let entry = McpToolEntry {
            server_name: "github".to_string(),
            name: "create_issue".to_string(),
            description: "".to_string(),
            input_schema: serde_json::json!({}),
        };
        let adapter = AgentToolAdapter::from_mcp_entry(&entry);
        assert_eq!(adapter.full_name, "mcp__github__create_issue");
    }

    #[test]
    fn conflict_detection() {
        assert!(detect_naming_conflict("read", &["read", "write", "search"]));
        assert!(!detect_naming_conflict("mcp_read", &["read", "write", "search"]));
    }
}
