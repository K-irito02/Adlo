---
description: Codebase map, Cargo workspace, frontend layout, and indexing strategy
globs: ai-digital-life/**/*
alwaysApply: false
---

# 代码地图

## 顶层结构

```
ai-digital-life/
├── Cargo.toml          # Rust workspace 根
├── src-tauri/          # Tauri 二进制与 #[tauri::command]
├── crates/             # Rust 库 crate
├── frontend/           # WebView：React + Vite
├── docs/               # 架构与设计文档
│   ├── architecture/   # 系统架构
│   ├── design-system/  # 设计系统
│   ├── plans/          # 功能实施计划（按领域分类）
│   └── specs/          # 功能规格设计（按领域分类）
└── tests/              # 集成 / E2E
```

## 应用层

| 位置 | 职责 |
|------|------|
| `src-tauri/` | 窗口、Rust 启动、invoke 处理、capabilities |
| `frontend/src/` | React UI、Zustand、桥接 |
| `frontend/src/shared/ipc/` | `DigitalLifeBridge` 类型契约域拆分（29 个子接口文件 + index.ts barrel，含文件操作：rename/delete/duplicate/getAbsolutePath） |
| `frontend/src/shared/outline/` | 大纲解析模块化（10 个语言模块 + config + types + utils + index.ts barrel） |
| `frontend/dev/previewWorkspaceService.ts` | 浏览器开发态服务端 API（含文件操作、Git、工作区管理等） |
| `frontend/dev/previewTerminalService.ts` | 浏览器开发态终端服务（Node.js `child_process.spawn` + `/pty/output-since` 增量输出接口） |

## Crates 层

| crate | 职责 |
|-------|------|
| `kernel` | 共享类型与常量（serde），含 `domain` 模块 |
| `storage` / `migration` | SQLite（r2d2 连接池，`EntityTable` 宏生成，外部 SQL 文件 `sql/`） |
| `config` | 配置分层与持久化 |
| `logger` | tracing 初始化、结构化字段 |
| `errors` | thiserror 错误类型 |
| `events` | 跨 crate 事件总线 |
| `workspace` | 业务域（拆分 fs/git/search/tree/outline×10 子模块, 文件 CRUD + 16+ 语言大纲解析） |
| `outline` | 大纲解析（从 workspace 抽出为独立 crate） |
| `context` | 上下文选择（替代已拆除的 context-engine） |
| `command` | 命令执行与治理 |
| `pty` | 伪终端（PTY）进程管理 |
| `fs-ops` | notify 监听、原子写、路径作用域 |
| `task` | 任务状态机、审批 |
| `conversation` | 会话 / 消息 |
| `agent-runtime` | Agent 运行时（权限检查、Plan Mode、Compaction 摘要、ToolRegistry 统一注册） |
| `model-gateway` | 多 Provider 路由（7 个 provider：DeepSeek/MiniMax/Anthropic/OpenAI/Google/Ollama/OpenRouter）+ 流式 |
| `subagent` | 子代理管理（Task 工具、权限派生、后台执行） |
| `change-engine` | patch 预览、应用、回滚、checkpoint |
| `browser` | Tauri child WebView 生命周期管理（create/destroy/navigate/goBack/goForward/reload/setBounds/eval） |
| `ci-status` | GitHub Actions CI 状态轮询、缓存、解析 |
| `clipboard` | 系统剪贴板监听（clipboard-win monitor，写 `data.db` 的 `clipboard_items` 表，图片 PNG 落盘 + 缩略图 + digest 去重 + 硬删） |
| `sysmon` | 系统资源快照（sysinfo：CPU/内存/磁盘/网络/进程 Top-N） |
| `dsh-version` | DSH 版本管理（已安装版本列表、版本切换、npm 仓库查询、系统 dsh 检测、智能源选择） |
| `dsh-bundle` | 内置 DSH 包管理（manifest 检测、版本查询、启动命令构建） |
| `download-source` | 下载源配置（npm 仓库/镜像源、代理设置、连通性测试） |

## 前端关键目录

