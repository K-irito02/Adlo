//! Workspace-sidebar domain HTTP handlers — migrated from
//! `src-tauri/src/commands/workspace_sidebar.rs`. The recent-list lives in the
//! DB `state` row keyed `recent_workspaces_sidebar_v1`; every operation is a
//! pure DB read/write in `spawn_blocking`.
//!
//! This module also completes the Batch-1 deferred `workspace_open` → sidebar
//! upsert: [`upsert_sidebar_after_open`] is the DB-only port of the Tauri
//! `workspace_sidebar::upsert_sidebar_after_open`, called by the workspace
//! `open` handler inside `spawn_blocking`.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::{Database, EntityTable};
use adl_types::{RecentWorkspaceEntry, WorkspaceMeta};
use adl_workspace::strip_verbatim_prefix;
use axum::extract::State;
use axum::response::IntoResponse;
use std::collections::HashMap;

const RECENT_SIDEBAR_KEY: &str = "recent_workspaces_sidebar_v1";

fn entry_from_workspace(meta: WorkspaceMeta, max_order: i32) -> RecentWorkspaceEntry {
    RecentWorkspaceEntry {
        id: meta.id,
        path: strip_verbatim_prefix(&meta.path),
        root_path: strip_verbatim_prefix(&meta.root_path),
        name: meta.name,
        last_opened_at: meta.last_opened_at,
        is_pinned: false,
        pinned_order: 0,
        unpinned_order: max_order + 1,
        removed_from_sidebar: false,
        available: true,
        hidden_from_right_panels: false,
    }
}

/// 归一化路径用于去重：去除 verbatim 前缀、统一分隔符、忽略大小写、去除尾部斜杠。
fn path_dedup_key(path: &str) -> String {
    let stripped = strip_verbatim_prefix(path).replace('\\', "/").to_lowercase();
    let trimmed = stripped.trim_end_matches('/').to_string();
    if trimmed.is_empty() { stripped } else { trimmed }
}

/// 按归一化路径去重，优先保留 id 与 DB workspace 一致的条目（统一 id）。
fn dedup_entries_by_path(
    mut entries: Vec<RecentWorkspaceEntry>,
    workspace_ids: &std::collections::HashSet<String>,
) -> Vec<RecentWorkspaceEntry> {
    entries.sort_by_key(|e| !workspace_ids.contains(&e.id));
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    entries.retain(|e| seen.insert(path_dedup_key(&e.path)));
    entries
}

fn load_sidebar_entries_with_db(db: &Database) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    match db.get_state(RECENT_SIDEBAR_KEY)? {
        Some(json) => serde_json::from_str(&json)
            .map_err(|e| AppError::Storage(format!("corrupt sidebar data: {e}"))),
        None => Ok(Vec::new()),
    }
}

fn save_sidebar_entries_with_db(
    db: &Database,
    entries: &[RecentWorkspaceEntry],
) -> Result<(), AppError> {
    db.put_state(RECENT_SIDEBAR_KEY, &serde_json::to_string(entries)?)?;
    Ok(())
}

fn unpinned_max(entries: &[RecentWorkspaceEntry]) -> i32 {
    entries.iter().filter(|e| !e.is_pinned).map(|e| e.unpinned_order).max().unwrap_or(-1)
}

fn seed_sidebar_from_db_with_db(db: &Database) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let workspaces: Vec<WorkspaceMeta> = db.list_entities(EntityTable::Workspaces)?;
    let mut entries = Vec::with_capacity(workspaces.len());
    for (index, workspace) in workspaces.into_iter().enumerate() {
        let mut entry = entry_from_workspace(workspace, index as i32 - 1);
        entry.unpinned_order = index as i32;
        entries.push(entry);
    }
    if !entries.is_empty() {
        save_sidebar_entries_with_db(db, &entries)?;
    }
    Ok(entries)
}

fn load_or_seed_sidebar_with_db(db: &Database) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let mut all = load_sidebar_entries_with_db(db)?;
    if all.is_empty() {
        all = seed_sidebar_from_db_with_db(db)?;
    }
    Ok(all)
}

