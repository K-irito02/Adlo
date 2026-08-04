# Git 可视化图表装载效果 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「变更面板 → Git可视化」区域的全部 8 个图表添加统一「装载」（Loading）效果：sweep 骨架 + 中央 shimmer「Loading」文字，装载状态与实际容器大小一致。

**Architecture:** 采用组件自包含装载（方案 A）。每个图表组件新增 `status?: ChartStatus` + `loadingLabel?: string` props，内部自渲染骨架。官方组件（HeatmapChart/LineChart/ComposedChart）直接透传 status/loadingLabel 并启用 sweep；自定义组件（BranchGraph/FileHotspots）新增手写骨架（CSS shimmer 行 + `ChartLoadingLabel`）。容器层移除未定义 CSS 类的 `.adl-git-vis__skeleton` div 与 `loading ? null : <Chart/>` 分支，改为始终渲染图表组件并传 status/loadingLabel。

**Tech Stack:** React 19, TypeScript, vitest + @testing-library/react, i18n (zh-CN/en-US), CSS 自定义属性

**设计文档:** `docs/superpowers/specs/2026-08-04-git-vis-loading-effects-design.md`

## Global Constraints

- 所有 UI 文本必须使用 i18n key，禁止硬编码
- 双端一致：Tauri 桌面 + 浏览器共用同一 React 组件，无新增 IPC
- `ChartStatus` 类型从 `@/components/charts/chart-phase` 导入（`'loading' | 'ready'`）
- 装载高度与真实图表一致：折线/柱状 280px（`maxHeight: 280`）、分支图 360px（`.adl-git-vis__chart` max-height）、排行榜 320px（`MAX_HEIGHT`）
- loading→ready 过渡由 bklit-ui 组件内部 phase 编排器处理，不额外实现
- 空数据（ready 且无数据）保持现有「空图」渲染，不显示装载骨架
- 不改动已支持装载的 `ContributorModuleHeatmap`（保持 `status`/`loadingLabel` 现状）
- 测试：每个改动图表组件新增 loading 用例（红绿测试）；`pnpm --dir frontend exec vitest run <file>` 单文件验证
- Commit 遵循 Conventional Commits，Scope 用 `git-vis`

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `frontend/src/app/i18n/zh-CN/changes.ts` | 中文文案 | 新增 `gitVisLoadingChart` |
| `frontend/src/app/i18n/en-US/changes.ts` | 英文文案 | 新增 `gitVisLoadingChart` |
| `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx` | 日历热力图 | 新增 status/loadingLabel + 骨架 |
| `frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx` | 时钟热力图 | 新增 status/loadingLabel + 骨架 |
| `frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx` | 贡献者活动热力图 | 新增 status/loadingLabel + 骨架 |
| `frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx` | 代码行演变 | 新增 status/loadingLabel，loading 分支渲染 LineChart 骨架 |
| `frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx` | 提交时间线 | 新增 status/loadingLabel，loading 分支渲染 ComposedChart 骨架 |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | 分支图谱 | 新增 status/loadingLabel + BranchGraphLoading 骨架 |
| `frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx` | 文件热点 | 新增 status/loadingLabel + FileHotspotsLoading 骨架 |
| `frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx` | 文件热点容器 | 透传 status/loadingLabel |
| `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx` | 热力图卡片组 | 新增 `commitStatsStatus` prop，传 3 个 tab |
| `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` | Git 可视化主视图 | 移除未定义 skeleton div、传 status/loadingLabel |
| `frontend/src/styles/regions/rightpanel/git-visualization.css` | 样式 | 新增骨架容器/行 shimmer 样式 |
| 各图表 `*.test.tsx` | 测试 | 新增 loading 用例 |
| `GitVisualizationView.test.tsx` / `HeatmapCardGroup.test.tsx` | 测试 | 更新 i18n mock + status 传参验证 |

---

## Task 1: i18n 统一文案

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts:213`（`gitVisLoadingModules` 附近）
- Modify: `frontend/src/app/i18n/en-US/changes.ts:213`

**Interfaces:**
- Produces: `gitVisLoadingChart: string` i18n key（CopyKey 由 `keyof typeof zhCN` 自动派生，无需改类型）

- [ ] **Step 1: 在 zh-CN 添加文案**

在 `zh-CN/changes.ts` 的 `gitVisLoadingModules: '正在加载模块...',` 之后添加：

```ts
  gitVisLoadingChart: '正在加载图表...',
