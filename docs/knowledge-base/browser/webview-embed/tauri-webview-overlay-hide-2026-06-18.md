# Tauri 原生子 WebView 层级覆盖问题 —— 2026-06-18（2026-07-01 修订）

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
  !startupOverlayHidden ||
  createTabDialog.open || editTabDialog.open || bookmarkDialogOpen ||
  renameFolderState.open || createDirDialog.open ||
  browserMenuOpen || contextMenu.open;
// 2026-09-30 修订：browserMenuOpen / contextMenu.open 重新纳入 —— 旧结论"工具栏菜单不重叠"
// 已被推翻（菜单展开后可延伸进 WebView 区域，DOM 重叠检测兜底 + state 双保险）。
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

> **2026-09-30 修订（幽灵条带事件）：** 上述移除结论已被推翻 ——
> `browserMenuOpen` / `contextMenu.open` 重新纳入 `hasOverlayActive`（state 双保险；
> DOM 重叠检测继续兜底 portal 定位飘移）。同时选择器移除 `.toast-card-region`
> 与 `.tooltip`（前者见下，后者为 hover 提示不隐藏的用户需求）。

## 2026-09-30 补充：常驻空容器幽灵条带导致 WebView 永久隐藏

### 问题复现

Tauri 桌面模式，无任何可见悬浮层时浏览器主内容区 WebView2 仍为隐藏状态（黑屏）。

### 根因（日志实证）

`ToastRegion` 把 `.toast-card-region` 常驻挂载到 body（无 toast 也不卸载）。
其 CSS（`position:fixed; right/bottom:20px; width:400px; display:flex; gap:8px`）在两个
空分组 div 之间撑出一条 **400×8 的隐形条带**（`pointer-events:none`），与 WebView 容器
几何重叠。日志证据：

```
manager overlap=TRUE by toast-card-region overlay=[860,772,1260,780] container=[181,110,1280,800]
dom-overlay transition hasOverlap=true → hideAllWebViews (bing 搜索页)
updateBounds SKIP reason=dom-overlay   # 永久阻止恢复
```

### 修复

1. 选择器移除 `.toast-card-region` —— 真实 toast 由条件挂载的 `.toast-card` /
   `.adl-toast` 覆盖，出现时仍正常隐藏；
2. `isVisibleOverlay` 增加 `pointer-events:none` 过滤 —— WebView2 是 OS 级表面，
   此类元素既不可交互、视觉上也被 WebView 覆盖，永无需为它隐藏（同类常驻空容器免疫）；
3. 附带加固：MutationObserver 增加 attributes 监听、订阅丢失重建（deps 补
   `isVisible/activeTabId`）、bounds/ResizeObserver 补 `hideRequested` 守卫、
   state→false 时同步复核 `checkOverlap` 后再恢复、DSH 侧对称实现 + 启动覆盖层纳入、
   隐藏坐标统一为共享常量 `HIDDEN_WEBVIEW_OFFSCREEN_COORD`（32767）。

### 经验教训

1. **常驻挂载的空容器是重叠检测的头号敌人** —— 选择器只应包含"有内容才挂载"的
   叶子浮层；`pointer-events:none` 可作为第二道通用防线。
2. **诊断日志定位后必须删除** —— 本次 `[WV-DEBUG]` 全链路埋点在定位后已清零
   （grep 确认），避免污染生产日志。

## 2026-07-01 补充修复：updateWebViewBounds 缺失覆盖层守卫

### 问题复现

Tauri 桌面模式，浏览器面板页面跳转后快速点击收藏标签按钮，收藏标签对话框被 WebView 覆盖。

### 根因

`updateWebViewBounds()` 函数在执行 WebView 位置恢复时**不检查当前是否有覆盖层活跃**。这导致以下竞态条件：

1. 页面导航 → `activeTab` 引用变化 → `useEffect([activeTab])` 触发 → 异步排队双 rAF 调用 `updateWebViewBounds()`
2. 用户快速点击收藏星号 → `bookmarkDialogOpen = true` → `overlayActive = true`
3. `useEffect([overlayActive])` 触发 → `hideAllWebViews()` → WebView 移出屏幕 ✓
4. 步骤 1 排队的双 rAF 回调触发 → `updateWebViewBounds()` **无任何覆盖层检查** → 将 WebView 恢复至原位 → **覆盖对话框** ✗

日志证据（浏览器 B 站页面测试）：
```
13:18:18.471  overlayActive=true → hideAllWebViews → WebView 移出屏幕 ✓
13:18:18.657  双 rAF 第 2 帧 → updateWebViewBounds overlayActive=true → WebView 恢复原位 ✗
```

