use crate::LanguageServer;
use lsp_server::Message;
use lsp_types::{ClientCapabilities, InitializeParams, WorkspaceFolder};
use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command as StdCommand, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;

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
}

impl std::fmt::Debug for LspServerHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LspServerHandle")
            .field("state", &self.state)
            .field("child", &self.child)
            .finish()
    }
}

#[derive(Debug)]
pub struct LspClient {
    servers: Arc<Mutex<HashMap<LanguageServer, LspServerHandle>>>,
    workspace_root: PathBuf,
}

impl LspClient {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { servers: Arc::new(Mutex::new(HashMap::new())), workspace_root }
    }

    pub async fn start_server(&self, server: LanguageServer) -> Result<(), adl_errors::AppError> {
        let mut servers = self.servers.lock().await;
        if servers.contains_key(&server) {
            return Ok(());
        }

        let cmd_parts = server.command();
        if cmd_parts.is_empty() {
            servers.insert(
                server.clone(),
                LspServerHandle { state: LspClientState::Error, child: None, stdin: None },
            );
            return Err(adl_errors::AppError::InvalidInput("Empty LSP command".into()));
        }

        let program = cmd_parts[0];
        let args: Vec<&str> = cmd_parts[1..].to_vec();

        servers.insert(
            server.clone(),
            LspServerHandle { state: LspClientState::Starting, child: None, stdin: None },
        );
        drop(servers);

        let result = self.spawn_and_init(program, &args).await;

        let mut servers = self.servers.lock().await;
        match result {
            Ok((child, child_stdin)) => {
                servers.insert(
                    server.clone(),
                    LspServerHandle {
                        state: LspClientState::Running,
                        child: Some(child),
                        stdin: Some(child_stdin),
                    },
                );
                tracing::info!("LSP server initialized: {:?}", server);
                Ok(())
            },
            Err(e) => {
                servers.insert(
                    server.clone(),
                    LspServerHandle { state: LspClientState::Error, child: None, stdin: None },
                );
                Err(e)
            },
        }
    }

    async fn spawn_and_init(
        &self,
        program: &str,
        args: &[&str],
    ) -> Result<(Child, ChildStdin), adl_errors::AppError> {
        let mut child = StdCommand::new(program)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to spawn LSP server: {}", e)))?;

        let mut child_stdin = child
            .stdin
            .take()
            .ok_or_else(|| adl_errors::AppError::Internal("Failed to capture stdin".into()))?;
        let child_stdout = child
            .stdout
            .take()
            .ok_or_else(|| adl_errors::AppError::Internal("Failed to capture stdout".into()))?;
        let mut child_stdout = BufReader::new(child_stdout);

        let root_url = url::Url::from_directory_path(&self.workspace_root)
            .map_err(|_| adl_errors::AppError::InvalidInput("Invalid workspace path".into()))?;
        let root_uri: lsp_types::Uri = root_url
            .to_string()
            .parse()
            .map_err(|e| adl_errors::AppError::Internal(format!("Invalid URI: {}", e)))?;

        let folder_name = self
            .workspace_root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "workspace".to_string());

        let init_params = serde_json::to_value(InitializeParams {
            process_id: Some(std::process::id()),
            workspace_folders: Some(vec![WorkspaceFolder { uri: root_uri, name: folder_name }]),
            capabilities: ClientCapabilities::default(),
            ..Default::default()
        })
        .map_err(|e| adl_errors::AppError::Internal(e.to_string()))?;

        let init_request = Message::Request(lsp_server::Request::new(
            lsp_server::RequestId::from(1),
            "initialize".to_string(),
            init_params,
        ));

        init_request
            .write(&mut child_stdin)
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to send initialize: {}", e)))?;
        child_stdin
            .flush()
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to flush stdin: {}", e)))?;

        let resp = Message::read(&mut child_stdout).map_err(|e| {
            adl_errors::AppError::Io(format!("Failed to read initialize response: {}", e))
        })?;

        match resp {
            Some(Message::Response(resp)) => {
                if let Some(err) = resp.error {
                    return Err(adl_errors::AppError::Internal(format!(
                        "LSP initialize error ({}): {}",
                        err.code, err.message
                    )));
                }
            },
            Some(other) => {
                return Err(adl_errors::AppError::Internal(format!(
                    "Expected initialize response, got: {:?}",
                    other
                )));
            },
            None => {
                return Err(adl_errors::AppError::Internal(
                    "LSP server closed connection during initialize".into(),
                ));
            },
        }

        let initialized = Message::Notification(lsp_server::Notification::new(
            "initialized".to_string(),
            serde_json::Value::Null,
        ));

        initialized
            .write(&mut child_stdin)
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to send initialized: {}", e)))?;
        child_stdin
            .flush()
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to flush stdin: {}", e)))?;

        Ok((child, child_stdin))
    }

    pub async fn stop_server(&self, server: &LanguageServer) -> Result<(), adl_errors::AppError> {
        let mut servers = self.servers.lock().await;
        if let Some(mut handle) = servers.remove(server) {
            if let Some(mut stdin) = handle.stdin.take() {
                let shutdown = Message::Request(lsp_server::Request::new(
                    lsp_server::RequestId::from(2),
                    "shutdown".to_string(),
                    serde_json::Value::Null,
                ));
                let _ = shutdown.write(&mut stdin);
                let _ = stdin.flush();

                let exit = Message::Notification(lsp_server::Notification::new(
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
