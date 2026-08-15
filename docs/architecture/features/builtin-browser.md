# 内置浏览器实现总结

> **2026-08-15 更新**：书签语义重构——去重从「按网址」改为「(网址, 标题)」元组语义（新建/编辑/保存并打开/收藏到目录/星标切换统一）；「新建书签/编辑书签」对话框改双按钮（保存并打开/仅保存，无取消）；标签标题隔离（已打开/将打开的标签始终显示网站真实标题，书签自定义标题只在书签树显示）；重复书签拦截时 toast 附带语义化路径（如「工作区A/工具/子文件夹」）；目录/书签悬停原生 `title` 改为语义化路径（`/` 分隔）。详见 [browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md](../../knowledge-base/browser/2026-08/browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md)。
> **2026-08-14 更新**：修复历史导航与标题提取——C1 注入脚本历史 URL 归一化（pushState/replaceState 剥离 tracking/radio 参数，同 URL 转 replace）+ C2 前端智能回退（smartGoBack 循环 GoBack 到栈底）+ 原生 `can_go_back`/`can_go_forward` IPC（回退/前进按钮禁用态，双端一致）+ 标题来源门控（provenance：com 可覆盖 com/google 来源实现实时更新，不可覆盖 http/iframe 抓取标题）+ A2 SPA 兜底 h1 择优。详见 [browser-history-navigation-2026-08-14.md](../../knowledge-base/browser/2026-08/browser-history-navigation-2026-08-14.md)。
> **2026-08-13 更新**：新增网站元数据持久化缓存（favicon data-URI + 标题）——三层架构（Rust SQLite `SiteMetaCacheStore` / preview JSON 文件 / 前端 `siteMetaCache.ts` 内存层），重开应用已缓存条目零网络秒开。预载门控、成功才写、失败保留旧缓存、引用计数删除、无条数上限。详见 [browser-site-meta-cache-2026-08-13.md](../../knowledge-base/browser/2026-08/browser-site-meta-cache-2026-08-13.md)。
> **2026-06-30 更新**：修复书签删除跨域污染——`browserRemoveTabBookmarks` 工作区过滤从 `tabId`-only 改为 `(tabId, url)` 对，新增 `scopeFolderId` 参数限定文件夹范围。详见 [browser-folder-delete-bookmark-cleanup-2026-06-30.md](../../knowledge-base/browser/browser-folder-delete-bookmark-cleanup-2026-06-30.md)。  
> **2026-06-28 更新**：修复 SPA 导航标题同步（Bilibili/YouTube 手动点击无响应/标题延迟 + 清空标签删除收藏目录标签）。详见 [browser-spa-navigation-title-sync-fix-2026-06-28.md](../../knowledge-base/browser/browser-spa-navigation-title-sync-fix-2026-06-28.md)。  
> **2026-06-26 更新**：修复历史记录不记录的 6 个 Bug。详见 [browser-history-recording-fix-2026-06-26.md](../../knowledge-base/browser/browser-history-recording-fix-2026-06-26.md)。  
> **2026-06-25 更新**：标签创建策略从"立即创建+hostname 占位"重构为"延迟创建+同步渲染"。详见 [browser-tab-meta-deferred-creation-2026-06-25.md](../../knowledge-base/browser/browser-tab-meta-deferred-creation-2026-06-25.md)。

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

> 经验教训已迁移至 [knowledge-base/browser/builtin-browser.md](../../knowledge-base/browser/builtin-browser.md)

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
| 变更面板"已暂存\|已修改\|已追踪"区域消失 | 修复 `hasChangeEntries` 计算逻辑，改为检查所有工作区 | `ChangesPanel.tsx` |
| 标题栏按钮圆角问题 | 为 `.adl-titlebar .adl-iconstrip__button` 添加 `border-radius: 0` | `titlebar.css` |
| Tauri 模式标题栏按钮点击不工作 | 为 `.adl-titlebar .tooltip-trigger` 添加 `-webkit-app-region: no-drag` 和 `pointer-events: auto` | `titlebar.css` |

> 经验教训已迁移至 [knowledge-base/browser/builtin-browser.md](../../knowledge-base/browser/builtin-browser.md)

## 浏览器功能修复（2026-05-28）

### 修复问题清单

