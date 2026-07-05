use crate::catalog::McpCatalog;
use crate::{McpServerConfig, McpTransportType};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// State of an MCP client connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpClientState {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// Manages connections to multiple MCP servers.
#[derive(Debug, Clone)]
pub struct McpClient {
    configs: Arc<Mutex<HashMap<String, McpServerConfig>>>,
    states: Arc<Mutex<HashMap<String, McpClientState>>>,
    catalog: Arc<Mutex<McpCatalog>>,
}

impl McpClient {
    pub fn new() -> Self {
        Self {
            configs: Arc::new(Mutex::new(HashMap::new())),
            states: Arc::new(Mutex::new(HashMap::new())),
            catalog: Arc::new(Mutex::new(McpCatalog::new())),
        }
    }

    pub async fn add_server(&self, config: McpServerConfig) {
        let name = config.name.clone();
        self.configs.lock().await.insert(name.clone(), config);
        self.states.lock().await.insert(name, McpClientState::Disconnected);
    }

    pub async fn remove_server(&self, name: &str) {
        self.configs.lock().await.remove(name);
        self.states.lock().await.remove(name);
    }

    pub async fn connect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        let config = {
            let configs = self.configs.lock().await;
            configs.get(name).cloned().ok_or_else(|| {
                adl_errors::AppError::NotFound(format!("MCP server '{}' not found", name))
            })?
        };

        self.set_state(name, McpClientState::Connecting).await;

        // Actual connection logic depends on transport type
        // For now, mark as connected (full impl in transport modules)
        match config.transport {
            McpTransportType::Stdio => {
                // Will use rmcp StdioClientTransport
                tracing::info!("Connecting to MCP server '{}' via stdio", name);
            },
            McpTransportType::Sse => {
                tracing::info!("Connecting to MCP server '{}' via SSE", name);
            },
            McpTransportType::StreamableHttp => {
                tracing::info!("Connecting to MCP server '{}' via StreamableHTTP", name);
            },
        }

        self.set_state(name, McpClientState::Connected).await;
        Ok(())
    }

    pub async fn disconnect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        self.set_state(name, McpClientState::Disconnected).await;
        Ok(())
    }

    pub async fn get_state(&self, name: &str) -> McpClientState {
        self.states.lock().await.get(name).copied().unwrap_or(McpClientState::Disconnected)
    }

    pub async fn list_servers(&self) -> Vec<(String, McpClientState)> {
        let configs = self.configs.lock().await;
        let states = self.states.lock().await;
        configs
            .keys()
            .map(|name| {
                (name.clone(), states.get(name).copied().unwrap_or(McpClientState::Disconnected))
            })
            .collect()
    }

    pub async fn catalog(&self) -> McpCatalog {
        self.catalog.lock().await.clone()
    }

    async fn set_state(&self, name: &str, state: McpClientState) {
        self.states.lock().await.insert(name.to_string(), state);
    }
}

impl Default for McpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn add_and_remove_server() {
        let client = McpClient::new();
        let config = McpServerConfig {
            name: "test".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: true,
        };
        client.add_server(config).await;
        let servers = client.list_servers().await;
        assert_eq!(servers.len(), 1);
        client.remove_server("test").await;
        let servers = client.list_servers().await;
        assert_eq!(servers.len(), 0);
    }
}
