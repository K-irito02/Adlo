# frontend-ui — R2 CLEANUP / rev2 报告

## 范围

- owner scope：`frontend-ui`（11 个文件，见 `manifest-rev2.md` §Scope ownership）
- 快照：仅 `.review-diffs/*-rev2.diff`；未复用 rev1、未看增量 diff、未运行 `git diff/log/show`、未运行测试套件、未修改源码/配置
- 聚焦：死代码、冗余守卫、根因修复后失效的防御性检查、诊断/临时日志（`[DBG-` 前缀 / console 调试输出）、未使用 CSS 类或 import
- 只读上下文：`frontend-ui-r1-rev1-report.md`、`frontend-ui-r1-rev2-report.md`；其他 scope 仅作上下文，不产出 finding
- 未启动 dev server / 浏览器 / headless Chrome，无端口占用需关闭；无临时脚本落盘

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

1. **rev1 F1 冷打开不刷新文件状态（medium）— 已关闭**。rev2 R1 定向确认已验证 `initialFetchDone` 双 effect + `alive` 卸载守卫 + 冷打开回归用例（删除任一 effect 即变红）。本轮 cleanup 复核：该修复未引入死代码或失效的防御性检查；`if (!initialFetchDone) return` 与 `if (ids.length > 0)` 是修复本身的必要分支，不是历史残留。
2. **rev1 F2 `role="switch"` 可访问名随状态变化（low）— 已关闭**。恒定 `aria-label={t.browserDownloadSettingsMode}` 在位，`aria-checked` 仍为唯一状态来源。本轮未发现遗留的动态可访问名或重复守卫。
3. **`DownloadFileState.error` 无读取方（rev1 记录不修第 1 条 / 修复报告 item 7）— 已关闭**。`BrowserDownloadItem.tsx` 状态 span 的 `title={isMissing && fileState?.error ? fileState.error : undefined}` 守卫正确，非缺失/空 error 均得到 `undefined`；无冗余。

## 新增发现

逐文件扫描 11 个 rev2 diff（Button / ContextMenu / Item / Menu.css / Menu.tsx / Toolbar / 4 个测试 / useDownloadItemActions）：

- **诊断/临时日志：0**。本 scope 内无 `[DBG-` 前缀、无 `console.debug/log`、无 `debugger`。全仓 rev2 diff 中仅有 frontend-core 的 `console.warn`（`[browser]`、`[useWebViewLifecycle]`），属其他 scope 的合法生产告警，不产出 finding。
- **死代码引入：0，且本轮做的是反向清理**。`BrowserDownloadMenu.tsx` 删除了 `activeDownloads`/`pausedDownloads`/`failedDownloads`/`completedDownloads`/`canceledDownloads` 五个 memo 与 `DownloadGroup` 组件；`BrowserDownloadMenu.css` 同步删除 `.adl-download-menu__group` / `__group-label`。无残留引用（测试中仅保留 `.adl-download-menu__group-label` 的「不存在」负向断言，属回归防护，非死代码）。
- **新增 CSS 类全部有消费方**：`.adl-download-item--missing`、`.adl-download-item__location-badge`、`.adl-download-item__status-spinner` 均在 `BrowserDownloadItem.tsx` 使用；`@keyframes adl-download-spin` 被 spinner 引用；`display:inline-flex/gap` 与 spinner 对齐一致。
- **新增 import 全部使用**：`IconRefreshCw`/`DownloadFileState`（ContextMenu）、`IconLoader`/`DownloadFileState`（Item）、`useTCopy`/`redownloadDownload`/`showToast`（useDownloadItemActions）、测试内 `DownloadFileState`/`fireEvent`/`act` 均有引用。无未使用 import。
- **防御性/冗余守卫复核**：`handleClick` 的 `redownloading || isMissing`、`showOpenActions`/`showDeleteFile` 的 `!isMissingCompleted`、`handleRedownload` 的 `try/catch` 均为必要业务分支或 IPC 系统边界处理（`ok:false` 不抛、throw 才走 catch，二者互斥不双提示），不是根因修复后失效的遗留检查。
- **注释与实现一致**：新增三处注释（「只在挂载时触发」「从 hook 读取当时的 downloads」「Status text is rendered in the meta row」）与最终代码逐句相符，无绝对断言漂移；无硬编码展示文本；新增 i18n 键在 en-US/zh-CN 均存在（键细节属 settings-i18n-tests scope，本轮不复核）。

### 记录不修（可选/nit，不进入主表）

- `BrowserDownloadContextMenu.tsx:50` `const showCopyLink = isHttp;` 为单次使用的同值别名，纯风格，可内联但不改变行为。
- `BrowserDownloadMenu.tsx` effect A 的 `alive` 卸载守卫在 React 18 下可省略，但属常见防御模式且已在 rev2 R1 定向确认中认可，本轮按「不重算已关闭项」不重报。
- `BrowserDownloadMenu.test.tsx` `mockT` 中 `browserDownloadActive`、`browserDownloadCompleted` 在扁平列表改造后无消费方，属测试冗余数据；不影响任何断言，留待后续清理。
- `useDownloadItemActions.ts` 的 `catch` 双 toast 路径经删除性推演确认互斥（`ok:false` 在 `if` 内出 toast 且不抛；仅异常走 `catch`），非冗余守卫，属合法错误边界处理。

## 结论

- 上轮 3 项（F1 / F2 / error tooltip）均已关闭；本轮未发现由修复引入的回归、死代码、冗余守卫或诊断日志残留。
- 本轮零问题，无新增 Critical/Important/ Low 需修复项；记录不修项均为纯风格/可选优化，不改变行为或事实。

- 需修复项：0
