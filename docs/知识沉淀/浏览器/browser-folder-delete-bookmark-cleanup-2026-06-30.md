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

### Phase 3（2026-06-30 第二轮）修复

| # | 问题 | 场景 | 根因 |
|---|------|------|------|
| 10 | 删除单条收藏标签导致工作区书签被连带清除 | 在"非工作区目录"文件夹中右键删除收藏标签 | `browserRemoveTabBookmarks` 对 `browserWorkspaceBookmarks` 仅用 `tabId` 过滤，未配对 `url`，导致同名 tabId 但不同 URL 的工作区书签被误删 |
| 11 | 删除单条收藏标签导致其他文件夹同名条目被连带清除 | 多个文件夹收藏了同一 `(tabId, url)` 对 | `browserRemoveTabBookmarks` 对 `browserTabFolders` 扫描 ALL 文件夹，未限制到目标文件夹 |
| 12 | 删除单条收藏标签误删全局书签条目 | 同一 URL 被多个文件夹收藏，删除其中一个 | `browserRemoveTabBookmarks` 第 266 行无条件过滤 `browserBookmarks`，未检查该 URL 是否仍存在于其他文件夹或工作区中 |
| 13 | 工作区根目录"删除自身目录标签"无反应 | 存在嵌套子目录时 | `browserDeleteOwnTabsInNode` 用 `folderTabIds.includes(entry.tabId)` 过滤工作区书签条目，但书签条目的 tabId 可能与子目录标签 tabId 相同，导致被错误排除 |
| 14 | 工作区"删除自身目录标签"关闭已打开标签 | 打开标签与工作区书签条目有相同 tabId | 书签 tabId 被加入 `tabIdsToDelete`，该数组用于过滤 `browserTabs`，导致对应标签被关闭 |
| 15 | 删除后收藏星标不消失 | 逐步从顶层删除至底层 | 第二遍 URL 清理在 `browserDeleteOwnTabsInNode` 之前执行，此时书签条目尚在状态中，`urlStillExists` 返回 true → URL 残留在 `browserBookmarks` |
| 16 | 文件夹"删除自身目录标签"后收藏状态残留 | 文件夹中的标签来自已关闭标签（不在 `browserTabs`） | 文件夹路径的 `urls` 仅从 `browserTabs` 收集，若标签已关闭则 `urls` 为空 → 第二遍清理无操作 |
| 17 | 查找拥有文件夹可用 `find` 优化 | `handleRemoveBookmarkTab` 中查找持有 `(tabId, url)` 的文件夹 | `filter + map + length === 1` 始终 O(n)，`find` 在第一个匹配项停止 |

## Phase 3 涉及文件

| 文件 | 修改 |
|------|------|
| `browserBookmarkSlice.ts` | `browserRemoveTabBookmarks` 工作区过滤从 `tabId`-only 改为 `(tabId, url)` 对；新增可选 `scopeFolderId` 参数，指定时只删除目标文件夹条目；`browserBookmarks` 过滤移至文件夹/工作区过滤之后，仅当 URL 不再存在于任何文件夹或工作区时执行 |
| `useBrowserTreeActions.ts` | `handleRemoveBookmarkTab` 改用 `find` 查找持有文件夹；`handleDeleteOwnChildTabs` 工作区书签 URL 收集移除 `folderTabIds.includes` 过滤；第二遍清理改为全量扫描 `browserBookmarks` 并移至 `browserDeleteOwnTabsInNode` 之后 |
| `browserFoldersSlice.ts` | `browserDeleteOwnTabsInNode` 工作区书签 tabId 分离到 `wsBookmarkTabIds` 独立数组，不影响 `browserTabs` 过滤 |

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

---

## Phase 3 架构洞察

### 9. `browserRemoveTabBookmarks` 跨域污染

`browserRemoveTabBookmarks` 是统一的清除函数，被 7 个调用方共享（`handleDeleteTab`、`handleRemoveBookmarkTab`、`handleDeleteAllChildTabs`、`handleDeleteOwnChildTabs`、`handleDeleteDirectory` 等）。它原本对所有 `browserWorkspaceBookmarks`（按 `tabId`）和所有 `browserTabFolders`（按 `(tabId, url)`）进行扫描式清理，导致删除一条收藏标签时，其他工作区/文件夹的同名标签被连带清除。

**修复模式**：工作区过滤改为 `(tabId, url)` 对，与文件夹过滤对齐；文件夹过滤新增 `scopeFolderId` 参数，由调用方提供上下文：

