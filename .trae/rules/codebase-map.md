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
│   └── superpowers/    # 功能设计 & 实施计划 (specs/ + plans/)
└── tests/              # 集成 / E2E
```

## 应用层

| 位置 | 职责 |
|------|------|
| `src-tauri/` | 窗口、Rust 启动、invoke 处理、capabilities |
| `frontend/src/` | React UI、Zustand、桥接 |
| `frontend/src/shared/ipc.ts` | `DigitalLifeBridge` 类型契约（含文件操作：rename/delete/duplicate/getAbsolutePath） |
| `frontend/dev/previewWorkspaceService.ts` | 浏览器开发态服务端 API（含文件操作、Git、工作区管理等） |
| `frontend/dev/previewTerminalService.ts` | 浏览器开发态终端服务（Node.js `child_process.spawn` + SSE PTY 输出） |

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
| `agent-runtime` | 单 Agent 顺序规划 |
| `model-gateway` | DeepSeek / MiniMax 路由 + 流式 |
| `change-engine` | patch 预览、应用、回滚、checkpoint |
| `terminal` | 命令执行 + 流式输出 |

## 前端关键目录

| 目录 | 职责 |
|------|------|
| `app/components/` | React 组件（含 ContextMenu、ConfirmDialog、RenameInput、Tooltip 等） |
| `app/hooks/` | 自定义 Hooks（含 useTooltip、useAppActions、useDragDropWorkspace、useEditorReveal、useKeyboardShortcuts、useNavigatorResize、useFileContextMenu、usePatchReview、useTaskCenterPolling、useThemeSync 等 11 个 hook） |
| `app/utils/` | 纯函数（含 tooltipPosition、clipboard、preferencesMerger） |
| `app/stores/` | Zustand 状态管理（切片合并模式 + actions/ 领域模块） |
| `app/features/` | 按功能域分层的模块化组件（含 terminal/ 中 3 个子 hook：useTerminalContextMenu、useTerminalDragDrop、useTerminalMenus） |
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
├── slices/                      # 11 个 Zustand 切片
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
│   └── clipboardSlice.ts        # 剪贴板状态
│
├── actions/                     # 9 个跨切片 action 模块
│   ├── workspaceActions.ts      # 工作区操作
│   ├── sessionActions.ts        # 会话操作
│   ├── editorActions.ts         # 编辑器操作
│   ├── patchActions.ts          # 补丁操作
│   ├── gitActions.ts            # Git 操作
│   ├── searchActions.ts         # 文件搜索操作
│   ├── fetchActions.ts          # 数据拉取操作
│   ├── streamActions.ts         # 流式消息操作
│   ├── taskActions.ts           # 任务审批/恢复操作
│   └── commandActions.ts        # 命令执行操作
│
└── (已删除)                     # 4 个遗留独立 Store
    ├── useWorkspaceStore.ts      # ❌ 已删除
    ├── useSessionStore.ts        # ❌ 已删除
    ├── useEditorStore.ts         # ❌ 已删除
    └── usePatchStore.ts          # ❌ 已删除
```

## 桥接层架构

```
frontend/src/
├── shared/ipc.ts           # DigitalLifeBridge + 13 个子接口
├── tauri-bridge.ts         # Tauri 模式桥接
├── mock-bridge.ts          # 纯内存回退入口（委托到 mock/ 子模块）
├── mock/                   # mock 桥接子模块（7 个子文件）
│   ├── shared.ts           # 共享可变状态
│   ├── mock-workspace.ts   # 工作区操作模拟
│   ├── mock-conversation.ts# 会话管理模拟
│   ├── mock-patch.ts       # 补丁操作模拟
│   ├── mock-terminal.ts    # 终端操作模拟
│   ├── mock-task.ts        # 任务/审批模拟
│   └── mock-retrieval.ts   # 检索模拟
├── preview-bridge/         # 浏览器模式桥接模块
│   ├── index.ts            # 组合入口（setupPreviewBridge）
│   ├── api.ts              # 请求封装（requestPreviewApi）
│   ├── storage.ts          # localStorage 持久化工具
│   └── ptyBridge.ts        # PTY 连接管理（SSE、listeners）
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

## 索引策略

1. 业务逻辑 → `crates/*`
2. Tauri 边界 → `src-tauri/*`
3. UI → `frontend/src/*`
4. 状态管理 → `frontend/src/app/stores/*`
