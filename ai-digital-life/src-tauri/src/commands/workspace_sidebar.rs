use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::{Database, EntityTable};
use adl_types::{IpcResult, RecentWorkspaceEntry, WorkspaceMeta};
use adl_workspace::strip_verbatim_prefix;
use std::collections::HashMap;
use tauri::Manager;

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

    // 一次性清理历史遗留的同一路径重复条目（id 不稳定导致），优先保留 id 与 DB 一致者
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

// Existing sync helpers — delegate to the `_with_db` variants. These remain
// for callers that still operate on `&AppState` (e.g. `upsert_sidebar_after_open`
// which is invoked from `workspace_open` outside of `spawn_blocking`).

fn save_sidebar_entries(
    state: &AppState,
    entries: &[RecentWorkspaceEntry],
) -> Result<(), AppError> {
    save_sidebar_entries_with_db(&state.db, entries)
}

fn load_or_seed_sidebar(state: &AppState) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    load_or_seed_sidebar_with_db(&state.db)
}

pub(super) fn upsert_sidebar_after_open(
    state: &AppState,
    meta: &WorkspaceMeta,
) -> Result<(), AppError> {
    let mut all = load_or_seed_sidebar(state)?;
    // 同一工作区按 id 或归一化 path 命中：就地更新并统一 id，
    // 避免因历史 id 不一致导致同一路径出现两条侧栏条目。
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
        // 命中后移除同归一化路径的其余历史重复条目（id 不稳定遗留），避免重复残留到下次加载。
        // 已更新的条目 id 与 meta.id 一致，dedup 优先保留它。
        let workspace_ids = std::collections::HashSet::from([meta.id.clone()]);
        all = dedup_entries_by_path(all, &workspace_ids);
    } else {
        let max = unpinned_max(&all);
        all.push(entry_from_workspace(meta.clone(), max));
    }
    save_sidebar_entries(state, &all)?;
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderWorkspacesInput {
    pub pinned_ids: Vec<String>,
    pub unpinned_ids: Vec<String>,
}

