//! Stdio transport for MCP servers (subprocess communication).

use crate::McpServerConfig;

/// Connects to an MCP server via subprocess stdio.
pub struct StdioTransport {
    pub config: McpServerConfig,
}

impl StdioTransport {
    pub fn new(config: McpServerConfig) -> Self {
        Self { config }
    }

    pub async fn connect(&self) -> Result<(), adl_errors::AppError> {
        tracing::info!(command = ?self.config.command, "StdioTransport connect (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::McpTransportType;
    use std::collections::HashMap;

    #[test]
    fn constructs_with_config() {
        let config = McpServerConfig {
            name: "test".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: HashMap::new(),
            oauth: false,
            enabled: true,
        };
        let transport = StdioTransport::new(config);
        assert_eq!(transport.config.name, "test");
    }
}
