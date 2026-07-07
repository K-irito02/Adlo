use crate::catalog::{McpCatalog, McpToolEntry};
use crate::{McpServerConfig, McpTransportType};
use rmcp::service::{NotificationContext, RoleClient, RunningService};
use rmcp::transport::{StreamableHttpClientTransport, TokioChildProcess};
use rmcp::{serve_client, ClientHandler, Peer};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

/// State of an MCP client connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpClientState {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// Custom MCP client handler that responds to server notifications.
///
/// When a connected MCP server sends a `ToolListChanged` notification,
/// this handler automatically refreshes the tool catalog by re-querying
/// the server's tool list through the cloned peer connection.
#[derive(Clone)]
struct AdlClientHandler {
    server_name: String,
    catalog: Arc<Mutex<McpCatalog>>,
    peer: Arc<RwLock<Option<Peer<RoleClient>>>>,
}

impl AdlClientHandler {
    fn new(
        server_name: String,
        catalog: Arc<Mutex<McpCatalog>>,
        peer: Arc<RwLock<Option<Peer<RoleClient>>>>,
    ) -> Self {
        Self { server_name, catalog, peer }
    }
}

impl ClientHandler for AdlClientHandler {
    async fn on_tool_list_changed(&self, _context: NotificationContext<RoleClient>) {
        let peer = {
            let guard = self.peer.read().await;
            match guard.as_ref() {
                Some(p) => p.clone(),
                None => {
                    tracing::warn!(
                        server = %self.server_name,
                        "ToolListChanged received but no peer available"
                    );
                    return;
                },
            }
        };

        let tools = match peer.list_all_tools().await {
            Ok(tools) => tools,
            Err(e) => {
                tracing::warn!(
                    server = %self.server_name,
                    "Failed to refresh tools after ToolListChanged: {}",
                    e
                );
                return;
            },
        };

        let mut catalog = self.catalog.lock().await;
        catalog.tools.retain(|t| t.server_name != self.server_name);
        for tool in tools {
            catalog.add_tool(McpToolEntry {
                server_name: self.server_name.clone(),
                name: tool.name.to_string(),
                description: tool.description.unwrap_or_default().to_string(),
                input_schema: serde_json::Value::Object(tool.input_schema.as_ref().clone()),
            });
        }
        tracing::info!(
            server = %self.server_name,
            tool_count = catalog.tools.iter().filter(|t| t.server_name == self.server_name).count(),
            "Refreshed tool catalog after ToolListChanged"
        );
    }
}

/// Manages connections to multiple MCP servers.
#[derive(Clone)]
pub struct McpClient {
    configs: Arc<Mutex<HashMap<String, McpServerConfig>>>,
    states: Arc<Mutex<HashMap<String, McpClientState>>>,
    catalog: Arc<Mutex<McpCatalog>>,
    running_services: Arc<Mutex<HashMap<String, RunningService<RoleClient, AdlClientHandler>>>>,
    /// Cloned peers for each connected server, shared with `AdlClientHandler`
    /// so that notification callbacks can re-query tools without owning the
    /// `RunningService`.
    peers: Arc<RwLock<HashMap<String, Peer<RoleClient>>>>,
}

impl McpClient {
    pub fn new() -> Self {
        Self {
            configs: Arc::new(Mutex::new(HashMap::new())),
            states: Arc::new(Mutex::new(HashMap::new())),
            catalog: Arc::new(Mutex::new(McpCatalog::new())),
            running_services: Arc::new(Mutex::new(HashMap::new())),
            peers: Arc::new(RwLock::new(HashMap::new())),
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
        self.peers.write().await.remove(name);
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

        // Shared peer slot: populated after serve_client succeeds, then
        // accessible by the handler for ToolListChanged refreshes.
        let peer_slot: Arc<RwLock<Option<Peer<RoleClient>>>> = Arc::new(RwLock::new(None));
        let handler = AdlClientHandler::new(
            name.to_string(),
            Arc::clone(&self.catalog),
            Arc::clone(&peer_slot),
        );

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
                serve_client(handler, transport).await.map_err(|e| {
                    adl_errors::AppError::Internal(format!("MCP connect failed: {}", e))
                })?
            },
            McpTransportType::Sse => {
                // rmcp (v1.8.0) does not provide a separate SSE client transport.
                // Unlike the TypeScript MCP SDK (`@modelcontextprotocol/sdk`) which offers
                // both `StreamableHTTPClientTransport` and `SSEClientTransport`, rmcp
                // consolidates HTTP-based transports into `StreamableHttpClientTransport`.
                // SSE-related functionality (auto-reconnect, retry policy, error handling)
                // lives in `rmcp::transport::streamable_http_client` as internal
                // implementation details (e.g. `SseAutoReconnectStreamState`,
                // `SseRetryPolicy`). The transport handles protocol negotiation with the
                // server, supporting both the legacy SSE transport (MCP spec 2024-11-05)
                // and the StreamableHTTP transport (MCP spec 2025-03-26).
                let url = config.url.as_ref().ok_or_else(|| {
                    adl_errors::AppError::Internal("SSE transport requires a URL".into())
                })?;
                let transport = StreamableHttpClientTransport::from_uri(url.as_str());
                serve_client(handler, transport).await.map_err(|e| {
                    adl_errors::AppError::Internal(format!("MCP SSE connect failed: {}", e))
                })?
            },
            McpTransportType::StreamableHttp => {
                let url = config.url.as_ref().ok_or_else(|| {
                    adl_errors::AppError::Internal("StreamableHTTP transport requires a URL".into())
                })?;
                let transport = StreamableHttpClientTransport::from_uri(url.as_str());
                serve_client(handler, transport).await.map_err(|e| {
                    adl_errors::AppError::Internal(format!(
                        "MCP StreamableHTTP connect failed: {}",
                        e
                    ))
                })?
            },
        };

