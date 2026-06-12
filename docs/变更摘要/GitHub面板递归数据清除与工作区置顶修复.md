# GitHub 面板递归数据清除与工作区置顶修复

## 修复问题

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | `gitHubDeleteFolderDataRecursive` 忽略 `folderId` 参数，无条件清除全局 CI 数据 | 函数声明了参数但实现未使用；未先收集所有后代文件夹 ID | 先递归收集所有后代，再收集受影响的 workspace ID 集合，仅在 active 工作区匹配时清除 |
| 2 | `gitHubDeleteFolderConfigAndDataRecursive` 同样无条件清除全局 CI 数据 | 同上 | 同上，数据清除部分使用条件返回 |
| 3 | `isWorkspaceRoot` 节点的置顶菜单项 action 为空 `() => {}` | 工作区节点无 `folderId`，未实现对应 pin action | 新增 `gitHubPinWorkspace`/`gitHubUnpinWorkspace` 操作 `recentWorkspaces`；恢复菜单分支 |
| 4 | 工作区节点在树中无法通过置顶排序 | 树构建时 `workspaces.map` 未排序 | 新增 `sortWorkspacesByPinOrder`，按 `isPinned` + `pinnedOrder` 排序 |

## 新增功能

| 功能 | 说明 |
|------|------|
| 工作区置顶/取消置顶 | 所有目录类型（工作区根节点 + 文件夹）均支持置顶 |
| `activeCiFolderId` 状态跟踪 | 选择文件夹时记录，为后续 per-folder CI 数据铺路 |
| 工作区排序 | 工作区目录按置顶状态排序（置顶优先 → 按 `pinnedOrder` 升序） |

## 修改文件

| 文件 | 变更 |
|------|------|
| `stores/slices/githubSlice.ts` | +`activeCiFolderId` +`setActiveCiFolderId` +`gitHubPinWorkspace` +`gitHubUnpinWorkspace`；修复 `gitHubDeleteFolderDataRecursive` 和 `gitHubDeleteFolderConfigAndDataRecursive` |
| `features/github-tree/GitHubTreeEntry.tsx` | `isPinned` 支持 workspace；工作区置顶/取消置顶菜单；移除空 action |
| `features/github-tree/useGithubTreeData.ts` | +`sortWorkspacesByPinOrder`，应用于工作区节点排序 |
| `regions/right-panel/panels/communicate/GitHubPanel.tsx` | `handleSelectTreePath` 中设置/清除 `activeCiFolderId` |

## 更新文档

- `docs/知识沉淀/交互优化/github-folder-pin-and-delete-2026-06-12.md` — 完整重写，覆盖工作区置顶、递归数据清除作用域、activeCiFolderId
