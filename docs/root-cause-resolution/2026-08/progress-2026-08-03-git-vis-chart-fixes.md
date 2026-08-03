# 进度 — 2026-08-03 Git可视化图表改进与缺陷修复

## [x] 事项 1：路径跳转菜单卡片显示当前右键目录名称
- 状态：已完成（TDD）
- 根因：卡片头部无右键对象提示，用户难以确认当前右键的目录。
- 修复：`ModuleTreeCard` 新增 `dirName`/`dirPath` props；头部左侧"展开全部"按钮旁新增目录名文本（超长省略），`title={dirPath}` 显示完整路径。调用方 `ContributorModuleHeatmap.handleColumnContextMenu` 与 `FileHotspotsLeaderboard.handleRowContextMenu` 传入 `node.name`/`node.path` 与 `row.name`/`row.path`。
- 验证：`ModuleTreeCard.test.tsx` 新增「render dirName + title=dirPath」测试；全套 13 个测试通过。

## [x] 事项 2：贡献者模块热力图 X 轴 tooltip 误显示目录名称
- 状态：已完成（TDD）
- 根因：`heatmap-x-axis.tsx` 目录级列标签外层容器宽度为 `max-content`（未旋转矩形命中区域），且 `title`/交互设于该容器；文件级标签 `pointer-events: none` 穿透，悬停文件标签时命中相邻目录容器矩形 → 误触发目录 tooltip/手掌光标/误点击进入目录。
- 修复（两层）：① 外层容器恒 `pointer-events: none` 且移除 title/交互；② 交互（`pointer-events-auto`/`cursor-pointer`/`onClick`/`onContextMenu`/`title`）全部下沉到**旋转包装 div**（`transform: rotate()`，命中区域跟随旋转后实际文本几何），非交互文件标签任何层级均不设交互。仅将 title 下沉不足以解决光标与误点击（内层 flex 命中区仍是旋转前宽框）。
- 验证：`heatmap-x-axis.test.tsx`（2 测试）：外层 pointer-events-none 无 title；交互类名/点击仅存在于带 transform 的内层旋转元素，文件列无 `.cursor-pointer`，`fireEvent.click` 触发 `onColumnClick`。通过。

## [x] 事项 3：路径跳转菜单卡片自动调整位置 + 支持拖拽
- 状态：已完成（TDD）
- 根因：原定位仅硬编码 `Math.min(position.x, innerWidth-360)` 粗钳制，负坐标与未覆盖方向无法钳制；无拖拽能力。
- 修复：`useLayoutEffect` 测量卡片实际尺寸，按视口边界 + 8px 内边距双向钳制（状态驱动）；头部 `onPointerDown/Move/Up` 拖拽（`setPointerCapture`，移动中持续钳制），避开按钮；`cursor: grab/grabbing`、`touch-action: none`。拖拽位置仅会话内，关闭即重置（不持久化）。
- 验证：`ModuleTreeCard.test.tsx` 新增 4 测试（视口钳制、负坐标钳制、拖拽移动、按钮不触发拖拽）；测试中补充 `window.PointerEvent` polyfill 与 `setPointerCapture` mock（jsdom 缺失）。通过。

## [x] 事项 4：点击刷新按钮后数据停留在昨天（时间范围相对预设被固化为绝对日期）
- 状态：已完成（TDD）
- 根因：`TimeRangeSelector.handlePreset` 将 week/month/year 相对预设解析为绝对日期字符串并持久化；`useGitVisRefresh` 刷新时复用固定 since/until，未按当前日期重新解析相对预设。日历热力图默认 `preset: 'year'` 语义为"当前日历年"，与"近一年"滚动语义冲突。同类：`CONTRIBUTOR_MODULES` 在模块 tab 下从不刷新。
- 修复：
  - 新建 `timeRangeUtils.ts`：`resolveRollingRange(preset, now)`（7 测试通过）、`resolveTimeRangeForFetch(range, now)`；`TimeRangeSelector.handlePreset` 复用
  - `useGitVisRefresh` fetch 前用 `resolveTimeRangeForFetch` 解析 bounds（6 测试通过）
  - `defaultTimeRange()` 改为 `preset: 'custom'`（当前日历年 1.1–12.31）
  - `HeatmapCardGroup` 模块 tab 活动时，刷新/时间范围变更同步刷新 `CONTRIBUTOR_MODULES`（`onRefreshContributorModules` 新 prop，与 `HEATMAP` 同范围）
- 验证：`gitVisSlice.test.ts`（defaultTimeRange custom）、`HeatmapCardGroup.refresh.test.tsx`（2 测试：模块 tab 刷新 CONTRIBUTOR_MODULES、时间范围同步+刷新）、`useGitVisRefresh.test.ts` 均通过。

## 收尾验证
- 全量前端测试：`pnpm run test` → 141 文件 / 1009 测试全部通过
- `npx tsc --noEmit` → 0 errors
- `npx eslint .` → 0 errors / 0 warnings

