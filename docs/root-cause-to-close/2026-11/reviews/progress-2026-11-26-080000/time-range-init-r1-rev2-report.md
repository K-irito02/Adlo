# R1 复审报告 — scope `time-range-init`（rev2）

- 工作树：`e:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-2`
- 快照：`.review-diffs/manifest-rev2.md`（base `a94a8ce25d`）；只看本轮 rev
- 只读：未运行 `git diff/log/show`（比对旧结论只读 `.review-diffs/*-rev1.diff`）、未修改源码、未跑任何测试、未启动 dev server / 浏览器（无端口占用）

## 范围

归属文件：
- `adlo/frontend/src/app/features/git-visualization/hooks/useChartData.ts`
- `adlo/frontend/src/app/features/git-visualization/hooks/__tests__/useChartData.test.tsx`

只读上下文（不产出 finding）：`stores/slices/gitVisSlice.ts`、`stores/storageHelpers.ts`、`stores/actions/browserCleanupActions.ts`、`GitVisualizationView.tsx`、`hooks/useGitVisRefresh.ts`、`HeatmapCardGroup.tsx`、`HeatmapCardGroup.tabSwitch.test.tsx`、`GitVisualizationView.test.tsx`、`scripts/comment-claims.mjs`。

## 上轮问题关闭情况

### F1 [medium] 已关闭

- 现状：`useChartData.ts:36-45` 已删除 ref 守卫（`useRef` 导入一并移除，全仓无 `initializedRef`/`initializedWorkspaceRef` 残留），effect 只在 `!TIME_RANGE_CHARTS.has(chartId) || chartTimeRange || !activeWorkspaceTab` 时提前返回，否则写默认范围。判据直接来自 store 现值，不再缓存「已初始化」结论，因此范围被 `clearWorkspaceGitVisData` 删除后同一挂载内会重建。
- 重复写 / 渲染循环复核（逐条）：
  - **收敛**：`setGitVisTimeRange` 同步 `set`（`gitVisSlice.ts:100-108`），写入后 `chartTimeRange` 由 undefined 变为对象 → 依赖变化 → effect 重跑即提前返回。每个 (workspace, chart) 每次「缺失」最多多写一次，无自激。
  - **StrictMode 双调用**：应用未启用 StrictMode（`src` 下无 `<StrictMode` 包裹，`StorageSettings.tsx:674` 注释亦记「app 当前未启用 StrictMode」）。即便启用，双 setup 共用同一 render 闭包，只会以同值写两次；`persistTimeRange` 走共享去抖调度器（`storageHelpers.ts:89-135`、`:178-180`，同 key 后写覆盖前写），不产生多次落盘或循环。
  - **不触发抓取循环**：视图自动刷新 effect（`GitVisualizationView.tsx:293-327`）依赖为 rootPath / activeWorkspaceTab / stale / head / branch，不含 time range 对象；`useGitVisRefresh` 在 fetch 时读 store（`useGitVisRefresh.ts:49`）。写入不会自触发 fetch。
  - **生产唯一清空路径无孤儿回写**：`cleanupRemovedWorkspaceTree` 先 `clearWorkspaceGitVisData`，再在同一同步 action 内 `setActiveWorkspaceTab`（`browserCleanupActions.ts:47-54`），React 批处理后挂载中的 effect 只看到新 active tab，不会为已移除工作区补写范围。
  - **规模**：`GitVisualizationView` 6 个 `useChartData` 中只有 5 个属于 `TIME_RANGE_CHARTS`（`useChartData.ts:7-13`），BRANCH_GRAPH 不写；5 次写入被 React 批处理为一次渲染。
- 新用例保护力（删除性推演）：`useChartData.test.tsx:64-76`「ranges cleared 后重新初始化」。
  - 恢复原 boolean 守卫（rev2 diff 的 `-` 行 `if (initializedRef.current) return;`）→ 清理后 ref 已为 true → effect 提前返回 → `timeRange` 变 undefined → `:75 toEqual(defaultTimeRange())` 变红。
  - 恢复 rev1 的 workspace 守卫（`initializedWorkspaceRef.current === activeWorkspaceTab`）→ ref 仍等于该 workspace → 同样返回 → `:75` 变红。
  - 用例从公共入口（`useChartData` + 公共 store action）进入，未触碰私有字段/内部实现，符合回归保护要求。

### F2 [low] 已关闭

- 现状：`useChartData.test.tsx:57-61` 切回后改为 `expect(result.current.timeRange).toBe(firstWorkspaceRange)`，注释同步改为「keeps the stored range instead of replacing it with a new one」。
- 推演：`defaultTimeRange()` 每次返回新对象（`gitVisSlice.ts:14-26`），「切回时无条件重写默认值」会产出新引用 → `toBe` 变红；而当前实现切回时 `chartTimeRange` 为真值提前返回，且 `setGitVisTimeRange` 写其它工作区时保留 A 的 per-workspace 对象引用（`gitVisSlice.ts:102-105` 只重建顶层 map 与被写键），`toBe` 结构上成立。
- 空断言风险已排除：`:50 toEqual(defaultTimeRange())` 保证 `firstWorkspaceRange` 非 undefined，避免 `toBe(undefined)` 恒真。

## 新增发现

无。本轮修复未引入回归或契约错误；`useChartData.ts:36-39` 三句注释（「writes only while no stored range」「cannot re-fire in a loop」「cleared → initialized again」）均可由上述代码路径证明，且不含 `comment-claims` 的 `CLAIM_PATTERN` 词（`comment-claims.mjs:13-14`），不会触发注释断言门禁。

## 记录不修

- 用例 3 的形态：`clearWorkspaceGitVisData` 直接作用在当前 active workspace 上，该状态在生产不可达（唯一调用方会同时重置 active tab）。它与旧守卫失效路径等价、删除性推演会红，保护力成立；若要 100% 复刻生产时序，可再加「切走 → clear → 切回同 id」两步（rev1 建议的原路径），非必需。
- 未覆盖 `activeWorkspaceTab === ''` 的持久化形态（根因证据里的实际值），逻辑与「未解析非空 id」等价，可选补测。
- 切工作区那一帧（effect 落定前）控件缺失、下一帧出现：预存一帧布局变化，非本轮引入。
- 非真实 workspace id（如 `workspace-1`）仍会写入并持久化默认范围：预存/设计取舍（rev1 已记），守卫删除后覆盖面与 rev1 相同。
- `HeatmapCardGroup` 本地 `tabRangesRef`（独立 `TAB_TIME_RANGE_KEY`，`HeatmapCardGroup.tsx:103-115`）与 store 默认范围可能不一致；「store 无该工作区范围、本地有非默认保存值」时，父级 `useChartData` 的默认写入可能覆盖 child 已同步值（预存、另一 scope；本轮未改变挂载期写入时机，仅新增 clear 后重建）。
- 年界 flake：写入与断言跨 12-31→01-01 时 `toEqual(defaultTimeRange())` 会红（预存，概率极低）。
- `const timeRange = chartTimeRange;`（`useChartData.ts:35`）冗余别名，预存风格。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题
