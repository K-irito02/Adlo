# 下载卡片文件状态与路径迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让下载卡片成为“记录骨架 + 文件状态”的单一时间列表：文件存在/缺失/非默认位置可见，缺失可重新下载，默认路径迁移只搬下载记录中的文件并同步记录。

**Architecture:** Rust/Tauri 后端新增文件状态查询、pending-redownload 复用记录、tracked-only 迁移与启动期幽灵 `in_progress` 回收；React/Zustand 前端把下载卡片改为单列表，加入缺失态、非默认位置标签、重新下载动作与状态刷新；数据库 schema 不变，文件状态是瞬时查询。

**Tech Stack:** Rust (Tauri 2, rusqlite, tokio), React 19, Zustand, TypeScript, Vitest, WebView2.

**Spec:** `docs/superpowers/specs/2026-11-27-download-library-design.md`

## Global Constraints

- 不新增数据库列/迁移；文件状态是瞬时查询结果。
- 下载卡片是**单列表**，按 `created_at DESC`，不渲染状态分组标题。
- 缺失态只作用于 `completed`；`failed` / `canceled` 只显示自身状态。
- 重新下载复用原记录 id；Auto 模式目标为当前默认目录 + `resolve_conflict_path`，Ask 模式照常弹原生保存框；失败 → `failed`，取消 → `canceled`。
- 自动迁移只搬 `completed` 且文件存在、路径在旧默认目录下的记录文件；`in_progress` / `paused` 阻止迁移；`failed` / `canceled` 残留文件不迁移。
- 旧目录中的非记录文件保留；旧目录只在完全空且非系统保护目录时尽力删除。
- 文件状态只在打开卡片、路径变更完成、窗口 focus（节流）时检查；不后台轮询。
- 中英文 i18n 必须同步；新文案 key 按现有 `browserDownload*` / `storageDownload*` 约定。
- 所有测试先红后绿；每个任务独立提交；不使用 `--no-verify`。
- Windows 路径比较使用 `normalize_path_key` + 组件级 `starts_with`，不用字符串前缀。

## Review Focus

- **Ask 模式重新下载**：原生保存框返回后才知道最终路径；reset 必须延迟到对话框返回，不能使用预计算路径。
- **pending 匹配失败/重定向**：URL 变化但该 tab 只有一个 pending 时必须兜底复用，否则同一次操作会多出一条记录。
- **崩溃残留 `in_progress`**：启动期回收必须把无活跃操作的 `in_progress` 标为 `failed/Interrupted`，否则假进度和迁移卡死。
- **重新下载成功后的文件状态**：`downloadFileStates` 必须在 started/finished 时失效并在成功后单条刷新，否则行会一直显示删除线。
- **迁移部分失败**：已搬文件/记录保持新路径、设置不切换、非记录文件不丢；失败后前端必须刷新记录路径。

---

### Task 1: 后端文件状态查询

**Files:**
- Modify: `adlo/crates/browser/src/download_types.rs`
- Modify: `adlo/crates/browser/src/download_manager.rs`（`mod tests` 内加测试）
- Modify: `adlo/src-tauri/src/commands/download_commands.rs`
- Modify: `adlo/src-tauri/src/main.rs`
- Modify: `adlo/src-tauri/permissions/digital-life.toml`
- Modify: `adlo/frontend/src/shared/ipc/download.ts`

**Interfaces:**
- Consumes: `DownloadManager::get_record`, `effective_default_dir`, `normalize_path_key`.
- Produces:
  ```rust
  #[derive(Debug, Clone, Serialize)]
  pub struct DownloadFileState {
      pub id: String,
      pub exists: bool,
      pub in_default_dir: bool,
      pub error: Option<String>,
  }

  impl DownloadManager {
      pub fn file_states(&self, ids: &[String]) -> Vec<DownloadFileState>;
  }

  #[tauri::command]
  pub async fn download_file_states(
      state: tauri::State<'_, AppState>,
      ids: Vec<String>,
  ) -> Result<IpcResult<Vec<DownloadFileState>>, CommandError>;
  ```
- TS:
  ```ts
  export interface DownloadFileState {
    id: string;
    exists: boolean;
    in_default_dir: boolean;
    error: string | null;
  }
  ```

- [ ] **Step 1: Write the failing test**

