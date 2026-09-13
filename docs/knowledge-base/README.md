# Knowledge Base

本目录集中管理全项目的**总结性知识**与**经验教训**，按领域分类维护。

## 目录结构

| 目录 | 内容 | 文件数 |
|------|------|--------|
| [refactoring](./refactoring/) | 重构方法论、组件提取、执行报告、阶段性总结 | 28 |
| [multi-workspace](./multi-workspace/) | 多工作区开发中的变更面板、文件树、终端、布局等经验 | 11 |
| [browser](./browser/) | 内置浏览器实现、空标签引导页、树形目录交互、iframe 嵌入检查、Tauri WebView 覆盖、Resize Handle 区域逃逸、复制按钮动画化、Child WebView IPC 限制、SPA 标题轮询、导航模式切换、并发回调去重、标题锁定与 Favicon Pin、标签右键菜单与悬停按钮、WebView2 `text-overflow` 剪辑特性、已打开标签模式过滤与多 iframe 状态保持、4模式导航栏重构、双层同步机制、延迟创建、WebView2 原生 COM 事件、历史记录修复、历史标签删除修复、音频指示器、书签对话框 Store 模式、navigateTab 显式调用重构、favicon 时序竞争修复等经验 | 42 |
| [code-quality](./code-quality/) | 全量代码质量检测与修复经验 | 21 |
| [browser-automation](./browser-automation/) | 浏览器自动化调试记录与规则经验 | 2 |
| [interaction](./interaction/) | 跨功能面板的交互/UX 问题修复经验 | 22 |
| [ci-monitoring](./ci-monitoring/) | GitHub Actions CI 状态监控模块经验（按目录独立绑定、Token 持久化、日志隔离、数据缓存、Rate Limit 保护） | 6 |
| [logging](./logging/) | 日志系统统一改造经验（OpenOptions 权限、ANSI 控制、FormatTime、MakeWriter 兼容、双端一致性） | 1 |
| [tauri-backend](./tauri-backend/) | Tauri 命令性能、Rust 异步模式、主线程阻塞、serde JSON null vs 缺省 等后端经验 | 3 |
| [toolchain](./toolchain/) | 开发工具链与环境配置经验（Git、Node、Rust 等） | 3 |

说明：
- 文件数超过 15 的目录按年月分子目录归档（如 `2026-06/`、`2026-07/`）
- 无明确日期的综合参考文件保留在根目录
- 文件名格式：`topic-description-YYYY-MM-DD.md`

## 索引

### Refactoring

#### 综合参考（根目录）

| 文件 | 来源 | 说明 |
|------|------|------|
| [component-extraction.md](./refactoring/component-extraction.md) | 重构洞察 | 组件安全提取方法论（类型导入、Vite 缓存、export type 等） |
| [execution-lessons.md](./refactoring/execution-lessons.md) | 重构洞察 | 第 10 轮重构执行经验（CSS 截断、类型收窄、OnceLock 等） |
| [progress-summary.md](./refactoring/progress-summary.md) | 重构洞察 | 第 1-17 轮重构进展汇总 |
| [refactoring-process-lessons.md](./refactoring/refactoring-process-lessons.md) | REFACTORING_PROGRESS_REPORT | 跨 4 轮重构的 16 条经验（CSS、React、Rust 等） |
| [terminal-pty-evaluation.md](./refactoring/terminal-pty-evaluation.md) | 重构洞察 | Terminal 与 PTY crate 职责边界评估报告 |
| [ui-restoration.md](./refactoring/ui-restoration.md) | 重构洞察 | UI 恢复经验（CSS 层叠、动画恢复、结构分层） |

#### 2026-05

| 文件 | 来源 | 说明 |
|------|------|------|
| [styling-restoration-2026-05-27.md](./refactoring/2026-05/styling-restoration-2026-05-27.md) | 重构洞察 | 文件树大纲样式恢复经验 |
| [summary-2026-05-30.md](./refactoring/2026-05/summary-2026-05-30.md) | 重构洞察 | 2026-05-30 重构总结 |
| [summary-2026-05-31.md](./refactoring/2026-05/summary-2026-05-31.md) | 重构洞察 | 2026-05-31 重构总结 |
| [terminal-fix-2026-05-22.md](./refactoring/2026-05/terminal-fix-2026-05-22.md) | 重构洞察 | 终端功能修复总结 |

#### 2026-06

