# dsh-links — R2 rev6 清理（定向复核）报告

## 范围

- rev：rev6（base `595216f1`）；scope：dsh-links（`adlo/crates/browser/src/init_script.js`、`adlo/frontend/src/app/App.tsx`、`adlo/frontend/src/app/features/browser/BrowserPanel.tsx`、`adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts`、`adlo/frontend/src/app/features/center/CenterBrowserView.tsx`）。
- 输入：`.review-diffs/manifest-rev6.md` + 上述 5 个 `-rev6.diff`（base→rev6 累计 diff，只看本轮）。
- 只读执行：未跑 git / 测试套件 / 门禁，未启动 dev server / 浏览器（无端口占用、无后台进程），未改源码/配置。额外只读核对：`crates/browser/src/browser_webview.rs`（`set_agent_intercept_for_all`）、`src-tauri/src/commands/browser.rs:1759-1780`、`app/stores/actions/generalActions.ts:222-239`、`docs/adr/0034-browser-subwebview-blank-links-own-the-tab.md`（判断「依赖既有行为」与命令名引用）。
- 本轮相对 rev5 的实际改动（按 rev5 报告描述 + rev6 diff 定位）：
  1. `init_script.js:781-783` window.open 小节注释改为「其余 **http(s)** URL 交回 origOpen（非 http(s) 返回 null）」；
  2. `init_script.js:41-44` 顶部安装期 gate 注释重写（原文「disabling takes effect immediately through their runtime checks」→「need a reload to install or remove」）；
  3. `init_script.js` 移除 `if (__adlIsAgentHost() && __adlSendAgentLink('url', resolvedUrl)) return null;`，非下载 http(s) 一律委托 `origOpen`；
  4. `BrowserPanel.tsx:246/456`、`CenterBrowserView.tsx:202` 注释由「残留端口释放告知用（dshPortFreed 全量 copy 必存在）」改为「dsh 断连恢复提示（t.dshRecovering）」；
  5. 测试新增 `__TAURI_INTERNALS__` 预设与 8 条用例（见下）。
- R2 口径：只收死代码、冗余守卫、根因修后多余的防御、应删/降级的诊断日志；复审收敛（rev≥2）主表只收上轮未关闭项与本轮修复引入的回归/契约错误。

## 上轮问题关闭情况（逐条）

1. **rev5 F1（low，`init_script.js` window.open 注释与非 http(s) 返回 null 矛盾）— 已关闭。**
   - 现文（`:781-783`）：「agent 站点只接管下载 URL；其余 **http(s)** URL 交回 origOpen（非 http(s) 返回 null）」。
   - 逐分支核对：`:811` `if (resolvedUrl && isValidWebUrl(resolvedUrl))` → `:812` 下载 → `:822` `window.location.assign` + `:823` `return null`（接管）；非下载 → `:833` `origOpen.call(window, resolvedUrl, name, features)`（交回）；`:811` 判否 → `:835-837` `return null`（非 http(s)、空值、`file:`/`about:`/`javascript:` 等）。`isValidWebUrl`（`:87-90`）只认 `http://`/`https://`/`//`，与注释一致。
   - 与同函数既有注释 `:797-798`（非导航方案 untouched → 仍返回 null）不再互相矛盾。
   - 行为未变（只改注释）；rev5 报告里点名的三处相互矛盾已消除。
2. **rev5「记录不修」各项状态：** `__adlIsSiteChrome` 双次祖先链、shell guard 与 `__adlPatchShellOpen` 非重复防御、`auxclick` 预防性匹配、stub 分支无覆盖、`<header>` 用例标题措辞、marker 用例重叠等均无变化，仍按记录保留；其中 `BrowserPanel.tsx` / `CenterBrowserView.tsx` 的 `t` 注释已被本轮改写（见下「记录不修」第 4 条，结论不变）。
3. **无回归可判于 App.tsx：** rev6 仍只有 import（`:30`）+ 单点挂载（`:345`）`<DshPortConflictDialog />`，无重复挂载/死挂载。
4. **本轮行为变更与 ADR 一致性（必查「依赖既有行为」）：** 移除 window.open 的 agent URL 拦截属 ADR 0034 决定 3 的明文内容（「`window.open` 的 agent URL 拦截移除（无 DOM 上下文，登录/反馈等入口保持原生）」），代码、ADR 与 `generalActions.ts:225-227`（两条安装期路径只在重载后变化）三方一致；`browser_set_agent_intercept` 命令名在 `src-tauri/src/main.rs:179`、`commands/browser.rs:1760`、`permissions/digital-life.toml` 均存在，注释引用未失效。
5. **顶层安装期注释新表述可证：** `window.open` 重写 gate 在 `:785`、SPA nav-guard gate 在 `:899`（`if (!__adlIsAgentHost()) return;`），均为安装期判断；`:41-42` 的「click interception reads `__adlAgentInterceptEnabled` at event time」由 `:638` → `:45-48` 证明，配置刷新走 `browser_webview.rs:327-383` 的 `eval_js`。

## 新增发现

