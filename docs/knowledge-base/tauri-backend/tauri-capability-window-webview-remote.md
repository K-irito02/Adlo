# Tauri 2 子 WebView：capability、remote 源与 internals — 2026-11-25

排查「浏览器子 WebView 里的 `target=_blank` 链接点击无反应」时，最容易把三个独立机制混成一句话：窗口/WebView 匹配、remote 源匹配、internals 注入。它们不是同一件事。

## 事实（tauri 2.11.6 / tauri-plugin-shell 2.3.6）

- capability 按窗口/WebView 与来源两个维度匹配。`src-tauri/capabilities/default.json` 只列 `windows: ["main"]` 且没有 `remote`，因此只覆盖 local context。
- `src-tauri/capabilities/browser-remote.json` 用 `webviews: ["adl-browser-view-*"]` 加 `remote.urls: ["https://*"]`，权限只有 `core:default`。
- 浏览器子 WebView 位于 `main` 窗口内，但 remote 页面走 remote 授权：`https` 页由 `browser-remote` 覆盖；`http` 页（例如 DSH 的 `http://127.0.0.1:3080`）没有任何 capability 覆盖其 remote 源。
- `__TAURI_INTERNALS__` 与 invoke 初始化脚本对每个 webview 无条件注入，不区分 `http`/`https`。
- 没有匹配 capability 时 `ipc::authority::resolve_access` 返回 `None`；`plugin` 命令（如 `plugin:shell|open`）或非 local 页面在 ACL 为空时直接 reject。

结论：`plugin:shell|open` 被拒是**来源没有 capability**，不是「没有 internals」，也不是「窗口不匹配」。

## 排查顺序

1. 先判断页面是 local 还是 remote：scheme/host/port 必须与 `tauri.conf.json` 的 `devUrl` 完全相同才算 local。
2. 确认命令是否 `plugin` 命令；再看目标 WebView 的 capability identifier 是否列在 `windows` 或 `webviews`。
3. remote 页面检查 `remote.urls` 是否按 scheme 覆盖；`http://*` 与 `https://*` 是两份独立模式。
4. 用 `DOMDebugger.getEventListeners(document.body)` 或断点确认 `preventDefault()` 是否先于应用内新标签路由执行。

## 关联

- [ADR 0034](../../adr/0034-browser-subwebview-blank-links-own-the-tab.md) — 子 WebView 的 `target=_blank` 由应用内新标签接管
- `adlo/src-tauri/capabilities/default.json`、`browser-remote.json`
- [browser-subwebview-link-hijack-2026-11-25.md](../browser/browser-subwebview-link-hijack-2026-11-25.md)
