---
description: 所有 Tauri 命令必须使用 ipc()/ipc_try() 包装器统一响应格式
globs: ai-digital-life/src-tauri/**/*.rs
alwaysApply: false
---

# Tauri 命令 IPC 包装模式

所有 Tauri 命令必须使用 `src/commands/mod.rs` 中的 `ipc()` 或 `ipc_try()` 包装器，将 `Result<T, AppError>` 统一转为 `IpcResult<T>` 响应信封。

- `ipc(result)` — 直接传入 `Result<T, AppError>`
- `ipc_try(|| ...)` — 包裹闭包返回 `Result<T, AppError>`

`IpcResult` 枚举：
- `Ok { ok: true, data: T }` — 成功
- `Err { ok: false, error: IpcError { code, message } }` — 失败

命令返回 `IpcResult<T>`（而非 `Result<T, CommandError>`），异步命令需额外返回外层 `Result` 以传播非 AppError 错误。

```rust
// 同步命令
#[tauri::command]
fn my_command(state: State<AppState>) -> IpcResult<MyData> {
    ipc(do_something(&state))
}

// 闭包模式
#[tauri::command]
fn my_command(state: State<AppState>) -> IpcResult<MyData> {
    ipc_try(|| do_something(&state))
}

// 异步命令
#[tauri::command]
async fn my_async_command(state: State<'_, AppState>) -> Result<IpcResult<MyData>, CommandError> {
    ipc(do_something_async(&state).await)
        .map_err(|e| CommandError::from(AppError::from(e)))
}
```
