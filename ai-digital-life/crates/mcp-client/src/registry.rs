use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

/// Transport type for an MCP server connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../frontend/src/shared/ipc/generated/")]
pub enum McpTransportType {
    Stdio,
    Sse,
    StreamableHttp,
}

/// Registry of configured MCP servers.
#[derive(Debug, Clone, Default)]
pub struct McpServerRegistry {
    servers: HashMap<String, super::McpServerConfig>,
}

impl McpServerRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, config: super::McpServerConfig) {
        self.servers.insert(config.name.clone(), config);
    }

    pub fn remove(&mut self, name: &str) -> Option<super::McpServerConfig> {
        self.servers.remove(name)
    }

    pub fn get(&self, name: &str) -> Option<&super::McpServerConfig> {
        self.servers.get(name)
    }

    pub fn list(&self) -> Vec<&super::McpServerConfig> {
        self.servers.values().collect()
    }

    pub fn list_enabled(&self) -> Vec<&super::McpServerConfig> {
        self.servers.values().filter(|c| c.enabled).collect()
    }

    /// Load registry from a .mcp.json file.
    pub fn from_json_file(path: &std::path::Path) -> Result<Self, adl_errors::AppError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to read .mcp.json: {}", e)))?;
        Self::from_json_str(&content)
    }

    /// Parse registry from JSON string.
    pub fn from_json_str(json: &str) -> Result<Self, adl_errors::AppError> {
        let raw: HashMap<String, serde_json::Value> = serde_json::from_str(json)
            .map_err(|e| adl_errors::AppError::InvalidInput(format!("Invalid .mcp.json: {}", e)))?;

        let mut registry = Self::new();
        for (name, value) in raw {
            let config = parse_server_config(&name, &value)?;
            registry.add(config);
        }
        Ok(registry)
    }
}

fn parse_server_config(
    name: &str,
    value: &serde_json::Value,
) -> Result<super::McpServerConfig, adl_errors::AppError> {
    let transport_str = value.get("transport").and_then(|v| v.as_str()).unwrap_or("stdio");
    let transport = match transport_str {
        "stdio" => McpTransportType::Stdio,
        "sse" => McpTransportType::Sse,
        "streamable-http" | "streamable_http" => McpTransportType::StreamableHttp,
        _ => McpTransportType::Stdio,
    };

    Ok(super::McpServerConfig {
        name: name.to_string(),
        transport,
        command: value.get("command").and_then(|v| v.as_str()).map(String::from),
        args: value
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        url: value.get("url").and_then(|v| v.as_str()).map(String::from),
        env: value
            .get("env")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default(),
        oauth: value.get("oauth").and_then(|v| v.as_bool()).unwrap_or(false),
        enabled: value.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stdio_config() {
        let json = r#"{
            "test-server": {
                "command": "npx",
                "args": ["-y", "@mcp/server"],
                "env": { "API_KEY": "xxx" }
            }
        }"#;
        let registry = McpServerRegistry::from_json_str(json).unwrap();
        let config = registry.get("test-server").unwrap();
        assert_eq!(config.transport, McpTransportType::Stdio);
        assert_eq!(config.command.as_deref(), Some("npx"));
        assert_eq!(config.args.len(), 2);
        assert!(config.enabled);
    }

    #[test]
    fn parse_sse_config() {
        let json = r#"{
            "remote-server": {
                "transport": "sse",
                "url": "https://example.com/mcp/sse"
            }
        }"#;
        let registry = McpServerRegistry::from_json_str(json).unwrap();
        let config = registry.get("remote-server").unwrap();
        assert_eq!(config.transport, McpTransportType::Sse);
        assert_eq!(config.url.as_deref(), Some("https://example.com/mcp/sse"));
    }

    #[test]
    fn list_enabled_filters_disabled() {
        let mut registry = McpServerRegistry::new();
        registry.add(super::super::McpServerConfig {
            name: "enabled".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: true,
        });
        registry.add(super::super::McpServerConfig {
            name: "disabled".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: false,
        });
        assert_eq!(registry.list_enabled().len(), 1);
    }
}
