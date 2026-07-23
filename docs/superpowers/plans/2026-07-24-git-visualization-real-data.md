# Git 可视化真实数据接入 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data in the Git Visualization panel with real backend API data, add per-chart time range selectors, and implement three-tier priority-based workspace loading.

**Architecture:** Backend exposes 5 Tauri commands that aggregate `git log` output into chart-ready data structures. Frontend adds a new Zustand slice for caching, a TimeRangeSelector component for per-chart time filtering, and wires all 8 chart components to receive data via props. Workspace tab switching reads from cache; refresh buttons re-fetch from backend.

**Tech Stack:** Rust (Tauri commands, `std::process::Command` for git CLI), TypeScript/React (Zustand, visx charts, motion/react), Node.js (Express preview bridge mirror)

## Global Constraints

- `cargo clippy --workspace --all-targets -- -D warnings` must pass with 0 warnings
- `pnpm --dir frontend run lint` must pass (0 errors)
- `pnpm --dir frontend run test` must pass all existing tests
- Dual-environment parity: Tauri + browser preview mode must both work
- No hardcoded UI text — all strings via i18n (`useTCopy` + `CopyKey`)
- New Tauri commands must use `IpcResult<T>` wrapper and be registered in `main.rs` + permissions
- `serde` camelCase renaming for all Rust↔TS types
- `ts-rs` derive for all Rust types exposed to frontend

---

## File Structure Map

### New files
| File | Responsibility |
|------|---------------|
| `crates/types/src/types/git_visualization.rs` | Rust data types for all 5 API responses |
| `crates/workspace/src/git/git_visualization.rs` | Git CLI wrappers: `git log` aggregation for 5 chart types |
| `src-tauri/src/commands/workspace_git_vis.rs` | Tauri command wrappers (5 commands) |
| `frontend/dev/previewWorkspaceService/gitVisualization.ts` | Node.js mirror of Rust git vis functions |
| `frontend/src/app/stores/slices/gitVisSlice.ts` | Zustand slice: chart data cache, loading states, time ranges |
| `frontend/src/app/stores/actions/gitVisActions.ts` | Actions: fetchChart, refreshWorkspace, cascade load |
| `frontend/src/app/features/git-visualization/TimeRangeSelector.tsx` | Per-chart time range UI (presets + custom date picker) |
| `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | Adapters: API response → chart-props-ready format |
| `frontend/src/app/features/git-visualization/useChartData.ts` | Hook: reads data/loading/error from gitVisSlice for a given chart |

### Modified files
| File | Change |
|------|--------|
| `crates/workspace/src/git.rs` | Add `pub mod git_visualization;` |
| `crates/types/src/types/mod.rs` | Add `git_visualization` module + re-exports |
| `crates/workspace/src/lib.rs` | Re-export new public functions |
| `src-tauri/src/main.rs` | Register 5 new commands |
| `src-tauri/src/commands/mod.rs` | Add `pub mod workspace_git_vis;` |
| `src-tauri/capabilities/default.json` | Add 5 command names |
| `frontend/dev/previewWorkspaceService/index.ts` | Add 5 new routes |
| `frontend/src/shared/ipc/workspace.ts` | Add 5 methods to `WorkspaceBridge` interface |
| `frontend/src/tauri-bridge/tauri-workspace.ts` | Add 5 `invokeIpc` calls |
| `frontend/src/preview-bridge/preview-git.ts` | Add 5 HTTP request implementations |
| `frontend/src/mock/mock-workspace.ts` | Add 5 methods using existing gitVisMockData |
| `frontend/src/app/stores/slicedStore.ts` | Register `gitVisSlice` |
| `frontend/src/app/stores/StoreState.ts` | Add `GitVisSlice` type |
| `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` | Wire real data, remove mock data note, add loading/error states |
| `frontend/src/app/features/git-visualization/WorkspaceTabBar.tsx` | Use `recentWorkspaces` instead of `mockWorkspaceTabs` |
| `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx` | Add TimeRangeSelector, wire real data to tab charts |
| `frontend/src/app/features/git-visualization/hooks/useGitVisRefresh.ts` | Replace stub with real action calls |
| `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/charts/FileSunburst.tsx` | Accept data via props |
| `frontend/src/app/features/git-visualization/index.ts` | Add new exports |

### Files preserved (mock data for mock bridge)
| File | Note |
|------|------|
| `frontend/src/app/features/git-visualization/data/gitVisMockData.ts` | Unchanged — mock bridge still uses it |

---

## Interface Contracts

### `GitVisCommitStats` (endpoint 1 — serves Calendar/Clock/Activity/Timeline charts)

```typescript
// shared type — returned by backend, consumed by chart adapters
interface GitVisCommitStats {
  dailyCommits: Array<{ date: string; count: number }>;
  hourlyDistribution: Array<{ day: number; hour: number; count: number }>;
  contributorActivity: Array<{
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: Array<{ period: string; count: number }>;
  }>;
  commitTimeline: Array<{ date: string; cumulative: number }>;
  commits: Array<{
    hash: string;
    shortHash: string;
    date: string;
    author: string;
    authorEmail: string;
    message: string;
  }>;
}
```

### `GitVisCodeEvolution` (endpoint 2 — CodeLineEvo)

```typescript
interface GitVisCodeEvolution {
  weeks: Array<{ weekStart: string; additions: number; deletions: number }>;
}
```

### `GitVisContributorModules` (endpoint 3 — ContributorModule heatmap)

```typescript
interface GitVisContributorModules {
  matrix: Array<{
    author: string;
    authorEmail: string;
    modules: Array<{ module: string; count: number }>;
  }>;
}
```

### `GitVisBranchGraph` (endpoint 4 — BranchGraph)

```typescript
interface GitVisBranchGraph {
  nodes: Array<{
    hash: string;
    shortHash: string;
    parentHashes: string[];
    branch: string;
    date: string;
    message: string;
    author: string;
    authorEmail: string;
    tag?: string;
  }>;
  edges: Array<{ from: string; to: string }>;
  branches: string[];
}
```

### `GitVisFileSunburst` (endpoint 5 — FileSunburst)

```typescript
interface GitVisFileSunburst {
  tree: {
    name: string;
    type: 'directory' | 'file';
    size?: number;
    children?: Array<GitVisFileSunburst['tree']>;
  };
}
```

### Bridge method signatures

```typescript
// Added to WorkspaceBridge
interface WorkspaceBridge {
  // ...existing methods...
  gitVisCommitStats: (rootPath: string, since?: string, until?: string) => Promise<IpcResult<GitVisCommitStats>>;
  gitVisCodeEvolution: (rootPath: string, since?: string, until?: string) => Promise<IpcResult<GitVisCodeEvolution>>;
  gitVisContributorModules: (rootPath: string, since?: string, until?: string) => Promise<IpcResult<GitVisContributorModules>>;
  gitVisBranchGraph: (rootPath: string) => Promise<IpcResult<GitVisBranchGraph>>;
  gitVisFileSunburst: (rootPath: string) => Promise<IpcResult<GitVisFileSunburst>>;
}
```

### `TimeRangeState`

```typescript
interface TimeRangeState {
  preset: 'week' | 'month' | 'year' | 'all' | 'custom';
  since?: string;   // ISO 8601 date string
  until?: string;   // ISO 8601 date string
}
```

### `GitVisSlice` interface

```typescript
interface GitVisSlice {
  gitVisData: Record<string, Record<string, unknown>>; // workspaceId -> chartId -> data
  gitVisLoading: Record<string, Record<string, boolean>>;
  gitVisErrors: Record<string, Record<string, string | undefined>>;
  gitVisTimeRange: Record<string, Record<string, TimeRangeState>>;
  gitVisLoadedPhases: Record<string, 'high' | 'medium' | 'low' | undefined>;

  setGitVisData: (workspaceId: string, chartId: string, data: unknown) => void;
  setGitVisLoading: (workspaceId: string, chartId: string, loading: boolean) => void;
  setGitVisError: (workspaceId: string, chartId: string, error: string | undefined) => void;
  setGitVisTimeRange: (workspaceId: string, chartId: string, range: TimeRangeState) => void;
  clearWorkspaceGitVisData: (workspaceId: string) => void;
}
```

### Chart prop types

| Chart | Props |
|-------|-------|
| CalendarHeatmap | `{ data: GitVisCommitStats['dailyCommits'] }` |
| ClockHeatmap | `{ data: GitVisCommitStats['hourlyDistribution'] }` |
| ContributorActivityHeatmap | `{ data: GitVisCommitStats['contributorActivity'] }` |
| ContributorModuleHeatmap | `{ data: GitVisContributorModules['matrix'] }` |
| BranchGraph | `{ data: GitVisBranchGraph }` |
| CodeLineEvo | `{ data: GitVisCodeEvolution['weeks'] }` |
| CommitTimeline | `{ data: GitVisCommitStats['commitTimeline'] }` |
| FileSunburst | `{ data: GitVisFileSunburst['tree'] }` |

---

### Chart ID constants (from existing code, carried forward)

```
BRANCH_GRAPH = 'branch-graph'
CODE_LINE_EVO = 'code-line-evolution'
COMMIT_TIMELINE = 'commit-timeline'
FILE_SUNBURST = 'file-sunburst'
HEATMAP = 'heatmap'              // maps to "commitStats" API; tab sub-ID stored in activeHeatmapTab state
```

---

## Tasks

### Task 1: Rust — Git visualization data types

**Files:**
- Create: `crates/types/src/types/git_visualization.rs`
- Modify: `crates/types/src/types/mod.rs`

**Interfaces:**
- Produces: `GitVisCommitStats`, `GitVisCodeEvolution`, `GitVisContributorModules`, `GitVisBranchGraph`, `GitVisFileSunburst` Rust struct types (all derive `Debug, Clone, Serialize, Deserialize, TS`, with `#[serde(rename_all = "camelCase")]`)

- [ ] **Step 1: Write the types file**

