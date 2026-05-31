# 浏览器"文件树层级结构"区域删除计划

## 概要

删除 Browser 面板中 `adl-multitree-scroll` 容器内所有树形层级显示代码（UI/UX、功能效果、CSS），保留界面上按钮占位和 hover 提示，保留 browserSlice 中的目录状态/action 供后续重构使用。

**不影响的区域**：Files（文件树）、Changes（变更面板）、Terminal（终端树）等所有其他功能。

---

## 阶段一：删除文件（6 个文件全部删除）

### 1. `features/multi-workspace/MultiWorkspaceContainer.tsx`
- 整个文件删除
- 这是渲染 `adl-multitree-scroll` 容器和 工作区目录/自建目录/历史目录 三区的根组件

### 2. `features/workspace-browser/WorkspaceBrowserEntry.tsx`
- 整个文件删除
- 工作区头部行的渲染组件（含展开/折叠、hover 按钮、更多操作菜单、子目录、标签）

### 3. `features/workspace-browser/TabFolderTreeEntry.tsx`
- 整个文件删除
- 递归树节点组件（含子目录嵌套、折叠、context menu、重命名对话框）

### 4. `features/workspace-browser/TabFolderEntry.tsx`
- 整个文件删除
- 当前未被任何渲染路径引用的死代码

### 5. `features/browser/BookmarkTabDialog.tsx`
- 整个文件删除
- 收藏标签对话框组件（目录列表选择 + 新建目录 + 工作区选择）
- 界面上的星形按钮保留（位置 + hover 提示保留）

### 6. `features/browser/FlatTabList.tsx`
- 整个文件删除
- 扁平标签列表组件（文件树/文件列表/全列表三种视图）
- 界面上的视图切换按钮保留（位置 + hover 提示保留）

---

## 阶段二：修改文件（6 个文件修改）

### 7. `features/workspace-browser/MultiWorkspaceBrowser.tsx`
**改动类型**：精简为占位容器

- 删除所有内联组件：`HistoryEntry`（L153-L186）、`HistoryDayGroupEntry`（L188-L363）、`HistoryMonthGroupEntry`（L365-L433）、`HistoryYearGroupEntry`（L435-L506）
- 删除 `getDisplayTitle` 函数（L53-L136）
- 删除 `historyGroups` useMemo（L564-L602）
- 删除 `userFolders` useMemo（L609）
- 删除 `workspaceIds` useMemo（L608）
- 删除 `hasNoWorkspaces/NoFolders/NoHistory`（L604-L606）
- 重写 `return` JSX：不再渲染 `MultiWorkspaceContainer`，改为渲染一个简单的 `div` 占位区域
- Props 接口 `MultiWorkspaceBrowserProps` 收窄：移除 `onCreateTabFolder`、`onDeleteTabFolder`、`onRenameTabFolder`、`onHideFromRightPanels`、`onRefreshTree`、`onCreateTab` 等树专用 props
- 当 `browserTabs.length > 0` 时只显示标签计数，无树形渲染

### 8. `features/workspace-browser/index.ts`
**改动类型**：更新导出

- 移除 `WorkspaceBrowserEntry` 导出
- 移除 `TabFolderEntry` 导出
- 移除对应的类型导出

### 9. `features/browser/BrowserPanel.tsx`
**改动类型**：删除树相关的 handlers、props、函数、dialog 引用

**删除的 imports：**
- `IconFolderPlus`（删除"新建标签目录"按钮图标，按钮保留但改用其他图标）
- `BookmarkTabDialog`
- `CreateTabFolderDialog`
- `FlatTabList`

**删除的状态/handlers：**
- `createFolderDialogOpen` 状态
- `bookmarkDialogOpen` 状态
- `isAnyDialogOpen` 
- `handleCreateTabFolder` 函数
- `handleBookmarkTab` 函数（将在下方替换为简化版本——直接收藏到默认位置，不打开对话框）
- `allBrowserExpanded` useMemo
- `handleExpandAllBrowser` 函数
- `handleCollapseAllBrowser` 函数
- `handleRefreshAllBrowser` 函数
- `toggleBrowserWorkspaceExpanded` 函数
- `handleHideBrowserWorkspace` 函数
- `handleToggleTabButtons` 和 `handleSetBrowserViewMode` —— 保留（切换按钮保留），但不再渲染 FlatTabList

