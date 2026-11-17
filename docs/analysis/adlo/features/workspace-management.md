# 工作区管理

## 整体架构

```
┌────────────────────────────────────────────────────────────────┐
│                    前端（React + Zustand）                      │
│                                                                │
│  features/                                                     │
│  ├── workspace-file-tree/      ← 工作区文件树                   │
│  ├── workspace-changes-tree/   ← 工作区变更树                   │
│  ├── workspace-browser/        ← 工作区浏览器                   │
│  ├── workspace-terminal/       ← 工作区终端                     │
│  └── multi-workspace/          ← 多工作区容器                   │
│                                                                │
│  components/workspace/                                          │
│  ├── CheckpointTimeline.tsx    ← 检查点时间线                   │
│  ├── ConflictBanner.tsx        ← 冲突横幅                       │
│  ├── GitSummary.tsx            ← Git 摘要                       │
│  ├── IndexStatus.tsx           ← 索引状态                       │
│  └── RepoMapView.tsx           ← 仓库地图                       │
│  └── ValidationSummaryBar.tsx  ← 验证摘要栏                     │
│                                                                │
│  stores/                                                        │
│  ├── slices/workspaceSlice.ts  ← 工作区状态切片                 │
│  ├── slices/gitSlice.ts        ← Git 状态切片                   │
│  ├── actions/workspaceActions.ts  ← 工作区 Action               │
│  ├── actions/workspaceLifecycleActions.ts ← 生命周期 Action     │
│  ├── actions/workspaceTreeActions.ts  ← 文件树 Action           │
│  ├── actions/gitActions.ts     ← Git Action                     │
│  ├── actions/searchActions.ts  ← 搜索 Action                    │
│  └── workspaceSelectors.ts     ← 工作区选择器                   │
└────────────────────────────────────────────────────────────────┘
                        │
                        ▼ IPC (tauri-bridge / preview-bridge / mock-bridge)
                        │
┌────────────────────────────────────────────────────────────────┐
│                Tauri 命令层                                    │
│                                                                │
│  src-tauri/src/commands/                                       │
│  ├── workspace.rs             ← 工作区 CRUD                    │
└────────────────────────────────────────────────────────────────┘
                        │
┌────────────────────────────────────────────────────────────────┐
│              workspace Crate（Rust）                            │
│                                                                │
│  crates/workspace/src/                                         │
│  ├── detect.rs     ← 工作区检测与打开                          │
│  ├── fs.rs         ← 文件系统操作（CRUD）                      │
│  ├── git.rs + git/ ← Git 快照/分支/变更检测                    │
│  ├── gitignore.rs  ← .gitignore 链解析                         │
│  ├── search.rs     ← 文本搜索（SearchWindow 分页）              │
│  ├── tree.rs + tree_cache_store.rs ← 文件树构建与缓存           │
│  ├── watch.rs      ← 文件变更监听                              │
│  └── preview.rs    ← 变更预览读取                              │
└────────────────────────────────────────────────────────────────┘
```

## workspace Crate

| 文件 | 导出项 | 说明 |
|------|--------|------|
| `detect.rs` | `detect_root`, `open_workspace`, `stable_workspace_id`, `strip_verbatim_prefix`, `workspace_type` | 项目根检测（向上遍历找 `.git` 等标记）、工作区打开、稳定 ID 生成、Windows 路径前缀处理 |
| `fs.rs` | `create_file`, `create_folder`, `delete_entry`, `duplicate_entry`, `move_entry`, `rename_entry` | 文件系统操作，支持工作区路径内的文件 CRUD |
| `git.rs` | `capture_git_snapshot`, `capture_git_snapshot_async`, `create_git_branch`, `git_has_local_changes`, `list_git_branches`, `switch_git_branch` | Git 操作：快照捕获（分支/HEAD/暂存/未暂存/未跟踪/冲突）、分支管理、本地变更检测（30 秒超时） |
| `search.rs` | `search_text`, `search_text_async` | 工作区文本搜索 |
| `tree.rs` | `build_retrieval_snapshot`, `build_retrieval_snapshot_async`, `list_tree` | 文件树生成：递归目录遍历、检索快照构建 |
| `preview.rs` | `read_change_preview` | 变更文件内容预览读取 |

### GitSnapshot 数据结构

```
GitSnapshot {
    is_repo: bool,
    branch: Option<String>,
    head: Option<String>,
    ahead: Option<i32>,
    behind: Option<i32>,
    staged: Vec<String>,
    unstaged: Vec<String>,
    untracked: Vec<String>,
    conflicts: Vec<String>,
    captured_at: i64,
}
```

## Tauri 命令

### workspace.rs

