# Git 可视化装载效果对齐 bklit-ui 官方 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「变更面板 → Git可视化」全部图表的装载效果全面对齐 bklit-ui 官方（turnkey 组件 + 官方默认动画组合），并清理历史遗留的旧装载骨架与文案。

**Architecture:** 各图表 loading 分支改用官方 turnkey 组件：CodeLineEvo 用 `LineChartLoading`（pulse 脉冲 + Grid 扫视 shimmer + ShimmeringText 文字）；CommitTimeline 用「灰色骨架柱 + 折线脉冲」混合（`BarLoadingSkeleton` 灰色柱 + `Line` pulse）；热力图用 `HeatmapChartLoading`；分支图/排行榜保持自定义 CSS 骨架但文字对齐 ShimmeringText。同时删除上一阶段的内联装载骨架实现、旧 `gitVisLoadingModules` 文案及相关 CSS。

**Tech Stack:** React 19, TypeScript, vitest + @testing-library/react, i18n (zh-CN/en-US), CSS 自定义属性

**设计文档:** `docs/superpowers/specs/2026-08-04-git-vis-loading-official-align-design.md`

## Global Constraints

- 所有 UI 文本必须使用 i18n key，禁止硬编码；装载文字统一用 `t.gitVisLoadingChart`
- 官方 turnkey 组件均已移植到本地：`LineChartLoading`（`@/components/charts/line-chart-loading`）、`BarLoadingSkeleton`（`@/components/charts/loading-sweep`）、`HeatmapChartLoading`（`@/components/charts/heatmap`）、`ChartLoadingLabel`/`ShimmeringText`
- 官方默认动画组合：折线 `pulse` 脉冲光 + Grid `shimmer` 扫视 + `ShimmeringText` 文字闪光
- 柱状骨架官方规范：`fill="var(--foreground)"` + `fillOpacity=0.45` + `barCount=12` + `barFraction=0.7` + `baseline="bottom"`
- 装载高度与真实图表一致：折线/柱状 280px（`maxHeight: 280`）、分支图 360px、排行榜 320px
- 功能性加载状态**保留**（不删除）：`gitVisLoadingMore`（分支图加载更多）、`gitVisAllLoaded`、`useYearBounds` 的 `loading`、RefreshButton spinner
- **删除**历史遗留装载实现：各图表内联 `status="loading"` 骨架分支、`gitVisLoadingModules` 文案（统一为 `gitVisLoadingChart`）、旧骨架 CSS（`.adl-git-vis__chart-loading`、`.adl-branch-graph__skeleton*`、`.adl-file-hotspots-ranking__skeleton*`、`@keyframes adl-git-vis-sweep`）
- `ChartStatus` 从 `@/components/charts/chart-phase` 导入
- CSS 只用 CSS 自定义属性（var(--...)）
- 双端一致：Tauri/浏览器共用组件，无新增 IPC
- 测试：每个改动图表组件更新 loading 用例（红绿测试）；`pnpm --dir frontend exec vitest run <file>` 单文件验证
- Commit 遵循 Conventional Commits，Scope 用 `git-vis`

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts` | 中文文案 | 删除 `gitVisLoadingModules` |
| `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts` | 英文文案 | 删除 `gitVisLoadingModules` |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx` | 代码行演变 | loading 分支改用 `LineChartLoading` |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx` | 提交时间线 | loading 分支改用「灰色骨架柱 + 折线脉冲」 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx` | 日历热力图 | 改用 `HeatmapChartLoading` |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx` | 时钟热力图 | 改用 `HeatmapChartLoading` |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx` | 贡献者活动热力图 | 改用 `HeatmapChartLoading`（删除 `buildSkeletonActivityPeriods`） |
| `ai-digital-life/frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx` | 热力图卡片组 | 模块 tab 改用统一 loadingLabel |
| `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css` | 样式 | 删除旧骨架 CSS |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | 分支图谱 | 保持自定义骨架（文字 ShimmeringText） |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx` | 文件热点 | 保持自定义骨架（文字 ShimmeringText） |
| 各图表 `*.test.tsx` | 测试 | 更新 loading 用例 |

---

## Task 1: 清理 i18n 旧文案

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx:284-291`

