# 右键菜单跟随鼠标位置修复

## 问题

在"浏览器"、"文件"、"变更"、"终端"四个功能面板中，右键菜单定位方式存在以下问题：

1. **浏览器目录树**：顶级目录和子目录完全不支持右键弹出菜单（`onContextMenu` 未绑定）
2. **文件/变更/终端的工作区条目**：右键菜单使用 `getBoundingClientRect()` 锚定在元素右侧，不跟随鼠标光标

## 改动

| 文件 | 改动 |
|------|------|
| `features/browser-tree/BrowserTreeEntry.tsx` | 新增 `handleHeaderContextMenu`（顶级目录）+ `getContextMenuItems`（子目录/后代子目录） |
| `features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` | `getBoundingClientRect()` → `e.clientX` / `e.clientY` |
| `features/workspace-changes-tree/WorkspaceChangesEntry.tsx` | 同上 |
| `features/workspace-terminal/WorkspaceTerminalEntry.tsx` | 同上 + 移除 `isIndependent` 条件守卫使独立终端也支持右键 |

## 经验教训

1. **右键菜单定位应使用 `event.clientX`/`event.clientY`，而非 `getBoundingClientRect()`**。前者跟随鼠标指针位置，符合用户预期；后者锚定到元素边缘，在目录名称区域较大时体验不佳。

2. **`FileTree` 组件内置了右键菜单支持**（通过 `getContextMenuItems` prop + `handleShowContextMenu` + `ContextMenu` 组件），使用 `FileTree` 时应优先利用此机制而非自行实现菜单。

3. **`BrowserTreeEntry` 使用 `FileTree` 渲染子节点**，但此前未传入 `getContextMenuItems`，导致子节点/后代节点缺少右键支持。所有使用 `FileTree` 的地方都应考虑传入此 prop。

4. **条件守卫（如 `isIndependent ? undefined : handler`）易成为遗漏点**。当组件支持点击触发的菜单时，右键应默认一致支持，除非有明确的产品理由禁用。
