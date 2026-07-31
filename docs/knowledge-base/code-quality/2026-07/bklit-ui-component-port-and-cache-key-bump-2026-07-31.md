# bklit-ui 组件移植与缓存键版本升级经验

## 背景

Git Visualization 的"代码行演变"改为发散面积 + 净增长线、"提交时间线"改为累计线 + 每周柱状（组合图），并为两图接入按所选区间自适应的 天/周/月 粒度。实现从上游 `github.com/bklit/bklit-ui`（MIT）移植官方 `Area` / `SeriesBar` / `ComposedChart` 组件进本地 vendored 副本并改造；后端 `code_evolution` 缓存负载结构从 `weeks` 改为 `days`。

## 经验总结

### 1. 本地 charts 库是 bklit-ui 的裁剪副本，先查上游再自研

`frontend/src/components/charts/` 是 bklit-ui 的 vendored 子集。官方有 `AreaChart`/`Area`、`ComposedChart`/`SeriesBar`、`ProfitLossLine`、`ReferenceArea` 等组件，本地只拷了一部分（`LINE_DOMAIN_EXCLUDED_NAMES` 中的 `Area`/`SeriesBar` 只是保留名，未实现）。

**做法：** 先确认上游是否存在现成组件（`references/bklit-ui` 本地参考副本 + bklit.com 文档），再决定"移植 + 改造"而非"自研"。移植时：

- 按本地 `Line`/`Bar` 的 chart-context 消费模式落地，适配本地 context 字段名（本地 shell 是权威）。
- 保留 MIT 归属注释。
- 改造点尽量收敛为单个参数（如 `Area` 的 `baseline: 'bottom' | 'zero'`，默认保持官方 `bottom` 行为），保证与上游 diff 清晰。
- 缺的辅助模块从上游对应路径一并移植，优先用本地等价物。

### 2. 序列化负载结构变更 → 必须版本化缓存键（I2 教训）

`with_cached` 按 `(root_path, since, until, chart_type)` 存 JSON。`GitVisCodeEvolution` 从 `{ weeks }` 改为 `{ days }` 后，**旧缓存行在新代码下会被 serde 静默反序列化为 `days: []`**——历史区间命中缓存 → 空图，无任何报错。

**做法：** 负载结构变化时，将缓存键常量升级（`"code_evolution"` → `"code_evolution_daily"`），旧行自然作废。这是"键版本升级"，不是向后兼容层，符合未发布阶段禁止兼容代码的规则。

**教训：** "缓存结构不变"的假设很危险——负载 shape 变了缓存语义就变了。改动序列化类型时把它当作"缓存格式变更"对待。

### 3. 聚合与视图过滤的顺序影响边界正确性（I1 教训）

主图"先对全量数据按粒度聚合，再按选区 xDomain 过滤"会在周/月粒度下丢边界周或整周纳入（xDomain 是点过滤，不是周期相交）。**应先把天数据过滤到选区，再聚合**，边界周/月才成为诚实的部分和。

### 4. 序列化类型补零 vs 诚实时间轴

spec 要求"缺失日期补零"。后端只产有提交的天；聚合层需对缺失天/周/月补零（提交时间线的 `cumulative` 在缺口处向前延续，而非清零），否则稀疏仓库的空档在图上被插值跨越。

### 5. Tooltip 默认展示原始 dataKey，用户可见文本必须走 i18n

`ChartTooltip` 默认 label = `line.dataKey`，改造后会出现 `added`/`deletedNeg`/`net` 等不雅标识。用官方 `rows`（`TooltipRow[]`）逃生口映射为 i18n key，禁止硬编码。
