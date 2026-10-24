---
description: Project overview, dual-root structure, tech stack, and source of truth locations
alwaysApply: true
---

# 项目总览

## 项目身份

| 维度 | 说明 |
|------|------|
| 项目名称 | AI 数字生命 (AI Digital Life) |
| 项目类型 | 桌面应用宿主 + 第三方 Agent harness 集成（Agent 对话、模型接入与编排由外部 harness 提供，当前为 deepseek dsh） |
| 桌面框架 | Rust + Tauri 2.x |
| 前端框架 | React 19 + Vite + TypeScript |
| 状态管理 | Zustand（切片合并模式） |
| 包管理 | pnpm（前端）/ Cargo（Rust） |
| 最低版本 | Node.js 24.15+, Rust 1.85+, pnpm 11.x+ |

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：文档、`AGENTS.md`、`docs/development/`、`CONTRIBUTING.md`、`CONTEXT.md`、`SECURITY.md` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |
| `references/` | 外部参考源码（本地拉取的开源项目，供开发参考与复用） |

## 架构层级

```
┌─────────────────────────────────────────────┐
│  Frontend (React 19 + Vite + TypeScript)     │
│  ├─ UI Layer: React 组件 (components/hooks)  │
│  ├─ State Layer: Zustand (slices/actions)    │
│  └─ Bridge Layer: IPC 桥接 (tauri/preview/mock)│
├─────────────────────────────────────────────┤
│  Tauri IPC (invoke / #[tauri::command])      │
├─────────────────────────────────────────────┤
│  Backend (Rust + Tokio)                      │
│  ├─ Tauri Binary: 窗口/命令/capabilities     │
│  ├─ Domain Crates: workspace/command/pty/... │
│  └─ Infrastructure: storage/logger/errors   │
└─────────────────────────────────────────────┘
```

## 双端架构

| 模式 | 引擎 | 终端 | 桥接层 |
|------|------|------|--------|
| Tauri 桌面 | Tauri WebView2 | node-pty (Rust) | tauri-bridge.ts |
| 浏览器预览 | Vite dev server | polling HTTP | preview-bridge/ |
| 开发/测试 | - | mock | mock-bridge.ts |

## 任务路由

| 任务类型 | 默认检索位置 |
|----------|--------------|
| Rust 后端与 Tauri 命令 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |
| WebView UI 与样式 | `ai-digital-life/frontend/src/` |
| 功能模块组件 | `ai-digital-life/frontend/src/app/features/` |
| 设计 Token / 主题 | `ai-digital-life/frontend/src/design-system/`、`src/styles/` |
| 项目形态/路由/治理 | 根目录 `AGENTS.md` |
| 架构设计 | `docs/architecture/` |
| 状态管理 / Store 变更 | `ai-digital-life/frontend/src/app/stores/` |

## 相关文件

- [AGENTS.md](../../AGENTS.md) — 治理规则、编码规范
- [SKILLS.md](../../SKILLS.md) — 技能系统（来源分类、三技能目录、同步规则、技能摘要）
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — 贡献指南
- [GLOSSARY.md](../../GLOSSARY.md) — 领域术语表
- [CONTEXT.md](../../CONTEXT.md) — 架构与实现说明
- [SECURITY.md](../../SECURITY.md) — 安全策略
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md) — 未来想法
- [commands.md](./commands.md) — 常用命令速查
