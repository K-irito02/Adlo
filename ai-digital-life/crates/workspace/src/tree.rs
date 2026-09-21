use crate::tree_cache_store::TreeCacheStore;
use adl_errors::AppError;
use adl_types::{
    RepoMapEntry, RetrievalFileTypeCount, RetrievalSnapshot, RetrievalStatusV1, WorkspaceTreeNode,
    now_ms,
};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tracing::{debug, info};

const MAX_TREE_DEPTH: usize = 64;
const MAX_TREE_NODES: usize = 200_000;
const MAX_COLLECTED_FILES: usize = 50_000;

/// 进程内文件树缓存（方案 C）：避免对同一工作区目录在短时间内重复全量扫描。
///
/// - 键：规范化后的工作区 root 路径
/// - 命中条件：缓存存在且未超过 `TREE_CACHE_TTL_MS`
/// - 失效：文件系统写操作（create/rename/delete/duplicate/move）通过
///   `invalidate_tree_cache` 显式清除对应条目；缓存本身也带 TTL 兜底，
///   避免外部改动（IDE 外部编辑、git checkout 等）导致的过期数据长期残留。
const TREE_CACHE_TTL_MS: i64 = 10_000;
const TREE_CACHE_MAX_ENTRIES: usize = 64;

struct CachedTree {
    tree: Vec<WorkspaceTreeNode>,
    captured_at: i64,
}

static TREE_CACHE: OnceLock<Mutex<HashMap<String, CachedTree>>> = OnceLock::new();

/// 每个 root 的失效代际计数器：`invalidate_tree_cache` 自增，扫描开始时读取，
/// 扫描结束写入前校验是否一致，避免"扫描与写操作并发"导致的过期数据回填缓存。
static TREE_CACHE_GENERATIONS: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();

fn tree_cache() -> &'static Mutex<HashMap<String, CachedTree>> {
    TREE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn tree_generations() -> &'static Mutex<HashMap<String, u64>> {
    TREE_CACHE_GENERATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn normalize_cache_key(root: &Path) -> String {
    root.to_string_lossy().replace('\\', "/")
}

/// 读取 root 的当前失效代际。
fn generation_get(key: &str) -> u64 {
    tree_generations().lock().unwrap_or_else(|e| e.into_inner()).get(key).copied().unwrap_or(0)
}

/// root 的失效代际自增。
fn generation_bump(key: &str) {
    let mut gens = tree_generations().lock().unwrap_or_else(|e| e.into_inner());
    *gens.entry(key.to_string()).or_insert(0) += 1;
}

/// 返回 root 对应的缓存树与捕获时间（若命中且未过期）。过期条目会被移除。
fn tree_cache_get(root: &Path) -> Option<(Vec<WorkspaceTreeNode>, i64)> {
    let key = normalize_cache_key(root);
    let now = now_ms();
    let mut cache = tree_cache().lock().unwrap_or_else(|e| e.into_inner());
    match cache.get(&key) {
        Some(entry) if now.saturating_sub(entry.captured_at) < TREE_CACHE_TTL_MS => {
            Some((entry.tree.clone(), entry.captured_at))
        },
        Some(_) => {
            // 过期：移除旧条目，返回 None 触发重扫
            cache.remove(&key);
            None
        },
        None => None,
    }
}

/// 写入缓存。若 `expected_generation` 与当前代际不一致（期间发生过失效），
/// 说明扫描结果已过期，丢弃本次写入，避免并发写操作的回填竞态。
/// `captured_at` 由调用方传入：L1 时间与返回/落盘时间同一值，
/// 同内容的三次调用（miss → L2 命中 → L1 命中）返同一时间戳。
fn tree_cache_put(
    root: &Path,
    tree: Vec<WorkspaceTreeNode>,
    expected_generation: u64,
    captured_at: i64,
) {
    let key = normalize_cache_key(root);
    if generation_get(&key) != expected_generation {
        debug!(root = %key, "workspace tree scan stale, cache put dropped");
        return;
    }
    let mut cache = tree_cache().lock().unwrap_or_else(|e| e.into_inner());
    if cache.len() >= TREE_CACHE_MAX_ENTRIES {
        // 简单淘汰：移除任意一条以控制内存上限（HashMap 迭代顺序不稳定，仅用于限流）
        if let Some(oldest_key) = cache.keys().next().cloned() {
            cache.remove(&oldest_key);
        }
    }
    cache.insert(key, CachedTree { tree, captured_at });
}

/// 清除 root 的文件树缓存并递增其失效代际。任何文件系统写操作后必须调用，
/// 防止树过期；代际自增使"扫描中发生写操作"的并发窗口不会回填过期数据。
/// 附带删除 SQLite 落盘行（`remove_tree_cache_row`，best-effort，
/// 失败只记 `debug!`，永不让写操作失败）。
pub fn invalidate_tree_cache(root: &Path) {
    let key = normalize_cache_key(root);
    let mut cache = tree_cache().lock().unwrap_or_else(|e| e.into_inner());
    if cache.remove(&key).is_some() {
        debug!(root = %key, "workspace tree cache invalidated");
    }
    drop(cache);
    generation_bump(&key);
    remove_tree_cache_row(root);
}

