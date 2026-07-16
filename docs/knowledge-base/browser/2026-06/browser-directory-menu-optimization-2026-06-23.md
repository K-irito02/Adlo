# 浏览器目录菜单优化 — 2026-06-23

## 变更

### 菜单重命名
- "删除所有子标签" → "删除所有标签[嵌套]"（语义更清晰：包含嵌套目录）
- 影响：工作区目录 + 非工作区目录

### 新增菜单项
- "删除自身目录标签"（"!" 图标 + hint 提示卡，`danger: true`）
- 仅删除自身目录下直接子标签，不递归嵌套目录
- 仅工作区目录 + 非工作区目录，历史目录不变

## 实现要点

### Store (`browserFoldersSlice.ts`)
- `browserDeleteOwnTabsInNode(nodePath)`：
  - `workspace:` 路径：使用 `collectAllFolderTabIds` 排除嵌套文件夹中的标签
  - `folder:` 路径：只清空 `folder.tabs`，不碰后代文件夹
  - 附带清理 workspace bookmarks、folder.tabs 状态

### Action (`useBrowserTreeActions.ts`)
- `handleDeleteOwnChildTabs`：清除 favicon cache / page meta cache / 书签 / 锁定标题后调 store

### 菜单渲染
- 目录级上下文菜单和按钮菜单均已支持 `item.hint` + "!" 图标
- `showHint` / `showChildHint`：通过 DOM API 创建 `adl-sub-hint-card` 浮动提示卡

### 工具栏"全部删除"缓存完备化
- `handleCloseAllTabs` 遍历全部 tabs 清理：favicon cache、page meta cache、书签、锁定标题

## 关键决策
1. 对于 workspace 节点，"自身目录标签" = 工作区顶级标签（不归属任何文件夹的标签）
2. 对于 folder 节点，"自身目录标签" = folder.tabs 中的标签
3. 历史目录不参与——只有"清理整个历史级别"操作

## 涉及文件
- `i18n/zh-CN/browser.ts` / `en-US/browser.ts`：新增 4 个 key
- `browserFoldersSlice.ts`：新增 `collectAllFolderTabIds` + `browserDeleteOwnTabsInNode`
- `useBrowserTreeActions.ts`：新增 `handleDeleteOwnChildTabs`
- `BrowserCategorySection.tsx` / `BrowserTabTree.tsx`：接口扩展
- `BrowserTreeEntry.tsx` / `BrowserEntrySubEntries.tsx`：菜单项渲染
- `BrowserNavigator.tsx` / `BrowserPanel.tsx`：prop 透传
- `useBrowserTabs.ts`：工具栏缓存清理
