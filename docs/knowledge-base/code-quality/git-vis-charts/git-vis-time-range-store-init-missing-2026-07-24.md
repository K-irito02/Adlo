# Git 可视化时间范围选择器缺失 — Store 初始化缺失

## 现象

Git 可视化面板的时间范围选择器（TimeRangeSelector）代码存在且完整，但从未在 UI 中出现。

## 根因

`gitVisSlice.ts` 定义了 `defaultTimeRange()` 函数，但**从未被调用**。`gitVisTimeRange` store 初始化为 `{}`，没有任何代码负责填充默认值。`useChartData` 因此返回 `timeRange = undefined`，导致 `TimeRangeAwareCard` 和 `HeatmapCardGroup` 中的条件渲染（`{timeRange && ...}`）永远为假。

## 修复

1. `useChartData.ts` — 添加 `useEffect`：当 chart 支持 time range（HEATMAP / CODE_LINE_EVO / COMMIT_TIMELINE）但 store 中缺少值时，自动调用 `setGitVisTimeRange` 以 `defaultTimeRange()` 初始化
2. `GitVisualizationView.tsx` — 原本的初始加载 `useEffect` 使用 `[]` 作为依赖，导致捕获的 `refreshWorkspace` 闭包持有空的 `timeRanges = {}`。改用 `refreshWorkspaceRef` 结合 `[rootPath]` dep 解决闭包陷阱

## 关键教训

- **已定义但从未调用的初始化函数是常见的 Bug 模式**。在代码审查中应关注导出函数是否真的有调用方
- **Zustand store 的嵌套对象（`Record<string, Record<string, T>>`）需要明确的初始化路径**，不能依赖隐式填充
- **React `useEffect` 的 `[]` 依赖会捕获闭包中的最新值**。当回调需要读取逐渐变化的 store 数据时，使用 ref 模式（`useRef` + `ref.current = value`）避免闭包冻结
- **日志证实了修复效果**：修复前 `fetchChartData` 日志无 `since`/`until` 参数；修复后日志包含正确的日期范围