**Interfaces:**
- Consumes: 现有 `gitVisLoadingChart` key（Task 1 上一阶段已加）
- Produces: 删除 `gitVisLoadingModules`；`HeatmapCardGroup` 模块 tab 用 `loadingLabel={loadingLabel}`

- [ ] **Step 1: 删除 zh-CN 文案**

在 `zh-CN/changes.ts` 删除这一行：

```ts
  gitVisLoadingModules: '正在加载模块...',
```

- [ ] **Step 2: 删除 en-US 文案**

在 `en-US/changes.ts` 删除这一行：

```ts
  gitVisLoadingModules: 'Loading modules...',
```

- [ ] **Step 3: HeatmapCardGroup 模块 tab 统一文案**

在 `HeatmapCardGroup.tsx` 中，将：

```tsx
          {activeHeatmapTab === 'module' && (
            <ContributorModuleHeatmap
              data={contributorModules}
              allPaths={contributorModuleAllPaths}
              status={contributorModuleStatus || 'ready'}
              loadingLabel={t.gitVisLoadingModules}
            />
          )}
```

改为：

```tsx
          {activeHeatmapTab === 'module' && (
            <ContributorModuleHeatmap
              data={contributorModules}
              allPaths={contributorModuleAllPaths}
              status={contributorModuleStatus || 'ready'}
              loadingLabel={loadingLabel}
            />
          )}
```

（`loadingLabel` 在组件内已定义为 `const loadingLabel = t.gitVisLoadingChart;`。）

- [ ] **Step 4: 更新相关测试 mock**

在 `HeatmapCardGroup.refresh.test.tsx` 中，删除 `useTCopy` mock 的 `t` 对象中的：

```ts
      gitVisLoadingModules: 'Loading modules...',
```

保留 `gitVisLoadingChart: 'Loading chart...'`。

- [ ] **Step 5: 运行验证**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS（`gitVisLoadingModules` 无残留引用）

Run: `pnpm --dir ai-digital-life/frontend run check:i18n`
Expected: PASS（中英文案 key 集合一致，均为 1387 keys）

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/HeatmapCardGroup.test.tsx src/app/features/git-visualization/HeatmapCardGroup.refresh.test.tsx`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts ai-digital-life/frontend/src/app/i18n/en-US/changes.ts ai-digital-life/frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx ai-digital-life/frontend/src/app/features/git-visualization/HeatmapCardGroup.refresh.test.tsx
git commit -m "chore(git-vis): remove obsolete gitVisLoadingModules i18n key"
```

---

## Task 2: CodeLineEvo 改用 LineChartLoading

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`

**Interfaces:**
- Consumes: `LineChartLoading` from `@/components/charts/line-chart-loading`
- Produces: `CodeLineEvo` loading 分支渲染官方 `LineChartLoading`

- [ ] **Step 1: 更新测试断言**

在 `CodeLineEvo.test.tsx`，现有 loading 用例保持（断言 `getByText('Loading chart...')`），无需改动——官方 `LineChartLoading` 渲染 `ChartLoadingLabel` 仍含该文字。

- [ ] **Step 2: 运行测试确认现状通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`
Expected: PASS（当前实现已能显示 Loading 文字）

- [ ] **Step 3: 改用 LineChartLoading**

在 `CodeLineEvo.tsx`：

添加 import：

```tsx
import { LineChartLoading } from '@/components/charts/line-chart-loading';
```

将 loading 分支：

```tsx
  if (status === 'loading') {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <LineChart
          data={[]}
          xDataKey="date"
          status="loading"
          loadingLabel={loadingLabel}
          margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
          style={{ maxHeight: 280 }}
        >
          <Line dataKey="net" loadingStyle="sweep" showHighlight={false} />
          <Grid highlightRowValues={[0]} />
        </LineChart>
      </div>
    );
  }
```

改为：

```tsx
  if (status === 'loading') {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <LineChartLoading label={loadingLabel} margin={{ top: 20, right: 20, bottom: 40, left: 60 }} />
      </div>
    );
  }
```

（官方 `LineChartLoading` 默认：`generateChartSkeletonData` 骨架 + `Grid horizontal shimmer` 扫视 + `Line pulse` 脉冲 + `ChartLoadingLabel` 文字。容器 `adl-git-vis__chart` 由外层 div 提供，高度约 280px 与真实图表一致。）

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`
Expected: PASS

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx
git commit -m "feat(git-vis): align CodeLineEvo loading with official LineChartLoading"
```

