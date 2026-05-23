# 多工作空间文件树 — 实施计划

> 基于 [多工作空间文件树设计方案-2026-05-23.md](/E:/Programs/Obsidian/notes/docs/多工作空间文件树设计方案-2026-05-23.md)
> 样式遵从项目现有 `adl-*` BEM 命名体系和设计 Token

---

## 1. 现状摘要

| 项目 | 当前状态 |
|------|----------|
| `workspaceTree` | store 中仅单值，保存当前激活工作区的文件树 |
| `listTree` | 后端绑定 active workspace，不支持任意路径 |
| 文件树组件 | `FileTree` 纯展示，消费 `workspaceTree` prop |
| 侧边栏工作区 | `WorkspaceList` 消费 `recentWorkspaces`，已有 pin/reorder/remove |
| 展开状态 | 扁平 `Record<string, boolean>`，无工作区作用域 |

## 2. 变更范围总览

| 层级 | 变更文件数 | 主要内容 |
|------|-----------|----------|
| 数据类型 | 2 | `RecentWorkspaceEntry` 新增 `hiddenInFileTree` |
| Rust 后端 | 1 | `workspace_list_tree` 改造 + 2 个新 Command + 1 个修改 |
| IPC 桥接 | 4 | `ipc.ts` + `tauri-bridge.ts` + `preview-bridge/index.ts` + `mock-bridge.ts` |
| Store（切片+actions） | 4 | `workspaceSlice.ts` + `workspaceActions.ts` + `generalActions.ts` + `StoreState.ts` |
| UI Store | 1 | `ui-store.ts` expandedFileTreePaths 改造 |
| 新组件 | 3 | `WorkspaceFileTreeEntry.tsx` + `MultiWorkspaceFileTree.tsx` + `index.ts` |
| 改造组件 | 5 | `FileNavigatorShell.tsx` + `FilesPanel.tsx` + `RightPanel.tsx` + `types.ts` + `SidebarContextMenu.tsx` |
| CSS | 1 | `rightpanel.css` 新增多工作区文件树样式 |
| 侧边栏 | 1 | `buildSidebarViewModel` / `SidebarContextMenu` 添加"添加到文件树" |

---

## 3. 实施步骤

### Phase 1: 数据层改造（Rust 后端 + IPC 桥接）

#### 1.1 `crates/kernel/src/types.rs`
- `RecentWorkspaceEntry` 结构体新增字段: `pub hidden_in_file_tree: bool`

#### 1.2 `src-tauri/src/commands/workspace.rs`
- **改造** `workspace_list_tree`: 签名改为 `workspace_path: Option<String>`
  - `Some(path)` → `adl_workspace::list_tree(PathBuf::from(&path).as_path())`
  - `None` → 现有逻辑（with_workspace）
- **新增** `workspace_hide_from_file_tree`: 设置 `hidden_in_file_tree = true`，保存并返回
- **新增** `workspace_show_in_file_tree`: 设置 `hidden_in_file_tree = false`，保存并返回
- **修改** `workspace_remove_from_sidebar`: 额外设置 `hidden_in_file_tree = true`

#### 1.3 `frontend/src/shared/ipc.ts`
`WorkspaceBridge` 接口新增:
```typescript
listTreeForWorkspace: (workspacePath: string) => Promise<IpcResult<WorkspaceTreeNode[]>>;
hideFromFileTree: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
showInFileTree: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
```

#### 1.4 `frontend/src/kernel/index.ts`
`RecentWorkspaceEntry` 接口新增: `hiddenInFileTree: boolean`

#### 1.5-1.7 桥接实现
- `tauri-bridge.ts`: 实现 `listTreeForWorkspace`（invoke `workspace_list_tree` 带 path）/ `hideFromFileTree` / `showInFileTree`
- `preview-bridge/index.ts`: 实现三个方法（HTTP API 调用）
- `mock-bridge.ts`: 实现三个方法（mock 数据）

---

### Phase 2: Store 改造

#### 2.1 `workspaceSlice.ts` — 替换字段
```
❌ workspaceTree: WorkspaceTreeNode[]
✅ workspaceTrees: Record<string, WorkspaceTreeNode[]>
✅ workspaceTreeLoading: Record<string, boolean>
✅ workspaceTreeErrors: Record<string, string | undefined>
✅ workspaceTreeExpandedInFileNav: Record<string, boolean>
```
`recentWorkspaces` 保持不变（已含 `hiddenInFileTree`）。

