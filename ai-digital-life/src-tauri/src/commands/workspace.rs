use crate::commands::ipc;
use adl_types::IpcResult;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

/// Native folder-picker (system capability). The ad-server owns workspace state;
/// the shell only provides the OS dialog for the frontend to choose a path.
#[tauri::command]
pub async fn workspace_pick_directory(app: tauri::AppHandle) -> IpcResult<Option<String>> {
    let (tx, rx) = oneshot::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let path = rx.await.unwrap_or(None);
    let result = match path {
        Some(fp) => match fp.into_path() {
            Ok(pb) => Ok(Some(pb.to_string_lossy().to_string())),
            Err(e) => {
                Err(adl_errors::AppError::Workspace(format!("failed to resolve folder path: {e}")))
            },
        },
        None => Ok(None),
    };
    ipc(result)
}
