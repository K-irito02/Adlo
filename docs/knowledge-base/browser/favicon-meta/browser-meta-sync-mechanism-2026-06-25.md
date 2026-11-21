# 浏览器页面元数据（title/favicon）实时同步机制

## 概述

内置浏览器功能中，标签页的标题（title）和图标（favicon）需要与 WebView 中加载的网页保持同步。本文档总结了实现这一功能的技术方案、遇到的问题以及最终的架构设计。

## 最终架构：双层同步机制

### Method 1：WebView2 postMessage（实时通道）

**位置**：`crates/browser/src/browser_navigation.rs` 中的 INIT_SCRIPT

- **原理**：利用 WebView2 的 `chrome.webview.postMessage` API，页面 JavaScript 主动向 Rust 端发送元数据变更通知
- **触发时机**：
  - 页面初始化时（setTimeout 0ms）
  - DOMContentLoaded 事件
  - window load 事件
  - MutationObserver 监听 `<title>` 元素变化
  - `document.title` setter 劫持
  - MutationObserver 监听 `<link rel*="icon">` 元素变化
  - MutationObserver 监听 `<head>` 子节点变化（新增/删除 favicon link）
  - history.pushState / replaceState 拦截
  - popstate 事件
- **优点**：实时性最高，页面一有变化立即上报
- **缺点**：依赖页面 JS 执行时机，某些情况下可能错过初始状态

### Method 2：Rust 端主动轮询（可靠通道）

**位置**：`crates/browser/src/browser_webview.rs` 中的监控线程

- **原理**：Rust 端定期轮询 WebView 的 URL，URL 变化时进入快速轮询模式，通过 `webview.eval()` 调用页面的 `window.__adlGetMeta()` 获取元数据
- **轮询策略**：
  - 普通模式：5 秒轮询一次（仅检测 URL 变化）
  - 快速模式：URL 变化后 3 秒内，~100ms 轮询一次（同时检测 URL 和获取 meta）
- **通信方式**：通过 `history.replaceState` 设置 `#adl-meta=...` hash，Rust 端检测到 hash 后解析数据
- **优点**：可靠性高，不依赖页面事件触发时机
- **缺点**：有轻微延迟（取决于轮询间隔）
- **关键修复**（2026-06-25）：
  - 移除 `should_exit_fast` 早退逻辑：原代码在首次获取到任意非空标题后立即退出快速轮询，导致 SPA 页面后续真实标题无法被检测。修复后快速轮询跑满 3 秒完整窗口。
  - 修正 `fetch_script` 条件 `meta && (meta.title || meta.favicon)` → `meta && meta.title`：避免在 `__adlGetMeta` 返回空标题 + 非空 favicon + `pending:true` 时直接使用空标题跳过 `directTitle` 回退路径。

### Method 3：WebView2 DocumentTitleChanged 原生事件（零延迟通道）

**位置**：`crates/browser/src/webview2_message.rs` 中的 `setup_document_title_handler`

- **原理**：利用 WebView2 的 `ICoreWebView2` 原生 COM 接口订阅 `DocumentTitleChanged` 事件。当 `document.title` 变化时，WebView2 直接回调 Rust，延迟 < 1ms。
- **优势**：不需要任何 JS 注入或消息队列，标题变化时的响应速度是零延迟的。
- **favicon 联动**：与 Method 4（FaviconChanged）共享一个线程安全的 `FAVICON_CACHE`。回调时先查缓存，如果有缓存的 favicon URL，一起发射到前端。
- **兼容性**：`DocumentTitleChanged` 在 `ICoreWebView2` 基础接口上，所有 WebView2 版本都支持。
- **关键实现**：
  - 使用 `sender.DocumentTitle(&mut pwstr)` 获取标题
  - 使用 `sender.Source(&mut pwstr)` 获取当前 URL
  - 从 `FAVICON_CACHE` 查询缓存的 favicon URL
  - 发射 `digital-life://browser-meta-changed` 事件

### Method 4：WebView2 FaviconChanged 原生事件（favicon 缓存通道）

**位置**：`crates/browser/src/webview2_message.rs` 中的 `setup_favicon_changed_handler`