Create `crates/types/src/types/git_visualization.rs`:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCommitRow {
    pub hash: String,
    pub short_hash: String,
    pub date: String,
    pub author: String,
    pub author_email: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisDailyCommit {
    pub date: String,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisHourlyBin {
    pub day: i32,
    pub hour: i32,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorPeriod {
    pub period: String,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorActivity {
    pub author: String,
    pub author_email: String,
    pub total_commits: i32,
    pub periods: Vec<GitVisContributorPeriod>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisTimelinePoint {
    pub date: String,
    pub cumulative: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCommitStats {
    pub daily_commits: Vec<GitVisDailyCommit>,
    pub hourly_distribution: Vec<GitVisHourlyBin>,
    pub contributor_activity: Vec<GitVisContributorActivity>,
    pub commit_timeline: Vec<GitVisTimelinePoint>,
    pub commits: Vec<GitVisCommitRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCodeEvolutionWeek {
    pub week_start: String,
    pub additions: i32,
    pub deletions: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisCodeEvolution {
    pub weeks: Vec<GitVisCodeEvolutionWeek>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisModuleEntry {
    pub module: String,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorModule {
    pub author: String,
    pub author_email: String,
    pub modules: Vec<GitVisModuleEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorModules {
    pub matrix: Vec<GitVisContributorModule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisBranchNode {
    pub hash: String,
    pub short_hash: String,
    pub parent_hashes: Vec<String>,
    pub branch: String,
    pub date: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisBranchEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisBranchGraph {
    pub nodes: Vec<GitVisBranchNode>,
    pub edges: Vec<GitVisBranchEdge>,
    pub branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisSunburstNode {
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<GitVisSunburstNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileSunburst {
    pub tree: GitVisSunburstNode,
}
```

- [ ] **Step 2: Register module in `crates/types/src/types/mod.rs`**

Read `crates/types/src/types/mod.rs` and add:

```rust
pub mod git_visualization;
```

after the existing module declarations.

- [ ] **Step 3: Build check**

Run: `cargo build --package adl-types 2>&1`
Expected: Successful compilation.

- [ ] **Step 4: Commit**

```bash
git add crates/types/src/types/git_visualization.rs crates/types/src/types/mod.rs
git commit -m "feat(types): add GitVis* data types for git visualization API"
```

---

### Task 2: Rust — Git visualization module (git log aggregation)

**Files:**
- Create: `crates/workspace/src/git/git_visualization.rs`
- Modify: `crates/workspace/src/git.rs`
- Modify: `crates/workspace/src/lib.rs`

**Interfaces:**
- Consumes: All generated types from Task 1 (`GitVisCommitStats`, `GitVisCodeEvolution`, etc.), existing `run_git` / `run_git_with_timeout` helpers from `git_helpers.rs`
- Produces: 5 public async functions:
  - `pub async fn capture_commit_stats(root: &Path, since: Option<&str>, until: Option<&str>) -> Result<GitVisCommitStats, AppError>`
  - `pub async fn capture_code_evolution(root: &Path, since: Option<&str>, until: Option<&str>) -> Result<GitVisCodeEvolution, AppError>`
  - `pub async fn capture_contributor_modules(root: &Path, since: Option<&str>, until: Option<&str>) -> Result<GitVisContributorModules, AppError>`
  - `pub async fn capture_branch_graph(root: &Path) -> Result<GitVisBranchGraph, AppError>`
  - `pub async fn capture_file_sunburst(root: &Path) -> Result<GitVisFileSunburst, AppError>`

- [ ] **Step 1: Write the git visualization aggregation module**

Create `crates/workspace/src/git/git_visualization.rs`:

```rust
use adl_errors::AppError;
use adl_types::{
    GitVisBranchEdge, GitVisBranchGraph, GitVisBranchNode, GitVisCodeEvolution,
    GitVisCodeEvolutionWeek, GitVisCommitRow, GitVisCommitStats, GitVisContributorActivity,
    GitVisContributorModule, GitVisContributorModules, GitVisContributorPeriod,
    GitVisDailyCommit, GitVisFileSunburst, GitVisHourlyBin, GitVisModuleEntry,
    GitVisSunburstNode, GitVisTimelinePoint,
};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use tracing::debug;

use super::git_helpers::run_git;

fn build_time_filter(since: Option<&str>, until: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(s) = since {
        if !s.is_empty() {
            args.push(format!("--since={}", s));
        }
    }
    if let Some(u) = until {
        if !u.is_empty() {
            args.push(format!("--until={}", u));
        }
    }
    args
}

const GIT_LOG_FORMAT: &str = "%H|%h|%aI|%an|%ae|%s";

#[allow(dead_code)]
fn parse_commit_log(raw: &str) -> Vec<GitVisCommitRow> {
    raw.lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(6, '|').collect();
            if parts.len() < 6 {
                return None;
            }
            Some(GitVisCommitRow {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                date: parts[2].to_string(),
                author: parts[3].to_string(),
                author_email: parts[4].to_string(),
                message: parts[5].to_string(),
            })
        })
        .collect()
}

pub async fn capture_commit_stats(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisCommitStats, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> = vec!["log", "--pretty=format:%H|%h|%aI|%an|%ae|%s"];
    let str_args: Vec<String> = time_filter.iter().map(|s| s.as_str()).collect();
    args.extend(str_args.iter().map(|s| *s));

    debug!(
        "[ADL-GIT-VIS] [commit_stats] running: git {} | args: {:?}",
        args.join(" "),
        root.display()
    );

    let raw = super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log failed for commit_stats".into()))?;

    let commits = parse_commit_log(&raw);
    let commit_count = commits.len();
    debug!(
        "[ADL-GIT-VIS] [commit_stats] [{}] parsed {} commits",
        root.display(),
        commit_count
    );

    let mut daily_map: BTreeMap<String, i32> = BTreeMap::new();
    let mut hourly_map: HashMap<(i32, i32), i32> = HashMap::new();
    let mut author_map: HashMap<String, (String, i32, BTreeMap<String, i32>)> = HashMap::new();
    let mut timeline_cumulative: i32 = 0;
    let mut timeline_points: Vec<GitVisTimelinePoint> = Vec::new();

    for c in &commits {
        let date10: String = c.date.chars().take(10).collect();
        *daily_map.entry(date10.clone()).or_insert(0) += 1;

        if let Some(dt) = parse_date_parts(&c.date) {
            *hourly_map.entry((dt.day_of_week, dt.hour)).or_insert(0) += 1;
        }

        let entry = author_map
            .entry(c.author.clone())
            .or_insert_with(|| (c.author_email.clone(), 0, BTreeMap::new()));
        entry.1 += 1;
        let week_key = if let Some(dt) = parse_date_parts(&c.date) {
            format!("{}-W{:02}", dt.year, dt.week)
        } else {
            date10.clone()
        };
        *entry.2.entry(week_key.clone()).or_insert(0) += 1;

        timeline_cumulative += 1;
        timeline_points.push(GitVisTimelinePoint {
            date: date10,
            cumulative: timeline_cumulative,
        });
    }

    let daily_commits: Vec<GitVisDailyCommit> = daily_map
        .into_iter()
        .map(|(date, count)| GitVisDailyCommit { date, count })
        .collect();

    let hourly_distribution: Vec<GitVisHourlyBin> = hourly_map
        .into_iter()
        .map(|((day, hour), count)| GitVisHourlyBin { day, hour, count })
        .collect();

    let contributor_activity: Vec<GitVisContributorActivity> = author_map
        .into_iter()
        .map(|(author, (author_email, total_commits, periods))| GitVisContributorActivity {
            author,
            author_email,
            total_commits,
            periods: periods
                .into_iter()
                .map(|(period, count)| GitVisContributorPeriod { period, count })
                .collect(),
        })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [commit_stats] [{}] done in {:?} — {} commits, {} daily, {} hourly bins, {} contributors",
        root.display(),
        t0.elapsed(),
        commit_count,
        daily_commits.len(),
        hourly_distribution.len(),
        contributor_activity.len(),
    );

    Ok(GitVisCommitStats {
        daily_commits,
        hourly_distribution,
        contributor_activity,
        commit_timeline: timeline_points,
        commits,
    })
}

struct DateParts {
    year: i32,
    week: i32,
    day_of_week: i32,
    hour: i32,
}

fn parse_date_parts(iso: &str) -> Option<DateParts> {
    let s = iso.trim();
    if s.len() < 13 { return None; }
    let year: i32 = s[0..4].parse().ok()?;
    let month: i32 = s[5..7].parse().ok()?;
    let day: i32 = s[8..10].parse().ok()?;
    let hour: i32 = s[11..13].parse().ok()?;
    let tm = time::Date::from_calendar_date(year, time::Month::try_from(month as u8).ok()?, day as u8).ok()?;
    let iso_week = tm.iso_week();
    Some(DateParts {
        year,
        week: iso_week.0,
        day_of_week: tm.weekday().number_days_from_monday() as i32,
        hour,
    })
}

pub async fn capture_code_evolution(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisCodeEvolution, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> = vec!["log", "--pretty=format:%H|%aI", "--numstat"];
    let str_args: Vec<String> = time_filter.iter().map(|s| s.as_str()).collect();
    args.extend(str_args.iter().map(|s| *s));

    debug!("[ADL-GIT-VIS] [code_evolution] running: git {}", args.join(" "));

    let raw = super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --numstat failed".into()))?;

    let mut week_map: BTreeMap<String, (i32, i32)> = BTreeMap::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let add: i32 = parts[0].parse().unwrap_or(0);
            let del: i32 = parts[1].parse().unwrap_or(0);
            if let Some(iso_date) = parts.last() {
                if iso_date.len() >= 10 {
                    let date_str = &iso_date[0..10];
                    let entry = week_map.entry(start_of_week(date_str)).or_insert((0, 0));
                    entry.0 += add;
                    entry.1 += del;
                }
            }
        } else if parts.len() == 2 && parts[0].starts_with("20") {
            // commit header line with format "%H|%aI", ignore
        }
    }

    let weeks: Vec<GitVisCodeEvolutionWeek> = week_map
        .into_iter()
        .map(|(week_start, (additions, deletions))| GitVisCodeEvolutionWeek {
            week_start,
            additions,
            deletions,
        })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [code_evolution] [{}] done in {:?} — {} weeks",
        root.display(),
        t0.elapsed(),
        weeks.len()
    );

    Ok(GitVisCodeEvolution { weeks })
}

fn start_of_week(date_str: &str) -> String {
    if date_str.len() < 10 { return date_str.to_string(); }
    let year: i32 = date_str[0..4].parse().unwrap_or(0);
    let month: u8 = date_str[5..7].parse().unwrap_or(1);
    let day: u8 = date_str[8..10].parse().unwrap_or(1);
    if let Ok(tm) = time::Date::from_calendar_date(year, time::Month::try_from(month).unwrap_or(time::Month::January), day) {
        let weekday = tm.weekday().number_days_from_monday() as i32;
        let prev = tm.checked_sub(time::Duration::days(weekday as i64)).unwrap_or(tm);
        return format!("{}-{:02}-{:02}", prev.year(), prev.month() as u8, prev.day());
    }
    date_str.to_string()
}

pub async fn capture_contributor_modules(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisContributorModules, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> = vec!["log", "--pretty=format:%an|%ae", "--name-only"];
    let str_args: Vec<String> = time_filter.iter().map(|s| s.as_str()).collect();
    args.extend(str_args.iter().map(|s| *s));

    debug!("[ADL-GIT-VIS] [contributor_modules] running: git {}", args.join(" "));

    let raw = super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --name-only failed".into()))?;

    let mut author_modules: HashMap<String, (String, HashMap<String, i32>)> = HashMap::new();
    let mut current_author: Option<String> = None;
    let mut current_email: String = String::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        if let Some(pipe_idx) = trimmed.find('|') {
            let parts: Vec<&str> = trimmed.splitn(2, '|').collect();
            current_author = Some(parts[0].to_string());
            current_email = parts.get(1).unwrap_or(&"").to_string();
        } else if let Some(ref author) = current_author {
            let top_dir = trimmed.split('/').next().unwrap_or(trimmed);
            let entry = author_modules
                .entry(author.clone())
                .or_insert_with(|| (current_email.clone(), HashMap::new()));
            *entry.1.entry(top_dir.to_string()).or_insert(0) += 1;
        }
    }

    let matrix: Vec<GitVisContributorModule> = author_modules
        .into_iter()
        .map(|(author, (author_email, modules))| GitVisContributorModule {
            author,
            author_email,
            modules: modules
                .into_iter()
                .map(|(module, count)| GitVisModuleEntry { module, count })
                .collect(),
        })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [contributor_modules] [{}] done in {:?} — {} contributors",
        root.display(),
        t0.elapsed(),
        matrix.len()
    );

    Ok(GitVisContributorModules { matrix })
}

pub async fn capture_branch_graph(root: &Path) -> Result<GitVisBranchGraph, AppError> {
    let t0 = std::time::Instant::now();
    debug!("[ADL-GIT-VIS] [branch_graph] running: git log --all --topo-order");

    let raw = super::git_helpers::run_git_with_timeout(
        root,
        &["log", "--all", "--topo-order", "--pretty=format:%H|%h|%P|%D|%aI|%an|%ae|%s"],
    )
    .await
    .ok_or_else(|| AppError::Workspace("git log --all failed".into()))?;

    let mut nodes: Vec<GitVisBranchNode> = Vec::new();
    let mut edges: Vec<GitVisBranchEdge> = Vec::new();
    let mut branch_set: HashSet<String> = HashSet::new();

    for line in raw.lines() {
        let parts: Vec<&str> = line.splitn(8, '|').collect();
        if parts.len() < 8 { continue; }
        let hash = parts[0].to_string();
        let short_hash = parts[1].to_string();
        let parent_hashes: Vec<String> = parts[2]
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        let refs_raw = parts[3].trim();
        let date = parts[4].to_string();
        let message = parts[7].to_string();
        let author = parts[5].to_string();
        let author_email = parts[6].to_string();

        let mut branch = String::new();
        let mut tag: Option<String> = None;
        if !refs_raw.is_empty() {
            let refs: Vec<&str> = refs_raw.split(", ").collect();
            for r in &refs {
                let r2 = r.trim();
                if r2.starts_with("tag: ") {
                    tag = Some(r2[5..].to_string());
                } else if r2.starts_with("HEAD -> ") {
                    branch = r2[8..].to_string();
                    branch_set.insert(branch.clone());
                } else if !r2.starts_with("tag:") {
                    branch = r2.to_string();
                    branch_set.insert(branch.clone());
                }
            }
        }

        if branch.is_empty() {
            for n in &nodes {
                if n.hash == hash {
                    branch = n.branch.clone();
                    break;
                }
            }
        }

        for p in &parent_hashes {
            edges.push(GitVisBranchEdge {
                from: hash.clone(),
                to: p.clone(),
            });
        }

        nodes.push(GitVisBranchNode {
            hash,
            short_hash,
            parent_hashes,
            branch,
            date,
            message,
            author,
            author_email,
            tag,
        });
    }

    let branches: Vec<String> = branch_set.into_iter().collect();

    debug!(
        "[ADL-GIT-VIS] [branch_graph] [{}] done in {:?} — {} nodes, {} edges, {} branches",
        root.display(),
        t0.elapsed(),
        nodes.len(),
        edges.len(),
        branches.len()
    );

    Ok(GitVisBranchGraph { nodes, edges, branches })
}

pub async fn capture_file_sunburst(root: &Path) -> Result<GitVisFileSunburst, AppError> {
    let t0 = std::time::Instant::now();
    debug!("[ADL-GIT-VIS] [file_sunburst] running: git ls-files");

    let raw = super::git_helpers::run_git_with_timeout(root, &["ls-files"])
        .await
        .ok_or_else(|| AppError::Workspace("git ls-files failed".into()))?;

    let files: Vec<String> = raw.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();

    let mut tree = GitVisSunburstNode {
        name: "root".to_string(),
        node_type: "directory".to_string(),
        size: None,
        children: Some(Vec::new()),
    };

    for file in &files {
        let parts: Vec<&str> = file.split('/').collect();
        add_to_sunburst(&mut tree, &parts, 0);
    }

    fn add_to_sunburst(node: &mut GitVisSunburstNode, parts: &[&str], idx: usize) {
        if idx >= parts.len() { return; }
        let name = parts[idx].to_string();
        let is_file = idx == parts.len() - 1;
        let node_type = if is_file { "file" } else { "directory" };

        let children = node.children.get_or_insert_with(Vec::new);
        if let Some(existing) = children.iter_mut().find(|c| c.name == name) {
            if is_file {
                existing.size = Some(existing.size.unwrap_or(0) + 1);
            } else {
                add_to_sunburst(existing, parts, idx + 1);
            }
        } else {
            let mut new_node = GitVisSunburstNode {
                name,
                node_type: node_type.to_string(),
                size: if is_file { Some(1) } else { None },
                children: if is_file { None } else { Some(Vec::new()) },
            };
            if !is_file {
                add_to_sunburst(&mut new_node, parts, idx + 1);
            }
            children.push(new_node);
        }
    }

    debug!(
        "[ADL-GIT-VIS] [file_sunburst] [{}] done in {:?} — {} files",
        root.display(),
        t0.elapsed(),
        files.len()
    );

    Ok(GitVisFileSunburst { tree })
}
```

- [ ] **Step 2: Add `time` crate dependency to `crates/workspace/Cargo.toml`**

Read `crates/workspace/Cargo.toml`, add under `[dependencies]`:

```toml
time = { workspace = true }
```

Actually, let me verify if `time` is already in workspace deps. If not, use an alternative approach with simple date math instead of the `time` crate. Edit the `parse_date_parts` function:

Replace the `time` crate usage with manual calculations. Rewrite `parse_date_parts` and `start_of_week` to use only `std`:

```rust
fn parse_date_parts(iso: &str) -> Option<DateParts> {
    let s = iso.trim();
    if s.len() < 13 { return None; }
    let year: i32 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    let hour: i32 = s[11..13].parse().ok()?;

    let a = (14 - month as i32) / 12;
    let y = year - a;
    let m = month as i32 + 12 * a - 2;
    let julian = (day as i32 + (31 * m) / 12 + y + y / 4 - y / 100 + y / 400) as u32;
    let day_of_week = ((julian + 1) % 7) as i32; // 0=Mon, 6=Sun

    // ISO week
    let jan4_day = (6 + year * 365 + year / 4 - year / 100 + year / 400) % 7;
    let jan4_julian = 4 + if jan4_day <= 3 { 3 - jan4_day as i32 } else { 10 - jan4_day as i32 };
    let week = 1 + (julian as i32 - jan4_julian) / 7;
    let week = if week < 1 { 52 + if week == 0 { 0 } else { -1 } } else { week };

    Some(DateParts { year, week, day_of_week, hour })
}

fn start_of_week(date_str: &str) -> String {
    if date_str.len() < 10 { return date_str.to_string(); }
    let year: i32 = date_str[0..4].parse().unwrap_or(0);
    let month: u32 = date_str[5..7].parse().unwrap_or(1);
    let day: u32 = date_str[8..10].parse().unwrap_or(1);
    let a = (14 - month as i32) / 12;
    let y = year - a;
    let m = month as i32 + 12 * a - 2;
    let julian = day as i32 + (31 * m) / 12 + y + y / 4 - y / 100 + y / 400;
    let day_of_week = ((julian as u32 + 1) % 7) as i32;
    let monday_offset = (day_of_week + 6) % 7;
    let mon_julian = julian - monday_offset;
    // reverse julian to date
    let l = mon_julian + 68569 + 1;
    let n = (4 * l) / 146097;
    let l = l - (146097 * n + 3) / 4;
    let i = (4000 * (l + 1)) / 1461001;
    let l = l - (1461 * i) / 4 + 31;
    let j = (80 * l) / 2447;
    let d = l - (2447 * j) / 80;
    let l = j / 11;
    let m = j + 2 - 12 * l;
    let y = 100 * (n - 49) + i + l;
    format!("{}-{:02}-{:02}", y, m, d)
}
```

Actually, let me avoid this complexity. Let me check if `time` is already in the workspace `Cargo.toml`.

- [ ] **Step 2 (revised): Check if `time` is available**

Run: `rg "time\s*=" ai-digital-life/Cargo.toml`

If it's in workspace deps, use `time` crate in `git_visualization.rs`. If not, use the `chrono` crate if available, or fall back to the manual calculation above.

- [ ] **Step 3: Register module in `crates/workspace/src/git.rs`**

Read `crates/workspace/src/git.rs` and add:

```rust
pub mod git_visualization;
```

after existing module declarations.

- [ ] **Step 4: Re-export in `crates/workspace/src/lib.rs`**

Read `crates/workspace/src/lib.rs` and add to the `pub use git::` block:

```rust
pub use git::git_visualization::{
    capture_branch_graph, capture_code_evolution, capture_commit_stats,
    capture_contributor_modules, capture_file_sunburst,
};
```

- [ ] **Step 5: Build check**

Run: `cargo build --package adl-workspace 2>&1`
Expected: Successful compilation.

- [ ] **Step 6: Commit**

```bash
git add crates/workspace/src/git/git_visualization.rs crates/workspace/src/git.rs crates/workspace/src/lib.rs crates/workspace/Cargo.toml
git commit -m "feat(workspace): add git visualization data aggregation module"
```

---

### Task 3: Rust — Tauri commands for git visualization

**Files:**
- Create: `src-tauri/src/commands/workspace_git_vis.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: `git_visualization` module functions from Task 2, `IpcResult<T>` wrapper, `AppState`
- Produces: 5 `#[tauri::command]` functions:
  - `workspace_git_vis_commit_stats(app, root_path: String, since: Option<String>, until: Option<String>) -> Result<IpcResult<GitVisCommitStats>, AppError>`
  - `workspace_git_vis_code_evolution(app, root_path: String, since: Option<String>, until: Option<String>) -> Result<IpcResult<GitVisCodeEvolution>, AppError>`
  - `workspace_git_vis_contributor_modules(app, root_path: String, since: Option<String>, until: Option<String>) -> Result<IpcResult<GitVisContributorModules>, AppError>`
  - `workspace_git_vis_branch_graph(app, root_path: String) -> Result<IpcResult<GitVisBranchGraph>, AppError>`
  - `workspace_git_vis_file_sunburst(app, root_path: String) -> Result<IpcResult<GitVisFileSunburst>, AppError>`

- [ ] **Step 1: Write the Tauri commands**

Create `src-tauri/src/commands/workspace_git_vis.rs`:

```rust
use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::{
    GitVisBranchGraph, GitVisCodeEvolution, GitVisCommitStats, GitVisContributorModules,
    GitVisFileSunburst, IpcResult,
};
use std::path::Path;
use tauri::Manager;

#[tauri::command]
pub async fn workspace_git_vis_commit_stats(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCommitStats>, AppError> {
    let state = app.state::<crate::state::AppState>();
    let _ = state; // reserved for future use (e.g. caching)
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_commit_stats(root, since.as_deref(), until.as_deref()).await?;
    Ok(ipc::ok(data))
}

#[tauri::command]
pub async fn workspace_git_vis_code_evolution(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCodeEvolution>, AppError> {
    let state = app.state::<crate::state::AppState>();
    let _ = state;
    let root = Path::new(&root_path);
    let data =
        adl_workspace::capture_code_evolution(root, since.as_deref(), until.as_deref()).await?;
    Ok(ipc::ok(data))
}

#[tauri::command]
pub async fn workspace_git_vis_contributor_modules(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisContributorModules>, AppError> {
    let state = app.state::<crate::state::AppState>();
    let _ = state;
    let root = Path::new(&root_path);
    let data =
        adl_workspace::capture_contributor_modules(root, since.as_deref(), until.as_deref()).await?;
    Ok(ipc::ok(data))
}

#[tauri::command]
pub async fn workspace_git_vis_branch_graph(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<IpcResult<GitVisBranchGraph>, AppError> {
    let state = app.state::<crate::state::AppState>();
    let _ = state;
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_branch_graph(root).await?;
    Ok(ipc::ok(data))
}

#[tauri::command]
pub async fn workspace_git_vis_file_sunburst(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<IpcResult<GitVisFileSunburst>, AppError> {
    let state = app.state::<crate::state::AppState>();
    let _ = state;
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_file_sunburst(root).await?;
    Ok(ipc::ok(data))
}
```

- [ ] **Step 2: Register in `src-tauri/src/commands/mod.rs`**

Read `src-tauri/src/commands/mod.rs` and add:

```rust
pub mod workspace_git_vis;
```

- [ ] **Step 3: Register commands in `src-tauri/src/main.rs`**

Read `src-tauri/src/main.rs`, find the `tauri::generate_handler!` block. After the last `workspace_git` command entry, add:

```rust
commands::workspace_git_vis::workspace_git_vis_commit_stats,
commands::workspace_git_vis::workspace_git_vis_code_evolution,
commands::workspace_git_vis::workspace_git_vis_contributor_modules,
commands::workspace_git_vis::workspace_git_vis_branch_graph,
commands::workspace_git_vis::workspace_git_vis_file_sunburst,
```

- [ ] **Step 4: Add permissions in `src-tauri/capabilities/default.json`**

Read `src-tauri/capabilities/default.json`, find the `"commands"` object or `"permissions"` block containing command allow lists. Add the 5 command names. If the file uses `"digital-life-commands"` permission group, check the permissions file for that identifier.

- [ ] **Step 5: Build check**

Run: `cargo build --package adl-app 2>&1`
Expected: Successful compilation.

- [ ] **Step 6: Clippy check**

Run: `cargo clippy --workspace --all-targets -- -D warnings 2>&1`
Expected: 0 warnings.

- [ ] **Step 7: Run existing Rust tests**

Run: `cargo test --workspace 2>&1`
Expected: All existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/workspace_git_vis.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs src-tauri/capabilities/default.json
git commit -m "feat(tauri): add 5 git visualization IPC commands"
```

---

### Task 4: Frontend — IPC bridge and types (shared layer + all three bridges)

**Files:**
- Modify: `frontend/src/shared/ipc/workspace.ts` — add 5 method signatures + imports
- Modify: `frontend/src/tauri-bridge/tauri-workspace.ts` — add 5 invokeIpc calls
- Modify: `frontend/src/preview-bridge/preview-git.ts` — add 5 HTTP implementations
- Modify: `frontend/src/mock/mock-workspace.ts` — add 5 mock implementations using gitVisMockData

**Interfaces:**
- Produces: 5 new methods on `WorkspaceBridge`

- [ ] **Step 1: Add bridge method types to `frontend/src/shared/ipc/workspace.ts`**

Read the file. After the last method in the `WorkspaceBridge` interface (currently `discardFile`), add:

```typescript
  gitVisCommitStats: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisCommitStats>>;
  gitVisCodeEvolution: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisCodeEvolution>>;
  gitVisContributorModules: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisContributorModules>>;
  gitVisBranchGraph: (rootPath: string) => Promise<IpcResult<GitVisBranchGraph>>;
  gitVisFileSunburst: (rootPath: string) => Promise<IpcResult<GitVisFileSunburst>>;
```

Add imports at top. Read `frontend/src/kernel/types.ts` to check if TS types exist. If not, define inline type imports from `@ai-digital-life/kernel` or add a local type aliases section.

- [ ] **Step 2: Add Tauri bridge implementations in `frontend/src/tauri-bridge/tauri-workspace.ts`**

Read the file. After the last method (currently `discardFile`), add:

```typescript
    gitVisCommitStats: (rootPath, since, until) =>
      invokeIpc('workspace_git_vis_commit_stats', { rootPath, since, until }),
    gitVisCodeEvolution: (rootPath, since, until) =>
      invokeIpc('workspace_git_vis_code_evolution', { rootPath, since, until }),
    gitVisContributorModules: (rootPath, since, until) =>
      invokeIpc('workspace_git_vis_contributor_modules', { rootPath, since, until }),
    gitVisBranchGraph: (rootPath) =>
      invokeIpc('workspace_git_vis_branch_graph', { rootPath }),
    gitVisFileSunburst: (rootPath) =>
      invokeIpc('workspace_git_vis_file_sunburst', { rootPath }),
```

- [ ] **Step 3: Add Preview bridge implementations in `frontend/src/preview-bridge/preview-git.ts`**

Read the file. After the last method in the returned object (currently `discardFile`), add:

```typescript
    gitVisCommitStats: async (rootPath, since, until) => {
      const params = new URLSearchParams({ rootPath });
      if (since) params.set('since', since);
      if (until) params.set('until', until);
      return requestPreviewApi(`/workspace/git-vis-commit-stats?${params.toString()}`);
    },
    gitVisCodeEvolution: async (rootPath, since, until) => {
      const params = new URLSearchParams({ rootPath });
      if (since) params.set('since', since);
      if (until) params.set('until', until);
      return requestPreviewApi(`/workspace/git-vis-code-evolution?${params.toString()}`);
    },
    gitVisContributorModules: async (rootPath, since, until) => {
      const params = new URLSearchParams({ rootPath });
      if (since) params.set('since', since);
      if (until) params.set('until', until);
      return requestPreviewApi(`/workspace/git-vis-contributor-modules?${params.toString()}`);
    },
    gitVisBranchGraph: async (rootPath) => {
      const params = new URLSearchParams({ rootPath });
      return requestPreviewApi(`/workspace/git-vis-branch-graph?${params.toString()}`);
    },
    gitVisFileSunburst: async (rootPath) => {
      const params = new URLSearchParams({ rootPath });
      return requestPreviewApi(`/workspace/git-vis-file-sunburst?${params.toString()}`);
    },
```

- [ ] **Step 4: Add Mock bridge implementations in `frontend/src/mock/mock-workspace.ts`**

Read the file. Import from `gitVisMockData.ts`. After the last method in the `mockWorkspace` object (currently `discardFile`), add 5 methods that return mock data using the existing generator functions:

```typescript
    gitVisCommitStats: async () => {
      const dailyCommits = generateCalendarData().map(([date, count]) => ({ date, count }));
      const hourlyDistribution: { day: number; hour: number; count: number }[] = [];
      for (let h = 0; h < 24; h++) {
        for (let d = 0; d < 7; d++) {
          hourlyDistribution.push({ day: d, hour: h, count: Math.floor(Math.random() * 5) });
        }
      }
      const contributorActivity = contributorNames.map((author, i) => ({
        author,
        authorEmail: `${author.toLowerCase()}@example.com`,
        totalCommits: contributorTotalCommits[i],
        periods: Array.from({ length: 12 }, (_, w) => ({
          period: `2026-W${String(w + 1).padStart(2, '0')}`,
          count: Math.floor(Math.random() * 5),
        })),
      }));
      return { ok: true as const, data: {
        dailyCommits,
        hourlyDistribution,
        contributorActivity,
        commitTimeline: mockCommitTimelineData.map(d => ({ date: d.date, cumulative: d.cumulative })),
        commits: [],
      }};
    },
    gitVisCodeEvolution: async () => {
      const raw = generateCodeLineEvolutionData();
      return { ok: true as const, data: {
        weeks: raw.dates.map((date, i) => ({
          weekStart: `2026-${String(Math.ceil((i + 1) / 4)).padStart(2, '0')}-${String((i % 4) * 7 + 1).padStart(2, '0')}`,
          additions: raw.added[i] - (i > 0 ? raw.added[i - 1] : 0),
          deletions: raw.deleted[i] - (i > 0 ? raw.deleted[i - 1] : 0),
        })),
      }};
    },
    gitVisContributorModules: async () => ({
      ok: true as const,
      data: {
        matrix: contributorNames.map((author, ci) => ({
          author,
          authorEmail: `${author.toLowerCase()}@example.com`,
          modules: moduleNames.map((module, mi) => ({
            module,
            count: contributorModuleMatrix[ci][mi],
          })),
        })),
      },
    }),
    gitVisBranchGraph: async () => ({
      ok: true as const,
      data: {
        nodes: commitNodes.map(n => ({
          hash: n.hash,
          shortHash: n.hash.substring(0, 6),
          parentHashes: [],
          branch: n.branch,
          date: n.date,
          message: n.message,
          author: n.author,
          authorEmail: n.authorEmail,
          tag: n.tag,
        })),
        edges: commitEdges.map(e => ({ from: e.source, to: e.target })),
        branches: allBranches,
      },
    }),
    gitVisFileSunburst: async () => ({
      ok: true as const,
      data: { tree: fileTreemapData },
    }),
```

Add the import at the top:

```typescript
import {
  generateCalendarData, generateCodeLineEvolutionData, contributorNames,
  contributorTotalCommits, mockCommitTimelineData, moduleNames,
  contributorModuleMatrix, commitNodes, commitEdges, allBranches, fileTreemapData,
} from '../features/git-visualization/data/gitVisMockData';
```

- [ ] **Step 5: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`
Expected: No new type errors introduced.

- [ ] **Step 6: Lint check**

Run: `pnpm --dir frontend run lint 2>&1`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/ipc/workspace.ts frontend/src/tauri-bridge/tauri-workspace.ts frontend/src/preview-bridge/preview-git.ts frontend/src/mock/mock-workspace.ts
git commit -m "feat(ipc): add 5 git visualization bridge methods across tauri/preview/mock"
```

---

### Task 5: Backend — Preview bridge Node.js endpoints

**Files:**
- Create: `frontend/dev/previewWorkspaceService/gitVisualization.ts`
- Modify: `frontend/dev/previewWorkspaceService/index.ts`

**Interfaces:**
- Produces: 5 Express route handlers mirroring Rust functions

- [ ] **Step 1: Write Node.js git visualization module**

Create `frontend/dev/previewWorkspaceService/gitVisualization.ts`:

```typescript
import { execSync } from 'child_process';
import { join } from 'path';
import type { Request, Response } from 'express';

function runGit(rootPath: string, args: string[]): string {
  try {
    return execSync(`git ${args.join(' ')}`, {
      cwd: rootPath,
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    }).toString('utf-8').trim();
  } catch {
    return '';
  }
}

function parseDateParts(iso: string): { year: number; week: number; dayOfWeek: number; hour: number } | null {
  if (iso.length < 13) return null;
  const year = parseInt(iso.substring(0, 4), 10);
  const month = parseInt(iso.substring(5, 7), 10);
  const day = parseInt(iso.substring(8, 10), 10);
  const hour = parseInt(iso.substring(11, 13), 10);
  const d = new Date(year, month - 1, day);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
  const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + 1) / 7);
  return { year, week: Math.max(1, week), dayOfWeek, hour };
}

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().substring(0, 10);
}

export function handleCommitStats(req: Request, res: Response): void {
  const { rootPath, since, until } = req.query as Record<string, string>;
  const filterArgs: string[] = [];
  if (since) filterArgs.push(`--since="${since}"`);
  if (until) filterArgs.push(`--until="${until}"`);
  const raw = runGit(rootPath, ['log', `--pretty=format:%H|%h|%aI|%an|%ae|%s`, ...filterArgs]);
  const lines = raw.split('\n').filter(Boolean);

  const dailyMap = new Map<string, number>();
  const hourlyMap = new Map<string, number>();
  const authorMap = new Map<string, { email: string; total: number; periods: Map<string, number> }>();
  let cumulative = 0;
  const timeline: { date: string; cumulative: number }[] = [];
  const commits: unknown[] = [];

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 6) continue;
    const [hash, shortHash, date, author, authorEmail, message] = parts;
    const date10 = date.substring(0, 10);
    dailyMap.set(date10, (dailyMap.get(date10) || 0) + 1);

    const dp = parseDateParts(date);
    if (dp) {
      hourlyMap.set(`${dp.dayOfWeek}|${dp.hour}`, (hourlyMap.get(`${dp.dayOfWeek}|${dp.hour}`) || 0) + 1);
      const weekKey = `${dp.year}-W${String(dp.week).padStart(2, '0')}`;
      const entry = authorMap.get(author) || { email: authorEmail, total: 0, periods: new Map() };
      entry.total++;
      entry.periods.set(weekKey, (entry.periods.get(weekKey) || 0) + 1);
      authorMap.set(author, entry);
    }

    cumulative++;
    timeline.push({ date: date10, cumulative });
    commits.push({ hash, shortHash, date, author, authorEmail, message });
  }

  res.json({
    ok: true,
    data: {
      dailyCommits: Array.from(dailyMap, ([date, count]) => ({ date, count })),
      hourlyDistribution: Array.from(hourlyMap, ([key, count]) => {
        const [d, h] = key.split('|');
        return { day: parseInt(d, 10), hour: parseInt(h, 10), count };
      }),
      contributorActivity: Array.from(authorMap, ([author, v]) => ({
        author, authorEmail: v.email, totalCommits: v.total,
        periods: Array.from(v.periods, ([period, count]) => ({ period, count })),
      })),
      commitTimeline: timeline,
      commits,
    },
  });
}

export function handleCodeEvolution(req: Request, res: Response): void {
  const { rootPath, since, until } = req.query as Record<string, string>;
  const filterArgs: string[] = [];
  if (since) filterArgs.push(`--since="${since}"`);
  if (until) filterArgs.push(`--until="${until}"`);
  const raw = runGit(rootPath, ['log', '--pretty=format:%H|%aI', '--numstat', ...filterArgs]);
  const weekMap = new Map<string, { additions: number; deletions: number }>();

  let currentDate = '';
  for (const line of raw.split('\n')) {
    const parts = line.split('\t');
    if (parts.length === 3) {
      const add = parseInt(parts[0], 10) || 0;
      const del = parseInt(parts[1], 10) || 0;
      const ws = startOfWeek(currentDate || parts[2]?.substring(0, 10) || '');
      const entry = weekMap.get(ws) || { additions: 0, deletions: 0 };
      entry.additions += add;
      entry.deletions += del;
      weekMap.set(ws, entry);
    } else if (line.includes('|') && line.startsWith('20')) {
      currentDate = line.split('|')[1] || '';
    }
  }

  res.json({
    ok: true,
    data: {
      weeks: Array.from(weekMap, ([weekStart, v]) => ({ weekStart, ...v })),
    },
  });
}

export function handleContributorModules(req: Request, res: Response): void {
  const { rootPath, since, until } = req.query as Record<string, string>;
  const filterArgs: string[] = [];
  if (since) filterArgs.push(`--since="${since}"`);
  if (until) filterArgs.push(`--until="${until}"`);
  const raw = runGit(rootPath, ['log', '--pretty=format:%an|%ae', '--name-only', ...filterArgs]);

  const authorModules = new Map<string, { email: string; modules: Map<string, number> }>();
  let currentAuthor = '';
  let currentEmail = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes('|')) {
      const parts = trimmed.split('|');
      currentAuthor = parts[0];
      currentEmail = parts[1] || '';
    } else if (currentAuthor) {
      const topDir = trimmed.split('/')[0];
      const entry = authorModules.get(currentAuthor) || { email: currentEmail, modules: new Map() };
      entry.modules.set(topDir, (entry.modules.get(topDir) || 0) + 1);
      authorModules.set(currentAuthor, entry);
    }
  }

  res.json({
    ok: true,
    data: {
      matrix: Array.from(authorModules, ([author, v]) => ({
        author, authorEmail: v.email,
        modules: Array.from(v.modules, ([module, count]) => ({ module, count })),
      })),
    },
  });
}

