use adl_errors::AppError;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IpcErrorCode {
    NotFound,
    InvalidInput,
    StorageError,
    WorkspaceError,
    ConfigError,
    IoError,
    MigrationError,
    SecurityError,
    ApprovalRequired,
    PatchError,
    TerminalError,
    ModelError,
    Timeout,
    RateLimit,
    AuthError,
    InternalError,
}

impl std::fmt::Display for IpcErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::NotFound => "NOT_FOUND",
            Self::InvalidInput => "INVALID_INPUT",
            Self::StorageError => "STORAGE_ERROR",
            Self::WorkspaceError => "WORKSPACE_ERROR",
            Self::ConfigError => "CONFIG_ERROR",
            Self::IoError => "IO_ERROR",
            Self::MigrationError => "MIGRATION_ERROR",
            Self::SecurityError => "SECURITY_ERROR",
            Self::ApprovalRequired => "APPROVAL_REQUIRED",
            Self::PatchError => "PATCH_ERROR",
            Self::TerminalError => "TERMINAL_ERROR",
            Self::ModelError => "MODEL_ERROR",
            Self::Timeout => "TIMEOUT",
            Self::RateLimit => "RATE_LIMIT",
            Self::AuthError => "AUTH_ERROR",
            Self::InternalError => "INTERNAL_ERROR",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: IpcErrorCode,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(e: AppError) -> Self {
        let code = match &e {
            AppError::NotFound(_) => IpcErrorCode::NotFound,
            AppError::InvalidInput(_) => IpcErrorCode::InvalidInput,
            AppError::Storage(_) => IpcErrorCode::StorageError,
            AppError::Workspace(_) => IpcErrorCode::WorkspaceError,
            AppError::Config(_) => IpcErrorCode::ConfigError,
            AppError::Io(_) => IpcErrorCode::IoError,
            AppError::Migration(_) => IpcErrorCode::MigrationError,
            AppError::Security(_) => IpcErrorCode::SecurityError,
            AppError::ApprovalRequired(_) => IpcErrorCode::ApprovalRequired,
            AppError::Patch(_) => IpcErrorCode::PatchError,
            AppError::Terminal(_) => IpcErrorCode::TerminalError,
            AppError::Model(_) => IpcErrorCode::ModelError,
            AppError::Timeout(_) => IpcErrorCode::Timeout,
            AppError::RateLimit(_) => IpcErrorCode::RateLimit,
            AppError::AuthError(_) => IpcErrorCode::AuthError,
            AppError::Internal(_) => IpcErrorCode::InternalError,
        };
        Self { code, message: e.to_string() }
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(e: anyhow::Error) -> Self {
        Self { code: IpcErrorCode::InternalError, message: e.to_string() }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}
