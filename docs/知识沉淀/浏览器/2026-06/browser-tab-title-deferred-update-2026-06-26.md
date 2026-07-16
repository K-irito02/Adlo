# 浏览器标签标题延迟更新与通用 Prefetch

## 背景

标签标题在导航时出现两个问题：
1. 新页面加载期间短暂显示旧页面的标题（标题闪烁）
2. SPA 同站回退导航后标题永久停留在错误值

## 根因

### 标题闪烁

`browserNavigateActiveTab(url)` 在不提供 `title` 参数时保留旧标题：
```
title: title || tab.title  // 旧标题被保留
```
`onUrlChanged` 事件（Rust `navigation_handler`）在导航开始时立即触发，但真实标题要到页面加载后才通过 COM `DocumentTitleChanged` 或 HTTP prefetch 到达。这期间标签显示旧标题 → 真实标题到达后更新 → 造成闪烁。

### 标题不更新

同站 SPA 导航（如 bilibili pushState）时，`onUrlChanged` 处理函数**跳过 HTTP prefetch**（`isSameSite` 门控），仅依赖 COM 事件。SPA 下 `DocumentTitleChanged` 不可靠（页面不重新加载），导致标题永远不会被更新。

## 解决方案

### 1. 延迟标签更新

`onUrlChanged` 不再立即调用 `browserNavigateActiveTab(url)` 更新标签状态，而是：
- 更新地址栏（`setAddress`）让用户看到新 URL
- 立即启动 HTTP prefetch
- 等待 prefetch 或 `handlePageMeta`（COM 事件）提供真实标题后，**原子更新**标签 URL + title + favicon

### 2. 通用 Prefetch

移除 `isSameSite` 门控，所有导航（同站/跨站）都执行 HTTP prefetch：

```typescript
// 变更前：仅在跨站时 prefetch
if (!isSameSite) { tryPrefetch(); }

// 变更后：始终 prefetch
tryPrefetch();
```

### 3. 原子更新

prefetch 回调中，同时检查 URL 和 title 是否需要更新：

```typescript
const needsUrlUpdate = normalizeUrlForCompare(tab.url) !== normalizedUrl;
const needsTitleUpdate = tab.title !== meta.title;
if (needsUrlUpdate || needsTitleUpdate) {
  s.browserUpdateTab(tab.id, {
    ...(needsUrlUpdate ? { url: normalizedUrl } : {}),
    ...(needsTitleUpdate ? { title: meta.title } : {}),
  });
}
```

### 4. 后备方案

回退超时（新标签 8s，已有标签 15s）导航到 URL，用 URL 作为标题：

```typescript
if (!tabUrlMatches) {
  s.browserNavigateActiveTab(normalizedUrl, normalizedUrl);
} else if (!curTab.title) {
  s.browserUpdateTab(curTab.id, { title: normalizedUrl });
}
```

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/stores/slices/browserSlice.ts` | `browserNavigateActiveTab` 不再保留旧标题 |
| `frontend/src/app/features/browser/useBrowserUrlChange.ts` | 延迟标签更新、通用 prefetch、原子更新 |

## 影响范围

- 仅影响 Tauri 桌面模式下 `onUrlChanged` 事件处理
- 浏览器/iframe 模式不受影响（`handleIframeLoad` 使用不同的标题获取路径）
- 不影响标签手动编辑标题、书签创建等功能
