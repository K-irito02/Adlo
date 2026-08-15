# Git Visualization — 时间范围边界约束与缓存增强设计

## 概述

对「变更面板」Git 可视化区域中除日历热力图以外的具有时间范围功能的图表，进行以下三项调整：

1. **数据作用域** — 确认当前 display 层已通过 `activeWorkspaceTab` 索引隔离，无需修改
2. **年份边界约束** — 禁止在预设模式的左右箭头和自定义日期选择器中选到工作区最早提交年份之前和当前年份之后
3. **后端缓存** — 为 `code_evolution` 和 `contributor_modules` 添加与 `daily_commits` 相同的 SQLite 缓存机制

## 受影响图表

| 图表 | 时间范围组件 | 当前位置 |
|------|------------|---------|
| ClockHeatmap（热力图卡片组内） | TimeRangeSelector (preset) | `HeatmapCardGroup.tsx` |
| ContributorActivityHeatmap（热力图卡片组内） | TimeRangeSelector (preset) | `HeatmapCardGroup.tsx` |
| ContributorModuleHeatmap（热力图卡片组内） | TimeRangeSelector (preset) | `HeatmapCardGroup.tsx` / `GitVisualizationView.tsx` |
| CodeLineEvo | TimeRangeSelector (preset) | `TimeRangeAwareCard` in `GitVisualizationView.tsx` |
| CommitTimeline | TimeRangeSelector (preset) | `TimeRangeAwareCard` in `GitVisualizationView.tsx` |

## 前端设计

### 1. `useYearBounds` Hook（新增）

**路径**: `frontend/src/app/features/git-visualization/hooks/useYearBounds.ts`

```typescript
interface YearBounds {
  min: number;  // firstCommitYear
  max: number;  // new Date().getFullYear()
}

function useYearBounds(rootPath: string): {
  yearBounds: YearBounds | null;
  loading: boolean;
}
```

**行为**:
- 以 `rootPath` 为 key 调用 `bridge.workspace.gitVisFirstCommitYear(rootPath)`
- 返回 `{ min: firstCommitYear, max: currentYear }`；无提交时返回 `null`
- 组件卸载时自动 cancel
- 内部维护 `Map<rootPath, Promise<number|null>>` 缓存，避免同一工作区重复请求

### 2. `GitVisualizationView` 修改

- 使用 `useYearBounds(rootPath)` 获取 `yearBounds`
- `TimeRangeAwareCard` 新增 `yearBounds?: YearBounds | null` prop，透传到 `TimeRangeSelector`
- `HeatmapCardGroup` 移除内部 `firstCommitYear` 状态，改为从 props 接收 `yearBounds`
- 新增 `useChartData(CHART_IDS.CONTRIBUTOR_MODULES)` 独立获取模块数据

### 3. `TimeRangeSelector` 修改

- `yearBounds` 在 `preset` 模式下同样生效
- `handleStep`（左右箭头）:
  - 提取 `since` 的年份部分，若 `< minYear` → `showToast('gitVisCalendarYearEarliest')`，不更新
  - 提取 `until` 的年份部分，若 `> maxYear` → `showToast('gitVisCalendarYearLatest')`，不更新
- toast source: `'git-vis-year-nav'`

### 4. `MiniDatePicker` 修改

- 新增 `yearBounds?: { min: number; max: number }` prop
- 新增 `onBoundary?: (type: 'earliest' | 'latest') => void` 回调
- 所有可能跨年份边界的导航都受约束：
  - `handlePrevYear`: 若 `viewYear - 1 < min` → `onBoundary('earliest')`，不翻页
  - `handleNextYear`: 若 `viewYear + 1 > max` → `onBoundary('latest')`，不翻页
  - `handlePrevMonth`（`viewMonth === 0`时）: 若 `viewYear - 1 < min` → `onBoundary('earliest')`，不翻页
  - `handleNextMonth`（`viewMonth === 11`时）: 若 `viewYear + 1 > max` → `onBoundary('latest')`，不翻页


### 5. Chart ID 补充

```typescript
// chartIds.ts
CHART_IDS.CONTRIBUTOR_MODULES = 'contributor-modules';  // 新增
```

