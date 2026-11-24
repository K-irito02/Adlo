# WebView2 Profile 隔离与原生事件能力调研

> **体裁**：外部调研（只读，不改源码）。以 Microsoft Learn、WebView2Feedback、SDK/Runtime Release Notes 为准。
> **访问日期**：2026-11-23（全部来源同日访问）。
> **背景**：Adlo 为避免多子 WebView 的主题闪烁，把「面板 / 中间区 / 静默抓取」拆成三个独立 WebView2 用户数据目录（UDF），代价是 cookie/登录态不共享；代码注释引用 WebView2Feedback #4920 说明只能按 UDF 隔离。

---

## 0. 结论摘要

1. **#4920 仍未修复**。截至 2026-11-23，Issue 状态 `Open`、标签 `bug`、指派 `peiche-ms`，自 2024-11-15 指派后无后续回复、无修复版本标记；最新 Release SDK **1.0.4314.35**（Runtime 156）、最新 Prerelease SDK **1.0.4365-prerelease**（Runtime 158）、最新正式 Runtime **157.0.4341.42** 的 release notes 均无 `PreferredColorScheme`/profile 相关修复条目。**没有"最低可用版本"可给**——只有"尚不可用"。
2. **同一 UDF 可以创建多个 `CoreWebView2Profile`**（`CoreWebView2ControllerOptions.ProfileName`，SDK **1.0.1210.39** 起）。profile 级隔离：cookie、缓存、站点数据、下载目录、InPrivate、扩展。环境级共享：一个 UDF = 一个浏览器进程 + 一套 `CoreWebView2EnvironmentOptions`（`AdditionalBrowserArguments`、`Language`、`TargetCompatibleBrowserVersion` 等对所有 profile 生效）。控制器级：`ProfileName`、`IsInPrivateModeEnabled`、`ScriptLocale`。
3. **跨 profile / 跨 UDF 共享登录态没有官方方案**。只有 `ICoreWebView2CookieManager`（`GetCookies` / `AddOrUpdateCookie` / `CreateCookie` / `DeleteCookies`），作用域是"当前 profile"，没有"环境级 cookie manager"，也没有 cookie 变更事件；官方文档只把多 profile 描述为**隔离**手段，从未描述共享手段。
4. **原生事件无法完整替代 JS 包装**。`DocumentTitleChanged` / `NewWindowRequested` / `DownloadStarting` / `NavigationStarting` 能覆盖标题、新标签、下载、链接导航；但 **`SourceChanged` 文档明确说明不为 `history.pushState`（同 URL）触发**，`HistoryChanged` 只表达"联合会话历史变化"，不提供"当前 URL 文本"语义。**SPA URL 仍必须靠 JS 包装 `pushState`/`replaceState`**（Adlo 现有做法正确）。
5. **浏览器扩展可用**（`ICoreWebView2Profile7.AddBrowserExtension`，SDK **1.0.2210.55** / Runtime **116** 起），要求 `AreBrowserExtensionsEnabled = true`、加载**解包目录**（含 `manifest.json`）。可用于拦截类扩展（WebExtensions 的 `declarativeNetRequest` 等），但**没有任何 UI 入口**（无工具栏图标、无 popup、无 badge 宿主），且扩展是 **profile 级**持久化。
6. **与"会话连续性/身份一致性"相关的环境选项**：`Language`（语言/Accept-Language 基线）、`AllowSingleSignOnUsingOSPrimaryAccount`（AAD/MSA 单点登录）、`TargetCompatibleBrowserVersion`（版本门槛）、`AdditionalBrowserArguments`（仅测试/诊断用途的浏览器开关）。UA 不在环境选项里，而在 `CoreWebView2Settings.UserAgent`（每个 WebView 一份，且自定义 UA 会清空 `navigator.userAgentData.brands`）。

---

## 1. 证据表

