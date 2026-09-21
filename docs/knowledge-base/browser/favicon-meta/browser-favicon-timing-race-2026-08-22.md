# Favicon 静默抓取时序竞争修复

**日期**: 2026-08-22
**来源**: 根因排查 + closing-workflow 复审
**关联**: progress-2026-08-22-153000.md

## 问题

新建书签时显示站点首字母兜底而非真实 favicon。

## 根因

静默抓取管线 `poll_silent_meta` 中的时序竞争：

1. 首次静默抓取返回**标题但无 favicon**（页面未完全加载，favicon 的 `<link>` 标签尚未解析）
2. `partial_ms` (1500ms) 到期后直接返回 title-only 结果
3. `silent_cache_hit` 检测到缓存已有有效标题，跳过后续重试
4. 该 URL 永久无 favicon data-URI

关键代码路径：
- `browser.rs:poll_silent_meta` — 超时分发逻辑
- `meta_merge.rs:silent_cache_hit` — 标题存在即跳过
- `meta_cache_bridge.rs:report` — 标题非空才写入缓存

## 修复方案

### 后端（核心修复）

`poll_silent_meta` 新增 `favicon_extended` 状态：当 title-only 到达 `partial_ms` 时，不立即返回，而是额外等待 `FAVICON_ONLY_WAIT_MS = 3000ms`，让 favicon 有时间被 Method 1/3/4 检测到。

时序预算：`partial_ms` (1500ms) + `FAVICON_ONLY_WAIT_MS` (3000ms) = 4500ms，外层 `SILENT_FETCH_TIMEOUT_MS` (6000ms) 兜底。

### 前端（双层防御）

1. `waitForFavicon`：save-only 路径中等待 `pageMeta-updated` 事件 ≤4s，确保 favicon 就绪后再创建书签
2. `scheduleFaviconFetch`：所有书签创建路径后延迟 2s 调用 `getSilent` 作为兜底

### 事件监听泄漏修复

`waitForFavicon` 中的 `pageMetaClient.subscribeUpdated` 在组件卸载时可能未清理。通过 `pendingFaviconCleanupRef` + cleanup `useEffect` 确保正确清理。

## 经验教训

1. **静默 WebView 首次抓取不可靠**：页面未完全加载时 favicon 的 `<link>` 标签可能尚未被 JS 动态添加（如 Google Scholar）。需要给 favicon 检测留出额外时间窗口。

2. **`silent_cache_hit` 过滤需谨慎**：仅凭标题存在就跳过重试会导致 favicon 缺失永久化。修复时需同时考虑标题和 favicon 两个维度。

3. **双层防御设计**：后端延长等待 + 前端事件监听形成互补。后端确保大多数情况下 favicon 在首次抓取时就到达；前端处理后端遗漏的边缘情况。

4. **调试日志分级**：
   - `tracing::debug!` 用于关键事件路径（生产默认不输出）
   - `tracing::trace!` 用于高频事件（每轮 WebView 消息）
   - 前端 `console.info` 诊断日志在功能验证后应清理

5. **data-URI 泄露防护**：日志中输出 favicon 内容时必须截断（40 字符），避免完整 base64 字符串泄露。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `crates/browser/src/browser.rs` | `poll_silent_meta` favicon 感知延长等待 |
| `frontend/src/app/features/browser/useBrowserDialogs.ts` | `waitForFavicon` + `scheduleFaviconFetch` + 事件监听泄漏修复 |
| `crates/browser/src/init_script.js` | 移除 console.log（违反项目规则） |
| `frontend/src/app/utils/siteMetaCache.ts` | 清理诊断日志 + 移除未用 `prev` 变量 |
| `frontend/src/app/components/BrowserFavicon.tsx` | 清理诊断日志 |
| `frontend/src/app/utils/favicon.ts` | 清理诊断日志 |
| `frontend/src/app/features/browser/useBrowserTagActions.ts` | 清理诊断日志 |
