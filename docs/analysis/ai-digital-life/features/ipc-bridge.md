# IPC 桥接系统

## 三层桥接架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端应用                                      │
│  Zustand Actions / React Components                                  │
│       │                                                              │
│       ▼                                                              │
│  window.digitalLife.{domain}.{method}(input)                         │
│       │                                                              │
│       ├──→ DigitalLifeBridge 统一接口契约                             │
│              │                                                       │
│    ┌─────────┼─────────────┐                                         │
│    ▼         ▼             ▼                                         │
│ tauri-bridge  preview-bridge  mock-bridge                            │
│ (Tauri 桌面)  (浏览器预览)    (纯内存测试)                            │
│    │            │             │                                       │
│    ▼            ▼             ▼                                       │
│ invoke()    HTTP Fetch    内存模拟                                     │
│ → Rust IPC  → Vite 中间件   → 直接返回 mock 数据                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 三个桥接层对比

| 维度 | tauri-bridge | preview-bridge | mock-bridge |
|------|-------------|----------------|-------------|
| 运行模式 | Tauri 桌面 WebView2 | 浏览器 Vite 开发服务器 | 单元测试 / 开发 |
| 后端 | Rust (Tauri IPC) | Node.js 中间件 | 无后端 |
| 调用方式 | `window.__TAURI__?.invoke()` | HTTP Fetch → Vite 代理 | 直接内存操作 |
| 事件订阅 | `listen()` (Tauri Event) | 轮询 / 模拟 | 直接回调 |
| 文件路径 | `frontend/src/tauri-bridge.ts` | `frontend/src/preview-bridge/` (18 文件) | `frontend/src/mock-bridge.ts` |
| 能力覆盖 | 全部 IPC 方法 | 核心 IPC 方法 + mock 回退 | 全部 IPC 方法 |

## 接口定义层 (`shared/ipc/`)

30 个 IPC 域文件，统一定义 `DigitalLifeBridge` 接口类型：

| 域文件 | 桥接方法名 | 说明 |
|--------|-----------|------|
| `shared.ts` | - | `IpcResult<T>` 类型、`IpcErrorCode` 枚举 (16 个错误码) |
| `app.ts` | `app.*` | 应用信息、偏好设置 |
| `window.ts` | `window.*` | 窗口管理（最大化/最小化/关闭） |
| `workspace.ts` | `workspace.*` | 工作区 CRUD、文件树、文件读写 |
| `retrieval.ts` | `retrieval.*` | 检索快照 |
| `conversation.ts` | `conversation.*` | 会话消息 CRUD |
| `agent.ts` | `agent.*` | Agent 配置、运行 |
| `subagent.ts` | `subagent.*` | 子代理任务 |
| `patch.ts` | `patch.*` | 补丁应用/回滚/决策 |
| `command.ts` | `command.*` | 命令执行 |
| `pty.ts` | `pty.*` | PTY 终端会话 |
| `task.ts` | `task.*` | 任务管理 |
| `run-activity.ts` | `runActivity.*` | 运行活动 |
| `browser.ts` | `browser.*` | 内置浏览器（标签/导航/WebView） |
| `github.ts` | `github.*` | GitHub 集成 |
| `mcp.ts` | `mcp.*` | MCP 服务器管理 |
| `provider.ts` | `provider.*` | AI Provider 管理 |
| `snapshot.ts` | `snapshot.*` | Git 快照创建/列表/恢复 |
| `web_tools.ts` | `webTools.*` | Web 搜索/抓取 |
| `commands_config.ts` | `commandsConfig.*` | 自定义命令配置 |
| `permission.ts` | `permission.*` | 权限规则集 |
| `compaction.ts` | `compaction.*` | 会话压缩 |
| `session_fork.ts` | `sessionFork.*` | 会话 Fork |
| `lsp.ts` | `lsp.*` | LSP 诊断/符号 |
| `reference.ts` | `reference.*` | 引用管理 |
| `plugin.ts` | `plugin.*` | 插件管理 |
| `custom_agent.ts` | `customAgent.*` | 自定义 Agent |
| `durable.ts` | `durable.*` | 持久会话 |
| `reserved.ts` | `reserved.*` | 保留能力（CodeMode/ACP/HTTP API） |
| `digital-life.ts` | (类型聚合) | 合并所有桥接接口为 `DigitalLifeBridge` |
| `index.ts` | - | 统一 re-export 所有域 |

