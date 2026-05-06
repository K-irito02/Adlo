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
| 后端 | Rust (Cargo workspace) |
| 前端 | React 19 + TypeScript + Vite + Zustand |
| 持久化 | SQLite（`rusqlite`，后端） |

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目级治理 | 根目录 `AGENTS.md` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `ai-digital-life/docs/architecture/` |
| 设计系统 | `ai-digital-life/docs/design-system/` |
| IPC 契约 | `ai-digital-life/frontend/src/shared/ipc.ts` |
| 进程边界 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |

## 任务路由

| 任务类型 | 默认检索位置 |
|----------|--------------|
| Rust 后端与 Tauri 命令 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |
| WebView UI 与样式 | `ai-digital-life/frontend/src/` |
| 阶段/路由/治理 | 根目录 `AGENTS.md` |
| 架构设计 | `ai-digital-life/docs/architecture/` |

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)
