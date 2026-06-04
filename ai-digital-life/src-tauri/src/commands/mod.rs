pub mod agent;
pub mod agent_pipeline;
pub mod app;
pub mod audit;
pub mod browser;
pub mod command;
pub mod conversation;
pub mod model;
pub mod patch;
pub mod platform;
pub mod pty_commands;
pub mod retrieval;
pub mod run_activity;
pub mod task;
pub mod workspace;
pub mod workspace_git;
pub mod workspace_sidebar;

use crate::error::CommandError;
use adl_errors::AppError;
use adl_kernel::IpcResult;

pub fn ipc<T>(result: Result<T, AppError>) -> IpcResult<T> {
    match result {
        Ok(data) => IpcResult::ok(data),
        Err(error) => {
            let cmd_err = CommandError::from(error);
            IpcResult::err(cmd_err.code.to_string(), cmd_err.message)
        }
    }
}

pub fn ipc_try<T>(f: impl FnOnce() -> Result<T, AppError>) -> IpcResult<T> {
    ipc(f())
}

#[macro_export]
macro_rules! workspace_cmd {
    ($state:expr, $fn:path $(, $arg:expr)*) => {
        $crate::commands::ipc_try(|| {
            use std::path::PathBuf;
            let ws = $state
                .current_workspace
                .read()
                .map_err(|_| adl_errors::AppError::Internal("workspace lock poisoned".into()))?;
            let ws = ws
                .as_ref()
                .ok_or(adl_errors::AppError::Workspace("no workspace open".into()))?;
            let root = PathBuf::from(&ws.root_path);
            $fn(root.as_path() $(, $arg)*)
        })
    };
}
