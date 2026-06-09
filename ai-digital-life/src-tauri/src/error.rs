use adl_errors::AppError;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
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
    NetworkError,
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
            Self::NetworkError => "NETWORK_ERROR",
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
        Self { code: app_error_to_code(&e), message: e.to_string() }
    }
}

fn app_error_to_code(e: &AppError) -> IpcErrorCode {
    match e {
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
        AppError::Network(_) => IpcErrorCode::NetworkError,
        AppError::Internal(_) => IpcErrorCode::InternalError,
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(e: anyhow::Error) -> Self {
        let msg = e.to_string();
        let code = if let Some(app_err) = e.downcast_ref::<AppError>() {
            app_error_to_code(app_err)
        } else if e.downcast_ref::<std::io::Error>().is_some() {
            IpcErrorCode::IoError
        } else if let Some(serde_err) = e.downcast_ref::<serde_json::Error>() {
            match serde_err.classify() {
                serde_json::error::Category::Io => IpcErrorCode::IoError,
                serde_json::error::Category::Syntax
                | serde_json::error::Category::Data
                | serde_json::error::Category::Eof => IpcErrorCode::InvalidInput,
            }
        } else {
            IpcErrorCode::InternalError
        };
        Self { code, message: msg }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_to_code_maps_all_variants() {
        let cases = vec![
            (AppError::NotFound("x".into()), IpcErrorCode::NotFound),
            (AppError::InvalidInput("x".into()), IpcErrorCode::InvalidInput),
            (AppError::Storage("x".into()), IpcErrorCode::StorageError),
            (AppError::Workspace("x".into()), IpcErrorCode::WorkspaceError),
            (AppError::Config("x".into()), IpcErrorCode::ConfigError),
            (AppError::Io("x".into()), IpcErrorCode::IoError),
            (AppError::Migration("x".into()), IpcErrorCode::MigrationError),
            (AppError::Security("x".into()), IpcErrorCode::SecurityError),
            (AppError::ApprovalRequired("x".into()), IpcErrorCode::ApprovalRequired),
            (AppError::Patch("x".into()), IpcErrorCode::PatchError),
            (AppError::Terminal("x".into()), IpcErrorCode::TerminalError),
            (AppError::Model("x".into()), IpcErrorCode::ModelError),
            (AppError::Timeout("x".into()), IpcErrorCode::Timeout),
            (AppError::RateLimit("x".into()), IpcErrorCode::RateLimit),
            (AppError::AuthError("x".into()), IpcErrorCode::AuthError),
            (AppError::Network("x".into()), IpcErrorCode::NetworkError),
            (AppError::Internal("x".into()), IpcErrorCode::InternalError),
        ];
        for (err, expected) in cases {
            assert_eq!(app_error_to_code(&err), expected, "mismatch for {err}");
        }
    }

    #[test]
    fn ipc_error_code_display_formats_correctly() {
        assert_eq!(IpcErrorCode::NotFound.to_string(), "NOT_FOUND");
        assert_eq!(IpcErrorCode::InternalError.to_string(), "INTERNAL_ERROR");
        assert_eq!(IpcErrorCode::AuthError.to_string(), "AUTH_ERROR");
    }

    #[test]
    fn command_error_from_app_error_contains_message() {
        let err = CommandError::from(AppError::NotFound("workspace".into()));
        assert_eq!(err.code, IpcErrorCode::NotFound);
        assert!(err.message.contains("workspace"));
    }

    #[test]
    fn command_error_display_format() {
        let err = CommandError::from(AppError::InvalidInput("bad param".into()));
        let display = err.to_string();
        assert!(display.starts_with("[INVALID_INPUT]"));
        assert!(display.contains("bad param"));
    }
}
