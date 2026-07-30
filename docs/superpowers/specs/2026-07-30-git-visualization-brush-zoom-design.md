# Git Visualization Brush Zoom

为"变更面板"Git 可视化区域的"代码行演变"和"提交时间线"图表添加 brush-zoom 交互功能。

## 问题

1. **日期截断 Bug**：`codeEvolutionToAreaData()` 对 `weekStart` 做 `.substring(5)` 截断，只保留 `MM-DD`，丢失年份信息。导致跨年数据点重叠/解析异常，折线图只显示少量日期。
2. **大时间范围不友好**：用户选择"全部"或多年范围时，折线图密集不可操作，缺少缩放/平移交互手段。

## 方案

在现有 bklit-ui 图表框架上新增 `ChartBrushLayout` + `ChartBrush` 组件，遵循 [bklit-ui Brush 官方 API](https://bklit.com/docs/utility/brush)。

## 组件设计

### ChartBrushLayout（控制器）

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `data` | `Record<string, unknown>[]` | 必填 | 完整数据集 |
| `xDataKey` | `string` | `"date"` | X 轴字段 |
| `enabled` | `boolean` | 必填 | 启用/禁用刷选 |
| `height` | `number` | 必填 | 缩略条高度(px) |
| `brushStrip` | `(layout) => ReactNode` | — | 缩略条渲染函数 |
| `children` | `(layout) => ReactNode` | 必填 | 主图渲染函数 |
| `className` | `string` | — | 容器 class |

`layout` 参数：
- `xDomain: [Date, Date] | undefined` — 主图可见范围
- `xDomainSlotCount: number | undefined` — 完整数据集长度
- `brushSelection: { start: Date; end: Date } | null` — 当前选区
- `onBrushSelectionChange: (selection) => void` — 选区回调

### ChartBrush（交互组件）

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `onSelectionChange` | `(domain) => void` | — | 拖拽时触发 |
| `initialSelection` | `{ start: Date; end: Date }` | — | 初始选区 |
| `blurPx` | `number` | `1.5` | 背景模糊 |
| `fadeOuterEdges` | `boolean` | `true` | 边缘淡出 |

### 文件结构

```
src/components/charts/brush/
├── chart-brush-layout.tsx    # 控制器组件
├── chart-brush.tsx           # 交互组件
├── brush-types.ts            # 类型定义
```

## 数据层修复

`src/app/features/git-visualization/adapters/chartDataAdapters.ts`:

```typescript
export function codeEvolutionToAreaData(
  weeks: { weekStart: string; additions: number; deletions: number }[],
): BklitAreaRow[] {
  return weeks.map((w) => ({
    date: w.weekStart, // 之前为 w.weekStart.substring(5)
    added: w.additions,
    deleted: w.deletions,
  }));
}
```

## 图表重构

### CodeLineEvo

```tsx
<ChartBrushLayout data={chartData} enabled height={72}
  brushStrip={(layout) => (
    <LineChart data={chartData} animationDuration={0} status="ready"
      style={{ aspectRatio: 'unset', height: '100%' }}>
      <Line dataKey="added" animate={false} showHighlight={false} />
      <Line dataKey="deleted" stroke="var(--chart-line-secondary)"
        animate={false} showHighlight={false} />
      <ChartBrush initialSelection={layout.brushSelection ?? undefined}
        onSelectionChange={layout.onBrushSelectionChange} />
    </LineChart>
  )}
>
  {(layout) => (
    <LineChart data={chartData}
      xDomain={layout.xDomain} xDomainSlotCount={layout.xDomainSlotCount}
      tweenYDomainOnXDomainChange yDomainTween
      margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
      style={{ maxHeight: 280 }}>
      <Line dataKey="added" />
      <Line dataKey="deleted" stroke="var(--chart-line-secondary)" />
      <Grid /><ChartTooltip />
    </LineChart>
  )}
</ChartBrushLayout>
```

### CommitTimeline

```tsx
<ChartBrushLayout data={chartData} enabled height={72}
  brushStrip={(layout) => (
    <LineChart data={chartData} animationDuration={0} status="ready"
      style={{ aspectRatio: 'unset', height: '100%' }}>
      <Line dataKey="cumulative" animate={false} showHighlight={false} />
      <ChartBrush initialSelection={layout.brushSelection ?? undefined}
        onSelectionChange={layout.onBrushSelectionChange} />
    </LineChart>
  )}
>
  {(layout) => (
    <LineChart data={chartData}
      xDomain={layout.xDomain} xDomainSlotCount={layout.xDomainSlotCount}
      tweenYDomainOnXDomainChange yDomainTween
      margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
      style={{ maxHeight: 280 }}>
      <Line dataKey="cumulative" />
      <Grid /><ChartTooltip />
    </LineChart>
  )}
</ChartBrushLayout>
```

## 测试策略

| 测试 | 内容 |
|------|------|
| `ChartBrushLayout` 新测 | 渲染架构、选区状态管理、enabled 切换 |
| `ChartBrush` 新测 | SVG 元素渲染、鼠标拖拽模拟 |
| `CodeLineEvo.test.tsx` | 更新 mock 数据日期格式 |
| `chartDataAdapters` 已有测 | `codeEvolutionToAreaData` 输出含完整 YYYY-MM-DD |

## 未来扩展

此方案可复用于 Git 可视化面板中任何其他时间序列图表（如贡献者活动热力图的月份范围选择等）。
