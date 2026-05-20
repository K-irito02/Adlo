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
| `frontend/src/shared/ipc.ts` | `DigitalLifeBridge` 类型契约 |
| `frontend/dev/previewWorkspaceService.ts` | 浏览器开发态服务端 API（原生目录选择器、工作区操作、Git 等） |
| `frontend/dev/previewTerminalService.ts` | 浏览器开发态终端服务（Node.js `child_process.spawn` + SSE PTY 输出） |

## Crates 层

| crate | 职责 |
|-------|------|
| `kernel` | 共享类型与常量（serde） |
| `storage` / `migration` | SQLite |
| `config`、`logger`、`errors`、`events` | 基础设施 |
| `workspace`、`task`、`conversation`、`model-gateway` | 业务域 |

## 前端关键目录

| 目录 | 职责 |
|------|------|
| `app/components/` | React 组件（含 Tooltip、TooltipSimple） |
| `app/hooks/` | 自定义 Hooks（含 useTooltip） |
| `app/utils/` | 纯函数（含 tooltipPosition 定位逻辑） |
| `app/stores/` | Zustand 状态管理（包含切片模式重构） |
| `app/regions/right-panel/` | 右侧面板组件（FilesPanel/FileNavigatorShell/EditorSurfaceShell 分层架构） |

## Stores 架构（Zustand 切片模式）

```
app/stores/
├── store.ts                    # 主 Store（原始实现）
├── slicedStore.ts               # 基于切片模式的 Store 重构
├── slices.ts                   # 统一导出所有切片
├── selectors.ts                # 通用选择器
├── shared.ts                   # 共享状态和工具
├── cacheUtils.ts               # 缓存工具函数
├── conversationUtils.ts         # 会话工具函数
├── index.ts                    # 模块索引
├── INTEGRATION_GUIDE.md        # 集成指南
│
├── slices/                     # Zustand 切片定义
│   ├── uiSlice.ts              # UI 状态（侧边栏、工具栏）
│   ├── workspaceSlice.ts        # 工作区状态
│   ├── gitSlice.ts             # Git 状态
│   ├── sessionSlice.ts          # 会话状态
│   ├── editorSlice.ts           # 编辑器状态
│   ├── patchSlice.ts            # 补丁状态
│   ├── searchSlice.ts           # 搜索状态
│   ├── diagnosticSlice.ts       # 诊断状态
│   ├── taskSlice.ts             # 任务状态
│   └── commandSlice.ts          # 命令状态
│
└── (legacy sub-stores)         # 独立子 Store（向后兼容）
    ├── useWorkspaceStore.ts
    ├── useSessionStore.ts
    ├── useEditorStore.ts
    └── usePatchStore.ts
```

### 切片职责说明

| 切片 | 状态 | Actions |
|------|------|---------|
| `uiSlice` | leftSidebarVisible, rightPanelVisible, activeRightTool, currentModel, composerMessage | set*, toggle* |
| `workspaceSlice` | appInfo, recentWorkspaces, workspaceTree, workspaceContextMode | setAppInfo, setRecentWorkspaces, setWorkspaceTree |
| `gitSlice` | gitSnapshot, gitBranches | setGitSnapshot, setGitBranches |
| `sessionSlice` | sessions, activeSessionId, sessionDetails, activeRun, streaming*, runActivity* | set*, append* |
| `editorSlice` | openTabs, selectedFilePath, changePreview, fileContent, outline, dirtyEditorPaths | set*, add*, remove*, clear* |
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

## 相关文件

- [AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
- [docs/重构洞察/REFACTORING_PROGRESS_REPORT.md](/E:/Programs/Obsidian/notes/docs/重构洞察/REFACTORING_PROGRESS_REPORT.md)
