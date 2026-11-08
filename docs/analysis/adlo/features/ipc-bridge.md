# IPC 桥接系统

> 实现快照（细节以源码为准）；规范见 `.agents/rules/tauri-shell.md`、`bridge-four-implementation-pattern.md`。

## 四端桥接架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端应用                                      │
│  Zustand Actions / React Components                                  │
│       │                                                              │
│       ▼                                                              │
│  window.digitalLife.{domain}.{method}(input)                         │
│       │                                                              │
│       ▼                                                              │
│  DigitalLifeBridge 统一接口契约                                      │
│       │                                                              │
│    ┌──┼───────────┬─────────────┐                                    │
│    ▼  ▼           ▼             ▼                                    │
│ tauri preview  httpBridge  mock-bridge                               │
│ inv() ...http   fetch()     内存模拟                                  │
│ → Rust  → ad-server（浏览器/预览基底实现）  → 直接返回 mock 数据        │
└─────────────────────────────────────────────────────────────────────┘
```

## 四个桥接实现对比

| 维度 | tauri-bridge | preview-bridge | httpBridge | mock-bridge |
|------|-------------|----------------|------------|-------------|
| 运行模式 | Tauri 桌面 WebView | 浏览器（Vite + adl-server 真实后端） | 任意环境（ad-server HTTP API 基底实现） | 单元测试 / 开发 |
| 后端 | Rust (Tauri IPC) | adl-server（http 优先，可回退） | ad-server HTTP（fetch，`IpcResult` 包络） | 无后端 |
| 调用方式 | `invoke()`（经 `...http` 继承其 HTTP 域的同步语义） | HTTP Fetch（spread 自 http + 显式 override） | `fetch()` 直连 `crates/server` 的 `/` 路由 | 直接内存操作 |
| 事件订阅 | `listen()` (Tauri Event) | 轮询 / 模拟 / SSE | ad-server SSE `/event`（EventSource）+ `/pty` WebSocket | 直接回调 |
| 文件路径 | `tauri-bridge/index.ts`（组装，9 个域实现 + `tauri-shared.ts`） | `preview-bridge/`（12 实现文件 + 入口 `index.ts`） | `httpBridge.ts`（入口）+ `httpBridge/__tests__/` | `mock-bridge.ts`（入口 + `mock/` 按域模块） |
| 能力覆盖 | 全部 IPC 方法 | 真实等效（非空实现）+ 回退 mock | 业务域全部 1:1 映射 `crates/server/src/router.rs`；系统域无路由（类型化回退） | 全部 IPC 方法 |

> `tauri-bridge` 以 `...http`（`createHttpBridge`）为基底继承 HTTP 域实现（同步返回方法的 `@see` 注释应写明"`...http` 继承"）；`preview-bridge` 在 spread 之后显式 override 回退行为；新增域时三端按 `adding-an-ipc-domain.md` 的四端清单接线，缺一即双端不一致。

## 接口定义层 (`shared/ipc/`，数量以目录实测为准)

| 域文件 | 说明 |
|--------|------|
| `shared.ts` | `IpcResult<T>` 类型、`IpcErrorCode` 枚举 |
| `app.ts` | 应用信息、偏好设置 |
| `window.ts` | 窗口管理 |
| `workspace.ts` | 工作区 CRUD、文件树、文件读写 |
| `workspace-events-ws.ts` | 工作区事件（WebSocket） |
| `retrieval.ts` | 检索快照 |
| `patch.ts` | 补丁应用/回滚/决策 |
| `pty.ts` / `pty-ws.ts` | PTY 终端会话（含 WebSocket 通道） |
| `browser.ts` | 内置浏览器（标签/导航/WebView） |
| `github.ts` | GitHub 集成 |
| `snapshot.ts` | 快照创建/列表/恢复 |
| `clipboard.ts` | 剪贴板 |
| `dsh.ts` | dsh 宿主集成 |
| `durable.ts` | 持久会话 |
| `download.ts` | 下载 |
| `storage.ts` | 存储（locator/迁移/预检） |
| `reference.ts` | 引用管理 |
| `reserved.ts` | 保留能力 |
| `searchWindow.ts` / `searchIgnore.ts` | 检索分页窗口 / 检索忽略规则 |
| `system_monitor.ts` | 系统监视器 |
| `preview-api.ts` | 预览 API 类型 |
| `digital-life.ts` | 合并所有桥接接口为 `DigitalLifeBridge` |
| `index.ts` | 统一 re-export 所有域 |

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

16 个 AppError 子类（14 个对应 Rust `AppError` 变体 + `InvokeError`、`PreviewApiError` 两个前端专用），`fromIpcErrorCode(code, message)` 工厂映射，支持 `instanceof` 判断。详见 `CONTEXT.md`（Typed Error Classes）。

## Rust 端 AppError 枚举

定义在 `crates/errors/src/lib.rs`（thiserror + serde 派生，约 17 个变体，含 NotFound/InvalidInput/Storage/Workspace/Config/Io/Migration/Security/ApprovalRequired/Patch/Terminal/Timeout/RateLimit/AuthError/Network/Internal 等）。

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

## 四端桥接一致性要求

### 一致性检查清单

每条 IPC 方法变更后必须检查：

- [ ] 接口定义在 `shared/ipc/index.ts`（或对应域文件 `shared/ipc/{domain}.ts`）更新
- [ ] `httpBridge.ts` 同步实现（fetch 直连 ad-server，业务域 1:1）
- [ ] `tauri-bridge/` 同步实现（系统域调用 `invoke()`；业务域经 `...http` 继承，仅 override 系统域）
- [ ] `preview-bridge/` 同步实现（HTTP 真实等效，禁空实现）
- [ ] `mock-bridge.ts` + `mock/` 同步实现（内存模拟）
- [ ] 返回类型统一为 `IpcResult<T>`
- [ ] 错误类型使用 `AppError` 而非裸 `string`
- [ ] 添加 JSDoc 注释说明功能、参数、返回值
- [ ] 对应测试文件中 mock 同步更新

### 方法签名对齐示例

```typescript
// 接口定义（shared/ipc/workspace.ts）
interface WorkspaceBridge {
  listTreeForWorkspace(
    workspacePath: string,
    options?: { force?: boolean },
  ): Promise<IpcResult<WorkspaceTreeNode[]>>;
}

