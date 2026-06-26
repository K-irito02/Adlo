# 浏览器历史记录标签删除修复 — 2026-06-26

## 问题清单

| # | 问题 | 场景 | 根因 |
|---|------|------|------|
| 1 | 历史标签右键"删除"无效 | 右击历史记录中的单个标签 → 删除 | `handleDeleteTab` 只调用 `browserCloseTab`（过滤 `browserTabs`），历史条目存储于 `browserHistory` 而非 `browserTabs` |
| 2 | 历史标签"刷新Logo/标题"无效 | 点击历史标签的刷新按钮或右键菜单刷新项 | `handleRefreshTab` 只查找 `state.browserTabs` 更新标题和图标，历史条目在此数组中不存在 |
| 3 | "日"目录菜单项文案/行为不匹配 | "日"目录 hover 按钮和更多菜单中"删除所有标签[嵌套]"不应存在，应替换为"删除自身目录标签" | 历史目录的删除操作逻辑与工作区/非工作区目录不一致 |
| 4 | "日"目录菜单缺少"删除此目录" | 误将"删除此目录"一并移除 | 初次修复时混淆了"删除所有标签[嵌套]"和"删除此目录"两个选项 |

## 涉及文件

| 文件 | 修改 |
|------|------|
| `browserHistorySlice.ts` | 新增 `browserDeleteHistoryEntry(entryId)` 动作 |
| `browserFoldersSlice.ts` | `browserDeleteOwnTabsInNode` 新增 `history:day:` 路径支持 |
| `useBrowserTreeActions.ts` | 三处修复：`handleDeleteTab` 感知历史条目、`handleRefreshTab` 支持历史标题/图标更新、`handleDeleteOwnChildTabs` 新增 `history:day:` 路径 |
| `BrowserEntrySubEntries.tsx` | "日"目录 hover 按钮改为 `delete-self-tabs`，菜单项替换为"删除自身目录标签"+ 恢复"删除此目录" |
| `i18n/zh-CN/browser.ts` | `browserDeleteHistoryLabelHint` 修正为与实际行为一致 |
| `i18n/en-US/browser.ts` | 同上 |

## 架构变更

### 1. 删除操作分化

| 操作 | 工作区/非工作区目录 `workspace:/folder:` | 历史"日"目录 `history:day:` |
|------|-------------------------------------------|-----------------------------|
| 删除所有标签[嵌套] | ✅ 删除自身+嵌套子目录全部标签 | ❌ 不存在（被替换） |
| 删除自身目录标签 | ✅ 仅删除直接子标签，保留目录 | ✅ 删除当日全部历史条目 |
| 删除此目录 | ✅ 删除目录+所有结构和子标签 | ✅ 删除当日全部历史条目（效果同删除自身） |

**注意**：对"日"目录而言，`delete-self-tabs` 和 `delete-this-dir` 效果相同，因为日目录只有直接子标签（无嵌套目录）。两者均删除该日的所有历史条目。

### 2. 目录"消失"的架构解释

历史记录的"年/月/日"目录是**计算节点** —— 由 `buildHistoryCategoryTree` 根据 `browserHistory` 数据动态生成，而非持久化实体。当某日的所有条目被删除后：

1. `browserDeleteOwnTabsInNode` 仅修改 `browserHistory`（Zustand 浅合并，不影响其他状态）
2. `useBrowserTreeData` 中 `buildHistoryCategoryTree` 重建树结构
3. 空日节点不再出现 → 若该月/年无其他有效日 → 月/年节点也消失

这与工作区/非工作区目录中`TabFolderState`作为持久化实体的行为有**架构差异**：
- 工作区目录删除自身目录标签后，空文件夹 `TabFolderState` 仍然存在
- 历史目录删除当日条目后，空日节点自动消失（因底层无持久化实体）

### 3. 历史条目删除 vs 浏览器标签删除

```typescript
// 统一入口 handleDeleteTab（useBrowserTreeActions.ts）
if (browserHistory.some(h => h.id === tabId)) {
  clearFaviconCacheForUrl(url);
  clearPageMetaCacheForUrl(url);
  browserDeleteHistoryEntry(tabId);  // 历史路径
} else {
  browserRemoveTabBookmarks(tabId, url);  // 书签/收藏清理
  clearFaviconCacheForUrl(url);
  clearPageMetaCacheForUrl(url);
  unlockTabTitle(tabId);
  browserCloseTab(tabId);  // 浏览器标签路径
}
```

## 关键经验

### 1. 双层数据存储需要双层删除路径

历史条目（`browserHistory`）和浏览器标签（`browserTabs`）**存储在不同的 Zustand 切片**中，使用不同的 ID 前缀（`history-` vs `browser-`）。删除操作（`handleDeleteTab`）必须感知调用方身份，选择正确的删除路径。

### 2. 动态树 vs 持久化树的 UX 差异

- **持久化树**（工作区/非工作区目录）：目录实体存储于 `browserTabFolders`，空目录可见
- **动态树**（历史记录）：目录节点由 `buildHistoryCategoryTree` 计算，空目录不可见

删除"自身目录标签"后，工作区目录的空文件夹仍保留，历史目录的空节点则消失。这是设计差异而非 Bug。

### 3. `history:day:` 路径需要覆盖所有删除路径

三种删除操作各有不同的 slice 函数和 action 处理函数：

```
                         UI 按钮 → 组件 handler → store action
delete-all-tabs:   → handleDeleteAllChildTabs → browserDeleteAllTabsInNode
delete-self-tabs:  → handleDeleteOwnChildTabs  → browserDeleteOwnTabsInNode
delete-this-dir:   → handleDeleteDirectory      → browserDeleteTabFolder + browserDeleteAllTabsInNode
```

新增 `history:day:` 支持时，需确保覆盖**所有三条路径**，且路径前缀检查顺序正确（`history:day:` 必须在 `history:` 之前匹配）。

### 4. i18n hint 文本是契约

`browserDeleteHistoryLabelHint` 中的"不删除年、月、日目录"与实际行为（清除全部历史 → 所有目录消失）不一致。**Hint 文本需与实际行为严格对齐**，可作为功能契约使用。
