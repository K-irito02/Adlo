# Code Quality / Git Visualization Charts

Git 可视化面板图表（热力图、折线、缩略条等）的实现、迁移与修复经验。

## 文件

| 文件 | 说明 |
|------|------|
| [2026-07-22-chart-color-preset-system.md](./2026-07-22-chart-color-preset-system.md) | 图表颜色预设系统（scoped CSS 变量 + `data-chart-preset` 属性）实现笔记 |
| [bklit-ui-component-port-and-cache-key-bump-2026-07-31.md](./bklit-ui-component-port-and-cache-key-bump-2026-07-31.md) | bklit-ui 组件移植、缓存键版本升级与聚合顺序教训 |
| [bklit-ui-loading-skeleton-var-y-domain-2026-08-04.md](./bklit-ui-loading-skeleton-var-y-domain-2026-08-04.md) | bklit-ui 装载骨架 CSS 变量未定义与骨架 y-domain 覆盖、多线 sweep 同步 |
| [chart-brush-portal-overlay-2026-08-02.md](./chart-brush-portal-overlay-2026-08-02.md) | ChartBrush 门户 overlay、CSS 级联陷阱与拖拽像素换算 |
| [echarts-visx-migration-2026-07-15.md](./echarts-visx-migration-2026-07-15.md) | 7 个 ECharts 图表迁移到 visx + 原生 SVG（增量 TDD、版本统一） |
| [git-vis-time-range-store-init-missing-2026-07-24.md](./git-vis-time-range-store-init-missing-2026-07-24.md) | 时间范围选择器缺失：Store 初始化函数已定义但从未被调用的 Bug |
| [git-vis-time-range-tooltip-fixes-2026-07-26.md](./git-vis-time-range-tooltip-fixes-2026-07-26.md) | 时间范围与 Tooltip 修复（Zustand 闭包、`Map` 构造、缓存键 `until`） |
| [heatmap-chart-generalization-2026-07-16.md](./heatmap-chart-generalization-2026-07-16.md) | HeatmapChart 泛化重构（i18n 单复数、列标签派生、tick 密度） |
| [heatmap-x-axis-label-fixes-2026-07-27.md](./heatmap-x-axis-label-fixes-2026-07-27.md) | 热力图 x 轴标签被裁剪的两个独立 CSS 根因修复 |
| [git-vis-cache-guard-review-loop-lessons-2026-10-13.md](./git-vis-cache-guard-review-loop-lessons-2026-10-13.md) | Git 可视化缓存守卫/失效四轮收尾审查 7 条教训（refresh 门控锚原始测量值、React.memo 零 props rerender 跳过、store mock 缺 getState 静默生效、mock 图表数据 null 而非 {}、工作区级失效标记清除粒度、overflow-hidden 裁 absolute 子卡、修复须同等审查） |