// 四端实现都必须使用相同参数类型
// ❌ 不允许不同桥接层使用不同参数签名
```

## tauri-bridge/ 详情

```
tauri-bridge.ts（入口，重导出 tauri-bridge/index）
tauri-bridge/
├── index.ts            # 组装入口（createTauriBridge）
├── tauri-app.ts        # 应用域
├── tauri-browser.ts    # 浏览器域
├── tauri-dsh.ts        # dsh 域
├── tauri-env.ts        # 环境依赖域
├── tauri-file-save.ts  # 文件保存域
├── tauri-opencode.ts   # opencode 域
├── tauri-reserved.ts   # 保留域
├── tauri-shared.ts     # 共享
├── tauri-window.ts     # 窗口域
└── tauri-workspace.ts  # 工作区域
```

- 调用 `invoke()` + `listen()`（Tauri Event 订阅），失败返回 `{ ok: false, error: AppError }`
- 仅 Tauri 环境可用（`window.__TAURI__`）

## preview-bridge/ 详情

12 个实现文件：

| 文件 | 说明 |
|------|------|
| `index.ts` | 桥接部署入口：组装所有子桥接，`preferHttpWhenReachable`（http 优先，可回退） |
| `preview-pty-bridge.ts` | PTY 桥接（轮询，1000ms） |
| `preview-workspace.ts` | 工作区桥接 |
| `preview-git.ts` | Git 桥接 |
| `preview-search.ts` | 搜索桥接 |
| `preview-patch.ts` | 补丁桥接 |
| `preview-window.ts` | 窗口控制桥接 |
| `preview-events.ts` | 文件变更事件桥接 |
| `preview-diagnostic.ts` | 诊断桥接 |
| `preview-storage.ts` | 存储桥接（与 Tauri `storage_*` 对齐，`restartApp` 返回 NOT_SUPPORTED） |
| `preview-file-save.ts` | 文件保存桥接 |
| `preview-browser-audio.ts` | 浏览器音频监控 |
| `preview-reachability.ts` | 后端可达性探测（`app` 域失败即失败，不静默回退） |

## mock-bridge.ts 详情

```
mock-bridge.ts（入口）
mock/                   # 按域模块（mock-app/mock-browser/mock-workspace/mock-storage/… + mock-shared* 共享）
```

- 纯内存模拟，无后端依赖；适用单元测试与开发调试
- preview-bridge 以 mock 实现为回退基础，覆盖部分方法的真实等效实现

## 文件参考指南

| 路径 | 说明 |
|------|------|
| `frontend/src/shared/ipc/index.ts` | IPC 域统一导出（DigitalLifeBridge，数量以目录实测为准） |
| `frontend/src/shared/ipc/shared.ts` | IpcResult<T> 类型 + IpcErrorCode 枚举 |
| `frontend/src/shared/typedErrors.ts` | 类型化错误类 + fromIpcErrorCode 工厂 |
| `frontend/src/tauri-bridge.ts` | Tauri 模式桥接入口 |
| `frontend/src/preview-bridge/index.ts` | 预览模式桥接入口 |
| `frontend/src/httpBridge.ts` | HTTP 基底实现入口（业务域 1:1 映射 ad-server） |
| `frontend/src/mock-bridge.ts` | Mock 模式桥接入口 |
| `frontend/src/app/stores/cacheHelpers.ts` | 错误捕获工具函数 |
| `crates/errors/src/lib.rs` | Rust 端 AppError 枚举定义 |
