# 开发者工具「点了没反应」与清理类命令的完成回执（2026-11-27）

## 现象

中心与右侧面板的「更多操作 → 开发者工具」点击后没有任何有效反应；以打包 release 版复现时尤其彻底。

## 两层根因（同时成立）

1. **目标错**：`invoke('plugin:webview|internal_toggle_devtools')` 不传 `label`。Tauri 2.11.6 `src/webview/plugin.rs` 的 `get_webview(webview, label)` 在 label 为空时回退为**发起 invoke 的 webview**——即承载 React UI 的应用壳。debug 版点击后打开的是 Adlo 自身 DOM 的 DevTools，不是网页的。页面实际在子 WebView `adl-browser-view-{tabId}` 里。
2. **命令不存在**：该命令被 `#[cfg(any(debug_assertions, feature = "devtools"))]` 包着；`src-tauri/Cargo.toml` 未开 `devtools` feature → release 构建连命令都没注册，invoke reject，被 `catch {}` 吞掉 → 用户侧「完全没反应」。

放大器：`catch {}` 让两种根因在 UI 上表现完全一致，无法靠现象区分；P0 用临时 `[DBG-devtools]` 埋点 + 用户当手点击，日志 `invoke: resolved` + 用户看到应用壳 DOM，才把两条分支钉死。

## 修法与可复用经验

- **按业务 id 定位 WebView**：标签页的操作一律以 `tabId` 从共享 WebView 池解析出句柄；不要依赖「当前调用方 webview」，中心/面板双宿主共用一套逻辑。
- **feature 与 WebView 默认值的因果**：补丁运行时在 `devtools` feature 下对未显式设置的 WebView 用 `unwrap_or(true)`，即**所有** WebView 默认开 inspector。`.devtools(true)` 只是把默认值写明；真正要做的是给应用壳、静默 WebView、分隔条 WebView 显式 `.devtools(false)`。写注释前先核对依赖源码，别把「显式 true」写成「只有这样才开」。
- **异步平台调用必须带完成回执**：CDP / `CookieManager` 都是「发出即返回」，回调里才知道成败。若命令也立即返回 Ok，前端只能把 resolve 当成功 → 清理失败仍弹「已清除」。本轮改为 `CleanupDone`（`mpsc::Sender<Result<(),String>>`）贯穿 trait→manager→命令，命令层 `await_cleanup` 用 `spawn_blocking` + 超时等回执，失败/超时回 `IpcResult` 错误。**异步操作不要把「派发成功」当「操作成功」**。
- **回调里再重载**：清理与重载是同一语义单元。四项清理（本站/全部 × Cookie/缓存）都在各自的完成回调之后对该标签发 `Page.reload{ignoreCache}`：Cookie 清完让页面内存里的登录态一起失效，缓存清完避免从没清掉的缓存里读回旧资源。超时上限要留足（实测清空全局 HTTP 缓存可达十余秒）。
- **WebView2 硬边界**：没有按 origin 清 HTTP 缓存的 API（CDP storage type 枚举里没有）；`is_devtools_open` 恒 false、`close_devtools` 空实现，所以是「打开开发者工具」而不是开关。
- **文案与实现逐句对齐**：`local_storage`/`IndexedDB` 常放会话 token，清站点缓存不能承诺「不影响登录」；站级 Cookie 的父域 cookie 会影响兄弟子域，不能写「只清单个网站」。审查里这类绝对断言反复出现，值得在写代码时就按「代码能证明什么」来写文案。

## 相关

- 决策：[ADR 0038](../../../adr/0038-browser-menu-devtools-and-cleanup-scope.md)
- 架构：[builtin-browser.md](../../../architecture/features/builtin-browser.md)
- 逐轮证据：[progress-2026-11-27-014042.md](../../../root-cause-to-close/2026-11/progress-2026-11-27-014042.md)