export function handleBranchGraph(req: Request, res: Response): void {
  const { rootPath } = req.query as Record<string, string>;
  const raw = runGit(rootPath, ['log', '--all', '--topo-order', '--pretty=format:%H|%h|%P|%D|%aI|%an|%ae|%s']);
  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  const branchSet = new Set<string>();

  for (const line of raw.split('\n')) {
    const parts = line.split('|');
    if (parts.length < 8) continue;
    const [hash, shortHash, parentRaw, refsRaw, date, author, authorEmail, message] = parts;
    const parentHashes = (parentRaw || '').split(' ').filter(Boolean);
    let branch = '';
    let tag: string | undefined;
    const refs = (refsRaw || '').split(', ');
    for (const r of refs) {
      if (r.startsWith('tag: ')) tag = r.substring(5);
      else if (r.startsWith('HEAD -> ')) { branch = r.substring(8); branchSet.add(branch); }
      else if (r) { branch = r; branchSet.add(branch); }
    }
    for (const p of parentHashes) { edges.push({ from: hash, to: p }); }
    nodes.push({ hash, shortHash, parentHashes, branch, date, author, authorEmail, message, tag });
  }

  res.json({
    ok: true,
    data: { nodes, edges, branches: Array.from(branchSet) },
  });
}

export function handleFileSunburst(req: Request, res: Response): void {
  const { rootPath } = req.query as Record<string, string>;
  const raw = runGit(rootPath, ['ls-files']);
  const files = raw.split('\n').filter(Boolean);

  interface SunburstNode { name: string; type: string; size?: number; children?: SunburstNode[] }
  const tree: SunburstNode = { name: 'root', type: 'directory', children: [] };

  for (const file of files) {
    const parts = file.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      current.children = current.children || [];
      let child = current.children.find(c => c.name === name);
      if (!child) {
        child = { name, type: isFile ? 'file' : 'directory', size: isFile ? 1 : undefined, children: isFile ? undefined : [] };
        current.children.push(child);
      } else if (isFile) {
        child.size = (child.size || 0) + 1;
      }
      current = child;
    }
  }

  res.json({ ok: true, data: { tree } });
}
```

- [ ] **Step 2: Register routes in `frontend/dev/previewWorkspaceService/index.ts`**

Read the file. Near the existing route registrations (e.g., `/workspace/git-status`), add:

```typescript
import {
  handleCommitStats, handleCodeEvolution, handleContributorModules,
  handleBranchGraph, handleFileSunburst,
} from './gitVisualization';

