pub mod agent;
pub mod agent_pipeline;
pub(crate) mod agent_pipeline_stream;
pub mod agent_pipeline_types;
pub mod app;
pub mod audit;
pub mod browser;
pub mod ci;
pub mod command;
pub mod commands_config;
pub mod compaction;
pub mod conversation;
pub mod custom_agent;
pub mod durable;
pub mod lsp;
pub mod mcp;
pub mod patch;
pub mod permission;
pub mod platform;
pub mod provider;
pub mod pty_commands;
pub mod reference;
pub mod reserved;
pub mod retrieval;
pub mod run_activity;
pub mod session_fork;
pub mod snapshot;
pub mod subagent;
pub mod task;
pub mod web_tools;
pub mod workspace;
pub mod workspace_git;
pub mod workspace_sidebar;

use crate::error::CommandError;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::IpcResult;
use tauri::Emitter;

pub use self::agent_pipeline_types::{CallModelContext, FinalizeRunContext, RunActivityContext};

pub fn ipc<T>(result: Result<T, AppError>) -> IpcResult<T> {
    match result {
        Ok(data) => IpcResult::ok(data),
        Err(error) => {
            let cmd_err = CommandError::from(error);
            IpcResult::err(cmd_err.code, cmd_err.message)
        },
    }
}

pub fn ipc_try<T>(f: impl FnOnce() -> Result<T, AppError>) -> IpcResult<T> {
    ipc(f())
}

pub(crate) fn save_and_emit_run_activity(ctx: RunActivityContext<'_>) {
    let _ = ctx.state.db.save_entity(
        EntityTable::RunActivityEvents,
        &adl_types::create_id("runact"),
        Some(ctx.workspace_id),
        Some(ctx.session_id),
        Some(ctx.run_id),
        ctx.event,
    );
    let _ = ctx.app.emit(
        "digital-life://run-activity",
        adl_kernel::events::run_activity_event(
            ctx.run_id,
            ctx.seq,
            ctx.ts,
            ctx.event_type,
            ctx.extra,
        ),
    );
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

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::IpcResult;

    #[test]
    fn ipc_ok_wraps_data() {
        let result: IpcResult<i32> = ipc(Ok(42));
        match result {
            IpcResult::Ok { ok: true, data: 42 } => {},
            other => panic!("expected Ok(42), got {other:?}"),
        }
    }

    #[test]
    fn ipc_err_wraps_error() {
        let result: IpcResult<i32> = ipc(Err(AppError::NotFound("test".into())));
        match result {
            IpcResult::Err { ok: false, error } => {
                assert_eq!(error.code, "NOT_FOUND");
                assert!(error.message.contains("test"));
            },
            other => panic!("expected Err, got {other:?}"),
        }
    }

    #[test]
    fn ipc_try_closure_ok() {
        let result: IpcResult<String> = ipc_try(|| Ok("hello".into()));
        match result {
            IpcResult::Ok { ok: true, data } => {
                assert_eq!(data, "hello");
            },
            other => panic!("expected Ok, got {other:?}"),
        }
    }

    #[test]
    fn ipc_try_closure_err() {
        let result: IpcResult<i32> = ipc_try(|| Err(AppError::Internal("fail".into())));
        match result {
            IpcResult::Err { ok: false, error } => {
                assert_eq!(error.code, "INTERNAL_ERROR");
            },
            other => panic!("expected Err, got {other:?}"),
        }
    }
}
