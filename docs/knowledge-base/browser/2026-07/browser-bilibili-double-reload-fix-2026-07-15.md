# Bilibili 双击刷新 Bug 修复

## 问题
Bilibili 视频点击导致浏览器面板双击刷新（YouTube 正常）。

## 根因
两重问题叠加：

1. **URL 尾斜杠不一致**：`onUrlChanged` Rust 事件 URL 不带尾斜杠（`.../BV123`），`meta.url` 带尾斜杠（`.../BV123/`）。`useBrowserMetaSubscription` 用 `meta.url` 覆盖 store URL 后，`useWebViewLifecycle` 的 `Set.has()` 因尾斜杠不匹配返回 false，触发冗余 `navigateTabInPool`。

2. **boolean ref 不支持重定向**：Bilibili 的跟踪参数重定向（URL-A → URL-B）在两次 `onUrlChanged` 间，boolean `webViewSelfNavigatedRef` 被第二次事件覆盖，丢失第一次 URL 的标记。

## 修复
- `useBrowserMetaSubscription.ts`: 用 `normalizeUrlForCompare` 归一化 `meta.url` 后再比较和存储
- `useWebViewLifecycle.ts`: `Set.has()` 之前先归一化 `tab.url`
- `browser_navigation.rs`: 改用事件驱动 SPA 导航检测（pushState/replaceState/popstate），替代固定延迟回退
- `useBrowserUrlChange.ts`: boolean → `Set<string>` 追踪自导航 URL，支持重定向链，上限 10

## 关键教训
- 事件源不同（Rust onUrlChanged vs 页面 JS meta events）可能产生不同格式的 URL
- Set 优于 boolean 处理重定向链，但需在消费后删除条目防止跨导航周期泄漏
- SPA 导航检测应组合微任务（同步 pushState）和 setTimeout（异步路由）双重保护
- 归一化函数（`normalizeUrlForCompare` 和 `isSamePage`）应保持一致的尾斜杠处理逻辑
