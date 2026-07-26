# Contributor Activity Heatmap — x 轴月份化改造

## 概述

将「贡献活跃度」热力图（ContributorActivityHeatmap）的 x 轴从周粒度 `YYYY-W{week}` 改为月份粒度，并添加跨年时的年份提示标签。

## 后端改动

### `crates/types/src/types/git_visualization.rs`

`GitVisContributorPeriod` 新增字段：

```rust
pub struct GitVisContributorPeriod {
    pub period: String,      // 不变，格式改为 "YYYY-MM"
    pub month: i32,          // 新增，范围 1-12
    pub count: i32,
}
```

### `crates/workspace/src/git/git_vis/commit_stats.rs`

1. `DateParts` 新增 `month: i32`
2. `parse_date_parts` 解析 `s[5..7]` 为 `month` 并存入 `DateParts`
3. `capture_commit_stats` 中 `author_map` 的 `periods` key 从 `format!("{}-W{:02}", dt.year, dt.week)` 改为 `format!("{}-{:02}", dt.year, dt.month)`
4. `GitVisContributorPeriod { period, month: dt.month, count }`

## 前端适配器

### `chartDataAdapters.ts` — `contributorActivityToHeatmapColumns`

- **接收可选参数 `since?: string, until?: string`**（`YYYY-MM-DD` 格式）
- **数据聚合**：按 `"YYYY-MM"` 分组，同月内各周的 `count` 求和
- **月份范围推导**：
  - 若 `since` 存在，从 `since` 所在月到 `until` 所在月生成完整月份序列
  - 若 `since` 不存在（"全部"预设），从实际数据的 min/max month 推断范围
- **零填充**：范围内每个月份都生成列，无数据的月份全部 `count: 0`
  - 单方块 `count = 0` → 最低色阶（浅灰）显示，方块不隐藏
  - 整列全 0 → 同样显示，x 轴标签不变，保证时间轴连续
- **列构造**：每列 `bin` 设为月份序号（0-based），`bins[].date = new Date(year, month - 1, 1)`（每月 1 日）
- **不设 `columnLabel`**：让 `HeatmapXAxis` 走内置月份锚点路径
- **`tooltipTitle`**：显示 `Intl.DateTimeFormat` 格式化的月份名

## 前端年份提示组件

### 新建 `heatmap-year-hint.tsx`

- 位于 `frontend/src/components/charts/heatmap/`
- 实现模式：参照 `HeatmapSeparator`，使用 `useHeatmap()` + `createPortal` 渲染
- 功能：
  - 遍历 `data` 列，检测年份切换（通过 `column.bins[0]?.date` 的 `.getFullYear()`）
  - 对每一年第一列，在其 x 位置上方渲染 `"2025"` / `"2026"` 标签
  - 仅当数据跨多年时显示
  - 标签样式：`text-chart-label text-xs`，与 x 轴一致
- 导出 `HeatmapYearHint` 组件

### 垂直定位方案

两层 portal 渲染于容器顶部：

| 层 | 组件 | `top` | 说明 |
|----|------|-------|------|
| 1 | `HeatmapYearHint` | `0` | 年份提示 "2025" / "2026" |
| 2 | `HeatmapXAxis` | `16` | 月份标签 "Jan" "Feb"... |

`margin.top` 从 `28` 增至 `46`（16px 年份提示 + 14px 月份标签 + 16px 间距 → 图表网格）。
`HeatmapXAxis` 新增可选 `top` prop（默认 `0`，向后兼容）。

## 图表修改

### `ContributorActivityHeatmap.tsx`

- 移除 `<HeatmapXAxis tickEvery={4} />` → 默认 `tickEvery={1}`
- `margin.top` 从 `28` 增至 `46`：顶部 16px 年份提示 + 14px 月份标签 + 间距
- 增加 `<HeatmapYearHint />` 子组件

## 受影响的范围

| 模块 | 改动 |
|------|------|
| `git_visualization.rs` | +1 字段 |
| `commit_stats.rs` | 周→月 key，补 month |
| `chartDataAdapters.ts` | 仅 `contributorActivityToHeatmapColumns` |
| `ContributorActivityHeatmap.tsx` | 移除 tickEvery，调 margin，加 year hint |
| `heatmap-year-hint.tsx` | 新建组件 |
| `heatmap-x-axis.tsx` | 可选 labelTop 属性 |
| 其他图表 | 无影响 |

## 数据流

```
git log → 后端 capture_commit_stats
  → period key: "2026-W03" → "2026-01", month: 1
  → 前端 contributorActivityToHeatmapColumns
    → 按月聚合, bins.date = 每月1日
    → 无 columnLabel
      → HeatmapXAxis 走月份锚点路径
        → 显示 "Jan", "Feb"...
      → HeatmapYearHint 检测年份边界
        → 跨年时在首月上方显示 "2025"/"2026"
```
