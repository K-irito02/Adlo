# 浏览器面板 5 项 Bug 修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复浏览器面板的 5 个 Bug：主题闪烁、开关按钮失效、启动覆盖层遮挡失效、标签标题不更新。

**Architecture:** 4 个独立任务，按依赖顺序执行。Task 1（标题锁移除）和 Task 2（开关按钮）修改前端文件且互不冲突。Task 3（启动覆盖层）修改 UI store 和 BrowserPanel。Task 4（主题闪烁）修改 Rust 后端和 IPC 接口，最复杂，放最后。

**Tech Stack:** React 19 + TypeScript + Zustand (前端), Rust + Tauri 2.x + WebView2 (后端)

## Global Constraints

- 所有 UI 文本必须使用 i18n key，禁止硬编码中英文
- TypeScript 禁止 `any`，使用精确类型
- Rust 禁止 `unwrap()`，使用 `?` 运算符
- 三端 Bridge（Tauri/Mock/Preview）必须保持接口一致
- 所有修改不得破坏现有功能以及 UI/UX
- 变更完成后自动触发结束验收流程（lint + typecheck + test）

---

## Task 1: 移除标签标题锁 + 修复 historyDedupKey

**问题 5 根因 A/C：** `isTabTitleLocked` 永久锁阻止标题更新；`historyDedupKey` 不含 query string 导致 YouTube 不同视频互相覆盖。

**用户决策：** 完全移除标题锁；用户自定义名称只作用于书签，标签标题始终跟随页面真实标题。

**Files:**
- Modify: `frontend/src/app/utils/fetchPageMeta.ts` — 移除 `titleLockedTabs` Set 和 3 个函数
- Modify: `frontend/src/app/features/browser/useBrowserPageMeta.ts` — 移除 `isTabTitleLocked` 检查
- Modify: `frontend/src/app/features/browser/useBrowserDialogs.ts` — 移除 `lockTabTitle` 调用
- Modify: `frontend/src/app/features/browser/useBrowserTabs.ts` — 移除 `unlockTabTitle` 调用
- Modify: `frontend/src/app/features/browser/useBrowserTagActions.ts` — 移除 `isTabTitleLocked`/`unlockTabTitle` 调用
- Modify: `frontend/src/app/features/browser/useBrowserBookmarkActions.ts` — 移除 `unlockTabTitle` 调用
- Modify: `frontend/src/app/features/browser/useBrowserFolderCrud.ts` — 移除 `unlockTabTitle` 调用
- Modify: `frontend/src/app/utils/browserDisplayUtils.ts` — 修复 `historyDedupKey` 包含 query string

**Interfaces:**
- Consumes: 无（独立任务）
- Produces: `historyDedupKey` 新签名（透明变更，调用方无需修改）

- [ ] **Step 1: 修复 `historyDedupKey` 包含 query string**

文件: `frontend/src/app/utils/browserDisplayUtils.ts:23-32`

将 `historyDedupKey` 修改为包含 query string：

```typescript
export function historyDedupKey(url: string): string {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    const query = u.search || '';
    return `${hostname}${path}${query}`;
  } catch {
    return url;
  }
}
```

同时更新函数上方的注释，说明现在包含 query string 以正确区分 SPA 页面。

- [ ] **Step 2: 从 `fetchPageMeta.ts` 移除标题锁机制**

文件: `frontend/src/app/utils/fetchPageMeta.ts`

移除以下内容：
- 第 16 行: `const titleLockedTabs = new Set<string>();`
- 第 62-64 行: `lockTabTitle` 函数
- 第 66-68 行: `isTabTitleLocked` 函数
- 第 165-167 行: `unlockTabTitle` 函数

- [ ] **Step 3: 从 `useBrowserPageMeta.ts` 移除 `isTabTitleLocked` 检查**

文件: `frontend/src/app/features/browser/useBrowserPageMeta.ts`

