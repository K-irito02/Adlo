use crate::commands::ipc;
use adl_errors::AppError;
use adl_kernel::IpcResult;
use adl_lsp_client::diagnostics::DiagnosticInfo;
use adl_lsp_client::symbols::SymbolInfo;
use adl_lsp_client::{LanguageServer, LspClient};
use std::path::PathBuf;
use std::sync::Arc;

type LspClientMap = Arc<tokio::sync::Mutex<std::collections::HashMap<String, Arc<LspClient>>>>;

#[allow(clippy::incompatible_msrv)]
static LSP_CLIENTS: std::sync::LazyLock<LspClientMap> = std::sync::LazyLock::new(|| {
    Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()))
});

fn parse_server(s: &str) -> LanguageServer {
    match s {
        "rust-analyzer" => LanguageServer::RustAnalyzer,
        "typescript-language-server" => LanguageServer::TypeScriptLanguageServer,
        "pylsp" => LanguageServer::Pylsp,
        "gopls" => LanguageServer::Gopls,
        other => LanguageServer::Custom(other.to_string()),
    }
}

async fn start_server_inner(
    workspace_id: String,
    workspace_root: String,
    server: String,
) -> Result<(), AppError> {
    let server_enum = parse_server(&server);
    let client = LspClient::new(PathBuf::from(&workspace_root));
    client.start_server(server_enum).await?;
    let mut clients = LSP_CLIENTS.lock().await;
    clients.insert(workspace_id, Arc::new(client));
    Ok(())
}

async fn stop_server_inner(workspace_id: String, server: String) -> Result<(), AppError> {
    let server_enum = parse_server(&server);
    let clients = LSP_CLIENTS.lock().await;
    if let Some(client) = clients.get(&workspace_id) {
        client.stop_server(&server_enum).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn lsp_start_server(
    workspace_id: String,
    workspace_root: String,
    server: String,
) -> Result<IpcResult<()>, AppError> {
    Ok(ipc(start_server_inner(workspace_id, workspace_root, server).await))
}

#[tauri::command]
pub async fn lsp_stop_server(
    workspace_id: String,
    server: String,
) -> Result<IpcResult<()>, AppError> {
    Ok(ipc(stop_server_inner(workspace_id, server).await))
}

#[tauri::command]
pub async fn lsp_get_symbols(
    _workspace_id: String,
    _file_path: String,
) -> Result<IpcResult<Vec<SymbolInfo>>, AppError> {
    Ok(ipc(Ok(vec![])))
}

#[tauri::command]
pub async fn lsp_get_diagnostics(
    _workspace_id: String,
    _file_path: Option<String>,
) -> Result<IpcResult<Vec<DiagnosticInfo>>, AppError> {
    Ok(ipc(Ok(vec![])))
}

#[tauri::command]
pub async fn lsp_goto_definition(
    _workspace_id: String,
    _file_path: String,
    _line: u32,
    _column: u32,
) -> Result<IpcResult<Option<SymbolInfo>>, AppError> {
    Ok(ipc(Ok(None)))
}
