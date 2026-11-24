# WebView2 / Tauri 嵌入式浏览器的身份可识别性

> **性质**：外部调研报告（只读）。未修改任何源码，未运行构建。
> **调研日期**：2026-11-23（下文所有"访问日期"字段同此）。
> **代码版本锚点**：`tauri 2.11.5`（`adlo/Cargo.lock:5385`）；`tauri-build::build()`，无 `AppManifest`（`adlo/src-tauri/build.rs:2`）；`withGlobalTauri: false`（`adlo/src-tauri/tauri.conf.json:37`）。
> **方法**：Tauri / WebView2 / Chromium / Google / Cloudflare 官方文档与 API reference；Tauri 仓库源码（tag `tauri-v2.11.5`）；GitHub Issue / PR / Security Advisory API 检索。社区帖子一律标注为未证实。

---

## 1. 结论摘要

### Q1 — 能否对"加载外部不可信 URL 的 webview"关闭 `isTauri` / `__TAURI_INTERNALS__` 注入？

**不能，没有任何 API。归类：`只能 patch` 或 `上游特性请求`。**

- Tauri 2.11.5 在 `WebviewManager::prepare_pending_webview()` 里**无条件**为每个 webview push 一段 `main_frame_script`，写死 `window.isTauri = true` 并初始化 `window.__TAURI_INTERNALS__`。紧接着 push 的 `invoke_initialization_script` 才是 IPC 实体。整段代码不接受任何配置开关。
- `WebviewAttributes`（`tauri-runtime/src/webview.rs`）字段清单里没有"关闭 IPC / 关闭注入"项；`app.security`（`SecurityConfig`）的 schema 是 `additionalProperties: false`，也没有对应键。
- `withGlobalTauri: false` 只关 `window.__TAURI__`（`@tauri-apps/api` 的全局包），与 `isTauri` / `__TAURI_INTERNALS__` 无关——这一点在源码里可确证。
- 上游立场明确：`isTauri` 是**公开文档化的 API**（`core.isTauri()`，PR #9539 引入）。社区曾请求把 `Tauri/2.0` 写进 User-Agent 以便服务端判定（issue #8247），维护者回复改为提供 `window.isTauri` 并关闭该 issue（`not_planned`）。也就是说，官方选择的方案正是"页面内可见的标记"。
- 可行的工程路径只有两条：(a) vendor / fork `tauri` crate 自行删改；(b) 提上游 PR 增加 per-webview 开关（例如"非 local origin 不注入"或 `ipc: false`）。Adlo 已经有 `crates/tauri-runtime-wry-patched` 的 path patch 先例，说明工程能力具备，但 `tauri` 本身仍来自 crates.io。

> **关键提醒**：只删 `isTauri` 而保留 `__TAURI_INTERNALS__`，指纹几乎不变，且仍持有 IPC 面。真正的开关必须同时切断 invoke 初始化脚本。

### Q2 — `window.chrome.webview` 能被移除或隐藏吗？

**不能，官方也没有任何建议这么做。**

- 它是 WebView2 **运行时注入的原生绑定**，不是 JS shim。官方 JS reference 的定义就是：`window.chrome.webview` 是"访问 WebView2 专有 API 的类"。
- 官方提供的"限制 WebView 能力"手段全是"关功能"，不是"删对象"：
  - `AreHostObjectsAllowed = false`（不给 host object 代理）
  - `IsWebMessageEnabled = false`（官方原文：此时 `postMessage` **抛 Error**，即对象仍在）
  - `IsScriptEnabled = false`（彻底不跑脚本，等于不能当浏览器用）
- 存在一个官方 issue 记录"`window.chrome.webview` 变成 undefined"的**异常**场景（企业策略 `DeveloperToolsAvailability=2`），但那是故障而非受支持的关闭方式，不可依赖。
- **不推荐**用 `delete window.chrome` / 改写 `Function.prototype.toString` 之类方式隐藏：MDN 记录的内建函数 `toString()` 契约（`function someName() { [native code] }`）与 `Object.getOwnPropertyDescriptor` 检查让这类伪装极易被识别为"规避行为"，通常比"诚实的嵌入式浏览器"更差。

### Q3 — WebView2 默认 UA 与 Edge 的差异 / Client Hints

**UA 字符串完全相同；因此 UA 不可能是 Adlo 被拦的原因。**

- 官方原文：`CoreWebView2Settings.UserAgent` — "The default value is the default User Agent of the Edge browser."
- 实际默认串（Microsoft 官方 Q&A 中由 Microsoft 外部员工给出的实例）：`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0` —— 与 Edge 桌面版逐字一致。
- **Adlo 侧现状**：浏览器 webview 的 `WebviewBuilder` **没有**调用 `.user_agent(...)`（全仓 grep 命中的 `USER_AGENT` 只用于 favicon / robots / meta 的 Rust HTTP 抓取，值形如 `Adlo/1.0 (+https://github.com/K-irito02/Adlo; MetaFetcher)`，不进 webview）。所以 Adlo 内置浏览器发出的 UA 就是上面那串 Edge UA。
- **修改 UA 是被官方支持的**（`Settings.UserAgent` / Tauri `userAgent` 配置），但官方同时写明副作用："Setting this property may clear User Agent Client Hints headers `Sec-CH-UA-*` and script values from `navigator.userAgentData`." —— 也就是说改 UA 会**制造 UA 与 UA-CH 不一致**这一新的、更醒目的指纹。
- 用命令行 `--user-agent` 改 UA 属于 WebView2 browser flags，官方明确："**For production apps, do not use these flags** ... might be removed or altered at any time, and aren't necessarily supported long-term."
- UA reduction 已完成（Chrome 101+/107+ 起小版本与 OS 版本归零），UA 本身信息量已经很低；UA-CH 才是结构化身份来源。

