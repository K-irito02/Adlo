# Calendar Year Selector & Git Visualization Cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the calendar chart's time range menu with a year selector and add Rust SQLite caching for historical git commit data.

**Architecture:** TimeRangeSelector gains a `mode` prop (`'preset' | 'year'`); HeatmapCardGroup passes `mode='year'` when the active tab is `'calendar'`. A new `git_vis_cache` SQLite table stores per-workspace, per-year, per-chart-type JSON data. The Tauri command layer checks cache before executing git log for historical years, and always refreshes for the current year. A new command provides the first commit year for bounding year navigation.

**Tech Stack:** React 19 + Zustand + Tauri 2.x + rusqlite + adl-storage

## Global Constraints

- `adl-workspace` crate remains pure (no storage dependency) — caching lives at the Tauri command layer
- `TimeRangeSelector` changes must not affect non-calendar tabs (clock/activity/module) or other chart cards
- Year selector card: square corners (`border-radius: 0`), max 5 visible items + scroll, checkmark on selected
- Year range bounds: `[firstCommitYear..currentYear]`
- Navigation buttons: "上一年" / "下一年"; disabled at bounds + toast on click
- toast API: `showToast(message, type?, source?, duration?)` from toastSlice
- i18n: new keys auto-typed from zh-CN spread; add to `changes.ts` domain module

---
### Task 1: Add `git_vis_cache` table & migration

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\storage\sql\init_schema.sql` (add table DDL)
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\migration\src\lib.rs` (add migration v4)
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\storage\src\purge.rs` (add cache cleanup to purge_workspace)
- Test: via existing integration tests (purge test coverage)

**Interfaces:**
- Consumes: `Database::transaction()`, `Database::execute()` from `adl-storage`
- Produces: `git_vis_cache` table with schema:
  ```sql
  CREATE TABLE IF NOT EXISTS git_vis_cache (
    root_path TEXT NOT NULL,
    year INTEGER NOT NULL CHECK(year >= 1900 AND year <= 3000),
    chart_type TEXT NOT NULL,
    data TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (root_path, year, chart_type)
  );
  ```

- [ ] **Step 1: Add DDL to init_schema.sql**

Append `git_vis_cache` CREATE TABLE to `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\storage\sql\init_schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS git_vis_cache (
    root_path TEXT NOT NULL,
    year INTEGER NOT NULL CHECK(year >= 1900 AND year <= 3000),
    chart_type TEXT NOT NULL,
    data TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (root_path, year, chart_type)
);
```

- [ ] **Step 2: Add migration v4**

In `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\migration\src\lib.rs`, add to `MIGRATIONS`:

```rust
Migration {
    version: 4,
    description: "Add git_vis_cache table for visualization data caching",
    sql: r#"
        CREATE TABLE IF NOT EXISTS git_vis_cache (
            root_path TEXT NOT NULL,
            year INTEGER NOT NULL CHECK(year >= 1900 AND year <= 3000),
            chart_type TEXT NOT NULL,
            data TEXT NOT NULL,
            cached_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (root_path, year, chart_type)
        );
    "#,
},
```

- [ ] **Step 3: Add cache cleanup to purge_workspace**

In `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\storage\src\purge.rs`, inside `purge_workspace()`'s transaction closure, after the existing scoped table loop, add:

```rust
if let Some(root) = root_path {
    let n = conn
        .execute("DELETE FROM git_vis_cache WHERE root_path = ?1", params![root])
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if n > 0 {
        report.per_table.insert("git_vis_cache".to_string(), n);
        report.total_rows_deleted += n;
    }
}
```

- [ ] **Step 4: Verify migration compiles**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo check -p adl-migration -p adl-storage`
Expected: no errors

### Task 2: Add cache read/write helpers + first-commit-year function

**Files:**
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\src\commands\git_vis_cache.rs`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\src\commands\workspace_git_vis.rs` (integrate cache)
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\src\commands\mod.rs` (register new module)
- Test: compile check

**Interfaces:**
- Consumes: `adl_storage::Database`, `adl_workspace::capture_commit_stats()`
- Produces:
  - `GitVisCache` struct with `read_cache(db, root_path, year, chart_type) -> Option<String>`
  - `GitVisCache::write_cache(db, root_path, year, chart_type, data)`
  - `get_first_commit_year(root_path) -> Option<i32>` (new function, runs git log)
  - `workspace_git_vis_first_commit_year` Tauri command

- [ ] **Step 1: Create `git_vis_cache.rs` module**

```rust
// src-tauri/src/commands/git_vis_cache.rs
use adl_errors::AppError;
use adl_storage::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const CHART_TYPE_DAILY_COMMITS: &str = "daily_commits";