在 `download_manager.rs` 的 `mod tests` 加：

```rust
#[test]
fn file_states_reports_present_missing_and_non_default() {
    let db = temp_db("file-states");
    let mgr = DownloadManager::new(db);
    let root = test_workspace("file-states-root");
    let default_dir = root.join("Downloads");
    let other_dir = root.join("Elsewhere");
    fs::create_dir_all(&default_dir).unwrap();
    fs::create_dir_all(&other_dir).unwrap();
    mgr.set_default_dir_override(Some(default_dir.clone()));

    let present = mgr
        .create_download("https://example.com/a.zip", default_dir.join("a.zip").to_string_lossy().as_ref(), None)
        .unwrap();
    fs::write(default_dir.join("a.zip"), b"a").unwrap();
    let outside = mgr
        .create_download("https://example.com/b.zip", other_dir.join("b.zip").to_string_lossy().as_ref(), None)
        .unwrap();
    fs::write(other_dir.join("b.zip"), b"b").unwrap();
    let missing = mgr
        .create_download("https://example.com/c.zip", default_dir.join("c.zip").to_string_lossy().as_ref(), None)
        .unwrap();

    let states = mgr.file_states(&[present.id, outside.id, missing.id]);
    assert!(states[0].exists && states[0].in_default_dir);
    assert!(states[1].exists && !states[1].in_default_dir);
    assert!(!states[2].exists);
}
```

同一测试或新增测试覆盖 `Downloads2` 前缀边界：`default_dir = .../Downloads`，外部路径 `.../Downloads2/x` 必须 `in_default_dir == false`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-browser download_manager::tests::file_states_reports_present_missing_and_non_default`
Expected: FAIL — `DownloadFileState` / `file_states` 不存在。

- [ ] **Step 3: Implement `DownloadFileState` and `file_states`**

`DownloadFileState` 放在 `download_types.rs`；`file_states` 取 settings → `effective_default_dir` → 对每个 id 调 `get_record`，`Path::is_file()` 判断存在，`normalize_path_key` + 组件级 `starts_with` 判断默认目录。任何 stat/record 错误写 `error` 且 `exists=false`。

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-browser download_manager::tests::file_states_reports_present_missing_and_non_default`
Expected: PASS。

- [ ] **Step 5: Wire the command and TS type**

在 `download_commands.rs` 加 async 命令，`spawn_blocking` 调 `mgr.file_states`；`main.rs` 的 `generate_handler!` 注册；`permissions/digital-life.toml` 加 `"download_file_states"`；`frontend/src/shared/ipc/download.ts` 加类型。

- [ ] **Step 6: Verify and commit**

Run: `cargo check -p adlo -p adl-browser && pnpm --dir frontend run typecheck`
Expected: PASS。
Commit: `feat(downloads): add download file state query`

---

### Task 2: Store 文件状态、失效规则与重新下载态

**Files:**
- Modify: `adlo/frontend/src/app/stores/slices/browserDownloadsSlice.ts`
- Modify: `adlo/frontend/src/shared/ipc/download.ts`
- Test: `adlo/frontend/src/app/stores/slices/__tests__/browserDownloadsSlice.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `DownloadFileState` / `download_file_states`。
- Produces:
  ```ts
  downloadFileStates: Record<string, DownloadFileState>;
  redownloadingIds: ReadonlySet<string>;
  refreshDownloadFileStates: (ids?: string[]) => Promise<void>;
  redownloadDownload: (id: string, tabId?: string) => Promise<IpcResult<void>>;
  ```
- `redownloadDownload` 行为：有 `tabId` → 调 `download_redownload`；无 `tabId` → 先调 `download_prepare_redownload(id)`，成功后 `get().browserOpenTab(record.url)`，走现有新标签下载回退。

- [ ] **Step 1: Write failing store tests**

在 `browserDownloadsSlice.test.ts` 加：
- `refreshDownloadFileStates` 调 `download_file_states`，把结果映射进 `downloadFileStates`。
- `browser-download-started` 删除 `downloadFileStates[id]`、删除 `redownloadingIds`，并按 id upsert `downloads`（不是重复 prepend）。
- `browser-download-finished` success 删除 state 后调用一次 `refreshDownloadFileStates([id])`。
- `removeDownloadRecord` / `deleteDownloadFile` 删除对应 state；`clearDownloadHistory` 清空 map。
- `redownloadDownload` 成功/失败都清理 `redownloadingIds`；15s fake timer 超时清理；无 `tabId` 时调 `download_prepare_redownload` + `browserOpenTab(record.url)`。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/browserDownloadsSlice.test.ts`
Expected: FAIL — 新状态/action 不存在。