app.get('/workspace/git-vis-commit-stats', handleCommitStats);
app.get('/workspace/git-vis-code-evolution', handleCodeEvolution);
app.get('/workspace/git-vis-contributor-modules', handleContributorModules);
app.get('/workspace/git-vis-branch-graph', handleBranchGraph);
app.get('/workspace/git-vis-file-sunburst', handleFileSunburst);
```

- [ ] **Step 3: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/dev/previewWorkspaceService/gitVisualization.ts frontend/dev/previewWorkspaceService/index.ts
git commit -m "feat(preview): add 5 git visualization Express endpoints"
```

---

### Task 6: Frontend — Zustand state: gitVisSlice

**Files:**
- Create: `frontend/src/app/stores/slices/gitVisSlice.ts`
- Modify: `frontend/src/app/stores/StoreState.ts` — add GitVisSlice to union
- Modify: `frontend/src/app/stores/slicedStore.ts` — register slice

**Interfaces:**
- Produces: `GitVisSlice` as defined in Interface Contracts above

- [ ] **Step 1: Write `gitVisSlice.ts`**

Create `frontend/src/app/stores/slices/gitVisSlice.ts`:

```typescript
import type { StoreState } from '../StoreState';

export interface TimeRangeState {
  preset: 'week' | 'month' | 'year' | 'all' | 'custom';
  since?: string;
  until?: string;
}

export function defaultTimeRange(): TimeRangeState {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  return {
    preset: 'year',
    since: oneYearAgo.toISOString().substring(0, 10),
    until: now.toISOString().substring(0, 10),
  };
}

export interface GitVisSlice {
  gitVisData: Record<string, Record<string, unknown>>;
  gitVisLoading: Record<string, Record<string, boolean>>;
  gitVisErrors: Record<string, Record<string, string | undefined>>;
  gitVisTimeRange: Record<string, Record<string, TimeRangeState>>;
  gitVisLoadedPhases: Record<string, 'high' | 'medium' | 'low' | undefined>;

  setGitVisData: (workspaceId: string, chartId: string, data: unknown) => void;
  setGitVisLoading: (workspaceId: string, chartId: string, loading: boolean) => void;
  setGitVisError: (workspaceId: string, chartId: string, error: string | undefined) => void;
  setGitVisTimeRange: (workspaceId: string, chartId: string, range: TimeRangeState) => void;
  clearWorkspaceGitVisData: (workspaceId: string) => void;
  setGitVisLoadedPhases: (phases: Record<string, 'high' | 'medium' | 'low' | undefined>) => void;
}

export const createGitVisSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): GitVisSlice => ({
  gitVisData: {},
  gitVisLoading: {},
  gitVisErrors: {},
  gitVisTimeRange: {},
  gitVisLoadedPhases: {},

  setGitVisData: (workspaceId, chartId, data) =>
    set((s) => ({
      gitVisData: {
        ...s.gitVisData,
        [workspaceId]: { ...(s.gitVisData[workspaceId] || {}), [chartId]: data },
      },
    })),
  setGitVisLoading: (workspaceId, chartId, loading) =>
    set((s) => ({
      gitVisLoading: {
        ...s.gitVisLoading,
        [workspaceId]: { ...(s.gitVisLoading[workspaceId] || {}), [chartId]: loading },
      },
    })),
  setGitVisError: (workspaceId, chartId, error) =>
    set((s) => ({
      gitVisErrors: {
        ...s.gitVisErrors,
        [workspaceId]: { ...(s.gitVisErrors[workspaceId] || {}), [chartId]: error },
      },
    })),
  setGitVisTimeRange: (workspaceId, chartId, range) =>
    set((s) => ({
      gitVisTimeRange: {
        ...s.gitVisTimeRange,
        [workspaceId]: { ...(s.gitVisTimeRange[workspaceId] || {}), [chartId]: range },
      },
    })),
  clearWorkspaceGitVisData: (workspaceId) =>
    set((s) => {
      const { [workspaceId]: _, ...restData } = s.gitVisData;
      const { [workspaceId]: __, ...restLoading } = s.gitVisLoading;
      const { [workspaceId]: ___, ...restErrors } = s.gitVisErrors;
      const { [workspaceId]: ____, ...restTimeRange } = s.gitVisTimeRange;
      return {
        gitVisData: restData,
        gitVisLoading: restLoading,
        gitVisErrors: restErrors,
        gitVisTimeRange: restTimeRange,
      };
    }),
  setGitVisLoadedPhases: (phases) => set({ gitVisLoadedPhases: phases }),
});
```

