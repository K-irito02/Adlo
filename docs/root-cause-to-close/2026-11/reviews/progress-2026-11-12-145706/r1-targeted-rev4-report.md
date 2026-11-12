# R1 定向复核报告 — rev4（第 3 轮 8 项修复）

## 范围

- 仓库：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照：`.review-diffs/*-rev4.diff`（manifest-rev4，base `3f7a4a8ecb71656a38ee09acd878c9dbfb0901b`）
- 方式：只读 rev4 快照 + 工作区源码 + 删除性推演；未运行 `git`，未改动源码/配置。
- 范围：仅复核 R1 第 3 轮记录在 `docs/root-cause-to-close/2026-11/progress-2026-11-12-145706.md:129` 的 8 项修复，不做全量审查。
- 实跑（只读）：`pnpm --dir adlo/frontend run test` → `Test Files  480 passed (480)` / `Tests  4748 passed | 1 todo (4749)`。注意这是全量口径；进度文件的 186 文件/2062 是 `check:changed` 的受影响用例口径，两者不能直接比对。

## 上轮问题关闭情况（逐条）

### 1. `useBrowserUrlState.test.ts` 标题去掉 overlay 归因 — **已关闭**

- 位置：`adlo/frontend/src/app/features/browser/__tests__/useBrowserUrlState.test.ts:32`
- 证据：标题现为「Enter 提交时收起地址栏并 blur（标准浏览器行为，不依赖 overlay 门控）」；用例只断言 `setAddressExpanded(false)` / `blur()` / `submitAddress()`，不含任何 overlay 断言。源码 `useBrowserUrlState.ts:41-43` 与 `center/centerOverlay.ts:14-20` 一致（`addressExpanded` 不并入返回值），标题不再把行为归因于 overlay。
- 结论：与实现相符，已关闭。

### 2. `useBrowserPanelAddressSubmit.test.ts` 面板本地文件 expected 回绑用例 — **已关闭**

- 位置：`__tests__/useBrowserPanelAddressSubmit.test.ts:321-351`；实现 `useBrowserPanelAddressSubmit.ts:92-107`
- 证据：
  - 外层 `beforeEach`（`:34-42`）清空 `browserTabs` / `browserActiveTabId`，因此提交前 `panelTabsForBind` 为空，预绑定 `tabId` 必为 `null`（`:96-100`）。
  - 桩 `browserNavigatePanelTab` 在调用时把 `browserActiveTabId` 写为 `'new-panel-tab'`（`:326-328`），提交后断言 `expectedNavigationUrlRef.current?.tabId === 'new-panel-tab'`（`:350`）。
  - 删除性推演：删掉 `:104-107` 回绑，`tabId` 仍为 `null`，断言必红；入口为公共 `result.current.submitAddress()`，非 `as unknown as` 读私有字段。
- 结论：真回归保护，已关闭。（rev3 建议的「期望落定后并发中心事件不改写历史」用例未补，属可选增强，见记录不修。）

### 3. `initScriptNavigation.test.ts` regex 规则用例改用非本地 URL + 不命中反证 — **已关闭**

- 位置：`initScriptNavigation.test.ts:418-439`；实现 `adlo/crates/browser/src/init_script.js:106-119`、`:143-145`
- 证据：
  - 规则 `valueRegex: '^https://cdn\\.example/'` + 输入 `https://cdn.example/x.md`；`fileLike` 走 `isAbsoluteLocalPath`（`:66-72`），对 `https://` 返回 `false`，删掉 regex 分支后首断言（`toEqual` 一条 `kind:file`）必红。
  - 第二击 `https://other.example/x` 断言 `agentLinks()` 为 0；若 regex 分支被改成恒真，该断言必红。`beforeEach`（`:265-270`）清理 `__adlAgentRules` / `__adlAgentOverridesByOrigin`，规则不会跨用例泄漏。