- [ ] **Step 3: Implement state/actions and event invalidation**

按 Interfaces 加字段/action；`browser-download-started` 用 id upsert；所有状态事件删除 `downloadFileStates[id]`；成功 finished 异步单条刷新；`redownloadDownload` 调 `download_redownload`，设置 `redownloadingIds` 和 15s 定时器；`clearDownloadHistory` 清空所有瞬时 map/set。

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/browserDownloadsSlice.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

Commit: `feat(downloads): track file states and redownload state`

---

### Task 3: 后端重新下载 reset / pending / command

**Files:**
- Modify: `adlo/crates/browser/src/download_manager.rs`
- Modify: `adlo/crates/browser/src/download_handler.rs`
- Modify: `adlo/src-tauri/src/commands/download_commands.rs`
- Modify: `adlo/src-tauri/src/main.rs`
- Modify: `adlo/src-tauri/permissions/digital-life.toml`

**Interfaces:**
- Produces:
  ```rust
  pub(crate) struct PendingRedownload {
      pub record_id: String,
      pub tab_id: Option<String>,
      pub url: String,
      pub expires_at: std::time::Instant,
  }

  impl DownloadManager {
      pub(crate) fn register_pending_redownload(
          &self, record_id: &str, tab_id: Option<&str>, url: &str,
      ) -> Result<(), String>;
      pub(crate) fn take_pending_redownload(
          &self, tab_id: Option<&str>, url: &str,
      ) -> Option<String>;
      pub fn reset_for_redownload(
          &self, id: &str, file_path: &str, source_tab_id: Option<&str>,
      ) -> Result<DownloadRecord, String>;
  }

  #[tauri::command]
  pub fn download_redownload(
      state: tauri::State<'_, AppState>,
      id: String,
      tab_id: String,
  ) -> Result<IpcResult<()>, CommandError>;

  #[tauri::command]
  pub fn download_prepare_redownload(
      state: tauri::State<'_, AppState>,
      id: String,
  ) -> Result<IpcResult<()>, CommandError>;
  ```
- `download_handler.rs` 把记录创建抽成可测函数：
  ```rust
  fn begin_download_record(
      manager: &DownloadManager,
      url: &str,
      final_path: &str,
      source_tab_id: Option<&str>,
  ) -> Result<DownloadRecord, String>;
  ```

- [ ] **Step 1: Write failing Rust tests**

在 `download_manager.rs` 加：
- `reset_for_redownload_reuses_id_and_resets_fields`：seed completed 记录；调 reset；断言 id 不变、status=InProgress、bytes=0、created_at 更新、completed_at/interrupt_reason 清空、file_path/file_name 更新。
- `pending_redownload_is_unique_and_consumed`：注册后第二次注册返回 Err；`take` 后再次 take 返回 None。
- `pending_redownload_expires`：注册后推进 15s（或注入过期时间），`take` 返回 None。
- `pending_redownload_unique_fallback_on_url_mismatch`：注册一个 tab_id=None 的 pending；`take(Some("tab"), "different-url")` 返回该 record id（唯一兜底）。

