# 0038 浏览器「更多操作」菜单：按标签定位 DevTools、清理站点化、重载只影响当前标签

- Status: Accepted
- Date: 2026-11-27
- Domain: 内置浏览器 / 桌面宿主

## Context

「更多操作」菜单里「开发者工具」点击后长期没有任何有效反应：

1. 实现直接 `invoke('plugin:webview|internal_toggle_devtools')` 且不传 `label`。Tauri 2 的该命令在 `label` 为空时回退为**发起 invoke 的 webview**，也就是应用壳，不是标签页的子 WebView（label `adl-browser-view-{tabId}`）。实测 debug 版点击后打开的是 Adlo 自身 UI 的 DevTools。
2. 该命令被 `#[cfg(any(debug_assertions, feature = "devtools"))]` 门控，而 `src-tauri` 未开 `devtools` feature：发布版连命令都没注册，invoke 直接 reject，被 `catch {}` 吞掉，用户侧表现为「完全没反应」。
3. 菜单其余项目也有同类假承诺：「强制刷新」实际是 `location.reload()`；「清除 Cookie/缓存」明明是全局 CDP 命令，文案却像只清当前标签；浏览器预览模式的缩放会缩放整个应用 UI。

WebView2 本身还有两条硬边界：无法通过 CDP 按 origin 清 HTTP 缓存（`Storage.clearDataForOrigin` 的 storage type 枚举里没有 HTTP cache）；`is_devtools_open` 恒 false、`close_devtools` 是空实现，做不到「再点一次关闭」。

## Decision

1. **按 tab 定位**：新增 `browser_open_devtools` / `browser_hard_reload_tab` / `browser_clear_site_cache` 命令，全部以 `tab_id` 经 WebView 池解析出该标签的 WebViewHandle。中心与右侧面板共用同一 hook 和同一池，因此两宿主天然一致，不需要分支。
2. **发布版能力精确到 WebView**：`adlo` 的 `devtools` feature 进 `default`。补丁运行时对未显式设置的 WebView 回落为 `unwrap_or(true)`，所以逐个显式关闭应用壳窗口（`tauri.conf.json`）、静默 WebView、分隔条 WebView；可见标签页 WebView 的 `.devtools(true)` 只是把该默认值写在发生地。
3. **清理拆分与完成回执**：Cookie 分「本站/全部」，缓存分「本站/全部」。本站 Cookie 走原生 `CookieManager.GetCookies("")` + 域名过滤（含父域，父域 cookie 被删会影响同父域兄弟子域）；本站缓存走 `Storage.clearDataForOrigin`，显式排除 cookies 但包含 local_storage / IndexedDB / Service Worker 等，因此不能承诺「不影响登录」。平台侧在 CDP/CookieManager 完成回调里通过 `CleanupDone` 回执，命令层 `await_cleanup`（spawn_blocking + 超时）等真实结果后再返回；失败/超时回 `IpcResult` 错误，前端才弹成功 toast。
4. **四项清理完成后重载仅限本标签**：Cookie 两项与缓存两项都在各自的完成回调里对该标签 WebView 发一次 `Page.reload{ignoreCache}`。另一宿主的前台标签和所有后台标签都不是这次调用的接收方，因此不会被重载；重载未发出时回执错误，不报成功。
5. **菜单收敛**：删除「复制网址」（地址栏已有复制按钮）与「清除历史」（历史面板自带删除入口）；Cookie 两项相邻、缓存两项相邻，两组之间一条分隔线；四项 hint 首行用一句话说清作用范围，桌面专属项统一标注「仅桌面版支持」。
6. **强制刷新**：CDP `Page.reload{ignoreCache}`；平台没有该能力或派发失败时退化为普通刷新并记 warn，不对外宣称「已忽略缓存」。

## Alternatives considered

- **复用 Tauri 内置 `internal_toggle_devtools` 并传 `label`**：label 要的是 webview label，前端只有 tabId，且命令在发布版不存在；需要按 tab 自建命令。
- **启用全局 `devtools` feature 后不做逐 WebView 关闭**：会把离屏静默 WebView、分隔条、应用壳都暴露 inspector，超出需求范围。
- **清理动作发出即返回、toast 直接报成功**：改动最小，但 CDP/CookieManager 失败时会谎报成功，与本轮要消除的假承诺同类。
- **按 origin 实现「本站 HTTP 缓存清理」**：Chromium 不提供该能力；只能清站点数据缓存，并在 hint 中明说边界。
- **浏览器预览模式继续用 `document.documentElement.style.zoom`**：缩放的是整个应用 UI，与「缩放当前页面」语义不符，改为禁用。

## Consequences

- 「开发者工具」是打开**独立 DevTools 窗口**（WebView2 形态），不是可开/关的面板；Webview2 下无法查询关闭状态，重复点击只会再次打开。
- 应用壳窗口在 debug/release 都不开放 inspector；开发期需要检查壳 UI 时须临时把 `tauri.conf.json` 的 `devtools` 改为 `true`。
- 清理类命令在 CDP 慢时可能等待较久（实测清空全局 HTTP 缓存可达十余秒），超时上限 20s；超时返回错误。
- 站点 Cookie 清理按域名（含父域）匹配，同父域兄弟子域会一并失去该 cookie；这是 cookie 作用域本身决定的。
- Cookie / 缓存清理都是全局或站点级数据操作，不做确认弹窗；成功/失败通过 toast 反馈。
- 排障与逐轮审查见 [progress-2026-11-27-014042.md](../root-cause-to-close/2026-11/progress-2026-11-27-014042.md)。
