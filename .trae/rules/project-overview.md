---
description: Project overview, dual-root structure, tech stack, and source of truth locations
alwaysApply: true
---

# 项目总览

## 双根结构

| 根目录 | 职责 | 主要内容 |
|--------|------|----------|
| `notes/` | 规划与治理 | Obsidian 笔记、产品文档、`AGENTS.md`、`docs/development/` |
| `ai-digital-life/` | 实现工作区 | Rust + Tauri 桌面应用 + WebView 前端（`frontend/`） |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust (Cargo workspace) |
| 前端 | React 19 + TypeScript + Vite + Zustand |
| 包管理 | 根 `package.json` 脚本 + `npm --prefix frontend`；Rust 用 `cargo` |
| 测试 | `cargo test`、`npm --prefix frontend`（typecheck / vitest） |
| 持久化 | SQLite（`rusqlite`，后端） |

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目级治理 | 根目录 `AGENTS.md` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `ai-digital-life/docs/architecture/` |
| 设计系统 | `ai-digital-life/docs/design-system/` |
| 开发约束 | `docs/development/` |
| IPC 契约（WebView） | `ai-digital-life/frontend/src/shared/ipc.ts` |
| 前端类型别名 | `ai-digital-life/frontend/src/kernel`（`@ai-digital-life/kernel`） |
| 进程边界与命令 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |

## 任务路由速查

| 任务类型 | 默认检索位置 |
|----------|--------------|
| Rust 后端与 Tauri 命令 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |
| WebView UI 与样式 | `ai-digital-life/frontend/src/` |
| 阶段/路由/治理 | 根目录 `AGENTS.md` + `docs/development/` |
| 架构设计 | `ai-digital-life/docs/architecture/` |

## 随项目演进

- 技术栈版本升级：更新本文件技术栈表格
- 新增主要目录：更新双根结构表格
- 真源位置变化：更新真源定位表格

## 相关文件

- [AGENTS.md](/E:/Programs/Obsidian/notes/AGENTS.md)
- [ai-digital-life/AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
