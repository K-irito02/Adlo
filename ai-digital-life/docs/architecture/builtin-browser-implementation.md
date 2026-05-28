# 内置浏览器实现总结

## 摘要
为右侧面板浏览器工具实现了完整的双模式内置浏览器功能。Tauri 桌面模式使用原生 child WebView（multiwebview），浏览器预览模式使用 `<iframe>` 直连 + 外部浏览器降级按钮。

## 架构变化

### 新增模块

| 模块 | 类型 | 说明 |
|------|------|------|
| `crates/browser` | Rust crate | `BrowserManager` 封装 Tauri child WebView 生命周期 |
| `src-tauri/src/commands/browser.rs` | Rust commands | 8 个 IPC 命令（create/destroy/navigate/go_back/go_forward/reload/set_bounds/eval） |
| `BrowserBridge` | TypeScript 接口 | 在 `DigitalLifeBridge` 中新增 `browser` 子接口 |

### 修改文件（共 14 个）

| 文件 | 变更 |
|------|------|
| `crates/browser/Cargo.toml` | 新增 crate 定义 |
| `crates/browser/src/lib.rs` | BrowserManager 实现（8 个方法 + on_navigation 事件） |
| `Cargo.toml`（根） | workspace.members 增加 `crates/browser` |
| `src-tauri/Cargo.toml` | 引用 adl-browser，tauri 启用 unstable feature |
| `src-tauri/tauri.conf.json` | CSP 放宽支持外部资源 |
| `src-tauri/capabilities/default.json` | 注册 browser IPC 命令权限 |
| `src-tauri/permissions/digital-life.toml` | 8 个 browser 命令白名单 |
| `src-tauri/src/state.rs` | AppState 增加 browser_manager 字段 |
| `src-tauri/src/setup.rs` | 初始化 BrowserManager |
| `src-tauri/src/commands/mod.rs` | 注册 browser 模块 |
| `src-tauri/src/main.rs` | invoke_handler 注册 8 个 browser 命令 |
| `frontend/src/shared/ipc.ts` | 新增 BrowserBridge 接口 |
| `frontend/src/tauri-bridge.ts` | 实现 browser.* 桥接方法 |
| `frontend/src/preview-bridge/index.ts` | 实现 browser.* no-op 桥接 |
| `frontend/src/mock-bridge.ts` | 实现 browser.* no-op 桥接 |
| `frontend/src/app/regions/right-panel/panels/BrowserPanel.tsx` | 核心重构：双模式 navigator + iframe + 历史栈 |
| `frontend/src/app/regions/right-panel/types.ts` | 清理 browserWebViewAvailable |
| `frontend/src/app/regions/right-panel/hooks/useBrowserPanelProps.ts` | 同步 prop 变更 |
| `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts` | 同步 prop 变更 |
| `frontend/src/app/copy.ts` | 新增浏览器文案、更新状态说明、新增外部浏览器按钮翻译 |
| `frontend/src/styles/regions/rightpanel/browser-panel.css` | 新增 iframe 样式、外部浏览器按钮样式 |

## 双模式架构

| 功能 | **Tauri 桌面模式** | **浏览器预览模式** |
|------|--------------------|--------------------|
| 页面渲染 | 系统 WebView（`window.add_child`） | `<iframe>` 嵌入 |
| URL 导航 | `browser_navigate` IPC → `window.location.href =` | 设置 `iframe.src` |
| 后退/前进 | `browser_go_back`/`browser_go_forward` IPC | 前端历史栈（最多 50 条） |
| 刷新 | `browser_reload` IPC | `iframe.contentWindow.location.reload()` |
| URL 变化监听 | `on_navigation` → `digital-life://browser-url-changed` 事件 | 前端直接设置 src |
| 降级按钮 | 无（WebView 已足够） | "在外部浏览器打开"浮动按钮 |
| WebView 生命周期 | `safeInvoke` 动态 import `@tauri-apps/api/core` | 无（不需创建 WebView） |

## 状态管理

浏览器状态存储在 `useUiStore`（Zustand）中，通过 localStorage 持久化：

| 状态 | 类型 | localStorage key |
|------|------|------------------|
| `browserTabs` | `BrowserTabState[]` | `adl-ui:browser-tabs` |
| `browserActiveTabId` | `string` | `adl-ui:browser-active-tab` |
| `browserBookmarks` | `BrowserBookmark[]` | `adl-ui:browser-bookmarks` |
| `browserHistory` | `BrowserHistoryEntry[]` | `adl-ui:browser-history` |
| `browserNavigatorWidth` | `number` | `adl-ui:browser-navigator-width` |

## 挑战与教训

### 1. Tauri API 在浏览器模式不可用
**问题**：`@tauri-apps/api` 仅在 Tauri 运行时存在，浏览器模式下为 `undefined`，直接导入会抛 `TypeError`。
**解决方案**：使用 `isTauriShell()` 守卫 + 动态 `import()` 延迟加载 Tauri API。

