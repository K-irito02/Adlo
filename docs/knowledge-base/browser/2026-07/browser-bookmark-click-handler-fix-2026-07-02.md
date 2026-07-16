# 浏览器书签点击处理器修复

## 问题

点击浏览器面板中的书签节点后，页面无反应或跳转到错误的 URL。

## 根因

三个独立问题叠加导致：

### 根因 A：`tab:` 树节点点击后无导航行为

`handleOpenFile` 中 `tab:` handler 对带有 `ws-bookmark-`/`folder-` prefix 的 uniqueKey 做了特殊处理，但当时的设计只是**选中已有标签**（`onOpenTab(url, tabId)`）。当该标签是唯一打开的标签时，选中操作无视觉变化，用户感知为"没反应"。

**修复**：`tab:` bookmark 节点改为调用 `onOpenTab(bookmarkUrl)` 不带 tabId，触发 `handleOpenTabFromTree` 中的「就地导航/新标签」判断链。

### 根因 B：`bookmark:` 路径解析错误

`bookmark:` 路径格式为 `bookmark:{wsId}:{tabId}:{url}`（三级段），但解析代码使用：

```typescript
// 错误
const secondColon = rest.indexOf(':');
const wsId = rest.slice(0, secondColon);
const rest2 = rest.slice(secondColon + 1);
```

`indexOf(':')` 只匹配第一个冒号，`slice(secondColon + 1)` 拿到的是 `{tabId}:{url}`，后续的 `entries.find(e => e.tabId === second)` 永远匹配失败。

**修复**：改用 `split(':')` 精确提取各段。

### 根因 C：书签 URL 查找只按 tabId 匹配

`findWorkspaceBookmarkUrl`/`findFolderBookmarkUrl` 原本的实现：

```typescript
entries.find((e) => e.tabId === tabId)?.url;
```

当同一 tabId 有多个书签（不同 URL）时，只返回第一个匹配项，可能返回错误的 URL。

**修复**：重建每个候选条目的预期 uniqueKey 并与路径中的 uniqueKey 精确比较：

```typescript
for (const [wsId, entries] of Object.entries(bookmarks)) {
  for (const entry of entries) {
    if (entry.tabId === tabId && entry.url) {
      const expected = `ws-bookmark-${wsId}-${entry.tabId}-${encodeURIComponent(entry.url)}`;
      if (expected === uniqueKey) return entry.url;
    }
  }
}
```

### 根因 D：`debugLogCollector.ts` isWriting 死锁

`collectLog()` 中的 `if (isWriting) return;` 导致首次写入卡住后所有后续日志都被丢弃。修复：移除该守卫（由 `writeLogsToProjectFile` 中的锁负责防止并发写入）。

## 路径格式参考

| 节点类型 | 路径格式 | 示例 |
|----------|----------|------|
| 标签（常规） | `tab:{tabId}` | `tab:abc123` |
| 标签（工作区书签） | `tab:ws-bookmark-{wsId}-{tabId}-{encodedUrl}:{tabId}` | `tab:ws-bookmark-ws1-t1-https%3A%2F%2Fexample.com:t1` |
| 标签（文件夹书签） | `tab:folder-{folderId}-{tabId}-{encodedUrl}:{tabId}` | `tab:folder-f1-t1-https%3A%2F%2Fexample.com:t1` |
| 书签（工作区） | `bookmark:{wsId}:{tabId}:{encodedUrl}` | `bookmark:ws1:t1:https%3A%2F%2Fexample.com` |
| 书签（文件夹） | `bookmark:{tabId}::{encodedUrl}` | `bookmark:t1::https%3A%2F%2Fexample.com` |
| 历史记录 | `history-entry:{entryId}` | `history-entry:h1` |

## `handleOpenFile` 控制流

```
tab: → uniqueKey 有 ws-bookmark-/folder- prefix?
  ├─ 是 → findWorkspaceBookmarkUrl/findFolderBookmarkUrl 精确匹配
  │     └─ 找到 → onOpenTab(url) [无 tabId → 走 navigate-in-place 判断]
  │     └─ 未找到 → 回落为常规标签查找
  └─ 否 → browserTabs.find(t => t.id === tabId)
         └─ 找到 → onOpenTab(url, tabId) [选中已存在标签]

bookmark: → split(':') 解析
  ├─ 有 second (工作区书签) → 先从 browserWorkspaceBookmarks 精确查找
  │     └─ 找到 → onOpenTab(url)
  │     └─ 未找到 → 回退到路径中的 URL
  └─ 无 second (文件夹书签) → 直接使用路径中的 URL
       └─ URL 有效 → onOpenTab(url)

history-entry: → browserHistory.find(h => h.id === entryId)
  └─ 找到 → onOpenTab(histEntry.url)
```

## 关键要点

1. `tab:` 节点点击时带上 tabId 调用 `onOpenTab` = 选中已有标签（无导航）。不带 tabId = 触发 navigate-in-place 判断链（打开新标签或就地导航）。
2. `bookmark:` 路径的 `split(':')` 后 `parts[1]` 为空字符串表示文件夹书签（`tabId::url`），非空表示工作区书签（`wsId:tabId:url`）。
3. 同一 tabId 可以有多个书签（不同 URL），URL 查找必须通过重建 uniqueKey 精确匹配，不能只按 tabId。
4. 调试日志应通过 `debugLogCollector.ts` 系统收集，不直接在业务代码中使用 `console.log('[ADL-DEBUG]')`。
