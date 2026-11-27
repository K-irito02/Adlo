# frontend-ui — R1 定向确认 / rev2 报告

## 范围

- owner scope：`frontend-ui`（11 个文件，见 `manifest-rev2.md` §Scope ownership）
- 快照：仅 `.review-diffs/*-rev2.diff`（未复用 rev1、未看增量 diff；未运行 `git diff/log/show`，未运行测试套件，未修改源码/配置）
- 定向复核对象：rev1 frontend-ui 主表 F1/F2 与 `r1-fix-report.md` item 7 的第 1 点（error tooltip），即三项上轮 finding
- 只读上下文（非本 scope，不产出 finding）：`browserDownloadsSlice.ts`、`useBrowserDownloads.ts`、`BrowserToolbar.tsx`、`i18n/{en-US,zh-CN}/browser.ts`
- 工具选择：本轮未启动 dev server / 浏览器 / headless Chrome，无端口占用需关闭；无临时脚本落盘。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

1. **冷打开不刷新文件状态（rev1 F1 / 修复报告 item 3）— 已关闭**。
   - `BrowserDownloadMenu.tsx:33` 新增 `initialFetchDone` state；effect A（`:124-131`）挂载时 `void fetchDownloads().finally(...)`，仅在 `alive` 为真时 `setInitialFetchDone(true)`，cleanup 将 `alive=false`，卸载后不写 state（卸载守卫在位）。effect B（`:136-145`）依赖仅 `[initialFetchDone]`，为 false 时直接返回；为 true 时从 hook 闭包读**当次渲染**的 `downloads`，`ids` 非空才 `void refreshDownloadFileStates(ids)`（`:142`）。两 effect 各带 `eslint-disable-next-line react-hooks/exhaustive-deps`。`fetchDownloads` 落定（含 `.finally`）晚于 store 内 `set({ downloads })`（核 `browserDownloadsSlice.ts:151-163`，且内部已 catch 不 reject，无未处理拒绝），`setInitialFetchDone` 触发的重渲染一定能拿到新 `downloads`；即使 store 更新与 state 更新分两批，effect B 也只会在 `initialFetchDone=true` 的那次渲染取到新值。
   - 冷打开用例 `__tests__/BrowserDownloadMenu.test.tsx:165-188`：store 初始 `downloads=[]`，`fetchDownloads` mock 先 `downloads.push(record)` 再 resolve，断言 `refreshDownloadFileStates` 收到 `['cold-1']` 且仅调用一次；删除 effect B 或 effect A 均会变红。warm path 用例（`:143-163`）保留，预置 `downloads:[record]`，首条断言改为 `await waitFor(...)` 消除 flush 竞争，断言 refresh 收到 `['dl-1']`。卸载守卫代码正确（无专门用例，但契约仅要求检查存在性，已满足）。

2. **`role="switch"` 可访问名随状态变化（rev1 F2 / 修复报告 item 4）— 已关闭**。
   - `BrowserDownloadMenu.tsx:228` 新增恒定 `aria-label={t.browserDownloadSettingsMode}`；`aria-checked={autoSave}`（`:227`）仍为唯一状态来源，动态 `title`（`:229`）退化为悬浮提示，`aria-label` 在可访问名计算中优先于 `title`。键 `browserDownloadSettingsMode` 在 `i18n/en-US/browser.ts:291`（`Download mode`）与 `zh-CN/browser.ts:279`（`下载模式`）均存在，值不随模式变化。
   - 用例 `__tests__/BrowserDownloadMenu.test.tsx:190-210`：遍历 `auto`/`ask` 两种模式，均断言 `aria-label === mockT.browserDownloadSettingsMode`，并断言 `aria-checked` 分别为 `true`/`false`（`getByRole('switch', { hidden: true })` 适配 rAF 前的 `visibility:hidden`）。两种模式断言同一恒定名，删除 `aria-label` 即变红。

3. **`DownloadFileState.error` 无读取方（rev1 记录不修第 1 条 / 修复报告 item 7 第 1 点）— 已关闭**。
   - `BrowserDownloadItem.tsx:262` 状态 span 新增 `title={isMissing && fileState?.error ? fileState.error : undefined}`。`isMissing = isCompleted && fileState != null && !fileState.exists`（`:39`），因此只有「已完成且文件缺失」行、且 `error` 为非空字符串时才挂 title；其它状态（`in_progress`/`paused`/`canceled`/文件存在/无 fileState/空 error）均得到 `undefined`，不出现 tooltip。满足「tooltip 只在缺失且错误非空时出现」。
   - 用例 `__tests__/BrowserDownloadItem.test.tsx` `shows the file-state error as a tooltip on a missing row`：缺失行 `error:'Access denied'`，断言 `getByText(mockT.browserDownloadMissingFile)` 带 `title='Access denied'`；删除 `title` 即变红。

## 新增发现

本轮 rev2 diff 中，未发现由上述三项修复引入的 Critical/Important 回归或契约错误：

- `initialFetchDone` 方案未破坏既有 warm path：effect B 虽依赖数组省略 `downloads`，但原实现（`[]` 依赖、渲染快照）本就不随后续 `downloads` 变化刷新，新实现没有倒退；新记录/进行中项的文件状态由 `useBrowserDownloads.ts:44,62` 的事件路径经 `getState().refreshDownloadFileStates` 覆盖，属 frontend-core scope。
- `useDownloadItemActions(tabId?)` 新签名向后兼容：`BrowserDownloadItem.tsx:28` 仍以无参调用，仅取 `handleOpenFile`；生产侧 `BrowserDownloadContextMenu` 仅一处调用（`BrowserDownloadMenu.tsx:295`）且已传 `onRedownload`。`redownloadDownload(id, tabId?)` 与 store 签名（`browserDownloadsSlice.ts:108`、`187`）一致。`activeTab?.id` 在 `BrowserToolbar.tsx` 中确实存在（`:35,191`）。
- 注释与实现一致：新增两处 effect 注释（「只在挂载时触发」「拉取完成后从 hook 读当时的 downloads」）与代码逐句相符，无绝对断言漂移；i18n 新增/复用键在 en-US、zh-CN 均存在，无硬编码展示文本。
- CSS 本轮 diff 未变（`BrowserDownloadMenu.css` rev2 与 rev1 相同），`var(--…)` token 口径未改；rev1 已记 UI 计算样式证据由主代理统一采集，本子代理不重复。

## 结论

- rev1 frontend-ui 主表 F1（medium）、F2（low）及 item 7 的 error 读取点第 3 项均已关闭；三项修复的回归用例具备删除性防护。
- 本轮零问题，无新增 Critical/Important 发现。
- 记录不修（不进入主表，供主代理转写进度文件）：
  - error tooltip 无负向用例（不覆盖「非空错误但文件存在」/「空 error」时无 title）；当前 `isMissing && fileState?.error` 条件已正确守卫，不作为需修复项。
  - rev1 已记录的更早已存在 low（`role="listitem"` 行无 `tabIndex`/键盘处理等）按简报 §复审收敛留在历史记录，不在 rev2 主表重报。
  - CSS 计算样式证据仍待主代理用 `ui-probe.mjs` 采集（亮/暗两套），本轮 diff 未改 CSS，不构成新 finding。

- 需修复项：0
