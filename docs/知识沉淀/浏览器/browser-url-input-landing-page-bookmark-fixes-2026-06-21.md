# 浏览器 URL 输入框、空 URL 着陆页、书签星号修复 —— 2026-06-21

## 问题清单

本次会话共修复 4 个问题：

| # | 问题 | 根因 | 涉及文件 |
|---|------|------|---------|
| 1 | URL 输入框 blur 后不恢复 | `handleAddressBlur` 未在 `activeTabUrl` 存在时恢复 | `useBrowserUrlState.ts` |
| 2 | 空 URL + Enter 不显示着陆页 | `submitAddress` 对空输入是 no-op，Tab URL 未清除 | `browserpanel.tsx` |
| 3 | Tauri 模式下空 URL 仍显示空白 WebView | 原生 WebView 覆盖 React 着陆页 | `useBrowserWebView.ts` |
| 4 | 书签星号在着陆页始终点亮 | `isBookmarked` 对空 URL 返回 `true` | `useBrowserTabs.ts` / `browserBookmarkSlice.ts` |
| 5 | Enter 后页面不加载（Tauri） | `updateWebViewBounds` 中 `activeTabRef.current?.url` 守卫过于激进 | `useBrowserWebView.ts` |

---

## 1. URL 输入框 blur 恢复

### 现象
- 删除 URL 文本 → 点击页面空白 → 地址栏折叠 → URL 仍为空，未恢复为当前标签 URL

### 修复
`useBrowserUrlState.ts:42-47` — `handleAddressBlur`：
```typescript
const handleAddressBlur = () => {
  setAddressExpanded(false);
  if (activeTabUrl !== undefined) {
    setAddress(activeTabUrl);  // 恢复为当前标签 URL
  }
};
```
同时 Escape 键在恢复 URL 后折叠地址栏：
```typescript
} else if (event.key === 'Escape') {
  if (activeTabUrl !== undefined) {
    setAddress(activeTabUrl);
  }
  setAddressExpanded(false);
  addressInputRef.current?.blur();
}
```

---

## 2. 空 URL + Enter → 着陆页

### 现象
- 地址栏清空后按 Enter，无反应

### 修复
`browserpanel.tsx:364-371` — `submitAddress`：
```typescript
if (!input) {
  if (activeTab?.id && activeTab?.url) {
    browserUpdateTab(activeTab.id, { url: '' });  // 清除标签 URL
  }
  setAddress('');
  return;
}
```
空输入时主动将 Tab URL 设为 `''`，后续 useEffect 检测到空 URL 后显示 Landing Page。

### 关键
- 仅当标签当前有 URL 时才 `browserUpdateTab`（避免重复写空值）
- 不使用 `about:blank`，使用 `''` 作为"空标签"的统一标识

---

## 3. Tauri 原生 WebView 不隐藏（着陆页被覆盖）

### 现象
- 步骤 2 在浏览器模式正常，Tauri 模式下仍是白屏（WebView 覆盖 React 着陆页）

### 修复
`useBrowserWebView.ts:342-357` — 新增 useEffect 监听空 URL：
```typescript
useEffect(() => {
  const url = activeTab?.url;
  if (!url || url === 'about:blank' || url.trim() === '') {
    if (webViewActiveRef.current) {
      webViewHiddenByEmptyUrlRef.current = true;
      recentNavigatedUrlsRef.current.clear();  // 清除导航缓存
      hideWebView();  // 移到 (-10000,-10000)
    }
    return;
  }
  webViewHiddenByEmptyUrlRef.current = false;
  navigateTauriUrl(url);
}, [activeTab?.id, activeTab?.url, ...]);
```

同时 `updateWebViewBounds` 中加入守卫：
```typescript
if (!webViewVisibleRef.current || webViewHiddenByEmptyUrlRef.current) {
  return;  // 不恢复 WebView
}
```

### 关键
- `recentNavigatedUrlsRef.current.clear()` — 确保清除导航缓存，每次从空状态导航到真实 URL 时不会因 `isUrlRecentlySeen` 被跳过
- `webViewHiddenByEmptyUrlRef` 为独立 ref，与 React 渲染周期解耦

---

## 4. 书签星号在着陆页始终点亮

### 现象
- 在 Landing Page（空标签）上，书签星号按钮永远是蓝色填充状态
- 点击无法取消（点击后状态不变）

