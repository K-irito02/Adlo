# GitHub 目录置顶与数据清除优化

> 来源：2026-06-12 GitHub 面板目录菜单增强（三阶段：目录置顶 → 递归数据清除作用域修复 → 工作区置顶）
> 涉及：githubSlice、GitHubTreeEntry、useGithubTreeData、GitHubPanel

## 1. 置顶/取消置顶功能

### 1.1 适用范围

- 所有目录类型的**目录节点**均支持置顶/取消置顶：
  - 工作区目录的顶级目录（`nodeType === 'workspace'`）
  - 工作区目录的嵌套子目录（`nodeType === 'folder'`）
  - 非工作区目录的顶级目录（`nodeType === 'folder'`）
  - 非工作区目录的嵌套子目录（`nodeType === 'folder'`）
- 子文件节点（Overview/Workflows/Jobs/Logs）不支持置顶

### 1.2 约束

- 只能在同级别同分类内置顶/取消置顶，不能跨级别、不能跨分类
- 工作区目录互排，非工作区目录互排

### 1.3 实现

#### 文件夹置顶（`gitHubPinFolder` / `gitHubUnpinFolder`）

```typescript
gitHubPinFolder: (folderId) => {
  set((state) => {
    const folder = state.gitHubCiFolders.find((f) => f.id === folderId);
    if (!folder) return state;
    const siblings = state.gitHubCiFolders.filter(
      (f) => f.parentId === folder.parentId && f.parentType === folder.parentType
    );
    const maxPinnedOrder = Math.max(
      ...siblings.filter((s) => s.pinnedOrder !== undefined).map((s) => s.pinnedOrder!),
      0
    );
    return {
      gitHubCiFolders: state.gitHubCiFolders.map((f) =>
        f.id === folderId ? { ...f, pinnedOrder: maxPinnedOrder + 1 } : f
      ),
    };
  });
},
```

#### 工作区置顶（`gitHubPinWorkspace` / `gitHubUnpinWorkspace`）

```typescript
gitHubPinWorkspace: (workspaceId) => {
  set((state) => {
    const pinnedWorkspaces = state.recentWorkspaces.filter((w) => w.isPinned);
    const maxPinnedOrder = Math.max(...pinnedWorkspaces.map((w) => w.pinnedOrder ?? 0), 0);
    return {
      recentWorkspaces: state.recentWorkspaces.map((w) =>
        w.id === workspaceId ? { ...w, isPinned: true, pinnedOrder: maxPinnedOrder + 1 } : w
      ),
    };
  });
},
```

#### 排序函数

```typescript
function sortWorkspacesByPinOrder(workspaces: RecentWorkspaceEntry[]): RecentWorkspaceEntry[] {
  return [...workspaces].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (a.isPinned && b.isPinned) return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
    return 0;
  });
}
```

### 1.4 菜单入口（GitHubTreeEntry.tsx）

```typescript
if (node.nodeType === 'folder') {
  // gitHubPinFolder / gitHubUnpinFolder (基于 folderId)
} else if (node.nodeType === 'workspace') {
  // gitHubPinWorkspace / gitHubUnpinWorkspace (基于 workspaceId)
}
```

### 1.5 已知问题

**问题**：`isWorkspaceRoot` 节点的置顶菜单项 action 为空函数 `() => {}`
**根因**：早期代码中工作区节点没有对应的 pin action，且 `isPinned` 对非 folder 类型始终返回 `false`
**修复**：
1. 新增 `gitHubPinWorkspace` / `gitHubUnpinWorkspace` store action
2. 更新 `isPinned` 判断支持 workspace 节点
3. 恢复菜单中的工作区置顶/取消置顶分支

## 2. 递归数据清除作用域修复

### 2.1 问题描述

`gitHubDeleteFolderDataRecursive(folderId)` 和 `gitHubDeleteFolderConfigAndDataRecursive(folderId)` 存在两个问题：

1. **未收集所有后代**：只从目标文件夹向上遍历找到一个 workspace，而不是先收集所有后代文件夹 ID
2. **无条件全局清除**：只要找到的 workspace 匹配 `activeCiWorkspaceId` 就清除全局 CI 数据，未考虑后代文件夹可能关联到不同 workspace

### 2.2 修复方案

对齐 `gitHubDeleteFolderConfigRecursive` 的递归模式：

