# Git 可视化图表装载效果 — 设计文档

**日期**：2026-08-04
**主题**：为「变更面板 → Git可视化」区域的全部图表添加「装载」（Loading）效果，参考 bklit-ui 官方装载效果，装载状态与实际容器大小一致。

## 背景与目标

「变更面板 → Git可视化」区域共有 8 个可视化图表。当前在数据加载期间存在以下问题：

1. **无装载视觉效果**：`GitVisualizationView.tsx:101` 的 `TimeRangeAwareCard` 在 loading 时渲染 `<div className="adl-git-vis__skeleton" />`，但该 CSS 类**从未定义**（grep 确认无对应样式），实际无任何装载视觉效果。
2. **容器塌陷/突变**：各图表在 loading 时渲染 `null`（如 `branchGraphData.loading ? null : <BranchGraph/>`），导致容器塌陷；数据就绪后容器突然撑开，产生较大的布局变化。
3. **覆盖不完整**：热力图卡片组除「模块」tab（`ContributorModuleHeatmap` 已有 `status`/`loadingLabel`）外，日历/时钟/活动 3 个 tab 均无装载处理。
4. **自定义图表无装载**：分支图谱（BranchGraph）、文件热点（FileHotspotsLeaderboard）为自定义组件，bklit-ui 官方无对应装载组件，需适配改造。

**目标**：
- 所有图表在数据加载期间显示统一的「装载」效果（sweep 骨架 + 中央 shimmer「Loading」文字）。
- 装载状态与实际容器大小一致，确保图表显示时容器无明显变化。
- 完全对齐 bklit-ui 官方的装载效果视觉语言。

## 设计决策（已与用户确认）

| 决策点 | 选择 |
|--------|------|
| 视觉形态 | **sweep 骨架 + 中央 shimmer「Loading」文字**（bklit-ui 官方风格） |
| 容器尺寸策略 | **固定高度骨架**（每类图表定义固定装载高度，与数据就绪后的实际高度接近） |
| 装载触发时机 | **全部 loading 状态**（首次进入视图、切换工作区、点击刷新、修改时间范围均显示） |
| 装载文字 | **i18n 统一文案**（新增 `gitVisLoadingChart` key，中英双语） |
| 实现方案 | **方案 A：图表组件自包含装载**（每个图表组件新增 `status`/`loadingLabel` prop，内部自渲染骨架） |

## 架构

### 复用已移植的 bklit-ui 装载基础设施（零改动）

本地 `frontend/src/components/charts/` 已移植 bklit-ui 完整装载能力：

| 组件/模块 | 说明 |
|-----------|------|
| `LineChart` / `ComposedChart` | 支持 `status="loading"` + `loadingLabel`，自动渲染骨架 + sweep 微光 + 中央 Loading 文字 + loading→ready 过渡 |
| `HeatmapChart` | 支持 `status="loading"` + `loadingLabel` |
| `ChartLoadingLabel` | shimmer「Loading」文字，可复用于自定义图表 |
| `LineLoadingSweep` / `BarLoadingSkeleton` | 微光扫描骨架（`loading-sweep.tsx`） |
| `generateChartSkeletonData` | 折线骨架数据（`data` 为空时占位） |
| `generateHeatmapSkeletonFromTarget` | 热力图骨架网格（保留目标网格形状、空单元格） |
| `chart-phase.ts` | `ChartStatus = 'loading' \| 'ready'` |

### 自定义图表骨架

bklit-ui 官方无装载效果的图表（分支图谱、文件热点）需手写骨架，但复用 bklit-ui 的视觉语言：
- 行骨架：灰色占位行 + sweep 微光扫描（复用 `LoadingSweepMask` 的 SVG mask 实现模式）
- 中央叠加 `ChartLoadingLabel`

## 组件级设计

### 1. 官方组件图表的装载接入（4 个）

**日历热力图 `CalendarHeatmap.tsx`**
- 新增 props：`status?: ChartStatus`、`loadingLabel?: string`
- `HeatmapChart` 增加 `status` + `loadingLabel`；数据为空 + status=loading 时由 `generateHeatmapSkeletonFromTarget` 生成骨架网格
- 容器高度：约 320px（与真实图表一致）

**时钟热力图 `ClockHeatmap.tsx`**
- 新增 props：`status?: ChartStatus`、`loadingLabel?: string`
- 同上，`HeatmapChart` 增加 `status` + `loadingLabel`
- 骨架保留 24×7 网格形状

**贡献者活动热力图 `ContributorActivityHeatmap.tsx`**
- 新增 props：`status?: ChartStatus`、`loadingLabel?: string`
- 同上

**贡献者模块热力图 `ContributorModuleHeatmap.tsx`**
- 已支持 `status`/`loadingLabel`，**保持不变**

### 2. 折线/柱状图表的装载接入（2 个）

**代码行演变 `CodeLineEvo.tsx`**
- 新增 props：`status?: ChartStatus`、`loadingLabel?: string`
- 主图 `LineChart` 增加 `status` + `loadingLabel` + `loadingStyle="sweep"`
- 骨架高度保持 `maxHeight: 280`（与真实图表一致）
- 无数据时（空状态）渲染与当前一致的 `LineChart data={[]}`（空图），不显示骨架——仅 loading 时显示骨架

**提交时间线 `CommitTimeline.tsx`**
- 新增 props：`status?: ChartStatus`、`loadingLabel?: string`
- 主图 `ComposedChart` 增加 `status` + `loadingLabel` + `loadingStyle="sweep"`
- 骨架高度保持 `maxHeight: 280`