- 第 3 行: 从 import 中移除 `isTabTitleLocked`（保留 `setCachedFavicon`, `getCachedFavicon`）
- 第 233-241 行 (exactMatch 分支): 移除 `if (!isTabTitleLocked(exactMatch.id))` 条件包裹，直接调用 `state.browserUpdateTab(exactMatch.id, { title: pageTitle })`
- 第 253-258 行 (activeTab 分支): 移除 `if (!isTabTitleLocked(activeTab.id))` 条件包裹，直接调用 `state.browserUpdateTab(activeTab.id, { url: cleanUrl, title: pageTitle })`

修改后的 exactMatch 分支：
```typescript
if (exactMatch) {
  if (exactMatch.title !== pageTitle) {
    state.browserUpdateTab(exactMatch.id, { title: pageTitle });
    state.browserAddToHistory(cleanUrl, pageTitle);
    state.browserUpdateHistoryTitle(cleanUrl, pageTitle);
  }
  return;
}
```

修改后的 activeTab 分支：
```typescript
if (activeTab) {
  if (!shouldProcessMeta(cleanUrl, source)) {
    return;
  }
  if (markUrlSeen) {
    markUrlSeen(cleanUrl);
  }
  processedMetaRef.current.set(cleanUrl, { timestamp: Date.now(), source });

  state.browserUpdateTab(activeTab.id, {
    url: cleanUrl,
    title: pageTitle,
  });
  state.browserAddToHistory(cleanUrl, pageTitle);
  state.browserUpdateHistoryTitle(cleanUrl, pageTitle);
  return;
}
```

- [ ] **Step 4: 从 `useBrowserDialogs.ts` 移除 `lockTabTitle` 调用**

文件: `frontend/src/app/features/browser/useBrowserDialogs.ts`

- 第 8 行: 从 import 中移除 `lockTabTitle`
- 第 108 行: 移除 `lockTabTitle(tabId);` 调用
- 第 138 行: 移除 `lockTabTitle(tabId);` 调用

- [ ] **Step 5: 从 `useBrowserTabs.ts` 移除 `unlockTabTitle` 调用**

文件: `frontend/src/app/features/browser/useBrowserTabs.ts`

- 第 9 行: 从 import 中移除 `unlockTabTitle`
- 第 119 行: 移除 `unlockTabTitle(tabId);` 调用
- 第 137 行: 移除 `unlockTabTitle(tabId);` 调用

- [ ] **Step 6: 从 `useBrowserTagActions.ts` 移除 `isTabTitleLocked`/`unlockTabTitle` 调用**

文件: `frontend/src/app/features/browser/useBrowserTagActions.ts`

- 第 8-9 行: 从 import 中移除 `unlockTabTitle` 和 `isTabTitleLocked`
- 第 54 行: 移除 `if (!isTabTitleLocked(tabId))` 条件包裹，直接调用 `browserUpdateTab(tabId, { title })`
- 第 88 行: 移除 `unlockTabTitle(tabId);` 调用

- [ ] **Step 7: 从 `useBrowserBookmarkActions.ts` 移除 `unlockTabTitle` 调用**

文件: `frontend/src/app/features/browser/useBrowserBookmarkActions.ts`

- 第 7 行: 从 import 中移除 `unlockTabTitle`
- 第 29 行: 移除 `unlockTabTitle(tabId);` 调用

- [ ] **Step 8: 从 `useBrowserFolderCrud.ts` 移除 `unlockTabTitle` 调用**

文件: `frontend/src/app/features/browser/useBrowserFolderCrud.ts`

- 第 7 行: 从 import 中移除 `unlockTabTitle`
- 第 216 行: 移除 `unlockTabTitle(tabId);` 调用
- 第 313 行: 移除 `unlockTabTitle(item.tabId);` 调用
- 第 325 行: 移除 `unlockTabTitle(tabId);` 调用
- 第 451 行: 移除 `unlockTabTitle(tabId);` 调用

- [ ] **Step 9: 验收 — 运行 lint + typecheck + test**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

预期: 全部通过。如果有未使用的 import 残留，lint:fix 会自动移除。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "fix(browser): remove tab title lock and fix historyDedupKey to include query string

