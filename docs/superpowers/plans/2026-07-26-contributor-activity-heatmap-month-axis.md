# Contributor Activity Heatmap — x 轴月份化改造 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将贡献活跃度热力图 x 轴从周改为月，添加零填充和跨年年份提示

**Architecture:** 后端 Rust 在 `GitVisContributorPeriod` 增加 `month` 字段、改变 period key 格式为 `YYYY-MM`；前端适配器改为按月聚合 + 零填充，新建 `HeatmapYearHint` 组件渲染年份标签，`HeatmapXAxis` 增加 `top` 偏移属性支持两层 portal 布局。

**Tech Stack:** Rust (serde), React 19, TypeScript, Zustand, visx

**Flow:** `git log → backend capture_commit_stats (period: "2026-01", month: 1) → frontend adapter (按月聚合+零填充, bins.date=每月1日, 无columnLabel) → HeatmapXAxis (月份锚点路径 → "Jan"/"Feb") + HeatmapYearHint (跨年时显示 "2025"/"2026")`

## Global Constraints

- 不改动 CalendarHeatmap、ClockHeatmap、ContributorModuleHeatmap 的 x 轴逻辑
- `HeatmapXAxis` 的 `top` prop 默认值 `0`，向后兼容
- 年份提示仅数据跨多年时渲染
- `since`/`until` 由 `ContributorActivityHeatmap` prop 传入适配器
- `since` 为 undefined（"全部"预设）时，从数据本身的 min/max month 推断范围

---

### Task 1: Backend — 类型增加 `month` 字段

**Files:**
- Modify: `crates/types/src/types/git_visualization.rs:30-35`
- Build: `cargo build -p adl-types`

**Interfaces:**
- Produces: `GitVisContributorPeriod { period: String, month: i32, count: i32 }`

