use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    now_ms, FileOutlineItem, GitBranchSummary, GitSnapshot, IpcResult, RecentWorkspaceEntry,
    RetrievalSnapshot, WorkspaceChangePreview, WorkspaceFileChangedEvent, WorkspaceFileDocument,
    WorkspaceGitBranchChangeResult, WorkspaceGitBranchCreateInput, WorkspaceGitBranchSwitchInput,
    WorkspaceMeta, WorkspaceSearchHit, WorkspaceStatus, WorkspaceTreeNode, WorkspaceType,
};
use adl_storage::EntityTable;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

const RECENT_SIDEBAR_KEY: &str = "recent_workspaces_sidebar_v1";

fn load_sidebar_entries(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    match state.db.get_state(RECENT_SIDEBAR_KEY)? {
        Some(json) => Ok(serde_json::from_str(&json).unwrap_or_default()),
        None => Ok(Vec::new()),
    }
}

fn save_sidebar_entries(
    state: &AppState,
    entries: &[RecentWorkspaceEntry],
) -> Result<(), AppError> {
    state
        .db
        .put_state(RECENT_SIDEBAR_KEY, &serde_json::to_string(entries)?)?;
    Ok(())
}

fn seed_sidebar_from_db(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let workspaces: Vec<WorkspaceMeta> = state.db.list_entities(EntityTable::Workspaces)?;
    let mut entries = Vec::with_capacity(workspaces.len());
    for (index, workspace) in workspaces.iter().enumerate() {
        entries.push(RecentWorkspaceEntry {
            id: workspace.id.clone(),
            path: workspace.path.clone(),
            root_path: workspace.root_path.clone(),
            name: workspace.name.clone(),
            last_opened_at: workspace.last_opened_at,
            is_pinned: false,
            pinned_order: 0,
            unpinned_order: index as i32,
            removed_from_sidebar: false,
            available: true,
        });
    }
    if !entries.is_empty() {
        save_sidebar_entries(state, &entries)?;
    }
    Ok(entries)
}

fn merge_workspace_meta_into_sidebar(
    all: &mut [RecentWorkspaceEntry],
    workspaces: &[WorkspaceMeta],
) {
    let by_id: HashMap<String, &WorkspaceMeta> =
        workspaces.iter().map(|w| (w.id.clone(), w)).collect();
    for entry in all.iter_mut() {
        if let Some(w) = by_id.get(&entry.id) {
            entry.path = w.path.clone();
            entry.root_path = w.root_path.clone();
            entry.name = w.name.clone();
            entry.last_opened_at = w.last_opened_at;
            entry.available = true;
        }
    }
}

fn upsert_sidebar_after_open(state: &AppState, meta: &WorkspaceMeta) -> Result<(), AppError> {
    let mut all = load_sidebar_entries(state)?;
    if all.is_empty() {
        all = seed_sidebar_from_db(state)?;
    }
    if let Some(i) = all.iter().position(|e| e.id == meta.id) {
        all[i].path = meta.path.clone();
        all[i].root_path = meta.root_path.clone();
        all[i].name = meta.name.clone();
        all[i].last_opened_at = meta.last_opened_at;
        all[i].removed_from_sidebar = false;
        all[i].available = true;
    } else {
        let unpinned_max = all
            .iter()
            .filter(|e| !e.is_pinned)
            .map(|e| e.unpinned_order)
            .max()
            .unwrap_or(-1);
        all.push(RecentWorkspaceEntry {
            id: meta.id.clone(),
            path: meta.path.clone(),
            root_path: meta.root_path.clone(),
            name: meta.name.clone(),
            last_opened_at: meta.last_opened_at,
            is_pinned: false,
            pinned_order: 0,
            unpinned_order: unpinned_max + 1,
            removed_from_sidebar: false,
            available: true,
        });
    }
    save_sidebar_entries(state, &all)?;
    Ok(())
}