| 文件 | 来源 | 说明 |
|------|------|------|
| [browser-module-decomposition-2026-06-29.md](./refactoring/2026-06/browser-module-decomposition-2026-06-29.md) | 2026-06-29 重构洞察执行 | 浏览器模块分解与架构清理 |
| [crate-split-and-dep-inversion-2026-06-08.md](./refactoring/2026-06/crate-split-and-dep-inversion-2026-06-08.md) | 2026-06-08 重构 | Crate 拆分与依赖倒置经验 |
| [high-risk-refactoring-2026-06-12.md](./refactoring/2026-06/high-risk-refactoring-2026-06-12.md) | 2026-06-12 重构洞察高风险执行 | 高风险重构经验总结（组件提取安全、切片拆分策略、Hook 拆散、跨包依赖管理） |
| [performance-optimization-lessons-2026-06-11.md](./refactoring/2026-06/performance-optimization-lessons-2026-06-11.md) | 2026-06-11 重构洞察执行 | 性能优化经验总结（虚拟化、memo、选择器、代码分割、内存泄漏） |
| [refactor-round-68-2026-06-19.md](./refactoring/2026-06/refactor-round-68-2026-06-19.md) | 2026-06-19 重构洞察执行 | CSS barrel 模式、Store 三层拆分、agent_pipeline 模块化、console.log 清理 |
| [refactoring-execution-2026-06-27.md](./refactoring/2026-06/refactoring-execution-2026-06-27.md) | 2026-06-27 重构洞察执行 | SDD 子代理驱动重构、model-gateway 模块化、BrowserEntrySubEntries 工具提取、browserUrlUtils 提取、[browser-debug] 清理 |
| [refactoring-insight-execution-2026-06-13.md](./refactoring/2026-06/refactoring-insight-execution-2026-06-13.md) | 2026-06-13 重构洞察第8次执行 | CSS 变量主题化、shared.ts 模块拆分、Hook 拆散模式、Slot 骨架模式、Windows 测试兼容 |
| [refactoring-insight-execution-2026-06-14.md](./refactoring/2026-06/refactoring-insight-execution-2026-06-14.md) | 2026-06-14 重构洞察第9次执行 | 路径别名、事件委托修复memo、useRef回调稳定化、孤儿import陷阱 |
| [refactoring-insight-execution-2026-06-15.md](./refactoring/2026-06/refactoring-insight-execution-2026-06-15.md) | 2026-06-15 重构洞察第10次执行 | 超大组件拆分模式、O(n²)→O(n)栈式算法、CSS变量收敛、内联样式迁移、Store订阅合并 |
| [refactoring-insight-execution-2026-06-16.md](./refactoring/2026-06/refactoring-insight-execution-2026-06-16.md) | 2026-06-16 重构洞察第11次执行 | BrowserNavigator 提取、TitleBar 菜单提取、selectors 按域拆分、CSS 文件拆分 |
| [refactoring-lessons-2026-06-04.md](./refactoring/2026-06/refactoring-lessons-2026-06-04.md) | 重构洞察 2026-06-03 执行 | React 19 iframe 事件系统陷阱、Rust 依赖删除、TS 大小写、CSS transition:all |
| [refactoring-summary-2026-06-01.md](./refactoring/2026-06/refactoring-summary-2026-06-01.md) | 重构洞察 | 第 1-30 轮重构任务汇总与经验 |
| [residual-architecture-cleanup-2026-06-09.md](./refactoring/2026-06/residual-architecture-cleanup-2026-06-09.md) | 2026-06-09 重构洞察执行 | Phase 41-42 残余架构清理 8 领域经验（bridge 下沉、React.memo、Rust 结构体、clone 消除、命令层测试、@types 分类） |
| [theme-unified-management-2026-06-30.md](./refactoring/2026-06/theme-unified-management-2026-06-30.md) | 2026-06-30 方案 C 重构执行 | Theme 统一管理：ThemeController 为唯一真实来源、useResolvedTheme hook、resolveCurrentTheme 共享函数、消除 4 处内联 matchMedia |
| [ui-slice-navigator-refactor-2026-06-08.md](./refactoring/2026-06/ui-slice-navigator-refactor-2026-06-08.md) | 2026-06-08 重构 | Navigator 方法移动到 uiSlice 经验（单一职责原则、向后兼容、警告清理） |
| [ui-store-migration-2026-06-07.md](./refactoring/2026-06/ui-store-migration-2026-06-07.md) | 2026-06-07 重构 | UI Store 迁移与代码重构经验（状态迁移、组件更新、性能优化） |

#### 2026-07

| 文件 | 来源 | 说明 |
|------|------|------|
| [provider-model-streaming-redesign-2026-07-07.md](./refactoring/2026-07/provider-model-streaming-redesign-2026-07-07.md) | 2026-07-07 Phase ABC 重构执行 | Provider 动态注册系统、Model 选择路由、SSE 真实流式传输 |
| [refactoring-insight-execution-2026-07-01.md](./refactoring/2026-07/refactoring-insight-execution-2026-07-01.md) | 2026-07-01 重构洞察执行 | 重构洞察第 12 次执行经验 |

### Multi-workspace

| 文件 | 来源 | 说明 |
|------|------|------|
| [changes-panel-alignment-fix.md](./multi-workspace/changes-panel-alignment-fix.md) | 2026-06-07 UI 优化 | 变更面板文件行对齐优化（组件拆分、CSS 间距调整） |
| [changes-panel-stats-button-alignment-fix-2026-06-07.md](./multi-workspace/changes-panel-stats-button-alignment-fix-2026-06-07.md) | 2026-06-07 UI 优化 | 变更面板统计按钮居中对齐 + TypeScript 导入大小写修复 |
| [changes-terminal-panel.md](./multi-workspace/changes-terminal-panel.md) | Superpowers Specs | 变更面板与终端面板重构（10 条经验：useMemo 对齐、ResizeObserver、hover 缓冲等） |
| [component-split.md](./multi-workspace/component-split.md) | Superpowers Specs | Phase 3 组件拆分（Rust 异步模式、组件拆分策略） |
| [file-selection-fix.md](./multi-workspace/file-selection-fix.md) | Superpowers Specs | 文件选择修复经验 |
| [file-tree.md](./multi-workspace/file-tree.md) | Superpowers Specs | 多工作区文件树（11 条经验：Tooltip 覆盖、数据流、CSS 选择器、状态同步等） |
| [interactive-terminal.md](./multi-workspace/interactive-terminal.md) | Superpowers Specs | 交互式终端讨论总结 |
| [stats-fix.md](./multi-workspace/stats-fix.md) | Superpowers Specs | 多工作区统计修复经验 |
| [terminal-binding.md](./multi-workspace/terminal-binding.md) | Superpowers Specs | 终端工作区绑定改进经验 |
| [terminal-profile.md](./multi-workspace/terminal-profile.md) | Superpowers Specs | 终端默认配置修复（PTY 通信、SSE 同步、配置持久化） |
| [tree-layout-alignment.md](./multi-workspace/tree-layout-alignment.md) | Superpowers Specs | 文件树布局对齐经验 |

### Browser

#### 综合参考（根目录）

| 文件 | 来源 | 说明 |
|------|------|------|
| [builtin-browser.md](./browser/builtin-browser.md) | architecture/builtin-browser-implementation | 内置浏览器实现 16 条经验（Tauri 差异、WebView 生命周期、布局等） |
| [browser-link-interception.md](./browser/browser-link-interception.md) | 浏览器实现 | 浏览器链接拦截处理经验 |
| [browser-subdirectory-fix.md](./browser/browser-subdirectory-fix.md) | development/browser-subdirectory-fix | 子目录导航修复（4 条经验） |
| [browser-tree-fix.md](./browser/browser-tree-fix.md) | development/browser-tree-fix | 树形目录选择与交互修复（4 条经验） |

#### 2026-06