| # | 结论 | 来源 URL | 访问日期 | 原文要点 |
| --- | --- | --- | --- | --- |
| E1 | #4920 仍 Open、bug、已指派、无修复 | https://github.com/MicrosoftEdge/WebView2Feedback/issues/4920 | 2026-11-23 | 标题 `[Problem/Bug]: Profiles vs PreferredColorScheme #4920`；状态 `Open`；Labels `bug`；Assignee `JC (peiche-ms)`；开于 2024-11-12；活动仅两条（2024-11-12 打标签、2024-11-15 指派），**至今无 MSFT 回复或修复声明** |
| E2 | 报告者结论：同一环境内 `PreferredColorScheme` 是"最后一次设置生效"，跨 profile 互相影响 | 同上 | 2026-11-23 | "In the sample app, setting `CoreWebView2.Profile.PreferredColorScheme` sets the `PreferredColorScheme` for **all** profiles, not just the current profile."；"This issue is also present in Edge. If I open two Edge windows using two different profiles, they both use whichever appearance I set last."；Runtime `130.0.2849.56`，SDK `1.0.2895.0-prerelease` |
| E3 | 文档仍宣称 profile 级语义（与实测不符，未被修正） | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile | 2026-11-23 | "The PreferredColorScheme property sets the overall color scheme of the **WebView2s associated with this profile**."；"This sets the color scheme for WebView2 UI like dialogs, prompts, and context menus by setting the media feature `prefers-color-scheme`"；默认 `AUTO` 跟随 OS；接口 Introduced `1.0.1210.39` |
| E4 | 最新 SDK/Runtime 列表（无相关修复条目） | https://learn.microsoft.com/en-us/microsoft-edge/webview2/release-notes/sdk 与 https://learn.microsoft.com/en-us/microsoft-edge/webview2/release-notes/runtime | 2026-11-23 | SDK：`1.0.4365-prerelease`(Runtime 158, 2026-10-28)、`1.0.4314.35`(Runtime 156, 2026-10-23)、`1.0.4258.31`(Runtime 154, 2026-09-28)… Runtime：`158.0.4370.1`(preview, 2026-11-05)、`157.0.4341.42`(2026-11-06)、`156.0.4314.42`… |
| E5 | 最新两个 Release SDK 页只声明兼容 Runtime，未列任何新 API/修复 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/release-notes/sdk/1-0-4314-35 与 `.../1-0-4258-31` | 2026-11-23 | 仅："For full API compatibility, this Release version of the WebView2 SDK requires WebView2 Runtime 156.0.4314.42 (Oct. 23, 2026) or later."（4258.31 同构，对应 Runtime 154） |
| E6 | 一个 UDF 可承载多个 profile（官方专文） | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/multi-profile-support | 2026-11-23 | "Multiple profile support enables a WebView2 app to have multiple profiles under a single user data folder."；"Each profile has a dedicated profile folder to save browser data, which provides separate browsing data storage for each user, such as **cookies, user preference settings, and cached resources**. All the WebView2 controls that are associated with the same user profile share a single profile folder." |
| E7 | 旧方案（多 UDF）资源代价 | 同上 | 2026-11-23 | "you must run multiple WebView2 runtime instances (each including a browser process and a bunch of child processes), which consumed more system resources including memory, CPU footprint, and disk space." |
| E8 | Profile 创建入口与选项 | 同上 | 2026-11-23 | "The `CreateCoreWebView2ControllerOptions` method on `CoreWebView2Environment` creates an options object, `CoreWebView2ControllerOptions`, to provide specific information about a profile, including `ProfileName` and `IsInPrivateModeEnabled`."；"If the specified profile doesn't exist, a new profile will be created." |
| E9 | 多 profile API 的最低 SDK 版本 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2environment10（及 `icorewebview2controlleroptions`、`icorewebview2_13`） | 2026-11-23 | "Applies to: WebView2 Win32 | **1.0.1210.39** | Prerelease 1.0.1222"（三个接口同版本：Environment10 / ControllerOptions / ICoreWebView2_13 取 `Profile`） |
| E10 | 官方"UDF 共享"建议与风险边界 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder | 2026-11-23 | "WebView2 control instances can share the same user data folders (UDFs)"…"Have WebView2 controls with different profiles, to separate browser data storage such as cookies, permissions, and cached resources under the same UDF."；"Each WebView2 browser process consumes additional memory and disk space. Therefore, avoid running a WebView2 control with too many different UDFs at the same time." |
| E11 | UDF ↔ 会话 ↔ 进程是一一对应 | 同上 | 2026-11-23 | "Each WebView2 session has exactly one UDF. A UDF can only have at most one WebView2 session at a time."；"A WebView2 control shares its WebView2 session with any other WebView2 control that uses the same UDF." |
| E12 | Cookie API 是 **profile 作用域**，非环境作用域 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2cookiemanager | 2026-11-23 | "The changes would apply to the context of the user profile. That is, other WebViews under the same user profile could be affected."；`DeleteAllCookies`："Deletes all cookies under the same profile."；`GetCookies(uri, handler)`："If uri is empty string or null, all cookies under the same profile are returned."；Introduce `1.0.705.50` |
| E13 | Cookie 可编程复制（跨 profile 的唯一务实路径） | 同上 | 2026-11-23 | 成员含 `CreateCookie(name,value,domain,path)`、`AddOrUpdateCookie(cookie)`、`CopyCookie(cookieParam)`、`DeleteCookies(name,uri)`、`DeleteCookiesWithDomainAndPath`；"You can modify the cookie objects by calling `ICoreWebView2CookieManager::AddOrUpdateCookie`, and the changes will be applied to the webview." |
| E14 | 导航事件标准序列（含 SourceChanged/HistoryChanged 定位） | https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/navigation-events | 2026-11-23 | 序列：`NavigationStarting` → `SourceChanged` → `ContentLoading` → `HistoryChanged` → (`BasicAuthenticationRequested`) → `DOMContentLoaded` → `NavigationCompleted`；"Same-document navigation events, such as navigating to a fragment in the same document, don't cause a `NavigationStarting` event to be fired, and don't cause the Navigation ID to change." |
| E15 | **SourceChanged 不覆盖 pushState（关键否定证据）** | https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.sourcechanged | 2026-11-23 | Remarks："SourceChanged is raised when navigating to a different site or fragment navigations. **It is not raised for other types of navigations such as page refreshes or `history.pushState` with the same URL as the current page.**" |
| E16 | HistoryChanged 语义 = 会话历史变化，不承诺提供 URL | https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.historychanged | 2026-11-23 | "HistoryChanged is raised for changes to **joint session history**, which consists of top-level and manual frame navigations."；"Use HistoryChanged to verify that the `CanGoBack` or `CanGoForward` value has changed." |
| E17 | SPA 返回/前进不更新 `DocumentTitle` 的 bug **已修**（Runtime 100+） | https://github.com/MicrosoftEdge/WebView2Feedback/issues/2055 | 2026-11-23 | 标题 "…DocumentTitle not updated on back/forward navigation in Single-Page Apps"；状态 `Closed`（completed）；MSFT（champnic, 2022-02-19）："This should be fixed in runtimes **100.0.1167.0+**." |
| E18 | `DocumentTitleChanged` 语义（含时序不定） | https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.documenttitlechanged | 2026-11-23 | "DocumentTitleChanged is raised when the `DocumentTitle` property changes and **may be raised before or after** the `NavigationCompleted` event." |
| E19 | `DownloadStarting` 版本与拦截能力 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_4 | 2026-11-23 | ICoreWebView2_4（Introduced **1.0.902.49**）："This event is raised when a download has begun, blocking the default download dialog, but not blocking the progress of the download. The host can choose to cancel a download, change the result file path, and hide the default download dialog." |
| E20 | 扩展 API：版本、启用开关、加载方式 | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile7 | 2026-11-23 | ICoreWebView2Profile7（Introduced **1.0.2210.55**）："Adds the browser extension using the extension path for **unpacked** extensions from the local device."；`AreBrowserExtensionsEnabled` 为 FALSE 时返回 `ERROR_NOT_SUPPORTED`；"When an extension is added the extension is persisted in the corresponding profile." |
| E21 | 扩展的能力边界：无宿主 UI | 同上 | 2026-11-23 | "Extensions that are designed to include any UI interactions (e.g. icon, badge, pop up, etc.) **can be loaded and used but will have missing UI entry points** due to the lack of browser UI elements to host these entry points in WebView2."；"changing the content of the extension will cause the extension to be removed from the installed profile" |
| E22 | SDK 侧首次引入扩展支持的 release notes 条目 | https://github.com/MicrosoftDocs/edge-developer/blob/main/microsoft-edge/webview2/release-notes/sdk/1-0-2210-55.md（检索摘要） | 2026-11-23 | 小节 "Support for browser extensions in WebView2"：「Supports browser extensions in WebView2.」 |
| E23 | 环境选项：SSO 语义（AAD/MSA） | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2environmentoptions（检索摘要） | 2026-11-23 | "The `AllowSingleSignOnUsingOSPrimaryAccount` property is used to enable single sign on with **Azure Active Directory (AAD) and personal Microsoft Account**"；社区复述（#3529）：仅对集成微软登录机制的站点生效，不适用时被忽略 |
| E24 | 环境选项：`Language` / `TargetCompatibleBrowserVersion` / `AdditionalBrowserArguments` | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2environmentoptions（检索摘要） | 2026-11-23 | "Gets or sets the **additional browser arguments** to change the behavior of the WebView."；"`TargetCompatibleBrowserVersion` … the version of the WebView2 Runtime binaries **required to be compatible** with your app. This defaults to the …"；UDF 页示例把 `Language` 作为第三个构造参数传入 `CoreWebView2EnvironmentOptions(null, Language, null)` |
| E25 | 自定义 UA 的副作用（身份一致性风险） | https://github.com/MicrosoftEdge/WebView2Feedback/issues/2576 | 2026-11-23 | 标题 "Setting `UserAgent` empties `navigator.userAgentData` brands"；报告版本 SDK 1.0.1264.42 / Runtime 103 |
| E26 | UA 是"导航已开始后才生效"的已知约束 | https://learn.microsoft.com/en-ca/answers/questions/5507942/setting-a-webview2-useragent-isnt-updated-in-the-n（Q&A） | 2026-11-23 | 报告现象：在 `NavigationStarting` 中读到的仍是默认 UA（`… Edg/138.0.0.0`），自定义值尚未反映到该请求 |

