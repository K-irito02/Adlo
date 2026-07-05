//! StreamableHTTP transport for MCP servers.

use crate::McpServerConfig;

/// Connects to an MCP server via StreamableHTTP.
pub struct StreamableHttpTransport {
    pub config: McpServerConfig,
}

impl StreamableHttpTransport {
    pub fn new(config: McpServerConfig) -> Self {
        Self { config }
    }

    pub async fn connect(&self) -> Result<(), adl_errors::AppError> {
        tracing::info!(url = ?self.config.url, "StreamableHttpTransport connect (stub)");
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
            transport: McpTransportType::StreamableHttp,
            command: None,
            args: vec![],
            url: Some("https://example.com/mcp".to_string()),
            env: HashMap::new(),
            oauth: false,
            enabled: true,
        };
        let transport = StreamableHttpTransport::new(config);
        assert_eq!(transport.config.name, "test");
    }
}
