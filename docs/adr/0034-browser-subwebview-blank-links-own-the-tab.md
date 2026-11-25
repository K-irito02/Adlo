# 浏览器子 WebView 的 `target=_blank` 由应用内新标签接管

## 背景

内置浏览器的每个标签是独立的 Tauri 子 WebView。`tauri-plugin-shell` 会向每个 WebView 注入一段初始化脚本，在 `document.body` 的 click 冒泡阶段拦截所有 `target="_blank"` 的 `http(s)/mailto/tel` 链接，调用 `plugin:shell|open` 并 `preventDefault()`。

`capabilities/default.json` 只授权 `main` 窗口（local context）。浏览器子 WebView 的 remote 页面不在其覆盖范围：https 页由 `capabilities/browser-remote.json` 覆盖（仅 `core:default`，无 `shell:open`）；http 页（如 DSH 的 `http://127.0.0.1:3080`）没有任何 capability 覆盖其 remote 源。两处的 `plugin:shell|open` 都被 ACL 拒绝，但 `preventDefault()` 已执行，导致 `init_script.js` 的窗口新标签路由永远收不到事件。用户看到的是「点击链接完全没反应」（2026-11-25 DSH 设置弹窗的账号/用量/充值链接）。

## 决定

1. **子 WebView 跳过 shell 插件的链接自动外开处理器**：`init_script.js` 在 document-start 包裹 `EventTarget.prototype.addEventListener`，当注册目标是 `click`/`auxclick` 且监听器源码包含 `plugin:shell|open` 时不注册。插件自身的 `open` 命令（应用「外部打开」用）不受影响。
2. **`target=_blank` 统一走应用内新标签**：保留 `init_script.js` 的 `open-new-tab` postMessage 通道（窗口冒泡 + `<area>` + 修饰键/中键），由 Rust `browser-open-new-tab` 事件交给 `browserOpenNewWindowTab`，按发起标签所在宿主落地。
3. **智能体站点拦截只作用于站点正文**：`__adlIsSiteChrome` 识别 dialog/alertdialog/menu/navigation、`aria-modal="true"`、`data-menu-popup`、`nav/header/footer/aside` 与原生 `<dialog>`；这些站点自身 UI 的链接不进入 `adl-agent-link`，保持原生新标签行为。`window.open` 的 agent URL 拦截移除（无 DOM 上下文，登录/反馈等入口保持原生）。

## 后果

- 浏览器子 WebView 的 `_blank` 链接稳定落到应用内标签；外部浏览器不再被 shell 插件静默唤起。
- 智能体对话正文中的链接仍按「打开方式」设置拦截；站点自身设置/导航链接不再被吞。
- `mailto:`/`tel:` 链接不再由 shell 插件外部打开（子 WebView 无权限）；当前保持原生导航，记录为已知限制。

## 相关

- 实现：`adlo/crates/browser/src/init_script.js`（`__adlBlockShellLinkHandler`、`__adlPatchShellOpen`、`__adlIsSiteChrome`）
- 测试：`frontend/src/app/features/browser/initScriptNavigation.test.ts`
- 事件契约：[ADR 0031](./0031-browser-new-window-follows-source-tab.md)
