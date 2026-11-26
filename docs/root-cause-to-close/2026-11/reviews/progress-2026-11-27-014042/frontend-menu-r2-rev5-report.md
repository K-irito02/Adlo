# frontend-menu R2 rev5 清理复审报告

## 范围

- 工作树 `E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`；只读复审，依据 `.review-diffs/manifest-rev5.md` 的 **frontend 分组（15 文件）** 及对应 `-rev5.diff` 快照；只看 rev5，未复用旧快照作结论、未看增量 diff 作审查主体。
- R2 透镜：死代码、多余守卫、根因修后不再需要的防御、应删/降级的诊断日志、无消费方导出与 i18n 孤儿键、重复逻辑。正当错误处理 / 系统边界校验 / 用户可见 toast 不标。
- 约束遵守：未执行 `git diff/log/show`；未改任何源码 / 配置；未跑测试套件（按简报 §1，用删除性推演判断测试有效性）；未启动 dev server / 浏览器 / headless Chrome / 后台进程（**未使用任何端口，无需关闭**）；未写临时脚本或临时文件（`cmp` 为只读命令，无输出文件）。仅读工作区源码作上下文核对。
- 增量定位（仅用于收敛 scope，不作审查主体）：用 `cmp` 逐文件对比 15 个 frontend 的 `-rev4.diff` / `-rev5.diff` 快照，仅 3 个变化 —— `app/i18n/en-US/browser.ts`、`app/i18n/zh-CN/browser.ts`、`features/browser/__tests__/useBrowserPanelMenuItems.test.tsx`；其余 12 个（含菜单逻辑 `useBrowserPanelMenuItems.ts`、`BrowserMenuDropdown.tsx`、`BrowserPanel.tsx`、`useBrowserMenus.ts`、`useBrowserZoomState.ts`、`CenterBrowserView.tsx`、`httpBridge.ts`、`mock/mock-browser.ts`、`preview-bridge/index.ts`、`shared/ipc/browser.ts`、`tauri-bridge/tauri-browser.ts`、`tauri-bridge/tauri-shared.ts`）**字节级完全一致 → 菜单实现未改**，与用户描述「本轮只改 Cookie 两项 hint/toast 与测试 mockT」一致。
- rev5 增量实况：en-US/zh-CN 的 `browserClearSiteCookiesHint` / `browserClearCookiesHint` 追加「清完会重新加载当前页面 / The page reloads afterwards」、`browserToastSiteCookiesCleared` / `browserToastCookiesCleared` 追加「正在重新加载页面 / reloading the page」；测试 `mockT` 同样两项 toast 由旧值同步为新值。仅改字符串值，未增删键。
- 上轮 R2 rev4 结论「零问题」；`docs/**` 按简报 §2 留给 P5。

## 上轮问题关闭情况（逐条）

- R2 rev4 主表零 finding，无「未关闭」项需逐条关闭。本轮针对同一批文件的 rev5 状态，从 R2 五透镜独立复核增量，未把 R1/R2 rev4 已判定的保留项重新计入。
- R2 rev4「记录不修」三项（tauri 侧 3 行适配器样板 / 三端 no-op、禁用项 hint 不可达 P5 延期、既有 `console.warn` 生产错误日志）本轮相关源码文件字节级未变，维持原判、不重开。
- 同 rev 的 `frontend-menu-r1-rev5-report.md` 已对 rev5 做过 R1 定向核对（文案↔后端行为、zh/en 键一致、无绝对断言、无孤儿键、mockT 同步）并判零问题；本轮为 R2 清理视角，结论互不替代但可交叉印证。

## 新增发现

无「需修复」项（含会改变行为 / 事实的 low）。按 R2 五透镜逐项核对 rev5 增量：

1. **死代码 / 无消费方导出**
   - 本轮只改 i18n 与测试 mock 的**字符串值**，未增删任何键、导出、函数或形参；12 个源码文件字节级未变。无新死代码。
   - 上轮已核实的 `requireIpcOk` / `errorCodeOf`、四端 `BrowserBridge` 方法均有消费方，本轮文件未变，不重开。

2. **多余守卫 / 根因修后不再需要的防御**
   - 增量仅涉及 i18n 文案与 mock 数据，不触及条件、守卫、可选链、回退分支；源码未变，无新增防御、无残留旧防御。

3. **应删 / 降级诊断日志**
   - 改动行均为 i18n 文案与测试 mock 字符串，无 `console.log/debug/info/warn/error` 新增。Grep 命中的 `tracing::info!` / `tracing::warn!` 属后端 `src-tauri/src/commands/browser.rs` 与 `tauri_webview_handle.rs` 的既有代码，不在 frontend scope、不在 rev5 增量内，按约定不标。用户可见的 success/error toast 亦非诊断日志。

