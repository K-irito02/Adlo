# 浏览器文件夹删除书签清理修复 — 2026-06-30

## 问题清单

| # | 问题 | 场景 | 根因 |
|---|------|------|------|
| 1 | 删除文件夹导致已打开标签被关闭 | 删除自定义目录（`browserDeleteTabFolder`） | 函数中过滤了 `browserTabs`，移除匹配的标签 |
| 2 | 树渲染出现 ID 冲突 | 同一 tabId 同时存在于多个文件夹 | `buildTabNode` 未使用 `_uniqueKey` 参数构造 React key |
| 3 | 嵌套目录标签未删除 | "删除所有标签[嵌套]" 只删除了目标目录的直接子标签 | `browserDeleteAllTabsInNode` 未递归清理子目录 |
| 4 | 工作区级"删除所有标签"不清理文件夹标签 | 在工作区分类（workspace）上执行"删除所有标签[嵌套]" | workspace 分支只查 `browserTabs`，未收集文件夹中的标签 |
| 5 | 标签删除后书签图标仍为实心 | 执行任意文件夹删除操作后 | `browserRemoveTabBookmarks` 使用 open tab URL（可能已变更）而非文件夹条目中的 snapshot URL |

## 涉及文件

| 文件 | 修改 |
|------|------|
| `browserFoldersSlice.ts` | 移除 `browserDeleteTabFolder` 中的 `browserTabs` 过滤；`browserDeleteAllTabsInNode` 递归清除所有子目录标签；workspace路径补充 `folderIdsToClear` 逻辑 |
| `useBrowserTreeData.ts` | `buildTabNode` 使用 `uniqueKey` 参数构造 key |
| `useBrowserTreeActions.ts` | 新增 `collectFolderTabSnapshotUrls` 辅助函数；`handleDeleteAllChildTabs` workspace 分支增加文件夹标签收集；3 个 handler 改用 snapshot URL 调用 `browserRemoveTabBookmarks` |
| `browserBookmarkSlice.ts` | `browserBookmarkTab` 去重键从 `tabId` 改为 `(tabId, url)`；`browserRemoveTabBookmarks` 支持空 `tabId` 进行仅 URL 的第二轮清理 |

### Phase 2（此会话）新增问题

| # | 问题 | 场景 | 根因 |
|---|------|------|------|
| 6 | React 树渲染 key 冲突 | 同一 tabId + 不同 URL 的多个书签条目 | `uniqueKey` 未包含 URL，`bookmark:` 路径同理 |
| 7 | 书签清除遗漏（Map 丢弃条目） | 文件夹中有同一 tabId 不同 URL 的多个条目 | `collectFolderTabSnapshotUrls` 使用 `if (!map.has(item.tabId))` 去重，只保留第一条 URL |
| 8 | 书签清除遗漏（文件夹独有条目） | 文件夹书签不含 `workspaceId` | workspace 分支未直接收集 `folder.tabs` 的 URL |
| 9 | `browserBookmarkTab` 重复 | 同一标签在不同 URL 时收藏 | 去重键只用 `tabId`，导致替换而非追加 |

## 架构洞察

### 1. `collectAllDescendantTabIdsLocal` 只返回子文件夹标签

```typescript
export function collectAllDescendantTabIdsLocal(folders, parentId): string[] {
  const directChildren = folders.filter(f => f.parentId === parentId);
  for (const child of directChildren) {
    // collects child.tabs but NOT parent's own tabs
  }
}
```

不收集根文件夹自身的 `tabs`，调用方需自行补充。文件夹分支（`handleDeleteAllChildTabs` folder 路径）通过 `folder.tabs` 单独添加自身标签；workspace 分支原始实现未做此补充，导致自身标签被遗漏。

### 2. 书签 URL 存储分离

`browserBookmarks` 是一个**按 URL 去重**的扁平列表，不关联文件夹。同一 tabId 可能在不同的时间被收藏到不同目录，每个目录条目中的 `url` 是当时的快照（snapshot URL）。删除文件夹标签时必须使用 snapshot URL 而非 open tab URL，否则若用户在收藏后导航到其他页面，open tab URL 将无法匹配原始的 `browserBookmarks` 条目。

### 3. 三种删除路径的 URL 来源

