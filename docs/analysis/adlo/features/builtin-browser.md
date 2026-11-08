# 内置浏览器

> **体裁**：实现快照（crate 结构与模块职责，可能滞后）。设计决策见 [architecture/features/builtin-browser.md](../../../architecture/features/builtin-browser.md)，经验教训见 `docs/knowledge-base/browser/`。

## browser crate（WebView2）

> 路径: `crates/browser/`

### 模块概览

| 文件 | 核心类型 | 职责 |
|------|----------|------|
| `browser_pool.rs` | `BrowserPool` | WebView2 实例池管理 — 按 tab_id 索引的 WebView2 实例集合 |
| `browser_webview.rs` | `BrowserManager`, `Bounds` | WebView2 创建/销毁、尺寸/位置管理、WebView2 Environment 创建 |
| `browser_navigation.rs` | — | 导航 (Navigate)、前进/后退 (GoForward/GoBack)、刷新 (Refresh) 实现 |
| `webview2_audio.rs` | — | 音频播放检测 (`is_audible`)、静音控制 (`mute_tab`)、`setup_audio_changed_handler()` |
| `webview2_favicon.rs` | — | Favicon 提取和缓存、Favicon URL 更新事件 |
| `webview2_title.rs` | — | 页面标题同步、Document.title 变化事件处理 |
| `webview2_history.rs` | — | 浏览历史记录管理（后退/前进堆栈） |
| `webview2_message.rs` | — | 页面消息桥接 — WebView2 与 Tauri 后端双向通信 |
| `webview2_postmessage.rs` | — | `window.postMessage` 桥接 — 页面 JS 与 Tauri 消息传递 |
| `webview2_cleanup.rs` | `clear_cache()`, `clear_cookies()` | 缓存和 Cookie 清除 |
| `webview2_profile.rs` | `set_color_scheme()` | WebView2 颜色方案设置和 Profile 管理 |
| `browser_meta.rs` | `PageMeta` | 页面元数据（URL, title, favicon, is_audible） |
| `browser_events.rs` | — | 浏览器事件系统（NavigationStarting, NavigationCompleted 等） |

### BrowserManager 主要方法

| 方法 | 说明 |
|------|------|
| `create_for_tab(app, tab_id, url)` | 为标签页创建 WebView2 实例 |
| `destroy_tab(app, tab_id)` | 销毁标签页 WebView2 |
| `activate_tab(app, tab_id)` | 激活标签页（显示对应 WebView2） |
| `navigate_tab(app, tab_id, url)` | 导航到新 URL |
| `set_tab_bounds(app, tab_id, bounds)` | 设置标签页尺寸和位置 |
| `go_back_tab(app, tab_id)` | 后退 |
| `go_forward_tab(app, tab_id)` | 前进 |
| `refresh_tab(app, tab_id)` | 刷新 |

## Tauri 命令

> 路径: `src-tauri/src/commands/browser.rs`

| 命令 | 参数 | 说明 |
|------|------|------|
| `browser_create_for_tab` | `tab_id, url` | 为标签页创建 WebView2 |
| `browser_activate_tab` | `tab_id` | 激活标签页 |
| `browser_destroy_tab` | `tab_id` | 销毁标签页 |
| `browser_navigate_tab` | `tab_id, url` | 导航 |
| `browser_set_tab_bounds` | `tab_id, bounds` | 设置尺寸 |
| `browser_go_back_tab` | `tab_id` | 后退 |
| `browser_go_forward_tab` | `tab_id` | 前进 |
| `browser_refresh_tab` | `tab_id` | 刷新 |
| `browser_mute_tab` | `tab_id, muted` | 静音控制 |
| `browser_get_meta` | `tab_id` | 获取页面元数据 |
| `browser_clear_cache` | `tab_id` | 清除缓存 |
| `browser_clear_cookies` | `tab_id` | 清除 Cookie |
| `browser_set_color_scheme` | `scheme` | 设置颜色方案 |

## 前端 Store 切片（8 个）

> 路径前缀: `frontend/src/app/stores/slices/`

### 1. BrowserTabsSlice

| 文件 | `slices/browserTabsSlice.ts` |
|------|------|
| 关键字段 | `browserTabs: BrowserTabState[]`, `activeTabId: string \| null` |
| 用途 | 打开/关闭/激活标签页管理、标签页 URL 和状态跟踪 |

`BrowserTabState`: `id, url, title, favicon, isLoading, isAudible, isMuted, createdAt`

### 2. BrowserBookmarkSlice

