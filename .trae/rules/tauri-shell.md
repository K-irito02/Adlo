---
description: Tauri Backend/Commands/WebView boundaries, security baseline, and capability allowlist
globs: ai-digital-life/src-tauri/**,ai-digital-life/frontend/**,ai-digital-life/crates/**
alwaysApply: false
---

# Tauri 壳与命令边界

## 安全基线

- `src-tauri/tauri.conf.json` 中 `app.security.csp` 必须显式声明
- `withGlobalTauri` 默认关闭
- WebView 不得直接访问文件系统、子进程、SQLite 或模型密钥
- 禁止 `"all"` / `"**"` 通配权限

## 边界分层

| 层 | 允许 | 禁止 |
|----|------|------|
| Rust Backend | 文件系统、SQLite、模型请求、凭据 | 直接操作 DOM |
| Tauri Commands | 白名单、参数校验、结构化错误 | 宽泛命令、未登记 capability |
| WebView | UI 渲染、状态编排、订阅事件 | 直接访问系统能力 |

## 契约真源

| 文件 | 职责 |
|------|------|
| `frontend/src/shared/ipc.ts` | `DigitalLifeBridge` 类型定义 |
| `src-tauri/src/commands/*.rs` | `#[tauri::command]` 处理 |
| `src-tauri/capabilities/*.json` | Command 白名单 |
| `crates/kernel` | `serde` 契约类型 |
| `frontend/dev/previewWorkspaceService.ts` | 浏览器开发态服务端 API（镜像 Tauri Command 能力） |

## 事件通道

| 通道 | 用途 |
|------|------|
| `digital-life://model-stream` | 模型流式输出 |
| `digital-life://terminal-stream` | 终端流式输出 |
| `digital-life://workspace-file-changed` | 工作区文件变更 |

## 新增命令检查清单

- [ ] 在 `crates/kernel` 增加 `serde` 类型
- [ ] 在 `src-tauri/src/commands/*.rs` 实现 `#[tauri::command]`
- [ ] 在 `capabilities/*.json` 登记 capability
- [ ] 在 `frontend/src/shared/ipc.ts` 对齐桥接契约

## 相关文件

- [frontend/src/shared/ipc.ts](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/shared/ipc.ts)
- [src-tauri/src/commands](/E:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands)
