use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ErrorKind {
    NotFound,
    InvalidInput,
    Storage,
    Workspace,
    Config,
    Io,
    Migration,
    Security,
    ApprovalRequired,
    Patch,
    Terminal,
    Model,
    Timeout,
    RateLimit,
    AuthError,
    Network,
    Internal,
}

impl ErrorKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotFound => "NOT_FOUND",
            Self::InvalidInput => "INVALID_INPUT",
            Self::Storage => "STORAGE_ERROR",
            Self::Workspace => "WORKSPACE_ERROR",
            Self::Config => "CONFIG_ERROR",
            Self::Io => "IO_ERROR",
            Self::Migration => "MIGRATION_ERROR",
            Self::Security => "SECURITY_ERROR",
            Self::ApprovalRequired => "APPROVAL_REQUIRED",
            Self::Patch => "PATCH_ERROR",
            Self::Terminal => "TERMINAL_ERROR",
            Self::Model => "MODEL_ERROR",
            Self::Timeout => "TIMEOUT",
            Self::RateLimit => "RATE_LIMIT",
            Self::AuthError => "AUTH_ERROR",
            Self::Network => "NETWORK_ERROR",
            Self::Internal => "INTERNAL_ERROR",
        }
    }
}

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Workspace error: {0}")]
    Workspace(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Migration error: {0}")]
    Migration(String),

    #[error("Security error: {0}")]
    Security(String),

    #[error("Approval required: {0}")]
    ApprovalRequired(String),

    #[error("Patch error: {0}")]
    Patch(String),

    #[error("Terminal error: {0}")]
    Terminal(String),

    #[error("Model error: {0}")]
    Model(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Rate limited: {0}")]
    RateLimit(String),

    #[error("Auth error: {0}")]
    AuthError(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn error_code(&self) -> &'static str {
        self.error_kind().as_str()
    }

    pub fn error_kind(&self) -> ErrorKind {
        match self {
            Self::NotFound(_) => ErrorKind::NotFound,
            Self::InvalidInput(_) => ErrorKind::InvalidInput,
            Self::Storage(_) => ErrorKind::Storage,
            Self::Workspace(_) => ErrorKind::Workspace,
            Self::Config(_) => ErrorKind::Config,
            Self::Io(_) => ErrorKind::Io,
            Self::Migration(_) => ErrorKind::Migration,
            Self::Security(_) => ErrorKind::Security,
            Self::ApprovalRequired(_) => ErrorKind::ApprovalRequired,
            Self::Patch(_) => ErrorKind::Patch,
            Self::Terminal(_) => ErrorKind::Terminal,
            Self::Model(_) => ErrorKind::Model,
            Self::Timeout(_) => ErrorKind::Timeout,
            Self::RateLimit(_) => ErrorKind::RateLimit,
            Self::AuthError(_) => ErrorKind::AuthError,
            Self::Network(_) => ErrorKind::Network,
            Self::Internal(_) => ErrorKind::Internal,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(format!("[{}] {}", e.kind(), e))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_serializes_to_json() {
        let err = AppError::NotFound("workspace".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("NotFound"));
        assert!(json.contains("workspace"));
    }

    #[test]
    fn error_display_contains_message() {
        let err = AppError::NotFound("workspace".into());
        assert_eq!(err.to_string(), "Not found: workspace");
    }

    #[test]
    fn error_code_returns_expected_code() {
        assert_eq!(AppError::NotFound("".into()).error_code(), "NOT_FOUND");
        assert_eq!(AppError::Internal("".into()).error_code(), "INTERNAL_ERROR");
        assert_eq!(AppError::AuthError("".into()).error_code(), "AUTH_ERROR");
        assert_eq!(AppError::Timeout("".into()).error_code(), "TIMEOUT");
    }

    #[test]
    fn error_kind_as_str_matches_all_variants() {
        assert_eq!(ErrorKind::NotFound.as_str(), "NOT_FOUND");
        assert_eq!(ErrorKind::InvalidInput.as_str(), "INVALID_INPUT");
        assert_eq!(ErrorKind::Storage.as_str(), "STORAGE_ERROR");
        assert_eq!(ErrorKind::Workspace.as_str(), "WORKSPACE_ERROR");
        assert_eq!(ErrorKind::Config.as_str(), "CONFIG_ERROR");
        assert_eq!(ErrorKind::Io.as_str(), "IO_ERROR");
        assert_eq!(ErrorKind::Migration.as_str(), "MIGRATION_ERROR");
        assert_eq!(ErrorKind::Security.as_str(), "SECURITY_ERROR");
        assert_eq!(ErrorKind::ApprovalRequired.as_str(), "APPROVAL_REQUIRED");
        assert_eq!(ErrorKind::Patch.as_str(), "PATCH_ERROR");
        assert_eq!(ErrorKind::Terminal.as_str(), "TERMINAL_ERROR");
        assert_eq!(ErrorKind::Model.as_str(), "MODEL_ERROR");
        assert_eq!(ErrorKind::Timeout.as_str(), "TIMEOUT");
        assert_eq!(ErrorKind::RateLimit.as_str(), "RATE_LIMIT");
        assert_eq!(ErrorKind::AuthError.as_str(), "AUTH_ERROR");
        assert_eq!(ErrorKind::Network.as_str(), "NETWORK_ERROR");
        assert_eq!(ErrorKind::Internal.as_str(), "INTERNAL_ERROR");
    }
}
