# P4 R2 清理审查报告（rev12）— 前端 / 设置 / 桥接 / 样式

## 范围

- 工作树：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`；只看 `manifest-rev12.md` 的 rev12 完整快照（base `aced53d8`，commits 0，78 文件：72 份 diff + 6 份文档）。文档按 manifest「P5 同步」不审。
- 本 scope（frontend 50 项 + `styles/regions/titlebar.css`）：`app/features/{browser,browser-settings,center,dsh}/**`、`app/stores/**`、`app/components/settings/**`、`app/regions/**`、`app/i18n/**`、`shared/ipc/**`、`shared/settings-reset/**`、`tauri-bridge/**`、`mock/**`、`styles/regions/titlebar.css` 及对应测试。
- 变更面确认（rev11 与 rev12 全部 72 份 diff 逐个 sha256 对比，按文件名归并，无新增/删名；6 份文档按 manifest 未生成 diff，不在对比内）：**72 份快照中仅 1 个文件内容变化** —— 本 scope 的 `app/features/center/CenterEntryPage.tsx`。其余 49 项本 scope 文件哈希与 rev11 完全一致，故新回归只可能来自该文件。
- 只读核对（仅证据）：`stores/actions/dshActions.ts:110-204`（`openDsh({ centerTabId })` 三支路径：`:148-162` `bindToEntryTab`、`:181-188` 已在中心的复用、`:192-196` 新建）、`features/center/__tests__/CenterEntryPage.test.tsx:101-194`（本 scope 测试哈希未变，逐条读断言）、`adlo/scripts/check-source-hygiene.mjs:26`（确认门禁只拒 `[DBG-]`/`[ADL-DEBUG]` 前缀）。
- 方式：只读源码 + 删除性推演 + 定向 `grep`。**未运行** `git diff/log/show`、`check:changed`、vitest、`cargo test`；**未启动** dev server / 浏览器 / headless（未占用任何端口、无后台进程）；未写任何临时文件。无 `claims-ack-rev12.md`。

## 上轮问题关闭情况（逐条）

1. **rev11-F1（`CenterEntryPage.tsx` 的「入口按钮永不灰化禁用…见下 stillLauncher 守卫」注释误挂在 `handleOpenBrowser` 上方，且「见下」方向写反）→ 已关闭（建议修复按原方案执行：整段删除）。**
   - rev12 diff 的唯一新增 hunk 是 `@@ -80,9 +82,6 @@`：删除原 `:85-87` 三行注释，`handleOpenBrowser` 现在直接从 `:85` 的 `const handleOpenBrowser = useCallback(() => {` 开始，与同样无注释的 `handleOpenTerminal`（`:99`）一致。
   - 失效引用消除：`grep '见下|stillLauncher' adlo/frontend/src/app/features/center` 现仅命中 `:34`（`stillLauncher 守卫`）、`:71`/`:74`（实现），文件内再无「见下」指向不存在的守卫。
   - 被删信息无净损失，逐句有归处：
     - 「入口按钮永不灰化禁用（用户明确要求）」→ `:38-40`（`handleOpenDsh` 内「在途复用不灰按钮（用户明确要求：入口按钮永不灰化禁用）」）；
     - 「在途重复点击给 busy 提示」→ `:32-34` + `:39-40`；
     - 「dsh 迟到完成时仅当本标签仍为 launcher 才移除 / 不会误删已转换的标签」→ `:32-34`（措辞改为「不会误删已转换的标签」），且守卫本体在 `:71-76`，方向正确（不再有「见下」）。
   - 该绝对断言（「不会误删已转换的标签」）仍可证：`CenterEntryPage.test.tsx:101-125` 断言新建路径 `centerTabs` 长度保持 1 且 `c1` 转为 browser —— 若守卫误删已转换标签，`:122` 的 `toHaveLength(1)` 与 `:123` 的 `toMatchObject` 会变红；`:150-180` 覆盖仍为 launcher 时必须移除的对照支。删除推演成立，非空断言。

2. **rev11 报告中「保持关闭」的其余各项（settings-profile / browser-tabs-search / dsh-routing / downloads-lifecycle + browser-injection 前端侧、rev10 记录不修项）→ 无退化。**
   - 相关 49 个本 scope 文件 rev11/rev12 快照哈希逐一相同（含 `shared/settings-reset/*`、`BrowserSettings*`、`ResetAllDialog*`、`browserTabsSlice.ts`、`browserDownloadsSlice.ts`、`shared/ipc/*`、`browserPoolSingleton.ts`、`dshAuthUrl.ts`、`dshActions.ts` 与其用例、`CenterEntryPage.test.tsx`、`styles/regions/titlebar.css`）。
   - 本轮唯一变更文件的其他 hunk 与 rev11 逐字相同（头部摘要、`openDsh({ centerTabId })`、`:68-70` stillLauncher 说明），rev11 已逐支核对与 `dshActions.ts:146-197` 一致，本轮复核仍成立：新建 → `bindToEntryTab` 就地转换；复用面板内标签 → 同样就地转换；复用已在中心 → 只 `centerSelectTab`，入口页留 launcher 由组件移除。
   - `CenterEntryPage.tsx` 其余函数未受影响：`handleOpenDsh` 在 `await` 之后仍重读 `getState().centerTabs`（`:71-73`）再决定移除，符合简报 §4.1；`handleOpenBrowser`（`:85-97`）逻辑与 rev11 完全相同，`clampPanelActiveTab` 说明仍与 `centerActions` 规范路径一致。

## 新增发现

无。本轮为单文件三行注释删除，未引入新代码、新注释、新依赖、新导出或无调用方包装；该文件无 `as any`/`as unknown as` 新增、无调试日志、无未使用符号（`centerUpdateTab` / `browserSetLocation` / `clampPanelActiveTab` 均在函数体内被调用）。

## 记录不修

- `stores/slices/browserDownloadsSlice.ts:243-245`、`:262` 两处 `console.info('[ADL-DL] …')` 属成功路径的诊断输出（暂停已完成 / 暂停成功）。判定**不修**：本仓以 debugLogCollector 收集 console 输出为既定调试手段，`[ADL-DL]` 是子系统标签而非临时调试标签，`check-source-hygiene.mjs:26` 的零基线不变量只拒 `[DBG-]`/`[ADL-DEBUG]`；同文件 6 处 warn/error 为失败路径报告，非残留。文件自 rev11 未变，属可选清理，不改变本轮结论。
- `CenterEntryPage.tsx:32-34` 与 `:68-70` 对 stillLauncher 有语义重叠（前者讲按钮不灰化 + 守卫意图，后者讲移除分支的三支机制）：分工不同，且本轮删除 `:85-87` 后已无第三处重复，属可接受表述，不再改。
- 跨 scope 备注（交后端 reviewer，rev11 已记录、本轮未变）：`init_script.js:1252-1253` 的「keep the extension…」略强于 `:1269` 只在扩展名 ≤20 字符时保留；新用例只断言 `.pdf`，标题与断言一致。
- `styles/regions/titlebar.css` 与 rev11 哈希一致（本轮无 CSS 变更）；rev9 起的「亮暗两套 `getComputedStyle` 证据」仍待主代理用 `node adlo/scripts/ui-probe.mjs` 采集，本报告只确认选择器/数值文本存在。
- 浏览器模式下池永不被填充导致中心非活动浏览器标签变暗（`useWebViewLifecycle.ts:149-151` 与 `BrowserPanel.tsx:494-504` 同口径）：预存行为、文件哈希未变，仍需主代理真实渲染确认可接受。
- 文档类（P5）：`GLOSSARY.md` 新增词「共享浏览配置文件 / browsing profile」登记与 `_Avoid_` 裁定、ADR 0001 修订、progress 事实同步，均按 manifest 交 P5。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
- rev11 唯一 low 已真正关闭：误挂注释整段删除，「见下」反向引用消失，被删信息在 `:32-34` / `:38-40` 有等价归处；`handleOpenBrowser` 现无残留注释。
- 72 份快照中仅 `CenterEntryPage.tsx` 一个文件变化，且仅删除 3 行注释；无新增断言需 `claims-ack`，未发现新回归、未发现清理项遗漏。
