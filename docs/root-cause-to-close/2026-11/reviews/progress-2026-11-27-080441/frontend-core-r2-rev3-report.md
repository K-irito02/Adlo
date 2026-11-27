# frontend-core R2 确认审查报告 — rev3

## 范围

- 只读复核 rev3 快照（base `49f76551`，仅 `-rev3.diff`）中归属 `frontend-core` 的 17 个文件；其他 scope 仅作只读上下文，不产出 finding。
- 未运行 `git diff/log/show`、未跑测试套件、未启动 dev server / 浏览器；无端口占用、无后台进程。
- 以文件哈希逐项比对 rev2 与 rev3 快照：本 scope 仅 `browserDownloadsSlice.ts` 与其测试 `browserDownloadsSlice.test.ts` 两个文件在 rev3 发生变化；其余 15 个文件 rev2/rev3 快照逐字节相同。
- 规约：`review-brief.md` §5 强制项、§6 报告契约、§复审收敛（rev≥2 主表只收「上轮主表未关闭」与「本次修复引入的回归/契约错误」，更早的 pre-existing low 放「记录不修」）。

## 上轮问题关闭情况（逐条）

### R2 rev2 新增 finding（本轮要验证关闭的目标项）

- **`redownloadTimers` 在删除记录/删除文件/清空历史路径未撤销（low，会改变行为，已计入上轮需修复）** — **已关闭**。
  - 共享 helper 已引入：`clearRedownloadTimer(id)`（`browserDownloadsSlice.ts` diff L60–67），`get → clearTimeout → delete` 三步归一。
  - 四个调用点齐全：`redownloadDownload` 设新定时器前先清旧定时器（diff L146）并在 `clearRedownloading` 中清理（L168）；`clearDownloadHistory` 遍历 `[...redownloadTimers.keys()]` 清理全部 pending id（L265–268）；`deleteDownloadFile`（L278）与 `removeDownloadRecord`（L298）各自按 id 清理。
  - 两个 fake-timer 回归用例已补（`browserDownloadsSlice.test.ts` diff L449–466「record is removed mid-prepare」、L468–485「history is cleared mid-prepare」）：均 `void redownloadDownload('d1','tab-1')` → 删除/清空 → `advanceTimersByTimeAsync(15000)` → 断言 `showToast` 未被调用。删除性推演：删掉删除 action 中的 `clearRedownloadTimer` 调用，15s 兜底回调会触发 `get().showToast('重新下载未开始','error')`，`not.toHaveBeenCalled()` 变红 → 用例有效。
  - 既有 15s 超时用例（diff L417–447）仍保留，确认未误伤「记录仍存在时正常 toast」路径。

### R1 五项（rev2 已关闭，rev3 后复核仍关闭，无回归）

1. **DOWNLOAD_ACTIVE 拒绝消息 helper + 注释 + 用例** — **保持关闭**。`ipcRejectionMessage`（slice diff L45–55）保留普通 `{code,message}` 拒绝的 message，catch 使用之（L247）；`DOWNLOAD_ACTIVE` 哨兵注释（L36–42）保留 `Internal error: ` 前缀与 `includes` 口径；plain-object rejection 用例（test diff L550–565）未变。timer 修复未触及这几处。
2. **useBrowserUrlChange.ts 陈旧注释** — **保持关闭**。rev3 快照与 rev2 逐字节相同；同文档下载导航注释（useBrowserUrlChange.ts diff L17–20）仍与实现一致。
3. **TS 死字段 `DownloadMigrationResult.failed` 移除** — **保持关闭**。`shared/ipc/download.ts` rev3 与 rev2 逐字节相同；接口仅 `migrated` / `missing`（download.ts diff L36–42）。
4. **useWebViewLifecycle.test.ts 标题承诺** — **保持关闭**。快照未变；「returns to the source and closes on completion」同时断言 `browserActiveTabId === 'source'` 与 `browserTabs.map(id) === ['source']`（test diff L70–80）。
5. **`DownloadFileState.error` 字段保留** — **保持关闭**。快照未变；`error: string | null` 仍在接口中（download.ts diff L13），消费方在 frontend-ui scope（只读确认，未改动）。

## 新增发现

本轮 rev3 的实际改动仅为「timer 取消 helper + 两个回归用例」，逐行比对确认无新增 Critical/Important 行为破坏、无契约错误、无清理缺口回归。主表无需修复项。

### 记录不修（不进入主表）

- `browserDownloadsSlice.test.ts` diff L468「cancels **all** fallback toasts when history is cleared mid-prepare」只注册了一个 pending id（d1），标题的「all」强于断言覆盖；但 clear-history 路径与「15s 后无 toast」的核心行为已被有效验证，且 §复审收敛要求不追挖不影响行为/事实的测试措辞细节。可选加强：再注册 d2 并同样断言无 toast。
- `useWebViewLifecycle.ts` unmount cleanup effect 的冗余依赖 `hideTabWebView`、`downloadOnlyTabs` 来源 Map 会话级增长、`browser-download-started` 监听里未复用 `clearRedownloadTimer` 的三行内联清理：均为 rev2 已记录的可选项，rev3 未改动，按复审收敛保留。

## 结论

- R2 rev2 的 timer 清理缺口已按约定方式关闭：共享 helper 覆盖 `redownloadDownload` / `removeDownloadRecord` / `deleteDownloadFile` / `clearDownloadHistory`（全 pending id），两个 fake-timer 用例删除修复后均会变红。
- R1 五项在 rev3 后全部保持关闭，timer 修复未引入回归。
- 本轮零问题；无 dev server / 浏览器启动，无残留进程或端口。

- 需修复项：0