fn merge_workspace_meta_into_sidebar(
    all: &mut [RecentWorkspaceEntry],
    workspaces: &[WorkspaceMeta],
) {
    let by_id: HashMap<&str, &WorkspaceMeta> =
        workspaces.iter().map(|w| (w.id.as_str(), w)).collect();
    for entry in all.iter_mut() {
        if let Some(w) = by_id.get(entry.id.as_str()) {
            entry.path = strip_verbatim_prefix(&w.path);
            entry.root_path = strip_verbatim_prefix(&w.root_path);
            entry.name = w.name.clone();
            entry.last_opened_at = w.last_opened_at;
            entry.available = true;
        }
    }
}

fn load_sidebar_with_meta_with_db(db: &Database) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let workspaces: Vec<WorkspaceMeta> = db.list_entities(EntityTable::Workspaces)?;
    let mut all = load_or_seed_sidebar_with_db(db)?;

    let workspace_ids: std::collections::HashSet<String> =
        workspaces.iter().map(|w| w.id.clone()).collect();
    let before = all.len();
    all = dedup_entries_by_path(all, &workspace_ids);
    let mut changed = all.len() != before;

    merge_workspace_meta_into_sidebar(&mut all, &workspaces);

    for w in workspaces {
        if !all.iter().any(|e| e.id == w.id || path_dedup_key(&e.path) == path_dedup_key(&w.path)) {
            let max = unpinned_max(&all);
            all.push(entry_from_workspace(w, max));
            changed = true;
        }
    }
    if changed {
        save_sidebar_entries_with_db(db, &all)?;
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

fn presentable_recent_list_with_db(db: &Database) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let all = load_sidebar_with_meta_with_db(db)?;
    Ok(sort_and_filter_presentable(all))
}

/// Upsert the sidebar recent list after a workspace open. DB-only port of the
/// Tauri `workspace_sidebar::upsert_sidebar_after_open` — the Batch-1 deferred
/// wiring consumed by the workspace `open` handler inside `spawn_blocking`.
pub(crate) fn upsert_sidebar_after_open(
    db: &Database,
    meta: &WorkspaceMeta,
) -> Result<(), AppError> {
    let mut all = load_or_seed_sidebar_with_db(db)?;
    let normalized = path_dedup_key(&meta.path);
    if let Some(i) =
        all.iter().position(|e| e.id == meta.id || path_dedup_key(&e.path) == normalized)
    {
        all[i].id = meta.id.clone();
        all[i].path = meta.path.clone();
        all[i].root_path = meta.root_path.clone();
        all[i].name = meta.name.clone();
        all[i].last_opened_at = meta.last_opened_at;
        all[i].removed_from_sidebar = false;
        all[i].available = true;
        let workspace_ids = std::collections::HashSet::from([meta.id.clone()]);
        all = dedup_entries_by_path(all, &workspace_ids);
    } else {
        let max = unpinned_max(&all);
        all.push(entry_from_workspace(meta.clone(), max));
    }
    save_sidebar_entries_with_db(db, &all)?;
    Ok(())
}

/// Run a sidebar DB mutation in `spawn_blocking`, returning the updated
/// presentable list serialized to JSON.
async fn run_sidebar_op(
    db: Database,
    f: impl FnOnce(&Database) -> Result<Vec<RecentWorkspaceEntry>, AppError> + Send + 'static,
) -> Result<serde_json::Value, AppError> {
    let entries = tokio::task::spawn_blocking(move || f(&db))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    serde_json::to_value(&entries).map_err(AppError::from)
}

