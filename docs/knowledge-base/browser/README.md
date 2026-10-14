# Browser Knowledge

内置浏览器（builtin browser）实现、修复与优化的经验教训，按功能子主题归类维护（不按时间归档）。

## 综合参考（根目录）

| 文件 | 说明 |
|------|------|
| [builtin-browser.md](./builtin-browser.md) | 内置浏览器实现 16 条经验（Tauri 差异、WebView 生命周期、布局等） |
| [browser-link-interception.md](./browser-link-interception.md) | 浏览器链接拦截处理经验 |
| [browser-subdirectory-fix.md](./browser-subdirectory-fix.md) | 子目录导航修复（4 条经验） |
| [browser-tree-fix.md](./browser-tree-fix.md) | 树形目录选择与交互修复（4 条经验） |
| [browser-directory-menu-optimization-2026-06-23.md](./browser-directory-menu-optimization-2026-06-23.md) | 浏览器目录菜单优化 |
| [browser-search-engine-popover-tooltip-ref-subpixel-2026-08-23.md](./browser-search-engine-popover-tooltip-ref-subpixel-2026-08-23.md) | 搜索引擎弹窗 Tooltip ref 覆盖→亚像素模糊 + 右边缘裁剪根因与修复 |

## 子主题

### [navigation/](./navigation/)

URL 导航、地址栏、落地页、SPA 导航与后退、导航模式切换。

| 文件 | 说明 |
|------|------|
| [browser-navigate-fix-2026-06-04.md](./navigation/browser-navigate-fix-2026-06-04.md) | 浏览器模式下 URL 无法加载修复（无活动标签页创建逻辑） |
| [browser-url-sync-fix-2026-06-04.md](./navigation/browser-url-sync-fix-2026-06-04.md) | 浏览器 URL 同步修复经验 |
| [browser-landing-page-2026-06-08.md](./navigation/browser-landing-page-2026-06-08.md) | 空标签引导页实现（端口扫描、UI 标准、组件架构）+ 虚线占位符一致性修复 |
| [browser-copy-button-animation-2026-06-18.md](./navigation/browser-copy-button-animation-2026-06-18.md) | 地址栏复制按钮动画化（lucide-animated CopyIcon 弹簧动画） |
| [browser-navigation-mode-toggle-2026-06-20.md](./navigation/browser-navigation-mode-toggle-2026-06-20.md) | 导航模式切换（in-place/new-tab）+ 链接点击后自动刷新修复 |
| [browser-url-input-landing-page-bookmark-fixes-2026-06-21.md](./navigation/browser-url-input-landing-page-bookmark-fixes-2026-06-21.md) | 地址栏失焦/ESC 恢复 URL、空 URL 着陆页、书签星号点亮等修复 |
| [browser-navigator-4-mode-2026-06-24.md](./navigation/browser-navigator-4-mode-2026-06-24.md) | 4 模式扁平导航栏重构（Flash 消除、搜索外部点击、Flat 模式溢出渐变蒙版） |
| [browser-spa-navigation-title-sync-fix-2026-06-28.md](./navigation/browser-spa-navigation-title-sync-fix-2026-06-28.md) | SPA 导航标题同步双重 Bug 修复（URL 归一化覆盖 + INIT_SCRIPT 强制整页导航） |
| [browser-navigate-tab-explicit-2026-06-29.md](./navigation/browser-navigate-tab-explicit-2026-06-29.md) | navigateTab 反馈循环修复：被动触发→前端显式调用，来源分离原则 |
| [spa-history-back-double-click-2026-06-30.md](./navigation/spa-history-back-double-click-2026-06-30.md) | SPA 后退需双击问题：eval("history.back()") 与多层 pushState 历史栈，非应用 bug |
| [browser-bilibili-double-reload-fix-2026-07-15.md](./navigation/browser-bilibili-double-reload-fix-2026-07-15.md) | Bilibili 页面双重重载问题修复 |

### [tab-management/](./tab-management/)

标签页创建、已打开标签、右键菜单、新建按钮。

| 文件 | 说明 |
|------|------|
| [browser-create-tab-dialog-fix-2026-06-09.md](./tab-management/browser-create-tab-dialog-fix-2026-06-09.md) | 新建标签对话框修复（回调拦截、假计数、工具栏目录解析） |
| [browser-opened-tabs-enhancement-2026-06-23.md](./tab-management/browser-opened-tabs-enhancement-2026-06-23.md) | 已打开标签模式过滤、多 iframe 状态保持、悬停关闭按钮 |
| [browser-tab-context-menu-hover-actions-2026-06-22.md](./tab-management/browser-tab-context-menu-hover-actions-2026-06-22.md) | 标签右键菜单（6 项）+ 悬停按钮 + 编辑对话框 + 缓存清理 + 统一删除 Store Action |
| [browser-newtab-button-and-default-title-2026-06-26.md](./tab-management/browser-newtab-button-and-default-title-2026-06-26.md) | 新建标签按钮与默认标题优化 |

