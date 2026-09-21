# 浏览器标签右键菜单与悬停按钮 — 2026-06-22

## 问题清单

| # | 问题 | 根因 | 涉及文件 |
|---|------|------|---------|
| 1 | 导航器树中标签（工作区目录/非工作区目录）无右键菜单 | 只有目录节点有右键菜单，标签叶节点缺少交互入口 | `BrowserEntrySubEntries.tsx`, `BrowserTreeEntry.tsx` |
| 2 | 标签无悬停操作按钮 | 目录节点有 hover 按钮（+、删除、更多），标签节点无 | `BrowserEntrySubEntries.tsx`, `BrowserTreeEntry.tsx` |
| 3 | 标签 Logo/标题因网络原因获取失败后无法手动刷新 | 无缓存清理和重新获取机制 | `fetchPageMeta.ts`, `useBrowserTreeActions.ts` |
| 4 | 删除标签时状态残留（收藏、工作区收藏、文件夹、缓存） | 无统一的删除清理逻辑 | `browserBookmarkSlice.ts` |

## 解决方案

### 1. 标签右键菜单（6 项）

在 `BrowserEntrySubEntries.tsx`（树模式）和 `BrowserTreeEntry.tsx`（平铺模式）中新增 `getTabContextMenuItems`：

| 菜单项 | 功能 | 实现 |
|--------|------|------|
| 在当前标签打开 | 将激活标签 URL 更新为目标标签 URL | `browserUpdateTab(activeTabId, { url, title })` |
| 在新标签打开 | 创建新标签并加载目标 URL | `browserOpenTab(url, title)` |
| 刷新 | 清除缓存后重新获取 favicon 和标题，保留用户自定义名称 | `clearFaviconCacheForUrl` + `clearPageMetaCacheForUrl` + `prefetchPageMeta` + `isTabTitleLocked` 守卫 |
| 编辑 | 弹出编辑对话框，可修改名称和 URL | 复用 `CreateTabDialog`，新增 `initialName`/`initialUrl` props |
| 复制链接 | 复制 URL 到剪贴板 | `navigator.clipboard.writeText` + textarea fallback |
| 删除 | 彻底删除标签及所有关联状态 | `browserRemoveTabBookmarks` + 缓存清理 + `browserCloseTab` |

### 2. 标签悬停按钮（2 项）

| 按钮 | 功能 | 图标 |
|------|------|------|
| 刷新 | 与右键菜单"刷新"一致 | `IconRefreshCw` |
| 更多操作 | 点击弹出右键菜单 | `IconMoreVertical` |

### 3. 编辑对话框复用

`CreateTabDialog` 新增 `initialName`/`initialUrl` props，编辑模式下：
- 对话框标题改为"编辑标签"
- 确认按钮改为"保存"
- 输入框预填当前名称和 URL

### 4. 缓存清理工具函数

`fetchPageMeta.ts` 新增：
- `clearFaviconCacheForUrl(url)`：清除指定 URL 的 favicon 缓存
- `clearPageMetaCacheForUrl(url)`：清除指定 URL 的页面元数据缓存
- `unlockTabTitle(tabId)`：解除标题锁定（允许后续自动更新）

### 5. 统一删除 Store Action

`browserBookmarkSlice.ts` 新增 `browserRemoveTabBookmarks(tabId, url)`：
- 从书签列表移除（by URL）
- 从工作区书签移除（by tabId）
- 从文件夹移除（by tabId）
- 持久化所有变更

## 架构要点

### 回调链传递

```
BrowserPanel → BrowserNavigator → BrowserTabTree → BrowserCategorySection → BrowserTreeEntry → BrowserEntrySubEntries
```

新增 6 个回调：
- `onRefreshTab` / `onEditTab` / `onDeleteTab` / `onCopyTabLink` / `onOpenTabInNewTab` / `onOpenTabInCurrentTab`

### 双模式支持

| 模式 | 右键菜单 | 悬停按钮 | 实现位置 |
|------|---------|---------|---------|
| 树模式（默认） | `handleChildContextMenu` | `renderChildMeta` | `BrowserEntrySubEntries.tsx` |
| 平铺模式（展平列表） | `onContextMenu` + `contextMenuForTab` state | 内联 JSX | `BrowserTreeEntry.tsx` |

### 类型安全

- `SectionCallbacks` / `BrowserTabTreeCallbacks` 接口同步扩展
- `childMenuState` 新增 `node?: BrowserTreeNode` 可选字段，用于区分目录/标签菜单

## 经验教训

1. **右键菜单复用**：标签右键菜单和目录右键菜单共用同一菜单渲染机制（`childMenuSlot`），通过 `node.nodeType` 区分菜单项
2. **悬停按钮复用**：标签悬停按钮和目录悬停按钮共用同一渲染函数（`renderChildMeta`），通过 `childNode.kind === 'file'` 区分渲染内容
3. **标题锁定保护**：刷新时通过 `isTabTitleLocked(tabId)` 检查，确保用户自定义名称不被覆盖
4. **删除彻底性**：删除操作需清理 5 个维度：书签、工作区书签、文件夹、favicon 缓存、页面元数据缓存
5. **平铺模式独立处理**：`BrowserTreeEntry` 平铺模式不走 `BrowserEntrySubEntries`，需单独实现右键菜单和悬停按钮