### IpcResult<T> 模式

```typescript
type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

// 所有 IPC 方法统一返回 IpcResult<T>
// 前端 Action 中通过 result.ok 判断成功/失败
```

### 16 个 IpcErrorCode

```typescript
enum IpcErrorCode {
  NOT_FOUND,           // 资源未找到
  INVALID_INPUT,       // 输入参数无效
  STORAGE_ERROR,       // 存储错误
  WORKSPACE_ERROR,     // 工作区错误
  CONFIG_ERROR,        // 配置错误
  IO_ERROR,            // IO 错误
  MIGRATION_ERROR,     // 迁移错误
  SECURITY_ERROR,      // 安全错误
  APPROVAL_REQUIRED,   // 需要审批
  PATCH_ERROR,         // 补丁错误
  TERMINAL_ERROR,      // 终端错误
  MODEL_ERROR,         // 模型错误
  INTERNAL_ERROR,      // 内部错误
  NETWORK_ERROR,       // 网络错误
  INVOKE_ERROR,        // 调用错误
  PREVIEW_API_ERROR,   // 预览 API 错误
}
```

## 类型化错误系统 (`typedErrors.ts`)

### 16 个 AppError 子类

| 类名 | code 字段 | 对应 IpcErrorCode |
|------|-----------|-------------------|
| `NotFoundError` | `NOT_FOUND` | `IpcErrorCode.NOT_FOUND` |
| `InvalidInputError` | `INVALID_INPUT` | `IpcErrorCode.INVALID_INPUT` |
| `StorageError` | `STORAGE_ERROR` | `IpcErrorCode.STORAGE_ERROR` |
| `WorkspaceError` | `WORKSPACE_ERROR` | `IpcErrorCode.WORKSPACE_ERROR` |
| `ConfigError` | `CONFIG_ERROR` | `IpcErrorCode.CONFIG_ERROR` |
| `IOError` | `IO_ERROR` | `IpcErrorCode.IO_ERROR` |
| `MigrationError` | `MIGRATION_ERROR` | `IpcErrorCode.MIGRATION_ERROR` |
| `SecurityError` | `SECURITY_ERROR` | `IpcErrorCode.SECURITY_ERROR` |
| `ApprovalRequiredError` | `APPROVAL_REQUIRED` | `IpcErrorCode.APPROVAL_REQUIRED` |
| `PatchError` | `PATCH_ERROR` | `IpcErrorCode.PATCH_ERROR` |
| `TerminalError` | `TERMINAL_ERROR` | `IpcErrorCode.TERMINAL_ERROR` |
| `ModelError` | `MODEL_ERROR` | `IpcErrorCode.MODEL_ERROR` |
| `InternalError` | `INTERNAL_ERROR` | `IpcErrorCode.INTERNAL_ERROR` |
| `NetworkError` | `NETWORK_ERROR` | `IpcErrorCode.NETWORK_ERROR` |
| `InvokeError` | `INVOKE_ERROR` | `IpcErrorCode.INVOKE_ERROR` |
| `PreviewApiError` | `PREVIEW_API_ERROR` | `IpcErrorCode.PREVIEW_API_ERROR` |

### 工厂函数

```typescript
// 从 IPC 错误码创建具体错误实例
function fromIpcErrorCode(code: string, message: string): AppError

// 使用映射表将字符串码映射到构造器
const errorCodeMap: Record<string, new (detail: string) => AppError> = {
  NOT_FOUND: NotFoundError,
  INVALID_INPUT: InvalidInputError,
  // ... 所有 16 个映射
}
```

## Rust 端 AppError 枚举

定义在 `crates/errors/src/lib.rs`：

