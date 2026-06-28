# Tauri 原生子 WebView 层级覆盖问题 —— 2026-06-18（2026-06-28 修订）

## 问题概述

Tauri 桌面模式下，浏览器网页内容通过原生子 WebView（WebView2）渲染，它是 OS 级别的渲染表面，始终位于 HTML 元素之上。任何 HTML 层的浮动元素（对话框、菜单、下拉框）无论 CSS `z-index` 多高，**都会被原生 WebView 裁剪/覆盖**。

浏览器模式（iframe）不存在此问题，因为 iframe 在 HTML 层叠上下文中，`z-index` 可正常控制。

## 受影响范围

| 浮动元素 | 检测方式 | 是否与 WebView 重叠 | 策略 |
|---------|---------|-------------------|------|
| 新建标签对话框 | state（`createTabDialog.open`） | ✅ 是（模态） | 直接隐藏 |
| 编辑标签对话框 | state（`editTabDialog.open`） | ✅ 是（模态） | 直接隐藏 |
| 收藏标签对话框 | state（`bookmarkDialogOpen`） | ✅ 是（模态） | 直接隐藏 |
| 重命名文件夹对话框 | state（`renameFolderState.open`） | ✅ 是（模态） | 直接隐藏 |
| 创建目录对话框 | state（`createDirDialog.open`） | ✅ 是（模态） | 直接隐藏 |
| 浏览器右键菜单卡片 | DOM（`.adl-sidebar-menu`, Portal） | ⚠️ 视位置而定 | 重叠检测 |
| 浏览器导航器目录菜单 | DOM（`.adl-multitree-entry__menu`, Portal） | ⚠️ 视位置而定 | 重叠检测 |
| 浏览器面板更多操作菜单 | state（`browserMenuOpen`） | ❌ 工具栏区，不重叠 | 不隐藏 |
| 左侧边栏右键菜单 | DOM（`.adl-sidebar-menu`, 内联） | ❌ 左侧栏，不重叠 | 不隐藏 |

> **注意**：`browserMenuOpen`（工具栏"⋯"菜单）和左侧边栏菜单本身不重叠 WebView，不应触发隐藏。但 BrowserContextMenu（tab 右键菜单）和 tree entry 菜单使用 `position: fixed + createPortal`，可能出现在屏幕任意位置，**需要运行时重叠检测**。

## 解决方案

### 核心思路

浮动元素出现时，将原生 WebView 移出可视区域；浮动元素消失后恢复。**但仅在实际重叠时执行**——避免非重叠菜单误触隐藏。

### 三路检测架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        三路检测架构                                │
│                                                                  │
│  ┌────────────────────┐   ┌────────────────────────────────┐    │
│  │  State-based 检测   │   │  DOM-based 检测 + 重叠判定      │    │
│  │                    │   │  (MutationObserver)             │    │
│  │  5 个模态 dialog   │   │  发现 .adl-sidebar-menu 或     │    │
│  │  状态汇总           │   │  .adl-multitree-entry__menu   │    │
│  │  → overlayActive   │   │  → 取每个菜单的 bounding rect  │    │
│  │  (始终触发隐藏)      │   │  → 与 primaryRef rect 比较    │    │
│  └────────┬───────────┘   │  → 仅相交时触发隐藏             │    │
│           │               └──────────────┬─────────────────┘    │
│           │                             │                       │
│           └─────────┬───────────────────┘                       │
│                     ▼                                           │
│        ┌──────────────────────────────┐                        │
│        │  重叠或模态 → 隐藏 WebView    │                        │
│        │  invoke browser_set_bounds    │                        │
│        │  到 (-10000,-10000,1,1)       │                        │
│        └──────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

### 关键实现文件

**`frontend/src/app/features/browser/BrowserPanel.tsx`** — State-based 检测：

```typescript
const hasOverlayActive =
  createTabDialog.open || editTabDialog.open || bookmarkDialogOpen ||
  renameFolderState.open || createDirDialog.open;
// browserMenuOpen 和 contextMenu.open 已移除 —— 它们不总是重叠
```

**`frontend/src/app/features/browser/useBrowserWebView.ts`** — DOM-based + 重叠判定：