**结论**：不要动 UA。它既不是原因，改动还会引入新矛盾。

### Q4 — 远程页面暴露 IPC 全局的安全影响；`remote` capability 能否阻止实际调用？

分三层看，不能混为一谈：

1. **能不能调用** —— 默认**不能成功**。
   `Capability.remote` 的 schema 原文："This setting is optional and defaults to not being set, as our default use case is that the content is served from our local application." 未配 `remote` 的 capability 只对 local origin 生效（`RuntimeAuthority::Origin::matches` 要求 `Local↔Local` 或 `Remote{url}` 与 `ExecutionContext::Remote{url_pattern}` 匹配）。且"窗口不匹配任何 capability 时，它对 IPC 层完全没有访问权"。远程调用会被 runtime authority 拒绝，命令不会执行。
2. **有没有暴露** —— 暴露了。
   `__TAURI_INTERNALS__` 与 invoke key 都注入到远端页面，页面能发 IPC 请求（只是被拒）；`isTauri` / `__TAURI_INTERNALS__` / `chrome.webview` 三个对象本身就是可直接读取的指纹。Tauri 官方安全文档把 IPC 描述为"信任边界"，前提是"WebView 里的代码"整体可信——远程内容打破了这个前提。
3. **实际被利用的已公开案例** —— **有，且 Adlo 正处于受影响版本区间。**

   **GHSA-w28w-mhc8-qvjv（severity: high，2026-09-26）**
   - 受影响：`tauri >= 2.0.0, <= 2.11.5`；修复：`>= 2.11.6`。
   - 根因：`Webview::on_message()` 的 ACL 拒绝分支里，`plugin:__TAURI_CHANNEL__|fetch` 被显式豁免（`// TODO: Remove this special check in v3`）；channel 大响应队列是 **app 级共享**、ID 是**进程内 u32 自增**、fetch 只校验 renderer 自己提供的 `Tauri-Channel-Id` 头。
   - 原文："An attacker-controlled WebView with access to `window.__TAURI_INTERNALS__.invoke` can guess channel response IDs and retrieve queued payloads intended for another WebView."
   - 官方 PoC 正是 `WebviewUrl::External(attacker)` 的 webview 遍历 `0..10000` 偷另一个 webview 的 payload —— 与"应用内浏览器加载任意站点"的结构完全同构。
   - `adlo/Cargo.lock:5385` 是 `2.11.5`，**落在受影响区间**。

   **GHSA-7gmj-67g7-phm9 / CVE-2026-42184（Origin Confusion，medium）**
   - 受影响：`<= 2.11.0`；修复 `2.11.1`。Adlo 的 2.11.5 已修复（`is_local_url()` 改用 `strip_suffix(".localhost")`，见 `crates/tauri/src/webview/mod.rs:1728-1734`）。
   - 价值在于说明"远程页面能否打到 local-only 命令"是 Tauri 反复出现的真实攻击面，而不是理论问题。

   **PR #15266（merged 2026-05-04，已在 2.11.x 内）**
   - 修复前："Custom (non-plugin) commands registered via `invoke_handler` bypass ACL checks entirely when no `AppManifest` is configured ... if a webview navigates away from the bundled frontend to a remote URL, that remote page can invoke any custom IPC command without restriction."
   - 修复为 `if (plugin_command.is_some() || has_app_acl_manifest || !is_local)`。Adlo 的 `build.rs` 没有 `AppManifest`，正是这条修复前的"默认路径"；2.11.5 已包含该修复。

4. **`remote` capability 的实际防护力**：能挡住"业务命令"，但**挡不住** 2.11.6 之前那条 channel-fetch 豁免口，也挡不住"对象存在"这一事实。要更彻底：
   - 给远程/浏览类 webview 一个**不匹配任何 capability** 的 label（官方语义：完全无 IPC 访问权）；
   - 不给它任何插件（`dialog` / `shell` / `updater`）；
   - 评估 isolation pattern（官方："Tauri highly recommends using the isolation pattern whenever it can be used"，因为它拦截前端发往 core 的**所有**消息）。

### Q5 — 有没有一手资料说明 Google / Cloudflare 会检测"嵌入式浏览器"身份？

分三档，必须区分：

| 主体 | 官方是否承认"嵌入式浏览器"是被区别对待的一类 | 官方是否说"识别 Tauri/WebView2" |
| --- | --- | --- |
| **Google（OAuth 2.0）** | **是，白纸黑字** | 未点名具体框架，但定义口径覆盖了 Tauri |
| **Cloudflare** | **部分**（承认非标准 UA 会触发 BIC；承认有客户端 JS 指纹与 ML "browser signals"） | **否** |
| **Google 搜索 CAPTCHA / Bing** | **无任何官方文档** | **否** |

Google 官方 GitHub 级证据（OAuth 2.0 Policies，"Use secure browsers" 一节）：