在 `download_handler.rs` 加：
- `begin_download_record_resets_pending`：seed completed record + pending；调 `begin_download_record`；断言返回原 id 且 pending 被消费。
- `begin_download_record_creates_new_without_pending`：无 pending 时返回新 id。

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p adl-browser download_manager::tests::reset_for_redownload_reuses_id_and_resets_fields download_manager::tests::pending_redownload_is_unique_and_consumed download_manager::tests::pending_redownload_unique_fallback_on_url_mismatch download_handler::tests::begin_download_record_resets_pending`
Expected: FAIL — 方法不存在。

- [ ] **Step 3: Implement pending/reset/begin**

`PendingRedownload` 放 `DownloadManager` 的 Mutex 字段；`register` 拒绝未过期 pending；`take` 先精确 `(tab_id,url)`，否则若唯一未过期 pending 则兜底；`reset_for_redownload` 先删除旧记录 `<file_path>.crdownload`（如果存在），再执行设计稿 SQL（status/bytes/created_at/completed_at/interrupt_reason/auto_resume_count/etag/last_modified/file_path/file_name/source_tab_id），返回更新后的 record。`begin_download_record` 先 `take_pending`，命中则 reset，否则 `create_download`。

- [ ] **Step 4: Run tests to verify they pass**

Run: 同 Step 2。
Expected: PASS。

- [ ] **Step 5: Wire commands and handler**

`download_redownload(id, tab_id)`：校验记录状态/URL；`register_pending_redownload`；`state.browser_manager.navigate_tab(&tab_id, &record.url)`；失败时清理 pending。
`download_prepare_redownload(id)`：只 `register_pending_redownload(id, None, url)`，供前端无活动 tab 时走新标签回退。
`requested_handler` 在 `create_download` 处改用 `begin_download_record`；`last_record_id` 用返回 record.id；发出 `browser-download-started`。
注册命令 + 权限。

- [ ] **Step 6: Verify and commit**

Run: `cargo check -p adlo -p adl-browser`
Expected: PASS。
Commit: `feat(downloads): reuse download records for redownload`

---

### Task 4: 前端重新下载动作、菜单与活动 tab

**Files:**
- Modify: `adlo/frontend/src/app/features/browser/useDownloadItemActions.ts`
- Modify: `adlo/frontend/src/app/features/browser/BrowserDownloadContextMenu.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserDownloadButton.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserDownloadMenu.tsx`
- Modify: `adlo/frontend/src/app/features/center/CenterBrowserView.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserToolbar.tsx`
- Test: `adlo/frontend/src/app/features/browser/__tests__/BrowserDownloadContextMenu.test.tsx`（新建）
- Test: `adlo/frontend/src/app/features/browser/__tests__/useDownloadItemActions.test.ts`（新建或就近）

**Interfaces:**
- Consumes: Task 2 `redownloadDownload`、`redownloadingIds`。
- Produces:
  ```ts
  // BrowserDownloadButton
  interface BrowserDownloadButtonProps {
    className?: string;
    activeTabId?: string;
  }
  // useDownloadItemActions
  handleRedownload: (record: DownloadRecord) => Promise<void>;
  ```

- [ ] **Step 1: Write failing tests**

- `BrowserDownloadContextMenu`：
  - http(s) completed 缺失项显示「重新下载」；
  - `blob://` 记录不显示「重新下载」「复制链接」；
  - `redownloadingIds.has(id)` 时「重新下载」禁用。
- `useDownloadItemActions`：
  - 有 tab id → 调 `redownloadDownload(id, tabId)`；
  - 无 tab id → 调 `redownloadDownload(id, undefined)`（store 内部走 prepare + openTab 回退）；
  - 错误 → toast。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/app/features/browser/__tests__/BrowserDownloadContextMenu.test.tsx src/app/features/browser/__tests__/useDownloadItemActions.test.ts`
Expected: FAIL — 新 props/action 不存在。

- [ ] **Step 3: Implement UI/action**

- `BrowserDownloadButton` 加 `activeTabId`，`CenterBrowserView` / `BrowserToolbar` 传本宿主活动 tab id。
- `BrowserDownloadMenu` 把 `activeTabId`、`redownloadingIds` 传给 item/context menu。
- `BrowserDownloadContextMenu` 加 `onRedownload`，按 URL scheme 控制可见性；缺失时隐藏打开/在文件夹中显示/删除文件。
- `useDownloadItemActions` 加 `handleRedownload`：调用 `redownloadDownload(record.id, tabId)`；失败 `showToast(...,'error')`。
- `BrowserDownloadItem` 加 `redownloading` prop，显示「正在准备…」/spinner，禁用重复点击。

- [ ] **Step 4: Run tests to verify they pass**

Run: 同 Step 2。
Expected: PASS。

- [ ] **Step 5: Commit**

Commit: `feat(downloads): add redownload action to download card`

---

### Task 5: 单列表、状态文字、缺失/非默认样式

**Files:**
- Modify: `adlo/frontend/src/app/features/browser/BrowserDownloadMenu.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserDownloadItem.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserDownloadMenu.css`
- Modify: `adlo/frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `adlo/frontend/src/app/i18n/en-US/browser.ts`
- Test: `adlo/frontend/src/app/features/browser/__tests__/BrowserDownloadItem.test.tsx`
- Test: `adlo/frontend/src/app/features/browser/__tests__/BrowserDownloadMenu.test.tsx`（新建）