| 问题 | 根因 | 修复方案 | 文件 |
|------|------|----------|------|
| `browser_create` invoke 永不返回 | Tauri `#[tauri::command]` 默认运行在线程池，`window.add_child()` 在 Windows 下创建 HWND 子窗口必须在主线程 | 改为 `async` 命令，通过 `app.run_on_main_thread()` 分派到主线程，`oneshot::channel` 等待结果 | `src-tauri/src/commands/browser.rs` |
| React Strict Mode 双重挂载导致 invoke 冲突 | 开发环境下 React 18 mount→unmount→remount，两次 `browser_create` 竞争导致 IPC 序列化混乱 | 引入 `creatingRef` 防止重复调用；`Promise.race` + 10s 超时防止无限挂起；清理时仅在真正的卸载阶段才销毁 WebView | `BrowserPanel.tsx` |
| WebView 覆盖标题栏导致按钮失效 | `add_child` 使用 `getBoundingClientRect()` 坐标可能错误定位，WebView2 HWND 覆盖 HTML 内容 | WebView 始终创建在屏幕外 `(-10000,-10000)`，创建成功后再通过 `set_bounds` 移动到正确位置 | `crates/browser/src/lib.rs`, `BrowserPanel.tsx` |

> 经验教训已迁移至 [knowledge-base/browser/builtin-browser.md](../../knowledge-base/browser/builtin-browser.md)

## 浏览器功能修复（2026-05-30）

### 修复问题清单

| 问题 | 根因 | 修复方案 | 文件 |
|------|------|----------|------|
| 浏览器模式下输入网址回车不打开网页 | `browserSlice` 初始化为空 `browserTabs: []`、`browserActiveTabId: ""`，导致 `activeTab` 为 `undefined`、`hasActiveTab` 为 `false` | 初始化默认标签 `createDefaultBrowserTab()`，并从 localStorage 水合 | `browserSlice.ts` |
| 收藏标签按钮不可用/不显示对话框 | `BookmarkTabDialog` 组件被移除，按钮改为简单的 toggle 操作 | 恢复 `BookmarkTabDialog` 导入和渲染，新增 `handleBookmarkTab` 回调支持三种模式（工作区/已有文件夹/新建文件夹） | `BrowserPanel.tsx` |
| 历史记录不显示 | `hydrateBrowserDefaults()` 通过 `requestIdleCallback` 异步水合，用户导航后延迟水合用 localStorage 旧数据（空数组）覆盖了内存中已有的历史记录 | 水合增加防护检查：仅当 `browserHistory`/`browserBookmarks`/`browserTabs` 仍为初始状态时才从 localStorage 覆盖 | `browserSlice.ts` |
| 收藏标签对话框显示错误网址、收藏失败 | 同上 hydration 竞态条件；文件夹折叠看不到已收藏的标签 | 同上 hydration 竞态修复；`handleBookmarkTab` 收藏后自动展开目标文件夹 | `browserSlice.ts`, `BrowserPanel.tsx` |
| 点击网页中链接无跳转、无错误提示 | iframe 的 `onLoad`/`onError` 处理器被设为空函数 `() => {}` | 新增 `handleIframeLoad`（重置错误 + 同源 URL 同步地址栏）和 `handleIframeError`（设置错误标志触发降级 UI） | `useBrowserPanel.ts`, `BrowserPanel.tsx` |
| 对话框/菜单被 WebView 覆盖 | Tauri 原生 child WebView 在 OS 层级高于 HTML 元素，CSS z-index 无法控制 | 对话框打开时将 WebView 移动到屏幕外 `(-10000,-10000,1,1)`，关闭时通过 `updateWebViewBounds()` 恢复；`webViewVisibleRef` 防止 resize observer 误触恢复 | `useBrowserPanel.ts`, `BrowserPanel.tsx` |
| 对话框关闭时网页意外刷新 | WebView 创建 effect 依赖数组包含 `webViewDisabled`，对话框关闭触发 effect 重新执行 → `browser_navigate` 导致刷新 | 从创建 effect 依赖数组中移除 `webViewDisabled`，创建 effect 仅响应 URL/标签变化 | `useBrowserPanel.ts` |

> 经验教训已迁移至 [knowledge-base/browser/builtin-browser.md](../../knowledge-base/browser/builtin-browser.md)

## 浏览器功能修复（2026-06-01）