> "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control. **Embedded user-agents include, but are not limited to, software libraries that allow a developer to insert arbitrary scripts, alter the default routing of a request to the Google OAuth server, or access session cookies.** All browsing environments must allow the user to verify the current connection to the Google OAuth server including the requested URI and connection security information."

配套的 2021 官方博客："All embedded webviews will be blocked starting on September 30, 2021."；错误码文档：`disallowed_useragent` = "The authorization endpoint is displayed inside an embedded user-agent disallowed by Google's OAuth 2.0 Policies."

**这条政策对 Adlo 的措辞高度贴合**：Adlo 的 init script 恰恰"insert arbitrary scripts"并且"alter the default routing of a request"（capture 阶段 `preventDefault` 后改用 `location.href` 重导航）。所以即使不谈 CAPTCHA，`accounts.google.com` 的登录流程本身就在政策上不欢迎这个环境。

Cloudflare 官方只承受到"有指纹引擎"这一层：
- Browser Integrity Check："looks for common HTTP headers abused most commonly by spammers ... also challenges visitors without a user agent or with a **non-standard user agent**"。→ 由于 Adlo 的 UA 就是标准 Edge UA，BIC 的 UA 维度解释不了现象。
- JavaScript Detections："identifies headless browsers and other malicious fingerprints. This engine performs a **lightweight, invisible JavaScript injection** on the client side of any request"。
- ML 引擎输入："Request features, including headers, session characteristics, and **browser signals**"。

→ **官方确认存在"会在页面里跑 JS 做指纹"的能力**，因此页面内可见的 `isTauri` / `__TAURI_INTERNALS__` / 被改写的 `Location.prototype.assign` 在原理上就是可采集信号；但**没有任何官方文档说 Cloudflare 对 WebView2/Tauri 有专门规则**。这条必须留在未证实项。

---

## 2. 证据表

### 2.1 Tauri 注入机制与 API 现状

| 结论 | 来源 URL | 访问日期 | 原文要点 / 引文 |
| --- | --- | --- | --- |
| 2.11.5 无条件注入 `isTauri` 与 `__TAURI_INTERNALS__`，无开关 | https://github.com/tauri-apps/tauri/blob/tauri-v2.11.5/crates/tauri/src/manager/webview.rs#L166-L180 | 2026-11-23 | `all_initialization_scripts.push(main_frame_script(r#"Object.defineProperty(window, 'isTauri', { value: true }); if (!window.__TAURI_INTERNALS__) { Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { plugins: {} } }) }"#));` —— 紧跟其后才是 `invoke_initialization_script` 与 `metadata`（含 `currentWindow` / `currentWebview` label） |
| `dev` 分支行为相同（未被"计划中"的改动修正） | https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/manager/webview.rs | 2026-11-23 | 同上代码块逐字存在 |
| `WebviewAttributes` 无"关闭 IPC / 关闭注入"字段 | https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime/src/webview.rs | 2026-11-23 | 字段含 `user_agent`、`initialization_scripts`、`data_directory`、`incognito`、`additional_browser_args`、`javascript_disabled` 等，**无** IPC/注入相关开关 |
| `app.security` 无相关配置键（schema 拒绝未知键） | https://github.com/tauri-apps/tauri/blob/tauri-v2.11.5/crates/tauri-schema-generator/schemas/config.schema.json | 2026-11-23 | `SecurityConfig` 属性仅 `csp` / `devCsp` / `freezePrototype` / `dangerousDisableAssetCspModification` / `assetProtocol` / `pattern` / `capabilities` / `headers`，且 `"additionalProperties": false` |
| `isTauri` 是官方公开 API（非内部实现细节） | https://v2.tauri.app/reference/javascript/api/namespacecore/ | 2026-11-23 | `core.isTauri()` 在命名空间文档中列为公开函数（"Since 2.0.0"） |
| 上游明确选择"页面内标记"而非 UA 标记；UA 方案被 `not_planned` 关闭 | https://github.com/tauri-apps/tauri/issues/8247 | 2026-11-23 | 请求："add 'Tauri/2.0' to original User Agent ... useful to decide whether the page is running on Tauri Environment"；维护者 amrbashir："you can just check if `window.__TAURI__` is defined in v1, probably in v2, we will add an explicit const like `window.isTauri`"；issue state `closed` / `not_planned` |
| Tauri 文档承认 Windows 上 init script 会注入子帧 | https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime/src/webview.rs | 2026-11-23 | `initialization_scripts` 文档："**Platform-specific** - **Windows:** scripts are always added to subframes." |

### 2.2 WebView2 的 `chrome.webview` 与官方安全口径

