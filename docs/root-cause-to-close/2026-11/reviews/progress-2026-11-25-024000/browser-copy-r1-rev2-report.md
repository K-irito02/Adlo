# browser-copy — R1 / rev2 复审报告（定向复核）

## 范围

- rev：2（定向复核），scope：`browser-copy`
- 快照：`.review-diffs/manifest-rev2.md` + 4 个 `*-rev2.diff`（只读本轮快照；未跑 git diff/log/show）
- 文件：
  - `adlo/frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx`
  - `adlo/frontend/src/app/features/browser/browser-landing/BrowserLandingPage.test.tsx`
  - `adlo/frontend/src/app/i18n/zh-CN/browser.ts`
  - `adlo/frontend/src/app/i18n/en-US/browser.ts`
- 复核方式：读 rev2 快照 + 当前源码 + 只读旁证（`i18n/copyToClipboard.ts`、`tauri-bridge/tauri-shared.ts`、`src-tauri/src/commands/port_scan.rs`、`dshAuthUrl.ts`、`dshActions.ts`、`dshSlice.ts`、`ContextMenu.tsx`、`ShortcutCard.tsx`、`LocalPortSection.tsx`、`i18n/types.ts`、`i18n/index.ts`）；测试有效性用删除性推演判定。
- **未运行**测试套件 / `check:*` / dev server / 浏览器，**未占用任何端口**，未改源码。

## 上轮问题关闭情况（逐条）

### F1 [low/正确性] 失败/无权限与「无进程」混用文案 → **已关闭**

- `BrowserLandingPage.tsx:241-253`：`if (!result.ok || result.data.processError)` → `browserCopyPidUnavailable`（「无法获取占用该端口的进程」）并 return；只有 `pids.length === 0` 才走 `browserCopyPidNotFound`（「未找到占用该端口的进程」）。与后端语义一致：`port_scan.rs:218-225` 失败时返回 `(Vec::new(), Some(e))`，`:236` 仍是 `IpcResult::Ok`，新代码据 `processError` 区分。`PortDetails` 在 `port_scan.rs:99` 有 `rename_all = "camelCase"`，`processError` 键名正确。
- 注释同步：`BrowserLandingPage.tsx:215` 已改为「端口复制完整的 `http://{host}:{port}` 地址（不校验监听状态）」，与 `:223` 实现（不读 `port.healthy`）相符；`:230-233` 注释「查询失败/无权限与『确实没有进程』分开提示，不把空串写进剪贴板」逐句成立。
- 测试锁定：`:166-177`（`ok:false`）、`:179-193`（`processError`）两条用例分别断言「无法获取…」且 `writeText` 未被调用。删除性推演：把 `:245` 退回旧写法（失败折叠成空数组）后两条用例都会变红（toast 会变成「未找到…」）。**恢复正确**。

### F2 [low/副作用] 剪贴板失败无反馈 + 死 catch → **已关闭**

- 三个入口均检查结果：`:208-211`（快捷站点链接）、`:223-226`（端口链接）、`:254-257`（PID），失败 `showToast(t.browserCopyFailed, 'warning')`。`copyToClipboard` 在 `i18n/copyToClipboard.ts:4-12` 内部 catch 且从不 throw，故该反馈是唯一可感知路径，选择 toast 而非 textarea 兜底符合上轮建议（二者择一）。
- `handleCopyPortPid` 的 `try/catch` 已删除（`:240-258` 无 try），且不留下不可达代码；`invokeIpc`（`tauri-shared.ts:6-26`）与 `copyToClipboard` 都不抛，删除后无未覆盖异常源（见「记录不修」关于畸形响应的说明）。
- 测试锁定：`:195-197` 令 `writeText` reject，断言 toast 为「复制失败」。删除 `:209-211` 的检查后该用例 `waitFor` 超时变红。**恢复正确**。

### F3 [low/测试] 测试缺口（多 PID / 查询失败） → **已关闭**

