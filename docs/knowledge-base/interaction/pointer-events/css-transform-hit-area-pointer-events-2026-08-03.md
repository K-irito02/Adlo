# CSS transform 命中区与 pointer-events 下沉模式 — 2026-08-03

## 问题

贡献者模块热力图 X 轴：悬停文件级标签（如 `-w`、`.editorconfig`）时误触发相邻**目录级**标签的系统原生 tooltip、手掌光标，甚至误点击跳转到该目录。

## 根因

- 目录级标签外层容器 `width: max-content`，命中区是**未旋转的水平矩形**（覆盖相邻列区域）。
- `title`/`onClick`/`cursor-pointer` 设在该外层容器上。
- 文件级标签 `pointer-events: none` 穿透 → 悬停文件标签时命中相邻目录的宽矩形 → 触发目录的 tooltip/光标/点击。

## 关键知识点：CSS transform 影响命中测试

CSS `transform` 会改变元素的命中区域（hit-testing region）。一个带 `rotate(-45deg)` 的元素，其可点击/可悬停区域是**旋转后的形状**，而非旋转前的布局框。

因此修复必须把**全部交互**（`pointer-events: auto`、`cursor-pointer`、`onClick`、`onContextMenu`、`title`）下沉到**旋转元素本身**：

```
外层 div (absolute, pointer-events-none)      ← 纯定位，永不命中
  └─ 旋转/内容 div (pointer-events-auto + onClick + title)
       └─ labelContent                        ← 命中区 = 旋转后实际文本
```

- 外层恒 `pointer-events: none`：自身不命中，且未显式设置的后代继承 none。
- 内层显式 `pointer-events: auto`：仅在自身旋转形状内恢复命中。

## 教训

1. **仅把 `title` 下沉不够**：若 `pointer-events-auto`/`onClick`/`cursor-pointer` 仍留在旋转前的 flex 容器上，其命中区仍是未旋转宽框，误触依然存在。必须整体下沉交互属性。
2. **中间布局层不要放交互**：纯布局的 flex 包装层应继承外层 `pointer-events: none`，避免形成额外的未旋转命中区。
3. **测试须断言交互元素的 transform**：`expect(titled[0].style.transform).toContain('rotate')`，确保交互真正位于旋转元素而非容器。

## 相关文件

- `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx`
- `frontend/src/components/charts/heatmap/heatmap-x-axis.test.tsx`