/// `invalidate_tree_cache` 的 SQLite 部分拆出（供工作区移除路径复用，
/// 见 Task 4）：best-effort，永不抛错。
pub fn remove_tree_cache_row(root: &Path) {
    let key = normalize_cache_key(root);
    let Some(dir) = tree_cache_dir() else { return };
    match TreeCacheStore::open(&dir) {
        Ok(store) => {
            if let Err(e) = store.remove(&key) {
                debug!(root = %key, error = %e, "tree cache row removal skipped");
            }
        },
        Err(e) => {
            debug!(root = %key, error = %e, "tree cache store open skipped");
        },
    }
}

/// L2 落盘目录显式注入（测试/开发逃生口，仿 `ADL_STORAGE_LOCATOR_PATH` 惯例）。
/// 仅绝对路径被采纳（防 CWD 漂移）；相对值视为未设置。
const TREE_CACHE_DIR_ENV: &str = "ADL_TREE_CACHE_DIR";

/// 已解析回退目录的过程级缓存：`argv`/定位器文件在进程启动后即固定，
/// 缓存避免每次失效/读取重扫 `argv` 与重读定位器文件；
/// 环境变量注入保持每次新鲜读取（单测隔离与运维覆盖用）。
static TREE_CACHE_FALLBACK_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

/// L2 SQLite 落盘目录解析（唯一收敛点）：
/// 1. `ADL_TREE_CACHE_DIR` 绝对路径（测试注入/运维覆盖，最高优先级，每次新鲜读取）；
/// 2. 本进程 `argv` 的 `--data-dir <dir>`（`adl-server` 启动契约：
///    壳层永远以解析后的存储根拉起它，见 `crates/server/src/bin/adl-server.rs`）；
/// 3. 存储定位器文件的显式 `root`（覆盖无该 flag 的调用方，如壳层进程；
///    路径规则与解析经 `adl-kernel::storage`  canonical API，无模式耦合；
///    `TreeCache` 独立分类（Task 3）落地后，此处改读该分类目录）；
/// 4. 皆无 → `None`（调用方跳过 L2，行为等同现状）。
fn tree_cache_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os(TREE_CACHE_DIR_ENV) {
        let dir = PathBuf::from(dir);
        if dir.is_absolute() {
            return Some(dir);
        }
    }
    TREE_CACHE_FALLBACK_DIR
        .get_or_init(|| {
            data_dir_from_args(std::env::args_os().map(|arg| arg.to_string_lossy().into_owned()))
                .or_else(locator_custom_root)
        })
        .clone()
}

/// 纯函数（单测友好）：从参数流（含 argv[0]，内部跳过）中提取 `--data-dir <dir>`（空格式，
/// 与 `crates/server/src/bin/adl-server.rs` 的解析一致；另容忍 `--data-dir=<dir>`）。
/// 首个 `--data-dir` 即返回；无值（末尾孤 flag）返回 `None`。
fn data_dir_from_args(args: impl IntoIterator<Item = String>) -> Option<PathBuf> {
    let mut args = args.into_iter();
    // 跳过 argv[0]（可执行文件名）。
    args.next()?;
    while let Some(arg) = args.next() {
        if arg == "--data-dir" {
            return args.next().map(PathBuf::from);
        }
        if let Some(value) = arg.strip_prefix("--data-dir=") {
            return Some(PathBuf::from(value));
        }
    }
    None
}

/// 存储定位器文件的显式 `root`（`None` = 默认 unified，无自定义根）。
/// 路径规则（`ADL_STORAGE_LOCATOR_PATH` 覆盖）与解析经
/// `adl-kernel::storage::locator` canonical API；损坏/缺失回 `None`（永不阻塞）。
fn locator_custom_root() -> Option<PathBuf> {
    let locator = adl_kernel::storage::load_locator();
    locator.selection.root
}

/// L2 读：行存在且反序列化成功即返回（树，行捕获时间）；损坏行自愈删除后回退
/// `None`（调用方走 L3 全量扫）。打开/查询失败一律回退，不抛错。
fn read_disk_row(root: &Path) -> Option<(Vec<WorkspaceTreeNode>, i64)> {
    let dir = tree_cache_dir()?;
    let key = normalize_cache_key(root);
    let store = TreeCacheStore::open(&dir).ok()?;
    let row = store.get(&key).ok()??;
    match serde_json::from_str::<Vec<WorkspaceTreeNode>>(&row.tree_json) {
        Ok(nodes) => {
            debug!(root = %key, nodes = nodes.len(), "workspace tree disk cache hit");
            Some((nodes, row.captured_at))
        },
        Err(e) => {
            debug!(root = %key, error = %e, "workspace tree disk row corrupt, dropping");
            if let Err(e) = store.remove(&key) {
                debug!(root = %key, error = %e, "corrupt tree cache row removal skipped");
            }
            None
        },
    }
}

