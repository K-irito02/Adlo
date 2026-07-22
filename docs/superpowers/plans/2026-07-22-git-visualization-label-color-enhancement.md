# Git 可视化标签/颜色增强 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 Git 可视化面板的标签格式、添加 4 套颜色预设切换系统、标准化底部描述文字。

**Architecture:** 前端纯 CSS/TS 变更。颜色预设通过 `data-chart-preset` 属性 + scoped CSS 变量实现，状态通过 Zustand 切片持久化到 localStorage。热力图组件新增向后兼容的 `labelFormat` prop。

**Tech Stack:** React 19 + TypeScript + Zustand + CSS 自定义属性 + @visx 热力图

## Global Constraints

- 所有新增 prop 必须保持向后兼容（提供默认值）
- 颜色预设仅限于 `.adl-git-vis__container` 作用域，不影响全局
- 热力图 x 轴 `labelFormat="numeric"` 时移除 `overflow: hidden` / `truncate`
- i18n key 命名遵循现存 `gitVis*` 模式

---

### Task 1: Store — 新增 chartColorPreset 状态与 action

**Files:**
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts`
- Modify: `frontend/src/app/stores/slices/uiSlice.ts`

**Interfaces:**
- Produces: `ChartColorPreset` type, `CHART_COLOR_PRESET_KEY` constant, `chartColorPreset` state field, `setChartColorPreset` action

- [ ] **Step 1: Add type and key to uiSliceTypes.ts**

Insert after the `HeatmapTab` type block:

```typescript
export type ChartColorPreset = 'bklit-default' | 'cool-ocean' | 'warm-sunset' | 'high-contrast';

export const CHART_COLOR_PRESET_KEY = 'adl-ui:chart-color-preset';
```

- [ ] **Step 2: Add state field and action to UISlice interface**

Add within the `UISlice` interface (after `activeHeatmapTab`):

```typescript
  chartColorPreset: ChartColorPreset;
```

Add after `setActiveHeatmapTab` action:

```typescript
  setChartColorPreset: (preset: ChartColorPreset) => void;
```

- [ ] **Step 3: Export CHART_COLOR_PRESET_KEY from uiSlice.ts barrel**

Add to the existing export block:

```typescript
  CHART_COLOR_PRESET_KEY,
```

- [ ] **Step 4: Hydrate and add action in uiSlice.ts**

In `hydrateUIDefaults`, after the `activeHeatmapTab` line:

```typescript
    const chartColorPreset = readJson<ChartColorPreset>(CHART_COLOR_PRESET_KEY, 'bklit-default');
```

In the `set(...)` call inside `hydrateUIDefaults`, add:

```typescript
      chartColorPreset,
```

In the default state object (after `activeHeatmapTab: 'calendar'`):

```typescript
    chartColorPreset: 'bklit-default' as ChartColorPreset,
```

Add the action after `setActiveHeatmapTab`:

```typescript
    setChartColorPreset: (preset) => {
      writeJson(CHART_COLOR_PRESET_KEY, preset);
      set({ chartColorPreset: preset });
    },
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/stores/slices/uiSliceTypes.ts frontend/src/app/stores/slices/uiSlice.ts
git commit -m "feat(store): add chartColorPreset state for git visualization"
```

---

### Task 2: CSS — 定义 4 套颜色预设

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`

**Interfaces:**
- Consumes: `data-chart-preset` attribute on `.adl-git-vis__container`
- Produces: 4 preset CSS scoped variable blocks (light + dark per preset)

- [ ] **Step 1: Add preset CSS blocks to git-visualization.css**

Append to end of file:

