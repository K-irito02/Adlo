# Git Visualization 时间范围边界约束与缓存增强 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Git 可视化中非日历热力图的时间范围图表添加年份边界约束和后端 SQLite 缓存，并修复贡献者模块热力图数据流。

**Architecture:** Rust 端通过 `with_cached` 抽象层统一缓存模式；前端通过 `useYearBounds` hook 统一获取年份边界，`TimeRangeSelector` 和 `MiniDatePicker` 在 preset/year 双模式下均受约束。

**Tech Stack:** Rust (tokio + rusqlite + serde), TypeScript (React + Zustand), SQLite

## Global Constraints

- 复用现有 `gitVisCalendarYearEarliest` / `gitVisCalendarYearLatest` i18n key，不新增
- Toast source 统一为 `'git-vis-year-nav'`
- 后端缓存仅历史年份（year < currentYear）写入 SQLite，当年始终重新计算
- 前端 `useYearBounds` 内部维护 LRU Map，避免同一 rootPath 重复请求
- CONTRIBUTOR_MODULES 不新增独立的 TimeRangeSelector，共享 HEATMAP 的时间范围

---

## 任务分解

### Task 1: Rust — `with_cached` 抽象 + 常量 + 缓存重构

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/git_vis_cache.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/workspace_git_vis.rs`
- Test：修改文件内新增 `#[cfg(test)] mod tests`

**Interfaces:**
- Consumes: 现有 `read_cached_chart`、`cache_chart_data`、`extract_year`、`is_historical_year`
- Produces: `with_cached<T>(db, root_path, since, until, chart_type, fetcher) -> Result<T, AppError>`；常量 `CHART_TYPE_CODE_EVOLUTION`、`CHART_TYPE_CONTRIBUTOR_MODULES`

- [ ] **Step 1: 在 `git_vis_cache.rs` 新增常量 + 测试用 mock 数据**

```rust
pub const CHART_TYPE_CODE_EVOLUTION: &str = "code_evolution";
pub const CHART_TYPE_CONTRIBUTOR_MODULES: &str = "contributor_modules";
```

- [ ] **Step 2: 在 `git_vis_cache.rs` 编写 `with_cached` 函数**

```rust
pub(crate) async fn with_cached<T, F, Fut>(
    db: &Database,
    root_path: &str,
    since: Option<&str>,
    until: Option<&str>,
    chart_type: &str,
    fetcher: F,
) -> Result<T, AppError>
where
    T: DeserializeOwned + Serialize,
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    // 1. since 存在 → extract_year → is_historical_year → read_cached_chart
    // 2. 命中则返回
    // 3. 调用 fetcher() 获取数据
    // 4. 历史年份 → cache_chart_data()
    // 5. 返回数据
}
```

