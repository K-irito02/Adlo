# 下载暂停/恢复重设计 — 设计文档

**日期：** 2026-08-30
**问题：** 下载暂停/恢复后失败或卡在"进行中"状态
**根因：** HTTP Range 恢复未实现；非 Range 服务器使用"装饰性暂停"导致行为不诚实；不活跃标签挂起会销毁下载中的 WebView2

---

## 1. 问题分析

### 1.1 三个失败路径

| 路径 | 场景 | 当前行为 | 问题 |
|------|------|---------|------|
| A | 服务器支持 Range，原生 `Resume()` 失败 | 返回错误 | 下载彻底失败，无兜底 |
| B | 服务器不支持 Range | 装饰性暂停（UI 暂停，传输继续） | 行为不诚实，用户困惑 |
| C | 原生句柄丢失 | 回退到 Range 但未实现 | 同路径 A |

### 1.2 日志验证结果

测试有道翻译（121MB）和原神（216MB）均成功，均走原生 Pause()/Resume() 路径。问题可能在以下场景触发：
- 暂停时间很长（WebView2 回收原生句柄）
- 某些服务器的原生 Pause/Resume 行为不一致
- 网络不稳定导致原生操作状态异常

### 1.3 不活跃标签挂起对下载的影响（新增发现）

**标签挂起机制：**
- 空闲超时挂起：非活跃标签超过配置时长（默认 1 小时，可设 Off/5/15/30/60/120 分钟）后被销毁
- 内存压力挂起：可用 RAM < 1 GB 或负载 > 90% 时，循环销毁非活跃标签

**对下载的影响：**
- 挂起时 WebView2 被**完全销毁**（`Webview::close()`），不是休眠/冻结
- 原生下载操作句柄（COM 对象）随 WebView2 一起失效
- `handle_download_finished` 被触发，`success=false`，下载标记为 Failed
- 当前**没有**保护机制（`isProtected` 只检查 `isPinned` 和 `isPlayingAudio`，不检查下载状态）
- `DownloadRecord.source_tab_id` 字段存在但**从未被使用**

**结论：** 用户在标签 A 开始下载 → 切换到标签 B → 标签 A 被挂起 → 下载中断 → 尝试恢复时原生句柄已失效 → 失败

---

## 2. 设计方案

### 2.1 总体架构

```
用户点击暂停
  │
  ├─ 服务器支持 Range？
  │     ├─ YES → 原生 Pause() → 用户点击恢复 → 原生 Resume()
  │     │                                    └─ 失败 → HTTP Range 恢复（reqwest）
  │     │
  │     └─ NO → 弹出确认对话框
  │               ├─「继续暂停」→ 取消下载 + 删除 .crdownload + 标记暂停
  │               │                    └─ 用户点击恢复 → reqwest 从头下载
  │               └─「取消」→ 不暂停，继续下载
```

### 2.2 模块拆分

#### 模块 A：HTTP Range 恢复引擎（reqwest）

**职责：** 当原生 WebView2 操作不可用时，使用 reqwest 发起新的 HTTP 请求继续/重新下载。

**核心组件：**

1. **`RangeResumeDownload` 结构体**
   - `url: String` — 下载 URL
   - `file_path: PathBuf` — 目标文件路径（.crdownload）
   - `offset: u64` — 起始字节偏移（Range 恢复 = 已下载字节数，重新下载 = 0）
   - `total_bytes: Option<u64>` — 文件总大小
   - `etag: Option<String>` — 条件请求验证器
   - `last_modified: Option<String>` — 条件请求验证器
   - `client: reqwest::Client` — HTTP 客户端

2. **`start()` 方法**
   - 创建 `GET` 请求，设置 `Range: bytes={offset}-` 头
   - 如果有 `etag`/`last_modified`，添加 `If-Range` 头
   - 以流式方式写入文件（`tokio::io::AsyncWriteExt`）
   - 每接收一定量数据后更新进度（通过 channel 回调）
   - 完成后返回 `Result<RangeResumeResult, RangeResumeError>`