```typescript
gitHubDeleteFolderDataRecursive: (folderId) => {
  set((state) => {
    // 1. 先收集所有后代文件夹 ID
    const idsToDelete = new Set<string>([folderId]);
    const findDescendants = (parentId: string) => {
      for (const f of state.gitHubCiFolders) {
        if (f.parentId === parentId && !idsToDelete.has(f.id)) {
          idsToDelete.add(f.id);
          findDescendants(f.id);
        }
      }
    };
    findDescendants(folderId);

    // 2. 收集所有受影响的工作区 ID（去重）
    const affectedWorkspaceIds = new Set<string>();
    for (const id of idsToDelete) {
      let currentId: string | null = id;
      while (currentId) {
        const folder = state.gitHubCiFolders.find((f) => f.id === currentId);
        if (!folder) break;
        if (folder.parentType === 'workspace' && folder.parentId) {
          affectedWorkspaceIds.add(folder.parentId);
          break;
        }
        currentId = folder.parentId ?? null;
      }
    }

    // 3. 仅当文件夹无 workspace（传统模式）或 active 工作区受影响时才清除
    const shouldClear =
      affectedWorkspaceIds.size === 0 ||
      (state.activeCiWorkspaceId != null && affectedWorkspaceIds.has(state.activeCiWorkspaceId));
    if (shouldClear) {
      return { ciSnapshot: null, ciJobs: [], ciError: null };
    }
    return state;
  });
},
```

### 2.3 设计要点

| 层面 | 规则 |
|------|------|
| 后代收集 | 使用 `parentId` 链递归查找，与 `gitHubDeleteFolderConfigRecursive` 相同模式 |
| 工作区解析 | 每个后代向上遍历至 `parentType === 'workspace'` 的节点 |
| 清除决策 | `affectedWorkspaceIds.size === 0`（传统无工作区模式）或 `activeCiWorkspaceId` 在集合中 |
| 不变性 | 不匹配时不返回新对象，保持引用相等 |

## 3. activeCiFolderId 跟踪

### 3.1 新增状态

```typescript
interface GitHubSlice {
  /** Active CI folder ID (which folder's CI data is currently loaded) */
  activeCiFolderId: string | null;
  setActiveCiFolderId: (folderId: string | null) => void;
}
```

### 3.2 设置时机

在 `GitHubPanel.handleSelectTreePath` 中：

```typescript
if (path?.startsWith('github-workspace:')) {
  setActiveCiWorkspaceId(wsId);
  setActiveCiFolderId(null);        // 选择工作区时清除文件夹选择
} else if (path?.startsWith('github-folder:')) {
  setActiveCiFolderId(folderId);    // 选择文件夹时记录
}
```

### 3.3 用途

- 为后续可能的 per-folder CI 数据存储提供钩子
- 当前用于数据清除决策（结合 `activeCiWorkspaceId`）

## 4. 经验教训

### 4.1 函数参数被忽略

`gitHubDeleteFolderDataRecursive` 声明了 `(folderId: string)` 参数但实现为 `() =>`，完全忽略参数。TypeScript 不会捕获此问题（参数名可用任意名称，未使用不报错）。**必须通过代码审查或测试确保参数被使用。**

### 4.2 递归模式一致性

数据清除操作应和配置清除操作保持相同的递归模式（先收集后代 → 再处理数据），不可使用不同的遍历策略。

### 4.3 工作区与文件夹的关系

- 工作区节点（`nodeType === 'workspace'`）存储在 `recentWorkspaces`，使用 `isPinned`/`pinnedOrder` 字段
- 文件夹节点（`nodeType === 'folder'`）存储在 `gitHubCiFolders`，使用 `pinnedOrder` 字段（无 `isPinned` 布尔值）
- 两者操作 action 命名不同：`gitHubPinFolder` vs `gitHubPinWorkspace`

### 4.4 CI 数据为全局单例

当前架构中 `ciSnapshot`/`ciJobs`/`ciError` 为全局单例，任何工作区的 CI 数据都写入同一位置。`activeCiWorkspaceId` 决定当前显示哪个工作区的数据。如果未来需要 per-workspace CI 数据，需要改为 `Record<string, CiStatusSnapshot>` 等映射结构。

## 5. 相关文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/stores/slices/githubSlice.ts` | 添加 `activeCiFolderId`、`gitHubPinWorkspace`/`gitHubUnpinWorkspace`、修复两个递归数据清除 action |
| `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` | 更新 `isPinned` 支持 workspace、添加工作区置顶菜单、移除空 action 分支 |
| `frontend/src/app/features/github-tree/useGithubTreeData.ts` | 添加 `sortWorkspacesByPinOrder` 排序函数并应用于工作区节点 |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx` | 添加 `activeCiFolderId` 在树选择路径时设置/清除 |

## 6. 相关文档

- [GitHub 菜单递归删除与分组优化](./github-menu-recursive-delete-and-grouping-2026-06-12.md)
