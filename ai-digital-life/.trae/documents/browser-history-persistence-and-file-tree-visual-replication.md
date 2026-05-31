# 浏览器功能修复与优化计划

## 概要

两个任务：① 修复清除缓存后"历史目录"下"历史记录"头部行消失的问题；② 将浏览器面板中子目录和标签的视觉样式复刻为文件树的层级结构样式。

---

## 任务一：历史记录头部行常驻显示

### 当前状态分析

`MultiWorkspaceContainer.tsx` 中，"历史目录"分类的整个渲染块（含"历史记录"头部行）被 `{browserHistory.length > 0 ? ... : null}` 条件包裹。清除浏览器缓存后，localStorage 中 `adl-ui:browser-history` 不存在，`browserHistory` 为 `[]`，导致整个"历史目录"分类消失。

第 38 行的早期返回也有同样问题：
```tsx
if (visibleWorkspaces.length === 0 && tabFolders.length === 0 && browserHistory.length === 0) {
  return null;
}
```

### 改动文件

**`frontend/src/app/features/multi-workspace/MultiWorkspaceContainer.tsx`**

| 行号 | 改动 | 说明 |
|------|------|------|
| L38-40 | 移除 `&& browserHistory.length === 0` | "历史记录"头部行始终渲染，不依赖数据 |
| L82 | `{browserHistory.length > 0 ? (` → `{true ? (` | 始终显示"历史目录"分类标签和头部行 |
| L125-144 | 调整 conditional 嵌套 | 头部行（L90-124）始终显示，仅历史内容部分（L125-139）随 `browserHistory.length > 0` 显示 |

### 效果
- 清除缓存后，"历史目录"分类标签和"历史记录"头部行常驻可见
- 有历史数据时展开显示内容，无数据时只显示头部行

---

## 任务二：浏览器面板文件树视觉复刻

### 当前状态分析

当前浏览器面板的树形结构已部分具备连接线元素：
- `.adl-multitree--browser .adl-multitree-entry__tree::before` — 树区域左侧竖线
- `.adl-tab-folder-tree-entry` 在 JSX 中使用 `adl-multitree-entry__indent`/`adl-multitree-entry__indent-line`，但 **CSS 中没有这两个类的定义**，实际不生效
- `.adl-multitree--browser .adl-tool-list__item--terminal-tab::before` — 标签页有竖线

文件树（file-tree.css）完整实现了：
1. **每节点连接竖线**：`.adl-tree-node::before`（`left: 13px`, `width: 1px`, `top: 0`, `bottom: 0`）
2. **全宽悬停**：`--adl-filetree-hover-offset` CSS 变量 + `width: calc(100% + var(--adl-filetree-hover-offset))`
3. **子节点缩进**：`.adl-tree-node__children` `padding-left: 14px`
4. **状态优先级**：选中 > 上下文目标 > 悬停

浏览器现有 TabFolderTreeEntry 结构：
```
adl-multitree-entry adl-tab-folder-tree-entry
  ├── adl-multitree-entry__header
  │   ├── adl-multitree-entry__indent (depth>0时) + indent-line ← CSS缺失
  │   ├── adl-multitree-entry__expand (chevron/folder toggle)
  │   ├── adl-multitree-entry__namezone (name + count + actions)
  ├── adl-multitree-entry__tree (展开时)
  │   ├── TabFolderTreeEntry (递归子目录)
  │   ├── BrowserTabBar (标签)
  │   └── empty state
```

### 改动文件

共修改 **2 个文件**，无需新建文件。

#### 1. `frontend/src/styles/regions/rightpanel/browser-panel.css`

新增以下 CSS 规则（按出现顺序）：

**A. 子目录节点的连接竖线**（替换现有的非功能 indent 逻辑）

```css
/* TabFolderTreeEntry 每节点的连接竖线 */
.adl-tab-folder-tree-entry::before {
  content: "";
  position: absolute;
  left: 13px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--border) 78%, transparent);
  pointer-events: none;
}

/* 根目录（depth=0）不显示竖线（由父级树区域竖线覆盖） */
.adl-tab-folder-tree-entry[data-depth="0"]::before {
  display: none;
}

/* 最后一个兄弟节点截断竖线 */
.adl-tab-folder-tree-entry:last-child::before {
  bottom: 50%;
}
```

