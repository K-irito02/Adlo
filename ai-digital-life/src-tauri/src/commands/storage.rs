use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::storage as st;
use adl_types::IpcResult;
use adl_workspace::tree_cache_store::{
    TreeCacheOptions, TreeCacheStats, TreeCacheStore, validate_tree_cache_ttl,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, State};

/// 成功值包 `IpcResult` 信封（与 `download_*` 等命令的 `Ok(ipc(Ok(..)))` 同构的简写）。
fn ok_ipc<T>(value: T) -> Result<IpcResult<T>, AppError> {
    Ok(ipc(Ok(value)))
}

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
    /// Plan B 落地：指针是否已切换持久化（true 时即使 ok=false 也不得重跑迁移）。
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

#[tauri::command]
pub fn storage_get_status(
    state: State<'_, AppState>,
) -> Result<IpcResult<StorageStatus>, AppError> {
    let locator = st::load_locator();
    let svc = state.storage.clone();
    let status = StorageStatus {
        mode: match locator.selection.mode {
            st::StorageMode::Unified => "unified".into(),
            st::StorageMode::PerCategory => "per_category".into(),
        },
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
    ok_ipc(status)
}

#[tauri::command]
pub fn storage_scan_foreign_cmd(
    state: State<'_, AppState>,
) -> Result<IpcResult<Vec<ForeignScanDto>>, AppError> {
    ok_ipc(
        st::scan_foreign(state.storage.paths())
            .into_iter()
            .map(|f| ForeignScanDto {
                category: f.category.key().to_string(),
                root: f.root.to_string_lossy().to_string(),
                foreign_files: f.foreign_files,
            })
            .collect(),
    )
}

#[tauri::command]
pub fn storage_preflight_cmd(
    state: State<'_, AppState>,
    patch: StoragePathPatch,
) -> Result<IpcResult<PreflightDto>, AppError> {
    let selection = patch_to_selection(&patch)?;
    ok_ipc(preflight_inner(&state, &selection)?)
}

/// 预检核心（命令与内部调用共用，避免 `IpcResult` 解包/重包）。
/// 接收已解析的 `selection`，调用方只解析一次。
fn preflight_inner(
    state: &AppState,
    selection: &st::StorageSelection,
) -> Result<PreflightDto, AppError> {
    let defaults = state.storage_defaults.clone();
    let from = state.storage.paths().clone();
    let to = st::StoragePaths::resolve(selection, &defaults);
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
    let free_bytes = state.download_manager.available_space_bytes(&to.root).unwrap_or(0);
    if free_bytes > 0
        && report.total_bytes > 0
        && free_bytes < report.total_bytes + report.total_bytes / 10
    {
        errors.push(PreflightIssueDto {
            category: None,
            message: format!(
                "insufficient disk space on target: need ~{} bytes, free {} bytes",
                report.total_bytes + report.total_bytes / 10,
                free_bytes
            ),
        });
    }
    Ok(PreflightDto {
        ok: errors.is_empty(),
        errors,
        warnings,
        total_files: report.total_files as u64,
        total_bytes: report.total_bytes,
        free_bytes,
    })
}

// 可用空间经 `DownloadManager::available_space_bytes`（B3）获取，见 `storage_preflight_cmd`。

#[tauri::command]
pub fn storage_set_paths(
    state: State<'_, AppState>,
    patch: StoragePathPatch,
    apply_now: bool,
) -> Result<IpcResult<StorageApplyResult>, AppError> {
    let to = patch_to_selection(&patch)?;
    // 预检（含磁盘空间）；有硬错误则拒绝写入（直接调核心，不经 IpcResult 解包）。
    let preflight = preflight_inner(&state, &to)?;
    if !preflight.ok {
        return ok_ipc(StorageApplyResult { restart_required: false, preflight });
    }
    let mut locator = st::load_locator();
    locator.pending_migration = Some(st::PendingMigration {
        from: locator.selection.clone(),
        to,
        retain_source: patch.retain_source,
        requested_at: adl_types::now_ms(),
        failed: false,
        error: None,
    });
    st::save_locator(&locator)?;

    // 不在命令内重启：迁移在下次启动、DB 打开前执行。`restart_required` 告知前端
    // 是否应随即调用 `app_restart`。这样避免了「发散调用后返回」的不可达代码。
    ok_ipc(StorageApplyResult { restart_required: apply_now, preflight })
}

#[tauri::command]
pub fn storage_cancel_pending(_state: State<'_, AppState>) -> Result<IpcResult<()>, AppError> {
    let mut locator = st::load_locator();
    locator.pending_migration = None;
    st::save_locator(&locator)?;
    ok_ipc(())
}

/// TreeCache 落盘目录：与 `storage_get_status` 同源（`state.storage.paths()`，
/// 回落 `paths.root`——locator 无 root 时即 `defaults.root`，壳层为 `app_data_dir()`）。
/// 优先级：
/// 1. `ADL_TREE_CACHE_DIR` 绝对覆盖（测试注入/运维，与 L2 `tree_cache_dir()` 同口径；
///    运维覆盖需指向可写目录，此处不做包含校验——能设进程环境者与进程同权）；
/// 2. `paths.tree_cache_store_dir()`（`tree-cache.db` 父目录；相对路径回 None，防 CWD 漂移建库）；
/// 3. 绝对统一根；仍非绝对则 `InvalidInput` 拒绝建库（fail-loud：前端区段不渲染，
///    仅相对路径配置时触发，正常部署恒为绝对路径）。
///
/// stats 在此建空库与旧 `Some` 分支行为一致（`TreeCacheStore::open` 含建库；
/// options/clear 本就需建库写语义，故不做只读 open）。
fn tree_cache_dir_from_state(state: &AppState) -> Result<std::path::PathBuf, AppError> {
    if let Some(dir) = adl_workspace::tree_cache_dir_env_override() {
        return Ok(dir);
    }
    let paths = state.storage.paths();
    paths
        .tree_cache_store_dir()
        .or_else(|| paths.root.is_absolute().then(|| paths.root.clone()))
        .ok_or_else(|| AppError::InvalidInput("tree-cache directory is not absolute".to_string()))
}

/// 工作区树缓存统计（设置页展示用），与服务端 `POST /storage/tree-cache/stats` 同语义。
#[tauri::command]
pub fn storage_tree_cache_stats(
    state: State<'_, AppState>,
) -> Result<IpcResult<TreeCacheStats>, AppError> {
    // 与核心数据路径同一真源：不再走 `tree_cache_dir()`（壳层无 `--data-dir` 且
    // locator 缺 root 时回 None → 空表零值，与磁盘 3.8MB 文件不一致）。
    let dir = tree_cache_dir_from_state(&state)?;
    Ok(ipc(Ok(TreeCacheStore::open(&dir)?.stats()?)))
}

/// 工作区树缓存开关/TTL 写入（参数信封 `{ opts }`，与 `tauri-bridge` 的
/// `invokeIpc(…, { opts })` 对应）；`ttl_minutes` 越界报 `InvalidInput`。
#[tauri::command]
pub fn storage_tree_cache_options(
    state: State<'_, AppState>,
    opts: TreeCacheOptions,
) -> Result<IpcResult<()>, AppError> {
    validate_tree_cache_ttl(opts.ttl_minutes)?;
    let dir = tree_cache_dir_from_state(&state)?;
    TreeCacheStore::open(&dir)?.set_options(opts.enabled, opts.ttl_minutes)?;
    ok_ipc(())
}

/// 清除全部树缓存行（元数据开关/TTL 保留），与服务端 `POST /storage/tree-cache/clear` 同语义。
#[tauri::command]
pub fn storage_tree_cache_clear(state: State<'_, AppState>) -> Result<IpcResult<()>, AppError> {
    let dir = tree_cache_dir_from_state(&state)?;
    TreeCacheStore::open(&dir)?.clear()?;
    ok_ipc(())
}

/// 重启应用。前端在 `storage_set_paths` 返回 `restartRequired == true` 后调用。
/// 从不返回（进程重启），签名仍包 `IpcResult` 以与其它存储命令统一。
#[tauri::command]
pub fn app_restart(app: AppHandle) -> Result<IpcResult<()>, AppError> {
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_to_selection_unified_keeps_only_root() {
        let patch = StoragePathPatch {
            mode: "unified".into(),
            root: Some("D:/adl".into()),
            categories: std::collections::HashMap::new(),
            retain_source: false,
        };
        let sel = patch_to_selection(&patch).unwrap();
        assert_eq!(sel.mode, adl_kernel::storage::StorageMode::Unified);
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
        assert_eq!(sel.mode, adl_kernel::storage::StorageMode::PerCategory);
        assert_eq!(
            sel.categories.get(&adl_kernel::storage::StorageCategory::Clipboard),
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

    #[test]
    fn downloads_default_reports_zero_usage_without_walking() {
        let dir =
            std::env::temp_dir().join(format!("adl-shell-storage-usage-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("user-file.bin"), [0u8; 13]).unwrap();
        // 即使目录内有用户文件也不遍历：设置值路径恒为 0。
        assert_eq!(
            st::category_usage(adl_kernel::storage::StorageCategory::DownloadsDefault, &dir),
            (0, 0)
        );
        // 其它分类仍正常统计，证明只是该分类被短路。
        assert_eq!(st::category_usage(adl_kernel::storage::StorageCategory::Config, &dir), (13, 1));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
