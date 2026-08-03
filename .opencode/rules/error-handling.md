---
description: Error handling, loading state, and unified action patterns across frontend and backend
alwaysApply: true
---

# 错误处理与加载状态规范

## 前端 Action 错误处理

### 工具函数（定义在 shared.ts / cacheHelpers.ts）
| 函数 | 定义位置 | 用途 |
|------|----------|------|
| `clearError(get)` | `cacheHelpers.ts` | 在 mutation action 入口清空全局 error |
| `captureError(get, error)` | `cacheHelpers.ts` | 捕获错误（支持 string/Error/{message} 三种格式） |
| `captureTypedError(get, error)` | `cacheHelpers.ts` | 类型化捕获（支持 `AppError` instance、`{code,message}` 对象、普通 Error/string 三级降级） |
| `setError(get, message)` | `cacheHelpers.ts` | 直接设置全局 error 消息 |

### Typed Error Classes（类型化错误类）
前端 `shared/typedErrors.ts` 定义了 16 个 `AppError` 子类（其中 14 个对应 Rust 后端 `AppError` 变体，另 2 个为前端专用：`InvokeError`、`PreviewApiError`），支持 `instanceof` 判断：
- Rust 对应：`NotFoundError`、`InvalidInputError`、`StorageError`、`WorkspaceError`、`ConfigError`、`IOError`、`MigrationError`、`SecurityError`、`ApprovalRequiredError`、`PatchError`、`TerminalError`、`ModelError`、`NetworkError`、`InternalError`（Rust 端另有 `Timeout`、`RateLimit`、`AuthError` 共 17 变体）
- 前端专用：`InvokeError`、`PreviewApiError`
- 通过 `fromIpcErrorCode(code, message)` 工厂函数从 IPC 返回的错误码创建具体错误实例
- 优先使用 `captureTypedError` 替代 `captureError`，以获得更精确的错误类型信息

### Action 规范
- 每个 mutation action 入口第一行调用 `clearError(get)`
- 每个异步调用失败时必须调用 `captureError(get, error)`
- 禁止静默吞下 IPC 错误（`if (!result.ok) return;` 无错误记录）
- 禁止混用不同格式的错误值（IPC `result.error.message` 和中文字符串）

### localStorage 写入规范
- `localStorage` 写入（`writeJson`/`writeNumber`/`writeFlag`）必须捕获 `QuotaExceededError` 等异常
- 捕获的异常至少记录 `console.warn` 日志，禁止空 `catch {}`
- 批量写入函数（如 `batchExpandAll`）的 `Promise.allSettled` 结果必须遍历检查 rejected

## 前端 Loading 状态

### isFetching 模式
- `StoreState` 中定义 `isFetching: Record<string, boolean>`
- 每个 fetch action 入口设置 `isFetching[key] = true`，`finally` 块设回 `false`
- key 命名为函数名，如 `"fetchIndexStatus"`、`"fetchGitStatus"`
- UI 组件按需消费：`useAppStore((s) => s.isFetching["fetchGitStatus"])`

### 特定字段 Loading 规则
- 声明了 `*Loading` 的字段（如 `changePreviewLoading`）必须在异步操作入口设为 `true`，成功/失败均设回 `false`
- 禁止声明了 loading 字段却从不设为 `true`（死代码）

## Rust 后端错误处理

### 错误类型
- 每个 crate 的错误通过 `adl-errors::AppError` 枚举统一
- 禁止在 `Result<_, String>` 中使用裸字符串；使用 `AppError` 变体
- 错误消息对用户友好，包含足够的上下文供调试

### IPC 错误传播
- Tauri Command 返回的 `Result<T, AppError>` 必须被前端正确捕获
- 禁止在后端 panic 而不返回结构化错误
- 关键 IPC 错误记录在后端日志：`tracing::error!` 或 `tracing::warn!`

## Promise.allSettled 规范
- 使用 `Promise.allSettled` 后必须检查 rejected 结果
- 至少记录 `console.warn` 输出所有 rejection reason
- 可恢复的批量刷新失败不阻塞 UI，但需有日志可追踪

## IPC 桥接层契约一致性

### 三端对齐原则
- Tauri bridge：真实实现（`invoke()`）
- Mock bridge：开发/测试模拟（`mock-bridge.ts`）
- Preview bridge：浏览器预览模式（`preview-bridge/index.ts`）

### 一致性检查清单（新增/修改 IPC 方法后）
- [ ] 接口定义在 `shared/ipc/index.ts`（或对应域文件 `shared/ipc/{domain}.ts`）更新
- [ ] 三个桥接层同步实现
- [ ] 返回类型统一为 `IpcResult<T>`
- [ ] 错误类型使用 `AppError` 而非裸 `string`
- [ ] 添加 JSDoc 注释说明功能、参数、返回值
- [ ] 对应测试文件中 mock 同步更新

### 方法签名对齐示例
```ts
// 接口定义（shared/ipc/workspace.ts）
interface WorkspaceBridge {
  reorder(input: ReorderWorkspacesInput): Promise<IpcResult<WorkspaceSummary[]>>;
}

// 三个实现都必须使用相同参数类型
// 不允许：reorder(input: { pinnedIds: string[]; unpinnedIds: string[] })
// 必须使用：reorder(input: ReorderWorkspacesInput)
```

## 禁止项
- 禁止 `try { ... } catch {}` 空 catch 块
- 禁止 `if (!result.ok) return;` 无错误记录
- 禁止 Promise 链中缺少 `.catch()` 处理
- 禁止声明了 loading 字段却从未设为 `true`