pub fn read_cached_data(
    db: &Database,
    root_path: &str,
    year: i32,
    chart_type: &str,
) -> Result<Option<String>, AppError> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT data FROM git_vis_cache WHERE root_path = ?1 AND year = ?2 AND chart_type = ?3",
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let result: Option<String> = stmt
        .query_row(params![root_path, year, chart_type], |row| row.get(0))
        .ok();
    Ok(result)
}

pub fn write_cached_data(
    db: &Database,
    root_path: &str,
    year: i32,
    chart_type: &str,
    data: &str,
) -> Result<(), AppError> {
    db.execute(
        "INSERT OR REPLACE INTO git_vis_cache (root_path, year, chart_type, data) VALUES (?1, ?2, ?3, ?4)",
        &[&root_path, &year.to_string(), &chart_type, &data],
    )?;
    Ok(())
}

/// Extract year from ISO date string (assumes YYYY-MM-DD format)
pub fn extract_year(date_str: &str) -> Option<i32> {
    if date_str.len() >= 4 {
        date_str[0..4].parse().ok()
    } else {
        None
    }
}

/// Determine if a year is historical (fully in the past, i.e., year < current year)
pub fn is_historical_year(year: i32) -> bool {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let current_year = 1970 + (secs / 31_557_600) as i32;
    year < current_year
}
```

- [ ] **Step 2: Create `get_first_commit_year()` in git_vis_cache.rs**

```rust
use std::path::Path;
use tokio::process::Command;

