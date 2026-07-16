# 🏗️ 重构洞察报告
**生成日期**：2026-07-03
**轮次**：第 23 次洞察（项目第 93 轮）

## 1️⃣ 架构与设计

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/app/features/browser/BrowserPanel.tsx` (731行) | 前端最大组件，接近 800 行阈值。包含 iframe 生命周期、导航器模式切换、缩放等多重编排 | 提取 `useBrowserIframeErrorState`（错误状态管理）+ 将浏览器模式切换逻辑下沉到 `BrowserPanelContent` / `BrowserNavigator` | 🔴高 |
| `frontend/src/app/features/browser/BrowserOpenTabFlatList.tsx:45-96` | 列表项 `<li>` 内联渲染在 `.map()` 中（52 行），无法对单项 memo，每次父级重渲染全部重建 | 抽取 `BrowserOpenTabFlatListItem` 子组件并 `React.memo` 包裹，主组件仅做 `.map()` 渲染 | 🔴高 |
| `frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx` | **10 组 useState**，是所有组件中最多的。管理快捷方式编辑、端口添加、背景切换、拖拽状态、对话框等多重状态 | 提取 `useBrowserLandingShortcuts` + `useBrowserLandingPorts` + `useBrowserLandingBackground` 三个子 Hook，或合并为 `useReducer` | 🔴高 |
| `frontend/src/app/components/WorkspaceSplitButton.tsx` | **9 组 useState**，管理分割按钮展开/位置/菜单搜索/拖拽/文件夹选择器等多重状态 | 提取 `useSplitButtonMenu`（展开/位置/搜索）+ `useSplitButtonDrag`（拖拽/文件夹选择器）两个子 Hook | 🔴高 |
| `frontend/src/app/regions/left-sidebar/SessionList.tsx` | **9 组 useState**，管理拖拽、标签展开、批量操作、右键菜单等多重状态 | 提取 `useSessionListDrag` + `useSessionListBatch` 子 Hook | 🔴高 |
| `frontend/src/app/features/terminal/useTerminalPanel.ts` (323行) | Hook 超 300 行阈值。集中终端标签管理、shell 选择、xterm 实例、输出处理 | 拆分为 `useTerminalTabActions` + `useTerminalShellManagement` + `useTerminalViewport` | 🔴高 |
| `frontend/src/app/features/browser/useBrowserWebView.ts` (308行) | Hook 超 300 行阈值。混合 webview 生命周期、导航、bounds、URL 变更 | 拆分为 `useWebViewLifecycle` + `useWebViewNavigation` + `useWebViewBounds` | 🔴高 |
| `frontend/src/app/stores/slices/githubRepoSlice.ts:130-131` | 硬编码中文默认目录名 `` `目录 ${folderCount + 1}` ``，未走 i18n | 改为存储 i18n key 并带参数 `{ index }` | 🔴高 |
| `frontend/src/app/features/browser-tree/useBrowserTreeData.ts:346,357,368,384` | 4 处硬编码中文："年"/"月"/"日"/"历史记录"，日期分组和树节点名称 | 使用 i18n key：`t.browserDateYear` / `t.browserDateMonth` / `t.browserDateDay` / `t.browserHistory` | 🔴高 |
| `frontend/src/app/regions/right-panel/panels/communicate/githubPanelUtils.ts:67,71,75,79` | 4 处硬编码相对时间中文："刚刚"/" 分钟前"/" 小时前"/" 天前" | 使用 i18n key 替换，支持多语言时间格式化 | 🔴高 |
| `frontend/src/app/features/browser/useBrowserMenus.ts:102` | 硬编码中文菜单项"新建标签文件夹" | 使用现有 i18n key 或新增 `t.browserNewTabFolder` | 🔴高 |
| `frontend/src/app/features/editor/cmTheme.ts:494-497` | 4 处硬编码 CodeMirror gutter 标签："$ 行无变化"/"还原此块"/"接受"/"拒绝" | 改为 i18n 格式化函数（支持参数替换 `{lines}`） | 🔴高 |
| `frontend/src/app/utils/debugLogCollector.ts:325,372,375,380,383` | 5 处硬编码调试按钮文本："复制调试日志"/"已复制!"/"复制失败" | 改为 i18n key（调试工具虽非 UI 组件，但显示给用户） | 🟡中 |
| `frontend/src/app/utils/settingsViewModel.ts:21` | 硬编码语言选项"中文" | 使用 i18n key `t.langChinese` | 🟡中 |
| `frontend/src/app/components/conversation/RunSummaryBlock.tsx:290` | `` '暂无展示的活动事件。' `` 作为 `t.auditEmpty ??` 的 fallback | 移除 fallback 字符串，`t.auditEmpty` 始终可用 | 🟡中 |
| `frontend/src/app/stores/slices/browserLandingSlice.ts:33-35` + `browserSlice.ts:42-44` | 3 个 localStorage 键常量双重定义：`BROWSER_SHORTCUTS_KEY`、`BROWSER_LOCAL_PORTS_KEY`、`BROWSER_BG_CONFIG_KEY` | 统一到 `browserSliceShared.ts` 导出，两 slice 均从 leaf 模块 import | 🔴高 |
| `frontend/src/preview-bridge/preview-window.ts:7-20` | `createPreviewWindowBridge()` 返回 `browser` 属性（10 个方法）但未被任何消费方使用，死代码 | 删除 `browser` 返回值及关联的 10 个方法实现 | 🟡中 |
| `frontend/src/app/stores/slices/githubRepoSlice.ts` (359行) | Slice 超 350 行。`gitHubDeleteFolderConfigRecursive`/`gitHubDeleteFolderDataRecursive`/`gitHubDeleteFolderConfigAndDataRecursive` 三方法逻辑高度相似 | 提取 `githubRepoDeleteHelpers.ts`，合并重复的递归删除逻辑 | 🟡中 |
| `frontend/src/app/stores/slices/terminalSlice.ts` (325行) | Slice 超 300 行。混合 tabs/profiles/expansion/navigator 多域状态 | 按 `terminalTabsSlice` + `terminalProfileSlice` + `terminalNavigatorSlice` 拆分为 3 片 | 🟡中 |
| `frontend/src/app/stores/slices/githubSlice.ts` (313行) | Slice 超 300 行。与 `ciSlice.ts` 存在重复 CI 状态刷新逻辑 | 将 CI 刷新逻辑提取到共享 helper `githubCiRefresh.ts` | 🟡中 |
| `frontend/src/app/stores/slices/browserFoldersDeletion.ts` (303行) | Slice 超 300 行。`browserDeleteAllTabsInNode` 和 `browserDeleteOwnTabsInNode` 内联解析逻辑过重 | 提取纯函数模块 `browserFoldersDeletionHelpers.ts`，slice 仅负责 `set()` 调用 | 🟡中 |
| `frontend/src/app/stores/actions/workspaceActions.ts` (303行) | Action 超 300 行。`openWorkspace` 与 `clearWorkspaceContext` 逻辑高度相似 | 提取 `workspaceLifecycleActions.ts`，将生命周期 action 移入 | 🟡中 |
| `frontend/src/app/features/terminal/TerminalPanel.tsx` (378行) | 组件 378 行超 300 行拆分阈值 | 将标签栏+菜单区域抽离为 `TerminalHeaderBar` 子组件 | 🟡中 |

## 2️⃣ 性能优化

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/styles/regions/rightpanel/browser-webview.css` (954行) | CSS 最大文件接近 1000 行。混合搜索、iframe、历史、树条目、扁平列表 5 个关注点 | 按关注点拆分（已在 TODO 中但 browser-history/ browser-tree-entry/ browser-flat-list 已通过子 @import 拆分，主文件需进一步精简） | 🟡中 |
| `frontend/src/styles/regions/statusbar.css` (657行) | CSS 第二大文件。菜单样式 453 行（占 69%）与状态栏本体混合 | 提取菜单样式到 `statusbar-menu.css` | 🟡中 |
| `frontend/src/styles/regions/rightpanel/editor-content.css` (614行) | 混合 CodeMirror 布局、Markdown 预览、Highlight.js 主题 3 个关注点 | 拆分为 `markdown-preview.css`（305-611）+ `highlightjs-theme.css`（613-719） | 🟡中 |
| `frontend/src/styles/regions/rightpanel/diff-viewer.css` (47处 !important) | 单文件 47 处 !important。~80% 为 CodeMirror diff 覆盖属必要，但折叠按钮样式 10 个可优化 | 通过提高特异性选择器替代 !important 按钮样式 | 🟡中 |
| `frontend/src/styles/regions/rightpanel/terminal-panel.css` (18处 !important) | 12 处下拉菜单定位 !important，4 处 `background: transparent !important` 可能非必需 | 将下拉菜单移出受约束父容器以消除定位 !important | 🟡中 |
| `crates/browser/src/webview2_message.rs` (5x `Mutex<String>` 静态全局) | 5 个独立 Mutex 用于去重缓存（`LAST_HISTORY_URL`/`LAST_EMIT_URL`/`LAST_EMIT_TITLE`/`LAST_EMIT_TIME`/`LAST_EMIT_FAVICON`），读频率远高于写 | 合并为单个 `RwLock<WebView2Meta>` 结构体，读用 `.read()`，写用 `.write()` | 🟡中 |
| `crates/adl-logging/src/manager.rs` `terminal_sessions` + `debug_sessions` | 两个 `Arc<Mutex<SessionTracker>>` 在读配置/追踪会话时加排他锁，读远多于写 | 改为 `Arc<RwLock<SessionTracker>>` | 🟡中 |
| `crates/browser/src/browser_webview.rs:43` `current_color_scheme` | `Mutex<String>` — 每次 WebView 创建都读取，仅主题切换时写入 | 改为 `RwLock<String>` | 🟢低 |
| `frontend/src/styles` 硬编码 z-index 值 | 72 处硬编码数值（vs 25 处使用 `var(--z-*)`），集中在 rightpanel 命令的 browser/diff/file-tree 子目录 | 逐步迁移到 `--z-*` CSS 变量 | 🟢低 |