```
AppError (Rust enum, thiserror + serde)
├── NotFound(String)
├── InvalidInput(String)
├── Storage(String)
├── Workspace(String)
├── Config(String)
├── Io(String)
├── Migration(String)
├── Security(String)
├── ApprovalRequired(String)
├── Patch(String)
├── Terminal(String)
├── Model(String)
├── Timeout(String)
├── RateLimit(String)
├── AuthError(String)
├── Network(String)
└── Internal(String)
```

### 错误传播路径

```
Rust Command
  → Result<T, AppError>
    → Tauri IPC 序列化
      → frontend 收到 { ok: false, error: { code, message } }
        → captureTypedError(get, error)
          → AppError 子类实例（支持 instanceof 判断）
            → Store 更新 error 字段
              → UI 显示错误 Toast/提示
```

## 前端错误捕获工具 (`cacheHelpers.ts`)

| 函数 | 说明 |
|------|------|
| `clearError(get)` | 在 mutation action 入口清空全局 error |
| `captureError(get, error)` | 捕获错误（支持 string/Error/{message} 三种格式） |
| `captureTypedError(get, error)` | 类型化捕获（支持 AppError instance、IpcResult 错误、普通 Error/string 三级降级） |
| `setError(get, message)` | 直接设置全局 error 消息 |

## 三桥接一致性要求

### 一致性检查清单

每条 IPC 方法变更后必须检查：

- [ ] 接口定义在 `shared/ipc/index.ts`（或对应域文件 `shared/ipc/{domain}.ts`）更新
- [ ] `tauri-bridge.ts` 同步实现（调用 `invoke()`）
- [ ] `preview-bridge/` 同步实现（HTTP 或 mock 回退）
- [ ] `mock-bridge.ts` 同步实现（内存模拟）
- [ ] 返回类型统一为 `IpcResult<T>`
- [ ] 错误类型使用 `AppError` 而非裸 `string`
- [ ] 添加 JSDoc 注释说明功能、参数、返回值
- [ ] 对应测试文件中 mock 同步更新

### 方法签名对齐示例

```typescript
// 接口定义（shared/ipc/workspace.ts）
interface WorkspaceBridge {
  reorder(input: ReorderWorkspacesInput): Promise<IpcResult<WorkspaceSummary[]>>;
}

// 三个实现都必须使用相同参数类型
// tauri-bridge.ts:     invoke('reorder_workspaces', { input })
// preview-bridge.ts:   HTTP POST /api/reorder-workspaces
// mock-bridge.ts:      内存排序后返回
// ❌ 不允许不同桥接层使用不同参数签名
```

## tauri-bridge.ts 详情

```
tauri-bridge.ts
├── 导入: invoke() from @tauri-apps/api/core
│        listen() from @tauri-apps/api/event
│        getCurrentWindow() from @tauri-apps/api/window
├── 实现所有 30 个 IPC 域接口
├── 事件订阅:
│   ├── subscribeTerminalStream()   → listen('terminal-stream')
│   ├── subscribeModelStream()      → listen('model-stream')
│   ├── subscribePtyOutput()        → listen('pty-output')
│   └── subscribeRunActivity()      → listen('run-activity')
├── 错误处理: 所有 invoke 调用用 try/catch 包裹
│   └── 失败返回 { ok: false, error: AppError }
└── 依赖: 仅 Tauri 环境可用 (window.__TAURI__)
```

## preview-bridge/ 详情

18 个文件：