| 文件 | 来源 | 说明 |
|------|------|------|
| [browser-audio-indicator-favicon-stability-2026-06-27.md](./browser/2026-06/browser-audio-indicator-favicon-stability-2026-06-27.md) | 2026-06-27 音频指示器实现 | 音频指示器 Favicon 位置稳定性（条件性 DOM 结构问题）+ Rust 端静音状态覆盖修复 |
| [browser-bookmark-dialog-store-pattern-audio-fix-2026-06-28.md](./browser/2026-06/browser-bookmark-dialog-store-pattern-audio-fix-2026-06-28.md) | 2026-06-28 书签对话框 + 音频调试 | 书签对话框 store-based 模式替代 callback chain、音频调试端到端追踪经验 |
| [browser-bookmark-tab-naming-folder-tab-fixes-2026-06-21.md](./browser/2026-06/browser-bookmark-tab-naming-folder-tab-fixes-2026-06-21.md) | 2026-06-21 修复执行 | 书签默认值 hostname 降级、标签命名修复、文件夹标签原子插入（browserOpenTab 第4参数）、IconGlobe→IconLink、HMR store 更新须知 |
| [browser-copy-button-animation-2026-06-18.md](./browser/2026-06/browser-copy-button-animation-2026-06-18.md) | 2026-06-18 交互优化 | 浏览器地址栏复制按钮动画化：引入 lucide-animated CopyIcon，点击播放弹簧动画后自动恢复 |
| [browser-create-tab-dialog-fix-2026-06-09.md](./browser/2026-06/browser-create-tab-dialog-fix-2026-06-09.md) | 2026-06-09 修复执行 | 浏览器新建标签对话框修复（回调拦截、假计数、工具栏目录解析） |
| [browser-directory-menu-optimization-2026-06-23.md](./browser/2026-06/browser-directory-menu-optimization-2026-06-23.md) | 2026-06-23 交互优化 | 浏览器目录菜单优化 |
| [browser-embed-check-fix-2026-06-17.md](./browser/2026-06/browser-embed-check-fix-2026-06-17.md) | 2026-06-17 全量修复执行 | iframe 嵌入崩溃 + 双模式隔离 + 路由竞态 + PTY ERR_ABORTED/ERR_CONNECTION_REFUSED + 友好提示页布局（Tauri 模式独立、版本计数器、递归 setTimeout、指数退避、app-directory 缓存、Edge-to-edge CSS） |
| [browser-folder-delete-bookmark-cleanup-2026-06-30.md](./browser/2026-06/browser-folder-delete-bookmark-cleanup-2026-06-30.md) | 2026-06-30 Phase 3 多轮修复 | 浏览器文件夹删除书签清理修复（17 问题）：工作区书签过滤、scopeFolderId、tabId 分离、第二遍时序、全量扫描等 |
| [browser-handlePageMeta-concurrent-dedup-2026-06-21.md](./browser/2026-06/browser-handlePageMeta-concurrent-dedup-2026-06-21.md) | 2026-06-21 修复执行 | handlePageMeta 并发回调去重：两个路径（onUrlChanged + meta-changed）竞态导致重复标签/历史 + 页面刷新循环，修复 markUrlSeen 调用时机 + processedMetaRef 去重机制 |
| [browser-history-recording-fix-2026-06-26.md](./browser/2026-06/browser-history-recording-fix-2026-06-26.md) | 2026-06-25~26 Bug 修复 | 浏览器历史记录修复（6 Bug）：三处 title===hostname 误跳过、同站 SPA 无历史、iframe 加载丢失历史、首次导航 prefetch 成功时无历史写入的 Race Condition、时序依赖分析经验 |
| [browser-history-tag-delete-fix-2026-06-26.md](./browser/2026-06/browser-history-tag-delete-fix-2026-06-26.md) | 2026-06-26 Bug 修复 | 历史记录标签删除修复（4 问题）：右键删除无效、刷新Logo/标题无效、日目录菜单文案/行为修正、删除架构差异（动态树 vs 持久化树）、三种删除路径覆盖检查 |
| [browser-landing-page-2026-06-08.md](./browser/2026-06/browser-landing-page-2026-06-08.md) | 2026-06-08 新功能 + 后续修复 | 浏览器空标签引导页实现总结（端口扫描、UI 标准、组件架构）+ 虚线占位符边框一致性修复 |
| [browser-meta-sync-mechanism-2026-06-25.md](./browser/2026-06/browser-meta-sync-mechanism-2026-06-25.md) | 2026-06-25 架构文档更新 | 浏览器标题/favicon 双层同步机制：WebView2 postMessage + Rust 轮询、前端延迟创建策略、favicon 缓存管理、去重机制、URL 归一化规则、favicon 质量评分系统、调试日志标签体系 |
| [browser-navigate-fix-2026-06-04.md](./browser/2026-06/browser-navigate-fix-2026-06-04.md) | 2026-06-04 修复执行 | 浏览器模式下 URL 无法加载修复（无活动标签页创建逻辑、调试经验与调试手段） |
| [browser-navigate-tab-explicit-2026-06-29.md](./browser/2026-06/browser-navigate-tab-explicit-2026-06-29.md) | 2026-06-29 navigateTab 显式调用重构 | navigateTab 反馈循环修复：useBrowserWebView 被动触发→前端显式调用，不同来源的导航分离原则 |
| [browser-navigation-mode-toggle-2026-06-20.md](./browser/2026-06/browser-navigation-mode-toggle-2026-06-20.md) | 2026-06-20 新功能 + 修复执行 | 浏览器导航模式切换（in-place/new-tab）+ 链接点击后自动刷新修复（SPA pushState URL 差异、两路去重失效、hostname+pathname 归一化） |
| [browser-navigator-4-mode-2026-06-24.md](./browser/2026-06/browser-navigator-4-mode-2026-06-24.md) | 2026-06-24 导航栏重构 | 4模式扁平按钮设计（open/tabs/list/search）、Store 简化（删除 viewMode/showTabButtons）、Flash 消除（display:none 包装）、搜索外部点击修复、Flat 模式标签溢出修复（::after 渐变蒙版） |
| [browser-newtab-button-and-default-title-2026-06-26.md](./browser/2026-06/browser-newtab-button-and-default-title-2026-06-26.md) | 2026-06-26 功能优化 | 新建标签按钮与默认标题优化 |
| [browser-opened-tabs-enhancement-2026-06-23.md](./browser/2026-06/browser-opened-tabs-enhancement-2026-06-23.md) | 2026-06-23 多标签页优化 | 已打开标签模式过滤（filterTabIds）、多 iframe 状态保持（activatedTabIdsRef）、悬停关闭按钮（danger-hover） |
| [browser-prefetch-title-lock-favicon-pin-2026-06-21.md](./browser/2026-06/browser-prefetch-title-lock-favicon-pin-2026-06-21.md) | 2026-06-21 重构 + 修复执行 | 浏览器预取 + 标题锁定 + Favicon Pin 重构：共享工具提取（browserDisplayUtils.ts + BrowserFavicon.tsx）、6处 hostnameFromUrl 去重、2处 favicon 内联→组件、启发式→显式 pin 机制 |
| [browser-refresh-meta-optimization-2026-06-23.md](./browser/2026-06/browser-refresh-meta-optimization-2026-06-23.md) | 2026-06-23 优化 | 浏览器刷新元数据优化 |
| [browser-spa-navigation-title-sync-fix-2026-06-28.md](./browser/2026-06/browser-spa-navigation-title-sync-fix-2026-06-28.md) | 2026-06-28 Bug 修复 | SPA 导航标题同步修复：双重 Bug（SPA URL 归一化覆盖真实标题 + INIT_SCRIPT 强制整页导航阻断 SPA 标题），microtask 回退策略 |
| [browser-tab-context-menu-hover-actions-2026-06-22.md](./browser/2026-06/browser-tab-context-menu-hover-actions-2026-06-22.md) | 2026-06-22 新功能 | 标签右键菜单（6项）+ 悬停按钮（刷新/更多操作）+ 编辑对话框 + 缓存清理工具 + 统一删除 Store Action |
| [browser-tab-meta-deferred-creation-2026-06-25.md](./browser/2026-06/browser-tab-meta-deferred-creation-2026-06-25.md) | 2026-06-25 重构执行 | 标签元数据延迟创建与同步更新：无占位符标题、path 历史去重（historyDedupKey）、后退保留真实标题、favicon 仅与标题同时缓存、树视图过滤空名称条目 |
| [browser-tab-title-deferred-update-2026-06-26.md](./browser/2026-06/browser-tab-title-deferred-update-2026-06-26.md) | 2026-06-26 Bug 修复 | 标签标题延迟更新与通用 prefetch：标题闪烁/SPA 回退标题不更新的根因分析与修复方案 |
| [browser-text-overflow-webview2-clip-2026-06-22.md](./browser/2026-06/browser-text-overflow-webview2-clip-2026-06-22.md) | 2026-06-22 Bug 修复 | 快捷卡片文字省略号 WebView2 点击闪烁修复：Chromium 2026 clip-on-interaction 特性导致，`-webkit-line-clamp: 1` 替代 `text-overflow: ellipsis` |
| [browser-theme-sync-final-2026-06-29.md](./browser/2026-06/browser-theme-sync-final-2026-06-29.md) | 2026-06-29 主题同步 | 浏览器主题同步最终修复 |
| [browser-url-input-landing-page-bookmark-fixes-2026-06-21.md](./browser/2026-06/browser-url-input-landing-page-bookmark-fixes-2026-06-21.md) | 2026-06-21 修复执行 | 地址栏失焦/ESC 恢复原始 URL、空 URL 着陆页显示、Tauri 空 URL 空白 WebView、着陆页书签星号点亮、Tauri URL 不加载修复 |
| [browser-url-sync-fix-2026-06-04.md](./browser/2026-06/browser-url-sync-fix-2026-06-04.md) | 2026-06-04 修复执行 | 浏览器 URL 同步修复经验 |
| [browser-webview-pool-lru-2026-06-26.md](./browser/2026-06/browser-webview-pool-lru-2026-06-26.md) | 2026-06-26 优化 | WebView 池 LRU 缓存策略实现 |
| [panel-resize-handle-webview-2026-06-18.md](./browser/2026-06/panel-resize-handle-webview-2026-06-18.md) | 2026-06-18 修复执行 | 面板拖拽线被 WebView 覆盖：区域逃逸方案（handle 左扩至中心区），无需隐藏 WebView |
| [safe-iframe-shadow-dom-fix-2026-06-17.md](./browser/2026-06/safe-iframe-shadow-dom-fix-2026-06-17.md) | 2026-06-17 修复执行 | Shadow DOM 修复 React DevTools 跨域 iframe SecurityError（6 次迭代经验总结：C++ native getter 不可拦截 + attachShadow mode:closed 终极方案） |
| [spa-history-back-double-click-2026-06-30.md](./browser/2026-06/spa-history-back-double-click-2026-06-30.md) | 2026-06-30 知识沉淀 | SPA 后退需双击问题：eval("history.back()") 与 SPA pushState 多层历史栈，非应用 bug |
| [tauri-webview-overlay-hide-2026-06-18.md](./browser/2026-06/tauri-webview-overlay-hide-2026-06-18.md) | 2026-06-18 修复执行 / 2026-07-01 修订 | Tauri 原生子 WebView 层级覆盖问题（含 2026-07-01 updateWebViewBounds 覆盖层守卫补充修复） |

