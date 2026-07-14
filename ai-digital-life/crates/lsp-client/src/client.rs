use crate::diagnostics::{DiagnosticInfo, DiagnosticSeverity};
use crate::symbols::{DefinitionLocation, SymbolInfo, SymbolKind};
use crate::LanguageServer;
use adl_errors::AppError;
use lsp_types::{
    DocumentDiagnosticParams, DocumentSymbol, DocumentSymbolParams, GotoDefinitionParams, Location,
    Position, TextDocumentIdentifier, TextDocumentPositionParams,
};
use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command as StdCommand, Stdio};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LspClientState {
    Stopped,
    Starting,
    Running,
    Error,
}

pub struct LspServerHandle {
    pub state: LspClientState,
    pub child: Option<Child>,
    pub stdin: Option<ChildStdin>,
    pub pending: HashMap<lsp_server::RequestId, oneshot::Sender<lsp_server::Response>>,
}

impl std::fmt::Debug for LspServerHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LspServerHandle")
            .field("state", &self.state)
            .field("child", &self.child)
            .field("pending_count", &self.pending.len())
            .finish()
    }
}

#[derive(Debug)]
pub struct LspClient {
    servers: Arc<Mutex<HashMap<LanguageServer, LspServerHandle>>>,
    workspace_root: PathBuf,
    next_id: Arc<AtomicI32>,
}

