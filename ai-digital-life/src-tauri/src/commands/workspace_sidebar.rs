use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{IpcResult, RecentWorkspaceEntry, WorkspaceMeta};
use adl_storage::EntityTable;
use std::collections::HashMap;

const RECENT_SIDEBAR_KEY: &str = "recent_workspaces_sidebar_v1";

fn entry_from_workspace(meta: &WorkspaceMeta, max_order: i32) -> RecentWorkspaceEntry {
    RecentWorkspaceEntry {
        id: meta.id.clone(),
        path: meta.path.clone(),
        root_path: meta.root_path.clone(),
        name: meta.name.clone(),
        last_opened_at: meta.last_opened_at,
        is_pinned: false,
        pinned_order: 0,
        unpinned_order: max_order + 1,
        removed_from_sidebar: false,
        available: true,
        hidden_from_right_panels: false,
    }
}

fn load_sidebar_entries(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    match state.db.get_state(RECENT_SIDEBAR_KEY)? {
        Some(json) => serde_json::from_str(&json)
            .map_err(|e| AppError::Storage(format!("corrupt sidebar data: {e}"))),
        None => Ok(Vec::new()),
    }
}

fn save_sidebar_entries(
    state: &AppState,
    entries: &[RecentWorkspaceEntry],
) -> Result<(), AppError> {
    state.db.put_state(RECENT_SIDEBAR_KEY, &serde_json::to_string(entries)?)?;
    Ok(())
}

fn load_or_seed_sidebar(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let mut all = load_sidebar_entries(state)?;
    if all.is_empty() {
        all = seed_sidebar_from_db(state)?;
    }
    Ok(all)
}

fn unpinned_max(entries: &[RecentWorkspaceEntry]) -> i32 {
    entries.iter().filter(|e| !e.is_pinned).map(|e| e.unpinned_order).max().unwrap_or(-1)
}

fn seed_sidebar_from_db(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let workspaces: Vec<WorkspaceMeta> = state.db.list_entities(EntityTable::Workspaces)?;
    let mut entries = Vec::with_capacity(workspaces.len());
    for (index, workspace) in workspaces.iter().enumerate() {
        let mut entry = entry_from_workspace(workspace, index as i32 - 1);
        entry.unpinned_order = index as i32;
        entries.push(entry);
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

pub(super) fn upsert_sidebar_after_open(
    state: &AppState,
    meta: &WorkspaceMeta,
) -> Result<(), AppError> {
    let mut all = load_or_seed_sidebar(state)?;
    if let Some(i) = all.iter().position(|e| e.id == meta.id) {
        all[i].path = meta.path.clone();
        all[i].root_path = meta.root_path.clone();
        all[i].name = meta.name.clone();
        all[i].last_opened_at = meta.last_opened_at;
        all[i].removed_from_sidebar = false;
        all[i].available = true;
    } else {
        let max = unpinned_max(&all);
        all.push(entry_from_workspace(meta, max));
    }
    save_sidebar_entries(state, &all)?;
    Ok(())
}

fn load_sidebar_with_meta(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let workspaces: Vec<WorkspaceMeta> = state.db.list_entities(EntityTable::Workspaces)?;
    let mut all = load_or_seed_sidebar(state)?;
    merge_workspace_meta_into_sidebar(&mut all, &workspaces);

    let mut changed = false;
    for w in &workspaces {
        if !all.iter().any(|e| e.id == w.id) {
            let max = unpinned_max(&all);
            all.push(entry_from_workspace(w, max));
            changed = true;
        }
    }
    if changed {
        save_sidebar_entries(state, &all)?;
    }
    Ok(all)
}

fn sort_and_filter_presentable(entries: Vec<RecentWorkspaceEntry>) -> Vec<RecentWorkspaceEntry> {
    let mut visible: Vec<_> = entries.into_iter().filter(|e| !e.removed_from_sidebar).collect();
    visible.sort_by(|a, b| match (a.is_pinned, b.is_pinned) {
        (true, true) => a.pinned_order.cmp(&b.pinned_order),
        (false, false) => a.unpinned_order.cmp(&b.unpinned_order),
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
    });
    visible
}

pub fn presentable_recent_list(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let all = load_sidebar_with_meta(state)?;
    Ok(sort_and_filter_presentable(all))
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
pub fn workspace_pin(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_or_seed_sidebar(&state)?;
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
        let mut all = load_or_seed_sidebar(&state)?;
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
        let mut all = load_or_seed_sidebar(&state)?;
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
        // Look up the workspace's root path BEFORE purging so we can also
        // drop the `recent_workspaces` row. After purge the workspace row
        // is gone, so any further lookup would fail.
        let root_path = state
            .db
            .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
            .map(|m| m.root_path);

        // Cascade-delete all child data + the workspace row + the
        // recent_workspaces row in a single transaction.
        let report = state.db.purge_workspace(&workspace_id, root_path.as_deref())?;
        tracing::info!(
            workspace_id = %report.workspace_id,
            total_rows_deleted = report.total_rows_deleted,
            tables_touched = report.per_table.len(),
            "workspace data purged on remove-from-sidebar"
        );

        let mut all = load_or_seed_sidebar(&state)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = true;
            e.hidden_from_right_panels = true;
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
        let mut all = load_or_seed_sidebar(&state)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = false;
        } else {
            let meta = state
                .db
                .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
                .ok_or_else(|| AppError::NotFound(format!("workspace {workspace_id}")))?;
            let max = unpinned_max(&all);
            all.push(entry_from_workspace(&meta, max));
        }
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}

#[tauri::command]
pub fn workspace_hide_from_right_panels(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_or_seed_sidebar(&state)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.hidden_from_right_panels = true;
        }
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}

#[tauri::command]
pub fn workspace_show_in_right_panels(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> IpcResult<Vec<RecentWorkspaceEntry>> {
    crate::commands::ipc_try(|| {
        let mut all = load_or_seed_sidebar(&state)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.hidden_from_right_panels = false;
        }
        save_sidebar_entries(&state, &all)?;
        presentable_recent_list(&state)
    })
}