- [ ] **Step 1: 修改 `GitVisContributorPeriod`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorPeriod {
    pub period: String,
    pub month: i32,
    pub count: i32,
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cargo build -p adl-types`
Expected: 编译成功，无警告

---

### Task 2: Backend — `commit_stats.rs` 补 month + 改 period key

**Files:**
- Modify: `crates/workspace/src/git/git_vis/commit_stats.rs:123-152, 73-79`

**Interfaces:**
- Consumes: `GitVisContributorPeriod` (新增 `month` 字段)
- Produces: `period` key 格式从 `YYYY-W{week}` 改为 `YYYY-{month:02}`，`GitVisContributorPeriod.month` 填充值

- [ ] **Step 1: 修改 `DateParts` 结构体**

```rust
struct DateParts {
    year: i32,
    month: i32,
    week: i32,
    day_of_week: i32,
    hour: i32,
}
```

- [ ] **Step 2: 修改 `parse_date_parts` 存 month**

`parse_date_parts` 已解析 `let month: u32 = s[5..7].parse().ok()?;`（第136行），在返回 `DateParts` 时补上：
```rust
Some(DateParts { year, month: month as i32, week, day_of_week, hour })
```

- [ ] **Step 3: 修改 `capture_commit_stats` 中的 period key**

将第 73-78 行：
```rust
let week_key = if let Some(dt) = parse_date_parts(&c.date) {
    format!("{}-W{:02}", dt.year, dt.week)
} else {
    date10.clone()
};
*entry.2.entry(week_key.clone()).or_insert(0) += 1;
```
改为：
```rust
let month_key = if let Some(dt) = parse_date_parts(&c.date) {
    format!("{}-{:02}", dt.year, dt.month)
} else {
    date10.clone()
};
*entry.2.entry(month_key.clone()).or_insert(0) += 1;
```

同时修改第 97-100 行构造 `GitVisContributorPeriod` 处，传入 `month`：
```rust
.into_iter()
.map(|(period, count)| {
    let month = period.rsplit_once('-')
        .and_then(|(_, m)| m.parse().ok())
        .unwrap_or(1);
    GitVisContributorPeriod { period, month, count }
})
.collect(),
```

- [ ] **Step 4: 验证编译 & Rust 测试**

Run: `cargo test --workspace`
Expected: 测试全部通过

---

### Task 3: Frontend — `HeatmapXAxis` 增加 `top` prop

**Files:**
- Modify: `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx:9-20, 22-26, 87-108`

- [ ] **Step 1: 新增 `top` prop**

```typescript
export interface HeatmapXAxisProps {
  className?: string;
  tickEvery?: number;
  labelFormat?: 'short' | 'numeric';
  /** Vertical offset from container top in px. Default: 0 */
  top?: number;
}
```

组件参数解构添加默认值：
```typescript
top = 0,
```

- [ ] **Step 2: 在 portal style 中使用 top**

将 `style={{ top: 0, left: tick.x }}` 改为 `style={{ top, left: tick.x }}`

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

---

### Task 4: Frontend — 新建 `HeatmapYearHint` 组件

**Files:**
- Create: `frontend/src/components/charts/heatmap/heatmap-year-hint.tsx`

**Interfaces:**
- Consumes: `useHeatmap()` context (data, xScale, margin, containerRef)
- Produces: 年份提示 portal DOM 节点

- [ ] **Step 1: 创建 `heatmap-year-hint.tsx`**

```typescript
'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHeatmap } from './heatmap-context';

export const HeatmapYearHint = memo(function HeatmapYearHint() {
  const { data, margin, xScale, containerRef } = useHeatmap();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const yearTicks = useMemo(() => {
    const ticks: { year: number; x: number; key: string }[] = [];
    let lastYear: number | null = null;
    let firstYear: number | null = null;

    for (let i = 0; i < data.length; i++) {
      const column = data[i];
      const firstBin = column?.bins[0];
      if (!firstBin?.date) continue;
      const year = firstBin.date.getFullYear();
      if (firstYear === null) firstYear = year;
      if (year !== lastYear) {
        ticks.push({ year, x: margin.left + xScale(i), key: `year-${year}` });
        lastYear = year;
      }
    }

    // 只跨多年时显示
    if (firstYear !== null && lastYear !== null && firstYear === lastYear) {
      return [];
    }
    return ticks;
  }, [data, margin.left, xScale]);

  const container = containerRef.current;
  if (!(mounted && container)) return null;

  return createPortal(
    yearTicks.map((tick) => (
      <div
        className="pointer-events-none absolute"
        key={tick.key}
        style={{ top: 0, left: tick.x }}
      >
        <span className="text-chart-label text-xs whitespace-nowrap">
          {tick.year}
        </span>
      </div>
    )),
    container,
  );
});
```

- [ ] **Step 2: 在 `index.ts` 添加导出**

```typescript
// heatmap/index.ts
export { HeatmapYearHint } from './heatmap-year-hint';
```

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

---

### Task 5: Frontend — 修改适配器为按月聚合 + 零填充

**Files:**
- Modify: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts:102-124`

**Interfaces:**
- Consumes: `contributorActivity: RawCommitStats['contributorActivity']` (含新 `month` 字段), `since?: string`, `until?: string`
- Produces: `{ columns: HeatmapColumn[], rowLabels: string[] }` — 按月列，零填充，无 `columnLabel`

- [ ] **Step 1: 更新 `RawCommitStats` 中的 `periods` 类型**

```typescript
// chartDataAdapters.ts:8-14
export interface RawCommitStats {
  dailyCommits: { date: string; count: number }[];
  hourlyDistribution: { day: number; hour: number; count: number }[];
  contributorActivity: {
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: { period: string; month: number; count: number }[];
  }[];
  commitTimeline: { date: string; cumulative: number }[];
}
```

- [ ] **Step 2: 重写 `contributorActivityToHeatmapColumns`**

```typescript
export function contributorActivityToHeatmapColumns(
  contributorActivity: RawCommitStats['contributorActivity'],
  since?: string,
  until?: string,
): { columns: HeatmapColumn[]; rowLabels: string[] } {
  const rowLabels = contributorActivity.map((c) => c.author);

  // 按 (period: "YYYY-MM") 收集每个贡献者的月度提交数
  const periodSet = new Set<string>();
  const dataByAuthor = contributorActivity.map((c) => {
    const periodMap = new Map<string, number>();
    for (const p of c.periods) {
      periodMap.set(p.period, p.count);
      periodSet.add(p.period);
    }
    return periodMap;
  });

  // 推导完整月份范围
  const minPeriod = since ? since.substring(0, 7) : [...periodSet].sort()[0];
  const maxPeriod = until ? until.substring(0, 7) : [...periodSet].sort().reverse()[0];
  if (!minPeriod || !maxPeriod) {
    return { columns: [], rowLabels };
  }

  // 生成连续月份序列
  const periods = generateMonthRange(minPeriod, maxPeriod);

  const columns: HeatmapColumn[] = periods.map((period, colIdx) => {
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const date = new Date(year, month - 1, 1);

    return {
      bin: colIdx,
      bins: contributorActivity.map((c, rowIdx) => ({
        count: dataByAuthor[rowIdx].get(period) ?? 0,
        bin: rowIdx,
        date,
        tooltipTitle: new Intl.DateTimeFormat('default', { year: 'numeric', month: 'long' }).format(date),
        tooltipSubtitle: c.author,
      })),
    };
  });

  return { columns, rowLabels };
}

function generateMonthRange(from: string, to: string): string[] {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  const result: string[] = [];
  let y = y1, m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}
```

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

---

### Task 6: Frontend — 更新 `ContributorActivityHeatmap` + `HeatmapCardGroup`

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx`
- Modify: `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx`

**Interfaces:**
- Consumes: `RawCommitStats['contributorActivity']`, `since`, `until` from time range
- Produces: 渲染月份模式热力图 + 年份提示

- [ ] **Step 1: 修改 `ContributorActivityHeatmap.tsx`**

```typescript
import { HeatmapYearHint } from '@/components/charts/heatmap';

interface ContributorActivityHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: { period: string; month: number; count: number }[];
  }[];
  since?: string;
  until?: string;
}

