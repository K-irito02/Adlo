# 多工作区右侧面板改造计划（已定稿 ✅ 2026-05-24 实施完成）

> 用户确认的设计决策：
> 1. Changes: Entry + 展开（与 Files 一致）
> 2. Terminal: 工作区分组标签
> 3. 移除同步: 全局同步 → `hiddenFromRightPanels`（合并重命名）
> 4. GitSnapshot: `Record<string, GitSnapshot>`
> 5. 补丁/变更预览: 按工作区隔离 (`Record<string, ...>`)
> 6. 终端持久化: Store+localStorage（记录 workspaceId）
> 7. 展开状态: Files/Changes/Terminal 独立控制

> **实施状态**: 2026-05-24 完成 Changes 面板 + Terminal 面板多工作区改造。详见:
> - [Spec](https://github.com/your-org/ai-digital-life/blob/main/docs/superpowers/specs/2026-05-24-multi-workspace-changes-terminal-panel-design.md)
> - [Lessons](https://github.com/your-org/ai-digital-life/blob/main/docs/superpowers/specs/2026-05-24-multi-workspace-changes-terminal-panel-lessons-learned.md)

---

## 一、数据模型变更

### 1.1 Rust 后端 (kernel types.rs)

```rust
// 修改
hidden_in_file_tree: bool  →  hidden_from_right_panels: bool
// Tauri Commands 重命名
workspace_hide_from_file_tree   →  workspace_hide_from_right_panels
workspace_show_in_file_tree     →  workspace_show_in_right_panels
// 新增 Commands
workspace_list_git_status_for(path: String)       // 按工作区路径获取 git 状态
workspace_list_patch_sets_for(workspace_id: String) // 按工作区获取补丁集
```

**影响**: workspace.rs + main.rs (Tauri command 注册)

### 1.2 IPC 桥接层 (ipc.ts + 3 个实现)

```typescript
// ipc.ts
hideFromRightPanels(workspaceId: string): Promise<IpcResult<RecentWorkspaceEntry[]>>;
showInRightPanels(workspaceId: string): Promise<IpcResult<RecentWorkspaceEntry[]>>;
listGitStatusForWorkspace(workspacePath: string): Promise<IpcResult<GitSnapshot>>;

// tauri-bridge.ts / mock-bridge.ts / preview-bridge/index.ts
// 更新对应方法实现。mock-bridge 的 removeFromSidebar 不再自动设置 hidden_from_right_panels
```

### 1.3 Store State (StoreState.ts + workspaceSlice.ts)

```typescript
// 新增字段 (workspaceSlice)
gitSnapshots: Record<string, GitSnapshot>;              // 替换 gitSnapshot
workspaceChangesExpanded: Record<string, boolean>;       // Changes 展开状态 (vs Files)
workspaceChangesTreeData: Record<string, ChangeTreeNode[]>;  // 惰性加载
workspaceChangesTreeLoading: Record<string, boolean>;
workspaceChangesTreeErrors: Record<string, string | undefined>;

// 新增字段 (patchSlice / StoreState)
activePatchSets: Record<string, PatchSet | undefined>;       // 替换 activePatchSet
changePreviews: Record<string, WorkspaceChangePreview | undefined>; // 替换 changePreview
changePreviewLoading: Record<string, boolean>;                  // 替换 changePreviewLoading

// 修改 (workspaceSlice)
// hiddenInFileTree → hiddenFromRightPanels（所有过滤条件更新）
```

### 1.4 Terminal Slice (terminalSlice.ts)

```typescript
// TerminalTabState 增加
workspaceId: string;  // 所属工作区 ID

// 新增状态
terminalPersisted: boolean;  // 已从 localStorage 恢复

// 新增方法
terminalCreateTab(profile, workspaceId): void;  // 指定工作区创建
terminalTabsForWorkspace(workspaceId): TerminalTabState[];  // 按工作区过滤
terminalWorkspaceExpanded: Record<string, boolean>;  // 展开状态（独立于其他工具）
```

### 1.5 UI Store (ui-store.ts)

```typescript
// 现有 expandedChangesTreePaths 保持不变（展开的是文件/目录，不是 workspace 展开状态）
// 新增
changesVisibleWorkspaces: Record<string, boolean>;  // 各工作区在 Changes 中展开/收起
// workspace 的展开/收起存于 workspaceSlice 的 workspaceChangesExpanded
```

### 1.6 types.ts (RightPanelViewProps)

```typescript
// 新增 props
gitSnapshots: Record<string, GitSnapshot>;
activePatchSets: Record<string, PatchSet | undefined>;
changePreviews: Record<string, WorkspaceChangePreview | undefined>;
changePreviewLoading: Record<string, boolean>;
workspaceChangesExpanded: Record<string, boolean>;
workspaceChangesTreeData: Record<string, ChangeTreeNode[]>;
workspaceChangesTreeLoading: Record<string, boolean>;
workspaceChangesTreeErrors: Record<string, string | undefined>;
onToggleExpandInChanges: (workspaceId: string) => void;
onRefreshOneWorkspaceChanges: (workspaceId: string) => void;
onExpandAllChanges: () => void;
onCollapseAllChanges: () => void;

// 移除旧 props
// gitSnapshot → 移除
// activePatchSet → 移除  
// changePreview → 移除
// changePreviewLoading → 移除
```

---

## 二、后端变更

### 2.1 Rust types.rs

- `RecentWorkspaceEntry` 字段重命名
- 添加 DB migration（rename column）

### 2.2 Rust workspace.rs

- 重命名命令
- 新增 `cmd_workspace_list_git_status`（带 workspacePath 参数）
- 新增 `cmd_workspace_list_patch_sets`（带 workspaceId 参数）

### 2.3 Rust main.rs

- 注册新增/重命名的命令

---

## 三、前端组件变更

### 3.1 新组件

#### MultiWorkspaceChangesTree

位置: `frontend/src/app/features/workspace-changes-tree/`

与 `MultiWorkspaceFileTree` 结构一致，但内容不同：
- 每个 workspace entry 展开后显示该工作区的 git 变更（tree/list/outline 三种模式）
- 使用 `CustomScrollArea` 包裹
- 支持已置顶/未置顶分组排序、拖拽
- 更多操作菜单: "从右侧面板移除"
- 展开时惰性加载 `listGitStatusForWorkspace`

子组件:
- `MultiWorkspaceChangesTree.tsx` — 顶层容器
- `WorkspaceChangesEntry.tsx` — 单个工作区 entry
- `index.ts` — 导出

#### MultiWorkspaceTerminal

位置: `frontend/src/app/features/workspace-terminal/`

与 `MultiWorkspaceFileTree` 结构一致，但内容不同：
- 每个 workspace entry 展开后显示该工作区关联的终端标签列表
- 支持创建终端到指定工作区
- 使用 `CustomScrollArea` 包裹

子组件:
- `MultiWorkspaceTerminal.tsx` — 顶层容器
- `WorkspaceTerminalEntry.tsx` — 单个工作区 entry（包含 `TerminalTabBar`）
- `index.ts` — 导出

### 3.2 改造组件

#### ChangesPanel.tsx

**改造前:**
```
toolbar + navigator (tree/list/outline) + diff view
```

**改造后:**
```
toolbar + MultiWorkspaceChangesTree + diff view
```
- navigator 区域从扁平结构改为 workspace entries
- 每个 entry 展开后在其内部渲染原来的 tree/list/outline 视图（使用该工作区的 gitSnapshots 数据）
- toolbar 保留折叠按钮 + 标题 + 展开全部/折叠全部 + 刷新全部
- 移除第二行的三种模式切换按钮（tree/list/outline 移到每个 entry 内部）
- 右侧 diff 区域显示当前选中的 patch 文件

#### TerminalPanel.tsx

**改造前:**
```
toolbar + navigator (sessions/history) + xterm.js
```

**改造后:**
```
toolbar + MultiWorkspaceTerminal + xterm.js
```
- navigator 区域从扁平标签列表改为 workspace-grouped 标签列表
- 每个 workspace group 展开后显示该工作区的标签（复用 TerminalTabBar）
- 创建终端时弹出工作区选择（或默认选中当前活动工作区）
- toolbar 保留 Shell 选择器 + 更多操作菜单

#### FileNavigatorShell.tsx

- 过滤条件 `!w.hiddenInFileTree` → `!w.hiddenFromRightPanels`
- props 中移除相关字段引用

#### SidebarContextMenu.tsx

- "添加到文件树" 文本改为 "在右侧面板显示"
- 调用 `showInRightPanels` 替代 `showInFileTree`

#### LeftSidebar.tsx

- `onShowInFileTree: actions.showInFileTree` → `onShowInRightPanels: actions.showInRightPanels`

#### RightPanel.tsx

- `viewProps` 传递新的多工作区字段
- `badges.changes` 的计算: 遍历 `gitSnapshots` 聚合所有工作区的变更数
- 新的 `onToggleExpandInChanges` 回调传递

### 3.3 Store Action 变更

| Action (workspaceActions) | 变更 |
|--------------------------|------|
| `hideWorkspaceFromFileTree` | → `hideWorkspaceFromRightPanels` |
| `showWorkspaceInFileTree` | → `showWorkspaceInRightPanels` |
| `refreshWorkspaceTree` | 不变 |
| `loadWorkspaceTree` | 不变 |
| 新增 `loadGitSnapshot` | 惰性加载 git 状态 |
| 新增 `expandWorkspaceChangesInFileNav` | 展开 Changes entry + 加载 git 状态 |
| 新增 `collapseAllWorkspaceChanges` | 折叠所有 Changes entries |
| 新增 `expandAllWorkspaceChanges` | 展开所有 Changes entries + 并发加载 |

| Action (patchSlice / StoreState) | 变更 |
|----------------------------------|------|
| `setHunkDecision` | 增加 workspaceId 参数 |
| `applyPatchSet` | 指向当前 workspace 的 activePatchSet |
| `rollbackPatchSet` | 同上 |
| `selectPatchFile` | 增加 workspaceId 参数（当前 workspace） |

| Action (terminalSlice) | 变更 |
|------------------------|------|
| `terminalCreateTab` | 增加 workspaceId 参数 |
| 新增 `terminalTabsForWorkspace` | 过滤 |
| 新增 `toggleTerminalWorkspaceExpanded` | 展开/折叠 workspace group |
| `saveTerminalTabs` | 持久化到 localStorage |

---

## 四、DB Migration (Rust)

```sql
ALTER TABLE recent_workspaces 
  RENAME COLUMN hidden_in_file_tree TO hidden_from_right_panels;
```

如果没有 ALTER TABLE RENAME COLUMN 支持（SQLite 3.25+），则:
```sql
ALTER TABLE recent_workspaces ADD COLUMN hidden_from_right_panels INTEGER NOT NULL DEFAULT 0;
UPDATE recent_workspaces SET hidden_from_right_panels = hidden_in_file_tree;
-- 后续移除旧列（SQLite 不支持 DROP COLUMN 前，保留旧列但不再使用）
```

---

## 五、命名迁移清单

所有需要从 `hiddenInFileTree`/`hideFromFileTree`/`hidden_in_file_tree` 重命名的位置:

| 位置 | 当前名 | 新名 |
|------|--------|------|
| Rust kernel types.rs | `hidden_in_file_tree` | `hidden_from_right_panels` |
| Tauri Command | `workspace_hide_from_file_tree` | `workspace_hide_from_right_panels` |
| Tauri Command | `workspace_show_in_file_tree` | `workspace_show_in_right_panels` |
| IPC ipc.ts | `hideFromFileTree` | `hideFromRightPanels` |
| IPC ipc.ts | `showInFileTree` | `showInRightPanels` |
| tauri-bridge.ts | 对应方法 | 同上 |
| mock-bridge.ts | 对应方法 | 同上 |
| preview-bridge/index.ts | 对应方法 | 同上 |
| Store action | `hideWorkspaceFromFileTree` | `hideWorkspaceFromRightPanels` |
| Store action | `showWorkspaceInFileTree` | `showWorkspaceInRightPanels` |
| FileNavigatorShell.tsx | `!w.hiddenInFileTree` | `!w.hiddenFromRightPanels` |
| RightPanel.tsx | `!w.hiddenInFileTree` | `!w.hiddenFromRightPanels` |
| workspaceActions.ts | `!w.hiddenInFileTree` | `!w.hiddenFromRightPanels` |
| SidebarContextMenu.tsx | `workspace.hiddenInFileTree` | `workspace.hiddenFromRightPanels` |
| SidebarContextMenu.tsx | "添加到文件树" | "在右侧面板显示" |
| LeftSidebar.tsx | `onShowInFileTree` | `onShowInRightPanels` |
| sidebarViewModel.ts | 不涉及 | 无变更 |
| copy.ts | `addToFileTree` 键 | `showInRightPanels` |

---

## 六、UI 交互矩阵

| 区域 | 操作 | 行为 |
|------|------|------|
| **Files** | 点击名称区域 | 展开/折叠工作区文件树 |
| **Files** | ⋮ → "从此区域移除不显示" | 设置 `hiddenFromRightPanels=true`，从 3 个工具都消失 |
| **Files** | 展开后在导航器渲染 FileTree | 使用 `workspaceTrees[workspaceId]` |
| **Changes** | 点击名称区域 | 展开/折叠工作区变更列表 |
| **Changes** | 展开后加载 git status | 惰性调用 `listGitStatusForWorkspace(path)` |
| **Changes** | 展开后渲染 tree/list/outline | 使用 `workspaceChangesTreeData[workspaceId]`（文件变更树） |
| **Changes** | 展开后 toolbar 统计 | 显示该工作区的 staged/unstaged/untracked 计数 |
| **Changes** | 右侧 diff | 显示选中文件的 diff（该工作区的 changePreviews[workspaceId]） |
| **Changes** | ⋮ → "从此区域移除不显示" | 设置 `hiddenFromRightPanels=true`，从 3 个工具都消失 |
| **Terminal** | 点击名称区域 | 展开/折叠该工作区的终端标签列表 |
| **Terminal** | 展开后显示终端标签 | 使用 `terminalTabs.filter(t => t.workspaceId === ...)` |
| **Terminal** | 创建新终端 | 选择目标工作区（默认当前活动工作区），`cwd` 使用该工作区的 rootPath |
| **Terminal** | ⋮ → "从此区域移除不显示" | 设置 `hiddenFromRightPanels=true`，从 3 个工具都消失 |
| **Sidebar** | 右键 → "在右侧面板显示" | 设置 `hiddenFromRightPanels=false`，在 3 个工具都恢复 |
| **All** | Badge 计数 | 汇总所有可见工作区 |

---

## 七、实施步骤（顺序）

### Phase 1: 重命名 hiddenInFileTree → hiddenFromRightPanels
1. Rust types.rs: rename field
2. Rust workspace.rs: rename + add migration  
3. Rust main.rs: re-register
4. IPC ipc.ts: rename
5. All 3 bridges: rename
6. workspaceActions.ts: rename actions + filter
7. workspaceSlice.ts: rename references
8. FileNavigatorShell.tsx: rename filter
9. RightPanel.tsx: rename filter
10. SidebarContextMenu.tsx: rename + update text
11. LeftSidebar.tsx: rename callback binding
12. copy.ts: update Chinese/English text key

### Phase 2: Store 数据重构
13. StoreState.ts: add `gitSnapshots`/`activePatchSets`/`changePreviews`/`changePreviewLoading` (Record)
14. workspaceSlice.ts: add setter + initial state
15. patchSlice (or StoreState extension): add per-workspace fields
16. workspaceActions.ts: add `loadGitSnapshot`/`expandWorkspaceChangesInFileNav`/`collapseAllWorkspaceChanges`/`expandAllWorkspaceChanges`
17. types.ts (RightPanelViewProps): add new props, remove old

### Phase 3: MultiWorkspaceChangesTree
18. Create `features/workspace-changes-tree/` folder
19. Implement `WorkspaceChangesEntry.tsx` (reuse WorkspaceFileTreeEntry pattern)
20. Implement `MultiWorkspaceChangesTree.tsx` (reuse MultiWorkspaceFileTree pattern)
21. Implement `index.ts`
22. CSS: add `.adl-multichanges-*` styles (or reuse multitree patterns)

### Phase 4: MultiWorkspaceTerminal
23. TerminalSlice: add `workspaceId` to `TerminalTabState`
24. Implement terminal persistence (localStorage save/restore)
25. Create `features/workspace-terminal/` folder
26. Implement `WorkspaceTerminalEntry.tsx`
27. Implement `MultiWorkspaceTerminal.tsx`
28. Implement `index.ts`
29. CSS: add `.adl-multiterminal-*` styles

### Phase 5: 改造 ChangesPanel
30. Rewrite ChangesPanel.tsx navigator to use MultiWorkspaceChangesTree
31. Update toolbar layout (remove mode tabs, add expand/collapse all)
32. Update RightPanel.tsx to pass new props
33. Update FilesPanel.tsx to pass new props through
34. Update FileNavigatorShell.tsx props

### Phase 6: 改造 TerminalPanel
35. Rewrite TerminalPanel.tsx navigator to use MultiWorkspaceTerminal
36. Update terminal creation to target workspace
37. Update cwd to use workspace rootPath
38. RightPanel.tsx: pass terminal workspace props

### Phase 7: 后端新增 Commands
39. Rust workspace.rs: add `cmd_workspace_list_git_status`
40. Rust main.rs: register command
41. IPC: add `listGitStatusForWorkspace`
42. All 3 bridges: implement

### Phase 8: 验证
43. TypeScript type check
44. Unit tests
45. Visual verification

---

## 八、可能的风险与缓解

| 风险 | 缓解 |
|------|------|
| SQLite migration 失败 | Handle 0 results gracefully, add migration version tracking |
| 多工作区并发加载 git 状态性能 | 惰性加载 + 请求序列号取消旧请求 + 并发限制 3 |
| hiddenInFileTree→hiddenFromRightPanels 导致已有隐藏数据丢失 | Migration 复制旧值。preview-bridge 中 `hiddenInFileTree` 字段在 JSON 中仍然存在时忽略 |
| 终端标签持久化后 workspace 被删除 | 恢复时跳过不存在的 workspaceId 的标签 |
| 三个面板的展开/折叠全部操作复杂度 | 各自独立实现，不共享逻辑 |
