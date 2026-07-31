# Git 可视化图表重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"代码行演变"改为发散面积 + 净增长线、将"提交时间线"改为累计线 + 每周柱状，并为两图接入"按所选区间自适应 天/周/月 粒度"的单期值缩略条。

**Architecture:** 后端 `commit_stats.rs` 由周/逐提交聚合改为**按天**产出（`GitVisCodeEvolution{ days }`、`GitVisTimelinePoint{ date, count, cumulative }`）；前端适配层新增 `resolveGranularity` + 聚合函数，一次取数前端重聚合、零额外请求；图表基于 bklit-ui 本地副本（`frontend/src/components/charts/`），从上游 `github.com/bklit/bklit-ui` 移植官方 `Area` / `ComposedChart` / `SeriesBar` 组件并做 `baseline="zero"` 等针对性改造。

**Tech Stack:** Rust（rusqlite/tokio/ts-rs）、React 19 + TypeScript + visx + motion、bklit-ui（本地 vendored 副本 + `references/bklit-ui` 上游参考副本）。

## Global Constraints

- 双端一致：Tauri 与浏览器模式均需可用（`tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 无需新增 IPC，仅数据结构变化）。
- 任何 UI 展示文本必须使用 i18n key（本计划涉及 `gitVisCodeLineEvoDesc` / `gitVisCommitTimelineDesc`，zh-CN 与 en-US 同步）。
- 移植官方组件需遵守 MIT 许可，并在源码顶部保留官方注释/标注来源。
- 禁止 debug 日志（`console.log` / `[ADL-DEBUG]`）遗留生产代码。
- 未发布阶段禁止数据格式兼容/旧版本迁移代码：`weeks`→`days` 等改名**直接替换**，不留兼容层。
- Rust 质量：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）、`cargo fmt`。
- 前端质量：`npx eslint`（0 errors）、`npx tsc --noEmit`。

---

### Task 1: 拉取上游 bklit-ui 参考副本

**Files:**
- Create: `references/bklit-ui/`（浅克隆上游仓库）

**Interfaces:**
- Consumes: 无
- Produces: 上游源码本地路径 `references/bklit-ui/packages/ui/src/charts/{area.tsx, area-chart.tsx, area-gradient-defs.tsx, composed-chart.tsx, series-bar.tsx, series-bar-layout.ts}`——后续移植任务从此拷贝。

- [ ] **Step 1: 浅克隆上游仓库到 references/bklit-ui**

```bash
git -C "E:\AI-DIGITAL-LIFE\SourceWorkspace" clone --depth 1 https://github.com/bklit/bklit-ui.git references/bklit-ui
```

- [ ] **Step 2: 验证关键源文件存在**

Run: `Get-ChildItem "E:\AI-DIGITAL-LIFE\SourceWorkspace\references\bklit-ui\packages\ui\src\charts" -Filter *.tsx | Where-Object { $_.Name -in @('area.tsx','area-chart.tsx','composed-chart.tsx','series-bar.tsx') } | Select-Object Name`
Expected: 列出 `area.tsx`、`area-chart.tsx`、`composed-chart.tsx`、`series-bar.tsx`

- [ ] **Step 3: 确保 references/bklit-ui 不被误提交进主仓库**

将 `references/bklit-ui/` 加入根 `.gitignore`（若尚未存在 `references/bklit-ui` 忽略规则）。

- [ ] **Step 4: 提交**

```bash
git add .gitignore
git commit -m "chore: ignore upstream bklit-ui reference copy"
```

---

### Task 2: 后端类型 — 周→天 改名 + 时间线增加 count

**Files:**
- Modify: `ai-digital-life/crates/types/src/types/git_visualization.rs`
- Test: 编译验证（`cargo check -p adl-types`）

**Interfaces:**
- Consumes: 现有 `GitVisCodeEvolution` / `GitVisCodeEvolutionWeek` / `GitVisTimelinePoint`
- Produces: `GitVisCodeEvolutionDay { date, additions, deletions }`、`GitVisCodeEvolution { days }`、`GitVisTimelinePoint { date, count, cumulative }`（camelCase 序列化：`date`/`additions`/`deletions`/`count`/`cumulative`）

- [ ] **Step 1: 重命名结构并加 count 字段**

将 `git_visualization.rs:65-77` 的 `GitVisCodeEvolutionWeek`/`GitVisCodeEvolution` 替换为：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCodeEvolutionDay {
    pub date: String,
    pub additions: i32,
    pub deletions: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCodeEvolution {
    pub days: Vec<GitVisCodeEvolutionDay>,
}
```