- 残留观察（low，见记录不修）：期望载荷是 `kind:'file'` + `https://` URL，而 Rust `agent_link_from_message`（`crates/browser/src/webview2_postmessage.rs:231-239`）对 `kind:file` 只接受 file-like 值，会在生产端丢弃该消息；JS 已 `preventDefault()`，端到端表现为死点击。建议把该规则 `action` 改为 `'url'`（同样只有 regex 分支能命中，判别力不变）。
- 结论：本条验收点（删分支必红 + 不命中反证）成立，已关闭。

### 4. `initScriptNavigation.test.ts` 空白 trim 断言 — **已关闭**

- 位置：`initScriptNavigation.test.ts:371-375`；实现 `init_script.js:66-72`（判定侧 `v = value.trim()`）、`:144`（发送侧 `url: value.trim()`）
- 证据：输入 `title: '  E:\\ws\\a.md  '`，断言发送 `E:\ws\a.md`。删掉 `:144` 的 `.trim()` 会发送带空白值 → `toEqual` 必红；若删掉 `:68` 的判定侧 trim，则根本不命中 → 同样必红。两条路径都由该用例区分。
- 结论：已关闭。

### 5. 面板/中心 hook 缺 `t` 时不弹空提示 + 注释相符 — **未关闭（注释半修）**

- 空提示已修：`useBrowserPanelAddressSubmit.ts:78/84` 与 `useCenterBrowserAddressSubmit.ts:82/88` 均为 `if (t) { showToast(...) }`；两个生产调用点（`BrowserPanel.tsx:405`、`CenterBrowserView.tsx:198`）传全量 `t`，类型要求三个 key 齐全。
- 注释只修了面板：`useBrowserPanelAddressSubmit.ts:30` 已改为「提示文案（本地文件桌面端限制 + 残留端口释放告知）；缺省时不提示。」✅
- **未修**：`useCenterBrowserAddressSubmit.ts:37` 仍为「全量文案（调用点传入中心 `t`）：仅用于残留端口释放告知，缺省不提示。」——`t` 现同时用于 `browserLocalFileDesktopOnly` / `browserLocalFileUnsupported`，「仅用于」已失真。rev3 F1 明确要求两处注释都改。
- 附（low）：无「`t` 缺省 → 不调用 `showToast`」用例；把 `if (t)` 回退成 `showToast(t?.x ?? '', ...)` 全部用例仍绿。
- 结论：行为已修，注释未修 → 未关闭（low，文档）。

### 6. `useCenterBrowserAddressSubmit.ts` 代际守卫（两个 await 后检查）— **已关闭（实现正确，但零回归用例，见 F1）**

- 位置：`useCenterBrowserAddressSubmit.ts:73-75`（`submitVersionRef` + 首行自增）、`:141-144`（`resolveDshAuthUrl` 后）、`:159-169`（`checkEmbed` 后）
- 证据：
  - 两处 `if (submitVersionRef.current !== version) return;` 分别位于两个 `await` 落定之后；后续 `setAddress` / `browserAddToHistory` / `browserUpdateTab` / `navigateTabInPool` 全部在守卫之后。
  - 推演：A（DSH 地址，`await resolveDshAuthUrl` 在途）→ B（本地文件，同步写 store 并返回，版本号 2）→ A 落定，`1 !== 2` 直接 return，不覆盖 B。连续主路径提交仍是 last-wins（后提交版本更大，先落定者被丢弃）。
  - 注释 `:179-181` 已改为「连续的主路径提交仍是 last-wins；代际守卫只用于丢弃更早的在途提交」，与实现相符。
- 缺口：`__tests__/useCenterBrowserAddressSubmit.test.ts` 只有 2 条主路径 + 3 条本地文件用例，无挂起/并发用例；删掉两处守卫全部用例仍绿 → 新增 F1。
- 结论：实现已关闭；回归保护缺失另计。

### 7. `browser_webview_setup.rs` 记录 `--allow-file-access-from-files` 权衡 — **已关闭**

