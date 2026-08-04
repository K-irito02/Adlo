# 进度 — 2026-08-04 Git 可视化区 4 项改进

## [x] 事项 1：热力图切换 tab 时 loading 状态不显示
- 状态：已完成（用户 2026-08-04 22:xx 确认解决）
- 现象：切换到已加载过的 tab（尤其从"贡献者模块"切到其它三个热力图）时不显示"正在加载图表"状态，行为不一致。
- 根因（两处叠加，均已确认）：
  1. 快速刷新时 `setLoading(true)` 与 `setLoading(false)` 可能被 React 合入同一渲染帧，loading 从未绘制 → 通过 `CHART_LOADING_MIN_VISIBLE_MS = 200` 最小可见时长修复。
  2. **真正的可见性根因**：heatmap 在 ready→loading 过渡时进入 `exitingReady` 阶段（持续 HEATMAP_LOADING_CONCEAL_MS=450ms）。该阶段 `showLoadingLabel=true` 但 `exiting={chartPhase !== 'loading'}`=true，而 ChartLoadingLabel 带 `initial={false}` 且 `exiting=true` 时渲染为 opacity 0（不可见）。快速刷新 <450ms 时标签永远不会转为可见。line/composed 图表无此问题（标签在 `loading` 阶段挂载，可见；`exiting` 阶段才淡出）。
- 修复：
  1. `gitVisActions.ts`：新增 `CHART_LOADING_MIN_VISIBLE_MS = 200` + `holdLoadingForMin`；`refreshWorkspace` 应用。
  2. `useGitVisRefresh.ts`：`refreshChart` finally 中先 `await holdLoadingForMin` 再 `setLoading(false)`，保证 loading 至少显示 200ms。
  3. `heatmap-chart.tsx`：移除 `exiting={chartPhase !== 'loading'}`（改为始终可见），使 `exitingReady` 阶段标签立即可见。
- 验证：
  - `useGitVisRefresh.test.ts`：新增"fetch 立即解析时 loading 仍保持最小时长"用例（fake timers），并推进 2 处既有 fake-timer 用例。
  - `CalendarHeatmap.test.tsx`：mock 改为 `useReducedMotion: () => false`（贴近真实应用），新增"ready→loading 过渡标签 exiting 为 falsy"回归用例（旧代码红、新代码绿，已验证）。
  - 新增 `HeatmapCardGroup.tabSwitch.test.tsx` 集成用例：真实 useGitVisRefresh + 真实 store + bridge mock，验证从"贡献者模块"切到"日历"时 loading 标签出现。

## [x] 事项 2：分支图谱底部说明 zh-CN 文案
- 状态：已完成（用户 2026-08-04 22:xx 确认解决）
- 现象：`●圆点`、`■方块` 符号与中文间无空格；"tagged" 在简体中文下显示为英文。
- 根因：i18n 文案 `gitVisBranchGraphDesc`（zh-CN/changes.ts）缺少空格且含英文 tagged。
- 修复：`●圆点`→`● 圆点`、`■方块`→`■ 方块`；`标签徽章标记tagged版本`→`标签徽章标记带标签的版本`。
- 验证：i18n/__tests__/keys.test.ts 新增用例断言含"● 圆点""■ 方块"且不含 tagged。

## [x] 事项 3：贡献者模块"列：xxxx个模块"显示累计总数
- 状态：已完成（用户 2026-08-04 22:xx 确认解决）
- 现象：底部说明"列：{colCount}个模块"统计的是全部层级去重后的累计模块数，而非当前下钻层级的列数。
- 根因：HeatmapCardGroup 的 descVars 用 `allModules.size`（全层级累计）计算 colCount，而 drillPath 状态在 ContributorModuleHeatmap 内部。
- 修复：将 drillPath 状态上提到 HeatmapCardGroup（`moduleDrillPath`），ContributorModuleHeatmap 支持受控 drillPath/onDrillPathChange；descVars 用 `buildModuleTree(allPaths)` + `getChildrenAtPath(tree, moduleDrillPath).length` 计算当前层级列数。
- 验证：HeatmapCardGroup.test.tsx 断言根层级显示"Row: 2, Col: 2"（累计为 4）；ContributorModuleHeatmap.test.tsx 新增受控 drillPath 渲染列与 onDrillPathChange 上报用例。

## [x] 事项 4：应用打开后 Git 可视化区自动跳到底部
- 状态：已完成（用户 2026-08-04 22:xx 确认解决）
- 现象：每次打开应用，所有图表加载成功后整个区域自动滚到最底部（文件热点排行榜容器底部）。
- 根因：FileHotspotsLeaderboard 的 sorted.length 变化 effect 在初始数据到达（0→N 行）时调用 scrollOuterToBottom，把外层滚动容器滚到最底。
- 修复：sorted.length effect 不再调用 scrollOuterToBottom（仅保留 scroll/height 状态同步并记录高度基线）；外层滚动只保留给用户触发的模式/下钻/面包屑变化（原有 effect 不变）。
- 验证：FileHotspotsLeaderboard.test.tsx 新增"初始数据到达不滚动外层"用例；既有"仅增长时滚动外层"用例仍绿。

