use crate::McpServerConfig;
use rmcp::transport::TokioChildProcess;

pub struct StdioTransport {
    pub config: McpServerConfig,
}

impl StdioTransport {
    pub fn new(config: McpServerConfig) -> Self {
        Self { config }
    }

    pub async fn connect(&self) -> Result<TokioChildProcess, adl_errors::AppError> {
        let command = self.config.command.clone().ok_or_else(|| {
            adl_errors::AppError::Internal("Stdio transport requires a command".into())
        })?;
        let args: Vec<String> = self.config.args.clone();

        let mut cmd = tokio::process::Command::new(&command);
        cmd.args(&args);
        for (key, value) in &self.config.env {
            cmd.env(key, value);
        }

        let transport = TokioChildProcess::new(cmd)
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to spawn MCP server: {}", e)))?;

        tracing::info!(command = ?self.config.command, "StdioTransport connected");
        Ok(transport)
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
