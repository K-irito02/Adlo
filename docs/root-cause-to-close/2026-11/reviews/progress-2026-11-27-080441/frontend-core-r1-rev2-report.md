# frontend-core R1 确认复核报告 — rev2

## 范围

- 只读复核本轮 rev2 快照（base `49f76551`，仅 `-rev2.diff`）中归属 `frontend-core` 的 17 个文件；其他 scope 仅作只读上下文，不产出 finding。
- 未运行测试套件（按简报 §1 用删除性推演 + 读实现判定），未启动 dev server / 浏览器，无端口占用、无后台进程。
- 规约来源：`review-brief.md`、`review-judgements.md`、`adlo/AGENTS.md`；需求真源：`r1-fix-report.md`、本 scope rev1 报告。
- 上下文交叉阅读（不作为本 scope finding）：`settings-i18n-tests` 的 `downloadPathReset.ts`（确认消费方 `includes` 生效，使 plain-object 用例有效）、`frontend-ui` 的 `BrowserDownloadItem.tsx`（确认 tooltip 修复落地）。

## 上轮问题关闭情况（逐条）

1. **F1 `DOWNLOAD_ACTIVE` 哨兵在真实 Tauri rejection 链路上失效（medium）** — **已关闭**。
   - `browserDownloadsSlice.ts` 新增窄助手 `ipcRejectionMessage(e: unknown)`（`Error` → `.message`；普通对象且 `message` 为字符串 → 原样保留；否则 `String(e)`），无 `as any` / `as unknown as`（diff L45–55）。
   - `changeDownloadPath` 的 catch 改用 `ipcRejectionMessage(e)`（diff L247），不再用会丢掉 message 的旧归一化。
   - `DOWNLOAD_ACTIVE` 注释已写明真实 message 带 `Internal error: ` 前缀、调用方须用 `includes` 匹配（diff L36–42）。
   - plain-object rejection 用例已存在：`browserDownloadsSlice.test.ts` 的 `preserves a plain-object rejection message and maps the prefixed sentinel`（diff L512–527），`mockPathChange(Promise.reject({ code: 'Internal', message }))` 走真实 rejection 分支，断言 `result.error.message === message` 且 `downloadResetFailureCopy(zhCN, 'downloadPath', result.error, true)` 映射到 `storageDownloadMigrateBlockedActive`。删除性推演：回退助手会得到 `[object Object]`，首条断言变红 → 用例有效。
   - 消费方 `includes` 改动属 settings scope，只读确认 `downloadPathReset.ts:58` 用 `.includes(DOWNLOAD_ACTIVE)`，用例端到端成立；不在本 scope 报告。

2. **F2 `useBrowserUrlChange.ts` 陈旧注释（low）** — **已关闭**。新注释改为「同文档下载导航（window.open 下载 URL / 重新下载 → window.location.assign）不会提交新文档…」（diff L17–19），不再声称 `target=_blank -> window.location.assign`，与隐藏 iframe 方案一致。

3. **F3 TS 死字段 `DownloadMigrationResult.failed`（low）** — **已关闭**。`shared/ipc/download.ts` 的 `DownloadMigrationResult` 现仅含 `migrated` / `missing`（diff L36–42），`failed` 已从 TS 移除；Rust 结构保持不变。全 frontend grep 未发现 `DownloadMigrationResult.failed` 悬空引用，相关 8 个测试对象字面量（storage-settings / settings-reset / components/settings）已无 `failed:`，TYPE 面无新错误。

4. **F4 `useWebViewLifecycle.test.ts:106` 标题承诺未断言（low）** — **已关闭**。标题缩短为 `returns to the source and closes on completion`（diff L40）；断言覆盖 `browserActiveTabId === 'source'` 与完成后 `browserTabs` 仅剩 `['source']`（diff L70–80），标题承诺的行为均有会变红的断言。

5. **F5 `DownloadFileState.error` 读取方（low）** — **已关闭**。字段保留于 `shared/ipc/download.ts`（`error: string | null`，diff L13）；读取方 tooltip 修复落在 `BrowserDownloadItem.tsx:120`（`title={isMissing && fileState?.error ? fileState.error : undefined}`，frontend-ui scope，仅作上下文确认，不报告）。

## 新增发现

无。逐份阅读本 scope 全部 `-rev2.diff`，本轮五项修复未引入新的 Critical / Important 正确性、设计或契约回归；`changeDownloadPath` 重构中 `result` 在所有分支均有赋值，失败回读经 `fetchDownloads` / `refreshDownloadFileStates` 自带 try/catch 不会崩溃。

### 记录不修（不进入主表，按简报 §复审收敛保留更早 pre-existing low）

- `downloadOnlyTabs.ts:44-52`：`downloadSourceByTab` 仅对进入 `downloadOnlyTabs` 的条目清理，普通页面标签来源条目会话内不回收；可选优化，不改变行为。
- `useWebViewLifecycle.ts:496`：卸载 cleanup effect 依赖数组新增 `hideTabWebView`，但 effect 体内仍内联 `setTabBounds`、未使用该回调；冗余依赖，无实际重跑。
- 浏览器（非 Tauri）模式下 `download_file_states` / `download_redownload*` 未接入 mock/preview bridge；两处均 try/catch 兜底、桌面为主，属双端现状。
- 进度文件 / 设计文档与实现的潜在措辞漂移属 `docs/**`，按简报 §2 留 P5 同步。

## 结论

- 上轮 5 项 finding（F1–F5）全部关闭；本轮无新增 Critical / Important 发现。
- 主表空，收敛为「本轮零问题」。

- 需修复项：0
