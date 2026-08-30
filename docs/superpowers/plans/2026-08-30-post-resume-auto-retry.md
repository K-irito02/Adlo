# 恢复后自动重试 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现恢复后失败自动重试（方案 B），当原生 Resume() 成功但下载在 5 秒内失败时，自动通过 HTTP Range 重试。

**Architecture:** 在 DownloadManager 中添加内存级恢复时间戳追踪，在 handle_download_finished 中检测恢复后失败并自动触发 HTTP Range 回退。无需数据库迁移。

**Tech Stack:** Rust (reqwest, tokio, rusqlite) + TypeScript (React, Zustand, Tauri IPC)

## Global Constraints

- Rust 质量：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）
- 前端质量：ESLint（0 errors）+ Prettier + TypeScript-ESLint + `tsc --noEmit`
- 测试：`cargo test --workspace` + `pnpm --dir frontend run test`
- i18n：所有 UI 文本必须使用 i18n key，禁止硬编码
- 双端一致性：功能必须在 Tauri 桌面和浏览器模式中保持一致
- 设计系统：颜色使用 CSS 自定义属性，图标使用 SVG

---

### Task 1: DownloadManager 添加恢复时间戳追踪

**Files:**
- Modify: `ai-digital-life/crates/browser/src/download_manager.rs`

**Interfaces:**
- Consumes: `DownloadManager`（现有结构）
- Produces: `resume_timestamps: Arc<Mutex<HashMap<String, Instant>>>`, `record_resume()`, `was_recently_resumed()`, `trigger_range_resume()`

- [ ] **Step 1: 在 DownloadManager 中添加 resume_timestamps 字段**

```rust
// download_manager.rs — DownloadManager 结构体
pub struct DownloadManager {
    // ... 现有字段
    /// Tracks when each download was last resumed via native WebView2 Resume().
    /// Key: record ID, Value: timestamp when Resume() returned Ok(()).
    /// Used by handle_download_finished to detect post-resume failures.
    resume_timestamps: Arc<Mutex<HashMap<String, std::time::Instant>>>,
}
```

在 `new()` 方法中初始化：
```rust
resume_timestamps: Arc::new(Mutex::new(HashMap::new())),
```

- [ ] **Step 2: 添加 record_resume 方法**

```rust
/// Record that a download was just resumed via native WebView2 Resume().
/// Called after Resume() returns Ok(()) so handle_download_finished can
/// detect post-resume failures within the 5-second window.
pub fn record_resume(&self, id: &str) {
    if let Ok(mut m) = self.resume_timestamps.lock() {
        m.insert(id.to_string(), std::time::Instant::now());
    }
}

/// Check if a download was resumed within the last `window` seconds.
/// Returns true if the download failed shortly after a resume attempt.
pub fn was_recently_resumed(&self, id: &str, window_secs: u64) -> bool {
    if let Ok(m) = self.resume_timestamps.lock() {
        if let Some(ts) = m.get(id) {
            return ts.elapsed() < std::time::Duration::from_secs(window_secs);
        }
    }
    false
}

/// Clear the resume timestamp for a download (called after successful
/// completion or when auto-retry gives up).
pub fn clear_resume_timestamp(&self, id: &str) {
    if let Ok(mut m) = self.resume_timestamps.lock() {
        m.remove(id);
    }
}
```

- [ ] **Step 3: 在 resume_download 中调用 record_resume**

在 `resume_download` 方法中，native Resume() 返回 Ok(()) 之后：

```rust
// 在 Ok(()) 分支中，return Ok(()) 之前
self.record_resume(id);
```

- [ ] **Step 4: 添加 trigger_range_resume 方法**

```rust
/// Trigger HTTP Range-based resume as a fallback for a failed native Resume().
/// This is called by handle_download_finished when a post-resume failure is detected.
pub fn trigger_range_resume(
    &self,
    id: &str,
    record: &DownloadRecord,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    tracing::info!(
        id = %id,
        url = %record.url,
        bytes_received = record.bytes_received,
        "[ADL-DL] trigger_range_resume: auto-retrying via HTTP Range after post-resume failure"
    );

    let current_offset = std::fs::metadata(format!("{}.crdownload", record.file_path))
        .map(|m| m.len())
        .unwrap_or(record.bytes_received);

    let manager_clone = self.clone();
    let record_id = id.to_string();
    let url_clone = record.url.clone();
    let file_path = record.file_path.clone();
    let total = record.total_bytes;
    let etag = record.etag.clone();
    let lm = record.last_modified.clone();
    let app_handle_clone = app_handle.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new()
            .expect("failed to create tokio runtime for auto-retry HTTP Range resume");
        rt.block_on(async {
            let downloader = super::download_range_resume::RangeResumeDownload::new(
                url_clone,
                std::path::PathBuf::from(format!("{}.crdownload", file_path)),
                current_offset,
                total,
                etag,
                lm,
            );

            match downloader.start().await {
                Ok(_result) => {
                    let _ = manager_clone.complete_download(&record_id, true, None);
                    let _ = manager_clone.clear_resume_timestamp(&record_id);
                    let _ = app_handle_clone.emit(
                        "browser-download-finished",
                        &serde_json::json!({
                            "id": record_id,
                            "success": true,
                        }),
                    );
                }
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        "[ADL-DL] auto-retry HTTP Range resume also failed"
                    );
                    let _ = manager_clone.complete_download(
                        &record_id,
                        false,
                        Some("PostResumeRetryFailed"),
                    );
                    let _ = manager_clone.clear_resume_timestamp(&record_id);
                    let _ = app_handle_clone.emit(
                        "browser-download-finished",
                        &serde_json::json!({
                            "id": record_id,
                            "success": false,
                        }),
                    );
                }
            }
        });
    });

    Ok(())
}
```