/// L2 写：best-effort；打开/put 任一步失败只记 `debug!`，永不影响调用方。
/// `captured_at` 由调用方传入（与返回给调用方的 miss 时间戳同一值，
/// 保证“本次扫描时间 == 落盘行时间”，单测可断言相等，无毫秒边界抖动）。
fn write_disk_row(root: &Path, tree: &[WorkspaceTreeNode], captured_at: i64) {
    let key = normalize_cache_key(root);
    let tree_json = match serde_json::to_string(tree) {
        Ok(json) => json,
        Err(e) => {
            debug!(root = %key, error = %e, "workspace tree disk write skipped: serialize failed");
            return;
        },
    };
    let Some(dir) = tree_cache_dir() else { return };
    match TreeCacheStore::open(&dir) {
        Ok(store) => {
            if let Err(e) = store.put(&key, &tree_json, captured_at) {
                debug!(root = %key, error = %e, "workspace tree disk write skipped");
            }
        },
        Err(e) => {
            debug!(root = %key, error = %e, "workspace tree disk store open skipped");
        },
    }
}

/// 带进程内缓存的树加载（方案 C 入口）。命中则直接返回克隆的树，
/// 未命中则全量扫描并缓存。
/// L1 内存 → L2 SQLite（进程重启后存活）→ L3 全量扫并回写 L1 + L2。
pub fn list_tree_cached(root: &Path) -> Result<Vec<WorkspaceTreeNode>, AppError> {
    list_tree_cached_stale_ok(root).map(|(tree, _, _)| tree)
}

/// `list_tree_cached` 的 stale-感知形态（供 Task 4 的 `allow_stale` 首包与
/// `TreePayload.capturedAt` 校准门）：
/// L1/L2 命中返 `(tree, true, captured_at)`（命中行的捕获时间），miss 全量扫并
/// 回写后返 `(tree, false, scanned_at)`（本次扫描时间，即新鲜；调用方凭
/// `from_cache == false` 即知，无需二次校准）。
pub fn list_tree_cached_stale_ok(
    root: &Path,
) -> Result<(Vec<WorkspaceTreeNode>, bool, i64), AppError> {
    if let Some((cached, captured_at)) = tree_cache_get(root) {
        debug!(
            root = %root.to_string_lossy(),
            nodes = cached.len(),
            "workspace tree cache hit"
        );
        return Ok((cached, true, captured_at));
    }
    if let Some((nodes, captured_at)) = read_disk_row(root) {
        // L2 命中回填 L1：带回行时间戳，使随后 L1 命中返同一 captured_at。
        let key = normalize_cache_key(root);
        let generation = generation_get(&key);
        tree_cache_put(root, nodes.clone(), generation, captured_at);
        return Ok((nodes, true, captured_at));
    }
    let key = normalize_cache_key(root);
    let generation = generation_get(&key);
    let tree = list_tree(root)?;
    // 单一扫描时间戳：L1/返回/落盘三者同一值。
    let scanned_at = now_ms();
    tree_cache_put(root, tree.clone(), generation, scanned_at);
    write_disk_row(root, &tree, scanned_at);
    Ok((tree, false, scanned_at))
}

/// 绕过缓存强制重新扫描（显式"刷新"用）。先失效旧条目再全量扫描并缓存，
/// 使外部改动（IDE/终端/补丁）立即反映。回写 L1 + L2（`invalidate` 已删 L2 旧行，
/// 此处写入新鲜行，避免刷新后 10s（L1 TTL）一过又回退到重扫）。
pub fn list_tree_force(root: &Path) -> Result<Vec<WorkspaceTreeNode>, AppError> {
    invalidate_tree_cache(root);
    let key = normalize_cache_key(root);
    let generation = generation_get(&key);
    let tree = list_tree(root)?;
    let scanned_at = now_ms();
    tree_cache_put(root, tree.clone(), generation, scanned_at);
    write_disk_row(root, &tree, scanned_at);
    Ok(tree)
}

pub(crate) fn ignored_dirs() -> &'static HashSet<&'static str> {
    static IGNORED_DIRS: OnceLock<HashSet<&'static str>> = OnceLock::new();
    IGNORED_DIRS.get_or_init(|| {
        HashSet::from([
            ".git",
            "target",
            "node_modules",
            "dist",
            "build",
            ".next",
            ".cache",
            "__pycache__",
            ".venv",
            "vendor",
            ".idea",
            ".vscode",
            ".svelte-kit",
            ".turbo",
            "coverage",
            ".nyc_output",
            "out",
            ".tox",
        ])
    })
}

pub fn list_tree(root: &Path) -> Result<Vec<WorkspaceTreeNode>, AppError> {
    let mut remaining = MAX_TREE_NODES;
    list_tree_inner(root, root, 0, &mut remaining)
}

/// Outcome of processing a single directory entry in the workspace tree.
enum TreeEntryOutcome {
    /// Entry should be skipped (ignored dir, symlink, or neither file nor dir).
    Skip,
    /// Tree node budget exhausted; caller should stop iterating.
    Stop,
    /// A node to push onto the result vector.
    Push(WorkspaceTreeNode),
}

