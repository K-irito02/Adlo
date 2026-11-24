# 内嵌浏览器与第三方站点验证：产品实践、可复用模式与 Adlo 路线评估

> 调研日期：2026-11-23
> 范围：桌面端工作区/浏览器产品如何隔离会话、处理第三方登录与人机验证、何时把链接交给系统浏览器；以及完整 Chromium/CEF 路线的成本。
> 方法：优先官方帮助中心、官方文档、产品源码与标准/RFC；二手评测仅用于补充“已停售/引擎”这类事实，并在表中标注证据强度。未做真机 A/B 实验，涉及 Adlo 的根因判断均标为“待验证”。
> 约束：只读调研，不修改 Adlo 源码；唯一写入为本文件。

---

## 0. 结论摘要

1. **“被判定为嵌入式浏览器”不是单一 bug，而是三层因素叠加**：浏览器身份（UA/Client Hints/宿主对象）、会话拓扑（是否长期共享 cookie/本地状态）、网络与行为风控。Google 的 OAuth 政策明确禁止嵌入式 user-agent；搜索/登录的风控则没有公开规则，不能靠一条 UA 字符串“修好”。
2. **产品界有两条清晰路线**：
   - **工作区型（Electron/WebView 封装）**：Ferdium、Rambox、Station、Biscuit、WebCatalog。它们靠 **分区/Profile** 做多账号，靠 **“在系统浏览器打开”** 兜底第三方登录；但都没有消除“嵌入式”身份问题。
   - **完整浏览器型（Chromium 分支）**：Wavebox、Shift、Arc、Comet、Atlas（已停运）、Sidekick（已停售）。它们以真实浏览器身份运行，因此不需要“绕过”嵌入式检测；代价是长期维护 Chromium。
3. **UA 伪装是负收益**。WebView2 设置 `UserAgent` 可能清空 `Sec-CH-UA-*` / `navigator.userAgentData`；Electron 仓库 PR #53519 描述承认 UA 与 Client Hints 不一致“可被站点观测并导致认证服务拒绝”；社区最小复现显示，Cloudflare Turnstile 在原生 Electron UA 下通过、在改写 UA 后进入 600010 循环。Google 政策也明确禁止在 `accounts.google.com` 上冒用 Chrome/Firefox 的 UA。
4. **对 Adlo 最务实的路线是 A+**：保留 WebView2，先修会话拓扑（可见标签默认共享一个 UDF/Profile），把“系统浏览器打开 / 复制链接 / 验证页提示”产品化，注入保持最小化；**不建议**换 Electron/CEF 当作验证码修复，也**不建议**现阶段自建 Chromium 分支。
5. **完整 Chromium 不是“换个内核”**：Wavebox 从 Electron 迁到 Chromium 后仍需每 4 周跟进 Chromium；Arc 有专职 Chromium 工程师并承诺 48 小时内跟进；Shift 的 release notes 多次记录 Chromium rebase（139→144）。对 Adlo 这是浏览器产品战略，不是浏览器标签功能。

---

## 1. 产品对照表

证据强度：`[官方]` 官方文档/帮助中心/博客；`[源码]` 公开仓库代码；`[二手]` 评测/媒体/下载站，仅作补充。

### 1.1 工作区 / 封装型产品

