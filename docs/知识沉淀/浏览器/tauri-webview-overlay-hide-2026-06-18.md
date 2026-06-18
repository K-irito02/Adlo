# Tauri 原生子 WebView 层级覆盖问题 —— 2026-06-18

## 问题概述

Tauri 桌面模式下，浏览器网页内容通过原生子 WebView（WebView2）渲染，它是 OS 级别的渲染表面，始终位于 HTML 元素之上。任何 HTML 层的浮动元素（对话框、菜单、下拉框）无论 CSS `z-index` 多高，**都会被原生 WebView 裁剪/覆盖**。

浏览器模式（iframe）不存在此问题，因为 iframe 在 HTML 层叠上下文中，`z-index` 可正常控制。

## 受影响范围

所有需要出现在网页内容区域上方的浮动元素：

| 浮动元素 | CSS class / 状态 | 位置 |
|---------|-----------------|------|
| 浏览器面板更多操作下拉菜单 | `browserMenuOpen` | BrowserPanel（state） |
| 浏览器面板右键菜单卡片 | `contextMenu.open` | BrowserPanel（state） |
| 新建标签对话框 | `createTabDialog.open` | BrowserPanel（state） |
| 收藏标签对话框 | `bookmarkDialogOpen` | BrowserPanel（state） |
| 重命名文件夹对话框 | `renameFolderState.open` | BrowserPanel（state） |
| 创建目录对话框 | `createDirDialog.open` | BrowserPanel（state） |
| 左侧边栏右键菜单（SidebarContextMenu） | `.adl-sidebar-menu` | LeftSidebar（内联） |
| 浏览器导航器目录更多操作菜单 | `.adl-multitree-entry__menu` | BrowserTree（Portal） |

## 解决方案

### 核心思路

浮动元素出现时，将原生 WebView 移出可视区域；浮动元素消失后恢复。

### 架构：双路检测协同

```
┌─────────────────────────────────────────────────────────────┐
│                   双路检测协同架构                            │
│                                                             │
│  ┌─────────────────────┐     ┌───────────────────────────┐ │
│  │  State-based 检测    │     │   DOM-based 检测           │ │
│  │                     │     │  (MutationObserver)        │ │
│  │  BrowserPanel 内部   │     │  全范围 .adl-sidebar-menu  │ │
│  │  6 个状态变量汇总    │     │  + .adl-multitree-entry__ │ │
│  │                     │     │  menu 的增删               │ │
│  │  → overlayActive    │     │  → domOverlayActiveRef    │ │
│  └────────┬────────────┘     └───────────┬───────────────┘ │
│           │                              │                 │
│           └──────┬───────────────────────┘                 │
│                  ▼                                         │
│     ┌──────────────────────────┐                          │
│     │  anyOverlay 为 true 时    │                          │
│     │  invoke browser_set_bounds│                          │
│     │  到 (-10000,-10000)       │                          │
│     └──────────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 关键实现文件

**`frontend/src/app/features/browser/useBrowserWebView.ts`**

| 机制 | 说明 |
|------|------|
| `overlayActive` prop | BrowserPanel 汇总 6 个对话状态传入 |
| `domOverlayActiveRef` ref | MutationObserver 检测 `.adl-sidebar-menu` + `.adl-multitree-entry__menu` |
| `hideWebView()` | 直接调用 `browser_set_bounds` 将 WebView 移到 `(-10000,-10000,1,1)` |
| `updateWebViewBoundsRef` | ref 引用，供 MutationObserver 恢复 WebView 位置 |

### MutationObserver 设计要点

```typescript
const OVERLAY_SELECTOR = '.adl-sidebar-menu, .adl-multitree-entry__menu';
const observer = new MutationObserver(scheduleCheck);
observer.observe(document.body, { childList: true, subtree: true });
```

- **`subtree: true`**：捕获内联渲染的菜单（如 LeftSidebar 的 SidebarContextMenu 不是 Portal 渲染的）
- **`requestAnimationFrame` 批量合并**：`subtree: true` 会高频触发回调，用 rAF 将同一帧内的多次 DOM 变更合并为一次检测
- **使用 ref 而非 state**：绕过 React 渲染周期，实现 0 延迟的 DOM → IPC 直接调用链

## 经验教训

### 1. 原生 WebView 的 z-order 不可战胜
CSS `z-index` 对 Tauri 子 WebView 完全无效。必须通过 IPC 命令（`browser_set_bounds`）将 WebView 移出画面或调整其边界。

### 2. 双路检测不可或缺
- **State-based**：覆盖浏览器面板内部对话框（创建标签、收藏、重命名等），它们通过 Portal 渲染 → 组件状态变化直接驱动
- **DOM-based（MutationObserver）**：覆盖外部/第三方菜单（左侧边栏右键菜单），它们由不同组件管理，通过 DOM class 增删间接检测
- 两路独立工作，互不干扰，恢复时互相检查防止冲突

### 3. 延迟消除：ref 替代 state
MutationObserver 初次实现使用 `setState` → `useEffect` 链路，每次 DOM 变动都经过 React 渲染周期，在 `subtree: true` 下延迟可达 100-300ms。改用 ref 直接调用 `invoke` 后延迟降为接近 0ms。

### 4. Portal vs 内联渲染的传播差异
只有 `createPortal(xxx, document.body)` 的元素会被 `childList: true` 检测到。内联渲染在组件树中的菜单（如 LeftSidebar 的 `SidebarContextMenu`）需要 `subtree: true` 才能捕获。

### 5. 浏览器模式无此问题
浏览器模式下用 `<iframe>` 渲染网页内容，iframe 在 HTML 层叠上下文中，CSS `z-index` 可以正常控制浮动元素层级。所有 Tauri 相关的 WebView 操作应使用 `isTauriShell()` 守卫。

### 6. off-screen 策略一致性
隐藏 WebView 使用 `(-10000,-10000,1,1)` 而非 `browser_hide`/`browser_show`，与项目中 WebView 禁用/面板切换的 off-screen 逻辑保持一致。创建时也使用此值避免初始闪露。