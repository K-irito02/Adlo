# 存储路径设置：Plan C —— IPC、三端桥接与「存储」设置界面 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在右侧面板-设置面板的「存储」组中查看/自定义全部 10 类数据路径（统一根目录或每类独立），选择迁移时机（立即重启 / 下次启动），可选保留旧数据，看到预检/进度/报告/外部文件与不可移项的详细友好提示；双端（Tauri / 浏览器）行为一致。

**Architecture:** 壳层新增 `storage_*` Tauri 命令（读 locator、写 pendingMigration、预检含磁盘空间、触发重启）；adl-server 新增同名 HTTP 路由（复用 kernel 的 `scan_foreign`/`preflight`）；前端新增 `StorageBridge` 域并在 `tauri-bridge` / `preview-bridge` / `httpBridge` / `mock-bridge` 四端实现；设置面板新增 `StorageSettings` 自定义组件（仿 `TerminalSettings` 的按组定制模式）。迁移执行本身在 Plan B，本计划只负责「写 pending + 触发重启」与展示。

**Tech Stack:** Rust + Tauri 2.x（`#[tauri::command]`、`tauri-plugin-process`）、axum（adl-server）、React 19 + Zustand + `@testing-library/react` + vitest、i18n（`TCopyContext` / `CopyDict`）。

**Spec:** `docs/superpowers/specs/2026-09-14-storage-path-settings-design.md`

**前置：** Plan A（接入）与 Plan B（迁移引擎）必须已完成。

## Global Constraints

- **双端一致**：新增 IPC 必须在 `tauri-bridge` / `preview-bridge` / `mock-bridge` 三端（加 `httpBridge` 共四端）同步实现；不得只在单一模式可用。
- **i18n 强制**：任何 UI 文案（含 Tooltip/aria-label/占位符）必须走 i18n key，禁止硬编码；中英必须对齐（`i18n/__tests__/keys.test.ts` 自动校验）。
- **每类必须有详细友好说明 + 关联功能提示**（spec §6.4），10 类一个都不能少。
- **不可移动项必须全部列出**并附原因说明（keyring、机器身份、localStorage、IndexedDB、WebView2、工作区缓存）。
- **不常驻空提示**：横幅/报告仅在活跃状态下可见。
- 新增 Tauri 命令必须登记到 `src-tauri/permissions/digital-life.toml`，禁止通配权限。
- 命令返回 `Result<T, AppError>` 结构化错误（现有 `IpcResult` 封装）。
- 前端质量门：`pnpm --dir frontend run lint`、`pnpm --dir frontend run typecheck`、`pnpm --dir frontend run test` 全绿。

---

### Task 1: Rust 存储 DTO 与壳层命令

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/storage.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/main.rs:113-177`（注册命令）
- Modify: `ai-digital-life/src-tauri/permissions/digital-life.toml`
- Modify: `ai-digital-life/src-tauri/Cargo.toml`（新增 `tauri-plugin-process`）

**Interfaces:**
- Consumes: `adl_kernel::storage::{StorageService, StorageLocator, StorageDefaults, load_locator, save_locator, scan_foreign, preflight, MigrationReport, PendingMigration, StorageCategory}`
- Produces（命令，全部返回 `Result<T, AppError>`）：
  - `storage_get_status(state: State<AppState>) -> StorageStatus`
  - `storage_scan_foreign_cmd(state: State<AppState>) -> Vec<ForeignScanDto>`
  - `storage_preflight_cmd(state: State<AppState>, patch: StoragePathPatch) -> PreflightDto`
  - `storage_set_paths(state: State<AppState>, patch: StoragePathPatch, apply_now: bool) -> StorageApplyResult`
  - `storage_cancel_pending(state: State<AppState>) -> ()`
  - `app_restart(app: AppHandle) -> ()`（前端在 `restartRequired == true` 时单独调用）

- [ ] **Step 1: 写失败测试（patch → selection 转换 + 状态组装）**

创建 `ai-digital-life/src-tauri/src/commands/storage.rs`，先写测试：

```rust
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
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p ai-digital-life --lib commands::storage -v`
Expected: FAIL（模块/函数未定义；包名以 `cargo metadata --no-deps --format-version 1` 查得为准）

- [ ] **Step 3: 实现 DTO 与转换**

在 `storage.rs` 的测试模块前插入：

```rust
use adl_kernel::storage as st;
use crate::error::AppError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};

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
    pub categories: Vec<StorageCategoryStatus>,
    pub locator_path: String,
    pub pending: Option<PendingDto>,
    pub last_report: Option<StorageReportDto>,
}