### [bookmark/](./bookmark/)

书签对话框、去重、目录/文件夹删除清理。

| 文件 | 说明 |
|------|------|
| [browser-bookmark-dialog-and-flat-view-2026-06-15.md](./bookmark/browser-bookmark-dialog-and-flat-view-2026-06-15.md) | 收藏标签对话框 + 展平列表视图（树展平算法、Hint CSS specificity） |
| [browser-bookmark-tab-naming-folder-tab-fixes-2026-06-21.md](./bookmark/browser-bookmark-tab-naming-folder-tab-fixes-2026-06-21.md) | 书签默认值 hostname 降级、标签命名修复、文件夹标签原子插入 |
| [browser-bookmark-dialog-store-pattern-audio-fix-2026-06-28.md](./bookmark/browser-bookmark-dialog-store-pattern-audio-fix-2026-06-28.md) | 书签对话框 store-based 模式替代 callback chain、音频调试端到端追踪 |
| [browser-folder-delete-bookmark-cleanup-2026-06-30.md](./bookmark/browser-folder-delete-bookmark-cleanup-2026-06-30.md) | 文件夹删除书签清理修复（17 问题：工作区过滤、scopeFolderId、tabId 分离、时序） |
| [browser-bookmark-click-handler-fix-2026-07-02.md](./bookmark/browser-bookmark-click-handler-fix-2026-07-02.md) | 书签点击处理器修复 |
| [browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md](./bookmark/browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md) | 书签去重 (网址,标题) 元组语义 + 标题隔离（store 与 UI 同步、统一去重规则） |

### [download/](./download/)

下载链路、URL 检测与临时文件清理。

| 文件 | 说明 |
|------|------|
| [browser-download-unified-native-pipeline-2026-08-27.md](./download/browser-download-unified-native-pipeline-2026-08-27.md) | 下载统一原生管道实现 |
| [browser-download-url-detection-unify-2026-08-29.md](./download/browser-download-url-detection-unify-2026-08-29.md) | 三端 isDownloadUrl 扩展名/检测语义统一 + query-key 解析 + fragment 隔离 |
| [browser-download-tmp-orphan-and-size-sync-2026-08-31.md](./download/browser-download-tmp-orphan-and-size-sync-2026-08-31.md) | WebView2 `.tmp` 暂存残留 + 下载大小同步经验教训 |

### [favicon-meta/](./favicon-meta/)

favicon、标题、站点元数据的同步/缓存/时序问题。

| 文件 | 说明 |
|------|------|
| [browser-handle-page-meta-concurrent-dedup-2026-06-21.md](./favicon-meta/browser-handle-page-meta-concurrent-dedup-2026-06-21.md) | handlePageMeta 并发回调去重（两路径竞态导致重复标签/历史 + 刷新循环） |
| [browser-prefetch-title-lock-favicon-pin-2026-06-21.md](./favicon-meta/browser-prefetch-title-lock-favicon-pin-2026-06-21.md) | 预取 + 标题锁定 + Favicon Pin 重构（共享工具提取、显式 pin 机制） |
| [browser-refresh-meta-optimization-2026-06-23.md](./favicon-meta/browser-refresh-meta-optimization-2026-06-23.md) | 浏览器刷新元数据优化 |
| [browser-meta-sync-mechanism-2026-06-25.md](./favicon-meta/browser-meta-sync-mechanism-2026-06-25.md) | 标题/favicon 双层同步机制（WebView2 postMessage + Rust 轮询、延迟创建、质量评分） |
| [browser-tab-meta-deferred-creation-2026-06-25.md](./favicon-meta/browser-tab-meta-deferred-creation-2026-06-25.md) | 标签元数据延迟创建与同步更新（无占位标题、path 历史去重、favicon 仅与标题同时缓存） |
| [browser-tab-title-deferred-update-2026-06-26.md](./favicon-meta/browser-tab-title-deferred-update-2026-06-26.md) | 标签标题延迟更新与通用 prefetch（标题闪烁/SPA 回退标题根因分析） |
| [browser-audio-indicator-favicon-stability-2026-06-27.md](./favicon-meta/browser-audio-indicator-favicon-stability-2026-06-27.md) | 音频指示器 Favicon 位置稳定性（条件性 DOM 结构）+ Rust 端静音状态覆盖 |
| [browser-favicon-title-sync-2026-07-01.md](./favicon-meta/browser-favicon-title-sync-2026-07-01.md) | Favicon/Title 同步 5 个根因修复（缓存未持久化、多源争用、源优先级、订阅、驱逐） |
| [browser-site-meta-cache-2026-08-13.md](./favicon-meta/browser-site-meta-cache-2026-08-13.md) | 网站元数据持久化缓存三层架构（Rust SQLite / preview JSON / 前端镜像） |
| [browser-favicon-proxy-removal-and-merge-guard-2026-08-18.md](./favicon-meta/browser-favicon-proxy-removal-and-merge-guard-2026-08-18.md) | DDG/Google 代理图标移除 + 镜像合并守卫（外部兜底"合法但错误"图标） |
| [browser-favicon-timing-race-2026-08-22.md](./favicon-meta/browser-favicon-timing-race-2026-08-22.md) | 静默抓取 title-only 时序竞争根因与双层防御修复（waitForFavicon 事件监听） |
| [browser-tab-loading-redirect-favicon-2026-08-24.md](./favicon-meta/browser-tab-loading-redirect-favicon-2026-08-24.md) | 标签加载重定向与 favicon 修复 |