---

## 2. 逐项分析

### 2.1 #4920 现状与"修没修"

| 判断 | 依据 | 结论强度 |
| --- | --- | --- |
| Issue 未关闭、无修复声明 | E1 | 强（状态可复核） |
| 最新 SDK / Runtime 无相关修复条目 | E4、E5 | 中强（release notes 只列增量；未列 = 未见修复，而非证明未修） |
| 文档语义未改（仍写 profile 级） | E3 | 强 |
| 无"最低可用版本" | 以上综合 | 强（给不出，因为不存在） |

补充判读：#4920 同时指出 **Edge 浏览器本身**也复现（两个 Edge 窗口用不同 profile，谁最后设置谁生效）。这意味着问题不在 WebView2 封装层，而在共享的 Chromium/Edge 主题决策路径上——因此"等 SDK 升级就好"的预期不成立；**跨 profile 的主题隔离在可预见版本内不可依赖**。

对 Adlo 的直接含义：**"拆三个 UDF 换主题稳定"这个取舍目前仍然必要**，且不是"临时脏活"，而是跟随上游 bug 的长期约束。

### 2.2 Profile / 环境 / 控制器三层模型

```
UDF（磁盘目录，= 一个 WebView2 session = 一个浏览器进程 + 子进程集合）
└─ CoreWebView2Environment（一套 CoreWebView2EnvironmentOptions，进程级共享）
   ├─ Profile "panel"    ← CoreWebView2ControllerOptions.ProfileName
   │  ├─ CoreWebView2 (WebView A)  ── CoreWebView2Settings (UA 等)
   │  └─ CoreWebView2 (WebView B)  ── 同一 profile：cookie/缓存/权限共享
   ├─ Profile "center"
   └─ Profile "silent"
```

