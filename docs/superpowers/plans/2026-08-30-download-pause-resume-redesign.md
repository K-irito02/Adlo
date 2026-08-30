# 下载暂停/恢复重设计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 HTTP Range 恢复引擎、非 Range 服务器暂停确认对话框、下载中标签保护，解决下载暂停/恢复失败问题。

**Architecture:** 分 6 个模块实施：(F) 下载中标签保护 → (A) HTTP Range 恢复引擎 → (B) 非 Range 暂停 → (C) 原生 Resume 失败兜底 → (D) 前端确认对话框 → (E) 进度监控适配。模块 F 最先实施（防挂起是前置保护），模块 A 是核心引擎，B/C/D/E 依赖 A。

**Tech Stack:** Rust (reqwest, tokio, rusqlite) + TypeScript (React, Zustand, Tauri IPC)

## Global Constraints

- Rust 质量：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）
- 前端质量：ESLint（0 errors）+ Prettier + TypeScript-ESLint + `tsc --noEmit`
- 测试：`cargo test --workspace` + `pnpm --dir frontend run test`
- i18n：所有 UI 文本必须使用 i18n key，禁止硬编码
- 双端一致性：功能必须在 Tauri 桌面和浏览器模式中保持一致
- 设计系统：颜色使用 CSS 自定义属性，图标使用 SVG

---

### Task 1: BrowserTabState 增加 isDownloading 字段

**Files:**
- Modify: `frontend/src/app/stores/slices/browserTypes.ts`
- Modify: `frontend/src/app/stores/slices/browserTabsSlice.ts`
- Modify: `frontend/src/app/stores/slices/browserDownloadsSlice.ts`

**Interfaces:**
- Consumes: `BrowserTabState`（现有类型）, `DownloadRecord.source_tab_id`（现有字段）
- Produces: `BrowserTabState.isDownloading: boolean`

- [ ] **Step 1: 在 browserTypes.ts 中给 BrowserTabState 增加 isDownloading 字段**

```typescript
// browserTypes.ts — BrowserTabState 接口
export interface BrowserTabState {
  // ... 现有字段
  isDownloading: boolean;
}
```

- [ ] **Step 2: 在 browserTabsSlice.ts 的初始状态中设置 isDownloading 默认值**

在创建标签的逻辑中（`createTab` 或类似函数），确保新标签的 `isDownloading` 默认为 `false`。

- [ ] **Step 3: 在 browserDownloadsSlice.ts 的 subscribeDownloadEvents 中更新标签状态**

在 `browser-download-started` 事件处理中：
```typescript
// 根据 record.source_tab_id 更新对应标签的 isDownloading
if (record.source_tab_id) {
  set((state) => ({
    browserTabs: state.browserTabs.map((t) =>
      t.id === record.source_tab_id ? { ...t, isDownloading: true } : t,
    ),
  }));
}
```

在 `browser-download-finished`、`browser-download-canceled`、`browser-download-error` 事件处理中：
```typescript
// 根据 record.source_tab_id 更新对应标签的 isDownloading
if (payload.source_tab_id) {
  set((state) => ({
    browserTabs: state.browserTabs.map((t) =>
      t.id === payload.source_tab_id ? { ...t, isDownloading: false } : t,
    ),
  }));
}
```

- [ ] **Step 4: 运行前端测试验证**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stores/slices/browserTypes.ts frontend/src/app/stores/slices/browserTabsSlice.ts frontend/src/app/stores/slices/browserDownloadsSlice.ts
git commit -m "feat(browser): add isDownloading field to BrowserTabState"
```

---

### Task 2: isProtected 函数扩展支持下载保护

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserSuspendScheduler.ts`

**Interfaces:**
- Consumes: `BrowserTabState.isDownloading`（Task 1 产出）
- Produces: 扩展后的 `isProtected` 函数

- [ ] **Step 1: 修改 isProtected 函数**

```typescript
// useBrowserSuspendScheduler.ts
const isProtected = (t: BrowserTabState): boolean =>
  t.isPinned || t.isPlayingAudio || t.isDownloading;
```

- [ ] **Step 2: 运行挂起调度器测试**

Run: `cd frontend && npx vitest run useBrowserSuspendScheduler --reporter=verbose 2>&1 | tail -20`
Expected: 所有测试通过（可能需要新增测试用例验证 isDownloading 保护）

- [ ] **Step 3: 新增 isDownloading 保护测试用例**