初始值:
```typescript
workspaceTrees: {},
workspaceTreeLoading: {},
workspaceTreeErrors: {},
workspaceTreeExpandedInFileNav: {},
```

#### 2.2 `StoreState.ts`
更新 `WorkspaceSlice` 的类型接口（同上新增字段）。

#### 2.3 `workspaceActions.ts` — 新增 9 个 action

| Action | 说明 |
|--------|------|
| `loadWorkspaceTree(workspaceId, path)` | 加载指定工作区文件树，设 loading/error 状态 |
| `toggleWorkspaceTreeInFileNav(workspaceId)` | 切换展开状态 |
| `expandWorkspaceTreeInFileNav(workspaceId, path)` | 展开 + 惰性加载 |
| `refreshAllWorkspaceTrees()` | 刷新所有已展开工作区 |
| `cleanupRemovedWorkspaceTree(workspaceId)` | 清理缓存和展开状态 |
| `hideWorkspaceFromFileTree(workspaceId)` | 调用后端 + 清理缓存 |
| `showWorkspaceInFileTree(workspaceId)` | 调用后端恢复 |
| `expandAllWorkspaceTreesInFileNav()` | 展开所有可见可用工作区（分批加载） |
| `collapseAllWorkspaceTreesInFileNav()` | 折叠所有 |

#### 2.4 `generalActions.ts` — 改造 `bootstrap()`
- 移除 `bootstrap()` 中的 `listTree()` 调用
- 对 active workspace 只获取 `gitSnapshot`
- `workspaceTrees` 初始化为空 `{}`
- 若当前工作区可见且数量少，可主动展开（优化体验）

#### 2.5 `ui-store.ts` — 展开路径改造
```typescript
// 旧:
expandedFileTreePaths: Record<string, boolean>;
setFileTreePathExpanded: (path: string, expanded: boolean) => void;
toggleFileTreePath: (path: string) => void;
expandFileTreePathChain: (path: string) => void;
collapseAllFileTreePaths: () => void;

// 新:
expandedFileTreePaths: Record<string, Record<string, boolean>>;
// key = workspaceId, value = { path → expanded }
setFileTreePathExpanded: (workspaceId: string, path: string, expanded: boolean) => void;
toggleFileTreePath: (workspaceId: string, path: string) => void;
expandFileTreePathChain: (workspaceId: string, path: string) => void;
collapseAllFileTreePaths: (workspaceId: string) => void;
```

---

### Phase 3: 新组件创建

#### 3.1 创建目录 `features/workspace-file-tree/`

```
features/workspace-file-tree/
├── WorkspaceFileTreeEntry.tsx   # 单个工作区头部行 + 文件树
├── MultiWorkspaceFileTree.tsx   # 多工作区容器
└── index.ts                    # 导出
```

#### 3.2 `WorkspaceFileTreeEntry.tsx`

**Props 接口:**
```typescript
interface WorkspaceFileTreeEntryProps {
  workspace: RecentWorkspaceEntry;
  isCurrent: boolean;
  isExpanded: boolean;
  treeNodes: WorkspaceTreeNode[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  selectedFilePath: string | undefined;
  expandedPaths: Record<string, boolean>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: () => void;
  onOpenWorkspace: (path: string) => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onHideFromFileTree: (workspaceId: string) => void;
  onRefreshTree: () => void;
  onToggleFileTreePath: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  expandLabel: string;
  collapseLabel: string;
  t: CopyDict;
}
```

**渲染结构:**
```tsx
<div className="adl-multitree-entry" data-current={isCurrent}>
  <div className="adl-multitree-entry__header">
    {/* 左区域: 展开/折叠 */}
    <div className="adl-multitree-entry__expand">
      <button><!-- ▶/▼ SVG --></button>
    </div>
    {/* 右区域: 名称 + 悬浮操作按钮 */}
    <div className="adl-multitree-entry__namezone" onClick={switchWorkspace}>
      <span className="adl-multitree-entry__name">{workspace.name}</span>
      <div className="adl-multitree-entry__actions">
        <button class="adl-icon-btn adl-icon-btn--xs"><IconRefreshCw /></button>
        <button class="adl-icon-btn adl-icon-btn--xs">{isPinned ? <IconPinOff /> : <IconPin />}</button>
        <button class="adl-icon-btn adl-icon-btn--xs"><IconMoreVertical /></button>
      </div>
    </div>
  </div>
  {/* 展开时显示文件树 */}
  {isExpanded && (
    <div className="adl-multitree-entry__tree">
      {isLoading ? <Skeleton /> : error ? <ErrorState /> :
        <FileTree nodes={treeNodes!} ... />}
    </div>
  )}
</div>
```

