# R1 rev3 — 事项 5 复审报告（本地文件打开/标题/速度）

## 范围

只读审查，未运行 `git`、未改动源码。依据：`.review-diffs/*-rev3.diff`（rev3 快照）+ 工作区源码。

- 前端：`shared/localFilePath.ts`、`features/browser/localFileInput.ts` + `__tests__/localFileInput.test.ts`、`useBrowserPageMeta.ts` + 测试、`useGlobalBrowserMeta.ts` + 测试、`useBrowserMetaSubscription.ts`（rev3 未改，核对订阅唯一性）、`useBrowserUrlChange.ts` + `__tests__/useBrowserUrlChangeFile.test.ts`、`useBrowserPanelAddressSubmit.ts` + 测试、`useWebViewLifecycle.ts`、`useBrowserViewHost.test.ts`、`browserUrlUtils.ts`（`shouldSyncPanelAddressForTab`）、`useBrowserPanelMetaWiring.ts`、`App.tsx` / `BrowserPanel.tsx`（订阅挂载点）、`i18n/{en-US,zh-CN}/browser.ts`。
- 中心端：`center/useCenterBrowserAddressSubmit.ts` + 测试。
- Rust/壳层：`crates/browser/src/{browser_events,browser_navigation,browser_webview}.rs`、`src-tauri/src/commands/{browser,browser_webview_setup,divider_strip,app}.rs`、`src-tauri/src/main.rs`、`src-tauri/tauri.conf.json`。
- 外部核对：`wry-0.55.1/src/webview2/mod.rs:285-334`（`additional_browser_args` 语义）。

## 上轮问题关闭情况

### rev2 F6（本地文件提交不推进提交代际，且无回归用例）— 已关闭

- 实现：`useBrowserPanelAddressSubmit.ts:56-58` 把 `const version = ++submitVersionRef.current` 提到函数首行（早于 `if (!input)` 与本地文件分支）；主路径两处 `await` 后的 `submitVersionRef.current !== version` 检查（:136/:148/:170）保持不变。本地文件分支（:72-105）为纯同步，返回时不再有在途状态可覆盖。
- 用例：`__tests__/useBrowserPanelAddressSubmit.test.ts:321-327`「advances the submit generation so in-flight submissions are invalidated」→ `expect(submitVersionRef.current).toBe(1)`。
- 变异自检（删掉修复会红吗）：把自增移回本地文件分支之后（即 rev2 前的形态），`D:\Desktop\a.html` 走本地分支后 ref 仍为 `0`，断言 `toBe(1)` 必红。✅ 是真回归保护，不是空断言。
- 入口合法性：断言经公共入口 `result.current.submitAddress()`；被断言的 `submitVersionRef` 是调用方（`BrowserPanel`）传入的参数（`useBrowserNavigatorState.ts:45` 持有 `useRef(0)`），属 hook 外部契约，不是「`as unknown as` 读私有字段」。符合简报 §5.1。
- 备注（不阻塞）：该用例断言的是机制（代际计数）而非端到端结果。更强的形态是挂起一次 `resolveDshAuthUrl`（DSH 分支）后再提交本地文件、落定旧提交，断言旧提交不再 `setAddress`/导航；当前实现的三处 `!== version` 检查已能证明该行为，故按 rev2 的验收口径判为关闭。

### P5 台账项（非本轮回归）

`browserActiveTabId` 恢复期不变量漂移、`ensureProtocol` 盘符死分支、`useBrowserPanelMetaWiring` 别名、ui-manual 新设置项行：均仍在台账，未在本轮引入新证据，维持原判。

## 链路核对（本轮无发现，供确认范围完整性）

