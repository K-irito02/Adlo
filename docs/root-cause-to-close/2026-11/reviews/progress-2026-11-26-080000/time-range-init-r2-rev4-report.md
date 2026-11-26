# R2 清理审查报告 — scope `time-range-init`（rev4）

- 工作树：`e:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-2`
- 快照：`.review-diffs/manifest-rev4.md`（base `a94a8ce25d`）；只看本轮 rev4
- 只读：未运行 `git diff/log/show`、未修改源码、未跑任何测试、未启动任何服务（无端口占用）
- R2 审查维度：死代码、冗余守卫、根因修复后多余的防御、应删/降级的诊断日志、注释冗余或与实现不符

## 范围

归属文件（owner = `time-range-init`）：
- `adlo/frontend/src/app/features/git-visualization/hooks/useChartData.ts`
- `adlo/frontend/src/app/features/git-visualization/hooks/__tests__/useChartData.test.tsx`

只读上下文：`stores/slices/gitVisSlice.ts`、`stores/actions/browserCleanupActions.ts`、`stores/slices/uiSlice.ts`、`crates/workspace/src/detect.rs`、`scripts/comment-claims.mjs`、`.review-diffs/time-range-init-r1-rev2-report.md`。

本轮 rev4 相对 base 在这两个文件上的改动：删除 `useRef` 导入与 `initializedRef` 布尔守卫，effect 改为「条件即早退」形态；新增 4 行收敛性注释；测试文件为新增（3 个用例 + reset helper）。

## 上轮问题关闭情况

- R1（rev2）主表 finding：F1（medium，ref 守卫导致清理后不再初始化）、F2（low，测试用例承诺与实际断言不一致）均已关闭；rev2 结论「零问题」。本轮 rev4 这两个文件与 rev2 形态一致，未出现回退：
  - `initializedRef` / `initializedWorkspaceRef` 全仓（`frontend/src`）已无残留（仅 `features/network/NetworkSettings.tsx` 有同名无关局部变量）。
  - `useChartData.ts:40-45` 仍为无 ref 的条件早退，`setGitVisTimeRange` 同步 `set`（`gitVisSlice.ts:100-108`），写入后 `chartTimeRange` 变为真值 → effect 重跑即早退，无自激。
- 本轮无「上一轮主表 finding 未关闭」项。

## 新增发现

无。

（逐条核对结论：）
- **死代码**：两文件无未使用导入、无未读变量、无残留 ref；`TIME_RANGE_CHARTS` 三处使用（守卫、`hasTimeRange`）；hook 返回字段均被视图消费。
- **冗余守卫**：effect 三个早退条件各自有效——`!TIME_RANGE_CHARTS.has(chartId)`（`BRANCH_GRAPH` 无范围）、`chartTimeRange`（已初始化/用户选择）、`!activeWorkspaceTab`（tab 可为 `''`，见 `browserCleanupActions.ts:49` 的 `?? ''`），写空 key 会污染持久化。无「根因修复后多余的防御」。
- **诊断日志**：两文件无 `console.*` / debug 日志残留。
- **注释与实现**：`useChartData.ts:36-39` 三句逐句可证——写入前提与早退条件一致；写入同步使 `chartTimeRange` 成立故不可循环；`stable_workspace_id`（`crates/workspace/src/detect.rs:155-162`）按规范化路径哈希生成 id，故「removed and re-added with the same path hash → initialized again」成立；注释不含 `comment-claims.mjs` 的 `CLAIM_PATTERN`（`always|never|unreachable|…`）词，不触发注释断言门禁。
- **测试有效性（删除性推演）**：恢复 `initializedRef` 布尔守卫 → 用例 3（`useChartData.test.tsx:75`）在 clear 后 `timeRange` 为 `undefined`，`toEqual(defaultTimeRange())` 变红；恢复 workspace 守卫同理。用例从公共入口（`useChartData` + 公共 store action）进入，未借助 `as unknown as`/私有字段。

## 记录不修

- `useChartData.ts:35` `const timeRange = chartTimeRange;` 为单次使用的冗余别名（预存上下文行，非本轮引入），可直接返回 `chartTimeRange`。
- `useChartData.test.tsx:64` 用例标题与 `:70-71` 注释写「re-appears / 移除后重新添加」，实际只执行 `clearWorkspaceGitVisData` 未做「切走→clear→切回」。断言对实际路径仍具删除性保护力（rev2 已记录）；若要 100% 复刻生产时序可补两步，非必需。
- `useChartData.test.tsx:17` reset helper 复位 `gitVisStale` 等 hook 不读取的字段；属「整切片归零」，无害，可保留。
- `useChartData.ts:36-39` 4 行收敛性注释偏长，但内容是防止后人重新加回 ref 守卫的非显然不变量，逐句成立，建议保留。
- 未覆盖 `activeWorkspaceTab === ''` 的持久化形态（rev2 已记录，逻辑与「未解析非空 id」等价）。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题
