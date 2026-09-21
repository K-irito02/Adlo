# BranchGraph 标签行拖拽与悬停高亮修复经验

**日期：** 2026-07-29
**来源：** BranchGraph 标签行拖拽独立化 + 悬停效果改造

## 问题 1：ref 标签与列标签无法独立拖拽

**现象：** 点击拖拽 "main" 列标签时，"heatmap-chart-generalization" 等 ref 标签始终跟随移动，无法独立调整位置。

**根因：** `tagRowOrder` 由 `useMemo` 从 `columnOrder` 派生，`buildTagOrder` 函数在每次数据变动时将 ref 标签重新分组到父列标签之后。拖拽修改了 `columnOrder`，但 `tagRowOrder` 重新派生后 ref 标签又回到了父列后面。

**解决方案：**
- `tagRowOrder` 改为 `useState` 维护，拖拽直接更新状态
- `columnOrder` 从 `tagRowOrder` 反向派生（过滤 `col-*` 项）
- 数据变动时通过 merge effect 合并新项，保留已有项的拖拽位置
- Ref 标签在 `tagRowOrder` 中作为独立条目存在，与列标签同级

**教训：** 可拖拽排序的列表，若派生自分组数据会丢失独立性。应存为状态，让拖拽直接修改，数据变动时 merge 而非 regenerate。

## 问题 2：CSS `scale()` 悬停效果导致布局偏移

**现象：** `.adl-branch-graph__label[data-scale='true']` 使用 `transform: scale(1.06)` 放大标签，导致标签溢出容器、推动同级标签、产生滚动条抖动。

**解决方案：**
- 用 `box-shadow: inset 0 0 0 2px var(--border-default)` + `filter: brightness(1.10)` 替代 `transform: scale()`
- 两者均不改变元素盒模型，无布局偏移
- `var(--border-default)` 确保亮/暗主题兼容
- `transition` 同时动画 `box-shadow` 和 `filter`

**教训：** `scale()` 和 `transform` 系列改变坐标系，触发布局。`box-shadow` + `filter` 是零布局偏移的高亮替代方案，性能接近（均 GPU 合成），适合按钮等小型元素。

## 问题 3：标签间距过大

**现象：** 标签行 `gap: 6px` + `margin-right: 2px` 累积间距 8px，在标签较多时容易溢出。

**解决方案：** `gap` 从 `6px` → `4px`，`margin-right` 从 `2px` → `1px`。