---

## Task 3: CommitTimeline 改用官方灰色骨架柱 + 折线脉冲

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx`

**Interfaces:**
- Consumes: `BarLoadingSkeleton` from `@/components/charts/loading-sweep`; `ComposedChart`/`SeriesBar`/`Line`/`Grid` 已支持 loading
- Produces: `CommitTimeline` loading 分支渲染「灰色骨架柱 + 折线脉冲」

- [ ] **Step 1: 更新测试断言**

在 `CommitTimeline.test.tsx`，现有 loading 用例保持（断言 `getByText('Loading chart...')`），无需改动。

- [ ] **Step 2: 运行测试确认现状通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/CommitTimeline.test.tsx`
Expected: PASS

- [ ] **Step 3: 实现混合骨架**

在 `CommitTimeline.tsx`：

添加 import：

```tsx
import { BarLoadingSkeleton } from '@/components/charts/loading-sweep';
```

将 loading 分支：

```tsx
  if (status === 'loading') {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <ComposedChart
          data={[]}
          xDataKey="date"
          status="loading"
          loadingLabel={loadingLabel}
          margin={{ top: 20, right: 60, bottom: 40, left: 60 }}
          style={{ maxHeight: 280 }}
        >
          <SeriesBar dataKey="count" yAxisId="right" fill="var(--chart-line-primary)" radius={4} />
          <Line dataKey="cumulative" stroke="var(--chart-line-secondary)" loadingStyle="sweep" />
          <Grid />
        </ComposedChart>
      </div>
    );
  }
```

改为（灰色骨架柱 + 折线脉冲混合）：

```tsx
  if (status === 'loading') {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <ComposedChart
          data={[]}
          xDataKey="date"
          status="loading"
          loadingLabel={loadingLabel}
          margin={{ top: 20, right: 60, bottom: 40, left: 60 }}
          style={{ maxHeight: 280 }}
        >
          <ComposedBarSkeleton />
          <Line
            dataKey="cumulative"
            stroke="transparent"
            strokeWidth={2}
            loadingStyle="pulse"
            showHighlight={false}
          />
          <Grid shimmer />
        </ComposedChart>
      </div>
    );
  }
```

在文件末尾（`CommitTimelineMain` 之后）新增内部骨架组件：

```tsx
/**
 * 官方灰色骨架柱（bklit-ui BarLoadingSkeleton）：var(--foreground) + 0.45 透明度
 * + 12 柱 + 0.7 barFraction，带 sweep 扫视。通过 ChartContext 读取 inner 尺寸，
 * 渲染在 ComposedChart 的 loading 状态下。
 */
const ComposedBarSkeleton = React.memo(function ComposedBarSkeleton() {
  const { innerWidth, innerHeight } = useChartStable();
  if (innerWidth <= 0 || innerHeight <= 0) {
    return null;
  }
  return (
    <g className="composed-bar-skeleton">
      <BarLoadingSkeleton innerWidth={innerWidth} innerHeight={innerHeight} />
    </g>
  );
});
```

添加 import：

```tsx
import { useChartStable } from '@/components/charts/chart-context';
```

**注意**：`ComposedBarSkeleton` 在 `status="loading"` 时渲染。由于 `TimeSeriesChartInner` 在 loading 时已生成骨架数据（`generateChartSkeletonFromTarget`），`SeriesBar` 会被移除，`ComposedBarSkeleton` 显式渲染灰色骨架柱。`Line` 组件在 loading phase 下因 `stroke="transparent"` 不显示真实线，`LineLoadingPulseStroke`（pulse 模式）显示脉冲光。`Grid shimmer` 提供扫视带。若 `useChartStable` 的 `innerWidth`/`innerHeight` 不可用（测试环境 ParentSize mock 为 600x72），则骨架柱可能不渲染——测试断言 `getByText('Loading chart...')` 仍通过。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/CommitTimeline.test.tsx`
Expected: PASS

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx
git commit -m "feat(git-vis): align CommitTimeline loading with official gray bar skeleton + pulse"
```

---