无。本轮 scope 内未发现 critical / high / medium / low 级需修复项：
- 无新增死代码：`__adlIsSiteChrome`（`:60-84`）有 `:607`/`:664` 两个调用点；`__adlSendAgentLink` 移除 window.open 用法后仍被 `:711`/`:735`/`:769` 使用；`origOpen` 仍被 `:692`/`:833` 使用。
- 无冗余守卫/多余防御：`:607` 的 `__adlIsAgentHost() && !__adlIsSiteChrome(...)` 短路避免非 agent 站点做祖先链遍历；capture（`:664`）与 bubble（`:607`）两处 chrome 判定分别对应「不进 agent 通道」与「允许新标签路由」，职责不同。
- 新增测试的删除性推演均能变红：`leaves site chrome links…`（`:454`，去掉 `:664` 早退即出现 `adl-agent-link`）、`native <dialog>`（`:476`，去掉 `DIALOG` 分支即红）、`aria-modal="false"`（`:497`，改成 `hasAttribute('aria-modal')` 即红）、`<header>`（`:513`，去掉 `HEADER` 即红）、`ignores the Tauri shell plugin auto-open link listener`（`:565`，去掉 guard 即 `__shellCalls` 有值）、`keeps ordinary body click listeners working`（`:578`，guard 误杀即红）、`routes plugin:shell|open to open-new-tab`（`:591`，去掉 patch 则 `posted` 无 `open-new-tab`）、`routes the shell plugin open command…`（`:183`，源码子串 marker）。
- 新增的 `console.log`/`__adlSendLog`：无；`:831` 委托日志为 base 既有（本轮由「几乎不可达」变为可达，属预期路径，见记录不修第 8 条）。

## 记录不修

1. `init_script.js:36-44` 注释重复（本轮引入）：`:36-40` 已写明「baked into the injected prefix … read dynamically so click interception picks up `browser_set_agent_intercept` on loaded pages」，`:41-42` 又重复「Click interception reads `__adlAgentInterceptEnabled` at event time, so … applies to already-loaded pages」。两条事实都成立、不矛盾，仅冗余；建议下次触碰该块时合并为一段（纯风格，不进主表）。
2. `initScriptNavigation.test.ts:299-307` 标题「delegates window.open(http) to native handling」未被断言支撑（pre-existing）：`openRewrite = initScript.slice(indexOf(marker) - 50, indexOf(marker) + 900)`，`marker` 本身即 `var origOpen = window.open;`，所以 `toContain('window.open')` / `toContain('origOpen')` 由 marker 行自身满足；把 `:833` 的 `return origOpen.call(...)` 改成 `return null` 不会变红。当前正向委托只被 `:207-210` 的反向断言（旧 agent-send 分支不存在）单向锁定。建议后续补一条 `expect(openRewrite).toContain('return origOpen.call(window, resolvedUrl, name, features);')`；按 §6 收敛规则（pre-existing low）未进主表。
3. `crates/browser/src/browser_webview.rs:322-326` Rust doc 仍写「Two paths are installed when the document loads: enabling them requires a reload, while disabling takes effect immediately through their runtime checks」。本轮移除 window.open 包装内的 `__adlIsAgentHost()` 运行期判断后，该包装不再因关闭开关而停止接管下载 URL（只有重载才恢复 `origOpen`），该句对 window.open 一路已不成立，并与 `init_script.js:41-44`、`generalActions.ts:225-227` 相反。该文件不在 rev6 diff、不在任何 rev6 scope（rev5 已记录同一冲突，本轮进一步坐实）；按归属规则不计入本 scope 主表，建议主代理在 P5 或下次触碰该文件时改为「两条路径均为安装期 gate，开关变更需重载」。
4. `BrowserPanel.tsx:246`/`:456`、`CenterBrowserView.tsx:202` 注释「事项 2：dsh 断连恢复提示（t.dshRecovering）」只点了 `t` 的一项用途：`useBrowserPanelHandlers.ts:18` 的 `t` 类型为 `Pick<CopyDict, 'dshRecovering' | 'dshStarting'>`，`useBrowserPanelAddressSubmit.ts:31-34` / `useCenterBrowserAddressSubmit.ts` 的 `t` 还承载 `browserLocalFileDesktopOnly` / `browserLocalFileUnsupported`。比旧注释（`dshPortFreed 全量 copy`）准确，属精度不足而非错误；rev5 已记录，结论不变。
5. `init_script.js` 的 `__adlPatchShellOpen` stub 分支（`:500-513` 一带）无测试覆盖，`beforeAll` 预设 `__TAURI_INTERNALS__`（测试 `:385-387`）后更不会执行；已知记录项。
6. marker 用例 `initScriptNavigation.test.ts:183-192` 与行为用例重叠，仅源码子串断言；rev5 已记为噪音。
7. 「site chrome」/「站点 chrome」作为本轮新引入的领域说法未进 `GLOSSARY.md`（ADR 0034 决定 3 有描述）；`GLOSSARY.md`/`docs/**` 属 P5 范围，不计入本报告。
8. `init_script.js:804/808/820/831/856/863/866/877` 的 `console.log('[ADL-DL-JS] …')` 为 base 既有，非本轮新增；其中 `:831` 因本轮移除 agent-send 分支而变为常走路径（页面 devtools 可见完整 URL）。与 `:740-742` 用 `console.debug` 的既有约定不完全一致，留作下次触碰该文件时统一。
9. 清理视角已核对但判为正当保留：`__adlRouteNewWindowEvent` 对 site chrome 放行后，中键点击仍先由 capture 处理器的 middle 分支（`:644-660`）投递且 `preventDefault`，bubble 侧因 `defaultPrevented` 早退（`:600`），无重复开标签；`__adlPatchShellOpen` 的 250ms×20 轮询在成功/超限后 self-clear，无遗留 timer；`__adlIsSiteChrome` 对 Shadow DOM 内元素不穿透（`parentElement` 在 shadow root 处为 null → 返回 false），属启发式边界，非本轮回归。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