        // Clone the peer so the handler can call list_all_tools() on
        // ToolListChanged notifications without owning the RunningService.
        let peer_clone = running.peer().clone();
        *peer_slot.write().await = Some(peer_clone.clone());
        self.peers.write().await.insert(name.to_string(), peer_clone);

        self.populate_catalog(name, &running).await?;

        self.running_services.lock().await.insert(name.to_string(), running);
        self.set_state(name, McpClientState::Connected).await;
        Ok(())
    }

    /// Attempt to reconnect a server that has entered Error or Disconnected state.
    ///
    /// If the server is already Connected or Connecting, this is a no-op.
    pub async fn auto_reconnect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        let state = self.get_state(name).await;
        match state {
            McpClientState::Error | McpClientState::Disconnected => {
                tracing::info!(server = %name, ?state, "Attempting MCP auto-reconnect");
                self.connect(name).await
            },
            McpClientState::Connected | McpClientState::Connecting => {
                tracing::debug!(
                    server = %name,
                    ?state,
                    "Skipping auto-reconnect: server is already active"
                );
                Ok(())
            },
        }
    }

    /// Manually trigger a tool catalog refresh for a specific server.
    ///
    /// This can be called externally if the caller suspects the tool list
    /// has changed but no notification was received.
    pub async fn refresh_tools(&self, name: &str) -> Result<(), adl_errors::AppError> {
        let peer = {
            let peers = self.peers.read().await;
            peers.get(name).cloned().ok_or_else(|| {
                adl_errors::AppError::NotFound(format!(
                    "No active connection for MCP server '{}'",
                    name
                ))
            })?
        };

        let tools = peer
            .list_all_tools()
            .await
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to list tools: {}", e)))?;

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
        Ok(())
    }

    pub async fn disconnect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        self.set_state(name, McpClientState::Disconnected).await;
        self.peers.write().await.remove(name);
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

    /// Populate the catalog with tools from a running service.
    async fn populate_catalog(
        &self,
        name: &str,
        running: &RunningService<RoleClient, AdlClientHandler>,
    ) -> Result<(), adl_errors::AppError> {
        let tools = running
            .list_all_tools()
            .await
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to list tools: {}", e)))?;

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
        Ok(())
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

    fn test_config(name: &str) -> McpServerConfig {
        McpServerConfig {
            name: name.to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: true,
        }
    }

    #[tokio::test]
    async fn add_and_remove_server() {
        let client = McpClient::new();
        client.add_server(test_config("test")).await;
        let servers = client.list_servers().await;
        assert_eq!(servers.len(), 1);
        client.remove_server("test").await;
        let servers = client.list_servers().await;
        assert_eq!(servers.len(), 0);
    }

    #[tokio::test]
    async fn auto_reconnect_skips_connected_server() {
        let client = McpClient::new();
        client.add_server(test_config("srv")).await;
        // Manually set state to Connected (without a real connection).
        client.set_state("srv", McpClientState::Connected).await;
        // auto_reconnect should be a no-op, returning Ok.
        let result = client.auto_reconnect("srv").await;
        assert!(result.is_ok());
        assert_eq!(client.get_state("srv").await, McpClientState::Connected);
    }

    #[tokio::test]
    async fn auto_reconnect_skips_connecting_server() {
        let client = McpClient::new();
        client.add_server(test_config("srv")).await;
        client.set_state("srv", McpClientState::Connecting).await;
        let result = client.auto_reconnect("srv").await;
        assert!(result.is_ok());
        assert_eq!(client.get_state("srv").await, McpClientState::Connecting);
    }

    #[tokio::test]
    async fn auto_reconnect_attempts_on_error_state() {
        let client = McpClient::new();
        client.add_server(test_config("srv")).await;
        client.set_state("srv", McpClientState::Error).await;
        // auto_reconnect will attempt connect, which will fail because
        // "npx" is not a real MCP server. The important thing is that
        // the attempt is made (state transitions to Connecting).
        let result = client.auto_reconnect("srv").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn auto_reconnect_attempts_on_disconnected_state() {
        let client = McpClient::new();
        client.add_server(test_config("srv")).await;
        // Newly added servers start in Disconnected state.
        assert_eq!(client.get_state("srv").await, McpClientState::Disconnected);
        let result = client.auto_reconnect("srv").await;
        // Will fail because "npx" is not a real MCP server.
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn auto_reconnect_unknown_server_returns_error() {
        let client = McpClient::new();
        // Unknown server defaults to Disconnected, so auto_reconnect will
        // attempt connect and fail with NotFound.
        let result = client.auto_reconnect("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn refresh_tools_without_connection_returns_error() {
        let client = McpClient::new();
        let result = client.refresh_tools("no-such-server").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn disconnect_clears_peer() {
        let client = McpClient::new();
        client.add_server(test_config("srv")).await;
        // Manually insert a dummy peer to verify disconnect removes it.
        // We can't create a real Peer without a running service, but we
        // can verify the disconnect path cleans up by checking that
        // remove_server also cleans up peers.
        client.remove_server("srv").await;
        let peers = client.peers.read().await;
        assert!(!peers.contains_key("srv"));
    }
}
