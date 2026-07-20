use crate::McpServerConfig;
use rmcp::transport::TokioChildProcess;
use std::collections::HashSet;

/// Blocks dangerous environment variable overrides in MCP server configs.
#[derive(Debug, Clone)]
pub struct McpEnvBlocker {
    pub blocked_keys: HashSet<String>,
}

impl Default for McpEnvBlocker {
    fn default() -> Self {
        Self {
            blocked_keys: [
                "PATH",
                "LD_PRELOAD",
                "LD_LIBRARY_PATH",
                "DYLD_INSERT_LIBRARIES",
                "DYLD_LIBRARY_PATH",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect(),
        }
    }
}

impl McpEnvBlocker {
    pub fn has_blocked_keys(&self, env: &std::collections::HashMap<String, String>) -> bool {
        env.keys().any(|k| self.blocked_keys.contains(k))
    }
}

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

        let env_blocker = McpEnvBlocker::default();
        if env_blocker.has_blocked_keys(&self.config.env) {
            let blocked: Vec<_> = self
                .config
                .env
                .keys()
                .filter(|k| env_blocker.blocked_keys.contains(*k))
                .cloned()
                .collect();
            return Err(adl_errors::AppError::Security(format!(
                "MCP server '{}' config attempts to override blocked env vars: {:?}. \
                 Remove these from .mcp.json env section.",
                self.config.name, blocked
            )));
        }

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

    #[test]
    fn rejects_dangerous_env_vars() {
        let dangerous_keys = vec!["PATH", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "LD_LIBRARY_PATH"];
        let blocker = McpEnvBlocker::default();
        for key in &dangerous_keys {
            let mut env = HashMap::new();
            env.insert(key.to_string(), "/malicious/path".to_string());
            assert!(blocker.has_blocked_keys(&env), "expected env key '{}' to be blocked", key);
        }
    }

    #[test]
    fn allows_safe_env_vars() {
        let mut env = HashMap::new();
        env.insert("NODE_ENV".to_string(), "production".to_string());
        env.insert("API_URL".to_string(), "https://example.com".to_string());
        let blocker = McpEnvBlocker::default();
        assert!(!blocker.has_blocked_keys(&env));
    }

    #[tokio::test]
    async fn connect_rejects_blocked_env() {
        let config = McpServerConfig {
            name: "malicious".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("echo".to_string()),
            args: vec![],
            url: None,
            env: HashMap::from([("PATH".to_string(), "/malicious".to_string())]),
            oauth: false,
            enabled: true,
        };
        let transport = StdioTransport::new(config);
        let result = transport.connect().await;
        assert!(result.is_err());
        assert!(matches!(result, Err(adl_errors::AppError::Security(_))));
    }
}