将 `git_visualization.rs:48-53` 的 `GitVisTimelinePoint` 替换为：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisTimelinePoint {
    pub date: String,
    pub count: i32,
    pub cumulative: i32,
}
```

- [ ] **Step 2: 编译验证**

Run: `cargo check -p adl-types`
Expected: 编译通过（此任务会触发下游引用方报错，属预期，由 Task 3 修复）

- [ ] **Step 3: 提交**

```bash
git add ai-digital-life/crates/types/src/types/git_visualization.rs
git commit -m "feat(types): switch code evolution to daily + add timeline count"
```

---

### Task 3: 后端采集 — 按天聚合

**Files:**
- Modify: `ai-digital-life/crates/workspace/src/git/git_vis/commit_stats.rs`
- Test: `ai-digital-life/crates/workspace/src/git/git_vis/commit_stats.rs`（tests 模块）

**Interfaces:**
- Consumes: Task 2 的新类型
- Produces: `capture_code_evolution` 返回 `GitVisCodeEvolution { days }`（按 `YYYY-MM-DD` 桶）；`capture_commit_stats.commit_timeline` 为按天 `{ date, count, cumulative }`

- [ ] **Step 1: 改写 `capture_code_evolution` 为天桶**

将 `commit_stats.rs:193-227` 的 `week_map`/`start_of_week`/`weeks` 逻辑替换为：

```rust
    let mut day_map: BTreeMap<String, (i32, i32)> = BTreeMap::new();
    let mut current_date: Option<String> = None;
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let add: i32 = parts[0].parse().unwrap_or(0);
            let del: i32 = parts[1].parse().unwrap_or(0);
            if let Some(ref date_str) = current_date {
                let entry = day_map.entry(date_str.clone()).or_insert((0, 0));
                entry.0 += add;
                entry.1 += del;
            }
        } else if let Some(date_str) = header_date(line) {
            current_date = Some(date_str);
        }
    }

    let days: Vec<GitVisCodeEvolutionDay> = day_map
        .into_iter()
        .map(|(date, (additions, deletions))| GitVisCodeEvolutionDay { date, additions, deletions })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [code_evolution] [{}] done in {:?} — {} days",
        root.display(),
        t0.elapsed(),
        days.len()
    );

    Ok(GitVisCodeEvolution { days })
```

同时更新顶部 `use adl_types::{...}` 导入：`GitVisCodeEvolutionDay` 替换 `GitVisCodeEvolutionWeek`。

- [ ] **Step 2: 移除不再使用的 `start_of_week`（保留 `day_of_week`/`gregorian_to_jdn`/`jdn_to_gregorian`）**

删除 `commit_stats.rs:229-241` 的 `start_of_week` 函数。删除后若 `jdn_to_gregorian` 无调用方（仅 `start_of_week` 使用），则连同其 `#[cfg(test)]` 引用一并处理：`jdn_to_gregorian` 删除，`start_of_week_*` 两个测试删除。`day_of_week` 与 `gregorian_to_jdn` 仍被 `parse_date_parts` 使用，保留。

- [ ] **Step 3: 改写 `capture_commit_stats` 时间线为按天**

将 `commit_stats.rs:59-81` 的 `timeline_points` 构建逻辑替换为（移除逐提交 push，改为基于 `daily_map`）：

```rust
    let mut timeline_points: Vec<GitVisTimelinePoint> = Vec::new();
    let mut timeline_cumulative: i32 = 0;
    for (date, count) in daily_map.iter() {
        timeline_cumulative += count;
        timeline_points.push(GitVisTimelinePoint {
            date: date.clone(),
            count: *count,
            cumulative: timeline_cumulative,
        });
    }
```

注意 `daily_map` 是 `BTreeMap<String, i32>`（按日期有序），迭代顺序即时间顺序。原 `for (timeline_cumulative, c) in (1_i32..).zip(commits.iter())` 循环中与时间线无关的 `daily_map` 累加需保留，仅删除其中的 `timeline_points` push 部分。

- [ ] **Step 4: 更新/新增测试**

将 `commit_stats.rs:263-275` 与 `277-288` 的 `start_of_week_*` 测试替换为按天聚合断言；新增时间线按天测试：

```rust
    #[test]
    fn start_of_week_helpers_removed_gregorian_math_still_works() {
        // day_of_week still drives hourly heatmap (0 = Sunday .. 6 = Saturday)
        assert_eq!(parse_date_parts("2024-01-01T10:00:00+08:00").unwrap().day_of_week, 1); // Mon
        assert_eq!(parse_date_parts("2024-01-07T00:00:00Z").unwrap().day_of_week, 0); // Sun
    }
```

（保留现有 `parse_date_parts_day_of_week_matches_js_convention` 与 `header_date_parses_both_sha1_and_sha256_headers`，删除 `start_of_week` 相关两个测试。）

- [ ] **Step 5: 运行测试**