- [ ] **Step 2: Add `GitVisSlice` to `StoreState.ts`**

Read `frontend/src/app/stores/StoreState.ts`. Find the union type line (may appear as `export type StoreState = ...` or similar). Add `GitVisSlice &` to the intersection. Import `GitVisSlice` from `./slices/gitVisSlice`.

- [ ] **Step 3: Register in `slicedStore.ts`**

Read `frontend/src/app/stores/slicedStore.ts`. Find where slices are created (look for `createGitSlice`, `createUISlice`, etc.). After the last slice creator call, add:

```typescript
import { createGitVisSlice } from './slices/gitVisSlice';
// inside the store creator:
...(createGitVisSlice(set, get)),
```

- [ ] **Step 4: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`
Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stores/slices/gitVisSlice.ts frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slicedStore.ts
git commit -m "feat(stores): add gitVisSlice for chart data caching and loading states"
```

---

### Task 7: Frontend — gitVisActions (fetch + cascade loading)

**Files:**
- Create: `frontend/src/app/stores/actions/gitVisActions.ts`

**Interfaces:**
- Consumes: `GitVisSlice` from Task 6, bridge methods from Task 4, `computeLoadPhases` from `workspaceLoadOrder.ts`
- Produces: `fetchChartData`, `refreshWorkspace`, `startCascadeLoad` action creators