- [ ] **Step 5: 运行 Rust 测试验证**

Run: `cd ai-digital-life && cargo test --workspace 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/browser/src/download_manager.rs
git commit -m "feat(download): add resume timestamp tracking and trigger_range_resume"
```

---

### Task 2: handle_download_finished 检测恢复后失败并自动重试

**Files:**
- Modify: `ai-digital-life/crates/browser/src/download_handler.rs`

**Interfaces:**
- Consumes: `DownloadManager.was_recently_resumed()`, `DownloadManager.trigger_range_resume()`, `DownloadManager.get_record_by_url()`
- Produces: handle_download_finished 中的自动重试逻辑

- [ ] **Step 1: 在 handle_download_finished 中添加恢复后失败检测**

在 `handle_download_finished` 函数中，在所有现有的 spurious interrupt 检查之后、`remove_operation` 之前，添加：

```rust
// Post-resume failure detection (Option B): when a download fails within
// 5 seconds of a native Resume() call, auto-retry via HTTP Range instead
// of marking as failed. This catches the case where WebView2's Resume()
// returns Ok(()) but the underlying connection is already broken.
if !success && download_manager.was_recently_resumed(&record.id, 5) {
    tracing::info!(
        record_id = %record.id,
        url = %url,
        bytes_received = record.bytes_received,
        "[ADL-DL] handle_download_finished: post-resume failure detected (Resume() succeeded but download failed within 5s) — auto-retrying via HTTP Range"
    );
    // Don't remove the operation handle yet — trigger_range_resume needs it
    // for the fallback thread (it will be removed when the fallback completes).
    if let Err(e) = download_manager.trigger_range_resume(&record.id, record, app_handle) {
        tracing::error!(
            record_id = %record.id,
            error = %e,
            "[ADL-DL] handle_download_finished: failed to trigger auto-retry"
        );
        // If trigger fails, fall through to normal failure handling
        download_manager.remove_operation(url);
        let _ = download_manager.complete_download(&record.id, false, Some("PostResumeRetryFailed"));
        let _ = app_handle.emit(
            "browser-download-finished",
            &serde_json::json!({
                "id": record.id,
                "url": url,
                "filePath": display_path,
                "success": false,
                "source_tab_id": record.source_tab_id,
            }),
        );
    }
    return;
}
```

- [ ] **Step 2: 添加调试日志**

在 `handle_download_finished` 函数入口处添加详细日志：

```rust
tracing::info!(
    url = url,
    success,
    path = path.map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
    "[ADL-DL] handle_download_finished: ENTRY — success={}, url={}",
    success, url
);
```

- [ ] **Step 3: 运行 Rust 测试验证**

Run: `cd ai-digital-life && cargo test --workspace 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/crates/browser/src/download_handler.rs
git commit -m "feat(download): auto-retry via HTTP Range on post-resume failure"
```

---

### Task 3: 添加调试日志（问题 1 和问题 2）

**Files:**
- Modify: `ai-digital-life/crates/browser/src/download_handler.rs`
- Modify: `ai-digital-life/crates/browser/src/download_manager.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs`

**Interfaces:**
- Consumes: 现有代码
- Produces: 更详细的调试日志

- [ ] **Step 1: 在 download_handler.rs 中添加详细日志**

在 `handle_download_finished` 中：

```rust
// 在 spurious interrupt 检查处添加详细日志
tracing::info!(
    record_id = %record.id,
    record_status = record.status.as_str(),
    interrupt_reason = record.interrupt_reason.as_deref().unwrap_or("none"),
    success = success,
    was_recently_resumed = download_manager.was_recently_resumed(&record.id, 5),
    "[ADL-DL] handle_download_finished: evaluating — status={}, interrupt_reason={}, success={}, was_recently_resumed={}",
    record.status.as_str(),
    record.interrupt_reason.as_deref().unwrap_or("none"),
    success,
    download_manager.was_recently_resumed(&record.id, 5)
);
```

- [ ] **Step 2: 在 download_manager.rs 的 resume_download 中添加详细日志**

在 native Resume() 调用处：

```rust
tracing::info!(
    id = %id,
    url = %url,
    "[ADL-DL] resume_download: calling native WebView2 op.Resume()..."
);
match unsafe { op.Resume() } {
    Ok(()) => {
        tracing::info!(
            id = %id,
            url = %url,
            "[ADL-DL] resume_download: native WebView2 download RESUMED successfully — recording resume timestamp"
        );
        self.record_resume(id);
        // ... existing code
    },
    // ...
}
```

