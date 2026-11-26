# frontend-menu — R1 rev5 定向复审报告

## 范围

- R1 rev5 只读定向复审；scope = `manifest-rev5.md` 的 `frontend` 分组（`adlo/frontend/**`，15 文件）。
- 审查基准：本轮快照 `*-rev5.diff`（base `2396ec4e…`，commits 0，代表 base→rev5 的完整累积状态）。未复用旧快照作结论，未运行 `git diff/log/show`，未修改任何源码/配置，未启动 dev server / 浏览器 / 后台进程，未跑测试套件。
- 本轮改动边界（用 rev4/rev5 快照文本与文件字节数定位，仅用于收敛 scope，不作审查主体）：frontend 15 文件中仅 3 个在 rev4→rev5 间变化 —— `app/i18n/en-US/browser.ts`、`app/i18n/zh-CN/browser.ts`、`features/browser/__tests__/useBrowserPanelMenuItems.test.tsx`；其余 12 个（含 `useBrowserPanelMenuItems.ts` 菜单逻辑、`BrowserMenuDropdown.tsx`、`BrowserPanel.tsx`、`useBrowserMenus.ts`、`useBrowserZoomState.ts`、`CenterBrowserView.tsx`、`httpBridge.ts`、`mock/mock-browser.ts`、`preview-bridge/index.ts`、`shared/ipc/browser.ts`、`tauri-bridge/tauri-browser.ts`、`tauri-bridge/tauri-shared.ts`）rev4/rev5 字节数与内容完全一致 → **菜单逻辑未改**，与用户描述一致。
- 为核对「文案 ↔ 后端实际行为」，只读了后端上下文（不属本 scope、不产 finding）：`crates/browser/src/webview2_cleanup.rs`、`crates/browser/src/webview2_reload.rs`、`src-tauri/src/commands/browser.rs`。
- 文档类（`docs/**`、治理文档）按简报 §2 不属 R1/R2 范围，P5 统一同步。

## 上轮问题关闭情况

- R1 rev4 零问题：本轮无「上轮主表 finding 未关闭」项可列。
- 按简报 §6 降噪约定（rev≥2）：主表只收「上轮 finding 未关闭」与「本轮修复引入的回归/契约错误」；rev1–rev4 累积改动（菜单重构、`runTabAction`/`zoomTo`、Cache i18n、toast 基础设施、键增删）一律不重开旧账。
- 「禁用项 hint 不可达」：沿用上轮结论，按 P5 延期，本轮不重开（见「记录不修」）。

## 新增发现

本轮零问题，无新增 finding。用户指定的 4 项定向核对逐条结论如下（附证据）。

**1）文案与后端实际行为一致（后端清理完成回调里确实发一次重载）——通过**

- 本轮改动的 4 处文案（仅 Cookie 两项，Cache 两项 rev4 已含相同措辞且本轮未改）：
  - `en-US/browser.ts:215-216` `browserToastSiteCookiesCleared` / `browserToastCookiesCleared` → `'…, reloading the page'`；`:206-209` 两条 Cookie hint → 追加 `'· The page reloads afterwards'`。
  - `zh-CN/browser.ts:203-204` 两条 Cookie toast → `'…正在重新加载页面'`；`:194-197` 两条 Cookie hint → 追加 `'· 清完会重新加载当前页面'`。
- 后端事实（工作区当前实现）：
  - `crates/browser/src/webview2_cleanup.rs:38-81` `clear_cookies`、`:97-200` `clear_site_cookies`、`:208-251` `clear_cache_and_reload`、`:260-315` `clear_site_data_and_reload` —— 四个入口**各自**在 CDP / `CookieManager` 完成回调里调用**一次** `crate::webview2_reload::reload_ignoring_cache(&core_for_cb)`（`:59`、`:179`、`:229`、`:293`），`webview2_reload.rs:16-52` 下发 `Page.reload{ignoreCache:true}`；随后 `done.send(Ok(()))`（`:65`、`:185`、`:235`、`:299`）。reload 失败则 `send(Err(...))`（`:61-63`、`:181-183`、`:231-233`、`:295-297`），不回执成功。
  - 回执时机：`src-tauri/src/commands/browser.rs:1797-1817` `await_cleanup` 阻塞等 `CleanupDone` channel；`:1820-1873` 四个命令（`browser_clear_cookies` / `browser_clear_site_cookies` / `browser_clear_cache` / `browser_clear_site_cache`）均 `await_cleanup(rx).await` 后才返回 `ipc(Ok(()))`。前端 `useBrowserPanelMenuItems.ts:54-73` `runTabAction` 仅在 `await action(tabId)` resolve 后显示 successMessage；失败经 `catch` 显示 `t.browserToastActionFailed`（`:64-69`）。
