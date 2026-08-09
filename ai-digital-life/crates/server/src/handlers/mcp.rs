//! MCP domain HTTP handlers — migrated from `src-tauri/src/commands/mcp.rs`
//! (`mcp_*` tauri commands). The [`McpClient`] lives on
//! [`ServerState::mcp_client`] (the Tauri original used a module-level static —
//! the field mirrors it for the standalone server). Server CRUD / connection
//! management / catalog and `.mcp.json` loading are ported faithfully. No
//! events are emitted by the Tauri originals — faithful parity.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_mcp_client::{McpCatalog, McpClient, McpServerConfig};
use axum::extract::State;
use axum::response::IntoResponse;
use futures::future::join_all;

#[derive(serde::Serialize)]
struct McpServerInfo {
    pub name: String,
    pub state: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NameBody {
    name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathBody {
    path: String,
}

/// POST `/mcp/list` — the registered MCP servers with their connection state
/// (covers `McpBridge.listMcpServers`).
pub async fn list_servers(State(state): State<ServerState>) -> impl IntoResponse {
    let client = state.mcp_client.clone();
    let servers = client.list_servers().await;
    let info: Vec<McpServerInfo> = servers
        .into_iter()
        .map(|(name, state)| McpServerInfo { name, state: format!("{:?}", state).to_lowercase() })
        .collect();
    ipc::to_response(serde_json::to_value(info).map_err(AppError::from))
}

/// POST `/mcp/add` — register an MCP server config (covers
/// `McpBridge.addMcpServer`).
pub async fn add_server(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let config: McpServerConfig = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let client = state.mcp_client.clone();
    client.add_server(config).await;
    ipc::to_response(Ok(serde_json::json!(null)))
}

/// POST `/mcp/remove` — remove an MCP server (covers
/// `McpBridge.removeMcpServer`).
pub async fn remove_server(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: NameBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let client = state.mcp_client.clone();
    client.remove_server(&input.name).await;
    ipc::to_response(Ok(serde_json::json!(null)))
}

/// POST `/mcp/connect` — connect an MCP server (covers
/// `McpBridge.connectMcpServer`).
pub async fn connect_server(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: NameBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let client = state.mcp_client.clone();
    let result = client.connect(&input.name).await;
    ipc::to_response(result.map(|()| serde_json::json!(null)))
}

/// POST `/mcp/disconnect` — disconnect an MCP server (covers
/// `McpBridge.disconnectMcpServer`).
pub async fn disconnect_server(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: NameBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let client = state.mcp_client.clone();
    let result = client.disconnect(&input.name).await;
    ipc::to_response(result.map(|()| serde_json::json!(null)))
}

/// POST `/mcp/catalog` — the aggregated tool/resource catalog (covers
/// `McpBridge.getMcpCatalog`).
pub async fn catalog(State(state): State<ServerState>) -> impl IntoResponse {
    let client = state.mcp_client.clone();
    let catalog: McpCatalog = client.catalog().await;
    ipc::to_response(serde_json::to_value(catalog).map_err(AppError::from))
}

/// POST `/mcp/load-config` — load a `.mcp.json` file and register its enabled
/// servers (covers `McpBridge.loadMcpConfig`).
pub async fn load_config(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: PathBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = load_mcp_config_inner(&state.mcp_client, &input.path).await;
    ipc::to_response(result.map(|count| serde_json::json!(count)))
}

async fn load_mcp_config_inner(client: &McpClient, path: &str) -> Result<usize, AppError> {
    let registry = adl_mcp_client::McpServerRegistry::from_json_file(std::path::Path::new(path))?;
    let tasks: Vec<_> = registry
        .list_enabled()
        .into_iter()
        .cloned()
        .map(|config| {
            let client = client.clone();
            async move { client.add_server(config).await }
        })
        .collect();
    let count = tasks.len();
    join_all(tasks).await;
    Ok(count)
}
