# Git 可视化图表重设计 — 自适应粒度 + 发散面积 + 组合图

## 背景与问题

"变更面板 → Git 可视化"下的两个时间序列图表存在以下问题：

1. **代码行演变**：
   - 当前为"每周新增/删除双线"，无净变化直接读数；`deleted` 超过 `added` 时两线交叉难读。
   - 周粒度偏粗，无法细看"天"级别的演变。
2. **提交时间线**：
   - 当前为"单条累计提交曲线"，掩盖每周提交节奏；缩略条选区在单调曲线上视觉反馈弱。
3. **两图共用问题**：
   - 缩略条均为"累计"形式，与主图语义不一致，拖选时无法直观看到活动分布。
   - 底部说明文字（i18n desc）与实际图表语义不符。

## 目标

- 两图统一"**主图看单期活动 + 缩略条看单期活动概览**"的心智模型。
- **自适应粒度**：随所选区间自动切换 天/周/月，缩略条选得越窄、主图看得越细。
- **优先复用 bklit-ui 官方组件**，缺失部分从官方 GitHub 源码移植后做针对性改造。

## 方案总览

```
后端（按天数据） ──► 前端适配层（自适应粒度聚合） ──► 主图（选区细粒度）+ 缩略条（全范围粗粒度）
```

- 后端产出**按天**序列；前端一次取数，缩放/拖选仅前端重聚合，**零额外请求**。
- 图表实现基于 bklit-ui：移植官方 `Area`、`ComposedChart`、`SeriesBar` 组件入本地副本并适配。

## 设计 1：自适应粒度

### 粒度决议

`resolveGranularity(start: Date, end: Date): Granularity`，`Granularity = 'day' | 'week' | 'month'`：

| 所选区间天数 | 粒度 | X 轴标签 |
|-------------|------|---------|
| ≤ 30 天 | `day` | `3/16` |
| ≤ 180 天（约 6 个月） | `week`（周一起始） | 周起始 `3/16` |
| > 180 天 | `month`（自然月） | `2026-03` |

边界：31 天起切周，181 天起切月。区间由缩略条拖选（`xDomain`）驱动。

### 聚合规则

- `day`：原样使用每日数据。
- `week`：按周一起始聚合每日 → `additions/deletions` 求和、`count` 求和、`cumulative` 取周末日累计。
- `month`：按自然月聚合，同上。
- 区间内缺失日期**补零**，保证时间轴诚实。
- 缩略条与主图独立聚合：缩略条 = `resolveGranularity(全范围)`，主图 = `resolveGranularity(选区)`。

## 设计 2：后端按天数据

### 类型调整（`crates/types/src/types/git_visualization.rs`）

| 结构 | 现在 | 改为 |
|------|------|------|
| 代码行演变 | `GitVisCodeEvolutionWeek { week_start, additions, deletions }`、`GitVisCodeEvolution { weeks }` | `GitVisCodeEvolutionDay { date, additions, deletions }`、`GitVisCodeEvolution { days }` |
| 时间线 | `GitVisTimelinePoint { date, cumulative }` | `{ date, count, cumulative }`（每天提交数 + 累计） |

ts-rs 自动重新生成前端 TS 绑定。

### 采集逻辑（`crates/workspace/src/git/git_vis/commit_stats.rs`）

- `capture_code_evolution`：周桶 `week_map`（按 `start_of_week`）→ **天桶 `day_map`（按 `YYYY-MM-DD`）**。`start_of_week` 不再被使用则移除（`day_of_week`/`gregorian_to_jdn` 仍被小时热力图使用，保留）。
- `capture_commit_stats` 的 `commit_timeline`：逐提交点 → **按天桶**（复用已建 `daily_map`）：每天 `count`，`cumulative` 逐日累加。

### 缓存（`src-tauri/src/commands/git_vis_cache.rs`）

**结构不变**：缓存键已是精确日期区间 `(root_path, since, until, chart_type)`，仅内容从"周聚合"变为"按天序列"。

## 设计 3：bklit-ui 官方组件移植与改造

