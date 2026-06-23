# 浏览器 URL 输入框、着陆页与书签循环问题修复 —— 2026-06-23

## 核心问题

"清除 URL + 回车"与"书签状态"之间反复出现循环回归：

| 方案 | 着陆页 | 书签 |
|------|--------|------|
| `browserUpdateTab(id, { url: '' })` | ✅ 显示 | ❌ 标签URL变空，书签图标变兜底 |
| `browserUpdateTab(id, { url: 'about:blank' })` | ✅ 显示 | ❌ 标签URL变about:blank，点击无反应 |
| `browserCloseTab + browserOpenTab` | ✅ 显示 | ❌ 书签从目录消失（文件夹引用或标签ID） |
| `showLandingOverride` React 状态 | ❌ WebView覆盖 | ✅ 标签不变 |
| `hideWebView()` 直接调用 | ❌ 点击书签无法返回 | ✅ 标签不变 |

## 根因

**Tauri WebView 是原生 OS 窗口，始终覆盖 React DOM。** WebView 的显隐仅由 `activeTab?.url` 变化触发的 `useEffect` 控制（`useBrowserWebView.ts:342-357`）。任何不修改标签 URL 的方案都无法隐藏 WebView，任何修改标签 URL 的方案都会影响书签（因为书签文件夹存储标签 ID）。

## 最终方案：Zustand `showLandingPage` 解耦

### 核心思路

新增 `showLandingPage: boolean` 到 Zustand store（`browserSlice.ts`），独立控制 WebView 显隐，与 `activeTab?.url` 完全解耦。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `stores/slices/browserSlice.ts` | 新增 `showLandingPage` 字段 + `setShowLandingPage` setter |
| `stores/slices/browserTabsSlice.ts` | `browserSelectTab` 选中同一标签且 `showLandingPage=true` 时一起清除 |
| `BrowserPanel.tsx` | `submitAddress('')` → `setShowLandingPage(true)`；地址 sync effect deps 增加 `activeTab?.id` |
| `useBrowserWebView.ts` | 订阅 `showLandingPage`，WebView 显隐 effect 增加 `showLandingPage` 判断 |
| `BrowserPanelContent.tsx` | 地址为空时 `isBookmarked=false`，`onOpenBookmarkDialog` 为空操作 |

### 核心逻辑

```typescript
// BrowserPanel.tsx — submitAddress('')
if (!input) {
  addressSubmittedForTabRef.current = 'about:blank';
  setAddress('');
  useAppStore.getState().setShowLandingPage(true);
  return;
}

// useBrowserWebView.ts — WebView 显隐 effect
if (showLandingPage || !url || url === 'about:blank' || url.trim() === '') {
  hideWebView();
  return;
}
webViewHiddenByEmptyUrlRef.current = false;
navigateTauriUrl(url);

// browserTabsSlice.ts — browserSelectTab
browserSelectTab: (tabId) => {
  scheduleWrite(BROWSER_ACTIVE_TAB_KEY, tabId);
  set((state) => {
    if (state.browserActiveTabId === tabId && state.showLandingPage) {
      return { browserActiveTabId: tabId, showLandingPage: false };
    }
    return { browserActiveTabId: tabId };
  });
},
```

### 完整数据流

```
清空 URL + Enter
  → setShowLandingPage(true)
  → WebView effect 检测 showLandingPage=true → hideWebView()
  → BrowserPanelContent: !urlState.address=true → 着陆页渲染

点击书签（新建标签，同 URL）
  → browserOpenTab(url) → 新 tabId
  → address sync effect fires (activeTab?.id 变化)
  → setShowLandingPage(false)
  → WebView effect: showLandingPage=false + URL有效 → navigateTauriUrl + updateWebViewBounds

点击书签（选中已有标签，同一标签）
  → browserSelectTab(tabId)
  → set({ browserActiveTabId: tabId, showLandingPage: false })
  → WebView effect: showLandingPage=false → updateWebViewBounds

在地址栏输入新 URL + 回车
  → submitAddress(url) → setShowLandingPage(false)
  → 导航到 URL → WebView 显示新页面
```

### 经验教训

1. **不要通过修改标签 URL 来驱动 UI**：标签 URL 是书签系统的核心引用（文件夹存储标签 ID），修改它会级联影响书签显示和点击行为。显隐控制应该与标签数据解耦。
2. **Tauri WebView 是原生层**：WebView 是 OS 级渲染表面，不在 React DOM 树中。判断 WebView 可见性时必须考虑这一层，不能只依赖 React 条件渲染。
3. **`browserSelectTab` 选中同一标签**：Zustand `set({ browserActiveTabId })` 同一值时 React 不会重渲染。需要额外检查显隐状态并主动清除。
4. **地址 sync effect 的 deps**：不仅依赖 `activeTab?.url`，还需依赖 `activeTab?.id` —— 当新标签的 URL 与旧标签相同时，只有 ID 变化能触发 effect。
