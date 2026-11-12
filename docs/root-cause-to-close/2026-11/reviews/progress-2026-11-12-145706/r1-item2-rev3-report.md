# R1 终审复审报告 — 事项 2（rev3）

- 仓库：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 基线：`3f7a4a8ecb71656a38aee09acd878c9dbfb0901b`（rev3 快照，89 文件，见 `.review-diffs/manifest-rev3.md`）
- 需求真源：`docs/root-cause-to-close/2026-11/progress-2026-11-12-145706.md` 事项 2
- 只读约束：只读 rev3 快照 + 工作区源码；未运行任何 git 命令，未修改源码/配置。

## 范围

事项 2：**中心宿主承载的浏览器标签导航不得写回右侧面板地址栏，但仍须更新 store / 历史 / 标题**。本轮审 9 个文件：

- `adlo/frontend/src/app/features/browser/useBrowserUrlChange.ts`
- `adlo/frontend/src/app/features/browser/browserUrlUtils.ts`
- `adlo/frontend/src/app/features/browser/useBrowserPanelMetaWiring.ts`
- `adlo/frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts`
- `adlo/frontend/src/app/features/browser/__tests__/useBrowserUrlChangeOwnership.test.ts`
- `adlo/frontend/src/app/features/browser/__tests__/useBrowserUrlChangeFile.test.ts`
- `adlo/frontend/src/app/features/browser/__tests__/useBrowserPanelAddressSubmit.test.ts`
- `adlo/frontend/src/app/features/center/useCenterBrowserAddressSubmit.ts`
- `adlo/frontend/src/app/features/center/__tests__/useCenterBrowserAddressSubmit.test.ts`

实测（本轮快照源码）：

```
pnpm --dir adlo/frontend run test -- useBrowserUrlChangeOwnership.test.ts useBrowserUrlChangeFile.test.ts useBrowserPanelAddressSubmit.test.ts useCenterBrowserAddressSubmit.test.ts
Test Files  4 passed (4)
     Tests  20 passed (20)
```

（stderr 的 `storageHelpers.writeJson ... window is not defined` 是测试环境既有噪声，与本次改动无关。）

## 上轮问题关闭情况

### rev2 F1（medium：closed-tab 回落 + `file:` 期望消费无回归用例）— **已关闭**

- 新增 `useBrowserUrlChangeFile.test.ts:144-178`（`does not navigate the global active center tab when the event tab was closed`）：经公共入口 `renderHook(useBrowserUrlChange)` + stub `onUrlChanged`，构造 `expectedNavigationUrlRef = { url:'https://panel.example/a', tabId:'closed-tab' }`、store 仅含中心标签 `c1` 且 `browserActiveTabId='c1'`，断言 `browserTabsById.c1.url` 未被改写、期望 ref 被消费为 `null`。
- 新增 `:180-216`（`consumes a file:// expected navigation without recording a redirect`）：`expected` 指向面板标签 + `file://` 事件，断言 ref 置 `null`、`browserHistory` 保留 file URL 且无 https 条目。
- 删除性推演（未改源码）：把 `useBrowserUrlChange.ts:330` / `:434` 的 `else if (!tabId)` 改回 `else`，closed-tab 用例会经 `browserNavigateActiveTab('https://panel.example/a')` 改写 `c1.url` → 转红；把 `:229` 正则中的 `file` 去掉，file 事件被早退丢弃、ref 不复位 → 转红。两条均构成真实回归保护。

### rev2 F2（low：面板本地文件分支未回绑 expected）— **代码已关闭，回归保护缺失**

- 代码：`useBrowserPanelAddressSubmit.ts:98-103` 已补主路径同款回绑（`browserNavigatePanelTab` 后回读 `browserActiveTabId` 重绑 `tabId`）。回绑口径正确：`browserNavigatePanelTab`（`stores/slices/browserSlice.ts:140-190`）无论就地导航还是新建标签都会把 `browserActiveTabId` 指向该面板标签（`:167` / `:186`）。
- 缺口：`useBrowserPanelAddressSubmit.test.ts:240-279` 的 `renderSubmit` 把 `expectedNavigationUrlRef: { current: null }` 内联传入且不返回，`browserNavigatePanelTab` 又是 `vi.fn()`（不建标签，`browserActiveTabId` 保持 `''`），故 `:100-103` 的 `createdTabId` 分支在测试中**从不执行**；删掉该回绑全部 20 条用例仍绿 → 见本轮 F1。

### rev2 F3（low：中心用例未断言历史/标题）— **已关闭**