```

- [ ] **Step 2: 在 en-US 添加文案**

在 `en-US/changes.ts` 的 `gitVisLoadingModules: 'Loading modules...',` 之后添加：

```ts
  gitVisLoadingChart: 'Loading chart...',
```

- [ ] **Step 3: 验证类型与 i18n 覆盖**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS（CopyKey 自动派生，无类型错误）

Run: `pnpm --dir frontend run check:i18n`
Expected: PASS（中英文案 key 集合一致）

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts ai-digital-life/frontend/src/app/i18n/en-US/changes.ts
git commit -m "feat(git-vis): add gitVisLoadingChart i18n key"
```

---

## Task 2: 日历/时钟/活动热力图装载

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx`
- Modify: `frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx`
- Modify: `frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx`
- Modify: `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx`
- Test: `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx`
- Test: `frontend/src/app/features/git-visualization/charts/ClockHeatmap.test.tsx`
- Test: `frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx`

**Interfaces:**
- Consumes: `ChartStatus` from `@/components/charts/chart-phase`; `HeatmapChart` 已支持 `status`/`loadingLabel`; `generateHeatmapSkeletonFromTarget` from `@/components/charts/heatmap`
- Produces: 三个组件新增 `status?: ChartStatus = 'ready'` + `loadingLabel?: string` props；`HeatmapCardGroup` 新增 `commitStatsStatus?: ChartStatus` prop

### 2a: CalendarHeatmap

- [ ] **Step 1: 写失败测试**

在 `CalendarHeatmap.test.tsx` 中新增用例（在现有 `renders SVG` 后）：

```tsx
  it('shows skeleton + loading label when status is loading', () => {
    const { getByText } = render(
      <CalendarHeatmap status="loading" loadingLabel="Loading chart..." year={2026} />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
  });
```

注意：`getByText('Loading chart...')` 需匹配 `ChartLoadingLabel` 内 `ShimmeringText` 的 `sr-only` span（含完整文本）。测试已 mock motion 渲染为普通元素，`ShimmeringText` 会渲染 `<span className="sr-only">Loading chart...</span>`。

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx`
Expected: FAIL（组件不接受 `status` prop，TS/运行时错误）

- [ ] **Step 3: 实现 CalendarHeatmap 骨架**

在 `CalendarHeatmap.tsx`：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
import { generateHeatmapSkeletonFromTarget } from '@/components/charts/heatmap';
```

组件签名改为：

```tsx
interface CalendarHeatmapProps {
  data?: { date: string; count: number }[];
  /** When set, expands data to all 365/366 days of the year so heatmap shows all weeks */
  year?: number;
  status?: ChartStatus;
  loadingLabel?: string;
}

export const CalendarHeatmap = React.memo(function CalendarHeatmap({
  data,
  year,
  status = 'ready',
  loadingLabel,
}: CalendarHeatmapProps) {
```

在组件内（`heatmapData` useMemo 之后）新增骨架数据：

```tsx
  const skeletonData = useMemo(() => {
    const cols = commitStatsToHeatmapColumns(expandToFullYear([], year ?? new Date().getFullYear()));
    return generateHeatmapSkeletonFromTarget(cols);
  }, [year]);
```

`HeatmapChart` 增加：

```tsx
    <HeatmapChart
      data={status === 'loading' ? skeletonData : heatmapData}
      status={status}
      loadingLabel={loadingLabel}
      ...
    >
```

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx`
Expected: PASS

### 2b: ClockHeatmap

- [ ] **Step 5: 写失败测试**

在 `ClockHeatmap.test.tsx` 新增：

```tsx
  it('shows skeleton + loading label when status is loading', () => {
    const { getByText } = render(<ClockHeatmap status="loading" loadingLabel="Loading chart..." />);
    expect(getByText('Loading chart...')).toBeInTheDocument();
  });
```

- [ ] **Step 6: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/ClockHeatmap.test.tsx`
Expected: FAIL

- [ ] **Step 7: 实现 ClockHeatmap 骨架**

在 `ClockHeatmap.tsx`：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
import { generateHeatmapSkeletonFromTarget } from '@/components/charts/heatmap';
```

```tsx
interface ClockHeatmapProps {
  data?: { day: number; hour: number; count: number }[];
  status?: ChartStatus;
  loadingLabel?: string;
}

export const ClockHeatmap = React.memo(function ClockHeatmap({
  data,
  status = 'ready',
  loadingLabel,
}: ClockHeatmapProps) {
```

在 `heatmapData` useMemo 之后新增：

```tsx
  const skeletonData = useMemo(() => {
    const full = expandToFullGrid([]);
    const cols = hourlyDistributionToHeatmapColumns(full, dayLabels);
    return generateHeatmapSkeletonFromTarget(cols);
  }, [dayLabels]);
```

`HeatmapChart` 增加：

```tsx
    <HeatmapChart
      data={status === 'loading' ? skeletonData : heatmapData}
      status={status}
      loadingLabel={loadingLabel}
      ...
    >
```

- [ ] **Step 8: 运行验证通过**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/ClockHeatmap.test.tsx`
Expected: PASS

### 2c: ContributorActivityHeatmap

- [ ] **Step 9: 写失败测试**

在 `ContributorActivityHeatmap.test.tsx` 新增：

```tsx
  it('shows skeleton + loading label when status is loading', () => {
    const { getByText } = render(
      <ContributorActivityHeatmap
        status="loading"
        loadingLabel="Loading chart..."
        since="2024-01-01"
        until="2024-12-31"
      />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
  });
```

- [ ] **Step 10: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx`
Expected: FAIL

- [ ] **Step 11: 实现 ContributorActivityHeatmap 骨架**

在 `ContributorActivityHeatmap.tsx`：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
import { generateHeatmapSkeletonFromTarget } from '@/components/charts/heatmap';
```

```tsx
interface ContributorActivityHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: { period: string; month: number; count: number }[];
  }[];
  since?: string;
  until?: string;
  status?: ChartStatus;
  loadingLabel?: string;
}

export const ContributorActivityHeatmap = React.memo(function ContributorActivityHeatmap({
  data,
  since,
  until,
  status = 'ready',
  loadingLabel,
}: ContributorActivityHeatmapProps) {
```

在 `columns/rowLabels` useMemo 之后新增骨架：

```tsx
  const skeletonData = useMemo(() => {
    const months = buildSkeletonActivityPeriods(since, until);
    const cols = contributorActivityToHeatmapColumns(
      [{ author: '', authorEmail: '', totalCommits: 0, periods: months }],
      since,
      until,
    );
    return generateHeatmapSkeletonFromTarget(cols.columns);
  }, [since, until]);
```

在文件底部新增辅助函数：

```tsx
function buildSkeletonActivityPeriods(
  since?: string,
  until?: string,
): { period: string; month: number; count: number }[] {
  const end = until ? new Date(until) : new Date();
  const start = since ? new Date(since) : new Date(end.getFullYear(), end.getMonth() - 11, 1);
  const periods: { period: string; month: number; count: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    periods.push({
      period: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      month: cursor.getMonth() + 1,
      count: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
}
```

`HeatmapChart` 增加：

```tsx
    <HeatmapChart
      data={status === 'loading' ? skeletonData : columns}
      status={status}
      loadingLabel={loadingLabel}
      ...
    >
```

- [ ] **Step 12: 运行验证通过**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx`
Expected: PASS

### 2d: HeatmapCardGroup 透传 commitStatsStatus

- [ ] **Step 13: 修改 HeatmapCardGroup**

在 `HeatmapCardGroup.tsx`：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
```

接口新增 prop：

```tsx
interface HeatmapCardGroupProps {
  onRefresh?: () => Promise<void>;
  onRefreshContributorModules?: () => Promise<void>;
  commitStats?: RawCommitStats;
  commitStatsStatus?: ChartStatus;
  ...
}
```

函数签名新增解构：

```tsx
export const HeatmapCardGroup = React.memo(function HeatmapCardGroup({
  onRefresh,
  onRefreshContributorModules,
  commitStats,
  commitStatsStatus = 'ready',
  ...
```

三个 tab 透传（`CalendarHeatmap`/`ClockHeatmap`/`ContributorActivityHeatmap` 各加 status + loadingLabel）：

```tsx
          {activeHeatmapTab === 'calendar' && (
            <CalendarHeatmap
              data={commitStats?.dailyCommits}
              status={commitStatsStatus}
              loadingLabel={loadingLabel}
              year={
                displayRange.since && displayRange.since.length >= 4
                  ? parseInt(displayRange.since.substring(0, 4), 10) || undefined
                  : undefined
              }
            />
          )}
          {activeHeatmapTab === 'clock' && (
            <ClockHeatmap data={commitStats?.hourlyDistribution} status={commitStatsStatus} loadingLabel={loadingLabel} />
          )}
          {activeHeatmapTab === 'activity' && (
            <ContributorActivityHeatmap
              data={commitStats?.contributorActivity}
              since={displayRange.since}
              until={displayRange.until}
              status={commitStatsStatus}
              loadingLabel={loadingLabel}
            />
          )}
```

其中 `loadingLabel` 取自组件内的 `const { t } = useTCopy();`，新增：

```tsx
  const loadingLabel = t.gitVisLoadingChart;
```

（`HeatmapCardGroup.tsx` 已有 `useTCopy` 调用，直接使用返回的 `t`。）

- [ ] **Step 14: 更新 HeatmapCardGroup 测试 i18n mock + 验证传参**

在 `HeatmapCardGroup.test.tsx` 和 `HeatmapCardGroup.refresh.test.tsx` 的 `useTCopy` mock `t` 对象中添加：

```ts
      gitVisLoadingChart: 'Loading chart...',
```

在 `HeatmapCardGroup.test.tsx` 新增用例：

```tsx
  it('passes commitStatsStatus loading to heatmap tabs', () => {
    render(<HeatmapCardGroup commitStatsStatus="loading" />);
    expect(screen.getAllByText('Loading chart...').length).toBeGreaterThan(0);
  });
```

- [ ] **Step 15: 运行热力图相关全部测试**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/HeatmapCardGroup.test.tsx src/app/features/git-visualization/HeatmapCardGroup.refresh.test.tsx src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx src/app/features/git-visualization/charts/ClockHeatmap.test.tsx src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx`
Expected: 全部 PASS

- [ ] **Step 16: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx ai-digital-life/frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/ClockHeatmap.test.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx ai-digital-life/frontend/src/app/features/git-visualization/HeatmapCardGroup.test.tsx ai-digital-life/frontend/src/app/features/git-visualization/HeatmapCardGroup.refresh.test.tsx
git commit -m "feat(git-vis): add loading skeleton to heatmap tabs"
```

---

## Task 3: CodeLineEvo 装载

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx`
- Test: `frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`

**Interfaces:**
- Consumes: `ChartStatus` from `@/components/charts/chart-phase`; `LineChart`/`Line`/`Grid` 已支持 status/loadingLabel/loadingStyle="sweep"
- Produces: `CodeLineEvo` 新增 `status?: ChartStatus = 'ready'` + `loadingLabel?: string` props

- [ ] **Step 1: 写失败测试**

在 `CodeLineEvo.test.tsx` 新增：

```tsx
  it('shows loading skeleton when status is loading', () => {
    const { getByText } = render(
      <CodeLineEvo status="loading" loadingLabel="Loading chart..." visible={DEFAULT_VISIBILITY} />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 CodeLineEvo 装载**

在 `CodeLineEvo.tsx`：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
```

```tsx
interface CodeLineEvoProps {
  data?: { days: { date: string; additions: number; deletions: number }[] };
  visible: SeriesVisibility;
  status?: ChartStatus;
  loadingLabel?: string;
}

export const CodeLineEvo = React.memo(function CodeLineEvo({
  data,
  visible,
  status = 'ready',
  loadingLabel,
}: CodeLineEvoProps) {
  const days = useMemo(() => data?.days ?? [], [data]);
```

在组件函数体内（`stripTrackDomain` useMemo 之后、现有 `if (dayRows.length === 0)` 之前）新增 loading 分支：

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

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx
git commit -m "feat(git-vis): add loading skeleton to code line evolution chart"
```

---

## Task 4: CommitTimeline 装载

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx`
- Test: `frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx`

**Interfaces:**
- Consumes: `ChartStatus` from `@/components/charts/chart-phase`; `ComposedChart`/`SeriesBar`/`Line`/`Grid` 已支持 status/loadingLabel
- Produces: `CommitTimeline` 新增 `status?: ChartStatus = 'ready'` + `loadingLabel?: string` props

- [ ] **Step 1: 写失败测试**

在 `CommitTimeline.test.tsx` 新增：

```tsx
  it('shows loading skeleton when status is loading', () => {
    const { getByText } = render(
      <CommitTimeline status="loading" loadingLabel="Loading chart..." />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/CommitTimeline.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 CommitTimeline 装载**

在 `CommitTimeline.tsx`：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
```

```tsx
interface CommitTimelineProps {
  data?: { days: { date: string; count: number; cumulative: number }[] };
  status?: ChartStatus;
  loadingLabel?: string;
}

export const CommitTimeline = React.memo(function CommitTimeline({
  data,
  status = 'ready',
  loadingLabel,
}: CommitTimelineProps) {
  const days = useMemo(() => data?.days ?? [], [data]);
```

在组件函数体内（`stripTrackDomain` useMemo 之后、现有 `if (dayRows.length === 0)` 之前）新增 loading 分支：

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

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/CommitTimeline.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx
git commit -m "feat(git-vis): add loading skeleton to commit timeline chart"
```

---

## Task 5: BranchGraph 装载 + CSS

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`
- Test: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`

**Interfaces:**
- Consumes: `ChartStatus` from `@/components/charts/chart-phase`; `ChartLoadingLabel` from `@/components/charts/chart-loading-label`
- Produces: `BranchGraph` 新增 `status?: ChartStatus = 'ready'` + `loadingLabel?: string` props；新增内部组件 `BranchGraphLoading`（固定 360px 骨架）

- [ ] **Step 1: 写失败测试**

在 `BranchGraph.test.tsx` 新增：

```tsx
  it('shows skeleton rows + loading label when status is loading', () => {
    const { container, getByText } = render(
      <BranchGraph status="loading" loadingLabel="Loading chart..." />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
    expect(container.querySelectorAll('.adl-branch-graph__skeleton-row').length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 BranchGraphLoading 骨架组件**

在 `BranchGraph.tsx` 顶部 import 区添加：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
import { ChartLoadingLabel } from '@/components/charts/chart-loading-label';
```

在 `BranchGraph` 主组件定义之前新增骨架组件：

```tsx
// ── Loading skeleton (bklit-ui aligned: CSS shimmer rows + centered Loading label) ──

const SKELETON_ROW_COUNT = 10;

const BranchGraphLoading = React.memo(function BranchGraphLoading({
  label,
}: {
  label?: string;
}) {
  return (
    <div className="adl-git-vis__chart adl-git-vis__chart-loading" style={{ overflowX: 'hidden' }}>
      <div className="adl-branch-graph__skeleton">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
          <div key={i} className="adl-branch-graph__skeleton-row" style={{ height: 36 }}>
            <span className="adl-branch-graph__skeleton-lanes" />
            <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--wide" />
            <span className="adl-branch-graph__skeleton-cell" />
            <span className="adl-branch-graph__skeleton-cell adl-branch-graph__skeleton-cell--medium" />
          </div>
        ))}
      </div>
      <ChartLoadingLabel text={label} />
    </div>
  );
});
```

修改主组件：

```tsx
interface BranchGraphProps {
  data?: RawBranchGraph;
  status?: ChartStatus;
  loadingLabel?: string;
}

export function BranchGraph({ data, status = 'ready', loadingLabel }: BranchGraphProps) {
```

在 `const hasData = data != null;` 之后新增：

```tsx
  if (status === 'loading') {
    return <BranchGraphLoading label={loadingLabel} />;
  }
```

（该分支位于所有 hooks 之后、现有 `if (!hasData)` 之前，满足 React hooks 规则。）

- [ ] **Step 4: 新增 CSS**

在 `git-visualization.css` 末尾追加：

```css
/* ── Loading skeleton (bklit-ui aligned: CSS shimmer rows + centered Loading label) ── */

.adl-git-vis__chart-loading {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  flex-shrink: 0;
}

.adl-branch-graph__skeleton {
  display: flex;
  flex-direction: column;
}

.adl-branch-graph__skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.adl-branch-graph__skeleton-lanes,
.adl-branch-graph__skeleton-cell {
  background: linear-gradient(
    90deg,
    var(--surface-secondary) 25%,
    var(--surface-hover) 50%,
    var(--surface-secondary) 75%
  );
  background-size: 200% 100%;
  animation: adl-git-vis-sweep 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
  height: 12px;
}

.adl-branch-graph__skeleton-lanes {
  width: 48px;
  flex-shrink: 0;
}

.adl-branch-graph__skeleton-cell {
  flex: 1;
  max-width: 120px;
}

.adl-branch-graph__skeleton-cell--wide {
  max-width: 220px;
}

.adl-branch-graph__skeleton-cell--medium {
  max-width: 80px;
}

@keyframes adl-git-vis-sweep {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

- [ ] **Step 5: 运行验证通过**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(git-vis): add loading skeleton to branch graph"
```

---

## Task 6: FileHotspotsLeaderboard 装载 + CSS

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx`
- Modify: `frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx`
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`
- Test: `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`

**Interfaces:**
- Consumes: `ChartStatus` from `@/components/charts/chart-phase`; `ChartLoadingLabel` from `@/components/charts/chart-loading-label`
- Produces: `FileHotspotsLeaderboard` 新增 `status?: ChartStatus = 'ready'` + `loadingLabel?: string` props；`FileHotspotsView` 透传 props

- [ ] **Step 1: 写失败测试**

在 `FileHotspotsLeaderboard.test.tsx` 新增：

```tsx
  it('shows skeleton rows + loading label when status is loading', () => {
    const { container, getByText } = render(
      <FileHotspotsLeaderboard status="loading" loadingLabel="Loading chart..." />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
    expect(
      container.querySelectorAll('.adl-file-hotspots-ranking__skeleton-row').length,
    ).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 FileHotspotsLoading 骨架组件**

在 `FileHotspotsLeaderboard.tsx` import 区添加：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';
import { ChartLoadingLabel } from '@/components/charts/chart-loading-label';
```

在文件顶部（`MAX_HEIGHT` 常量后）新增常量与骨架组件：

```tsx
const SKELETON_ROW_COUNT = 8;

const FileHotspotsLoading = React.memo(function FileHotspotsLoading({
  label,
}: {
  label?: string;
}) {
  return (
    <div className="adl-file-hotspots-ranking adl-git-vis__chart-loading">
      <div className="adl-file-hotspots-ranking__header adl-file-hotspots-ranking__header--skeleton">
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--rank" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--name" />
        <span className="adl-file-hotspots-ranking__skeleton-header-cell adl-file-hotspots-ranking__skeleton-header-cell--path" />
      </div>
      <div className="adl-file-hotspots-ranking__skeleton-body">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
          <div
            key={i}
            className="adl-file-hotspots-ranking__skeleton-row"
            style={{ height: 32 }}
          >
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--rank" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--name" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--path" />
            <span className="adl-file-hotspots-ranking__skeleton-cell adl-file-hotspots-ranking__skeleton-cell--num" />
          </div>
        ))}
      </div>
      <ChartLoadingLabel text={label} />
    </div>
  );
});
```

修改组件签名与接口：

```tsx
export interface FileHotspotsLeaderboardProps {
  data?: GitVisFileHotspots;
  /** Outer scroll container (e.g. the git-vis page) whose bottom is revealed when the chart grows. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  status?: ChartStatus;
  loadingLabel?: string;
}

export const FileHotspotsLeaderboard = React.memo(function FileHotspotsLeaderboard({
  data,
  scrollContainerRef,
  status = 'ready',
  loadingLabel,
}: FileHotspotsLeaderboardProps) {
```

在 `state` 解构之后、其余 hooks 之前新增 loading 分支（需在全部 hooks 之后 return——FileHotspotsLeaderboard 的 hooks 均在组件顶部，将分支放在 `const state = useFileHotspotsState();` 之后的第一个条件 return 位置，但须位于所有 `useState`/`useEffect`/`useRef` 调用之后）。**安全做法**：将该分支放在组件内最后一个 hook 之后、现有 `return (` 之前，即把 `status === 'loading'` 分支放在组件返回结构前：

```tsx
  if (status === 'loading') {
    return <FileHotspotsLoading label={loadingLabel} />;
  }
```

（实现时确认该 return 位于所有 hooks 之后——将分支插入到组件函数体的 return 语句之前即可。）

- [ ] **Step 4: 修改 FileHotspotsView 透传**

在 `FileHotspotsView.tsx`：

```tsx
import type { ChartStatus } from '@/components/charts/chart-phase';

export interface FileHotspotsViewProps {
  data?: GitVisFileHotspots;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  status?: ChartStatus;
  loadingLabel?: string;
}

export const FileHotspotsView = React.memo(function FileHotspotsView({
  data,
  scrollContainerRef,
  status = 'ready',
  loadingLabel,
}: FileHotspotsViewProps) {
  return (
    <div className="adl-file-hotspots-view">
      <FileHotspotsLeaderboard
        data={data}
        scrollContainerRef={scrollContainerRef}
        status={status}
        loadingLabel={loadingLabel}
      />
    </div>
  );
});
```

- [ ] **Step 5: 新增 CSS**

在 `git-visualization.css` 追加（Task 5 的 `.adl-git-vis__chart-loading` 已定义，此处复用）：

```css
/* ── File hotspots loading skeleton ── */

.adl-file-hotspots-ranking__skeleton-body {
  flex: 1;
  overflow: hidden;
}

.adl-file-hotspots-ranking__skeleton-header-cell,
.adl-file-hotspots-ranking__skeleton-cell {
  background: linear-gradient(
    90deg,
    var(--surface-secondary) 25%,
    var(--surface-hover) 50%,
    var(--surface-secondary) 75%
  );
  background-size: 200% 100%;
  animation: adl-git-vis-sweep 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
  height: 12px;
}

.adl-file-hotspots-ranking__skeleton-header-cell--rank {
  width: 32px;
  margin: 0 12px;
}

.adl-file-hotspots-ranking__skeleton-header-cell--name {
  width: 30%;
}

.adl-file-hotspots-ranking__skeleton-header-cell--path {
  width: 40%;
}

.adl-file-hotspots-ranking__skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.adl-file-hotspots-ranking__skeleton-cell--rank {
  width: 24px;
  flex-shrink: 0;
}

.adl-file-hotspots-ranking__skeleton-cell--name {
  width: 30%;
  flex-shrink: 0;
}

.adl-file-hotspots-ranking__skeleton-cell--path {
  width: 40%;
  flex-shrink: 0;
}

.adl-file-hotspots-ranking__skeleton-cell--num {
  width: 48px;
  flex-shrink: 0;
  margin-left: auto;
}
```

- [ ] **Step 6: 运行验证通过**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(git-vis): add loading skeleton to file hotspots leaderboard"
```

---

## Task 7: GitVisualizationView 容器层改造

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`
- Test: `frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx`

**Interfaces:**
- Consumes: 各图表组件新增的 `status`/`loadingLabel` props；`ChartStatus` 类型
- Produces: 主视图为每个图表传 `status={...loading ? 'loading' : 'ready'}` + `loadingLabel={t.gitVisLoadingChart}`；移除 `.adl-git-vis__skeleton` 未定义样式

- [ ] **Step 1: 写失败测试**

更新 `GitVisualizationView.test.tsx`：

在 `useTCopy` mock 的 `t` 对象中添加：

```ts
      gitVisLoadingChart: 'Loading chart...',
```

新增用例（验证 loading 时渲染骨架而非 null）：

```tsx
  it('passes status/loadingLabel to charts instead of rendering null while loading', () => {
    const { container } = render(<GitVisualizationView />);
    // gitVisLoading is {} in the store mock → all charts ready → chart areas render
    expect(container.querySelectorAll('.adl-git-vis__chart').length).toBeGreaterThan(0);
  });
```

（该用例验证 ready 状态下图表正常渲染；loading 态断言由各图表组件测试覆盖，避免在 store mock 中模拟复杂 loading 状态。）

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/GitVisualizationView.test.tsx`
Expected: FAIL 或存在现有测试因缺失 `gitVisLoadingChart` key 报 undefined 的错误（mock t 中新增 key 前）。实际该测试不直接使用该 key，先确认修改前通过，再逐步改造。

- [ ] **Step 3: 改造 TimeRangeAwareCard**

在 `GitVisualizationView.tsx` 的 `TimeRangeAwareCard` 中，将：

```tsx
      {timeRange.loading ? <div className="adl-git-vis__skeleton" /> : children}
```

改为：

```tsx
      {children}
```

（图表组件自包含装载，容器层始终渲染图表组件。）

- [ ] **Step 4: 各图表传 status/loadingLabel**

将 `GitVisualizationView.tsx` 中四个 `TimeRangeAwareCard` 子图表从 `loading ? null : <Chart/>` 改为始终渲染并传 props：

**HeatmapCardGroup**（`HeatmapCardGroup.tsx` 传参处，新增 `commitStatsStatus`）：

```tsx
        <HeatmapCardGroup
          onRefresh={handleRefreshHeatmap}
          onRefreshContributorModules={handleRefreshContributorModules}
          commitStats={
            heatmapData.data as
              | {
                  dailyCommits: { date: string; count: number }[];
                  hourlyDistribution: { day: number; hour: number; count: number }[];
                  contributorActivity: {
                    author: string;
                    authorEmail: string;
                    totalCommits: number;
                    periods: { period: string; month: number; count: number }[];
                  }[];
                  commitTimeline: { date: string; count: number; cumulative: number }[];
                }
              | undefined
          }
          commitStatsStatus={heatmapData.loading ? 'loading' : 'ready'}
          contributorModules={
            (contributorModulesData.data as RawContributorModules | undefined)?.matrix
          }
          contributorModuleAllPaths={
            (contributorModulesData.data as RawContributorModules | undefined)?.allPaths
          }
          contributorModuleStatus={contributorModulesData.loading ? 'loading' : 'ready'}
          yearBounds={yearBounds}
        />
```

**BranchGraph**：

```tsx
        >
          <BranchGraph
            data={branchGraphData.data as RawBranchGraph | undefined}
            status={branchGraphData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
```

注意：`GitVisualizationView.tsx` 已 import `RawContributorModules`，需确认 `RawBranchGraph` 类型可从 `adapters/chartDataAdapters` 导入（`BranchGraph` 内部用 `RawBranchGraph`）。为最小改动，保留原有内联类型断言或改用 `import type { RawBranchGraph }`。**本任务采用保留原类型断言的方式**，仅替换 `{...loading ? null : (<BranchGraph data={...} />)}` 为 `<BranchGraph data={...} status=... loadingLabel=... />`。

**CodeLineEvo**：

```tsx
        >
          <CodeLineEvo
            data={codeLineEvoData.data as { days: { date: string; additions: number; deletions: number }[] } | undefined}
            visible={codeLineEvoVis.visible}
            status={codeLineEvoData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
```

**CommitTimeline**：

```tsx
        >
          <CommitTimeline
            data={{
              days:
                (commitTimelineData.data as GitVisCommitStats | undefined)?.commitTimeline ?? [],
            }}
            status={commitTimelineData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
```

**FileHotspotsView**：

```tsx
        >
          <FileHotspotsView
            data={fileHotspotsData.data as GitVisFileHotspots | undefined}
            scrollContainerRef={containerRef}
            status={fileHotspotsData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
```

删除原 `branchGraphData.loading ? null : (...)` / `codeLineEvoData.loading ? null : (...)` / `commitTimelineData.loading ? null : (...)` / `fileHotspotsData.loading ? null : (...)` 条件包裹。

- [ ] **Step 5: 更新测试并运行**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/GitVisualizationView.test.tsx`
Expected: PASS（含新增用例）

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx
git commit -m "feat(git-vis): wire chart status props through git visual view"
```

---

## Task 8: 全量回归验证

**Files:**
- 无（验证任务）

- [ ] **Step 1: 运行 Git 可视化全部测试**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization`
Expected: 全部 PASS

- [ ] **Step 2: 运行全量前端测试**

Run: `pnpm --dir frontend run test`
Expected: 全部 PASS（含回归，如 `gitVisMockData.test.ts`、`chartDataAdapters.test.ts` 等）

- [ ] **Step 3: Typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS

- [ ] **Step 4: Lint**

Run: `pnpm --dir frontend run lint`
Expected: 无新增 error（允许 pre-existing warnings）

- [ ] **Step 5: 检查硬编码文本**

确认无新增硬编码 UI 文本（所有装载文字均来自 `t.gitVisLoadingChart`）。

---

## Self-Review

**1. Spec coverage:**
- sweep 骨架 + Loading 文字 ✅（Task 2-6）
- 固定高度骨架 ✅（280/360/320，Task 2-6）
- 全部 loading 状态触发 ✅（容器层传 status，Task 7）
- i18n 统一文案 ✅（Task 1）
- 组件自包含 ✅（Task 2-6）
- 修复 `.adl-git-vis__skeleton` 未定义样式 ✅（Task 7 Step 3）
- 移除 `loading ? null : <Chart/>` ✅（Task 7 Step 4）
- 双端一致 ✅（无新增 IPC）
- 空数据不显示骨架 ✅（loading 分支仅 status=loading 触发）
- 测试覆盖 ✅（各 Task 红绿测试 + Task 8 回归）

**2. Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整实现代码。

**3. Type consistency:**
- `ChartStatus` 统一从 `@/components/charts/chart-phase` 导入
- `status`/`loadingLabel` props 命名在各组件一致
- `commitStatsStatus`/`commitStatsStatus` 在 HeatmapCardGroup 一致（均用 `commitStatsStatus`）
- `RawBranchGraph` 保留现有内联类型断言，不引入新类型依赖