Run: `cargo test -p adl-workspace git_vis`
Expected: 全部通过（含已有 header_date 测试）

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/workspace/src/git/git_vis/commit_stats.rs
git commit -m "feat(git): aggregate code evolution & timeline by day"
```

---

### Task 4: 前端类型镜像更新

**Files:**
- Modify: `ai-digital-life/frontend/src/kernel/types.ts`

**Interfaces:**
- Consumes: Task 2 的序列化结构
- Produces: TS 端 `GitVisCodeEvolutionDay`、`GitVisCodeEvolution.days`、`GitVisTimelinePoint.count`

- [ ] **Step 1: 更新 TS 接口**

将 `kernel/types.ts:138-141` 替换为：

```ts
export interface GitVisTimelinePoint {
  date: string;
  count: number;
  cumulative: number;
}
```

将 `kernel/types.ts:157-164` 替换为：

```ts
export interface GitVisCodeEvolutionDay {
  date: string;
  additions: number;
  deletions: number;
}
export interface GitVisCodeEvolution {
  days: GitVisCodeEvolutionDay[];
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors（`tauri-workspace.ts` / `preview-git.ts` / `shared/ipc/workspace.ts` 仅引用类型名，无需改动）

- [ ] **Step 3: 提交**

```bash
git add ai-digital-life/frontend/src/kernel/types.ts
git commit -m "feat(frontend): mirror daily code-evolution & timeline types"
```

---

### Task 5: 移植官方 `Area` 组件 + baseline 改造

**Files:**
- Copy from: `references/bklit-ui/packages/ui/src/charts/area.tsx`
- Copy from: `references/bklit-ui/packages/ui/src/charts/area-gradient-defs.tsx`（若本地 `area-gradient-defs.tsx` 缺 `baseline` 所需逻辑则覆盖）
- Create: `ai-digital-life/frontend/src/components/charts/area.tsx`
- Test: `ai-digital-life/frontend/src/components/charts/area.test.tsx`

**Interfaces:**
- Consumes: Task 1 上游副本；本地 `chart-context.tsx`（`useChartStable`/`xScale`/`yScale`）、`line.tsx` 同款渲染模式
- Produces: `Area` 组件（props：`dataKey`/`yAxisId`/`fill`/`fillOpacity`/`stroke`/`strokeWidth`/`curve`/`animate`/`showLine`/`showHighlight`/`gradientToOpacity`/`fadeEdges`/`showMarkers`/`dashFromIndex`/`dashArray`/`baseline?: 'bottom' | 'zero'`），`displayName = 'Area'`

- [ ] **Step 1: 拷贝官方 `area.tsx`**

```bash
Copy-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\references\bklit-ui\packages\ui\src\charts\area.tsx" "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\area.tsx"
Copy-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\references\bklit-ui\packages\ui\src\charts\area-gradient-defs.tsx" "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\area-gradient-defs.tsx"
```

将 `area-gradient-defs.tsx` 以本地已有版本为准保留（本地版本含 `gradientToOpacity`，先 diff 再决定是否覆盖）。

- [ ] **Step 2: 增加 `baseline` 改造**

在 `area.tsx` 的 `AreaProps` 增加：

```ts
/** Fill baseline: `"bottom"` fills to the plot bottom (official default); `"zero"` fills to y=0 (diverging charts). */
baseline?: 'bottom' | 'zero';
```

在面积路径构建处（官方用 `area` 路径自底部闭合处）改为按 `baseline` 选择闭合基线 y：

```ts
const baselineY = baseline === 'zero' ? (yScale(0) ?? innerHeight) : innerHeight;
```

用 `baselineY` 替代原 `innerHeight` 作为面积闭合点，并确保 `Line`/`SeriesHoverDim`/`SeriesHighlightLayer` 渲染逻辑不变。同时将 `Area` 加入 `line-chart.tsx` 的域驱动识别（见 Step 4）。

- [ ] **Step 3: 编写 Area 渲染测试**

创建 `area.test.tsx`（复用现有测试的 `motion/react`、`@visx/responsive`（ParentSize mock 600×200）、`useBklitTheme` mock 模式）：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { LineChart } from './line-chart';
import { Area } from './area';

vi.mock('motion/react', () => ({ motion: new Proxy({}, { get: (_t: never, tag: string) => function M({ children, ...rest }: Record<string, unknown>) { const R = require('react'); const p: Record<string, unknown> = {}; for (const [k, v] of Object.entries(rest)) { if (k !== 'className' && k !== 'children' && k !== 'key') p[k] = v; } return R.createElement(tag === 'default' ? 'div' : tag, { className: rest.className, key: rest.key, ...p }, children); } }), animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }), useMotionValue: <T,>(v: T) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} }), useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }), useSpring: (v: unknown) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} }), useReducedMotion: () => false }));
vi.mock('@visx/responsive', () => ({ ParentSize: ({ children }: any) => children({ width: 600, height: 200 }) }));

