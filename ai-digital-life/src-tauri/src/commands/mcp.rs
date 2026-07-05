use adl_mcp_client::{McpCatalog, McpClient, McpServerConfig};
use std::sync::{Arc, OnceLock};

static MCP_CLIENT: OnceLock<Arc<McpClient>> = OnceLock::new();

fn mcp_client() -> &'static Arc<McpClient> {
    MCP_CLIENT.get_or_init(|| Arc::new(McpClient::new()))
}

#[derive(serde::Serialize)]
pub struct McpServerInfo {
    pub name: String,
    pub state: String,
}

#[tauri::command]
pub async fn list_mcp_servers() -> Result<Vec<McpServerInfo>, adl_errors::AppError> {
    let servers = mcp_client().list_servers().await;
    Ok(servers
        .into_iter()
        .map(|(name, state)| McpServerInfo { name, state: format!("{:?}", state).to_lowercase() })
        .collect())
}

#[tauri::command]
pub async fn add_mcp_server(config: McpServerConfig) -> Result<(), adl_errors::AppError> {
    mcp_client().add_server(config).await;
    Ok(())
}

#[tauri::command]
pub async fn remove_mcp_server(name: String) -> Result<(), adl_errors::AppError> {
    mcp_client().remove_server(&name).await;
    Ok(())
}

#[tauri::command]
pub async fn connect_mcp_server(name: String) -> Result<(), adl_errors::AppError> {
    mcp_client().connect(&name).await
}

#[tauri::command]
pub async fn disconnect_mcp_server(name: String) -> Result<(), adl_errors::AppError> {
    mcp_client().disconnect(&name).await
}

#[tauri::command]
pub async fn get_mcp_catalog() -> Result<McpCatalog, adl_errors::AppError> {
    Ok(mcp_client().catalog().await)
}

#[tauri::command]
pub async fn load_mcp_config(path: String) -> Result<usize, adl_errors::AppError> {
    let registry = adl_mcp_client::McpServerRegistry::from_json_file(std::path::Path::new(&path))?;
    let count = registry.list_enabled().len();
    for config in registry.list_enabled() {
        mcp_client().add_server(config.clone()).await;
    }
    Ok(count)
}