## 3️⃣ 其他发现

### 3.1 架构亮点（本轮确认良好）

| 维度 | 状态 |
|------|------|
| Rust 生产函数 >80 行 | 0 个 ✅ |
| Rust lib.rs >300 行生产代码 | 0 个 ✅ |
| webview2 模块 | 完全模块化（8 个子模块 + 5 基础设施模块）✅ |
| @deprecated 标注 | 代码中 0 处 ✅ |
| 桥接层方法对齐 | 三桥接层完全同步，无遗漏 ✅ |
| CSS 硬编码颜色 | 0 处违规（全量 token 化）✅ |
| `transition: all` | 0 处 ✅ |
| CSS 孤立文件 | 0 个（74 个 CSS 全部在 @import 链中）✅ |
| `console.log` 调试残留 | 0 处 ✅ |
| 深层相对导入（3+ `../`） | 0 处（全量使用 `@` 别名）✅ |
| Rust 切片循环依赖 | 无 ✅ |
| 前端测试全通过 | 287/287 ✅ |
| TypeScript 类型检查 | 0 errors ✅ |
| Rust unwrap/expect 生产代码 | <10 处，均有 poison 恢复或静态 Regex 模式 ✅ |
| shared/ipc/ 拆分 | 16 个域文件 + index.ts barrel ✅ |
| shared/outline/ 拆分 | 14 个语言模块 + index.ts barrel ✅ |