| 结论 | 来源 URL | 访问日期 | 原文要点 / 引文 |
| --- | --- | --- | --- |
| `window.chrome.webview` 是运行时注入的专有 API 类 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/javascript/webview | 2026-11-23 | "`window.chrome.webview` is the class to access the WebView2-specific APIs that are available to the script running within WebView2 Runtime." |
| 官方"限制能力"的手段是关功能，不是删对象 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security | 2026-11-23 | "Restrict web content functionality ... Set `AreHostObjectsAllowed` to `false` ... Set `IsWebMessageEnabled` to `false` ... Set `IsScriptEnabled` to `false` ..."（全文无任何"移除/隐藏 `chrome.webview`"的条目） |
| `IsWebMessageEnabled=false` 时对象仍在（只是 postMessage 抛错） | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2settings | 2026-11-23 | "If set to false, then communication is disallowed. `PostWebMessageAsJson` and `PostWebMessageAsString` fails with `E_ACCESSDENIED` and `window.chrome.webview.postMessage` fails by throwing an instance of an `Error` object. The default value is `TRUE`." |
| 官方要求把**所有**网页内容视为不可信，并点名 init script 的风险 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security | 2026-11-23 | "Treat all web content as insecure ... Be careful with `AddScriptToExecuteOnDocumentCreated`. **All future navigations run the same script, and if that script provides access to information that's intended only for a certain origin, any HTML document may have access to the native application's resources and APIs.**" |
| 官方建议按 origin 动态调整设置、必要时移除 host object | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security | 2026-11-23 | "Update settings based on the origin of the new page ... use the `NavigationStarting` and `FrameNavigationStarting` events to check page or frame navigation, and then conditionally block the navigation." / "When navigating to a new document, use the `ContentLoading` event and `RemoveHostObjectFromScript` to remove exposed host objects." |
| `chrome.webview` 变成 undefined 只出现在企业策略故障场景 | https://github.com/MicrosoftEdge/WebView2Feedback/issues/1890 | 2026-11-23 | 标题："Group Policy [`DeveloperToolsAvailability=2`] and `window.chrome.webview` is undefined"（state: closed）—— 属异常/故障，非受支持的关闭途径 |

### 2.3 UA / Client Hints

| 结论 | 来源 URL | 访问日期 | 原文要点 / 引文 |
| --- | --- | --- | --- |
| WebView2 默认 UA = Edge 桌面 UA | https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2settings.useragent | 2026-11-23 | "**The default value is the default User Agent of the Edge browser.** This property may be overridden if the User-Agent header is set in a request." |
| 实际默认串（逐字，含 `Edg/`） | https://learn.microsoft.com/en-us/answers/questions/5507942/setting-a-webview2-useragent-isnt-updated-in-the-n | 2026-11-23 | "the default User-Agent `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0`"（回答者标注为 Microsoft External Staff / Moderator） |
| 改 UA 会清空 UA-CH —— 制造新的不一致 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2settings | 2026-11-23 | "Setting this property may clear User Agent Client Hints headers `Sec-CH-UA-*` and script values from `navigator.userAgentData`. Current implementation behavior is subject to change." |
| 用 browser flag 改 UA 不适合生产 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags | 2026-11-23 | "**For production apps, do not use these flags.** ... Apps in production shouldn't use WebView2 browser flags, because these flags might be removed or altered at any time, and aren't necessarily supported long-term."（`user-agent` 在可用 flag 表中） |
| UA 已被削减（小版本/OS 版本归零），信息量低 | https://www.chromium.org/updates/ua-reduction/ ・ https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/User-agent_reduction | 2026-11-23 | 桌面最终形态：`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<major>.0.0.0 Safari/537.36`；minor/build/patch 恒为 0 |

### 2.4 IPC 暴露与 `remote` capability

| 结论 | 来源 URL | 访问日期 | 原文要点 / 引文 |
| --- | --- | --- | --- |
| `remote` 默认不启用；API 默认只对随包代码开放 | https://v2.tauri.app/security/capabilities/ | 2026-11-23 | "**By default the API is only accessible to bundled code shipped with the Tauri App.** To allow remote sources access to certain Tauri Commands it is possible to define this in the capability configuration file." |
| `remote` 字段语义与默认值 | https://github.com/tauri-apps/tauri/blob/tauri-v2.11.5/crates/tauri-schema-generator/schemas/config.schema.json | 2026-11-23 | "Configure remote URLs that can use the capability permissions. **This setting is optional and defaults to not being set, as our default use case is that the content is served from our local application.** Make sure you understand the security implications of providing remote sources with local system access." |
| 不匹配任何 capability ⇒ 完全无 IPC 访问权 | 同上（`Capability` 描述） | 2026-11-23 | "**If a webview or its window is not matching any capability then it has no access to the IPC layer at all.**" |
| 未授权时命令真的不执行 | https://v2.tauri.app/security/runtime-authority/ | 2026-11-23 | "If the origin is not allowed to call the command, the runtime authority will deny the request and the Tauri command is never invoked." |
| origin 分类来自请求的 `Origin` 头 | https://github.com/tauri-apps/tauri/blob/tauri-v2.11.5/crates/tauri/src/ipc/protocol.rs | 2026-11-23 | `.get("Origin").ok_or("missing Origin header")` → `Url::parse(...)` → `Origin::Local` / `Origin::Remote { url }`；`on_message` 再以 `is_local_url(&request.url)` 归类（`webview/mod.rs:1744`） |
| ACL 对远程 origin 强制生效（已含 PR #15266） | https://github.com/tauri-apps/tauri/blob/tauri-v2.11.5/crates/tauri/src/webview/mod.rs#L1819-L1827 | 2026-11-23 | `if (plugin_command.is_some() \|\| has_app_acl_manifest \|\| !is_local) // TODO: Remove this special check in v3 && request.cmd != crate::ipc::channel::FETCH_CHANNEL_DATA_COMMAND && invoke.acl.is_none()` → reject |
| 修复前：无 AppManifest 时远程页面可调用任意自定义命令 | https://github.com/tauri-apps/tauri/pull/15266 | 2026-11-23 | "Custom (non-plugin) commands registered via `invoke_handler` bypass ACL checks entirely when no `AppManifest` is configured in `build.rs`. This means if a webview navigates away from the bundled frontend to a remote URL, that remote page can invoke any custom IPC command without restriction."（merged 2026-05-04） |
| **GHSA-w28w-mhc8-qvjv（High）影响 `<= 2.11.5`，Adlo 正在区间内** | https://github.com/tauri-apps/tauri/security/advisories/GHSA-w28w-mhc8-qvjv | 2026-11-23 | "An attacker-controlled WebView with access to `window.__TAURI_INTERNALS__.invoke` can guess channel response IDs and retrieve queued payloads intended for another WebView."；`vulnerable_version_range: ">= 2.0.0, <= 2.11.5"`，`patched_versions: ">= 2.11.6"`，severity `high` |
| GHSA-7gmj-67g7-phm9（Origin Confusion，`<=2.11.0`）已由 2.11.1 修复 | https://github.com/advisories/GHSA-7gmj-67g7-phm9 | 2026-11-23 | CVE-2026-42184；"`is_local_url()` ... only checks the first subdomain of the URL ... `http://app.evil.com/` ... 被归类为 `Origin::Local`"；`>= 2.0.0, <= 2.11.0` → patched `2.11.1` |
| isolation pattern 是官方推荐的加固手段 | https://v2.tauri.app/concept/inter-process-communication/isolation/ | 2026-11-23 | "Tauri highly recommends using the isolation pattern whenever it can be used. Because the Isolation application intercepts ***all*** messages from the frontend, it can *always* be used." |
| Linux/Android 上 iframe 与窗口无法区分（Windows 不受此限） | https://v2.tauri.app/security/capabilities/ | 2026-11-23 | "On Linux and Android, Tauri is unable to distinguish between requests from an embedded `<iframe>` and the window itself." |

