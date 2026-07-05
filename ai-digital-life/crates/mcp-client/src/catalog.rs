use serde::{Deserialize, Serialize};

/// A tool provided by an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolEntry {
    pub server_name: String,
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// A resource provided by an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResourceEntry {
    pub server_name: String,
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

/// Aggregated catalog of tools and resources from all connected MCP servers.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct McpCatalog {
    pub tools: Vec<McpToolEntry>,
    pub resources: Vec<McpResourceEntry>,
}

impl McpCatalog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_tool(&mut self, tool: McpToolEntry) {
        self.tools.push(tool);
    }

    pub fn add_resource(&mut self, resource: McpResourceEntry) {
        self.resources.push(resource);
    }

    pub fn find_tool(&self, name: &str) -> Option<&McpToolEntry> {
        self.tools.iter().find(|t| t.name == name)
    }

    pub fn tool_names(&self) -> Vec<String> {
        self.tools.iter().map(|t| t.name.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_adds_and_finds_tools() {
        let mut catalog = McpCatalog::new();
        catalog.add_tool(McpToolEntry {
            server_name: "test".to_string(),
            name: "search".to_string(),
            description: "Search the web".to_string(),
            input_schema: serde_json::json!({}),
        });
        assert!(catalog.find_tool("search").is_some());
        assert!(catalog.find_tool("missing").is_none());
        assert_eq!(catalog.tool_names(), vec!["search"]);
    }
}
