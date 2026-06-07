# 变更面板文件行对齐优化

> 日期：2026-06-07
> 来源：变更面板 UI 优化

## 问题描述

变更面板中，文件右侧的"变更字母类型（A/D/M）+ 变更统计数字"区域存在对齐和间距问题：
1. 变更统计数字与变更字母类型之间的间距过大
2. 整个区域位置需要微调

## 解决方案

### 1. 组件结构调整

**ChangesPanel.tsx**：
- 将 `renderNavigatorMeta` 拆分为两个独立的回调函数
  - `renderNavigatorMeta`：渲染变更统计数字（文件数或已审查/总 hunk 数）
  - `renderNavigatorCount`：渲染变更字母类型（A/D/M 标签）

### 2. Props 传递链

为了支持独立渲染统计和类型，修改了以下组件的 props 传递：

| 组件 | 修改内容 |
|------|---------|
| ChangesPanel.tsx | 新增 `renderNavigatorCount` 回调 |
| ChangesTreePanel.tsx | 添加 `renderCount` 到 TreeCallbacks 接口 |
| MultiWorkspaceChangesTree.tsx | 添加 `renderCount` prop 并传递给 WorkspaceChangesEntry |
| WorkspaceChangesEntry.tsx | 接收并传递 `renderCount` 到 FileTree |
| FileTree.tsx | 已支持 `renderCount` 回调 |
| TreeNodeRow.tsx | 调整渲染顺序，meta 在前，count 在后 |

### 3. CSS 样式调整

**file-tree.css** 中的关键样式：

```css
/* 文件行容器 */
.adl-filetree__row {
  padding-inline-end: 7px;  /* 右边缘间距 7px */
}

/* 元数据和统计容器 */
.adl-tree-node__meta,
.adl-filetree__meta {
  gap: 2px;  /* 元素间距 2px */
  padding-right: 0;
}

/* 统计数字 */
.adl-tree-node__count,
.adl-filetree__count {
  margin-left: 0;  /* 移除额外左边距 */
}

/* Badge 样式 */
.adl-filetree__status-badge,
.adl-filetree__count-badge {
  min-width: 18px;
  padding: 0 5px;
}
```

## 经验教训

### 1. CSS Flexbox 布局理解

- **`gap` 属性**：定义 flex 子元素之间的间距，优先级高于 `margin`
- **`margin-left: auto`**：在 flex 容器中使用 `margin-left: auto` 可以将元素推到右侧，但会导致元素右边缘对齐而非内容对齐
- **`padding-inline-end`**：控制元素右侧内边距，影响内容与容器边缘的距离

### 2. 组件 Props 设计

- **单一职责**：将 `renderMeta` 拆分为 `renderMeta` 和 `renderCount`，让每个回调只负责一种内容的渲染
- **Props 链传递**：需要确保每一层组件都正确传递新的 props，直到目标组件

### 3. 用户体验细节

- **间距微调**：在 UI 优化中，1-2px 的调整都可能产生明显的视觉差异
- **背景效果**：用户希望保持 badge 背景效果，但需要合理控制间距

## 相关文件

### 修改的文件

| 文件路径 | 修改内容 |
|---------|---------|
| `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` | 新增 renderNavigatorCount，交换 meta/count 内容 |
| `frontend/src/app/regions/right-panel/panels/ChangesTreePanel.tsx` | 添加 renderCount 到 TreeCallbacks 接口 |
| `frontend/src/app/features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx` | 添加 renderCount prop |
| `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` | 接收并传递 renderCount |
| `frontend/src/app/features/file-tree/TreeNodeRow.tsx` | 调整 meta/count 渲染顺序 |
| `frontend/src/styles/regions/rightpanel/file-tree.css` | 调整样式间距 |

## 关键选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-filetree__row` | 文件树行容器 |
| `.adl-filetree__meta` | 元数据容器（变更字母类型） |
| `.adl-filetree__count` | 统计数字容器 |
| `.adl-filetree__status-badge` | 变更字母类型 badge |
| `.adl-multitree-entry__count` | 顶级目录变更统计 |
