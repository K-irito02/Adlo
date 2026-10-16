//! Workspace domain HTTP handlers — migrated from
//! `src-tauri/src/commands/workspace.rs`. Follows the conversation-domain
//! recipe: `State(state): State<ServerState>` replaces `app: tauri::AppHandle`
//! / `State<'_, AppState>`, blocking file I/O runs in `spawn_blocking`, and
//! responses are wrapped with [`crate::ipc::to_response`] into `IpcResult`.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_kernel::events::AppEvent;
use adl_storage::EntityTable;
use adl_types::{
    FileOutlineItem, RetrievalSnapshot, WorkspaceChangePreview, WorkspaceFileChangedEvent,
    WorkspaceMeta, WorkspaceTreeNode,
};
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

/// Run a blocking closure and collapse the `spawn_blocking` join error into an
/// `AppError::Internal`. Keeps every handler free of the `?` operator so the
/// `impl IntoResponse` signature stays a plain `(StatusCode, Json<Value>)`.
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

/// Resolve the active workspace metadata (read side of `state.current_workspace`).
pub(crate) fn current_workspace(state: &ServerState) -> Result<WorkspaceMeta, AppError> {
    state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone()
        .ok_or_else(|| AppError::NotFound("active workspace".into()))
}

/// Resolve the workspace root for a file operation: an explicit `workspacePath`
/// wins, otherwise fall back to the active workspace.
fn workspace_root(state: &ServerState, explicit: Option<String>) -> Result<String, AppError> {
    match explicit {
        Some(p) => Ok(p),
        None => Ok(current_workspace(state)?.root_path),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePathBody {
    workspace_path: String,
}

/// POST `/workspace/open` — open a workspace path, persist it as the active
/// workspace (DB row + state slot + in-memory), build the retrieval snapshot,
/// and emit the kernel `WorkspaceOpened` / `RetrievalStatusChanged` events.
///
/// Migration note: the Tauri original also upserted the sidebar recent list via
/// `workspace_sidebar::upsert_sidebar_after_open` — now completed in Phase 2
/// below (`handlers::workspace_sidebar::upsert_sidebar_after_open`). The legacy
/// `digital-life://retrieval-status` UI event has no [`crate`] SSE equivalent,
/// so it is warn+reported here instead of dropped.
pub async fn open(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: WorkspacePathBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace_path_str = input.workspace_path.clone();
    let path = PathBuf::from(input.workspace_path);

    // Phase 1 (blocking): open workspace (file I/O) + build retrieval snapshot.
    let t_phase1 = std::time::Instant::now();
    let (meta, snapshot) =
        match run_blocking(move || -> Result<(WorkspaceMeta, RetrievalSnapshot), AppError> {
            let t_open = std::time::Instant::now();
            let (meta, _recent) = adl_workspace::open_workspace(path.as_path())?;
            tracing::debug!(
                elapsed_ms = t_open.elapsed().as_millis(),
                root = %path.display(),
                "workspace_open_phase1: open_workspace done"
            );
            let t_snapshot = std::time::Instant::now();
            let snapshot = adl_workspace::build_retrieval_snapshot(
                &meta.id,
                PathBuf::from(&meta.root_path).as_path(),
            )?;
            tracing::debug!(
                elapsed_ms = t_snapshot.elapsed().as_millis(),
                root = %path.display(),
                "workspace_open_phase1: build_retrieval_snapshot done"
            );
            Ok((meta, snapshot))
        })
        .await
        {
            Ok(v) => v,
            Err(e) => return ipc::to_response(Err(e)),
        };
    tracing::debug!(
        phase1_ms = t_phase1.elapsed().as_millis(),
        root = %workspace_path_str,
        "workspace_open_phase1: total"
    );

    // Phase 2 (blocking): persist meta + snapshot + sidebar upsert to the DB.
    let t_phase2 = std::time::Instant::now();
    let db = state.db.clone();
    let meta_for_db = meta.clone();
    let snapshot_for_db = snapshot.clone();
    if let Err(e) = run_blocking(move || -> Result<(), AppError> {
        db.save_entity(
            EntityTable::Workspaces,
            &meta_for_db.id,
            Some(&meta_for_db.id),
            None,
            Some("ready"),
            &meta_for_db,
        )?;
        db.put_state("current_workspace", &serde_json::to_string(&meta_for_db)?)?;
        db.save_entity(
            EntityTable::RetrievalSnapshots,
            &meta_for_db.id,
            Some(&meta_for_db.id),
            None,
            Some("completed"),
            &snapshot_for_db,
        )?;
        crate::handlers::workspace_sidebar::upsert_sidebar_after_open(&db, &meta_for_db)?;
        Ok(())
    })
    .await
    {
        return ipc::to_response(Err(e));
    }
    tracing::debug!(
        phase2_ms = t_phase2.elapsed().as_millis(),
        root = %workspace_path_str,
        "workspace_open_phase2: persist done"
    );

    // Phase 3 (async side): update the in-memory active workspace + emit events.
    {
        let mut ws = match state.current_workspace.write() {
            Ok(w) => w,
            Err(_) => {
                return ipc::to_response(Err(AppError::Internal(
                    "workspace mutex poisoned".into(),
                )));
            },
        };
        *ws = Some(meta.clone());
    }
    state.event_bus.emit(AppEvent::WorkspaceOpened(meta.id.clone()));
    state.event_bus.emit(AppEvent::RetrievalStatusChanged(meta.id.clone()));
    crate::engine::restart_workspace_watcher(&state, std::path::Path::new(&meta.root_path));
    tracing::warn!(
        workspace_id = %meta.id,
        "workspace_open: legacy 'digital-life://retrieval-status' UI emit has no SSE equivalent; \
         session-part bus carries no retrieval status signal — the S1 bridge must poll the snapshot row"
    );

    let value = match serde_json::to_value(&meta) {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(AppError::from(e))),
    };
    ipc::to_response(Ok(value))
}

/// GET `/workspace/current` — read the active workspace metadata (None when no
/// workspace is open). The desktop shell's `app_get_info` sources its
/// `current_workspace` field from here so the converged shell (which no longer
/// owns the DB) stays in sync with the ad-server's persisted active workspace.
pub async fn get_current(State(state): State<ServerState>) -> impl IntoResponse {
    let value = match state.current_workspace.read().map(|g| serde_json::to_value(g.clone())) {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => return ipc::to_response(Err(AppError::from(e))),
        Err(_) => {
            return ipc::to_response(Err(AppError::Internal("workspace mutex poisoned".into())));
        },
    };
    ipc::to_response(Ok(value))
}

/// POST `/workspace/clear-current` — clear the persisted + in-memory active workspace.
pub async fn clear_current(State(state): State<ServerState>) -> impl IntoResponse {
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        db.put_state("current_workspace", "null")?;
        Ok(serde_json::json!(true))
    })
    .await;
    if result.is_ok() {
        if let Err(e) = state
            .current_workspace
            .write()
            .map(|mut w| *w = None)
            .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))
        {
            return ipc::to_response(Err(e));
        }
        // 停止活动工作区的文件监听器（take 后显式 stop，保证工作线程退出）。
        // poison 时恢复继续而非静默跳过，否则旧 watcher 泄漏并继续广播脏批次。
        let previous = match state.workspace_watcher.lock() {
            Ok(mut slot) => slot.take(),
            Err(poisoned) => {
                tracing::warn!("workspace watcher slot poisoned on clear; recovering");
                poisoned.into_inner().take()
            },
        };
        if let Some(previous) = previous {
            previous.stop();
        }
    }
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelativePathBody {
    relative_path: String,
    #[serde(default)]
    workspace_path: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileOpsBody {
    relative_path: String,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    workspace_path: Option<String>,
}

/// POST `/workspace/read-media` 请求体：与 `FileOpsBody` 同形但无 `content`
///（收尾 D5：媒体读取静默忽略 `content` 易误导，独立类型显式收敛；
/// serde 默认忽略未知字段，本类型仅做文档性收敛，不做严格拒绝）。
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaReadBody {
    relative_path: String,
    #[serde(default)]
    workspace_path: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameBody {
    relative_path: String,
    new_name: String,
    #[serde(default)]
    workspace_path: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathPairBody {
    relative_path: String,
    new_path: String,
    #[serde(default)]
    workspace_path: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TreeBody {
    #[serde(default)]
    workspace_path: Option<String>,
    /// 为 true 时绕过进程内缓存强制重新扫描（显式"刷新"用）。
    #[serde(default)]
    force: bool,
    /// 为 true 时允许返回 SQLite 缓存行（stale-while-revalidate 的首包）。
    #[serde(default)]
    allow_stale: bool,
}

/// POST `/workspace/tree` 的响应载荷：树 + 是否来自缓存行 + 行捕获时间。
/// `captured_at` 供前端校准门判定；miss/force 时为本次扫描时间。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TreePayload {
    tree: Vec<WorkspaceTreeNode>,
    from_cache: bool,
    captured_at: i64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchBody {
    query: String,
    /// 分页窗口（可选）：缺省跳过 0 条、最多返回 `MAX_SEARCH_RESULTS` 条。
    #[serde(default)]
    offset: Option<usize>,
    #[serde(default)]
    limit: Option<usize>,
    /// 手动忽略名单（可选）：工作区相对路径，目录隐含后代；与 `.gitignore` 并集生效。
    #[serde(default)]
    excluded_paths: Vec<String>,
    /// `.gitignore` 开关（可选）：缺省启用，与前端 `selectSearchFilter` 缺省一致。
    #[serde(default = "default_true")]
    use_gitignore: bool,
    /// 显式检索根（工作区绝对路径，可选）：缺省用后端当前激活工作区。
    #[serde(default)]
    workspace_path: Option<String>,
}

fn default_true() -> bool {
    true
}

/// 由请求体构造检索窗口：上限一律交 [`adl_workspace::SearchWindow::clamped`] 钳制，
/// 调用方无法用超大 `limit` 绕过硬上限。
fn search_window(offset: Option<usize>, limit: Option<usize>) -> adl_workspace::SearchWindow {
    adl_workspace::SearchWindow::clamped(
        offset.unwrap_or(0),
        limit.unwrap_or(adl_workspace::MAX_SEARCH_RESULTS),
    )
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirtyPathsBody {
    relative_paths: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileChangedBody {
    path: String,
    last_modified_at: i64,
}

/// POST `/workspace/file` — create a file in the active workspace.
pub async fn create_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: FileOpsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let content = input.content.as_deref().unwrap_or("");
        let doc = adl_workspace::create_file(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
            content,
        )?;
        Ok(serde_json::to_value(doc)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/update-file` — overwrite a workspace file with new text
/// content (the save path for Ctrl+S / autosave). Returns the fresh document.
pub async fn update_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: FileOpsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let content = input.content.as_deref().unwrap_or("");
        let doc = adl_workspace::update_file(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
            content,
        )?;
        Ok(serde_json::to_value(doc)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/folder` — create a folder in the active workspace.
pub async fn create_folder(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RelativePathBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_workspace::create_folder(PathBuf::from(root_path).as_path(), &input.relative_path)?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/read` — read a file from the active workspace (or an
/// explicit workspace path).
pub async fn read_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: FileOpsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let doc =
            adl_workspace::read_file(PathBuf::from(root_path).as_path(), &input.relative_path)?;
        Ok(serde_json::to_value(doc)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/read-media` — read a binary/media file from the active
/// workspace (or an explicit workspace path). Bytes are base64-encoded
/// (`WorkspaceMediaDocument`) for JSON IPC transport.
pub async fn read_media_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: MediaReadBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let doc = adl_workspace::read_media_file(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
        )?;
        Ok(serde_json::to_value(doc)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/change-preview` — diff preview for a file.
pub async fn get_change_preview(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: FileOpsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let preview: WorkspaceChangePreview = adl_workspace::read_change_preview(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
        )?;
        Ok(serde_json::to_value(preview)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/tree` — file tree for the active (or explicit) workspace.
pub async fn list_tree(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: TreeBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let path = match input.workspace_path {
        Some(p) => PathBuf::from(p),
        None => match current_workspace(&state) {
            Ok(ws) => PathBuf::from(&ws.root_path),
            Err(e) => return ipc::to_response(Err(e)),
        },
    };
    let t_start = std::time::Instant::now();
    let display_path = path.display().to_string();
    let force = input.force;
    let allow_stale = input.allow_stale && !input.force;
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let (tree, from_cache, captured_at) = if allow_stale {
            adl_workspace::list_tree_cached_stale_ok(path.as_path())?
        } else if force {
            // force 返回扫描自带时间戳（H2：删除 handler 侧二次 now_ms，毫秒不分裂）。
            let (tree, scanned_at) = adl_workspace::list_tree_force(path.as_path())?;
            (tree, false, scanned_at)
        } else {
            // 缺省分支真重扫 + 回写（B1/C1：永不读 L2，时间戳即本次扫描时间）。
            let (tree, scanned_at) = adl_workspace::list_tree_fresh(path.as_path())?;
            (tree, false, scanned_at)
        };
        Ok(serde_json::to_value(TreePayload { tree, from_cache, captured_at })?)
    })
    .await;
    let from_cache =
        result.as_ref().ok().and_then(|v| v.get("fromCache")).and_then(serde_json::Value::as_bool);
    tracing::debug!(
        elapsed_ms = t_start.elapsed().as_millis(),
        force = force,
        allow_stale = allow_stale,
        from_cache = ?from_cache,
        root = %display_path,
        "workspace_list_tree: done"
    );
    ipc::to_response(result)
}

/// POST `/workspace/search` — full-text search over the active workspace.
pub async fn search(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SearchBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    if let Err(e) = reject_oversized_filter(&input.excluded_paths) {
        return ipc::to_response(Err(e));
    }
    let window = search_window(input.offset, input.limit);
    let filter = adl_workspace::SearchFilter {
        excluded_paths: input.excluded_paths,
        use_gitignore: input.use_gitignore,
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let page = adl_workspace::search_text(
            PathBuf::from(root_path).as_path(),
            &input.query,
            window,
            &filter,
        )?;
        Ok(serde_json::to_value(page)?)
    })
    .await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchFilesBody {
    paths: Vec<String>,
    /// 与 `SearchBody.query` 同为 `String`：非字符串在反序列化阶段即被拒绝，
    /// 无需在处理器内再做运行时类型判定。
    query: String,
    /// 分页窗口（可选）：watcher 局部重算通常传当前窗口，避免"显示全部"后被重置回 200。
    #[serde(default)]
    offset: Option<usize>,
    #[serde(default)]
    limit: Option<usize>,
    /// 手动忽略名单（可选）：与 `SearchBody.excluded_paths` 同语义。
    #[serde(default)]
    excluded_paths: Vec<String>,
    /// `.gitignore` 开关（可选）：缺省启用。
    #[serde(default = "default_true")]
    use_gitignore: bool,
    /// 显式检索根（工作区绝对路径，可选）：缺省用后端当前激活工作区。
    #[serde(default)]
    workspace_path: Option<String>,
}

/// 拒绝路径穿越输入：绝对路径或含 `..` 成分的相对路径一律 `INVALID_INPUT`，
/// 防止越过工作区根读取任意文件。空串亦拒绝（归一化后即工作区根本身，
/// 读目录会失败但语义无意义）。symlink 跃出的最终防线在
/// `adl_workspace::search_in_files` 的 canonicalize 校验（单测覆盖）。
fn reject_traversal(paths: &[String]) -> Result<(), AppError> {
    use std::path::Component;
    for p in paths {
        if p.trim().is_empty() {
            return Err(AppError::InvalidInput("path must not be empty".into()));
        }
        // `is_absolute` 由下面的 components 检查完全覆盖（Unix RootDir /
        // Windows Prefix），此处不重复判断。
        let path = std::path::Path::new(p);
        let escapes = path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)));
        if escapes {
            return Err(AppError::InvalidInput(format!("path escapes workspace: {p}")));
        }
    }
    Ok(())
}

/// 忽略名单 DoS 护栏：与 `MAX_SEARCH_FILES_PATHS` 同级（2000 条），
/// 超限直接拒绝——静默截断会让被忽略文件重现（错而不报），拒绝是 loud 失败（事项 M2）。
fn reject_oversized_filter(excluded_paths: &[String]) -> Result<(), AppError> {
    const MAX_EXCLUDED_PATHS: usize = 2000;
    if excluded_paths.len() > MAX_EXCLUDED_PATHS {
        return Err(AppError::InvalidInput(format!(
            "too many excluded paths: {} > {MAX_EXCLUDED_PATHS}",
            excluded_paths.len()
        )));
    }
    Ok(())
}

/// POST `/workspace/search-in-files` — 仅对给定相对路径集合重算命中（watcher 驱动的局部刷新）。
pub async fn search_in_files(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SearchFilesBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let query = input.query;
    if let Err(e) = reject_traversal(&input.paths) {
        return ipc::to_response(Err(e));
    }
    // DoS 护栏：调用方（watcher 批次）正常 ≤500 条；超限直接拒绝而非逐文件读。
    const MAX_SEARCH_FILES_PATHS: usize = 2000;
    if input.paths.len() > MAX_SEARCH_FILES_PATHS {
        return ipc::to_response(Err(AppError::InvalidInput(format!(
            "too many paths: {} > {MAX_SEARCH_FILES_PATHS}",
            input.paths.len()
        ))));
    }
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    if let Err(e) = reject_oversized_filter(&input.excluded_paths) {
        return ipc::to_response(Err(e));
    }
    let paths = input.paths;
    let window = search_window(input.offset, input.limit);
    let filter = adl_workspace::SearchFilter {
        excluded_paths: input.excluded_paths,
        use_gitignore: input.use_gitignore,
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let page = adl_workspace::search_in_files(
            PathBuf::from(root_path).as_path(),
            &paths,
            &query,
            window,
            &filter,
        )?;
        Ok(serde_json::to_value(page)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/outline` — symbol outline for a file in the active workspace.
pub async fn outline(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RelativePathBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let items: Vec<FileOutlineItem> =
            adl_workspace::outline(PathBuf::from(root_path).as_path(), &input.relative_path)?;
        Ok(serde_json::to_value(items)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/editor-dirty-paths` — replace the editor's dirty-path set.
pub async fn set_editor_dirty_paths(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: DirtyPathsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = match state.editor_dirty_paths.lock() {
        Ok(mut dirty) => {
            dirty.clear();
            dirty.extend(input.relative_paths.into_iter().map(|p| p.replace('\\', "/")));
            Ok(serde_json::json!(true))
        },
        Err(_) => Err(AppError::Internal("dirty path mutex poisoned".into())),
    };
    ipc::to_response(result)
}

/// POST `/workspace/emit-file-changed` — the desktop shell used this to tell the
/// UI a file changed on disk. The legacy `digital-life://workspace-file-changed`
/// UI event has no `SessionPartEvent` equivalent on the SSE bridge, so it is
/// warn+reported (not silently dropped) and the call still returns `ok:true`.
pub async fn emit_file_changed(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: FileChangedBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let event =
        WorkspaceFileChangedEvent { path: input.path, last_modified_at: input.last_modified_at };
    tracing::warn!(
        path = %event.path,
        "workspace_emit_file_changed: legacy 'digital-life://workspace-file-changed' UI emit has no \
         SSE equivalent; S1 bridge must surface external file changes from the file watcher instead"
    );
    state.event_bus.emit(AppEvent::FileChanged { path: event.path });
    ipc::to_response(Ok(serde_json::json!(true)))
}

/// POST `/workspace/rename` — rename a file entry in the active workspace.
pub async fn rename_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RenameBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_workspace::rename_entry(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
            &input.new_name,
        )?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/delete` — delete a file entry from the active workspace.
/// On success the legacy file-changed UI event is warn+reported (no SSE
/// equivalent); the kernel `AppEvent::FileChanged` is emitted as the internal
/// signal.
pub async fn delete_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RelativePathBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let rel_path = input.relative_path.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let succeeded = adl_workspace::delete_entry(PathBuf::from(root_path).as_path(), &rel_path)?;
        Ok(serde_json::json!(succeeded))
    })
    .await;
    if let Ok(serde_json::Value::Bool(true)) = &result {
        tracing::warn!(
            path = %input.relative_path,
            "workspace_delete_file: legacy 'digital-life://workspace-file-changed' UI emit has no \
             SSE equivalent; S1 bridge must surface deletions from the file watcher"
        );
        state.event_bus.emit(AppEvent::FileChanged { path: input.relative_path });
    }
    ipc::to_response(result)
}

/// POST `/workspace/duplicate` — copy a file entry.
pub async fn duplicate_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: PathPairBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_workspace::duplicate_entry(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
            &input.new_path,
        )?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/absolute-path` — resolve a relative path against the active
/// workspace root into an absolute, normalized path.
pub async fn get_absolute_path(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RelativePathBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let abs = adl_workspace::get_absolute_path(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
        )?;
        Ok(serde_json::to_value(abs)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/workspace/move` — move a file entry to a new path.
pub async fn move_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: PathPairBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root_path = match workspace_root(&state, input.workspace_path) {
        Ok(p) => p,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_workspace::move_entry(
            PathBuf::from(root_path).as_path(),
            &input.relative_path,
            &input.new_path,
        )?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

#[cfg(test)]
mod tests {
    use crate::router::app_router;
    use crate::test_util::test_server_state;
    use adl_storage::EntityTable;
    use axum::body::Body;
    use axum::http::Request;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tower::ServiceExt;

    static TREE_SRV_SEQ: AtomicU64 = AtomicU64::new(0);
    static TREE_SRV_ENV_LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> =
        std::sync::OnceLock::new();

    fn env_lock() -> &'static tokio::sync::Mutex<()> {
        TREE_SRV_ENV_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
    }

    /// 进程级 `ADL_TREE_CACHE_DIR` 隔离：三用例串行并各指唯一临时目录，
    /// 退出时还原变量并清理目录（`Drop` 覆盖 panic 展开路径）。
    struct TreeCacheEnvGuard {
        _guard: tokio::sync::MutexGuard<'static, ()>,
        original: Option<std::ffi::OsString>,
        dir: std::path::PathBuf,
    }

    impl TreeCacheEnvGuard {
        async fn isolate(tag: &str) -> Self {
            let guard = env_lock().lock().await;
            let id = TREE_SRV_SEQ.fetch_add(1, Ordering::SeqCst);
            let dir = std::env::temp_dir().join(format!("adl-srv-tree-l2-{tag}-{id}"));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).expect("l2 temp dir creation should succeed");
            let original = std::env::var_os("ADL_TREE_CACHE_DIR");
            // SAFETY: 持有进程级互斥，本测试二进制内无其它线程并发读写该变量。
            unsafe { std::env::set_var("ADL_TREE_CACHE_DIR", &dir) };
            Self { _guard: guard, original, dir }
        }

        fn dir(&self) -> &std::path::Path {
            &self.dir
        }
    }

    impl Drop for TreeCacheEnvGuard {
        fn drop(&mut self) {
            match self.original.take() {
                // SAFETY: 同 `isolate`。
                Some(v) => unsafe { std::env::set_var("ADL_TREE_CACHE_DIR", v) },
                // SAFETY: 同 `isolate`。
                None => unsafe { std::env::remove_var("ADL_TREE_CACHE_DIR") },
            }
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    /// 唯一工作区目录（内置 `a.txt`）；返回 `(原始路径, 规范化路径串)`。
    /// 规范化经 `canonicalize` + 去 verbatim 前缀，与 `open_workspace` 落库的
    /// `root_path` 同形，保证树缓存键与移除路径键逐字一致。
    fn unique_ws_dir(tag: &str) -> (std::path::PathBuf, String) {
        let id = TREE_SRV_SEQ.fetch_add(1, Ordering::SeqCst);
        let raw = std::env::temp_dir().join(format!("adl-srv-tree-ws-{tag}-{id}"));
        let _ = std::fs::remove_dir_all(&raw);
        std::fs::create_dir_all(&raw).expect("ws temp dir creation should succeed");
        std::fs::write(raw.join("a.txt"), b"a").expect("seed file creation should succeed");
        let canon = std::fs::canonicalize(&raw).expect("canonicalize should succeed");
        let ws = adl_workspace::strip_verbatim_prefix(&canon.to_string_lossy());
        (raw, ws)
    }

    fn cleanup_ws(raw: &std::path::Path, ws: &str) {
        adl_workspace::invalidate_tree_cache(std::path::Path::new(ws));
        let _ = std::fs::remove_dir_all(raw);
    }

    async fn post_json(
        state: &crate::ServerState,
        uri: &str,
        payload: serde_json::Value,
    ) -> serde_json::Value {
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success(), "POST {uri} must succeed");
        let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    async fn post_tree(
        state: &crate::ServerState,
        ws: &str,
        force: bool,
        allow_stale: bool,
    ) -> serde_json::Value {
        post_json(
            state,
            "/workspace/tree",
            serde_json::json!({
                "workspacePath": ws,
                "force": force,
                "allowStale": allow_stale,
            }),
        )
        .await
    }

    #[tokio::test]
    async fn stale_row_is_served_with_from_cache_true() {
        let _l2 = TreeCacheEnvGuard::isolate("stale").await;
        let state = test_server_state();
        let (raw, ws) = unique_ws_dir("stale");
        let primed = post_tree(&state, &ws, true, false).await;
        assert_eq!(primed["ok"], serde_json::json!(true));
        assert_eq!(primed["data"]["fromCache"], serde_json::json!(false));
        let second = post_tree(&state, &ws, false, true).await;
        assert_eq!(second["ok"], serde_json::json!(true));
        assert_eq!(second["data"]["fromCache"], serde_json::json!(true));
        let tree = second["data"]["tree"].as_array().expect("payload must carry tree array");
        assert!(tree.iter().any(|n| n["path"] == "a.txt"));
        assert!(second["data"]["capturedAt"].as_i64().expect("payload must carry capturedAt") > 0);
        cleanup_ws(&raw, &ws);
    }

    #[tokio::test]
    async fn allow_stale_false_ignores_disk_row() {
        let _l2 = TreeCacheEnvGuard::isolate("fresh").await;
        let state = test_server_state();
        let (raw, ws) = unique_ws_dir("fresh");
        let primed = post_tree(&state, &ws, true, false).await;
        assert_eq!(primed["ok"], serde_json::json!(true));
        let primed_at =
            primed["data"]["capturedAt"].as_i64().expect("primed must carry capturedAt");
        // 缺省语义：不传 allowStale → 真重扫（B1：永不读 L2），fromCache 恒 false，
        // 时间戳为本次扫描时间（不早于 primed 行时间，而非旧行时间）。
        let body =
            post_json(&state, "/workspace/tree", serde_json::json!({"workspacePath": ws})).await;
        assert_eq!(body["ok"], serde_json::json!(true));
        assert_eq!(body["data"]["fromCache"], serde_json::json!(false));
        let body_at = body["data"]["capturedAt"].as_i64().expect("payload must carry capturedAt");
        assert!(body_at >= primed_at, "default branch must return a fresh scan timestamp");
        let tree = body["data"]["tree"].as_array().expect("payload must carry tree array");
        assert!(tree.iter().any(|n| n["path"] == "a.txt"));
        cleanup_ws(&raw, &ws);
    }

    #[tokio::test]
    async fn remove_workspace_deletes_cache_row() {
        let l2 = TreeCacheEnvGuard::isolate("remove").await;
        let state = test_server_state();
        let (raw, ws) = unique_ws_dir("remove");
        let primed = post_tree(&state, &ws, true, false).await;
        assert_eq!(primed["ok"], serde_json::json!(true));
        let store =
            adl_workspace::tree_cache_store::TreeCacheStore::open(l2.dir()).expect("open l2 store");
        assert_eq!(
            store.stats().expect("stats").workspace_count,
            1,
            "disk row must exist after scan"
        );
        let (meta, _recent) =
            adl_workspace::open_workspace(std::path::Path::new(&ws)).expect("open workspace");
        assert_eq!(meta.root_path, ws, "persisted root must match the tree cache key source");
        state
            .db
            .save_entity(
                EntityTable::Workspaces,
                &meta.id,
                Some(&meta.id),
                None,
                Some("ready"),
                &meta,
            )
            .expect("save workspace meta");
        let removed =
            post_json(&state, "/sidebar/remove", serde_json::json!({"workspaceId": meta.id})).await;
        assert_eq!(removed["ok"], serde_json::json!(true));
        let store = adl_workspace::tree_cache_store::TreeCacheStore::open(l2.dir())
            .expect("reopen l2 store");
        assert_eq!(
            store.stats().expect("stats").workspace_count,
            0,
            "disk row must be gone after remove"
        );
        cleanup_ws(&raw, &ws);
    }
}