```typescript
it('should protect downloading tabs from suspension', () => {
  const tab = { ...mockTab, isDownloading: true, isPinned: false, isPlayingAudio: false };
  expect(isProtected(tab)).toBe(true);
});
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserSuspendScheduler.ts
git commit -m "feat(browser): protect downloading tabs from suspension"
```

---

### Task 3: download_handler.rs 设置 source_tab_id

**Files:**
- Modify: `crates/browser/src/download_handler.rs`
- Modify: `crates/browser/src/download_manager.rs`

**Interfaces:**
- Consumes: `setup_download_handler` 参数（需要传入 tab_id）
- Produces: `DownloadRecord.source_tab_id` 被正确设置

- [ ] **Step 1: 修改 setup_download_handler 函数签名，增加 tab_id 参数**

```rust
pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
    last_record_id: Arc<Mutex<Option<String>>>,
    is_silent: bool,
    source_tab_id: Option<String>,  // 新增
) -> impl Fn(String, &mut PathBuf) -> bool + Send + Sync + 'static {
```

- [ ] **Step 2: 在 create_download 调用时传入 source_tab_id**

```rust
// download_handler.rs — setup_download_handler 闭包内
match manager.create_download(&url, &final_path, source_tab_id.clone()) {
```

- [ ] **Step 3: 修改 create_download 方法签名**

```rust
// download_manager.rs
pub fn create_download(&self, url: &str, file_path: &str, source_tab_id: Option<String>) -> Result<DownloadRecord, String> {
    let record = DownloadRecord {
        // ... 现有字段
        source_tab_id,
        // ...
    };
```

- [ ] **Step 4: 更新所有 setup_download_handler 的调用点**

搜索 `setup_download_handler` 的所有调用，传入正确的 `source_tab_id`：
- `browser_webview_setup.rs` 中的正常 webview：传入 `Some(tab_id.clone())`
- `browser_webview_setup.rs` 中的 silent webview：传入 `None`

- [ ] **Step 5: 运行 Rust 测试**

Run: `cargo test --package adl-browser 2>&1 | tail -10`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add crates/browser/src/download_handler.rs crates/browser/src/download_manager.rs
git commit -m "feat(browser): set source_tab_id on download record creation"
```

---

### Task 4: 下载完成事件携带 source_tab_id

**Files:**
- Modify: `crates/browser/src/download_handler.rs`
- Modify: `crates/browser/src/download_commands.rs`
- Modify: `frontend/src/shared/ipc/download.ts`

**Interfaces:**
- Consumes: `DownloadRecord.source_tab_id`（Task 3 产出）
- Produces: `DownloadFinishedPayload.source_tab_id`、`DownloadErrorPayload.source_tab_id`

- [ ] **Step 1: 在前端 DownloadFinishedPayload 和 DownloadErrorPayload 中增加 source_tab_id**

```typescript
// download.ts
export interface DownloadFinishedPayload {
  id: string;
  url: string;
  filePath: string;
  success: boolean;
  source_tab_id?: string;  // 新增
}

export interface DownloadErrorPayload {
  id: string;
  url: string;
  reason: string;
  canRetry: boolean;
  source_tab_id?: string;  // 新增
}
```

- [ ] **Step 2: 在 download_handler.rs 的 handle_download_finished 中携带 source_tab_id**

```rust
// browser-download-finished 事件 payload
let _ = app_handle.emit(
    "browser-download-finished",
    &serde_json::json!({
        "id": record.id,
        "url": url,
        "filePath": display_path,
        "success": true,
        "source_tab_id": record.source_tab_id,  // 新增
    }),
);
```

同样在 `browser-download-error` 事件中也携带 `source_tab_id`。

- [ ] **Step 3: 运行前端和 Rust 测试**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -10` && `cargo test --package adl-browser 2>&1 | tail -10`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add crates/browser/src/download_handler.rs frontend/src/shared/ipc/download.ts
git commit -m "feat(browser): carry source_tab_id in download finished/error events"
```

---

### Task 5: 创建 HTTP Range 恢复引擎 (download_range_resume.rs)

**Files:**
- Create: `crates/browser/src/download_range_resume.rs`
- Modify: `crates/browser/src/lib.rs`

**Interfaces:**
- Consumes: `reqwest::Client`, 下载 URL, 文件路径, offset, ETag/Last-Modified
- Produces: `RangeResumeDownload`, `RangeResumeResult`, `RangeResumeError`

- [ ] **Step 1: 创建 download_range_resume.rs 文件，定义核心类型**

```rust
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