4. **孤儿 i18n 键**
   - 键集合 rev4 = rev5（只改值、未增删键）。改动的 4 个键在 en / zh 两端同名且均存在，并均有读取点：`browserClearSiteCookiesHint` → `useBrowserPanelMenuItems.ts:126`、`browserClearCookiesHint` → `:138`、`browserToastSiteCookiesCleared` → `:131`、`browserToastCookiesCleared` → `:143`；测试以 `mockT.*` 变量引用（`:137`、`:149`）断言 toast 被显示。
   - 累积删除的键（`browserCopyCurrentUrl(Hint)` / `browserClearHistoryHint` / `browserNewTabFolder` / `browserMenuNewTab`）上轮已核实全库无残留引用，本轮未变。无死键 / 孤儿键。

5. **重复逻辑**
   - i18n 文案与 mock 为数据，未引入可执行逻辑；Cookie 两项与 Cache 两项措辞对齐属预期的一致性修复（同一后端 reload 行为用同一说法），不是可提取的重复逻辑。
   - 四端桥接 tauri 侧适配器样板与三端 no-op（上轮「记录不修」）本轮文件未变，不重开。

**附：通用强制项「文案与实现一致性」核对（R2 亦适用，错误文案属需修复 low）**

- 新增 / 修改文案声称「清完会重新加载页面 / The page reloads afterwards」「正在重新加载页面 / reloading the page」。本轮独立复核后端事实：`crates/browser/src/webview2_cleanup.rs:59`（`clear_cookies`）、`:179`（`clear_site_cookies`）、`:229`、`:293` 四个清理入口均在 CDP / `CookieManager` 完成回调里调用 `crate::webview2_reload::reload_ignoring_cache(&core_for_cb)` 下发 `Page.reload{ignoreCache:true}`；`src-tauri/src/commands/browser.rs:1860-1861` 注释「清除…Cookie…完成后重载该标签」，四个命令经 `await_cleanup(rx).await` 等到完成回调后才 `ipc(Ok(()))`；前端 `useBrowserPanelMenuItems.ts:50-60` 仅在 `await action(tabId)` resolve 后显示 success toast，失败走 `catch` 报 `browserToastActionFailed`。
- 结论：成功 toast 只在「清理完成且 reload 已派发」后出现，文案由实现兑现，非「把意图写成事实」；措辞为进行态 / 将来态，不含「必然 / 总是 / 永远 / 一律 / 都会」等绝对断言，符合简报 §5.8。无错误文案、无事实漂移。
- 测试 mockT 同步：rev4 两条 Cookie toast 为旧值，rev5 同步为与 zh-CN 一致的「…正在重新加载页面」；断言仍引用 `mockT.*` 变量，同步后指向新文案。i18n 文案不承载单元测试字符串断言（改用 `mockT.*` 变量）属 rev4 既有设计，R1 rev5 已记「记录不修」，非本轮回归，不重开。

## 记录不修

- 四端桥接 tauri 侧 3 行同形适配器样板、三端 `Promise.resolve()` no-op 各写一遍：可选 DRY 优化，抽后弱化「哪些能力桌面专属」可读性，上轮已判定，本轮文件未变，不重开。
- 「禁用项 hint 触发器不可达」：P5 延期，沿用上轮结论。
- i18n 文案不承载单元测试字符串断言、`mockT` 部分键（如 `browserToastTabNotReady` / `browserToastActionFailed`）沿用 rev4 简写值而非精确复制真实文案：mock 常规做法，测试断言引用变量不影响有效性，rev4 既有设计，非本轮回归。
- rev1–rev4 累积改动（菜单逻辑重构、Cache i18n、键增删、toast 基础设施）：R1/R2 rev4 已零问题，按简报 §6 降噪约定不重开。
- `docs/**`、治理 / 说明文档的事实与措辞：按简报 §2 不属 R1/R2 范围，P5 统一同步。
- 后端 `webview2_cleanup.rs` / `webview2_reload.rs` / `commands/browser.rs` / `tauri_webview_handle.rs` 及 `backend` / `other` 分组：仅作「文案↔行为」一致性上下文读取，属他 scope，不产 finding。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；**本轮零问题**。
- R2 五透镜无新增清理问题；Cookie 两项 hint/toast 与测试 mockT 同步未引入死代码、多余守卫、诊断日志、孤儿 i18n 键或重复逻辑；菜单实现未改，文案与后端 reload 行为逐句相符，上轮保留项未重开。