```css
/* ════════════════════════════════════════════
   Chart Color Presets (bklit-ui aligned)
   ════════════════════════════════════════════ */

/* ── Preset: bklit-default ── */
.adl-git-vis__container[data-chart-preset="bklit-default"] {
  --chart-scale-01: oklch(0.98 0.003 106);
  --chart-scale-02: oklch(0.92 0.008 106);
  --chart-scale-03: oklch(0.82 0.015 106);
  --chart-scale-04: oklch(0.68 0.02 106);
  --chart-scale-05: oklch(0.55 0.025 106);
  --chart-1: oklch(0.32 0 none);
  --chart-2: oklch(0.41 0 none);
  --chart-3: oklch(0.54 0 none);
  --chart-4: oklch(0.71 0 none);
  --chart-5: oklch(0.89 0 none);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="bklit-default"] {
  --chart-scale-01: oklch(0.28 0.03 270);
  --chart-scale-02: oklch(0.38 0.04 270);
  --chart-scale-03: oklch(0.48 0.05 270);
  --chart-scale-04: oklch(0.58 0.06 270);
  --chart-scale-05: oklch(0.68 0.07 270);
  --chart-1: oklch(1 0 none);
  --chart-2: oklch(0.73 0 none);
  --chart-3: oklch(0.51 0 none);
  --chart-4: oklch(0.39 0 none);
  --chart-5: oklch(0.32 0 none);
}

/* ── Preset: cool-ocean ── */
.adl-git-vis__container[data-chart-preset="cool-ocean"] {
  --chart-scale-01: oklch(0.97 0.015 250);
  --chart-scale-02: oklch(0.88 0.03 250);
  --chart-scale-03: oklch(0.72 0.06 250);
  --chart-scale-04: oklch(0.54 0.09 250);
  --chart-scale-05: oklch(0.38 0.11 250);
  --chart-1: oklch(0.35 0.12 265);
  --chart-2: oklch(0.45 0.1 250);
  --chart-3: oklch(0.55 0.08 235);
  --chart-4: oklch(0.65 0.06 195);
  --chart-5: oklch(0.75 0.04 180);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="cool-ocean"] {
  --chart-scale-01: oklch(0.22 0.03 245);
  --chart-scale-02: oklch(0.3 0.05 240);
  --chart-scale-03: oklch(0.4 0.08 235);
  --chart-scale-04: oklch(0.5 0.1 225);
  --chart-scale-05: oklch(0.6 0.12 215);
  --chart-1: oklch(0.75 0.06 250);
  --chart-2: oklch(0.65 0.08 235);
  --chart-3: oklch(0.55 0.1 220);
  --chart-4: oklch(0.45 0.08 200);
  --chart-5: oklch(0.35 0.06 190);
}

/* ── Preset: warm-sunset ── */
.adl-git-vis__container[data-chart-preset="warm-sunset"] {
  --chart-scale-01: oklch(0.98 0.005 80);
  --chart-scale-02: oklch(0.92 0.015 75);
  --chart-scale-03: oklch(0.82 0.03 70);
  --chart-scale-04: oklch(0.68 0.05 65);
  --chart-scale-05: oklch(0.55 0.07 55);
  --chart-1: oklch(0.4 0.13 40);
  --chart-2: oklch(0.5 0.12 55);
  --chart-3: oklch(0.6 0.1 70);
  --chart-4: oklch(0.7 0.08 85);
  --chart-5: oklch(0.8 0.05 90);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="warm-sunset"] {
  --chart-scale-01: oklch(0.25 0.02 60);
  --chart-scale-02: oklch(0.33 0.035 55);
  --chart-scale-03: oklch(0.43 0.05 50);
  --chart-scale-04: oklch(0.53 0.07 45);
  --chart-scale-05: oklch(0.63 0.09 40);
  --chart-1: oklch(0.75 0.08 55);
  --chart-2: oklch(0.65 0.1 45);
  --chart-3: oklch(0.55 0.12 35);
  --chart-4: oklch(0.45 0.1 25);
  --chart-5: oklch(0.35 0.08 15);
}

/* ── Preset: high-contrast ── */
.adl-git-vis__container[data-chart-preset="high-contrast"] {
  --chart-scale-01: oklch(0.95 0.005 0);
  --chart-scale-02: oklch(0.7 0.03 200);
  --chart-scale-03: oklch(0.5 0.06 210);
  --chart-scale-04: oklch(0.35 0.08 220);
  --chart-scale-05: oklch(0.25 0.08 230);
  --chart-1: oklch(0.3 0.15 30);
  --chart-2: oklch(0.4 0.14 150);
  --chart-3: oklch(0.5 0.13 270);
  --chart-4: oklch(0.6 0.12 330);
  --chart-5: oklch(0.7 0.11 60);
}
[data-theme='dark'] .adl-git-vis__container[data-chart-preset="high-contrast"] {
  --chart-scale-01: oklch(0.2 0.01 0);
  --chart-scale-02: oklch(0.35 0.05 210);
  --chart-scale-03: oklch(0.5 0.07 220);
  --chart-scale-04: oklch(0.65 0.09 230);
  --chart-scale-05: oklch(0.8 0.11 240);
  --chart-1: oklch(0.8 0.14 30);
  --chart-2: oklch(0.7 0.13 150);
  --chart-3: oklch(0.6 0.12 270);
  --chart-4: oklch(0.5 0.11 330);
  --chart-5: oklch(0.4 0.1 60);
}
```