### 3.2 新增 React.memo 缺失

| 组件 | 路径 | 场景 |
|------|------|------|
| BrowserOpenTabFlatListItem | `app/features/browser/BrowserOpenTabFlatList.tsx:45-96` | 内联未抽取，无法 memo |

其他 5 个曾被标记为缺失的组件（TreeNodeRow、JobRow、PatchFileCard、PatchHunkCard、ShortcutCard）**已全部包裹 React.memo**。

### 3.3 i18n 硬编码中文字符串汇总

本轮新发现 **21 处硬编码中文 UI 字符串**分布在 7 个文件中：

| 文件 | 数量 | 类别 |
|------|:---:|------|
| `githubPanelUtils.ts` | 4 | 相对时间显示（刚刚/X分钟前/X小时前/X天前） |
| `useBrowserTreeData.ts` | 4 | 日期分组 + 树节点名称（年/月/日/历史记录） |
| `debugLogCollector.ts` | 5 | 调试按钮文本（复制调试日志/已复制/复制失败） |
| `cmTheme.ts` | 4 | CodeMirror gutter 标签（$ 行无变化/还原此块/接受/拒绝） |
| `useBrowserMenus.ts` | 1 | 菜单项（新建标签文件夹） |
| `RunSummaryBlock.tsx` | 1 | Fallback 字符串（暂无展示的活动事件） |
| `settingsViewModel.ts` | 1 | 语言选项（中文） |
| `githubRepoSlice.ts` | 1 | 默认目录名（目录 ${n}） |