**关键交互:**
- 悬浮 `__namezone` → `__actions` opacity: 0 → 1（CSS hover）
- 悬浮 `__expand` → 通过 `has-expand-hover` CSS class 强制隐藏 `__actions`（CSS sibling selector）
- `__actions` 三个按钮使用项目现有 `adl-icon-btn adl-icon-btn--xs` 样式
- 名称 `__name` 使用 `text-overflow: ellipsis`

#### 3.3 `MultiWorkspaceFileTree.tsx`

**Props 接口:**
```typescript
interface MultiWorkspaceFileTreeProps {
  workspaces: RecentWorkspaceEntry[];
  activeWorkspaceId: string | undefined;
  treeData: Record<string, WorkspaceTreeNode[]>;
  loadingStates: Record<string, boolean>;
  errorStates: Record<string, string | undefined>;
  expandedStates: Record<string, boolean>;
  allExpanded: boolean;
  selectedFilePath: string | undefined;
  expandedPaths: Record<string, Record<string, boolean>>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  onOpenWorkspace: (path: string) => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onHideFromFileTree: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenFile: (relativePath: string) => void;
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  t: CopyDict;
}
```

**渲染逻辑:**
1. 按 `isPinned` 分成两组（已置顶 / 未置顶）
2. 每组内部按 `pinnedOrder` / `unpinnedOrder` 排序
3. 置顶区上方显示 "已置顶" 标签，未置顶区上方显示 "未置顶" 标签
4. 拖拽排序实现，复用 `WorkspaceList.tsx` 中的 `moveIdWithinBucket` 算法
5. 拖拽放置指示器显示元素间的插入线

**派生数据（组件内 useMemo）:**
```typescript
const visibleWorkspaces = useMemo(
  () => workspaces.filter(w => !w.hiddenInFileTree),
  [workspaces]
);
```

---

### Phase 4: 现有组件改造

#### 4.1 `FileNavigatorShell.tsx`

**顶部导航栏（Toolbar）改动:**
- 移除 `appInfo?.currentWorkspace?.name` 显示
- 在 `context-group--actions` 中，将展开/收起按钮改为全局控制:
  - `IconUnfoldVertical` / `IconFoldVertical` → 展开/收起所有
  - `IconRefreshCw` → 刷新所有已展开工作区
- 保留模式切换（文件树/大纲/搜索）
- 保留新建文件/文件夹按钮

**Tree 模式渲染改动:**
```tsx
// 旧:
{workspaceTree.length > 0 ? <FileTree nodes={workspaceTree} ... /> : null}

// 新:
{visibleWorkspaces.length > 0 ? (
  <MultiWorkspaceFileTree
    workspaces={visibleWorkspaces}
    activeWorkspaceId={appInfo?.currentWorkspace?.id}
    treeData={workspaceTrees}
    ...
  />
) : <EmptyState />}
```

**Props 调整:**
```typescript
interface FileNavigatorShellProps {
  // 移除: workspaceTree: WorkspaceTreeNode[];
  // 新增:
  workspaceTrees: Record<string, WorkspaceTreeNode[]>;
  recentWorkspaces: RecentWorkspaceEntry[];
  // 展开状态增加 workspaceId 作用域:
  expandedPaths: Record<string, Record<string, boolean>>;
  // 新增回调:
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefreshAll: () => void;
  onRefreshOneWorkspace: (workspaceId: string) => void;
  onHideFromFileTree: (workspaceId: string) => void;
  onShowInFileTree: (workspaceId: string) => void;
  allExpanded: boolean;
}
```

#### 4.2 `FilesPanel.tsx`
- 更新 `FileNavigatorShell` 的 props 传递
- 从 `RightPanelViewProps` 传递新数据

#### 4.3 `RightPanel.tsx`
- store 读取 `workspaceTrees`、`recentWorkspaces`、`workspaceTreeExpandedInFileNav` 等替换 `workspaceTree`
- 传递新回调（通过 actions）