- [ ] **Step 2: Verify — no breakage on unrelated components**

Check that no other CSS file references `.adl-git-vis__container[data-chart-preset]` — this selector only matches the git visualization container.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(styles): add 4 chart color presets for git visualization"
```

---

### Task 3: 热力图 X 轴 — 新增 labelFormat prop

**Files:**
- Modify: `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx`

**Interfaces:**
- Produces: `HeatmapXAxisProps.labelFormat?: 'short' | 'numeric'`
- Consumes: `useHeatmap().columnLabels` (existing), `useHeatmap().locale` (existing)

- [ ] **Step 1: Add labelFormat prop**

```typescript
export interface HeatmapXAxisProps {
  /** Additional class name for labels */
  className?: string;
  /** Show every N-th label (1 = all). Helps prevent overlap on dense grids. Default: 1 */
  tickEvery?: number;
  /**
   * Label format mode:
   * - `'short'` (default) — localized short month name via Intl.DateTimeFormat
   * - `'numeric'` — plain month number 1-12, no truncation, allows overflow
   */
  labelFormat?: 'short' | 'numeric';
}
```

- [ ] **Step 2: Accept prop in component signature**

Change component destructuring:

```typescript
  className,
  tickEvery = 1,
  labelFormat = 'short',
}: HeatmapXAxisProps) {
```

- [ ] **Step 3: Modify label generation for numeric mode**

In the `labels` useMemo, after the `columnLabels` branch, modify the else branch:

For the `labelFormat === 'numeric'` case inside the existing month loop:

```typescript
      ticks.push({
        label: labelFormat === 'numeric'
          ? String(monthAnchor.getMonth() + 1)
          : monthFmt.format(monthAnchor),
        x: margin.left + xScale(columnIndex),
        key: `x-${columnIndex}-${monthKey}`,
      });
```

- [ ] **Step 4: Remove truncation in numeric mode or when using columnLabels**

Modify the label span rendering. When `labelFormat === 'numeric'`, remove `truncate` class and `overflow: hidden`, and allow overflow:

```typescript
      <div
        className="pointer-events-none absolute"
        key={tick.key}
        style={{
          top: 0,
          left: tick.x,
          width: labelFormat === 'numeric' ? 'auto' : binWidth,
          display: 'flex',
          justifyContent: 'flex-start',
          overflow: labelFormat === 'numeric' ? 'visible' : 'hidden',
        }}
      >
        <span
          className={cn(
            'text-chart-label text-xs',
            labelFormat !== 'numeric' && 'truncate',
            className,
          )}
          title={labelFormat === 'numeric' ? undefined : tick.label}
        >
          {tick.label}
        </span>
      </div>
```

- [ ] **Step 5: Also apply no-truncation when columnLabels exist**

For the `columnLabels` branch, apply the same no-truncation treatment since column labels are user-controlled:

```typescript
      <div
        className="pointer-events-none absolute"
        key={tick.key}
        style={{
          top: 0,
          left: tick.x,
          width: 'auto',
          display: 'flex',
          justifyContent: 'flex-start',
          overflow: 'visible',
        }}
      >
        <span className={cn('text-chart-label text-xs', className)}>
          {tick.label}
        </span>
      </div>
```

Also update the corresponding object pushing code for columnLabels to include `labelFormat` in deps if needed (it's already in the closure).

- [ ] **Step 6: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-x-axis.tsx
git commit -m "feat(heatmap): add labelFormat prop with numeric mode"
```

---

### Task 4: CalendarHeatmap — 应用 numeric x 轴 + narrow y 轴

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx`

**Interfaces:**
- Consumes: `HeatmapXAxis.labelFormat="numeric"` (Task 3)
- Changes: `dayFmt` function, `labelFormat` prop on y-axis, `labelFormat` prop on x-axis

- [ ] **Step 1: Change dayFmt to use weekday: 'narrow'**

```typescript
const dayFmt = (locale: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 0, 4 + i)),
  );
