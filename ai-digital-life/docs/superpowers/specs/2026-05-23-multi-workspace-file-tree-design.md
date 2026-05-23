# 多工作区文件树设计文档

## 背景

原有文件树（FileTree）仅展示单个当前工作区的文件。当用户有多个工作区时，需要在侧边栏切换工作区才能查看其文件。本功能将多个工作区的文件树整合到同一个文件面板中，支持同时展开/折叠多个工作区的文件结构。

## 目标

- 在文件导航器中同时显示多个工作区的文件树
- 每个工作区作为独立可展开/折叠的条目
- 支持置顶/取消置顶、拖拽排序
- 支持隐藏不关注的工作区
- 保持与侧边栏工作区列表的状态同步

## 数据流

### 新增字段

```typescript
// kernel/types.ts - RecentWorkspaceEntry
hiddenInFileTree: boolean;    // 是否从文件树隐藏
```

### 状态层

```typescript
// workspaceSlice
workspaceTrees: Record<string, WorkspaceTreeNode[]>;      // 各工作区文件树数据（惰性加载）
workspaceTreeLoading: Record<string, boolean>;            // 各工作区加载状态
workspaceTreeErrors: Record<string, string | undefined>;  // 各工作区错误信息
workspaceTreeExpandedInFileNav: Record<string, boolean>;  // 各工作区展开状态
```

### UI Store 变更

```typescript
// ui-store
expandedFileTreePaths: Record<string, Record<string, boolean>>;  // {workspaceId: {path: expanded}}
// actions 增加 workspaceId 参数:
setFileTreePathExpanded(workspaceId, path, expanded)
toggleFileTreePath(workspaceId, path)
expandFileTreePathChain(workspaceId, path)
collapseAllFileTreePaths(workspaceId)
```

### 桥接层

```typescript
// ipc.ts
listTreeForWorkspace(path: string): Promise<WorkspaceTree>;
hideFromFileTree(workspaceId: string): Promise<Ok>;
showInFileTree(workspaceId: string): Promise<Ok>;
```

## 组件树

```
FileNavigatorShell
  └─ toolbar (两行: 模式切换 + 全局操作/文件创建)
  └─ MultiWorkspaceFileTree  (CustomScrollArea 包裹)
       ├─ 已置顶 section label
       │   └─ WorkspaceFileTreeEntry × N
       │        ├─ header: [展开▸] [名称] [操作按钮]
       │        └─ expanded → FileTree
       ├─ 未置顶 section label
       │   └─ WorkspaceFileTreeEntry × N
       └─ 空状态提示
```

## 关键交互

| 交互 | 行为 |
|------|------|
| 点击展开▸ | 惰性加载该工作区的文件树，首次展开时调用 `listTreeForWorkspace` |
| 点击名称 | 切换到该工作区（`openWorkspace`） |
| 悬停名称区域 | 浮现 3 个操作按钮（刷新、置顶/取消、更多） |
| 悬停左区域(▸) | 不触发操作按钮显示 |
| 点击 ⋮ | 弹出 Portal 菜单（从此区域移除、在文件管理器中显示、复制路径） |
| 置顶/取消 | 与侧边栏共享 `isPinned`，通过 `reorderWorkspaces` 同步排序 |
| 拖拽重排 | HTML5 Drag & Drop，仅在各自桶内排序 |
| 展开/折叠全部 | 批量调用 `expandWorkspaceTreeInFileNav` / `collapseAllWorkspaceTreesInFileNav` |
| 刷新全部 | 遍历已展开工作区重新加载文件树 |

## 隐藏/显示机制

- `hiddenInFileTree`: 从文件树隐藏，但在侧边栏仍可见
- `removedFromSidebar`: 从侧边栏移除，同时自动设置 `hiddenInFileTree=true`
- 侧边栏右键菜单新增"添加到文件树"选项（仅当 `hiddenInFileTree && !removedFromSidebar` 时显示）
- 文件树中"从此区域移除不显示" → 设置 `hiddenInFileTree=true`

## Stores Actions

| Action | 职责 |
|--------|------|
| `loadWorkspaceTree` | 惰性加载单个工作区文件树，缓存结果 |
| `toggleWorkspaceTreeInFileNav` | 切换展开状态（不加载数据） |
| `expandWorkspaceTreeInFileNav` | 展开 + 加载文件树数据 |
| `collapseAllWorkspaceTreesInFileNav` | 折叠所有工作区 |
| `expandAllWorkspaceTreesInFileNav` | 展开+加载所有工作区 |
| `refreshAllWorkspaceTrees` | 刷新所有已展开工作区 |
| `cleanupRemovedWorkspaceTree` | 清理已删除工作区的文件树缓存 |
| `hideWorkspaceFromFileTree` | 设置 hiddenInFileTree=true |
| `showWorkspaceInFileTree` | 设置 hiddenInFileTree=false |

## 样式

- 两行工具栏（BEM: `adl-tool-navigator__context` + `--secondary`）
- 每行分左右两组（`.--actions` 左对齐 / `.--utility` 右对齐）
- 工作区头部 `.adl-multitree-entry__header` 整体 hover/active 背景
- 名称 `.adl-multitree-entry__name` 悬停时右侧留空按钮位
- 操作按钮 `.adl-multitree-entry__actions` 绝对定位，hover 时浮现
- 自定义滚动条用 `CustomScrollArea` 组件，与 FileTree/OutlineTree 一致