#### 2026-07

| 文件 | 来源 | 说明 |
|------|------|------|
| [browser-bilibili-double-reload-fix-2026-07-15.md](./browser/2026-07/browser-bilibili-double-reload-fix-2026-07-15.md) | 2026-07-15 Bug 修复 | Bilibili 页面双重重载问题修复 |
| [browser-bookmark-click-handler-fix-2026-07-02.md](./browser/2026-07/browser-bookmark-click-handler-fix-2026-07-02.md) | 2026-07-02 Bug 修复 | 书签点击处理器修复 |
| [browser-favicon-title-sync-2026-07-01.md](./browser/2026-07/browser-favicon-title-sync-2026-07-01.md) | 2026-07-01 修复执行 | 浏览器 Favicon/Title 同步修复：5 个根因（缓存未持久化、多源争用、HTTP 路径绕过质量检查、TabBar 未订阅 favicon、过期缓存无驱逐）、统一 handlePageMeta 入口 + 源优先级 + localStorage 持久化 + subscribeFavicon 订阅 + onError 驱逐 |

#### 2026-08

| 文件 | 来源 | 说明 |
|------|------|------|
| [browser-site-meta-cache-2026-08-13.md](./browser/2026-08/browser-site-meta-cache-2026-08-13.md) | 2026-08-13 网站元数据持久化缓存 | favicon data-URI + 标题持久化缓存（三层架构：Rust SQLite / preview JSON / 前端镜像）经验（三端语义一致、质量门控输入漂移、失败路径不能伪造成功值） |
| [browser-history-navigation-2026-08-14.md](./browser/2026-08/browser-history-navigation-2026-08-14.md) | 2026-08-14 历史导航与标题提取修复 | 历史 URL 归一化 + 前端智能回退 + 标题来源门控（provenance）+ can_go_back 原生 IPC 经验（去重窗口 ms 级、异步投递同步通道、注入脚本 IIFE 隔离） |
| [browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md](./browser/2026-08/browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md) | 2026-08-15 书签去重修复 | 书签去重 (网址,标题) 元组语义 + 标题隔离（store 语义与 UI 判断同步、统一去重规则、元组键清理路径、标题双轨） |
| [browser-favicon-proxy-removal-and-merge-guard-2026-08-18.md](./browser/2026-08/browser-favicon-proxy-removal-and-merge-guard-2026-08-18.md) | 2026-08-18 favicon 修复 | DDG/Google 代理图标移除 + 镜像合并守卫经验（外部兜底"合法但错误"图标、失败返回最佳已知状态而非空、三端短路路径逐字段对齐、dedup 命中≠失败、IconWorld 继承描边破坏填充图标、图标颜色 token 化） |
| [browser-favicon-timing-race-2026-08-22.md](./browser/2026-08/browser-favicon-timing-race-2026-08-22.md) | 2026-08-22 favicon 时序竞争修复 | 静默抓取首次返回 title-only 无 favicon 的时序竞争根因与双层防御修复（后端 favicon_extended 延长等待 + 前端 waitForFavicon 事件监听 + 事件监听泄漏修复 + data-URI 泄露防护） |

