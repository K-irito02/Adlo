# 虚拟化文件树垂直连接线与悬停高亮修复

## 问题

文件树迁移到虚拟化扁平列表后出现两个缺陷：

1. **垂直连接线缺失**：展开目录后，其子项之间没有纵向竖线连接。无论嵌套多深，缩进始终只显示两层效果。
2. **悬停高亮不传播**：鼠标悬停目录 A 时，只有 A 自身的展开/折叠图标高亮，A 的所有嵌套子目录的图标保持原样。

## 根因

### 1. `::before` 高度受限于扁平 `<li>`

**旧递归树**：每个 `<li>` 通过嵌套 `<ul>` 包含其子节点。`::before { top: 0; bottom: 0 }` 天然从父行延伸到最后一个子项底部——连续树干线。

**新虚拟化列表**：每个 `<li>` 变为 `position: absolute; height: 28px`，不再有嵌套结构。`::before` 的 `top: 0; bottom: 0` 仅限于 28px 单行高度，无法跨越多个条目。

### 2. 缩进公式被抵消

旧树的缩进由嵌套 `<ul>` 的 `padding-left: 14px` 累加实现。新树的 `padding-inline-start` 使用 `--adl-filetree-hover-offset` 公式：`-offset + 8 + offset = 8`，导致缩进恒为 8px，与 `depth` 无关。

### 3. 数据竞争：`files-panel.css` 覆盖核心规则

`files-panel.css` 中存有 `file-tree.css` 的旧版副本（`left: 18px` 硬编码），因其加载顺序靠后，覆盖了正确的变量化规则（`left: calc(18px + var(--adl-tree-indent, 0px))`）。

### 4. 父级悬停不传播

CSS 选择器 `.adl-tree-node__row:hover ~ .adl-tree-node__children .adl-tree-node__toggle` 依赖 `~` 兄弟组合器，仅在旧递归树结构（子 `<ul>` 跟在 `<div>` 后面作为兄弟）下有效。虚拟化树中所有节点均为同级 `<li>`，该选择器不再匹配。

## 解决方案

### 修复一：引入 `--adl-tree-indent` CSS 变量

在 `TreeNodeRow.tsx` 的 `<li>` 上设置 `--adl-tree-indent: (depth - 1) * 14px`。所有需要深度感知的位置（`::before` 的 `left`、行 `padding`）都以此为基线计算，替代硬编码值。

### 修复二：`::before` 溢出实现树干线

将 `::before` 从 `top: 0; bottom: 0`（受限于 28px `<li>`）改为 `height: var(--adl-trunk-height, 28px); bottom: auto`。在 `fileTree.tsx` 中为每个展开的目录计算可见子项数 × 28px 的树干高度，通过 `--adl-trunk-height` 注入。`::before` 溢出 `<li>` 边界，在下方子项区域形成连续竖线。

```
计算逻辑（trunkHeightMap）：
  for each 展开目录 at index i with depth d:
    从 i+1 向后扫描，直到遇到 depth ≤ d 的项
    descendantCount = 扫描到的项数
    trunkHeight = (descendantCount + 1) × 28px
```

### 修复三：悬停阴影传播

在 `fileTree.tsx` 中计算 `hoveredDescendantPaths`——从悬停节点向后扫描 `flatNodes`，收集所有深度大于悬停节点深度的路径。子项获得 `is-hovered-by-ancestor` CSS 类，触发 `.adl-filetree__item.is-hovered-by-ancestor .adl-filetree__toggle { color: var(--text-primary); }`。

```
计算逻辑（hoveredDescendantPaths）：
  找到悬停节点在 flatNodes 中的索引
  从下一项开始收集，直到遇到 depth ≤ 悬停节点 depth 的项
  这些项的 toggle 图标同步高亮
```

### 修复四：同步 `files-panel.css`

将 `files-panel.css` 中关键的 4 条覆盖规则更新为与 `file-tree.css` 一致的变量化版本：
- `.adl-tree-node::before { left: calc(13px + var(--adl-tree-indent)); }`
- `.adl-filetree__item::before { left: calc(18px + var(--adl-tree-indent)); height: var(--adl-trunk-height, 28px); bottom: auto; }`
- `.adl-filetree__row { padding-inline-start: calc(8px + var(--adl-filetree-hover-offset) + var(--adl-tree-indent)); }`
- `.adl-outline-tree__row { padding-inline-start: calc(8px + var(--adl-filetree-hover-offset) + var(--adl-tree-indent)); }`