/// Processes a single directory entry into a `WorkspaceTreeNode` (or signals skip/stop).
fn process_tree_entry(
    root: &Path,
    entry: &fs::DirEntry,
    depth: usize,
    remaining: &mut usize,
) -> TreeEntryOutcome {
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().into_owned();
    if should_ignore(&name) {
        return TreeEntryOutcome::Skip;
    }
    // 事项 1-A：复用 readdir 自带的 file_type（d_type，免费），消灭每条目 2 次 stat。
    // file_type 取不到时（如 d_type 未知的 FS）回退到 path 判定，与重构前逐位一致：
    // 旧代码在 file_type Err 时同样走到 path.is_dir()/is_file()（含跟随链接语义）。
    let file_type = entry.file_type().ok();
    if file_type.as_ref().is_some_and(|file_type| file_type.is_symlink()) {
        debug!(
            path = %path.to_string_lossy(),
            "skipping symlink in workspace tree"
        );
        return TreeEntryOutcome::Skip;
    }
    let is_dir = match &file_type {
        Some(file_type) => file_type.is_dir(),
        None => path.is_dir(),
    };
    let relative = relative_path(root, &path);
    if is_dir {
        if *remaining == 0 {
            return TreeEntryOutcome::Stop;
        }
        *remaining = remaining.saturating_sub(1);
        let children = list_tree_inner(root, &path, depth + 1, remaining).unwrap_or_else(|err| {
            debug!(
                dir = %path.to_string_lossy(),
                error = %err,
                "failed to read child directory for workspace tree"
            );
            vec![]
        });
        TreeEntryOutcome::Push(WorkspaceTreeNode {
            path: relative,
            name,
            kind: "directory".into(),
            children,
        })
    } else if match &file_type {
        Some(file_type) => file_type.is_file(),
        None => path.is_file(),
    } {
        if *remaining == 0 {
            return TreeEntryOutcome::Stop;
        }
        *remaining = remaining.saturating_sub(1);
        TreeEntryOutcome::Push(WorkspaceTreeNode {
            path: relative,
            name,
            kind: "file".into(),
            children: vec![],
        })
    } else {
        TreeEntryOutcome::Skip
    }
}

fn list_tree_inner(
    root: &Path,
    dir: &Path,
    depth: usize,
    remaining: &mut usize,
) -> Result<Vec<WorkspaceTreeNode>, AppError> {
    if *remaining == 0 {
        return Ok(vec![]);
    }
    if depth > MAX_TREE_DEPTH {
        return Ok(vec![]);
    }
    let mut nodes = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(value) => value,
        Err(err) => {
            debug!(
                dir = %dir.to_string_lossy(),
                error = %err,
                "failed to read directory for workspace tree"
            );
            return Ok(vec![]);
        },
    };
    for entry in entries {
        let entry = match entry {
            Ok(value) => value,
            Err(err) => {
                debug!(
                    dir = %dir.to_string_lossy(),
                    error = %err,
                    "failed to read directory entry for workspace tree"
                );
                continue;
            },
        };
        match process_tree_entry(root, &entry, depth, remaining) {
            TreeEntryOutcome::Skip => continue,
            TreeEntryOutcome::Stop => break,
            TreeEntryOutcome::Push(node) => nodes.push(node),
        }
    }
    nodes.sort_by(|a, b| a.kind.cmp(&b.kind).then_with(|| a.name.cmp(&b.name)));
    Ok(nodes)
}