/// POST `/sidebar/list` — presentable recent-workspace list (covers
/// `WorkspaceBridge.listRecent`).
pub async fn list_recent(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_sidebar_op(state.db.clone(), presentable_recent_list_with_db).await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceIdBody {
    workspace_id: String,
}

/// POST `/sidebar/pin` — pin a workspace (covers `WorkspaceBridge.pin`).
pub async fn pin(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let workspace_id = input.workspace_id;
    let result = run_sidebar_op(db, move |db| {
        let mut all = load_or_seed_sidebar_with_db(db)?;
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
        save_sidebar_entries_with_db(db, &all)?;
        presentable_recent_list_with_db(db)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/sidebar/unpin` — unpin a workspace (covers `WorkspaceBridge.unpin`).
pub async fn unpin(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let workspace_id = input.workspace_id;
    let result = run_sidebar_op(db, move |db| {
        let mut all = load_or_seed_sidebar_with_db(db)?;
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
        save_sidebar_entries_with_db(db, &all)?;
        presentable_recent_list_with_db(db)
    })
    .await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderBody {
    pinned_ids: Vec<String>,
    unpinned_ids: Vec<String>,
}

/// POST `/sidebar/reorder` — apply pinned/unpinned ordering (covers
/// `WorkspaceBridge.reorder`).
pub async fn reorder(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ReorderBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let pinned_ids = input.pinned_ids;
    let unpinned_ids = input.unpinned_ids;
    let result = run_sidebar_op(db, move |db| {
        let mut all = load_or_seed_sidebar_with_db(db)?;
        for (i, id) in pinned_ids.iter().enumerate() {
            if let Some(e) = all.iter_mut().find(|e| e.id == *id) {
                e.is_pinned = true;
                e.pinned_order = i as i32;
            }
        }
        for (i, id) in unpinned_ids.iter().enumerate() {
            if let Some(e) = all.iter_mut().find(|e| e.id == *id) {
                e.is_pinned = false;
                e.unpinned_order = i as i32;
            }
        }
        save_sidebar_entries_with_db(db, &all)?;
        presentable_recent_list_with_db(db)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/sidebar/remove` — remove a workspace from the sidebar and purge its
/// data (covers `WorkspaceBridge.removeFromSidebar`).
pub async fn remove_from_sidebar(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let workspace_id = input.workspace_id;
    let result = run_sidebar_op(db, move |db| {
        let root_path = db
            .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
            .map(|m| m.root_path);
        let report = db.purge_workspace(&workspace_id, root_path.as_deref())?;
        tracing::info!(
            workspace_id = %report.workspace_id,
            total_rows_deleted = report.total_rows_deleted,
            tables_touched = report.per_table.len(),
            "workspace data purged on remove-from-sidebar"
        );
        let mut all = load_or_seed_sidebar_with_db(db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = true;
            e.hidden_from_right_panels = true;
        }
        save_sidebar_entries_with_db(db, &all)?;
        presentable_recent_list_with_db(db)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/sidebar/restore` — restore a workspace to the sidebar (covers
/// `WorkspaceBridge.restoreToSidebar`).
pub async fn restore_to_sidebar(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let workspace_id = input.workspace_id;
    let result = run_sidebar_op(db, move |db| {
        let mut all = load_or_seed_sidebar_with_db(db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = false;
        } else {
            let meta = db
                .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
                .ok_or_else(|| AppError::NotFound(format!("workspace {workspace_id}")))?;
            let max = unpinned_max(&all);
            all.push(entry_from_workspace(meta, max));
        }
        save_sidebar_entries_with_db(db, &all)?;
        presentable_recent_list_with_db(db)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/sidebar/hide` — hide a workspace from the right panels (covers
/// `WorkspaceBridge.hideFromRightPanels`).
pub async fn hide_from_right_panels(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let workspace_id = input.workspace_id;
    let result = run_sidebar_op(db, move |db| {
        let mut all = load_or_seed_sidebar_with_db(db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.hidden_from_right_panels = true;
        }
        save_sidebar_entries_with_db(db, &all)?;
        presentable_recent_list_with_db(db)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/sidebar/show` — show a workspace in the right panels (covers
/// `WorkspaceBridge.showInRightPanels`).
pub async fn show_in_right_panels(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let workspace_id = input.workspace_id;
    let result = run_sidebar_op(db, move |db| {
        let mut all = load_or_seed_sidebar_with_db(db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.hidden_from_right_panels = false;
        }
        save_sidebar_entries_with_db(db, &all)?;
        presentable_recent_list_with_db(db)
    })
    .await;
    ipc::to_response(result)
}