- `useBrowserUrlChangeFile.test.ts:130-141` 已补：`browserHistory.some(h => h.url === 'https://center.example/x')` 为真；`pageMetaGet` 返回 `CENTER TITLE` 后断言 `onPageMeta` 以 `objectContaining({ title:'CENTER TITLE' })` + `'http'` 被调用（`:103` 预置 `mockResolvedValueOnce`）。
- 删除性推演：把 `browserAddToHistory`（`:328`）挪进 `if (syncPanelAddress)` → 历史断言转红；把 `tryPrefetch()`（`:406-408`）或 `onPageMeta` 包进门控 → 标题断言转红。正好锁住 rev2 担心的“过度门控”回归。
- 备注：标题断言落在 hook 边界的 `onPageMeta`（stub），而非 `tab.title` 落库；但“prefetch 未被门控”这一事实已被证明，`onPageMeta → handlePageMeta` 的落库链路由 `useBrowserPageMeta` 用例覆盖（事项 5 范围），此处不重复要求。

## 新增发现

### F1 [severity: medium] [category: 正确性] rev2 F2 的 expected 回绑没有任何回归用例（删掉回绑测试仍全绿）

- 位置：`adlo/frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts:98-103`；缺口在 `adlo/frontend/src/app/features/browser/__tests__/useBrowserPanelAddressSubmit.test.ts:240-279`
- 描述：本地文件分支新增的“回读 `browserActiveTabId` 重绑 expected”是 rev2 F2 的唯一修复手段，但本轮未补 rev2 明确要求的用例（“无面板标签 + 提交本地文件 + 并发中心 URL 变化 → 历史条目 URL 不被改写”）。现有 4 条 `local file address` 用例只断言 `setAddress` / `handleNavigationStart` / `browserNavigatePanelTab` / toast / 代际推进，均不返回也不断言 `expectedNavigationUrlRef`，因此预绑定（`:92-96`）与回绑（`:100-103`）两段都无覆盖。按简报 §5.1「删掉该修复，测试会变红吗？」答案是否：删掉 `:100-103` 后 20 条用例保持全绿。
- 证据：
  - `renderSubmit`（`:241-279`）内联 `expectedNavigationUrlRef: { current: null }`，返回值里没有该 ref；
  - `browserNavigatePanelTab = vi.fn()`（`:245`），不写 store，`browserActiveTabId` 在 `beforeEach`（`:34-42`）置 `''` 后恒为 `''`，`if (createdTabId)` 恒假；
  - `grep expectedNavigationUrlRef src/app/features/browser/__tests__` → 仅 `useBrowserPanelAddressSubmit.test.ts:52/102/155/218/255`，其中 `:255` 是本地文件分支的不可观测 ref；
  - 失效后果可证：`tabId: null` 时消费条件 `expected.tabId === null || expected.tabId === tabId`（`useBrowserUrlChange.ts:449`）对任意池标签事件成立，10s 窗口内中心标签 SPA 变化会走 `recordRedirect(fileUrl, 中心URL)` + `browserUpdateHistoryUrl`（`:454-468`），把本地文件历史改成无关 URL（rev2 F2 已论证）。
- 建议修复：在 `local file address` 组内补一条：store 只放一个中心标签（`location:'center'`，`browserActiveTabId` 指向它）+ `browserNavigatePanelTab` 桩模拟建标签（写入 `browserTabs` 并把 `browserActiveTabId` 设为新面板 id），提交 `D:\Desktop\a.html`，断言 `expectedNavigationUrlRef.current?.tabId === 新面板 id`（非 `null`、非中心 id）；再加一条并发用例：期望落定后触发中心标签 URL 变化，断言 `browserHistory` 中 file 条目 URL 未改写。

## 已验证项（非发现）