### 2.5 厂商对"嵌入式浏览器"的官方口径

| 结论 | 来源 URL | 访问日期 | 原文要点 / 引文 |
| --- | --- | --- | --- |
| Google OAuth 政策明文禁止开发者控制的嵌入式 user-agent，且定义覆盖"注入脚本 / 改写路由" | https://developers.google.com/identity/protocols/oauth2/policies | 2026-11-23 | "**Use secure browsers** — A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control. **Embedded user-agents include, but are not limited to, software libraries that allow a developer to insert arbitrary scripts, alter the default routing of a request to the Google OAuth server, or access session cookies.** All browsing environments must allow the user to verify the current connection to the Google OAuth server including the requested URI and connection security information." |
| Google 自 2021-09-30 起封禁所有 embedded webview | https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/ | 2026-11-23 | "we recently introduced a new secure browser policy prohibiting Google OAuth requests in embedded browser libraries commonly referred to as embedded webviews. **All embedded webviews will be blocked starting on September 30, 2021.**" |
| `disallowed_useragent` 错误语义 | https://developers.google.com/identity/protocols/oauth2/native-app | 2026-11-23 | "The authorization endpoint is displayed inside an embedded user-agent disallowed by Google's OAuth 2.0 Policies." |
| Cloudflare BIC 只针对"缺失或非标准 UA" | https://developers.cloudflare.com/waf/tools/browser-integrity-check/ | 2026-11-23 | "It also challenges visitors without a user agent or with a **non-standard user agent** such as commonly used by abusive bots, crawlers, or visitors." |
| Cloudflare 官方承认有客户端 JS 指纹引擎 | https://developers.cloudflare.com/bots/concepts/bot-score/ | 2026-11-23 | "The JavaScript Detections (JSD) engine identifies headless browsers and other malicious fingerprints. This engine performs a **lightweight, invisible JavaScript injection on the client side** of any request..." |
| Cloudflare ML 使用 "browser signals" | https://developers.cloudflare.com/bots/concepts/bot-score/ | 2026-11-23 | "Input variables (X): Request features, including headers, session characteristics, and **browser signals**, collected from traffic across the Cloudflare network." |

### 2.6 指纹可观测性的 Web 平台依据

| 结论 | 来源 URL | 访问日期 | 原文要点 / 引文 |
| --- | --- | --- | --- |
| 内建函数 `toString()` 必须返回 `[native code]`，被 JS 覆盖后即可检出 | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString | 2026-11-23 | "If the `toString()` method is called on built-in function objects ... then `toString()` returns a **native function string** which looks like `function someName() { [native code] }`." |
| `Sec-Fetch-User` 只在用户激活导航时出现 | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-User | 2026-11-23 | "The HTTP `Sec-Fetch-User` fetch metadata request header is sent for requests **initiated by user activation**, and its value is always `?1`. ... When a request is triggered by something other than a user activation, the spec requires browsers to **omit the header completely**." |

---

## 3. 本仓库现状核对（只读，用于适配评估）

以下为按当前工作树实测读到的事实（未改动任何文件）：

