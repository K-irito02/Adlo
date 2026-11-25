# dsh-port — R1 / rev5 复审报告（rev4 finding 定向复核）

## 范围

- rev：5（定向复核），scope：`dsh-port`（manifest `### dsh-port` 共 35 个文件）。
- 快照：`.review-diffs/manifest-rev5.md` + `*-rev5.diff`；只看 rev5，未跑 `git diff/log/show`，未改源码，未跑测试套件 / `check:*` / dev server / 浏览器，**未占用任何端口**。
- 本轮实际变动面：按文件名 + 字节长度逐一比对 rev4/rev5 快照，57 个文件中只有 3 个变化，且都落在本 scope——`useBrowserPanelHandlers.ts`（2070→2014）、`__tests__/useBrowserPanelAddressSubmit.test.ts`（3972→5983）、`__tests__/useCenterBrowserAddressSubmit.test.ts`（5084→6906）。两个地址栏 hook 与 store/后端文件字节数完全一致，可确认修复未顺带改动生产逻辑。
- 复核对象（主代理本轮两处处理）：
  1. `useBrowserPanelHandlers.ts:17` 的 `t` 参数注释；
  2. `useBrowserPanelAddressSubmit.test.ts:302-360` 与 `useCenterBrowserAddressSubmit.test.ts:183-236` 新增的「端口确认被取消时不裸开 3080 且不导航」。
- 核对方式：读 rev5 快照 + 工作区源码（两个地址栏 hook、`useBrowserPanelHandlers.ts`、`dshAuthUrl.ts`、`dshActions.ts` 的 `ensureDshUrl`/`callDshOpen`/`askDshPortConflict`/`resolveDshPortConflict`、`shared/ipc/dsh.ts`），用删除性推演判断新用例有效性；只读旁证 `useBrowserPanelHandlers.test.ts`、`BrowserLandingPage.tsx`（跨 scope 只作上下文）。
- 异步状态专项（简报 §4.1）：两条新用例都从公共入口 `submitAddress()` 进入；`await resolveDshAuthUrl` 落定后先重读代际（`submitVersionRef.current` / 内部 `useRef`），再决定是否 `return`，没有用 await 前快照写回；取消路径不写 `targetUrl`、不写标签、不写期望导航 ref，因此不存在「旧响应晚到反而导航」的竞态。

## 上轮问题关闭情况（逐条）

- **rev4-F1 [low 文档] `useBrowserPanelHandlers.ts:17` 注释把不存在的「本地文件限制」写进 `t` 的用途 → 已关闭**
  - 现注释为「提示文案（DSH 恢复/启动提示）；缺省不提示。」（`:17`），类型 `Pick<CopyDict, 'dshRecovering' | 'dshStarting'>`（`:18`）。
  - 与实现逐句相符：该 hook 全文只在 `:103` 把 `t` 传给 `resolveDshAuthUrl`，`resolveDshAuthUrl` → `ensureDshUrl(t)` → `callDshOpen` 用 `t?.dshRecovering` / `t?.dshStarting`（`dshActions.ts:149`）；「缺省不提示」对应 `message` 为空时不建计时器、不显示 toast（`:150-155`）。文件内无 local-file 逻辑，注释不再声称它做本地文件限制。

