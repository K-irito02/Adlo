# Chart 颜色预设系统 — 实现笔记

## 背景

Git 可视化面板需要支持多套配色方案切换，同时保持与 bklit-ui 的兼容性。

## CSS 变量作用域策略

颜色预设通过 **scoped CSS 变量** + `data-chart-preset` 属性实现：

```css
.adl-git-vis__container[data-chart-preset="bklit-default"] {
  --chart-scale-01: oklch(...);
  --chart-1: oklch(...);
  --chart-line-primary: var(--chart-1);
}
```

**关键设计**：
- 不进全局 `themes.css` 或 `tailwind.css` — 不影响应用其他部分
- 预设只控制 `--chart-scale-*`、`--chart-*`、`--chart-line-*` 系列变量
- Tooltip 色在 `.adl-git-vis__container` 基础层定义（不随预设变化）
- `--chart-line-primary/secondary` 引用 `--chart-1`/`--chart-2`，自动跟随预设切换

## 组件集成模式

- 基于 visx 的泛型热力图 + 折线图已使用 `var(--chart-*)` CSS 变量 → 自动响应预设
- 使用 `useBklitTheme` 硬编码颜色的组件（如代码行演变、提交时间线）需改为直接引用 CSS 变量或默认值
- 图例（`HeatmapLegend`）需包裹在 `HeatmapInteractionProvider` 内以实现与热力图的交互联动

## 预设选择器 Venn 图标实现

使用 SVG 绘制两个等大相交圆（r=7，圆心距 6px）：

```svg
<!-- 右侧完整深色圆 -->
<circle cx="15" cy="12" r="7" fill={darkest} stroke={darkest} />
<!-- 左侧 D 形截断浅色圆（在 x=12 处截止） -->
<path d="M 12 5.68 A 7 7 0 0 0 12 18.32 Z" fill={lightest} stroke={darkest} />
<!-- 隔离线 -->
<path d="M 12 5.68 L 12 18.32" stroke="var(--bg)" strokeWidth="2.5" />
```

`12 5.68` 和 `12 18.32` 是两圆相交的上下端点（x 轴坐标由 `(9+15)/2 = 12` 确定）。