### 根因
`browserToggleBookmark` 中 URL fallback 使用 `||` 运算符：
```typescript
// 修复前：
const url = input?.url?.trim() || active?.url || 'about:blank';
// 修复后：
const url = input?.url?.trim() ?? active?.url ?? 'about:blank';
```
`||` 将空字符串 `''` 视为 falsy，`input?.url?.trim()` 返回 `''` 时回退到 `active?.url`；而 `isBookmarked` 在空 URL 时返回 `true`（因为 bookmark 列表中有 `{ url: '' }` 条目）。两者共同导致：
1. `browserToggleBookmark()` 查找 `''` 找不到 → 创建 `{ url: '' }`
2. 再次点击，`||` 回退到 `active?.url`（可能是真实 URL）→ 删除的是真实 URL 的书签（如果有），`{ url: '' }` 一直保留
3. `isBookmarked` 每次都命中 `{ url: '' }` → 星号始终点亮

### 修复（三处）

**① `useBrowserTabs.ts:75-77`** — `isBookmarked` 对空 URL 返回 false：
```typescript
const isBookmarked = activeTab?.url
  ? browserBookmarks.some((bookmark) => bookmark.url === activeTab.url)
  : false;
```

**② `browserBookmarkSlice.ts:46`** — `||` → `??`：
```typescript
const url = input?.url?.trim() ?? active?.url ?? 'about:blank';
```

**③ `browserBookmarkSlice.ts:96-98`** — `browserBookmarkTab` 阻止空 URL 创建书签：
```typescript
if (!tab || !tab.url) {
  return {};
}
```

### 关键经验
- `||` 和 `??` 的区别：`??` 只回退 `null`/`undefined`，`||` 回退所有 falsy 值（含 `''`、`0`、`false`）
- URL 值的空/非空判断必须使用 `??`，因为 `''` 是合法的空标签标识，不是"缺失"
- 布尔推导（`isBookmarked`）和状态写入（`browserToggleBookmark`）必须对状态边界保持对称

---

## 5. Tauri 下 Enter 后页面不加载

### 现象
- 步骤 2 修复后：清空 URL 按 Enter → 着陆页正常 → 输入 URL 按 Enter → 页面空白

### 根因
`updateWebViewBounds` 中新增的守卫过于激进：
```typescript
// 修复前（有 bug）：
if (!webViewVisibleRef.current || !activeTabRef.current?.url) {
  return;
}
```
问题在于：`navigateTauriUrl` 被调用后，`navigateTauriUrl` 内部会调用 `updateWebViewBoundsRef.current()` 通过 rAF 恢复 WebView 显示。但此时 `activeTabRef.current?.url` 仍是旧值（React 的 `activeTab` 引用尚未通过 setState 更新），导致守卫拦截，WebView 无法恢复。

### 修复
引入独立 ref `webViewHiddenByEmptyUrlRef` 区分"因空 URL 隐藏"和"其他原因隐藏"：
```typescript
// 空 URL 隐藏时设为 true
webViewHiddenByEmptyUrlRef.current = true;

// navigateTauriUrl 开始时立即设为 false
webViewHiddenByEmptyUrlRef.current = false;

// updateWebViewBounds 使用此 ref 而非 activeTabRef
if (!webViewVisibleRef.current || webViewHiddenByEmptyUrlRef.current) {
  return;
}
```
`webViewHiddenByEmptyUrlRef` 在 `navigateTauriUrl` 内部的第一个操作就是设为 `false`，早于任何 rAF 回调执行。这样 `updateWebViewBounds` 即使被 rAF 延迟执行也能读到正确的值。

---

## 经验教训

1. **空字符串是合法状态**：在 URL 处理中，`''` 是"空标签"的合法标识。使用 `||` 回退会误判。必须用 `??` 区分"未提供"和"有意为空"。

2. **Tauri WebView 生命周期与 React 不同步**：IPI 调用（`browser_navigate`、`browser_set_bounds`）是同步/微任务级的，而 React re-render 是宏任务级的。WebView 状态管理必须通过 ref 完成，不能依赖 React 状态或 props 的即时性。

3. **重置导航缓存**：URL 从空 → 非空时，必须清除 `recentNavigatedUrlsRef`，否则 `isUrlRecentlySeen` 可能会跳过导航。

4. **布尔推导的对称性**：`isBookmarked` 和 `browserToggleBookmark` 对空 URL 的处理必须对称。一个返回 false 时，另一个不能创建包含空 URL 的书签。

5. **独立 ref 解耦渲染时机**：当需要根据 A 条件隐藏 X，再根据 B 条件恢复 X 时，使用独立 ref 记录隐藏原因，而不是复用已有的状态引用来推断。

> 由自动化知识沉淀生成于 2026-06-21
