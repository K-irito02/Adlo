# ECharts → visx 迁移经验

## 背景

将 Git Visualization 功能中 7 个 ECharts 图表替换为 visx + 原生 SVG 实现，同时移除 ECharts 依赖。

## 经验总结

### 1. 增量替换策略（TDD 保障）

每替换一个图表，使用 TDD 流程：
1. 创建空组件 + 测试 → 测试红（导入失败）
2. 实现最小 visx 组件 → 测试绿
3. 全部替换完成后，最后一步重写父组件（GitVisualizationView）+ 删除旧文件

避免一次性全量替换导致的路径断裂。

### 2. visx 版本统一管理

visx 4.x 发布时部分包为 `4.0.1-alpha.0`（如 scale, shape, sankey），部分为 `^4.0.0` 稳定版。混用会导致：

- lockfile 中同一包存在两个版本（`4.0.0` + `4.0.1-alpha.0`）
- bundle 体积膨胀（两份代码）

**教训：** 安装时统一至 `^4.0.0` 稳定版。若个别 API 仅在 alpha 版可用，在代码中做兼容处理并明确注释原因。

### 3. 类型声明

visx 依赖的 d3 子包（`d3-hierarchy`, `d3-shape` 等）需要安装 `@types/` 声明包：

```
pnpm add -D @types/d3-hierarchy @types/d3-shape
```

缺少声明包时，`tsc --noEmit` 会报 `Could not find a declaration file` 错误。

### 4. visx 子包粒度控制

只安装实际使用的 visx 子包。本次迁移实际使用的只有 7 个：

- `@visx/scale` — 共用
- `@visx/shape` — AreaClosed, LinePath, BarGroup
- `@visx/axis` — AxisBottom, AxisLeft
- `@visx/curve` — curveMonotoneX
- `@visx/gradient` — GradientTealBlue
- `@visx/group` — Group（SVG `<g>` 包装）
- `@visx/sankey` — Sankey 布局

未使用的子包（`@visx/event`, `@visx/grid`, `@visx/heatmap` 等）不应安装。

### 5. 热力图实现

visx 的 `HeatmapRect` 组件在 4.x alpha 中可用，但使用原生 SVG `<rect>` 循环渲染更简洁轻量——仅需要 `scaleLinear` 做颜色映射，无需引入额外的 visx 热力图模块。

### 6. 旭日图实现

visx 不直接提供旭日图组件。使用 `d3-hierarchy` 的 `partition()` 布局 + `d3-shape` 的 `arc()` 生成路径，以 `@visx/group` 做 SVG `<g>` 包装。注意 `HierarchyNode` 的 `x0/x1/y0/y1` 由 `partition()` 运行时设置，需定义 `PartitionNode` 接口辅助类型推断。

### 7. Math.max 空数组风险

`Math.max(...data.map(...))` 在 data 为空数组时返回 `-Infinity`，会传播为 SVG NaN 属性。所有使用此模式的处都必须加守卫：

```typescript
const maxVal = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 1;
```

### 8. tickFormat 类型兼容性

`@visx/axis` 的 `AxisBottom` 接收 `scale` 泛型。当使用 `scaleLinear` 时，`tickFormat` 回调参数类型为 `NumberValue`（`{ valueOf(): number }`）而非 `number`。需用 `Number(val)` 显式转换后再作为数组索引。
