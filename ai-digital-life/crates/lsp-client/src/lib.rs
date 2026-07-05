pub mod client;
pub mod server_manager;
pub mod symbols;
pub mod diagnostics;

pub use client::{LspClient, LspClientState};
pub use server_manager::{LspServerManager, LanguageServerConfig};
pub use symbols::{SymbolInfo, SymbolKind, DefinitionLocation};
pub use diagnostics::DiagnosticInfo;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageServer {
    RustAnalyzer,
    TypeScriptLanguageServer,
    Pylsp,
    Gopls,
    Custom(String),
}

impl LanguageServer {
    pub fn command(&self) -> Vec<&str> {
        match self {
            LanguageServer::RustAnalyzer => vec!["rust-analyzer"],
            LanguageServer::TypeScriptLanguageServer => vec!["typescript-language-server", "--stdio"],
            LanguageServer::Pylsp => vec!["pylsp"],
            LanguageServer::Gopls => vec!["gopls", "serve"],
            LanguageServer::Custom(cmd) => vec![cmd.as_str()],
        }
    }

    pub fn from_file_extension(ext: &str) -> Option<Self> {
        match ext {
            "rs" => Some(LanguageServer::RustAnalyzer),
            "ts" | "tsx" | "js" | "jsx" => Some(LanguageServer::TypeScriptLanguageServer),
            "py" => Some(LanguageServer::Pylsp),
            "go" => Some(LanguageServer::Gopls),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rust_extension_maps_to_rust_analyzer() {
        assert_eq!(LanguageServer::from_file_extension("rs"), Some(LanguageServer::RustAnalyzer));
    }

    #[test]
    fn ts_extension_maps_to_ts_server() {
        assert_eq!(LanguageServer::from_file_extension("ts"), Some(LanguageServer::TypeScriptLanguageServer));
    }

    #[test]
    fn unknown_extension_returns_none() {
        assert!(LanguageServer::from_file_extension("xyz").is_none());
    }

    #[test]
    fn rust_analyzer_command() {
        let server = LanguageServer::RustAnalyzer;
        assert_eq!(server.command(), vec!["rust-analyzer"]);
    }
}