| 资源 | 环境级 | profile 级 | 控制器 / WebView 级 | 证据 |
| --- | --- | --- | --- | --- |
| cookie | ✗ | ✓（同 profile 内所有 WebView 共享） | ✗ | E6、E12 |
| HTTP/磁盘缓存 | ✗ | ✓（profile 目录内的 cached resources） | ✗ | E6 |
| 站点数据（localStorage/IndexedDB 等） | ✗ | ✓（`AllSite`/`AllProfile` 清除维度即 profile 维度） | ✗ | E6、E10 |
| 权限（geolocation/notifications…） | ✗ | ✓（"permissions" 属 profile 数据） | ✗ | E10 |
| 下载目录 | ✗ | ✓（`Profile.DefaultDownloadFolderPath`） | ✗ | E3 |
| InPrivate | ✗ | ✓（`IsInPrivateModeEnabled`） | ✗ | E8 |
| 扩展 | ✗ | ✓（随 profile 持久化） | ✗ | E20 |
| 主题 `PreferredColorScheme` | **实际是环境级（bug）** | 名义 profile 级 | ✗（控制器方式反而读到 `Auto`） | E1、E2、E3 |
| UA | ✗ | ✗ | ✓ `CoreWebView2Settings.UserAgent` | E25、E26 |
| `AdditionalBrowserArguments` / `Language` / `TargetCompatibleBrowserVersion` | ✓（整进程） | ✗ | ✗ | E24 |
| `ScriptLocale` | ✗ | ✗ | ✓（`CoreWebView2ControllerOptions.ScriptLocale`） | E9（同版本族） |