pub struct RangeResumeDownload {
    pub url: String,
    pub file_path: PathBuf,
    pub offset: u64,
    pub total_bytes: Option<u64>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    client: reqwest::Client,
}

pub struct RangeResumeResult {
    pub bytes_received: u64,
    pub completed: bool,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum RangeResumeError {
    #[error("Server does not support range requests (returned 200 instead of 206)")]
    ServerNoRange,
    #[error("Requested range not satisfiable (416)")]
    RangeNotSatisfiable,
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("File I/O error: {0}")]
    FileError(String),
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}
```

- [ ] **Step 2: 实现 RangeResumeDownload::new() 构造函数**

```rust
impl RangeResumeDownload {
    pub fn new(
        url: String,
        file_path: PathBuf,
        offset: u64,
        total_bytes: Option<u64>,
        etag: Option<String>,
        last_modified: Option<String>,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest client should build");
        Self { url, file_path, offset, total_bytes, etag, last_modified, client }
    }
```

- [ ] **Step 3: 实现 start() 方法 — 发起 Range 请求并流式写入文件**

```rust
    pub async fn start(&self) -> Result<RangeResumeResult, RangeResumeError> {
        let mut request = self.client.get(&self.url);

        // 设置 Range 头
        if self.offset > 0 {
            request = request.header("Range", format!("bytes={}-", self.offset));
        }

        // 设置条件请求头
        if let Some(etag) = &self.etag {
            request = request.header("If-Range", etag.as_str());
        } else if let Some(lm) = &self.last_modified {
            request = request.header("If-Range", lm.as_str());
        }

        let response = request.send().await.map_err(|e| {
            RangeResumeError::NetworkError(e.to_string())
        })?;

        let status = response.status();

        // 检查响应状态
        if self.offset > 0 {
            if status == reqwest::StatusCode::OK {
                // 服务器不支持 Range，返回完整文件
                return Err(RangeResumeError::ServerNoRange);
            }
            if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                return Err(RangeResumeError::RangeNotSatisfiable);
            }
            if status != reqwest::StatusCode::PARTIAL_CONTENT {
                return Err(RangeResumeError::InvalidResponse(
                    format!("Expected 206, got {}", status)
                ));
            }
        } else if !status.is_success() {
            return Err(RangeResumeError::NetworkError(
                format!("HTTP {}", status)
            ));
        }

        // 从响应头获取 ETag 和 Last-Modified
        let resp_etag = response.headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let resp_lm = response.headers()
            .get("last-modified")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        // 流式写入文件
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await
            .map_err(|e| RangeResumeError::FileError(e.to_string()))?;

        let mut stream = response.bytes_stream();
        let mut bytes_received = 0u64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| RangeResumeError::NetworkError(e.to_string()))?;
            file.write_all(&chunk).await.map_err(|e| RangeResumeError::FileError(e.to_string()))?;
            bytes_received += chunk.len() as u64;
        }

        file.flush().await.map_err(|e| RangeResumeError::FileError(e.to_string()))?;

        let completed = self.total_bytes
            .map(|total| self.offset + bytes_received >= total)
            .unwrap_or(false);

        Ok(RangeResumeResult {
            bytes_received,
            completed,
            etag: resp_etag,
            last_modified: resp_lm,
        })
    }
}
```

- [ ] **Step 4: 在 lib.rs 中导出新模块**

```rust
pub mod download_range_resume;
```

- [ ] **Step 5: 编译验证**

Run: `cargo check --package adl-browser 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 6: Commit**

```bash
git add crates/browser/src/download_range_resume.rs crates/browser/src/lib.rs
git commit -m "feat(browser): implement HTTP Range resume engine"
```

---

### Task 6: 非 Range 服务器暂停逻辑

**Files:**
- Modify: `crates/browser/src/download_manager.rs`

**Interfaces:**
- Consumes: `resumability` 缓存, WebView2 原生操作
- Produces: `pause_download` 对非 Range 服务器的处理

- [ ] **Step 1: 修改 pause_download 中的非 Range 服务器分支**

当前代码（装饰性暂停）替换为真实暂停：

