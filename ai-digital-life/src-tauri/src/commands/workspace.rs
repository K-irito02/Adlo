use crate::commands::ipc;
use crate::commands::workspace_git::persist_workspace_meta;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    FileOutlineItem, IpcResult, RetrievalSnapshot, WorkspaceChangePreview,
    WorkspaceFileChangedEvent, WorkspaceFileDocument, WorkspaceMeta, WorkspaceSearchHit,
    WorkspaceStatus, WorkspaceTreeNode, WorkspaceType, now_ms,
};
use std::path::PathBuf;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn workspace_open(
    app: tauri::AppHandle,
    workspace_path: String,
) -> Result<IpcResult<WorkspaceMeta>, AppError> {
    let state = app.state::<AppState>();
    let path = PathBuf::from(workspace_path);

    // Phase 1: open workspace (file I/O) + build retrieval snapshot (tree walk) in spawn_blocking
    let (meta, snapshot) = tokio::task::spawn_blocking(move || {
        let (meta, _recent) = adl_workspace::open_workspace(path.as_path())?;
        let snapshot = adl_workspace::build_retrieval_snapshot(
            &meta.id,
            PathBuf::from(&meta.root_path).as_path(),
        )?;
        Ok::<_, AppError>((meta, snapshot))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    // Phase 2: persist to DB + emit events (back on async runtime, state access is safe)
    persist_workspace_meta(&state, &meta)?;
    state.event_bus.emit(adl_kernel::events::AppEvent::WorkspaceOpened(meta.id.clone()));

    state.db.save_entity(
        EntityTable::RetrievalSnapshots,
        &meta.id,
        Some(&meta.id),
        None,
        Some("completed"),
        &snapshot,
    )?;
    let _ = app.emit("digital-life://retrieval-status", &snapshot);
    state.event_bus.emit(adl_kernel::events::AppEvent::RetrievalStatusChanged(meta.id.clone()));
    super::workspace_sidebar::upsert_sidebar_after_open(&state, &meta)?;

    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub fn workspace_clear_current(state: tauri::State<'_, AppState>) -> IpcResult<bool> {
    crate::commands::ipc_try(|| {
        state.db.put_state("current_workspace", "null")?;
        *state
            .current_workspace
            .write()
            .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))? = None;
        Ok(true)
    })
}

#[tauri::command]
pub fn workspace_pick_directory(app: tauri::AppHandle) -> IpcResult<Option<String>> {
    let path = app.dialog().file().blocking_pick_folder();
    let result = match path {
        Some(fp) => match fp.into_path() {
            Ok(pb) => Ok(Some(pb.to_string_lossy().to_string())),
            Err(e) => Err(AppError::Workspace(format!("failed to resolve folder path: {e}"))),
        },
        None => Ok(None),
    };
    ipc(result)
}

#[tauri::command]
pub async fn workspace_create_file(
    app: tauri::AppHandle,
    relative_path: String,
    content: String,
) -> Result<IpcResult<WorkspaceFileDocument>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::create_file(PathBuf::from(root_path).as_path(), &relative_path, &content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_write_file(
    app: tauri::AppHandle,
    relative_path: String,
    content: String,
) -> Result<IpcResult<WorkspaceFileDocument>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::write_file(PathBuf::from(root_path).as_path(), &relative_path, &content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_create_folder(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::create_folder(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_read_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<WorkspaceFileDocument>, AppError> {
    let state = app.state::<AppState>();
    let root_path = match workspace_path {
        Some(p) => p,
        None => {
            let ws = current_workspace(&state)?;
            ws.root_path
        },
    };
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::read_file(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_get_change_preview(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<WorkspaceChangePreview>, AppError> {
    let state = app.state::<AppState>();
    let root_path = match workspace_path {
        Some(p) => p,
        None => {
            let ws = current_workspace(&state)?;
            ws.root_path
        },
    };
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::read_change_preview(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_list_tree(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<IpcResult<Vec<WorkspaceTreeNode>>, AppError> {
    let state = app.state::<AppState>();
    let path = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            let ws = current_workspace(&state)?;
            PathBuf::from(&ws.root_path)
        },
    };
    let tree = tokio::task::spawn_blocking(move || adl_workspace::list_tree(path.as_path()))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(tree)))
}

#[tauri::command]
pub async fn workspace_search(
    app: tauri::AppHandle,
    query: String,
) -> Result<IpcResult<Vec<WorkspaceSearchHit>>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::search_text(PathBuf::from(root_path).as_path(), &query)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_outline(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<Vec<FileOutlineItem>>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::outline(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub fn workspace_set_editor_dirty_paths(
    state: tauri::State<'_, AppState>,
    relative_paths: Vec<String>,
) -> IpcResult<bool> {
    crate::commands::ipc_try(|| {
        let mut dirty = state
            .editor_dirty_paths
            .lock()
            .map_err(|_| AppError::Internal("dirty path mutex poisoned".into()))?;
        dirty.clear();
        dirty.extend(relative_paths.into_iter().map(|path| path.replace('\\', "/")));
        Ok(true)
    })
}

#[tauri::command]
pub fn workspace_emit_file_changed(
    app: tauri::AppHandle,
    path: String,
    last_modified_at: i64,
) -> IpcResult<bool> {
    let event = WorkspaceFileChangedEvent { path, last_modified_at };
    let _ = app.emit("digital-life://workspace-file-changed", event);
    IpcResult::ok(true)
}

#[tauri::command]
pub async fn workspace_rename_file(
    app: tauri::AppHandle,
    relative_path: String,
    new_name: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::rename_entry(PathBuf::from(root_path).as_path(), &relative_path, &new_name)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_delete_file(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let rel_path = relative_path.clone();
    let succeeded = tokio::task::spawn_blocking(move || {
        adl_workspace::delete_entry(PathBuf::from(root_path).as_path(), &rel_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    match succeeded {
        true => {
            let _ = app.emit(
                "digital-life://workspace-file-changed",
                WorkspaceFileChangedEvent { path: relative_path, last_modified_at: now_ms() },
            );
            Ok(ipc(Ok(true)))
        },
        false => Ok(ipc(Ok(false))),
    }
}

#[tauri::command]
pub async fn workspace_duplicate_file(
    app: tauri::AppHandle,
    relative_path: String,
    new_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::duplicate_entry(
            PathBuf::from(root_path).as_path(),
            &relative_path,
            &new_path,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_get_absolute_path(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<String>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::get_absolute_path(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_move_file(
    app: tauri::AppHandle,
    relative_path: String,
    new_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::move_entry(PathBuf::from(root_path).as_path(), &relative_path, &new_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

pub fn current_workspace(state: &AppState) -> Result<WorkspaceMeta, AppError> {
    state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone()
        .ok_or_else(|| AppError::NotFound("active workspace".into()))
}

pub fn virtual_global_workspace() -> WorkspaceMeta {
    let now = now_ms();
    WorkspaceMeta {
        id: adl_types::GLOBAL_WORKSPACE_ID.to_string(),
        path: String::new(),
        root_path: String::new(),
        name: "Global Conversation".into(),
        r#type: WorkspaceType::Unknown,
        status: WorkspaceStatus::Ready,
        git_snapshot: None,
        created_at: now,
        updated_at: now,
        last_opened_at: now,
    }
}

pub fn latest_retrieval(state: &AppState) -> Result<Option<RetrievalSnapshot>, AppError> {
    let Some(workspace) = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone()
    else {
        return Ok(None);
    };
    state.db.load_entity(EntityTable::RetrievalSnapshots, &workspace.id)
}
