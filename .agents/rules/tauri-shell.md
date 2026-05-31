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
| `frontend/dev/previewTerminalService.ts` | 浏览器开发态终端服务（镜像 Tauri PTY Command，使用 Node.js `child_process.spawn`） |
| `src-tauri/src/commands/pty_commands.rs` | PTY 终端 `#[tauri::command]`（pty_create / pty_input / pty_resize / pty_kill / pty_list） |

## 事件通道

| 通道 | 用途 |
|------|------|
| `digital-life://model-stream` | 模型流式输出 |
| `digital-life://terminal-stream` | 终端流式输出（旧命令执行） |
| `digital-life://pty-output` | PTY 终端输出（会话对应） |
| `digital-life://workspace-file-changed` | 工作区文件变更 |
| `digital-life://browser-url-changed` | 浏览器 WebView URL 变更（Tauri 模式，通过 `on_navigation` 回调） |

## 新增命令检查清单

- [ ] 在 `crates/kernel` 增加 `serde` 类型
- [ ] 在 `src-tauri/src/commands/*.rs` 实现 `#[tauri::command]`
- [ ] 在 `capabilities/*.json` 登记 capability
- [ ] 在 `frontend/src/shared/ipc.ts` 对齐桥接契约
- [ ] 在 `mock-bridge.ts` 和 `preview-bridge/` 同步实现浏览器模式对等方法
- [ ] 在 `previewWorkspaceService.ts` 或 `previewTerminalService.ts` 同步实现浏览器开发态服务端 API

## 双端一致性

所有功能必须在 Tauri 桌面应用和浏览器模式下共同可用。

| 机制 | 用途 |
|------|------|
| `isTauriShell()` | 运行时检测当前 shell 环境 |
| `document.documentElement.dataset.shell` | CSS 可通过 `[data-shell="tauri"]` / `[data-shell="browser"]` 适配 |
| `preview-bridge/` | 浏览器模式通过 Vite Preview API 镜像 Tauri Command 能力 |
| `mock-bridge.ts` | 纯内存回退，preview-bridge/ 的基础层 |

### 允许的平台差异

- 窗口控制按钮：Tauri 和浏览器均显示（Tauri 可实际执行窗口操作，浏览器为无操作 UI）
- 窗口拖拽区域：Tauri 启用 `-webkit-app-region: drag`，浏览器禁用
- 目录选择器：Tauri 用原生对话框，浏览器用 Vite Preview API
- 窗口图标：Tauri 同步，浏览器跳过

### 新增功能必须检查

- [ ] Tauri 和浏览器模式下功能是否一致？
- [ ] `isTauriShell()` 条件分支是否有浏览器等效替代？
- [ ] CSS Tauri 专属属性是否有浏览器降级？

## IPC/Bridge 架构规范

### Bridge 接口设计
- `DigitalLifeBridge` 接口必须按领域拆分为命名子接口（参考 13 个子接口）
- 子接口按功能分组: `workspace`, `conversation`, `patch`, `git`, `search`, `task`, `command`, `pty`, `model`, `window`, `events`, `storage`, `diagnostic`
- 每个子接口新增方法时，必须在 3 个实现层同步:
  1. Tauri Bridge (`tauri-bridge.ts`)
  2. Preview Bridge (`preview-bridge/`)
  3. Mock Bridge (`mock-bridge.ts` + `mock/` 子模块)

### Bridge 文件组织
- Preview Bridge: `index.ts`(组合) + `api.ts`(HTTP) + `storage.ts`(localStorage) + `ptyBridge.ts`(轮询/SSE)
- Mock Bridge: `shared.ts`(共享状态) + per-domain mock 文件 (`mock-workspace.ts`, `mock-conversation.ts`, ...)
- 单个 bridge 文件 > 600 行时，按上述模式拆分

### PTY 终端规范
- PTY 进程生命周期由 `adl-pty` crate 管理（非 Tauri Command 层）
- 前端 PTY 输出通过轮询（浏览器模式）或事件通道（Tauri 模式）获取
- 终端会话切换时必须正确恢复缓存输出、调整大小、滚动到底部

## 相关文件

- [frontend/src/shared/ipc.ts](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/shared/ipc.ts)
- [src-tauri/src/commands](/E:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands)