```typescript
// 调用方（handleRemoveBookmarkTab）从 store 中推算出目标文件夹
const owningFolderId = state.browserTabFolders
  .filter((f) => f.tabs?.some((t) => t.tabId === tabId && t.url === url))
  .map((f) => f.id);
const scopeFolderId = owningFolderId.length === 1 ? owningFolderId[0] : undefined;
browserRemoveTabBookmarks(tabId, url, scopeFolderId);
```

### 10. 过滤粒度选择

| 存储区 | Phase 2 过滤方式 | Phase 3 过滤方式 | 说明 |
|--------|----------------|----------------|------|
| `browserBookmarks`（全局 URL 集） | `url` | `url` | 按 URL 去重，每个 URL 最多一条，无需 scope |
| `browserBookmarkTabIdUrlMap` | `tabId` | `tabId` | tabId→URL 一对一映射，无需 scope |
| `browserWorkspaceBookmarks` | `tabId` ❌ | `(tabId, url)` ✅ | 同一 tabId 可能记录不同 URL 的快照，tabId-only 会误删 |
| `browserTabFolders` | `(tabId, url)` 扫描 ALL | `(tabId, url)` + `scopeFolderId` ✅ | 同一对 `(tabId, url)` 可能出现在多个文件夹，需限制范围 |

### 11. 全局书签列表的条件移除

`browserBookmarks` 是一个按 URL 去重的全局列表，记录哪些 URL 已被收藏。原本在每次删除时都无条件过滤该 URL。当同一 URL 被多个文件夹收藏时，删除其中一个会误使其他文件夹条目的星号标记消失。

**修复模式**：将 `browserBookmarks` 过滤推迟到文件夹与工作区过滤之后，仅当 URL 不再出现在任何剩余条目中时才移除：

```typescript
const urlStillExists =
  Object.values(nextWorkspaceBookmarks).some((entries) => entries.some((e) => e.url === url)) ||
  nextFolders.some((f) => f.tabs?.some((t) => t.url === url));
const nextBookmarks = urlStillExists
  ? state.browserBookmarks  // 保持原样
  : state.browserBookmarks.filter((b) => b.url !== url);
```

### 12. `folderTabIds` 只应过滤 `browserTabs`，不应影响书签条目

工作区书签条目（`browserWorkspaceBookmarks[wsId]`）始终是 workspace 根节点的**直属子级**。即使某个书签条目的 `tabId` 与子文件夹中标签的 `tabId` 相同，它们在数据上也是独立的条目。不应通过 `folderTabIds.includes(entry.tabId)` 来排除书签条目。

**修复模式**：书签条目全部加入待删集合，不受子文件夹 tabId 影响。

### 13. 书签 tabId 必须与 `browserTabs` tabId 分离

`browserDeleteOwnTabsInNode` 使用 `tabIdsToDelete` 过滤 `browserTabs`。若将工作区书签条目的 tabId 加入同一数组，可能误删已打开的标签（书签 tabId 与打开标签 tabId 相同时）。

**修复模式**：使用独立数组 `wsBookmarkTabIds` 跟踪书签 tabId，仅用于 `browserWorkspaceBookmarks` 清理：

```typescript
let tabIdsToDelete: string[] = [];     // 仅 browserTabs tabId
let wsBookmarkTabIds: string[] | null = null; // 仅书签条目 tabId
```

### 14. 第二遍 URL 清理必须在数据删除之后

`browserRemoveTabBookmarks('', url)` 检查 `urlStillExists` 时，查找当前状态中的 `browserWorkspaceBookmarks` 和 `browserTabFolders`。若数据层尚未删除（`browserDeleteOwnTabsInNode` 未执行），URL 仍被视为"存在"，不会从 `browserBookmarks` 移除。

**修复模式**：第二遍清理移至 `browserDeleteOwnTabsInNode` 之后。

```
之前: main loop → second pass → browserDeleteOwnTabsInNode  ← 🐛 urlStillExists=true
之后: main loop → browserDeleteOwnTabsInNode → second pass  ← ✅ urlStillExists=false
```

### 15. 全量扫描 vs 定向清理

`urls` 数组无法覆盖所有可能受影响的 URL（跨目录共享、文件夹中已关闭标签等）。定向收集（`for (const url of urls)`）总有遗漏路径。

**修复模式**：第二遍改为全量扫描当前 `browserBookmarks`，逐个检查 `urlStillExists`：

