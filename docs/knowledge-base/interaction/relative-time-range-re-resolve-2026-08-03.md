# 相对时间范围预设须按当前日期重解析 — 2026-08-03

## 问题

Git可视化图表点击"刷新"后数据停留在昨天。用户昨天选择 "Past Week"（week/month/year 预设），今天点刷新，数据仍是昨天的窗口。

## 根因

- 选择预设时把相对语义解析成**绝对日期字符串**并持久化（`since`/`until`）。
- 刷新时直接复用存储的固定 `since`/`until`，未按当前日期重新解析。
- 结果：rolling 窗口被"冻结"在选择那天，刷新不跟随时间推进。

## 修复模式

1. **纯函数集中解析**：`resolveRollingRange(preset, now)` 按 `now` 计算滚动窗口（week=过去7天、month=过去1月、year=过去1年），`until` = 今天。
2. **fetch 入口统一重解析**：`resolveTimeRangeForFetch(range, now)` 对相对预设按"现在"重新解析（custom→存储值；all→无边界）。
3. **fetch 与显示用同一快照**：`useGitVisRefresh` fetch 前解析 bounds；显示侧（`HeatmapCardGroup`）也消费重解析后的 bounds，且**不要 memo 冻结**——否则跨日后仅刷新（不改选择）时显示仍停留在旧窗口。每渲染解析是安全的（日内结果稳定，跨日自愈）。
4. **月末/闰日钳制**：`setMonth`/`setFullYear` 溢出（3月31日→2月、2月29日→非闰年）时 `getDate() !== startDay` 检测后 `setDate(0)` 钳制到月末。

## 配套注意

- **时区**：date-only 字符串 `new Date('YYYY-MM-DD')` 按 UTC 午夜解析。step 平移（加整天数）后用 `toISOString().substring(0,10)` 往返稳定；**不要**改用本地字段格式化（负时区会把 UTC 午夜移到前一天）。
- **午夜竞态守卫**：相对预设的有效 bounds 由"现在"派生，而存储范围不变。若 in-flight 请求跨午夜，须比较**解析后的 bounds** 决定数据/错误是否提交；但 loading 清除只能用原始 range 比较——否则跨午夜后无新请求来清 spinner，loading 会卡住。

## 相关文件

- `frontend/src/app/features/git-visualization/timeRangeUtils.ts`
- `frontend/src/app/features/git-visualization/hooks/useGitVisRefresh.ts`
- `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx`
- `frontend/src/app/features/git-visualization/TimeRangeSelector.tsx`