#### 4.4 `right-panel/types.ts`
`RightPanelViewProps` 接口更新:
```
❌ workspaceTree: WorkspaceTreeNode[];
✅ workspaceTrees: Record<string, WorkspaceTreeNode[]>;
✅ recentWorkspaces: RecentWorkspaceEntry[];
✅ allExpanded: boolean;
✅ onExpandAll: () => void;
✅ onCollapseAll: () => void;
✅ onRefreshAll: () => void;
✅ onRefreshOneWorkspace: (workspaceId: string) => void;
✅ onHideFromFileTree: (workspaceId: string) => void;
✅ onShowInFileTree: (workspaceId: string) => void;
```

#### 4.5 `SidebarContextMenu.tsx`
在侧边栏工作区右键菜单中新增菜单项:
```typescript
// 条件: workspace.removedFromSidebar === false && workspace.hiddenInFileTree === true
{
  id: "show-in-file-tree",
  label: t.addToFileTree,
  icon: <IconFiles />,
  action: async (workspaceId) => {
    await useAppStore.getState().showWorkspaceInFileTree(workspaceId);
  },
  // 仅当满足条件时加入菜单项数组
}
```

---

### Phase 5: CSS 样式

#### 5.1 `rightpanel.css` 追加多工作区文件树样式

使用项目现有的设计 Token 和 BEM 命名：

```css
/* 多工作区文件树 */
.adl-multitree {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-1) 0;
}

.adl-multitree-section-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  padding: var(--space-2) var(--space-3) var(--space-1);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.adl-multitree-entry {
  border-bottom: 1px solid var(--border-subtle);
}
.adl-multitree-entry:last-child {
  border-bottom: none;
}

.adl-multitree-entry__header {
  display: flex;
  align-items: stretch;
  min-height: 34px;
}

/* 左区域：展开/折叠 */
.adl-multitree-entry__expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  flex-shrink: 0;
}
.adl-multitree-entry__expand-btn {
  /* 复用 adl-icon-btn --xs 的尺寸 */
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition-colors);
}
.adl-multitree-entry__expand-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.adl-multitree-entry__expand-btn svg {
  transition: transform var(--duration-150) var(--ease-default);
}
.adl-multitree-entry__expand-btn.is-expanded svg {
  transform: rotate(90deg);
}

/* 右区域：名称 + 悬浮按钮 */
.adl-multitree-entry__namezone {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2) 0 0;
  cursor: pointer;
  position: relative;
}
.adl-multitree-entry__namezone:hover {
  background: var(--surface-hover);
}

.adl-multitree-entry__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-primary);
  transition: var(--transition-colors);
}

/* 当前工作区高亮 */
.adl-multitree-entry.is-current .adl-multitree-entry__namezone::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 1px;
  background: var(--accent);
}

/* 操作按钮 - 默认隐藏，悬浮右区域时显示 */
.adl-multitree-entry__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-150) var(--ease-default);
  flex-shrink: 0;
}
.adl-multitree-entry__namezone:hover .adl-multitree-entry__actions {
  opacity: 1;
  pointer-events: auto;
}

/* 悬浮左区域时强制隐藏 */
.adl-multitree-entry__expand:hover + .adl-multitree-entry__namezone .adl-multitree-entry__actions {
  opacity: 0 !important;
  pointer-events: none !important;
}

/* 悬浮左区域时名称恢复完整显示 */
.adl-multitree-entry__expand:hover + .adl-multitree-entry__namezone .adl-multitree-entry__name {
  /* 不做特殊处理，让名称自然显示 */
}

/* 文件树区域 */
.adl-multitree-entry__tree {
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-subtle);
}
.adl-multitree-entry__tree .adl-filetree {
  padding-left: 4px;
}

/* 拖拽指示线 */
.adl-multitree-entry.is-drag-target-before {
  border-top: 2px solid var(--accent);
}
.adl-multitree-entry.is-drag-target-after {
  border-bottom: 2px solid var(--accent);
}
.adl-multitree-entry.is-dragging {
  opacity: 0.4;
}

/* 加载/错误状态 */
.adl-multitree-entry__loading {
  padding: var(--space-2) var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.adl-multitree-entry__error {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  color: var(--danger);
}
```

---

### Phase 6: 清理与验证

