# R2 定向复核报告 — scope C（rev8，仅 rev7 两条 low）

## 范围

- 快照：`.review-diffs/*-rev8.diff`（`manifest-rev8.md`，base `b96a5747`），只看 rev8。
- 本轮实际复核的两处改动：
  - `adlo/frontend/src/app/stores/slices/browserTabsSlice.ts`：`browserOpenNewWindowTab` 删除 `browserOpenTab` 之后的 `if (!newTabId) return;`。
  - `adlo/frontend/src/app/stores/slices/__tests__/browserOpenNewWindowTab.test.ts`：下载新窗口用例标题改为「…so the lifecycle is told not to suppress it」。
- 未跑测试/门禁（读实现 + 删除性推演即可判定）；未启动 dev server/浏览器，无端口、无后台进程；未改源码，只写本报告。

## 上轮问题关闭情况（逐条）

- **F1（low，死代码：不可达 `if (!newTabId) return;`）→ 已关闭。**
  - `browserTabsSlice.ts:160-165` 现为 `state.browserOpenTab(url); const newTabId = get().browserActiveTabId; if (host === 'center') centerShowBrowserTab(newTabId); browserMarkTabFresh(newTabId);`，守卫段已整段删除，无残留注释/空行异常（`:158-159` 的同步说明仍与实际调用顺序相符）。
  - 无新问题：`browserActiveTabId` 类型为 `string`，`centerShowBrowserTab` / `browserMarkTabFresh` 均收 `string`，删守卫不需要非空断言，也不触发 TS 收窄问题；`newTabId` 仍被两处使用，无未使用变量。
  - 空值路径：`if (!url) return`（`:153`）已挡住空 URL；`browserOpenTab`（`:70-135`）恒 `set({ browserActiveTabId: tab.id })` 且 `id=createUiId('browser')`，故 `newTabId` 必非空。即使外部强改成空串，`centerShowBrowserTab('')` 因 `browserTabsById['']` 不存在直接 return、`browserMarkTabFresh('')` 只登记一个无标签对应的 id，不会崩、不会误命中——与删除前行为等价（删除前也只是提前 return）。
- **F2（low，失效文案：用例标题超额承诺 WebView 创建）→ 已关闭。**
  - `browserOpenNewWindowTab.test.ts:76` 标题现为「marks a center download-URL tab fresh so the lifecycle is told not to suppress it」；`:83-96` 断言 = `location === 'center'` + `browserFreshTabIds.has(id)` + `consumeFreshAndDecideWebViewCreation(...)` 返回 `{isFresh:true, suppressDownload:false}`。「told not to suppress」与「断言决策值」逐句对应，不再承诺 hook 内真的调用 `createWebViewForTab`（该创建断言在 `useWebViewLifecycle.test.ts`，互不重复）。
  - 无新问题：用例主体、断言、reset 均未动，删除性推演不变（删 `browserMarkTabFresh` → `:92` 红；策略返回值改成 `suppressDownload:true` → `:93-96` 红）。

## 新增发现

无。两项均为定点删除/改文案，未触碰其他代码路径；rev7 报告中「记录不修」各项状态未变化。

## 记录不修

- 删除守卫后，「`browserOpenTab` 同步切活动」这一假设少了一层兜底（此前空 id 会静默跳过，现会以 `''` 走 `centerShowBrowserTab`/`browserMarkTabFresh`）。该假设本身是 rev2 已记录的设计脆弱点，且空 id 在现有实现下不可达、无用户可见后果；若将来 `browserOpenTab` 语义改成「不自动激活」，应按 rev2 建议改为由 `browserOpenTab` 返回新 id，而不是恢复该守卫。
- rev7 报告列出的其余记录项（`tabs.find` 兜底 / `Object.hasOwn`、`NewWindowTabHost` 与 `TabLocation` 重复、mock/preview 内联载荷类型、fresh 关闭不清、clamp 持久化、双端 handleEngineSelected 形态重复、冗余 mock、空 URL 双层守卫）本轮未变，理由沿用。

## 结论

- 需修复项：0（本轮零问题）