- 结论：成功 toast「正在重新加载页面 / reloading the page」只在「清理完成且重载已成功派发」后出现，失败如实报「操作失败」，无假承诺；hint 的「清完会重载」由完成回调里的一次重载兑现。Cookie 两项新需求（点击后重载当前标签）在后端确有其事，文案与之逐句相符。Cache 两项 rev4 已有同款措辞，与后端同样发 reload 一致，本轮未动、不重开。

**2）zh/en 键一致 —— 通过**

- 对两份 i18n 提取顶层键 `grep -oE '^  [A-Za-z_][A-Za-z0-9_]*:' | sort | diff`：en=356、zh=356，`diff` 输出为空 → 键集合完全一致。
- 本轮改动的 4 个键两端同名且均存在：`browserClearSiteCookiesHint` / `browserClearCookiesHint`（en `:206,208`，zh `:194,196`）、`browserToastSiteCookiesCleared` / `browserToastCookiesCleared`（en `:215,216`，zh `:203,204`）。

**3）没有绝对断言 —— 通过**

- 本轮新增/修改文案仅为进行态/将来态描述（「正在重新加载页面」「reloading the page」「清完会重新加载当前页面」「The page reloads afterwards」），不含「必然 / 总是 / 永远 / 不会 / 不可达 / 唯一 / 都会 / 一律 / 所有…都 / 全部…都」等绝对词；所述重载可由第 1 点的完成回调代码证明，符合简报 §5.8「不许把意图写成事实」（此处意图已被实现兑现）。
- `.review-diffs/` 下无 `claims-ack-rev5.md`：本轮无新增注释触发绝对断言清单。

**4）没有孤儿键 —— 通过**

- 本轮只改值、未增删键。改动的 4 个键在两端 i18n 均有定义，且均有读取点：`useBrowserPanelMenuItems.ts:126,131`（本站 Cookie label/toast）、`:138,143`（全站 Cookie hint/toast），测试 `useBrowserPanelMenuItems.test.tsx:131,143` 断言；另 `t.browserToastTabNotReady` / `browserToastActionFailed` 在 `:58-59` 与 `:119` 有读取点。
- 累积删除的键 `browserCopyCurrentUrl` / `browserCopyCurrentUrlHint` / `browserClearHistoryHint` / `browserNewTabFolder` / `browserMenuNewTab` 在 `adlo/frontend/src` 下 Grep 无任何匹配 → 无悬空引用、无孤儿键（`browserClearHistory` 标签仍保留，符合其未被删除的上下文）。

**附：测试 mockT 同步 —— 通过**

- rev4 `useBrowserPanelMenuItems.test.tsx:28-29` 为 `'已清除本站 Cookie'` / `'已清除全部 Cookie'`；rev5 工作区 `test.tsx:22-23` 已同步为 `'…正在重新加载页面'`（与 zh 当前值一致）。断言引用 `mockT.*` 变量（`:131,143`），同步后仍指向新文案；本轮为 i18n 文案改动，测试职责是验证「成功时显示对应 toast」，无需新增字符串断言，rev4 测试设计不重开。

## 记录不修

- 「禁用项 hint 不可达」：沿用上轮判定，按 P5 延期，本轮不重开（用户指示）。
- `docs/**`、治理/说明文档的事实与措辞：按简报 §2 不属 R1/R2 范围，P5 统一同步。
- 后端 `webview2_cleanup.rs` / `webview2_reload.rs` / `commands/browser.rs` 及 `backend`/`other` 分组：仅作「文案↔行为」一致性上下文读取，属他 scope，不产 finding。
- rev1–rev4 累积改动（菜单逻辑重构、Cache i18n、键增删、toast 基础设施）：R1 rev4 已零问题，按 §6 降噪约定不重开。
- i18n 文案不承载单元测试字符串断言（改用 `mockT.*` 变量引用）：rev4 既有设计，非本轮回归，不重开。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；**本轮零问题**。
- 4 项定向核对（文案↔后端行为、zh/en 键一致、无绝对断言、无孤儿键）与 mockT 同步均通过；菜单逻辑未改；P5 延期项未重开。
