# Git Visualization 时间范围与 Tooltip 修复经验

## 来源
2026-07-25~26 Git 可视化全量功能修复

## 经验

### 1. Zustand 闭包过期 + React 19 批处理 = 双击 Bug
`handleTimeRangeChange` 调用 `setGitVisTimeRange`（同步更新 store）后立即调用 `onRefresh`，但 `useGitVisRefresh` 中的 `handleRefreshChart` 通过闭包读取 `timeRanges`，捕获的是旧值。加上 React 19 自动批处理将 MiniDatePicker 的 `onChange` 与 Confirm 的 `onClick` 合并到同一批次，导致:
- 所有按钮（近一周/近一月/近一年/确认/回退）需双击才能生效
- **修复**：`useGitVisRefresh` 改用 `useAppStore.getState()` 实时读取 store；闭包值用 `useRef` 驱动而非 `useCallback` 依赖

### 2. `new Map(string[])` 抛出 "Iterator value is not an entry object"
`expandToFullGrid` 中 `new Map(hourlyData.map(d => \`${d.hour}-${d.day}\`))` 传入 `string[]`，但 `Map` 构造函数要求 `[key, value][]`。V8 检测到元素非 object 时抛出此异常。
- **修复**：改为 `entries: [string, number][]`

### 3. `handleRefreshChart` 不设 `setLoading`，`useEffect` 无法检测加载完成
`handleRefreshChart`（单图表刷新）内部不调用 `setLoading`，导致 store 中 `gitVisLoading[ws][chartId]` 从未变为 `true`。依赖 store 状态的 `useEffect` 无法感知加载完成。
- **修复**：改为 Promise-based 驱动 — `onChange` 返回 `Promise<unknown>`，按钮 await 后切换状态

### 4. 初始挂载时 ref 与 store 不同步
`tabRangesRef` 从 localStorage 加载时间范围，但 Zustand store 未同步。首次数据 fetch 使用 store 中过期的默认值。
- **修复**：添加 `useEffect(() => { setGitVisTimeRange(...) }, [])` 在挂载时同步

### 5. 缓存键忽略 `until` 导致部分年份查询冲突
`with_cached` 的缓存键仅 `(root_path, since_year, chart_type)`，忽略 `until`。同一年的不同 `until` 范围查询互相覆盖。
- **修复**：迁移 `git_vis_cache` 表，添加 `until_year` 列，键变为 `(root_path, since_year, until_year, chart_type)`
