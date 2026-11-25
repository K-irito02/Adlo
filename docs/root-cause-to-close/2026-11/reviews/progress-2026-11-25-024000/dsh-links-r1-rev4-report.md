# dsh-links — R1 rev4 定向复核报告

## 范围

- rev：rev4；scope：dsh-links（`adlo/crates/browser/src/init_script.js`、`adlo/frontend/src/app/App.tsx`、`adlo/frontend/src/app/features/browser/BrowserPanel.tsx`、`adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts`、`adlo/frontend/src/app/features/center/CenterBrowserView.tsx`）。
- 输入：`.review-diffs/manifest-rev4.md` + 上述 5 个 `-rev4.diff`；只比对 rev4 快照与 rev3 快照（均为相对同一 base 的累计 diff），未使用 `git diff/log/show`，未看增量/更早快照。
- 只读执行：未跑测试套件/门禁，未启动 dev server / 浏览器（无端口占用，无后台进程），未改源码/配置。
- **rev4 相对 rev3 的实际 delta = 两处注释块**（逐行 `Compare-Object` 复核：`init_script.js` diff +1 行、`initScriptNavigation.test.ts` diff +1 行，其余 hunk 仅行号位移；`App.tsx` / `BrowserPanel.tsx` / `CenterBrowserView.tsx` 的 rev4 diff 与 rev3 diff 完全相同）。故本轮复核重点是 rev3 F1 的措辞是否与实现/配置一致，以及该措辞/测试改动是否引入契约错误。

## 上轮问题关闭情况

1. **F1（注释把 `shell:open` 被拒的成因写错）— 已关闭。**
   - `init_script.js:447-452` 现为：「`browser-remote` covers only https origins (`remote.urls: ["https://*"]`, `core:default` only); http pages such as DSH's `http://127.0.0.1:3080` have no capability covering their remote origin. Both reject `plugin:shell|open` at the ACL…」；rev3 指出的「remote 页由 browser-remote 覆盖（暗示覆盖 http）」与「local http pages have no usable `__TAURI_INTERNALS__`」两句均已删除/改写，措辞与 rev3 建议一致。
   - `initScriptNavigation.test.ts:184-188` 同步为「`browser-remote` 只覆盖 https 源（`remote.urls: ["https://*"]`，仅 `core:default`）；http 页（DSH 的 `http://127.0.0.1:3080`）没有任何 capability 覆盖其 remote 源。两处 `plugin:shell|open` 都被 ACL 拒绝…」，且不再出现 internals 断言。
   - 逐条事实核对（均为只读源码/依赖源码）：
     - `capabilities/browser-remote.json:5-11`：`webviews: ["adl-browser-view-*"]`、`remote.urls: ["https://*"]`、`permissions: ["core:default"]` —— 「只覆盖 https 源、仅 core:default」成立。
     - `capabilities/default.json:5,24`：`windows: ["main"]`、无 `remote`，`shell:default` 只落在 local context；`tauri-2.11.6/src/ipc/authority.rs:57-66` 的 `Origin::matches` 要求 Local↔本地、Remote↔URL pattern 匹配，因此 main 窗口的 `shell:default` 不会授予 remote 页；`tauri.conf.json:8` devUrl 为 `127.0.0.1:5173`，`webview/mod.rs:1698-1713` 的 `is_local_url` 要求 scheme/host/port 相同，3080 页为 remote，`webview/mod.rs:1787-1793` 判 `Origin::Remote`。
     - `webview/mod.rs:1823-1827`：`plugin_command.is_some() || … || !is_local` 且 `invoke.acl.is_none()` 即 reject；`authority.rs:454-469` 无匹配 capability / 无匹配 permission 均返回 `None`。https 页（`browser-remote` 不含 `shell:open`）与 http 页（无 capability 覆盖 remote 源）都走同一条 ACL 拒绝路径，「Both reject … at the ACL」成立。
     - 附注：capability 文件全仓仅 `default.json` 与 `browser-remote.json` 两个，不存在其它覆盖 http remote 源的 capability，故「http 页没有任何 capability 覆盖其 remote 源」成立。
     - 「shell 插件的 body 点击处理器…preventDefault()」：`tauri-plugin-shell-2.3.6/src/init-iife.js`（`document.querySelector("body")?.addEventListener("click", …)`，命中 `a[target=_blank]` + `http(s)/mailto/tel` 后同步 `preventDefault()`）。
     - 「The shell plugin's open command (used by the app's openExternal) is unaffected」：`init_script.js` 只经 `browser_webview_setup.rs:280,308` 注入浏览器子 WebView（另 `divider_strip.rs` 用别的脚本），主窗口不注入；`tauri-window.ts:30-33` 的 `openExternal` 在主 WebView 直接 `shellModule.open(url)`，不经本脚本的 `addEventListener` guard，也不在 `__adlPatchShellOpen` 的 webview 内，成立。
   - 结论：成因链、capability 事实、注入范围三方面都与 rev3 建议一致，F1 关闭。

2. **无回归。**
   - rev4 在 scope 内的实际改动只有注释（见「范围」的 `Compare-Object` 结果），行为代码与 rev3 逐行一致；因此不存在行为回归。
   - 测试侧仅改注释，断言集合不变；marker 用例仍断言 `cmd === 'plugin:shell|open'`、`__adlShellOpenPatched`、`__adlPatchShellOpen`（`init_script.js:483,495,479` 均存在），删除性推演下若移除 patched invoke/marker 实现仍会变红。
   - 同 scope 其余三文件（`App.tsx:345` 的 `<DshPortConflictDialog />`、`BrowserPanel.tsx:246/456` 与 `CenterBrowserView.tsx:202` 的 `t.dshRecovering` 注释）与 rev3 快照一致，无新改动。

## 新增发现

本轮无新增需修复项（主表为空）。

## 记录不修

- `initScriptNavigation.test.ts:187-188` 沿用 rev3 的「原生新窗口路由无法执行」措辞：实际被阻断的还有 Adlo 自己的 JS 路由 `__adlRouteNewWindowEvent`（其入口检查 `event.defaultPrevented`），严格说不是「原生」WebView2 新窗口。语义上「preventDefault 后默认新窗口动作不执行」仍成立，且该措辞非 rev4 引入；按 rev≥2 收敛约定不移入主表。
- `browser-remote` 除 https 之外还限定 `webviews: ["adl-browser-view-*"]`，静默标签 `adl-silent-view-*` 即便在 https 也无 capability 覆盖；注释只写「covers only https origins」（必要条件陈述），结论「两处都被 ACL 拒绝」不受影响，属精度备注。
- rev3「记录不修」中的 pre-existing 项（`__adlPatchShellOpen` stub 分支无用例、`browser_webview.rs:322-326` 文档、旧用例标题、`useBrowserPanelHandlers.ts:17` 注释属 dsh-port scope）本轮未复核、不带入主表。
- `docs/**`（`builtin-browser.md`、knowledge-base、ADR 0034/0035、progress）的事实与措辞留给 P5，未计入本报告。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