### 3. 自定义图表装载（2 个，bklit-ui 官方无对应）

**分支图谱 `BranchGraph.tsx`**
- 新增 props：`status?: ChartStatus`、`loadingLabel?: string`
- `status === 'loading'` 时渲染自定义骨架：
  - 复用行结构：行高 36px × 约 10 行 = 360px（与真实图表高度一致）
  - 每行渲染 lanes 区 + 文本条的灰色占位，叠加 sweep 微光扫描（复用 `LoadingSweepMask` mask 实现模式）
  - 中央叠加 `ChartLoadingLabel`
- `status === 'ready'` 时渲染现有分支图谱逻辑

**文件热点 `FileHotspotsLeaderboard.tsx`**
- 新增 props：`status?: ChartStatus`、`loadingLabel?: string`
- `status === 'loading'` 时渲染自定义骨架：
  - 表头 + 约 8 行行骨架（行高 32px，与 `MAX_HEIGHT: 320` 一致）
  - 中央叠加 `ChartLoadingLabel`
- `FileHotspotsView.tsx` 透传 props

### 4. 容器层改动

**`GitVisualizationView.tsx`**
- `TimeRangeAwareCard`：**移除** `<div className="adl-git-vis__skeleton" />`（未定义 CSS 类，缺陷修复），改为始终渲染 `children`（图表组件自包含装载）
- 移除 `loading ? null : <Chart/>` 分支，改为 `<Chart status={data.loading ? 'loading' : 'ready'} loadingLabel={t.gitVisLoadingChart} />`
- BranchGraph / CodeLineEvo / CommitTimeline / FileHotspotsView 四个卡片依次改造

**`HeatmapCardGroup.tsx`**
- 新增 prop：`commitStatsStatus?: ChartStatus`
- 传入 CalendarHeatmap / ClockHeatmap / ContributorActivityHeatmap 三个 tab 的 `status` + `loadingLabel`
- 模块 tab 保持现状（已有 status/loadingLabel）

### 5. i18n

在 `frontend/src/app/i18n/zh-CN/changes.ts` 与 `en-US/changes.ts` 新增：

```ts
gitVisLoadingChart: '正在加载图表...',   // zh-CN
gitVisLoadingChart: 'Loading chart...', // en-US
```

自定义图表（分支图/排行榜）与官方图表统一使用此文案。

### 6. CSS

在 `frontend/src/styles/regions/rightpanel/git-visualization.css` 新增：

- `.adl-git-vis__chart-loading` — 装载骨架容器（固定高度、相对定位、overflow hidden），供分支图/排行榜骨架复用
- `.adl-branch-graph__skeleton-row` — 分支图骨架行
- `.adl-file-hotspots-ranking__skeleton-row` — 排行榜骨架行
- 微光扫描动画复用 `LoadingSweepMask`（SVG），无需额外 CSS 动画

## 数据流

```
useChartData(chartId) → { data, loading, error, ... }
        │
        ▼
GitVisualizationView / HeatmapCardGroup
        │  data.loading ? 'loading' : 'ready'（status）
        │  t.gitVisLoadingChart（loadingLabel）
        ▼
图表组件（自包含装载）
        │  status === 'loading' → 渲染骨架 + ChartLoadingLabel
        │  status === 'ready'   → 渲染真实图表（bklit-ui 内部完成 loading→ready 过渡）
        ▼
bklit-ui 组件（LineChart/ComposedChart/HeatmapChart/自定义骨架）
```

## 错误处理

- 装载仅由 `status === 'loading'` 驱动；`error` 状态仍由现有 `TimeRangeAwareCard` 的 `timeRange.error` 分支处理，不重叠。
- 空数据（`ready` 且无数据）：维持现有「空图」渲染，不显示装载骨架。

## 测试（红绿测试规范）

| 测试文件 | 新增/更新用例 |
|----------|--------------|
| `CalendarHeatmap.test.tsx` | status=loading 时渲染骨架 + Loading 文字 |
| `ClockHeatmap.test.tsx` | 同上 |
| `ContributorActivityHeatmap.test.tsx` | 同上 |
| `CodeLineEvo.test.tsx` | status=loading 时渲染骨架 + Loading 文字；ready 时正常渲染 |
| `CommitTimeline.test.tsx` | 同上 |
| `BranchGraph.test.tsx` | status=loading 时渲染骨架行 + Loading 文字 |
| `FileHotspotsLeaderboard.test.tsx` | status=loading 时渲染骨架行 + Loading 文字 |
| `GitVisualizationView.test.tsx` | 验证传 `status` 而非 `null`；i18n mock 新增 `gitVisLoadingChart` |
| `HeatmapCardGroup.test.tsx` | 验证 `commitStatsStatus` 传参 |

## 双端一致性

- 所有装载效果均在共享 React 组件中实现，Tauri 桌面端与浏览器端自动一致。
- 无新增 IPC 方法。

## 验收标准

1. 8 个图表在数据加载期间均显示 sweep 骨架 + 中央「Loading」文字。
2. 装载状态容器高度与数据就绪后的实际高度一致，切换时无明显跳动。
3. 首次进入视图、切换工作区、点击刷新、修改时间范围均触发装载效果。
4. 中英文文案正确显示。
5. `pnpm --dir frontend run test` 全部通过；`pnpm --dir frontend run lint` 无新增 error。
6. 无硬编码 UI 文本。