pub fn build_retrieval_snapshot(
    workspace_id: &str,
    root: &Path,
) -> Result<RetrievalSnapshot, AppError> {
    let started = now_ms();
    let (files, extensions, repo_map) =
        collect_retrieval_data(root, crate::DEFAULT_MAX_FILE_BYTES)?;
    let mut top_extensions: Vec<_> = extensions
        .into_iter()
        .map(|(extension, count)| RetrievalFileTypeCount { extension, count })
        .collect();
    top_extensions.sort_by_key(|entry| std::cmp::Reverse(entry.count));
    top_extensions.truncate(12);
    info!(
        workspace_id = workspace_id,
        scanned_files = files.len(),
        indexed_text_files = files.len(),
        repo_map_entries = repo_map.len(),
        elapsed_ms = now_ms().saturating_sub(started),
        top_extensions = ?top_extensions,
        "retrieval snapshot built"
    );
    debug!(
        workspace_id = workspace_id,
        repo_map_preview = ?repo_map
            .iter()
            .take(40)
            .map(|entry| format!("{} ({})", entry.path, entry.r#type))
            .collect::<Vec<_>>(),
        "repo-map preview (first 40 entries)"
    );
    Ok(RetrievalSnapshot {
        workspace_id: workspace_id.to_string(),
        root_path: root.to_string_lossy().into_owned(),
        status: RetrievalStatusV1::Completed,
        scanned_files: files.len(),
        indexed_text_files: files.len(),
        started_at: Some(started),
        updated_at: now_ms(),
        completed_at: Some(now_ms()),
        last_error: None,
        top_extensions,
        repo_map,
    })
}

#[allow(clippy::type_complexity)]
fn collect_retrieval_data(
    root: &Path,
    max_file_bytes: u64,
) -> Result<(Vec<PathBuf>, BTreeMap<String, i32>, Vec<RepoMapEntry>), AppError> {
    let mut files = Vec::new();
    let mut extensions: BTreeMap<String, i32> = BTreeMap::new();
    let mut repo_map = Vec::new();
    collect_retrieval_inner(
        root,
        root,
        max_file_bytes,
        &mut files,
        &mut extensions,
        &mut repo_map,
    )?;
    repo_map.truncate(200);
    Ok((files, extensions, repo_map))
}

/// Check if a file is likely a text file without reading its content.
/// Uses file size (via metadata) and extension-based filtering.
/// Binary extensions are excluded; unknown extensions are allowed if size is within limit.
///
/// This replaces `read_text_file(...).is_ok()` probes in tree walk, eliminating
/// full file content reads just to validate readability. Tradeoff: extension-based
/// filtering is less precise than `looks_binary` byte inspection, but avoids the
/// I/O cost of reading every file in large workspaces.
pub(crate) fn is_text_file(root: &Path, relative: &str, max_file_bytes: u64) -> bool {
    let full_path = root.join(relative);

    // Check file size via metadata (no content read)
    let metadata = match fs::metadata(&full_path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if !metadata.is_file() || metadata.len() > max_file_bytes {
        return false;
    }

    // Exclude known binary extensions
    const BINARY_EXTENSIONS: &[&str] = &[
        "exe", "dll", "so", "dylib", "bin", "obj", "o", "a", "lib", "png", "jpg", "jpeg", "gif",
        "bmp", "ico", "tiff", "webp", "zip", "tar", "gz", "bz2", "7z", "rar", "xz", "mp3", "mp4",
        "avi", "mov", "wmv", "flv", "wav", "ogg", "pdf", "doc", "docx", "xls", "xlsx", "ppt",
        "pptx", "sqlite", "db", "mdb", "wasm", "class",
    ];
    let ext = std::path::Path::new(relative)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if BINARY_EXTENSIONS.contains(&ext.as_str()) {
        return false;
    }

    true
}

fn collect_retrieval_inner(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
    extensions: &mut BTreeMap<String, i32>,
    repo_map: &mut Vec<RepoMapEntry>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_ignore(&name) {
            continue;
        }
        let relative = relative_path(root, &path);
        if path.is_dir() {
            repo_map.push(RepoMapEntry { path: relative, r#type: "directory".to_string() });
            collect_retrieval_inner(root, &path, max_file_bytes, files, extensions, repo_map)?;
        } else if path.is_file() {
            if files.len() < MAX_COLLECTED_FILES && is_text_file(root, &relative, max_file_bytes) {
                let ext = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("[none]")
                    .to_string();
                *extensions.entry(ext).or_insert(0) += 1;
                files.push(path);
            }
            repo_map.push(RepoMapEntry { path: relative, r#type: "file".to_string() });
        }
    }
    Ok(())
}

pub async fn build_retrieval_snapshot_async(
    workspace_id: &str,
    root: &Path,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<RetrievalSnapshot, AppError> {
    let started = now_ms();
    let root_owned = root.to_path_buf();

    let (files, top_extensions, repo_map) = tokio::task::spawn_blocking({
        let r = root_owned.clone();
        move || {
            let (files, extensions, repo_map) =
                collect_retrieval_data(&r, crate::DEFAULT_MAX_FILE_BYTES)?;
            let mut top_extensions: Vec<_> = extensions
                .into_iter()
                .map(|(extension, count)| RetrievalFileTypeCount { extension, count })
                .collect();
            top_extensions.sort_by_key(|entry| std::cmp::Reverse(entry.count));
            top_extensions.truncate(12);
            Ok::<(Vec<PathBuf>, Vec<RetrievalFileTypeCount>, Vec<RepoMapEntry>), AppError>((
                files,
                top_extensions,
                repo_map,
            ))
        }
    })
    .await
    .map_err(|e| AppError::Workspace(format!("task join error: {e}")))??;

    if cancellation.try_recv().is_ok() {
        return Ok(RetrievalSnapshot {
            workspace_id: workspace_id.to_string(),
            root_path: root.to_string_lossy().into_owned(),
            status: RetrievalStatusV1::Cancelled,
            scanned_files: files.len(),
            indexed_text_files: files.len(),
            started_at: Some(started),
            updated_at: now_ms(),
            completed_at: Some(now_ms()),
            last_error: Some("cancelled".to_string()),
            top_extensions,
            repo_map: vec![],
        });
    }

    info!(
        workspace_id = workspace_id,
        scanned_files = files.len(),
        indexed_text_files = files.len(),
        repo_map_entries = repo_map.len(),
        top_extensions = ?top_extensions,
        "retrieval snapshot built (async)"
    );

    Ok(RetrievalSnapshot {
        workspace_id: workspace_id.to_string(),
        root_path: root.to_string_lossy().into_owned(),
        status: RetrievalStatusV1::Completed,
        scanned_files: files.len(),
        indexed_text_files: files.len(),
        started_at: Some(started),
        updated_at: now_ms(),
        completed_at: Some(now_ms()),
        last_error: None,
        top_extensions,
        repo_map,
    })
}

pub(crate) fn collect_text_files(
    root: &Path,
    max_file_bytes: u64,
) -> Result<Vec<PathBuf>, AppError> {
    let mut files = Vec::new();
    collect_text_files_inner(root, root, max_file_bytes, &mut files)?;
    Ok(files)
}

fn collect_text_files_inner(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
) -> Result<(), AppError> {
    collect_text_files_inner_int(root, dir, max_file_bytes, files, None)
}

fn collect_text_files_inner_int(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
    mut extensions: Option<&mut BTreeMap<String, i32>>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(dir)? {
        if files.len() >= MAX_COLLECTED_FILES {
            return Ok(());
        }
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_ignore(&name) {
            continue;
        }
        if path.is_dir() {
            collect_text_files_inner_int(
                root,
                &path,
                max_file_bytes,
                files,
                extensions.as_deref_mut(),
            )?;
        } else if path.is_file() {
            let relative = relative_path(root, &path);
            if is_text_file(root, &relative, max_file_bytes) {
                if let Some(ref mut ext_map) = extensions {
                    let ext = path
                        .extension()
                        .and_then(|value| value.to_str())
                        .unwrap_or("[none]")
                        .to_string();
                    *ext_map.entry(ext).or_insert(0) += 1;
                }
                files.push(path);
            }
        }
    }
    Ok(())
}

pub(crate) fn should_ignore(name: &str) -> bool {
    ignored_dirs().contains(name)
}

pub(crate) fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod is_text_file_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TF_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir(prefix: &str) -> std::path::PathBuf {
        let id = TF_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("{prefix}-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path);
    }

    #[test]
    fn is_text_file_returns_true_for_txt() {
        let tmp = unique_tmp_dir("tree-test-txt");
        std::fs::write(tmp.join("test.txt"), b"hello").unwrap();
        assert!(is_text_file(&tmp, "test.txt", 1024 * 1024));
        cleanup(&tmp);
    }

    #[test]
    fn is_text_file_returns_false_for_binary_extension() {
        let tmp = unique_tmp_dir("tree-test-bin");
        // .exe is in BINARY_EXTENSIONS — rejected without reading content
        std::fs::write(tmp.join("test.exe"), b"\x4d\x5a").unwrap();
        assert!(!is_text_file(&tmp, "test.exe", 1024 * 1024));
        cleanup(&tmp);
    }

    #[test]
    fn is_text_file_returns_false_for_oversized() {
        let tmp = unique_tmp_dir("tree-test-big");
        // Write a file over the 1-byte limit
        std::fs::write(tmp.join("big.txt"), b"hello world").unwrap();
        assert!(!is_text_file(&tmp, "big.txt", 1));
        cleanup(&tmp);
    }

    #[test]
    fn is_text_file_returns_false_for_missing_file() {
        let tmp = unique_tmp_dir("tree-test-missing");
        assert!(!is_text_file(&tmp, "nonexistent.txt", 1024 * 1024));
        cleanup(&tmp);
    }

    #[test]
    fn is_text_file_returns_true_for_unknown_extension() {
        let tmp = unique_tmp_dir("tree-test-unknown");
        std::fs::write(tmp.join("file.xyz"), b"some text content").unwrap();
        // Unknown extensions are allowed (tradeoff: may include some binary files)
        assert!(is_text_file(&tmp, "file.xyz", 1024 * 1024));
        cleanup(&tmp);
    }

    #[test]
    fn is_text_file_returns_true_for_no_extension() {
        let tmp = unique_tmp_dir("tree-test-noext");
        std::fs::write(tmp.join("README"), b"readme content").unwrap();
        assert!(is_text_file(&tmp, "README", 1024 * 1024));
        cleanup(&tmp);
    }
}

#[cfg(test)]
mod tree_cache_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static CACHE_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir(prefix: &str) -> std::path::PathBuf {
        let id = CACHE_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("{prefix}-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    fn cleanup(path: &std::path::Path) {
        // 清理缓存条目，避免全局缓存污染后续测试
        invalidate_tree_cache(path);
        let _ = std::fs::remove_dir_all(path);
    }

    /// 方案 C：首次调用为 cache miss（全量扫描并缓存），第二次调用命中缓存且结果一致。
    #[test]
    fn list_tree_cached_hits_after_first_scan() {
        let tmp = unique_tmp_dir("cache-hit");
        std::fs::write(tmp.join("a.txt"), b"a").unwrap();
        std::fs::create_dir_all(tmp.join("sub")).unwrap();
        std::fs::write(tmp.join("sub/b.txt"), b"b").unwrap();

        let first = list_tree_cached(&tmp).unwrap();
        let second = list_tree_cached(&tmp).unwrap();

        assert_eq!(first.len(), second.len(), "cache hit must return same tree");
        assert!(first.iter().any(|n| n.path == "a.txt"));
        assert!(first.iter().any(|n| n.path == "sub"));
        cleanup(&tmp);
    }

    /// 方案 C：写操作（create_file）后缓存被失效，再次调用反映新增文件。
    #[test]
    fn list_tree_cached_reflects_file_creation_after_invalidation() {
        let tmp = unique_tmp_dir("cache-invalidate");
        std::fs::write(tmp.join("a.txt"), b"a").unwrap();

        let before = list_tree_cached(&tmp).unwrap();
        assert!(!before.iter().any(|n| n.path == "new.txt"));

        // 走 crate 的 create_file（内部会 invalidate_tree_cache）
        crate::fs::create_file(&tmp, "new.txt", "content").unwrap();

        let after = list_tree_cached(&tmp).unwrap();
        assert!(after.iter().any(|n| n.path == "new.txt"), "tree must reflect newly created file");
        cleanup(&tmp);
    }

    /// 事项 1-A（性能重构特征测试）：文件/目录/忽略目录分类契约。
    /// 去 stat 化重构前后行为必须逐字一致：目录带 children、文件不带、
    /// 忽略目录（node_modules）整棵消失。
    #[test]
    fn list_tree_classifies_entries_without_stat_fallback() {
        let tmp = unique_tmp_dir("classify");
        std::fs::create_dir_all(tmp.join("sub")).unwrap();
        std::fs::write(tmp.join("sub/b.txt"), b"b").unwrap();
        std::fs::write(tmp.join("top.txt"), b"t").unwrap();
        std::fs::create_dir_all(tmp.join("node_modules/dep")).unwrap();
        std::fs::write(tmp.join("node_modules/dep/x.js"), b"x").unwrap();

        let tree = list_tree(&tmp).unwrap();
        let sub = tree.iter().find(|n| n.path == "sub").expect("dir must be listed");
        assert!(!sub.children.is_empty(), "dir must carry children");
        assert!(tree.iter().any(|n| n.path == "top.txt"));
        assert!(
            !tree.iter().any(|n| n.path.starts_with("node_modules")),
            "ignored dir must vanish entirely"
        );
        cleanup(&tmp);
    }

    /// 事项 1-A：符号链接必须跳过（与重构前一致），且不得被跟随展开。
    #[cfg(unix)]
    #[test]
    fn list_tree_skips_symlinks() {
        let tmp = unique_tmp_dir("symlink");
        std::fs::create_dir_all(tmp.join("real")).unwrap();
        std::fs::write(tmp.join("real/a.txt"), b"a").unwrap();
        std::os::unix::fs::symlink(tmp.join("real"), tmp.join("link")).unwrap();

        let tree = list_tree(&tmp).unwrap();
        assert!(tree.iter().any(|n| n.path == "real"));
        assert!(!tree.iter().any(|n| n.path == "link"), "symlink must be skipped");
        cleanup(&tmp);
    }

    /// L2 单测隔离：串行化 `ADL_TREE_CACHE_DIR` 的读写（进程级环境变量，
    /// 仿 `adl-kernel::storage::locator` 测试的 `ENV_OVERRIDE_LOCK` 惯例），
    /// 并指向唯一临时目录（并行测试互不干扰：L2 键为工作区绝对路径，各不相同）。
    static L2_TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// 设置环境变量并在 Drop 时还原（含 panic 展开路径）。
    struct EnvVarGuard {
        key: &'static str,
        original: Option<std::ffi::OsString>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &std::ffi::OsStr) -> Self {
            let original = std::env::var_os(key);
            // SAFETY: 调用方持有 `L2_TEST_ENV_LOCK`；本测试二进制内无其它线程读写该变量。
            unsafe { std::env::set_var(key, value) };
            Self { key, original }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            match self.original.take() {
                // SAFETY: 同 `set`。
                Some(v) => unsafe { std::env::set_var(self.key, v) },
                // SAFETY: 同 `set`。
                None => unsafe { std::env::remove_var(self.key) },
            }
        }
    }

    /// 持有测试锁 + 环境变量还原；Drop 时清理 L2 临时目录。
    /// 声明顺序即释放顺序的逆序：先声明者最晚释放（锁最后释放）。
    struct L2EnvGuard {
        _lock: std::sync::MutexGuard<'static, ()>,
        _env: EnvVarGuard,
        dir: std::path::PathBuf,
    }

    impl Drop for L2EnvGuard {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn l2_isolated_env(tag: &str) -> L2EnvGuard {
        let lock = L2_TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let id = CACHE_SEQ.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("adl-tree-l2-{tag}-{id}"));
        let _ = std::fs::remove_dir_all(&dir);
        let env = EnvVarGuard::set("ADL_TREE_CACHE_DIR", dir.as_os_str());
        L2EnvGuard { _lock: lock, _env: env, dir }
    }

    /// 测试内小 helper（与实现同文件）：直调
    /// `TreeCacheStore::open(&tree_cache_dir())` 判指定工作区的落盘行缺席。
    /// 目录不可解析时视为缺席（与生产跳过 L2 的语义一致）。
    fn tree_cache_store_row_absent(root: &std::path::Path) -> bool {
        let Some(dir) = tree_cache_dir() else { return true };
        match crate::tree_cache_store::TreeCacheStore::open(&dir) {
            Ok(store) => {
                store.get(&normalize_cache_key(root)).map(|row| row.is_none()).unwrap_or(true)
            },
            Err(_) => true,
        }
    }

    /// L2：跨“内存清空”后仍命中（模拟进程重启后 L1 丢失，L2 落盘存活）。
    /// miss 首包 `captured_at ≈ now`；L2 命中包原样携带落盘行的 `captured_at`
    /// （供 Task 4 校准门；与首包相等即证明未重扫）。
    #[test]
    fn list_tree_cached_survives_memory_clear_via_disk_row() {
        let _l2 = l2_isolated_env("survive");
        let tmp = unique_tmp_dir("l2-survive");
        std::fs::write(tmp.join("a.txt"), b"a").unwrap();
        let before = now_ms();
        let (first, first_cached, first_at) = list_tree_cached_stale_ok(&tmp).unwrap();
        assert!(!first_cached, "first call must be a fresh scan");
        assert!(first_at >= before && first_at <= now_ms(), "miss captured_at must be ~now");
        assert!(first.iter().any(|n| n.path == "a.txt"));
        // 仅清 L1 内存条目（模拟进程重启后 L1 丢失，不删盘），并删除源文件：
        // 若实现回退到 L3 重扫，a.txt 将消失；唯有 L2 落盘行能返回它（不触发重扫）。
        tree_cache().lock().unwrap_or_else(|e| e.into_inner()).remove(&normalize_cache_key(&tmp));
        std::fs::remove_file(tmp.join("a.txt")).unwrap();
        let (second, second_cached, second_at) = list_tree_cached_stale_ok(&tmp).unwrap();
        assert!(second_cached, "second call must be served from cache");
        assert_eq!(first.len(), second.len());
        assert!(
            second.iter().any(|n| n.path == "a.txt"),
            "second call must come from the L2 disk row, not a rescan"
        );
        assert_eq!(
            second_at, first_at,
            "L2 hit must carry the stored row captured_at, not a fresh timestamp"
        );
        // 第三次调用命中回填后的 L1：同内容必须返同一 captured_at
        //（回填若用 fresh now_ms 盖时间戳，此处即暴露分裂）。
        let (third, third_cached, third_at) = list_tree_cached_stale_ok(&tmp).unwrap();
        assert!(third_cached, "third call must be served from the backfilled L1");
        assert_eq!(third.len(), first.len());
        assert_eq!(third_at, first_at, "L1 hit after L2 backfill must return the row captured_at");
        cleanup(&tmp);
    }

    /// 失效删行：invalidate 后 L2 无行，下次调用重扫（captured_at 更新）。
    #[test]
    fn invalidate_removes_disk_row() {
        let _l2 = l2_isolated_env("invalidate");
        let tmp = unique_tmp_dir("l2-invalidate");
        std::fs::write(tmp.join("a.txt"), b"a").unwrap();
        let _ = list_tree_cached(&tmp).unwrap();
        invalidate_tree_cache(&tmp);
        assert!(tree_cache_store_row_absent(&tmp), "disk row must be gone");
        cleanup(&tmp);
    }

    /// `remove_tree_cache_row` 直调：返回 `()`（编译期锁定永不抛错签名），
    /// 删行后同键 `get` 为 `None`。先断言行存在，排除空删真绿。
    #[test]
    fn remove_tree_cache_row_deletes_disk_row_directly() {
        let _l2 = l2_isolated_env("remove-row");
        let tmp = unique_tmp_dir("l2-remove-row");
        std::fs::write(tmp.join("a.txt"), b"a").unwrap();
        let _ = list_tree_cached(&tmp).unwrap();
        assert!(!tree_cache_store_row_absent(&tmp), "disk row must exist after scan");
        remove_tree_cache_row(&tmp);
        assert!(tree_cache_store_row_absent(&tmp), "disk row must be gone");
        cleanup(&tmp);
    }

    /// `--data-dir` 提取（`tree_cache_dir` 回退链用）：空格与等号两式，缺席为 None。
    #[test]
    fn data_dir_from_args_supports_space_and_equals_forms() {
        let args = ["adl-server", "--port", "0", "--data-dir", "D:/adl"]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();
        assert_eq!(data_dir_from_args(args), Some(std::path::PathBuf::from("D:/adl")));
        let args =
            ["adl-server", "--data-dir=D:/x"].into_iter().map(String::from).collect::<Vec<_>>();
        assert_eq!(data_dir_from_args(args), Some(std::path::PathBuf::from("D:/x")));
        let args = ["adl-server"].into_iter().map(String::from).collect::<Vec<_>>();
        assert_eq!(data_dir_from_args(args), None);
    }
}
