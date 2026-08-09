//! LSP domain HTTP handlers — migrated from `src-tauri/src/commands/lsp.rs`
//! (`lsp_*` tauri commands). The live client map is held on
//! [`ServerState::lsp_clients`] (the Tauri original used a module-level static
//! — the field mirrors it for the standalone server). Language server
//! lifecycle (start/stop) and queries (symbols / diagnostics / goto-definition)
//! are ported faithfully. No events are emitted by the Tauri originals —
//! faithful parity.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_lsp_client::symbols::{SymbolInfo, SymbolKind};
use adl_lsp_client::{LanguageServer, LspClient};
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartServerBody {
    workspace_id: String,
    workspace_root: String,
    server: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceServerBody {
    workspace_id: String,
    server: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFileBody {
    workspace_id: String,
    file_path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsBody {
    workspace_id: String,
    #[serde(default)]
    file_path: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GotoDefinitionBody {
    workspace_id: String,
    file_path: String,
    line: u32,
    column: u32,
}

fn parse_server(s: &str) -> LanguageServer {
    match s {
        "rust-analyzer" => LanguageServer::RustAnalyzer,
        "typescript-language-server" => LanguageServer::TypeScriptLanguageServer,
        "pylsp" => LanguageServer::Pylsp,
        "gopls" => LanguageServer::Gopls,
        other => LanguageServer::Custom(other.to_string()),
    }
}

/// POST `/lsp/start` — start a language server for a workspace, replacing any
/// existing client (covers `LspBridge.startServer`).
pub async fn start_server(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: StartServerBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result =
        start_server_inner(&state, input.workspace_id, input.workspace_root, input.server).await;
    ipc::to_response(result.map(|()| serde_json::json!(null)))
}

async fn start_server_inner(
    state: &ServerState,
    workspace_id: String,
    workspace_root: String,
    server: String,
) -> Result<(), AppError> {
    let server_enum = parse_server(&server);
    let map = state.lsp_clients.clone();
    let mut clients = map.lock().await;
    if let Some(old) = clients.remove(&workspace_id) {
        drop(clients);
        let _ = old.stop_server(&server_enum).await;
        clients = map.lock().await;
    }
    let client = LspClient::new(PathBuf::from(&workspace_root));
    client.start_server(server_enum).await?;
    clients.insert(workspace_id, Arc::new(client));
    Ok(())
}

/// POST `/lsp/stop` — stop the language server for a workspace (no-op when none
/// is running; covers `LspBridge.stopServer`).
pub async fn stop_server(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceServerBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let server_enum = parse_server(&input.server);
    let map = state.lsp_clients.clone();
    let mut clients = map.lock().await;
    let result = if let Some(client) = clients.remove(&input.workspace_id) {
        client.stop_server(&server_enum).await
    } else {
        Ok(())
    };
    ipc::to_response(result.map(|()| serde_json::json!(null)))
}

/// POST `/lsp/symbols` — document symbols for a file (covers
/// `LspBridge.getSymbols`). Empty list when no client / no matching language
/// server is configured.
pub async fn get_symbols(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceFileBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let map = state.lsp_clients.clone();
    let clients = map.lock().await;
    let Some(client) = clients.get(&input.workspace_id) else {
        return ipc::to_response(Ok(serde_json::json!([])));
    };
    let ext =
        std::path::Path::new(&input.file_path).extension().and_then(|e| e.to_str()).unwrap_or("");
    let Some(server) = LanguageServer::from_file_extension(ext) else {
        return ipc::to_response(Ok(serde_json::json!([])));
    };
    let result = client.get_symbols(&server, &input.file_path).await;
    ipc::to_response(result.map(|symbols| serde_json::to_value(symbols).unwrap_or_default()))
}

/// POST `/lsp/diagnostics` — diagnostics for a file (covers
/// `LspBridge.getDiagnostics`). Empty list when no file path / no client.
pub async fn get_diagnostics(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: DiagnosticsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let Some(file_path) = input.file_path else {
        return ipc::to_response(Ok(serde_json::json!([])));
    };
    let map = state.lsp_clients.clone();
    let clients = map.lock().await;
    let Some(client) = clients.get(&input.workspace_id) else {
        return ipc::to_response(Ok(serde_json::json!([])));
    };
    let ext = std::path::Path::new(&file_path).extension().and_then(|e| e.to_str()).unwrap_or("");
    let Some(server) = LanguageServer::from_file_extension(ext) else {
        return ipc::to_response(Ok(serde_json::json!([])));
    };
    let result = client.get_diagnostics(&server, &file_path).await;
    ipc::to_response(result.map(|d| serde_json::to_value(d).unwrap_or_default()))
}

/// POST `/lsp/goto-definition` — the definition location for a position (covers
/// `LspBridge.gotoDefinition`). Null when no client / no matching language
/// server is configured.
pub async fn goto_definition(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: GotoDefinitionBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let map = state.lsp_clients.clone();
    let clients = map.lock().await;
    let Some(client) = clients.get(&input.workspace_id) else {
        return ipc::to_response(Ok(serde_json::json!(null)));
    };
    let ext =
        std::path::Path::new(&input.file_path).extension().and_then(|e| e.to_str()).unwrap_or("");
    let Some(server) = LanguageServer::from_file_extension(ext) else {
        return ipc::to_response(Ok(serde_json::json!(null)));
    };
    let result = client.goto_definition(&server, &input.file_path, input.line, input.column).await;
    let result = result.map(|loc| {
        loc.map(|l| SymbolInfo {
            name: String::new(),
            kind: SymbolKind::Variable,
            location: l,
            container_name: None,
        })
    });
    ipc::to_response(result.map(|info| serde_json::to_value(info).unwrap_or_default()))
}