- Remove isTabTitleLocked/lockTabTitle/unlockTabTitle mechanism entirely
- Tab titles now always follow real page titles
- User-defined names apply only to bookmarks, not tab titles
- Fix historyDedupKey to include query string for SPA sites like YouTube
- Different videos (?v=AAA vs ?v=BBB) now have separate history entries"
```

---

## Task 2: 修复开关切换按钮行为

**问题 3 根因：** `browserNavigateInPlace` 状态从未被导航逻辑读取；`onSelectTab` 错误传参导致标签名变为 UUID；标签切换调用错误函数。

**用户提示：** "请注意开关切换按钮'新建标签 | 当前标签'带来的影响"

**行为规范：**
- **"新建标签"模式** (`browserNavigateInPlace = false`): 侧栏书签/历史/地址栏"+"按钮 → 开新标签
- **"当前标签"模式** (`browserNavigateInPlace = true`): 侧栏书签/历史/地址栏"+"按钮 → 在当前标签导航
- **点击"已打开的标签"列表中的标签**: 始终切换到该标签（不受开关影响）
- **点击侧栏树中已存在的标签**: 始终切换到该标签（不受开关影响）

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` — 修复 `handleOpenTabFromTree`
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx` — 修复 `onSelectTab`
- Modify: `frontend/src/app/features/browser/BrowserToolbar.tsx` — 修复"+"按钮

**Interfaces:**
- Consumes: `browserNavigateInPlace` (from store), `browserSelectTab` (from store)
- Produces: 无新接口

- [ ] **Step 1: 修复 `handleOpenTabFromTree` 尊重 `browserNavigateInPlace`**

文件: `frontend/src/app/features/browser/BrowserPanel.tsx:365-374`

需要添加 `browserNavigateInPlace` 和 `browserSelectTab` 到组件的 store 选择器中，然后修改 `handleOpenTabFromTree`。

首先，在组件的 store 选择器区域添加（如果尚未存在）：
```typescript
const browserNavigateInPlace = useAppStore((s) => s.browserNavigateInPlace);
const browserSelectTab = useAppStore((s) => s.browserSelectTab);
```

然后修改 `handleOpenTabFromTree`：

```typescript
const handleOpenTabFromTree = useCallback(
  (url: string, tabId?: string) => {
    if (tabId) {
      // 点击已存在的标签 → 切换到该标签（不受开关影响）
      browserSelectTab(tabId);
    } else if (browserNavigateInPlace) {
      // "当前标签"模式 → 在当前标签导航
      browserNavigateActiveTab(url);
    } else {
      // "新建标签"模式 → 开新标签
      browserOpenTab(url, url);
    }
  },
  [browserOpenTab, browserNavigateActiveTab, browserSelectTab, browserNavigateInPlace]
);
```

关键变更：
1. 当 `tabId` 存在时，调用 `browserSelectTab(tabId)` 而非 `browserNavigateActiveTab(url, tabId)` — 修复标签名变为 UUID 的 bug
2. 当 `tabId` 不存在时，根据 `browserNavigateInPlace` 决定开新标签还是在当前标签导航
3. `browserNavigateActiveTab(url)` 不传 title 参数，让页面 meta 自动更新标题

- [ ] **Step 2: 修复 `onSelectTab` 直接调用 `browserSelectTab`**

文件: `frontend/src/app/features/browser/BrowserNavigator.tsx:265-270`

修改"已打开的标签"列表的 `onSelectTab` 回调：

```typescript
onSelectTab={(tabId) => {
  browserSelectTab(tabId);
}}
```

变更说明：移除了 `browserTabs.find` 和 `handleOpenTabFromTree` 调用，直接调用 `browserSelectTab`。语义更清晰，且不受 `browserNavigateInPlace` 影响。

需要确保 `browserSelectTab` 在 `BrowserNavigator` 的 props 中可用。检查 `BrowserNavigator` 的 props 定义，如果 `browserSelectTab` 尚未被传入，需要从 `BrowserPanel` 透传。

- [ ] **Step 3: 修复 URL 输入框"+"按钮尊重 `browserNavigateInPlace`**

文件: `frontend/src/app/features/browser/BrowserToolbar.tsx:141-152`

需要先在 `BrowserToolbar` 组件中获取 `browserNavigateInPlace` 和 `browserNavigateActiveTab`。

修改"+"按钮的 `onClick`：

```typescript
<TooltipSimple content={t.newTabPage} placement="top">
  <button
    type="button"
    className="adl-copy-btn"
    onClick={(e) => {
      e.stopPropagation();
      if (browserNavigateInPlace) {
        // "当前标签"模式 → 导航当前标签到新标签页
        browserNavigateActiveTab('about:blank');
      } else {
        // "新建标签"模式 → 开新标签
        browserOpenTab(undefined, t.browserNewTabPage);
      }
    }}
  >
    <IconPlus size={14} decorative />
  </button>