| 事实 | 位置 |
| --- | --- |
| `tauri` 锁定 2.11.5 | `adlo/Cargo.lock:5384-5387` |
| `build.rs` 只有 `tauri_build::build()`，无 `AppManifest` | `adlo/src-tauri/build.rs:1-3` |
| `withGlobalTauri: false`；`additionalBrowserArgs` 含 `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,MediaSessionService --allow-file-access-from-files` | `adlo/src-tauri/tauri.conf.json:30,37` |
| 浏览器 webview 用 `WebviewUrl::External(target)` + `.initialization_script(init_script)` 创建 | `adlo/src-tauri/src/commands/browser_webview_setup.rs:269-274`、`929-931` |
| 浏览器 webview **未**设置 `user_agent` ⇒ 使用 WebView2 默认（= Edge UA） | `browser_webview_setup.rs` 全程无 `.user_agent(...)`；`USER_AGENT` 常量仅用于 Rust HTTP 抓取（`browser.rs:1717-1722`） |
| 已对 `tauri-runtime-wry` 做 path patch（具备 vendor/patch Tauri 栈的工程先例） | `adlo/Cargo.toml:103` |
| init script 在 capture 阶段拦截所有 `<a>` 点击 → `preventDefault()` → 走 `__startNavGuard` → `location.href = href` | `adlo/crates/browser/src/init_script.js:360,437-449,666-690,324-330` |
| 重写 `window.open` | 同上 `:497-547` |
| 重写 `Location.prototype.assign` / `replace` | 同上 `:554-585` |
| 包装 `history.pushState` / `replaceState`（**两处**独立包装，双层） | 同上 `:646-661`、`:984-995` |
| 在 `document` **实例上**安装自有 `title` accessor | 同上 `:924-946` |
| 用 `chrome.webview.postMessage` 上报日志 / 链接 / title+favicon / 媒体状态 | 同上 `:3-14,30-36,339-345,789-802,1049-1056` |
| 向页面注入全局变量 `__adlAgentOrigins` / `__adlAgentInterceptEnabled` / `__adlAgentRules` / `__adlAgentOverridesByOrigin` / `__adlDownloadUrl` / `__startNavGuard` | 同上（多处） |
| 遗留死代码：`__adlSaveBlobDownload` 依赖 `window.__TAURI__.core.invoke`，但 `withGlobalTauri:false` 使 `__TAURI__` 不存在 | 同上 `:268-287` |

**这些事实共同说明**：Adlo 内置浏览器对每个站点都做了**可观测的运行时改写**（原型方法、自有访问器、全局变量、点击导航语义）。这比 `isTauri` 单一标记的指纹面大一个量级，且其中"capture 阶段 preventDefault + `location.href` 重导航"直接落在 Google OAuth 政策列举的"alter the default routing"口径上。

---

## 4. 对 Adlo 的适配评估

评分口径：可行性（能否做）/ 改动面（多少文件多少风险）/ 维护成本（每次 Tauri 升级的代价）/ 安全收益 / 合规。

### 方案 A — 升级 `tauri` 到 `>= 2.11.6`

| 维度 | 评估 |
| --- | --- |
| 可行性 | **高**（改 `Cargo.toml` 约束 + `cargo update -p tauri`） |
| 改动面 | 极小（1 处依赖 + 可能的 API 微调；注意 `crates/tauri-runtime-wry-patched` 需与新 `tauri-runtime-wry` 版本对齐） |
| 维护成本 | 无（收窄版本约束反而更省） |
| 安全收益 | **高**：关闭 GHSA-w28w-mhc8-qvjv 的公开 PoC 通道；该洞的利用前提正是"存在一个持有 `__TAURI_INTERNALS__` 的不可信 webview"，与 Adlo 形态完全同构 |
| 合规 | 无风险；属安全基线 |

> 这是**唯一不需要产品决策的必做项**。

### 方案 B — 让"外部浏览"webview 不持有 IPC（vendor patch 或上游 PR）

| 维度 | 评估 |
| --- | --- |
| 可行性 | **中**。上游无 API（已核实 2.11.5 与 `dev`）；需 fork `tauri` 或推动上游。Adlo 已有 `tauri-runtime-wry` path patch 先例，但 `tauri` 本体是 ~数万行 crate，vendoring 后每次升级都要 rebase |
| 改动面 | **大**。不仅要删 `isTauri` 与 `__TAURI_INTERNALS__` 的 3 段 `main_frame_script`（`isTauri`、invoke 初始化、`metadata`），还要跳过 `plugin_init_scripts` 与 `plugin_global_api_scripts`，否则插件 API 仍会自行挂载。设计上建议做成"按 `WebviewUrl::External` 或非 local origin 自动跳过"而非全局关 |
| 维护成本 | **高**（fork 路线）/ 低（上游接受后） |
| 安全收益 | **高**：把"远程页面持有 IPC 入口 + invoke key"这一整类风险（含未来的 channel/plugin 类洞）从根上消除；顺带缩小指纹 |
| 合规 | **正向**：符合 Microsoft "Treat all web content as insecure" 与"Be careful with `AddScriptToExecuteOnDocumentCreated`"的官方口径 |

**建议路径**：先向上游提 feature request（附 GHSA-w28w-mhc8-qvjv 动机 + "remote webview 不需要 IPC"用例），同时评估本地 vendor 的最小 patch 可行性。**不建议**在 patch 未落地前把"移除 isTauri"当成已完成的安全措施——没有 IPC 收口时，删标记只有隐私收益，没有安全收益。

### 方案 C — 隐藏/伪造指纹（`delete window.chrome`、重写 `toString`、伪造 `userAgentData`）

| 维度 | 评估 |
| --- | --- |
| 可行性 | 技术上可做，**但达成目标的可能性低** |
| 改动面 | **大**（要覆盖 `Function.prototype.toString`、property descriptor、`chrome` 对象、UA-CH，且每一层都要跟 WebView2 内部实现赛跑） |
| 维护成本 | **高**（WebView2 每次更新都可能让伪装出现破绽） |
| 安全收益 | **零**（不减少任何真实攻击面） |
| 合规 | **负向/灰色**：Google 政策把"允许开发者插入任意脚本"本身列为不可接受的特性；一个被识别为"正在规避检测"的客户端，其风险高于一个诚实的嵌入式浏览器 |

