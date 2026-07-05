use crate::catalog::{McpCatalog, McpToolEntry};
use crate::{McpServerConfig, McpTransportType};
use rmcp::serve_client;
use rmcp::service::{RoleClient, RunningService};
use rmcp::transport::{StreamableHttpClientTransport, TokioChildProcess};
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
#[derive(Clone)]
pub struct McpClient {
    configs: Arc<Mutex<HashMap<String, McpServerConfig>>>,
    states: Arc<Mutex<HashMap<String, McpClientState>>>,
    catalog: Arc<Mutex<McpCatalog>>,
    running_services: Arc<Mutex<HashMap<String, RunningService<RoleClient, ()>>>>,
}

impl McpClient {
    pub fn new() -> Self {
        Self {
            configs: Arc::new(Mutex::new(HashMap::new())),
            states: Arc::new(Mutex::new(HashMap::new())),
            catalog: Arc::new(Mutex::new(McpCatalog::new())),
            running_services: Arc::new(Mutex::new(HashMap::new())),
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
        self.disconnect_inner(name).await;
    }

    pub async fn connect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        let config = {
            let configs = self.configs.lock().await;
            configs.get(name).cloned().ok_or_else(|| {
                adl_errors::AppError::NotFound(format!("MCP server '{}' not found", name))
            })?
        };

        self.disconnect_inner(name).await;
        self.set_state(name, McpClientState::Connecting).await;

        let running = match config.transport {
            McpTransportType::Stdio => {
                let command = config.command.clone().ok_or_else(|| {
                    adl_errors::AppError::Internal("Stdio transport requires a command".into())
                })?;
                let mut cmd = tokio::process::Command::new(&command);
                cmd.args(&config.args);
                for (key, value) in &config.env {
                    cmd.env(key, value);
                }
                let transport = TokioChildProcess::new(cmd).map_err(|e| {
                    adl_errors::AppError::Io(format!("Failed to spawn MCP server: {}", e))
                })?;
                serve_client((), transport).await.map_err(|e| {
                    adl_errors::AppError::Internal(format!("MCP connect failed: {}", e))
                })?
            },
            McpTransportType::Sse | McpTransportType::StreamableHttp => {
                let url = config.url.as_ref().ok_or_else(|| {
                    adl_errors::AppError::Internal("HTTP transport requires a URL".into())
                })?;
                let transport = StreamableHttpClientTransport::from_uri(url.as_str());
                serve_client((), transport).await.map_err(|e| {
                    adl_errors::AppError::Internal(format!("MCP connect failed: {}", e))
                })?
            },
        };

        let tools = running
            .list_all_tools()
            .await
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to list tools: {}", e)))?;

        {
            let mut catalog = self.catalog.lock().await;
            catalog.tools.retain(|t| t.server_name != name);
            for tool in tools {
                catalog.add_tool(McpToolEntry {
                    server_name: name.to_string(),
                    name: tool.name.to_string(),
                    description: tool.description.unwrap_or_default().to_string(),
                    input_schema: serde_json::Value::Object(tool.input_schema.as_ref().clone()),
                });
            }
        }

        self.running_services.lock().await.insert(name.to_string(), running);
        self.set_state(name, McpClientState::Connected).await;
        Ok(())
    }

    pub async fn disconnect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        self.set_state(name, McpClientState::Disconnected).await;
        self.disconnect_inner(name).await;
        Ok(())
    }

    async fn disconnect_inner(&self, name: &str) {
        if let Some(mut service) = self.running_services.lock().await.remove(name) {
            if let Err(e) = service.close().await {
                tracing::warn!(server = %name, "Error closing MCP connection: {}", e);
            }
        }
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