```rust
// 原：如果 resumability != Some(true)，做装饰性暂停
// 新：如果 resumability == Some(false)，取消下载并删除文件

if self.resumability(&url) == Some(false) {
    tracing::info!(
        id = %id,
        url = %url,
        "[ADL-DL] pause_download: server does not support Range — canceling download for clean restart"
    );

    // 取消 WebView2 原生下载
    #[cfg(windows)]
    if let Some(op) = self.get_operation(&url) {
        let _ = unsafe { op.Cancel() };
    }

    // 删除 .crdownload 临时文件
    let crdownload_path = format!("{}.crdownload", record.file_path);
    let _ = std::fs::remove_file(&crdownload_path);

    // 更新 DB 状态
    let conn = self.db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE download_history SET status = ?1, interrupt_reason = ?2, bytes_received = 0 WHERE id = ?3",
        rusqlite::params![DownloadStatus::Paused.as_str(), "NonResumablePaused", id],
    ).map_err(|e| format!("Failed to pause download: {}", e))?;

    // 移除原生操作句柄
    self.remove_operation(&url);

    return Ok(DownloadStatus::Paused);
}
```

- [ ] **Step 2: 运行 Rust 测试**

Run: `cargo test --package adl-browser 2>&1 | tail -10`
Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add crates/browser/src/download_manager.rs
git commit -m "feat(browser): real pause for non-Range servers with file cleanup"
```

---

### Task 7: 非 Range 服务器恢复逻辑（重新下载）

**Files:**
- Modify: `crates/browser/src/download_manager.rs`
- Modify: `src-tauri/src/commands/browser_webview_setup.rs`

**Interfaces:**
- Consumes: `RangeResumeDownload`（Task 5 产出）, `interrupt_reason = "NonResumablePaused"`
- Produces: 从 offset 0 重新下载

- [ ] **Step 1: 在 resume_download 中处理 NonResumablePaused**

```rust
// resume_download 函数中，在 cosmetic pause 检查之后
if record.interrupt_reason.as_deref() == Some("NonResumablePaused") {
    tracing::info!(
        id = %id,
        url = %url,
        "[ADL-DL] resume_download: non-resumable server — starting fresh download from offset 0"
    );

    // 启动 reqwest 下载（从头开始）
    // 这里需要启动一个新的下载线程/任务
    // 通过 emit 事件通知进度监控器启动 reqwest 下载
    let conn = self.db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE download_history SET status = ?1, interrupt_reason = NULL, bytes_received = 0 WHERE id = ?2",
        rusqlite::params![DownloadStatus::InProgress.as_str(), id],
    ).map_err(|e| format!("Failed to resume download: {}", e))?;

    return Ok(());
}
```

- [ ] **Step 2: 在 progress monitor 中检测 NonResumablePaused 恢复后的 reqwest 下载**

在 `start_download_progress_monitor` 中，当检测到 `interrupt_reason` 从 `NonResumablePaused` 变为 `NULL` 且状态为 `InProgress` 时，启动 reqwest 下载：

```rust
// 进度监控循环中
if record.status == InProgress && record.interrupt_reason.is_none() && record.bytes_received == 0 {
    // 可能是 NonResumablePaused 恢复后的重新下载
    // 检查 .crdownload 文件是否存在且大小为 0
    // 如果是，启动 reqwest 下载
}
```

- [ ] **Step 3: 实现 reqwest 下载线程（在 progress monitor 中）**

```rust
// 在 progress monitor 线程中启动 reqwest 下载
let url_clone = record.url.clone();
let path_clone = path.to_path_buf();
let manager_clone = download_manager.clone();
let record_id_clone = record.id.clone();
let app_handle_clone = app_handle.clone();

std::thread::spawn(move || {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let downloader = RangeResumeDownload::new(
            url_clone,
            path_clone,
            0,  // 从头开始
            total_bytes,
            None,
            None,
        );

        match downloader.start().await {
            Ok(result) => {
                // 下载完成，标记为完成
                let _ = manager_clone.complete_download(&record_id_clone, true, None);
                let _ = app_handle_clone.emit("browser-download-finished", &serde_json::json!({
                    "id": record_id_clone,
                    "success": true,
                }));
            }
            Err(e) => {
                tracing::error!(error = %e, "[ADL-DL] reqwest download failed");
                let _ = manager_clone.complete_download(&record_id_clone, false, Some("DownloadFailed"));
                let _ = app_handle_clone.emit("browser-download-error", &serde_json::json!({
                    "id": record_id_clone,
                    "reason": format!("Download failed: {}", e),
                    "canRetry": true,
                }));
            }
        }
    });
});
```

- [ ] **Step 4: 编译验证**

Run: `cargo check --package ai-digital-life 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add crates/browser/src/download_manager.rs src-tauri/src/commands/browser_webview_setup.rs
git commit -m "feat(browser): reqwest-based re-download for non-Range servers"
```

---

### Task 8: 原生 Resume() 失败时的 HTTP Range 兜底

**Files:**
- Modify: `crates/browser/src/download_manager.rs`

**Interfaces:**
- Consumes: `RangeResumeDownload`（Task 5 产出）, 原生 Resume() 失败
- Produces: HTTP Range 恢复

- [ ] **Step 1: 修改 resume_download 中原生 Resume() 失败后的 fallback**

当前代码返回错误，替换为 HTTP Range 恢复：

```rust
// resume_download 函数中，原生 Resume() 失败后的 fallback
// 原：Err("HTTP Range resume is not yet implemented...")
// 新：启动 RangeResumeDownload

