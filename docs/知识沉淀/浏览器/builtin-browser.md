# 内置浏览器经验教训

本文整理了内置浏览器功能开发过程中积累的经验教训，按主题分类。

## Tauri 平台差异

### 1. Tauri API 在浏览器模式不可用
**问题**：`@tauri-apps/api` 仅在 Tauri 运行时存在，浏览器模式下为 `undefined`，直接导入会抛 `TypeError`。
**解决方案**：使用 `isTauriShell()` 守卫 + 动态 `import()` 延迟加载 Tauri API。

### 2. Tauri Command 的主线程约束
**问题**：`#[tauri::command]` 默认在线程池执行，`window.add_child()` 在 Windows 上需要创建 HWND，该操作必须在主线程（父窗口消息泵线程）上执行，否则 `CreateCoreWebView2Controller` 无限阻塞。
**解决方案**：命令改为 `async fn`，使用 `app.run_on_main_thread()` + `tokio::sync::oneshot` 通道将创建操作分派到主线程。
**关键文件**：`src-tauri/src/commands/browser.rs`

### 3. React Strict Mode 与 Tauri IPC 的兼容性
**问题**：React 18 开发模式在 Strict Mode 下 mount→unmount→remount，导致两次 `invoke("browser_create")` 竞争，promise 永不 resolve/reject。
**解决方案**：使用 `useRef` 追踪创建中的状态（`creatingRef`），防止重复调用；添加 `Promise.race` 超时保护。
**关键文件**：`BrowserPanel.tsx`

### 4. Child WebView 初始位置策略
**问题**：WebView2 子 HWND 无论创建在 `(0,0)/(1,1)` 还是 `(0,0)/(800,600)`，都会在瞬间覆盖父窗口的 HTML 区域，导致标题栏按钮不可点击。
**解决方案**：始终创建在屏幕外 `(-10000,-10000)`，然后通过异步 `browser_set_bounds` 移动到正确位置。创建与定位分离避免竞态。
**关键文件**：`crates/browser/src/lib.rs`、`BrowserPanel.tsx`

### 5. Child WebView IPC 完全不可用
**问题**：Tauri 2.x 通过 `window.add_child()` 创建的子 WebView 不注入 `__TAURI_INTERNALS__` 对象，所有 IPC 路径（`invoke`、`emit`、`postMessage`、`chrome.webview`）均静默失败。
**解决方案**：使用 `tauri::Builder::on_page_load` 全局钩子 + `std::thread::spawn`（WebView2 回调上下文无 Tokio）+ `webview.eval()` 从 Rust 侧执行 JS。用 `window.location.hash` 和 `window.open('adl-title:...')` 两种通道将数据传回主进程：
- `hash` → `on_navigation` 拦截（返回 `false` 阻止导航）
- `window.open` → `on_new_window` 拦截（返回 `Deny`）
**关键文件**：`src-tauri/src/main.rs`、`crates/browser/src/browser_events.rs`
**测试结果**：YouTube ✅、Bilibili ✅、ChatGPT ✅（经多轮轮询可捕获 SPA 动态标题）

### 6. SPA 页面标题轮询策略
**问题**：ChatGPT 等 SPA 在 `PageLoadEvent::Finished` 时 `document.title` 可能尚未设置，单次 eval 无法捕获标题。
**解决方案**：eval 脚本内部用 `setTimeout` 自轮询：首次尝试在 500ms 后（+500ms 初始延迟=1s），之后每 1.5s 重试，最多 10 次。每次尝试同时尝试 `window.open` 和 `location.hash` 两个通道。
**关键文件**：`src-tauri/src/main.rs`（eval 脚本）

### 7. `window.open` 通道需携带页面 URL
**问题**：`window.open('adl-title:Title')` 触发的 `new_window_handler` 无法获取页面 URL，emit 时 `url: ""` 导致前端 `tabsUpdated: 0`。
**解决方案**：eval 脚本将 `location.href` 编码为 query 参数 `?url=...`，Rust 端用 `url.query_pairs()` 提取。
**格式**：`adl-title:<encoded_title>?url=<encoded_page_url>`
**关键文件**：`src-tauri/src/main.rs`、`crates/browser/src/browser_events.rs`

### 8. INIT_SCRIPT 注入所有框架导致 iframe 标题污染
**问题**：`initialization_script` 通过 `WebviewBuilder::initialization_script` 注入到子 WebView 的每一帧（主页面和所有 iframe）。带有 iframe 的页面（如 bilibili）的每个 iframe 都调用 `window.open('adl-title:...')` 上报标题，导致标签栏展示 iframe 标题（如 "Leader Iframe"、"Cross Origin Local Storage"），并引发后续导航循环。
**解决方案**：在 INIT_SCRIPT 的快速标题上报 IIFE 入口加 `if (window.top !== window.self) return;` 守卫，仅顶层框架上报标题。`webview.eval()`（eval 脚本）本身只在顶层上下文执行，无需守卫。
**关键文件**：`crates/browser/src/browser_navigation.rs`

### 9. 延迟创建标签导致的导航循环
**问题**：`submitAddress` 推迟标签创建至标题到达。`navigateTauriUrl` 在无 tab 时直接导航 WebView，随后 `handlePageMeta` 收到标题后创建 tab → 触发 `useEffect`(activeTab 变更) → 再次调用 `browser_navigate` → WebView 重载 → `onUrlChanged` → 再入 `handlePageMeta` → 循环。带 iframe 的页面因多个 URL 快速到达而加剧，单值引用的跳过检查被反复覆盖失效。
**解决方案**（三层机制，各司其职）：
- **Map 防抖**：`recentNavigatedUrlsRef: Map<string, number>` 替代单值引用，记录最近 1 秒内所有到达的 URL。`navigateTauriUrl` 检查 URL 是否在窗口内，在则跳过导航。1 秒后过期自动清理，支持正常标签切换。
- **预期 URL 过滤器**：`expectedNavigationUrlRef` 追踪用户导航目标。`navigation_handler` 仍会为子框架导航发出 `browser-url-changed` 事件，触发 HTTP 抓取路径。过滤器仅处理预期目标 URL 或同站重定向（`isProbablySameSite`），阻止 iframe meta 污染标签。
- **统一导航入口**：移除 `useEffect` 内嵌的创建/导航逻辑，委托给 `navigateTauriUrl`，该函数统一处理 WebView 创建、导航、跳过判断。
**关键文件**：`useBrowserWebView.ts`

### 10. HTTP 抓取路径也会处理子框架 URL
**问题**：即使 INIT_SCRIPT 守卫阻止了 `window.open` 通道，`navigation_handler`（Rust `on_navigation` 回调）仍会为所有导航（包括子框架）发出 `browser-url-changed`。前端 `onUrlChanged` 收到子框架 URL 后调用 `browser_fetch_page_meta`（HTTP 抓取），响应进入 `handlePageMeta` → 改写标签标题和 URL。
**解决方案**：在 `onUrlChanged` 前端处理器中增加同站过滤：只有当 `actualUrl` 等于 `expectedNavigationUrlRef` 的预期 URL，或与预期 URL 同根域名（`isProbablySameSite`，处理 youtube.com → www.youtube.com 重定向）时才处理。3 秒超时后 `expectedNavigationUrlRef` 自动清除，后续页面内正常导航恢复处理。
**关键文件**：`useBrowserWebView.ts`

### 11. 标签元数据延迟创建与同步更新

**问题**：导航后立即创建标签并用 hostname 作为占位标题，后续 meta 上报后更新为真实标题，产生主机名→标题的可见过渡。Favicon 与标题不同步（favicon 先于标题出现）。历史记录中同一页面因 URL 变体（`?vd_source=`）产生多个条目，一个永久显示主机名。

**解决方案**：
- **延迟创建**：无活动标签时等待 `prefetchPageMeta` HTTP 预取或超时后再创建标签。有活动标签时更新 URL 但不设置占位标题。
- **同步渲染**：仅在获得真实标题时才缓存 favicon 并更新标签，两者在同一次 Zustand 渲染中同时出现。
- **历史 path 去重**：引入 `historyDedupKey(url)` 按 hostname+pathname 去重（忽略 query params/hash/trailing slash）。
- **保留真实标题**：后退导航时检查历史条目是否已有真实标题，若有则保留不覆盖。
- **树视图过滤**：历史树中过滤掉名称仍为空的条目（仅有 URL 占位标题的不可见）。

**关键文件**：`useBrowserUrlChange.ts`, `useBrowserPageMeta.ts`, `browserDisplayUtils.ts`（`historyDedupKey`）, `browserSlice.ts`, `browserHistorySlice.ts`, `useBrowserTreeData.ts`
**详细文档**：[browser-tab-meta-deferred-creation-2026-06-25.md](./browser-tab-meta-deferred-creation-2026-06-25.md)

### 12. Favicon 预加载与标题同步
**问题**：标签页创建时 favicon 图标（`<img>`）需异步从网络加载，比文本标题延迟显示 50-200ms，用户感知同步性差。
**解决方案**：两级预加载——
- `handleNavigationStart`：导航开始时立即 `new Image().src = googleFaviconUrl` 预加载 Google S2 favicon，给予 300ms 提前量
- `handlePageMeta`：收到页面 meta 后对实际 favicon URL 同样 `new Image().src` 预加载，若仍是 Google S2 URL 则直接命中已加载的缓存
浏览器共享 `new Image()` 与 `<img>` 的图片缓存，确保标签渲染时 favicon 已加载完成或即将完成。
**关键文件**：`BrowserPanel.tsx`、`useBrowserWebView.ts`

## WebView 生命周期

### 5. Tauri WebView auto_resize 的陷阱
**问题**：WebView 使用 `.auto_resize()` 后会填满整个窗口，覆盖标题栏导致按钮无法点击。
**解决方案**：移除 `.auto_resize()`，通过 `browser_set_bounds` 命令精确控制 WebView 边界。
**关键文件**：`crates/browser/src/lib.rs`

### 6. Off-screen Bounds 策略替代 hide/show
**问题**：Tauri `Webview::hide()`/`show()` API 在跨平台兼容性上不可靠，且 hide/show effect 与 creation effect 的依赖耦合导致 WebView 被意外重新创建。
**解决方案**：改用已充分验证的 `browser_set_bounds` 命令，将 WebView 移到屏幕外 `(-10000,-10000,1,1)` 并在对话框关闭时通过 `updateWebViewBounds()` 恢复。同时使用 `webViewVisibleRef` 守卫防止 resize observer 在隐藏期间误触恢复。
**关键文件**：`useBrowserPanel.ts`

## 交互与样式

### 7. Tooltip 组件在 Tauri 拖拽区域的交互
**问题**：TooltipTrigger 包裹的按钮在 Tauri 标题栏（拖拽区域）中无法点击。
**解决方案**：为 `.adl-titlebar .tooltip-trigger` 显式添加 `-webkit-app-region: no-drag` 和 `pointer-events: auto`。
**关键文件**：`titlebar.css`

### 8. 地址栏输入被 `onMouseLeave` 打断
**问题**：`onMouseLeave` 绑定在 label 上触发 `collapseAddress()`，用户打字时鼠标离开 label 区域导致输入框立即折叠。
**解决方案**：移除 `onMouseLeave`，仅通过 `onBlur` 和点击外部区域折叠。

## 页面加载与代理

### 9. iframe 被服务器拦截
**问题**：`X-Frame-Options: DENY` 和 `frame-ancestors` CSP 阻止大多数网站在 iframe 中加载。
**解决方案**：保持直连 iframe 不做代理，能显示多少是多少；添加"在外部浏览器打开"降级按钮。

### 10. 本地代理方案的失败
**尝试**：Node.js Vite 中间件代理请求，剥离 `X-Frame-Options` 头，HTML 重写资源路径。
**失败原因**：
1. 现代网站使用 JS 动态加载模块（`import()`、`createElement('script')`），正则重写无法覆盖
2. `<base>` 标签与 URL 重写互相冲突
3. Cookie/登录态在代理通道中完全丢失
**结论**：纯 iframe + 降级按钮是最稳定可靠的方案。

## 状态管理

### 11. 多工作区变更统计的一致性
**问题**：`hasChangeEntries` 仅检查当前活动工作区，但统计数字基于所有工作区。
**解决方案**：统一为检查 `totalChangeCount > 0`，确保显示逻辑一致。
**关键文件**：`ChangesPanel.tsx`

### 12. localStorage 异步水合的竞态风险
**问题**：`hydrateBrowserDefaults()` 通过 `requestIdleCallback` 延迟执行，当用户在 hydration 完成前进行操作（导航、收藏）时，延迟的水合用 localStorage 旧数据覆盖了内存中的新状态。
**解决方案**：在水合逻辑中检查当前状态是否已被修改（`browserHistory.length > 0`、`browserTabs` 非初始值），仅当状态仍为初始默认值时才从 localStorage 覆盖。
**关键文件**：`browserSlice.ts`

### 13. 状态管理迁移（useUiStore → useAppStore/browserSlice）
**问题**：浏览器功能从老旧的单体 `useUiStore`（Zustand）迁移到新的 `useAppStore` + `browserSlice` 时，初始状态被设为空值，导致 `activeTab` 计算为 `undefined`。
**解决方案**：`browserSlice` 使用 `createDefaultBrowserTab()` 初始化默认标签，确保首屏即有时可用标签。
**关键文件**：`browserSlice.ts`

## 测试与构建

### 14. 测试配置文件加载失败
**问题**：`previewWorkspaceService.ts` 中函数嵌套结构错误导致 Vite 中间件代码污染了模块顶层导出，vitest 无法加载配置。
**解决方案**：保持所有函数在模块顶层，export 函数与非 export 辅助函数分离。

## CSS 与布局

### 15. 按钮布局的 grid vs flex 选择
**问题**：使用 `flex` + `justify-content: space-around` 时，按钮两侧会有空隙，无法完全填满容器宽度。
**解决方案**：改用 `grid` + `grid-template-columns: repeat(3, 1fr)` 确保按钮均匀分布且填满整行。
**关键文件**：`browser-panel.css`

### 16. 容器宽度自适应的最小宽度陷阱
**问题**：搜索输入框在窄容器中被截断，因为 `min-width` 默认值阻止了收缩。
**解决方案**：显式设置 `min-width: 0` 允许输入框收缩以适应容器宽度。
**关键文件**：`browser-panel.css`

## 交互设计通用原则

### 界面交互
- **点击区域最大化**：让用户可以点击整个行，而不是只能点击小按钮
- **视觉反馈一致**：选中状态应该有一致的视觉反馈

### 选中状态管理
- **单一状态源**：使用单一状态管理选中项
- **状态同步**：确保 ref 和 state 保持同步
- **点击外部取消选中**：监听全局点击，点击外部时取消选中

### 组件设计
- **回调函数设计**：在子组件中提供回调，让父组件控制行为
- **状态提升**：将选中状态提升到共同的父组件中管理
- **避免重复状态**：不要在多个地方管理选中状态

### 数据结构设计
- 确保状态字段能够完整描述对象的上下文关系
- 避免使用隐式的父子关系推断，应显式存储

### 递归逻辑复杂度
- 复杂的递归操作容易引入难以追踪的 bug
- 优先使用扁平化存储 + 运行时计算的方式

### 模块化设计
- 数据存储层、数据构建层、UI 层应清晰分离
- 每层的职责应单一明确

### 测试验证
- 在修复过程中应逐步验证每个环节
- 使用类型检查工具提前发现类型不匹配问题