```typescript
const finalState = useAppStore.getState();
for (const bookmark of finalState.browserBookmarks) {
  if (bookmark.url) {
    browserRemoveTabBookmarks('', bookmark.url);
  }
}
```

全量扫描性能影响可忽略（`browserBookmarks` 通常数十至数百条，`urlStillExists` 为 O(n) 对小数组），但彻底消除遗漏。`browserRemoveTabBookmarks('', url)` 中的 `urlStillExists` 确保仅有真正孤立的 URL 被移除，不会跨越工作区误删。

---

## Phase 4（2026-06-30 第三轮）修复

### 问题清单

| # | 问题 | 场景 | 根因 |
|---|------|------|------|
| 18 | 工作区"删除所有标签[嵌套]"无反应 | 工作区无 open tabs 且无 root folders，但有 workspace bookmarks | `browserDeleteAllTabsInNode` 的 workspace 路径中 `tabIdsToDelete` 和 `folderIdsToClear` 均为空 → 提前返回 state，`workspaceBookmarks[wsId]` 删除代码在 return 之后 |
| 19 | "删除所有标签[嵌套]"后收藏状态残留 | 文件夹/工作区目录上执行"删除所有标签[嵌套]" | `handleDeleteAllChildTabs` 与修复前的 `handleDeleteDirectory` 同一模式：`collectFolderTabSnapshotUrls` Map 去重 + 空 tabId Pass 2 + **缺失** `browserRemoveOrphanedBookmarks()` 安全兜底 |
| 20 | "删除自身目录标签"的文件夹路径用 `collectFolderTabSnapshotUrls` 递归收集 | 文件夹"删除自身目录标签" | `browserDeleteOwnTabsInNode` 只清直属 folder 的 tabs，但 handler 用 `collectFolderTabSnapshotUrls` 递归收集了所有后代的 URL → 不匹配；且 Map 去重问题同样存在 |

### Phase 4 涉及文件

| 文件 | 修改 |
|------|------|
| `browserTreeUtils.ts` | 新增 `collectAllDescendantTabUrlsLocal` — 递归收集文件夹树中所有 `(tabId, url)` 对，**不 Map 去重** |
| `browserFoldersSlice.ts` | `browserDeleteAllTabsInNode`：workspace bookmark 删除移至 early return 之前；主路径补回 `scheduleWrite` |
| `useBrowserTreeActions.ts` | `handleDeleteDirectory`、`handleDeleteAllChildTabs`、`handleDeleteOwnChildTabs` 三处均用 `collectAllDescendantTabUrlsLocal` / 直属 tabs 替换 `collectFolderTabSnapshotUrls`；去除空 tabId 的 Pass 2；末尾统一加 `browserRemoveOrphanedBookmarks()`；更新依赖数组 |

### 16. `collectFolderTabSnapshotUrls` Map 去重是一个反复出现的根因模式

该函数散布在 3 个 handler 中，每次调用都会因为 Map 去重丢失 URL：

- `handleDeleteDirectory`（第 496 行）
- `handleDeleteAllChildTabs`（第 149、248 行）
- `handleDeleteOwnChildTabs`（第 371 行）

此前 Phase 2&3 的修复方案是在外层额外扫描 root folder 的 `tabs` 数组补充丢失的 URL，但：
- 只补了 root folder，未补嵌套子目录的丢失 URL
- Pass 2 的 `browserRemoveTabBookmarks('', url)` 空 tabId 无法匹配任何实体条目 → 绕不开 `urlStillExists`
- 不同 handler 间的重复代码增加了维护成本

**Phase 4 修复模式**：不再使用 Map，改用数组收集所有 `(tabId, url)` 对：

```typescript
// 新增 helper（browserTreeUtils.ts）
function collectAllDescendantTabUrlsLocal(folders, parentId): Array<{tabId, url}> {
  // 递归遍历文件夹树，每遇到一个 tab 条目就推入数组
  result.push({ tabId: item.tabId, url: item.url });
  return result;
}

// 调用方
const allTabUrls = collectAllDescendantTabUrlsLocal(folders, folderId);
for (const { tabId, url } of allTabUrls) {
  browserRemoveTabBookmarks(tabId, url);  // ✅ 每个 (tabId, url) 都被处理
}
```

### 17. `browserRemoveOrphanedBookmarks` 是推荐的统一安全兜底