**Interfaces:**
- Consumes: Task 1 `DownloadFileState`、Task 2 `downloadFileStates`。
- Produces: 单列表、缺失/非默认 UI、状态文案。

- [ ] **Step 1: Write failing tests**

- `BrowserDownloadMenu`：全部记录按 `created_at DESC` 渲染；不出现 `active/paused/failed/completed/canceled` 分组标题。
- `BrowserDownloadItem`：
  - completed + `exists=false` → 文件名 `line-through`、整行 `adl-download-item--missing`、点击不调 `handleOpenFile`；
  - completed + `in_default_dir=false` → 渲染「非默认位置」badge；
  - failed → 显示失败原因；canceled → 「已取消」；paused → 「已暂停」；
  - `redownloading` → 「正在准备…」。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/app/features/browser/__tests__/BrowserDownloadItem.test.tsx src/app/features/browser/__tests__/BrowserDownloadMenu.test.tsx`
Expected: FAIL。

- [ ] **Step 3: Implement list/item/CSS/i18n**

- `BrowserDownloadMenu` 删除 `DownloadGroup` 渲染，排序后直接 map。
- `BrowserDownloadItem` 增加 `fileState`/`redownloading` 逻辑、状态文字、badge、缺失 class、点击保护。
- CSS 加 `.adl-download-item--missing`、`__name` line-through、badge；删除无引用的 group 样式（按死代码检查）。
- 新增 i18n：`browserDownloadMissingFile`、`browserDownloadNonDefaultLocation`、`browserDownloadRedownload`、`browserDownloadCanceled`（中英同步）。

- [ ] **Step 4: Run tests to verify they pass**

Run: 同 Step 2。
Expected: PASS。

- [ ] **Step 5: Commit**

Commit: `feat(downloads): render download card as flat file-state list`

---

### Task 6: 文件状态刷新时机

**Files:**
- Modify: `adlo/frontend/src/app/features/browser/useBrowserDownloads.ts`
- Modify: `adlo/frontend/src/app/features/browser/BrowserDownloadMenu.tsx`
- Test: `adlo/frontend/src/app/features/browser/useBrowserDownloads.test.ts`

**Interfaces:**
- Consumes: Task 2 `refreshDownloadFileStates`、`downloadSettings`。
- Produces: 打开卡片、路径变更完成、窗口 focus 节流刷新。

- [ ] **Step 1: Write failing tests**

- 打开卡片：`fetchDownloads` + `refreshDownloadFileStates` 各调用一次。
- `downloadSettings.default_path` 变化：调用 `refreshDownloadFileStates`。
- `window.focus` 两次快速触发：只刷新一次（≥2s 节流）；fake timers advance 2s 后再触发刷新。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/app/features/browser/useBrowserDownloads.test.ts`
Expected: FAIL。

- [ ] **Step 3: Implement**

- `useBrowserDownloads` 监听 `downloadSettings.default_path` 与 `window.focus`，节流 2s。
- `BrowserDownloadMenu` 打开 effect 里同时 `fetchDownloads()` 与 `refreshDownloadFileStates()`。

- [ ] **Step 4: Run tests to verify they pass**

Run: 同 Step 2。
Expected: PASS。

- [ ] **Step 5: Commit**

Commit: `feat(downloads): refresh file states on open, path change and focus`

---

### Task 7: 启动期回收幽灵 `in_progress`

**Files:**
- Modify: `adlo/crates/browser/src/download_manager.rs`
- Modify: `adlo/crates/browser/src/download_handler.rs`（`create_download_manager`）
- Modify: `adlo/crates/browser/src/download_manager.rs` tests

**Interfaces:**
- Produces:
  ```rust
  impl DownloadManager {
      pub fn reconcile_orphaned_in_progress(&self) -> Result<usize, String>;
  }
  ```
- `create_download_manager` 初始化后调用一次。

- [ ] **Step 1: Write failing test**

