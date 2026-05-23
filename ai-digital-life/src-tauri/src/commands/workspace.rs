use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    now_ms, FileOutlineItem, IpcResult, RetrievalSnapshot, WorkspaceChangePreview,
    WorkspaceFileChangedEvent, WorkspaceFileDocument, WorkspaceMeta, WorkspaceSearchHit,
    WorkspaceStatus, WorkspaceTreeNode, WorkspaceType,
};
use adl_storage::EntityTable;
use std::path::PathBuf;
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn workspace_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    workspace_path: String,
) -> IpcResult<WorkspaceMeta> {
    crate::commands::ipc_try(|| {
        let (meta, _recent) =
            adl_workspace::open_workspace(PathBuf::from(workspace_path).as_path())?;
        persist_workspace_meta(&state, &meta)?;
        state
            .event_bus
            .emit(adl_events::AppEvent::WorkspaceOpened(meta.id.clone()));

        let snapshot = adl_workspace::build_retrieval_snapshot(
            &meta.id,
            PathBuf::from(&meta.root_path).as_path(),
        )?;
        state.db.save_entity(
            EntityTable::RetrievalSnapshots,
            &meta.id,
            Some(&meta.id),
            None,
            Some("completed"),
            &snapshot,
        )?;
        let _ = app.emit("digital-life://retrieval-status", &snapshot);
        state
            .event_bus
            .emit(adl_events::AppEvent::RetrievalStatusChanged(
                meta.id.clone(),
            ));
        super::workspace_sidebar::upsert_sidebar_after_open(&state, &meta)?;
        Ok(meta)
    })
}

#[tauri::command]
pub fn workspace_clear_current(state: tauri::State<'_, AppState>) -> IpcResult<bool> {
    crate::commands::ipc_try(|| {
        state.db.put_state("current_workspace", "null")?;
        *state
            .current_workspace
            .lock()
            .expect("workspace mutex poisoned") = None;
        Ok(true)
    })
}

#[tauri::command]
pub fn workspace_pick_directory(app: tauri::AppHandle) -> IpcResult<Option<String>> {
    let path = app.dialog().file().blocking_pick_folder();
    let result = match path {
        Some(fp) => match fp.into_path() {
            Ok(pb) => Ok(Some(pb.to_string_lossy().to_string())),
            Err(e) => Err(AppError::Workspace(format!(
                "failed to resolve folder path: {e}"
            ))),
        },
        None => Ok(None),
    };
    ipc(result)
}

#[tauri::command]
pub fn workspace_create_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    content: String,
) -> IpcResult<WorkspaceFileDocument> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::create_file(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
            &content,
        )
    }))
}

#[tauri::command]
pub fn workspace_create_folder(
    state: tauri::State<'_, AppState>,
    relative_path: String,
) -> IpcResult<bool> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::create_folder(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
        )
    }))
}

#[tauri::command]
pub fn workspace_read_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
) -> IpcResult<WorkspaceFileDocument> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::read_file(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
        )
    }))
}

#[tauri::command]
pub fn workspace_get_change_preview(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    workspace_path: Option<String>,
) -> IpcResult<WorkspaceChangePreview> {
    let root = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            return ipc(with_workspace(&state, |workspace| {
                adl_workspace::read_change_preview(
                    PathBuf::from(&workspace.root_path).as_path(),
                    &relative_path,
                )
            }));
        }
    };
    let preview = adl_workspace::read_change_preview(root.as_path(), &relative_path);
    ipc(preview)
}

#[tauri::command]
pub fn workspace_list_tree(
    state: tauri::State<'_, AppState>,
    workspace_path: Option<String>,
) -> IpcResult<Vec<WorkspaceTreeNode>> {
    match workspace_path {
        Some(path) => ipc(adl_workspace::list_tree(PathBuf::from(&path).as_path())),
        None => ipc(with_workspace(&state, |workspace| {
            adl_workspace::list_tree(PathBuf::from(&workspace.root_path).as_path())
        })),
    }
}