- **门控覆盖面完整**：`syncPanelAddress`（`useBrowserUrlChange.ts:256`）覆盖全部面板地址栏写入口——`:273-278`（pendingPrefetch 命中）、`:299-305`（suppressBase）、`:442-469`（期望消费）、`:471-480`（最终 `setAddress` / `setSearchQueryDisplay` / `onNavigationStart`）；store（`:323`）、历史（`:324-329`）、标题（`:360-408` prefetch → `onPageMeta`、`:413-439` 兜底定时器）均在门控之外，与“三项仍更新”一致。
- **`file:` 放行与两处绝对断言为真**：`/^(?:https?|file):\/\//i`（`:229`）使 `file:` 事件进入链路，`:406` 的 `/^https?:/i` 守卫因此可达（`normalizeUrlForCompare` 不改 scheme）；“静默抓取只接受 http(s)”由 `src-tauri/src/commands/browser.rs:624-643`（`silent_fetch_url_allowed` 拒绝 file）+ 单测 `:1425` 证明；“标题由原生 DocumentTitleChanged 落地”由 `crates/browser/src/webview2_title.rs:95-100` → `emit_meta_changed`（`webview_event_bridge.rs:15-25`，无 scheme 过滤）→ `useBrowserMetaSubscription.ts:17-42` → `handlePageMeta`（`useBrowserPageMeta.ts:103-106` 放行 `file://`）→ App 根 `useGlobalBrowserMeta`（`App.tsx`）证明。
- **归属谓词语义正确**：`shouldSyncPanelAddressForTab`（`browserUrlUtils.ts:174-176`）对 `undefined` / `location: undefined` / `panel` 放行、仅拦截 `center`，与 `stores/slices/tabLocation.ts:4-6` 的“缺省即面板”口径一致；`BrowserTabState.location` 确为可选（`browserTypes.ts:16`），测试传 `{ location: undefined }` 合法。
- **中心地址栏无第二条污染路径**：`useBrowserUrlChange` 只在 `BrowserPanel` 挂载（`useBrowserPanelMetaWiring.ts:40`），面板 `activeTab` 来自 `useBrowserTabs.ts:78-83`（`location !== 'center'`）；中心地址栏由 `CenterBrowserView.tsx:218-222` 自行从 `activeTab.url` 同步，不经过本 hook，故门控不影响中心自身地址栏。
- **期望消费门控不会误吞**：`useCenterBrowserAddressSubmit.ts` 全文无 `expectedNavigationUrlRef`，中心事件不会消费面板期望；`syncPanelAddress` 只可能让“已关闭面板标签 + expected 豁免”场景继续消费（该场景用例已覆盖）。
- **中心本地文件分支状态落地正确**：`useCenterBrowserAddressSubmit.ts:69-92` 先 `browserUpdateTab(url, title:'', titleResolved:false)` 再 `navigateTabInPool`，标题随后由原生 meta 事件结算；双端行为（浏览器模式仅 toast）与面板分支一致，i18n key 同一对，调用点均传全量 `t`。
- **§4.1 异步状态**：`useBrowserUrlChange` 回调无 `await`，`getState()` 逐次重读（`:251`/`:282`/`:418`）；`useBrowserPanelAddressSubmit` 代际推进在首个分支之前（`:56-58`），DSH 认证（`:135`）与 `checkEmbed`（`:165`）落定后均校验代际；本地文件分支无 `await`。

## 记录不修

- `useBrowserPanelMetaWiring.ts:38` 的 `const _handlePageMeta = handlePageMeta;` 仍是无意义别名（rev2 已记录），行为无影响；建议后续直接内联。
- `browserUrlUtils.ts:174-176` 的 `shouldSyncPanelAddressForTab` 与 `stores/slices/tabLocation.ts:4-6` 的 `isPanelTab` 重复（rev2 已记录）；保留理由可接受（避免 utils → stores 反向依赖），后续可把谓词下沉到共享层。
- `useCenterBrowserAddressSubmit.ts:86` 的 `state.isTauri && isTabInPool(...)` 中 `state.isTauri` 是死合取（`:71-74` 已对 `!isTauri` 提前 return）（rev2 已记录），无害。
- `browserActiveTabId` 恢复期不变量漂移（`persisted/composite.ts` 不按 `location` 过滤）仍为预存问题，已在 P5 台账（进度文件 `P5 待办台账` 第 2 条），本轮不扩面；本轮 `useBrowserUrlChange.ts:331-333` 的注释为真。
- `useBrowserUrlChange.ts:434` 的 `else if (!tabId)` 仍缺与事件分支（`:331-333`）等价的理由注释（rev2 已记录，建议补一句，避免下一轮被当成无因判断删掉）。
- `useBrowserUrlChangeOwnership.test.ts` 仍是纯谓词用例，真正的 hook 级归属用例落在 `useBrowserUrlChangeFile.test.ts`（文件名与覆盖面不符，rev2 已记录）；若采纳 F1 建议，可顺手把 hook 级归属用例归并到 `...Ownership.test.ts`。
- 进度文件事项 2 的“验证”仍只引 `useBrowserUrlChangeOwnership.test.ts`（3 passed），未引真正锁修复的 `useBrowserUrlChangeFile.test.ts`（4 passed）——该命令输出本身为真（本轮实测 4 文件 20 passed），仅证据链不完整；建议 P6 收尾时补一行命令。
- 观察项（预存，无本轮证据，不下结论）：中心标签事件同样会执行 `fallbackTimeoutsRef.current.clear()` 与 `navigationGenerationRef.current++`（`useBrowserUrlChange.ts:342-350`），理论上会丢弃面板在途 prefetch 并取消其兜底定时器；但本 hook 只在 Tauri 挂载，面板标签标题由原生 `DocumentTitleChanged`（App 根订阅）独立结算，用户可见影响很低，且属本轮未改动的既有行为，暂记观察。

## 结论

- 事项 2 的修复在代码层完整、语义正确：中心归属事件不再写面板地址栏/搜索展示/`onNavigationStart`，store、历史、标题三项照常更新；rev2 F1/F3 已实质关闭，F2 代码已关闭但缺回归用例。
- 需修复项：1（critical 0 / high 0 / medium 1 / low 0）