pub fn presentable_recent_list(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let workspaces: Vec<WorkspaceMeta> = state.db.list_entities(EntityTable::Workspaces)?;
    let mut all = load_sidebar_entries(state)?;
    if all.is_empty() && !workspaces.is_empty() {
        all = seed_sidebar_from_db(state)?;
    }
    merge_workspace_meta_into_sidebar(&mut all, &workspaces);

    let mut changed = false;
    for w in &workspaces {
        if !all.iter().any(|e| e.id == w.id) {
            let unpinned_max = all
                .iter()
                .filter(|e| !e.is_pinned)
                .map(|e| e.unpinned_order)
                .max()
                .unwrap_or(-1);
            all.push(RecentWorkspaceEntry {
                id: w.id.clone(),
                path: w.path.clone(),
                root_path: w.root_path.clone(),
                name: w.name.clone(),
                last_opened_at: w.last_opened_at,
                is_pinned: false,
                pinned_order: 0,
                unpinned_order: unpinned_max + 1,
                removed_from_sidebar: false,
                available: true,
            });
            changed = true;
        }
    }
    if changed {
        save_sidebar_entries(state, &all)?;
    }

    let mut visible: Vec<_> = all
        .into_iter()
        .filter(|e| !e.removed_from_sidebar)
        .collect();
    visible.sort_by(|a, b| match (a.is_pinned, b.is_pinned) {
        (true, true) => a.pinned_order.cmp(&b.pinned_order),
        (false, false) => a.unpinned_order.cmp(&b.unpinned_order),
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
    });
    Ok(visible)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderWorkspacesInput {
    pub pinned_ids: Vec<String>,
    pub unpinned_ids: Vec<String>,
}

#[tauri::command]
pub fn workspace_list_recent(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    ipc(presentable_recent_list(&state))
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
        upsert_sidebar_after_open(&state, &meta)?;
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
    let result = path.and_then(|p| p.into_path().ok().map(|pp| pp.to_string_lossy().to_string()));
    IpcResult::ok(result)
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
) -> IpcResult<WorkspaceChangePreview> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::read_change_preview(
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

#[tauri::command]
pub fn workspace_pin(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_sidebar_entries(&state)?;
        if all.is_empty() {
            all = seed_sidebar_from_db(&state)?;
        }
        let Some(idx) = all.iter().position(|e| e.id == workspace_id) else {
            return Err(AppError::NotFound(format!("workspace {workspace_id}")));
        };
        let max_p = all
            .iter()
            .filter(|e| e.is_pinned && e.id != workspace_id)
            .map(|e| e.pinned_order)
            .max()
            .unwrap_or(-1);
        let entry = &mut all[idx];
        entry.is_pinned = true;
        entry.pinned_order = max_p + 1;
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}

#[tauri::command]
pub fn workspace_unpin(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_sidebar_entries(&state)?;
        if all.is_empty() {
            all = seed_sidebar_from_db(&state)?;
        }
        let Some(idx) = all.iter().position(|e| e.id == workspace_id) else {
            return Err(AppError::NotFound(format!("workspace {workspace_id}")));
        };
        let max_u = all
            .iter()
            .filter(|e| !e.is_pinned && e.id != workspace_id)
            .map(|e| e.unpinned_order)
            .max()
            .unwrap_or(-1);
        let entry = &mut all[idx];
        entry.is_pinned = false;
        entry.unpinned_order = max_u + 1;
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}

#[tauri::command]
pub fn workspace_reorder(
    state: tauri::State<'_, AppState>,
    input: ReorderWorkspacesInput,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_sidebar_entries(&state)?;
        if all.is_empty() {
            all = seed_sidebar_from_db(&state)?;
        }
        for (i, id) in input.pinned_ids.iter().enumerate() {
            if let Some(e) = all.iter_mut().find(|e| e.id == *id) {
                e.is_pinned = true;
                e.pinned_order = i as i32;
            }
        }
        for (i, id) in input.unpinned_ids.iter().enumerate() {
            if let Some(e) = all.iter_mut().find(|e| e.id == *id) {
                e.is_pinned = false;
                e.unpinned_order = i as i32;
            }
        }
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}

#[tauri::command]
pub fn workspace_remove_from_sidebar(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_sidebar_entries(&state)?;
        if all.is_empty() {
            all = seed_sidebar_from_db(&state)?;
        }
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = true;
        }
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}

#[tauri::command]
pub fn workspace_restore_to_sidebar(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_sidebar_entries(&state)?;
        if all.is_empty() {
            all = seed_sidebar_from_db(&state)?;
        }
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = false;
        } else {
            let meta = state
                .db
                .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
                .ok_or_else(|| AppError::NotFound(format!("workspace {workspace_id}")))?;
            let unpinned_max = all
                .iter()
                .filter(|e| !e.is_pinned)
                .map(|e| e.unpinned_order)
                .max()
                .unwrap_or(-1);
            all.push(RecentWorkspaceEntry {
                id: meta.id.clone(),
                path: meta.path.clone(),
                root_path: meta.root_path.clone(),
                name: meta.name.clone(),
                last_opened_at: meta.last_opened_at,
                is_pinned: false,
                pinned_order: 0,
                unpinned_order: unpinned_max + 1,
                removed_from_sidebar: false,
                available: true,
            });
        }
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}