**要点**：UDF 与 profile 都是"隔离单元"，但**只有 UDF 隔离进程**。同一 UDF 内换 profile 不增加进程，正是官方推荐多 profile 的理由（E7）；代价是任何"环境级"缺陷（如 #4920）会同时命中所有 profile。

### 2.3 跨 profile / 跨 UDF 共享登录态

- **没有官方共享机制**：`ICoreWebView2CookieManager` 挂在 `CoreWebView2` 上，但作用域是 profile（E12）；`CoreWebView2Environment` 不提供 cookie manager。官方多 profile 文档通篇是"分离"，未提"共享"（E6）。
- **唯一务实路径 = 显式搬运**：`GetCookies(uri)` 读出 `ICoreWebView2Cookie` 列表 → `AddOrUpdateCookie`（或 `CreateCookie` + 设属性）写入另一 profile 的 CookieManager（E13）。
- **必须自建触发时机**：文档没有 cookie 变更事件（无 `CookieChanged`）。可选触发点：`NavigationStarting` 前注入、`NavigationCompleted` 后回写、定时轮询、或业务侧"登录成功"信号。
- **搬运的固有损耗**：`HttpOnly`、`Secure`、`SameSite`、`Domain`、`Expires`、`Path` 需逐项复制；`GetCookies` 按 URI 过滤时**可能漏掉其它子域**（传空串可取全部，但那是全 profile 全站，不适合细粒度同步）；分区/第三方 cookie 语义无法完整还原。

### 2.4 原生事件 vs JS 包装（覆盖矩阵）

| 需求 | 原生事件 | 是否够用 | 说明 |
| --- | --- | --- | --- |
| 标题同步 | `DocumentTitleChanged` + `DocumentTitle` | ✅ 够用 | 标题变化即触发；Runtime ≥100 已修 SPA 返回/前进不更新（E17、E18）。时序可能早于 `NavigationCompleted`，需容忍 |
| SPA URL 变化（pushState/replaceState） | `SourceChanged` | ❌ 不够 | 文档明确不为 `history.pushState`（同 URL）触发（E15）；`history.pushState` 到**不同** URL 是否触发，文档措辞含糊（见 §5 U1） |
| 历史栈变化 / 前进后退可用性 | `HistoryChanged` | ⚠️ 部分 | 只表达"联合会话历史变化"，用于 `CanGoBack/CanGoForward`；不提供 URL 文本（E16）。可当"地址可能变了，去读一次 `location.href`"的触发器，但读 URL 仍需 JS |
| 新窗口 / 新标签 | `NewWindowRequested` | ✅ 够用 | 可 `Handled=true` 接管并在应用内建标签；不做处理时默认行为不可控 |
| 下载 | `DownloadStarting`（+ `DownloadOperation`） | ✅ 够用 | 可取消/改路径/隐藏默认对话框（E19） |
| 点击链接导航 / 拦截跳转 | `NavigationStarting` | ✅ 够用 | 可 `Cancel`；注意**不能改请求头**（官方 note：You are not able to modify the HTTP request headers in a `NavigationStarting` event） |
| iframe 内导航 | `FrameNavigationStarting` / `FrameCreated` | ✅ 够用 | `FrameCreated` 在 ICoreWebView2_4（1.0.902.49）；`FrameNavigationStarting` 在基线 `ICoreWebView2` 上 |
| 请求级干预（改头 / 注入 cookie / 拦广告） | `WebResourceRequested` | ⚠️ 有条件 | 必须先 `AddWebResourceRequestedFilter` 才会触发；同步阻塞网络线程，滥用会拖慢页面 |
| 页面内 DOM/标题/URL 细节 | 无 | ❌ | 只能 `ExecuteScriptAsync` 或注入初始脚本 |

**结论**：Adlo 现有分工（原生 `DocumentTitleChanged` 拿标题 + 原生 `HistoryChanged` 当 SPA 副信号 + 注入脚本包 `pushState` 拿 URL）是当前**唯一正确的组合**；把 URL 完全交给原生事件会退化成"URL 不更新"。

### 2.5 浏览器扩展

