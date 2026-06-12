# GitHub 目录置顶与删除功能优化

> 来源：2026-06-12 GitHub 面板目录菜单增强
> 涉及：githubSlice、GitHubTreeEntry、useGithubTreeData、MenuHintItem

## 1. 功能需求

### 1.1 置顶/取消置顶功能

- **适用范围**：所有目录类型
  - 工作区目录的顶级目录（一级目录）
  - 工作区目录的嵌套子目录
  - 非工作区目录的顶级目录
  - 非工作区目录的嵌套子目录
- **约束**：
  - 只能在同级别目录范围内进行置顶/取消置顶，不能跨级别
  - 不能跨分类（工作区目录和非工作区目录各自独立）

### 1.2 删除目录功能

- **适用范围**：
  - 工作区目录的嵌套子目录
  - 非工作区目录的顶级目录
  - 非工作区目录的嵌套子目录
- **功能说明**：删除目录会删除所有嵌套子目录以及自身目录，并且会删除所有 CI 配置及数据
- **UI 要求**：菜单选项最右侧添加 "!" 符号，鼠标悬停时显示详细解释（参考 MenuHintItem 组件）

## 2. 实现方案

### 2.1 状态扩展（githubSlice.ts）

```typescript
// GitHubCiFolderState 新增字段
interface GitHubCiFolderState {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string;
  parentType?: 'workspace' | 'folder';
  ciConfig?: GitWorkspaceCiConfig;
  /** Pin order within siblings (smaller number = higher priority, undefined = not pinned) */
  pinnedOrder?: number;
}

// GitHubSlice 新增方法
gitHubPinFolder: (folderId: string) => void;
gitHubUnpinFolder: (folderId: string) => void;
```

### 2.2 目录排序（useGithubTreeData.ts）

每个父目录下的子目录独立排序：

```typescript
function sortFoldersByPinOrder(folders: GitHubCiFolderState[]): GitHubCiFolderState[] {
  return [...folders].sort((a, b) => {
    const aPinned = a.pinnedOrder !== undefined;
    const bPinned = b.pinnedOrder !== undefined;
    if (aPinned && !bPinned) return -1;  // 置顶优先
    if (!aPinned && bPinned) return 1;
    if (aPinned && bPinned) return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);  // 按顺序
    return a.createdAt - b.createdAt;  // 非置顶按创建时间
  });
}
```

### 2.3 菜单逻辑（GitHubTreeEntry.tsx）

#### 置顶/取消置顶显示条件

```typescript
// 工作区顶级目录
const isWorkspaceRoot = categoryType === 'ci-workspace' && node.nodeType === 'workspace';
// 目录类型（用于嵌套子目录）
const isFolder = node.nodeType === 'folder';

// 显示置顶/取消置顶
if (isFolder || isWorkspaceRoot) {
  // ... 添加置顶/取消置顶菜单项
}
```

#### 删除目录显示条件

```typescript
// 工作区目录的嵌套子目录
const isWorkspaceChild = childNode.nodeType === 'folder' && !!node.workspaceId;
// 非工作区目录的嵌套子目录
const isUserFolderChild = childNode.nodeType === 'folder' && !node.workspaceId && childNode.path.includes('/');
// 非工作区目录的顶级目录
const isUserFolderRoot = childNode.nodeType === 'folder' && !node.workspaceId && !childNode.path.includes('/');

// 显示删除目录
const showDeleteFolder: boolean = isWorkspaceChild || isUserFolderChild || isUserFolderRoot;
```

## 3. MenuHintItem 组件优化

### 问题

原组件依赖固定的菜单 ID `github-delete-all-menu`，无法适配动态生成的菜单。

### 解决方案

新增可选的 `menuId` 属性，并增加降级查找逻辑：

```typescript
interface MenuHintItemProps {
  label: string;
  hint: string;
  onClick: () => void;
  menuId?: string;  // 新增
}

// 查找菜单的降级逻辑
let menuCard: HTMLElement | null = null;
if (menuId) {
  menuCard = document.querySelector(`[data-menu-id="${menuId}"]`);
}
if (!menuCard) {
  menuCard = document.querySelector('[data-menu-id="github-delete-all-menu"]');
}
if (!menuCard) {
  menuCard = document.querySelector('[data-menu-id^="github-"]');
}
```

## 4. 经验教训

### 4.1 类型收窄问题

**问题**：TypeScript 无法正确推断 `isNestedFolder || isUserFolderRoot` 的类型。

**原因**：逻辑与表达式的结果类型是 `string | boolean`，需要显式收窄为 `boolean`。

**解决**：
```typescript
const isNestedFolder = childNode.nodeType === 'folder' && !!node.workspaceId;
const isUserFolderRoot = childNode.nodeType === 'folder' && !node.workspaceId;
const showDeleteFolder: boolean = isNestedFolder || isUserFolderRoot;
```

### 4.2 嵌套子目录识别

**问题**：非工作区目录的顶级目录和嵌套子目录无法通过单一条件区分。

**解决**：通过路径中是否包含 `/` 来判断：
- 包含 `/`：嵌套子目录
- 不包含 `/`：顶级目录

### 4.3 MenuHintItem 适配

**问题**：MenuHintItem 组件原本只支持固定菜单 ID。

**解决**：增加 `menuId` 可选参数，并提供降级查找策略。

## 5. 相关文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/stores/slices/githubSlice.ts` | 添加 `pinnedOrder` 字段和置顶相关 action |
| `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` | 添加置顶/取消置顶和删除目录菜单项 |
| `frontend/src/app/features/github-tree/useGithubTreeData.ts` | 添加 `sortFoldersByPinOrder` 排序函数 |
| `frontend/src/app/regions/right-panel/panels/communicate/MenuHintItem.tsx` | 添加 `menuId` 属性和降级查找 |

## 6. 相关文档

- [GitHub 菜单递归删除与分组优化](./github-menu-recursive-delete-and-grouping-2026-06-12.md)
- [GitHub CI 树形目录交互重构](./CI监控/github-ci-tree-interaction-2026-06-10.md)