- **原理**：利用 WebView2 的 `ICoreWebView2_15` 接口（需要 SDK 1.0.2950+）订阅 `FaviconChanged` 事件。
- **行为**：回调中仅缓存 favicon 到 `FAVICON_CACHE`，不发射事件。标题由 Method 3 从缓存读取后统一发射。
- **为什么仅缓存**：`FaviconChanged` 回调中 `sender.DocumentTitle()` 经常返回空字符串（WebView2 COM 行为），无法发射完整的事件。简化为"只缓存，供 Method 3 读取"。
- **兼容性**：`ICoreWebView2_15` cast 失败时静默降级（日志警告），回退到 Method 1/2。

### 三路优先级

| 优先级 | 方法 | 延迟 | 跨平台 | 说明 |
|--------|------|------|--------|------|
| 1（最快） | Method 3 DocumentTitleChanged | <1ms | Windows only | 标题默认路径 |
| 2 | Method 4 FaviconChanged | <1ms（缓存） | Windows only（≥SDK 1.0.2950） | 仅缓存 favicon，不发射 |
| 3（备份） | Method 1 postMessage | ~10ms | Windows only | 备用：标题+favicon |
| 4（兜底） | Method 2 Rust 轮询 | 100ms~5s | 全平台 | 最终兜底 |

### Rust 侧去重 + 旧标题检测

**位置**：`crates/browser/src/webview2_message.rs`

**背景**：三个独立源（Method 1/3/4）可能对相同 `(url, title, favicon)` 并发发射，导致前端重复处理。同时，自动连播（pushState）场景中，`document.title` 尚未更新时，Rust 端收到旧标题+新URL → 产生旧标题闪现。

**解决方案**：`should_emit_and_update(url, title, favicon)` 去重函数：

| 条件 | 结果 |
|------|------|
| 同 `(url, title, favicon)` + 1s 内 | 重复 → 跳过 |
| `url` 不同 + 同 `(title, favicon)` | 旧标题 → 跳过 |
| `url` 相同 + favicon 不同 | 允许（favicon 迟到补发） |
| 空标题 | 跳过 |

三个 handler（DocumentTitleChanged、postMessage、FaviconChanged）都使用该函数检查后再发射。

### 数据去重机制

**位置**：`crates/browser/src/browser_events.rs`

- 两个来源（postMessage + 轮询）共享同一个 `LAST_EMIT` 去重变量
- 去重窗口：4 秒（大于普通轮询间隔 5 秒的 80%）
- 避免相同 URL 被重复 emit

## 前端处理架构

### 事件订阅

**位置**：`frontend/src/app/features/browser/useBrowserMetaSubscription.ts`
**位置**：`frontend/src/app/features/browser/useBrowserUrlChange.ts`

- 订阅 `digital-life://browser-meta-changed` 事件（title + favicon）
- 订阅 `digital-life://browser-url-changed` 事件（URL 变化）

### URL 变化处理 — 延迟创建策略

**位置**：`frontend/src/app/features/browser/useBrowserUrlChange.ts`

**核心原则**：不创建/更新带占位符标题的标签，等待真实标题和 favicon 都可用后一次性创建。

- **无活动标签（noTabExists）**：延迟标签创建。启动 `prefetchPageMeta`（HTTP 预取）+ 8s 兜底定时器。预取成功时传入真实标题创建标签；超时时用 URL 作标题创建（兜底）。
- **已有标签导航（urlChanged）**：立即更新 URL 以追踪 WebView，保持旧标题/favicon 不变。启动 `prefetchPageMeta` + 15s 兜底定时器。预取成功时同时缓存 favicon 并更新标题。
- **always**: 当预取返回真实标题时，`setCachedFavicon` + `browserUpdateTab(title)` 在同一回调中执行 → 同一次渲染中同时出现。

### Favicon 缓存管理

**位置**：`frontend/src/app/utils/fetchPageMeta.ts`

- 使用 URL（归一化后）作为缓存键
- 归一化规则：去除 hash、去除尾部斜杠
- 质量评分系统：根据文件类型、尺寸、命名特征评分
- 仅当新 favicon 评分高于现有缓存时才更新
- **同步规则**：`handlePageMeta` 仅在 `meta.title` 非空时才缓存 favicon。`prefetchPageMeta` 的回调中则始终缓存 favicon（即使标题与旧标题相同，触发历史更新渲染）。

### Title 处理逻辑