- 新增 4 例并逐条核过标题与断言一致：
  - `:134-151` 多进程断言 `writeText` 收到 `'4321\n8765'`（把 `join('\n')` 改成任意其它分隔符即变红）。
  - `:166-177` `ok:false` → 断言「无法获取…」；`:179-193` `processError` → 同上（不写剪贴板）。
  - `:195-203` 剪贴板拒绝 → 「复制失败」。
- 其余 4 例（站点 URL、`http://host:port`、单 PID + IPC 参数、空列表）仍从公共入口进入（渲染 `BrowserLandingPage` → 真实 `ContextMenu` → 点 menuitem → 真实 `copyToClipboard` + stub 的 `navigator.clipboard`），非 mock 内部断言；`.adl-shortcut-card` / `.adl-local-port-card` 与 `ContextMenu` 的 `role="menuitem"` 均在源码核实存在（`ShortcutCard.tsx:74`、`LocalPortSection.tsx:177`、`ContextMenu.tsx:113`）。**恢复正确**。

## 新增发现

无。

（本轮 diff 中同文件的 dsh 分流 hunk 也顺带核对：`resolveDshAuthUrl(url, t)` 返回 `DshAuthResolution` 三态，`'canceled' in authed` 判别成立（`dshAuthUrl.ts:22-41`）；`dismissDshRecoveryToast` 在 `StoreState.ts:404` / `dshActions.ts:260-266` 存在且幂等，取消路径由 `dshActions.ts:226/231` 内部收起，故 `:127-129` 取消时直接 return 不泄漏常驻 toast；与 `useBrowserPanelHandlers.ts:103-108`、`useCenterBrowserAddressSubmit.ts:141-149` 同形。`notifyDshFreedPort` 全仓已无引用，`i18n` 两侧各新增 4 个键且 `browserCopyPidUnavailable/NotFound/Failed` 键名、文案在 zh/en 与实际用法一致。）

## 记录不修

- **浏览器模式无 PID 桥**（预存）：`browser_get_port_details` 在浏览器模式仍拿不到进程；F1 修复后提示已从「未找到」变为「无法获取」，不再误导。若要彻底一致属 mock-bridge 后续工作（上轮已记录）。
- **测试夹具 `as unknown as CopyDict`**（预存）：仅构造部分字典供子组件渲染，未用于调私有方法/读内部字段；`check-no-new-any` 覆盖范围不含 stores 之外的测试文件（与 `CreateTabDialog.test.tsx` 同类）。
- **端口地址拼接三处重复**（预存）：`LocalPortSection.tsx:150`、`BrowserLandingPage.tsx:193`、`:223`；可后续提取 `portUrl(host, port)`，非本轮形状。
- **三处复制失败分支同形重复**：`:208-211` / `:223-226` / `:254-257` 仅 3 行且语义各异（PID 路径需先查询），当前提取收益低于抽象成本；Fowler Duplicated Code 气味，非需修复。
- **复制失败 toast 级别用 `warning`**：既有 `FirstRunProvisioningWizard.tsx:767` 同类失败用 `error`；仓库无书面规约要求剪贴板失败必须 `error`，`showToast` 默认级别即 `warning`，行为可感知，属风格差异。
- **删除 `try/catch` 后的理论残留**：若后端返回 `ok:true` 但缺 `processes` 字段，`.map` 会在 async IIFE 内抛未处理 rejection（仅控制台噪音，不阻塞 UI）。后端为强类型 `PortDetails`（`port_scan.rs:99-107`）且四端桥接同形，实际不可达；若日后放宽响应形状需加校验。
- **进度文件声称「textarea 兜底」**：`docs/root-cause-to-close/2026-11/progress-2026-11-25-024000.md` 与最终实现（toast）不符，文档事实漂移按简报归 P5。
- **新增 i18n 键放在 `browserContext*` 组内**：`browserCopyPid*` / `browserCopyFailed` 语义不属 context-menu 前缀组，纯风格。

## 结论

- 上轮主表 F1/F2/F3 全部关闭；本轮修复未引入回归或契约错误。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题