#### 6.1 全局搜索旧 `workspaceTree` 引用
```bash
grep -r "workspaceTree" frontend/src/app/ --include="*.ts" --include="*.tsx"
```
所有旧的 `useAppStore(s => s.workspaceTree)` 替换为 `useAppStore(s => s.workspaceTrees)` + active workspace ID 查找。

#### 6.2 selectors 更新
检查 `frontend/src/app/stores/selectors.ts` 中是否有 `workspaceTree` 选择器，更新或废弃。

#### 6.3 测试
```bash
# Rust
cargo test --workspace

# 前端类型检查
npm --prefix frontend run typecheck

# 前端测试
npm --prefix frontend test
```

#### 6.4 双端验证
- Tauri 模式: `npm run dev:tauri`
- 浏览器模式: `npm run dev:browser`

---

## 4. 关键设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| 样式使用 | 项目现有 `adl-*` BEM + CSS 变量 | 用户明确要求 |
| 展开路径作用域 | `Record<workspaceId, Record<path, bool>>` | 避免工作区间路径名冲突 |
| 文件树复用 | 直接使用现有 `FileTree` 组件 | 纯展示，props 驱动，无需改造 |
| 拖拽排序 | 复用 `WorkspaceList` 的 `moveIdWithinBucket` | 与侧边栏共享算法 |
| 操作按钮样式 | 复用 `adl-icon-btn adl-icon-btn--xs` | 与侧边栏 pin 按钮一致 |
| 名称截断 | `text-overflow: ellipsis` | 悬浮时按钮浮现，名称自动收缩 |
| 惰性加载 | 仅展开时加载，缓存留会话期 | 减少启动时的文件系统压力 |

## 5. 可能遇到的问题

| 问题 | 处理 |
|------|------|
| 旧 `workspaceTree` 引用遗漏 | Phase 6.1 全面 grep，逐一替换 |
| `expandedFileTreePaths` 签名变更影响范围 | 需检查所有 `toggleFileTreePath`/`expandFileTreePathChain` 调用处 |
| `bootstrap()` 移除 `listTree` 后编辑器无文件可显示 | 用户展开工作区后自动加载 |
| 浏览器模式 `listTreeForWorkspace` 的 IGNORED_DIRS 过滤 | 需在 preview-bridge 端实现等效过滤 |
| CSS 与现有 `.adl-filetree` 元素嵌套 | 确保 `.adl-multitree-entry__tree` 中子 `.adl-filetree` 有适当的内边距 |

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `crates/kernel/src/types.rs` | 编辑 | `RecentWorkspaceEntry` + `hidden_in_file_tree` |
| `src-tauri/src/commands/workspace.rs` | 编辑 | +3 commands, 1 modify |
| `frontend/src/kernel/index.ts` | 编辑 | `RecentWorkspaceEntry` + `hiddenInFileTree` |
| `frontend/src/shared/ipc.ts` | 编辑 | +3 桥接方法 |
| `frontend/src/tauri-bridge.ts` | 编辑 | +3 实现 |
| `frontend/src/preview-bridge/index.ts` | 编辑 | +3 实现 |
| `frontend/src/mock-bridge.ts` | 编辑 | +3 实现 |
| `frontend/src/app/stores/slices/workspaceSlice.ts` | 编辑 | 替换字段 |
| `frontend/src/app/stores/StoreState.ts` | 编辑 | 更新类型 |
| `frontend/src/app/stores/actions/workspaceActions.ts` | 编辑 | +9 actions |
| `frontend/src/app/stores/actions/generalActions.ts` | 编辑 | 改造 bootstrap |
| `frontend/src/app/ui-store.ts` | 编辑 | expandedFileTreePaths 改造 |
| `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` | **新建** | 工作区头部行 |
| `frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx` | **新建** | 多工作区容器 |
| `frontend/src/app/features/workspace-file-tree/index.ts` | **新建** | 导出 |
| `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` | 编辑 | 顶部栏改造 + 替换 FileTree |
| `frontend/src/app/regions/right-panel/FilesPanel.tsx` | 编辑 | props 调整 |
| `frontend/src/app/regions/RightPanel.tsx` | 编辑 | store 读取改造 |
| `frontend/src/app/regions/right-panel/types.ts` | 编辑 | 类型更新 |
| `frontend/src/app/regions/left-sidebar/SidebarContextMenu.tsx` | 编辑 | 新增"添加到文件树" |
| `frontend/src/styles/regions/rightpanel.css` | 编辑 | 追加 `.adl-multitree-*` 样式 |
