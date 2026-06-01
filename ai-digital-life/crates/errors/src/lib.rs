use serde::Serialize;
use thiserror::Error;

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

    #[error("Internal error: {0}")]
    Internal(String),
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
}