- 输入识别 → URL 构造：`isLocalFileInput` → `shared/localFilePath`（盘符/UNC/`file://`、`#`/`?`/`%` 百分号编码、`..` 归一）；`file://D:/x` 由 WHATWG URL 的 file-slash 规则归一为 `file:///D:/x`，不会把盘符当主机。
- 面板提交：Tauri 校验可渲染扩展 → `setAddress`/`handleNavigationStart`/`browserNavigatePanelTab` → 回读 `browserActiveTabId` 重绑期望；浏览器模式仅 toast（双端行为差异已由进度文件与用户确认记录）。
- 中心提交：`browserUpdateTab`（清标题、`titleResolved:false`）+ `navigateTabInPool`（入池时），未入池交由中心宿主 lifecycle 创建。
- 事件链：`navigation_handler` 放行 `file`（:68）→ `on_navigation` 发 `browser-url-changed` → `useBrowserUrlChange` 接受 `file:`（:229）、按 `shouldSyncPanelAddressForTab` 门控地址栏/`onNavigationStart`/期望消费、跳过 `http(s)` 之外的 prefetch（:406）、关闭标签不再回落全局活动标签（:330/:434）。
- 标题链：`main.rs:101` 对 `file` 发 `browser-page-ready`（揭示不再等兜底）；`useBrowserPageMeta.handlePageMeta` 接受 `file:`、跳过 `pageMetaClient.report`；`useGlobalBrowserMeta` 在 App 根单点订阅（`useBrowserMetaSubscription` + `subscribeUpdated`），`useBrowserPanelMetaWiring` 已移除订阅（原 `(meta) => _handlePageMeta(meta,'com')` 的 'com' 来源被保留），无重复订阅（全仓仅 App 根 + 测试调用）。
- 环境一致性：`WEBVIEW_ADDITIONAL_ARGS` 同时用于 `build_webview_builder`、`build_silent_webview_builder`、`divider_strip`，并与 `tauri.conf.json:30` 逐字一致（`main_window_shares_webview_additional_args` 断言）；wry 确认该字符串被逐字使用、不再追加默认参数，故常量注释「必须包含 wry 默认 `--disable-features`」属实。
- 下载抑制：`useWebViewLifecycle.ts:231` 对非 fresh 恢复的本地可渲染文件放行创建；`useBrowserViewHost.test.ts:144-166` 以 `.pdf`（同时命中下载扩展名）覆盖，删掉 `&& !isLocalViewableFileUrl(...)` 该用例必红。✅

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：
  - `adlo/frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts:30`（注释）、`:78`、`:82`
  - `adlo/frontend/src/app/features/center/useCenterBrowserAddressSubmit.ts:31`（注释）、`:72`、`:76`
- 描述：`t` 的文档注释仍写「仅用于残留端口释放告知，缺省不提示」，但本轮把它扩展为三个 key（新增 `browserLocalFileDesktopOnly` / `browserLocalFileUnsupported`）；且 `t` 缺省时并非「不提示」，而是 `showToast('', 'warning')` 弹出一个空提示条。与本 hook 主路径既有写法（`if (authed?.freedPort && t)`，panel:139）不一致——即「缺省不提示」的契约被新分支破坏。
- 证据：panel `:78` `useAppStore.getState().showToast(t?.browserLocalFileDesktopOnly ?? '', 'warning')`；center `:72` `state.showToast(t?.browserLocalFileDesktopOnly ?? '', 'warning')`；对照 panel `:139` `if (authed?.freedPort && t)`。当前两个生产调用点（`BrowserPanel.tsx:405`、`CenterBrowserView.tsx:185`）都传全量 `t`，线上暂不触发空提示，但注释与行为已失真。
- 建议修复：注释改为「本地文件提示 + 残留端口释放告知；缺省时不提示」，并把两处 toast 改成 `if (t) ...`（或把这两个 key 设为必传参数）。

### F2 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/app/features/center/useCenterBrowserAddressSubmit.ts:69-92`（本地文件分支）、`:126-132`（`await resolveDshAuthUrl`）、`:150-172`（await 后的写回）、`:158-161`（「后一次覆盖前一次」注释）
- 描述：中心 hook 的本地文件分支位于所有 `await` 之前，同步写 store 并导航；而该 hook 的 http 主路径刻意没有代际守卫。用户先提交一个 DSH 地址（在途 `await`）、紧接着提交本地文件时，前一次提交落定后会 `setAddress` + `browserUpdateTab` + `navigateTabInPool` 把本地文件结果覆盖掉，且 store URL 与 WebView 实际页面可能撕裂（谁后写谁生效）。这与 `:158-161` 声称的「用户连击即后一次覆盖前一次，last-wins 正确」相反——新分支让「较早的提交覆盖较晚的提交」成为可能。面板侧已由 rev2 F6 的代际守卫消除同类问题。
- 证据：`:127` `authed = await resolveDshAuthUrl(finalUrl)`；`:150` `setAddress(targetUrl)`；`:162-165` `browserUpdateTab(...)`；`:169` `navigateTabInPool(...)`；本地分支 `:79-90` 在任何 `await` 之前完成 store 写入。触发窗口窄（仅 Tauri + DSH 认证地址 + 随后本地文件），故记 low。
- 建议修复：本地文件分支落定后推进一个与面板同款的代际（或给该 hook 增加 `submitVersionRef`），主路径 `await` 后检查代际；若确认保留 last-wins，则把 `:158-161` 的注释限定为「同为主路径的连续提交」，并在进度文件记录该跨分支覆盖为已知限制。

