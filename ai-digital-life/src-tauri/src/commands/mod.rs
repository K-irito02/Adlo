pub mod agent;
pub mod app;
pub mod audit;
pub mod command;
pub mod conversation;
pub mod model;
pub mod patch;
pub mod pty_commands;
pub mod retrieval;
pub mod run_activity;
pub mod task;
pub mod platform;
pub mod workspace;
pub mod workspace_git;
pub mod workspace_sidebar;

use adl_errors::AppError;
use adl_kernel::IpcResult;
use crate::error::CommandError;

pub fn ipc<T>(result: Result<T, AppError>) -> IpcResult<T> {
    match result {
        Ok(data) => IpcResult::ok(data),
        Err(error) => {
            let cmd_err = CommandError::from(error);
            IpcResult::err(cmd_err.code, cmd_err.message)
        }
    }
}

pub fn ipc_try<T>(f: impl FnOnce() -> Result<T, AppError>) -> IpcResult<T> {
    ipc(f())
}