tracing::info!(
    id = %id,
    url = %url,
    bytes_received = record.bytes_received,
    "[ADL-DL] resume_download: falling back to HTTP Range resume"
);

// 获取文件当前大小作为 offset
let current_offset = std::fs::metadata(&format!("{}.crdownload", record.file_path))
    .map(|m| m.len())
    .unwrap_or(record.bytes_received as u64);

// 启动 RangeResumeDownload
let manager_clone = self.clone();
let record_id = id.to_string();
let url_clone = url.clone();
let file_path = record.file_path.clone();
let total = record.total_bytes;
let etag = record.etag.clone();
let lm = record.last_modified.clone();
let app_handle_clone = app_handle.clone();

std::thread::spawn(move || {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let downloader = RangeResumeDownload::new(
            url_clone,
            PathBuf::from(format!("{}.crdownload", file_path)),
            current_offset,
            total,
            etag,
            lm,
        );

        match downloader.start().await {
            Ok(result) => {
                let _ = manager_clone.complete_download(&record_id, true, None);
                let _ = app_handle_clone.emit("browser-download-finished", &serde_json::json!({
                    "id": record_id,
                    "success": true,
                }));
            }
            Err(e) => {
                tracing::error!(error = %e, "[ADL-DL] HTTP Range resume failed");
                let _ = manager_clone.complete_download(&record_id, false, Some("DownloadFailed"));
                let _ = app_handle_clone.emit("browser-download-error", &serde_json::json!({
                    "id": record_id,
                    "reason": format!("Resume failed: {}", e),
                    "canRetry": true,
                }));
            }
        }
    });
});

// 更新 DB 状态为 InProgress
let conn = self.db.conn().map_err(|e| e.to_string())?;
conn.execute(
    "UPDATE download_history SET status = ?1, interrupt_reason = NULL WHERE id = ?2",
    rusqlite::params![DownloadStatus::InProgress.as_str(), id],
)?;

return Ok(());
```

注意：此修改需要 `resume_download` 方法能访问 `AppHandle`。当前签名是 `pub fn resume_download(&self, id: &str) -> Result<(), String>`，需要扩展为 `pub fn resume_download(&self, id: &str, app_handle: &AppHandle) -> Result<(), String>`。

- [ ] **Step 2: 更新 resume_download 的调用点**

在 `download_commands.rs` 中传递 `app_handle`。

- [ ] **Step 3: 编译验证**

Run: `cargo check --package ai-digital-life 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add crates/browser/src/download_manager.rs src-tauri/src/commands/download_commands.rs
git commit -m "feat(browser): HTTP Range resume fallback when native Resume() fails"
```

---

### Task 9: 前端确认对话框组件

**Files:**
- Create: `frontend/src/app/features/browser/BrowserDownloadPauseDialog.tsx`
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `frontend/src/app/i18n/en-US/browser.ts`

**Interfaces:**
- Consumes: 下载记录, 服务器 Range 支持状态
- Produces: 确认对话框组件

- [ ] **Step 1: 添加 i18n 键**

```typescript
// zh-CN/browser.ts
browserDownloadPauseDialogTitle: '此服务器不支持暂停',
browserDownloadPauseDialogDesc: '当前下载的服务器不支持断点续传。暂停后将从头开始下载。',
browserDownloadPauseDialogConfirm: '继续暂停',
browserDownloadPauseDialogCancel: '取消',

