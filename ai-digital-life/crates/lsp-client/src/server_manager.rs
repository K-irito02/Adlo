use crate::LanguageServer;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageServerConfig {
    pub language: String,
    pub server: LanguageServer,
    pub command: String,
    pub args: Vec<String>,
    pub init_options: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default)]
pub struct LspServerManager {
    configs: Vec<LanguageServerConfig>,
}

impl LspServerManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_config(&mut self, config: LanguageServerConfig) {
        self.configs.push(config);
    }

    pub fn find_for_file(&self, file_extension: &str) -> Option<&LanguageServerConfig> {
        LanguageServer::from_file_extension(file_extension)
            .and_then(|server| self.configs.iter().find(|c| c.server == server))
    }

    pub fn list_configs(&self) -> &[LanguageServerConfig] {
        &self.configs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_config_for_rust() {
        let mut manager = LspServerManager::new();
        manager.add_config(LanguageServerConfig {
            language: "rust".to_string(),
            server: LanguageServer::RustAnalyzer,
            command: "rust-analyzer".to_string(),
            args: vec![],
            init_options: None,
        });
        let config = manager.find_for_file("rs");
        assert!(config.is_some());
    }

    #[test]
    fn find_config_returns_none_for_unknown() {
        let manager = LspServerManager::new();
        assert!(manager.find_for_file("xyz").is_none());
    }
}