#[tauri::command]
pub fn workspace_search(
    state: tauri::State<'_, AppState>,
    query: String,
) -> IpcResult<Vec<WorkspaceSearchHit>> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::search_text(PathBuf::from(&workspace.root_path).as_path(), &query)
    }))
}

#[tauri::command]
pub fn workspace_outline(
    state: tauri::State<'_, AppState>,
    relative_path: String,
) -> IpcResult<Vec<FileOutlineItem>> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::outline(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
        )
    }))
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
            .expect("dirty path mutex poisoned");
        dirty.clear();
        dirty.extend(
            relative_paths
                .into_iter()
                .map(|path| path.replace('\\', "/")),
        );
        Ok(true)
    })
}

#[tauri::command]
pub fn workspace_emit_file_changed(
    app: tauri::AppHandle,
    path: String,
    last_modified_at: i64,
) -> IpcResult<bool> {
    let event = WorkspaceFileChangedEvent {
        path,
        last_modified_at,
    };
    let _ = app.emit("digital-life://workspace-file-changed", event);
    IpcResult::ok(true)
}

#[tauri::command]
pub fn workspace_rename_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    new_name: String,
) -> IpcResult<bool> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::rename_entry(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
            &new_name,
        )
    }))
}

#[tauri::command]
pub fn workspace_delete_file(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    relative_path: String,
) -> IpcResult<bool> {
    let succeeded = with_workspace(&state, |workspace| {
        adl_workspace::delete_entry(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
        )
    });
    match succeeded {
        Ok(true) => {
            let _ = app.emit(
                "digital-life://workspace-file-changed",
                WorkspaceFileChangedEvent {
                    path: relative_path,
                    last_modified_at: now_ms(),
                },
            );
            IpcResult::ok(true)
        }
        Ok(false) => IpcResult::ok(false),
        Err(e) => IpcResult::err("DELETE_FAILED", e.to_string()),
    }
}

#[tauri::command]
pub fn workspace_duplicate_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    new_path: String,
) -> IpcResult<bool> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::duplicate_entry(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
            &new_path,
        )
    }))
}

#[tauri::command]
pub fn workspace_get_absolute_path(
    state: tauri::State<'_, AppState>,
    relative_path: String,
) -> IpcResult<String> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::get_absolute_path(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
        )
    }))
}

#[tauri::command]
pub fn workspace_move_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    new_path: String,
) -> IpcResult<bool> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::move_entry(
            PathBuf::from(&workspace.root_path).as_path(),
            &relative_path,
            &new_path,
        )
    }))
}

pub fn current_workspace(state: &AppState) -> Result<WorkspaceMeta, AppError> {
    state
        .current_workspace
        .lock()
        .expect("workspace mutex poisoned")
        .clone()
        .ok_or_else(|| AppError::NotFound("active workspace".into()))
}

fn persist_workspace_meta(state: &AppState, meta: &WorkspaceMeta) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::Workspaces,
        &meta.id,
        Some(&meta.id),
        None,
        Some("ready"),
        meta,
    )?;
    state
        .db
        .put_state("current_workspace", &serde_json::to_string(meta)?)?;
    *state
        .current_workspace
        .lock()
        .expect("workspace mutex poisoned") = Some(meta.clone());
    Ok(())
}

pub fn virtual_global_workspace() -> WorkspaceMeta {
    let now = now_ms();
    WorkspaceMeta {
        id: adl_kernel::GLOBAL_WORKSPACE_ID.to_string(),
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

pub fn with_workspace<T>(
    state: &AppState,
    f: impl FnOnce(WorkspaceMeta) -> Result<T, AppError>,
) -> Result<T, AppError> {
    f(current_workspace(state)?)
}

pub fn latest_retrieval(state: &AppState) -> Result<Option<RetrievalSnapshot>, AppError> {
    let Some(workspace) = state
        .current_workspace
        .lock()
        .expect("workspace mutex poisoned")
        .clone()
    else {
        return Ok(None);
    };
    state
        .db
        .load_entity(EntityTable::RetrievalSnapshots, &workspace.id)
}