| 维度 | 事实 | 证据 |
| --- | --- | --- |
| 最低版本 | SDK **1.0.2210.55**（Runtime **116**） | E20 |
| 启用方式 | `CoreWebView2EnvironmentOptions.AreBrowserExtensionsEnabled = true` | E20 |
| 加载方式 | 本地**解包目录**（顶层目录含 `manifest.json`），无商店安装、无 crx 直装 | E20 |
| 作用域 | profile 级，随 profile 持久化；同 Id 后装覆盖先装 | E20 |
| UI | 无工具栏图标 / badge / popup 宿主；此类扩展"能跑但缺入口" | E21 |
| 稳定性 | 改动扩展目录内容会导致该扩展被卸载 | E21 |
| 对"像浏览器"身份 | 提升有限：用户无法感知/管理扩展，没有扩展入口就意味着"隐身扩展"，与浏览器身份叙事不匹配 | 综合 E20/E21 |

**能否用于 cookie 同意 / 广告拦截**：技术上可以——`declarativeNetRequest`/`webRequest` 类拦截型扩展不依赖 UI 入口；但工程上要接受"扩展是静态目录、随 profile 持久化、更新即重装"，且拦截规则无法在运行时通过 WebView2 API 直接编排（只能改目录内容 → 触发卸载重装）。

### 2.6 环境选项与"会话连续性/身份一致性"

| 选项 | 作用域 | 与身份/连续性的关系 | 证据 |
| --- | --- | --- | --- |
| `Language` | 环境（整进程） | 决定 `Accept-Language` 与脚本 locale 基线；**改它会改变服务端返回的本地化内容**，跨端（浏览器模式）需对齐 | E24 |
| `TargetCompatibleBrowserVersion` | 环境 | 版本门槛：声明"本应用要求 ≥ 该 Runtime 版本"，避免老 Runtime 上 API 缺失导致行为分叉 | E24 |
| `AllowSingleSignOnUsingOSPrimaryAccount` | 环境 | **会话连续性最强的一项**：允许 AAD/MSA 用 OS 主账户静默登录；不适用时被忽略（不报错） | E23 |
| `AdditionalBrowserArguments` | 环境（整进程） | 官方定位是**测试 forthcoming 功能/诊断**，不是产品功能开关；会同时影响所有 profile，破坏"每面板独立"的心智 | E24 |
| `UserAgent`（`CoreWebView2Settings`） | 控制器/WebView | 自定义后 `navigator.userAgentData.brands` 变空 → 站点可能判定"非标准浏览器"，与"像浏览器"目标冲突 | E25 |
| `ScriptLocale`（`CoreWebView2ControllerOptions`） | 控制器 | 仅影响 `navigator.language` 等脚本侧 locale，可做"每面板语言独立" | E9 |

**关键结构性事实**：一个 UDF 只有一套环境选项。**想让"面板/中间区/静默抓取"拥有不同 `Language`、不同 `AdditionalBrowserArguments`，就只能拆 UDF**——这一点与 #4920 无关，是模型本身决定的。

---

## 3. 对 Adlo 的适配评估

### 3.1 代码现状（只读核对）

| 事实 | 位置 | 含义 |
| --- | --- | --- |
| 每个 WebView 通过 `builder.data_directory(dir)` 指定 UDF，静默抓取另有 `webview_data_directory(&app_inner, Some("silent"))` | `adlo/src-tauri/src/commands/browser.rs:76-97, 227-228` | 多 UDF 是 Tauri 层选择；Tauri 未暴露 `ProfileName`，所以"多 profile"在 Tauri 里没有直接入口 |
| 已直接用 `webview2-com 0.38` + `windows 0.61` 操作原生接口 | `adlo/crates/browser/Cargo.toml:35-36` | 具备直连 `ICoreWebView2Environment10` 的能力，不必等 Tauri |
| 已有原生 `DocumentTitleChanged` handler（Method 3） | `adlo/crates/browser/src/webview2_title.rs` | 标题同步已走原生 |
| 已有原生 `HistoryChanged` handler（Method 5）+ 2s 兜底读标题 | `adlo/crates/browser/src/webview2_history.rs:1-7` | SPA 已用"历史变化当副信号 + JS 兜底"，与 §2.4 结论一致 |
| 已有原生 `DownloadStarting`（`ICoreWebView2_4` 的 `add_DownloadStarting`） | `adlo/crates/browser/src/webview2_download.rs:3,32,72` | 下载拦截已原生 |
| `init_script.js` 包装 `pushState`/`replaceState`（含微任务 + setTimeout 双通道）、`reportMeta` | `adlo/crates/browser/src/init_script.js:646-700, 984-993, 1161-1185` | URL 权威仍是 JS；与 E15 结论互为印证 |
| 主题走 `Profile.PreferredColorScheme` 原生调用 | `adlo/src-tauri/src/tauri_webview_handle.rs:66-68` | 直接命中 #4920 的缺陷面 |

