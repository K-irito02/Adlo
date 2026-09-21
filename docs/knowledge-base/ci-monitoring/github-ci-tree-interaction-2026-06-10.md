# GitHub CI 树形目录交互重构经验

> 来源：2026-06-10 GitHub 子功能面板树形目录交互重构
> 涉及：GitHubTreeEntry 重写、FileTree 集成、按钮规范、图标恢复、RenameDialog 标准化

## 1. FileTree 替代递归自渲染

### 变更

| 维度 | 改前 | 改后 |
|------|------|------|
| 子条目渲染 | 递归 `GitHubTreeEntry` + 叶子条目 JSX | `FileTree<GitHubTreeNode>` 统一渲染 |
| 连接线 | 无（缩进区分层级） | FileTree → TreeNodeRow CSS 伪元素（├ └） |
| 悬停操作 | 叶子条目直接渲染 | `renderMeta` 回调 + `adl-browser-node__actions` |
| 子条目图标 | `SUB_ENTRY_ICONS` 常量（SVG） | `renderIconBefore` 回调 |

### 回调函数

| 回调 | 用途 |
|------|------|
| `renderChildCount` | 目录显示 `children.length`，文件显示 `undefined` |
| `renderChildMeta` | 目录悬停显示操作按钮（删除 + 设置） |
| `renderSubEntryIcon` (`renderIconBefore`) | 文件子条目显示 SVG 图标，目录显示 DIR 徽章 |
| `handleChildContextMenu` (`getContextMenuItems`) | 右键菜单（删除 + 重命名） |

### 全局点击处理

```typescript
// 浏览器 click 处理模式：.adl-browser-entry 内点击 .adl-filetree__row → 提取 data-path 选中
useEffect(() => {
  const handleGlobalClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const clickedEntry = target.closest('.adl-browser-entry');
    const clickedFileTreeRow = target.closest('.adl-filetree__row');
    if (clickedEntry) {
      if (clickedFileTreeRow) {
        const nodePath = (clickedFileTreeRow as HTMLElement).dataset.path;
        if (nodePath) { handleSelectTreePath(nodePath); return; }
      }
      return;
    }
    handleSelectTreePath(null);
  };
  document.addEventListener('click', handleGlobalClick);
  return () => document.removeEventListener('click', handleGlobalClick);
}, [handleSelectTreePath]);
```

- **关键**：`handleSelectTreePath` 必须用 `useCallback` 定义在 `useEffect` **之前**，否则 TS 报「used before declaration」
- `.adl-filetree__row` 的 `data-path` 属性由 FileTree 的 TreeNodeRow 自动设置

## 2. 按钮顺序与提示词规范

所有目录悬停操作按钮必须遵守：

| 规则 | 说明 |
|------|------|
| 顺序 | IconTrash（删除） → IconSettings（设置） |
| 删除 tooltip | 固定为 "删除CI配置及数据"，不区分工作区目录/非工作区目录 |
| 设置 tooltip | 固定为 "设置" |
| 右键菜单 | 删除菜单项 → 重命名菜单项 |

### 位置 CSS

```css
/* 顶级目录操作按钮 */
.adl-browser-entry__actions {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
}

/* 子目录操作按钮（FileTree meta）必须使用相同定位 */
.adl-browser-entry__tree .adl-filetree__meta.adl-tree-node__meta--inline {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
}
```

## 3. renderIconBefore 属性

FileTree 新增 `renderIconBefore` 可选的 prop，用于自定义文件节点的前导图标：

```typescript
// FileTreeProps
renderIconBefore?: (node: T) => React.ReactNode;

// 使用：优先使用自定义图标，否则回退到默认文件徽章
iconBefore={
  isDirectory ? undefined : customIconBefore ? (
    customIconBefore
  ) : (
    <span className="adl-filetree__file-icon ...">
      <span className="adl-filetree__file-badge">...</span>
    </span>
  )
}
```

- **自定义图标容器**额外占用 `TreeNodeRow` 的 `iconBefore` 槽位（替代 toggle/indent），需设置 `width: 16px; height: 16px`
- 添加 `renderIconBefore` 时需要同步更新 `areFileTreeNodePropsEqual` 的比对

## 4. RenameDialog 标准化

### 规范

- **禁止**使用 `window.prompt` 进行重命名（原生弹窗不符合主题系统）
- 必须使用项目内 `RenameDialog` 组件
- 命名规范：文件名后缀固定为 `-2026-06-10`

### 实现模式

```typescript
const [renameFolderState, setRenameFolderState] = useState<{
  folderId: string; folderName: string;
} | null>(null);

const handleStartRename = useCallback((folderId: string, folderName: string) => {
  setRenameFolderState({ folderId, folderName });
}, []);

const handleConfirmRename = useCallback((newName: string) => {
  if (renameFolderState) {
    gitHubRenameFolder(renameFolderState.folderId, newName);
    setRenameFolderState(null);
  }
}, [renameFolderState, gitHubRenameFolder]);

// JSX 底部
<RenameDialog
  open={!!renameFolderState}
  initialValue={renameFolderState?.folderName ?? ''}
  title="重命名目录"
  onConfirm={handleConfirmRename}
  onCancel={() => setRenameFolderState(null)}
/>
```

### 交互行为

- 工作区目录下的嵌套目录「设置」→ 打开工作区设置弹窗（`callbacks.onOpenSettings(workspaceId)`）
- 非工作区目录下的目录「设置」→ 打开 RenameDialog 重命名

## 5. 相关文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` | 重写为 FileTree + RenameDialog |
| `frontend/src/app/features/file-tree/fileTree.tsx` | 新增 `renderIconBefore` prop |
| `frontend/src/app/features/file-tree/fileTree.utils.ts` | 新增 `renderIconBefore` 类型定义 |
| `frontend/src/styles/regions/rightpanel/browser-panel.css` | FileTree meta 定位 + `.adl-github-entry__icon` |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx` | 全局点击处理器更新 |

## 6. 相关文档

- [CI → 通信面板重构 + 日志查看器经验](./ci-to-communication-refactor-and-log-viewer-2026-06-10.md)
- [CI 状态监控模块经验](./ci-module-lessons-2026-06-09.md)
- [重命名弹窗交互标准化](../../knowledge-base/interaction/rename-dialog-standardization-2026-06-08.md)