- [ ] **Step 1: Write `gitVisActions.ts`**

Create `frontend/src/app/stores/actions/gitVisActions.ts`:

```typescript
import type { DigitalLifeBridge } from '@shared/ipc/digital-life';
import { CHART_IDS } from '../../features/git-visualization/GitVisualizationView';
import { computeLoadPhases } from './workspaceLoadOrder';

const HEATMAP_TABS = [
  CHART_IDS.HEATMAP,
  CHART_IDS.BRANCH_GRAPH,
  CHART_IDS.FILE_SUNBURST,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
] as const;

function getChartEndpoints(chartId: string): string[] {
  return chartId === CHART_IDS.HEATMAP ? [CHART_IDS.HEATMAP] : [chartId];
}

function debugLog(msg: string, ...args: unknown[]): void {
  if (typeof console !== 'undefined' && (console as { debug?: typeof console.log }).debug) {
    console.debug(`[ADL-GIT-VIS] ${msg}`, ...args);
  }
}

export async function fetchChartData(
  bridge: DigitalLifeBridge,
  workspaceId: string,
  rootPath: string,
  chartId: string,
  since?: string,
  until?: string,
): Promise<unknown> {
  debugLog('fetchChartData', { workspaceId, chartId, since, until });
  const t0 = performance.now();

  let result;
  switch (chartId) {
    case CHART_IDS.HEATMAP:
      result = await bridge.workspace.gitVisCommitStats(rootPath, since, until);
      break;
    case CHART_IDS.BRANCH_GRAPH:
      result = await bridge.workspace.gitVisBranchGraph(rootPath);
      break;
    case CHART_IDS.FILE_SUNBURST:
      result = await bridge.workspace.gitVisFileSunburst(rootPath);
      break;
    case CHART_IDS.CODE_LINE_EVO:
      result = await bridge.workspace.gitVisCodeEvolution(rootPath, since, until);
      break;
    case CHART_IDS.COMMIT_TIMELINE:
      result = await bridge.workspace.gitVisCommitStats(rootPath, since, until);
      break;
    default:
      throw new Error(`Unknown chart ID: ${chartId}`);
  }

  const elapsed = performance.now() - t0;
  if (result.ok) {
    debugLog('fetchChartData OK', { workspaceId, chartId, elapsed: `${elapsed.toFixed(0)}ms` });
    return result.data;
  } else {
    debugLog('fetchChartData ERROR', { workspaceId, chartId, error: result.error.message });
    throw new Error(result.error.message);
  }
}

export async function refreshWorkspace(
  bridge: DigitalLifeBridge,
  workspaceId: string,
  rootPath: string,
  timeRanges: Record<string, { since?: string; until?: string }>,
  setLoading: (chartId: string, loading: boolean) => void,
  setError: (chartId: string, error: string | undefined) => void,
  setData: (chartId: string, data: unknown) => void,
): Promise<void> {
  debugLog('refreshWorkspace', { workspaceId });
  for (const chartId of HEATMAP_TABS) {
    setLoading(chartId, true);
    setError(chartId, undefined);
    try {
      const tr = timeRanges[chartId] || {};
      const data = await fetchChartData(bridge, workspaceId, rootPath, chartId, tr.since, tr.until);
      setData(chartId, data);
    } catch (e) {
      setError(chartId, e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(chartId, false);
    }
  }
}

export function determinePhases(
  priorityIds: string[],
  deferredIds: string[],
  naturalOrder: string[],
  workspacePaths: Array<{ id: string; rootPath: string }>,
): {
  high: Array<{ id: string; rootPath: string }>;
  medium: Array<{ id: string; rootPath: string }>;
  low: Array<{ id: string; rootPath: string }>;
} {
  const phases = computeLoadPhases(
    priorityIds,
    deferredIds,
    naturalOrder,
    workspacePaths.map(w => ({ id: w.id, path: w.rootPath, rootPath: w.rootPath, name: '', type: 'Unknown' as const, status: 'Ready' as const, createdAt: 0, updatedAt: 0, lastOpenedAt: 0 })),
  );

  debugLog('determinePhases', {
    high: phases.priority.map(w => w.id),
    medium: phases.deferred.map(w => w.id),
    low: phases.natural.map(w => w.id),
  });

  const lookup = new Map(workspacePaths.map(w => [w.id, w]));
  const resolve = (entries: { id: string }[]) =>
    entries.map(e => lookup.get(e.id)!).filter(Boolean);

  return {
    high: resolve(phases.priority),
    medium: resolve(phases.deferred),
    low: resolve(phases.natural),
  };
}
```

- [ ] **Step 2: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`
Check for any type issues with the bridge method calls. Fix any type mismatches.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/stores/actions/gitVisActions.ts
git commit -m "feat(actions): add gitVisActions for chart data fetching and cascade loading"
```

---

### Task 8: Frontend — Chart data adapters

**Files:**
- Create: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`

**Interfaces:**
- Consumes: Raw API response types from Task 1/4
- Produces: Chart-ready data format functions
  - `adapter.commitStatsToHeatmapColumns(dailyCommits)` → `HeatmapColumn[]`
  - `adapter.hourlyDistributionToHeatmapColumns(hourlyDistribution)` → `HeatmapColumn[]`
  - `adapter.contributorActivityToHeatmapColumns(contributorActivity)` → `{ columns: HeatmapColumn[], rowLabels: string[] }`
  - `adapter.contributorModulesToHeatmapColumns(matrix)` → `{ columns: HeatmapColumn[], rowLabels: string[] }`
  - `adapter.codeEvolutionToAreaData(weeks)` → `BklitAreaRow[]`
  - `adapter.commitTimelineToRows(commitTimeline)` → `{ date: string; count: number; cumulative: number }[]`
  - `adapter.branchGraphData(nodes, edges, branches)` → `{ nodes: CommitNode[], edges: CommitEdge[], allBranches: string[] }`
  - `adapter.sunburstData(tree)` → Sunburst tree data (pass-through)

- [ ] **Step 1: Write chart data adapters**

Create `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`:

```typescript
import type { HeatmapColumn, HeatmapBin } from '@/components/charts/heatmap/heatmap-context';
import type { BklitAreaRow } from '../data/gitVisMockData';
import type { CommitNode, CommitEdge } from '../data/gitVisMockData';

interface RawCommitStats {
  dailyCommits: Array<{ date: string; count: number }>;
  hourlyDistribution: Array<{ day: number; hour: number; count: number }>;
  contributorActivity: Array<{
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: Array<{ period: string; count: number }>;
  }>;
  commitTimeline: Array<{ date: string; cumulative: number }>;
}

interface RawBranchGraph {
  nodes: Array<{
    hash: string; shortHash: string; parentHashes: string[];
    branch: string; date: string; message: string;
    author: string; authorEmail: string; tag?: string;
  }>;
  edges: Array<{ from: string; to: string }>;
  branches: string[];
}

interface RawContributorModules {
  matrix: Array<{
    author: string; authorEmail: string;
    modules: Array<{ module: string; count: number }>;
  }>;
}

export function commitStatsToHeatmapColumns(dailyCommits: RawCommitStats['dailyCommits']): HeatmapColumn[] {
  const weekMap = new Map<number, { count: number; bin: number; date: Date }[]>();
  for (const { date, count } of dailyCommits) {
    const d = new Date(date);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    if (!weekMap.has(weekNum)) weekMap.set(weekNum, []);
    weekMap.get(weekNum)!.push({ count, bin: d.getDay(), date: d });
  }
  return [...weekMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNum, bins]) => {
      const existingDays = new Set(bins.map(b => b.bin));
      const allBins: HeatmapBin[] = [];
      const weekDate = new Date(bins[0].date);
      weekDate.setDate(weekDate.getDate() - bins[0].bin);
      for (let day = 0; day < 7; day++) {
        if (existingDays.has(day)) {
          allBins.push(bins.find(b => b.bin === day)!);
        } else {
          const d = new Date(weekDate);
          d.setDate(d.getDate() + day);
          allBins.push({ count: 0, bin: day, date: d });
        }
      }
      return { bin: weekNum, bins: allBins };
    });
}

