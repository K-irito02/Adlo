use adl_lsp_client::{LspClient, LanguageServer};
use adl_lsp_client::symbols::SymbolInfo;
use adl_lsp_client::diagnostics::DiagnosticInfo;
use std::path::PathBuf;
use std::sync::Arc;

type LspClientMap = Arc<tokio::sync::Mutex<std::collections::HashMap<String, Arc<LspClient>>>>;

#[allow(clippy::incompatible_msrv)]
static LSP_CLIENTS: std::sync::LazyLock<LspClientMap> =
    std::sync::LazyLock::new(|| Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())));

fn parse_server(s: &str) -> LanguageServer {
    match s {
        "rust-analyzer" => LanguageServer::RustAnalyzer,
        "typescript-language-server" => LanguageServer::TypeScriptLanguageServer,
        "pylsp" => LanguageServer::Pylsp,
        "gopls" => LanguageServer::Gopls,
        other => LanguageServer::Custom(other.to_string()),
    }
}

#[tauri::command]
pub async fn lsp_start_server(workspace_id: String, workspace_root: String, server: String) -> Result<(), adl_errors::AppError> {
    let server_enum = parse_server(&server);
    let client = LspClient::new(PathBuf::from(&workspace_root));
    client.start_server(server_enum).await?;
    let mut clients = LSP_CLIENTS.lock().await;
    clients.insert(workspace_id, Arc::new(client));
    Ok(())
}

#[tauri::command]
pub async fn lsp_stop_server(workspace_id: String, server: String) -> Result<(), adl_errors::AppError> {
    let server_enum = parse_server(&server);
    let clients = LSP_CLIENTS.lock().await;
    if let Some(client) = clients.get(&workspace_id) {
        client.stop_server(&server_enum).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn lsp_get_symbols(_workspace_id: String, _file_path: String) -> Result<Vec<SymbolInfo>, adl_errors::AppError> {
    Ok(vec![])
}

#[tauri::command]
pub async fn lsp_get_diagnostics(_workspace_id: String, _file_path: Option<String>) -> Result<Vec<DiagnosticInfo>, adl_errors::AppError> {
    Ok(vec![])
}

#[tauri::command]
pub async fn lsp_goto_definition(_workspace_id: String, _file_path: String, _line: u32, _column: u32) -> Result<Option<SymbolInfo>, adl_errors::AppError> {
    Ok(None)
}
