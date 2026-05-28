# Tasks

- [x] Task 1: 创建 browser crate 并配置 Tauri 依赖
  - [x] 1.1 创建 `crates/browser/` 目录结构（Cargo.toml, src/lib.rs）
  - [x] 1.2 在 `crates/browser/Cargo.toml` 中配置依赖（tauri with unstable feature, serde, serde_json, tracing, tokio）
  - [x] 1.3 将 browser crate 加入 workspace members（根 `Cargo.toml`）
  - [x] 1.4 将 browser crate 加入 `src-tauri/Cargo.toml` 的依赖
  - [x] 1.5 更新 `src-tauri/Cargo.toml`，为 tauri 依赖启用 `unstable` feature（multiwebview 需要）
  - [x] 1.6 更新 `src-tauri/tauri.conf.json` 的 CSP 策略，确保 child WebView 可加载外部资源
  - [x] 1.7 更新 `src-tauri/permissions/digital-life.toml`，注册 browser 命令权限

- [x] Task 2: 实现浏览器 WebView 管理器的 Rust 后端
  - [x] 2.1 在 `crates/browser/src/lib.rs` 中定义 `BrowserManager` 结构体，管理 WebView 生命周期
  - [x] 2.2 实现 `BrowserManager::create()` — 创建 child WebView，设置初始 URL
  - [x] 2.3 实现 `BrowserManager::destroy()` — 销毁 child WebView 并清理资源
  - [x] 2.4 实现 `BrowserManager::navigate()` — 导航到指定 URL
  - [x] 2.5 实现 `BrowserManager::go_back()` / `go_forward()` — 前进后退
  - [x] 2.6 实现 `BrowserManager::reload()` — 刷新页面
  - [x] 2.7 实现 `BrowserManager::set_bounds()` — 设置 WebView 位置和尺寸
  - [x] 2.8 实现 `BrowserManager::eval()` — 执行 JavaScript（为 AI 联动预留）
  - [x] 2.9 通过 `on_navigation` 回调拦截导航事件，emit 到前端

- [x] Task 3: 在 src-tauri 中注册 IPC 命令和状态管理
  - [x] 3.1 更新 `src-tauri/src/state.rs` 的 `AppState`，增加 `browser_manager` 字段
  - [x] 3.2 在 `src-tauri/src/setup.rs` 中初始化 `BrowserManager`
  - [x] 3.3 创建 `src-tauri/src/commands/browser.rs`，实现 IPC 命令：`browser_create`, `browser_destroy`, `browser_navigate`, `browser_go_back`, `browser_go_forward`, `browser_reload`, `browser_set_bounds`, `browser_eval`
  - [x] 3.4 更新 `src-tauri/src/commands/mod.rs`，注册 browser 模块
  - [x] 3.5 在 `src-tauri/src/main.rs` 的 `invoke_handler` 中注册所有 browser 命令

- [x] Task 4: 更新前端 BrowserPanel 集成 Tauri WebView
  - [x] 4.1 在 `BrowserPanel.tsx` 中，当面板激活时调用 `browser_create` 创建 WebView
  - [x] 4.2 使用 `ResizeObserver` 监听 `.adl-tool-primary--browser` 元素边界变化，调用 `browser_set_bounds`
  - [x] 4.3 监听 `window.resize` 事件，触发边界同步
  - [x] 4.4 在地址栏提交时调用 `browser_navigate`，替代当前的仅前端状态更新
  - [x] 4.5 实现前进/后退/刷新按钮的实际 IPC 调用，替代当前的占位 disabled 状态
  - [x] 4.6 监听后端导航事件（`digital-life://browser-url-changed`），更新地址栏、标签页
  - [x] 4.7 当面板卸载时，调用 `browser_destroy` 清理 WebView
  - [x] 4.8 将 WebView canvas 占位 div 替换为实际的 WebView 容器区域

- [x] Task 5: 更新类型定义和 Props
  - [x] 5.1 在 `right-panel/types.ts` 的 `RightPanelViewProps` 中新增 `browserWebViewAvailable: boolean`
  - [x] 5.2 更新 `BrowserPanelProps` 类型包含新属性
  - [x] 5.3 更新 `hooks/useBrowserPanelProps.ts` 传递新属性
  - [x] 5.4 更新 `hooks/useRightPanelViewProps.ts` 中 browser 相关 props

- [x] Task 6: 更新文案
  - [x] 6.1 在 `copy.ts` 中更新中文"Webview、DevTools 与 Cookie/缓存治理仍在后续阶段接入"文案
  - [x] 6.2 在 `copy.ts` 中更新英文对应文案

# Task Dependencies
- Task 2 依赖 Task 1（browser crate 创建后才能在 Tauri 中使用）
- Task 3 依赖 Task 2（browser manager 实现后才能在 commands 中调用）
- Task 4 依赖 Task 3（IPC 命令注册后前端才能调用）
- Task 5 可与 Task 4 并行
- Task 6 可与 Task 4 并行