3. **`RangeResumeResult`**
   - `bytes_received: u64`
   - `completed: bool` — 是否完整下载
   - `etag: Option<String>` — 服务器返回的新 ETag
   - `last_modified: Option<String>` — 服务器返回的新 Last-Modified

4. **`RangeResumeError`**
   - `ServerNoRange` — 服务器不支持 Range（416 或 200 响应）
   - `NetworkError(String)` — 网络错误
   - `FileError(String)` — 文件写入错误
   - `InvalidResponse(String)` — 响应格式异常

**文件位置：** `crates/browser/src/download_range_resume.rs`（新文件）

#### 模块 B：非 Range 服务器暂停/恢复

**暂停流程（修改 `pause_download`）：**

1. 检测服务器 Range 支持（`resumability` 缓存）
2. 如果不支持 Range：
   - 取消 WebView2 原生下载操作（`op.Cancel()`）
   - 删除 `.crdownload` 临时文件
   - 更新 DB：`status = Paused`, `interrupt_reason = "NonResumablePaused"`
   - 返回 `DownloadStatus::Paused`
3. 前端收到暂停事件后重置进度为 0

**恢复流程（修改 `resume_download`）：**

1. 检测 `interrupt_reason == "NonResumablePaused"`
2. 使用 `RangeResumeDownload` 从 offset 0 开始下载（等同于重新下载）
3. 复用现有的进度监控线程（`start_download_progress_monitor`）
4. 下载完成后走正常的 `complete_download` 流程

**文件修改：**
- `crates/browser/src/download_manager.rs` — 修改 `pause_download` 和 `resume_download`
- `crates/browser/src/download_handler.rs` — 处理非 Range 服务器的完成事件

#### 模块 C：原生 Resume() 失败时的 HTTP Range 兜底

**恢复流程（修改 `resume_download`）：**

1. 原生 `Resume()` 失败后，不再直接返回错误
2. 检查服务器是否支持 Range（`resumability` 缓存）
3. 如果支持 Range：
   - 获取当前已下载字节数（文件大小）
   - 使用 `RangeResumeDownload` 从 offset `{bytes_received}` 开始
   - 添加 `If-Range` 头（使用存储的 ETag/Last-Modified）
   - 流式写入同一个 `.crdownload` 文件
4. 如果不支持 Range：走模块 B 的重新下载流程

**文件修改：**
- `crates/browser/src/download_manager.rs` — 修改 `resume_download` 的 fallback 路径

#### 模块 D：前端确认对话框

**触发条件：** 用户在不支持 Range 的服务器下载中点击暂停

**对话框内容：**
- 标题：「此服务器不支持暂停」
- 说明：「当前下载的服务器不支持断点续传。暂停后将从头开始下载。」
- 按钮：
  - 「继续暂停」— 真实暂停，删除已下载部分，进度归零
  - 「取消」— 不暂停，继续下载

**文件修改：**
- `frontend/src/app/features/browser/BrowserDownloadItem.tsx` — 暂停按钮点击时检查 Range 支持
- 新建对话框组件（复用项目现有的 Modal/Dialog 组件）

#### 模块 F：下载中标签保护（防挂起）

**职责：** 当标签有活跃下载时，将其加入保护列表，防止被空闲超时或内存压力挂起。

**核心修改：**

1. **`BrowserTabState` 增加 `isDownloading` 字段**
   - 类型：`boolean`
   - 来源：检查 `activeDownloads` 中是否有 `source_tab_id` 匹配当前标签的记录

2. **`isProtected` 函数扩展**
   ```typescript
   const isProtected = (t: BrowserTabState): boolean =>
     t.isPinned || t.isPlayingAudio || t.isDownloading;
   ```

3. **`useBrowserSuspendScheduler` 适配**
   - `applyIdlePass` 中的 `isProtected` 检查自动包含下载状态
   - 无需额外修改（`isProtected` 已在判定路径中）