### 修复五：移除根层级 `::before` 隐藏规则

删除 `.adl-tree-root > .adl-tree-node::before { display: none; }`。根层级（data-depth=1）的展开目录现在也能显示树干线。

### 还原：文档大纲树

文档大纲使用递归渲染（子 `<li>` 包含在父 `<li>` 内），其 `::before { top: 0; bottom: 0; }` 天然正确，不需要变量化改造。将所有大纲树相关 CSS 还原至原始状态（`outline-panel.css` 恢复固定 `left: 13px` 和根层级隐藏规则；`file-tree.css` 恢复 `left: 20px !important` 子项覆盖；`files-panel.css` 同步还原）。

## 关键认知

### 1. `::before` 溢出条件

`position: absolute` 的 `::before` 可以超出父元素边界，前提是父元素没有 `overflow: hidden`。虚拟化 `<li>` 的 `overflow` 默认为 `visible`，这是溢出方案可行的关键。

### 2. `position: absolute` 元素在 Flex 容器中的 Gap

当 `<ul>` 是 `display: flex; gap: 1px` 但子项为 `position: absolute` 时，子项脱离 flex 流，`gap` 不生效。子项由 `top: index * 28` 精确堆叠，无间距。这使树干线高度计算简化为 `count * 28`。

### 3. CSS 变量优先级与覆盖

`files-panel.css` 的选择器与 `file-tree.css` 完全相同，由于加载顺序靠后（CSS 文件中出现更晚），优先级相等时覆盖前者。这意味着所有树相关的核心样式必须集中在 `file-tree.css` 中，其他 CSS 文件不应包含同名选择器的副本。

### 4. 手风琴式与扁平式 CSS 差异

| 特性 | 递归树（手风琴） | 虚拟化树（扁平） |
|------|-----------------|-----------------|
| 子项包含关系 | 父 `<li>` 包含子 `<ul>` | 所有节点为同级 `<li>` |
| `::before` 高度 | `top: 0; bottom: 0` 自然覆盖 | 必须计算并溢出 |
| 缩进机制 | 嵌套 `<ul>` 累加 padding | `--adl-tree-indent` CSS 变量 |
| 悬停传播 | `~ .children` 兄弟组合器 | JS 计算 `hoveredDescendantPaths` |
| 适用场景 | 大纲树（数据量小） | 文件树（数据量大，需虚拟滚动） |

### 5. 数据流

```
TreeNodeRow 设置 --adl-tree-indent (depth-1)*14px
  ↓
adl-filetree__item::before 使用 calc(18px + var(--adl-tree-indent))
adl-filetree__row padding 使用 calc(8px + ... + var(--adl-tree-indent))
  ↓
fileTree.tsx 计算 trunkHeightMap → --adl-trunk-height
  ↓
::before 溢出 28px 边界，在子项区域绘制连续树干线
  ↓
fileTree.tsx 计算 hoveredDescendantPaths → is-hovered-by-ancestor
  ↓
子项 toggle 图标同步高亮
```

## 涉及文件

| 文件 | 变更 |
|------|------|
| `TreeNodeRow.tsx` | 新增 `--adl-tree-indent` CSS 变量 |
| `fileTree.tsx` | 新增 `trunkHeightMap`、`hoveredDescendantPaths`、`is-hovered-by-ancestor` |
| `file-tree.css` | `::before` 变量化、移除根层级隐藏规则、新增 `is-hovered-by-ancestor` 规则 |
| `files-panel.css` | 同步 4 条核心规则至变量化版本 |
| `outline-panel.css` | 还原至原始状态（无变量化改变） |

## 效果

- 任意深度展开目录：连续垂直树干线 ✓
- 缩进与嵌套深度同步 ✓
- 悬停目录时，所有嵌套子目录的展开/折叠图标高亮 ✓
- 文件工具面板（Files）：与通信/变更面板一致 ✓
- 文档大纲：保持原始递归树视觉 ✓
