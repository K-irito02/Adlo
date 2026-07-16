# 浏览器 Favicon/Title 同步修复

> 2026-07-01 修复执行

## 5 个根因

| # | 问题 | 表现 | 修复 |
|---|------|------|------|
| 1 | Favicon 缓存仅存内存，未持久化到 localStorage | 应用重启后 favicon 丢失 | `setCachedFavicon` 写入时 500ms debounce 持久化到 `adl-ui:browser-favicon-cache`，模块加载时恢复 |
| 2 | `handlePageMeta` 无源优先级，`shouldReplaceFavicon` 质量评分被 COM 空 favicon 覆盖 | 真实 favicon 被空值覆盖 | `processedMetaRef` 去重升级为源优先级（com=4 > iframe=3 > http=2 > google=1），允许同 URL 高优先级覆盖低优先级 |
| 3 | HTTP prefetch 路径 (`tryPrefetch`/`fetchPageMeta`) 直接写 store (`setCachedFavicon`/`browserUpdateTab`)，绕过 `shouldReplaceFavicon` 质量检查 | HTTP 低质量 favicon 覆盖 COM 高质量 | HTTP prefetch → `onPageMeta?.(..., 'http')` → `handlePageMeta`，统一走质量评分系统 |
| 4 | `BrowserTabBar` 内联 `<img>` 直接使用 tab.url 的 favicon，未通过 `subscribeFavicon` 订阅缓存变更 | TabBar favicon 不会随缓存更新而刷新 | TabBar 改用 `BrowserFavicon` 组件（含 `subscribeFavicon` 订阅机制） |
| 5 | 过期/无效的 persisted favicon 无清理机制 | 应用重启后仍显示失效的 favicon | `BrowserFavicon.onError` 回调中 `clearFaviconCacheForUrl` 清理缓存 |

## 架构变化

### 单一元数据入口

```
所有元数据事件 → handlePageMeta(source, url, title, favicon)
                    ├─ 源优先级判定
                    ├─ Favicon 质量评分 (shouldReplaceFavicon)
                    ├─ 写 favicon 缓存 + localStorage 持久化
                    └─ 更新 tab title + history
```

### 缓存持久化流

```
setCachedFavicon(url, favicon)
  → faviconUrlCache (Map<string, string>)
  → schedulePersistFaviconCache() (500ms debounce)
    → localStorage.setItem('adl-ui:browser-favicon-cache', JSON)
  
模块加载时:
  loadPersistedFaviconCache()
    → localStorage.getItem → faviconUrlCache (仅导入未缓存的条目)
```

### 源优先级系统

- `com=4` — WebView2 meta-changed 事件（最权威）
- `iframe=3` — 浏览器模式 iframe DOM 读取
- `http=2` — HTTP prefetch/proxy 获取
- `google=1` — Google S2 favicons 降级

优先级在 `processedMetaRef` 中 2 秒 TTL 窗口内生效：高优先级事件可以覆盖已处理的低优先级条目，反之不行。

### Favicon 质量评分系统

在 `shouldReplaceFavicon` 中，根据文件名/扩展名评分：
- `.svg` → 10分
- `256x256.png` → 15分，`128x128.png` → 14分
- `apple-touch-icon` → 13分
- 含 512/256/192/180 → 14分
- 其他 `.png/.jpg/.webp/.gif` → 11分
- `.ico` → 2~4分
- Google S2 / 聚合器 → 1分

### BrowserFavicon 订阅模式

`BrowserFavicon` 组件通过 `subscribeFavicon(url, callback)` 注册回调，当 `setCachedFavicon` 更新同 URL 缓存时，自动通知所有订阅者刷新。

`BrowserTabBar` 和 `BrowserTreeEntry` 均使用 `BrowserFavicon` 组件。

### 过期缓存驱逐

`BrowserFavicon.onError` → 如果非 Google S2 源出错 → `clearFaviconCacheForUrl` → 降级到 Google S2。

## 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/utils/fetchPageMeta.ts` | favicon 缓存管理 + 持久化 + 订阅系统 |
| `frontend/src/app/features/browser/useBrowserPageMeta.ts` | 源优先级系统 + handlePageMeta 统一入口 |
| `frontend/src/app/features/browser/useBrowserUrlChange.ts` | HTTP prefetch → onPageMeta 路由 |
| `frontend/src/app/features/browser/BrowserPanel.tsx` | Google S2 预加载 + browser-mode submit → handlePageMeta |
| `frontend/src/app/components/BrowserFavicon.tsx` | favicon 显示 + 订阅 + 错误保护 |
| `frontend/src/app/features/browser/BrowserTabBar.tsx` | TabBar 使用 BrowserFavicon 组件 |

## 注意事项

1. Bilibili 等服务商屏蔽 favicon 外部引用 → `onError` 自动降级到 Google S2
2. YouTube 屏蔽 HTTP 请求 → `fetch_page_meta_inner` 返回空标题，由 COM 实时同步路径补全
3. `UnhandledRejection: Cannot read properties of undefined (reading 'handlerId')` 是 Tauri HMR 重载竞态，非本模块问题