| 文件 | 说明 |
|------|------|
| `index.ts` | 桥接部署入口：组装所有子桥接，注入 `window.digitalLife` |
| `ptyBridge.ts` | PTY 桥接：HTTP polling 到 Vite 中间件 |
| `preview-workspace.ts` | 工作区桥接：localStorage 持久化 |
| `preview-git.ts` | Git 桥接：spawn 子进程调用 git |
| `preview-search.ts` | 搜索桥接：文件系统搜索 |
| `preview-patch.ts` | 补丁桥接：文件系统补丁操作 |
| `preview-conversation.ts` | 会话桥接：localStorage 存储 |
| `preview-command.ts` | 命令桥接：child_process.spawn |
| `preview-task.ts` | 任务桥接（含 CI） |
| `preview-context.ts` | 上下文共享 |
| `preview-model.ts` | 模型流桥接 |
| `preview-window.ts` | 窗口控制桥接 |
| `preview-events.ts` | 文件变更事件桥接 |
| `preview-diagnostic.ts` | 诊断桥接 |
| `preview-storage.ts` | 存储桥接 |
| `preview-browser-audio.ts` | 浏览器音频监控 |
| `api.ts` | HTTP API 客户端 |
| `storage.ts` | localStorage 工具函数 |

## mock-bridge.ts 详情

```
mock-bridge.ts
├── 纯内存模拟: 无后端依赖
├── 完整的 mock 数据工厂（mock-workspace / mock-conversation / mock-patch / ...）
├── 持久化支持: localStorage 序列化/反序列化
├── setMockActiveWorkspace(): 测试用设置工作区
├── 适用场景:
│   ├── 单元测试
│   ├── 开发调试
│   └── 未连接 Tauri 时的预览模式回退
└── 与 preview-bridge 的关系:
    preview-bridge 继承 mockDigitalLifeBridge 作为基础实现
    然后覆盖部分方法（pty/workspace/git/search/conversation/patch/command）
    其余方法直接使用 mock 实现作为 fallback
```

## 文件参考指南

| 路径 | 说明 |
|------|------|
| `frontend/src/shared/ipc/index.ts` | 30 个 IPC 域统一导出 |
| `frontend/src/shared/ipc/shared.ts` | IpcResult<T> 类型 + IpcErrorCode 枚举 |
| `frontend/src/shared/ipc/digital-life.ts` | DigitalLifeBridge 完整接口定义 |
| `frontend/src/shared/ipc/workspace.ts` | 工作区 IPC 接口 |
| `frontend/src/shared/ipc/patch.ts` | 补丁 IPC 接口 |
| `frontend/src/shared/ipc/pty.ts` | PTY IPC 接口 |
| `frontend/src/shared/ipc/conversation.ts` | 会话 IPC 接口 |
| `frontend/src/shared/ipc/agent.ts` | Agent IPC 接口 |
| `frontend/src/shared/ipc/browser.ts` | 浏览器 IPC 接口 |
| `frontend/src/shared/ipc/snapshot.ts` | 快照 IPC 接口 |
| `frontend/src/shared/ipc/app.ts` | 应用 IPC 接口 |
| `frontend/src/shared/ipc/window.ts` | 窗口 IPC 接口 |
| `frontend/src/shared/ipc/command.ts` | 命令 IPC 接口 |
| `frontend/src/shared/typedErrors.ts` | 16 个 AppError 子类 + fromIpcErrorCode 工厂 |
| `frontend/src/tauri-bridge.ts` | Tauri 模式桥接实现 |
| `frontend/src/preview-bridge/index.ts` | 预览模式桥接入口 |
| `frontend/src/preview-bridge/ptyBridge.ts` | 预览模式 PTY 桥接 |
| `frontend/src/preview-bridge/preview-workspace.ts` | 预览模式工作区桥接 |
| `frontend/src/preview-bridge/preview-git.ts` | 预览模式 Git 桥接 |
| `frontend/src/preview-bridge/preview-patch.ts` | 预览模式补丁桥接 |
| `frontend/src/preview-bridge/preview-conversation.ts` | 预览模式会话桥接 |
| `frontend/src/preview-bridge/preview-model.ts` | 预览模式模型桥接 |
| `frontend/src/preview-bridge/preview-command.ts` | 预览模式命令桥接 |
| `frontend/src/mock-bridge.ts` | Mock 模式桥接实现 |
| `frontend/src/app/stores/cacheHelpers.ts` | 错误捕获工具函数 |
| `frontend/src/app/stores/shared.ts` | clearError / captureError / captureTypedError |
| `crates/errors/src/lib.rs` | Rust 端 AppError 枚举定义 |