#[derive(Debug, Deserialize)]
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightDto {
    pub ok: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
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
```

> `AppError`：本项目 crate 的 error 类型（见 `src-tauri/src/error.rs`）。若其变体名不同（如 `AppError::Validation`），按实际命名调整；这是壳层统一的命令错误类型。

- [ ] **Step 4: 实现命令**

在 `storage.rs` 追加：

```rust
fn category_statuses(svc: &st::StorageService) -> Vec<StorageCategoryStatus> {
    let paths = svc.paths();
    let foreign = st::scan_foreign(paths);
    let foreign_for = |c: st::StorageCategory| -> Vec<String> {
        foreign.iter().find(|f| f.category == c).map(|f| f.foreign_files.clone()).unwrap_or_default()
    };
    st::StorageCategory::ALL
        .into_iter()
        .map(|c| {
            let path = svc.paths().dir(c);
            let (bytes, files) = dir_usage(&path);
            StorageCategoryStatus {
                key: c.key().to_string(),
                path: path.to_string_lossy().to_string(),
                movable: !matches!(c, st::StorageCategory::DownloadsDefault),
                exists: path.exists(),
                bytes,
                files,
                foreign_files: foreign_for(c),
            }
        })
        .collect()
}

fn dir_usage(path: &std::path::Path) -> (u64, u64) {
    if path.is_file() {
        let len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        return (len, 1);
    }
    if !path.is_dir() {
        return (0, 0);
    }
    let mut bytes = 0u64;
    let mut files = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                match entry.file_type() {
                    Ok(ft) if ft.is_dir() => stack.push(p),
                    Ok(ft) if ft.is_file() => {
                        bytes += std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                        files += 1;
                    },
                    _ => {},
                }
            }
        }
    }
    (bytes, files)
}