### [history/](./history/)

历史记录写入、导航与标签删除。

| 文件 | 说明 |
|------|------|
| [browser-history-recording-fix-2026-06-26.md](./history/browser-history-recording-fix-2026-06-26.md) | 历史记录修复（6 Bug：title===hostname 误跳过、SPA 无历史、iframe 丢失、prefetch 竞态） |
| [browser-history-tag-delete-fix-2026-06-26.md](./history/browser-history-tag-delete-fix-2026-06-26.md) | 历史标签删除修复（4 问题：右键删除、刷新 Logo/标题、目录菜单、三种删除路径覆盖） |
| [browser-history-navigation-2026-08-14.md](./history/browser-history-navigation-2026-08-14.md) | 历史 URL 归一化 + 前端智能回退 + 标题来源门控 + can_go_back 原生 IPC |
| [url-changed-tabid-prefix-mismatch-2026-10-15.md](./history/url-changed-tabid-prefix-mismatch-2026-10-15.md) | url-changed 过滤器 tabId 口径误判吞掉全部池事件 |

### [webview-embed/](./webview-embed/)

WebView 池、iframe 嵌入、覆盖层级与 WebView2 特性。

| 文件 | 说明 |
|------|------|
| [browser-embed-check-fix-2026-06-17.md](./webview-embed/browser-embed-check-fix-2026-06-17.md) | iframe 嵌入崩溃 + 双模式隔离 + 路由竞态 + PTY 错误 + 指数退避 |
| [safe-iframe-shadow-dom-fix-2026-06-17.md](./webview-embed/safe-iframe-shadow-dom-fix-2026-06-17.md) | Shadow DOM 修复跨域 iframe SecurityError（attachShadow mode:closed 终极方案） |
| [panel-resize-handle-webview-2026-06-18.md](./webview-embed/panel-resize-handle-webview-2026-06-18.md) | 面板拖拽线被 WebView 覆盖：区域逃逸方案（handle 左扩至中心区） |
| [tauri-webview-overlay-hide-2026-06-18.md](./webview-embed/tauri-webview-overlay-hide-2026-06-18.md) | Tauri 原生子 WebView 层级覆盖问题（含 updateWebViewBounds 覆盖层守卫） |
| [browser-text-overflow-webview2-clip-2026-06-22.md](./webview-embed/browser-text-overflow-webview2-clip-2026-06-22.md) | 快捷卡片省略号 WebView2 点击闪烁（Chromium clip-on-interaction，`-webkit-line-clamp` 替代） |
| [browser-webview-pool-lru-2026-06-26.md](./webview-embed/browser-webview-pool-lru-2026-06-26.md) | WebView 池 LRU 缓存策略实现 |
| [browser-theme-sync-final-2026-06-29.md](./webview-embed/browser-theme-sync-final-2026-06-29.md) | 浏览器主题同步最终修复 |
| [divider-strip-dual-host-2026-10-02.md](./webview-embed/divider-strip-dual-host-2026-10-02.md) | 桥接条双宿主化：显隐判据（几何代理 + 池成员复合）、排序指纹去 URL、Rust 全局互斥清除、tooltip 贴边容差 |
| [webview2-profile-colorscheme-udf-isolation-2026-10-06.md](./webview-embed/webview2-profile-colorscheme-udf-isolation-2026-10-06.md) | PreferredColorScheme 同 UDF 实际全局（#4920）→ 按 UDF 会话隔离 + 后端主题初始化状态位 + 命令入口归一化 |