| 命令 | 说明 |
|------|------|
| `open_workspace` | 打开工作区（路径规范化、检测、持久化） |
| `close_workspace` | 关闭工作区 |
| `list_workspaces` | 列出最近工作区 |
| `reorder_workspaces` | 工作区排序（固定/非固定） |
| `rename_workspace` | 重命名工作区 |
| `remove_workspace` | 移除工作区（从最近列表） |
| `get_app_info` | 获取应用信息 |

### Git/侧边栏命令

> Git/树/搜索/大纲命令经 `shared/ipc/workspace.ts` + `github.ts` 通道。下表命令名为 IPC 方法快照（以 `shared/ipc/` 为准）。

| 命令 | 说明 |
|------|------|
| `capture_git_snapshot` | 捕获 Git 快照（同步） |
| `capture_git_snapshot_async` | 捕获 Git 快照（异步） |
| `list_git_branches` | 列出 Git 分支 |
| `switch_git_branch` | 切换 Git 分支 |
| `create_git_branch` | 创建 Git 分支 |
| `git_has_local_changes` | 检查是否有本地变更 |

| 命令 | 说明 |
|------|------|
| `list_tree` | 获取工作区文件树 |
| `build_retrieval_snapshot` | 构建检索快照 |
| `search_text` | 文本搜索 |
| `read_file` | 读取文件内容 |
| `create_file_entry` | 创建文件/文件夹 |
| `delete_file_entry` | 删除文件/文件夹 |
| `rename_file_entry` | 重命名文件/文件夹 |
| `move_file_entry` | 移动文件/文件夹 |
| `duplicate_file_entry` | 复制文件/文件夹 |
| `read_change_preview` | 读取变更预览 |
| `read_media_file` | 读取媒体/办公二进制（base64 + MIME） |
| `stage_all` / `unstage_all` / `discard_all` | 全量暂存 / 取消暂存 / 放弃（无 HEAD 先清索引） |
| `commit` / `push` / `pull_ff_only` | 提交 / 推送（自动 upstream）/ 仅快进拉取 |
| `outline` | 代码大纲 |

### IPC 接口 (`shared/ipc/workspace.ts`)

```typescript
interface WorkspaceBridge {
  open(input: { path: string }): Promise<IpcResult<WorkspaceSummary>>;
  close(input: { id: string }): Promise<IpcResult<void>>;
  list(): Promise<IpcResult<WorkspaceSummary[]>>;
  listTreeForWorkspace(
    workspacePath: string,
    options?: { force?: boolean },
  ): Promise<IpcResult<WorkspaceTreeNode[]>>;
  removeFromSidebar(input: { workspaceId: string }): Promise<IpcResult<WorkspaceSummary[]>>;
  rename(input: { id: string; name: string }): Promise<IpcResult<void>>;
  remove(input: { id: string }): Promise<IpcResult<void>>;
  readFile(input: { workspaceId: string; root: string; path: string }): Promise<IpcResult<WorkspaceFileDocument>>;
  search(input: SearchInput): Promise<IpcResult<SearchResult[]>>;
  // ... 更多方法
}
```

## 前端状态管理

### workspaceSlice.ts

| 字段 | 类型 | 说明 |
|------|------|------|
| `workspaces` | `WorkspaceState[]` | 当前打开的工作区列表 |
| `recentWorkspaces` | `RecentWorkspaceEntry[]` | 最近打开的工作区 |
| `activeWorkspaceId` | `string \| undefined` | 当前激活工作区 ID |
| `fileTreeData` | `Record<string, WorkspaceTreeNode[]>` | 文件树数据（按工作区 ID 索引） |
| `fileTreeExpanded` | `Record<string, Set<string>>` | 文件树展开状态 |

localStorage 持久化 key：`adl-ui:workspace-tree-expanded`、`adl-ui:workspace-changes-expanded`

### gitSlice.ts

```
GitSlice {
    gitSnapshot?: GitSnapshot;
    gitBranches: GitBranchSummary[];
    setGitSnapshot(snapshot),
    setGitBranches(branches),
    clearGitState(),
}
```

### 工作区相关 Action

| Action 文件 | 主要方法 | 说明 |
|-------------|----------|------|
| `workspaceActions.ts` | `openWorkspace`, `closeWorkspace`, `listWorkspaces`, `reorderWorkspaces` | 工作区 CRUD |
| `workspaceLifecycleActions.ts` | `initWorkspaces`, `activateWorkspace`, `deactivateWorkspace` | 工作区生命周期 |
| `workspaceTreeActions.ts` | `fetchFileTree`, `expandNode`, `collapseNode`, `createFile`, `deleteFile` | 文件树操作 |
| `gitActions.ts` | `fetchGitSnapshot`, `fetchGitBranches`, `switchBranch`, `createBranch` | Git 操作 |
| `searchActions.ts` | `searchWorkspace` | 工作区搜索 |