### Code quality

#### 综合参考（根目录）

| 文件 | 来源 | 说明 |
|------|------|------|
| [code-quality-detection-and-fix.md](./code-quality/code-quality-detection-and-fix.md) | 全仓库代码质量检测与修复执行 | 7 条经验（React 19 hooks、React.memo、CodeMirror 重建、Rust clippy 等） |

#### 2026-06

| 文件 | 来源 | 说明 |
|------|------|------|
| [diff-viewer-empty-line-hover-scroll-fix-2026-06-13.md](./code-quality/2026-06/diff-viewer-empty-line-hover-scroll-fix-2026-06-13.md) | 2026-06-13 修复执行 | 变更查看器空行悬停背景色修复 + 快速滚动闪烁修复（CSS :has 陷阱、MergeView compartment、collapseUnchanged minSize） |
| [diff-viewer-fold-gutter-fix-2026-06-07.md](./code-quality/2026-06/diff-viewer-fold-gutter-fix-2026-06-07.md) | 2026-06-07 修复执行 | 差异查看器折叠 gutter 修复 |
| [diff-viewer-gutter-hover-fix-2026-06-06.md](./code-quality/2026-06/diff-viewer-gutter-hover-fix-2026-06-06.md) | 2026-06-06 修复执行 | 差异查看器 gutter 悬停修复 |
| [diff-viewer-gutter-hover-fix-2026-06-08.md](./code-quality/2026-06/diff-viewer-gutter-hover-fix-2026-06-08.md) | 2026-06-08 修复执行 | 差异查看器并排模式 A 侧行号区悬停颜色修复（`EditorView.editorAttributes` DOM 类归属判断） |
| [diff-viewer-theme-fix-2026-06-06.md](./code-quality/2026-06/diff-viewer-theme-fix-2026-06-06.md) | 2026-06-06 修复执行 | 差异查看器主题修复（CSS 选择器覆盖不足、硬编码值、内容/行号区层级）与无变更行自动折叠启用 |
| [eslint-prettier-clippy-rustfmt-config-and-bugfix-2026-06-11.md](./code-quality/2026-06/eslint-prettier-clippy-rustfmt-config-and-bugfix-2026-06-11.md) | 2026-06-11 四维门禁全量修复执行 | 6 条经验（CSS 删除前 grep、rustfmt nightly 陷阱、flat config ignores 陷阱、Prettier 合并规则、> 选择器防传播） |
| [eslint-prettier-ts-cleanup-2026-06-04.md](./code-quality/2026-06/eslint-prettier-ts-cleanup-2026-06-04.md) | 四维门禁清零执行 | 6 条经验（`_param` 解构陷阱、`any`→具体类型级联错误、组件拆分、图书馆接等） |
| [file-tree-scrollbar-and-test-sync-fix-2026-06-07.md](./code-quality/2026-06/file-tree-scrollbar-and-test-sync-fix-2026-06-07.md) | 2026-06-07 修复执行 | 文件树滚动条与测试同步修复 |
| [syntax-highlighting-fix-2026-06-05.md](./code-quality/2026-06/syntax-highlighting-fix-2026-06-05.md) | 2026-06-05 修复执行 | 变更面板语法高亮修复（CodeMirror Facet 多实例、pnpm 传递依赖陷阱、Vite 预构建缓存） |
| [tech-stack-optimization-2026-06-09.md](./code-quality/2026-06/tech-stack-optimization-2026-06-09.md) | 2026-06-09 技术栈优化 | 9 条经验（ts-rs 类型冲突、tokio 特性精简、密钥降级、highlight.js 按需等） |
| [windows-verbatim-path-prefix-2026-06-30.md](./code-quality/2026-06/windows-verbatim-path-prefix-2026-06-30.md) | 2026-06-30 Bug 修复 | Windows 逐字路径前缀修复经验 |