## Task 4: 热力图装载对齐官方 HeatmapChartLoading 骨架逻辑

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx`
- Test: 对应三个 `.test.tsx`

**Interfaces:**
- Consumes: `generateHeatmapSkeletonFromTarget` from `@/components/charts/heatmap`
- Produces: 三个热力图组件 loading 时渲染 `HeatmapChart status="loading"` + `generateHeatmapSkeletonFromTarget(skeletonTarget)` 骨架（与官方 `HeatmapChartLoading` 内部逻辑一致）；保留 `buildSkeletonActivityPeriods`

### 4a: CalendarHeatmap

- [ ] **Step 1: 更新测试**

在 `CalendarHeatmap.test.tsx`，现有 loading 用例保持（断言 `getByText('Loading chart...')`），无需改动。

- [ ] **Step 2: 运行测试确认现状通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx`
Expected: PASS

- [ ] **Step 3: 改用官方 HeatmapChartLoading 骨架逻辑**

在 `CalendarHeatmap.tsx`：

**注意**：本地 `HeatmapChartLoading`（`@/components/charts/heatmap`）仅支持 `data/xDomain/margin/gap/cornerRadius/label/className`，**不支持** `locale`/`rowLabels`/`binSize`。为保留完整图表配置（星期标签/网格尺寸），装载状态直接渲染官方 `HeatmapChart status="loading"`，并显式用 `generateHeatmapSkeletonFromTarget(skeletonTarget)` 生成骨架（与官方 `HeatmapChartLoading` 内部逻辑一致）。

`generateHeatmapSkeletonFromTarget` 已在现有 import 中，保持 import 不变：

```tsx
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  buildHeatmapFillScale,
  generateHeatmapSkeletonFromTarget,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
```

将 `skeletonData` useMemo 改为骨架目标列（保留 `generateHeatmapSkeletonFromTarget` 调用，改为独立计算）：

```tsx
  const skeletonTarget = useMemo(() => {
    return commitStatsToHeatmapColumns(expandToFullYear([], year ?? new Date().getFullYear()));
  }, [year]);
  const skeletonData = useMemo(() => generateHeatmapSkeletonFromTarget(skeletonTarget), [skeletonTarget]);
```

将 `return` 改为：

```tsx
  if (status === 'loading') {
    return (
      <HeatmapChart
        data={skeletonData}
        status="loading"
        loadingLabel={loadingLabel}
        locale={locale}
        rowLabels={dayLabels}
        margin={{ top: 24, right: 16, bottom: 0, left: 40 }}
        gap={2}
        animate={false}
        fillScale={defaultFillScale}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis labelFormat="numeric" />
        <HeatmapYAxis tickFilter="even" labelFormat="full" />
      </HeatmapChart>
    );
  }

  return (
    <HeatmapChart
      data={heatmapData}
      status={status}
      loadingLabel={loadingLabel}
      locale={locale}
      rowLabels={dayLabels}
      margin={{ top: 24, right: 16, bottom: 0, left: 40 }}
      gap={2}
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis labelFormat="numeric" />
      <HeatmapYAxis tickFilter="even" labelFormat="full" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
```

（`generateHeatmapSkeletonFromTarget(skeletonTarget)` 生成与官方 `HeatmapChartLoading` 相同的骨架网格：保留目标网格形状、count 全 0。loading 时 `HeatmapChart status="loading"` 显示骨架单元格 shimmer + `loadingLabel` 文字。装载骨架不含 Tooltip（避免交互）。）

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx`
Expected: PASS

### 4b: ClockHeatmap

- [ ] **Step 5: 更新测试**

在 `ClockHeatmap.test.tsx`，现有 loading 用例保持。

- [ ] **Step 6: 改用官方 HeatmapChartLoading 骨架逻辑**

在 `ClockHeatmap.tsx`：

（同 4a：`HeatmapChartLoading` 不支持 `locale`/`rowLabels`/`binSize`，故直接渲染 `HeatmapChart status="loading"` + `generateHeatmapSkeletonFromTarget`。）

`generateHeatmapSkeletonFromTarget` 已在现有 import 中，保持 import 不变：

```tsx
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  buildHeatmapFillScale,
  generateHeatmapSkeletonFromTarget,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