`handleDeleteOwnChildTabs` 和 `handleDeleteDirectory` 已在 Phase 2/3 中加入了 `browserRemoveOrphanedBookmarks()`。Phase 4 将其同步到 `handleDeleteAllChildTabs`。

`browserRemoveOrphanedBookmarks` 在 store action 执行后调用，此时目标文件夹/工作区数据已被删除，它遍历当前 `browserTabFolders` 和 `browserWorkspaceBookmarks` 构建 `referenced` 集合，仅移除不再被引用的 `browserBookmarks` 条目。

```typescript
// 通用模式
preCleanupByTabId(allTabUrls);    // 逐对清理 tabId→URL 相关存储
storeAction(path);                 // 删除数据层
browserRemoveOrphanedBookmarks(); // 安全兜底：清理漏网之鱼
```

### 18. `browserDeleteAllTabsInNode` 的 early return 隐藏了 workspace bookmark 删除

```typescript
// 第 268 行（修复前）
if (tabIdsToDelete.length === 0 && folderIdsToClear.length === 0) {
  return state;  // ← workspaceBookmarks[wsId] 删除在第 276 行，够不着
}
```

当 workspace 无 open tabs 且无 root folders 时，即使有 workspace bookmarks，`tabIdsToDelete` 和 `folderIdsToClear` 均为空 → 提前返回，workspace bookmark 删除代码被跳过。

**修复模式**：将 workspace bookmark 删除移到 early return 之前：

```typescript
// 先处理 workspace bookmarks
let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
if (nodePath.startsWith('workspace:')) {
  const wsId = nodePath.slice('workspace:'.length);
  if (nextWorkspaceBookmarks[wsId]) {
    nextWorkspaceBookmarks = { ...nextWorkspaceBookmarks };
    delete nextWorkspaceBookmarks[wsId];
    wsChanged = true;
  }
}
// 再检查是否要提前返回
if (tabIdsToDelete.length === 0 && folderIdsToClear.length === 0) {
  if (wsChanged) return { browserWorkspaceBookmarks: nextWorkspaceBookmarks };
  return state;
}
```

### 19. `handleDeleteOwnChildTabs` 文件夹路径不得递归收集

`browserDeleteOwnTabsInNode` 对 folder 路径只清直属 folder 的 `tabs`（不递归子目录）。但原 handler 用 `collectFolderTabSnapshotUrls` 递归收集所有后代的 URL，两者粒度不一致。

Phase 4 修复：改为直接读 `state.browserTabFolders.find(f => f.id === folderId).tabs`，只处理直属标签：

```typescript
if (nodePath.startsWith('folder:')) {
  const folder = state.browserTabFolders.find((f) => f.id === folderId);
  for (const item of folder.tabs) {
    browserRemoveTabBookmarks(item.tabId, item.url);
  }
}
```

### 20. `browserDeleteAllTabsInNode` 主路径缺少 `scheduleWrite`（适用于 workspaceBookmarks）

Phase 3 将 workspace bookmark 删除逻辑移到 early return 前时，删除了原位的 `scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, ...)` 调用。主返回路径（有 tabs/folders 要清理）中 workspace bookmark 的变更没有被持久化。

Phase 4 在主返回路径中补回：

```typescript
if (wsChanged) {
  scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
}
```

### 21. 三种删除路径的当前清理策略（Phase 4 最终版）

| 删除操作 | 清理策略 | 安全兜底 |
|---------|---------|---------|
| 标签右键"删除" | `browserRemoveTabBookmarks(tabId, url, scopeFolderId)` | 无（单条目，精确） |
| 目录级"删除自身目录标签" | 直属 folder tabs 的 `(tabId, url)` 对逐个清理 | `browserRemoveOrphanedBookmarks()` |
| 目录级"删除所有标签[嵌套]" | 子树所有 `(tabId, url)` 对逐个清理 | `browserRemoveOrphanedBookmarks()` |
| 目录级"删除此目录" | 子树所有 `(tabId, url)` 对逐个清理 | `browserRemoveOrphanedBookmarks()` |
| 工作区级"删除自身/所有标签" | 同目录级 + workspace bookmark 删除 | `browserRemoveOrphanedBookmarks()` |

所有非单个标签的删除路径统一为：
1. 全量收集 `(tabId, url)` 对（无去重）
2. 逐对调用 `browserRemoveTabBookmarks(tabId, url)`
3. 执行 store action 删除数据层
4. `browserRemoveOrphanedBookmarks()` 安全兜底
