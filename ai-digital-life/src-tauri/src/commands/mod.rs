pub mod agent;
pub mod app;
pub mod command;
pub mod conversation;
pub mod model;
pub mod patch;
pub mod retrieval;
pub mod task;
pub mod workspace;

use adl_errors::AppError;
use adl_kernel::IpcResult;

pub fn ipc<T>(result: Result<T, AppError>) -> IpcResult<T> {
    match result {
        Ok(data) => IpcResult::ok(data),
        Err(error) => {
            let code = match &error {
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
            IpcResult::err(code, error.to_string())
        }
    }
}

pub fn ipc_try<T>(f: impl FnOnce() -> Result<T, AppError>) -> IpcResult<T> {
    ipc(f())
}
