//! Storage domain HTTP handlers — the browser/preview-mode mirror of the shell
//! storage commands (Plan C Task 1, `src-tauri/src/commands/storage.rs`), so the
//! frontend can read/update storage paths through adl-server without a Tauri
//! backend. Responses use the [`crate::ipc::to_response`] `IpcResult` wire format
//! and blocking filesystem work runs in `spawn_blocking`, following
//! `handlers/reference.rs`.
//!
//! DTO field names are camelCase and are kept byte-compatible with the shell
//! DTOs — Plan C Task 6 asserts cross-mode parity.
//!
//! B5 (re-review ruling): there is intentionally **no** `/storage/restart-backend`
//! endpoint. adl-server never restarts itself; a requested migration is always
//! deferred to the next process launch (the shell/dev launcher owns restarts).

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_kernel::storage as st;
use adl_workspace::tree_cache_store::{
    TreeCacheOptions, TreeCacheStats, TreeCacheStore, validate_tree_cache_ttl,
};
use axum::extract::State;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCategoryStatus {
    pub key: String,
    pub path: String,
    pub movable: bool,
    pub exists: bool,
    pub bytes: u64,
    pub files: u64,
    pub foreign_files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageReportDto {
    pub at: i64,
    pub ok: bool,
    /// true 时指针已切换持久化（即使 ok=false 也不得重跑迁移）。
    pub switched: bool,
    pub moved_files: usize,
    pub moved_bytes: u64,
    pub removed_dirs: Vec<String>,
    pub kept_dirs: Vec<KeptDirDto>,
    pub retained: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptDirDto {
    pub path: String,
    pub foreign_files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingDto {
    pub failed: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub mode: String,
    pub root: String,
    pub default_root: String,
    pub categories: Vec<StorageCategoryStatus>,
    pub locator_path: String,
    pub pending: Option<PendingDto>,
    pub last_report: Option<StorageReportDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoragePathPatch {
    pub mode: String,
    #[serde(default)]
    pub root: Option<String>,
    #[serde(default)]
    pub categories: HashMap<String, String>,
    #[serde(default)]
    pub retain_source: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignScanDto {
    pub category: String,
    pub root: String,
    pub foreign_files: Vec<String>,
}

/// 单条预检问题（结构化，事项 9：携带分类供前端本地化展示 + 去重）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightIssueDto {
    /// 分类 key（与前端 `CATEGORY_COPY` 键一致）；`None` = 根级问题（如磁盘空间、root 检查）。
    pub category: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightDto {
    pub ok: bool,
    pub errors: Vec<PreflightIssueDto>,
    pub warnings: Vec<PreflightIssueDto>,
    pub total_files: u64,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageApplyResult {
    pub restart_required: bool,
    pub preflight: PreflightDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreflightBody {
    patch: StoragePathPatch,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetPathsBody {
    patch: StoragePathPatch,
    #[serde(default)]
    apply_now: bool,
}

/// Run a blocking closure on `spawn_blocking`, collapsing a join error into
/// `AppError::Internal` (recipe shared with `handlers/clipboard.rs`).
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

pub fn mode_to_str(mode: st::StorageMode) -> &'static str {
    match mode {
        st::StorageMode::Unified => "unified",
        st::StorageMode::PerCategory => "per_category",
    }
}

/// patch → StorageSelection。未知 mode 报错；未知分类键忽略（前向安全）。
pub fn patch_to_selection(patch: &StoragePathPatch) -> Result<st::StorageSelection, AppError> {
    let mode = match patch.mode.as_str() {
        "unified" => st::StorageMode::Unified,
        "per_category" => st::StorageMode::PerCategory,
        other => {
            return Err(AppError::InvalidInput(format!("unknown storage mode: {other}")));
        },
    };
    let mut categories = std::collections::BTreeMap::new();
    for c in st::StorageCategory::ALL {
        if let Some(path) = patch.categories.get(c.key()) {
            if !path.trim().is_empty() {
                categories.insert(c, std::path::PathBuf::from(path));
            }
        }
    }
    Ok(st::StorageSelection {
        mode,
        root: patch.root.as_ref().filter(|r| !r.trim().is_empty()).map(std::path::PathBuf::from),
        categories,
    })
}

/// Platform defaults used to resolve a target `StoragePaths` from a patch.
///
/// adl-server's default root is its `--data-dir`; `ServerState.data_dir` carries
/// the resolved root (identical to `--data-dir` unless the locator overrides it).
/// This mirrors `engine::storage_from_locator`, which builds the same defaults.
fn defaults_for(state: &ServerState) -> st::StorageDefaults {
    st::StorageDefaults {
        root: state.data_dir.clone(),
        credentials_dir: st::locator_dir().join("credentials"),
        downloads_dir: state.data_dir.clone(),
    }
}

fn category_statuses(svc: &st::StorageService) -> Vec<StorageCategoryStatus> {
    let paths = svc.paths();
    let foreign = st::scan_foreign(paths);
    let foreign_for = |c: st::StorageCategory| -> Vec<String> {
        foreign
            .iter()
            .find(|f| f.category == c)
            .map(|f| f.foreign_files.clone())
            .unwrap_or_default()
    };
    st::StorageCategory::ALL
        .into_iter()
        .map(|c| {
            // path 报覆盖值语义（`override_dir`，round-trip 恒等，事项 9 根因修复）；
            // 占用统计与存在性用实际解析路径 `dir(c)`（DB 类是文件、dsh 是子目录）。
            let actual = paths.dir(c);
            let (bytes, files) = st::category_usage(c, &actual);
            StorageCategoryStatus {
                key: c.key().to_string(),
                path: paths.override_dir(c).to_string_lossy().to_string(),
                movable: !matches!(c, st::StorageCategory::DownloadsDefault),
                exists: actual.exists(),
                bytes,
                files,
                foreign_files: foreign_for(c),
            }
        })
        .collect()
}

fn report_dto(r: &st::MigrationReport) -> StorageReportDto {
    StorageReportDto {
        at: r.at,
        ok: r.ok,
        switched: r.switched,
        moved_files: r.moved_files,
        moved_bytes: r.moved_bytes,
        removed_dirs: r.removed_dirs.iter().map(|d| d.to_string_lossy().to_string()).collect(),
        kept_dirs: r
            .kept_dirs
            .iter()
            .map(|k| KeptDirDto {
                path: k.path.to_string_lossy().to_string(),
                foreign_files: k.foreign_files.clone(),
            })
            .collect(),
        retained: r.retained,
        error: r.error.clone(),
    }
}

/// Shared preflight computation (used by both `preflight` and `set_paths`).
///
/// Mirrors the shell `storage_preflight_cmd` except for the disk-space guard:
/// adl-server has no `DownloadManager`, and `PreflightDto.freeBytes` is not
/// surfaced by the settings UI (Plan C Task 4 has no copy key for it), so the
/// value is reported as 0 and no space error is synthesized.
fn preflight_dto(state: &ServerState, patch: &StoragePathPatch) -> Result<PreflightDto, AppError> {
    let selection = patch_to_selection(patch)?;
    let from = state.storage.paths().clone();
    let to = st::StoragePaths::resolve(&selection, &defaults_for(state));
    let report = st::preflight(&from, &to);
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for issue in &report.issues {
        let dto = PreflightIssueDto {
            category: issue.category.map(|c| c.key().to_string()),
            message: issue.message.clone(),
        };
        match issue.severity {
            st::Severity::Error => errors.push(dto),
            st::Severity::Warning => warnings.push(dto),
        }
    }
    Ok(PreflightDto {
        ok: errors.is_empty(),
        errors,
        warnings,
        total_files: report.total_files as u64,
        total_bytes: report.total_bytes,
        free_bytes: 0,
    })
}

/// POST `/storage/status` — current locator selection, per-category usage and
/// pending/report state.
pub async fn status(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let svc = state.storage.clone();
        let locator = st::load_locator();
        let dto = StorageStatus {
            mode: mode_to_str(locator.selection.mode).to_string(),
            root: svc.paths().root.to_string_lossy().to_string(),
            default_root: svc.default_root().to_string_lossy().to_string(),
            categories: category_statuses(&svc),
            locator_path: st::locator_path().to_string_lossy().to_string(),
            pending: locator
                .pending_migration
                .as_ref()
                .map(|p| PendingDto { failed: p.failed, error: p.error.clone() }),
            last_report: locator.last_report.as_ref().map(report_dto),
        };
        Ok(serde_json::to_value(dto)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/storage/scan-foreign` — per-category external (non-owned) files that a
/// migration would preserve.
pub async fn scan_foreign(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let items: Vec<ForeignScanDto> = st::scan_foreign(state.storage.paths())
            .into_iter()
            .map(|f| ForeignScanDto {
                category: f.category.key().to_string(),
                root: f.root.to_string_lossy().to_string(),
                foreign_files: f.foreign_files,
            })
            .collect();
        Ok(serde_json::to_value(items)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/storage/preflight` — validate a proposed patch (`{ patch }`) without
/// writing anything.
pub async fn preflight(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: PreflightBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        Ok(serde_json::to_value(preflight_dto(&state, &input.patch)?)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/storage/set-paths` — persist a pending migration (`{ patch, applyNow }`).
///
/// The migration itself runs on the next process launch; this handler never
/// restarts the server (B5 — the shell owns restarts). `restartRequired` mirrors
/// `applyNow`, exactly like the shell `storage_set_paths`, so the shared frontend
/// flow behaves identically in both modes.
pub async fn set_paths(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SetPathsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let selection = patch_to_selection(&input.patch)?;
        let preflight = preflight_dto(&state, &input.patch)?;
        if !preflight.ok {
            return Ok(serde_json::to_value(StorageApplyResult {
                restart_required: false,
                preflight,
            })?);
        }
        let mut locator = st::load_locator();
        locator.pending_migration = Some(st::PendingMigration {
            from: locator.selection.clone(),
            to: selection,
            retain_source: input.patch.retain_source,
            requested_at: adl_types::now_ms(),
            failed: false,
            error: None,
        });
        st::save_locator(&locator)?;
        Ok(serde_json::to_value(StorageApplyResult {
            restart_required: input.apply_now,
            preflight,
        })?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/storage/cancel-pending` — drop a scheduled migration.
pub async fn cancel_pending(State(_state): State<ServerState>) -> impl IntoResponse {
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut locator = st::load_locator();
        locator.pending_migration = None;
        st::save_locator(&locator)?;
        Ok(serde_json::Value::Null)
    })
    .await;
    ipc::to_response(result)
}

/// 可单测的落盘 helpers（`dir` 由调用方经 `tree_cache_dir_from_state` 解析传入，
/// 仿 Task 1 存储层"调用方传入 `&Path`"惯例；handler 薄包一层做目录收敛）。
fn tree_cache_stats_in(dir: &std::path::Path) -> Result<TreeCacheStats, AppError> {
    TreeCacheStore::open(dir)?.stats()
}

/// TreeCache 落盘目录：与 `storage/status` 同源（`state.storage.paths()`，
/// 回落 `paths.root`——locator 无 root 时即 `defaults.root`，服务端为 `--data-dir`）。
/// 优先级：
/// 1. `ADL_TREE_CACHE_DIR` 绝对覆盖（测试注入/运维，与 L2 `tree_cache_dir()` 同口径；
///    运维覆盖需指向可写目录，此处不做包含校验——能设进程环境者与进程同权）；
/// 2. `paths.tree_cache_store_dir()`（`tree-cache.db` 父目录；相对路径回 None，防 CWD 漂移建库）；
/// 3. 绝对统一根；仍非绝对则 `InvalidInput` 拒绝建库（fail-loud：前端区段不渲染，
///    仅相对路径配置时触发，正常部署恒为绝对路径）。
///
/// 不再走 `adl_workspace::tree_cache_dir()`（壳层无 `--data-dir` 且 locator 缺
/// root 时回 None → 空表零值，与磁盘真实文件不一致）。
/// stats 在此建空库与旧 `Some` 分支行为一致（`TreeCacheStore::open` 含建库；
/// options/clear 本就需建库写语义，故不做只读 open）。
fn tree_cache_dir_from_state(state: &ServerState) -> Result<std::path::PathBuf, AppError> {
    if let Some(dir) = adl_workspace::tree_cache_dir_env_override() {
        return Ok(dir);
    }
    let paths = state.storage.paths();
    paths
        .tree_cache_store_dir()
        .or_else(|| paths.root.is_absolute().then(|| paths.root.clone()))
        .ok_or_else(|| AppError::InvalidInput("tree-cache directory is not absolute".to_string()))
}

#[cfg(test)]
fn tree_cache_options_in(dir: &std::path::Path) -> Result<TreeCacheOptions, AppError> {
    TreeCacheStore::open(dir)?.get_options()
}

fn tree_cache_set_options_in(
    dir: &std::path::Path,
    enabled: bool,
    ttl_minutes: u64,
) -> Result<(), AppError> {
    // TTL 合法性以 store 层共享校验为准（B6：范围变更只改一处）；
    // `InvalidInput` 透传即 handler 映射。
    validate_tree_cache_ttl(ttl_minutes)?;
    TreeCacheStore::open(dir)?.set_options(enabled, ttl_minutes)
}

fn tree_cache_clear_in(dir: &std::path::Path) -> Result<(), AppError> {
    TreeCacheStore::open(dir)?.clear()
}

/// POST `/storage/tree-cache/stats` — `{}` → `{ workspaceCount, totalBytes,
/// oldestCapturedAt, newestCapturedAt, enabled, ttlMinutes }`（camelCase，与 `TreeCacheStats` 对齐）。
pub async fn tree_cache_stats(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let dir = tree_cache_dir_from_state(&state)?;
        Ok(serde_json::to_value(tree_cache_stats_in(&dir)?)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/storage/tree-cache/options` — body 为裸 opts `{ enabled, ttlMinutes }`
///（T6 httpBridge `POST(opts)` 实证）；`ttl_minutes` 越界报 `InvalidInput` → `{ ok:true }`。
pub async fn tree_cache_options(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: TreeCacheOptions = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        validate_tree_cache_ttl(input.ttl_minutes)?;
        let dir = tree_cache_dir_from_state(&state)?;
        tree_cache_set_options_in(&dir, input.enabled, input.ttl_minutes)?;
        Ok(serde_json::Value::Null)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/storage/tree-cache/clear` — `{}` → 全行删除（元数据开关/TTL 保留）→ `{ ok:true }`。
pub async fn tree_cache_clear(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let dir = tree_cache_dir_from_state(&state)?;
        tree_cache_clear_in(&dir)?;
        Ok(serde_json::Value::Null)
    })
    .await;
    ipc::to_response(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_string_round_trips() {
        assert_eq!(mode_to_str(st::StorageMode::Unified), "unified");
        assert_eq!(mode_to_str(st::StorageMode::PerCategory), "per_category");
    }

    #[test]
    fn patch_to_selection_unified_keeps_only_root() {
        let patch = StoragePathPatch {
            mode: "unified".into(),
            root: Some("D:/adl".into()),
            categories: std::collections::HashMap::new(),
            retain_source: false,
        };
        let sel = patch_to_selection(&patch).unwrap();
        assert_eq!(sel.mode, st::StorageMode::Unified);
        assert_eq!(sel.root.as_deref(), Some(std::path::Path::new("D:/adl")));
        assert!(sel.categories.is_empty());
    }

    #[test]
    fn patch_to_selection_per_category_maps_known_keys() {
        let mut categories = std::collections::HashMap::new();
        categories.insert("clipboard".to_string(), "E:/clip".to_string());
        let patch = StoragePathPatch {
            mode: "per_category".into(),
            root: None,
            categories,
            retain_source: true,
        };
        let sel = patch_to_selection(&patch).unwrap();
        assert_eq!(sel.mode, st::StorageMode::PerCategory);
        assert_eq!(
            sel.categories.get(&st::StorageCategory::Clipboard),
            Some(&std::path::PathBuf::from("E:/clip"))
        );
    }

    #[test]
    fn patch_to_selection_rejects_unknown_mode() {
        let patch = StoragePathPatch {
            mode: "bogus".into(),
            root: None,
            categories: std::collections::HashMap::new(),
            retain_source: false,
        };
        assert!(patch_to_selection(&patch).is_err());
    }

    #[test]
    fn patch_to_selection_ignores_unknown_category_keys_and_blank_paths() {
        let mut categories = std::collections::HashMap::new();
        categories.insert("not_a_category".to_string(), "E:/x".to_string());
        categories.insert("clipboard".to_string(), "   ".to_string());
        let patch = StoragePathPatch {
            mode: "per_category".into(),
            root: Some("  ".into()),
            categories,
            retain_source: false,
        };
        let sel = patch_to_selection(&patch).unwrap();
        assert!(sel.root.is_none(), "blank root must be treated as unset");
        assert!(sel.categories.is_empty(), "unknown keys and blank paths are ignored");
    }

    fn temp_storage(tag: &str) -> (st::StorageService, std::path::PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("adl-server-storage-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let defaults = st::StorageDefaults {
            root: dir.clone(),
            credentials_dir: dir.join("credentials"),
            downloads_dir: dir.clone(),
        };
        let svc = st::StorageService::from_locator(&st::StorageLocator::default(), &defaults);
        (svc, dir)
    }

    #[test]
    fn category_statuses_covers_all_eleven_categories_in_order() {
        let (svc, dir) = temp_storage("statuses");
        let statuses = category_statuses(&svc);
        let keys: Vec<&str> = statuses.iter().map(|s| s.key.as_str()).collect();
        assert_eq!(
            keys,
            vec![
                "database",
                "downloads_db",
                "site_meta_db",
                "tree_cache",
                "config",
                "clipboard",
                "snapshot",
                "harnesses",
                "logs",
                "credentials_fallback",
                "downloads_default",
            ]
        );
        assert!(!statuses.iter().find(|s| s.key == "downloads_default").unwrap().movable);
        assert!(statuses.iter().find(|s| s.key == "config").unwrap().movable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn category_status_counts_db_companions() {
        let (svc, dir) = temp_storage("db-companions");
        let db = svc.paths().dir(st::StorageCategory::Database);
        std::fs::create_dir_all(db.parent().unwrap()).unwrap();
        std::fs::write(&db, [0u8; 7]).unwrap();
        let s = db.to_string_lossy().to_string();
        std::fs::write(format!("{s}-wal"), [0u8; 5]).unwrap();
        // 状态统计与复制口径一致：主库 + 既有 wal 均计入（事项 11c）。
        let statuses = category_statuses(&svc);
        let database = statuses.iter().find(|s| s.key == "database").unwrap();
        assert_eq!((database.bytes, database.files), (12, 2));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dir_usage_counts_a_file_and_recurses_a_directory() {
        let (_svc, dir) = temp_storage("usage");
        let file = dir.join("a.bin");
        std::fs::write(&file, [0u8; 7]).unwrap();
        assert_eq!(st::dir_usage_limited(&file), (7, 1));
        let nested = dir.join("nested");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("b.bin"), [0u8; 5]).unwrap();
        // `dir` also contains `a.bin` (7) + `nested/b.bin` (5) => 12 bytes / 2 files.
        assert_eq!(st::dir_usage_limited(&dir), (12, 2));
        assert_eq!(st::dir_usage_limited(&dir.join("missing")), (0, 0));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn downloads_default_reports_zero_usage_without_walking() {
        let (_svc, dir) = temp_storage("dl-usage");
        std::fs::write(dir.join("user-file.bin"), [0u8; 13]).unwrap();
        // 即使目录内有用户文件也不遍历：设置值路径恒为 0。
        assert_eq!(st::category_usage(st::StorageCategory::DownloadsDefault, &dir), (0, 0));
        // 其它分类仍正常统计，证明只是该分类被短路。
        assert_eq!(st::category_usage(st::StorageCategory::Config, &dir), (13, 1));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tree_cache_stats_empty_table_reports_zero() {
        let dir = tree_cache_tmp("stats-empty");
        let stats = tree_cache_stats_in(&dir).unwrap();
        assert_eq!(stats.workspace_count, 0);
        assert_eq!(stats.total_bytes, 0);
        assert!(stats.oldest_captured_at.is_none());
        assert!(stats.newest_captured_at.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tree_cache_options_default_and_roundtrip() {
        let dir = tree_cache_tmp("opts");
        let opts = tree_cache_options_in(&dir).unwrap();
        assert!(opts.enabled);
        assert_eq!(opts.ttl_minutes, 15);
        tree_cache_set_options_in(&dir, false, 60).unwrap();
        let opts = tree_cache_options_in(&dir).unwrap();
        assert!(!opts.enabled);
        assert_eq!(opts.ttl_minutes, 60);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tree_cache_set_options_rejects_out_of_range_ttl() {
        let dir = tree_cache_tmp("opts-bad");
        assert!(tree_cache_set_options_in(&dir, true, 0).is_err());
        assert!(tree_cache_set_options_in(&dir, true, 1441).is_err());
        // 边界值合法。
        tree_cache_set_options_in(&dir, true, 1).unwrap();
        tree_cache_set_options_in(&dir, true, 1440).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tree_cache_clear_empties_rows_but_keeps_options() {
        use adl_workspace::tree_cache_store::TreeCacheStore;
        let dir = tree_cache_tmp("clear");
        let store = TreeCacheStore::open(&dir).unwrap();
        store.put("/ws/a", r#"[{"path":"a.txt"}]"#, 1000).unwrap();
        store.put("/ws/b", r#"[{"path":"b.txt"}]"#, 2000).unwrap();
        tree_cache_set_options_in(&dir, false, 60).unwrap();
        tree_cache_clear_in(&dir).unwrap();
        let stats = tree_cache_stats_in(&dir).unwrap();
        assert_eq!(stats.workspace_count, 0);
        assert_eq!(stats.total_bytes, 0);
        assert!(stats.oldest_captured_at.is_none());
        assert!(stats.newest_captured_at.is_none());
        // 开关/TTL 是元数据，清除行不受影响。
        let opts = tree_cache_options_in(&dir).unwrap();
        assert!(!opts.enabled);
        assert_eq!(opts.ttl_minutes, 60);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn tree_cache_tmp(tag: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("adl-server-treecache-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Wire-format lock: the server DTO keys must stay camelCase and match the
    /// shell DTOs that Plan C Task 6 compares against.
    #[test]
    fn dtos_serialize_with_camel_case_keys() {
        let status = StorageStatus {
            mode: "unified".into(),
            root: "/r".into(),
            default_root: "/d".into(),
            categories: vec![],
            locator_path: "/l".into(),
            pending: Some(PendingDto { failed: false, error: None }),
            last_report: Some(StorageReportDto {
                at: 1,
                ok: true,
                switched: true,
                moved_files: 0,
                moved_bytes: 0,
                removed_dirs: vec![],
                kept_dirs: vec![KeptDirDto { path: "/k".into(), foreign_files: vec![] }],
                retained: false,
                error: None,
            }),
        };
        let v = serde_json::to_value(status).unwrap();
        assert!(v.get("locatorPath").is_some());
        assert!(v.get("defaultRoot").is_some());
        assert!(v.get("lastReport").is_some());
        assert!(v["lastReport"].get("keptDirs").is_some());
        assert!(v["lastReport"].get("movedFiles").is_some());

        let preflight = PreflightDto {
            ok: true,
            errors: vec![],
            warnings: vec![],
            total_files: 3,
            total_bytes: 9,
            free_bytes: 0,
        };
        let v = serde_json::to_value(preflight).unwrap();
        assert!(v.get("totalFiles").is_some());
        assert!(v.get("totalBytes").is_some());
        assert!(v.get("freeBytes").is_some());

        let apply = StorageApplyResult {
            restart_required: true,
            preflight: PreflightDto {
                ok: true,
                errors: vec![],
                warnings: vec![],
                total_files: 0,
                total_bytes: 0,
                free_bytes: 0,
            },
        };
        let v = serde_json::to_value(apply).unwrap();
        assert!(v.get("restartRequired").is_some());
        assert!(v.get("preflight").is_some());
    }
}