#### 2026-07

| 文件 | 来源 | 说明 |
|------|------|------|
| [echarts-visx-migration-2026-07-15.md](./code-quality/2026-07/echarts-visx-migration-2026-07-15.md) | 2026-07-15 Git 可视化重构执行 | ECharts→visx 迁移经验 8 条（增量替换、版本管理、类型声明、子包粒度、热力图、旭日图、Math.max 空数组、tickFormat 类型兼容性） |
| [opencode-audit-fix-2026-07.md](./code-quality/2026-07/opencode-audit-fix-2026-07.md) | 2026-07-08 审计缺陷修复执行 | OpenCode 功能审计 10 项缺陷修复（Compaction 阈值语义、Plugin hook 有序链式传播、DurableSession 错误可见性、MCP 自动重连、Subagent 权限继承） |
| [opencode-feature-defects-2026-07-06.md](./code-quality/2026-07/opencode-feature-defects-2026-07-06.md) | 2026-07-06 缺陷修复执行 | OpenCode 对照 8 项实现缺陷修复（truncate_output 边界、classify_profile 平衡、pattern_matches 正则、Snapshot 文件副本、MCP transport 真实化） |
| [opencode-feature-integration-2026-07-06.md](./code-quality/2026-07/opencode-feature-integration-2026-07-06.md) | 2026-07-06 功能集成 | OpenCode 功能集成经验 |
| [phase2-audit-fixes-2026-07-06.md](./code-quality/2026-07/phase2-audit-fixes-2026-07-06.md) | 2026-07-06 审计修复 | Phase 2 审计修复经验 |
| [phase2-defect-fix-2026-07-06.md](./code-quality/2026-07/phase2-defect-fix-2026-07-06.md) | 2026-07-06 缺陷修复 | Phase 2 缺陷修复经验 |
| [heatmap-chart-generalization-2026-07-16.md](./code-quality/2026-07/heatmap-chart-generalization-2026-07-16.md) | 2026-07-16 HeatmapChart 泛化重构 | HeatmapChart 泛化经验 5 条（Tooltip 单复数分离、visibleData 派生列标签、overflow hidden 防重叠、tickEvery 密度控制、rowLabels 模式下 tickFilter 忽略） |

#### 2026-08

| 文件 | 来源 | 说明 |
|------|------|------|
| [chart-brush-portal-overlay-2026-08-02.md](./code-quality/2026-08/chart-brush-portal-overlay-2026-08-02.md) | 2026-08-02 ChartBrush 修复执行 | ChartBrush 门户 Overlay 与 CSS 级联陷阱（SVG backdrop-filter 不可靠改 createPortal、`:root` 同特异性靠后覆盖主题块值、拖拽换算用 innerWidth、jsdom 无 PointerEvent 测试处理） |
| [icon-family-unification-two-registry-sync-2026-08-02.md](./code-quality/2026-08/icon-family-unification-two-registry-sync-2026-08-02.md) | 2026-08-02 chevron 家族统一重构 | 图标家族几何统一与双图标系统同步（共享图标修改是全应用级变更、家族须统一几何避免展开/折叠跳变、app/icons 与 design-system/icons 双注册表必须同步、SVG 尺寸换算、图标几何测试取舍） |
| [mock-bridge-data-safety-demo-2026-08-08.md](./code-quality/2026-08/mock-bridge-data-safety-demo-2026-08-08.md) | 2026-08-08 demo workspace 多轮审查 | Mock Bridge 数据安全与流式模拟正确性（订阅通道透传、写操作拦截防真实文件/会话污染、done 时序从数据派生、cancelMessage 无副作用、单一消息源、reset 全覆盖、树嵌套契约、id 解耦） |

### Browser automation

| 文件 | 来源 | 说明 |
|------|------|------|
| [lessons.md](./browser-automation/lessons.md) | .opencode/skills/... | 21 条浏览器自动化调试记录（跨平台路径、Rust 工具链、CSS 优先级等） |
| [rules-lessons.md](./browser-automation/rules-lessons.md) | .agents/rules/browser-automation | 浏览器自动化规则 10 条经验 |

### Interaction

#### 2026-06

