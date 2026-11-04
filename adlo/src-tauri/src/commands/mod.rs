pub mod app;
pub mod browser;
pub mod browser_memory;
pub(crate) mod browser_webview_setup;
pub mod clipboard;
pub mod divider_strip;
pub mod download_commands;
pub mod platform;
pub mod port_scan;
pub mod reserved;
pub mod storage;
pub mod workspace;

use crate::error::CommandError;
use adl_errors::AppError;
use adl_types::IpcResult;

pub fn ipc<T>(result: Result<T, AppError>) -> IpcResult<T> {
    match result {
        Ok(data) => IpcResult::ok(data),
        Err(error) => {
            let cmd_err = CommandError::from(error);
            IpcResult::err(cmd_err.code, cmd_err.message)
        },
    }
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
}