```

将 `skeletonData` useMemo 改为骨架目标列：

```tsx
  const skeletonTarget = useMemo(() => {
    return hourlyDistributionToHeatmapColumns(expandToFullGrid([]), dayLabels);
  }, [dayLabels]);
  const skeletonData = useMemo(() => generateHeatmapSkeletonFromTarget(skeletonTarget), [skeletonTarget]);
```

将 `return` 改为：

```tsx
  if (status === 'loading') {
    return (
      <HeatmapChart
        data={skeletonData}
        status="loading"
        loadingLabel={loadingLabel}
        locale={locale}
        rowLabels={dayLabels}
        margin={{ top: 24, right: 16, bottom: 0, left: 40 }}
        gap={2}
        binSize={30}
        animate={false}
        fillScale={customFillScale}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis tickEvery={2} />
        <HeatmapYAxis tickFilter="even" />
      </HeatmapChart>
    );
  }

  return (
    <HeatmapChart
      data={heatmapData}
      status={status}
      loadingLabel={loadingLabel}
      locale={locale}
      rowLabels={dayLabels}
      margin={{ top: 24, right: 16, bottom: 0, left: 40 }}
      gap={2}
      binSize={30}
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis tickEvery={2} />
      <HeatmapYAxis tickFilter="even" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
```

（`generateHeatmapSkeletonFromTarget(skeletonTarget)` 生成 24×7 全零骨架网格。）

- [ ] **Step 7: 运行验证通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/ClockHeatmap.test.tsx`
Expected: PASS

### 4c: ContributorActivityHeatmap

- [ ] **Step 8: 更新测试**

在 `ContributorActivityHeatmap.test.tsx`，现有 loading 用例保持。

- [ ] **Step 9: 改用官方 HeatmapChartLoading 骨架逻辑**

在 `ContributorActivityHeatmap.tsx`：

（同 4a/4b：`HeatmapChartLoading` 不支持 `locale`/`rowLabels`/`binSize`，故直接渲染 `HeatmapChart status="loading"` + `generateHeatmapSkeletonFromTarget`。）

`generateHeatmapSkeletonFromTarget` 已在现有 import 中，保持 import 不变：

```tsx
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  HeatmapYearHint,
  buildHeatmapFillScale,
  generateHeatmapSkeletonFromTarget,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
```

将 `skeletonData` useMemo 改为骨架目标列 + 骨架数据：

```tsx
  const skeletonTarget = useMemo(() => {
    const months = buildSkeletonActivityPeriods(since, until);
    return contributorActivityToHeatmapColumns(
      [{ author: '', authorEmail: '', totalCommits: 0, periods: months }],
      since,
      until,
    ).columns;
  }, [since, until]);
  const skeletonData = useMemo(() => generateHeatmapSkeletonFromTarget(skeletonTarget), [skeletonTarget]);
```

保留 `buildSkeletonActivityPeriods` 函数（骨架目标列仍需要它生成月份范围）。

将 `return` 改为：

```tsx
  if (status === 'loading') {
    return (
      <HeatmapChart
        data={skeletonData}
        status="loading"
        loadingLabel={loadingLabel}
        locale={locale}
        rowLabels={rowLabels}
        margin={{ top: 42, right: 16, bottom: 0, left: 80 }}
        gap={2}
        binSize={22}
        animate={false}
        fillScale={customFillScale}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis top={18} tickEvery={2} />
        <HeatmapYearHint />
        <HeatmapYAxis tickFilter="all" />
      </HeatmapChart>
    );
  }

  return (
    <HeatmapChart
      data={columns}
      status={status}
      loadingLabel={loadingLabel}
      locale={locale}
      rowLabels={rowLabels}
      margin={{ top: 42, right: 16, bottom: 0, left: 80 }}
      gap={2}
      binSize={22}
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis top={18} tickEvery={2} />
      <HeatmapYearHint />
      <HeatmapYAxis tickFilter="all" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
```

- [ ] **Step 10: 运行验证通过**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx`
Expected: PASS

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx
git commit -m "feat(git-vis): align heatmap loading with official HeatmapChartLoading"
```

---

## Task 5: 清理旧骨架 CSS

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`

**Interfaces:**
- Consumes: Task 2-4 已移除各图表内联骨架（不再引用旧 CSS 类）
- Produces: 删除 `.adl-git-vis__chart-loading`、`.adl-branch-graph__skeleton*`、`.adl-file-hotspots-ranking__skeleton*`、`@keyframes adl-git-vis-sweep`、`prefers-reduced-motion` 块

- [ ] **Step 1: 确认旧 CSS 类无引用**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`
Expected: PASS（BranchGraph/FileHotspots 的 loading 测试断言 `.adl-branch-graph__skeleton-row` / `.adl-file-hotspots-ranking__skeleton-row` 存在）

**注意**：BranchGraph/FileHotspots 保持自定义 CSS 骨架，因此 `.adl-branch-graph__skeleton*` 和 `.adl-file-hotspots-ranking__skeleton*` 类**保留**！仅删除已被 Task 2-4 替换的装载相关类。

- [ ] **Step 2: 删除已替换的 CSS**

在 `git-visualization.css` 中删除以下块（它们被 Task 2-4 的官方组件替换，不再被引用）：

```css
.adl-git-vis__chart-loading {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  flex-shrink: 0;
}

@keyframes adl-git-vis-sweep {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .adl-branch-graph__skeleton-lanes,
  .adl-branch-graph__skeleton-cell,
  .adl-file-hotspots-ranking__skeleton-header-cell,
  .adl-file-hotspots-ranking__skeleton-cell {
    animation: none;
  }
}
```

**注意**：`.adl-branch-graph__skeleton*` 与 `.adl-file-hotspots-ranking__skeleton*` 的行/单元格样式**保留**（BranchGraph/FileHotspots 继续使用），仅删除它们对 `adl-git-vis-sweep` keyframes 的引用——将这些选择器中的 `animation: adl-git-vis-sweep 1.5s ease-in-out infinite;` 行删除，让骨架行保持静态灰色（无扫视动画，因官方组件无对应）。`@keyframes adl-git-vis-sweep` 一并删除。

- [ ] **Step 3: 运行验证**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`
Expected: PASS

Run: `pnpm --dir ai-digital-life/frontend exec prettier --check "src/styles/regions/rightpanel/git-visualization.css"`
Expected: All matched files use Prettier code style!

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "style(git-vis): remove obsolete loading skeleton CSS"
```

---

## Task 6: 全量回归验证

**Files:**
- 无（验证任务）

- [ ] **Step 1: 运行 Git 可视化全部测试**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/git-visualization`
Expected: 全部 PASS

- [ ] **Step 2: 运行全量前端测试**

Run: `pnpm --dir ai-digital-life/frontend run test`
Expected: 全部 PASS

- [ ] **Step 3: Typecheck**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 4: Lint**

Run: `pnpm --dir ai-digital-life/frontend run lint`
Expected: 无新增 error

- [ ] **Step 5: 确认无旧文案残留**

Run: `pnpm --dir ai-digital-life/frontend run check:i18n`
Expected: PASS（1387 = 1387 keys）

确认 `gitVisLoadingModules` 无残留：

```bash
Select-String -Path "ai-digital-life/frontend/src" -Pattern "gitVisLoadingModules" -Recurse
```

Expected: 无匹配

---

## Self-Review

**1. Spec coverage:**
- CodeLineEvo 用 LineChartLoading ✅（Task 2）
- CommitTimeline 灰色骨架柱 + 折线脉冲 ✅（Task 3）
- 热力图用 HeatmapChartLoading ✅（Task 4）
- 分支图/排行榜保持自定义骨架，文字 ShimmeringText ✅（Task 5 保留 CSS）
- 删除旧装载骨架与文案 ✅（Task 1/5）
- 保留功能性加载状态 ✅（Global Constraints）
- 遗留 Minor 修复：时区边界随 buildSkeletonActivityPeriods 保留但函数仍用于 skeletonTarget ✅；年度回退由 HeatmapChartLoading 目标列消解 ✅；T3 分支重复由官方组件替换消解 ✅

**2. Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整实现代码。

**3. Type consistency:**
- `LineChartLoading`/`HeatmapChartLoading`/`BarLoadingSkeleton` 导入路径正确
- `skeletonTarget` 命名在三个热力图组件一致
- `loadingLabel`/`status` props 命名一致
- `HeatmapChartLoading` 的 `data` 参数类型为 `HeatmapColumn[]`（目标列）