</TooltipSimple>
```

需要将 `browserNavigateInPlace` 和 `browserNavigateActiveTab` 传入 `BrowserToolbar` 的 props（如果尚未存在）。检查 `BrowserToolbar` 的 props 定义，从 `BrowserPanel` 透传。

- [ ] **Step 4: 检查侧栏头部"+"按钮**

文件: `frontend/src/app/features/browser/BrowserNavigator.tsx:187-214`

侧栏头部的"+"按钮目前在 `navigatorMode !== 'tabs'` 时调用 `browserOpenTab(undefined, t.browserNewTabPage)`。此按钮也应尊重 `browserNavigateInPlace`：

```typescript
onClick={() => {
  if (navigatorMode === 'tabs') {
    // 打开新建标签对话框
  } else if (browserNavigateInPlace) {
    browserNavigateActiveTab('about:blank');
  } else {
    browserOpenTab(undefined, t.browserNewTabPage);
  }
}}
```

- [ ] **Step 5: 验收 — 运行 lint + typecheck + test**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(browser): make nav mode toggle actually control tab opening behavior

- handleOpenTabFromTree now reads browserNavigateInPlace state
- 'Current tab' mode: sidebar/bookmark/address-bar opens in active tab
- 'New tab' mode: sidebar/bookmark/address-bar opens new tab
- Fix onSelectTab to call browserSelectTab instead of handleOpenTabFromTree
- Fix tab title becoming UUID (was passing tabId as title parameter)
- Fix tab switching failure (was calling navigate instead of select)
- URL input '+' button and sidebar header '+' button respect toggle state"
```

---

## Task 3: 修复启动覆盖层无法遮挡 WebView2

**问题 4 根因：** WebView2 是原生 OS 窗口，不受 DOM z-index 影响。`overlayActive` 仅追踪对话框，不包含启动覆盖层。启动期间 `useWebViewLifecycle` 无条件调用 `activateTabInPool` 并移动 WebView 到屏幕内。

**方案：** 将 App.tsx 的 `overlayHidden` 状态同步到 UI store，BrowserPanel 读取后纳入 `hasOverlayActive` 计算。这样 `useWebViewLifecycle` 的 `overlayActiveRef` 在启动期间为 true，`updateWebViewBounds` 不会被调用，WebView 保持离屏。

**Files:**
- Modify: `frontend/src/app/stores/slices/uiSlice.ts` — 添加 `startupOverlayHidden` 状态
- Modify: `frontend/src/app/App.tsx` — 同步 `overlayHidden` 到 store
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` — 读取 `startupOverlayHidden` 并纳入 `hasOverlayActive`

**Interfaces:**
- Consumes: 无
- Produces: `startupOverlayHidden: boolean` (UI store field), `setStartupOverlayHidden: (v: boolean) => void` (setter)

- [ ] **Step 1: 在 UI slice 添加 `startupOverlayHidden` 状态**

文件: `frontend/src/app/stores/slices/uiSlice.ts`

在 StoreState 类型中添加：
```typescript
startupOverlayHidden: boolean;
```

在 StoreActions 类型中添加：
```typescript
setStartupOverlayHidden: (hidden: boolean) => void;
```

在默认状态中添加：
```typescript
startupOverlayHidden: false,
```

在 setter 区域添加：
```typescript
setStartupOverlayHidden: (hidden) => set({ startupOverlayHidden: hidden }),
```

- [ ] **Step 2: 在 App.tsx 同步 `overlayHidden` 到 store**

文件: `frontend/src/app/App.tsx`

在 `overlayHidden` 状态变化时同步到 UI store。添加一个 effect：

```typescript
const setStartupOverlayHidden = useAppStore((s) => s.setStartupOverlayHidden);