### 3.4 Storage Key 常量散布

`browserLandingSlice.ts` 和 `browserSlice.ts` 各自定义 3 个相同值的 localStorage key 常量：
- `adl-ui:browser-shortcuts`
- `adl-ui:browser-local-ports`
- `adl-ui:browser-bg-config`

应集中到 `browserSliceShared.ts` leaf 模块。

### 3.5 死代码

| 位置 | 描述 |
|------|------|
| `preview-bridge/preview-window.ts:7-20` | `createPreviewWindowBridge().browser` 返回 10 个方法但零消费方 |

### 📊 本轮统计数据

| 指标 | 数值 |
|------|------|
| 扫描维度 | 4（前端 TS/React、Rust、CSS、跨领域） |
| 总发现数 | 34 项 |
| 🔴 高优先级 | 16 项 |
| 🟡 中优先级 | 17 项 |
| 🟢 低优先级 | 1 项 |
| 前端最大组件 | BrowserPanel.tsx（**731行**）— 上轮 main 分支 841 行，worktree 基线已减少 110 行 |
| 前端最大 Hook | useTerminalPanel.ts（323行） |
| 组件多状态（6+ useState） | 5 个组件（10/9/9/6/6） |
| i18n 硬编码中文 | 21 处（7 个文件） |
| 存储键常量重复定义 | 3 组（6 个文件） |
| React.memo 缺失 | 1 个（BrowserOpenTabFlatListItem 未抽取） |
| CSS >500 行文件 | 4 个（statusbar 657、editor-content 614、themes 598、center 513） |
| CSS !important 总量 | 254 处 |
| CSS z-index 硬编码 | 72 处（vs 25 处 var(--z-*)） |
| Rust 生产函数 >80 行 | 0 个 |
| Rust 生产 unwrap/expect | <10 处（均有保护） |
| Rust RwLock 候选 | 5-6 个 Mutex → RwLock |
| Rust clone in commands/ | ~60 处 |
| 死代码 | 1 处（preview-window.ts browser 方法） |
| 预测代码行变化 | 约 +400 行（新子模块/组件）/ -500 行（去重+精简+死代码） |

> 由重构洞察工作流生成于 2026-07-03（第 23 次洞察）
> 注：worktree 基于 commit `4cd85c99`（main 分支），部分文件行数与最新 main 分支存在差异