- URL 变化时：**不设置任何占位符标题**。标签标题保持为空（新标签）或保留旧标题（已有标签导航）。
- Meta 上报时：有意义的 title 才接受（非空、不等于 hostname），且 favicon 与 title 同时更新。
- 收藏的标签标题不受页面跳转影响（title lock 机制）。
- **一致性原则**：所有视图（标签栏、导航树、历史树）统一——标题为空时不显示文字，仅出现真实标题。

## 关键问题与解决方案

### 问题 1：SPA 导航不触发 on_navigation

**现象**：Bilibili 等网站使用 `history.pushState` 进行页面切换，Tauri 的 `on_navigation` 回调不会触发，导致 URL 变化无法检测。

**解决方案**：
- 在 INIT_SCRIPT 中拦截 `history.pushState`、`history.replaceState`
- 监听 `popstate` 事件
- 拦截后主动调用 `reportMeta()` 上报

### 问题 2：自动跳转时 title/favicon 不更新

**现象**：视频播放完自动跳转、登录页自动跳转等场景，标签标题和图标不更新。

**根本原因**：仅依赖 `on_navigation` 回调，而 SPA 导航不触发该回调。

**解决方案**：
- 双层机制：postMessage + Rust 端轮询
- URL 变化时进入快速轮询模式，确保即使 postMessage 失败也能通过轮询获取

### 问题 3：空 title 时 favicon 也不更新 → ［已重构］

**现象**：页面加载初期 title 为空，但 favicon 已经可用，此时 handlePageMeta 直接 return，导致 favicon 不更新。

**旧解决方案（已废弃）**：
- ~~空 title 时仍然缓存 favicon~~
- ~~Favicon 通过独立的缓存 + 订阅机制更新，不依赖 title~~

**当前方案**（2026-06-25 重构）：
- **不再**在空 title 时缓存 favicon——否则 favicon 会先于标题出现，破坏同步性
- 仅在 `meta.title` 非空时才缓存 favicon，与标题更新在同一次渲染中完成
- HTTP 预取路径（`useBrowserUrlChange.ts`）中则始终缓存 favicon（由历史条目更新触发渲染）

### 问题 4：低质量 favicon 覆盖高质量版本

**现象**：Rust 端 HTTP fetch 返回的默认 `favicon.ico` 覆盖了 JS 上报的高质量 PNG 图标。

**解决方案**：
- 实现 favicon 质量评分系统
- 评分维度：文件类型（SVG > PNG > ICO）、尺寸（越大越好）、命名特征（apple-touch-icon 加分）
- 仅当新 favicon 评分更高时才更新缓存

### 问题 5：URL 归一化不一致

**现象**：同一页面带 hash 和不带 hash 被视为不同 URL，导致缓存分散。

**解决方案**：
- 统一归一化规则：去除 hash、去除尾部斜杠
- 缓存键、去重、标签匹配都使用归一化后的 URL

### 问题 6：Bilibili 首页 title 不更新

**现象**：Bilibili 首页加载后，`__adlGetMeta` 返回空 title，但 `document.title` 实际上有值。

**根本原因**：INIT_SCRIPT 注入时，Bilibili 的 JS 还未设置 title，导致 `hasTitle` 状态不正确。

**解决方案**：
- Rust 端轮询脚本添加 fallback 逻辑
- 如果 `__adlGetMeta` 返回空，直接读取 `document.title` 作为备用
- 有效性检查：确保 title 不是空的，也不是纯 hostname

### 问题 7：网址输入框回车后不创建标签页 → ［已重构］

**现象**：用户在地址栏输入网址回车后，"已打开的标签"下没有显示标签，必须等页面 JS 上报 title 后才显示。

**旧解决方案（已废弃）**：
- ~~在 `onUrlChanged` 回调中立即创建标签页~~
- ~~使用 hostname 作为临时标题~~
- ~~后续 meta 上报后自动更新标题~~

**当前方案**（2026-06-25 重构）：
- 有活动标签时：立即更新标签 URL，保持旧标题/favicon，不设占位符
- 无活动标签时：延迟创建，等预取或超时后创建
- 标签标题初始为空，不在标签栏显示文字（仅显示 favicon）

## URL 归一化规则