## Phase 4 收尾归档（2026-08-03）
- **日志审查**：`.adl-logs/`（debug-logs.txt / terminal-logs.txt）干净，无 ERROR/WARN，正常启动 + Vite HMR。
- **子代理 A 根因验证**：4 项修复根因识别全部正确，无严重/高危。修复其发现：
  - F1【中】`HeatmapCardGroup` mount effect 同步 CONTRIBUTOR_MODULES（模块 tab 激活时）
  - F2【中】`TimeRangeSelector.handleStep` 对 week/month/year 预设先 `resolveRollingRange` 重解析锚点再步进
  - F3【低】→ 后因与"禁止防御/兼容代码"规则冲突撤销（default 分支 + 测试）
  - F4【低】`resolveRollingRange` month 分支月末钳制（3月31日 → 2月28/29日）
  - F7【低】`ModuleTreeCard` 新增 `onPointerCancel` 重置拖拽状态
  - F10【低】`ModuleTreeCard.test` afterEach 还原 innerWidth/innerHeight
  - P1 经复核为假警报（date-only UTC 往返稳定，不修改）
- **子代理 B 死代码/冗余清理**：无死代码、无调试日志。清理其发现：
  - 2.1 刷新按钮守卫改为 `(onRefresh || onRefreshContributorModules)`
  - 2.2 提取 `syncRangeForTab`（3 处重复同步逻辑）
  - 2.3 提取 `refreshForTab(tab)`（消除闭包陷阱 + 去重）
  - 2.4 `handleStep` 改用 `resolveTimeRangeForFetch`（消除锚点解析重复）
  - 2.5 删除 `labelStyle` 冗余 flex 死样式
  - 3.1 删除 `resolveTimeRangeForFetch` default 分支 + 测试
- **两轮子代理复审**：均确认正确、无回归。最终全量 141 文件 / 1015 测试通过，lint/typecheck 全绿。

## Closing Workflow 收尾（2026-08-03）
- **多Agent 首轮审查（4 Agent 按任务并行）**：
  - Agent1（ModuleTreeCard）：medium×3（拖拽每帧全量重渲染 / lostpointercapture 缺失 / sizeRef 过期）、low×5（preventDefault / cancel 释放 / dirName-dirPath 耦合 / 初始钳制覆盖拖拽 / 测试盲区）
  - Agent2（heatmap-x-axis）：medium×1（非旋转分支零测试）、low×4（旋转残留幻影命中区可接受 / flex 冗余 / 选择器脆弱 / contextMenu+外层点击无测试）
  - Agent3（时间范围）：medium×1（显示侧消费陈旧 since/until 与重解析数据错位）、low×5（跨午夜守卫 / default 分支已撤销 / year 闰日回退不一致 / handleStep UTC 注释 / Promise 吞错）
  - Agent4（HeatmapCardGroup）：medium×2（localStorage 泄漏 / 切 tab 刷新未测）、low×4（mock 缺 locale / 硬编码映射 / 双写 / loadingLabel 硬编码）
- **第 2 轮复审（2 Agent）**：确认首轮修复正确，新增发现——Agent5 medium（initialPositionRef 空依赖致"卡片打开时右键另一目录"位置不更新）、Agent6 medium×2（跨午夜测试未触达新分支 / displayRange memo 冻结致跨日显示错位）、low×3。
- **终审（1 Agent）**：确认 5 项修复全部正确，发现 medium×1——跨午夜后 `isRangeStillCurrent` 同时 gate loading，导致滚动预设图表 loading 卡住。
- **修复汇总**（closing 审查阶段）：
  - ModuleTreeCard：rAF 节流 setPos（dragRafRef）+ `endDrag` 统一清理（up/cancel/lostpointercapture）+ `hasDraggedRef` 守卫（挂载/新 position 钳制 vs 拖拽位置不被覆盖）+ ResizeObserver 重钳制 + preventDefault + clampToViewport 非有限值守卫 + `dir` prop 合并
  - heatmap-x-axis：移除冗余中间 flex 层 + `data-testid` 选择器 + 非旋转分支/contextMenu/外层点击不触发测试
  - HeatmapCardGroup：`displayRange` 每渲染重解析（不 memo 冻结，显示与 fetch 同快照）+ `loadingLabel` 改用 `t.gitVisLoadingModules` + 切 tab/localStorage/locale 测试
  - useGitVisRefresh：守卫拆分 `isRangeStillCurrent`（原始 range，gate loading）与 `isResolvedBoundsCurrent`（含 resolved bounds，gate data/error）+ 跨午夜测试改用 fake timers 推进 now
  - timeRangeUtils：year 分支与 month 共用月末钳制（闰日回退）
- **最终验证**：全量 141 文件 / 1025 测试通过，`eslint .` 0 errors / 0 warnings，`tsc --noEmit` 0 errors。
- **文档同步**：knowledge-base 沉淀 2 条经验（CSS transform 命中区 + 相对时间预设重解析），interaction README 更新索引。