| 删除操作 | URL 来源 | 说明 |
|---------|---------|------|
| 标签右键"删除"（单个标签） | open tab URL (`browserTabs`) | 标签同时存在于 `browserTabs` 和 `browserBookmarks` |
| 目录级"删除自身目录标签" | snapshot URL（文件夹条目） | 只删除直接子标签 |
| 目录级"删除所有标签[嵌套]" | snapshot URL（自身+子目录） | 递归收集所有嵌套标签 |
| 目录级"删除此目录" | snapshot URL（自身+子目录） | 删除目录+所有标签 |
| 工作区级"删除所有标签[嵌套]" | 文件夹标签用 snapshot URL，其余用 open tab URL | 工作区可能同时拥有 open tabs 和文件夹 |

### 4. `collectFolderTabSnapshotUrls` vs `collectAllDescendantTabIdsLocal` 差异

两个函数都遍历文件夹树，但：
- `collectFolderTabSnapshotUrls` 包含**根文件夹自身**的 `tabs`（先 `visit` 根节点再递归子节点）
- `collectAllDescendantTabIdsLocal` **不包含**根文件夹自身的 `tabs`（只查子节点）

这是因为前者用于收集所有需要清理标签的 URL（范围应包含自身），后者设计为"子节点优先"以配合调用方先加自身标签的编码习惯。

### 5. `collectFolderTabSnapshotUrls` 的 tabId 去重陷阱

```typescript
function collectFolderTabSnapshotUrls(folders, rootFolderId): Map<string, string> {
  const map = new Map();
  // ...
  for (const item of folder.tabs) {
    if (!map.has(item.tabId)) {    // ← 只保留每个 tabId 的第一条 URL
      map.set(item.tabId, item.url);
    }
  }
  return map;
}
```

当文件夹中有同一 tabId 不同 URL 的多个条目时（常见于标签反复导航后收藏），Map 只保留第一条 URL，其余全部丢失。**不能依赖此函数收集所有 URL**。

**修复模式**：在调用 `collectFolderTabSnapshotUrls` 建立 `tabId→URL` 映射后，额外直接扫描根文件夹的 `tabs` 数组收集所有唯一 URL：

```typescript
// Map 丢失的 URL 通过直接扫描补充
for (const fId of rootFolderIds) {
  const folderEntry = state.browserTabFolders.find((f) => f.id === fId);
  if (folderEntry?.tabs) {
    for (const item of folderEntry.tabs) {
      if (item.url && !urls.includes(item.url)) {
        urls.push(item.url);
      }
    }
  }
}
```

### 6. React Tree Key 必须包含 URL

React key 仅用 `tabId` 时，同一 tabId 的书签条目在树展开时会渲染为相同 React 元素，导致 `key` 冲突警告和视觉重叠。

**修复模式**：所有 `buildTabNode` 和 `path` 构造中加入 URL：

```typescript
// 文件夹标签节点
buildTabNode(tab, wsId, `folder-${folder.id}-${tabId}-${encodeURIComponent(url)}`)

// 工作区书签节点（open tab）
buildTabNode(tab, wsId, `ws-bookmark-${ws.id}-${entry.tabId}-${encodeURIComponent(url)}`)

// 工作区书签节点（closed tab）
path: `bookmark:${ws.id}:${entry.tabId}:${encodeURIComponent(url)}`
```

### 7. URL 仅第二轮清理（second pass）

`browserRemoveTabBookmarks(tabId, url)` 的 `tabId` 参数会触发 `tabIdUrlMap`、`workspaceBookmarks`、`folder.tabs` 等额外清理，但这些清理只按 `tabId` 匹配。对于 **非文件夹关联的书签**（用户直接点星收藏且标签已关闭的场景），`tabId` 无法匹配任何条目，书签被遗漏。

**修复模式**：在所有 `tabId` 循环后，加一轮仅按 URL 的清理：

```typescript
for (const tabId of tabIds) {
  const url = resolveUrl(tabId);
  browserRemoveTabBookmarks(tabId, url);
}
// 第二轮：仅按 URL 清理漏网之鱼
for (const url of urls) {
  if (url) browserRemoveTabBookmarks('', url);
}
```

### 8. 书签去重必须包含 URL

`browserBookmarkTab` 的去重检查从 `entry.tabId === tabId` 改为 `entry.tabId === tabId && entry.url === url`，确保同一标签在不同 URL 时可以被独立收藏到同一目录，不会相互替换。
