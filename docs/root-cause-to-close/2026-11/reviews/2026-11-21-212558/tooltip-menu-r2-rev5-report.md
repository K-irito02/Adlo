# R2 复审报告 — scope: tooltip-menu / rev5

## 范围

- 快照：`.review-diffs/*-rev5.diff`（base `b96a5747f`，manifest rev5，14 commits / 81 files）。
- 本 scope 文件：`app/utils/tooltipPosition.ts`、`tooltipPosition.test.ts`、`styles/regions/rightpanel/file-operations.css`、`file-tree-browser.css`、`styles/menu-disabled-state.test.ts`、`styles/loading-row.test.ts`、`styles/sticky-workspace-headers.test.ts`、`styles/testing/cssRules.ts`、`styles/components/loading-row.css`。
- rev5 增量定位：对比 rev4/rev5 快照哈希，本 scope 仅 `loading-row.test.ts` 变化（其余 8 个文件字节一致；`loading-row.css` 两轮均无 diff）。新增的 3 个文件（`BrowserCategorySection*`、`browser-webview.css`）与改动文件（`useBrowserFolderReorder`、`gitFileOpsActions`、`errorToastSlice`、`StoreState`、`button-semantic-standard.test.ts`）均属其它 scope。
- 只读：未运行 `git diff/log/show`，未改源码/配置，未运行任何测试（删除性推演），未启动 dev server / 浏览器，无占用端口。

## 上轮问题关闭情况

1. **rev4 F1（`loading-row.test.ts` 的「唯一失败模式」绝对断言）— 已关闭**
   - `loading-row.test.ts:13` 改为「设置面板这条的失败模式是静默的」，作用域限定到设置面板用例（`:20-32`），与 `:42-51`、`:53-68` 另外两条静默退化不再冲突；全文已无「唯一」。
   - 同轮把 `:25`「任一丢失」软化为「渐变本体与尺寸丢失」：删 `linear-gradient` → 文本透明；删 `background-size: 300% 100%` → 图像尺寸等于定位区，`background-position` 百分比位移归零 → 扫光静止，仍属「透明/静态」范畴，断言与描述一致。
2. **R1-F1 / F2 / F3 / F4 — 保持已关闭**
   - `file-operations.css:309-323`（同文件同特异性、媒体块在后）与 `loading-row.test.ts:53-68` 未动，删除媒体块/选择器/声明仍会变红；
   - `cssRules.ts:61-83` 仍是唯一 `exactRuleBody`，两个测试文件无自复制；
   - 禁用态两份 CSS 仍为 `opacity: .4 / cursor: default / pointer-events: none`，锁具体值；
   - `tooltipPosition.ts:446-451` 仍无 `coversTrigger(snug)`，`coversTrigger` 仅服务 `cleared` 守卫。
3. **rev4 的其余「记录不修」项未变化**（死分支、冗余守卫、重复规则、锁顺序等均与 rev4 相同，无需重新升级）。

## 新增发现

无。rev5 本 scope 仅注释软化，未改动实现、断言或选择器；未发现新的死代码、冗余守卫、诊断日志或残留绝对断言。

## 记录不修（可选 / 预存，沿用 rev4）

- `loading-row.test.ts:54-55`「回退必须写在同一文件同特异性位置才能胜出」与 `file-operations.css:313-314`「必须在这里同特异性覆盖」属放置理由；严格说更晚文件或更高特异性同样能胜出，若追求字面严谨可改写为「当前实现选择同文件、同特异性、更靠后」。按设计理由保留。
- `tooltipPosition.ts:276` 的既有「唯一」已复核仍成立：snug 在 `slideCrossAxis` 之前执行，能收紧时已提前返回，走到滑移时贴边滑移才是仅剩的保侧解；`:489`「一律」与 `if (!mainAxisFits) clampMainAxis` 对每个 trial 都执行一致。
- `tooltipPosition.ts:366` 的 `size` 三元 width 分支、`:66-69`/`:404-406` 的 `right/left` 分支运行期不可达（`isHorizontalPlacement` 为布尔函数所致），可选重构。
- `:hover:not(:disabled)` 与 `pointer-events: none` 双保险（用户决策）；两份 CSS 的同值 `:disabled`（后者级联覆盖前者，预存基础规则本就两处定义）。
- `loading-row.test.ts` 未锁媒体块相对位置；`exactRuleBody` 的既有边界（选择器列表、at-rule 首条、注释含 `{`）当前调用点无影响。
- 预存 `workspace-settings.test.ts` / `file-tree-lines.test.ts` 的解析器副本；`composer-core.css` 改动属按钮 scope；文档项留 P5。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0；本轮零问题）