## 验证记录
- 全量前端测试：143 文件 / 1066 用例全部通过（含新增：min-duration×1、i18n×1、colCount×2、scroll×1、exitingReady 标签可见性×1、module→calendar 集成×1、TOCTOU hold 复查×1、下钻 colCount×1、stale-path 重置×1）。
- `npx tsc --noEmit`：通过。
- `npx eslint .`：0 errors / 0 warnings。
- 用户于 2026-08-04 22:xx 在应用中手动验证全部 4 项，确认解决。
- 日志审视（`.adl-logs/debug-logs.txt`、`terminal-logs.txt`）：仅 Vite HMR 与 INFO 级启动/页面加载记录，无 WARN/ERROR/`[ADL-DEBUG]` 遗留，无问题。
- Phase 4 子代理 A（根因验证，逐问题）发现并已修复：
  - 【中】refreshChart finally 的 TOCTOU 竞态（hold 到期未复查 seq 会误清新请求 loading）→ 已加 seq 复查，并有回归测试（旧代码红）。
  - 【中】ContributorModuleHeatmap drillPath 跨 tab 持久化后缺 stale-path 重置 → 已新增对齐 FileHotspotsLeaderboard 的重置 effect，并有测试。
  - 【低】`void refreshForTab(tab)` 未捕获 rejection → 已补 `.catch`。
  - 测试补强：下钻后 colCount 更新集成用例、初始加载+后续用户增长组合滚动用例、TOCTOU 用例。
  - 文案润色：`标签徽章标记带标签的版本` → `带标签的版本以徽章标记`。
  - 注释修正：scrollOuterToBottom 机制说明、HeatmapCardGroup.test 累计数注释、tabSwitch 测试注释、错误延迟注释。
- Phase 4 子代理 B（死代码清理）发现并已修复：
  - 【中】scrollOuterToBottom 内冗余基线写入（被 sorted.length effect 覆盖）→ 已移除，测试验证无回归。
  - 【低】新增测试内冗余 `vi.useRealTimers()`（afterEach 已兜底）→ 已移除。
  - 保留：ContributorModuleHeatmap 受控/非受控双模式（有意设计，被测试覆盖）、`!treeRef.current` 守卫（TS 收窄所需）、父子双份建树（重构建议，非必须）。
- Phase 4 复审子代理：7 项修复全部正确，无高/严重问题，无死代码/日志残留，可合入。
- 已于 2026-08-04 提交本地 `5caacb31`。

## Closing-Workflow 收尾（2026-08-05）

- Step 1 日志审查：`.adl-logs/` 仅 Vite HMR + INFO 级记录，无 P0/P1。
- Step 2 多 Agent 并行审查（4 Agent，3 轮循环）：
  - 第 1 轮发现并修复：
    - 【中】M1：workspace 刷新清除 loading 未受 per-chart seq 守卫，200ms hold 窗口内会误清并发的 per-chart 请求 loading → `inflightChartKeysRef` 追踪，workspace 清除时跳过在飞图表。
    - 【中】M2：被 supersede 的失败请求仍向调用方抛错 → catch 记录 `pendingError`，hold 后复查 seq 仍最新才 `throw`。
    - 【中】F1：stale-path 重置在子组件而非状态所有者 → HeatmapCardGroup 父级 reset effect（空树也重置）；子组件保留冗余保护 + 交叉注释。
    - 【中】F7：HeatmapCardGroup 测试 mock 缺 `locale` 与图表消费的 i18n key → 补全。
    - 【低】i18n 正向断言、FileHotspots 滚动注释措辞修订、per-chart 成功路径补 `setError(undefined)` 清并发错误残留。
  - 第 2/3 轮复审：补充错误-supersede、父级卸载期重置、leaderboard stale-path 重置滚动回归测试；最终确认 **Ready to merge**（零 critical/high/medium）。
- Step 3 质量检测：`npx tsc --noEmit` 通过、`npx eslint .` 0 errors 0 warnings、全量 143 文件 / **1072** 测试通过。
- Step 4 文档同步：新增知识库 `docs/knowledge-base/interaction/2026-08/git-vis-heatmap-loading-polish-2026-08-05.md`（9 条经验）并更新索引；更新根 AGENTS.md 与 ai-digital-life/AGENTS.md 前端测试计数（882→1072）。
- Step 5 项目清理：`.adl-logs/` 无超期文件、无 debug-logs.txt/test-artifacts 需清理。
- 收尾修复尚未提交（待用户确认）。