4. **`source_tab_id` 字段激活**
   - `download_handler.rs` 的 `setup_download_handler` 中，创建下载记录时设置 `source_tab_id` 为当前标签 ID
   - 前端 `subscribeDownloadEvents` 的 `browser-download-started` 事件处理中，根据 `source_tab_id` 更新对应标签的 `isDownloading` 状态

**文件修改：**
- `frontend/src/app/stores/slices/browserTypes.ts` — `BrowserTabState` 增加 `isDownloading`
- `frontend/src/app/features/browser/useBrowserSuspendScheduler.ts` — `isProtected` 增加下载检查
- `crates/browser/src/download_handler.rs` — 创建记录时设置 `source_tab_id`
- `frontend/src/app/stores/slices/browserDownloadsSlice.ts` — 处理 `source_tab_id` 与标签关联
- `frontend/src/app/stores/slices/browserTabsSlice.ts` — `isDownloading` 状态管理

#### 模块 E：进度监控适配

**修改 `start_download_progress_monitor`：**

1. 检测 `interrupt_reason == "NonResumablePaused"` 且状态为 `InProgress`（恢复后）
2. 启动 reqwest 下载线程（替代 WebView2 原生下载）
3. 通过 channel 接收进度更新，发射 `browser-download-progress` 事件
4. 下载完成后触发 `browser-download-finished` 事件

**文件修改：**
- `src-tauri/src/commands/browser_webview_setup.rs` — 扩展进度监控支持 reqwest 下载

---

## 3. 数据流

### 3.1 Range 恢复流程

```
用户点击恢复
  → download_resume (Tauri command)
    → DownloadManager.resume_download()
      → 检查 interrupt_reason
        ├─ "UserPaused" + 有原生句柄 → 原生 Resume()
        │     └─ 失败 → RangeResumeDownload.start(offset=bytes_received)
        ├─ "NonResumablePaused" → RangeResumeDownload.start(offset=0)
        └─ 其他 → get_download_resume_mode() 判断
  → RangeResumeDownload 流式写入 .crdownload
    → 每 500ms 发送进度回调
      → 前端更新进度条
  → 下载完成
    → complete_download() 重命名 .crdownload → 最终文件
    → emit browser-download-finished
```

### 3.3 标签保护流程

```
下载开始
  → browser-download-started 事件
    → 前端收到记录（含 source_tab_id）
      → 更新对应标签的 isDownloading = true
        → isProtected 返回 true
          → 挂起调度器跳过该标签

下载完成/取消/失败
  → browser-download-finished / browser-download-canceled / browser-download-error 事件
    → 前端收到记录
      → 更新对应标签的 isDownloading = false
        → isProtected 恢复正常判定
          → 标签可被挂起
```

### 3.2 非 Range 暂停流程

```
用户点击暂停
  → download_pause (Tauri command)
    → DownloadManager.pause_download()
      → 检查 resumability 缓存
        └─ false (不支持 Range)
          → 弹出前端确认对话框（通过 event）
            ├─ 用户选择「继续暂停」
            │   → op.Cancel() 取消 WebView2 下载
            │   → 删除 .crdownload 文件
            │   → DB: status=Paused, interrupt_reason="NonResumablePaused"
            │   → emit browser-download-paused
            │   → 前端重置进度为 0
            └─ 用户选择「取消」→ 不做任何操作
```

---

## 4. UI 变更

### 4.1 暂停按钮行为变更

| 服务器 Range 支持 | 当前行为 | 新行为 |
|------------------|---------|--------|
| 支持 | 原生 Pause() | 不变 |
| 不支持 | 装饰性暂停 | 弹出确认对话框 |

### 4.2 确认对话框

复用项目现有的 `adl-prompt-modal` 组件（或类似的 Modal 组件），包含：
- 标题
- 说明文本
- 两个按钮（「继续暂停」/「取消」）

### 4.3 恢复按钮状态

非 Range 服务器暂停后，恢复按钮触发重新下载（从头开始），UI 显示：
- 进度从 0% 开始
- 状态文本显示「重新下载中...」

---

## 5. 数据库变更

