# Calendar Year Selector & Git Visualization Cache

## 概述

改造「热力聚合可视化」中的「提交日历」图表，将当前预设时间范围菜单（近一周/近一月/近一年/全部/自定义）替换为**年份选择**模式，并建立 Rust SQLite 持久缓存层以优化重复加载体验。

## 改动范围

- **仅限于「提交日历」（CalendarHeatmap）**：其他热力图 tab（clock/activity/module）及其他图表卡（BranchGraph/CodeLineEvo/CommitTimeline/FileSunburst）的时间范围行为**完全不受影响**。
- **仅针对当前选中工作区**：年份范围 = 该工作区第一个 commit 年份 ~ 当前年份。

## 功能需求

### 1. 年份选择菜单（替代预设菜单）

| 行为 | 说明 |
|------|------|
| 点击年份标签 | 展开年份选择下拉卡片，收起时显示当前选中年份 |
| 菜单卡片 | 直角设计；默认显示 5 个项目空间，其余滚动（使用自定义垂直滚动条）；选中项后显示「打勾」图标 |
| 年份范围 | `[firstCommitYear..currentYear]`，可滚动选择，不能超过当前年份 |
| 导航按钮 | 左右按钮改为「上一年」「下一年」；到达上/下界时 disabled，若仍点击则弹 toast |

### 2. 导航按钮 Toast

| 边界 | Toast 消息 |
|------|-----------|
| 已是当前年份，用户点击「下一年」 | "已是最新年份" |
| 已是最早 commit 年份，用户点击「上一年」 | "已是最早提交年份" |

### 3. Rust SQLite 缓存

**新增表** `git_vis_cache`：

```sql
CREATE TABLE git_vis_cache (
  workspace_id TEXT NOT NULL,
  year INTEGER NOT NULL CHECK(year >= 1900 AND year <= 3000),
  chart_type TEXT NOT NULL,   -- 'daily_commits'
  data TEXT NOT NULL,          -- JSON
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, year, chart_type)
);
```

**策略**：

| 场景 | 行为 |
|------|------|
| `year < 当前年份` 且缓存存在 | 直接返回缓存，不执行 git log |
| `year < 当前年份` 且缓存不存在 | 执行 git log → 写入缓存 → 返回 |
| `year == 当前年份` | 始终执行 git log，执行后更新缓存 |

**生命周期联动**：workspace 删除/移除/归档时 `DELETE FROM git_vis_cache WHERE workspace_id = ?`。

### 4. 首个 commit 年份检测

新增函数 `get_first_commit_year(root_path)`，执行 `git log --reverse --format=%aI | head -1` 提取年份。

## 数据流

```
用户选择年份 → TimeRangeSelector(mode='year')
  → onChange({ preset: 'custom', since: 'YYYY-01-01', until: 'YYYY-12-31' })
  → fetchChartData → IPC → Tauri Command
  → commit_stats.capture_commit_stats()
    → 查询 git_vis_cache
      → 命中 ← 返回缓存数据
      → 未命中 → git log → 写入缓存 → 返回
  → CalendarHeatmap 渲染
```

## 组件架构

```
TimeRangeSelector (新增 mode: 'preset' | 'year')
  mode='preset' → 现有逻辑不变
  mode='year'   →
    ├── ◀ 上一年 (disabled + toast 在 earliestYear)
    ├── 年份标签 (点击展开)
    │     └── 年份菜单卡片 (直角, 5项可见+滚动, checkmark)
    └── ▶ 下一年 (disabled + toast 在 currentYear)
```

## 改动文件清单

| 路径 | 改动类型 | 说明 |
|------|----------|------|
| `crates/db-core/src/schema.rs` | 新增 | `git_vis_cache` 表定义 |
| `crates/db-core/src/migrations.rs` | 编辑 | 新增迁移 |
| `crates/workspace/src/git/git_vis/commit_stats.rs` | 编辑 | 集成缓存查写逻辑；新增 `get_first_commit_year()` |
| `crates/workspace/src/git/git_vis/mod.rs` | 编辑 | 导出新函数 |
| `frontend/.../gitVisSlice.ts` | 无变更 | `TimeRangeState` 复用 `custom` preset |
| `frontend/.../TimeRangeSelector.tsx` | 编辑 | 新增 `mode` prop + year branch |
| `frontend/.../HeatmapCardGroup.tsx` | 编辑 | 传 `activeHeatmapTab` 控制 mode |
| `frontend/i18n/en-US/changes.ts` | 编辑 | 新增 4 个翻译 key |
| `frontend/i18n/zh-CN/changes.ts` | 编辑 | 新增 4 个翻译 key |
| `frontend/.../git-visualization.css` | 编辑 | 年份菜单卡片样式 |
| `frontend/.../i18n/types.ts` | 自动 | 类型推断 |

## 非目标

- 不改动 Rust `TimeRangeState` 类型 — 年份选择使用 `preset='custom'` + `since/until` 表达
- 不改动其他图表的时间范围行为
- 不改动数据适配器（`commitStatsToHeatmapColumns` 已按日期正确工作）
