use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::IpcResult;
use adl_terminal::session_manager::PtySessionInfo;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateInput {
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateResult {
    pub session_id: String,
}

#[tauri::command]
pub async fn pty_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: PtyCreateInput,
) -> Result<IpcResult<PtyCreateResult>, CommandError> {
    let result: Result<PtyCreateResult, AppError> = (|| {
        let workspace = crate::commands::workspace::current_workspace(&state)?;
        let cwd = input.cwd.unwrap_or(workspace.root_path);
        let shell = input.shell.unwrap_or_else(|| "powershell".to_string());
        let sessions = state.pty_sessions.lock().map_err(|_| {
            AppError::Internal("pty_sessions mutex poisoned".into())
        })?;
        let session_id = sessions.create(app, &shell, &cwd, input.cols, input.rows)?;
        Ok(PtyCreateResult { session_id })
    })();
    Ok(ipc(result))
}

#[tauri::command]
pub async fn pty_input(
    state: tauri::State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<IpcResult<bool>, CommandError> {
    let result: Result<bool, AppError> = (|| {
        let sessions = state.pty_sessions.lock().map_err(|_| {
            AppError::Internal("pty_sessions mutex poisoned".into())
        })?;
        sessions.write(&session_id, &data)?;
        Ok(true)
    })();
    Ok(ipc(result))
}

#[tauri::command]
pub async fn pty_resize(
    state: tauri::State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<IpcResult<bool>, CommandError> {
    let result: Result<bool, AppError> = (|| {
        let sessions = state.pty_sessions.lock().map_err(|_| {
            AppError::Internal("pty_sessions mutex poisoned".into())
        })?;
        sessions.resize(&session_id, cols, rows)?;
        Ok(true)
    })();
    Ok(ipc(result))
}

#[tauri::command]
pub async fn pty_kill(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    let result: Result<bool, AppError> = (|| {
        let sessions = state.pty_sessions.lock().map_err(|_| {
            AppError::Internal("pty_sessions mutex poisoned".into())
        })?;
        sessions.kill(&session_id)?;
        Ok(true)
    })();
    Ok(ipc(result))
}

#[tauri::command]
pub fn pty_list(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<PtySessionInfo>> {
    let sessions = state.pty_sessions.lock().map_err(|_| {
        AppError::Internal("pty_sessions mutex poisoned".into())
    });
    match sessions {
        Ok(s) => ipc(s.list()),
        Err(e) => ipc::<Vec<PtySessionInfo>>(Err(e)),
    }
}