```rust
#[test]
fn reconcile_marks_in_progress_failed_and_keeps_paused() {
    // seed 一条 in_progress + 一条 paused（用 create_download + update status）
    // 调 reconcile；断言 in_progress 变 failed/Interrupted，paused 不变。
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-browser download_manager::tests::reconcile_marks_in_progress_failed_and_keeps_paused`
Expected: FAIL。

- [ ] **Step 3: Implement**

```sql
UPDATE download_history
SET status = 'failed', interrupt_reason = 'Interrupted'
WHERE status = 'in_progress'
```
返回受影响行数；`create_download_manager` 里在返回 Arc 前调用，失败只 `tracing::warn!` 不阻塞启动。

- [ ] **Step 4: Run test to verify it passes**

Run: 同 Step 2。
Expected: PASS。

- [ ] **Step 5: Commit**

Commit: `fix(downloads): reconcile orphaned in-progress records on startup`

---

### Task 8: Tracked-only 自动迁移（后端）

**Files:**
- Modify: `adlo/crates/browser/src/download_manager.rs`
- Modify: `adlo/src-tauri/src/commands/download_commands.rs`
- Modify: `adlo/frontend/src/shared/ipc/download.ts`
- Test: `adlo/crates/browser/src/download_manager.rs`（重写相关迁移测试）

**Interfaces:**
- Produces:
  ```rust
  #[derive(Debug, Clone, Serialize)]
  pub struct DownloadMigrationResult {
      pub migrated: usize,
      pub missing: usize,
      pub failed: usize,
  }

  impl DownloadManager {
      pub fn change_default_path(
          &self, new_path: &str, migrate: bool,
      ) -> Result<DownloadMigrationResult, String>;
      fn update_download_file_path(&self, id: &str, path: &str, file_name: &str) -> Result<(), String>;
  }
  ```
- 命令 `download_change_default_path` 返回 `IpcResult<DownloadMigrationResult>`。
- TS `DownloadMigrationResult`。

- [ ] **Step 1: Write failing Rust tests**

