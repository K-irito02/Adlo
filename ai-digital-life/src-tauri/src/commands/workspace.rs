use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    FileOutlineItem, IpcResult, RecentWorkspaceEntry, RetrievalSnapshot, WorkspaceFileChangedEvent,
    WorkspaceFileDocument, WorkspaceMeta, WorkspaceSearchHit, WorkspaceTreeNode,
};
use adl_storage::EntityTable;
use std::path::PathBuf;
use tauri::Emitter;

#[tauri::command]
pub fn workspace_list_recent(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let workspaces: Vec<WorkspaceMeta> = state.db.list_entities(EntityTable::Workspaces)?;
        Ok(workspaces
            .into_iter()
            .enumerate()
            .map(|(index, workspace)| RecentWorkspaceEntry {
                id: workspace.id,
                path: workspace.path,
                root_path: workspace.root_path,
                name: workspace.name,
                last_opened_at: workspace.last_opened_at,
                is_pinned: false,
                pinned_order: 0,
                unpinned_order: index as i32,
                removed_from_sidebar: false,
                available: true,
            })
            .collect())
    })
}

#[tauri::command]
pub fn workspace_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    workspace_path: String,
) -> IpcResult<WorkspaceMeta> {
    crate::commands::ipc_try(|| {
        let (meta, _recent) =
            adl_workspace::open_workspace(PathBuf::from(workspace_path).as_path())?;
        state.db.save_entity(
            EntityTable::Workspaces,
            &meta.id,
            Some(&meta.id),
            None,
            Some("ready"),
            &meta,
        )?;
        state
            .db
            .put_state("current_workspace", &serde_json::to_string(&meta)?)?;
        *state
            .current_workspace
            .lock()
            .expect("workspace mutex poisoned") = Some(meta.clone());
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
        Ok(meta)
    })
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
pub fn workspace_list_tree(state: tauri::State<'_, AppState>) -> IpcResult<Vec<WorkspaceTreeNode>> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::list_tree(PathBuf::from(&workspace.root_path).as_path())
    }))
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

pub fn current_workspace(state: &AppState) -> Result<WorkspaceMeta, AppError> {
    state
        .current_workspace
        .lock()
        .expect("workspace mutex poisoned")
        .clone()
        .ok_or_else(|| AppError::NotFound("active workspace".into()))
}

fn with_workspace<T>(
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
