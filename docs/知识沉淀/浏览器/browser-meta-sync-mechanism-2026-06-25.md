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

### 数据去重机制

**位置**：`crates/browser/src/browser_events.rs`

- 两个来源（postMessage + 轮询）共享同一个 `LAST_EMIT` 去重变量
- 去重窗口：4 秒（大于普通轮询间隔 5 秒的 80%）
- 避免相同 URL 被重复 emit

## 前端处理架构

### 事件订阅

**位置**：`frontend/src/app/features/browser/useBrowserPageMeta.ts`

- 订阅 `digital-life://browser-meta-changed` 事件（title + favicon）
- 订阅 `digital-life://browser-url-changed` 事件（URL 变化）

### URL 变化处理

**位置**：`frontend/src/app/features/browser/useBrowserUrlChange.ts`

- URL 变化时立即创建标签页（使用 hostname 作为临时标题）
- 后续 meta 上报后自动更新标题和 favicon

### Favicon 缓存管理

**位置**：`frontend/src/app/utils/fetchPageMeta.ts`

- 使用 URL（归一化后）作为缓存键
- 归一化规则：去除 hash、去除尾部斜杠
- 质量评分系统：根据文件类型、尺寸、命名特征评分
- 仅当新 favicon 评分高于现有缓存时才更新
- 订阅机制：`BrowserFavicon` 组件订阅 favicon 变化，缓存更新后自动刷新

### Title 处理逻辑

- URL 变化时：用 hostname 作为临时标题
- Meta 上报时：有意义的 title 才接受（非空、不等于 hostname）
- 收藏的标签标题不受页面跳转影响（title lock 机制）

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

### 问题 3：空 title 时 favicon 也不更新

**现象**：页面加载初期 title 为空，但 favicon 已经可用，此时 handlePageMeta 直接 return，导致 favicon 不更新。

**解决方案**：
- 空 title 时仍然缓存 favicon
- Favicon 通过独立的缓存 + 订阅机制更新，不依赖 title

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

### 问题 7：网址输入框回车后不创建标签页

**现象**：用户在地址栏输入网址回车后，"已打开的标签"下没有显示标签，必须等页面 JS 上报 title 后才显示。

**解决方案**：
- 在 `onUrlChanged` 回调中立即创建标签页
- 使用 hostname 作为临时标题
- 后续 meta 上报后自动更新标题

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

1. 点击页面右上角"复制调试日志"按钮
2. 查看项目根目录的日志文件：
   - Tauri 模式：`debug-logs.txt`
   - 浏览器模式：`debug-logs-browser.txt`

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
- `frontend/src/app/utils/fetchPageMeta.ts` - favicon 缓存管理
- `frontend/src/app/components/BrowserFavicon.tsx` - favicon 组件
- `frontend/src/app/stores/slices/browserTabsSlice.ts` - 标签页状态管理
