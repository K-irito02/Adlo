# Git 可视化装载效果对齐 bklit-ui 官方 — 设计文档

**日期**：2026-08-04
**主题**：将「变更面板 → Git可视化」全部图表的装载效果全面对齐 bklit-ui 官方（turnkey 组件 + 官方默认动画组合），并修复遗留 Minor。

## 背景

前一阶段为 8 个图表添加了装载效果，但采用「给现有图表传 `status="loading"` 内联渲染」的方式，与 bklit-ui 官方不一致：

1. **折线动画**：用了 `sweep` 斜向扫视，官方默认是 `pulse` 脉冲光（沿线移动亮段）
2. **Grid 扫视**：未传 `shimmer` prop，官方有扫视带动画
3. **柱状条颜色**：用了 Git 可视化主题色 `var(--chart-line-primary)`，官方是灰色 `var(--foreground)` + 0.45 透明度
4. **柱状条尺寸/间距**：依赖 SeriesBar，官方是 12 柱 + 0.7 barFraction + cornerRadius 2 的骨架柱
5. **折线骨架数据**：传 `data={[]}` 触发内部骨架，官方显式 `generateChartSkeletonData` 生成

## 设计决策（已与用户确认）

| 决策点 | 选择 |
|--------|------|
| 实现方案 | **完全复用官方 turnkey 组件**（LineChartLoading/BarChartLoading/HeatmapChartLoading/BarLoadingSkeleton，均已移植到本地） |
| 文字与折线动画 | **官方默认组合**：ShimmeringText 文字闪光 + Line pulse 脉冲光 + Grid 扫视 shimmer |
| 热力图与自定义图 | **官方组件 + 自定义骨架**：热力图用 HeatmapChartLoading，分支图/排行榜保持自定义 CSS 骨架行但文字对齐 ShimmeringText |
| CommitTimeline（柱+折线组合） | **骨架柱 + 折线脉冲混合**：BarLoadingSkeleton 灰色柱 + Line pulse 脉冲 + Grid shimmer |
| 遗留 Minor 修复 | **全部修复**（除特殊设计处） |

## 官方装载效果要素（复刻标准）

| 要素 | 官方实现 | 说明 |
|------|----------|------|
| 折线骨架数据 | `generateChartSkeletonData({ dataKey, pointCount: 7 })` | 显式生成波形数据 |
| 折线动画 | `Line loadingStyle="pulse"` + `loadingStroke="var(--foreground)"` + `loadingStrokeOpacity={0.5}` | 沿线移动亮段 |
| Grid 扫视 | `Grid shimmer={true}` + `shimmerStroke` | 扫视带穿越网格线 |
| 文字 | `ChartLoadingLabel` → `ShimmeringText` 逐字符闪光 | `text={label}` |
| 柱状骨架 | `BarLoadingSkeleton` | `fill="var(--foreground)"` + `fillOpacity=0.45` + `barCount=12` + `barFraction=0.7` + `baseline="bottom"` + sweep 扫视 |

## 组件级设计

### 1. CodeLineEvo（折线+面积）

**当前**：`<LineChart data={[]} status="loading" loadingLabel={...}>` + `<Line loadingStyle="sweep">` + `<Grid highlightRowValues={[0]}>`

**改为**：使用官方 `<LineChartLoading label={loadingLabel} />`
- 内部：`generateChartSkeletonData` + `Grid horizontal shimmer` + `Line pulse` + `ChartLoadingLabel`
- 保留容器高度 `maxHeight: 280`
- 引入 `LineChartLoading` from `@/components/charts/line-chart-loading`

### 2. CommitTimeline（柱+折线组合）

**当前**：`<ComposedChart data={[]} status="loading" loadingLabel={...}>` + `<SeriesBar fill="var(--chart-line-primary)">` + `<Line loadingStyle="sweep">`

**改为**（骨架柱 + 折线脉冲混合）：
- 在 loading 分支渲染 `<ComposedChart status="loading" loadingLabel={loadingLabel}>`
- `SeriesBar` 装载时显示灰色骨架柱：新增本地 `ComposedBarLoadingSkeleton` 或直接在 loading 分支叠加 `BarLoadingSkeleton`（灰色）
- `Line` 传 `loadingStyle="pulse"` + `stroke="transparent"`（让 LineLoadingPulseStroke 渲染脉冲光）
- `Grid` 传 `shimmer` 扫视
- 保留 `maxHeight: 280`

**实现注记**：本地 `ComposedChart` 已支持 status/loadingLabel（官方没有）。loading 时 `TimeSeriesChartInner` 用 `generateChartSkeletonFromTarget` 生成骨架数据，Line 组件在 loading phase 自动渲染 pulse 脉冲（若传 `loadingStyle="pulse"`）。柱状部分需显式渲染官方灰色 `BarLoadingSkeleton` 叠加在 ComposedChart 之上（绝对定位或通过子组件），以确保灰色骨架柱。

### 3. 热力图（日历/时钟/活动）

**当前**：`<HeatmapChart data={skeletonData} status="loading" loadingLabel={...}>` + 现有子组件

**改为**：使用官方 `<HeatmapChartLoading data={目标列} label={loadingLabel} />`
- `data` 传目标列（日历全年 / 时钟 24×7 / 活动月份范围），内部 `generateHeatmapSkeletonFromTarget` 生成骨架
- shimmer 单元格 + 中央 `ChartLoadingLabel`
- 保留各组件既有 `margin`/`binSize`/`gap` 配置