useEffect(() => {
  setStartupOverlayHidden(overlayHidden);
}, [overlayHidden, setStartupOverlayHidden]);
```

- [ ] **Step 3: 在 BrowserPanel 读取 `startupOverlayHidden` 并纳入 `hasOverlayActive`**

文件: `frontend/src/app/features/browser/BrowserPanel.tsx:216-221`

添加 store 选择器：
```typescript
const startupOverlayHidden = useAppStore((s) => s.startupOverlayHidden);
```

修改 `hasOverlayActive` 计算：
```typescript
const hasOverlayActive =
  !startupOverlayHidden ||
  createTabDialog.open ||
  editTabDialog.open ||
  bookmarkDialogOpen ||
  renameFolderState.open ||
  createDirDialog.open;
```

逻辑说明：当启动覆盖层未隐藏时（`startupOverlayHidden === false`），`hasOverlayActive` 为 true，`useWebViewLifecycle` 的 `overlayActiveRef` 为 true，`updateWebViewBounds` 不会被调用，WebView 保持离屏。当启动覆盖层隐藏后，`hasOverlayActive` 恢复为仅追踪对话框。

- [ ] **Step 4: 验收 — 运行 lint + typecheck + test**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(browser): hide WebView2 behind startup overlay

- Add startupOverlayHidden state to UI store
- App.tsx syncs overlayHidden to store on change
- BrowserPanel includes startupOverlayHidden in hasOverlayActive
- WebView stays off-screen while startup overlay is visible
- Prevents native WebView2 window from showing above React overlay"
```

---

## Task 4: 修复主题闪烁

**问题 1&2 根因：** WebView2 默认白色背景未覆盖；BrowserManager 默认 `current_color_scheme = "dark"`；CDP 主题异步应用晚于首次渲染；加载器覆盖层提前消失。

**方案（4 个子步骤）：**
1. 传递 resolved theme 作为 `browser_create_for_tab` 参数（消除 "dark" 默认值竞态）
2. 设置 WebView2 默认背景色（消除白色闪烁）
3. 创建时用 `about:blank` 初始 URL，应用主题后再导航到真实 URL（确保 CDP 在页面前生效）
4. 修复 loadingTabId 清除时机

**Files:**
- Modify: `frontend/src/shared/ipc/browser.ts` — 接口添加 `colorScheme` 参数
- Modify: `frontend/src/tauri-bridge/browser.ts` — 传递 `colorScheme`
- Modify: `frontend/src/preview-bridge/index.ts` — 忽略 `colorScheme`（预览模式）
- Modify: `frontend/src/mock/mock-browser.ts` — 忽略 `colorScheme`（Mock 模式）
- Modify: `frontend/src/app/features/browser/useBrowserPool.ts` — 传递 `resolvedTheme`
- Modify: `frontend/src/app/features/browser/useBrowserThemeSync.ts` — 提供 `resolvedTheme` 给 pool
- Modify: `src-tauri/src/commands/browser.rs` — 接受 `color_scheme` 参数，设置背景色，about:blank 先创建后导航
- Modify: `crates/browser/src/browser_webview.rs` — 添加 `set_background_color` 方法
- Modify: `crates/browser/src/webview_handle.rs` — 添加 `set_background_color` 到 trait
- Modify: `src-tauri/src/tauri_webview_handle.rs` — 实现 `set_background_color`
- Modify: `crates/browser/src/lib.rs` — 导出 `webview2_set_background_color`
- Create: `crates/browser/src/webview2_background.rs` — WebView2 背景色设置实现
- Modify: `frontend/src/app/features/browser/useWebViewLifecycle.ts` — 修复 loadingTabId 时机

**Interfaces:**
- Consumes: `themeController.getState().resolvedTheme` (from useBrowserThemeSync)
- Produces: `createForTab(tabId, url, colorScheme)` 新签名

- [ ] **Step 1: 创建 WebView2 背景色设置模块**

文件: `crates/browser/src/webview2_background.rs` (新建)