#[tauri::command]
pub fn workspace_reveal_in_file_manager(path: String) -> IpcResult<bool> {
    ipc(reveal_in_os_file_manager(&path).map(|()| true))
}

fn reveal_in_os_file_manager(path: &str) -> Result<(), AppError> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(AppError::InvalidInput(format!(
            "path does not exist: {path}"
        )));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(p).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(p).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(p).spawn()?;
    }
    Ok(())
}

#[tauri::command]
pub fn workspace_get_git_status(state: tauri::State<'_, AppState>) -> IpcResult<GitSnapshot> {
    ipc(with_workspace(&state, |workspace| {
        Ok(adl_workspace::capture_git_snapshot(
            PathBuf::from(&workspace.root_path).as_path(),
        ))
    }))
}

#[tauri::command]
pub fn workspace_list_git_branches(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<GitBranchSummary>> {
    ipc(with_workspace(&state, |workspace| {
        adl_workspace::list_git_branches(PathBuf::from(&workspace.root_path).as_path())
    }))
}

#[tauri::command]
pub fn workspace_switch_git_branch(
    state: tauri::State<'_, AppState>,
    input: WorkspaceGitBranchSwitchInput,
) -> IpcResult<WorkspaceGitBranchChangeResult> {
    crate::commands::ipc_try(|| {
        let workspace = current_workspace(&state)?;
        let branch_name = input.branch_name.trim();
        if branch_name.is_empty() {
            return Err(AppError::InvalidInput("branch name is required".into()));
        }
        let (git_snapshot, stashed_changes, previous_branch) = adl_workspace::switch_git_branch(
            PathBuf::from(&workspace.root_path).as_path(),
            branch_name,
            input.allow_stash,
        )?;
        let current_branch = git_snapshot
            .branch
            .clone()
            .unwrap_or_else(|| branch_name.to_string());
        let updated_workspace =
            update_workspace_after_git_change(&state, &workspace, git_snapshot.clone())?;
        Ok(WorkspaceGitBranchChangeResult {
            workspace: updated_workspace,
            git_snapshot,
            previous_branch,
            current_branch,
            stashed_changes,
        })
    })
}

#[tauri::command]
pub fn workspace_create_git_branch(
    state: tauri::State<'_, AppState>,
    input: WorkspaceGitBranchCreateInput,
) -> IpcResult<WorkspaceGitBranchChangeResult> {
    crate::commands::ipc_try(|| {
        let workspace = current_workspace(&state)?;
        let branch_name = input.branch_name.trim();
        if branch_name.is_empty() {
            return Err(AppError::InvalidInput("branch name is required".into()));
        }
        let (git_snapshot, stashed_changes, previous_branch) = adl_workspace::create_git_branch(
            PathBuf::from(&workspace.root_path).as_path(),
            branch_name,
            input.base_branch.as_deref(),
            input.allow_stash,
        )?;
        let current_branch = git_snapshot
            .branch
            .clone()
            .unwrap_or_else(|| branch_name.to_string());
        let updated_workspace =
            update_workspace_after_git_change(&state, &workspace, git_snapshot.clone())?;
        Ok(WorkspaceGitBranchChangeResult {
            workspace: updated_workspace,
            git_snapshot,
            previous_branch,
            current_branch,
            stashed_changes,
        })
    })
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

fn update_workspace_after_git_change(
    state: &AppState,
    workspace: &WorkspaceMeta,
    git_snapshot: GitSnapshot,
) -> Result<WorkspaceMeta, AppError> {
    let now = now_ms();
    let updated_workspace = WorkspaceMeta {
        git_snapshot: Some(git_snapshot),
        status: WorkspaceStatus::Ready,
        updated_at: now,
        last_opened_at: now,
        ..workspace.clone()
    };
    persist_workspace_meta(state, &updated_workspace)?;
    Ok(updated_workspace)
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