- 位置：`adlo/src-tauri/src/commands/browser_webview_setup.rs:20-37`
- 证据：注释已补「同一 UDF 只能一个环境 / wry 逐字使用该串 / 本地 HTML 读同目录 fetch、module 的用途 / 非 file 源仍不能读 `file:`」；常量与 `tauri.conf.json:30` 逐字一致（`main_window_shares_webview_additional_args` 单测锁定）。
- 残留观察（low）：`per the "trusted local document" product decision` 在进度文件/ADR 无出处；`the exposure is limited to user-opened local files` 易被读成「只能读被打开的那个文件」，实际是该本地文档可读任意本地文件。属可选措辞收紧，见记录不修。
- 结论：权衡已入注释，已关闭。

### 8. 进度文件计数/记录一致 — **未关闭**

- `initScript 41`：✅ 第 60 行「`initScriptNavigation.test.ts` 41 passed」；源码 `it(` 实测 41 条（grep 计数一致）。
- 记录不修已列：✅ 第 130 行列了 6 项。
- **最终门禁计数未更新**：第 91-92 行仍为 `Test Files 186 passed (186)` / `Tests 2062 passed (2062)`（时间 21:09–21:12）。本轮主代理给出的最新门禁为 **2091**，而进度文件（`grep 2091 docs/` 无结果）未更新；`check:changed` 属受影响用例口径，本轮新增用例后计数会增长，需以最新一次 `check:changed` 的汇总行替换。全量 `vitest run` 为 480 文件 / 4748 用例，不能用来核对 2091。
- 附带（low）：第 47 行事项 3 的同一命令仍记 `initScriptNavigation` 为 40（当前 41）；作为 20:47 的历史运行记录不算错，但易被当作最新证据。rev3 的 `useCenterBrowserAddressSubmit.ts:100` 冗余 `state.isTauri`、`useBrowserViewHost.test.ts` 的 `makeTab`、`useBrowserUrlChange.ts:434` 缺理由注释未转写进记录不修。
- 结论：未关闭（low，文档）。

## 新增发现

### F1 [severity: medium] [category: 正确性] 中心提交代际无回归用例（删掉两处守卫仍全绿）

- 位置：`adlo/frontend/src/app/features/center/useCenterBrowserAddressSubmit.ts:73-75, 142-144, 167-169`；缺口在 `adlo/frontend/src/app/features/center/__tests__/useCenterBrowserAddressSubmit.test.ts`
- 描述：本轮为 rev3 F2 增加的中心提交代际是本轮唯一的异步正确性修复，但没有任何用例覆盖。现有 5 条中心用例中，DSH 用例的 `window.digitalLife.dsh.open` 立即 resolve，其余用例无 `await` 竞争；删掉两处 `if (submitVersionRef.current !== version) return;` 后全部用例仍绿。按共享简报 §5.1「删掉该修复，测试会变红吗？」，该修复零保护（与 rev3 对 `trim` / expected 回绑的判定口径一致）。
- 证据：`useCenterBrowserAddressSubmit.test.ts:34-119`（主路径，立即 resolve）、`:121-200`（本地文件，同步）均无 deferred / 二次提交；源码守卫 `:142`、`:167` 无对应断言。
- 建议修复：在中心用例内用可控 deferred 的 `resolveDshAuthUrl`（或 `checkEmbed`）挂起提交 A，再提交本地文件 B（版本 2），落定 A，断言 `setAddress` / `navigateTabInPool` 只收到 B、`browserTabsById['center-1'].url` 为 file URL，且 A 的地址未写入。

## 记录不修

- regex 用例的 `kind:'file'` + `https://` 载荷会被 Rust 闸门丢弃（见上轮 3）；建议 `action:'url'`，本轮不阻塞。
- rev3 item2 建议的「期望落定后并发中心事件不改写历史」用例未补（面板回绑本身已有用例）。
- 中心 hook `t` 缺省时「不弹空提示」无用例（见上轮 5）。
- Rust 常量注释中「trusted local document product decision」无出处、暴露边界措辞偏窄（见上轮 7）。
- 进度文件记录不修覆盖不全（见上轮 8）。

## 结论

- 8 项中 6 项已关闭、2 项未关闭（第 5 项中心注释、第 8 项最终门禁计数）。
- 新增 1 条 medium（F1：中心代际无回归用例）。
- 需修复项：3（critical 0 / high 0 / medium 1 / low 2）