#[tauri::command]
pub async fn workspace_list_recent(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || presentable_recent_list_with_db(&db))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_pin(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries =
        tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
            let mut all = load_or_seed_sidebar_with_db(&db)?;
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
            save_sidebar_entries_with_db(&db, &all)?;
            presentable_recent_list_with_db(&db)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_unpin(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries =
        tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
            let mut all = load_or_seed_sidebar_with_db(&db)?;
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
            save_sidebar_entries_with_db(&db, &all)?;
            presentable_recent_list_with_db(&db)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_reorder(
    app: tauri::AppHandle,
    input: ReorderWorkspacesInput,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries =
        tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
            let mut all = load_or_seed_sidebar_with_db(&db)?;
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
            save_sidebar_entries_with_db(&db, &all)?;
            presentable_recent_list_with_db(&db)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_remove_from_sidebar(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries =
        tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
            // Look up the workspace's root path BEFORE purging so we can also
            // drop the `recent_workspaces` row. After purge the workspace row
            // is gone, so any further lookup would fail.
            let root_path = db
                .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
                .map(|m| m.root_path);

            // Cascade-delete all child data + the workspace row + the
            // recent_workspaces row in a single transaction.
            let report = db.purge_workspace(&workspace_id, root_path.as_deref())?;
            tracing::info!(
                workspace_id = %report.workspace_id,
                total_rows_deleted = report.total_rows_deleted,
                tables_touched = report.per_table.len(),
                "workspace data purged on remove-from-sidebar"
            );

            let mut all = load_or_seed_sidebar_with_db(&db)?;
            if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
                e.removed_from_sidebar = true;
                e.hidden_from_right_panels = true;
            }
            save_sidebar_entries_with_db(&db, &all)?;
            presentable_recent_list_with_db(&db)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_restore_to_sidebar(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries =
        tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
            let mut all = load_or_seed_sidebar_with_db(&db)?;
            if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
                e.removed_from_sidebar = false;
            } else {
                let meta = db
                    .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
                    .ok_or_else(|| AppError::NotFound(format!("workspace {workspace_id}")))?;
                let max = unpinned_max(&all);
                all.push(entry_from_workspace(meta, max));
            }
            save_sidebar_entries_with_db(&db, &all)?;
            presentable_recent_list_with_db(&db)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_hide_from_right_panels(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries =
        tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
            let mut all = load_or_seed_sidebar_with_db(&db)?;
            if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
                e.hidden_from_right_panels = true;
            }
            save_sidebar_entries_with_db(&db, &all)?;
            presentable_recent_list_with_db(&db)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_show_in_right_panels(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries =
        tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
            let mut all = load_or_seed_sidebar_with_db(&db)?;
            if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
                e.hidden_from_right_panels = false;
            }
            save_sidebar_entries_with_db(&db, &all)?;
            presentable_recent_list_with_db(&db)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::now_ms;

    fn entry(id: &str, path: &str) -> RecentWorkspaceEntry {
        RecentWorkspaceEntry {
            id: id.to_string(),
            path: path.to_string(),
            root_path: path.to_string(),
            name: path.split(['/', '\\']).next_back().unwrap_or(path).to_string(),
            last_opened_at: now_ms(),
            is_pinned: false,
            pinned_order: 0,
            unpinned_order: 0,
            removed_from_sidebar: false,
            available: true,
            hidden_from_right_panels: false,
        }
    }

    fn ids(entries: &[RecentWorkspaceEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.id.as_str()).collect()
    }

    #[test]
    fn path_dedup_key_normalizes_separators_case_and_verbatim_prefix() {
        assert_eq!(path_dedup_key(r"E:\Foo\Bar"), "e:/foo/bar");
        assert_eq!(path_dedup_key(r"\\?\E:\Foo\Bar"), "e:/foo/bar");
        assert_eq!(path_dedup_key("E:/FOO/bar"), "e:/foo/bar");
        assert_eq!(path_dedup_key(r"E:\Foo\Bar\"), "e:/foo/bar");
        assert_eq!(path_dedup_key(r"\\?\E:\Foo\"), "e:/foo");
        assert_eq!(path_dedup_key("/"), "/");
    }

    #[test]
    fn dedup_entries_by_path_removes_same_path_with_different_ids() {
        let workspace_ids = std::collections::HashSet::from(["workspace_new".to_string()]);
        let entries = vec![
            entry("workspace_legacy", r"E:\same\path"),
            entry("workspace_new", "E:/same/path"),
        ];

        let deduped = dedup_entries_by_path(entries, &workspace_ids);

        // 保留 id 与 DB 一致者（workspace_new），移除历史旧 id 条目
        assert_eq!(ids(&deduped), ["workspace_new"]);
    }

    #[test]
    fn dedup_entries_by_path_keeps_first_when_no_workspace_match() {
        let workspace_ids = std::collections::HashSet::new();
        let entries = vec![
            entry("first", r"E:\same"),
            entry("second", "e:/SAME"),
            entry("third", "E:/other"),
        ];

        let deduped = dedup_entries_by_path(entries, &workspace_ids);

        assert_eq!(ids(&deduped), ["first", "third"]);
    }

    #[test]
    fn dedup_entries_by_path_keeps_distinct_paths() {
        let workspace_ids = std::collections::HashSet::new();
        let entries = vec![entry("a", r"E:\one"), entry("b", r"E:\two")];

        let deduped = dedup_entries_by_path(entries, &workspace_ids);

        assert_eq!(ids(&deduped), ["a", "b"]);
    }

    #[test]
    fn dedup_entries_by_path_keeps_updated_entry_and_drops_same_path_legacy() {
        // 模拟 upsert 命中后：已更新条目 id 与 DB 一致（workspace_new），
        // 同归一化路径的历史条目用旧 id（workspace_legacy_a/legacy_b）。
        let workspace_ids = std::collections::HashSet::from(["workspace_new".to_string()]);
        let entries = vec![
            entry("workspace_legacy_a", r"E:\same\path"),
            entry("workspace_new", "E:/same/path"),
            entry("workspace_legacy_b", r"e:\SAME\path"),
            entry("workspace_other", "E:/other"),
        ];

        let deduped = dedup_entries_by_path(entries, &workspace_ids);

        // 保留 id 与 DB 一致者（workspace_new），移除同路径历史条目，保留不同路径
        assert_eq!(ids(&deduped), ["workspace_new", "workspace_other"]);
    }
}
