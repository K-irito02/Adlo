pub mod catalog;
pub mod client;
pub mod oauth;
pub mod registry;
pub mod tools;
pub mod transport;

pub use catalog::{McpCatalog, McpResourceEntry, McpToolEntry};
pub use client::{McpClient, McpClientState};
pub use registry::{McpServerRegistry, McpTransportType};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Configuration for a single MCP server (from .mcp.json or user config).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub name: String,
    pub transport: McpTransportType,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env: std::collections::HashMap<String, String>,
    pub oauth: bool,
    pub enabled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_roundtrip() {
        let config = McpServerConfig {
            name: "test-server".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server".to_string()],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: true,
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: McpServerConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test-server");
        assert_eq!(deserialized.transport, McpTransportType::Stdio);
    }
}