export function hourlyDistributionToHeatmapColumns(
  hourlyDistribution: RawCommitStats['hourlyDistribution'],
): HeatmapColumn[] {
  const hourMap = new Map<number, HeatmapBin[]>();
  for (const { day, hour, count } of hourlyDistribution) {
    if (!hourMap.has(hour)) hourMap.set(hour, []);
    hourMap.get(hour)!.push({ count, bin: day });
  }
  return [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, bins]) => ({ bin: hour, bins, columnLabel: String(hour) }));
}

export function contributorActivityToHeatmapColumns(
  contributorActivity: RawCommitStats['contributorActivity'],
): { columns: HeatmapColumn[]; rowLabels: string[] } {
  const rowLabels = contributorActivity.map(c => c.author);
  const allPeriods = new Set<string>();
  for (const c of contributorActivity) {
    for (const p of c.periods) allPeriods.add(p.period);
  }
  const sortedPeriods = [...allPeriods].sort();
  const columns: HeatmapColumn[] = sortedPeriods.map((period, colIdx) => ({
    bin: colIdx,
    columnLabel: period,
    bins: contributorActivity.map((c, rowIdx) => ({
      count: c.periods.find(p => p.period === period)?.count || 0,
      bin: rowIdx,
    })),
  }));
  return { columns, rowLabels };
}

export function contributorModulesToHeatmapColumns(
  matrix: RawContributorModules['matrix'],
): { columns: HeatmapColumn[]; rowLabels: string[] } {
  const rowLabels = matrix.map(m => m.author);
  const allModules = new Set<string>();
  for (const m of matrix) {
    for (const mod of m.modules) allModules.add(mod.module);
  }
  const sortedModules = [...allModules].sort();
  const columns: HeatmapColumn[] = sortedModules.map((module, colIdx) => ({
    bin: colIdx,
    columnLabel: module,
    bins: matrix.map((m, rowIdx) => ({
      count: m.modules.find(mod => mod.module === module)?.count || 0,
      bin: rowIdx,
    })),
  }));
  return { columns, rowLabels };
}

export function codeEvolutionToAreaData(
  weeks: Array<{ weekStart: string; additions: number; deletions: number }>,
): BklitAreaRow[] {
  return weeks.map(w => ({
    date: w.weekStart.substring(5),
    added: w.additions,
    deleted: w.deletions,
  }));
}

export function commitTimelineToRows(
  timeline: Array<{ date: string; cumulative: number }>,
): Array<{ date: string; count: number; cumulative: number }> {
  let prev = 0;
  return timeline.map((t, i) => {
    const count = t.cumulative - prev;
    prev = t.cumulative;
    return { date: t.date, count, cumulative: t.cumulative };
  });
}

export function adaptBranchGraphData(raw: RawBranchGraph): {
  nodes: CommitNode[];
  edges: CommitEdge[];
  allBranches: string[];
} {
  return {
    nodes: raw.nodes.map((n, i) => ({
      id: `node-${i}`,
      hash: n.hash,
      branch: n.branch,
      date: n.date,
      message: n.message,
      author: n.author,
      authorEmail: n.authorEmail,
      tag: n.tag,
    })),
    edges: raw.edges.map(e => ({
      source: e.from,
      target: e.to,
    })),
    allBranches: raw.branches,
  };
}