```rust
use windows::core::HSTRING;
use windows::Win32::System::WinRT::Implementation::{
    ICoreWebView2, ICoreWebView2Controller2, COREWEBVIEW2_COLOR,
};
use windows::Win32::Foundation::COLORREF;

/// Set the WebView2 default background color.
/// This eliminates the white flash before page content renders.
pub fn set_default_background_color(
    controller: &ICoreWebView2Controller2,
    r: u8,
    g: u8,
    b: u8,
) -> Result<(), windows::core::Error> {
    let color = COREWEBVIEW2_COLOR {
        R: r,
        G: g,
        B: b,
        A: 255,
    };
    unsafe { controller.SetDefaultBackgroundColor(color) }
}

/// Map theme name to RGB values matching the app's CSS variables.
/// Dark: #141414 (var(--bg) in dark theme)
/// Light: #f8f8f8 (var(--bg) in light theme)
pub fn theme_to_rgb(color_scheme: &str) -> (u8, u8, u8) {
    match color_scheme {
        "dark" => (0x14, 0x14, 0x14),
        "light" => (0xF8, 0xF8, 0xF8),
        _ => (0x14, 0x14, 0x14), // default to dark
    }
}
```

在 `crates/browser/src/lib.rs` 中添加模块导出：
```rust
mod webview2_background;
pub use webview2_background::{set_default_background_color, theme_to_rgb};
```

- [ ] **Step 2: 修改 `browser_create_for_tab` 接受 `color_scheme` 参数**

文件: `src-tauri/src/commands/browser.rs:114-159`

修改命令签名，添加 `color_scheme` 参数：

```rust
#[tauri::command]
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
    color_scheme: Option<String>,
) -> Result<IpcResult<Option<String>>, CommandError> {
```

修改创建逻辑 — 用 `about:blank` 创建，应用主题后导航：

```rust
let result = (|| -> Result<Option<String>, AppError> {
    let (window, _target) = resolve_window_and_url(&app_inner, &url)?;
    // Use about:blank as initial URL to prevent page from loading
    // before theme/background color is applied
    let blank_url = url::Url::parse("about:blank")
        .map_err(|e| AppError::Internal(format!("failed to parse about:blank: {e}")))?;
    let webview_builder = build_webview_builder(&label, blank_url, app_inner.clone());

    window
        .add_child(
            webview_builder,
            tauri::LogicalPosition::new(-10000.0, -10000.0),
            tauri::LogicalSize::new(800.0, 600.0),
        )
        .map_err(|e| {
            AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}"))
        })?;

    tracing::info!(tab_id = &tab_id, url = &url, "browser webview created for tab");

    if let Some(webview) = window.get_webview(&label) {
        let bridge: EventBridgeRef =
            Arc::new(TauriWebView2EventBridge::new(app_inner.clone()));
        setup_webview2_handlers_for_platform(&webview, &tab_id, &label, bridge.clone());

        // Determine color scheme: use parameter if provided, else fall back to manager state
        let cs = color_scheme.clone().unwrap_or_else(|| state.browser_manager.current_color_scheme());

        // Apply background color and color scheme, then navigate to real URL
        let real_url = url.clone();
        let cs_for_nav = cs.clone();
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();

            // Set background color via ICoreWebView2Controller2
            if let Ok(controller2) = controller.cast::<ICoreWebView2Controller2>() {
                let (r, g, b) = adl_browser::theme_to_rgb(&cs_for_nav);
                let _ = adl_browser::set_default_background_color(&controller2, r, g, b);
            }

            // Apply CDP color scheme
            if let Ok(core) = controller.CoreWebView2() {
                adl_browser::webview2_set_color_scheme(&core, &cs_for_nav);

                // Navigate to the real URL after theme is applied
                let _ = core.Navigate(&HSTRING::from(real_url.as_str()));
            }
        });
    }

    register_webview_with_manager(&state, app_inner.clone(), label.clone(), &tab_id)
})();
```

需要添加 import：
```rust
use windows::core::HSTRING;
use windows::Win32::System::WinRT::Implementation::ICoreWebView2Controller2;
```

同时修改 `on_navigation` handler 跳过 `about:blank`：