pub async fn get_first_commit_year(root_path: &Path) -> Result<Option<i32>, AppError> {
    let output = Command::new("git")
        .args([
            "-C",
            root_path.to_str().unwrap_or("."),
            "log",
            "--reverse",
            "--format=%aI",
            "--max-count=1",
        ])
        .output()
        .await
        .map_err(|e| AppError::Workspace(format!("git log --reverse failed: {e}")))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let date_str = stdout.trim();
        if date_str.len() >= 4 {
            let year: i32 = date_str[0..4].parse().ok()?;
            Ok(Some(year))
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}
```

(No new crate dependency needed — `std::time::SystemTime` is sufficient.)

- [ ] **Step 3: Integrate cache into `workspace_git_vis_commit_stats`**

Modify `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\src\commands\workspace_git_vis.rs`:

```rust
use crate::commands::git_vis_cache::{
    read_cached_data, write_cached_data, extract_year, is_historical_year,
    CHART_TYPE_DAILY_COMMITS,
};
use serde_json;

/// Cache-aware version: returns cached data for historical years, runs git log for current year.
/// The `since`/`until` are expected to be `YYYY-01-01`/`YYYY-12-31` for year mode.
#[tauri::command]
pub async fn workspace_git_vis_commit_stats(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCommitStats>, AppError> {
    let root = Path::new(&root_path);

    // Cache logic: only for year-range queries (since=YYYY-01-01, until=YYYY-12-31)
    if let (Some(s), Some(u)) = (&since, &until) {
        if let Some(year) = extract_year(s) {
            if is_historical_year(year) {
                let state = app.state::<crate::state::AppState>();
                if let Some(cached_json) = read_cached_data(&state.db, &root_path, year, CHART_TYPE_DAILY_COMMITS)? {
                    let data: GitVisCommitStats = serde_json::from_str(&cached_json)
                        .map_err(|e| AppError::Internal(format!("cache deserialize failed: {e}")))?;
                    return Ok(ipc(Ok(data)));
                }
            }
        }
    }

    // Cache miss or current year: execute git log
    let data = adl_workspace::capture_commit_stats(root, since.as_deref(), until.as_deref()).await?;

    // Write cache for historical years
    if let (Some(s), Some(_u)) = (&since, &until) {
        if let Some(year) = extract_year(s) {
            if is_historical_year(year) {
                let state = app.state::<crate::state::AppState>();
                let json = serde_json::to_string(&data)
                    .map_err(|e| AppError::Internal(format!("cache serialize failed: {e}")))?;
                write_cached_data(&state.db, &root_path, year, CHART_TYPE_DAILY_COMMITS, &json)?;
            }
        }
    }

    Ok(ipc(Ok(data)))
}
```

- [ ] **Step 4: Add `workspace_git_vis_first_commit_year` command**

In `workspace_git_vis.rs`:

```rust
#[tauri::command]
pub async fn workspace_git_vis_first_commit_year(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<IpcResult<Option<i32>>, AppError> {
    let root = Path::new(&root_path);
    let year = git_vis_cache::get_first_commit_year(root).await?;
    Ok(ipc(Ok(year)))
}
```

- [ ] **Step 5: Register new module and commands**

In `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\src-tauri\src\commands\mod.rs`:
- Add `pub mod git_vis_cache;` 
- Register the new command in the `invoke_handler`

- [ ] **Step 6: Update IPC bridge**

Add `gitVisFirstCommitYear` to the workspace IPC bridge:
`E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\shared\ipc\workspace.ts`:
```typescript
gitVisFirstCommitYear: (rootPath: string) => Promise<IpcResult<number | null>>;
```

And add mock/preview implementations to `tauri-bridge.ts`, `preview-bridge/`, `mock-bridge.ts`.

- [ ] **Step 7: Verify everything compiles**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo check`
Expected: no errors

### Task 3: Add i18n keys for year selector

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\i18n\zh-CN\changes.ts`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\i18n\en-US\changes.ts`

**Interfaces:**
- Produces: 5 new i18n keys auto-typed via `CopyKey`

- [ ] **Step 1: Add Chinese translations**

In `zh-CN/changes.ts`, before the closing `} as const;`:

```typescript
  gitVisCalendarYearPrev: '上一年',
  gitVisCalendarYearNext: '下一年',
  gitVisCalendarYearLatest: '已是最新年份',
  gitVisCalendarYearEarliest: '已是最早提交年份',
  gitVisCalendarSelectYear: '选择年份',
```

- [ ] **Step 2: Add English translations**

In `en-US/changes.ts`, before the closing `} as const;`:

```typescript
  gitVisCalendarYearPrev: 'Previous Year',
  gitVisCalendarYearNext: 'Next Year',
  gitVisCalendarYearLatest: 'Already the latest year',
  gitVisCalendarYearEarliest: 'Already the earliest year',
  gitVisCalendarSelectYear: 'Select Year',
```

### Task 4: Implement `mode` prop in TimeRangeSelector + year selection UI

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\TimeRangeSelector.tsx`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\styles\regions\rightpanel\git-visualization.css` (year menu styles)

**Interfaces:**
- Consumes: `TimeRangeState` from store, `activeHeatmapTab` from HeatmapCardGroup, `showToast` from toastSlice
- Produces: Updated `TimeRangeSelector` with `mode: 'preset' | 'year'` prop

- [ ] **Step 1: Add new imports and props**

At the top of `TimeRangeSelector.tsx`, add:
```typescript
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
```

Update interface:
```typescript
interface TimeRangeSelectorProps {
  value: TimeRangeState;
  onChange: (range: TimeRangeState) => void;
  mode?: 'preset' | 'year';
  /** Only used when mode='year': bounds for year navigation */
  yearBounds?: { min: number; max: number } | null;
}
```

- [ ] **Step 2: Add year selection state and logic**

Inside the component, add:

```typescript
// Year selection mode
const isYearMode = mode === 'year';
const currentYear = new Date().getFullYear();
const selectedYear = value.since ? parseInt(value.since.substring(0, 4)) : currentYear;
const minYear = yearBounds?.min ?? (currentYear - 10);
const maxYear = yearBounds?.max ?? currentYear;

const yearOptions: number[] = [];
for (let y = maxYear; y >= minYear; y--) {
  yearOptions.push(y);
}
```

- [ ] **Step 3: Add year mode rendering**

Replace the main return block's rendering logic. When `isYearMode`, render:

```tsx
// Year navigation buttons + label
<button
  type="button"
  className="adl-git-vis__timerange-btn adl-git-vis__timerange-nav"
  onClick={() => {
    if (selectedYear <= minYear) {
      showToast(t.gitVisCalendarYearEarliest, 'warning', 'calendar-year-nav');
      return;
    }
    handleYearChange(selectedYear - 1);
  }}
  title={t.gitVisCalendarYearPrev}
  aria-label={t.gitVisCalendarYearPrev}
>
  <IconArrowLeft size={12} decorative />
</button>
<button
  type="button"
  className="adl-git-vis__timerange-btn adl-git-vis__timerange-label"
  onClick={() => setOpen(!open)}
>
  {selectedYear}
</button>
<button
  type="button"
  className="adl-git-vis__timerange-btn adl-git-vis__timerange-nav"
  onClick={() => {
    if (selectedYear >= maxYear) {
      showToast(t.gitVisCalendarYearLatest, 'warning', 'calendar-year-nav');
      return;
    }
    handleYearChange(selectedYear + 1);
  }}
  title={t.gitVisCalendarYearNext}
  aria-label={t.gitVisCalendarYearNext}
>
  <IconArrowRight size={12} decorative />
</button>
```

Add `handleYearChange`:
```typescript
const handleYearChange = useCallback(
  (year: number) => {
    onChange({
      preset: 'custom',
      since: `${year}-01-01`,
      until: `${year}-12-31`,
    });
    setOpen(false);
  },
  [onChange],
);
```

The year menu dropdown (rendered when `open && isYearMode`):
```tsx
{open && isYearMode && (
  <div className="adl-git-vis__timerange-menu adl-git-vis__year-menu">
    {yearOptions.map((y) => (
      <button
        key={y}
        type="button"
        className={`adl-git-vis__year-menu-item${y === selectedYear ? ' adl-git-vis__year-menu-item--active' : ''}`}
        onClick={() => handleYearChange(y)}
      >
        <span>{y}</span>
        {y === selectedYear && (
          <span className="adl-git-vis__timerange-menu-check">
            <IconCheck size={14} decorative />
          </span>
        )}
      </button>
    ))}
  </div>
)}
```

For the non-year mode (`!isYearMode`), keep all the EXISTING rendering unchanged. The existing code stays in the same return, wrapped in a conditional or short-circuit pattern.

The full return structure:

```tsx
return (
  <div ref={ref} style={{ ... }}>
    <button type="button" className="..." onClick={() => {
      if (isYearMode) {
        if (selectedYear <= minYear) {
          showToast(t.gitVisCalendarYearEarliest, 'warning', 'calendar-year-nav');
          return;
        }
        handleYearChange(selectedYear - 1);
      } else {
        handleStep(-1);
      }
    }} ...>
      <IconArrowLeft size={12} decorative />
    </button>
    <button type="button" className="..." onClick={() => setOpen(!open)}>
      {isYearMode ? selectedYear : getDisplayText()}
    </button>
    {open && (
      isYearMode ? (
        <div className="adl-git-vis__timerange-menu adl-git-vis__year-menu">
          {/* year options */}
        </div>
      ) : (
        <div className="adl-git-vis__timerange-menu">
          {/* existing preset menu */}
        </div>
      )
    )}
    <button type="button" className="..." onClick={() => {
      if (isYearMode) {
        if (selectedYear >= maxYear) {
          showToast(t.gitVisCalendarYearLatest, 'warning', 'calendar-year-nav');
          return;
        }
        handleYearChange(selectedYear + 1);
      } else {
        handleStep(1);
      }
    }} ...>
      <IconArrowRight size={12} decorative />
    </button>
  </div>
);
```

- [ ] **Step 4: Add year menu CSS**

Append to `git-visualization.css`:

```css
/* ── Year Selector Menu ── */
.adl-git-vis__year-menu {
  max-height: calc(5 * 28px + 8px); /* 5 items visible + padding */
  overflow-y: auto;
  scrollbar-width: thin;
}
.adl-git-vis__year-menu::-webkit-scrollbar {
  width: 6px;
}
.adl-git-vis__year-menu::-webkit-scrollbar-track {
  background: transparent;
}
.adl-git-vis__year-menu::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 999px;
}
.adl-git-vis__year-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 10px;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  gap: 8px;
  border-radius: 0;
}
.adl-git-vis__year-menu-item:hover {
  background: var(--bg-hover);
}
.adl-git-vis__year-menu-item--active {
  font-weight: 600;
}
```

- [ ] **Step 5: Verify with TypeScript**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && npx tsc --noEmit`
Expected: no type errors

### Task 5: Wire HeatmapCardGroup to pass year mode to TimeRangeSelector

**Files:**
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\HeatmapCardGroup.tsx`
- Modify: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\TimeRangeSelector.tsx` (optional - already handled in Task 4)

**Interfaces:**
- Consumes: `activeHeatmapTab` from store, `timeRange`/`onTimeRangeChange` props
- Produces: time range selector with `mode='year'` when calendar tab is active

- [ ] **Step 1: Add imports and first-commit-year state**

In `HeatmapCardGroup.tsx`, add:
```typescript
import { useEffect, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
```

Inside the component, add:
```typescript
const [firstCommitYear, setFirstCommitYear] = useState<number | null>(null);
const bridge = useAppStore((s) => s.bridge);
const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
const workspace = useAppStore((s) => s.recentWorkspaces.find(w => w.id === activeWorkspaceTab));

// Fetch first commit year when workspace changes
useEffect(() => {
  if (!bridge || !workspace?.rootPath) {
    setFirstCommitYear(null);
    return;
  }
  const rootPath = workspace.rootPath;
  let cancelled = false;
  bridge.workspace.gitVisFirstCommitYear(rootPath).then((result) => {
    if (!cancelled && result.ok) {
      setFirstCommitYear(result.data ?? null);
    }
  });
  return () => { cancelled = true; };
}, [bridge, workspace?.rootPath]);
```

- [ ] **Step 2: Pass mode and yearBounds to TimeRangeSelector**

Change the TimeRangeSelector usage in the JSX:

```tsx
{timeRange && onTimeRangeChange && (
  <TimeRangeSelector
    value={timeRange}
    onChange={onTimeRangeChange}
    mode={activeHeatmapTab === 'calendar' ? 'year' : 'preset'}
    yearBounds={
      activeHeatmapTab === 'calendar' && firstCommitYear
        ? { min: firstCommitYear, max: new Date().getFullYear() }
        : undefined
    }
  />
)}
```

- [ ] **Step 3: Verify with TypeScript**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && npx tsc --noEmit`
Expected: no type errors

### Task 6: Integration test — calendar year selector behavior

**Files:**
- Create: `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\git-visualization\TimeRangeSelector.test.tsx` (or modify existing if any)

**Interfaces:**
- Tests `TimeRangeSelector` in `mode='year'` rendering and navigation

- [ ] **Step 1: Write the test**

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimeRangeSelector } from './TimeRangeSelector';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';

// Mock i18n
vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisCalendarYearPrev: 'Previous Year',
      gitVisCalendarYearNext: 'Next Year',
      gitVisCalendarYearLatest: 'Already the latest year',
      gitVisCalendarYearEarliest: 'Already the earliest year',
      gitVisCalendarSelectYear: 'Select Year',
      gitVisTimePrev: 'Earlier Period',
      gitVisTimeNext: 'Later Period',
      gitVisTimeWeek: 'Past Week',
      gitVisTimeMonth: 'Past Month',
      gitVisTimeYear: 'Past Year',
      gitVisTimeAll: 'All Time',
      gitVisTimeCustom: 'Custom',
      gitVisTimeStartDate: 'Start Date',
      gitVisTimeEndDate: 'End Date',
      gitVisTimeConfirm: 'Confirm',
      gitVisTimeRevert: 'Revert',
      gitVisTimeSelectDate: 'Select',
    },
    locale: 'en-US',
  }),
}));

// Mock toast slice
const mockShowToast = vi.fn();
vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector?: any) => {
    const state = { showToast: mockShowToast };
    return selector ? selector(state) : state;
  },
}));

describe('TimeRangeSelector year mode', () => {
  const baseValue: TimeRangeState = {
    preset: 'custom',
    since: '2025-01-01',
    until: '2025-12-31',
  };

  it('renders year label in year mode', () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelector
        value={baseValue}
        onChange={onChange}
        mode="year"
        yearBounds={{ min: 2020, max: 2026 }}
      />,
    );
    expect(screen.getByText('2025')).toBeTruthy();
  });

  it('renders preset label in preset mode', () => {
    const onChange = vi.fn();
    const weekValue: TimeRangeState = { preset: 'week', since: '2026-07-18', until: '2026-07-25' };
    render(
      <TimeRangeSelector
        value={weekValue}
        onChange={onChange}
        mode="preset"
      />,
    );
    expect(screen.getByText('Past Week')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && pnpm run test -- TimeRangeSelector`
Expected: all tests pass
