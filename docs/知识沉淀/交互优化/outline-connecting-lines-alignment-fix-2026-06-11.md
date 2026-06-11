# 文档大纲垂直连接线与叶子节点线条隐藏

## 问题

文档大纲（Outline）的垂直连接竖线（`::before`）在两个场景下显示异常：

1. **深度≥2 的节点竖线偏移**：`::before` 使用 `left: calc(18px + var(--adl-tree-indent, 0px))`，其中 `--adl-tree-indent` 造成竖线每层额外右移 14px，但所有深度的展开/折叠图标中心始终在 `<li>` 左侧 16px 处（由 row 的 margin+padding 净值 4px + 2px 浏览器默认偏移 + 10px 半宽决定）。结果为竖线右移偏离图标中心。

2. **叶子节点的"中断竖线"无视觉锚点**：无子节点的条目没有展开/折叠图标，但 `::before` 仍显示一小段竖线。该竖线位于 16px 处（图标中心位置），但叶子节点无图标关联，竖线在空白区域"漂浮"，未与节点名称对齐。

## 根因

### 1. `--adl-tree-indent` 不应该出现在大纲 `::before` 中

文件树使用虚拟化扁平列表，所有 `<li>` 为同级，缩进通过 `--adl-tree-indent` 变量控制。但文档大纲使用**递归嵌套树**（子 `<ul>` 包含在父 `<li>` 内），缩进由 `<ul>` 的 `padding-left: 14px` 累加实现。`--adl-tree-indent` 在此场景下额外叠加，导致竖线位置偏差。

公式推导：

```
旧公式: left = 18 + (depth-1) * 14
实际需要: left = 16（所有深度一致，因为 <li> 已被 <ul> padding 位移）
```

所有深度的 `<li>` 内，toggle 中心始终在 `left: 16px`（row content edge = margin -rowOffset + padding 4+rowOffset = 4px；toggle 左边缘在 6px = 4 + 2px 浏览器默认偏移；中心在 6 + 10 = 16px）。`::before` 应匹配此值，不应加 `--adl-tree-indent`。

### 2. `outline-panel.css` 是死代码

`outline-panel.css` 从未被 `rightpanel.css` 或其他 CSS 文件 import，其内所有 129 行规则均不生效。此前多个版本的大纲竖线修复都在此无效文件中进行，造成修复无效的假象。

### 3. 行 padding 公式未覆盖 outline 特有逻辑

`.adl-filetree__row, .adl-outline-tree__row` 群组选择器（specificity 0,1,0）使用 `padding-inline-start: calc(8px + var(--adl-filetree-hover-offset) + var(--adl-tree-indent))`。但对于 outline，indent 不应累加（因为已由 `<ul>` padding 实现），且 base 值应从 8px 改为 4px。

### 4. 浏览器默认按钮 padding

展开/折叠图标左边缘实测为 `toggleL=6px`，但计算期望值为 4px（content edge = -4 + 8 = 4）。2px 偏差来自 `<button>` 元素的浏览器默认 padding（即使 `border: none` 不重置 `padding`）。此偏差在所有深度一致。

## 解决方案

### 修复一：固定 `::before left`

将大纲 `::before` 的 `left` 从 `calc(18px + var(--adl-tree-indent, 0px))` 改为固定 `16px`：

```css
.adl-outline-tree__item::before {
  left: 16px;
  top: 13px;
}
```

不再依赖 `--adl-tree-indent`。`top: 13px` 匹配 toggle 垂直中心（row height 28px，toggle margin-top 1px + 半高 10px = 11px，13px 接近中线）。

### 修复二：叶子节点隐藏 `::before`

利用 `aria-expanded` 属性（仅分支节点有此属性）区分叶子与分支：

```css
.adl-outline-tree__item:not([aria-expanded])::before {
  display: none;
}
```

### 修复三：行 padding 特异性提升 & base 值修正

```css
.adl-outline-tree__row.adl-outline-tree__row {
  width: calc(100% + var(--adl-outline-row-offset, 4px));
  margin-inline-start: calc(-1 * var(--adl-outline-row-offset, 4px));
  padding-left: calc(4px + var(--adl-outline-row-offset, 4px));
}
```

- 特异性：双类选择器 (0,2,0) 击败群组选择器 (0,1,0)
- `padding-left`（物理属性）而非 `padding-inline-start`（逻辑属性），避免与群组选择器中的逻辑属性冲突
- base 值 4px 匹配 toggle 中心公式：net = -rowOffset + (4 + rowOffset) = 4px

## 关键认知

### 1. 递归树≠扁平树，缩进策略不同

| 特性 | 递归树（大纲） | 扁平树（文件树） |
|------|---------------|----------------|
| 缩进实现 | `<ul> padding-left: 14px` 累加 | `--adl-tree-indent` CSS 变量 |
| `::before` position | 固定 left（`<li>` 已位移） | `calc(18px + var(--adl-tree-indent))` |
| `::before` 高度 | `top: 0; bottom: 0` 自然覆盖 | 需 `--adl-trunk-height` 溢出 |

### 2. `aria-expanded` 可作 CSS 选择器支点

分支节点具备 `aria-expanded="true/false"`，叶子节点无此属性。CSS `:not([aria-expanded])` 可精准选择叶子节点，无需额外 class 或 data 属性。

### 3. 物理 vs 逻辑 CSS 属性

`padding-inline-start`（逻辑）和 `padding-left`（物理）是两条独立声明。在 ltr 模式下浏览器将逻辑属性映射为物理属性，但同一元素上同时声明二者时，后加载且特异性更高的声明胜出。使用物理属性可避免逻辑属性级联的不确定行为。

### 4. 死代码文件必须及时清理

`outline-panel.css` 长期未被引用，导致多次修复无效。CSS 文件若未在 import 链中出现，其内所有规则均为死代码。应定期检查 import 链，删除未引用的 CSS 文件。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `file-tree.css` | 大纲 `::before` 固定 left:16px + 叶子节点隐藏 ::before |
| `files-panel.css` | outline row padding-left base 值 4px + 双类特异性提升 |
| `outline-panel.css` | **删除**（死代码，从未被 import） |
| `OutlineTree.tsx` | 移除临时的 debug 日志 effect |

## 效果

- 所有深度：`::before` 竖线与 toggle 图标中心对齐 ✓
- 叶子节点（无子节点、无 toggle）：`::before` 隐藏 ✓
- 行 padding 正常：toggle 左边缘始终在 `<li>` 左侧 6px，中心在 16px ✓
