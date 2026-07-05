use crate::LanguageServer;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LspClientState {
    Stopped,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Clone)]
pub struct LspClient {
    servers: Arc<Mutex<HashMap<LanguageServer, LspClientState>>>,
}

impl LspClient {
    pub fn new(_workspace_root: PathBuf) -> Self {
        Self { servers: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub async fn start_server(&self, server: LanguageServer) -> Result<(), adl_errors::AppError> {
        let mut servers = self.servers.lock().await;
        if servers.contains_key(&server) {
            return Ok(());
        }
        servers.insert(server.clone(), LspClientState::Starting);
        tracing::info!("Starting LSP server: {:?}", server);
        servers.insert(server, LspClientState::Running);
        Ok(())
    }

    pub async fn stop_server(&self, server: &LanguageServer) -> Result<(), adl_errors::AppError> {
        let mut servers = self.servers.lock().await;
        servers.remove(server);
        Ok(())
    }

    pub async fn get_state(&self, server: &LanguageServer) -> LspClientState {
        self.servers.lock().await.get(server).copied().unwrap_or(LspClientState::Stopped)
    }

    pub async fn list_servers(&self) -> Vec<(LanguageServer, LspClientState)> {
        self.servers.lock().await.iter().map(|(k, v)| (k.clone(), *v)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn start_and_stop_server() {
        let client = LspClient::new(PathBuf::from("/workspace"));
        client.start_server(LanguageServer::RustAnalyzer).await.unwrap();
        assert_eq!(client.get_state(&LanguageServer::RustAnalyzer).await, LspClientState::Running);
        client.stop_server(&LanguageServer::RustAnalyzer).await.unwrap();
        assert_eq!(client.get_state(&LanguageServer::RustAnalyzer).await, LspClientState::Stopped);
    }

    #[tokio::test]
    async fn list_servers_empty_initially() {
        let client = LspClient::new(PathBuf::from("/workspace"));
        let servers = client.list_servers().await;
        assert!(servers.is_empty());
    }
}