| 文件 | 来源 | 说明 |
|------|------|------|
| [browser-bookmark-dialog-and-flat-view-2026-06-15.md](./interaction/2026-06/browser-bookmark-dialog-and-flat-view-2026-06-15.md) | 2026-06-15 功能实现 | 浏览器收藏标签对话框 + 展平列表视图：树展平算法、"!" Hint CSS specificity 技巧、按钮常态无背景 |
| [file-tree-virtualized-connecting-lines-fix-2026-06-11.md](./interaction/2026-06/file-tree-virtualized-connecting-lines-fix-2026-06-11.md) | 2026-06-11 修复执行 | 虚拟化文件树垂直连接线与悬停高亮修复（`::before` 溢出、`--adl-tree-indent` 缩进、JS 悬停传播） |
| [full-i18n-overhaul-2026-06-13.md](./interaction/2026-06/full-i18n-overhaul-2026-06-13.md) | 2026-06-13 i18n 重构 | 全量国际化重构经验 |
| [github-delete-all-menu-and-hint-card-2026-06-13.md](./interaction/2026-06/github-delete-all-menu-and-hint-card-2026-06-13.md) | 2026-06-13 菜单重构 | GitHub 删除全部菜单与提示卡片重构 |
| [github-folder-pin-and-delete-2026-06-12.md](./interaction/2026-06/github-folder-pin-and-delete-2026-06-12.md) | 2026-06-12 功能增强 | GitHub 目录置顶（文件夹+工作区）、递归数据清除作用域修复、activeCiFolderId 跟踪 |
| [github-job-card-hover-and-status-dot-optimization-2026-06-14.md](./interaction/2026-06/github-job-card-hover-and-status-dot-optimization-2026-06-14.md) | 2026-06-14 交互优化 | GitHub Job 卡片悬停背景全宽延伸、展开/折叠按钮悬停态统一、移除重复 StatusDot。核心挑战：`z-index: -1` + 局部层叠上下文 |
| [github-log-viewer-toolbar-optimization-2026-06-14.md](./interaction/2026-06/github-log-viewer-toolbar-optimization-2026-06-14.md) | 2026-06-14 交互优化 | GitHub 日志查看器工具栏：自定义下拉菜单、搜索框始终可见、正方形复选框、工具栏裁剪、删除任务视图搜索框。核心挑战：`overflow: hidden` 与下拉菜单定位冲突 |
| [github-menu-recursive-delete-and-grouping-2026-06-12.md](./interaction/2026-06/github-menu-recursive-delete-and-grouping-2026-06-12.md) | 2026-06-12 菜单重构 | GitHub 面板菜单重构（递归删除、白色/红色分组、分隔线规范、"!" 提示双通道、双菜单一致性） |
| [github-panel-i18n-full-coverage-2026-06-15.md](./interaction/2026-06/github-panel-i18n-full-coverage-2026-06-15.md) | 2026-06-15 Bug 修复 + i18n | GitHub 子面板 i18n 全覆盖：15 处硬编码清理、17 个翻译 key、工具函数 locale 感知、标题行消失修复 |
| [github-settings-dialog-standardization-2026-06-13.md](./interaction/2026-06/github-settings-dialog-standardization-2026-06-13.md) | 2026-06-13 UI 优化 | GitHub 设置对话框标准化 |
| [github-tree-sub-entry-ordering-and-i18n-2026-06-12.md](./interaction/2026-06/github-tree-sub-entry-ordering-and-i18n-2026-06-12.md) | 2026-06-12 功能优化 | GitHub 树子条目排序（紧贴父目录）+ 子条目名称国际化 |
| [hint-card-arrow-positioning-fix-2026-06-11.md](./interaction/2026-06/hint-card-arrow-positioning-fix-2026-06-11.md) | 2026-06-11 修复执行 | Hint Card 子卡片箭头定位修复 + 动态 DOM 内存泄漏 + 父级 hover 背景隔离 + "!" 按钮交互优化 |
| [outline-connecting-lines-alignment-fix-2026-06-11.md](./interaction/2026-06/outline-connecting-lines-alignment-fix-2026-06-11.md) | 2026-06-11 修复执行 | 大纲树竖线对齐修复（递归树 `::before` 无需 `--adl-tree-indent`、叶子节点隐藏竖线、死代码 `outline-panel.css` 删除） |
| [outline-navigation-and-refresh-fix-2026-06-09.md](./interaction/2026-06/outline-navigation-and-refresh-fix-2026-06-09.md) | 2026-06-09 修复执行 | 大纲导航折叠展开修复（`uncollapseUnchanged` 传参陷阱）+ 刷新按钮绕过懒加载守卫 |
| [rename-dialog-standardization-2026-06-08.md](./interaction/2026-06/rename-dialog-standardization-2026-06-08.md) | 2026-06-08 UI 优化 | 重命名弹窗交互标准化（直角按钮、✕ 关闭按钮、i18n 标题简洁化） |
| [resize-handle-pointer-events-diversion-2026-06-23.md](./interaction/2026-06/resize-handle-pointer-events-diversion-2026-06-23.md) | 2026-06-23 交互修复 | Resize Handle 与 Scrollbar 重叠：pointer-events 分流方案，`::before` 伪元素提供 3px 可拖拽边缘，零布局影响 |
| [right-click-menu-positioning-2026-06-08.md](./interaction/2026-06/right-click-menu-positioning-2026-06-08.md) | 2026-06-08 修复执行 | 右键菜单跟随鼠标位置修复（4 条经验：定位方式选择、FileTree 机制复用、条件守卫遗漏） |
| [sidebar-toggle-icon-state-switching-2026-06-28.md](./interaction/2026-06/sidebar-toggle-icon-state-switching-2026-06-28.md) | 2026-06-28 交互修复 | 侧边栏切换图标状态切换修复 |

#### 2026-07

| 文件 | 来源 | 说明 |
|------|------|------|
| [sub-card-border-subpixel-fix-2026-07-01.md](./interaction/2026-07/sub-card-border-subpixel-fix-2026-07-01.md) | 2026-07-01 Bug 修复 | Sub-Card 边框子像素渲染修复：`line-height: 1.625` 导致 `19.5px` 内容高度 → `37.5px` 半像素卡高 → `translateY(-50%)` 产生不对称抗锯齿 |
| [svg-stroke-animation-logo-overlay-2026-07-14.md](./interaction/2026-07/svg-stroke-animation-logo-overlay-2026-07-14.md) | 2026-07-14 UI 增强 | SVG 描边动画与 Logo Overlay 实现经验 |
| [heatmap-scrollbar-oscillation-and-patterns-2026-07-25.md](./interaction/2026-07/heatmap-scrollbar-oscillation-and-patterns-2026-07-25.md) | 2026-07-25 Bug 修复 | 日历热力图 5 项 Bug 修复（scrollbar-gutter 振荡修复、本地时区日期解析、!bin.date tooltip 模式、makePersistedWriter 模式） |

#### 2026-08