### 6. `gitVisActions.ts` 补充

`fetchChartData` 添加路由：
```typescript
case CHART_IDS.CONTRIBUTOR_MODULES:
  result = await bridge.workspace.gitVisContributorModules(rootPath, since, until);
  break;
```

## 后端设计

### 1. 缓存抽象函数

```rust
// git_vis_cache.rs
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
    Fut: Future<Output = Result<T, AppError>>;
```

**流程**:
1. `since` 存在 → `extract_year(since)` → `is_historical_year(year)` → 尝试 `read_cached_chart`
2. 命中 → 返回
3. 未命中 → `fetcher()` 获取数据
4. 历史年份 → `cache_chart_data()` 写入

### 2. 新增 Chart Type 常量

```rust
pub const CHART_TYPE_CODE_EVOLUTION: &str = "code_evolution";
pub const CHART_TYPE_CONTRIBUTOR_MODULES: &str = "contributor_modules";
```

### 3. 目标命令

| 命令 | 当前状态 | 修改 |
|------|---------|------|
| `workspace_git_vis_commit_stats` | 已有缓存（`daily_commits`） | 重构为使用 `with_cached` |
| `workspace_git_vis_code_evolution` | 无缓存 | 使用 `with_cached` + `CHART_TYPE_CODE_EVOLUTION` |
| `workspace_git_vis_contributor_modules` | 无缓存 | 使用 `with_cached` + `CHART_TYPE_CONTRIBUTOR_MODULES` |

### 4. 缓存清除

现有 `purge.rs` 中 `DELETE FROM git_vis_cache WHERE root_path = ?1` 已按 `root_path` 清除所有行，新增两个 chart type 后无需修改 purge 逻辑。

## 测试

### 前端

| 文件 | 测试内容 |
|------|---------|
| `useYearBounds.test.ts`（新增） | 返回正确 yearBounds、rootPath 变化时 refetch、组件卸载 cancel |
| `TimeRangeSelector.test.tsx` | preset mode 左右箭头越界 toast、正常步进 |
| `MiniDatePicker.test.tsx` | 年份导航受 yearBounds 约束、onBoundary 回调 |
| `GitVisualizationView.test.tsx` | yearBounds 透传、contributorModules 独立数据渲染 |

### 后端

| 位置 | 测试内容 |
|------|---------|
| `git_vis_cache.rs` | `with_cached` 命中缓存跳过 fetcher、code_evolution 和 contributor_modules 的读/写 |
| `crates/storage/src/lib.rs` | purge 清除全部三种 chart type 的缓存 |

## 文件变更清单

| 文件 | 变更类型 |
|------|---------|
| `frontend/.../hooks/useYearBounds.ts` | **新增** |
| `frontend/.../TimeRangeSelector.tsx` | 修改：preset mode 支持 yearBounds |
| `frontend/.../MiniDatePicker.tsx` | 修改：接收 yearBounds + onBoundary |
| `frontend/.../GitVisualizationView.tsx` | 修改：集成 useYearBounds + contributorModules 独立 fetch |
| `frontend/.../HeatmapCardGroup.tsx` | 修改：移除内部 firstCommitYear，接收 yearBounds prop |
| `frontend/.../hooks/useChartData.ts` | 无需修改（已通用） |
| `frontend/.../chartIds.ts` | 修改：新增 CONTRIBUTOR_MODULES |
| `frontend/.../gitVisActions.ts` | 修改：fetchChartData 添加 contributor-modules 路由 |
| `src-tauri/.../git_vis_cache.rs` | 修改：新增常量 + with_cached 函数 |
| `src-tauri/.../workspace_git_vis.rs` | 修改：code_evolution 和 contributor_modules 使用 with_cached |
| `frontend/.../hooks/useYearBounds.test.ts` | **新增** |
| `frontend/.../TimeRangeSelector.test.tsx` | 修改：preset mode 边界测试 |
| `frontend/.../MiniDatePicker.test.tsx` | 修改：yearBounds 测试 |
| `frontend/.../GitVisualizationView.test.tsx` | 修改：yearBounds/contributorModules |