`frontend/src/components/charts/` 是 bklit-ui 的本地裁剪副本。官方（bklit.com/docs + github.com/bklit/bklit-ui）存在以下组件，但本地**未拷入**：

### 移植 `Area`（来自官方 `AreaChart`）

- 官方 `Area` props：`dataKey`、`yAxisId`、`fill`、`fillOpacity`、`stroke`、`strokeWidth`、`curve`、`animate`、`showLine`、`showHighlight`、`gradientToOpacity`、`fadeEdges`、`showMarkers`、`dashFromIndex`、`dashArray`。
- **改造点**：官方 `Area` 默认填充到绘图区底部；发散面积需要填充到 **y=0 零基线**。增加 `baseline: 'bottom' | 'zero'`（默认 `'bottom'` 保持官方行为，`'zero'` 供发散面积使用）。
- `Area` 驱动 Y 域（与 `Line` 一致），并纳入 `LINE_DOMAIN_EXCLUDED_NAMES` 的排除语义需复核（发散场景要求 Area 参与 Y 域）。

### 移植 `ComposedChart` + `SeriesBar`

- 官方 `ComposedChart` props：`data`、`xDataKey`、`margin`、`aspectRatio`、`barGap`、`barSize`、`maxBarSize`、`stacked`、`stackGap`、`status` 等。
- 官方 `SeriesBar` props：`dataKey`、`yAxisId`、`fill`、`radius`、`fadedOpacity` 等（时间轴柱状，非 BarChart 的分类 `Bar`）。
- 本地 `TimeSeriesChartInner` 的组合柱管线（`composedBarDataKeys`/`computeSeriesBarWidth`/reveal clip padding）**已就位**，移植后直接接通；`SeriesBar` **不驱动 Y 域**（由 `Line` 主导），契合 `LINE_DOMAIN_EXCLUDED_NAMES` 语义。

### 直接复用（本地已具备）

- `Line`（负值时 Y 轴自动扩展全数据范围）— 净增长线、累计线
- `Grid highlightRowValues={[0]}` — 发散图零基线强调
- `XAxis`（`numTicks`/`tickMode`）— 自适应粒度刻度控制
- `ChartBrushLayout` / `ChartBrush` — 缩略条 + 拖选

## 设计 4：代码行演变（发散面积 + 净增长线）

```
<ChartBrushLayout data={chartData} enabled height={72}
  brushStrip={... 单期净增长线（全范围粗粒度） ...}>
  {(layout) => (
    <LineChart data={chartData}
      xDomain={layout.xDomain} xDomainSlotCount={layout.xDomainSlotCount}
      tweenYDomainOnXDomainChange yDomainTween>
      <Grid highlightRowValues={[0]} horizontal />
      <Area dataKey="added" baseline="zero" ... />        ← 新增向上
      <Area dataKey="deletedNeg" baseline="zero" ... />    ← deleted 编码为负值，向下发散
      <Line dataKey="net" stroke="...净增长线..." />       ← added − deleted
      <XAxis />
      <ChartTooltip />   ← 显示 新增 / 删除 / 净变化
    </LineChart>
  )}
</ChartBrushLayout>
```

- 数据行字段：`{ date, added, deletedNeg, net }`，其中 `deletedNeg = -deletions`、`net = additions - deletions`（前端适配层产出）。
- 缩略条：`Line dataKey="net"`（**单期净增长**，非累计），y 域可含负值。
- Tooltip：`新增 / 删除 / 净变化` 三项。

## 设计 5：提交时间线（组合图）

```
<ChartBrushLayout data={chartData} enabled height={72}
  brushStrip={... 单期提交数（全范围粗粒度） ...}>
  {(layout) => (
    <ComposedChart data={chartData} barGap={0} maxBarSize={...}
      xDomain={layout.xDomain} xDomainSlotCount={layout.xDomainSlotCount}
      tweenYDomainOnXDomainChange yDomainTween>
      <Grid horizontal />
      <SeriesBar dataKey="count" radius={4} ... />          ← 每周提交数
      <Line dataKey="cumulative" ... />                     ← 累计线
      <XAxis />
      <ChartTooltip />   ← 显示 本周提交数 / 累计
    </ComposedChart>
  )}
</ChartBrushLayout>
```

