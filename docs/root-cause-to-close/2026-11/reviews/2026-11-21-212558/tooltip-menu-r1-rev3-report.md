# R1 定向复核报告 — scope: tooltip-menu / rev3

## 范围

- 快照：`.review-diffs/*-rev3.diff`（base `b96a5747f`，manifest rev3，12 commits / 78 files）。
  - 本轮确认：`adlo/frontend/src/app/utils/tooltipPosition.ts`、`tooltipPosition.test.ts`、`styles/regions/rightpanel/file-operations.css`、`file-tree-browser.css`、`styles/menu-disabled-state.test.ts`，以及修复相关 `styles/testing/cssRules.ts`、`styles/loading-row.test.ts`、`styles/sticky-workspace-headers.test.ts`。
- 对照上下文（非本轮改动）：`styles/index.css`、`styles/components.css`、`styles/components/loading-row.css`、`styles/regions/rightpanel.css`、`styles/regions/rightpanel/files-panel.css`、`styles/regions/context-menu.css`、`app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx`。
- 只读：未运行 `git diff/log/show`，未改源码/配置，未运行任何测试（均为删除性/级联推演），未启动 dev server / 浏览器，无占用端口。
- `allTreeExpanded` 不属本 scope，未复核。

## 上轮问题关闭情况

1. **R1-F1（reduced-motion 下 busy 扫光不可见）— 已关闭**
   - `file-operations.css:309-311` 的 `color: transparent` 与新增 `:315-323` 的 `@media (prefers-reduced-motion: reduce)` 同处一个文件、同选择器 `.adl-multitree-entry__busy.adl-loading-row__text--shimmer`（同为 0-2-0），媒体块在其后 → 同特异性下后者胜，`color: var(--text-muted)` / `animation: none` / `background: none` / `background-clip: unset` 全部生效；`loading-row.css` 已不含 busy 选择器（rev3 manifest 也不再列该文件），不存在跨文件顺序问题。
   - 级联复核：全树仅 `file-operations.css:301-323` 定义 `__busy`，无更晚文件覆盖；`color` 也压过 `.adl-multitree-entry__busy { color: var(--text-secondary) }`（0-1-0），reduced-motion 下文本可见。
   - 样式锁：`loading-row.test.ts:53-68` 明确读 `file-operations.css`，取 `@media (prefers-reduced-motion)` 内该规则并断言三条声明。删除性推演：删整个媒体块 → `mediaBody` 为 null 变红；删选择器 → 内层 `ruleBody` 为 null 变红；删 `color: var(--text-muted)`/`background: none`/`animation: none` → `toContain` 变红。锁与实现相符。
   - 注释与实现一致：`file-operations.css:313-314`「本文件选择器比 loading-row.css 的通用回退更晚加载，必须在这里同特异性覆盖」与实际源码顺序（`index.css:19` components → `index.css:29` rightpanel → files-panel → file-operations）相符。
2. **R1-F2（样式锁自复制 `ruleBody`）— 已关闭**
   - `cssRules.ts:61-83` 的 `exactRuleBody(css, selector)` 仍是唯一实现，构建在 `findRuleGroups` 上；`menu-disabled-state.test.ts:4,20,29,32` 与 `sticky-workspace-headers.test.ts:4,36` 均引用共享实现，两文件无本地 `ruleBody`/`exactRuleBody` 副本（`grep "function (exactRuleBody|ruleBody|findRuleGroups)"` 仅命中 `cssRules.ts` 与两处预存旧副本，均不在本轮范围）。
   - 注释剥离：前缀剥离后做全等比较，可正确处理「规则前有注释」；`findRuleGroups` 跳过注释内命中，因此 `button-semantic-standard.test.ts:44-47` 依赖的负向断言不会被 `composer-core.css:158` 注释里的选择器误判。当前四处调用点均为单选择器顶层规则，无误匹配。
3. **R1-F3（禁用态与目录/文件菜单一致）— 已关闭**
   - `file-operations.css:165-169`、`file-tree-browser.css:310-314` 为 `opacity: 0.4; cursor: default; pointer-events: none`，与 `context-menu.css:64-68` 逐值一致；粘贴项仍是 `<button disabled={!hasClipboard}>`（`WorkspaceFileTreeEntry.tsx:404`），`:disabled` 命中。
   - 测试：`menu-disabled-state.test.ts:19-25` 锁定三个具体值，`:27-33` 锁定 `:hover:not(:disabled)` 且裸 `:hover` 必须不存在；改值（如 0.5）、删声明、去掉守卫均会变红。`pointer-events: none` 的副作用复核与 R2 相同：点击落到菜单容器（`menuRef` 祖先、有不透明底），不穿透、不误关菜单。
4. **R1-F4（snug 死分支）— 已关闭**
   - `tooltipPosition.ts:446-451` 已删 `coversTrigger(snug)`，直接 `return snug`，注释说明由 `staysOnPreferredSide` 保证不越按钮；`coversTrigger` 仍被 `:467` 的 `cleared` 守卫使用，无死代码。
   - 行为不变：`staysOnPreferredSide`（`:399-409`）对 bottom/top 已保证主轴不越过触发器，原判断恒真；`tooltipPosition.test.ts` 未改动（blob `396f98107` 与 rev2 一致），两条 snug 用例的推演结论不变。
5. **R2 新增的两项（本 scope）— 已关闭**
   - 悬空注释：`sticky-workspace-headers.test.ts:32-36` 现在只有 `HEADER_SELECTOR`、空行与 `describe(...)`，指向已删函数的文档注释随函数一并删除。
   - reduced-motion 顺序问题：见第 1 条，回退已移入 `file-operations.css` 且位于透明声明之后。

## 新增发现

无。本轮 rev3 对上述文件的改动只包含这两处修复，未发现新的正确性、测试有效性或注释漂移问题。

## 记录不修（可选，无本轮影响）

- `loading-row.test.ts:53-68` 只断言回退规则存在于 `file-operations.css`，未锁定「媒体块必须位于 `color: transparent` 规则之后」。当前顺序正确；若日后把媒体块上移会静默退化。可选加强：`expect(fileOpsCss.indexOf('@media (prefers-reduced-motion')).toBeGreaterThan(fileOpsCss.indexOf(busy))`。
- `exactRuleBody` 的既有边界（选择器列表单项、at-rule 内首条规则、两规则间注释含 `{` 时返回 null）与 R2 记录一致，当前调用点无影响，建议后续在 helper 注释中点名。
- 预存：`workspace-settings.test.ts:21` 的朴素 `ruleBody`、`file-tree-lines.test.ts:25` 的 `findRuleGroups` 副本仍存在（不在本轮 diff），可留 P6 收敛。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0；本轮零问题）
