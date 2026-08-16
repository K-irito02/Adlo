# 文件树面板统一共享外壳设计文档

## 背景

当前「文件面板」（Files）与「变更面板」（Changes）各自实现了一套多工作区文件树外壳，行为与设计存在差异：

| 能力 | Files（基准） | Changes（当前） |
|------|------|------|
| 单击节点选中态（高亮/清除） | 完整 | 缺失 |
| 工作区顶级目录高亮选中 | 完整 | 缺失 |
| 点击外部清除选中态 | 有 `mousedown` 监听 | 缺失 |
| 单工作区刷新旋转 | 专用 `workspaceTreeRefreshing`，保留数据 | 误用加载态，闪 LoadingRow |
| 刷新全部旋转 / 范围 | 专用 `refreshingAllWorkspaces` / 只刷已展开 | 误用加载态 / 刷所有 |
| 多工作区外壳渲染 | `MultiWorkspaceContainer` | 重复包装 |

目标：提取共享的「多工作区树外壳 `MultiWorkspaceTreeShell`」，让 Files 与 Changes 共同使用一致的效果、设计与内容，同时保留各面板的差异化能力。

## 方案A：共享多工作区树外壳

增强现有 `MultiWorkspaceContainer`，在其上包装为 `MultiWorkspaceTreeShell`，统一外壳逻辑，面板差异通过 render prop slot 保留。

## 共享组件设计

新建 `MultiWorkspaceTreeShell`，统一：

```text
MultiWorkspaceTreeShell
├─ 点击外部清除选中态（通用 mousedown 监听）
│   保留节点：对话框/新建按钮/树行/工作区头/右键菜单
│   通过 prop onClearSelection 触发，面板自行决定清谁
├─ 空状态渲染（prop emptyText）
├─ 展开/折叠状态（prop expandedState + onToggleExpand）
└─ 工作区项渲染（prop renderContent slot，保留各面板差异）
```

- Files 的 `WorkspaceFileTreeEntry` / Changes 的 `WorkspaceChangesEntry` 仍由各自 `renderContent` 提供。
- 点击清除逻辑从 `MultiWorkspaceFileTree` 抽出，移入共享外壳。

## Store 状态隔离

面板同时挂载（CSS `hidden`），选中态必须隔离。采用最小侵入方案：

- **Files 现有字段不动**（`fileTreeClicked*`，已被 `useFileCreation` / 重命名消费）。
- **为 Changes 新增等价字段**：
  - 状态：`changesTreeClickedPath` / `changesTreeClickedWorkspaceId` / `changesTreeClickedKind` / `changesTreeClickedWorkspaceRoot`
  - action：`setChangesTreeClickedNode` / `setChangesTreeClickedWorkspaceRoot` / `clearChangesTreeClickedNode`
- 共享外壳通过 **prop 接收**「当前面板的清除回调」，不解耦 store 内部结构。

## Changes 面板选中态对齐

1. **单击节点选中**：`WorkspaceChangesEntry` 增加 `onNodeClicked`，写入 `changesTreeClicked*`。
2. **工作区头点击选中根目录**：复用 `setChangesTreeClickedWorkspaceRoot`。
3. **点击外部清除**：由共享外壳 `onClearSelection` 触发 `clearChangesTreeClickedNode`。
4. **高亮渲染**：`WorkspaceChangesEntry` 读取 `changesTreeClicked*` 渲染选中态（与 Files 相同 CSS 类）。

## 刷新逻辑对齐

Files 基准：
- 单工作区刷新：专用 `workspaceTreeRefreshing[id]` 驱动 `adl-spin`，保留已有数据。
- 刷新全部：专用 `refreshingAllWorkspaces` 驱动 toolbar 图标，只刷已展开工作区，`{silent:true}`。

Changes 对齐改动：
1. 引入专用「刷新中」状态：`changesTreeRefreshing: Record<string, boolean>` + `refreshingAllChanges: boolean`。
2. `refreshGitSnapshot` 增加 `silent` 选项；非 silent 写 `changesTreeRefreshing[id]`（替代当前写 loading），刷新保留已有树不闪 LoadingRow。
3. `refreshAllChanges` 只刷已展开工作区，设置 `refreshingAllChanges`，以 `{silent:true}` 调用。
4. `WorkspaceChangesEntry` 旋转改由 `changesTreeRefreshing[id]` 驱动（替代 `isLoading`）。
5. Changes 工具栏 `isRefreshingAll` 改由 `refreshingAllChanges` 驱动（替代 `anyChangesTreeLoading`）。

## 上下文菜单

`useFileNavigatorContextMenu` 已足够通用，Changes 侧 `useChangesPanelDialogs` 提供等价 ref。无需重构，仅确保共享外壳与 entry 正确透传。

## 影响范围

| 层 | 文件 |
|----|------|
| Store | `stores/slices/editorSlice.ts`、`stores/actions/`、`stores/StoreState.ts` |
| 共享组件 | 新建 `features/multi-workspace/MultiWorkspaceTreeShell` |
| Files | `features/workspace-file-tree/MultiWorkspaceFileTree.tsx`（改用共享外壳） |
| Changes | `features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx`、`WorkspaceChangesEntry.tsx`、`WorkspaceChangesActions.ts`、`right-panel/panels/ChangesPanel/` |

## 测试计划

- Store 新增 action 覆盖：`setChangesTreeClickedNode` / `setChangesTreeClickedWorkspaceRoot` / `clearChangesTreeClickedNode` 的常规与边界路径。
- `refreshGitSnapshot` 的 `silent` 分支（silent 不置 refreshing、非 silent 置 refreshing 且保留数据）。
- 共享外壳点击外部清除逻辑：保留节点命中 / 空白清除。
- 双面板选中态隔离：Files 与 Changes 各自独立。