无需 schema 变更。现有字段足够：
- `interrupt_reason`: 新增值 `"NonResumablePaused"`
- `auto_resume_count`: 重新下载时不计入（这是用户主动操作）
- `etag` / `last_modified`: Range 恢复时使用（非 Range 服务器为 None）

---

## 6. 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| Range 恢复请求返回 200（非 206） | 服务器不支持 Range，从头开始 |
| Range 恢复请求返回 416 | 偏移量超出范围，从头开始 |
| 网络错误 | 重试 3 次，仍失败则标记为 failed |
| 文件写入错误 | 标记为 failed，显示错误原因 |
| .crdownload 文件被手动删除 | 检测文件不存在时从头开始 |

---

## 7. 测试策略

### 7.1 单元测试

- `RangeResumeDownload` 的请求构建（Range 头、If-Range 头）
- `resume_mode` 对 `NonResumablePaused` 的处理
- `pause_download` 对非 Range 服务器的处理

### 7.2 集成测试

- 服务器支持 Range：暂停 → 原生 Resume() → 成功
- 服务器支持 Range：暂停 → 原生 Resume() 失败 → Range 恢复 → 成功
- 服务器不支持 Range：暂停 → 确认对话框 → 暂停 → 恢复 → 从头下载 → 成功
- 暂停后关闭应用 → 重新打开 → 恢复 → Range 恢复/从头下载

### 7.3 手动测试

- 有道翻译下载（Range 支持）：暂停/恢复多次
- 找一个不支持 Range 的服务器测试：暂停确认对话框 + 重新下载
- 长时间暂停（> 5 分钟）后恢复

---

## 8. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `crates/browser/src/download_range_resume.rs` | 新建 | HTTP Range 恢复引擎 |
| `crates/browser/src/download_manager.rs` | 修改 | pause_download / resume_download 逻辑 |
| `crates/browser/src/download_handler.rs` | 修改 | 创建记录时设置 source_tab_id |
| `crates/browser/src/lib.rs` | 修改 | 导出新模块 |
| `src-tauri/src/commands/browser_webview_setup.rs` | 修改 | 进度监控支持 reqwest 下载 |
| `src-tauri/src/commands/download_commands.rs` | 修改 | 新增确认对话框事件 |
| `frontend/src/app/features/browser/BrowserDownloadItem.tsx` | 修改 | 暂停按钮检查 Range 支持 |
| `frontend/src/app/features/browser/BrowserDownloadPauseDialog.tsx` | 新建 | 确认对话框组件 |
| `frontend/src/app/features/browser/useBrowserSuspendScheduler.ts` | 修改 | isProtected 增加下载检查 |
| `frontend/src/app/stores/slices/browserDownloadsSlice.ts` | 修改 | 处理确认对话框 + source_tab_id 关联 |
| `frontend/src/app/stores/slices/browserTabsSlice.ts` | 修改 | isDownloading 状态管理 |
| `frontend/src/app/stores/slices/browserTypes.ts` | 修改 | BrowserTabState 增加 isDownloading |
| `frontend/src/app/i18n/zh-CN/browser.ts` | 修改 | 新增 i18n 键 |
| `frontend/src/app/i18n/en-US/browser.ts` | 修改 | 新增 i18n 键 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| reqwest 下载大文件内存占用 | 可能 OOM | 流式写入，不缓存到内存 |
| reqwest 下载中途网络断开 | 下载失败 | 重试机制 + 保存 offset 可恢复 |
| WebView2 Cancel() 后文件未清理 | 残留 .crdownload | 在 pause_download 中显式删除 |
| 并发下载同一 URL | 重复文件 | 现有去重机制（`get_record_by_url`） |
| 标签挂起销毁下载中的 WebView2 | 下载中断、原生句柄失效 | 模块 F：下载中标签保护（isDownloading） |
| source_tab_id 与标签 ID 不匹配 | 保护失效 | 下载启动时由前端绑定 source_tab_id |
| 内存压力下保护机制与系统稳定性冲突 | 系统卡顿 | 内存压力挂起仍可覆盖下载中标签（安全兜底） |