**结论：不采用。**

### 方案 D — 收窄 init script 注入面、恢复原生导航语义（不改任何"身份标记"）

| 维度 | 评估 |
| --- | --- |
| 可行性 | **高**。全部在 `adlo/crates/browser/src/init_script.js` + `browser_webview_setup.rs` 内 |
| 改动面 | **中**：<br>1) 按 origin 白名单/黑名单决定是否注入（搜索结果页、登录页不需要 meta 上报与下载拦截）<br>2) `<a>` 点击不再 `preventDefault` + `location.href`，交回原生导航；"新标签页"继续走已有的 `NewWindowRequested` → `new_window_handler` 管线（代码里已存在）<br>3) 移除对 `Location.prototype.assign/replace`、`window.open`、`history.pushState/replaceState` 的全局改写，改在 Rust 侧用 `navigation_handler` / `download_handler` 实现同等能力<br>4) `document.title` 不再用实例自有 accessor（改 MutationObserver 读 `<title>` 文本即可，现脚本已有 observer，可复用）<br>5) 全局变量收敛到单一命名空间对象（减少全局污染面与页面冲突） |
| 维护成本 | **中低**（JS 变薄，反而少踩站点兼容问题；但需回归双端行为一致性） |
| 安全收益 | **中**：减少"任意站点都能调用 `chrome.webview.postMessage` 触发宿主逻辑"的面；避免 click 拦截导致的 `event.isTrusted` 语义丢失 |
| 合规 | **正向**：直接对齐 Google 政策中"不得 alter the default routing"这一条，以及 WebView2 "update settings based on origin"的建议 |

> 这是**收益/成本比最高**的非安全项。它不保证降低 CAPTCHA 频率（无一手证据），但确定性地减少"我方造成的、可被任意站点观测到的异常"。

### 方案 E — 登录类流程改走系统浏览器

| 维度 | 评估 |
| --- | --- |
| 可行性 | **高**（已有 `shell` / opener 能力） |
| 改动面 | 小（识别 `accounts.google.com` / `login.microsoftonline.com` / 支付类域名 → 打开系统浏览器） |
| 维护成本 | 低（域名清单需维护） |
| 安全收益 | 中（凭据不再经过宿主的 WebView） |
| 合规 | **强正向**：这是 Google / IETF（OAuth 2.0 for Native Apps）唯一认可的路径 |

### 方案 F — 只做安全加固，不动身份

如果目标只是"别被打穿"，最小可行组合是：

1. 升级 `>= 2.11.6`（方案 A）；
2. 浏览类 webview 的 label **不匹配任何 capability**（官方语义：完全无 IPC 访问权），且不注册 `dialog` / `shell` / `updater` 插件；
3. 评估 isolation pattern 是否覆盖远程页面（官方称拦截**所有**前端 IPC 消息；但对"远程 origin + isolation"的组合缺一手实测数据，需先做验证）；
4. `navigation_handler` 对 `javascript:` / `data:` / `file:` 做白名单化（与现有 `is_local_url` 语义配合）。

---

## 5. 推荐与不推荐

### 推荐（按优先级）

| 优先级 | 动作 | 理由 |
| --- | --- | --- |
| **P0** | 升级 `tauri` 到 `>= 2.11.6` | GHSA-w28w-mhc8-qvjv（High）影响 `<= 2.11.5`，PoC 前提与 Adlo 形态同构；这是无争议的安全基线 |
| **P1** | 收窄 init script 注入面；`<a>` 点击恢复原生导航；移除对 `Location.prototype` / `window.open` / `history` 的全局改写 | 成本可控、合规正向、确定减少可观测异常；同时降低"任意站点触发宿主 postMessage 逻辑"的面 |
| **P1** | 浏览类 webview 不匹配任何 capability，不挂插件 | 官方语义即"完全无 IPC 访问权"；即使 `__TAURI_INTERNALS__` 仍存在，也打不到业务命令 |
| **P2** | 向上游提 feature request：`WebviewBuilder` 支持关闭 IPC 注入 / `WebviewUrl::External` 默认不注入 | 附 GHSA-w28w-mhc8-qvjv 与 WebView2 "Treat all web content as insecure" 作为动机，成功率高于"给 UA 加标记"（后者已被 #8247 拒绝） |
| **P2** | 实测 isolation pattern 对远程 origin webview 的覆盖度 | 若成立，则无需 fork 即可获得"远程页面 IPC 必经校验"的能力 |
| **P3** | 登录/支付类域名改走系统浏览器 | 对齐 Google OAuth 政策与 IETF 指南 |

### 不推荐

