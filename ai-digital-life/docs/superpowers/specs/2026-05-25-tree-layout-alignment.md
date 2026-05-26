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

---

## 后续恢复（2026-05-27）

### 问题

在实施上述优化后，"文档大纲"功能的样式被错误地影响了，包括：
- 层级缩进量从14px变为48px
- 折叠/展开按钮尺寸从20px变为16px
- 连接竖线位置不正确
- 按钮悬停效果消失

### 解决方案

**核心原则**：将文件树和文档大纲的样式完全隔离

#### 1. 恢复 OutlineTree.tsx

```typescript
// rowOffset 恢复为原来的值
rowOffset={((depth - 1) * 14) + 4}
```

#### 2. 恢复 files-panel.css 中的文档大纲样式

**子节点缩进**：
```css
.adl-tree-node__children,
.adl-filetree__children,
.adl-outline-tree__children {
  padding: 0 0 0 14px;  /* 恢复为14px */
}
```

**连接竖线位置**：
```css
.adl-tree-node::before {
  left: 13px;  /* 恢复为13px */
}
.adl-tree-root > .adl-tree-node::before {
  display: none;  /* 添加：隐藏根节点竖线 */
}
```

**按钮和缩进尺寸**：
```css
.adl-tree-node__toggle,
.adl-filetree__toggle,
.adl-outline-tree__toggle,
.adl-tree-node__indent,
.adl-filetree__indent,
.adl-outline-tree__indent {
  width: 20px;
  height: 20px;
  margin-top: 1px;
}
```

**行对齐方式**：
```css
.adl-tree-node__row {
  align-items: flex-start;  /* 恢复为flex-start */
}
```

**按钮悬停效果**：
```css
.adl-outline-tree__toggle:hover {
  background: color-mix(in srgb, var(--surface-hover) 88%, transparent);
  color: var(--text-primary);
}
```

#### 3. 保留文件树的优化样式

```css
/* 文件节点：隐藏连接竖线 */
.adl-filetree__node--file::before {
  display: none;
}

/* 文件节点：icon模拟展开按钮位置 */
.adl-filetree__node--file > .adl-tree-node__row > .adl-tree-node__icon-before {
  width: 16px !important;
  height: 16px;
  margin-left: 6px;
  margin-right: 2px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

### 最终效果

- ✅ **文件树**：保持优化效果（文件节点无连线、logo与父文件夹名称对齐）
- ✅ **文档大纲**：恢复到63c4579版本效果（层级缩进14px、按钮20px、悬停效果正常）
- ✅ **样式隔离**：两种树组件的样式完全独立，互不影响

### 经验教训

1. **模块化CSS**：不同功能模块应有独立的样式文件或明确的类名前缀
2. **样式隔离**：共享组件应避免样式耦合，建议使用CSS Modules
3. **版本回滚**：重要样式变更前应记录当前状态，便于快速回滚
4. **双端验证**：同时检查Tauri桌面和浏览器模式
