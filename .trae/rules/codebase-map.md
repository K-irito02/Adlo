---
description: Codebase map, packages list, directory structure, and indexing strategy
globs: ai-digital-life/**/*
alwaysApply: false
---

# 代码地图

## 顶层结构

```
ai-digital-life/
├── apps/desktop/     # Electron 桌面应用
├── packages/         # 共享包
├── workers/          # Worker 线程
├── docs/             # 架构与设计文档
└── tests/            # 测试文件
```

## 应用层 (`apps/desktop/`)

| 目录 | 进程 | 职责 |
|------|------|------|
| `main/` | Main (Node) | 系统能力、IPC 处理、存储、命令执行 |
| `preload/` | Preload | 桥接层、API 白名单暴露 |
| `renderer/` | Renderer (React) | UI 渲染、状态管理、用户交互 |
| `shared/` | 共享 | IPC 类型契约 (`ipc.ts`) |

## 包层 (`packages/`)

| 区域 | 包名 | 职责 |
|------|------|------|
| 核心 | `kernel` | 契约与常量 |
| 持久化 | `storage` | SQLite 封装 |
| 持久化 | `migration` | 数据库迁移 |
| 基础设施 | `config` | 配置管理 |
| 基础设施 | `logger` | 日志系统 |
| 基础设施 | `errors` | 错误处理 |
| 基础设施 | `events` | 事件系统 |
| 桌面支撑 | `workspace` | 工作区管理 |
| 桌面支撑 | `fs-ops` | 文件系统操作 |
| 任务 | `task` | 任务治理与审批 |
| AI 能力 | `model-gateway` | 模型网关 |
| AI 能力 | `agent-runtime` | Agent 运行时 |
| AI 能力 | `conversation` | 对话管理 |
| AI 能力 | `context-engine` | 上下文引擎 |
| AI 能力 | `prompt-engine` | Prompt 引擎 |
| AI 能力 | `change-engine` | 变更引擎 |
| AI 能力 | `terminal` | 终端集成 |
| AI 能力 | `editor` | 编辑器集成 |

## Worker 层 (`workers/`)

| 目录 | 职责 |
|------|------|
| `health/` | 检索 Worker（与 Main 线程隔离） |

## 测试目录 (`tests/`)

| 目录 | 职责 |
|------|------|
| `unit/` | 单元测试 |
| `integration/` | 集成测试 |

## 索引策略

1. **定位入口**：业务逻辑 → `packages/*`，进程边界 → `apps/desktop/*`
2. **类型契约**：跨包类型以 `@ai-digital-life/kernel` 导出为准
3. **架构引用**：`docs/architecture/system-overview.md`

## 随项目演进

- 新增 package：更新包层表格
- 重命名/删除 package：同步更新表格
- 新增 Worker：更新 Worker 层表格
- 目录结构调整：更新顶层结构图

## 相关文件

- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
- [ai-digital-life/AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