| 文件 | 来源 | 说明 |
|------|------|------|
| [git-vis-file-hotspots-leaderboard-2026-08-04.md](./interaction/2026-08/git-vis-file-hotspots-leaderboard-2026-08-04.md) | 2026-08-04 文件热点排行榜改进 + closing-workflow 复审 | 7 条经验：git numstat C 转义→core.quotepath=false、路径文本禁用 direction:rtl（bidi 重排）、--until 裸日期补 T23:59:59、虚拟滚动 DOM scrollTop 与状态同步、图表高度显式 height、外层"增长才滚动到底"、悬停按钮 pointer-events + :focus-visible |
| [git-vis-heatmap-loading-polish-2026-08-05.md](./interaction/2026-08/git-vis-heatmap-loading-polish-2026-08-05.md) | 2026-08-05 热力图 loading 修复 + root-cause/closing 复审 | 9 条经验：exitingReady 阶段 loading 标签 opacity 0 不可见、React 批处理吞掉 loading→最小可见时长、hold await 后复查 seq（TOCTOU）、workspace 与 per-chart loading 所有权分离（inflight 追踪）、superseded 失败不抛错、stale-path 重置放状态所有者、统计数字反映当前渲染、外层滚动仅用户触发增高才滚、i18n 符号空格与正向断言 |
| [welcome-statusbar-path-layout-fix-2026-08-07.md](./interaction/2026-08/welcome-statusbar-path-layout-fix-2026-08-07.md) | 2026-08-07 最近工作区名称/路径布局修复 | 6 条经验：`justify-self: end`+`overflow:hidden` 是长路径重叠根因（改 `stretch`）、`minmax(0,45%)` 统一比例上限（不随名称变化）、`align-self: baseline` 对齐混合字号文本、原生 `title` 展示完整名称+路径、卡片纵向堆叠+单行省略（不加宽）、纯 CSS 用调试日志数值化排查 |
| [error-toast-severity-scope-popLayout-2026-08-12.md](./interaction/2026-08/error-toast-severity-scope-popLayout-2026-08-12.md) | 2026-08-12 持久错误通知实现与优化 | 3 类经验：三级分级（error/warning/info 按 code 语义 + 亮暗主题独立对比度验证 + info 用 role=status/polite + errorsInfo 标题）；模块作用域清除（scope 用 !== undefined 判断 + 脚本批量替换后 tsc 兜底 + 队列上限 50）；popLayout 让位动画（退出元素脱离布局流、摘要不动、forwardRef 是硬性要求非防御代码） |

#### 2026-09

| 文件 | 来源 | 说明 |
|------|------|------|
| [terminal-shell-menu-hover-lessons-2026-09-13.md](./interaction/2026-09/terminal-shell-menu-hover-lessons-2026-09-13.md) | 2026-09-13 终端复合按钮悬停菜单 + closing-workflow 复审 | 2 条经验：子菜单卸载不触发 mouseleave（悬停位须在关闭动作处同步清理）；去抖写污染水合测试读数（播种前先放干悬置 flush，单例守卫用 resetModules 隔离） |
| [terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md](./interaction/2026-09/terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md) | 2026-09-13 终端面板 7 事项修复 + 收尾复审 | 3 条经验：xterm v6 自绘滚动条覆盖法（`!important` width/left、不碰 top/height transition、border-radius 瞬切）+ 升级回归点；原生事件复制粘贴（return false 放行，禁用 readText，Shift 优先与 event.code 兜底）；flex 拖拽裁剪（min-*:0 + 1px 按比例分摊） |

### CI monitoring

| 文件 | 来源 | 说明 |
|------|------|------|
| [ci-module-lessons-2026-06-09.md](./ci-monitoring/ci-module-lessons-2026-06-09.md) | 2026-06-09 全量 bug 修复 | 15 条 CI 模块经验（Token 安全存储、GitHub API 安全、useEffect 依赖、内存保护、Rust 编码规范） |
| [ci-panel-help-system-2026-06-13.md](./ci-monitoring/ci-panel-help-system-2026-06-13.md) | 2026-06-13 操作手册完善 | CI 面板帮助系统增强（全局点击冲突、帮助按钮 toggle、手册内容扩展、TOC 导航） |
| [ci-to-communication-refactor-and-log-viewer-2026-06-10.md](./ci-monitoring/ci-to-communication-refactor-and-log-viewer-2026-06-10.md) | 2026-06-10 重构 | CI→通信面板重构 + GitHub CI 日志查看器（架构变更、ZIP 解压、LRU 缓存、虚拟滚动） |
| [github-ci-per-directory-binding-2026-06-14.md](./ci-monitoring/github-ci-per-directory-binding-2026-06-14.md) | 2026-06-14 Bug 修复 | GitHub CI 按目录独立绑定（`renderChildMeta` 设置误开工作区、共享 state 污染、store sync set 覆盖、日志/快照持久化、token 恢复、Rate Limit 保护） |
| [github-ci-tree-interaction-2026-06-10.md](./ci-monitoring/github-ci-tree-interaction-2026-06-10.md) | 2026-06-10 交互重构 | GitHub CI 树形目录交互重构（FileTree 集成、按钮规范、renderIconBefore、RenameDialog 标准化、CSS 定位） |
| [github-title-path-header-fix-2026-06-14.md](./ci-monitoring/github-title-path-header-fix-2026-06-14.md) | 2026-06-14 Bug 修复 | GitHub 标题路径提示行修复（垂直居中、消失、路径不完整、分类标识、全局点击范围守卫、`data-path` 归属） |

### Tauri backend

| 文件 | 来源 | 说明 |
|------|------|------|
| [tauri-sync-command-blocking-2026-07-14.md](./tauri-backend/tauri-sync-command-blocking-2026-07-14.md) | 2026-07-14 启动期"未响应"根因修复 | Tauri 同步命令阻塞主线程：根因分析、证据链、修复方案、async + spawn_blocking 模式、经验教训 |

### Logging

| 文件 | 来源 | 说明 |
|------|------|------|
| [log-system-lessons.md](./logging/log-system-lessons.md) | 日志系统改造 | 日志系统统一改造经验（OpenOptions 权限、ANSI 控制、FormatTime、MakeWriter 兼容、双端一致性） |

### Toolchain

| 文件 | 来源 | 说明 |
|------|------|------|
| [git-schannel-revocation-check-fix-2026-07-21.md](./toolchain/git-schannel-revocation-check-fix-2026-07-21.md) | 2026-07-21 git push 修复 | Git for Windows Schannel 证书吊销检查导致推送超时的根因与修复 |
| [git-proxy-port-mismatch-fix-2026-07-30.md](./toolchain/git-proxy-port-mismatch-fix-2026-07-30.md) | 2026-07-30 git push 修复 | git 代理端口 7890 与 maoxiong-vpn 实际监听端口 17890 不一致导致推送失败 |
| [tauri-dev-stale-exe-lock-2026-08-16.md](./toolchain/tauri-dev-stale-exe-lock-2026-08-16.md) | 2026-08-16 dev:tauri 修复 | Tauri dev 模式 Windows 残留进程锁定 exe 导致 Rust 修改不生效（根因、路径精确 kill、waitForUnlock、红绿测试方法） |
