# Git可视化 热力图 loading 与 polish 治理 — 2026-08-05

来源：Git 可视化区 4 项改进（热力图 tab loading / 分支图谱 zh-CN 文案 / 贡献者模块列数 / 热点滚动）+ root-cause-resolution Phase 4 与 closing-workflow 多 Agent 复审修复。

## 经验教训

### 1. 图表 loading 标签在 `exitingReady` 阶段以 opacity 0 挂载 → 永远不可见

`ChartLoadingLabel`（`chart-loading-label.tsx`）带 `initial={false}`，`exiting=true` 时 `animate` 目标为 `opacity: 0` 并立即生效。热力图 `ready→loading` 过渡先进入 `exitingReady` 阶段（`HEATMAP_LOADING_CONCEAL_MS=450ms`），旧代码 `exiting={chartPhase !== 'loading'}` 在该阶段为 `true` → 标签以 opacity 0 挂载，**刷新 <450ms 时用户全程看不到 loading**。修复：heatmap 内移除 `exiting` 属性（loading 期间始终可见）。line/composed 图表无此问题——它们的 `showLoadingLabel` 覆盖 `loading/exiting/...`，标签在 `loading` 阶段挂载（可见）后才在 handoff 阶段淡出。

- 教训：给 `motion` 组件传 `initial={false}` 时，首次渲染直接落到 `animate` 目标。复用共享 loading 组件时，先核对 `showLoadingLabel` 与 `exiting` 在目标生命周期的组合，避免"标签在 DOM 里但视觉不可见"。

### 2. 快速 fetch 时 React 批处理吞掉 loading 渲染 → 最小可见时长

`refreshChart` 中 `setLoading(true)` 与 `setLoading(false)` 若在同一个事件循环 tick 内，React 自动批处理会合帧，loading 从未绘制。治理：`CHART_LOADING_MIN_VISIBLE_MS = 200` + `holdLoadingForMin(startedAt, minMs)`，清除 loading 前保证至少显示 200ms（对慢 fetch 是 no-op，不人为拉长真实加载）。

### 3. await 之后再复查 seq（TOCTOU）——hold 期间可能被 supersede

`finally` 中 `await holdLoadingForMin` 之后必须**再次复查** `latestRequestSeqRef.current[key] === seq` 再 `setLoading(false)`：快速连续切换 tab 时，旧请求的 hold 可能在到期时已被新请求 supersede，若直接清除会误清新请求仍在飞行中的 loading。新增 TOCTOU 回归测试（fake timers，旧代码红）。

### 4. workspace 刷新与 per-chart 刷新的 loading 所有权必须分离

workspace 刷新（全图刷新/初始加载）清除 loading 时若只受 range 守卫，会在 200ms hold 窗口内误清并发的 per-chart 请求的 loading。治理：per-chart 请求开始 `inflightChartKeysRef.add(key)`、仅最新请求结束时 `delete`；workspace 的 `setLoading(false)` 对 `inflight` 中图表跳过清除，交给 per-chart 的 finally 负责。

### 5. 被 supersede 的失败请求不应向调用方抛错

成功路径被 supersede 时静默 `return`，失败路径也应一致：catch 中记录 `pendingError`，hold 后复查 seq 仍最新才 `throw`。否则已前进的调用方会收到失效请求的 rejection（本次所有调用方都 `.catch`，但语义不一致是隐患）。

### 6. stale-path 重置放在状态所有者，而非子组件

drillPath 上提到父组件后，跨 tab 切换持久化。数据刷新移除目录时，stale-path 重置应放在**状态所有者**（HeatmapCardGroup），否则 module tab 未激活（子组件卸载）时旧路径残留，切回时出现 "Col: 0" + 陈旧面包屑。子组件可保留冗余保护（幂等，无循环）。空树（allPaths 为空）也应重置：`moduleDrillPath.length > 0 && (!moduleTree || getChildrenAtPath(...).length === 0)`。

### 7. 页脚统计数字应反映"当前渲染"而非"数据聚合"

贡献者模块底部"列：X个模块"曾用矩阵去重数（累计总数），与实际渲染列数（当前下钻层级 `getChildrenAtPath(tree, drillPath).length`）不一致。统计数字必须与渲染内容同源（同一棵树、同一路径）。

### 8. 外层滚动"仅用户触发增高才滚动"，stale-path 回退除外

FileHotspotsLeaderboard 外层滚动从"增长就滚"收敛为：初始数据到达（0→N）与数据刷新增长**不滚动**（只记录基线），仅用户触发的 mode/drill/breadcrumb 变化增高才滚动。唯一例外：数据刷新使 drill 目录失效 → stale-path 重置回根，从空中间态（基线 32px）增长到根列表 → 仍会滚动以展示回退结果（可接受）。基线由 `sorted.length` effect 记录，mode/path effect 与它的声明顺序（前者在前）是关键不变量。

### 9. i18n 文案：符号与汉字间留空格、避免英文残留

中文文案 `●圆点`、`■方块` 符号与汉字间应留空格（`● 圆点`）；`tagged版本` 之类英文残留应译为中文（`带标签的版本以徽章标记`）。测试用正向断言锁定目标文案（`toContain`），而非仅负向排除（`not.toMatch(/tagged/i)`）。