### 2. 地址栏输入被 `onMouseLeave` 打断
**问题**：`onMouseLeave` 绑定在 label 上触发 `collapseAddress()`，用户打字时鼠标离开 label 区域导致输入框立即折叠。
**解决方案**：移除 `onMouseLeave`，仅通过 `onBlur` 和点击外部区域折叠。

### 3. iframe 被服务器拦截
**问题**：`X-Frame-Options: DENY` 和 `frame-ancestors` CSP 阻止大多数网站在 iframe 中加载。
**解决方案**：保持直连 iframe 不做代理，能显示多少是多少；添加"在外部浏览器打开"降级按钮。

### 4. 本地代理方案的失败
**尝试**：Node.js Vite 中间件代理请求，剥离 `X-Frame-Options` 头，HTML 重写资源路径。
**失败原因**：
1. 现代网站使用 JS 动态加载模块（`import()`、`createElement('script')`），正则重写无法覆盖
2. `<base>` 标签与 URL 重写互相冲突
3. Cookie/登录态在代理通道中完全丢失
**结论**：纯 iframe + 降级按钮是最稳定可靠的方案。

### 5. 测试配置文件加载失败
**问题**：`previewWorkspaceService.ts` 中函数嵌套结构错误导致 Vite 中间件代码污染了模块顶层导出，vitest 无法加载配置。
**解决方案**：保持所有函数在模块顶层，export 函数与非 export 辅助函数分离。

## 快捷键

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+L` | 聚焦地址栏 |
| `Alt+Left` | 后退 |
| `Alt+Right` | 前进 |
| `F5` | 刷新 |

## 已知限制

| 限制 | 影响范围 |
|------|----------|
| iframe 受 `X-Frame-Options` 限制 | 浏览器预览模式约 80% 网站无法内嵌显示 |
| Cookie/登录态不支持 | 全局限制，需要登录的网站无法正常交互 |
| DevTools 未集成 | 后续版本 |
| Cookie/缓存治理未实现 | 后续版本 |

## 后续修复与优化（2026-05-28）

### 修复问题清单

| 问题 | 修复方案 | 文件 |
|------|----------|------|
| "在外部浏览器打开"按钮无效 | 引入 Tauri Shell Plugin 的 `open()` 方法 | `BrowserPanel.tsx`, `tauri-bridge.ts` |
| URL 显示和内容区域有冗余"复制链接"按钮 | 移除冗余按钮，将复制功能改为图标添加到地址栏右侧 | `BrowserPanel.tsx`, `browser-panel.css`, `copy.ts` |
| 原生 tooltip 显示 | 使用项目自定义 `TooltipSimple` 组件替换 | `BrowserPanel.tsx` |
| Tauri 模式下无法打开网站 | 移除 `webViewActive` 状态，修复 `browser_set_bounds` 调用时机 | `BrowserPanel.tsx` |
| Tauri 模式界面无响应 | 移除 WebView 的 `.auto_resize()` 配置，防止覆盖标题栏 | `crates/browser/src/lib.rs` |
| 变更面板"已暂存\|已修改\|未追踪"区域消失 | 修复 `hasChangeEntries` 计算逻辑，改为检查所有工作区 | `ChangesPanel.tsx` |
| 标题栏按钮圆角问题 | 为 `.adl-titlebar .adl-iconstrip__button` 添加 `border-radius: 0` | `titlebar.css` |
| Tauri 模式标题栏按钮点击不工作 | 为 `.adl-titlebar .tooltip-trigger` 添加 `-webkit-app-region: no-drag` 和 `pointer-events: auto` | `titlebar.css` |

### 新增经验教训

#### 6. Tauri WebView auto_resize 的陷阱
**问题**：WebView 使用 `.auto_resize()` 后会填满整个窗口，覆盖标题栏导致按钮无法点击。
**解决方案**：移除 `.auto_resize()`，通过 `browser_set_bounds` 命令精确控制 WebView 边界。
**关键文件**：`crates/browser/src/lib.rs`

#### 7. Tooltip 组件在 Tauri 拖拽区域的交互
**问题**：TooltipTrigger 包裹的按钮在 Tauri 标题栏（拖拽区域）中无法点击。
**解决方案**：为 `.adl-titlebar .tooltip-trigger` 显式添加 `-webkit-app-region: no-drag` 和 `pointer-events: auto`。
**关键文件**：`titlebar.css`

#### 8. 多工作区变更统计的一致性
**问题**：`hasChangeEntries` 仅检查当前活动工作区，但统计数字基于所有工作区。
**解决方案**：统一为检查 `totalChangeCount > 0`，确保显示逻辑一致。
**关键文件**：`ChangesPanel.tsx`
