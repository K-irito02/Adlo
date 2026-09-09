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
| `frontend/src/shared/ipc/digital-life.ts` | `DigitalLifeBridge` 类型定义（域拆分为 26 个子接口，见 `shared/ipc/*.ts`） |
| `src-tauri/src/commands/*.rs` | `#[tauri::command]` 处理 |
| `src-tauri/capabilities/*.json` | Command 白名单 |
| `crates/kernel` | `serde` 契约类型 |
| `frontend/dev/previewWorkspaceService.ts` | 浏览器开发态服务端 API（镜像 Tauri Command 能力） |
| `frontend/dev/previewTerminalService.ts` | 浏览器开发态终端服务（镜像 Tauri PTY Command，使用 Node.js `child_process.spawn`） |
| `src-tauri/src/commands/pty_commands.rs` | PTY 终端 `#[tauri::command]`（pty_create / pty_input / pty_resize / pty_kill / pty_list） |
| `crates/pty/` | PTY 进程管理（伪终端生命周期、Shell 解析、会话管理） |

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
- [ ] 在 `frontend/src/shared/ipc/index.ts` 对齐桥接契约
- [ ] 在 `mock-bridge.ts` 和 `preview-bridge/` 同步实现浏览器模式对等方法
- [ ] 在 `previewWorkspaceService.ts` 或 `previewTerminalService.ts` 同步实现浏览器开发态服务端 API

## Tauri 命令 async 规范

**所有涉及 I/O 的 Tauri 命令必须使用 `async fn` + `spawn_blocking` 模式**，禁止在主线程执行文件系统遍历、git 子进程、数据库查询等阻塞操作。

### 原因

Tauri v2 的同步 `#[tauri::command] fn` 在主线程（tao 事件循环）上执行。若命令执行耗时操作（文件 I/O、git 子进程、数据库查询），tao 事件循环被阻塞 → Windows 消息队列停止处理 → 窗口"未响应"。

### 标准模式

```rust
// ❌ 错误：同步命令阻塞主线程
#[tauri::command]
pub fn workspace_list_tree(state: tauri::State<'_, AppState>) -> IpcResult<Vec<WorkspaceTreeNode>> {
    ipc(adl_workspace::list_tree(...))
}

// ✅ 正确：async + spawn_blocking 将 I/O 移到阻塞线程池
#[tauri::command]
pub async fn workspace_list_tree(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<IpcResult<Vec<WorkspaceTreeNode>>, AppError> {
    let state = app.state::<AppState>();
    let path = /* resolve path */;
    let tree = tokio::task::spawn_blocking(move || adl_workspace::list_tree(path.as_path()))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(tree)))
}
```

### 判断标准

| 操作类型 | 是否必须 async |
|----------|---------------|
| 文件系统遍历 (`list_tree`, `read_dir`) | 必须 |
| git 子进程调用 | 必须 |
| 数据库读写（SQLite 通过 r2d2 pool） | 必须 |
| 网络请求 | 必须 |
| 仅内存读写（Mutex/RwLock、Atomic 操作） | 可选 |
| Emit 事件 | 可选 |

### 已修复命令（2026-07-14）

| 命令 | 文件 | 修复前 |
|------|------|--------|
| `workspace_list_tree` | `commands/workspace.rs` | `pub fn` |
| `workspace_list_git_branches` | `commands/workspace_git.rs` | `pub fn` |
| `command_list_recent` | `commands/command.rs` | `pub fn` |
| `task_list_audit_entries` | `commands/task.rs` | `pub fn` |

参考：[tauri-sync-command-blocking-2026-07-14.md](../../docs/knowledge-base/tauri-backend/tauri-sync-command-blocking-2026-07-14.md)

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
- `DigitalLifeBridge` 接口必须按领域拆分为命名子接口（当前 26 个：`window`, `app`, `workspace`, `retrieval`, `conversation`, `agent`, `subagent`, `mcp`, `patch`, `provider`, `command`, `pty`, `task`, `run-activity`, `browser`, `github`, `snapshot`, `web-tools`, `commands-config`, `permission`, `compaction`, `session-fork`, `lsp`, `reference`, `durable`, `custom-agent`）
- 每个子接口对应 `shared/ipc/{domain}.ts` 一个域文件，新增域时同步增加子接口与文件
- 每个子接口新增方法时，必须在 3 个实现层同步:
  1. Tauri Bridge (`tauri-bridge.ts`)
  2. Preview Bridge (`preview-bridge/`)
  3. Mock Bridge (`mock-bridge.ts` + `mock/` 子模块)

### Bridge 文件组织
- 命名约定：`<bridge>-<domain>.ts`（`index.ts` 作为目录入口豁免）
- Tauri Bridge: `index.ts`(组合) + per-domain `tauri-<domain>.ts`（如 `tauri-workspace.ts`、`tauri-shared.ts`）
- Preview Bridge: `index.ts`(组合) + `preview-storage.ts`(localStorage) + `preview-pty-bridge.ts`(轮询/SSE) + per-domain `preview-<domain>.ts`（`preview-api.ts` 已迁移至 `shared/ipc/preview-api.ts`）
- Mock Bridge: `mock-bridge.ts`(组合) + `mock-shared.ts`(共享状态) + per-domain `mock-<domain>.ts`（如 `mock-workspace.ts`、`mock-conversation.ts`）
- 单个 bridge 文件 > 600 行时，按上述模式拆分

### PTY 终端规范
- PTY 进程生命周期由 `adl-pty` crate 管理（非 Tauri Command 层）
- 前端 PTY 输出通过轮询（浏览器模式）或事件通道（Tauri 模式）获取
- 终端会话切换时必须正确恢复缓存输出、调整大小、滚动到底部

## 相关文件

- [frontend/src/shared/ipc/](../../ai-digital-life/frontend/src/shared/ipc) — DigitalLifeBridge 类型契约（域拆分）
- [src-tauri/src/commands](../../ai-digital-life/src-tauri/src/commands)