| 动作 | 原因 |
| --- | --- |
| 修改 User-Agent（含 `--user-agent` flag） | UA 与 Edge 逐字相同，不是原因；改 UA 会清空 UA-CH 制造新矛盾；browser flags 官方明确"生产不要用" |
| 伪造 / 隐藏 `window.chrome.webview` | 无官方途径；`IsWebMessageEnabled=false` 也只让 postMessage 抛错，对象仍在；伪装易被识别为规避 |
| 重写 `Function.prototype.toString` 等反检测 | 与 `[native code]` 契约冲突，暴露成本高于收益；不减少任何真实攻击面 |
| 给任何第三方站点配置 `remote` capability | 官方原文警告"understand the security implications of providing remote sources with local system access" |
| 假设"改 UA 就能减少人机验证" | 已被证据否定（UA 相同） |
| 在未升级到 2.11.6 前，把"删除 `isTauri`"当作安全加固 | 删标记无安全收益；`plugin:__TAURI_CHANNEL__\|fetch` 豁免口仍在 |

---

## 6. 未证实项清单

以下内容**没有**一手（官方 / 源码 / 厂商文档）证据支撑，不得当作事实使用：

| # | 未证实主张 | 现状 | 需要的验证手段 |
| --- | --- | --- | --- |
| 1 | Google 搜索 / Bing 把 `window.isTauri`、`__TAURI_INTERNALS__`、`chrome.webview` 作为 CAPTCHA 加权特征 | **无任何官方文档提及**。Google 只对 OAuth 明确表态，对搜索反滥用只字未提 | 同 IP / 同 profile 的 A/B：同一 URL、同一时间窗，比较"注入开启 vs 注入关闭（dev 构建手动剥离）"的 challenge 出现率；样本量需 ≥ 数十次 |
| 2 | WebView2 的 `navigator.userAgentData.brands` 与 Edge 桌面不同 | 未找到官方文档描述 WebView2 的 brand 列表；`UserAgent` 属性只说明 UA 串相同 | 本机 devtools 打印 `navigator.userAgentData.brands` / `getHighEntropyValues(['fullVersionList'])`，与同版本 Edge 对照 |
| 3 | "capture 阶段 `preventDefault` + `location.href` 重导航"会导致 `Sec-Fetch-User` 缺失或被降级 | 规范只说"非用户激活则不发"，未规定"用户激活内的脚本导航"如何取值；Chromium 实现细节未见文档 | 在 Adlo 内置浏览器与 Edge 中分别点击同一搜索结果，抓 `Sec-Fetch-*` / `Referer` / `Sec-Fetch-Site` 对比 |
| 4 | Cloudflare Bot Management 对 WebView2 / Tauri 有专门启发式规则 | 官方只承认"有指纹引擎"与"用 browser signals"，未列具体特征 | 无法从外部验证；只能观测自身 challenge 率 |
| 5 | WebView2 的 `window.chrome` 上除 `webview` 外是否还有 `runtime` / `loadTimes` / `csi` | 文档只列 `webview`；"没有其他"属于推断 | devtools 打印 `Object.keys(window.chrome)` 与同版本 Edge 对照 |
| 6 | 上游存在"per-webview 关闭 IPC"的在途 PR | 检索 tauri 仓库 issue/PR 未命中（仅命中 ACL 收紧类如 #15266）；不能排除未公开讨论 | 关注 tauri 仓库 `ipc` / `isTauri` 相关新 issue |
| 7 | 社区"Tauri 应用 Google 验证更频繁"的说法 | GitHub 检索 `captcha` / `human verification` / `google.com/sorry` / `unusual traffic` 在 tauri 仓库**零命中** | 目前只能定性为**传闻**，不作为结论依据 |
| 8 | "内置浏览器一定比 Edge 更容易触发 CAPTCHA" 这一前提本身 | 用户观察到的现象（体感），本次调研未做对照实验 | 需要方案 A/D 落地后重新采集数据，否则无法归因 |

---

## 7. 复现与验证建议（只读脚本，供 A/B 使用）

在 Adlo 内置浏览器打开任意 https 页面，devtools console 执行，可一次性列出"我方注入造成的可观测差异"，作为改动前基线：

```js
({
  isTauri: window.isTauri,
  internals: typeof window.__TAURI_INTERNALS__,
  chromeKeys: Object.keys(window.chrome || {}),
  webview: typeof window.chrome?.webview,
  ua: navigator.userAgent,
  uaBrands: navigator.userAgentData?.brands,
  assignNative: /\[native code\]/.test(String(Location.prototype.assign)),
  replaceNative: /\[native code\]/.test(String(Location.prototype.replace)),
  openNative: /\[native code\]/.test(String(window.open)),
  pushStateNative: /\[native code\]/.test(String(History.prototype.pushState)),
  titleOwnProp: Object.prototype.hasOwnProperty.call(document, 'title'),
  adlGlobals: Object.keys(window).filter(
    (k) => k.startsWith('__adl') || k === '__startNavGuard'
  ).sort(),
})
```

同一脚本在 Edge 中运行作为对照组，两组差异即为"可被任意站点读取的我方指纹面"。

---

## 8. 一句话总结

`isTauri` / `__TAURI_INTERNALS__` 的注入**只能改源码**（无 API，上游已明确选择"页面内标记"路线）；`chrome.webview` **不能移除**且官方不建议隐藏；**UA 与 Edge 完全相同，不是原因**；真正需要先处理的是 `tauri <= 2.11.5` 的 GHSA-w28w-mhc8-qvjv（High，PoC 结构与本项目同构），以及本项目自身在每页注入的大面积运行时改写（含把点击导航改成 `location.href`，措辞上正落在 Google OAuth 政策禁止的"alter the default routing"）。**没有任何一手证据表明 Google/Bing 会按 `isTauri` 或 WebView2 身份加分**——这条必须留在未证实清单里。