- **rev4-F2 [low 测试] 取消端口确认时 hook 不导航（`'canceled' in authed` 早退）无用例 → 已关闭，两处各一例且删除性推演成立**
  - **面板侧** `__tests__/useBrowserPanelAddressSubmit.test.ts:302-360`：store 置 `isTauri:true`、`dshPortConflict:null`；`dsh.open` 返回 `{status:'port_occupied', url:null, occupant:{port:3080, processes:[1 条]}}`；`submitAddress()` 后 `vi.waitFor` 等 `dshPortConflict` 非空 → `useAppStore.getState().resolveDshPortConflict(false)` → `ensureDshUrl` 走 `askDshPortConflict` 的拒绝分支返回 `{status:'port_occupied', url:null, canceled:true}` → `resolveDshAuthUrl` 折算为 `{canceled:true}` → hook 在 `useBrowserPanelAddressSubmit.ts:144-146` 早退。断言 `browserNavigatePanelTab` / `navigateBrowser` 均未被调用。
  - **中心侧** `__tests__/useCenterBrowserAddressSubmit.test.ts:183-236`：同款 mock 与取消流程，`isTabInPool: () => true`，断言 `navigateTabInPool` 未被调用。
  - **删除性推演**：删掉任一 hook 的 `if (authed && 'canceled' in authed) { return; }` 后，`targetUrl = authed?.url ?? finalUrl`，运行时 `{canceled:true}.url` 为 `undefined` → `targetUrl` 回退裸 `http://127.0.0.1:3080`：面板侧 `isTauri:true` 跳过 checkEmbed 分支，走到 `browserNavigatePanelTab('http://127.0.0.1:3080', undefined)` → `expect(browserNavigatePanelTab).not.toHaveBeenCalled()` 变红；中心侧 `state.isTauri && isTabInPool` 走到 `navigateTabInPool('center-1', 'http://127.0.0.1:3080')` → `expect(navigateTabInPool).not.toHaveBeenCalled()` 变红（同时 `browserUpdateTab` 也会被写入裸地址）。此外删除后 `authed` 收窄消失，`authed?.url` 在 `DshAuthUrl | {canceled:true} | null` 上是类型错误，`check:review` 的 typecheck 也会红。
  - 用例质量：均从公共入口 `submitAddress()` 进入，未 `as unknown as` 调私有方法/读内部字段；两处都显式 `dshPortConflict: null`，`vi.waitFor` 与 `resolveDshPortConflict` 是真实 store 通路而非 mock 旁路；两文件均未启用 fake timers（grep 无 `useFakeTimers`），`vi.waitFor` 与 `dsh.open` 无 1.2s 计时器（两个用例都不传 `t`），不存在「替实现兜底」或超时假阳性。
  - 收尾：`dshEnsureInFlight` / `pendingPortConflict` 分别在 `ensureDshUrl` finally 与 `resolveDshPortConflict` 内清空，`dshPortConflict` 归 null，`finally` 删除 `window.digitalLife`，不影响同文件后续用例（面板文件后续是 local-file describe，中心文件后续是同一个 describe 的 local-file 子块）。

- 更早轮次已关闭项未回退：`dshPortFreed` / `notifyDshFreedPort` / `freedPort` / `restartedForAuth` 在 `adlo/**/*.ts` 全仓 0 命中；守卫内 `dismissDshRecoveryToast()` 与 `ensureDshUrl` 的取消/不可识别分支仍在；`useBrowserPanelHandlers` 的取消早退（`:104-106`）与 `BrowserLandingPage.tsx:127-129` 的同款早退一致。

## 新增发现

无。两处修复都只改注释/测试，未触碰生产路径（两个 hook 与 store/后端文件与 rev4 快照逐字节一致），未引入行为回归。

## 记录不修

- 面板侧取消用例的 `expect(navigateBrowser).not.toHaveBeenCalled()` 在 `isTauri:true` 下恒真（该分支根本不会走到 `navigateBrowser`），属冗余断言；区分力由 `browserNavigatePanelTab` 断言承担（删除修复即红），不构成失效文案（简报 §5.9 要求至少一条会失败的断言）。
- 两处取消用例未断言 `setAddress` / `browserUpdateTab` / `expectedNavigationUrlRef.current` 保持原值，也未断言 `dshRecoveryToastId === null`；「不导航」已被覆盖，属可补强项，不另立条目。
- 中心 hook 在 `await resolveDshAuthUrl` 之后仍用提交开始时取的 `state.isTauri` 快照（`useCenterBrowserAddressSubmit.ts:154/189`）；该值为环境常量、本轮未改动，属 pre-existing，不改变行为。
- rev3 记录的 pre-existing 取舍（`port_occupied` 缺 `occupant` 时建空标签、单一 `dshRecoveryToastId` + `clearToasts` 生产零调用、`cmdline` 未展示、`status:'opened'` 但 `url:null` 回退裸地址）本轮未改，维持原判断。
- 文档类（P5）：ADR 0035、`docs/**`、进度文件、术语/冒烟同步留给 P5，不计入本表。

## 结论

- rev4 的 2 条 low 均已关闭：`useBrowserPanelHandlers.ts:17` 注释与实现逐句相符；两个地址栏 hook 的取消路径各有一条从公共入口进入、删除修复即变红的回归用例。rev5 只改注释与测试，生产代码无变化，未见新回归。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