- [ ] **Step 3: 在 `git_vis_cache.rs` 添加 `with_cached` 的单元测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use adl_storage::Database;

    #[test]
    fn test_extract_year() {
        assert_eq!(extract_year("2024-01-01"), Some(2024));
        assert_eq!(extract_year("202"), None);
    }

    #[test]
    fn test_is_historical_year() {
        assert!(is_historical_year(2020));
        assert!(!is_historical_year(2099)); // far future
    }
}
```

- [ ] **Step 4: 在 `workspace_git_vis.rs` 重构 `commit_stats` 使用 `with_cached`**

将现有手写缓存逻辑替换为：

```rust
#[tauri::command]
pub async fn workspace_git_vis_commit_stats(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCommitStats>, AppError> {
    let root = Path::new(&root_path);
    let state = app.state::<crate::state::AppState>();
    let data = git_vis_cache::with_cached(
        &state.db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_DAILY_COMMITS,
        || adl_workspace::capture_commit_stats(root, since.as_deref(), until.as_deref()),
    ).await?;
    Ok(ipc(Ok(data)))
}
```

- [ ] **Step 5: 在 `workspace_git_vis.rs` 为 `code_evolution` 添加缓存**

```rust
#[tauri::command]
pub async fn workspace_git_vis_code_evolution(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCodeEvolution>, AppError> {
    let root = Path::new(&root_path);
    let state = app.state::<crate::state::AppState>();
    let data = git_vis_cache::with_cached(
        &state.db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_CODE_EVOLUTION,
        || adl_workspace::capture_code_evolution(root, since.as_deref(), until.as_deref()),
    ).await?;
    Ok(ipc(Ok(data)))
}
```

- [ ] **Step 6: 在 `workspace_git_vis.rs` 为 `contributor_modules` 添加缓存**

```rust
#[tauri::command]
pub async fn workspace_git_vis_contributor_modules(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisContributorModules>, AppError> {
    let root = Path::new(&root_path);
    let state = app.state::<crate::state::AppState>();
    let data = git_vis_cache::with_cached(
        &state.db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_CONTRIBUTOR_MODULES,
        || adl_workspace::capture_contributor_modules(root, since.as_deref(), until.as_deref()),
    ).await?;
    Ok(ipc(Ok(data)))
}
```

- [ ] **Step 7: 运行 Rust 编译和测试**

Run: `cargo test --workspace -- git_vis_cache`
Expected: 所有测试通过

Run: `cargo build --workspace`
Expected: 编译无错误

---

### Task 2: 前端 — chartIds + gitVisActions 补充

**Files:**
- Modify: `frontend/src/app/features/git-visualization/chartIds.ts`
- Modify: `frontend/src/app/stores/actions/gitVisActions.ts`
- Modify: `frontend/src/app/features/git-visualization/hooks/useChartData.ts`

**Interfaces:**
- Consumes: `CHART_IDS.HEATMAP`、`DigitalLifeBridge`
- Produces: `CHART_IDS.CONTRIBUTOR_MODULES`、`fetchChartData` 新增 case、`HEATMAP_TABS` 新增

- [ ] **Step 1: 在 `chartIds.ts` 新增 CONTRIBUTOR_MODULES**

```typescript
export const CHART_IDS = {
  BRANCH_GRAPH: 'branch-graph',
  CODE_LINE_EVO: 'code-line-evolution',
  COMMIT_TIMELINE: 'commit-timeline',
  FILE_SUNBURST: 'file-sunburst',
  HEATMAP: 'heatmap',
  CONTRIBUTOR_MODULES: 'contributor-modules',
} as const;
```

- [ ] **Step 2: 在 `gitVisActions.ts` 的 `fetchChartData` 中添加 case**

```typescript
case CHART_IDS.CONTRIBUTOR_MODULES:
  // Uses HEATMAP's time range (they share the same TimeRangeSelector in HeatmapCardGroup)
  result = await bridge.workspace.gitVisContributorModules(rootPath, since, until);
  break;
```

- [ ] **Step 3: 在 `useChartData.ts` 的 `TIME_RANGE_CHARTS` 中添加 CONTRIBUTOR_MODULES**

```typescript
const TIME_RANGE_CHARTS = new Set<string>([
  CHART_IDS.HEATMAP,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
  CHART_IDS.CONTRIBUTOR_MODULES,
]);
```

- [ ] **Step 4: 在 `gitVisActions.ts` 的 `HEATMAP_TABS` 中添加 CONTRIBUTOR_MODULES**

```typescript
export const HEATMAP_TABS = [
  CHART_IDS.HEATMAP,
  CHART_IDS.BRANCH_GRAPH,
  CHART_IDS.FILE_SUNBURST,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
  CHART_IDS.CONTRIBUTOR_MODULES,
] as const;
```

---

### Task 3: 前端 — `useYearBounds` Hook

**Files:**
- Create: `frontend/src/app/features/git-visualization/hooks/useYearBounds.ts`
- Create: `frontend/src/app/features/git-visualization/hooks/useYearBounds.test.ts`

**Interfaces:**
- Consumes: `window.digitalLife.workspace.gitVisFirstCommitYear(rootPath)`
- Produces: `{ yearBounds: { min: number; max: number } | null; loading: boolean }`

- [ ] **Step 1: 创建 `useYearBounds.ts`**

```typescript
import { useEffect, useState, useRef } from 'react';

interface YearBounds {
  min: number;
  max: number;
}

const cache = new Map<string, Promise<number | null>>();

export function useYearBounds(rootPath: string): {
  yearBounds: YearBounds | null;
  loading: boolean;
} {
  const [firstCommitYear, setFirstCommitYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!rootPath) {
      setFirstCommitYear(null);
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);

    const fetchYear = async () => {
      if (cache.has(rootPath)) {
        const year = await cache.get(rootPath)!;
        if (!cancelledRef.current) {
          setFirstCommitYear(year);
          setLoading(false);
        }
        return;
      }

      const promise = window.digitalLife.workspace.gitVisFirstCommitYear(rootPath)
        .then((result: any) => result.ok ? (result.data ?? null) : null);

      cache.set(rootPath, promise);

      const year = await promise;
      if (!cancelledRef.current) {
        setFirstCommitYear(year);
        setLoading(false);
      }
    };

    fetchYear();

    return () => {
      cancelledRef.current = true;
    };
  }, [rootPath]);

  const yearBounds: YearBounds | null = firstCommitYear
    ? { min: firstCommitYear, max: new Date().getFullYear() }
    : null;

  return { yearBounds, loading };
}
```

- [ ] **Step 2: 运行测试验证 Jest 环境可用**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | head -5`

- [ ] **Step 3: 创建 `useYearBounds.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useYearBounds } from './useYearBounds';

const mockFirstCommitYear = vi.fn();

beforeEach(() => {
  (window as any).digitalLife = {
    workspace: {
      gitVisFirstCommitYear: mockFirstCommitYear,
    },
  };
  // Clear the internal cache between tests
  // (cache is module-level, need to clear via a reset mechanism)
});

afterEach(() => {
  vi.clearAllMocks();
});

it('returns yearBounds when firstCommitYear is fetched', async () => {
  mockFirstCommitYear.mockResolvedValueOnce({ ok: true, data: 2020 });
  const { result } = renderHook(() => useYearBounds('/path/to/repo'));
  await waitFor(() => expect(result.current.yearBounds).toEqual({ min: 2020, max: new Date().getFullYear() }));
});

it('returns null yearBounds when rootPath is empty', () => {
  const { result } = renderHook(() => useYearBounds(''));
  expect(result.current.yearBounds).toBeNull();
});

it('caches the result for the same rootPath', async () => {
  mockFirstCommitYear.mockResolvedValueOnce({ ok: true, data: 2020 });
  const { result: r1 } = renderHook(() => useYearBounds('/path/repo'));
  await waitFor(() => expect(r1.current.yearBounds).not.toBeNull());

  // Second call with same rootPath should not call the bridge again
  mockFirstCommitYear.mockClear();
  const { result: r2 } = renderHook(() => useYearBounds('/path/repo'));
  await waitFor(() => expect(r2.current.yearBounds).toEqual({ min: 2020, max: new Date().getFullYear() }));
  expect(mockFirstCommitYear).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/hooks/useYearBounds.test.ts`
Expected: 所有测试 PASS

---

### Task 4: 前端 — TimeRangeSelector + MiniDatePicker 年份边界

**Files:**
- Modify: `frontend/src/app/features/git-visualization/TimeRangeSelector.tsx`
- Modify: `frontend/src/app/features/git-visualization/MiniDatePicker.tsx`
- Modify: `frontend/src/app/features/git-visualization/TimeRangeSelector.test.tsx`
- Modify: `frontend/src/app/features/git-visualization/MiniDatePicker.test.tsx`（Create 如果不存在）

**Interfaces:**
- Consumes: `YearBounds` from useYearBounds
- Produces: 增强的 `TimeRangeSelector`（preset 模式边界保护）、增强的 `MiniDatePicker`（年份导航边界保护）

- [ ] **Step 1: MiniDatePicker 新增 `yearBounds` prop 和 `onBoundary` 回调**

```typescript
interface MiniDatePickerProps {
  value: string;
  onChange: (date: string) => void;
  onClose: () => void;
  yearBounds?: { min: number; max: number };
  onBoundary?: (type: 'earliest' | 'latest') => void;
}
```

修改 `handlePrevYear`:
```typescript
const handlePrevYear = useCallback(() => {
  if (yearBounds && viewYear - 1 < yearBounds.min) {
    onBoundary?.('earliest');
    return;
  }
  setViewYear((y) => y - 1);
}, [viewYear, yearBounds, onBoundary]);
```

修改 `handleNextYear`:
```typescript
const handleNextYear = useCallback(() => {
  if (yearBounds && viewYear + 1 > yearBounds.max) {
    onBoundary?.('latest');
    return;
  }
  setViewYear((y) => y + 1);
}, [viewYear, yearBounds, onBoundary]);
```

- [ ] **Step 2: MiniDatePicker 月份切换跨年边界保护**

```typescript
const handlePrevMonth = useCallback(() => {
  if (viewMonth === 0) {
    if (yearBounds && viewYear - 1 < yearBounds.min) {
      onBoundary?.('earliest');
      return;
    }
    setViewYear((y) => y - 1);
    setViewMonth(11);
  } else {
    setViewMonth((m) => m - 1);
  }
}, [viewMonth, viewYear, yearBounds, onBoundary]);

const handleNextMonth = useCallback(() => {
  if (viewMonth === 11) {
    if (yearBounds && viewYear + 1 > yearBounds.max) {
      onBoundary?.('latest');
      return;
    }
    setViewYear((y) => y + 1);
    setViewMonth(0);
  } else {
    setViewMonth((m) => m + 1);
  }
}, [viewMonth, viewYear, yearBounds, onBoundary]);
```

- [ ] **Step 3: 在 TimeRangeSelector 中传递 yearBounds 到 MiniDatePicker 并绑定 onBoundary**

在 TimeRangeSelector 渲染 MiniDatePicker 的位置，传递 yearBounds 和 onBoundary：

```tsx
<MiniDatePicker
  key={activeDateField || 'hidden'}
  value={activeDateField === 'since' ? customSince : customUntil}
  onChange={/* existing */}
  onClose={/* existing */}
  yearBounds={yearBounds ?? undefined}
  onBoundary={(type) => {
    showToast(
      type === 'earliest' ? t.gitVisCalendarYearEarliest : t.gitVisCalendarYearLatest,
      'warning',
      'git-vis-year-nav',
    );
  }}
/>
```

- [ ] **Step 4: TimeRangeSelector 的 `handleStep` 添加 preset 模式边界检查**

```typescript
const handleStep = useCallback(
  (direction: -1 | 1) => {
    if (!value.since || !value.until) {
      return;
    }
    const until = new Date(value.until);
    const since = new Date(value.since);
    const rangeMs = until.getTime() - since.getTime();
    const newUntil = new Date(until.getTime() + direction * rangeMs);
    const newSince = new Date(since.getTime() + direction * rangeMs);

    const newSinceYear = newSince.getFullYear();
    const newUntilYear = newUntil.getFullYear();

    if (yearBounds) {
      if (newSinceYear < yearBounds.min) {
        showToast(t.gitVisCalendarYearEarliest, 'warning', 'git-vis-year-nav');
        return;
      }
      if (newUntilYear > yearBounds.max) {
        showToast(t.gitVisCalendarYearLatest, 'warning', 'git-vis-year-nav');
        return;
      }
    }

    onChange({
      preset: 'custom',
      since: newSince.toISOString().substring(0, 10),
      until: newUntil.toISOString().substring(0, 10),
    });
  },
  [value, onChange, yearBounds, showToast, t],
);
```

- [ ] **Step 5: 在 `TimeRangeSelector.test.tsx` 新增 preset 模式边界测试**

```typescript
describe('TimeRangeSelector preset mode with yearBounds', () => {
  const yearBounds = { min: 2020, max: 2026 };

  it('blocks step to earlier period before min year and shows toast', () => {
    const onChange = vi.fn();
    const minValue: TimeRangeState = {
      preset: 'custom',
      since: '2020-01-01',
      until: '2020-12-31',
    };
    render(
      <TimeRangeSelector
        value={minValue}
        onChange={onChange}
        mode="preset"
        yearBounds={yearBounds}
      />,
    );
    const leftBtn = screen.getByRole('button', { name: 'Earlier Period' });
    fireEvent.click(leftBtn);
    expect(mockShowToast).toHaveBeenCalledWith(
      'Already the earliest year',
      'warning',
      'git-vis-year-nav',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('blocks step to later period after max year and shows toast', () => {
    const onChange = vi.fn();
    const maxValue: TimeRangeState = {
      preset: 'custom',
      since: '2026-06-01',
      until: '2026-07-01',
    };
    render(
      <TimeRangeSelector
        value={maxValue}
        onChange={onChange}
        mode="preset"
        yearBounds={yearBounds}
      />,
    );
    const rightBtn = screen.getByRole('button', { name: 'Later Period' });
    fireEvent.click(rightBtn);
    expect(mockShowToast).toHaveBeenCalledWith(
      'Already the latest year',
      'warning',
      'git-vis-year-nav',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows step within bounds', () => {
    const onChange = vi.fn();
    const midValue: TimeRangeState = {
      preset: 'custom',
      since: '2023-01-01',
      until: '2023-12-31',
    };
    render(
      <TimeRangeSelector
        value={midValue}
        onChange={onChange}
        mode="preset"
        yearBounds={yearBounds}
      />,
    );
    const leftBtn = screen.getByRole('button', { name: 'Earlier Period' });
    fireEvent.click(leftBtn);
    // Should successfully navigate to 2022 range
    expect(onChange).toHaveBeenCalledWith({
      preset: 'custom',
      since: '2022-01-01',
      until: '2022-12-31',
    });
  });
});
```

同时需要在 mock 中添加新 i18n key 和按钮 label：
```typescript
// 在 mock 中添加
gitVisTimePrev: 'Earlier Period',
gitVisTimeNext: 'Later Period',
```

- [ ] **Step 6: 创建/修改 MiniDatePicker.test.tsx**

```typescript
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MiniDatePicker } from './MiniDatePicker';

const mockOnChange = vi.fn();
const mockOnClose = vi.fn();
const mockOnBoundary = vi.fn();

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisDatePickerSun: 'Sun',
      gitVisDatePickerMon: 'Mon',
      gitVisDatePickerTue: 'Tue',
      gitVisDatePickerWed: 'Wed',
      gitVisDatePickerThu: 'Thu',
      gitVisDatePickerFri: 'Fri',
      gitVisDatePickerSat: 'Sat',
      gitVisDatePickerPrevYear: 'Prev Year',
      gitVisDatePickerPrevMonth: 'Prev Month',
      gitVisDatePickerNextMonth: 'Next Month',
      gitVisDatePickerNextYear: 'Next Year',
      close: 'Close',
    },
    locale: 'en-US',
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MiniDatePicker year bounds', () => {
  const yearBounds = { min: 2020, max: 2026 };

  it('blocks prev year button at min year', () => {
    render(
      <MiniDatePicker
        value="2020-06-15"
        onChange={mockOnChange}
        onClose={mockOnClose}
        yearBounds={yearBounds}
        onBoundary={mockOnBoundary}
      />,
    );
    const prevYearBtn = screen.getByRole('button', { name: 'Prev Year' });
    fireEvent.click(prevYearBtn);
    expect(mockOnBoundary).toHaveBeenCalledWith('earliest');
  });

  it('blocks next year button at max year', () => {
    render(
      <MiniDatePicker
        value="2026-01-01"
        onChange={mockOnChange}
        onClose={mockOnClose}
        yearBounds={yearBounds}
        onBoundary={mockOnBoundary}
      />,
    );
    const nextYearBtn = screen.getByRole('button', { name: 'Next Year' });
    fireEvent.click(nextYearBtn);
    expect(mockOnBoundary).toHaveBeenCalledWith('latest');
  });
});
```

- [ ] **Step 7: 运行测试确认通过**

Run: `cd frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/TimeRangeSelector.test.tsx src/app/features/git-visualization/MiniDatePicker.test.tsx`
Expected: 所有测试 PASS

---

### Task 5: 前端 — GitVisualizationView + HeatmapCardGroup 集成

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`
- Modify: `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx`
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx`

**Interfaces:**
- Consumes: `useYearBounds(rootPath)`、`useChartData(CHART_IDS.CONTRIBUTOR_MODULES)`、`yearBounds`
- Produces: 完全集成的可视化视图

- [ ] **Step 1: 在 `GitVisualizationView.tsx` 添加 `useYearBounds`**

```typescript
// 顶部 import
import { useYearBounds } from './hooks/useYearBounds';

// 在组件内
const { yearBounds } = useYearBounds(rootPath);
```

- [ ] **Step 2: 添加 `CONTRIBUTOR_MODULES` 的独立 useChartData**

```typescript
const contributorModulesData = useChartData(CHART_IDS.CONTRIBUTOR_MODULES);
```

- [ ] **Step 3: `TimeRangeAwareCard` 添加 `yearBounds` prop 并传递**

```typescript
interface TimeRangeAwareCardProps {
  // ... existing props
  yearBounds?: YearBounds | null;
}

// 在 TimeRangeSelector 渲染处
<TimeRangeSelector
  value={timeRange.timeRange}
  onChange={(range) => {
    timeRange.setTimeRange(range);
    onRefresh();
  }}
  yearBounds={yearBounds ?? undefined}
/>
```

- [ ] **Step 4: 修改 `HeatmapCardGroup` 移除内部 `firstCommitYear`，改为 props 接收**

```typescript
interface HeatmapCardGroupProps {
  // ... existing props
  yearBounds?: { min: number; max: number } | null;
  contributorModulesData?: {
    data: unknown;
    loading: boolean;
    error: string | undefined;
  };
}
```

删除 `HeatmapCardGroup` 组件内的 `firstCommitYear` 状态和 `useEffect`。

在 TimeRangeSelector 渲染处传入 `yearBounds`：

```typescript
{timeRange && onTimeRangeChange && (
  <TimeRangeSelector
    value={timeRange}
    onChange={onTimeRangeChange}
    mode={activeHeatmapTab === 'calendar' ? 'year' : 'preset'}
    yearBounds={
      activeHeatmapTab === 'calendar' && yearBounds
        ? yearBounds
        : yearBounds ?? undefined
    }
  />
)}
```

Module tab 使用 `contributorModulesData` 替代当前转型：

```typescript
{activeHeatmapTab === 'module' && (
  <ContributorModuleHeatmap
    data={
      (contributorModulesData?.data as any)?.matrix
    }
  />
)}
```

- [ ] **Step 5: `GitVisualizationView` 传递新 props**

```typescript
<HeatmapCardGroup
  onRefresh={handleRefreshHeatmap}
  commitStats={/* existing */}
  contributorModules={(contributorModulesData.data as any)?.matrix}
  contributorModulesData={contributorModulesData}
  timeRange={heatmapData.timeRange}
  onTimeRangeChange={(range) => {
    heatmapData.setTimeRange(range);
    contributorModulesData.setTimeRange(range);
    handleRefreshHeatmap();
  }}
  yearBounds={yearBounds}
/>

<TimeRangeAwareCard
  // ...
  timeRange={codeLineEvoData}
  yearBounds={yearBounds}
>
  {/* ... */}
</TimeRangeAwareCard>

<TimeRangeAwareCard
  // ...
  timeRange={commitTimelineData}
  yearBounds={yearBounds}
>
  {/* ... */}
</TimeRangeAwareCard>
```

- [ ] **Step 6: 更新 `GitVisualizationView.test.tsx`**

在 mock store 中添加 CONTRIBUTOR_MODULES 相关字段：
```typescript
gitVisTimeRange: {
  'workspace-1': {
    'contributor-modules': { preset: 'year', since: '2026-01-01', until: '2026-12-31' },
  },
},
```

添加 `useYearBounds` mock：
```typescript
vi.mock('./hooks/useYearBounds', () => ({
  useYearBounds: () => ({ yearBounds: { min: 2020, max: 2026 }, loading: false }),
}));
```

- [ ] **Step 7: 运行所有前端测试**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: 所有测试 PASS

---

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-07-25-git-vis-time-range-plan.md`. 两个执行选项：

**1. Subagent-Driven（推荐）** — 每个 Task 分发独立子代理，task 间审查，快速迭代

**2. Inline Execution** — 当前会话使用 executing-plans 顺序执行

选择哪种方式？
