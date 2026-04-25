use adl_errors::AppError;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(e: AppError) -> Self {
        let code = match &e {
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::InvalidInput(_) => "INVALID_INPUT",
            AppError::Storage(_) => "STORAGE_ERROR",
            AppError::Workspace(_) => "INVALID_WORKSPACE",
            AppError::Config(_) => "CONFIG_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Migration(_) => "MIGRATION_ERROR",
            AppError::Security(_) => "SECURITY_ERROR",
            AppError::ApprovalRequired(_) => "APPROVAL_REQUIRED",
            AppError::Patch(_) => "PATCH_ERROR",
            AppError::Terminal(_) => "TERMINAL_ERROR",
            AppError::Model(_) => "MODEL_ERROR",
            AppError::Internal(_) => "INTERNAL_ERROR",
        };
        Self {
            code: code.to_string(),
            message: e.to_string(),
        }
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(e: anyhow::Error) -> Self {
        Self {
            code: "INTERNAL_ERROR".to_string(),
            message: e.to_string(),
        }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}