**B. namezone 全宽悬停效果**（模仿文件树）

```css
/* TabFolderTreeEntry namezone 添加全宽悬停 */
.adl-tab-folder-tree-entry .adl-multitree-entry__namezone {
  padding-inline-start: 28px;  /* 补偿 indentation 偏移 */
  margin-inline-start: -28px;
}

.adl-tab-folder-tree-entry .adl-multitree-entry__namezone:hover {
  background: transparent;
}

/* Header 行悬停效果 */
.adl-tab-folder-tree-entry .adl-multitree-entry__header:hover {
  background: var(--surface-hover);
}
```

**C. 缩进竖线的 CSS 定义**（为现有的 indent-line 类提供样式）

```css
/* 缩进容器 — 替换已存在但无 CSS 的 adl-multitree-entry__indent */
.adl-tab-folder-tree-entry .adl-multitree-entry__indent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(var(--depth, 1) * 20px + 13px);
  pointer-events: none;
  z-index: 0;
}

.adl-tab-folder-tree-entry .adl-multitree-entry__indent-line {
  position: absolute;
  /* 每条缩进线对应一个深度层级 */
  /* 由内联样式或子元素实现 */
}
```

**D. workspace 下 tree 区域的连接线优化**

```css
/* 工作区目录下 tree 区域的竖线从 header 下方开始 */
.adl-multitree--browser .adl-multitree-entry__tree::before {
  top: 0;  /* 保持不变 */
}
```

**E. 标签页（BrowserTabBar）的树节点样式**

```css
/* 标签页作为叶子节点样式（无 toggle，有竖线） */
.adl-multitree--browser .adl-tool-list__item--terminal-tab {
  padding-left: 28px !important;  /* 增加缩进深度 */
}
```

#### 2. `frontend/src/app/features/workspace-browser/TabFolderTreeEntry.tsx`

**A. 添加 `data-depth` 属性**（连接 CSS 选择器）

在第 187 行的 `<div>` 上：
```tsx
<div
  className="adl-multitree-entry adl-tab-folder-tree-entry"
  data-depth={depth}  // ← 新增
  onMouseEnter={() => setIsHovering(true)}
  onMouseLeave={() => setIsHovering(false)}
>
```

**B. 优化 indent 渲染逻辑**

将现有 indent 块（L193-201）改为使用 CSS 驱动的方式。移除无实际渲染效果的 JS 计算，交由 CSS `calc()` 处理。

**C. WorkspaceBrowserEntry 树内容区域优化**

`WorkspaceBrowserEntry.tsx` 中的 `adl-multitree-entry__tree` 已通过 CSS 获取竖线，无需改动。但需要确保子目录和标签的缩进一致。

### 实现后的视觉效果

对于"自建目录"下的目录树：

```
工作区目录 ─┐
            ├─ 子目录 A ──┐
            │             ├─ 子目录 A1
            │             ├─ 子目录 A2
            │             └─ [标签...]
            ├─ 子目录 B
            └─ [标签...]
```

- 每个节点左侧有连接竖线（类比文件树）
- 最后一个兄弟节点的竖线截断
- 悬停时行背景高亮（全宽效果）
- 子节点缩进带水平连接线

---

## 验证步骤

1. **启动 dev server**：`npm run dev`
2. **清理浏览器缓存**：打开 Trae 内置浏览器 DevTools → Application → Clear storage
3. **验证任务一**：
   - 访问浏览器面板，确认"历史目录"分类和"历史记录"头部行始终显示
   - 浏览几个网页后，确认历史内容正确显示在展开状态
4. **验证任务二**：
   - 在工作区目录下创建子目录，确认连接竖线正确显示
   - 在自建目录下创建多层嵌套子目录，确认缩进线和连接线正确
   - 确认鼠标悬停时整行高亮
   - 确认操作按钮（创建标签/删除等）正常可用
5. **回归验证**：确认终端功能、文件树功能不受影响

---

## 注意事项

- 浏览器样式修改集中在 `browser-panel.css`，不修改 `file-tree.css`
- 不改变任何 JS 业务逻辑，仅 CSS + 少量 JSX 属性
- `TabFolderTreeEntry` 的折叠/展开/创建/删除等回调保持不变