**评估**：Adlo 现在的实现不是"将就"，而是**在三条上游约束（#4920、SourceChanged 不覆盖 pushState、Tauri 不暴露 ProfileName）下唯一自洽的方案**。

### 3.2 版本门槛（若要用到各能力）

| 能力 | 最低 SDK | 最低 Runtime | Adlo 是否已具备 |
| --- | --- | --- | --- |
| 多 profile（`ProfileName` / `Profile` 属性） | 1.0.1210.39 | 未单独核实（同代 Runtime） | Rust 侧可直连；Tauri builder 无入口 |
| Cookie 读写（`CookieManager`） | 1.0.705.50 | 未单独核实 | 已有 `webview2_cleanup.rs`，可扩展 |
| `DownloadStarting` | 1.0.902.49 | 未单独核实 | ✅ |
| `document.title` 在 SPA 返回/前进时正确 | — | **100.0.1167.0+** | ✅（Evergreen） |
| 浏览器扩展 | 1.0.2210.55 | **116** | ✗ 未启用 |
| Profile 级主题隔离 | **无** | **无** | ✗ 不可用 |

### 3.3 改动面（按方案计）

| 方案 | 改动面 | 说明 |
| --- | --- | --- |
| A. 保持三 UDF（现状） | 0 | 主题稳定，cookie 隔离 |
| B. 改单 UDF + 三 profile | 中～大：`commands/browser.rs` 去掉 3 处 `data_directory`；`crates/browser` 新增 direct-com 创建路径（Tauri 不暴露 ProfileName，需 `ICoreWebView2Environment10::CreateCoreWebView2ControllerOptions` + 自定义 controller 创建，或 fork/patch Tauri runtime）；`tauri_webview_handle.rs` 主题逻辑随之调整 | **收益为负**：主题串扰回归（#4920）+ cookie 仍不共享 + 需要接管 controller 生命周期 |
| C. 三 UDF + cookie 定向同步 | 中：新增 `cookie_sync` 模块（按域名白名单 `GetCookies`→`AddOrUpdateCookie`），挂在登录成功/导航前后 | 不碰 UDF 结构，风险局部化；需定义"谁是权威 profile"（建议中间区）与冲突策略 |
| D. 原生事件替换 JS 包装 | 小～中：删 `init_script.js` 中的 `pushState` 包装 | **不建议**：会丢 SPA URL（E15） |
| E. 引入扩展做拦截 | 中大：`AreBrowserExtensionsEnabled`、扩展目录随包分发、profile 级安装、升级策略（改目录=重装） | 无 UI 入口，收益/成本比差 |

### 3.4 风险清单

1. **单 UDF 化会立刻回退主题稳定性**：3 个 profile 共享一个浏览器进程，`PreferredColorScheme` 仍互相覆盖（E2），且没有 ETA。
2. **`SourceChanged` 被误当 SPA 信号**：文档明确排除 `pushState`（同 URL）（E15）；若用它替换 JS 包装，会出现"地址栏不更新"。
3. **`HistoryChanged` 重复触发**：Adlo 已在 `browser_events.rs` 做去重（2s 窗口）；移除去重会重复上报。
4. **Cookie 搬运破坏安全属性**：漏 `HttpOnly`/`SameSite` 会导致"看起来登录了但请求不带 cookie"，或把 `SameSite=Strict` 放宽成跨站可用。
5. **`AdditionalBrowserArguments` 误用**：环境级、影响所有 profile；且官方定位为测试用途（E24）。
6. **自定义 UA 触发 `userAgentData` 变空**（E25），"像浏览器"目标受损。
7. **多 UDF 的内存/磁盘代价**（E7、E10）：3 套浏览器进程，官方明确提示"避免同时跑太多 UDF"。

---

## 4. 推荐 / 不推荐

**推荐**

