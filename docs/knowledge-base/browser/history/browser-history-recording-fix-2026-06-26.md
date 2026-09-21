# 浏览器历史记录修复全记录 — 2026-06-26

## 问题现象

在导航器"历史记录"目录中，部分页面访问未被记录，且不同网站表现不一致：
- B 站首页：首次导航不记录，站内跳转后记录
- YouTube 首页：首次导航即记录

## 根因分析

共发现 **6 个独立 Bug**，分布在 Rust 后端和前端共 7 个文件中。按数据流方向排列：

### Bug 1-3：标题等于主机名被错误丢弃

**影响**：Rust 端 3 个元数据检测通道全部或部分失效 → 前端 `handlePageMeta` 再次拦截 → 历史不记录

| # | 位置 | 原行为 | 修复 |
|---|------|--------|------|
| 1 | `browser_navigation.rs` INIT_SCRIPT `isTitleMeaningful()` | `t === hostname` 时返回 `false`，不通过 postMessage 上报 | 仅当 `t === location.href` 时跳过 |
| 2 | `browser_webview.rs` 轮询 `fetch_script` | 同样 `t === location.hostname` 检查 | 移除，仅 `!t` 时 fallback 到 og:title |
| 3 | `useBrowserPageMeta.ts` `handlePageMeta()` | `meta.title === urlHostname` 时直接 `return` | 移除该检查 + 清理无用 `hostnameFromUrl` 导入 |

**为什么 `title === hostname` 不应该被跳过**：一个页面可以合法地将自己的域名设置为标题（例如 dev server `localhost:5173`、`google.com` 等）。只有 `title === full URL` 才能判定为无意义标题。

### Bug 4：同站 SPA 导航不记录历史

**位置**：`useBrowserUrlChange.ts` `onUrlChanged` → `isSameSite` 分支

**场景**：Tauri 模式下，用户在同一个站内 SPA 导航（如 B 站点击视频）。

**根因**：同站分支原本完全依赖 `onMetaChanged` COM 事件来记录历史。但如果 SPA 不改变 `document.title`，meta-changed 不触发，历史永不记录。

**修复**：在同站分支显式调用 `browserAddToHistory`，用当前 tab 标题写入历史。后续真实标题到达时 dedup 自动更新。

### Bug 5：iframe 加载丢失历史（浏览器模式）

**位置**：`useBrowserUrlChange.ts` `handleIframeLoad` + `BrowserPanel.tsx` `submitAddress`

**场景**：浏览器模式（非 Tauri）下，iframe 跨域/同域加载新页面。

**根因**：
- 跨域：`fetchPageMeta` 返回 `null` 时直接 `return`，不写历史
- 同域：标题和图标均为空时不调用 `onPageMeta`，不写历史
- submitAddress：`fetchPageMeta` fallback 只更新 tab 标题，不写历史

**修复**：所有分支添加 `browserAddToHistory(url, url)` 降级写入。

### Bug 6：首次导航 prefetch 成功但丢失历史 ⭐

**位置**：`useBrowserUrlChange.ts:388-392` `tryPrefetch` 回调

**场景**：Tauri 模式下，首次导航到新网站（`browserActiveTabId === ''`）。

**根因**：当 `noTabExists`（无活动标签）且 HTTP prefetch 成功拿到真实标题时：

```
tryPrefetch 回调:
  └─ tab = undefined (activeTabId 为空字符串，JavaScript 中为 falsy)
  └─ else if (!tab):
       ├─ s.browserNavigateActiveTab(url, meta.title)  ← 创建标签，设置标题
       └─ ❌ 没有调用 browserAddToHistory!

稍后 meta-changed 到达:
  └─ handlePageMeta 发现 exactMatch.title === pageTitle
     └─ exactMatch.title !== pageTitle → false → ❌ 跳过历史
     → 最终：历史永远不记录
```

**为什么 B 站不记录但 YouTube 能记录？**：
- **B 站**：HTTP prefetch 成功返回真实标题 → 创建标签但不写历史 → meta-changed 到达时标题匹配 → 跳过
- **YouTube**：HTTP prefetch 失败（没解析到标题）→ fallback 创建空标题标签 → meta-changed 到达时标题不同 → 成功写入

**修复**：在 `!tab` 分支添加 `browserAddToHistory` + `browserUpdateHistoryTitle`。

## 架构洞见：历史记录数据流

```
用户输入 URL
  │
  ├─ submitAddress() → handleNavigationStart() + browserNavigate()
  │
  ├─ onUrlChanged（Tauri 事件 / 轮询）
  │    ├─ noTabExists → defer + prefetchPageMeta + 8s fallback
  │    ├─ urlChanged（已有标签导航）
  │    │    ├─ isSameSite → browserAddToHistory(当前标题)
  │    │    └─ !isSameSite → prefetchPageMeta + 15s fallback
  │    └─ URL 不变 → 跳过（等待 meta-changed）
  │
  ├─ onMetaChanged（3 种 Rust 检测通道）
  │    ├─ Method 1: postMessage（INIT_SCRIPT）
  │    ├─ Method 2: 主动轮询（fetch_script + #adl-meta= hash）
  │    ├─ Method 3: DocumentTitleChanged COM 事件
  │    └─ → handlePageMeta() → browserAddToHistory()
  │
  └─ handleIframeLoad（浏览器模式）
       ├─ 同域 → onPageMeta / 降级 browserAddToHistory
       └─ 跨域 → fetchPageMeta → browserAddToHistory
```

## 关键经验

### 1. 时序依赖的 Race Condition 是最难排查的 Bug

Bug 6 的核心是 `tryPrefetch` 成功时创建了标签但没写历史，导致 meta-changed 到达时认为"已经处理过"而跳过。两个事件源（prefetch HTTP ↔ meta-changed COM）的时序差异导致 B 站和 YouTube 表现不一致。

**教训**：任何"先处理 X，等后续 Y 完成后再做 Z"的设计，必须在 X 处理时也做 Z 的最低保证，然后用 dedup 去重。

### 2. 标题等于主机名的启发式不可靠

`isTitleMeaningful(t)` 中 `t === hostname` 的检查最初是为了过滤 WebView2 `about:blank` 等无意义页面。但合法网站也可能标题等于主机名。**唯一可靠的过滤条件是 `t === location.href`**。

### 3. 历史记录不能依赖单一事件源

初始设计依赖 meta-changed 事件记录所有历史，但这要求页面必须有标题变化才会触发。SPA 无标题变化时历史丢失。修复后：**导航事件本身**（onUrlChanged）也写入历史，meta-changed 补充真实标题。

### 4. 前端状态时序需谨慎

`browserActiveTabId` 初始值为 `''`（空字符串），在 JavaScript 中为 falsy。`activeTabId ? find(...) : undefined` 模式对空字符串的处理导致 `noTabExists` 逻辑中 prefetch 成功也无法找到 tab。**状态初始值应该使用 `null` 而不是 `''` 来表示"无"**。

## 涉及文件

| 文件 | 修改类型 |
|------|----------|
| `crates/browser/src/browser_navigation.rs` | Rust：INIT_SCRIPT isTitleMeaningful 修复 |
| `crates/browser/src/browser_webview.rs` | Rust：轮询脚本 title/hostname 检查移除 |
| `webview2_message.rs` | Rust：DocumentTitleChanged 去重逻辑 |
| `useBrowserUrlChange.ts` | 前端：3 处修复（isSameSite + iframe + prefetch !tab）|
| `useBrowserPageMeta.ts` | 前端：hostname 检查移除 |
| `BrowserPanel.tsx` | 前端：submitAddress 历史写入 |