export const ContributorActivityHeatmap = React.memo(function ContributorActivityHeatmap({
  data,
  since,
  until,
}: ContributorActivityHeatmapProps) {
  const { t, locale } = useTCopy();
  const { columns, rowLabels } = useMemo(
    () => (data ? contributorActivityToHeatmapColumns(data, since, until) : { columns: [], rowLabels: [] }),
    [data, since, until],
  );

  // ... 其他不变 ...

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={columns}
        locale={locale}
        rowLabels={rowLabels}
        margin={{ top: 46, right: 16, bottom: 0, left: 80 }}
        gap={2}
        binSize={22}
        animate={true}
        fillScale={customFillScale}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis top={16} />
        <HeatmapYearHint />
        <HeatmapYAxis tickFilter="all" />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
```

- [ ] **Step 2: 修改 `HeatmapCardGroup.tsx` 传递时间范围**

在第 201-203 行附近：
```tsx
{activeHeatmapTab === 'activity' && (
  <ContributorActivityHeatmap
    data={commitStats?.contributorActivity}
    since={currentRange.since}
    until={currentRange.until}
  />
)}
```

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

---

### Task 7: Frontend — 更新 mock 数据 + 已有测试

**Files:**
- Modify: `frontend/src/mock/mock-workspace.ts:399-403`
- Modify: 已有测试文件中的 mock 数据引用

**Interfaces:**
- Ensure: `mock-workspace.ts` 中的 `gitVisCommitStats` mock 使用新 period 格式 `"2026-01"` 并包含 `month` 字段

- [ ] **Step 1: 更新 mock 数据**

```typescript
contributorActivity: contributorNames.map((author, i) => ({
  author, authorEmail: `${author.toLowerCase()}@example.com`,
  totalCommits: 10 - i,
  periods: [{ period: '2026-01', month: 1, count: 3 }, { period: '2026-02', month: 2, count: 2 }],
})),
```

- [ ] **Step 2: 运行前端测试，修复失败的 mock 依赖**

Run: `cd frontend && pnpm run test`
Expected: 测试全部通过，若 mock 数据变更导致 snapshot 失败则更新 snapshot

---

### Task 8: 全面验证

- [ ] **全部 Rust 测试**

Run: `cargo test --workspace`
Expected: 全部通过（534+ 测试）

- [ ] **全部前端测试**

Run: `cd frontend && pnpm run test`
Expected: 全部通过（665+ 测试）

- [ ] **TypeScript 编译检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Lint**

Run: `cd frontend && npx eslint .`
Expected: 0 errors（允许已有 warnings）

- [ ] **Clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings
