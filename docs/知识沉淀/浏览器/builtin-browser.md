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