| 目录 | 职责 |
|------|------|
| `app/components/` | React 组件（含 ContextMenu、ConfirmDialog、RenameInput、Tooltip 等） |
| `app/hooks/` | 自定义 Hooks（含 useTooltip、useAppActions、useDragDropWorkspace、useEditorReveal、useKeyboardShortcuts、useNavigatorResize、useFileContextMenu、usePatchReview、useTaskCenterPolling、useThemeSync 等 11 个 hook） |
| `app/utils/` | 纯函数（含 tooltipPosition、clipboard、preferencesMerger） |
| `app/stores/` | Zustand 状态管理（切片合并模式 + actions/ 领域模块） |
| `app/features/` | 按功能域分层的模块化组件（含 terminal/ 中 3 个子 hook、tree/ 中 MultiTreeEntryShell 共享骨架） |
| `app/regions/` | 区域布局组件（left-sidebar / right-panel(panels+editor-support+hooks) / center-pane，App.tsx 由 447 行缩减至 203 行，抽出 5 个新 hook；right-panel 7 个 barrel 文件已删除，新增 7 个 per-panel prop hooks 集中到 hooks/ 目录） |
| `design-system/` | 设计 Token 类型定义（tokens.ts / theme.ts / icons.ts） |
| `styles/` | CSS 样式文件（themes.css / tokens.css / regions/*.css 等） |

## Stores 架构（Zustand 切片合并模式）

```
app/stores/
├── slicedStore.ts               # 基于切片合并的完整 Store（真源）
├── StoreState.ts                # 完整 StoreState 类型接口（interface extends）
├── slices.ts                    # 统一导出所有切片
├── selectors.ts                 # 选择器（useShallow React Hook 版本）
├── shared.ts                    # 共享状态、LRU 缓存、防抖搜索、错误处理、lazy loader 工厂（7+ 工具函数）
├── localStorageUtils.ts         # localStorage JSON 读写工具
├── storageScheduler.ts          # 批量 debounce 写入调度器
├── conversationUtils.ts         # 会话工具函数
├── index.ts                     # 模块索引
│
├── slices/                      # 35 个切片及其辅助文件（含 5 浏览器子切片 + 3 GitHub 子切片）
│   ├── uiSlice.ts               # UI 状态（侧边栏、工具栏）
│   ├── workspaceSlice.ts        # 工作区状态
│   ├── gitSlice.ts              # Git 状态
│   ├── sessionSlice.ts          # 会话状态
│   ├── editorSlice.ts           # 编辑器状态
│   ├── patchSlice.ts            # 补丁状态
│   ├── searchSlice.ts           # 搜索状态（含 300ms debounce）
│   ├── diagnosticSlice.ts       # 诊断状态
│   ├── taskSlice.ts             # 任务状态
│   ├── commandSlice.ts          # 命令状态
│   ├── clipboardSlice.ts        # 剪贴板状态
│   ├── terminalSlice.ts         # 终端会话管理
│   ├── ciSlice.ts               # CI 状态（轮询、快照、Section 切换）
│   ├── communicateSlice.ts      # 通信面板共享状态
│   ├── githubSlice.ts           # GitHub 面板核心
│   ├── githubRepoSlice.ts       # GitHub 仓库配置（Token、CRUD、Pin/Unpin）
│   ├── githubTreeSlice.ts       # GitHub 树形目录
│   ├── browserSlice.ts          # 浏览器核心（导航布局、持久化）
│   ├── browserTabsSlice.ts      # 浏览器标签页
│   ├── browserBookmarkSlice.ts  # 浏览器书签（含 browserWorkspaceBookmarks 工作区书签）
│   ├── browserHistorySlice.ts   # 浏览器历史记录
│   ├── browserFoldersSlice.ts   # 浏览器标签文件夹（TabFolderState.tabs: BookmarkTabItem[] = { tabId, url, title }）
│   └── browserLandingSlice.ts   # 浏览器着陆页（快捷站点、端口、背景）
│
├── actions/                     # 31 个跨切片 action 模块
│   ├── workspaceActions.ts      # 工作区操作
│   ├── sessionActions.ts        # 会话操作
│   ├── editorActions.ts         # 编辑器操作
│   ├── patchActions.ts          # 补丁操作
│   ├── gitActions.ts            # Git 操作
│   ├── searchActions.ts         # 文件搜索操作
│   ├── fetchActions.ts          # 数据拉取操作
│   ├── streamActions.ts         # 流式消息操作
│   ├── generalActions.ts        # 通用操作
│   ├── taskActions.ts           # 任务审批/恢复操作
│   ├── commandActions.ts        # 命令执行操作
│   └── browserCleanupActions.ts # 浏览器清理操作
```

## 桥接层架构

```
frontend/src/
├── shared/ipc/             # DigitalLifeBridge + 29 个子接口（域拆分，index.ts barrel）
├── tauri-bridge.ts         # Tauri 模式桥接 barrel（1 行 re-export）
├── tauri-bridge/           # Tauri 桥接子模块（27 个子文件，tauri-*.ts 按 IPC 域拆分）
├── mock-bridge.ts          # 纯内存回退入口（委托到 mock/ 子模块）
├── mock/                   # mock 桥接子模块（31 个文件，mock-*.ts + mock-shared-*.ts 可变状态）
└── preview-bridge/         # 浏览器模式桥接模块（13 个子模块 + index.ts 组合入口）
    ├── preview-pty-bridge.ts    # PTY 轮询（1000ms：/pty/list + /pty/output-since）
    ├── preview-workspace.ts     # 工作区核心 + 文件 CRUD + 检索
    ├── preview-git.ts           # Git 操作
    ├── preview-search.ts        # 搜索 + 大纲
    ├── preview-events.ts        # 事件订阅
    ├── preview-window.ts        # 窗口控制 + 浏览器导航
    ├── preview-diagnostic.ts    # 健康检查/诊断
    ├── preview-patch.ts         # 补丁（mock 代理）
    ├── preview-storage.ts       # 存储层 re-export
    ├── preview-browser-audio.ts # 浏览器标签音频指示
    ├── preview-reachability.ts  # ad-server 可达性检测
    └── preview-api.ts           # 已迁移至 shared/ipc/preview-api.ts
```

### 切片职责说明

| 切片 | 状态 | Actions |
|------|------|---------|
| `uiSlice` | leftSidebarVisible, rightPanelVisible, activeRightTool, currentModel, composerMessage, isFetching, error | set*, toggle*, setError |
| `workspaceSlice` | appInfo, recentWorkspaces, workspaceTrees, workspaceContextMode | setAppInfo, setRecentWorkspaces, setWorkspaceTree |
| `gitSlice` | gitSnapshot, gitBranches | setGitSnapshot, setGitBranches |
| `sessionSlice` | sessions, activeSessionId, sessionDetails, activeRun | set*, append* |
| `editorSlice` | openTabs, openTabsByPath, selectedFilePath | set*, add*, remove*, clear* |
| `patchSlice` | activePatchSet, latestPatchApplication | set*, clear* |
| `searchSlice` | searchQuery, searchResults | set*, clear* |
| `diagnosticSlice` | indexingStatus, repoMap, auditEntries, modelHealth | set*, append*, clear* |
| `taskSlice` | taskCenter | set*, clear* |
| `commandSlice` | latestCommandRun, commandHistory | set*, append*, clear* |

## 路径别名（Vite/TypeScript）

前端项目配置了 `@` 路径别名，映射关系如下：

| 别名 | 映射路径 | 用途 |
|------|----------|------|
| `@app` | `src/app` | 应用主入口 |
| `@features` | `src/app/features` | 功能域模块 |
| `@stores` | `src/app/stores` | Zustand 状态管理 |
| `@components` | `src/app/components` | 通用组件（Dialog、Tooltip、Toast 等） |
| `@icons` | `src/app/icons` | 图标模块 |
| `@i18n` | `src/app/i18n` | 国际化 |
| `@utils` | `src/app/utils` | 纯函数工具 |
| `@hooks` | `src/app/hooks` | 自定义 Hooks |
| `@regions` | `src/app/regions` | 区域布局组件 |
| `@tauri-bridge` | `src/tauri-bridge` | Tauri 桥接层 |
| `@shared` | `src/shared` | 共享类型/IPC 契约 |
| `@root` | `src` | 前端源码根 |

> 新增别名必须同步更新 `vite.config.ts` 和 `tsconfig.json` 两处配置。

## 浏览器模块结构（browser/）

浏览器面板是最大的前端功能域，组件分解如下：

```
features/browser/
├── BrowserPanel.tsx          # 浏览器面板主壳（~458行）
├── BrowserPanelDialogs.tsx   # 对话框提取（CreateTab/Bookmark/Rename/Toast）
├── BrowserPanelStateContext.tsx  # 面板状态上下文（取代 BrowserPanelContent 的 props 传递）
├── BrowserPanelActionsContext.tsx # 面板操作上下文
├── BrowserNavigator.tsx      # 导航器壳（工具栏 + 模式切换，~120行）
├── BrowserNavOpenMode.tsx    # 已打开标签模式（封装 BrowserOpenTabFlatList）
├── BrowserNavTabsMode.tsx    # 标签目录树模式（封装 BrowserTabTree）
├── BrowserNavListMode.tsx    # 列表视图模式（BrowserTabTree viewMode="list"）
├── BrowserNavSearchMode.tsx  # 搜索模式（搜索结果列表）
├── BrowserOpenTabFlatList.tsx# 已打开标签扁平列表（可拖拽）
├── BrowserContextMenu.tsx    # 浏览器右键菜单组件
├── BrowserSearchOverlay.tsx  # 搜索覆盖层
├── BrowserToolbar.tsx        # 浏览器工具栏组件
├── BrowserTabBar.tsx         # 标签页栏
├── BrowserMenuDropdown.tsx   # 菜单下拉
├── BrowserIframeStack.tsx    # 多 iframe 堆叠管理器
├── BookmarkToFolderDialog.tsx# 收藏到目录对话框
├── browser-landing/          # 着陆页（快捷键网格、端口、自定义背景）
├── useBrowserPanelMenuItems.ts   # 菜单项构建 Hook（提取自 BrowserPanel）
├── useBrowserPanelAddressSubmit.ts# 地址提交逻辑 Hook（提取自 BrowserPanel）
├── useBrowserPanelEffects.ts     # 副作用 Hook（提取自 BrowserPanel）
├── useBrowserPanelCloseHandlers.ts# 关闭处理 Hook（提取自 BrowserPanel）
├── * (useBrowser*.ts)        # 15 个浏览器 Hook（按功能域拆分）
└── browserPanelHelpers.ts    # 工具函数（重命名/删除/目录树构建）
```

> 2026-07-10 重构：BrowserPanel 650→458 行，提取 4 个 Hook（menuItems/addressSubmit/effects/closeHandlers）。桥接层拆分：tauri-bridge.ts 689→1 行（9 个子文件），mock-bridge.ts 759→144 行（新增 9 个 mock 子文件）。

## 索引策略

1. 业务逻辑 → `crates/*`
2. Tauri 边界 → `src-tauri/*`
3. UI → `frontend/src/*`
4. 状态管理 → `frontend/src/app/stores/*`
