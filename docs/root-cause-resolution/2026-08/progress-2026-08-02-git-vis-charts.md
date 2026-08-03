# 进度 — 2026-08-02 (Git 可视化图表问题)

## [x] 事项 1：自定义日期范围 "2026-07-01 ~ 2026-07-10" 缺少 7 月 10 日数据
- 状态：已修复，用户已验证（Tauri 桌面端运行正常，日志无异常）
- 根因：Git 对裸日期 `YYYY-MM-DD` 的 `--until` 解释为当天 00:00:00，排除当天全天提交。`since` 零点起已包含当天，`until` 零点止排除当天，形成 off-by-one。
  - Rust: `crates/workspace/src/git/git_vis/helpers.rs` `build_time_filter` 直接 `format!("--until={}", u)`
  - Preview: `frontend/dev/previewWorkspaceService/gitVisualization.ts` 三个 handler 直接 `filterArgs.push('--until', until)`
- 修复：
  - Rust: 新增 `normalize_until_date` 函数，对裸 `YYYY-MM-DD` 追加 `T23:59:59`；新增 6 个单元测试
  - Preview: 新增 `normalizeUntilDate` + `buildTimeFilterArgs` 辅助函数，三个 handler 统一调用
- 验证：
  - Rust 测试 ✅ 6 个新测试通过
  - 前端测试 ✅ 936 passed
  - 影响范围：4 类图表（代码行演变、提交时间线、热力图3子视图、贡献者×模块）一并修复

## [x] 事项 2："代码行演变" 图表悬停在最后日期附近时主图与缩略条持续抖动
- 状态：已修复，用户已验证（Tauri 桌面端运行正常，日志无异常）
- 根因：`CodeLineEvo.tsx` 第 195-202 行 `mainXDomain` 是未 memo 化的 `let` 变量。周/月粒度下 `mainXDomain[1].getTime() > lastTime` 持续为 true，每次渲染都创建新数组 `[mainXDomain[0], new Date(lastTime)]`。
  - 引用传播链：mainXDomain 新引用 → LineChart xDomain prop 新引用 → xScale useMemo 重算 → contextValue 重算 → resolveTooltipFromX useCallback 重算 → useEffect 触发
  - useEffect（`use-chart-interaction.ts` 第 318-328 行）依赖 `resolveTooltipFromX`，每次触发调用 `scheduleTooltip`
  - 辅助因素：`inRangeDays` 和 `chartData` 也未 memo 化，每次渲染创建新数组，加剧引用变化
  - 开发者已标注 `[ADL-GITVIS] temporary render-loop detector`（第 306 行），知晓存在循环
- 修复：
  - 将 main chart 提取为 `CodeLineEvoMain` 子组件（React.memo），内部用 `useMemo` 化 `chartData` 和 `mainXDomain`
  - 同步修复 `CommitTimeline.tsx`，提取 `CommitTimelineMain` 子组件，同样 memo 化
  - 修复测试环境问题：`test-setup.ts` 添加 `afterEach(cleanup)`（vitest 未配置 `globals: true`，导致 @testing-library/react 未自动注册 cleanup）
- 验证：
  - ESLint ✅ 0 errors 0 warnings
  - Prettier ✅
  - Clippy ✅
  - Rust 测试 ✅
  - 前端测试 ✅ 936 passed 0 errors

## [x] 事项 3：检查其他可视化图表是否有同样的日期范围问题
- 状态：已完成
- 根因：根据 `gitVisActions.ts` 的 `fetchChartData`，4 类图表（代码行演变、提交时间线、热力图3子视图、贡献者×模块）都使用 since/until，都受影响。修复 `until` 处理逻辑后一并解决。
- 修复：随事项 1 一并修复
- 验证：随事项 1 一并验证

## 验收结果

| 检查项 | 结果 | 备注 |
|--------|------|------|
| ESLint | ✅ | 0 errors, 0 warnings |
| Prettier | ✅ | 所有文件 unchanged |
| TypeScript typecheck | ✅ | TS1261 已修复（workspace-browser 文件名大小写已修正为 PascalCase） |
| Clippy | ✅ | 编译通过 |
| Rust 测试 | ✅ | 50 passed（含 6 个新增 helpers 测试） |
| 前端测试 | ✅ | 936 passed, 0 errors |

## 变更文件清单

| 文件 | 变更 |
|------|------|
| `crates/workspace/src/git/git_vis/helpers.rs` | 新增 `normalize_until_date` + 6 个单元测试 |
| `frontend/dev/previewWorkspaceService/gitVisualization.ts` | 新增 `normalizeUntilDate` + `buildTimeFilterArgs`，三个 handler 统一调用 |
| `frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx` | 提取 `CodeLineEvoMain` 子组件，memo 化 chartData/mainXDomain |
| `frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx` | 提取 `CommitTimelineMain` 子组件，memo 化 chartData/mainXDomain |
| `frontend/src/test-setup.ts` | 添加 `afterEach(cleanup)` |
| `frontend/src/components/charts/use-chart-interaction.ts` | 清理 `[ADL-GITVIS]` 临时渲染循环检测器 |
| `frontend/src/components/charts/use-animated-y-domains.ts` | 清理 `[ADL-GITVIS]` 临时渲染循环检测器 |
| `frontend/src/components/charts/use-animated-series-path.ts` | 清理 `[ADL-GITVIS]` 临时渲染循环检测器 |
| `frontend/src/components/charts/tooltip/tooltip-box.tsx` | 清理 `[ADL-GITVIS]` 临时调试 console.error |
| `frontend/src/app/features/workspace-browser/MultiWorkspaceBrowser.tsx` | 文件名大小写修正（multiworkspacebrowser.tsx → MultiWorkspaceBrowser.tsx），修复 TS1261 |

## 用户验证结论（Tauri 桌面端）

日志来源：`.adl-logs/debug-logs.txt` + `.adl-logs/terminal-logs.txt`

- `debug-logs.txt`：仅 1 行 Tauri 良性警告（应用重载时异步回调丢失），与本次修复无关
- `terminal-logs.txt`：Rust 后端启动正常（46ms），数据库初始化成功，无 panic / error
- 两项修复（日期范围、悬停抖动）在日志中均无异常输出，运行稳定
- `[ADL-GITVIS]` 临时检测器无告警输出，确认抖动循环已消除