| 文件 | `slices/browserBookmarkSlice.ts` |
|------|------|
| 关键字段 | `bookmarks: BrowserBookmark[]`, `workspaceBookmarks: Record<string, WorkspaceBookmarkEntry>` |
| 用途 | 书签 CRUD、工作区书签管理 |

### 3. BrowserHistorySlice

| 文件 | `slices/browserHistorySlice.ts` |
|------|------|
| 关键字段 | `browserHistory: BrowserHistoryState[]`, `historyIndex: number` |
| 用途 | 浏览历史记录管理、历史导航 |

### 4. BrowserFoldersSlice

| 文件 | `slices/browserFoldersSlice.ts` |
|------|------|
| 关键字段 | `browserBookmarkFolders: BookmarkFolder[]`, `entries: BookmarkEntry[]` |
| 用途 | 书签文件夹（分类）管理、文件夹 CRUD、拖拽排序 |

辅助文件: `slices/browserFoldersDeletion.ts`, `slices/browserFoldersTypes.ts`, `slices/browserFoldersUtils.ts`

### 5. BrowserLandingSlice

| 文件 | `slices/browserLandingSlice.ts` |
|------|------|
| 关键字段 | `shortcuts: ShortcutSite[]`, `localPorts: LocalPort[]`, `backgroundConfig: BackgroundConfig` |
| 用途 | 浏览器新标签页落地页：快捷站点、本地端口发现、背景图片设置 |

### 6. BrowserSlice（核心层）

| 文件 | `slices/browserSlice.ts` |
|------|------|
| 关键字段 | `navigatorWidth`, `navigatorCollapsed`, `navigateInPlace` |
| 用途 | 浏览器导航栏状态（宽度、折叠）、导航模式 |

### 7. BrowserSearchEnginesSlice

| 文件 | `slices/browserSearchEnginesSlice.ts` |
|------|------|
| 关键字段 | `searchEngines: SearchEngine[]`（含内置引擎表） |
| 用途 | 搜索引擎管理 |

### 8. BrowserDownloadsSlice

| 文件 | `slices/browserDownloadsSlice.ts` |
|------|------|
| 关键字段 | `DownloadRecord`、`DownloadSettings`、`DownloadProgress` |
| 用途 | 下载记录与下载设置 |

### 共享定义

| 文件 | 内容 |
|------|------|
| `slices/browserSliceShared.ts` | 浏览器 localStorage key 常量、共享类型定义 |

## 前端 Action 模块

> 路径前缀: `frontend/src/app/stores/actions/`

| 模块 | 文件 | 用途 |
|------|------|------|
| `browserCleanupActions` | `actions/browserCleanupActions.ts` | 浏览器清理逻辑 |
| `browserCleanupHelpers` | `actions/browserCleanupHelpers.ts` | 浏览器清理辅助函数 |

## 前端 UI 组件

> 路径前缀: `frontend/src/app/features/browser/`

### 核心面板

| 组件 | 文件 | 用途 |
|------|------|------|
| `BrowserPanel` | `features/browser/BrowserPanel.tsx` | 浏览器中心容器 |
| `BrowserPanelStateContext` | `features/browser/BrowserPanelStateContext.ts` | 面板状态上下文（替代 ~66 个 props 传递） |
| `BrowserPanelActionsContext` | `features/browser/BrowserPanelActionsContext.ts` | 面板操作上下文 |
| `BrowserPanelDialogs` | `features/browser/BrowserPanelDialogs.tsx` | 面板对话框管理 |

### 导航与标签页

| 组件 | 文件 | 用途 |
|------|------|------|
| `BrowserNavigator` | `features/browser/BrowserNavigator.tsx` | 导航栏（地址栏、按钮） |
| `BrowserTabBar` | `features/browser/BrowserTabBar.tsx` | 标签页栏 |
| `BrowserToolbar` | `features/browser/BrowserToolbar.tsx` | 工具栏 |
| `BrowserNavTabsMode` | `features/browser/BrowserNavTabsMode.tsx` | 标签页导航模式 |
| `BrowserNavListMode` | `features/browser/BrowserNavListMode.tsx` | 列表导航模式 |
| `BrowserNavOpenMode` | `features/browser/BrowserNavOpenMode.tsx` | 打开导航模式 |
| `BrowserNavSearchMode` | `features/browser/BrowserNavSearchMode.tsx` | 搜索导航模式 |
| `BrowserNavModeSwitch` | `features/browser/BrowserNavModeSwitch.tsx` | 导航模式切换 |

### WebView