export function adaptSunburstData(tree: unknown): unknown {
  return tree;
}
```

- [ ] **Step 2: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`
Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts
git commit -m "feat(git-vis): add chart data adapters for API→chart format conversion"
```

---

### Task 9: Frontend — useChartData hook

**Files:**
- Create: `frontend/src/app/features/git-visualization/hooks/useChartData.ts`

**Interfaces:**
- Consumes: `GitVisSlice` from store, `activeWorkspaceTab`
- Produces: `{ data, loading, error, timeRange, setTimeRange }` for a given chartId

- [ ] **Step 1: Write `useChartData` hook**

Create `frontend/src/app/features/git-visualization/hooks/useChartData.ts`:

```typescript
import { useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { CHART_IDS } from '../GitVisualizationView';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';

const TIME_RANGE_CHARTS = new Set([
  CHART_IDS.HEATMAP,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
]);

export function useChartData(chartId: string): {
  data: unknown;
  loading: boolean;
  error: string | undefined;
  timeRange: TimeRangeState | undefined;
  setTimeRange: (range: TimeRangeState) => void;
  hasTimeRange: boolean;
} {
  const { activeWorkspaceTab, gitVisData, gitVisLoading, gitVisErrors, gitVisTimeRange } =
    useAppStore(
      useShallow((s) => ({
        activeWorkspaceTab: s.activeWorkspaceTab,
        gitVisData: s.gitVisData,
        gitVisLoading: s.gitVisLoading,
        gitVisErrors: s.gitVisErrors,
        gitVisTimeRange: s.gitVisTimeRange,
      })),
    );

  const setGitVisTimeRange = useAppStore((s) => s.setGitVisTimeRange);

  return useMemo(() => {
    const wsData = gitVisData[activeWorkspaceTab] || {};
    const wsLoading = gitVisLoading[activeWorkspaceTab] || {};
    const wsErrors = gitVisErrors[activeWorkspaceTab] || {};
    const wsTimeRange = gitVisTimeRange[activeWorkspaceTab] || {};

    return {
      data: wsData[chartId],
      loading: wsLoading[chartId] ?? false,
      error: wsErrors[chartId],
      timeRange: wsTimeRange[chartId],
      setTimeRange: (range: TimeRangeState) =>
        setGitVisTimeRange(activeWorkspaceTab, chartId, range),
      hasTimeRange: TIME_RANGE_CHARTS.has(chartId),
    };
  }, [activeWorkspaceTab, chartId, gitVisData, gitVisLoading, gitVisErrors, gitVisTimeRange, setGitVisTimeRange]);
}
```

- [ ] **Step 2: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`
Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/hooks/useChartData.ts
git commit -m "feat(git-vis): add useChartData hook for store-to-chart data binding"
```

---

### Task 10: Frontend — TimeRangeSelector component

**Files:**
- Create: `frontend/src/app/features/git-visualization/TimeRangeSelector.tsx`
- Modify: `frontend/src/app/features/git-visualization/index.ts` — add export

**Interfaces:**
- Produces: `<TimeRangeSelector value={TimeRangeState} onChange={(r) => void} />`

- [ ] **Step 1: Write `TimeRangeSelector.tsx`**

Create the component:

```typescript
import React, { useCallback, useState, useRef, useEffect } from 'react';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';

const PRESETS: { key: TimeRangeState['preset']; label: string }[] = [
  { key: 'week', label: '近一周' },
  { key: 'month', label: '近一月' },
  { key: 'year', label: '近一年' },
  { key: 'all', label: '全部' },
  { key: 'custom', label: '自定义' },
];

interface TimeRangeSelectorProps {
  value: TimeRangeState;
  onChange: (range: TimeRangeState) => void;
}

export const TimeRangeSelector = React.memo(function TimeRangeSelector({
  value,
  onChange,
}: TimeRangeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customSince, setCustomSince] = useState(value.since || '');
  const [customUntil, setCustomUntil] = useState(value.until || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    if (open || customOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open, customOpen]);

  const getDisplayText = useCallback(() => {
    switch (value.preset) {
      case 'week': return '近一周';
      case 'month': return '近一月';
      case 'year': return '近一年';
      case 'all': return '全部';
      case 'custom': return `${value.since || ''} ~ ${value.until || ''}`;
      default: return '近一年';
    }
  }, [value]);

  const handlePreset = useCallback((preset: TimeRangeState['preset']) => {
    if (preset === 'custom') {
      setCustomOpen(true);
      setCustomSince(value.since || '');
      setCustomUntil(value.until || '');
      return;
    }
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const nowStr = now.toISOString().substring(0, 10);
    let sinceStr: string | undefined;

    switch (preset) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        sinceStr = d.toISOString().substring(0, 10);
        break;
      }
      case 'month': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        sinceStr = d.toISOString().substring(0, 10);
        break;
      }
      case 'year': {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 1);
        sinceStr = d.toISOString().substring(0, 10);
        break;
      }
      case 'all':
      default:
        sinceStr = undefined;
    }
    onChange({ preset, since: sinceStr, until: preset === 'all' ? undefined : nowStr });
    setOpen(false);
  }, [onChange, value]);

  const handleStep = useCallback((direction: -1 | 1) => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const until = new Date(value.until || now.toISOString().substring(0, 10));
    const since = new Date(value.since || '2000-01-01');
    const rangeMs = until.getTime() - since.getTime();
    const newUntil = new Date(until.getTime() + direction * rangeMs);
    const newSince = new Date(since.getTime() + direction * rangeMs);
    onChange({
      preset: 'custom',
      since: newSince.toISOString().substring(0, 10),
      until: newUntil.toISOString().substring(0, 10),
    });
  }, [value, onChange]);

  const handleCustomConfirm = useCallback(() => {
    if (customSince && customUntil) {
      onChange({ preset: 'custom', since: customSince, until: customUntil });
    }
    setCustomOpen(false);
    setOpen(false);
  }, [customSince, customUntil, onChange]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <button
        type="button"
        className="adl-git-vis__timerange-btn"
        onClick={() => handleStep(-1)}
        title="上一步"
        aria-label="上一步"
      >
        {'<'}
      </button>
      <button
        type="button"
        className="adl-git-vis__timerange-btn adl-git-vis__timerange-label"
        onClick={() => setOpen(!open)}
      >
        {getDisplayText()}
      </button>
      {open && !customOpen && (
        <div className="adl-git-vis__timerange-menu">
          {PRESETS.map(p => (
            <button
              key={p.key}
              type="button"
              className={`adl-git-vis__timerange-menu-item${value.preset === p.key ? ' adl-git-vis__timerange-menu-item--active' : ''}`}
              onClick={() => handlePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {customOpen && (
        <div className="adl-git-vis__timerange-menu">
          <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11 }}>
              起始日期
              <input
                type="date"
                value={customSince}
                onChange={e => setCustomSince(e.target.value)}
                style={{ marginLeft: 4, fontSize: 11 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              结束日期
              <input
                type="date"
                value={customUntil}
                onChange={e => setCustomUntil(e.target.value)}
                style={{ marginLeft: 4, fontSize: 11 }}
              />
            </label>
            <button
              type="button"
              onClick={handleCustomConfirm}
              style={{ marginTop: 4, fontSize: 11 }}
            >
              确认
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="adl-git-vis__timerange-btn"
        onClick={() => handleStep(1)}
        title="下一步"
        aria-label="下一步"
      >
        {'>'}
      </button>
    </div>
  );
});
```

- [ ] **Step 2: Add CSS styles**

Read `frontend/src/styles/regions/rightpanel/git-visualization.css`. Add styles for the time range selector:

```css
.adl-git-vis__timerange-btn {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
}
.adl-git-vis__timerange-btn:hover {
  background: var(--bg-hover);
}
.adl-git-vis__timerange-label {
  color: var(--color-accent);
  font-weight: 500;
}
.adl-git-vis__timerange-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background: var(--bg-tooltip);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 140px;
}
.adl-git-vis__timerange-menu-item {
  display: block;
  width: 100%;
  padding: 4px 10px;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}
.adl-git-vis__timerange-menu-item:hover {
  background: var(--bg-hover);
}
.adl-git-vis__timerange-menu-item--active {
  color: var(--color-accent);
  font-weight: 600;
}
```

- [ ] **Step 3: Update `index.ts`**

Read `frontend/src/app/features/git-visualization/index.ts`. Add:

```typescript
export { TimeRangeSelector } from './TimeRangeSelector';
```

- [ ] **Step 4: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`
Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/TimeRangeSelector.tsx frontend/src/styles/regions/rightpanel/git-visualization.css frontend/src/app/features/git-visualization/index.ts
git commit -m "feat(git-vis): add TimeRangeSelector component with presets and custom date picker"
```

---

### Task 11: Frontend — Wire real data into chart components

**Files:** Modify all 8 chart files + HeatmapCardGroup + GitVisualizationView + useGitVisRefresh + WorkspaceTabBar

**Interfaces:** Each chart component adds a `data` prop of the appropriate type (see Chart prop types table in Interface Contracts)

- [ ] **Step 1: Modify `CalendarHeatmap.tsx`**

Change from `useMemo(() => toHeatmapColumns(), [])` to accept a `data` prop:

```typescript
import React, { useMemo } from 'react';
import { commitStatsToHeatmapColumns } from '../adapters/chartDataAdapters';
import type { HeatmapColumn } from '@/components/charts/heatmap/heatmap-context';

interface CalendarHeatmapProps {
  data?: Array<{ date: string; count: number }>;
}
export const CalendarHeatmap = React.memo(function CalendarHeatmap({ data }: CalendarHeatmapProps) {
  const heatmapData = useMemo(
    () => (data ? commitStatsToHeatmapColumns(data) : []),
    [data],
  );
  // ... rest of component uses heatmapData instead of toHeatmapColumns()
});
```

- [ ] **Step 2: Modify `ClockHeatmap.tsx`**

Similarly, accept `data` prop:

```typescript
interface ClockHeatmapProps {
  data?: Array<{ day: number; hour: number; count: number }>;
}
// use hourlyDistributionToHeatmapColumns(data)
```

- [ ] **Step 3: Modify `ContributorActivityHeatmap.tsx`**

```typescript
interface ContributorActivityHeatmapProps {
  data?: Array<{ author: string; authorEmail: string; totalCommits: number; periods: Array<{ period: string; count: number }> }>;
}
// use contributorActivityToHeatmapColumns(data)
```

- [ ] **Step 4: Modify `ContributorModuleHeatmap.tsx`**

```typescript
interface ContributorModuleHeatmapProps {
  data?: Array<{ author: string; authorEmail: string; modules: Array<{ module: string; count: number }> }>;
}
// use contributorModulesToHeatmapColumns(data)
```

- [ ] **Step 5: Modify `CodeLineEvo.tsx`**

```typescript
interface CodeLineEvoProps {
  data?: Array<{ weekStart: string; additions: number; deletions: number }>;
}
// use codeEvolutionToAreaData(data)
```

- [ ] **Step 6: Modify `CommitTimeline.tsx`**

```typescript
interface CommitTimelineProps {
  data?: Array<{ date: string; cumulative: number }>;
}
// use commitTimelineToRows(data)
```

- [ ] **Step 7: Modify `BranchGraph.tsx`**

```typescript
interface BranchGraphProps {
  data?: { nodes: Array<...>; edges: Array<...>; branches: string[] };
}
// use adaptBranchGraphData(data) → nodes/edges/branches
```

Remove the direct imports from `gitVisMockData`. Use the `data` prop instead. When `data` is undefined, render empty state. When `data` is defined, use `adaptBranchGraphData(data)`.

- [ ] **Step 8: Modify `FileSunburst.tsx`**

```typescript
interface FileSunburstProps {
  data?: unknown;
}
// use adaptSunburstData(data)
```

- [ ] **Step 9: Modify `HeatmapCardGroup.tsx`**

Add a `data` prop for the commit stats data. Pass appropriate slices to each tab chart:

```typescript
interface HeatmapCardGroupProps {
  onRefresh?: () => Promise<void>;
  data?: RawCommitStats;
  timeRange: TimeRangeState;
  onTimeRangeChange: (range: TimeRangeState) => void;
}
// Pass data.dailyCommits → CalendarHeatmap
// Pass data.hourlyDistribution → ClockHeatmap
// Pass data.contributorActivity → ContributorActivityHeatmap
// ContributorModule needs its own data
```

- [ ] **Step 10: Modify `WorkspaceTabBar.tsx`**

Replace `mockWorkspaceTabs` with `recentWorkspaces` from the store:

```typescript
import { useAppStore } from '@stores/slicedStore';
// Replace: const tabs = mockWorkspaceTabs;
// With: const recentWorkspaces = useAppStore(s => s.recentWorkspaces);
// Map recentWorkspaces to tab format: { id: w.id, label: w.name }
```

- [ ] **Step 11: Modify `useGitVisRefresh.ts`**

Replace the stub with real logic using `gitVisActions.refreshWorkspace`:

```typescript
export function useGitVisRefresh(workspaceId: string, rootPath: string) {
  const bridge = useAppStore(s => s.bridge);
  const setLoading = useAppStore(s => s.setGitVisLoading);
  const setError = useAppStore(s => s.setGitVisError);
  const setData = useAppStore(s => s.setGitVisData);
  const timeRanges = useAppStore(s => s.gitVisTimeRange[workspaceId] || {});

  const refreshWorkspace = useCallback(async () => {
    await refreshWorkspaceAction(
      bridge,
      workspaceId,
      rootPath,
      timeRanges as Record<string, { since?: string; until?: string }>,
      (chartId, loading) => setLoading(workspaceId, chartId, loading),
      (chartId, error) => setError(workspaceId, chartId, error),
      (chartId, data) => setData(workspaceId, chartId, data),
    );
  }, [bridge, workspaceId, rootPath, timeRanges, setLoading, setError, setData]);

  const refreshChart = useCallback(async (chartId: string) => {
    setLoading(workspaceId, chartId, true);
    setError(workspaceId, chartId, undefined);
    try {
      const tr = timeRanges[chartId] as { since?: string; until?: string } | undefined;
      const data = await fetchChartData(bridge, workspaceId, rootPath, chartId, tr?.since, tr?.until);
      setData(workspaceId, chartId, data);
    } catch (e) {
      setError(workspaceId, chartId, e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(workspaceId, chartId, false);
    }
  }, [bridge, workspaceId, rootPath, timeRanges, setLoading, setError, setData]);

  return { refreshWorkspace, refreshChart };
}
```

- [ ] **Step 12: Modify `GitVisualizationView.tsx`**

The main container component needs the biggest refactor. Key changes:

1. Import `useChartData` and `TimeRangeSelector`
2. Import bridge from store
3. Get `recentWorkspaces` and `appInfo` from store for workspace lookup
4. Extract `data`/`loading`/`error`/`timeRange`/`setTimeRange` per chart
5. Pass data props to each chart component
6. Add `TimeRangeSelector` to `ChartCard` header for time-range-enabled charts
7. Add loading skeleton and error banner per chart
8. Remove the `<p className="adl-git-vis__note">` mock data note entirely
9. Add debug logging on mount (cascade load phases)

- [ ] **Step 13: Update `index.ts` barrel export**

Read `frontend/src/app/features/git-visualization/index.ts`. Add exports for any new public components/hooks.

- [ ] **Step 14: Add cascade loading initializer**

In `GitVisualizationView.tsx`, add a `useEffect` that on mount:

```typescript
useEffect(() => {
  const ws = recentWorkspaces; // from store
  const config = appInfo?.config; // from store
  const phases = determinePhases(
    config?.workspacePriorityIds || [],
    config?.workspaceDeferredIds || [],
    config?.workspaceNaturalOrder || [],
    ws.map(w => ({ id: w.id, rootPath: w.rootPath })),
  );
  // Load high priority first
  loadPhase(bridge, phases.high, 'high', ...);
  // After first screen, load medium
  // After medium done, load low
}, [recentWorkspaces, appInfo]);
```

- [ ] **Step 15: TypeScript check**

Run: `pnpm --dir frontend run tsc --noEmit 2>&1`

Fix all type errors incrementally.

- [ ] **Step 16: Lint check**

Run: `pnpm --dir frontend run lint 2>&1`
Expected: 0 errors.

- [ ] **Step 17: Run frontend tests**

Run: `pnpm --dir frontend run test 2>&1`
Expected: All existing tests pass (mock charts may need updating for new prop interfaces).

- [ ] **Step 18: Commit**

```bash
git add frontend/src/app/features/git-visualization/
git commit -m "feat(git-vis): wire real backend data into all 8 chart components"
```

---

### Task 12: Debug logging verification + final integration test

**Files:** No new files. Verify existing logs.

- [ ] **Step 1: Verify frontend debug logs**

Search for all `[ADL-GIT-VIS]` log calls in the frontend:

```bash
rg "ADL-GIT-VIS" frontend/src/
```

Expected: logs at every checkpoint:
- `fetchChartData` send/receive/fail
- `refreshWorkspace` trigger
- `determinePhases` result
- `useChartData` cache hit/miss

- [ ] **Step 2: Verify backend debug logs**

Search for all `[ADL-GIT-VIS]` log calls in the Rust backend:

```bash
rg "ADL-GIT-VIS" crates/workspace/src/
```

Expected: logs in each of the 5 capture functions with:
- Command executed
- Data counts (commits, nodes, files)
- Elapsed time

- [ ] **Step 3: Run full test suite**

```bash
cargo test --workspace 2>&1
pnpm --dir frontend run test 2>&1
```

Expected: All tests pass.

- [ ] **Step 4: Run quality gates**

```bash
cargo clippy --workspace --all-targets -- -D warnings 2>&1
pnpm --dir frontend run lint 2>&1
```

Expected: 0 warnings (clippy), 0 errors (lint).

- [ ] **Step 5: Manual integration check**

Build and run the Tauri app. Open the Changes Panel, click Git Visualization button. Verify:
1. Real workspaces appear in WorkspaceTabBar
2. Data loads for the current workspace (possibly empty if not a git repo)
3. Time range selector changes trigger re-fetch
4. Refresh buttons trigger re-fetch
5. Debug logs appear in console (dev mode) with `[ADL-GIT-VIS]` prefix

- [ ] **Step 6: Commit (if any fixes needed)**

```bash
git commit -m "chore(git-vis): final debug logging verification and quality gate pass"
```

---

