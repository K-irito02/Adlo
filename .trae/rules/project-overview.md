---
description: Project overview, dual-root structure, tech stack, and source of truth locations
alwaysApply: true
---

# 项目总览

## 双根结构

| 根目录 | 职责 | 主要内容 |
|--------|------|----------|
| `notes/` | 规划与治理 | Obsidian 笔记、产品文档、`AGENTS.md`、`docs/development/` |
| `ai-digital-life/` | 实现工作区 | TypeScript monorepo、Electron 桌面应用 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端框架 | React 19 + TypeScript 5.8 |
| 构建工具 | Vite 6 |
| 包管理 | pnpm 9.15 (workspaces) |
| 测试 | Vitest 3 + Playwright 1.52 |
| 存储 | SQLite (better-sqlite3) |

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目级治理 | 根目录 `AGENTS.md` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `ai-digital-life/docs/architecture/` |
| 设计系统 | `ai-digital-life/docs/design-system/` |
| 开发约束 | `docs/development/` |
| IPC 契约 | `ai-digital-life/apps/desktop/shared/ipc.ts` |

## 任务路由速查

| 任务类型 | 默认检索位置 |
|----------|--------------|
| 实现与 IPC | `ai-digital-life/` |
| 阶段/路由/治理 | 根目录 `AGENTS.md` + `docs/development/` |
| 架构设计 | `ai-digital-life/docs/architecture/` |
| UI/样式 | `ai-digital-life/apps/desktop/renderer/src/design-system/` |

## 随项目演进

- 技术栈版本升级：更新本文件技术栈表格
- 新增主要目录：更新双根结构表格
- 真源位置变化：更新真源定位表格

## 相关文件

- [AGENTS.md](/E:/Programs/Obsidian/notes/AGENTS.md)
- [ai-digital-life/AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