| 组件 | 文件 | 用途 |
|------|------|------|
| `BrowserIframeStack` | `features/browser/BrowserIframeStack.tsx` | iframe 栈管理器 |
| `SafeIframe` | `features/browser/SafeIframe.tsx` | 安全的 iframe 封装 |
| `BrowserIframeErrorOverlay` | `features/browser/BrowserIframeErrorOverlay.tsx` | iframe 错误覆盖层 |
| `ExternalLinkError` | `features/browser/ExternalLinkError.tsx` | 外部链接错误提示 |

### 书签与文件夹

| 组件 | 文件 | 用途 |
|------|------|------|
| `BrowserOpenTabFlatList` | `features/browser/BrowserOpenTabFlatList.tsx` | 打开标签页平面列表 |
| `BrowserOpenTabFlatListItem` | `features/browser/BrowserOpenTabFlatListItem.tsx` | 标签页列表项 |
| `BookmarkToFolderDialog` | `features/browser/BookmarkToFolderDialog.tsx` | 书签到文件夹对话框 |
| `BrowserMenuDropdown` | `features/browser/BrowserMenuDropdown.tsx` | 菜单下拉 |
| `BrowserMenuHintItem` | `features/browser/BrowserMenuHintItem.tsx` | 菜单提示项 |
| `BrowserContextMenu` | `features/browser/BrowserContextMenu.tsx` | 右键上下文菜单 |

### 落地页

| 组件 | 路径 | 用途 |
|------|------|------|
| `BrowserLandingPage` | `features/browser/browser-landing/BrowserLandingPage.tsx` | 新标签页落地页 |
| `ShortcutGrid` | `features/browser/browser-landing/ShortcutGrid.tsx` | 快捷站点网格 |
| `ShortcutCard` | `features/browser/browser-landing/ShortcutCard.tsx` | 快捷站点卡片 |
| `LocalPortSection` | `features/browser/browser-landing/LocalPortSection.tsx` | 本地端口发现区域 |
| `BackgroundLayer` | `features/browser/browser-landing/BackgroundLayer.tsx` | 背景图片层 |
| `BackgroundSettingsDialog` | `features/browser/browser-landing/BackgroundSettingsDialog.tsx` | 背景设置对话框 |
| `AddManualPortDialog` | `features/browser/browser-landing/AddManualPortDialog.tsx` | 添加手动端口对话框 |
| `AddShortcutDialog` | `features/browser/browser-landing/AddShortcutDialog.tsx` | 添加快捷站点对话框 |
| `CreateTabDialog` | `features/browser/browser-landing/CreateTabDialog.tsx` | 创建标签页对话框 |

### 树形视图

| 组件 | 路径 | 用途 |
|------|------|------|
| `BrowserTabTree` | `features/browser-tree/BrowserTabTree.tsx` | 浏览器标签树 |
| `BrowserTreeEntry` | `features/browser-tree/BrowserTreeEntry.tsx` | 树条目 |
| `BrowserTreeEntryChildren` | `features/browser-tree/BrowserTreeEntryChildren.tsx` | 树条目子节点 |
| `BrowserTreeEntryFlatList` | `features/browser-tree/BrowserTreeEntryFlatList.tsx` | 树条目平面列表 |
| `BrowserTreeEntryMenu` | `features/browser-tree/BrowserTreeEntryMenu.tsx` | 树条目菜单 |
| `BrowserCategorySection` | `features/browser-tree/BrowserCategorySection.tsx` | 分类区域 |
| `BrowserEntrySubEntries` | `features/browser-tree/BrowserEntrySubEntries.tsx` | 条目子项列表 |

### Hooks