### 修复问题清单

| 问题 | 根因 | 修复方案 | 文件 |
|------|------|----------|------|
| 浏览器工具缺少新建标签/目录按钮 | 功能未实现 | 在"删除全部目录标签"按钮左侧添加两个占位按钮，点击时输出 console.log | `BrowserPanel.tsx`, `copy.ts` |
| 搜索区域按钮样式与变更面板不一致 | 搜索区域使用自定义样式，未复用设计系统 | 改用 `adl-tool-navigator__summary-stat` 样式类，实现与变更面板"已暂存/已修改/未追踪"一致的 UI | `BrowserPanel.tsx`, `browser-panel.css` |
| 搜索输入框在侧边栏收缩时被截断 | 输入框宽度硬编码，未自适应容器 | 设置 `width: 100%` + `min-width: 0`，移除硬编码宽度限制 | `browser-panel.css` |
| 搜索输入框有描边灰线效果 | 继承了默认搜索框样式 | 设置 `border: none`、`box-shadow: none`、`background: var(--surface-subtle)` | `browser-panel.css` |
| 搜索区域按钮文字过长 | 国际化文案过长 | 将"收藏标签搜索/历史标签搜索/全部搜索"改为"收藏/历史/全部" | `copy.ts` |
| 搜索区域按钮布局不均匀 | flex 布局设置不当 | 使用 `grid-template-columns: repeat(3, 1fr)` 实现均匀分布 | `browser-panel.css` |

> 经验教训已迁移至 [knowledge-base/browser/builtin-browser.md](../../knowledge-base/browser/builtin-browser.md)

### 修改文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/app/features/browser/browserpanel.tsx` | 修改 | 添加新建标签/新建目录按钮；修改搜索区域按钮结构 |
| `frontend/src/app/i18n/zh-CN/browser.ts` | 修改 | 缩短搜索范围按钮文案 |
| `frontend/src/styles/regions/rightpanel/browser-panel.css` | 修改 | 添加搜索区域样式，修复布局和视觉问题 |

## 浏览器功能修复（2026-06-04）

### 修复问题清单

| 问题 | 根因 | 修复方案 | 文件 |
|------|------|----------|------|
| Tauri 模式下网页内导航地址栏不更新 | Rust 后端和 Tauri Bridge 都有事件机制，但 `useBrowserPanel` 中没有监听 URL 变化事件 | 在 `useBrowserPanel` 中新增 `useEffect` 监听 `digital-life://browser-url-changed` 事件，同步更新地址栏和标签页状态 | `useBrowserPanel.ts` |
| useEffect 缺少依赖 | `setAddress` 未包含在依赖数组中 | 添加 `setAddress` 到依赖数组 | `useBrowserPanel.ts` |
| window.digitalLife 类型检查 | 直接访问 `window.digitalLife.browser` 未进行空值检查 | 使用可选链操作符 `?.` 进行空值检查 | `useBrowserPanel.ts` |

### 修改文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/app/features/browser/useBrowserPanel.ts` | 修改 | 添加 URL 变化事件监听，同步更新地址栏和标签页 |

> 详细经验教训已记录在 [knowledge-base/browser/browser-url-sync-fix-2026-06-04.md](../../knowledge-base/browser/browser-url-sync-fix-2026-06-04.md)

## 浏览器导航模式切换 + 自动刷新修复（2026-06-20）

### 新功能

在工具栏"刷新"按钮右侧添加导航模式切换 Switch（`@radix-ui/react-switch` + `motion`）：

| 模式 | 滑块位置 | 行为 |
|------|----------|------|
| 新建标签（默认） | 左 | URL 变更 → `browserOpenTab` → 创建新标签 |
| 就地导航 | 右 | URL 变更 → `browserNavigateActiveTab` → 更新当前标签 |

状态持久化到 localStorage（key: `adl-ui:browser-navigate-in-place`）。

### 修复问题清单

