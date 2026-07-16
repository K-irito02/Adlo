# 浏览器标签刷新语义优化 — 2026-06-23

## 变更

### 刷新 tooltip
- 悬停按钮：`t.browserRefreshMeta` = "刷新Logo/标题"
- 上下文菜单：`t.browserRefreshMeta` + `t.browserRefreshMetaHint` = "刷新Logo/标题" + "!" 提示卡

### "!" 提示卡文案
- 说明功能：重新获取 Logo 图标与标题，清除旧缓存；若标签名称已自定义则保留

### 功能不变
- `handleRefreshTab` 逻辑不变：`clearFaviconCacheForUrl` + `clearPageMetaCacheForUrl` + `prefetchPageMeta` + `isTabTitleLocked` 守卫

## 实现要点

### i18n
- 新增 `browserRefreshMeta` / `browserRefreshMetaHint`（zh-CN + en-US）

### 悬停按钮
- `getTabHoverButtons`（两个组件）的 refresh label 改为 `t.browserRefreshMeta`

### 上下文菜单
- 两个组件的刷新项 label 改为 `t.browserRefreshMeta`，新增 `hint: t.browserRefreshMetaHint`
- `BrowserEntrySubEntries.tsx`：`childMenuSlot` 已有 "!" 渲染逻辑，自动生效
- `BrowserTreeEntry.tsx`：新增 `showTabHint` 回调（定位 `browser-tab-context-menu`）+ 标签菜单 "!" 渲染

## 涉及文件
- `i18n/zh-CN/browser.ts` / `en-US/browser.ts`：新增 2 个 key
- `BrowserEntrySubEntries.tsx`：hover button + context menu item
- `BrowserTreeEntry.tsx`：hover button + context menu item + "!" 渲染