### 受影响的调用路径

| 路径 | 调用 updateWebViewBounds 的方式 | 风险 |
|------|-------------------------------|------|
| `useEffect([activeTab])` | 双 rAF（布局稳定后） | 高 — 页面跳转时触发，与用户交互窗口重叠 |
| `ResizeObserver` | 面板尺寸变化时直接调用 | 中 — 面板非频繁变化，但无守卫 |
| `MutationObserver` 恢复 | 菜单消失后通过 ref 调用 | 低 — 已检查 `!overlayActiveRef.current` |
| `useEffect([overlayActive])` 关闭 | 覆盖层关闭后调用 | 无 — 此时 `overlayActiveRef.current = false` |

### 修复

在 `updateWebViewBounds()` 函数体增加覆盖层守卫（`useBrowserWebView.ts:63-66`）：

```typescript
// Don't restore webview position while an overlay (dialog/menu) is active
if (overlayActiveRef.current) {
  return;
}
```

### 原理

`overlayActiveRef` 在 React render 阶段同步更新（非 effect），因此：
- 覆盖层打开时 → render 阶段 `overlayActiveRef.current = true` → 任何后续 `updateWebViewBounds()` 调用提前返回
- 覆盖层关闭时 → render 阶段 `overlayActiveRef.current = false` → `useEffect([overlayActive])` 调用 `updateWebViewBounds()` 正常执行

这保护了所有异步路径（双 rAF、ResizeObserver），无需在每个调用点单独加入检查。

### 经验教训

1. **所有主动恢复 WebView 位置的路径都必须检查覆盖层状态** — `updateWebViewBounds()` 作为一个"设置 WebView 到正确位置"的函数，天然应检查当前是否应处于隐藏状态，而不是依赖调用方保证。

2. **异步回调（rAF、ResizeObserver）可能跨越 React 状态变化的时间窗口** — 双 rAF 在页面导航时排队，但执行可能跨越用户打开对话框的时间点。必须用 ref 守卫拦截过期的调用。

3. **React state path 与 DOM-based path 的守卫隔离** — State-based 路径通过 `overlayActiveRef` 防护的重叠菜单恢复逻辑通过 `hideWebViewRequestedRef` 防护，两者独立但互补。修复前 State-based 路径的 `hideAllWebViews()` 未设置 `hideWebViewRequestedRef`，但此次问题并非由该 gap 导致。保持一致性的选择留待后续评估。

4. **MutationObserver 选择器未覆盖所有 Portal 对话框** — `OVERLAY_SELECTOR` 只包含 `.adl-sidebar-menu, .adl-multitree-entry__menu, .adl-menu__dropdown`，未包含 `.adl-prompt-modal`（书签对话框的 portal 容器类）。虽然本次问题的根因是 rAF 竞态而非选择器缺失，但未来添加新对话框 Portal 时需同步更新选择器列表。

## 2026-11-28 补充：中心宿主遗漏开屏离屏判据

### 问题

dev Tauri 重启后，中心（Center）前台浏览器标签的原生 WebView2 在**开屏**阶段露出并遮挡开屏；右侧面板无此问题。

### 根因

原生 WebView2 创建时位于屏外（`-10000,-10000`），回到屏内的唯一通道是前端 `setTabBounds` 应用容器矩形，该路径受 `overlayActive` 门控。右侧面板早已把开屏纳入判据（`!startupOverlayHidden || …`），而中心的 `computeCenterOverlayActive` 只统计菜单/对话框，未含开屏 → 开屏期间 `overlayActive=false`，页面就绪后把 WebView 摆回屏内。DOM 开屏（HTML 层）盖不住 OS 级原生子窗口。

### 修复

`computeCenterOverlayActive` 增加 `startupOverlayHidden`，与右侧面板同口径；`CenterBrowserView` 订阅该 store 字段并传入。开屏只并入 `overlayActive`，不改 `isVisible` / `webViewDisabled`（开屏应允许提前在屏外加载，只阻止落位）。

### 经验教训

1. **每个原生子窗口宿主都要各自覆盖「开屏离屏」**：判据按宿主独立计算，新增宿主或新浮层（开屏、面板浮层、桥接条）时逐宿主核对，不要假设一处覆盖全局生效。
2. **DOM 覆盖层对原生面无效**：任何全屏级 DOM 浮层都必须显式把原生 WebView 移出画面，不能依赖 `z-index`。
3. **回归用例要锁「宿主收到的 overlayActive」**：从组件公共入口渲染并观测传给 WebView 驱动 hook 的 `overlayActive`，删除修复项时必须变红。