1. **保持三 UDF，不改结构**。这是 #4920 未修（E1）背景下的正确取舍；把"为什么必须 3 个 UDF"的注释补上"上游 bug + Edge 同样复现 + 无 ETA"三点，避免后来者反复尝试合并。
2. **若必须共享登录态，走方案 C（Cookie 定向同步）**，并明确三条规则：单一权威 profile（中间区）、域名白名单（不做全量 `GetCookies("")`）、同步触发点（登录成功 + 关键导航前）。同步失败要可见（日志），不要静默。
3. **原生/JS 分工保持不变**：标题用 `DocumentTitleChanged`、URL 用注入脚本、`HistoryChanged` 仅作副信号、下载用 `DownloadStarting`。
4. **补齐 `NewWindowRequested` 检查**：这是"像浏览器"最直接的一环，且成本低（原生事件，无版本门槛）。
5. **若确有多身份需求（如每面板不同 locale）**，用 `ScriptLocale`（控制器级，不破坏 UDF 结构），而不是拆更多 UDF。

**不推荐**

1. ❌ **暂不迁移到"单 UDF + 多 profile"**：在 #4920 修复前，这是"用 cookie 隔离换主题稳定，再换回主题不稳定"，净收益为负。
2. ❌ **不用原生事件替换 `pushState` 包装**（E15）。
3. ❌ **不用 `PreferredColorScheme` 做"每面板主题"**：它当前是环境级开关（E2、E3）。
4. ❌ **不把 `AdditionalBrowserArguments` 当产品开关**（E24）。
5. ⚠️ **扩展不作为近期路线**：无 UI 入口（E21）、profile 级、改动即卸载，投入产出不成比例；仅当"广告/同意拦截"成为明确需求时再评估。
6. ⚠️ **不通过自定义 UA 塑造身份**（E25、E26），除非接受 `userAgentData` 退化。

---

## 5. 未证实项清单

| # | 未证实内容 | 现状 | 建议验证方式 |
| --- | --- | --- | --- |
| U1 | `history.pushState` 到**不同** URL 是否触发 `SourceChanged` | 文档只说"`history.pushState` **with the same URL as the current page**"不触发，措辞留了开口（E15） | 单页实验：`pushState(null,'','/a')` 到新路径，观察 `SourceChanged` 是否到达 |
| U2 | #4920 在 2026 年最新 Runtime（156/157）上的实际行为 | 只有 2024 年 Runtime 130 的复现记录；release notes 无修复条目（E1、E4），但未做本机实测 | 同进程建 2 个 profile，交替设 Light/Dark，读回各自 `PreferredColorScheme` + 观察滚动条/右键菜单 |
| U3 | 各能力对应的**最低 Runtime** 版本号（多 profile、CookieManager、`DownloadStarting`） | 只取到 SDK 版本（E9、E12、E19）；Runtime 号未逐条核实 | 查对应 release notes 页的 "Runtime x.y" 对照，或用 `GetAvailableCoreWebView2BrowserVersionString` 实测 |
| U4 | profile 级"权限"的官方原文表述与 API 版本（`SetPermissionStateAsync`） | 只取到 UDF 页把 "permissions" 列为 profile 数据（E10）；具体接口版本未取 | 查阅 `ICoreWebView2Profile4` 参考页 |
| U5 | `Language` / `AdditionalBrowserArguments` 的逐字备注（是否明确"仅限测试"） | 仅取到摘要句（E24），未取全文 remarks | 打开 `icorewebview2environmentoptions` 全文 |
| U6 | 扩展对 `declarativeNetRequest` 的实际支持度（MV3 规则上限、是否支持 `webRequest` 阻塞式） | 文档只说明"可加载 WebExtensions"，未列支持的 API 子集（E20、E21） | 装一个 uBlock Origin Lite / 自写最小 MV3 扩展，实测拦截是否生效 |
| U7 | Tauri 2.x 是否计划暴露 `ProfileName` | 仓库内 `tauri = "2"` + `tauri-runtime-wry-patched 2.11.4`，未查到上游 issue/PR | 查 tauri-apps/tauri issues 关键词 `ProfileName` |
| U8 | 同 UDF 多 profile 是否共享 GPU/渲染进程，单页面 hang 是否波及同 UDF 其它 profile | 文档只讲"一个 session 一个 UDF、一个浏览器进程"（E11），未讲故障隔离 | 构造渲染进程 crash（`chrome://crash` 等价物或 `ProcessFailed`）观察波及范围 |

---

## 附：一句话给决策者

> **主题隔离只能继续靠 UDF；登录态共享只能靠 cookie 显式搬运；URL 追踪只能继续靠注入脚本。** 三件事在本代 WebView2 上都没有"更干净"的官方替代品，唯一会随版本变化的是标题（已修）与扩展（可用但无 UI）。
