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
| `app/regions/right-panel/` | 右侧面板组件（FilesPanel/FileNavigatorShell/EditorSurfaceShell 分层架构，含 hooks/、DiffToolbar、FileContextMenu、FileCreationBar、FileHistoryNav、stickyContextView、FoldTooltipOverlay、cmFoldGutter、cmWrapColumn、scrollbarWidth、useFoldMarkerAutoHide） |

## 索引策略

1. 业务逻辑 → `crates/*`
2. Tauri 边界 → `src-tauri/*`
3. UI → `frontend/src/*`

## 相关文件

- [AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
