# 浏览器导航去重修复 – handlePageMeta 并发回调去重

**日期**：2026-06-21

## 问题现象

1. 在浏览器中点击链接跳转后，新页面自动重新刷新
2. 历史记录中出现重复标签

此前已在 2026-06-20 修复过一次（见 [browser-navigation-mode-toggle-2026-06-20.md](./browser-navigation-mode-toggle-2026-06-20.md)），但第七十四轮重构（提取 `useBrowserPageMeta` 等 hooks）后，部分修复逻辑因 `markUrlSeen` 调用时机变化而失效。

## 根因分析

`handlePageMeta` 函数被两个并发回调路径同时调用，这是有意为之的互补设计：

| 路径 | 触发源 | 数据 | 延迟 |
|------|--------|------|------|
| `onUrlChanged` → `browser_fetch_page_meta` → `handlePageMeta` | WebView2 `on_navigation` 事件 | 完整 meta（title + favicon） | 异步 HTTP，较慢 |
| `meta-changed` → `handlePageMeta` | INIT_SCRIPT MutationObserver 监听 `<title>` | 仅 title（从 `location.href` 获取 URL） | 同步，极快 |

两个路径互补：路径 B 提供即时标题，路径 A 补充 favicon。但两者都调用 `handlePageMeta`，且都可能到达 step 3（创建新标签）。

### 具体问题链

**问题 1：页面刷新**
- `handlePageMeta` 的 step 3 在默认新建标签模式中**没有调用 `markUrlSeen`**
- `meta-changed` 路径创建新标签 → `useEffect` 触发 `navigateTauriUrl` → `isUrlRecentlySeen` 不命中 → `invoke('browser_navigate')` → 页面刷新

**问题 2：重复标签**
- 两个路径几乎同时到达 step 3，step 1 的精确 URL 去重无法处理 URL 微差异（SPA pushState、尾部斜杠等）
- 两个路径各自创建标签 → 出现重复标签和历史记录

## 修复方案

两处修改，均在 [useBrowserPageMeta.ts](../../../ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts)：

### 修复 1：step 3 创建标签前调用 `markUrlSeen`

```typescript
// 3. No match: create new tab or update active tab
if (markUrlSeen) {
  markUrlSeen(meta.url);  // ← 新增：防止导航循环
}
```

### 修复 2：新增 `processedMetaRef` 去重

```typescript
const processedMetaRef = useRef<Map<string, number>>(new Map());
const META_DEDUP_TTL = 5000; // ms

// 在 handlePageMeta 入口处检查
if (isMetaRecentlyProcessed(meta.url)) {
  return;  // 另一路径已处理，跳过
}
// 创建标签前标记
processedMetaRef.current.set(meta.url, Date.now());
```

去重逻辑同时支持精确 URL 匹配和 hostname+pathname 匹配，TTL=5000ms 确保覆盖慢速 HTTP meta fetch 的延迟。

## 关键经验

1. **并发回调需去重**：当一个函数被多个异步回调路径调用时，必须考虑并发去重，不能仅依赖同步状态检查（如 step 1 的 `browserTabs.find`）
2. **`markUrlSeen` 调用时机**：必须在创建标签/历史的 store action **之前**调用，不能仅依赖 `onUrlChanged` 中的调用（因为 `meta-changed` 路径不经过 `onUrlChanged`）
3. **SPA pushState URL 差异**：`on_navigation` 和 `location.href` 可能返回不同 URL，去重必须支持 hostname+pathname 级匹配
4. **互补架构是正常的**：两个路径各司其职（一个提供完整 meta，一个提供即时响应），不应合并为单一路径，而应做好并发去重

> 由自动化知识沉淀生成于 2026-06-21