**删除的 store 引用：**
- `browserTabFolders`
- `browserWorkspaceExpanded`
- `setBrowserWorkspaceExpanded`
- `browserCreateTabFolder`
- `browserUpdateTabFolder`
- `browserDeleteTabFolder`
- `browserBookmarkTab`

**修改 JSX（L242-720）：**
- MultiWorkspaceBrowser 传入精简后的 props（仅保留 tabs、tabs、activeTabId、drag/edit 等基本 props）
- 删除 `CreateTabFolderDialog` 渲染
- 删除 `BookmarkTabDialog` 渲染
- 删除 `FlatTabList` 分支（L519-L531）
- 保留"新建标签目录"按钮在界面上（位置 + hover 提示）
- 保留星形"收藏"按钮在界面上（点击行为简化为 `browserActions.handleToggleBookmark()`）
- 保留"文件树/文件列表/全列表"视图切换按钮（点击后设置 viewMode 但不再渲染 FlatTabList 内容）
- `visibleWorkspaces` memo 保留（被搜索功能使用）

### 10. `styles/regions/rightpanel/browser-panel.css`
**改动类型**：删除浏览器树相关 CSS 块

**删除的块：**
| 行范围 | 内容 |
|--------|------|
| L300-L307 | `.adl-multitree` 容器覆盖（browser 面板不再需要） |
| L380-L492 | `.adl-multitree--browser` 浏览器变体树样式（15 条规则，~113 行） |
| L816-L849 | `.adl-tree-expand-btn` 展开按钮样式（4 条规则，~34 行） |
| L851-L967 | `.adl-tab-folder-tree-entry` 标签文件夹完整树样式（~117 行） |
| L969-L974 | 叶子节点对齐覆盖（~6 行） |
| L1053-L1078 | 历史记录分组样式（~26 行） |

**保留的浏览器样式：**
- L1-L299：导航地址栏、iframe、浏览器主区域布局
- L308-L379：浏览器菜单 dropdown、收藏标签对话框样式（BookmarkTabDialog 被删除但其 CSS 保留——其他面板可能引用这些 CSS 变量）
- L494-L815：历史记录条目样式、搜索结果样式、标签页图标样式（这些属于浏览器基本功能，不属于树结构）
- L975-L1052：重命名对话框样式

### 11. `features/browser/index.ts`
**改动类型**：更新导出

- 移除 `FlatTabList` 导出
- 移除 `BookmarkTabDialog` 导出

### 12. `stores/slices/browserSlice.ts`
**改动类型**：保留目录状态/action（用户选择保留，为后续重构做准备）

- 不删除任何内容
- `TabFolderState`、`browserTabFolders`、`browserWorkspaceExpanded`、所有 folder CRUD action 保留

---

## 阶段三：清理后的 Browser Panel 结构

删除后，Browser 面板的 `adl-tool-surface` 区域将变为：

```
BrowserPanel
├── Toolbar（地址栏 + 导航按钮 + 收藏星形按钮 + 菜单）
├── Navigator（折叠按钮 + 计数 + 视图切换按钮 + 新建标签目录按钮）
└── adl-tool-surface
    ├── Navigator（左侧）
    │   ├── Toolbar（展开/折叠 + 标题 + 计数 + 标签按钮）
    │   ├── Secondary Toolbar（标签目录/搜索 + 新建标签目录/删除全部）
    │   └── [空占位区域] ← MultiWorkspaceBrowser 占位
    │       └── <div className="adl-multitree adl-multitree--browser">
    │             显示当前标签统计信息或空状态提示
    │           </div>
    └── Primary（右侧）
        └── iframe / 外部浏览器按钮
```

---

## 验证步骤

1. `npm run typecheck` — 类型检查通过（0 errors）
2. 启动 dev server，确认：
   - Browser 面板整体框架正常显示（地址栏、导航按钮、收藏按钮）
   - 工具栏按钮（展开全部、新建标签目录、删除全部、视图切换）都保留在界面上
   - 树形区域为空占位状态，无任何树节点渲染
   - Files 功能面板的文件树正常显示
   - Terminal 功能面板的终端树正常显示
   - Changes 面板正常显示
3. 交互验证：
   - 点击地址栏导航按钮可正常浏览
   - 收藏星形按钮存在且有 hover 提示
   - 视图切换按钮存在且有 hover 提示
   - 删除全部按钮存在且有 hover 提示