| 产品 | 形态与引擎 | 会话 / 分区 | 登录、验证、外部打开策略 | 对 Adlo 的可迁移点 |
| --- | --- | --- | --- | --- |
| **Ferdium**（Franz 的硬分叉） | Electron + `<webview>`；README 自述为 Franz hard-fork `[源码]` | 默认 `sandboxServices: true`：每个 service 用 `persist:service-<id>`（recipe 可指定共享 partition）；关闭 sandbox 才统一用 `persist:general-session`；每个 service 可单独设 UA `[源码]` | 裸 `window.open(url)` 交给系统浏览器；带 `frameName`/`features` 的弹窗保留给 Chromium（OAuth、Slack huddle 等）；主进程再决定弹窗还是外开 `[源码]`。仓库有 Cloudflare/ChatGPT 验证循环、Google 登录失败的公开 issue（[#1043](https://github.com/ferdium/ferdium-app/issues/1043)、[#2216](https://github.com/ferdium/ferdium-app/issues/2216)、[#2403](https://github.com/ferdium/ferdium-app/issues/2403)）`[源码 issue]` | “默认按 service 隔离、可配置全局共享”；外开只处理“纯链接”，不要一刀切拦截所有 popup |
| **Rambox 3** | Electron/Chromium；官方称“与 Chrome 同引擎” `[官方]` | Basic：每个 app 自动独立 session；Pro：Primary / Private / Incognito / 自定义 Profile，可让多个 app 共享登录 `[官方]`；v2 文档明确“每个 partition 当作独立浏览器” `[官方]` | 每个 app 可设 Link handling：阻止弹窗 / 弹窗（同 session）/ 默认浏览器 / app 内标签；支持“只这一次在浏览器打开” `[官方]` | 分区不是二选一，而是“默认策略 + 每 app 覆盖 + 单次覆盖”；外开要有“这一次/始终”的记忆 |
| **Shift** | Chromium-based，官方帮助与 release notes 明确 `[官方]` | 每个 email / app instance 独立 partition（cookie profile）；Primary 与 Secondary 分区隔离，用于同服务多账号 `[官方]` | 作为完整 Chromium 浏览器运行，第三方站点看到的是浏览器而非嵌入壳；没有“嵌入式 OAuth”问题 `[官方]` | 分区命名的产品化：Primary/Secondary、Space、App instance；用户能理解“为什么这里要重新登录” |
| **Station** | Electron；公开仓库 package.json/README `[源码]` | `SessionService` 以 `Electron.session.fromPartition(partition)` 创建会话 `[源码]`；产品支持多账号 `[官方]` | 未找到公开的验证码/外开策略文档；从架构看是 Electron 多 webview + partition | 分区服务抽象（SessionService）可参考；不要把 Electron 当作身份修复 |
| **Wavebox** | 2019 年起从 Electron 迁到 **完整 Chromium 分支**（Wavebox 10） `[官方]` | Spaces 之间 cookie 隔离；Profiles 是完全独立的 Wavebox；支持多 cookie container `[官方]` | 以真实 Chromium 浏览器身份运行；官方称与最新 Chromium 保持同步，约每 4 周一个 major `[官方]` | 证明“完整 Chromium”能解决身份问题，但也展示维护代价；Spaces/Profiles 的两级隔离值得借鉴 |
| **WebCatalog** | Electron（Chromium）；官方博客明确“Chromium through Electron” `[官方]` | 每个 desktop app 独立窗口；Profiles 隔离账号；官方称“each app keeps its own session, separate by default” `[官方]` | 以独立 app 窗口运行；没有公开的验证码策略；本质仍是 Electron 嵌入 | “每个 app 一个窗口 + 独立 profile”的产品形态，适合工作区而不是通用浏览器 |
| **Biscuit** | Electron；Softpedia 更新日志显示 Electron 43.8.x `[二手]` | 默认每个 app 独立 session；同一 group 可开启 Shared Session 共享登录 `[官方]` | 官方建议“app-like services 放 Biscuit，通用浏览留给默认浏览器”；没有公开的挑战页处理 `[官方]` | “默认隔离、按 group 共享”是工作区型产品的常见折中；默认值应按产品定位选，而不是照搬 |
| **Slack** | Electron；Electron 官方“Why Electron”点名 Slack `[官方]` | 桌面端按 workspace 管理；第三方链接默认交给系统默认浏览器 `[二手]` | 不做通用内嵌浏览器；把外部页面交给系统浏览器，避免第三方登录/验证落在嵌入壳里 | “聊天/工作台只负责自己的内容，外部页面外开”是最省事的合规策略；但官方文档未明确写链接行为，见未证实项 |
| **Notion** | 桌面应用；官方帮助未说明引擎 `[官方]` | 按账号/设备管理；官方提供“Open Notion links in browser”开关 `[官方]` | 只对 **Notion 自己的域名** 做 app/browser 路由；第三方链接行为官方未明确 | 自有域名回 app、第三方域名外开，是合理边界；不要把“自有链接路由”误当成第三方 OAuth 方案 |

### 1.2 完整浏览器型产品

| 产品 | 形态与引擎 | 会话 / 分区 | 对“嵌入式判定”的处理 | 备注 |
| --- | --- | --- | --- | --- |
| **Arc** | Chromium-based；官方隐私/安全页明确 `[官方]` | Profiles 隔离 cookie/history/login；Spaces 是组织层 `[官方]` | 以浏览器身份运行，不需要嵌入式绕过；官方称有专职 Chromium 工程师，Chromium 更新 48 小时内跟进 `[官方]` | 官方已宣布 2026-12-22 停止 Arc，迁移到 Dia `[官方]`；说明“浏览器产品”也有业务周期 |
| **ChatGPT Atlas** | Chromium-based（PCMag 等 `[二手]`）；Simon Willison 实测其 UA 与 macOS 最新 Chrome 完全一致 `[二手实测]` | 发布时 roadmap 才提 multi-profile；初期单 profile `[官方]` | 作为完整浏览器运行，UA 与 Chrome 一致，不暴露 Electron/WebView 宿主 | OpenAI 已于 2026-08-09 停止 Atlas `[官方]`；产品寿命约 10 个月 |
| **Perplexity Comet** | Chromium-based；官方帮助中心明确 `[官方]` | 标准浏览器会话；支持扩展、书签、密码等 `[官方]` | 以浏览器身份运行；不涉及嵌入式宿主 | 官方帮助把“Chromium-based”作为兼容性卖点，而不是隐藏 |
| **Sidekick** | Chromium-based；已停售，证据为媒体/行业文章 `[二手]` | 多 workspace / 多账号；具体 partition 细节公开资料不足 | 以浏览器身份运行 | 2025-08 停止服务，官网跳转 Comet `[二手]`；仅作历史参考 |

**表后注**：
- 表中最显眼的事实：**几乎没有工作区型产品公开宣称“识别并处理挑战页”**。它们要么靠完整浏览器身份（Wavebox/Shift/Arc/Comet），要么靠“在系统浏览器打开”（Ferdium/Rambox/Nativefier）。这本身就是对 Adlo 的提示：不要期待某个产品有“验证码规则库”可直接抄。
- “完整浏览器型”不等于“永远不会被挑战”。Brave 官方 issue #50100 记录：新 Profile/隐私窗口首次 Google 搜索会触发 “unusual traffic” CAPTCHA，作者称 Brave 上 100% 复现、Chrome 上不复现；另一个 issue #55197 进一步指向 Fingerprinting shield `[源码 issue]`。所以浏览器身份只是必要条件，不是充分条件。
- 表中“默认”均以官方文档/代码的当前表述为准；产品版本变化快，落地前应复核。

---

## 2. 模式总结

### 2.1 分区模型：全局共享 vs 每 workspace/service 独立

#### 取舍

| 维度 | 全局共享会话 | 每 service/workspace 独立分区 |
| --- | --- | --- |
| 登录复用 | 一次登录，多个 app 共享（Gmail/Drive/Calendar） | 每个 app 重新登录；OAuth 更容易落到“嵌入式被拒” |
| 验证码/风控 | 长期 cookie、localStorage、历史更接近正常浏览器，通常更有利 | 新分区=空 profile，Google 等站点缺少本地信任状态，通常更差 |
| 多账号 | 需要额外 Profile/容器 | 天然支持同服务多账号 |
| 隐私/串号 | 跨服务可见同一身份，可能串号 | 隔离彻底，适合客户/工作/个人分离 |
| 磁盘/内存 | 一份缓存，较省 | 每分区一份缓存，磁盘和内存更高 |
| 故障隔离 | 一个分区损坏影响全部 | 单分区可独立清理/重建 |
| 迁移/清理 | 清理“某个站点”困难 | 按 service 删除分区容易 |
| 合规/用户预期 | 必须明确告知“这些 app 共享登录” | 默认更符合“工作区隔离”的直觉 |

#### 产品证据

- **Electron 的语义**：`partition` 以 `persist:` 开头时，同 partition 的所有页面共享持久会话；否则是内存会话。`session.fromPartition('persist:name')` 是标准做法。[Electron session 文档](https://www.electronjs.org/docs/latest/api/session)、[BrowserWindow 文档](https://www.electronjs.org/docs/latest/api/browser-window)
- **Ferdium：默认按 service 隔离，可关闭 sandbox 改为全局共享**。`sandboxServices` 默认 `true`；开启时走 `checkForSandbox()`/`service.partition`（默认 `persist:service-<id>`，recipe 可指定共享 partition），关闭后才统一用 `persist:general-session`。同时每个 service 有独立 `useragent`。[ServiceWebview.tsx#L179](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/components/services/content/ServiceWebview.tsx#L179)、[config.ts#L660](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/config.ts#L660)、[Service.ts#L519](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/models/Service.ts#L519)
- **Rambox：Basic 默认每 app 隔离，Pro 才允许共享 Profile**。官方把“共享登录”作为 Pro 卖点，同时保留 Private/Incognito。[How to create and configure apps](https://support.rambox.app/getting-started/how-to-create-and-configure-apps.html)、[Profiles](https://support.rambox.app/getting-started/profiles-feature.html)
- **Biscuit：默认每 app 隔离，按 group 可选 Shared Session**。官方明确“开启共享后需要重新登录，因为会话模型真的变了”。[Biscuit Help](https://eatbiscuit.com/help/)
- **Shift：按 email/app instance 分区**，Primary 与 Secondary 是完全独立的 cookie profile；官方用“partition = 类 Chrome profile”解释。[How Cookies and Partitions are Handled in Shift](https://support.shift.com/hc/en-us/articles/39174004970004-How-Cookies-and-Partitions-are-Handled-in-Shift)
- **WebView2：独立 UDF 就是独立 profile**。微软明确：要隔离认证状态（例如多账号），应创建单独的 user data folder；同一 UDF 内 cookie/本地存储共享。[WebView2 in WinUI 3 — Authentication and SSO](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/webview2)
- **Tauri：`WebviewBuilder::data_directory` 可给每个 WebView 指定数据目录**；同页 `additional_browser_args` 文档警告“不同 browser arguments 的 WebView 必须使用不同 data directory”。[Tauri WebviewBuilder](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html)

#### 对 Adlo 的建议

- 产品界的默认值并不统一：Ferdium 默认按 service 隔离、可关闭 sandbox 全局共享；Rambox Basic 默认每 app 隔离、Pro 才能共享；Biscuit 默认每 app 隔离、group 可选共享；Shift/Wavebox 默认按 Space/账号隔离、同 Space 内共享。**共识是“按账号/工作区/服务隔离”，而不是“按 UI 区域隔离”。**
- 对 Adlo：panel 与 center 是同一个用户、同一个浏览任务的两个呈现面，默认应共享一个 Profile；**“隔离”应是 workspace 级、用户显式选择的能力**，而不是按 panel/center 默认分裂。
- 具体到 Adlo 当前实现：`panel` 用 Tauri 默认 UDF，`center` 用独立 UDF，`silent` 再用一个独立 UDF（见 §4.1）。**center 与 panel 默认不共享 cookie**，用户在 center 里的搜索/登录就是一个“新浏览器”。这与 Ferdium/Rambox Basic 的“按 service/app 隔离”在效果上类似，但 Adlo 并没有把“隔离”作为产品能力呈现给用户，用户会感到“为什么这里又要验证/登录”。
- 但当前拆分有非验证码原因：WebView2 同一 UDF 下 `PreferredColorScheme` 实际是全局的，团队用独立 UDF 避免主题互相闪烁（代码注释引用 WebView2Feedback #4920）。**不能为了验证码直接合并而不验证主题副作用**；应先做 A/B，确认合并后主题问题是否可接受，或用其他主题控制手段替代。
- 更稳妥的产品模型：
  - **一个默认浏览 Profile**：panel + center 的普通浏览标签共享；登录一次，两边都登录。
  - **每个 workspace 可选“隔离 Profile”**：需要多账号/客户隔离时开启，UI 明确提示“此工作区独立登录”。
  - **silent/后台 WebView 保持独立**：它只取标题/favicon，不应污染用户会话。
  - **提供“清除此站点数据”/“重置此工作区”**，而不是只能删整个 UDF。

---

### 2.2 “在系统浏览器打开” / “复制链接” / 外部打开并回调

#### 产品化做法

1. **每 app 链接策略**（Rambox）：阻止弹窗 / 同 session 弹窗 / 默认浏览器 / app 内标签；支持“只这一次在浏览器打开”。这是最完整的产品化模型。[Rambox Link handling](https://support.rambox.app/getting-started/link-handling.html)
2. **裸链接外开、真实弹窗保留**（Ferdium）：`window.open(url)` 无 `frameName`/`features` 时交给系统浏览器；带 features 的 OAuth/Slack huddle 弹窗保留，由主进程决定。这样不会破坏依赖 `WindowProxy` 的页面。[windowOpenShim.ts#L20](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/webview/windowOpenShim.ts#L20)
3. **右键“Open Link in Default Browser”**（Nativefier）：链接上下文菜单直接 `shell.openExternal`，同时保留“新窗口/新标签”。[contextMenu.ts](https://github.com/nativefier/nativefier/blob/9078a3071a3c7fab977d4e0bb54d3579af8296f3/app/src/components/contextMenu.ts)、[windowEvents.ts#L75](https://github.com/nativefier/nativefier/blob/9078a3071a3c7fab977d4e0bb54d3579af8296f3/app/src/helpers/windowEvents.ts#L75)
4. **自有域名回 app、第三方外开**（Notion）：官方提供“Open Notion links in browser / Open links in desktop app”两个方向的开关，但只覆盖 Notion 自己的链接。[Notion account settings](https://www.notion.com/help/account-settings)
5. **聊天/工作台默认外开**（Slack，证据为二手）：桌面端链接交给系统默认浏览器；移动端还有“Open web pages in app”开关。官方帮助未明确写桌面链接行为，见未证实项。

#### 标准与合规约束

- **RFC 8252 §8.12**：原生应用 **MUST NOT** 使用 embedded user-agent 发起授权请求；embedded user-agent 不与其他 app/浏览器共享认证状态，导致每次都要重新登录。[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.txt)
- **Google OAuth 2.0 政策**：“A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control.” 并禁止在 `accounts.google.com` 上冒用其他浏览器 UA、代理/改写请求、自动化登录。[Google OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)、[2021 博客](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews)
- **微软 WebView2 官方**：不要把 WebView2 用来显示 OAuth 登录页再抓 redirect/token/cookie；这是“embedded browser anti-pattern”，很多身份提供方会主动拦截；桌面 OAuth 应使用系统浏览器或 OS broker（WAM/MSAL）。[WebView2 in WinUI 3](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/webview2)
- **CEF 被点名**：Google 2020 年博客明确“This block affects CEF-based apps and other non-supported browsers”，并要求浏览器“must identify itself clearly in the User-Agent… must not use another browser's User-Agent string”。[Google 2020 博客](https://developers.googleblog.com/guidance-to-developers-affected-by-our-effort-to-block-less-secure-browsers-and-applications/)

#### 一个关键限制：第三方站点的登录态不能“回调”回 WebView

- 外部浏览器完成登录后，cookie 在**系统浏览器**的 profile 里，不会自动回到 Adlo 的 WebView2。所谓“外部打开并回调”只适用于 **Adlo 自己的 OAuth client**（自定义 scheme / loopback 回调，换自己的 token）。
- 对 Notion、Google、GitHub 等**第三方站点**，正确产品行为是“**把这个站点整体交给系统浏览器**”，而不是“在系统浏览器登录后把 cookie 偷回来”。后者正是微软/Google 明确禁止的 anti-pattern。
- 因此 Adlo 的外开应该是“**任务级降级**”：搜索被挑战 → 在浏览器继续搜索；某个站点登录不了 → 在浏览器打开该站点。不要承诺“登录后自动回到应用内”。

#### UX 建议

- 地址栏右侧 + 链接右键菜单同时提供：**在系统浏览器打开**、**复制链接**、**为此站点记住选择**。
- 认证域名（`accounts.google.com`、`login.microsoftonline.com`、`appleid.apple.com`、`github.com/login` 等）默认外开，并显示一条可关闭的说明：“此站点不允许在应用内登录，已用系统浏览器打开。”
- 挑战页（见 §2.3）显示非阻塞 banner：**在浏览器继续 / 复制链接 / 重试**；不要自动重载，重载会加重风控。
- 普通内容链接仍留在应用内；只有“认证/挑战/用户显式选择”才外开，避免把所有导航都踢出去。

---

### 2.3 验证码 / 挑战页识别与提示

#### 可识别的信号

| 来源 | 信号 | 证据 |
| --- | --- | --- |
| Google Search | URL 在 `google.com/sorry/` 下；正文 “Our systems have detected unusual traffic”；通常带 reCAPTCHA；第三方观测常见 429（非官方） | [Google Search Help](https://support.google.com/websearch/answer/86640)；第三方抓包文章仅作补充 |
| Cloudflare | 标题 `Just a moment...`；`#cf-challenge-running`、`.ray_id`、`#cf-please-wait`、`#turnstile-wrapper`、`.lds-ring` 等选择器；`input[name='cf-turnstile-response']` | [FlareSolverr `CHALLENGE_TITLES` / `CHALLENGE_SELECTORS` / `TURNSTILE_SELECTORS`](https://github.com/FlareSolverr/FlareSolverr/blob/cc2224b21e31c09a713eb25690a8e8dcdf50d8d8/src/flaresolverr_service.py#L38) |
| reCAPTCHA | `iframe[src^='https://www.google.com/recaptcha/...']`、`iframe[src^='https://www.recaptcha.net/recaptcha/...']`、`window.___grecaptcha_cfg.clients`、`window.__google_recaptcha_client` | [puppeteer-extra-plugin-recaptcha content.ts](https://github.com/berstend/puppeteer-extra/blob/39248f1f5deeb21b1e7eb6ae07b8ef73f1231ab9/packages/puppeteer-extra-plugin-recaptcha/src/content.ts#L39) |
| hCaptcha | `iframe[src*='hcaptcha.com']`、`h-captcha` 容器（需按当前实现复核） | 同仓库 `content-hcaptcha.ts`（同目录） |
| 通用 | 403/429 + 页面含 challenge iframe/隐藏 input + 标题异常 | 组合判断，避免误报 |

> Google 官方帮助把 “unusual traffic” 解释为对**网络地址**上自动流量的判断：VPN、共享出口、同一网络里的其他程序都可能触发，且“自动搜索停止后一段时间会解除”。这意味着共享 UDF/更真实的浏览器身份只能改善“本地信任”部分，不能消除 IP 层的风控。[Google Search Help](https://support.google.com/websearch/answer/86640)

#### 设计规则

1. **只识别，不求解**。不要接入 2Captcha/CapSolver 等 solver，也不要在应用内自动点击“我不是机器人”。这既违反站点 ToS，也会让风控升级。FlareSolverr 的**检测常量**可复用；它的求解/自动化逻辑不应照搬。
2. **检测到后暂停注入与自动行为**。Adlo 的 `init_script` 会拦截链接/上报媒体；挑战页上应跳过这些脚本，避免干扰 challenge 脚本或造成误判。
3. **给出明确出口**：在系统浏览器继续、复制链接、重试。对 Google 搜索，最稳的是“在浏览器继续搜索”；对 Cloudflare 登录页，外开整个站点。
4. **规则表 + 版本号 + 失败开放**。挑战页选择器会变；规则匹配失败时不要阻止导航，只记录并让用户自己处理。
5. **本地日志**：记录命中的规则、URL host、时间、是否外开；不要记录 query 内容或 cookie。用于判断“哪类站点/哪个 profile 更容易被挑战”。
6. **不要用“验证码”作为普适 banner**。正常的登录/支付二次验证不是 challenge；误报会让用户困惑。

#### 开源参考的边界

- FlareSolverr 是“绕过 Cloudflare”的自动化工具，**只应参考其检测表**，不应在产品中复制其 solver 行为。
- `puppeteer-extra-plugin-recaptcha` 主要用于自动化测试中识别/求解 reCAPTCHA；Adlo 只应参考其 DOM/iframe 检测方式。
- 目前没有“通用挑战页规则库”可以直接依赖；维护成本应计入设计。
- Bing 的挑战页没有找到官方规则；可以套用同一“识别 + 外开”框架，但 URL/DOM 规则必须实测后再写死，见未证实项。

---

### 2.4 UA、Client Hints、注入脚本、原生 API 改写

#### 结论先行

**不要伪装 UA，不要补 Client Hints，不要 patch 原生 API 来“过检测”。** 这些做法在当前生态里是负收益，且违反 Google 的明确政策。

#### 证据

| 事实 | 来源 |
| --- | --- |
| WebView2 的 `CoreWebView2Settings.UserAgent` 默认是 Edge UA；**设置它可能清空 `Sec-CH-UA-*` 头和 `navigator.userAgentData` 的脚本值**；行为还可能变化 | [Microsoft Learn: CoreWebView2Settings.UserAgent](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2settings.useragent) |
| Electron 仓库 PR #53519 描述：应用可以覆盖 UA 字符串，但过去不能覆盖对应的 Client Hints 元数据；**两者的不一致可被站点观测，并导致认证服务拒绝客户端**（该 PR 仍在讨论，不代表已发布 API） | [electron/electron PR #53519](https://github.com/electron/electron/pull/53519) |
| 社区最小复现：原生 Electron UA 通过 Cloudflare Turnstile；把 UA 改成“更像 Chrome”反而进入 600010 循环；即使保留 `Electron/...` token、只去掉 app token 也失败 | [electron-turnstile-repro](https://github.com/akriaueno/electron-turnstile-repro) |
| Google 政策：浏览器必须明确标识自己；**不得在 accounts.google.com 上使用 Chrome/Firefox 的 UA**；不得代理/改写请求、不得自动化登录；CEF 类框架不被允许 | [Google 2020 博客](https://developers.googleblog.com/guidance-to-developers-affected-by-our-effort-to-block-less-secure-browsers-and-applications/)、[OAuth Policies](https://developers.google.com/identity/protocols/oauth2/policies) |
| 社区 stealth 插件自己也承认这是“cat and mouse game”，“不可能阻止所有 headless 检测方式” | [puppeteer-extra-plugin-stealth README](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) |

#### 具体建议

| 面 | 不要做 | 应该做 |
| --- | --- | --- |
| UA 字符串 | 全局改成 Chrome/Edge 的 UA；按站点随机 UA | 保持 WebView2 默认 UA；如确需兼容，按站点最小覆盖，并同时保证 UA/Client Hints 一致（WebView2 当前很难做到，故不建议） |
| Client Hints | 用 JS 伪造 `navigator.userAgentData`；用 `--disable-features=UserAgentClientHint` 掩盖 | 不碰；让真实引擎报告真实值；用 feature detection 而不是 UA sniff |
| 请求头 | 用 `WebResourceRequested` 改 `User-Agent`/`Sec-CH-UA` | 只在自有请求（如 robots/meta 抓取）使用自定义 UA，并明确标识 `Adlo/...` |
| 注入脚本 | 在每一帧 patch `window.open`、`navigator`、`window.chrome`；注入到 OAuth/支付页 | 仅在顶层 frame、仅自有页面/白名单站点注入；命名空间化、幂等、可关闭；挑战/认证页跳过 |
| 原生 API | 给第三方页面暴露 `chrome.webview.hostObjects` / Electron `contextBridge` 能力；关闭 `contextIsolation` | 第三方页面零宿主对象；Electron 保持 `contextIsolation: true`、`sandbox`、`nodeIntegration: false`；WebView2 只在自有内容使用 host objects |
| WebView2 flags | 生产环境用 `--user-agent`、`--disable-web-security` 等 Chromium flags | 微软明确“生产不要用 browser flags”；只保留业务必需的稳定开关，并记录兼容性风险。[WebView2 browser flags](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags) |
| 挑战页 | 自动点击、自动求解、反复重载 | 识别 + 外开/复制/重试；暂停注入；记录规则命中 |

#### 为什么“完整 Chromium”也不能靠伪装

- Arc/Comet/Atlas 之所以“像浏览器”，是因为它们**就是浏览器**：真实 Chromium 进程、真实 profile、真实 UA/Client Hints。
- 但 Brave 的例子说明，即使是真的 Chromium 浏览器，只要品牌/指纹策略与 Chrome 不同，Google 仍可能挑战。**完整 Chromium 解决的是“宿主身份”，不是“网络风控”**。
- Atlas 的 UA 与 Chrome 完全一致（Simon Willison 实测），这是“浏览器身份”的极端做法；但 Google 政策又要求浏览器明确标识自己。**用 Chrome 的品牌 token 伪装存在合规风险**，不应作为 Adlo 的设计目标。

---

### 2.5 完整 Chromium / CEF 路线：谁在做，成本是什么

| 方案 | 代表 | 身份效果 | 包体 | 维护 | 关键风险 |
| --- | --- | --- | --- | --- | --- |
| **系统 WebView（WebView2）** | Adlo 当前 | 默认 UA 是 Edge；站点可通过 `window.chrome.webview` 等宿主特征识别；Google OAuth 等 IdP 明确禁止/不建议嵌入式授权 | 最小（Evergreen Runtime 共享；Fixed Version >250 MB）[MS 文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) | 跟随 Windows/Edge 更新；应用不需背 Chromium 安全补丁 | 嵌入式身份无法根治；不同 UDF 造成多份空 profile |
| **Electron** | Ferdium/Rambox/Station/Biscuit/WebCatalog | 仍是嵌入式应用；UA 含 `Electron/...`；OAuth 仍需外开 | 较大（自带 Chromium + Node） | 跟随 Electron major（约 8 周节奏，维护最近三个 major） | 不解决 Google 政策；UA 改写还会破坏 Turnstile |
| **CEF** | 一些桌面壳 | 仍是嵌入框架；Google 明确把 CEF 类应用列为 blocked | 大（自带 Chromium） | 自己跟进 Chromium/CEF 版本与安全补丁 | **对 Google OAuth 是明确死路**；需自行实现更新 |
| **完整 Chromium 分支** | Wavebox/Shift/Arc/Comet | 真实浏览器身份；可支持扩展、PDF、DevTools、标准 UA/Client Hints | 最大（完整浏览器 + 更新包） | 4 周 rebase、专职 Chromium 工程师、48 小时安全跟进 | 工程/组织成本极高；仍是浏览器产品，不是应用功能 |

#### 产品证据

- **Wavebox**：2019 年从 Electron 迁到“direct Chromium foundation”，理由是 Electron 缺少 PDF、扩展等浏览器能力；迁移后扩展、Hangouts、屏幕共享、内存/CPU 都有改善。官方称与最新 Chromium 保持同步，约每 4 周一个 major。[Wavebox 迁移说明](https://hub.wavebox.io/wavebox-is-evolving-our-move-to-chromium)、[Wavebox GitHub README](https://github.com/wavebox/waveboxapp)
- **Shift**：官方帮助明确 Chromium-based；release notes 记录 139 → 144 的 rebase，说明每次跟进都是实际工程。[Shift 144 release notes](https://support.shift.com/hc/en-us/articles/48425635991700-Shift-144-0-0-Released-2026-04-09)
- **Arc**：官方称有专职 Chromium 工程师，Chromium 新版本/热修 48 小时内跟进；同时官方已宣布 2026-12-22 停止 Arc。[Arc Privacy & Security](https://resources.arc.net/hc/en-us/articles/19434846038935-Privacy-Security)
- **Atlas**：Chromium-based，UA 与 Chrome 一致；2025-10 发布，2026-08 停止。[OpenAI Atlas 公告](https://openai.com/index/introducing-chatgpt-atlas)、[ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)、[Simon Willison 实测](https://simonwillison.net/2025/Oct/21/introducing-chatgpt-atlas/)

#### 结论

- 在 Windows/Chromium 生态里，**完整 Chromium 是唯一能提供“浏览器级身份”的路线**；但它要求团队长期承担浏览器引擎的安全、兼容、发布、崩溃、扩展、媒体编解码等责任。
- **CEF/Electron 不等于完整浏览器**：它们只是“把 Chromium 嵌进应用”，Google 仍按嵌入式处理；CEF 甚至被点名。
- 对 Adlo 这种“桌面应用宿主 + 内嵌浏览器标签”的产品，完整 Chromium 是**产品战略变更**，不是修验证码的工程任务。

---

## 3. 开源参考（仓库 / 文件 / 行为）

| 仓库 | 文件与位置 | 可参考行为 | 备注 |
| --- | --- | --- | --- |
| **ferdium/ferdium-app** | [`ServiceWebview.tsx#L179`](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/components/services/content/ServiceWebview.tsx#L179) | `partition` 在共享 `persist:general-session` 与 sandbox 分区之间切换；`useragent={service.userAgent}` 每服务覆盖 | 默认共享、隔离可选的典型 |
| **ferdium/ferdium-app** | [`windowOpenShim.ts#L20`](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/webview/windowOpenShim.ts#L20) | 裸 `window.open(url)` → `window.ferdium.open` 外开；带 name/features 的 popup 保留给 Chromium | 解决“外开所有链接会破坏 OAuth/huddle”的经典实现 |
| **ferdium/ferdium-app** | [`service-helpers.ts#L20`](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/helpers/service-helpers.ts#L20) | 分区目录在 `Partitions/<id>`；删除失败时延迟到下次启动，避免 Windows 文件占用 | 分区生命周期/清理的工程细节 |
| **ramboxapp/community-edition** | [`electron/main.js#L163`](https://github.com/ramboxapp/community-edition/blob/eaa33fc8f3ce5f9600b032fd9ca7cfba1827b84f/electron/main.js#L163) | `new-window` 的 `foreground-tab` 且协议为 http/https/mailto 时 `shell.openExternal(url)` | 仓库已归档（2022），只作模式参考；Rambox 3 源码未在本文核实 |
| **nativefier/nativefier** | [`windowEvents.ts#L75`](https://github.com/nativefier/nativefier/blob/9078a3071a3c7fab977d4e0bb54d3579af8296f3/app/src/helpers/windowEvents.ts#L75) | `linkIsInternal` 判定；外部 URL 在 `setWindowOpenHandler`/`will-navigate` 中 `openExternal` 并 deny | 仓库 2023 起不再维护，但边界判定清晰 |
| **nativefier/nativefier** | [`contextMenu.ts`](https://github.com/nativefier/nativefier/blob/9078a3071a3c7fab977d4e0bb54d3579af8296f3/app/src/components/contextMenu.ts) | 链接右键菜单提供 “Open Link in Default Browser / New Window / New Tab” | “复制链接/外开”产品化的最小参考 |
| **getstation/desktop-app** | [`session/main.ts#L38`](https://github.com/getstation/desktop-app/blob/cdf771dab4cef58a9abf742caec82b79daba9bcb/packages/app/src/services/services/session/main.ts#L38) | `SessionService` 以 `Electron.session.fromPartition(partition)` 创建会话；未给 partition 时回退默认 session | Electron 多账号/分区服务抽象 |
| **FlareSolverr/FlareSolverr** | [`flaresolverr_service.py#L38`](https://github.com/FlareSolverr/FlareSolverr/blob/cc2224b21e31c09a713eb25690a8e8dcdf50d8d8/src/flaresolverr_service.py#L38) | Cloudflare/DDoS-Guard 的标题与选择器清单、Turnstile 隐藏 input | **只参考检测表，不复制 solver/自动化绕过** |
| **berstend/puppeteer-extra** | [`content.ts#L39`](https://github.com/berstend/puppeteer-extra/blob/39248f1f5deeb21b1e7eb6ae07b8ef73f1231ab9/packages/puppeteer-extra-plugin-recaptcha/src/content.ts#L39) | reCAPTCHA iframe 源生成、`___grecaptcha_cfg` 检测、可见/不可见 widget 识别 | 只参考 DOM/iframe 检测；不要接入 solver |

**不建议照搬的代码**：
- FlareSolverr 的 undetected_chromedriver/solver 逻辑；
- puppeteer-extra-plugin-stealth 的 UA/指纹 patch；
- 任何“自动点击验证码/自动提交登录”的实现。

---

## 4. 对 Adlo 的路线评估

### 4.1 现状（代码事实，只读）

| 事实 | 位置 |
| --- | --- |
| Tauri 2.11.5 + WebView2；浏览器标签是 child WebView | `adlo/src-tauri/src/commands/browser.rs`、`crates/browser/` |
| `panel` 用 Tauri 默认 UDF；`center` 用 `app_data/webview/center`；`silent` 用 `app_data/webview/silent` | `adlo/src-tauri/src/commands/browser_webview_setup.rs:194-228` |
| 中心与面板默认不共享 cookie/localStorage/缓存/登录态；代码注释明确“独立 UDF = 独立空 profile” | 同上，`:190-193` |
| 通过 `WebviewBuilder::data_directory` 设置 UDF | `browser.rs:76-90`、`browser_webview_setup.rs:204-228` |
| 未发现对 WebView 的 `user_agent`/`UserAgent` 覆盖；`USER_AGENT` 常量只用于 robots/元数据 HTTP 抓取 | `browser.rs:1722`（`Adlo/1.0 ... MetaFetcher`） |
| `WEBVIEW_ADDITIONAL_ARGS` 关闭 `msWebOOUI,msPdfOOUI,msSmartScreenProtection,MediaSessionService`，并启用 `--allow-file-access-from-files` | `browser_webview_setup.rs:43` |
| `init_script.js` 使用 `chrome.webview.postMessage` 上报日志/链接/媒体；拦截白名单 agent 站点链接 | `crates/browser/src/init_script.js:1-80` |
| 浏览器模式（Web）用 iframe；`X-Frame-Options`/CSP 失败时提供“在外部浏览器打开”降级 | `docs/knowledge-base/browser/builtin-browser.md` |

**推断（待验证）**：
- center 的独立 UDF 让 Google/Bing 看到的是一个没有历史、没有 cookie、没有 consent 状态的新浏览器；这通常**提高**搜索挑战概率。
- panel 与 center 不共享登录态，用户会在两个区域重复登录/验证；这不是产品文案能解释的。
- WebView2 的宿主特征（`window.chrome.webview`）确实可被站点检测；但 Google Search 是否实际用它做风控，没有公开证据。OAuth 的拦截是**政策明确**的，与“是否检测到 WebView2”无关。
- 当前没有 UA 伪装，这是一件好事；不要为了验证码去加。

### 4.2 路线对比

| 维度 | A. 维持 WebView2（现状） | A+. WebView2 + 会话/外开/挑战页治理 | B. 换 Electron/CEF | C. 自建/分支完整 Chromium |
| --- | --- | --- | --- | --- |
| 工程成本 | 0 | **S–M**（会话拓扑、外开 UI、规则表） | **L**（重写壳、IPC、更新、平台适配） | **XL**（浏览器团队、构建/发布/安全） |
| 包体 | 最小；Evergreen 共享 | 不变 | 明显增大（自带 Chromium+Node） | 最大（完整浏览器+更新） |
| 维护 | 跟随 Tauri/WebView2 | 同上 + 规则维护 | 跟随 Electron major；仍要处理 WebView 兼容 | 4 周 rebase、48h 安全跟进、崩溃/媒体/扩展 |
| 双端一致性 | 浏览器模式 iframe 已有差异，但业务逻辑可共享 | 外开/提示可在两端用同一套策略 | 仅桌面；浏览器模式无法对等 | 仅桌面；双端一致性基本破裂 |
| 合规风险 | 中：OAuth 不能内嵌；需外开 | 低–中：外开 + 不伪装 + 不求解 | 中–高：CEF 被 Google 点名；Electron 仍嵌入式 | 中：需遵守 Chromium 许可证/品牌/编解码；不能冒用 Chrome UA |
| 验证码改善 | 有限 | **中**：共享 profile 提升本地信任；外开让用户完成验证 | 低：不改变嵌入身份；UA 改写可能更糟 | **高**：浏览器身份；但仍受 IP/行为风控（Brave 例） |
| 主要风险 | 用户反复验证/登录 | 主题与共享 profile 的冲突需解决 | 投入大、收益小 | 产品战略级投入；团队/周期不可控 |

> 成本量级为工程估算（S/M/L/XL），不是实测工时；包体数字除 WebView2 Fixed Version 外均为量级判断，见未证实项。

### 4.3 逐项判断

#### A. 维持 WebView2（只修 bug，不改架构）

- **适合**：短期稳定；不想引入新引擎；验证码问题可通过外开兜底。
- **不适合**：期望“应用内完成所有第三方登录”；期望“像 Chrome 一样不被挑战”。
- **判断**：可作为基线，但单独做 A 不会解决当前问题。

#### A+. WebView2 + 会话/外开/挑战页治理（推荐）

- **会话**：可见标签默认共享一个 UDF；按 workspace 可选隔离；silent 独立。
- **外开**：认证域名/挑战页/用户选择 → 系统浏览器；提供复制链接；不要试图回传 cookie。
- **挑战页**：识别 + banner + 暂停注入 + 本地日志；不求解。
- **注入**：顶层、白名单、幂等；不碰 UA/Client Hints/原生 API；认证页跳过。
- **收益**：低风险、可渐进、可回滚；直接改善“用户被卡住”的体验。
- **代价**：需要处理 WebView2 同 UDF 的主题全局问题；需要维护挑战规则表；不能承诺 100% 消除验证码。
- **判断**：**当前最推荐**。

#### B. 换 Electron/CEF

- **Electron**：Tauri 应用重写为 Electron，成本高；Electron 仍是嵌入式，Google OAuth 仍需外开；UA 含 `Electron/...`，Turnstile 复现显示改写 UA 更糟；包体/内存/更新负担增加。
- **CEF**：Google 2020 博客明确把 CEF 类应用列为 blocked；对 OAuth 是死路；还要自己维护 CEF 更新。
- **判断**：**不推荐**作为验证码修复；除非团队本来就要迁移到 Electron 且接受“OAuth 外开”。

#### C. 完整 Chromium 分支

- **收益**：真实浏览器身份、扩展/PDF/DevTools、标准 UA/Client Hints；可做 Spaces/Profiles 等浏览器级隔离。
- **代价**：构建/发布/安全/崩溃/媒体/扩展/多平台；4 周 rebase；专职团队；包体最大；浏览器模式无法对等。
- **判断**：**现阶段不推荐**。只有当“应用内第三方登录/浏览体验”成为核心商业模式，且团队愿意按浏览器产品投入时才考虑。

### 4.4 建议落地顺序

1. **先测量，不先改 UA**（1–2 天）
   - 记录挑战事件：URL、host、标题、命中选择器、当前 UDF、是否登录、时间。
   - 基线：同一网络下 Edge 正常搜索；Adlo panel/center 分别搜索；冷/热 profile 各 10–20 次。
   - 目标：区分“IP 风控”“center 空 profile”“WebView2 宿主特征”“注入干扰”。
2. **会话拓扑 A/B**（优先）
   - 让 center 临时使用 panel 的默认 UDF（或反过来），同一查询集对比挑战率。
   - 若共享后明显改善：把“可见标签共享一个 Profile”作为默认；保留“每 workspace 隔离”开关。
   - 同时验证主题闪烁是否复发；若复发，先解决主题控制，再决定是否合并。
3. **外开与复制链接产品化**
   - 地址栏/右键/挑战 banner 三处入口；认证域名默认外开；支持“这一次/始终”。
   - 明确文案：第三方站点登录在系统浏览器完成，不会自动回到应用内。
4. **挑战页识别与提示**
   - 先接 Google `/sorry/` + Cloudflare Turnstile + reCAPTCHA iframe 三类；规则表可配置、可关闭。
   - 命中后暂停注入、显示 banner、提供外开/复制/重试；不自动重载。
5. **注入最小化**
   - 只在顶层 frame 执行；只对白名单 agent 站点拦截链接；认证/挑战页跳过。
   - 移除任何 UA/Client Hints/native API patch 的冲动；保持 `contextIsolation`/无宿主对象。
6. **按 workspace 的隔离**
   - 产品层提供“工作区独立登录”；不要按 panel/center 默认分裂。
   - 提供“清除此站点数据”“重置工作区”，降低用户对“重新登录”的困惑。
7. **重新评估完整 Chromium**
   - 只有当 2–6 仍无法满足“核心站点必须在应用内登录/使用”的需求，才进入 C 的可行性研究。

### 4.5 明确不推荐

- **UA 伪装 / Client Hints 伪造 / stealth 插件**：证据一致指向负收益；Google 政策也禁止。
- **CAPTCHA solver / 自动点击**：违反站点 ToS，且会让风控升级。
- **把“每个 UI 区域一个 UDF”作为默认**：这不是用户能理解的产品边界；应改为“每个 workspace 可选隔离”。
- **用 Electron/CEF 替换 WebView2 来修验证码**：不改变嵌入身份；CEF 被 Google 点名；成本高。
- **在系统浏览器登录后抓 cookie/token 回 WebView**：微软/Google 明确禁止的 anti-pattern。
- **生产环境堆 Chromium flags**：微软明确不保证长期支持；只保留必要开关并记录风险。

---

## 5. 未证实项清单

以下内容没有找到足够强的官方/源码证据，落地前需实验或向厂商确认：

1. **Adlo 当前验证码的主因权重**：独立 UDF、WebView2 宿主特征、IP/网络、注入脚本各自贡献多少；需要 A/B。
2. **Google Search 是否检测 `window.chrome.webview`**：OAuth 的 embedded 拦截有政策；搜索风控没有公开规则。
3. **Bing 的挑战页 URL/DOM 规则**：未找到官方文档；不要凭猜测写死。
4. **完整 Chromium 分支在 Google 搜索/登录上的实际通过率**：Wavebox/Shift 的用户报告不等于官方保证；Brave 反例说明仍会被挑战。
5. **Sidekick 的停售时间与引擎细节**：官方站点已不可用，仅有二手来源。
6. **Atlas 的 Chromium 版本/UA 细节**：官方公告未写“Chromium”，UA 一致来自第三方实测；产品已停运。
7. **Biscuit 的 Electron 版本**：来自 Softpedia 更新日志，非官方仓库。
8. **Slack 桌面端第三方链接行为**：官方帮助未明确；二手来源说默认系统浏览器。
9. **Notion 桌面端第三方链接行为**：官方只描述 Notion 自有链接路由；第三方链接是否外开未明确。
10. **包体数字**：WebView2 Fixed Version >250 MB 有官方数字；Electron/CEF/完整 Chromium 的安装包大小为量级估算，未实测。
11. **Tauri `data_directory` 在非 Windows 平台的等价语义**：本文只验证 Windows/WebView2 路径；跨平台需另测。
12. **WebView2 `UserAgent` 清空 Client Hints 的行为稳定性**：微软注明“current implementation behavior is subject to change”。
13. **Chromium 分支的编解码/品牌合规**：Chromium 许可证、专有 codec、Chrome 品牌 token 的使用边界需法务确认；本文不做法律结论。
14. **“共享 UDF 一定降低 Google 挑战率”**：方向合理，但受 IP/行为影响；必须用实验确认。

---

## 6. 参考来源

### 标准 / 平台 / 官方文档

1. Google, *OAuth 2.0 Policies* — https://developers.google.com/identity/protocols/oauth2/policies
2. Google Developers Blog, *Upcoming security changes to Google's OAuth 2.0 authorization endpoint in embedded webviews* (2021-06-29) — https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews
3. Google Developers Blog, *Guidance to developers affected by our effort to block less secure browsers and applications* (2020-08-28) — https://developers.googleblog.com/guidance-to-developers-affected-by-our-effort-to-block-less-secure-browsers-and-applications/
4. IETF, *RFC 8252: OAuth 2.0 for Native Apps*, §8.12 Embedded User-Agents — https://www.rfc-editor.org/rfc/rfc8252.txt
5. Microsoft Learn, *WebView2 in WinUI 3*（Authentication and SSO in WebView2） — https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/webview2
6. Microsoft Learn, *CoreWebView2Settings.UserAgent Property* — https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2settings.useragent
7. Microsoft Learn, *Distribute your app and the WebView2 Runtime* — https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
8. Microsoft Learn, *WebView2 browser flags* — https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags
9. Microsoft Learn, *Detecting Microsoft Edge from your website* — https://learn.microsoft.com/en-us/microsoft-edge/web-platform/user-agent-guidance
10. Electron, *session* — https://www.electronjs.org/docs/latest/api/session
11. Electron, *BrowserWindow*（partition） — https://www.electronjs.org/docs/latest/api/browser-window
12. Electron, *Security*（contextIsolation 等） — https://www.electronjs.org/docs/latest/tutorial/security
13. Electron, *shell*（openExternal） — https://www.electronjs.org/docs/latest/api/shell
14. Electron, *Why Electron* — https://www.electronjs.org/docs/latest/why-electron
15. Tauri, *WebviewBuilder*（data_directory / user_agent / on_navigation / on_new_window） — https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html
16. Tauri, *Opener plugin* — https://v2.tauri.app/plugin/opener/
17. Tauri, *Deep Linking plugin* — https://v2.tauri.app/plugin/deep-linking/
18. Google Search Help, *Resolve Google Search's "Unusual traffic from your computer network" message* — https://support.google.com/websearch/answer/86640

### 产品官方文档 / 帮助中心

19. Ferdium README（Franz hard-fork） — https://github.com/ferdium/ferdium-app/blob/develop/README.md
20. Ferdium issue #1043, *ChatGPT infinite checking browser* — https://github.com/ferdium/ferdium-app/issues/1043
21. Ferdium issue #2216, *Cloudflare Verify you are human* — https://github.com/ferdium/ferdium-app/issues/2216
21a. Ferdium issue #2403, *Cannot sign in on Claude using Google account* — https://github.com/ferdium/ferdium-app/issues/2403
22. Rambox, *How to create and configure apps* — https://support.rambox.app/getting-started/how-to-create-and-configure-apps.html
23. Rambox, *Profiles and session management* — https://support.rambox.app/getting-started/profiles-feature.html
24. Rambox, *Link handling* — https://support.rambox.app/getting-started/link-handling.html
25. Rambox v2, *How does Rambox work?*（webview/partition） — https://support.rambox.app/v2/faqs/how-does-rambox-work.html
26. Shift, *How Cookies and Partitions are Handled in Shift* — https://support.shift.com/hc/en-us/articles/39174004970004-How-Cookies-and-Partitions-are-Handled-in-Shift
27. Shift, *Searching in Shift and using the Home button*（Chromium-based） — https://support.shift.com/hc/en-us/articles/24812045401108-Searching-in-Shift-and-using-the-Home-button
28. Shift 144.0.0 release notes（Chromium rebase） — https://support.shift.com/hc/en-us/articles/48425635991700-Shift-144-0-0-Released-2026-04-09
29. Wavebox, *Wavebox is Evolving - Our Move to Chromium* — https://hub.wavebox.io/wavebox-is-evolving-our-move-to-chromium
30. Wavebox, *Platform*（Spaces / cookie isolation） — https://wavebox.io/platform
31. Wavebox GitHub README（Chromium parity / 4-week cadence） — https://github.com/wavebox/waveboxapp
32. Station desktop app（Electron，Apache-2.0） — https://github.com/getstation/desktop-app
33. WebCatalog, *Turn websites into desktop apps* — https://webcatalog.io/en/docs/article/turn-websites-into-desktop-apps-with-webcatalog
34. WebCatalog, *WebCatalog Desktop vs. Nativefier*（Chromium through Electron） — https://webcatalog.io/en/blog/webcatalog-desktop-vs-nativefier
35. Biscuit Help（default per-app session / Shared Session） — https://eatbiscuit.com/help/
36. Softpedia, *Biscuit* changelog（Electron 43.8.x） — https://www.softpedia.com/get/Internet/Browsers/Biscuit.shtml
37. Arc, *Privacy & Security*（Chromium / 48h） — https://resources.arc.net/hc/en-us/articles/19434846038935-Privacy-Security
38. Arc, *Profiles: Separate Work & Personal Browsing* — https://resources.arc.net/hc/en-us/articles/19227964556183-Profiles-Separate-Work-Personal-Browsing
38a. Arc FAQ（Chromium-based） — https://arc.net/faq
39. OpenAI, *Introducing ChatGPT Atlas* — https://openai.com/index/introducing-chatgpt-atlas
40. OpenAI Help Center, *ChatGPT release notes*（Retiring Atlas） — https://help.openai.com/en/articles/6825453-chatgpt-release-notes
41. Perplexity Help Center, *What is Comet's Browser Engine?* — https://www.perplexity.ai/help-center/comet/en/articles/11583798-what-is-comet-s-browser-engine
41a. PCMag, *OpenAI's Chrome Killer Is Here: Meet the ChatGPT Atlas Browser*（Chromium） — https://au.pcmag.com/ai/113810/openais-chrome-killer-is-here-meet-the-chatgpt-atlas-browser
42. Notion Help, *Account settings & preferences*（Open Notion links in browser） — https://www.notion.com/help/account-settings

### 源码 / 社区实现（仅作模式参考）

43. Ferdium `ServiceWebview.tsx` — https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/components/services/content/ServiceWebview.tsx#L179
44. Ferdium `windowOpenShim.ts` — https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/webview/windowOpenShim.ts#L20
45. Ferdium `service-helpers.ts` — https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/helpers/service-helpers.ts#L20
45a. Ferdium `config.ts`（`sandboxServices: true`） — https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/config.ts#L660
45b. Ferdium `Service.ts`（`persist:service-<id>`） — https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/models/Service.ts#L519
46. Rambox Community Edition `electron/main.js` — https://github.com/ramboxapp/community-edition/blob/eaa33fc8f3ce5f9600b032fd9ca7cfba1827b84f/electron/main.js#L163
47. Nativefier `windowEvents.ts` — https://github.com/nativefier/nativefier/blob/9078a3071a3c7fab977d4e0bb54d3579af8296f3/app/src/helpers/windowEvents.ts#L75
48. Nativefier `contextMenu.ts` — https://github.com/nativefier/nativefier/blob/9078a3071a3c7fab977d4e0bb54d3579af8296f3/app/src/components/contextMenu.ts
49. Station `session/main.ts` — https://github.com/getstation/desktop-app/blob/cdf771dab4cef58a9abf742caec82b79daba9bcb/packages/app/src/services/services/session/main.ts
50. FlareSolverr `flaresolverr_service.py` — https://github.com/FlareSolverr/FlareSolverr/blob/cc2224b21e31c09a713eb25690a8e8dcdf50d8d8/src/flaresolverr_service.py#L38
51. puppeteer-extra-plugin-recaptcha `content.ts` — https://github.com/berstend/puppeteer-extra/blob/39248f1f5deeb21b1e7eb6ae07b8ef73f1231ab9/packages/puppeteer-extra-plugin-recaptcha/src/content.ts#L39
52. puppeteer-extra-plugin-stealth README — https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth
53. electron/electron PR #53519（UA 与 Client Hints 元数据） — https://github.com/electron/electron/pull/53519
54. electron-turnstile-repro（UA 改写 vs Turnstile 600010） — https://github.com/akriaueno/electron-turnstile-repro
55. Brave issue #50100（Google CAPTCHA in new profiles） — https://github.com/brave/brave-browser/issues/50100
56. Simon Willison, *Introducing ChatGPT Atlas*（UA 实测） — https://simonwillison.net/2025/Oct/21/introducing-chatgpt-atlas/

### 二手补充（已明确标注）

57. ZDNET, *This might be my new favorite web browser*（Sidekick Chromium-based，2023） — https://www.zdnet.com/home-and-office/work-life/this-might-be-my-new-favorite-web-browser
57a. spacedeck, *The Sidekick browser: what it does and where it breaks down*（2026 状态与停售） — https://spacedeck.app/learn/sidekick-towa/
58. Slack 链接行为（默认浏览器） — https://slack.green/en/blog/slack-keeps-opening-in-browser （非 Slack 官方）

---

## 附：一句话建议

**Adlo 现在最该做的不是“把自己伪装成 Chrome”，而是“让用户在 Adlo 里被验证码挡住时，能一键到真正的浏览器里继续”，同时把 panel/center 的默认会话合并成一个可理解的浏览 Profile。** 完整 Chromium 能提供浏览器身份，但那是另一个产品；在 Adlo 的当前形态下，A+ 是成本、风险、双端一致性最平衡的路线。