fn report_dto(r: &st::MigrationReport) -> StorageReportDto {
    StorageReportDto {
        at: r.at,
        ok: r.ok,
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
pub fn storage_get_status(state: State<'_, AppState>) -> Result<StorageStatus, AppError> {
    let locator = st::load_locator();
    let svc = state.storage.clone();
    Ok(StorageStatus {
        mode: match locator.selection.mode {
            st::StorageMode::Unified => "unified".into(),
            st::StorageMode::PerCategory => "per_category".into(),
        },
        root: svc.paths().root.to_string_lossy().to_string(),
        categories: category_statuses(&svc),
        locator_path: st::locator::locator_path().to_string_lossy().to_string(),
        pending: locator
            .pending_migration
            .as_ref()
            .map(|p| PendingDto { failed: p.failed, error: p.error.clone() }),
        last_report: locator.last_report.as_ref().map(report_dto),
    })
}

#[tauri::command]
pub fn storage_scan_foreign_cmd(state: State<'_, AppState>) -> Result<Vec<ForeignScanDto>, AppError> {
    Ok(st::scan_foreign(state.storage.paths())
        .into_iter()
        .map(|f| ForeignScanDto {
            category: f.category.key().to_string(),
            root: f.root.to_string_lossy().to_string(),
            foreign_files: f.foreign_files,
        })
        .collect())
}

#[tauri::command]
pub fn storage_preflight_cmd(
    state: State<'_, AppState>,
    patch: StoragePathPatch,
) -> Result<PreflightDto, AppError> {
    let selection = patch_to_selection(&patch)?;
    let defaults = state.storage_defaults.clone();
    let from = state.storage.paths().clone();
    let to = st::StoragePaths::resolve(&selection, &defaults);
    let report = st::preflight(&from, &to);
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for issue in &report.issues {
        match issue.severity {
            st::Severity::Error => errors.push(issue.message.clone()),
            st::Severity::Warning => warnings.push(issue.message.clone()),
        }
    }
    let free_bytes = free_space_for(&to.root);
    if free_bytes > 0 && report.total_bytes > 0 && free_bytes < report.total_bytes + report.total_bytes / 10 {
        errors.push(format!(
            "insufficient disk space on target: need ~{} bytes, free {} bytes",
            report.total_bytes + report.total_bytes / 10,
            free_bytes
        ));
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

/// 目标根所在盘的可用字节（0 = 未知）。
fn free_space_for(root: &std::path::Path) -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_disks_list();
    let canon = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    sys.disks()
        .iter()
        .filter(|d| canon.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().components().count())
        .map(|d| d.available_space())
        .unwrap_or(0)
}

#[tauri::command]
pub fn storage_set_paths(
    state: State<'_, AppState>,
    patch: StoragePathPatch,
    apply_now: bool,
) -> Result<StorageApplyResult, AppError> {
    let to = patch_to_selection(&patch)?;
    // 预检（含磁盘空间）；有硬错误则拒绝写入。
    let preflight = storage_preflight_cmd(state.clone(), patch.clone())?;
    if !preflight.ok {
        return Ok(StorageApplyResult { restart_required: false, preflight });
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
    Ok(StorageApplyResult { restart_required: apply_now, preflight })
}

#[tauri::command]
pub fn storage_cancel_pending(state: State<'_, AppState>) -> Result<(), AppError> {
    let _ = &state;
    let mut locator = st::load_locator();
    locator.pending_migration = None;
    st::save_locator(&locator)?;
    Ok(())
}

/// 重启应用。前端在 `storage_set_paths` 返回 `restartRequired == true` 后调用。
#[tauri::command]
pub fn app_restart(app: AppHandle) -> Result<(), AppError> {
    app.restart();
    #[allow(unreachable_code)]
    Ok(())
}
```

> `app.restart()` 的具体签名依 Tauri 版本：若返回 `!`（发散），函数体在其后为不可达，用 `#[allow(unreachable_code)]`；若返回 `()`，则正常返回。前提是已启用 `tauri-plugin-process`（Task 1 Step 5）。前端流程为：`setPaths(patch, true)` → 展示 toast → `restartApp()`（Tauri）/ `/storage/restart-backend`（浏览器）。

- [ ] **Step 5: 注册模块、命令与权限、AppState 字段**

- `src-tauri/src/commands/mod.rs` 追加 `pub mod storage;`
- `main.rs` 的 `invoke_handler` 列表追加：

```rust
            commands::storage::storage_get_status,
            commands::storage::storage_scan_foreign_cmd,
            commands::storage::storage_preflight_cmd,
            commands::storage::storage_set_paths,
            commands::storage::storage_cancel_pending,
            commands::storage::app_restart,
```

- `src-tauri/permissions/digital-life.toml` 追加（格式照该文件现有条目）：

```toml
[[permission]]
identifier = "allow-storage-commands"
description = "Allow storage path status/preflight/apply/cancel and app restart"
commands.allow = [
  "storage_get_status",
  "storage_scan_foreign_cmd",
  "storage_preflight_cmd",
  "storage_set_paths",
  "storage_cancel_pending",
  "app_restart",
]
```

（若该文件采用 `[permission]` 单条 + `commands.allow` 的既有写法，则把上述命令**追加**到现有 `commands.allow` 数组，而不是新建 permission。）
- `AppState`（`state.rs`）追加字段 `pub storage_defaults: adl_kernel::storage::StorageDefaults,`；`setup.rs::init_app_state` 接收 `defaults` 并存入。`main.rs` 的 `resolve_defaults` 结果需克隆一份传入（`resolve_data_dir` 已算过 defaults，建议把 `resolve_defaults` 的结果作为参数传给 `init_app_state`，避免重复计算）。
- `src-tauri/Cargo.toml` 追加 `sysinfo.workspace = true` 与 `tauri-plugin-process = "2"`；`main.rs` 加 `.plugin(tauri_plugin_process::init())`。

- [ ] **Step 6: 运行编译与测试**

Run: `cargo build -p ai-digital-life && cargo test -p ai-digital-life --lib commands::storage -v`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/src-tauri
git commit -m "feat(storage): add shell commands for storage status, preflight and apply"
```

---

### Task 2: adl-server 存储路由 + httpBridge

**Files:**
- Create: `ai-digital-life/crates/server/src/handlers/storage.rs`
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs`
- Modify: `ai-digital-life/crates/server/src/router.rs`（追加路由）
- Modify: `ai-digital-life/frontend/dev/previewWorkspaceService/index.ts`（重启后端端点，浏览器模式「立即迁移」用）

**Interfaces:**
- Consumes: `adl_kernel::storage::{scan_foreign, preflight, load_locator, save_locator, StoragePaths, PendingMigration}`
- Produces（HTTP，返回 `IpcResult<T>` 线格式，与 `reference.rs` 同构）：
  - `POST /storage/status` → `StorageStatus`（同 Task 1 DTO，字段名 camelCase）
  - `POST /storage/scan-foreign` → `Vec<ForeignScanDto>`
  - `POST /storage/preflight` → `PreflightDto`
  - `POST /storage/set-paths` → `StorageApplyResult`（`restartRequired` 恒为 `false`，由前端提示重启）
  - `POST /storage/cancel-pending` → `()`
  - `POST /storage/restart-backend` → `()`（委托 dev 中间层重启 adl-server 子进程；生产 Tauri 模式不使用）

- [ ] **Step 1: 写失败测试**

创建 `crates/server/src/handlers/storage.rs` 含测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_string_round_trips() {
        assert_eq!(mode_to_str(adl_kernel::storage::StorageMode::Unified), "unified");
        assert_eq!(mode_to_str(adl_kernel::storage::StorageMode::PerCategory), "per_category");
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-server --lib handlers::storage -v`
Expected: FAIL

- [ ] **Step 3: 实现 handler（复用 `ipc::json_body` / `ipc::to_response`）**

按 `crates/server/src/handlers/reference.rs` 的写法实现（`DataDirBody` 模式改为从 `State<ServerState>` 取 `storage`）；`mode_to_str`、`patch_to_selection`、`category_statuses`、`dir_usage`、`report_dto` 与 Task 1 同构（可提取为 `crates/server/src/handlers/storage.rs` 内的私有函数；两处实现一致的 DTO 字段名由 §11 双端测试保证）。

```rust
pub fn mode_to_str(mode: adl_kernel::storage::StorageMode) -> &'static str {
    match mode {
        adl_kernel::storage::StorageMode::Unified => "unified",
        adl_kernel::storage::StorageMode::PerCategory => "per_category",
    }
}
```

在 `router.rs` 的 storage 域名下追加：

```rust
        // Storage domain
        .route("/storage/status", post(handlers::storage::status))
        .route("/storage/scan-foreign", post(handlers::storage::scan_foreign))
        .route("/storage/preflight", post(handlers::storage::preflight))
        .route("/storage/set-paths", post(handlers::storage::set_paths))
        .route("/storage/cancel-pending", post(handlers::storage::cancel_pending))
```

并在 `handlers/mod.rs` 追加 `pub mod storage;`。

- [ ] **Step 4: 浏览器模式「立即迁移」**

在 `frontend/dev/previewWorkspaceService/index.ts` 追加中间层路由（仿现有 `/workspace/pick-directory` 等）：`POST /storage/restart-backend` → 终止并重新 spawn adl-server 子进程（复用 `ad-server-launch.mjs` 的启动逻辑）。若当前 dev 中间层无法安全重启，则退化为：返回 `{ ok: true, data: { restarted: false } }`，前端据此提示「请重启预览服务以完成迁移」。

- [ ] **Step 5: 运行测试与提交**

Run: `cargo test -p adl-server --lib handlers::storage -v && pnpm --dir frontend run typecheck`
Expected: PASS

```bash
git add ai-digital-life/crates/server/src ai-digital-life/frontend/dev
git commit -m "feat(storage): expose storage status/preflight/apply routes on adl-server"
```

---

### Task 3: 前端桥接（类型 + 四端实现）

**Files:**
- Create: `ai-digital-life/frontend/src/shared/ipc/storage.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/digital-life.ts`（`DigitalLifeBridge` 加 `storage`）
- Modify: `ai-digital-life/frontend/src/httpBridge.ts`（`createHttpBridge` 加 `storage` 域，fetch 后端路由）
- Modify: `ai-digital-life/frontend/src/tauri-bridge/index.ts`（`storage` 用 invoke 调 Task 1 命令）
- Modify: `ai-digital-life/frontend/src/preview-bridge/index.ts`（`storage` 走 httpBridge，`applyNow` 调 `/storage/restart-backend`）
- Create: `ai-digital-life/frontend/src/mock/mock-storage.ts`
- Modify: `ai-digital-life/frontend/src/mock-bridge.ts`（挂载 `storage: mockStorage`）

**Interfaces:**
- Produces:

```ts
// shared/ipc/storage.ts
import type { IpcResult } from '@ai-digital-life/kernel';

export type StorageMode = 'unified' | 'per_category';

export interface StorageCategoryStatus {
  key: string;
  path: string;
  movable: boolean;
  exists: boolean;
  bytes: number;
  files: number;
  foreignFiles: string[];
}
export interface KeptDir { path: string; foreignFiles: string[] }
export interface StorageReport {
  at: number; ok: boolean; movedFiles: number; movedBytes: number;
  removedDirs: string[]; keptDirs: KeptDir[]; retained: boolean; error: string | null;
}
export interface StoragePending { failed: boolean; error: string | null }
export interface StorageStatus {
  mode: StorageMode;
  root: string;
  categories: StorageCategoryStatus[];
  locatorPath: string;
  pending: StoragePending | null;
  lastReport: StorageReport | null;
}
export interface StoragePathPatch {
  mode: StorageMode;
  root?: string | null;
  categories: Record<string, string>;
  retainSource: boolean;
}
export interface StorageForeignScan { category: string; root: string; foreignFiles: string[] }
export interface StoragePreflight {
  ok: boolean; errors: string[]; warnings: string[];
  totalFiles: number; totalBytes: number; freeBytes: number;
}
export interface StorageApplyResult { restartRequired: boolean; preflight: StoragePreflight; restarted?: boolean }

export interface StorageBridge {
  getStatus(): Promise<IpcResult<StorageStatus>>;
  scanForeign(): Promise<IpcResult<StorageForeignScan[]>>;
  preflight(patch: StoragePathPatch): Promise<IpcResult<StoragePreflight>>;
  setPaths(patch: StoragePathPatch, applyNow: boolean): Promise<IpcResult<StorageApplyResult>>;
  cancelPending(): Promise<IpcResult<void>>;
  restartApp(): Promise<IpcResult<void>>;
}

/** 10 个分类 key，顺序与 Rust `StorageCategory::key` / `StorageCategory::ALL` 一致。 */
export const STORAGE_CATEGORY_KEYS = [
  'database', 'downloads_db', 'site_meta_db', 'config', 'clipboard',
  'snapshot', 'dsh', 'logs', 'credentials_fallback', 'downloads_default',
] as const;

/** 不可移动项 key，顺序固定（组件与测试共用）。 */
export const IMMOVABLE_ENTRY_KEYS = [
  'keyring', 'machineId', 'localStorage', 'indexedDB', 'webview2', 'workspaceCache',
] as const;
```

- [ ] **Step 1: 写失败测试（mock 行为）**

创建 `frontend/src/mock/mock-storage.test.ts`（与实现同目录）：

```ts
import { describe, it, expect } from 'vitest';
import { createMockStorage } from './mock-storage';
import { IMMOVABLE_ENTRY_KEYS } from '../shared/ipc/storage';

describe('mock-storage', () => {
  it('exposes all 10 categories', async () => {
    const s = createMockStorage();
    const res = await s.getStatus();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.categories).toHaveLength(10);
  });

  it('setPaths stores a pending migration', async () => {
    const s = createMockStorage();
    await s.setPaths(
      { mode: 'unified', root: 'D:/adl', categories: {}, retainSource: false },
      false,
    );
    const res = await s.getStatus();
    if (res.ok) expect(res.data.pending).not.toBeNull();
  });

  it('lists the six immovable keys', () => {
    expect(IMMOVABLE_ENTRY_KEYS).toEqual([
      'keyring', 'machineId', 'localStorage', 'indexedDB', 'webview2', 'workspaceCache',
    ]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir ai-digital-life/frontend run test mock-storage`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 mock + 类型 + 四端桥接**

- `shared/ipc/storage.ts`：按上表写类型。
- `mock/mock-storage.ts`：内存实现，`getStatus` 返回 10 类（key 用 `StorageCategory::key` 的同一组字符串 + 一个可配置 root 与 mode），`setPaths` 写内存 pending，`cancelPending` 清空，`preflight` 返回 `ok: true`，`restartApp` no-op；导出 `MOCK_IMMOVABLE_KEYS`（6 项，顺序如上）。
- `httpBridge.ts`：新增 `storage` 域，映射到 Task 2 路由（`POST /storage/status` 等），`restartApp` 映射 `/storage/restart-backend`，返回 `IpcResult`。
- `tauri-bridge/index.ts`：`storage: { getStatus: invokeIpc('storage_get_status'), scanForeign: invokeIpc('storage_scan_foreign_cmd'), preflight: (p) => invokeIpc('storage_preflight_cmd', { patch: p }), setPaths: (p, now) => invokeIpc('storage_set_paths', { patch: p, applyNow: now }), cancelPending: invokeIpc('storage_cancel_pending'), restartApp: invokeIpc('app_restart') }`。
- `preview-bridge/index.ts`：`storage: preferHttpWhenReachable<StorageBridge>(adlServerBaseUrl, http.storage, mockDigitalLifeBridge.storage)`。
- `mock-bridge.ts`：`storage: createMockStorage(),`。
- `digital-life.ts`：`import type { StorageBridge } from './storage';` 并在 `DigitalLifeBridge` 内加 `storage: StorageBridge;`。

- [ ] **Step 4: 运行测试与类型检查**

Run: `pnpm --dir ai-digital-life/frontend run test mock-storage && pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src
git commit -m "feat(storage): add storage bridge across http/tauri/preview/mock"
```

---

### Task 4: i18n 文案（中英对齐）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/settings.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/settings.ts`

**Interfaces:**
- Produces: `CopyDict` 新增约 50 个 `storage*` key（中英一一对应，`keys.test.ts` 自动校验）。

- [ ] **Step 1: 写失败测试**

`i18n/__tests__/keys.test.ts` 已实现中英 key 奇偶校验 —— 只加中文或只加英文即失败。无需新写测试；本 Task 以该测试作为红绿驱动。

- [ ] **Step 2: 运行确认失败**

在 `zh-CN/settings.ts` 只加 `storageTitle`、`en-US/settings.ts` 不加，运行：
Run: `pnpm --dir ai-digital-life/frontend run test i18n`
Expected: FAIL（中英 key 数量不一致）

- [ ] **Step 3: 添加全部 key（中英同时）**

`zh-CN/settings.ts` 追加（`en-US/settings.ts` 对应英文）：

| key | zh-CN | en-US |
|---|---|---|
| `storageTitle` | 存储 | Storage |
| `storageModeLabel` | 路径模式 | Path mode |
| `storageModeUnified` | 统一根目录（默认） | Unified root (default) |
| `storageModePerCategory` | 每类完全独立 | Per-category |
| `storageRootLabel` | 数据根目录 | Data root |
| `storagePickDir` | 选择目录 | Choose folder |
| `storageManualInput` | 手动输入 | Enter manually |
| `storageManualInputPlaceholder` | 输入绝对路径… | Enter an absolute path… |
| `storageApply` | 应用 | Apply |
| `storageCancel` | 取消 | Cancel |
| `storageCategoryGroupCore` | 核心数据 | Core data |
| `storageCategoryGroupAdvanced` | 高级 | Advanced |
| `storageUsed` | 已用 {size}（{files} 个文件） | {size} used ({files} files) |
| `storageNotCreated` | 尚未创建 | Not created yet |
| `storageForeignFiles` | 检测到 {count} 个不属于本应用的文件，将保留 | {count} file(s) not created by this app will be kept |
| `storageLocatorTitle` | 数据位置索引 | Data location index |
| `storageLocatorHint` | 此文件记录数据位置，请勿删除；删除后应用将回退到默认目录 | This file records where your data lives; do not delete it, or the app will fall back to the default folder |
| `storagePendingBanner` | 已安排下次启动迁移 | Migration scheduled for next launch |
| `storagePendingFailedBanner` | 上次迁移失败：{error}（旧数据完好） | Last migration failed: {error} (old data is intact) |
| `storageRetryMigration` | 重试 | Retry |
| `storageCancelPending` | 取消待迁移 | Cancel pending migration |
| `storageMigrateDialogTitle` | 迁移数据 | Migrate data |
| `storageMigrateDialogSummary` | 将迁移 {files} 个文件（约 {size}）到新位置 | Will move {files} file(s) (~{size}) to the new location |
| `storageMigrateNow` | 立即迁移并重启 | Migrate now and restart |
| `storageMigrateLater` | 下次启动时迁移 | Migrate on next launch |
| `storageRetainSource` | 迁移后保留旧路径数据（不删除） | Keep old files after migration (do not delete) |
| `storagePreflightErrors` | 无法迁移： | Cannot migrate: |
| `storagePreflightWarnings` | 注意： | Note: |
| `storageReportTitle` | 上次迁移报告 | Last migration report |
| `storageReportOk` | 已迁移 {files} 个文件（{size}） | Migrated {files} file(s) ({size}) |
| `storageReportDirsRemoved` | 已删除旧目录 {count} 个 | Removed {count} old folder(s) |
| `storageReportDirsKept` | 保留旧目录 {count} 个（含外部文件） | Kept {count} old folder(s) (contain external files) |
| `storageReportRetained` | 已按设置保留旧数据 | Old files kept as configured |
| `storageReportFailed` | 迁移失败：{error} | Migration failed: {error} |
| `storageImmutableTitle` | 不可移动（由系统或运行时管理） | Not movable (managed by the OS or runtime) |
| `storageImmutableKeyring` | 凭据由操作系统凭据管理器安全保管，位置由系统决定，无需也无法自定义。 | Credentials are kept in the OS credential manager; the location is fixed by the system. |
| `storageImmutableMachineId` | 该文件用于派生凭据加密密钥；若移动，已保存的凭据将无法解密，因此不可移动。 | This file derives the credential encryption key; moving it would make saved credentials undecryptable. |
| `storageImmutableLocalStorage` | 由 WebView 按站点隔离存储，随应用整体管理，无独立路径。 | Stored per-origin by the WebView; managed with the app, no separate path. |
| `storageImmutableIndexedDb` | 头像缓存位于浏览器的 IndexedDB，随应用整体管理，无独立路径。 | Avatar cache lives in the browser IndexedDB; managed with the app, no separate path. |
| `storageImmutableWebview2` | 由 WebView2 运行时自管，修改需重建整个浏览器环境。 | Managed by the WebView2 runtime; changing it requires rebuilding the whole browser environment. |
| `storageImmutableWorkspaceCache` | 属于具体工作区，随工作区目录移动，不属于应用数据目录。 | Belongs to a specific workspace and moves with it; not part of the app data folder. |
| `storageRestartRequired` | 已保存。请重启应用以完成迁移。 | Saved. Restart the app to complete the migration. |
| `storageTerminalBudgetTitle` | 终端历史磁盘预算 | Terminal history disk budget |
| `storageBrowserDownloadTitle` | 浏览器默认下载路径 | Browser default download folder |
| `storagePickFailed` | 选择目录失败：{error} | Failed to choose folder: {error} |

**10 类分类名称 + 描述 + 关联功能**（spec §6.4，逐类必须齐全）：

| key 前缀 | zh-CN 名称 | en-US 名称 |
|---|---|---|
| `storageCategoryDatabase` | 主业务库 | Main database |
| `storageCategoryDownloadsDb` | 下载历史库 | Download history DB |
| `storageCategorySiteMetaDb` | 站点元缓存库 | Site metadata cache |
| `storageCategoryConfig` | 应用配置 | App configuration |
| `storageCategoryClipboard` | 剪贴板资源 | Clipboard assets |
| `storageCategorySnapshot` | 项目快照 | Project snapshots |
| `storageCategoryDsh` | DSH 版本与包 | DSH versions & bundles |
| `storageCategoryLogs` | 日志 | Logs |
| `storageCategoryCredentialsFallback` | 凭据回退文件 | Credential fallback files |
| `storageCategoryDownloadsDefault` | 默认下载目标 | Default download folder |

每类再各自补两个 key：`<前缀>Desc`（存了什么）与 `<前缀>Related`（与什么有关）。内容取自 spec §6.4 表格，例如：

- `storageCategoryDatabaseDesc`（zh）：`应用的核心数据库，保存工作区、会话、任务、审批、补丁与回滚、终端只读历史、剪贴板元数据、Git 可视化缓存等。`
- `storageCategoryDatabaseRelated`（zh）：`与工作区导航、会话面板、终端历史区、剪贴板历史、Git 可视化等有关。`
- 依此格式补全其余 9 类（英文对应翻译）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir ai-digital-life/frontend run test i18n`
Expected: PASS（中英 key 一致 + 领域抽查通过）

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/app/i18n
git commit -m "feat(i18n): add storage settings copy for zh-CN and en-US"
```

---

### Task 5: 「存储」设置组 UI

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/storage-settings/StorageSettings.tsx`
- Create: `ai-digital-life/frontend/src/app/features/storage-settings/StorageCategoryRow.tsx`
- Create: `ai-digital-life/frontend/src/app/features/storage-settings/StorageMigrateDialog.tsx`
- Modify: `ai-digital-life/frontend/src/kernel/types.ts`（`SettingsGroupId` 加 `'storage'`）
- Modify: `ai-digital-life/frontend/src/app/components/settings/SettingsNav.tsx`（`GROUPS` 加 storage）
- Modify: `ai-digital-life/frontend/src/app/components/settings/SettingsPanel.tsx`（`SETTINGS_COMPONENTS` 注册 storage）
- Modify: `ai-digital-life/frontend/src/app/features/terminal-settings/TerminalSettings.tsx`（移除「磁盘预算」区块）
- Modify: `ai-digital-life/frontend/src/app/features/browser-settings/BrowserDownloadSettings.tsx`（移除「默认下载路径」区块）

**Interfaces:**
- Consumes: `window.digitalLife.storage`（Task 3）、`useTCopy()`、`useAppStore`（`showToast`）
- Produces: `<StorageSettings />` 无 props 组件

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/features/storage-settings/StorageSettings.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StorageSettings } from './StorageSettings';

const status = {
  mode: 'unified' as const,
  root: 'C:/Users/u/AppData/Roaming/app',
  locatorPath: 'C:/Users/u/AppData/Roaming/ai-digital-life/storage-locator.json',
  categories: Array.from({ length: 10 }, (_, i) => ({
    key: `c${i}`,
    path: `C:/data/c${i}`,
    movable: true,
    exists: true,
    bytes: 1024,
    files: 2,
    foreignFiles: [],
  })),
  pending: null,
  lastReport: null,
};

beforeEach(() => {
  (window as any).digitalLife = {
    storage: {
      getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
      scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      preflight: vi.fn(),
      setPaths: vi.fn(),
      cancelPending: vi.fn(),
      restartApp: vi.fn(),
    },
  };
});

describe('StorageSettings', () => {
  it('renders all 10 category rows with a description tooltip trigger', async () => {
    render(<StorageSettings />);
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 每类都必须有说明（spec §6.4 硬性要求）
    expect(screen.getAllByTestId('storage-category-info')).toHaveLength(10);
  });

  it('lists the six immovable entries', async () => {
    render(<StorageSettings />);
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-immutable-item')).toHaveLength(6);
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir ai-digital-life/frontend run test StorageSettings`
Expected: FAIL

- [ ] **Step 3: 实现 `StorageCategoryRow.tsx`（单行：路径只读 + 选择 + 手输 + 占用 + ⓘ 说明）**

要点（样式类沿用 `adl-settings-*`）：
- 行容器 `data-testid="storage-category-row"`；名称后 ⓘ 按钮 `data-testid="storage-category-info"`，其 `aria-label`/`title` 用 `<前缀>Desc`，`TooltipSimple` 内容为 `<前缀>Desc` + `<前缀>Related`（两段，后者以「与…有关」句式）。
- 路径只读展示 + `[选择目录]`（Tauri 走 `workspace.pickDirectory()`，浏览器走手输框）+ 手输 input（`storageManualInputPlaceholder`，失焦提交）。
- 占用显示 `storageUsed` 插值（默认 `bytes` 用 `formatBytes`，`files` 数字）；不存在显示 `storageNotCreated`。
- `foreignFiles.length > 0` 时行内显示 `storageForeignFiles` 提示。
- 无硬编码文案：所有 `t.<key>`。

- [ ] **Step 4: 实现 `StorageMigrateDialog.tsx`（时机选择 + 保留旧数据 + 预检展示）**

- 标题 `storageMigrateDialogTitle`；摘要 `storageMigrateDialogSummary`（插值 files/size）。
- 预检错误/警告分区展示（`storagePreflightErrors` / `storagePreflightWarnings`），有错误时禁用两个迁移按钮。
- 勾选框 `storageRetainSource` → `patch.retainSource`。
- 两个主按钮：`storageMigrateNow`（`setPaths(patch, true)`）与 `storageMigrateLater`（`setPaths(patch, false)`）；`storageCancel` 关闭。
- 成功与否用 `showToast` 提示；`applyNow` 后若返回 `restartRequired` 则提示 `storageRestartRequired`。

- [ ] **Step 5: 实现 `StorageSettings.tsx`（组装）**

结构（对应 spec §6.1）：

```
StorageSettings
├── 模式切换（storageModeUnified / storageModePerCategory）  ← 本地 state，切换时重建 patch
├── 统一模式：根目录行（只读 + 选择 + 手输）
├── 每类独立模式：核心数据组（5 类）/ 高级组（5 类），各 StorageCategoryRow
├── 存储引擎（搬入项）：终端历史磁盘预算、浏览器默认下载路径
├── 索引文件（只读）：storageLocatorTitle + locatorPath + ⓘ storageLocatorHint
├── 不可移动：6 项（storageImmutable*），每项 data-testid="storage-immutable-item"
├── 待迁移横幅（pending != null）：storagePendingBanner / storagePendingFailedBanner + 取消按钮
└── 迁移报告（lastReport != null）：storageReportTitle + storageReportOk/DirsRemoved/DirsKept/Retained/Failed
```

行为：
- 挂载时 `storage.getStatus()` 填充；`apply` 前先 `storage.preflight(patch)`，通过后打开 `StorageMigrateDialog`。
- 模式切换时：切到 unified 清空 `categories`；切到 per_category 用 status 现有路径预填。
- 搬入项：终端历史磁盘预算复用 `settingsTerminalHistoryBudget*` 的现有逻辑（从 `TerminalSettings` 迁移过来，改为在该组件内渲染），浏览器默认下载路径复用 `BrowserDownloadSettings` 的 `default_path` 逻辑；两处旧组件中删除对应区块。
- 「数据位置索引」只读，含 ⓘ `storageLocatorHint`。
- 不可移动 6 项：keyring / machineId / localStorage / indexedDB / webview2 / workspaceCache（顺序固定，遍历 `IMMOVABLE_ENTRY_KEYS` 并映射 `storageImmutable<Key>` i18n key）。

- [ ] **Step 6: 注册组与导航**

- `kernel/types.ts`：`SettingsGroupId` 加 `| 'storage'`。
- `SettingsNav.tsx`：`GROUPS` 在 `terminal` 之后加 `{ id: 'storage', labelKey: 'storageTitle' }`。
- `SettingsPanel.tsx`：`SETTINGS_COMPONENTS` 加 `storage: StorageSettings`。

- [ ] **Step 7: 运行测试与质量门**

Run:
```
pnpm --dir ai-digital-life/frontend run test StorageSettings
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run lint
```
Expected: PASS（0 error）

- [ ] **Step 8: 提交**

```bash
git add ai-digital-life/frontend/src
git commit -m "feat(storage): add storage settings group with per-category paths and migration dialog"
```

---

### Task 6: 双端一致性、回归与文档

**Files:**
- Modify: `ai-digital-life/AGENTS.md`
- Modify: `docs/superpowers/specs/2026-09-14-storage-path-settings-design.md`（状态改为「已实施」）

- [ ] **Step 1: 双端一致性测试**

新增 `frontend/src/shared/ipc/__tests__/storage-parity.test.ts`：断言 `tauri` / `http` / `mock` 三端 `StorageBridge` 的方法集合一致（键集合相同），并断言 `StorageStatus.categories` 的 key 集合与 Rust `StorageCategory::key` 的 10 个字符串一致（把该列表作为常量同时被 mock 与测试引用）。

```ts
import { describe, it, expect } from 'vitest';
import { STORAGE_CATEGORY_KEYS } from '../storage';

describe('storage category keys parity', () => {
  it('has exactly the 10 category keys', () => {
    expect(STORAGE_CATEGORY_KEYS).toEqual([
      'database', 'downloads_db', 'site_meta_db', 'config', 'clipboard',
      'snapshot', 'dsh', 'logs', 'credentials_fallback', 'downloads_default',
    ]);
  });
});
```

- [ ] **Step 2: 手工双端验证**

1. Tauri 模式：打开设置→存储，切换统一/每类；改一个分类路径（如剪贴板→新目录）→ 选「下次启动」→ 重启 → 确认迁移与报告展示；再试「立即迁移并重启」。
2. 浏览器模式：同流程（手输路径 + `/storage/restart-backend` 或下次启动提示）。
3. 不可移动 6 项说明、索引文件提示、外部文件保留提示均可见。
4. 终端组的磁盘预算与浏览器组的下载路径已消失，出现在「存储」组，且行为不变。

- [ ] **Step 3: 质量门（全仓库）**

Run:
```
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm --dir ai-digital-life/frontend run lint
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run test
```
Expected: 全部通过。

- [ ] **Step 4: 文档同步**

- `ai-digital-life/AGENTS.md`：记录「存储」设置组、locator 路径、双端实现策略、移动项与不可移项。
- 设计文档顶部状态改为「已实施（Plan A/B/C 已完成）」。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/AGENTS.md docs/superpowers/specs/2026-09-14-storage-path-settings-design.md frontend
git commit -m "test(storage): add cross-mode parity checks and finalize docs"
```

---

## Self-Review

**1. Spec coverage（对照 spec）**
- §6.1 组结构与交互（模式切换、每类行、搬入项、索引文件、不可移区、报告）→ Task 5 ✅
- §6.2 数据流与三端桥接 → Task 3 ✅
- §6.4 分类提示 + 关联功能（10 类全量）→ Task 4 key 表 + Task 5 ⓘ 实现 + 测试断言 10 个 ⓘ ✅
- §6.5 对话框附加说明 → Task 5 Step 4 ✅
- §7.2 时机选择（立即/下次 + 保留旧数据）→ Task 1 `storage_set_paths` + Task 5 对话框 ✅
- §8 双端一致性表 → Task 2（浏览器端点）/Task 3（四端桥接）/Task 6（parity 测试）✅
- §9.2 不可移项说明 → Task 4 `storageImmutable*` + Task 5 渲染 + 测试 6 项 ✅
- §10 前端设置与搬入项 → Task 5 Step 5/6 ✅
- §11 前端/i18n/双端测试 → Task 3/4/5/6 ✅
- §12 误删 locator 风险提示 → Task 5 索引文件行 ⓘ ✅
- §7.3 磁盘空间预检 → Task 1 `storage_preflight_cmd`（`sysinfo` 可用空间）✅

**2. Placeholder scan:** 无 TBD/TODO。Task 2 Step 3 明确「按 `reference.rs` 的写法实现」并给出了 `mode_to_str` 完整代码与路由清单；DTO 与 Task 1 同构，字段名由 Task 6 parity 测试锁定。Task 4 的分类 Desc/Related 给出格式与首类完整样例并要求补全其余 9 类（10 类清单齐全，非占位）。

**3. Type consistency:** `StorageStatus`/`StorageCategoryStatus`/`StorageReport`/`StoragePathPatch`/`PreflightDto` 在 Rust（Task 1/2）与 TS（Task 3）间字段名一致（camelCase）；`storage_get_status`/`storage_scan_foreign_cmd`/`storage_preflight_cmd`/`storage_set_paths`/`storage_cancel_pending`/`app_restart` 在 Task 1 定义、Task 3 invoke 引用一致；`STORAGE_CATEGORY_KEYS` 与 Rust `StorageCategory::key` 顺序在 Task 4/6 一致。

**已知取舍与风险：**
- `app.restart()` 的具体 API 依 Tauri 版本而定（本计划采用 `tauri-plugin-process` 的 `app.restart()`）；执行时若签名不同，以编译错误为准调整（`tauri::process::restart` 为备选）。浏览器模式的「立即迁移」依赖 dev 中间层重启 adl-server，若不可行则退化为「下次启动生效」提示（Task 2 Step 4 已给出退化路径）。
- Rust 侧 DTO 与 TS 类型未用 `ts-rs` 自动生成（手工保持同步）；若项目已对部分 DTO 使用 `ts-rs`，应改为生成以避免漂移 —— 执行时若发现 `ipc-types.generated.ts` 覆盖同类结构，按现有生成流程接入。
- `storage_preflight_cmd(state.clone(), ...)` 依赖 `State: Clone`；若编译不通过，改为把预检逻辑抽成不依赖 `State` 的私有函数并分别从命令与 `set_paths` 调用。