```rust
fn build_webview_builder(
    label: &str,
    target: url::Url,
    app_handle: tauri::AppHandle,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    let app_nav = app_handle.clone();
    tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        .initialization_script(adl_browser::INIT_SCRIPT)
        .on_navigation(move |url| {
            // Skip about:blank (used for initial WebView setup before theme applied)
            if url.as_str().starts_with("about:blank") {
                return true;
            }
            adl_browser::navigation_handler(url, &|normalized| {
                let _ = app_nav.emit(
                    "digital-life://browser-url-changed",
                    serde_json::json!({ "url": normalized }),
                );
            })
        })
        .on_new_window(move |url, _window_features| new_window_handler(&app_handle, &url))
}
```

- [ ] **Step 3: 更新 IPC 接口定义**

文件: `frontend/src/shared/ipc/browser.ts`

修改 `createForTab` 签名：

```typescript
export interface BrowserBridge {
  createForTab: (tabId: string, url: string, colorScheme?: 'light' | 'dark') => Promise<string | null>;
  // ... 其余不变
}
```

- [ ] **Step 4: 更新 Tauri Bridge 实现**

文件: `frontend/src/tauri-bridge/browser.ts:8-11`

```typescript
createForTab: (tabId: string, url: string, colorScheme?: 'light' | 'dark') =>
  invokeIpc<string | null>('browser_create_for_tab', { tabId, url, colorScheme }).then((r) =>
    r.ok ? r.data : null
  ),
```

- [ ] **Step 5: 更新 Preview Bridge 实现**

文件: `frontend/src/preview-bridge/index.ts`

找到 `createForTab` 实现，添加 `colorScheme` 参数（预览模式忽略此参数）：

```typescript
createForTab: (_tabId: string, _url: string, _colorScheme?: 'light' | 'dark') =>
  Promise.resolve(null),
```

- [ ] **Step 6: 更新 Mock Bridge 实现**

文件: `frontend/src/mock/mock-browser.ts`

找到 `createForTab` 实现，添加 `colorScheme` 参数（Mock 模式忽略此参数）：

```typescript
createForTab: (_tabId: string, _url: string, _colorScheme?: 'light' | 'dark') =>
  Promise.resolve(null),
```

- [ ] **Step 7: 修改 `useBrowserPool` 传递 `resolvedTheme`**

文件: `frontend/src/app/features/browser/useBrowserPool.ts:39-48`

需要让 `createWebViewForTab` 接受 `colorScheme` 参数并传给 bridge：

```typescript
const createWebViewForTab = useCallback(
  async (tabId: string, _url: string, colorScheme?: 'light' | 'dark'): Promise<string | null> => {
    let rustEvicted: string | null = null;

    if (isTauriShell()) {
      const bridge = window.digitalLife?.browser;
      if (bridge) {
        rustEvicted = await bridge.createForTab(tabId, _url, colorScheme);
      }
    }
    // ... 其余不变
```

- [ ] **Step 8: 修改 `useBrowserThemeSync` 提供 `resolvedTheme`**

文件: `frontend/src/app/features/browser/useBrowserThemeSync.ts`

当前 hook 仅在 mount 时调用 `setBrowserColorScheme`。需要同时暴露 `resolvedTheme` 给 `useBrowserPool` 使用。

最简方案：导出 `resolvedTheme` 的获取函数：

```typescript
import { themeController } from '@utils/themeStore';

export function useBrowserThemeSync(): void {
  useEffect(() => {
    const state = themeController.getState();
    window.digitalLife?.browser?.setBrowserColorScheme(state.resolvedTheme).catch(() => {});

    const unsubscribe = themeController.subscribe((newState) => {
      window.digitalLife?.browser?.setBrowserColorScheme(newState.resolvedTheme).catch(() => {});
    });
    return () => { unsubscribe(); };
  }, []);
}

/** Get current resolved theme for WebView creation. */
export function getResolvedTheme(): 'light' | 'dark' {
  return themeController.getState().resolvedTheme;
}
```

- [ ] **Step 9: 修改 `useWebViewLifecycle` 传递 `colorScheme` 并修复 `loadingTabId` 时机**

文件: `frontend/src/app/features/browser/useWebViewLifecycle.ts`