```

- [ ] **Step 2: Change HeatmapYAxis labelFormat to "full"**

```typescript
        <HeatmapYAxis tickFilter="odd" labelFormat="full" />
```

- [ ] **Step 3: Add labelFormat="numeric" to HeatmapXAxis**

```typescript
        <HeatmapXAxis labelFormat="numeric" />
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx
git commit -m "feat(calendar-heatmap): numeric x-axis, narrow y-axis labels"
```

---

### Task 5: 模拟数据 — 移除 "W" 前缀

**Files:**
- Modify: `frontend/src/app/features/git-visualization/data/gitVisMockData.ts`

- [ ] **Step 1: Change columnLabel to plain number**

In `generateContributorActivityData`, line 608, change:

```typescript
    columns.push({ bin: w, bins, columnLabel: String(w + 1) });
```

- [ ] **Step 2: Verify tests pass**

Run: `cd frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/data/gitVisMockData.test.ts`
Expected: Tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/data/gitVisMockData.ts
git commit -m "feat(mock-data): remove W prefix from activity week labels"
```

---

### Task 6: i18n — 新增预设名称键

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`

**Interfaces:**
- Produces: `gitVisPresetBklitDefault`, `gitVisPresetCoolOcean`, `gitVisPresetWarmSunset`, `gitVisPresetHighContrast` i18n keys

- [ ] **Step 1: Add Chinese keys to zh-CN/changes.ts**

Append before the closing `} as const;`:

```typescript
  gitVisPresetBklitDefault: 'Bklit 默认',
  gitVisPresetCoolOcean: '冷色海洋',
  gitVisPresetWarmSunset: '暖色日落',
  gitVisPresetHighContrast: '高对比度',
```

- [ ] **Step 2: Add English keys to en-US/changes.ts**

```typescript
  gitVisPresetBklitDefault: 'Bklit Default',
  gitVisPresetCoolOcean: 'Cool Ocean',
  gitVisPresetWarmSunset: 'Warm Sunset',
  gitVisPresetHighContrast: 'High Contrast',
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/i18n/en-US/changes.ts
git commit -m "feat(i18n): add chart color preset names"
```

---

### Task 7: ChartColorPresetSelector 组件

**Files:**
- Create: `frontend/src/app/features/git-visualization/ChartColorPresetSelector.tsx`
- Optionally create test: `frontend/src/app/features/git-visualization/ChartColorPresetSelector.test.tsx`

**Interfaces:**
- Consumes: `useAppStore().chartColorPreset`, `useAppStore().setChartColorPreset`, `useTCopy().t`

- [ ] **Step 1: Create the component**

Create `frontend/src/app/features/git-visualization/ChartColorPresetSelector.tsx`:

```tsx
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { ChartColorPreset } from '@stores/slices/uiSliceTypes';

const PRESETS: { id: ChartColorPreset; labelKey: 'gitVisPresetBklitDefault' | 'gitVisPresetCoolOcean' | 'gitVisPresetWarmSunset' | 'gitVisPresetHighContrast' }[] = [
  { id: 'bklit-default', labelKey: 'gitVisPresetBklitDefault' },
  { id: 'cool-ocean', labelKey: 'gitVisPresetCoolOcean' },
  { id: 'warm-sunset', labelKey: 'gitVisPresetWarmSunset' },
  { id: 'high-contrast', labelKey: 'gitVisPresetHighContrast' },
];

