# 层级树布局对齐优化

## 目标

修复文件树和文档大纲的层级连接竖线与图标对齐问题，同时实现子节点与父节点的首字符对齐。

## 当前状态

- 竖线 `::before` 在 `<li>` 上，`left: 9px`（通用树）/ `left: 10px`（文件树）
- 子节点容器 `padding-left: 20px`
- 顶节点竖线已显示（之前的修改已移除 `.adl-tree-root > .adl-tree-node::before { display: none; }`）
- 文件 logo（badge）在 `labelLeading` prop 中，渲染在 label 按钮内部

## 改动项

### 1. CSS：竖线位置微调

**文件**：`frontend/src/styles/regions/rightpanel/files-panel.css`

- `.adl-tree-node::before { left: 9px → 10px }` — 让竖线穿过图标水平中心（20px 宽的图标，中心在 10px）
- 不需要动 `.adl-filetree__item::before`，当前已是 `left: 10px`

### 2. CSS：子容器缩进调整

**文件**：`frontend/src/styles/regions/rightpanel/files-panel.css`

- `.adl-tree-node__children { padding-left: 20px → 22px }`
- 22px = 文件树 row 的 `padding-left: 8px` + 图标宽度 `20px` - 2px 修正 = 子节点图标/文件 logo 对齐父节点首字符

### 3. JS：TreeNodeRow 新增 `iconBefore` prop

**文件**：`frontend/src/app/features/file-tree/TreeNodeRow.tsx`

- 新增可选 prop `iconBefore?: React.ReactNode`
- 渲染逻辑改为三路选择：
  - `hasChildren` → 渲染 toggle 按钮（不变）
  - `!hasChildren && iconBefore` → 渲染 iconBefore 容器（与 indent 同级）
  - `!hasChildren && !iconBefore` → 渲染 indent 占位符（不变）

### 4. JS：fileTree 传入 iconBefore

**文件**：`frontend/src/app/features/file-tree/fileTree.tsx`

- 将文件节点的 `labelLeading`（文件 badge）移到新的 `iconBefore` prop
- 文件节点不再使用 `labelLeading`（从 label 内部移到外部）
- 文件夹节点不受影响

### 5. CSS：iconBefore 容器样式

**文件**：`frontend/src/styles/regions/rightpanel/files-panel.css`

- 新增 `.adl-tree-node__icon-before` 规则，与 `.adl-tree-node__indent` 同尺寸（20x20）
- 文件 badge 当前已有 `20px` 宽度，但外层 `<span>` 的 `display: inline-flex` 需调整为 `flex` 以确保在 row 的 flex 布局中正确排列

### 不改动

- OutlineTree.tsx — 大纲树无文件 logo，不需要 iconBefore
- fileTree 的 memo 比较函数 — iconBefore 从 node 数据派生，无需额外比较
- ARIA tree 语义
- 悬停高亮逻辑和 CSS
- TreeNodeRow 的其他 props

## 效果确认

- 竖线穿过所有层级图标水平中心（10px 位置）
- 子节点的 toggle/文件logo 对齐父节点的首字符
- 同级下文件 logo 与文件夹 toggle 处于同一垂直列（均为 row 内第一个元素）
- 顶节点显示竖线