| 机制 | 说明 |
|------|------|
| `overlayActive` prop | BrowserPanel 传入的 5 个模态 dialog 状态 |
| MutationObserver + 重叠检测 | 发现菜单元素后，用 `getBoundingClientRect()` 判断与 `primaryRef` 的相交关系 |
| `hideAllWebViews()` | 调用 `browser_set_bounds` 将 WebView 移到 `(-10000,-10000,1,1)` |
| `updateWebViewBoundsRef` | ref 引用，供 MutationObserver 恢复 WebView 位置 |
| `hideWebViewRequestedRef` | 标记当前是否有重叠菜单，阻止 visibility/resize 效应恢复 |

### MutationObserver 重叠检测逻辑

```typescript
const OVERLAY_SELECTOR = '.adl-sidebar-menu, .adl-multitree-entry__menu';
const primaryEl = primaryRef.current;
const webviewRect = primaryEl.getBoundingClientRect();

for (const el of overlays) {
  const menuRect = el.getBoundingClientRect();
  const overlaps = menuRect.left < webviewRect.right &&
                   menuRect.right > webviewRect.left &&
                   menuRect.top < webviewRect.bottom &&
                   menuRect.bottom > webviewRect.top;
  if (overlaps) { hasOverlap = true; break; }
}
```

- **`subtree: true`**：捕获内联渲染的菜单（非 Portal 渲染）
- **`requestAnimationFrame` 批量合并**：将同一帧内的多次 DOM 变更合并为一次检测
- **逐元素重叠判定**：避免非重叠菜单误触

### 设计约束

- **`browserMenuOpen`**（工具栏"⋯"下拉菜单）绝对定位在工具栏下方，始终位于 WebView 区域之上 + 左侧。不重叠，不触发隐藏。
- **BrowserContextMenu**（tab 右键菜单）使用 `position: fixed + createPortal`，可出现在屏幕任意位置——**仅当实际与 WebView 区域相交时才隐藏**。
- **Tree entry 菜单**（`.adl-multitree-entry__menu`）同样 portal 到 body，位置取决于点击坐标，运行时判定重叠。

## 经验教训

### 1. 原生 WebView 的 z-order 不可战胜
CSS `z-index` 对 Tauri 子 WebView 完全无效。必须通过 IPC 命令（`browser_set_bounds`）将 WebView 移出画面或调整其边界。

### 2. 粗粒度 DOM 检测导致误触
最初 MutationObserver 检测到任何 `.adl-sidebar-menu` 元素就隐藏 WebView，导致左侧边栏菜单、工具栏下拉等非重叠元素也触发隐藏。**修复方案**：加入逐元素 bounding rect 相交判定。

### 3. 非所有浮动元素都需要隐藏
`browserMenuOpen` 和左侧边栏菜单位于 WebView 区域之外，不应触发隐藏。模态对话框始终覆盖全面板，应始终触发。**关键是区分"模态覆盖"与"非重叠轻量菜单"**。

### 4. 三路协同：state + DOM + overlap
- **State-based**：覆盖浏览器面板内部模态对话框，状态变化直接驱动
- **DOM-based（MutationObserver）**：覆盖 Portal 或内联渲染的菜单，通过 DOM class 增删间接检测
- **Overlap check**：过滤 MutationObserver 的结果，仅对实际相交的菜单触发隐藏
- 三者独立工作，恢复时互相检查防止冲突

### 5. 延迟消除：ref 替代 state
MutationObserver 初次实现使用 `setState` → `useEffect` 链路，每次 DOM 变动都经过 React 渲染周期，在 `subtree: true` 下延迟可达 100-300ms。改用 ref 直接调用后延迟降为接近 0ms。

### 6. Portal vs 内联渲染的传播差异
只有 `createPortal(xxx, document.body)` 的元素会被 `childList: true` 检测到。内联渲染在组件树中的菜单需要 `subtree: true` 才能捕获。

### 7. 浏览器模式无此问题
浏览器模式下用 `<iframe>` 渲染网页内容，iframe 在 HTML 层叠上下文中，CSS `z-index` 可以正常控制浮动元素层级。所有 Tauri 相关的 WebView 操作应使用 `isTauriShell()` 守卫。

### 8. off-screen 策略一致性
隐藏 WebView 使用 `(-10000,-10000,1,1)` 而非 `browser_hide`/`browser_show`，与项目中 WebView 禁用/面板切换的 off-screen 逻辑保持一致。创建时也使用此值避免初始闪露。