| 问题 | 根因 | 修复方案 | 文件 |
|------|------|----------|------|
| 链接点击后新页面自动刷新 2~3 次 | Tauri 模式 `handlePageMeta` 调用 `browserOpenTab` 创建新标签（非更新当前标签）；新标签触发 `navigateTauriUrl` → `invoke('browser_navigate')` → 冗余刷新 | 引入 `browserNavigateInPlace` 模式切换；`handlePageMeta` 根据模式选择 `browserOpenTab` 或 `browserNavigateActiveTab` | `useBrowserPageMeta.ts`, `browserSlice.ts` |
| SPA 链接跳转后页面刷新 | SPA 通过 `pushState` 移除 tracking query param（如 YouTube 的 `&pp=oAcB`），`meta-changed` 事件携带 URL 与 `url-changed` 不同；`normalizeUrlForDedup` 只处理尾随斜杠不处理 query param → 重复标签创建 + 去重失效 | `isUrlRecentlySeen` 增加 hostname+pathname 级回退匹配；`handlePageMeta` 增加 hostname+pathname 级标签匹配 + 预调用 `markUrlSeen` 阻断后续导航 | `useBrowserWebView.ts`, `useBrowserPageMeta.ts` |
| `isUrlRecentlySeen` 去重窗口太短 | TTL 仅 1000ms，HTTP 元数据抓取慢时去重失效 | TTL 从 1000ms 延长到 3000ms | `useBrowserWebView.ts` |
| `stopImmediatePropagation` 过于激进 | 阻止页面自身的其他 capture 监听器 | 移除 `stopImmediatePropagation`，仅保留 `preventDefault` + `stopPropagation` | `browser_navigation.rs` |
| Switch 组件无 Tooltip | `BrowserNavModeSwitch` 不转发事件处理器 | 组件接口声明 `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur`/`onClick` 并转发到 `motion.button` | `BrowserNavModeSwitch.tsx` |

### 双模式架构更新

| 功能 | **Tauri 桌面模式** | **浏览器预览模式** |
|------|--------------------|--------------------|
| 导航模式 | `handlePageMeta` + mode 感知 → `browserNavigateActiveTab`/`browserOpenTab` | `handleIframeLoad` → `browserNavigateActiveTab`（始终 in-place）+ mode 感知 |

### 状态管理更新

| 状态 | 类型 | localStorage key |
|------|------|------------------|
| `browserNavigateInPlace` | `boolean` | `adl-ui:browser-navigate-in-place` |

### 修改文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/app/stores/slices/browserslice.ts` | 修改 | 新增 `browserNavigateInPlace` 字段 + `setBrowserNavigateInPlace` 动作 + 持久化 |
| `frontend/src/app/features/browser/BrowserNavModeSwitch.tsx` | 新建 | Radix + Motion Switch 组件 |
| `frontend/src/app/features/browser/BrowserToolbar.tsx` | 修改 | 刷新按钮后添加 Switch + 事件转发 |
| `frontend/src/app/features/browser/browserpanel.tsx` | 修改 | 连线 Store + Switch + `markUrlSeen` 注入 |
| `frontend/src/app/features/browser/useBrowserPageMeta.ts` | 修改 | URL 归一化 + hostname+pathname 匹配 + mode 感知 + `markUrlSeen` 预调用 |
| `frontend/src/app/features/browser/useBrowserWebView.ts` | 修改 | `isUrlRecentlySeen` 三层递进去重（精确→归一化→hostname+pathname）；TTL 3000ms |
| `frontend/src/styles/regions/rightpanel/browser-toolbar.css` | 修改 | 新增 Switch 样式 |

> **2026-06-25 补充**：后续新增了 WebView2 原生 DocumentTitleChanged/FaviconChanged COM 事件处理（`crates/browser/src/webview2_message.rs`），以及 Rust 侧多源去重（`should_emit_and_update`）。详细信息见 [browser-meta-sync-mechanism-2026-06-25.md](../../knowledge-base/browser/browser-meta-sync-mechanism-2026-06-25.md)。
| `frontend/src/app/i18n/zh-CN/browser.ts` | 修改 | 新增 `browserNavigateInPlace`, `browserNavigateNewTab` |
| `frontend/src/app/i18n/en-US/browser.ts` | 修改 | 新增 `browserNavigateInPlace`, `browserNavigateNewTab` |
| `frontend/crates/browser/src/browser_navigation.rs` | 修改 | 移除 `stopImmediatePropagation` |

> 详细经验教训已记录在 [knowledge-base/browser/browser-navigation-mode-toggle-2026-06-20.md](../../knowledge-base/browser/browser-navigation-mode-toggle-2026-06-20.md)
