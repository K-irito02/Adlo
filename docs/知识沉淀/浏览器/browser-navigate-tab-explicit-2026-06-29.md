
# 浏览器 navigateTab 显式调用重构 - 2026-06-29

## 背景

浏览器面板新增了"新建标签 / 就地导航"切换功能。初始实现时，为了在就地模式下让 WebView 实际导航到新 URL，在 `useBrowserWebView.ts` 中加入了响应式 `navigateTab` 调用：当 Store 中活动标签的 URL 发生变化时，自动调用 `window.digitalLife?.browser?.navigateTab` 让 Tauri WebView 实际跳转。

## 问题：反馈循环

### 现象

在"新标签模式"下点击书签/历史，页面在同一个标签中反复重新加载，形成一个不断放大的循环。

### 根因

```
YouTube 自动播放列表 SPA 推进 (History API)
  → urlChanged 事件
  → browserNavigateActiveTab 更新 Store URL
  → useBrowserWebView effect 检测到 URL 变化
  → navigateTab 调用（让 WebView 再次导航）
  → WebView 重新加载相同 URL
  → 触发下一次 HistoryChanged / urlChanged
  → browserNavigateActiveTab 再次更新 Store
  → useBrowserWebView effect 再次触发
  → navigateTab 调用
  → ... 无限循环
```

### 日志证据

终端日志显示的循环模式（修复前）：
```
HistoryChanged index=25
  → browser navigate for tab → 25 (navigateTab)
  → page finished loading for 25
  → HistoryChanged index=26
  → browser navigate for tab → 26 (navigateTab)
  → page finished loading for 26
  → HistoryChanged index=27
  → ... 持续循环
```

## 修复：显式驱动模式

### 原则

**WebView 导航必须由前端发起的操作显式驱动，绝不能由 WebView 自身的 URL 变化被动触发。**

| 来源 | 处理方式 |
|------|----------|
| WebView 内部导航（点击链接、SPA 路由、自动重定向） | 只更新 Store，不调用 navigateTab（WebView 已导航） |
| 前端发起导航（书签/历史点击、地址栏提交） | 更新 Store + 显式调用 navigateTab |

### 修改的文件

| 文件 | 修改 |
|------|------|
| `useBrowserWebView.ts` | 移除 `prevActiveTabUrlRef` 和基于 URL 变化的 `navigateTab` 调用，只保留 WebView 创建和激活逻辑 |
| `BrowserPanelContent.tsx` | 在 `handleOpenTabFromTree` 的"就地导航"分支中，Tauri 模式下添加 `window.digitalLife?.browser?.navigateTab(activeTabId, url)` |
| `browserpanel.tsx` | 在 `submitAddress` 的 Tauri 分支中，添加 `window.digitalLife?.browser?.navigateTab(activeTabId, finalUrl)` |

### 验证结果

| 场景 | 结果 |
|------|------|
| 新标签模式 → 书签点击 | ✅ 新标签 + 新 WebView |
| 就地模式 → 书签点击 | ✅ navigateTab 调用，同一标签导航 |
| 地址栏提交（新 URL） | ✅ navigateTab 调用，WebView 跳转 |
| YouTube 自动播放列表 SPA | ✅ 正常推进，无 navigateTab 循环 |
| Bilibili 推荐视频点击（SPA） | ✅ 正常推进，无 navigateTab 循环 |
| 抖音搜索页导航（SPA） | ✅ 正常推进，无 navigateTab 循环 |

## 经验教训

1. **WebView URL 变化不能作为 Tauri navigateTab 的触发器** — WebView 产生的 urlChanged 事件意味着页面已经导航完成，再次 navigateTab 只会造成循环
2. **显式驱动优于响应式反应** — 对跨进程操作（前端 ↔ Tauri Rust 后端），应该在前端每个发起导航的入口点显式调用 navigateTab，而不是设置一个"万能触发器"
3. **区别对待导航来源** — WebView 内部导航和前端发起的导航是两个完全不同的控制流，不应混为一谈

## 前置条件

此修复依赖于 `navigateTab` IPC 桥接已完整实现：
- `tauri-bridge.ts:358-359`: `navigateTab` 已映射到 `invokeIpc<void>('browser_navigate_tab', { tabId, url })`
- Rust 端 `browser_navigate_tab` command 已于 Phase 0 实现

在本次修复之前，`navigateTab` 从未被任何前端代码调用过，导致 URL 栏重新提交、`handleOpenTabInCurrentTab` 等路径在 Tauri 模式下实际上从未奏效。