- [ ] **Step 3: 在 browser_webview_setup.rs 的进度监控中添加详细日志**

在 NonResumablePaused 恢复检测处：

```rust
tracing::info!(
    record_id = %record.id,
    status = record.status.as_str(),
    interrupt_reason = record.interrupt_reason.as_deref().unwrap_or("none"),
    bytes_received = record.bytes_received,
    "[ADL-DL] progress monitor: evaluating resume state — status={}, interrupt_reason={}, bytes_received={}",
    record.status.as_str(),
    record.interrupt_reason.as_deref().unwrap_or("none"),
    record.bytes_received
);
```

- [ ] **Step 4: 运行 Rust 测试验证**

Run: `cd ai-digital-life && cargo test --workspace 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/browser/src/download_handler.rs ai-digital-life/crates/browser/src/download_manager.rs ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs
git commit -m "chore(download): add detailed debug logging for pause/resume flows"
```

---

### Task 4: 前端处理恢复后自动重试的短暂失败状态

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserDownloadsSlice.ts`

**Interfaces:**
- Consumes: `browser-download-finished` 事件
- Produces: 前端正确处理自动重试的短暂失败状态

- [ ] **Step 1: 在 browser-download-finished 事件处理中添加重试状态处理**

```typescript
// browserDownloadsSlice.ts — subscribeDownloadEvents
void listen<DownloadFinishedPayload>('browser-download-finished', (event) => {
  if (!active) {
    return;
  }
  const payload = event.payload;
  set((state) => {
    const { [payload.id]: _removed, ...rest } = state.activeDownloads;
    const newStatus = payload.success ? 'completed' : 'failed';
    // Find the download record to get source_tab_id
    const downloadRecord = state.downloads.find((d) => d.id === payload.id);
    const sourceTabId = downloadRecord?.source_tab_id;
    // Update the source tab's isDownloading flag
    const nextTabs = sourceTabId
      ? state.browserTabs.map((t) =>
          t.id === sourceTabId ? { ...t, isDownloading: false } : t,
        )
      : state.browserTabs;
    return {
      activeDownloads: rest,
      downloads: state.downloads.map((d) =>
        d.id === payload.id
          ? {
              ...d,
              status: newStatus as DownloadRecord['status'],
              file_path: payload.filePath,
              completed_at: Math.floor(Date.now() / 1000),
            }
          : d,
      ),
      browserTabs: nextTabs,
      browserTabsById: buildTabsById(nextTabs),
    };
  });
}).then((unsub) => {
  if (active) {
    unsubs.push(unsub);
  } else {
    void Promise.resolve(unsub()).catch(() => {});
  }
});
```

- [ ] **Step 2: 运行前端测试验证**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserDownloadsSlice.ts
git commit -m "feat(download): frontend handles post-resume auto-retry state"
```

---

### Task 5: 完整测试验证

**Files:**
- 无新增文件

**Interfaces:**
- 无

- [ ] **Step 1: 运行 Rust 测试**

Run: `cd ai-digital-life && cargo test --workspace 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 2: 运行前端测试**

Run: `cd ai-digital-life/frontend && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 3: 运行 Clippy 检查**

Run: `cd ai-digital-life && cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -20`
Expected: 0 warnings

- [ ] **Step 4: 运行 ESLint 检查**

Run: `cd ai-digital-life/frontend && npx eslint . 2>&1 | tail -20`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(download): verify post-resume auto-retry implementation"
```

---

### Task 6: 文档更新

**Files:**
- Modify: `docs/root-cause-resolution/2026-08/progress-2026-08-30-120000.md`

**Interfaces:**
- 无

- [ ] **Step 1: 更新进度文件**

在进度文件中添加恢复后自动重试的实现记录：

```markdown
## 恢复后自动重试（方案 B）实现

### 问题描述
原生 WebView2 Resume() 返回 Ok(())，但下载在 ~86ms 后失败。这是因为 TCP 连接已断开，WebView2 只在尝试读取下一个数据块时才发现失败。

### 解决方案
在 handle_download_finished 中检测恢复后失败（Resume() 成功后 5 秒内失败），自动通过 HTTP Range 重试。

### 实现细节
1. DownloadManager 添加 `resume_timestamps` 内存追踪
2. resume_download 在 Resume() 成功后记录时间戳
3. handle_download_finished 检测 5 秒窗口内的失败
4. 自动触发 HTTP Range 回退，无需数据库迁移
5. 回退失败后标记为 `PostResumeRetryFailed`

### 测试结果
- Rust 测试：629 通过
- 前端测试：1995 通过
- Clippy：0 warnings
- ESLint：0 errors
```

- [ ] **Step 2: Commit**

```bash
git add docs/root-cause-resolution/2026-08/progress-2026-08-30-120000.md
git commit -m "docs: update progress with post-resume auto-retry implementation"
```
