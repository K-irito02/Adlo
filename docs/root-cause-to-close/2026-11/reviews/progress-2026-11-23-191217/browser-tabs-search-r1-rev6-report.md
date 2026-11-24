# browser-tabs-search R1 rev6 审查报告

## 范围

- 快照：`.review-diffs/manifest-rev6.md`（base `aced53d8`，78 文件），只看 rev6 完整快照；未运行 `git diff/log/show`，未跑任何测试套件，未启动 dev server / 浏览器 / headless（未占用任何端口，无残留进程）。
- 本 scope：`adlo/frontend/src/app/stores/slices/{browserTabsSlice.ts,browserSlice.ts,browserTypes.ts}`、`adlo/frontend/src/shared/ipc/browser.ts`、`adlo/frontend/src/app/stores/persisted/__tests__/composite.test.ts`、`adlo/frontend/src/app/features/browser/{browserPoolSingleton.ts,useBrowserViewHost.test.ts}`、`docs/adr/0001-browser-udf-isolation.md`（ADR 只核与代码一致性）。
- rev5→rev6 变更定位（对 `.review-diffs/*-rev5.diff` 与 `*-rev6.diff` 做 SHA256 比对，属只读快照核对）：本 scope 内仅 `browserTabsSlice.ts`、`shared/ipc/browser.ts` 两文件变化；`browserSlice.ts` / `browserTypes.ts` / `composite.test.ts` / `browserPoolSingleton.ts` / `useBrowserViewHost.test.ts` 与 rev5 逐字节一致。全快照另有 `init_script.js`、`webview2_postmessage.rs`、`initScriptNavigation.test.ts`、`browserDownloadsSlice.test.ts` 变化（下载文件名截断 / nav-guard 兜底，均不涉及 referrer 语义；referrer 相关函数与测试断言逐字节未变）。
- 为核对契约读到的相邻实现（仅证据）：`crates/browser/src/init_script.js:362-420`、`crates/browser/src/webview2_postmessage.rs:100-121,265-302`、`src-tauri/src/commands/browser_webview_setup.rs:114-173,186-245,1130-1156`、`frontend/src/app/stores/persisted/{composite.ts,registry.ts,hydrate.ts}`（沿用 rev5 结论）、`frontend/src/mock/mock-browser.ts:38`、`frontend/src/preview-bridge/index.ts:234`、`frontend/src/httpBridge.ts:928`、`frontend/src/tauri-bridge/tauri-browser.ts:141-146`。

## 上轮问题关闭情况

1. **rev5 F1（[low] referrer 注释缺「默认策略下」限定）→ 已关闭（存储 / 类型两处均真正修复）。**
   - 存储侧 `browserTabsSlice.ts:39-44` 现为「默认策略下同源为去 fragment 的完整 URL、跨源为 origin；transient，不持久化」；`:52` 现为「登记一次性 referrer（默认策略下同源完整 URL / 跨源 origin，由页面新窗口请求计算）」。
   - 类型侧 `shared/ipc/browser.ts:91-95`（`createForTab` 的 `referrer` 参数）现为「新标签首次导航的 `Referer` 值（默认策略下同源完整 URL / 跨源 origin；缺省不设置）」；`:52-57`（`BrowserNewTabRequest.referrer`）rev5 已带限定，本轮未变。
   - 与实现逐句可对上：`init_script.js:394-400` 的三条分支 —— `unsafe-url` / `no-referrer-when-downgrade` 跨源也给去 fragment 完整 URL、`origin` / `strict-origin` 同源也给 origin、其余（默认策略）才落到「同源去 fragment 完整 URL / 跨源 origin」；`:387-393` 的 `no-referrer` / `same-origin` 跨源 / HTTPS→HTTP 降级返回 `''`（不登记）。故限定词加对了方向：不加限定是过宽断言，加后成立。
   - `shared/ipc/browser.ts:52-57` 的「缺省（`null`，按无 referrer 处理）」也核对为真：`webview2_postmessage.rs:114-119` → `webview_event_bridge.rs:45-48` 用 `serde_json::json!({"referrer": referrer})`（`Option<&str>` → `null`）显式发送 null；「原生 `NewWindowRequested` 路径不携带该字段」由 `browser_webview_setup.rs:149-152,164-167` 只发 `{tabId,url}` 证实；「浏览器模式不携带」由 `mock-browser.ts:38` / `preview-bridge/index.ts:234` / `httpBridge.ts:928` 的 `onOpenNewTab` 空实现证实。
   - 口径唯一性：全仓 `grep` 未再发现「同源完整 URL / 跨源 origin」式无限定措辞，rev5 指出的「两套宽严」已收敛。
