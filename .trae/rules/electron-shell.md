---
description: Electron Main/Preload/Renderer boundaries, security baseline, and IPC allowlist
globs: ai-digital-life/apps/desktop/**/*
alwaysApply: false
---

# Electron 壳与 IPC

## 安全基线（不可降级）

| 配置项 | 值 | 原因 |
|--------|-----|------|
| `contextIsolation` | `true` | 隔离 Renderer 与 Preload |
| `sandbox` | `true` | 限制 Renderer 权限 |
| `nodeIntegration` | `false` | 禁止 Renderer 直接访问 Node |

## 进程边界

| 进程 | 允许的能力 | 禁止的能力 |
|------|-----------|-----------|
| Main | fs、child_process、sqlite、模型 fetch、密钥 | 直接操作 DOM |
| Preload | 暴露白名单 API | 直接访问系统资源 |
| Renderer | UI 渲染、状态管理 | fs、child_process、sqlite、模型 fetch、密钥 |

## IPC 契约真源

| 文件 | 职责 |
|------|------|
| `apps/desktop/shared/ipc.ts` | 类型定义 (`DigitalLifeBridge`) |
| `apps/desktop/preload/index.ts` | API 实现 |
| `apps/desktop/main/index.ts` | `ipcMain.handle` 处理 |

## 订阅类通道（版本化载荷）

| 通道名 | 用途 | 载荷类型 |
|--------|------|----------|
| `digitalLife:modelStream` | 模型流式输出 | `DigitalLifeModelStreamEventV1` |
| `digitalLife:terminalStream` | 终端流式输出 | `DigitalLifeTerminalStreamEventV1` |
| `workspace:fileChanged` | 工作区文件变更 | 文件变更事件 |

## 新增 IPC 通道检查清单

- [ ] 在 `shared/ipc.ts` 添加类型定义
- [ ] 在 `preload/index.ts` 实现 API
- [ ] 在 `main/index.ts` 添加 `ipcMain.handle`
- [ ] 更新本规则通道表格
- [ ] 如有 Renderer mock，同步更新

## 密钥与审计

- API Key、模型请求体敏感部分：**仅 Main 进程**
- 审计日志写入 `storage`，不在 Renderer 记录密钥原文

## 随项目演进

- 新增 IPC 通道：更新订阅类通道表格 + 检查清单
- 安全配置变更：更新安全基线表格（需评审）
- 进程边界变化：更新进程边界表格

## 相关文件

- [apps/desktop/shared/ipc.ts](/E:/Programs/Obsidian/notes/ai-digital-life/apps/desktop/shared/ipc.ts)
- [apps/desktop/preload/index.ts](/E:/Programs/Obsidian/notes/ai-digital-life/apps/desktop/preload/index.ts)
- [apps/desktop/main/index.ts](/E:/Programs/Obsidian/notes/ai-digital-life/apps/desktop/main/index.ts)
