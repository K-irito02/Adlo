---
description: Project overview, dual-root structure, tech stack, and source of truth locations
alwaysApply: true
---

# 项目总览

## 双根结构

| 目录 | 职责 |
|------|------|
| `notes/` | 规划与治理：文档、`AGENTS.md`、`docs/development/` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust (stable) + tokio + rusqlite + r2d2 + serde + tracing |
| 前端 | React 19 + TypeScript + Vite + Zustand + CodeMirror 6 |
| 持久化 | SQLite（`rusqlite`，后端） |
| 包管理 | npm（前端），Cargo（Rust workspace） |

## 双端架构

应用同时支持 **Tauri 桌面应用** 和 **浏览器模式**（内置预览 / 外部浏览器），通过 `DigitalLifeBridge` 统一抽象层实现功能对等。

| 运行模式 | 桥接层 | 数据来源 |
|----------|--------|----------|
| Tauri 桌面 | `createTauriBridge()` | Rust 后端 + SQLite |
| 浏览器预览 | `setupPreviewBridge()` | Vite Preview API + mock 数据 |

| 环境检测 | 说明 |
|----------|------|
| `isTauriShell()` | 运行时判断当前是否在 Tauri 环境中 |
| `data-shell="tauri\|browser"` | HTML 根元素属性，CSS 可据此适配 |

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/tauri-bridge.ts` | Tauri 模式桥接 + `isTauriShell()` 检测 |
| `frontend/src/preview-bridge/` | 浏览器模式桥接（Vite Preview API） |
| `frontend/src/mock-bridge.ts` | 纯内存模拟数据入口（委托到 `mock/` 子模块） |
| `frontend/src/shared/ipc.ts` | `DigitalLifeBridge` 类型定义 |

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目级治理 | 根目录 `AGENTS.md` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `ai-digital-life/docs/architecture/` |
| 设计系统 | `ai-digital-life/docs/design-system/` |
| IPC 契约 | `ai-digital-life/frontend/src/shared/ipc.ts` |
| 进程边界 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |
| 设计 Token 类型 | `ai-digital-life/frontend/src/design-system/tokens.ts` |
| 功能模块（features/） | `ai-digital-life/frontend/src/app/features/` |
| Vite 配置 | `ai-digital-life/frontend/vite.config.ts` |
| 重构进度 | `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` |
| 重构总结 | `docs/reorganization/` |

## 任务路由

| 任务类型 | 默认检索位置 |
|----------|--------------|
| Rust 后端与 Tauri 命令 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |
| WebView UI 与样式 | `ai-digital-life/frontend/src/` |
| 功能模块组件 | `ai-digital-life/frontend/src/app/features/` |
| 设计 Token / 主题 | `ai-digital-life/frontend/src/design-system/`、`src/styles/` |
| 阶段/路由/治理 | 根目录 `AGENTS.md` |
| 架构设计 | `ai-digital-life/docs/architecture/` |
| 状态管理 / Store 变更 | `ai-digital-life/frontend/src/app/stores/` |

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)
