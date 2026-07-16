# 标签页元数据延迟创建与同步更新机制

## 概述

本会话（2026-06-25）重构了浏览器标签页的创建与元数据同步策略。核心变更：标签页不再使用占位标题（主机名/URL），而是在确认获取到真实标题和 favicon 后才创建/更新，且两者在同一次渲染中同时出现。

## 问题背景

### 问题列表

| # | 问题 | 现象 |
|---|------|------|
| 1 | 标签标题显示主机名 | 导航后标签显示 "www.bilibili.com"，后变成 "哔哩哔哩" |
| 2 | 标签标题过渡动画 | 从主机名 → 真实标题的变化过程可见 |
| 3 | Favicon 与标题不同步 | Favicon 先出现，标题数秒后才更新 |
| 4 | 历史记录中的冗余条目 | 同一页面因 URL 变体（`?vd_source=...`）产生多个历史条目，其中一个永久显示主机名 |
| 5 | 后退导航丢失真实标题 | 后退时历史条目被 URL 占位符覆盖，meta 到来后又恢复，产生 URL→标题→URL→标题循环 |

## 最终架构

### 核心原则

**在所有视图（标签栏、导航树、历史记录树）中一致应用：**
- 未获取到 favicon 与标题前不创建/更新标签
- Favicon 与标题必须在同一次渲染中同时出现
- 仅确认永远无法获取真实标题后才使用兜底方案（URL 作为标题）

### 标签创建流程

```
onUrlChanged 触发
  │
  ├─ noTabExists（无活动标签）
  │    └─ 延迟创建，启动 prefetchPageMeta + 8s 兜底定时器
  │         ├─ prefetch 成功 → browserNavigateActiveTab(url, title) + setCachedFavicon 同时调用
  │         └─ 8s 超时 → browserNavigateActiveTab(url) 用 URL 作标题
  │
  └─ urlChanged（已有标签导航）
       └─ browserNavigateActiveTab(url) 立即更新 URL，保持旧标题/favicon
            └─ 启动 prefetchPageMeta + 15s 兜底定时器
                 ├─ prefetch 成功 → setCachedFavicon + browserUpdateTab(title) 同时调用
                 └─ 15s 超时 → 标题仍为空时设 URL 为标题
```

### 历史去重机制

引入 `historyDedupKey(url)` 函数，按 hostname + pathname 去重（忽略 query params、hash、尾部斜杠）：