2. **rev4 主缺陷（消费端按标签快照而非全局设置）仍关闭，无退化。** `browserPoolSingleton.ts:97-99`（读 `browserTabsById[tabId]?.shareProfile`，`?? true` 仅缺省防御）与 `useBrowserViewHost.test.ts:162-196`（设置 true + 快照 false → 期望 false）逐字节未变；`browserTypes.ts:15-19`（快照字段 + 「挂起重建/恢复沿用」）与 `composite.test.ts:65-77`（水合往返保留 `shareProfile:false`）同样未变。建标签入口核对：`browserTabsSlice.ts:103`、`browserSlice.ts:112`、`:172` 三处均写 `shareProfile: state.browserShareProfile`；`browserOpenNewWindowTab`（`:165-182`）经 `browserOpenTab` 复用同一入口，无第四条创建路径（`sortOrder:` 新建点全仓只有这三处 + `browserReorderTabs` 的重排映射）。
3. **ADR 与代码一致性（仅核一致性，措辞交 P5）**：`docs/adr/0001-browser-udf-isolation.md:7,11,13` 的「默认共享 / 关闭后中心独立 UDF / 仅对之后新建标签生效、挂起重建与重启恢复沿用快照 / silent 仍独立」与 `browser_webview_setup.rs:201-213,225-245`（`center`+`share_profile` → 默认 UDF；`center` 单独 → `center`；`silent` → `silent`）及 `browserPoolSingleton.ts:98-99` 一致，未发现矛盾。

## 新增发现

无。本轮 scope 内的两处改动均为注释限定词（`默认策略下`），无行为、类型、持久化或测试变更；`browserTabReferrers` 的登记/消费/关闭剪枝路径（`browserTabsSlice.ts:165-199,234-240,353-362`）逐字节未变，rev5 已核。

## 记录不修

- `browserTabsSlice.ts:39-44`、`:52`、`shared/ipc/browser.ts:92` 未写「HTTPS→HTTP 降级 / `rel="noreferrer"` 不登记」的例外：这三处描述的是 `browserTabReferrers` **登记值的形状**（降级与显式 opt-out 在 `init_script.js:369-393` 就返回 `''`，`payload` 不带 referrer，映射中不会出现该情形），不是「所有导航的 referrer 语义」，因此不构成过宽断言；例外说明保留在 `shared/ipc/browser.ts:52-57` 一处即可。
- `useBrowserViewHost.test.ts:168` 的 `as never`（rev4/rev5 已记录）：测试类型卫生，可选清理。
- `browserPoolSingleton.ts:96` 在 `bridge.createForTab` 成功前消费 referrer（rev2/rev4/rev5 已记录）：create 抛错后该标签再激活将无 Referer；低频失败路径、lifecycle 不自动重试。
- `browserCloseAllTabs` 的 referrer 用例（`browserOpenNewWindowTab.test.ts:148-163`）仍只证明面板标签 referrer 被剪，未锁「保留的中心标签 referrer 不被误清」（rev2/rev3/rev5 已记录）。
- `browserTabReferrers[...]` / `browserTabsById[...]` 未走 `Object.hasOwn`（rev2/rev4/rev5 同结论）：键为 `createUiId('browser')` 产出的 `browser-<uuid>`，`__proto__` / `constructor` 不可达。
- `shareProfile?: boolean` 仍可选 + `browserPoolSingleton.ts:99` 的 `?? true`（rev4/rev5 已记录）：三处建标签入口均写快照，缺省只对无快照的历史值生效；未发布产品无迁移需求。
- `CenterTabStrip.tsx` 直接 `useSyncExternalStore(browserPool.subscribe, …)` 未复用 `useBrowserPool()`（rev2 已记录）；`titlebar.css` 的 `is-suspended` 计算样式证据仍由主代理按 brief §5.7 采集（不属本 scope）；`useWebViewLifecycle.ts` 的「共享模式下不再需要创建期隐藏另一宿主」属设计判断（rev2/rev4/rev5 已记录）。
- ADR / `docs/analysis/**` / progress 的事实与措辞按 manifest 交 P5；`.review-diffs/` 下本轮无 `claims-ack-rev6.md` 生成，新增注释已自带「默认策略下」限定（可由 `init_script.js:394-400` 证明），无绝对断言需逐条签核。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题；rev5 唯一 low 已关闭。
