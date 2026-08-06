use adl_credential::CredentialStore;
use adl_errors::AppError;
use serde::{Deserialize, Serialize};

const MCP_OAUTH_SERVICE: &str = "ai-digital-life-mcp-oauth";

/// OAuth token storage for MCP servers.
pub struct McpOAuthStore;

impl McpOAuthStore {
    pub fn new() -> Self {
        Self
    }

    /// Blocking keyring/encrypted-file I/O. When invoked from an async runtime,
    /// callers must wrap this in `tokio::task::spawn_blocking`.
    pub fn save_token(&self, server_name: &str, token: &McpOAuthToken) -> Result<(), AppError> {
        let json = serde_json::to_string(token)?;
        let store = CredentialStore::new(MCP_OAUTH_SERVICE, server_name);
        store.set_password(&json)
    }

    /// Blocking keyring/encrypted-file I/O. When invoked from an async runtime,
    /// callers must wrap this in `tokio::task::spawn_blocking`.
    pub fn load_token(&self, server_name: &str) -> Result<Option<McpOAuthToken>, AppError> {
        let store = CredentialStore::new(MCP_OAUTH_SERVICE, server_name);
        match store.get_password() {
            Ok(json) => {
                let token: McpOAuthToken = serde_json::from_str(&json)?;
                Ok(Some(token))
            },
            Err(AppError::Security(_)) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Blocking keyring/encrypted-file I/O. When invoked from an async runtime,
    /// callers must wrap this in `tokio::task::spawn_blocking`.
    pub fn clear_token(&self, server_name: &str) -> Result<(), AppError> {
        let store = CredentialStore::new(MCP_OAUTH_SERVICE, server_name);
        store.delete_password()
    }
}

impl Default for McpOAuthStore {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpOAuthToken {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<u64>,
    pub token_type: String,
    pub scope: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_serialization() {
        let token = McpOAuthToken {
            access_token: "abc123".to_string(),
            refresh_token: Some("refresh456".to_string()),
            expires_at: Some(1700000000),
            token_type: "Bearer".to_string(),
            scope: Some("read write".to_string()),
        };
        let json = serde_json::to_string(&token).unwrap();
        let deserialized: McpOAuthToken = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.access_token, "abc123");
        assert_eq!(deserialized.refresh_token, Some("refresh456".to_string()));
    }
}