重写/新增：
- `change_default_path_moves_only_tracked_completed_files`：旧目录有 tracked completed + untracked 文件 + failed 记录；迁移后 tracked 文件到新目录，untracked 留旧目录，旧目录仍存在，untracked 未动。
- `change_default_path_updates_conflict_renamed_records`：新目录已有同名文件；迁移后 `file_path`/`file_name` 指向 `name (1).ext`。
- `change_default_path_preserves_nested_relative_paths`：tracked 记录在 `old/sub/file` → `new/sub/file`。
- `change_default_path_skips_missing_and_reports_count`。
- `change_default_path_blocks_active_or_paused`：seed in_progress/paused；返回错误且文件未移动。
- `change_default_path_partial_failure_keeps_moved_records`（可用不可写目标/模拟失败）。
- 保留现有 overlap/system-dir 测试（按新语义调整）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p adl-browser download_manager::tests::change_default_path_`
Expected: FAIL。

- [ ] **Step 3: Implement tracked-only migration**

按设计稿 8.3：查 completed 记录；block active/paused；filter old dir + exists；dedupe；`strip_prefix`/`move_path`/`resolve_conflict_path`；逐文件 `update_download_file_path`（含 file_name）；缺失/外部路径跳过；旧目录仅空且非保护时删除；设置最后落盘；部分失败返回计数/错误。不再使用整目录 `migrate_dir`。

- [ ] **Step 4: Run tests to verify they pass**

Run: 同 Step 2。
Expected: PASS。

- [ ] **Step 5: Wire command/TS**

命令返回 `DownloadMigrationResult`；前端类型同步。`cargo check -p adlo -p adl-browser`。

- [ ] **Step 6: Commit**

Commit: `feat(downloads): migrate only tracked download files`

---

### Task 9: 迁移前端结果与文案

**Files:**
- Modify: `adlo/frontend/src/app/stores/slices/browserDownloadsSlice.ts`
- Modify: `adlo/frontend/src/app/features/storage-settings/BrowserDownloadPathSection.tsx`
- Modify: `adlo/frontend/src/app/features/storage-settings/DownloadPathBlock.tsx`
- Modify: `adlo/frontend/src/app/features/storage-settings/downloadPathReset.ts`
- Modify: `adlo/frontend/src/app/i18n/zh-CN/settings.ts`
- Modify: `adlo/frontend/src/app/i18n/en-US/settings.ts`
- Test: `adlo/frontend/src/app/features/browser-settings/BrowserSettings.test.tsx`
- Test: `adlo/frontend/src/app/features/storage-settings/*`（就近）

**Interfaces:**
- Consumes: Task 8 `DownloadMigrationResult`。
- Produces: 成功/阻止/缺失/失败 toast，updated copy。

- [ ] **Step 1: Write failing tests**

- `changeDownloadPath` 返回 `{ migrated, missing, failed }`；成功后 `fetchDownloads` + `refreshDownloadFileStates`。
- 失败（包括 `downloads_active`）后也 `fetchDownloads` + `refreshDownloadFileStates`，toast 展示专用文案。
- 开关说明/确认框不再出现“全部文件/删除旧目录”，出现“仅迁移下载记录中的文件/旧目录其它文件保留”。
- 阻止文案、结果文案、失败文案中英一致。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/app/features/browser-settings/BrowserSettings.test.tsx`
Expected: FAIL。

- [ ] **Step 3: Implement store/UI/i18n**

- `changeDownloadPath` 类型与结果处理；成功/失败都 `fetchDownloads()` + `refreshDownloadFileStates()`；`DOWNLOAD_ACTIVE` 错误映射阻止 toast；成功/缺失结果 toast。
- `BrowserDownloadPathSection`/`DownloadPathBlock`/`downloadPathReset` 文案与分支。
- i18n：`storageDownloadMigrateHint`、`...EnableConfirm`、`...EnableTitle`、`...EnableConfirmBtn`、`storageDownloadResetConfirmMigrateOn/Off/SwitchOnly`、`storageDownloadMigrateBlockedActive`、`storageDownloadMigrateResult`；中英同步。

- [ ] **Step 4: Run tests to verify they pass**

Run: 同 Step 2；再 `pnpm --dir frontend run typecheck`。
Expected: PASS。

- [ ] **Step 5: Commit**

Commit: `feat(downloads): show tracked-only migration results and copy`

---

### Task 10: 清理临时探针 + 总验证

**Files:**
- Delete: `adlo/frontend/src/app/utils/freezeProbe.ts`
- Modify: `adlo/frontend/src/main.tsx`（移除 dev probe import）
- Modify: `adlo/frontend/src/app/features/browser/useWebViewLifecycle.ts`（移除 `[DBG-freeze] create-for-tab slow`）
- Modify: `adlo/src-tauri/src/commands/browser.rs`（移除 `child webview attached` 临时耗时 debug，如无保留价值）

- [ ] **Step 1: Remove probes and dead imports**

删除 `freezeProbe.ts`、`main.tsx` 的 dev import、`create-for-tab slow` 日志；grep 全仓 `DBG-freeze|freezeProbe|create-for-tab slow` 必须无结果（文档/进度文件除外）。

- [ ] **Step 2: Run full changed checks**

Run:
```bash
pnpm --dir frontend run typecheck
pnpm --dir frontend exec vitest run src/app/features/browser src/app/stores/slices src/app/features/browser-settings src/app/features/storage-settings
cargo test -p adl-browser
cargo check -p adlo -p adl-browser
pnpm run check:changed
```
Expected: 全部 PASS。

- [ ] **Step 3: Manual verification**

按设计稿 §11.3 逐项手工验证：默认目录/非默认/缺失、Auto/Ask 重新下载、失败/取消、迁移开/关、进行中阻止、崩溃后幽灵行、blob 菜单、focus 刷新。

- [ ] **Step 4: Commit**

Commit: `chore(downloads): remove temporary download probes`

---

## 自检

- 规格覆盖：Task 1-2 文件状态；Task 3-4 重新下载；Task 5 单列表/缺失/非默认；Task 6 刷新；Task 7 启动回收；Task 8-9 迁移；Task 10 清理/手工验证。
- 类型一致：`DownloadFileState` 字段 `id/exists/in_default_dir/error`；`DownloadMigrationResult` 字段 `migrated/missing/failed`；`download_redownload(id, tab_id)` / `download_prepare_redownload(id)`。
- Review Focus 均有对应测试：Ask 模式（Task 3/4/10 手工）、pending 兜底（Task 3）、启动回收（Task 7）、文件状态失效（Task 2）、迁移部分失败（Task 8）。