### F3 [severity: low] [category: 安全]

- 位置：`adlo/src-tauri/src/commands/browser_webview_setup.rs:19-31`（`WEBVIEW_ADDITIONAL_ARGS`）、`adlo/src-tauri/tauri.conf.json:30`
- 描述：本轮把 `--allow-file-access-from-files` 加入共享默认 UDF 的**所有** webview（主窗口、面板、分隔条，另加中心/静默）。该开关放开 `file://` 页面读取任意本地文件（`fetch`/XHR/ES module），Chrome 默认关闭正是为此。常量注释只解释了「同一 UDF 环境选项必须逐字一致」，未说明该开关为何必需；而 UDF 一致性只要求各站点字符串相同，不依赖这个开关。
- 证据：常量 `:31`；`wry-0.55.1/src/webview2/mod.rs:294-322` 确认 `additional_browser_args` 被逐字使用（不再追加 `--autoplay-policy`/`--proxy-server` 等默认项，仓库未使用这两项，无实际损失）；`browser_events.rs:68` 已放行 `file`，本地页面内链接可继续导航到任意 `file://`，故「打开的本地 HTML 可读取同机其他文件」是可达到的状态。
- 建议修复：先验证普通本地 HTML（无 `fetch`/module）在**不加**该开关时能否正常渲染；若可以，直接删除该开关（一致性修复不依赖它）。若确有本地页面需要同目录 `fetch`，在常量注释写明用途，并在进度文件记录该安全权衡（当前进度文件只记录了「UDF 冲突」这一个理由）。

## 记录不修

- `shared/localFilePath.ts:41-57` `normalizeSegments` 的 `..` 归一/上溢（返回 `null` → 「不支持类型」toast）无直接用例；该模块无独立测试文件，仅经 `localFileInput.test.ts`（8 例）与 `openByMethod.test.ts`（UNC/盘符）间接覆盖。建议随下次改动补 `..` 与非法 `file://` 两例（可选优化，非行为缺陷）。
- `useBrowserPanelAddressSubmit.ts` 的 `pendingNavigationsRef` 只写不读（`handleNavigationStart` 仍 `add`，`useBrowserPanelMetaWiring` 保留参数但不再消费）：Task 9 遗留（预存），本轮本地文件分支每次提交多写一条；随接口清理一并删除。
- `ensureProtocol` 盘符分支现从生产不可达（两个提交 hook 均在其之前拦截本地路径）且不做百分号编码；已在 P5 台账（来源 R1 rev2），维持不修。
- `useBrowserPanelMetaWiring.ts:38` `_handlePageMeta` 别名（rev2 已记录不修，本轮未变）。
- `useBrowserPageMeta.test.ts` describe 标题仍写「http(s) guard」，本轮已扩展到 `file:`；仅命名，不影响断言。
- `docs/operations/ui-manual/rightpanel/tools/browser.md` 地址栏小节未提「可输入本地路径（仅桌面）」，现有描述未失真，属可选补充。
- `main.rs:101` 的 `file` page-ready 放行无单测（一次性 scheme 匹配；缺失时仍有兜底揭示定时器），维持现状。
- `useCenterBrowserAddressSubmit.ts:86` 本地分支内 `state.isTauri &&` 冗余（前一行已 return），与 rev2 记录同类，属风格。
- `useBrowserViewHost.test.ts` 的 `makeTab` 使用 `as unknown as BrowserTabState` 构造最小 tab（既有 helper），断言仍走公共 hook 与 bridge 调用，不属「私有方法/内部字段」空断言。

## 结论

- 需修复项：3（critical 0 / high 0 / medium 0 / low 3）
- rev2 F6 已关闭（用例可变异变红，入口与断言合法）；本地文件全链（识别 → 提交 → 事件/历史/地址栏 → 标题 → 揭示 → 下载抑制 → UDF 一致性）未见高/中等级新问题。