describe('Area', () => {
  it('renders a filled area path with baseline="bottom"', () => {
    const { container } = render(
      <LineChart data={[{ date: '2024-01-01', v: 10 }, { date: '2024-01-02', v: 20 }]} status="ready" animationDuration={0}>
        <Area dataKey="v" baseline="bottom" />
      </LineChart>,
    );
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('renders a filled area path with baseline="zero" (diverging)', () => {
    const { container } = render(
      <LineChart data={[{ date: '2024-01-01', v: -5 }, { date: '2024-01-02', v: 5 }]} status="ready" animationDuration={0}>
        <Area dataKey="v" baseline="zero" />
      </LineChart>,
    );
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: 接线到 `line-chart.tsx` 域驱动识别**

在 `line-chart.tsx:71-80` 的 `LINE_DOMAIN_EXCLUDED_NAMES` 中**移除** `'Area'`（Area 需驱动 Y 域），并确认 `extractLineConfigs` 对 `Area`（含字符串 `dataKey`）走 `registersLineDomain` 返回 true 的路径。`PatternArea` 保留在排除集。

- [ ] **Step 5: 运行测试**

Run: `pnpm --dir frontend vitest run src/components/charts/area.test.tsx src/components/charts/line-chart.test.tsx`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/frontend/src/components/charts/area.tsx ai-digital-life/frontend/src/components/charts/area-gradient-defs.tsx ai-digital-life/frontend/src/components/charts/line-chart.tsx ai-digital-life/frontend/src/components/charts/area.test.tsx
git commit -m "feat(charts): port official Area renderer with baseline prop"
```

---

### Task 6: 移植官方 `SeriesBar` + `ComposedChart`

**Files:**
- Copy from: `references/bklit-ui/packages/ui/src/charts/series-bar.tsx`
- Copy from: `references/bklit-ui/packages/ui/src/charts/composed-chart.tsx`
- Create: `ai-digital-life/frontend/src/components/charts/series-bar.tsx`、`ai-digital-life/frontend/src/components/charts/composed-chart.tsx`
- Test: `ai-digital-life/frontend/src/components/charts/series-bar.test.tsx`、`ai-digital-life/frontend/src/components/charts/composed-chart.test.tsx`

**Interfaces:**
- Consumes: Task 1 上游副本；本地 `time-series-chart-shell.tsx` 既有 `composedBarDataKeys`/`computeSeriesBarWidth`/reveal clip 管线
- Produces: `SeriesBar`（props：`dataKey`/`yAxisId`/`fill`/`radius`/`fadedOpacity`，`displayName = 'SeriesBar'`）、`ComposedChart`（props 与 `LineChart` 对齐 + `barGap`/`barSize`/`maxBarSize`/`stacked`/`stackGap`）

- [ ] **Step 1: 拷贝官方源码并整理依赖**

```bash
Copy-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\references\bklit-ui\packages\ui\src\charts\series-bar.tsx" "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\series-bar.tsx"
Copy-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\references\bklit-ui\packages\ui\src\charts\composed-chart.tsx" "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\components\charts\composed-chart.tsx"
```

对照本地 `chart-context.tsx` / `time-series-chart-shell.tsx` 的字段（`composedBarDataKeys`/`composedBarSize`/`composedMaxBarSize`/`composedBarGap`/`composedStacked`/`composedStackOffsets`/`composedStackGap`）修正 import 路径与字段名；若上游引用了本地缺失的辅助模块，从上游对应路径一并拷贝。

- [ ] **Step 2: 确保 `SeriesBar` 在 `LINE_DOMAIN_EXCLUDED_NAMES` 中（不驱动 Y 域）**

确认 `line-chart.tsx:71-80` 排除集包含 `'SeriesBar'`（已含，无需改动）。`ComposedChart` 内部将 `SeriesBar` 子组件提取为 `composedBarDataKeys`，与本地 shell 管线接通。

- [ ] **Step 3: 编写 SeriesBar + ComposedChart 测试**

创建 `composed-chart.test.tsx`（复用 Task 5 的 mock 模式）：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ComposedChart } from './composed-chart';
import { SeriesBar } from './series-bar';
import { Line } from './line';

// ...（沿用 area.test.tsx 中 motion/react 与 @visx/responsive 的 mock 定义）

describe('ComposedChart + SeriesBar', () => {
  it('renders bars and a line together', () => {
    const { container } = render(
      <ComposedChart data={[{ date: '2024-01-01', count: 5, cum: 5 }, { date: '2024-01-02', count: 3, cum: 8 }]} status="ready" animationDuration={0}>
        <SeriesBar dataKey="count" radius={4} />
        <Line dataKey="cum" />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `pnpm --dir frontend vitest run src/components/charts/composed-chart.test.tsx src/components/charts/series-bar.test.tsx src/components/charts/line-chart.test.tsx src/components/charts/time-series-chart-shell.test.tsx`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/components/charts/series-bar.tsx ai-digital-life/frontend/src/components/charts/composed-chart.tsx ai-digital-life/frontend/src/components/charts/composed-chart.test.tsx ai-digital-life/frontend/src/components/charts/series-bar.test.tsx
git commit -m "feat(charts): port official SeriesBar & ComposedChart"
```

---

### Task 7: 适配层 — 自适应粒度 + 按天聚合

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts`

**Interfaces:**
- Consumes: Task 4 的按天类型
- Produces: `type Granularity = 'day' | 'week' | 'month'`；`resolveGranularity(start: Date, end: Date): Granularity`；`aggregateCodeEvolutionDays(days, granularity)` → `CodeEvolutionRow[]`（`{ date, added, deletedNeg, net }`）；`aggregateCommitTimeline(days, granularity)` → `{ date, count, cumulative }[]`；`weekKey`/`monthKey` 内部 helper；`deletedNeg = -deletions`、`net = additions - deletions`

- [ ] **Step 1: 新增类型与粒度决议**

在 `chartDataAdapters.ts` 追加：

```ts
export type Granularity = 'day' | 'week' | 'month';

export interface CodeEvolutionRow {
  date: string;
  added: number;
  deletedNeg: number;
  net: number;
}

export function resolveGranularity(start: Date, end: Date): Granularity {
  const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  if (days <= 30) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}
```

- [ ] **Step 2: 新增聚合 helper**

```ts
function toDate10(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function mondayOf(date10: string): string {
  const d = new Date(date10 + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7;
  return toDate10(addDays(d, -mondayOffset));
}

function monthOf(date10: string): string {
  return date10.slice(0, 7); // YYYY-MM
}
```

- [ ] **Step 3: 实现聚合函数**

```ts
export function aggregateCodeEvolutionDays(
  days: { date: string; additions: number; deletions: number }[],
  granularity: Granularity,
): CodeEvolutionRow[] {
  if (granularity === 'day') {
    return days.map((d) => ({
      date: d.date,
      added: d.additions,
      deletedNeg: -d.deletions,
      net: d.additions - d.deletions,
    }));
  }
  const key = granularity === 'week' ? mondayOf : monthOf;
  const buckets = new Map<string, { add: number; del: number }>();
  for (const d of days) {
    const k = key(d.date);
    const b = buckets.get(k) ?? { add: 0, del: 0 };
    b.add += d.additions;
    b.del += d.deletions;
    buckets.set(k, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, b]) => ({ date, added: b.add, deletedNeg: -b.del, net: b.add - b.del }));
}

export function aggregateCommitTimeline(
  timeline: { date: string; count: number; cumulative: number }[],
  granularity: Granularity,
): { date: string; count: number; cumulative: number }[] {
  if (granularity === 'day') {
    return timeline;
  }
  const key = granularity === 'week' ? mondayOf : monthOf;
  const buckets = new Map<string, { count: number; cumulative: number }>();
  for (const t of timeline) {
    const k = key(t.date);
    const prev = buckets.get(k);
    if (!prev) {
      buckets.set(k, { count: t.count, cumulative: t.cumulative });
    } else {
      prev.count += t.count;
      prev.cumulative = t.cumulative; // 取该桶末尾日累计
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, count: v.count, cumulative: v.cumulative }));
}
```

（说明：`deletedNeg`/`net` 由前端聚合层产出，符合 spec 设计 4。）

- [ ] **Step 4: 移除将被替代的旧适配函数**

删除 `chartDataAdapters.ts` 中的 `codeEvolutionToAreaData`（约 200-208 行）与 `commitTimelineToRows`（约 210-219 行），并删除顶部 `import type { BklitAreaRow } from '../../../../test-fixtures/gitVisMockData';`（第 2 行）。同步删除 `chartDataAdapters.test.ts` 中针对这两个函数的旧用例（新用例见 Step 5）。

- [ ] **Step 5: 编写测试**

在 `chartDataAdapters.test.ts` 追加：

```ts
import { resolveGranularity, aggregateCodeEvolutionDays, aggregateCommitTimeline, type Granularity } from './chartDataAdapters';

describe('adaptive granularity', () => {
  it('resolves 30/180 day boundaries', () => {
    const d = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
    expect(resolveGranularity(d(0), d(30))).toBe('day');
    expect(resolveGranularity(d(0), d(31))).toBe('week');
    expect(resolveGranularity(d(0), d(180))).toBe('week');
    expect(resolveGranularity(d(0), d(181))).toBe('month');
  });

  it('aggregates code evolution to weeks (Monday start) with net & deletedNeg', () => {
    const days = [
      { date: '2024-01-01', additions: 100, deletions: 10 }, // Mon
      { date: '2024-01-02', additions: 50, deletions: 20 },
      { date: '2024-01-08', additions: 30, deletions: 5 },  // next Mon
    ];
    const weeks = aggregateCodeEvolutionDays(days, 'week' as Granularity);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({ date: '2024-01-01', added: 150, deletedNeg: -30, net: 120 });
    expect(weeks[1]).toEqual({ date: '2024-01-08', added: 30, deletedNeg: -5, net: 25 });
  });

  it('aggregates commit timeline cumulative as bucket-last value', () => {
    const timeline = [
      { date: '2024-01-01', count: 2, cumulative: 2 },
      { date: '2024-01-02', count: 3, cumulative: 5 },
      { date: '2024-01-08', count: 4, cumulative: 9 },
    ];
    const weeks = aggregateCommitTimeline(timeline, 'week' as Granularity);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({ date: '2024-01-01', count: 5, cumulative: 5 });
    expect(weeks[1]).toEqual({ date: '2024-01-08', count: 4, cumulative: 9 });
  });

  it('keeps day granularity unchanged', () => {
    const days = [{ date: '2024-01-01', additions: 100, deletions: 10 }];
    expect(aggregateCodeEvolutionDays(days, 'day' as Granularity)[0]).toEqual({
      date: '2024-01-01', added: 100, deletedNeg: -10, net: 90,
    });
  });
});
```

- [ ] **Step 6: 运行测试**

Run: `pnpm --dir frontend vitest run src/app/features/git-visualization/adapters/chartDataAdapters.test.ts`
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts
git commit -m "feat(frontend): adaptive granularity + daily aggregation adapters"
```

---

### Task 8: LineChart 增加 `dateLabelFormatter`（粒度刻度）

**Files:**
- Modify: `ai-digital-life/frontend/src/components/charts/line-chart.tsx`
- Modify: `ai-digital-life/frontend/src/components/charts/time-series-chart-shell.tsx`

**Interfaces:**
- Consumes: 无新依赖
- Produces: `LineChartProps.dateLabelFormatter?: (date: Date) => string`，透传至 `TimeSeriesChartInner` 并用于 `dateLabels` 计算

- [ ] **Step 1: 在 shell 增加 prop 并用于 dateLabels**

`time-series-chart-shell.tsx`：`TimeSeriesChartInnerProps` 增加 `dateLabelFormatter?: (date: Date) => string`；将 `:360-363` 的 `dateLabels` 计算改为：

```ts
  const dateLabels = useMemo(
    () =>
      visiblePlotData.map((d) =>
        dateLabelFormatter ? dateLabelFormatter(xAccessor(d)) : shortDateFmt.format(xAccessor(d)),
      ),
    [visiblePlotData, xAccessor, dateLabelFormatter],
  );
```

- [ ] **Step 2: 在 LineChart 增加 prop 并透传**

`line-chart.tsx`：`LineChartProps` 增加 `dateLabelFormatter?: (date: Date) => string`；`ChartInnerProps` 同步增加，并在 `<TimeSeriesChartInner ...>` 传递。

- [ ] **Step 3: 提交**

```bash
git add ai-digital-life/frontend/src/components/charts/line-chart.tsx ai-digital-life/frontend/src/components/charts/time-series-chart-shell.tsx
git commit -m "feat(charts): add dateLabelFormatter for granularity ticks"
```

---

### Task 9: 代码行演变 — 发散面积 + 净增长线 + 单期缩略条

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `Area`、Task 7 的 `resolveGranularity`/`aggregateCodeEvolutionDays`、官方 `Line`/`Grid highlightRowValues`/`ChartBrushLayout`/`ChartBrush`/`XAxis`
- Produces: `CodeLineEvo` props 改为 `{ days: { date, additions, deletions }[] }`

- [ ] **Step 1: 改写 CodeLineEvo 组件**

将 `CodeLineEvo.tsx` 整体替换为：

```tsx
import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { XAxis } from '@/components/charts/x-axis';
import {
  aggregateCodeEvolutionDays,
  resolveGranularity,
  type Granularity,
} from '../adapters/chartDataAdapters';

interface CodeLineEvoProps {
  data?: { days: { date: string; additions: number; deletions: number }[] };
}

export const CodeLineEvo = React.memo(function CodeLineEvo({ data }: CodeLineEvoProps) {
  const days = data?.days ?? [];

  const dayRows = useMemo(() => aggregateCodeEvolutionDays(days, 'day'), [days]);

  const fullRange = useMemo(() => {
    if (dayRows.length === 0) return { start: new Date(), end: new Date() };
    return {
      start: new Date(dayRows[0].date + 'T00:00:00'),
      end: new Date(dayRows[dayRows.length - 1].date + 'T00:00:00'),
    };
  }, [dayRows]);

  const stripGranularity = useMemo<Granularity>(() => {
    if (dayRows.length === 0) return 'month';
    return resolveGranularity(fullRange.start, fullRange.end);
  }, [fullRange, dayRows.length]);

  const stripData = useMemo(
    () => aggregateCodeEvolutionDays(days, stripGranularity),
    [days, stripGranularity],
  );

  if (dayRows.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
        <LineChart data={[]} xDataKey="date" margin={{ top: 20, right: 20, bottom: 40, left: 60 }} style={{ maxHeight: 280 }}>
          <Line dataKey="net" />
          <Grid highlightRowValues={[0]} />
          <ChartTooltip />
        </LineChart>
      </div>
    );
  }

  const dateLabelFormatterFor = (g: Granularity) => (d: Date) =>
    g === 'month'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <ChartBrushLayout
        data={stripData}
        xDataKey="date"
        enabled
        height={72}
        brushStrip={(layout) => (
          <LineChart
            data={stripData}
            xDataKey="date"
            animationDuration={0}
            status="ready"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="net" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={layout.onBrushSelectionChange as (domain: { start: Date; end: Date }) => void}
            />
          </LineChart>
        )}
      >
        {(layout) => {
          const selStart = layout.xDomain?.[0] ?? fullRange.start;
          const selEnd = layout.xDomain?.[1] ?? fullRange.end;
          const granularity = resolveGranularity(selStart, selEnd);
          const chartData = aggregateCodeEvolutionDays(days, granularity);
          return (
            <LineChart
              data={chartData}
              xDataKey="date"
              xDomain={layout.xDomain}
              xDomainSlotCount={layout.xDomainSlotCount}
              tweenYDomainOnXDomainChange
              yDomainTween
              dateLabelFormatter={dateLabelFormatterFor(granularity)}
              margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
              style={{ maxHeight: 280 }}
            >
              <Area dataKey="added" baseline="zero" fill="var(--chart-line-primary)" fillOpacity={0.35} />
              <Area dataKey="deletedNeg" baseline="zero" fill="var(--chart-line-secondary)" fillOpacity={0.35} />
              <Line dataKey="net" stroke="var(--chart-line-secondary)" strokeWidth={2} />
              <Grid highlightRowValues={[0]} />
              <XAxis />
              <ChartTooltip />
            </LineChart>
          );
        }}
      </ChartBrushLayout>
    </div>
  );
});
```

注意：`Area` 的 fill 颜色与 `Line`（net）的 stroke 颜色需与 `useBklitTheme` 主题/设计 token 协调，最终颜色值在实现时以现有 CSS 变量为准。

- [ ] **Step 2: 更新 CodeLineEvo 测试**

将 `CodeLineEvo.test.tsx` 的 mock 数据改为按天（`{ days: [...] }`），保留既有 "renders SVG without crashing" 与 brush strip 回归测试；新增断言主图含 `Area`（`path` 填充）与 `Grid highlightRowValues={[0]}`。沿用 `@/components/charts/brush` 真实组件（不 mock）的既有模式，ParentSize 高度保持 72。

- [ ] **Step 3: 运行测试**

Run: `pnpm --dir frontend vitest run src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`
Expected: 全部通过

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx
git commit -m "feat(git-vis): diverging area + net line for code line evolution"
```

---

### Task 10: 提交时间线 — 累计线 + 每周柱状 + 单期缩略条

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx`
- Test: `ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx`

**Interfaces:**
- Consumes: Task 6 的 `ComposedChart`/`SeriesBar`、Task 7 的聚合函数
- Produces: `CommitTimeline` props 改为 `{ days: { date, count, cumulative }[] }`

- [ ] **Step 1: 改写 CommitTimeline 组件**

将 `CommitTimeline.tsx` 整体替换为（结构同 Task 9，容器用 `ComposedChart`）：

```tsx
import React, { useMemo } from 'react';
import { ComposedChart } from '@/components/charts/composed-chart';
import { SeriesBar } from '@/components/charts/series-bar';
import { Line } from '@/components/charts/line';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { XAxis } from '@/components/charts/x-axis';
import {
  aggregateCommitTimeline,
  resolveGranularity,
  type Granularity,
} from '../adapters/chartDataAdapters';

interface CommitTimelineProps {
  data?: { days: { date: string; count: number; cumulative: number }[] };
}

export const CommitTimeline = React.memo(function CommitTimeline({ data }: CommitTimelineProps) {
  const days = data?.days ?? [];

  const dayRows = useMemo(() => aggregateCommitTimeline(days, 'day'), [days]);

  const fullRange = useMemo(() => {
    if (dayRows.length === 0) return { start: new Date(), end: new Date() };
    return {
      start: new Date(dayRows[0].date + 'T00:00:00'),
      end: new Date(dayRows[dayRows.length - 1].date + 'T00:00:00'),
    };
  }, [dayRows]);

  const stripGranularity = useMemo<Granularity>(() => {
    if (dayRows.length === 0) return 'month';
    return resolveGranularity(fullRange.start, fullRange.end);
  }, [fullRange, dayRows.length]);

  const stripData = useMemo(() => aggregateCommitTimeline(days, stripGranularity), [days, stripGranularity]);

  if (dayRows.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
        <ComposedChart data={[]} xDataKey="date" margin={{ top: 20, right: 20, bottom: 40, left: 60 }} style={{ maxHeight: 280 }}>
          <Line dataKey="cumulative" />
          <Grid />
          <ChartTooltip />
        </ComposedChart>
      </div>
    );
  }

  const dateLabelFormatterFor = (g: Granularity) => (d: Date) =>
    g === 'month'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <ChartBrushLayout
        data={stripData}
        xDataKey="date"
        enabled
        height={72}
        brushStrip={(layout) => (
          <ComposedChart
            data={stripData}
            xDataKey="date"
            animationDuration={0}
            status="ready"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="count" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={layout.onBrushSelectionChange as (domain: { start: Date; end: Date }) => void}
            />
          </ComposedChart>
        )}
      >
        {(layout) => {
          const selStart = layout.xDomain?.[0] ?? fullRange.start;
          const selEnd = layout.xDomain?.[1] ?? fullRange.end;
          const granularity = resolveGranularity(selStart, selEnd);
          const chartData = aggregateCommitTimeline(days, granularity);
          return (
            <ComposedChart
              data={chartData}
              xDataKey="date"
              barGap={0}
              maxBarSize={granularity === 'day' ? 8 : 24}
              xDomain={layout.xDomain}
              xDomainSlotCount={layout.xDomainSlotCount}
              tweenYDomainOnXDomainChange
              yDomainTween
              dateLabelFormatter={dateLabelFormatterFor(granularity)}
              margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
              style={{ maxHeight: 280 }}
            >
              <SeriesBar dataKey="count" fill="var(--chart-line-primary)" radius={4} />
              <Line dataKey="cumulative" stroke="var(--chart-line-secondary)" strokeWidth={2} />
              <Grid />
              <XAxis />
              <ChartTooltip />
            </ComposedChart>
          );
        }}
      </ChartBrushLayout>
    </div>
  );
});
```

（若 Task 6 移植的 `ComposedChart` 未暴露 `dateLabelFormatter`，在移植时补齐与 Task 8 相同的 prop 透传。）

- [ ] **Step 2: 更新 CommitTimeline 测试**

将 `CommitTimeline.test.tsx` 的 mock 数据改为按天（`{ days: [{ date, count, cumulative }] }`），保留既有测试；新增断言主图同时含 `rect`（SeriesBar）与 `path`（Line）。

- [ ] **Step 3: 运行测试**

Run: `pnpm --dir frontend vitest run src/app/features/git-visualization/charts/CommitTimeline.test.tsx`
Expected: 全部通过

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx
git commit -m "feat(git-vis): composed line+bar for commit timeline"
```

---

### Task 11: mock 数据按天化 + 视图接线

**Files:**
- Modify: `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx`
- Test: `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.test.ts`、`ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx`

**Interfaces:**
- Consumes: Task 4 类型、Task 9/10 的 props
- Produces: mock 数据 `days` 结构；视图向 `CodeLineEvo`/`CommitTimeline` 传 `{ days }`

- [ ] **Step 1: 更新 mock 数据生成器**

在 `gitVisMockData.ts` 中：`generateCodeLineEvolutionData` 改为按天（`date: 'YYYY-MM-DD'`, `additions`, `deletions`，覆盖约 90 天）；新增/调整提交时间线生成器为按天 `{ date, count, cumulative }`。**移除已无引用的 `BklitAreaRow` 接口（约 479-484 行）与 `toBklitAreaData` 函数（约 488-496 行）**（Task 7 已删除其唯一消费方 `codeEvolutionToAreaData`），并同步删除 `gitVisMockData.test.ts` 中 `toBklitAreaData` 的用例。

- [ ] **Step 2: 更新 GitVisualizationView 传参**

将 `GitVisualizationView.tsx:381-388` 改为：

```tsx
            <CodeLineEvo
              data={
                codeLineEvoData.data as
                  | { days: { date: string; additions: number; deletions: number }[] }
                  | undefined
              }
            />
```

将 `GitVisualizationView.tsx:399-405` 改为：

```tsx
            <CommitTimeline
              data={
                commitTimelineData.data as
                  | { days: { date: string; count: number; cumulative: number }[] }
                  | undefined
              }
            />
```

（`commitTimelineData.data` 来自 `GitVisCommitStats`，其 `commitTimeline` 字段现为按天 `{ date, count, cumulative }`——将该字段直接作为 `days` 传入。）

- [ ] **Step 3: 更新测试断言**

更新 `gitVisMockData.test.ts` 与 `GitVisualizationView.test.tsx` 中断言的数据形状（`weeks`→`days`、`commitTimeline` 含 `count`）。

- [ ] **Step 4: 运行测试**

Run: `pnpm --dir frontend vitest run src/test-fixtures/gitVisMockData.test.ts src/app/features/git-visualization/GitVisualizationView.test.tsx src/app/features/git-visualization/charts/CodeLineEvo.test.tsx src/app/features/git-visualization/charts/CommitTimeline.test.tsx`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx ai-digital-life/frontend/src/test-fixtures/gitVisMockData.test.ts ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx
git commit -m "feat(git-vis): daily mock data + view wiring"
```

---

### Task 12: 底部说明文字更新（i18n）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts`
- Test: 相关 i18n 快照/断言（如存在）

**Interfaces:**
- Consumes: 新图表语义
- Produces: 更新后的 `gitVisCodeLineEvoDesc` / `gitVisCommitTimelineDesc`

- [ ] **Step 1: 更新 zh-CN**

将 `zh-CN/changes.ts:126-127` 的 `gitVisCodeLineEvoDesc` 改为：

```ts
  gitVisCodeLineEvoDesc:
    '列：时间（随所选区间自适应 天/周/月）。上方区域为新增行数、下方为删除行数，净增长线反映代码库变化。下方缩略条可拖选区间。',
```

将 `zh-CN/changes.ts:130-131` 的 `gitVisCommitTimelineDesc` 改为：

```ts
  gitVisCommitTimelineDesc:
    '列：时间（随所选区间自适应 天/周/月）。柱状为单期提交数，折线为累计提交趋势。下方缩略条可拖选区间。',
```

- [ ] **Step 2: 更新 en-US**

对应 `en-US/changes.ts` 的 `gitVisCodeLineEvoDesc` / `gitVisCommitTimelineDesc` 为英文等价文案（如："Columns: time (auto day/week/month by range). Upper area = lines added, lower = lines deleted; the net line shows codebase growth. Drag the overview strip to select a range." 与 "Columns: time (auto day/week/month by range). Bars = commits per period, line = cumulative trend. Drag the overview strip to select a range."）。

- [ ] **Step 3: 运行相关测试**

Run: `pnpm --dir frontend vitest run src/app/features/git-visualization`
Expected: 全部通过（若 desc 有快照断言则同步更新）

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts ai-digital-life/frontend/src/app/i18n/en-US/changes.ts
git commit -m "docs(i18n): update chart descriptions for redesigned visuals"
```

---

### Task 13: 全量验证

**Files:** 无（仅验证）

**Interfaces:** 无

- [ ] **Step 1: Rust 全量测试**

Run: `cargo test --workspace`
Expected: 全部通过

- [ ] **Step 2: Rust 质量门禁**

Run: `cargo clippy --workspace --all-targets -- -D warnings` 与 `cargo fmt --check`
Expected: 0 警告；fmt 通过

- [ ] **Step 3: 前端全量测试**

Run: `pnpm --dir frontend run test`
Expected: 全部通过（含既有 brush strip margin 回归）

- [ ] **Step 4: 前端质量门禁**

Run: `npx --prefix ai-digital-life/frontend eslint ai-digital-life/frontend/src` 与 `npx tsc --noEmit`（在 frontend 目录执行）
Expected: 0 errors；类型通过

- [ ] **Step 5: 双端一致性确认**

确认 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 无新增 IPC 需求（数据结构变化已在 `kernel/types.ts` 反映）。人工/浏览器模式冒烟验证两图渲染与缩略条拖选。

- [ ] **Step 6: 收尾**

运行仓库根 `closing-workflow` 技能流程（日志审查、代码审查、质量检测、文档同步）。