impl LspClient {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
            workspace_root,
            next_id: Arc::new(AtomicI32::new(1)),
        }
    }

    pub async fn start_server(&self, server: LanguageServer) -> Result<(), AppError> {
        let mut servers = self.servers.lock().await;
        if servers.contains_key(&server) {
            return Ok(());
        }

        let cmd_parts = server.command();
        if cmd_parts.is_empty() {
            servers.insert(
                server.clone(),
                LspServerHandle {
                    state: LspClientState::Error,
                    child: None,
                    stdin: None,
                    pending: HashMap::new(),
                },
            );
            return Err(AppError::InvalidInput("Empty LSP command".into()));
        }

        let program = &cmd_parts[0];
        let args: Vec<&str> = cmd_parts[1..].to_vec();

        servers.insert(
            server.clone(),
            LspServerHandle {
                state: LspClientState::Starting,
                child: None,
                stdin: None,
                pending: HashMap::new(),
            },
        );
        drop(servers);

        let result = self.start_server_inner(program, &args).await;

        let mut servers = self.servers.lock().await;
        match result {
            Ok((child, child_stdin)) => {
                servers.insert(
                    server.clone(),
                    LspServerHandle {
                        state: LspClientState::Running,
                        child: Some(child),
                        stdin: Some(child_stdin),
                        pending: HashMap::new(),
                    },
                );
                tracing::info!("LSP server initialized: {:?}", server);
                Ok(())
            },
            Err(e) => {
                servers.insert(
                    server.clone(),
                    LspServerHandle {
                        state: LspClientState::Error,
                        child: None,
                        stdin: None,
                        pending: HashMap::new(),
                    },
                );
                Err(e)
            },
        }
    }

    async fn start_server_inner(
        &self,
        program: &str,
        args: &[&str],
    ) -> Result<(Child, ChildStdin), AppError> {
        let (child, mut child_stdin, mut reader) = spawn_lsp_process(program, args)?;
        let init_params = build_initialize_params(self.workspace_root.as_path())?;
        perform_lsp_handshake(&mut reader, &mut child_stdin, &init_params)?;
        spawn_response_dispatcher(reader, self.servers.clone());
        Ok((child, child_stdin))
    }

    pub async fn request<T: serde::de::DeserializeOwned>(
        &self,
        server: &LanguageServer,
        method: &str,
        params: serde_json::Value,
    ) -> Result<T, AppError> {
        let id_val = self.next_id.fetch_add(1, Ordering::SeqCst);
        let req_id = lsp_server::RequestId::from(id_val);

        let (tx, rx) = oneshot::channel();

        {
            let mut servers = self.servers.lock().await;
            let handle = servers.get_mut(server).ok_or_else(|| {
                AppError::NotFound(format!("LSP server {:?} not started", server))
            })?;

            let stdin = handle
                .stdin
                .as_mut()
                .ok_or_else(|| AppError::Internal("LSP stdin not available".into()))?;

            let msg = lsp_server::Message::Request(lsp_server::Request::new(
                req_id.clone(),
                method.to_string(),
                params,
            ));

            msg.write(stdin)
                .map_err(|e| AppError::Io(format!("Failed to send LSP request: {}", e)))?;
            stdin.flush().map_err(|e| AppError::Io(format!("Failed to flush stdin: {}", e)))?;

            handle.pending.insert(req_id, tx);
        }

        let resp = rx.await.map_err(|_| {
            AppError::Internal("LSP request cancelled - server disconnected".into())
        })?;

        if let Some(err) = resp.error {
            return Err(AppError::Internal(format!("LSP error ({}): {}", err.code, err.message)));
        }

        serde_json::from_value(resp.result.unwrap_or(serde_json::Value::Null))
            .map_err(|e| AppError::Internal(format!("Failed to parse LSP response: {}", e)))
    }

    pub async fn get_diagnostics(
        &self,
        server: &LanguageServer,
        file_path: &str,
    ) -> Result<Vec<DiagnosticInfo>, AppError> {
        let uri = url::Url::from_file_path(file_path)
            .map_err(|_| AppError::InvalidInput("Invalid file path".into()))?
            .to_string()
            .parse::<lsp_types::Uri>()
            .map_err(|e| AppError::Internal(format!("Invalid URI: {}", e)))?;

        let params = serde_json::to_value(DocumentDiagnosticParams {
            text_document: TextDocumentIdentifier { uri },
            identifier: None,
            previous_result_id: None,
            work_done_progress_params: Default::default(),
            partial_result_params: Default::default(),
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

        let result: serde_json::Value =
            self.request(server, "textDocument/diagnostic", params).await?;

        let items = result
            .get("items")
            .and_then(|v| serde_json::from_value::<Vec<lsp_types::Diagnostic>>(v.clone()).ok())
            .unwrap_or_default();

        Ok(items
            .into_iter()
            .map(|d| DiagnosticInfo {
                file_path: file_path.to_string(),
                line: d.range.start.line,
                column: d.range.start.character,
                severity: match d.severity {
                    Some(lsp_types::DiagnosticSeverity::ERROR) => DiagnosticSeverity::Error,
                    Some(lsp_types::DiagnosticSeverity::WARNING) => DiagnosticSeverity::Warning,
                    Some(lsp_types::DiagnosticSeverity::INFORMATION) => {
                        DiagnosticSeverity::Information
                    },
                    Some(lsp_types::DiagnosticSeverity::HINT) => DiagnosticSeverity::Hint,
                    _ => DiagnosticSeverity::Hint,
                },
                message: d.message,
                source: d.source,
                code: d.code.map(|c| match c {
                    lsp_types::NumberOrString::String(s) => s,
                    lsp_types::NumberOrString::Number(n) => n.to_string(),
                }),
            })
            .collect())
    }

    pub async fn get_symbols(
        &self,
        server: &LanguageServer,
        file_path: &str,
    ) -> Result<Vec<SymbolInfo>, AppError> {
        let uri = url::Url::from_file_path(file_path)
            .map_err(|_| AppError::InvalidInput("Invalid file path".into()))?
            .to_string()
            .parse::<lsp_types::Uri>()
            .map_err(|e| AppError::Internal(format!("Invalid URI: {}", e)))?;

        let params = serde_json::to_value(DocumentSymbolParams {
            text_document: TextDocumentIdentifier { uri },
            work_done_progress_params: Default::default(),
            partial_result_params: Default::default(),
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

        let result: serde_json::Value =
            self.request(server, "textDocument/documentSymbol", params).await?;

        let symbols: Vec<DocumentSymbol> = serde_json::from_value(result).unwrap_or_default();

        Ok(symbols.into_iter().map(|s| symbol_from_document_symbol(&s, file_path)).collect())
    }

    pub async fn goto_definition(
        &self,
        server: &LanguageServer,
        file_path: &str,
        line: u32,
        column: u32,
    ) -> Result<Option<DefinitionLocation>, AppError> {
        let uri = url::Url::from_file_path(file_path)
            .map_err(|_| AppError::InvalidInput("Invalid file path".into()))?
            .to_string()
            .parse::<lsp_types::Uri>()
            .map_err(|e| AppError::Internal(format!("Invalid URI: {}", e)))?;

        let params = serde_json::to_value(GotoDefinitionParams {
            text_document_position_params: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier { uri },
                position: Position { line, character: column },
            },
            work_done_progress_params: Default::default(),
            partial_result_params: Default::default(),
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

        let result: serde_json::Value =
            self.request(server, "textDocument/definition", params).await?;

        if let Ok(loc) = serde_json::from_value::<Location>(result.clone()) {
            Ok(Some(DefinitionLocation {
                file_path: loc.uri.to_string(),
                line: loc.range.start.line,
                column: loc.range.start.character,
                end_line: Some(loc.range.end.line),
                end_column: Some(loc.range.end.character),
            }))
        } else if let Ok(locs) = serde_json::from_value::<Vec<Location>>(result.clone()) {
            Ok(locs.into_iter().next().map(|loc| DefinitionLocation {
                file_path: loc.uri.to_string(),
                line: loc.range.start.line,
                column: loc.range.start.character,
                end_line: Some(loc.range.end.line),
                end_column: Some(loc.range.end.character),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn stop_server(&self, server: &LanguageServer) -> Result<(), AppError> {
        let mut servers = self.servers.lock().await;
        if let Some(mut handle) = servers.remove(server) {
            if let Some(mut stdin) = handle.stdin.take() {
                let shutdown = lsp_server::Message::Request(lsp_server::Request::new(
                    lsp_server::RequestId::from(2),
                    "shutdown".to_string(),
                    serde_json::Value::Null,
                ));
                let _ = shutdown.write(&mut stdin);
                let _ = stdin.flush();

                let exit = lsp_server::Message::Notification(lsp_server::Notification::new(
                    "exit".to_string(),
                    serde_json::Value::Null,
                ));
                let _ = exit.write(&mut stdin);
                let _ = stdin.flush();
            }

            if let Some(mut child) = handle.child {
                let _ = child.kill();
                let _ = child.wait();
            }

            // handle drops here, closing stdin + dropping pending senders
        }
        Ok(())
    }

    pub async fn get_state(&self, server: &LanguageServer) -> LspClientState {
        self.servers.lock().await.get(server).map(|h| h.state).unwrap_or(LspClientState::Stopped)
    }

    pub async fn list_servers(&self) -> Vec<(LanguageServer, LspClientState)> {
        self.servers.lock().await.iter().map(|(k, v)| (k.clone(), v.state)).collect()
    }
}

fn spawn_lsp_process(
    program: &str,
    args: &[&str],
) -> Result<(Child, ChildStdin, BufReader<ChildStdout>), AppError> {
    let mut child = StdCommand::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Io(format!("Failed to spawn LSP server: {e}")))?;

    let child_stdin =
        child.stdin.take().ok_or_else(|| AppError::Internal("Failed to capture stdin".into()))?;
    let child_stdout =
        child.stdout.take().ok_or_else(|| AppError::Internal("Failed to capture stdout".into()))?;

    Ok((child, child_stdin, BufReader::new(child_stdout)))
}

fn build_initialize_params(workspace_root: &Path) -> Result<serde_json::Value, AppError> {
    let root_url = url::Url::from_directory_path(workspace_root)
        .map_err(|_| AppError::InvalidInput("Invalid workspace path".into()))?;
    let root_uri: lsp_types::Uri = root_url
        .to_string()
        .parse()
        .map_err(|e| AppError::Internal(format!("Invalid URI: {e}")))?;
    let folder_name = workspace_root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());

    serde_json::to_value(lsp_types::InitializeParams {
        process_id: Some(std::process::id()),
        workspace_folders: Some(vec![lsp_types::WorkspaceFolder {
            uri: root_uri,
            name: folder_name,
        }]),
        capabilities: lsp_types::ClientCapabilities::default(),
        ..Default::default()
    })
    .map_err(|e| AppError::Internal(e.to_string()))
}

fn perform_lsp_handshake(
    reader: &mut BufReader<ChildStdout>,
    writer: &mut ChildStdin,
    init_params: &serde_json::Value,
) -> Result<(), AppError> {
    use lsp_server::{Message, Notification, Request};

    let init_req = Message::Request(Request::new(
        lsp_server::RequestId::from(1),
        "initialize".to_string(),
        init_params.clone(),
    ));
    init_req.write(writer).map_err(|e| AppError::Io(format!("write initialize: {e}")))?;
    writer.flush().map_err(|e| AppError::Io(format!("flush initialize: {e}")))?;

    let resp =
        Message::read(reader).map_err(|e| AppError::Io(format!("read init response: {e}")))?;

    match resp {
        Some(Message::Response(resp)) => {
            if let Some(err) = resp.error {
                return Err(AppError::Internal(format!(
                    "LSP init error ({:?}): {}",
                    err.code, err.message
                )));
            }
        },
        Some(other) => {
            return Err(AppError::Internal(format!("Expected init response, got: {other:?}")))
        },
        None => return Err(AppError::Internal("LSP closed during initialize".into())),
    }

    let initialized = Message::Notification(Notification::new(
        "initialized".to_string(),
        serde_json::Value::Null,
    ));
    initialized.write(writer).map_err(|e| AppError::Io(format!("write initialized: {e}")))?;
    writer.flush().map_err(|e| AppError::Io(format!("flush initialized: {e}")))?;

    Ok(())
}

fn spawn_response_dispatcher(
    reader: BufReader<ChildStdout>,
    servers: Arc<Mutex<HashMap<LanguageServer, LspServerHandle>>>,
) {
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        loop {
            match lsp_server::Message::read(&mut reader) {
                Ok(Some(lsp_server::Message::Response(resp))) => {
                    let mut map = servers.blocking_lock();
                    for handle in map.values_mut() {
                        if let Some(tx) = handle.pending.remove(&resp.id) {
                            let _ = tx.send(resp);
                            break;
                        }
                    }
                },
                Ok(_) => continue,
                Err(_) => break,
            }
        }
    });
}

fn symbol_kind_from_lsp(kind: lsp_types::SymbolKind) -> SymbolKind {
    use lsp_types::SymbolKind as L;
    match kind {
        L::FILE => SymbolKind::File,
        L::MODULE => SymbolKind::Module,
        L::NAMESPACE => SymbolKind::Namespace,
        L::PACKAGE => SymbolKind::Package,
        L::CLASS => SymbolKind::Class,
        L::METHOD => SymbolKind::Method,
        L::PROPERTY => SymbolKind::Property,
        L::FIELD => SymbolKind::Field,
        L::CONSTRUCTOR => SymbolKind::Constructor,
        L::ENUM => SymbolKind::Enum,
        L::INTERFACE => SymbolKind::Interface,
        L::FUNCTION => SymbolKind::Function,
        L::VARIABLE => SymbolKind::Variable,
        L::CONSTANT => SymbolKind::Constant,
        L::STRING => SymbolKind::String,
        L::NUMBER => SymbolKind::Number,
        L::BOOLEAN => SymbolKind::Boolean,
        L::ARRAY => SymbolKind::Array,
        L::OBJECT => SymbolKind::Object,
        L::KEY => SymbolKind::Key,
        L::NULL => SymbolKind::Null,
        L::STRUCT => SymbolKind::Struct,
        L::EVENT => SymbolKind::Event,
        L::OPERATOR => SymbolKind::Operator,
        L::TYPE_PARAMETER => SymbolKind::TypeParameter,
        _ => SymbolKind::Variable,
    }
}

fn symbol_from_document_symbol(s: &DocumentSymbol, file_path: &str) -> SymbolInfo {
    SymbolInfo {
        name: s.name.clone(),
        kind: symbol_kind_from_lsp(s.kind),
        location: DefinitionLocation {
            file_path: file_path.to_string(),
            line: s.range.start.line,
            column: s.range.start.character,
            end_line: Some(s.range.end.line),
            end_column: Some(s.range.end.character),
        },
        container_name: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn start_and_stop_server() {
        let client = LspClient::new(PathBuf::from("/workspace"));
        let result =
            client.start_server(LanguageServer::Custom("nonexistent-lsp-xyzzy".to_string())).await;
        assert!(result.is_err());
        assert_eq!(
            client.get_state(&LanguageServer::Custom("nonexistent-lsp-xyzzy".to_string())).await,
            LspClientState::Error
        );
        client
            .stop_server(&LanguageServer::Custom("nonexistent-lsp-xyzzy".to_string()))
            .await
            .unwrap();
        assert_eq!(
            client.get_state(&LanguageServer::Custom("nonexistent-lsp-xyzzy".to_string())).await,
            LspClientState::Stopped
        );
    }

    #[tokio::test]
    async fn list_servers_empty_initially() {
        let client = LspClient::new(PathBuf::from("/workspace"));
        let servers = client.list_servers().await;
        assert!(servers.is_empty());
    }

    #[tokio::test]
    async fn start_server_fails_for_missing_command() {
        let client = LspClient::new(PathBuf::from("/tmp"));
        let result = client
            .start_server(LanguageServer::Custom("nonexistent-lsp-server-xyzzy".to_string()))
            .await;
        assert!(result.is_err());
        let state = client
            .get_state(&LanguageServer::Custom("nonexistent-lsp-server-xyzzy".to_string()))
            .await;
        assert_eq!(state, LspClientState::Error);
    }

    #[tokio::test]
    async fn start_server_spawns_process() {
        let client = LspClient::new(PathBuf::from("."));
        let server = LanguageServer::Custom("cmd".to_string());
        let result = client.start_server(server.clone()).await;
        assert!(result.is_err(), "Should fail with LSP protocol error, not spawn failure");
        let state = client.get_state(&server).await;
        assert_eq!(
            state,
            LspClientState::Error,
            "Server should be Error (protocol failure), not Starting"
        );
        client.stop_server(&server).await.unwrap();
    }
}