- `browserNavigateActiveTab` 创建历史条目时使用此键过滤
- `browserAddToHistory` / `browserUpdateHistoryTitle` 更新时使用此键匹配
- **关键**: 如果已存在具有真实（非 URL）标题的条目，保留原条目不覆盖，仅刷新 visitedAt
- 树视图中过滤掉名称仍为空的条目（仅 URL 标题的不可见）

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/features/browser/useBrowserUrlChange.ts` | `onUrlChanged` 事件处理：延迟创建 + prefetch + 兜底定时器 |
| `frontend/src/app/features/browser/useBrowserPageMeta.ts` | `handlePageMeta`：仅在真实标题可用时缓存 favicon 并更新标签 |
| `frontend/src/app/utils/fetchPageMeta.ts` | `prefetchPageMeta`：HTTP 标题预取 |
| `frontend/src/app/utils/browserDisplayUtils.ts` | `historyDedupKey` + `normalizeTabTitle` |
| `frontend/src/app/stores/slices/browserSlice.ts` | 新建标签标题为空 + 历史 path 去重 + 保留真实标题 |
| `frontend/src/app/stores/slices/browserTabsSlice.ts` | 新建标签标题为空 |
| `frontend/src/app/stores/slices/browserHistorySlice.ts` | 历史条目 path 去重 |
| `frontend/src/app/features/browser-tree/useBrowserTreeData.ts` | 历史树过滤无真实标题条目 |

## 关键经验

### 1. Favicon 缓存必须在标题更新时同时进行

**问题**：`handlePageMeta` 在 `if (!meta.title)` 检查前缓存 favicon，导致标题为空时 favicon 已缓存。后续标题更新触发渲染时 favicon 已在缓存中，但标题还没有——用户看到 favicon 先出现。

**解决**：将 favicon 缓存移至 `if (!meta.title)` 检查之后，仅在真正要更新标题时才缓存 favicon。两者在同一次 Zustand 渲染中同时出现。

**位置**：`useBrowserPageMeta.ts`

### 2. 历史条目 title 不使用 hostname 作为兜底

**问题**：`browserNavigateActiveTab` 用 `hostnameFromUrl(url)` 作为历史条目标题，导致树视图显示主机名。当真实标题到达时，主机名被替换，产生可见过渡。

**解决**：用 `url` 代替 `hostnameFromUrl` 作为标题兜底。`normalizeTabTitle` 对 URL 返回空字符串，树视图中过滤掉空名称条目。条目仅在获取真实标题后出现在树中。

**位置**：`browserSlice.ts`、`browserHistorySlice.ts`

### 3. 历史去重键应基于 path 而非完整 URL

**问题**：SPA 网站的重定向会在 URL 后附加 tracking query params（如 `?vd_source=...`），触发第二个 `onUrlChanged`。两次导航创建不同 URL 的历史条目，第二个被 meta 更新，第一个永久显示占位符标题。

**解决**：引入 `historyDedupKey(url)` 按 hostname + pathname 去重，忽略 query params/hash/trailing slash。所有历史操作（创建、更新、标题修正）均使用此键。

**位置**：`browserDisplayUtils.ts` → `historyDedupKey()`

### 4. 后退导航不应覆盖已有真实标题

**问题**：点击后退时 `onUrlChanged` 触发 `browserNavigateActiveTab`，用 URL 占位符替换了已有的真实标题历史条目。meta 到来后又恢复，造成标题→URL→标题循环。

**解决**：`browserNavigateActiveTab` 创建历史条目时检查是否有同 key 条目已有真实标题。若有，保留标题仅刷新 visitedAt。回退导航不丢失已解析信息。

**位置**：`browserSlice.ts`

### 5. 多 `onUrlChanged` 事件的统一处理

**问题**：bilibili 等网站的一次点击触发多个 `onUrlChanged` 事件（初始导航 + redirect + tracking param 追加）。每个事件都调用 `browserNavigateActiveTab` 创建独立历史条目。

**解决**：`historyDedupKey` 确保同一 path 的所有 URL 变体被归为一个条目。树视图过滤空名称条目，用户不会看到未解析的占位符。

**位置**：`browserSlice.ts`、`useBrowserTreeData.ts`

### 6. 重复 `onUrlChanged` 的 prefetch 去重

**问题**：`onUrlChanged` 在初次导航时触发两次（`www.youtube.com` 不带斜杠 vs 带斜杠），两次都进入 `noTabExists` 逻辑并各自发起 HTTP prefetch，浪费 10s。

**解决**：引入 `pendingPrefetchRef`（`Set<string>`），在 `noTabExists` 模式下若同一 URL 已有 prefetch 待处理则直接跳过该次 `onUrlChanged`。

**位置**：`useBrowserUrlChange.ts`（`pendingPrefetchRef.current.has(normalizedUrl)`）

### 7. 同站 SPA 导航跳过 HTTP prefetch

**问题**：YouTube 等 SPA 网站的自动连播靠 COM/poll（Method 3/2）即可在 2s 内捕获标题。HTTP prefetch 对同站导航是冗余的，且 YouTube 阻截 HTTP，每次浪费 5s。

**解决**：`onUrlChanged` 时判断新 URL 是否与当前标签同站（hostname 相同）。若是，跳过 HTTP prefetch 整个代码块。URL emit dedup（4000ms 窗口）确保 HistoryChanged 高频回调不触发重复逻辑。

**位置**：`useBrowserUrlChange.ts`（`isSameSite` 检查）

### 8. Stale meta 不污染历史目录

**问题**：SPA 自动连播时，URL 先更新但 `document.title` 滞后。Method 2/3 在首次轮询时捕获旧标题+新URL，`handlePageMeta` 无条件调用 `browserAddToHistory`，导致历史目录闪现旧视频标题。

**解决**：`handlePageMeta` exactMatch 分支将 `browserAddToHistory` / `browserUpdateHistoryTitle` 移至 `exactMatch.title !== pageTitle` 条件内。若标题未变（stale meta），跳过历史插入。正确标题到达时创建/更新。

**位置**：`useBrowserPageMeta.ts`

### 9. `browserNavigateActiveTab` 不再创建历史条目

**问题**：`browserNavigateActiveTab` 在无 title 参数时用 `title || url` 作为历史条目标题，导致历史面板闪现完整 URL 约 2s。

**解决**：移除 `browserNavigateActiveTab` 中所有历史条目创建逻辑。历史条目的创建和更新统一由 `handlePageMeta`（`browserAddToHistory` / `browserUpdateHistoryTitle`）管理。

**位置**：`browserSlice.ts`

### 10. HTTP prefetch MAX_RETRIES 设为 1

**问题**：`MAX_RETRIES = 3` 对于始终阻截 HTTP 的网站（如 YouTube），每次浪费 15s。

**解决**：设为 1。第一次尝试失败后不再重试。对于跨站导航，COM/poll 和 fallback timeout（8s/15s）提供兜底。

**位置**：`useBrowserUrlChange.ts`

### 11. `fetch_page_meta_inner HTTP failed` 降级为 INFO

**问题**：YouTube 阻截 HTTP 是预期行为，`tracing::warn!` 产生不必要的人为告警噪声。

**解决**：改为 `tracing::info!`。

**位置**：`src-tauri/src/commands/browser.rs`

## 调试日志

### 新增日志

| 日志 | 位置 | 说明 |
|------|------|------|
| `prefetchPageMeta: starting for` | `fetchPageMeta.ts` | HTTP 预取开始 |
| `prefetchPageMeta: success in Xms, title:` | `fetchPageMeta.ts` | HTTP 预取成功 |
| `prefetchPageMeta: failed after Xms` | `fetchPageMeta.ts` | HTTP 预取失败/超时 |
| `prefetchPageMeta: no title in result` | `useBrowserUrlChange.ts` | 预取返回空标题 |
| `prefetchPageMeta: title received:` | `useBrowserUrlChange.ts` | 预取返回标题内容 |
| `prefetchPageMeta: tab.title: X meta.title: Y same:` | `useBrowserUrlChange.ts` | 标题比较结果 |

## 相关文件

### Rust 端
- `crates/browser/src/browser_webview.rs` — 轮询线程（快/慢轮询）
- `crates/browser/src/browser_events.rs` — 事件去重与发射
- `crates/browser/src/webview2_message.rs` — postMessage 处理
- `src-tauri/src/commands/browser.rs` — `browser_fetch_page_meta` HTTP 预取命令

### 前端
- `frontend/src/app/features/browser/useBrowserUrlChange.ts` — URL 变化处理器
- `frontend/src/app/features/browser/useBrowserPageMeta.ts` — 元数据处理器
- `frontend/src/app/features/browser/useBrowserMetaSubscription.ts` — 元数据事件订阅
- `frontend/src/app/utils/fetchPageMeta.ts` — HTTP 预取工具
- `frontend/src/app/utils/browserDisplayUtils.ts` — URL 标准化工具
- `frontend/src/app/stores/slices/browserSlice.ts` — 核心浏览器切片
- `frontend/src/app/stores/slices/browserTabsSlice.ts` — 标签切片
- `frontend/src/app/stores/slices/browserHistorySlice.ts` — 历史切片
- `frontend/src/app/features/browser-tree/useBrowserTreeData.ts` — 树状导航数据构建