**各组件目标列**：
- CalendarHeatmap：`commitStatsToHeatmapColumns(expandToFullYear([], year ?? 当前年))`
- ClockHeatmap：`hourlyDistributionToHeatmapColumns(expandToFullGrid([]), dayLabels)`
- ContributorActivityHeatmap：`contributorActivityToHeatmapColumns([{author:'',periods:months}], since, until)`

### 4. 分支图（BranchGraph）/ 排行榜（FileHotspotsLeaderboard）

- 保持自定义 CSS 骨架行（官方无对应组件）
- `ChartLoadingLabel` 已使用 `ShimmeringText`，文字闪光对齐官方
- 无需改动（或微调 CSS shimmer 方向与官方 sweep 一致）

### 5. 容器层

- 不变：`status`/`loadingLabel` 已接线

### 6. 历史遗留旧装载状态清理

用户要求删除上一阶段实现的旧装载骨架（它们将被官方 turnkey 组件替换），并统一模块 tab 文案。

**删除/替换（旧装载实现 → 官方组件）**：
| 位置 | 旧实现 | 替换 |
|------|--------|------|
| CodeLineEvo.tsx | `status === 'loading'` 内联分支 + `Line loadingStyle="sweep"` | 官方 `LineChartLoading`（pulse + Grid shimmer） |
| CommitTimeline.tsx | `status === 'loading'` 内联分支 + `SeriesBar` 主题色 + `Line loadingStyle="sweep"` | 官方 `BarLoadingSkeleton`（灰色柱）+ `Line` pulse + `Grid` shimmer |
| CalendarHeatmap.tsx | `skeletonData` + `HeatmapChart status="loading"` | 官方 `HeatmapChartLoading` |
| ClockHeatmap.tsx | 同上 | 同上 |
| ContributorActivityHeatmap.tsx | 同上 | 同上（含 `buildSkeletonActivityPeriods` 删除，因 HeatmapChartLoading 直接用目标列） |
| 旧 CSS | `.adl-git-vis__chart-loading`、`.adl-branch-graph__skeleton*`、`.adl-file-hotspots-ranking__skeleton*`、`@keyframes adl-git-vis-sweep` | 删除（官方组件自带样式） |
| gitVisLoadingModules 文案 | 模块 tab 专用 "Loading modules..." | 统一用 `gitVisLoadingChart`（"Loading chart..."） |

**保留（功能性加载状态，不删除）**：
| 位置 | 用途 |
|------|------|
| `gitVisLoadingMore` | 分支图虚拟滚动"加载更多提交"提示 |
| `gitVisAllLoaded` | 分支图全部加载完成提示 |
| `useYearBounds` 的 `loading` | 年份边界加载（TimeRangeSelector 用） |
| `RefreshButton` 的按钮 spinner | 手动刷新按钮反馈 |

**i18n 清理**：删除 `gitVisLoadingModules` key（zh-CN + en-US 均删），`HeatmapCardGroup.tsx:289` 改用 `loadingLabel={loadingLabel}`（即 `t.gitVisLoadingChart`）。

### 7. 遗留 Minor 修复

| Minor | 修复 |
|-------|------|
| T2 时区边界 | `buildSkeletonActivityPeriods` 将被删除（由 HeatmapChartLoading 目标列取代），时区问题随之消除 |
| T2 年度回退 | CalendarHeatmap 改用 HeatmapChartLoading 后，骨架数据来自目标列传入；年度回退问题随之消除（若仍存在则修正 memo 依赖） |
| T3 分支重复 | CodeLineEvo loading/empty 分支合并简化（loading 分支被官方组件替换，empty 分支独立保留） |

## 数据流

```
GitVisualizationView / HeatmapCardGroup
        │  data.loading ? 'loading' : 'ready'（status）
        │  t.gitVisLoadingChart（loadingLabel）
        ▼
图表组件 loading 分支
        │  折线/组合 → LineChartLoading / ComposedChart + BarLoadingSkeleton + Line pulse
        │  热力图   → HeatmapChartLoading
        │  自定义   → CSS 骨架行 + ChartLoadingLabel
        ▼
官方 turnkey 组件（骨架数据 + pulse/shimmer + ShimmeringText）
```

## 测试（红绿测试规范）

| 测试文件 | 新增/更新用例 |
|----------|--------------|
| `CodeLineEvo.test.tsx` | loading 时渲染 LineChartLoading（骨架 + Loading 文字） |
| `CommitTimeline.test.tsx` | loading 时渲染灰色骨架柱 + Loading 文字 |
| `CalendarHeatmap.test.tsx` | loading 时渲染 HeatmapChartLoading |
| `ClockHeatmap.test.tsx` | 同上 |
| `ContributorActivityHeatmap.test.tsx` | 同上 + 时区边界用例（until 月含在内） |
| `BranchGraph.test.tsx` | 保持（文字断言不变） |
| `FileHotspotsLeaderboard.test.tsx` | 保持 |

## 双端一致性

- 所有装载效果在共享 React 组件中实现，Tauri/浏览器自动一致
- 无新增 IPC

## 验收标准

1. 折线装载：pulse 脉冲光 + Grid 扫视 shimmer + ShimmeringText 文字
2. 柱状装载：官方灰色骨架柱（var(--foreground) + 0.45 + 12 柱 + 0.7 barFraction）
3. 热力图装载：HeatmapChartLoading 骨架网格 + shimmer 单元格
4. 分支图/排行榜：CSS 骨架行 + ShimmeringText 文字
5. 遗留 Minor 修复：时区边界不再丢月、年度回退正常
6. `pnpm --dir frontend run test` 全部通过；lint/typecheck 干净
7. 无硬编码 UI 文本