| Hook | 文件 | 用途 |
|------|------|------|
| `useBrowserTabs` | `features/browser/useBrowserTabs.ts` | 标签页操作封装 |
| `useBrowserNavigation` | `features/browser/useBrowserNavigation.ts` | 导航操作 |
| `useBrowserPool` | `features/browser/useBrowserPool.ts` | WebView 池管理 |
| `useBrowserWebView` | `features/browser/useBrowserWebView.ts` | WebView 生命周期 |
| `useBrowserSearch` | `features/browser/useBrowserSearch.ts` | 浏览器内搜索 |
| `useBrowserUrlState` | `features/browser/useBrowserUrlState.ts` | URL 状态管理 |
| `useBrowserUrlChange` | `features/browser/useBrowserUrlChange.ts` | URL 变更处理 |
| `useBrowserPageMeta` | `features/browser/useBrowserPageMeta.ts` | 页面元数据同步 |
| `useBrowserMetaSubscription` | `features/browser/useBrowserMetaSubscription.ts` | 元数据订阅 |
| `useBrowserBookmarkActions` | `features/browser/useBrowserBookmarkActions.ts` | 书签操作 |
| `useBrowserFolderActions` | `features/browser/useBrowserFolderActions.ts` | 文件夹操作 |
| `useBrowserFolderCrud` | `features/browser/useBrowserFolderCrud.ts` | 文件夹 CRUD |
| `useBrowserFolderReorder` | `features/browser/useBrowserFolderReorder.ts` | 文件夹排序 |
| `useBrowserContextMenu` | `features/browser/useBrowserContextMenu.ts` | 右键菜单 |
| `useBrowserDialogs` | `features/browser/useBrowserDialogs.ts` | 对话框管理 |
| `useBrowserDragDrop` | `features/browser/useBrowserDragDrop.ts` | 拖拽排序 |
| `useBrowserMenus` | `features/browser/useBrowserMenus.ts` | 菜单管理 |
| `useBrowserMenuActions` | `features/browser/useBrowserMenuActions.ts` | 菜单操作 |
| `useBrowserToast` | `features/browser/useBrowserToast.ts` | 浏览器 Toast |
| `useBrowserTagActions` | `features/browser/useBrowserTagActions.ts` | 标签操作 |
| `useBrowserTreeActions` | `features/browser/useBrowserTreeActions.ts` | 树操作 |
| `useBrowserThemeSync` | `features/browser/useBrowserThemeSync.ts` | 主题同步 |
| `useBrowserZoomState` | `features/browser/useBrowserZoomState.ts` | 缩放控制 |
| `useBrowserIframeState` | `features/browser/useBrowserIframeState.ts` | iframe 状态管理 |
| `useBrowserHistoryTab` | `features/browser/useBrowserHistoryTab.test.ts` | 历史标签页 |
| `useBrowserNavigatorState` | `features/browser/useBrowserNavigatorState.ts` | 导航器状态 |
| `useBrowserPanel` | `features/browser/useBrowserPanel.test.ts` | 面板测试 |
| `useBrowserPool` | `features/browser/useBrowserPool.test.ts` | 池测试 |
| `useWebViewBounds` | `features/browser/useWebViewBounds.ts` | WebView 边界 |
| `useWebViewLifecycle` | `features/browser/useWebViewLifecycle.ts` | WebView 生命周期 |
| `useWebViewVisibility` | `features/browser/useWebViewVisibility.ts` | WebView 可见性 |

### 工具函数

| 文件 | 用途 |
|------|------|
| `features/browser/browserPanelHelpers.ts` | 面板辅助函数 |
| `features/browser/browserTreeUtils.ts` | 树工具函数 |
| `features/browser/browserUrlUtils.ts` | URL 工具函数 |
| `features/browser/checkEmbed.ts` | 页面嵌入检测 |

## 文件参考

| 内容 | 路径 |
|------|------|
| Browser crate 核心 | `crates/browser/src/lib.rs` |
| WebView2 池管理 | `crates/browser/src/browser_pool.rs` |
| WebView2 管理器 | `crates/browser/src/browser_webview.rs` |
| 导航处理 | `crates/browser/src/browser_navigation.rs` |
| 音频指示器 | `crates/browser/src/webview2_audio.rs` |
| Favicon | `crates/browser/src/webview2_favicon.rs` |
| 标题同步 | `crates/browser/src/webview2_title.rs` |
| 历史记录 | `crates/browser/src/webview2_history.rs` |
| 页面消息桥接 | `crates/browser/src/webview2_message.rs` |
| PostMessage 桥接 | `crates/browser/src/webview2_postmessage.rs` |
| 缓存清除 | `crates/browser/src/webview2_cleanup.rs` |
| Profile 管理 | `crates/browser/src/webview2_profile.rs` |
| 页面元数据 | `crates/browser/src/browser_meta.rs` |
| 浏览器事件 | `crates/browser/src/browser_events.rs` |
| Tauri 浏览器命令 | `src-tauri/src/commands/browser.rs` |
| Store BrowserTabs 切片 | `frontend/src/app/stores/slices/browserTabsSlice.ts` |
| Store BrowserBookmark 切片 | `frontend/src/app/stores/slices/browserBookmarkSlice.ts` |
| Store BrowserHistory 切片 | `frontend/src/app/stores/slices/browserHistorySlice.ts` |
| Store BrowserFolders 切片 | `frontend/src/app/stores/slices/browserFoldersSlice.ts` |
| Store BrowserLanding 切片 | `frontend/src/app/stores/slices/browserLandingSlice.ts` |
| Store Browser 切片（核心） | `frontend/src/app/stores/slices/browserSlice.ts` |
| Store 共享定义 | `frontend/src/app/stores/slices/browserSliceShared.ts` |
| 浏览器 UI 组件 | `frontend/src/app/features/browser/` |
| 浏览器树 UI | `frontend/src/app/features/browser-tree/` |