// en-US/browser.ts
browserDownloadPauseDialogTitle: 'Server does not support pause',
browserDownloadPauseDialogDesc: 'The server hosting this download does not support resuming. Pausing will restart the download from the beginning.',
browserDownloadPauseDialogConfirm: 'Pause anyway',
browserDownloadPauseDialogCancel: 'Cancel',
```

- [ ] **Step 2: 创建 BrowserDownloadPauseDialog 组件**

复用项目现有的 Modal/Dialog 组件（参考 `BrowserPanelDialogs.tsx` 中的对话框模式），包含：
- 标题：`t.browserDownloadPauseDialogTitle`
- 说明：`t.browserDownloadPauseDialogDesc`
- 两个按钮：「继续暂停」/「取消」
- 回调：`onConfirm` / `onCancel`

- [ ] **Step 3: 运行前端测试**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/browser/BrowserDownloadPauseDialog.tsx frontend/src/app/i18n/zh-CN/browser.ts frontend/src/app/i18n/en-US/browser.ts
git commit -m "feat(browser): add pause confirmation dialog for non-Range servers"
```

---

### Task 10: 暂停按钮集成确认对话框

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserDownloadItem.tsx`
- Modify: `frontend/src/app/stores/slices/browserDownloadsSlice.ts`

**Interfaces:**
- Consumes: `BrowserDownloadPauseDialog`（Task 9 产出）, 服务器 Range 支持状态
- Produces: 暂停按钮点击时的完整流程

- [ ] **Step 1: 在 BrowserDownloadItem 中检测服务器 Range 支持**

需要从后端获取服务器 Range 支持状态。可以通过 `DownloadRecord` 的 `interrupt_reason` 或新增一个查询方法。

简单方案：在 `DownloadRecord` 中增加 `resumable: Option<bool>` 字段，由后端在创建记录时设置。

- [ ] **Step 2: 修改暂停按钮点击逻辑**

```typescript
const handlePause = useCallback(async (rec: DownloadRecord) => {
  if (rec.resumable === false) {
    // 弹出确认对话框
    setShowPauseDialog(true);
  } else {
    // 直接暂停
    await pauseDownload(rec.id);
  }
}, [pauseDownload]);
```

- [ ] **Step 3: 处理对话框确认/取消**

```typescript
const handlePauseConfirm = useCallback(async () => {
  setShowPauseDialog(false);
  await pauseDownload(selectedRecord.id);
}, [pauseDownload, selectedRecord]);

const handlePauseCancel = useCallback(() => {
  setShowPauseDialog(false);
}, []);
```

- [ ] **Step 4: 运行前端测试**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/browser/BrowserDownloadItem.tsx frontend/src/app/stores/slices/browserDownloadsSlice.ts
git commit -m "feat(browser): integrate pause confirmation dialog for non-Range servers"
```

---

### Task 11: 全量测试与质量检查

**Files:**
- 无新增修改，仅验证

- [ ] **Step 1: 运行 Rust 全量测试**

Run: `cargo test --workspace 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 2: 运行 Rust clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -10`
Expected: 0 warnings

- [ ] **Step 3: 运行前端全量测试**

Run: `cd frontend && pnpm run test 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 4: 运行前端 lint**

Run: `cd frontend && npx eslint . 2>&1 | tail -10`
Expected: 0 errors

- [ ] **Step 5: 运行 TypeScript 类型检查**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`
Expected: 无错误

- [ ] **Step 6: Commit（如有修复）**

```bash
git add -A
git commit -m "chore: fix lint/type/test issues from download redesign"
```

---

### Task 12: 手动集成测试

**Files:**
- 无

- [ ] **Step 1: 启动 Tauri 桌面应用**

Run: `cd ai-digital-life && cargo tauri dev`

- [ ] **Step 2: 测试场景 1 — Range 支持服务器暂停/恢复**

1. 下载有道翻译（Range 支持）
2. 点击暂停 → 应成功暂停
3. 点击恢复 → 应成功恢复
4. 多次反复暂停/恢复

- [ ] **Step 3: 测试场景 2 — 非 Range 服务器暂停确认对话框**

1. 找一个不支持 Range 的服务器下载文件
2. 点击暂停 → 应弹出确认对话框
3. 选择「继续暂停」→ 下载应取消，进度归零
4. 点击恢复 → 应从头开始下载

- [ ] **Step 4: 测试场景 3 — 标签挂起保护**

1. 开始下载一个大文件
2. 切换到其他标签
3. 等待超过挂起超时（或手动触发内存压力）
4. 下载中的标签不应被挂起
5. 下载完成后标签可被正常挂起

- [ ] **Step 5: 测试场景 4 — 原生 Resume() 失败兜底**

（需要模拟原生 Resume() 失败的场景，可能需要长时间暂停后恢复）

- [ ] **Step 6: 记录测试结果**

在进度文件中记录测试结果。
