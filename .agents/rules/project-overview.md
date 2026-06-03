---
description: Project overview, dual-root structure, tech stack, and source of truth locations
alwaysApply: true
---

# 项目总览

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：文档、`AGENTS.md`、`docs/development/` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |

## 任务路由

| 任务类型 | 默认检索位置 |
|----------|--------------|
| Rust 后端与 Tauri 命令 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |
| WebView UI 与样式 | `ai-digital-life/frontend/src/` |
| 功能模块组件 | `ai-digital-life/frontend/src/app/features/` |
| 设计 Token / 主题 | `ai-digital-life/frontend/src/design-system/`、`src/styles/` |
| 阶段/路由/治理 | 根目录 `AGENTS.md` |
| 架构设计 | `docs/architecture/` |
| 状态管理 / Store 变更 | `ai-digital-life/frontend/src/app/stores/` |

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)