export const ChartColorPresetSelector = React.memo(function ChartColorPresetSelector() {
  const { t } = useTCopy();
  const { chartColorPreset, setChartColorPreset } = useAppStore(
    useShallow((s) => ({
      chartColorPreset: s.chartColorPreset,
      setChartColorPreset: s.setChartColorPreset,
    })),
  );

  return (
    <select
      className="adl-git-vis__preset-select"
      value={chartColorPreset}
      onChange={(e) => setChartColorPreset(e.target.value as ChartColorPreset)}
      aria-label="Chart color preset"
    >
      {PRESETS.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {t[preset.labelKey]}
        </option>
      ))}
    </select>
  );
});
```

- [ ] **Step 2: Add basic style for the selector**

In `git-visualization.css`, add:

```css
.adl-git-vis__preset-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0 0 var(--space-2);
  gap: var(--space-2);
}

.adl-git-vis__preset-select {
  font-size: 0.8rem;
  padding: 2px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
}

.adl-git-vis__preset-select:hover {
  border-color: var(--border-default);
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/ChartColorPresetSelector.tsx frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(ui): add ChartColorPresetSelector component"
```

---

### Task 8: GitVisualizationView — 接入预设选择器 + data-chart-preset

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`

**Interfaces:**
- Consumes: `ChartColorPresetSelector` (Task 7), `useAppStore().chartColorPreset` (Task 1)

- [ ] **Step 1: Add imports and preset wiring**

Add import:

```typescript
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { ChartColorPresetSelector } from './ChartColorPresetSelector';
```

- [ ] **Step 2: Add state hook and data-chart-preset attribute**

```typescript
export const GitVisualizationView = React.memo(function GitVisualizationView() {
  const { t } = useTCopy();
  const chartColorPreset = useAppStore(useShallow((s) => s.chartColorPreset));

  return (
    <div className="adl-git-vis__container" data-chart-preset={chartColorPreset}>
      <div className="adl-git-vis__preset-bar">
        <ChartColorPresetSelector />
      </div>
      ...
  );
});
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/GitVisualizationView.tsx
git commit -m "feat(git-vis): wire ChartColorPresetSelector with data attribute"
```

---

### Task 9: 图表描述标准化

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`

- [ ] **Step 1: Update Chinese descriptions**

Replace the 8 `gitVis*Desc` keys in `zh-CN/changes.ts`:

```typescript
  gitVisCalendarHeatmapDesc:
    '行：星期（日~六），列：月份（1~12）。色块颜色从浅到深代表当日提交数量由少到多。可快速识别一年中的活跃周期与低谷期。',
  gitVisClockHeatmapDesc:
    '行：星期（日~六），列：时段（0~23时）。色块颜色从浅到深代表该时段提交频次由少到多。可发现团队编码工作节奏。',
  gitVisContributorModuleDesc:
    '行：6位贡献者，列：5个模块。色块颜色从浅到深代表跨领域活跃度由低到高。可定位每位贡献者的主要贡献领域与协作范围。',
  gitVisCodeLineEvoDesc:
    '行：累计行数，列：40周时间。绿线为新增行数，红线为删除行数。可反映项目增长速度与重构节奏。',
  gitVisContributorActivityDesc:
    '行：6位贡献者，列：48周时间段。色块颜色从浅到深代表每人每周提交量由少到多。可追踪每位贡献者在时间维度上的活跃分布。',
  gitVisCommitTimelineDesc:
    '行：累计提交数，列：2周时间。折线为累计提交增长趋势。可展示项目开发速度。',
  gitVisFileSunburstDesc:
    '从内向外按文件类型分层，扇形角度=修改次数/代码量，颜色区分不同类别。可快速定位"热点文件"与高活跃模块。',
  gitVisBranchGraphDesc:
    '每条垂直泳道为一个分支。●圆点为单父提交，■方块为合并提交（2个以上父提交），标签徽章标记tagged版本。可查看项目的分支拓扑与合并历史。',
```

- [ ] **Step 2: Update English descriptions**

Replace the 8 `gitVis*Desc` keys in `en-US/changes.ts`:

```typescript
  gitVisCalendarHeatmapDesc:
    'Row: weekday (Sun~Sat), Column: month (1~12). Cell color intensity from light to dark represents daily commit count from few to many. Quickly identify active periods and low activity phases across the year.',
  gitVisClockHeatmapDesc:
    'Row: weekday (Sun~Sat), Column: hour (0~23). Cell color intensity from light to dark represents commit frequency from low to high. Discover team work rhythm patterns.',
  gitVisContributorModuleDesc:
    'Row: 6 contributors, Column: 5 modules. Cell color intensity from light to dark represents cross-domain activity from low to high. Identify each contributor\'s primary contribution areas and collaboration scope.',
  gitVisCodeLineEvoDesc:
    'Row: cumulative line count, Column: 40 weeks. Green line = added lines, red line = deleted lines. Reflects project growth pace and refactoring rhythm.',
  gitVisContributorActivityDesc:
    'Row: 6 contributors, Column: 48 weeks. Cell color intensity represents weekly commit volume per person from low to high. Track each contributor\'s activity distribution over time.',
  gitVisCommitTimelineDesc:
    'Row: cumulative commits, Column: 2 weeks. Line shows cumulative commit growth trend. Demonstrates project development velocity.',
  gitVisFileSunburstDesc:
    'Inner to outer layers by file type, arc angle = modification count / code volume, colors distinguish categories. Quickly locate "hotspot files" and high-activity modules.',
  gitVisBranchGraphDesc:
    'Each vertical lane is a branch. \u25CF dots are single-parent commits, \u25A0 squares are merge commits (2+ parents), tag badges mark tagged releases. Visualize branch topology and merge history.',
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/i18n/en-US/changes.ts
git commit -m "docs(i18n): standardize chart descriptions with row/column format"
```

---

### Task 10: 测试 — 补充 chartColorPreset 持久化测试

**Files:**
- Modify: `frontend/src/app/stores/__tests__/uiSlice-heatmap-tab.test.ts` (or create new)

- [ ] **Step 1: Add storage key test**

Add to `uiSlice-heatmap-tab.test.ts` (rename file to reflect broader scope, or add tests to existing):

```typescript
import { CHART_COLOR_PRESET_KEY, type ChartColorPreset } from '../slices/uiSliceTypes';

describe('CHART_COLOR_PRESET_KEY', () => {
  it('should have the correct key value', () => {
    expect(CHART_COLOR_PRESET_KEY).toBe('adl-ui:chart-color-preset');
  });
});

describe('ChartColorPreset', () => {
  it('should accept valid preset values', () => {
    const presets: ChartColorPreset[] = ['bklit-default', 'cool-ocean', 'warm-sunset', 'high-contrast'];
    expect(presets).toHaveLength(4);
  });
});

describe('chartColorPreset persistence', () => {
  const key = CHART_COLOR_PRESET_KEY;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return default value when localStorage is empty', () => {
    const result = readJson<ChartColorPreset>(key, 'bklit-default');
    expect(result).toBe('bklit-default');
  });

  it('should persist and retrieve a value via localStorage', () => {
    writeJson(key, 'cool-ocean');
    const result = readJson<ChartColorPreset>(key, 'bklit-default');
    expect(result).toBe('cool-ocean');
  });

  it('should persist each valid preset value', () => {
    const values: ChartColorPreset[] = ['bklit-default', 'cool-ocean', 'warm-sunset', 'high-contrast'];
    for (const v of values) {
      writeJson(key, v);
      expect(readJson<ChartColorPreset>(key, 'bklit-default')).toBe(v);
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run --reporter=verbose src/app/stores/__tests__/uiSlice-heatmap-tab.test.ts
```
Expected: 12+ tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/stores/__tests__/uiSlice-heatmap-tab.test.ts
git commit -m "test(store): add chartColorPreset persistence tests"
```