## 前端功能组件

### workspace-file-tree

| 组件 | 说明 |
|------|------|
| `MultiWorkspaceFileTree.tsx` | 多工作区文件树容器：按工作区组织、展开/折叠同步 |
| `WorkspaceFileTreeEntry.tsx` | 文件树条目：文件/文件夹图标、右键菜单、选中状态 |

### workspace-changes-tree

| 组件 | 说明 |
|------|------|
| `MultiWorkspaceChangesTree.tsx` | 多工作区变更树容器：聚合所有工作区的变更 |
| `WorkspaceChangesEntry.tsx` | 变更条目：变更类型图标、文件路径、变更数量统计 |

### workspace-browser

| 组件 | 说明 |
|------|------|
| `multiworkspacebrowser.tsx` | 多工作区浏览器面板 |

### multi-workspace

| 组件 | 路径 | 说明 |
|------|------|------|
| `MultiWorkspaceContainer.tsx` | `features/multi-workspace/` | 多工作区容器组件 |

### 工作区通用组件 (components/workspace/)

| 组件 | 说明 |
|------|------|
| `CheckpointTimeline.tsx` | 检查点时间线：Git 快照的时间线展示 |
| `ConflictBanner.tsx` | 冲突横幅：检测到 Git 冲突时显示横幅提示 |
| `GitSummary.tsx` | Git 摘要：分支名、变更数、提交 SHA |
| `IndexStatus.tsx` | 索引状态：暂存区/未暂存/未跟踪文件计数 |
| `RepoMapView.tsx` | 仓库地图：仓库文件结构可视化 |
| `ValidationSummaryBar.tsx` | 验证摘要栏：变更验证结果汇总 |

## 文件参考指南

| 路径 | 说明 |
|------|------|
| `crates/workspace/src/lib.rs` | workspace crate 入口 |
| `crates/workspace/src/detect.rs` | 工作区检测与打开 |
| `crates/workspace/src/fs.rs` | 文件系统操作 |
| `crates/workspace/src/git.rs` | Git 快照/分支管理 |
| `crates/workspace/src/search.rs` | 文本搜索 |
| `crates/workspace/src/tree.rs` | 文件树构建 |
| `crates/workspace/src/preview.rs` | 变更预览读取 |
| `crates/workspace/Cargo.toml` | workspace crate 依赖 |
| `src-tauri/src/commands/workspace.rs` | 工作区 Tauri 命令 |
| `src-tauri/src/commands/workspace.rs` | 工作区命令（旧 workspace_git.rs/workspace_sidebar.rs 已合并入） |
| `frontend/src/app/stores/slices/workspaceSlice.ts` | 工作区状态切片 |
| `frontend/src/app/stores/slices/gitSlice.ts` | Git 状态切片 |
| `frontend/src/app/stores/actions/workspaceActions.ts` | 工作区 Action |
| `frontend/src/app/stores/actions/workspaceLifecycleActions.ts` | 工作区生命周期 Action |
| `frontend/src/app/stores/actions/workspaceTreeActions.ts` | 文件树 Action |
| `frontend/src/app/stores/actions/gitActions.ts` | Git Action |
| `frontend/src/app/stores/actions/searchActions.ts` | 搜索 Action |
| `frontend/src/app/stores/workspaceSelectors.ts` | 工作区选择器 |
| `frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx` | 多工作区文件树 |
| `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` | 工作区文件树条目 |
| `frontend/src/app/features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx` | 多工作区变更树 |
| `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` | 工作区变更条目 |
| `frontend/src/app/features/workspace-browser/multiworkspacebrowser.tsx` | 工作区浏览器 |
| `frontend/src/app/features/multi-workspace/MultiWorkspaceContainer.tsx` | 多工作区容器 |
| `frontend/src/app/regions/StatusBarGitInfo.tsx` | 状态栏 Git 信息 |
| `frontend/src/app/components/CreateWorkspaceModal.tsx` | 新建工作区弹窗 |
| `frontend/src/app/components/WorkspaceSplitButton.tsx` | 工作区分割按钮 |
| `frontend/src/app/components/WorkspaceRemoveConfirmDialog.tsx` | 「移出该工作区」确认对话框 |
| `frontend/src/hooks/useDragDropWorkspace.ts` | 工作区拖放 Hook |
| `frontend/src/shared/ipc/workspace.ts` | 工作区 IPC 接口定义 |