```
归一化步骤：
1. 去除 hash 部分（# 及之后的内容）
2. 去除尾部斜杠（如果 pathname 长度 > 1）
3. 统一协议和 hostname 大小写

示例：
https://www.bilibili.com/video/BV123/?t=10#t=5
→ https://www.bilibili.com/video/BV123?t=10
```

## Favicon 质量评分规则

| 特征 | 评分 |
|------|------|
| SVG 格式 | 200 |
| PNG/JPG/WebP/GIF + 尺寸 ≥ 256px | 115 |
| PNG/JPG/WebP/GIF + 尺寸 ≥ 128px | 114 |
| PNG/JPG/WebP/GIF + 尺寸 ≥ 64px | 113 |
| PNG/JPG/WebP/GIF + 尺寸 ≥ 32px | 112 |
| apple-touch-icon | 113 |
| 包含 512/256/192/180 尺寸标识 | 114 |
| ICO 格式（非 favicon.ico） | 5 |
| favicon.ico | 1 |
| Google 等代理服务 | 1 |

## 调试日志

### 日志标签

| 标签 | 位置 | 说明 |
|------|------|------|
| `[ADL-META]` | 页面 JS（INIT_SCRIPT） | 页面端元数据上报日志 |
| `[ADL-META-RECV]` | Rust 轮询线程 | Rust 端接收和处理日志 |
| `[browser-debug]` | 前端 TS | 前端处理日志 |

### 查看方式

1. 在控制台执行 `window.__exportDebugLogs()`（界面已不提供「复制调试日志」按钮）
2. 查看项目根目录的日志文件：
   - Tauri 模式：`debug-logs.txt`
   - 浏览器模式：`debug-logs-browser.txt`

## 版本记录

| 日期 | 变更 | 详细文档 |
|------|------|---------|
| 2026-06-25 | 重构：延迟创建 + 同步渲染 + 历史 path 去重 + 保留真实标题 | [browser-tab-meta-deferred-creation-2026-06-25.md](./browser-tab-meta-deferred-creation-2026-06-25.md) |
| 2026-06-25 | 新增 Method 3（DocumentTitleChanged）+ Method 4（FaviconChanged）+ Rust 侧去重 + 修复 `should_exit_fast` + `fetch_script` 条件 | [browser-meta-sync-mechanism-2026-06-25.md](./browser-meta-sync-mechanism-2026-06-25.md) |
| 2026-06-23 | 标志刷新元数据优化、已打开标签过滤增强 | 对应知识文档 |
| 2026-06-21 | 并发去重、标题锁、favicon 质量评分 | 对应知识文档 |
| 2026-06-20 | 导航模式切换（就地/新标签） | 对应知识文档 |
| 2026-06-17 | Safe iframe + 嵌入检查 | 对应知识文档 |
| 2026-06-15 | 标签目录对话框 + 扁平视图 | 对应知识文档 |
| 2026-06-09 | 创建标签对话框修复 | 对应知识文档 |
| 2026-06-08 | 着陆页实现 | 对应知识文档 |
| 2026-06-04 | URL 同步修复 | 对应知识文档 |

## 相关文件

### Rust 端
- `crates/browser/src/browser_navigation.rs` - INIT_SCRIPT（页面注入 JS）
- `crates/browser/src/browser_webview.rs` - WebView 管理与轮询线程
- `crates/browser/src/browser_events.rs` - 事件处理与去重
- `crates/browser/src/browser_meta.rs` - meta 命令处理
- `crates/browser/src/webview2_message.rs` - WebView2 postMessage 处理

### 前端
- `frontend/src/app/features/browser/useBrowserPageMeta.ts` - 元数据处理
- `frontend/src/app/features/browser/useBrowserUrlChange.ts` - URL 变化处理
- `frontend/src/app/utils/fetchPageMeta.ts` - favicon 缓存管理 + HTTP 预取
- `frontend/src/app/utils/browserDisplayUtils.ts` - URL 标准化工具
- `frontend/src/app/stores/slices/browserSlice.ts` - 核心浏览器切片
- `frontend/src/app/stores/slices/browserHistorySlice.ts` - 历史条目切片
- `frontend/src/app/stores/slices/browserTabsSlice.ts` - 标签页切片
- `frontend/src/app/features/browser-tree/useBrowserTreeData.ts` - 树状导航数据构建
- `frontend/src/app/components/BrowserFavicon.tsx` - favicon 组件