- 数据行字段：`{ date, count, cumulative }`。
- 缩略条：`Line dataKey="count"`（**单期提交数**，非累计）。

## 设计 6：底部说明文字更新（i18n）

| key | 现在 | 改为 |
|-----|------|------|
| `gitVisCodeLineEvoDesc` | "行：累计行数，列：40周时间。绿线为新增行数，红线为删除行数。…" | 描述发散面积（新增向上/删除向下）+ 净增长线 + 自适应粒度 + 缩略条单期值 |
| `gitVisCommitTimelineDesc` | "行：累计提交数，列：2周时间。折线为累计提交增长趋势。…" | 描述累计线 + 单期柱状 + 自适应粒度 + 缩略条单期值 |

zh-CN 与 en-US 同步，相关测试断言同步。

## 文件结构 / 改动清单

**后端（Rust）**
- `crates/types/src/types/git_visualization.rs`：结构改名 + `count` 字段
- `crates/workspace/src/git/git_vis/commit_stats.rs`：按天聚合
- `src-tauri/src/commands/git_vis_cache.rs`：无结构改动（内容语义变化）
- ts-rs 类型绑定重新生成

**前端 — 图表库（bklit-ui 本地副本）**
- 新增 `area.tsx`（移植官方 `Area` + `baseline` 改造）、`composed-chart.tsx`（移植官方 `ComposedChart`）、`series-bar.tsx`（移植官方 `SeriesBar`）
- `line-chart.tsx` / `time-series-chart-shell.tsx`：接通 `SeriesBar`/`Area` 提取与组合柱管线
- `chart-context.tsx`：类型扩展

**前端 — 适配层与图表**
- `adapters/chartDataAdapters.ts`：`resolveGranularity`、`aggregate*`、按天输入
- `charts/CodeLineEvo.tsx`、`charts/CommitTimeline.tsx`：新形态 + 自适应粒度 + 单期缩略条
- `data/gitVisMockData.ts`：按天 mock 数据
- i18n：`zh-CN/changes.ts`、`en-US/changes.ts`

## 测试策略

| 层 | 测试 |
|----|------|
| Rust | 代码行演变按天聚合、时间线按天 `count/cumulative`、既有 `git_vis` 测试更新、缓存测试保持 |
| 适配层 | `resolveGranularity` 边界（30/31、180/181）、周/月聚合正确性、补零、缩略条/主图粒度独立 |
| 移植组件 | `Area` 零基线填充与发散、`SeriesBar` 宽度/圆角/堆叠/hover、`ComposedChart` 组合渲染 |
| 图表组件 | 代码行演变（发散 + 净线 + 零基线 + Tooltip 三项）、提交时间线（柱 + 线 + Tooltip 两项）、单期缩略条 |
| 回归 | 既有 brush strip margin 回归测试不退化 |
| i18n | desc 更新 + 测试断言 |

## 风险与对策

| 风险 | 对策 |
|------|------|
| 上游 `Area`/`ComposedChart`/`SeriesBar` 依赖本地副本缺失的辅助模块 | 移植时核对依赖（chart-context、y-axis、clip 管线已就位），缺失一并移植 |
| `Area` 默认填到底部 vs 发散面积需填到 y=0 | `baseline` 显式改造点，默认保持官方 `bottom` 行为 |
| 多年按天数据量较大 | 前端聚合 O(n)、缩略条粗粒度、`decimateTimeSeries` 降采样 |
| 净增长线负值域 | 官方已支持，测试覆盖 |
| 自适应粒度 x 轴标签密度 | `XAxis numTicks/tickMode` 控制 |

## 未来扩展

- 粒度决议与聚合逻辑可复用于 Git 可视化面板其他时间序列图表。
- `Area` 的 `baseline` 模式、`SeriesBar` 组合能力可服务后续其他组合图需求。
