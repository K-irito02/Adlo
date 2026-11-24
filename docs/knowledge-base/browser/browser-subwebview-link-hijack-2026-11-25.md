# 浏览器子 WebView 链接点击无反应：shell 插件劫持与站点 chrome 拦截（2026-11-25）

## 症状

在 DSH 的站内设置弹窗点击「更多账号信息 / 查询用量 / 充值」没有任何反应；同一页面在外部浏览器正常新开标签。部分站点（DSH、白名单智能体站点）的所有 `target="_blank"` 链接都受影响。

## 根因（两条叠加）

### 1. Tauri shell 插件吞掉子 WebView 的 `_blank` 链接

`tauri-plugin-shell` 会向每个 WebView 注入初始化脚本，在 `document.body` 的 click 冒泡阶段执行：

```js
if (a.target === '_blank' && /^https?:|^mailto:|^tel:/.test(a.href)) {
  invoke('plugin:shell|open', { path: a.href });
  event.preventDefault();
}
```

`capabilities/default.json` 的 `windows` 只有 `main`，浏览器子 WebView 没有 shell 权限，也没有可用的 `__TAURI_INTERNALS__`；`invoke` 被拒，但 `preventDefault()` 已经执行。`init_script.js` 的窗口冒泡新标签路由先判 `event.defaultPrevented`，于是永远拿不到事件。

**取证（真实 WebView2 + CDP）**

- `DOMDebugger.getEventListeners(document.body)` 返回 click/auxclick 的 `scriptId=10`，源码为 `…document.querySelector("body")?.addEventListener("click", … e("plugin:shell|open",{path:r.href}), t.preventDefault() …`。
- 点击后 `Event.preventDefault` 的调用栈为 `at HTMLBodyElement.<anonymous> (<anonymous>:1:396)`；`open-new-tab` 消息 0 条。
- Chromium（无 Tauri 注入）用同一 `init_script.js` 点击，得到 `{"type":"open-new-tab","url":"https://platform.deepseek.com/"}`。

**修复**：`init_script.js` 在 document-start 包裹 `EventTarget.prototype.addEventListener`，识别并跳过该 `plugin:shell|open` 监听器（`__adlBlockShellLinkHandler`）；同时保留 `__adlPatchShellOpen` 作为 Tauri 未来注入可用 internals 时的兜底。shell 插件自己的 `open` 命令（应用「外部打开」）不受影响。

### 2. 智能体站点链接拦截是全站范围

`__adlAgentClickHandler` 对白名单站点内任意 http(s) 锚点发送 `adl-agent-link` 并 `preventDefault()`，DSH 设置弹窗这类站点自身 UI 也被转成 agent 链接。

**修复**：新增 `__adlIsSiteChrome(el)`（dialog/alertdialog/menu/navigation、`aria-modal`、`data-menu-popup`、nav/header/footer/aside），命中时直接返回；窗口新标签路由对 agent host 的早退改为「仅非 chrome」早退。移除 agent 站点 `window.open` 的 URL 拦截（无 DOM 上下文，登录/反馈等保持原生），下载分支保留。

## 验证

- 单元：`initScriptNavigation.test.ts` 覆盖 shell 监听器跳过、普通监听器保留、`plugin:shell|open` → `open-new-tab`、站点 chrome 不被 agent 拦截。
- 真机（WebView2 + CDP）：DSH 0.2.3-alpha.2 设置 → 账号与余额，点击「更多账号信息」得到 `{"type":"open-new-tab","url":"https://platform.deepseek.com/"}`，中心新增「DeepSeek 开放平台」标签。

## 相关

- [ADR 0034](../../adr/0034-browser-subwebview-blank-links-own-the-tab.md)
- [browser-link-interception.md](./browser-link-interception.md)
- 实现：`adlo/crates/browser/src/init_script.js`