在 `createWebViewForTab` 调用时传递 `colorScheme`：

```typescript
import { getResolvedTheme } from './useBrowserThemeSync';

// 在 activateOrCreate 中：
if (!isTabInPool(currentTabId)) {
  await createWebViewForTab(currentTabId, tab.url, getResolvedTheme());
}
```

同时修改 `UseWebViewLifecycleOptions` 接口，`createWebViewForTab` 签名更新为接受 `colorScheme`：

```typescript
createWebViewForTab: (tabId: string, url: string, colorScheme?: 'light' | 'dark') => Promise<string | null>;
```

修复 `loadingTabId` 清除时机 — 移到 `updateWebViewBounds` 之后：

```typescript
const activateOrCreate = async () => {
  const currentTabId = tab.id;
  setLoadingTabId(currentTabId);
  try {
    if (!isTabInPool(currentTabId)) {
      await createWebViewForTab(currentTabId, tab.url, getResolvedTheme());
    }
    await activateTabInPool(currentTabId);
    webViewActiveRef.current = true;
    if (!hideWebViewRequestedRef.current && !overlayActiveRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateWebViewBounds();
          setLoadingTabId(null);
        });
      });
    } else {
      setLoadingTabId(null);
    }
  } catch (e) {
    setLoadingTabId(null);
    throw e;
  }
};
```

注意：移除了 `finally` 块，改为在 RAF 回调和 else 分支中清除。catch 块也清除以防异常。

- [ ] **Step 10: 验收 — Rust 编译检查**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

- [ ] **Step 11: 验收 — 前端检查**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

- [ ] **Step 12: 验收 — Rust 测试**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace
```

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "fix(browser): eliminate theme flicker on WebView2 creation

- Pass resolved theme as parameter to browser_create_for_tab (eliminates 'dark' default race)
- Set WebView2 default background color via ICoreWebView2Controller2 (eliminates white flash)
- Create WebView with about:blank, apply theme via CDP, then navigate to real URL
- Skip about:blank in on_navigation handler to avoid spurious URL change events
- Fix loadingTabId clearing timing: clear after updateWebViewBounds, not before
- Ensures CDP prefers-color-scheme is applied before page first paint"
```

---

## 验收清单

完成所有 4 个任务后，运行完整验收流程：

- [ ] **前端完整检查**
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

- [ ] **Rust 完整检查**
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
```

- [ ] **用户测试场景**

用户需在 Tauri 桌面应用中验证以下场景：

1. **问题 1&2 验证**: 浅色/深色主题下打开 YouTube，确认无白色闪烁、无主题切换闪烁
2. **问题 3 验证**:
   - 切换按钮到"当前标签"模式，点击侧栏书签 → 应在当前标签打开
   - 切换按钮到"新建标签"模式，点击侧栏书签 → 应开新标签
   - 点击"已打开的标签"列表中的标签 → 应切换到该标签，标签名不变为 UUID
3. **问题 4 验证**: 关闭应用前打开网页，重新启动 → 启动覆盖层应完全遮挡 WebView2
4. **问题 5 验证**: 在 YouTube 内点击视频跳转 → 标签标题应更新为新视频标题

---

## 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| `about:blank` 导航可能触发 INIT_SCRIPT 异常 | 页面 meta 上报异常 | INIT_SCRIPT 应已处理空页面；Rust 端 `should_emit_and_update` 过滤空标题 |
| `ICoreWebView2Controller2` cast 可能失败 | 背景色未设置 | 使用 `if let Ok()` 容错，不影响其他功能 |
| `webview.navigate` 在 `with_webview` 闭包中调用 | 导航时序变化 | 闭包在 WebView 线程执行，Navigate 是同步调用，时序可控 |
| 移除标题锁后用户自定义名称丢失 | UX 变化 | 用户决策：自定义名称仅作用于书签，标签标题跟随页面 |
| `historyDedupKey` 包含 query string | 历史记录条目增多 | 这是正确行为：不同 query 参数的页面是不同页面 |
| `startupOverlayHidden` 状态延迟 | 启动时 WebView 可能短暂可见 | `overlayHidden` 初始为 false，store 默认 false，首次渲染即为正确状态 |
