# Clone Reduction + Test Coverage + Package Fix 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 3 处可避免的 Rust `.clone()` 调用 + 将 `@types/*` 从 `dependencies` 移至 `devDependencies` + 为 Tauri 命令层添加首个单元测试覆盖。

**Architecture:** 三项独立子任务：(1) package.json 微调，(2) Rust `task.rs` 中 `serde_json::from_value(params.clone())` 改为 `std::mem::take` 避免克隆，(3) 为 `ipc()`、`app_error_to_code()`、`deserialize_command()` 添加单元测试，所有测试使用现有 crate 测试惯例（内联 `#[cfg(test)] mod tests`）。

**Tech Stack:** Rust + Tauri 2.x / TypeScript + pnpm

**文件变更总览：**
| 操作 | 文件 |
|------|------|
| 修改 | `frontend/package.json` |
| 修改 | `src-tauri/src/commands/task.rs`（2 处） |
| 修改 | `src-tauri/src/commands/mod.rs`（添加测试模块） |
| 修改 | `src-tauri/src/error.rs`（添加测试模块） |

---

### Task 1: Fix package.json — 将 `@types/*` 移至 devDependencies

**Files:**
- Modify: `frontend/package.json`（第 42-43 行）

**问题**：`@types/markdown-it` 和 `@types/react-window` 是编译时类型声明，不应在生产依赖中。它们不会被 `vite build` 打包，但放在 `dependencies` 中会在 `pnpm install --prod` 或某些静态分析工具中引起混乱。

- [ ] **Step 1: 读取 package.json 确认当前依赖位置**

Run: `Select-String -Path "frontend/package.json" -Pattern '"@types/markdown-it"|"@types/react-window"'`
Expected: 行号在 `"dependencies": {` 区域内

- [ ] **Step 2: 将 @types/markdown-it 从 dependencies 移至 devDependencies**

编辑 `frontend/package.json`：

找到 `dependencies` 节：
```json
    "@types/markdown-it": "^14.1.2",
    "@types/react-window": "^1.8.8",
```

将其剪切到 `devDependencies` 节（按字母序插入，确保 JSON 语法正确——注意 dependencies 节末尾需要去掉多余的逗号，如果这两个是 dependencies 的最后两项）。

- [ ] **Step 3: 验证 pnpm install 不报错**

Run: `cd frontend && pnpm install --frozen-lockfile 2>&1 | Select-String -Pattern "error|ERR"`（若 lockfile 已更新则允许 `pnpm install` 更新 lockfile）

Expected: 无错误输出

- [ ] **Step 4: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: 提交**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore: move @types/markdown-it and @types/react-window to devDependencies"
```

---

### Task 2: 消除 task.rs 中可避免的 `.clone()` 调用

**Files:**
- Modify: `src-tauri/src/commands/task.rs`（第 240-246 行 + 第 268-271 行）

**问题**：
1. `maybe_execute_approved_command` 中 `deserialize_command(&operation.params)` 内部对 `params` 执行 `.clone()`（第 269-270 行），因为 `serde_json::from_value` 要求所有权。由于 `task: &mut TaskRecord`，`operation` 可通过 `first_mut()` 获得可变引用，然后使用 `std::mem::take` 零拷贝获得 `params` 所有权。

- [ ] **Step 1: 读取当前代码确认上下文**

Read: `src-tauri/src/commands/task.rs` 第 234-271 行

确认当前代码：
```rust
async fn maybe_execute_approved_command(
    app: &tauri::AppHandle,
    state: &AppState,
    task: &mut TaskRecord,
) -> Result<(), AppError> {
    let Some(operation) = task.operations.first() else {  // 不可变引用
        return Ok(());
    };
    if operation.kind != "command.run" {
        return Ok(());
    }
    let request: CommandRequest = deserialize_command(&operation.params)?;  // 内部 clone
    ...
}

fn deserialize_command(params: &serde_json::Value) -> Result<CommandRequest, AppError> {
    Ok(serde_json::from_value(params.clone())?)  // 这行是浪费的 clone
}
```

- [ ] **Step 2: 修改 deserialize_command 为按值接收**

修改 `deserialize_command` ：
```rust
/// 反序列化命令参数（按值接收以避免调用处克隆）
fn deserialize_params(params: serde_json::Value) -> Result<CommandRequest, AppError> {
    Ok(serde_json::from_value(params)?)
}
```

函数重命名为 `deserialize_params` 以强调其按值语义。

- [ ] **Step 3: 修改调用处使用 first_mut + std::mem::take**

将第 240-246 行：
```rust
    let Some(operation) = task.operations.first() else {
        return Ok(());
    };
    if operation.kind != "command.run" {
        return Ok(());
    }
    let request: CommandRequest = deserialize_command(&operation.params)?;
```

修改为：
```rust
    let Some(operation) = task.operations.first_mut() else {
        return Ok(());
    };
    if operation.kind != "command.run" {
        return Ok(());
    }
    let request: CommandRequest = deserialize_params(std::mem::take(&mut operation.params))?;
```

语义安全：当执行到此处时，`operation` 的 `params` 已消费完毕，用 `Value::Null` 替换不会影响后续逻辑。

- [ ] **Step 4: 验证 cargo build 通过**

Run: `cargo build --workspace 2>&1 | Select-String -Pattern "^error"` 
Expected: 无 error 输出

- [ ] **Step 5: 验证 cargo clippy 无新警告**

Run: `cargo clippy --workspace --all-targets 2>&1`
Expected: 无新增 warnings（预存在的 `windows_compat.rs` 4 条不计）

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands/task.rs
git commit -m "perf: eliminate .clone() in deserialize_command via std::mem::take"
```

---

### Task 3: 添加命令层单元测试

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`（添加 `#[cfg(test)] mod tests`）
- Modify: `src-tauri/src/error.rs`（添加 `#[cfg(test)] mod tests`）
- Modify: `src-tauri/src/commands/task.rs`（添加 `#[cfg(test)] mod tests`）

遵循代码库测试惯例：每个文件末尾添加 `#[cfg(test)] mod tests { use super::*; }`，与 `crates/errors/src/lib.rs` 模式一致。

#### 子任务 3a: error.rs — 测试 app_error_to_code 和 IpcErrorCode::Display

- [ ] **Step 1: 在 error.rs 末尾添加测试模块**

在 `src-tauri/src/error.rs` 最后（第 107 行后）添加：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_to_code_maps_all_variants() {
        let cases = vec![
            (AppError::NotFound("x".into()), IpcErrorCode::NotFound),
            (AppError::InvalidInput("x".into()), IpcErrorCode::InvalidInput),
            (AppError::Storage("x".into()), IpcErrorCode::StorageError),
            (AppError::Workspace("x".into()), IpcErrorCode::WorkspaceError),
            (AppError::Config("x".into()), IpcErrorCode::ConfigError),
            (AppError::Io("x".into()), IpcErrorCode::IoError),
            (AppError::Migration("x".into()), IpcErrorCode::MigrationError),
            (AppError::Security("x".into()), IpcErrorCode::SecurityError),
            (AppError::ApprovalRequired("x".into()), IpcErrorCode::ApprovalRequired),
            (AppError::Patch("x".into()), IpcErrorCode::PatchError),
            (AppError::Terminal("x".into()), IpcErrorCode::TerminalError),
            (AppError::Model("x".into()), IpcErrorCode::ModelError),
            (AppError::Timeout("x".into()), IpcErrorCode::Timeout),
            (AppError::RateLimit("x".into()), IpcErrorCode::RateLimit),
            (AppError::AuthError("x".into()), IpcErrorCode::AuthError),
            (AppError::Internal("x".into()), IpcErrorCode::InternalError),
        ];
        for (err, expected) in cases {
            assert_eq!(app_error_to_code(&err), expected, "mismatch for {err}");
        }
    }

    #[test]
    fn ipc_error_code_display_formats_correctly() {
        assert_eq!(IpcErrorCode::NotFound.to_string(), "NOT_FOUND");
        assert_eq!(IpcErrorCode::InternalError.to_string(), "INTERNAL_ERROR");
        assert_eq!(IpcErrorCode::AuthError.to_string(), "AUTH_ERROR");
    }

    #[test]
    fn command_error_from_app_error_contains_message() {
        let err = CommandError::from(AppError::NotFound("workspace".into()));
        assert_eq!(err.code, IpcErrorCode::NotFound);
        assert!(err.message.contains("workspace"));
    }

    #[test]
    fn command_error_display_format() {
        let err = CommandError::from(AppError::InvalidInput("bad param".into()));
        let display = err.to_string();
        assert!(display.starts_with("[INVALID_INPUT]"));
        assert!(display.contains("bad param"));
    }
}
```

- [ ] **Step 2: 运行 error.rs 的测试**

Run: `cargo test -p ai-digital-life --lib error::tests 2>&1 | Select-String -Pattern "error::tests"`
Expected: `ok` — 4 passed

#### 子任务 3b: mod.rs — 测试 ipc() 和 ipc_try()

- [ ] **Step 3: 在 commands/mod.rs 末尾添加测试模块**

在 `src-tauri/src/commands/mod.rs` 最后（第 75 行后）添加：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::IpcResult;

    #[test]
    fn ipc_ok_wraps_data() {
        let result: IpcResult<i32> = ipc(Ok(42));
        assert!(result.ok);
        assert_eq!(result.data, Some(42));
        assert_eq!(result.error, None);
    }

    #[test]
    fn ipc_err_wraps_error() {
        let result: IpcResult<i32> = ipc(Err(AppError::NotFound("test".into())));
        assert!(!result.ok);
        assert_eq!(result.data, None);
        assert!(result.error.is_some());
        let err = result.error.unwrap();
        assert_eq!(err.code, "NOT_FOUND");
        assert!(err.message.contains("test"));
    }

    #[test]
    fn ipc_try_closure_ok() {
        let result: IpcResult<String> = ipc_try(|| Ok("hello".into()));
        assert!(result.ok);
        assert_eq!(result.data, Some("hello".into()));
    }

    #[test]
    fn ipc_try_closure_err() {
        let result: IpcResult<i32> = ipc_try(|| Err(AppError::Internal("fail".into())));
        assert!(!result.ok);
        assert_eq!(result.error.unwrap().code, "INTERNAL_ERROR");
    }
}
```

- [ ] **Step 4: 运行 mod.rs 的测试**

Run: `cargo test -p ai-digital-life -- commands::tests 2>&1 | Select-String -Pattern "commands::tests"`
Expected: `ok` — 4 passed

#### 子任务 3c: task.rs — 测试 deserialize_params

- [ ] **Step 5: 在 task.rs 末尾（第 467 行后）添加测试模块**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_params_valid_json() {
        let params = serde_json::json!({
            "id": "cmd-1",
            "workspaceId": "ws-1",
            "runId": null,
            "profile": "custom",
            "command": "echo hello",
            "args": [],
            "shell": false,
            "riskLevel": "low",
            "createdAt": 0
        });
        let result = deserialize_params(params).unwrap();
        assert_eq!(result.id, "cmd-1");
        assert_eq!(result.command, "echo hello");
    }

    #[test]
    fn deserialize_params_missing_field() {
        let params = serde_json::json!({ "id": "cmd-2" });
        let result = deserialize_params(params);
        assert!(result.is_err());
        // serde_json::Error → AppError::Internal (defined at crates/errors/src/lib.rs:61-64)
        assert!(matches!(result.unwrap_err(), AppError::Internal(_)));
    }

    #[test]
    fn deserialize_params_empty_object() {
        let params = serde_json::json!({});
        let result = deserialize_params(params);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::Internal(_)));
    }

    #[test]
    fn deserialize_params_consumes_value() {
        let mut params = serde_json::json!({"id":"cmd-3","workspaceId":"ws-1","runId":null,"profile":"custom","command":"ls","args":[],"shell":false,"riskLevel":"low","createdAt":0});
        let _ = deserialize_params(std::mem::take(&mut params));
        assert_eq!(params, serde_json::Value::Null);
    }
}
```

- [ ] **Step 6: 运行 task.rs 的测试**

Run: `cargo test -p ai-digital-life -- commands::task::tests 2>&1 | Select-String -Pattern "commands::task::tests"`
Expected: `ok` — 4 passed

- [ ] **Step 7: 全量运行测试**

Run: `cargo test --workspace 2>&1 | Select-String -Pattern "test result:"`
Expected: 所有现有测试通过，新测试全部 `ok`

- [ ] **Step 8: 验证 clippy 无新警告**

Run: `cargo clippy --workspace --all-targets 2>&1 | Select-String -Pattern "^warning"`
Expected: 仅显示预存在的 `windows_compat.rs` 4 条

- [ ] **Step 9: 提交**

```bash
git add src-tauri/src/error.rs src-tauri/src/commands/mod.rs src-tauri/src/commands/task.rs
git commit -m "test: add unit tests for error mapping, ipc helpers, and deserialize_params"
```

---

## 验证清单

所有任务完成后执行：

| 检查 | 命令 | 预期 |
|------|------|------|
| TypeScript | `cd frontend && npx tsc --noEmit` | 0 errors |
| Rust 编译 | `cargo build --workspace` | 成功 |
| Rust 测试 | `cargo test --workspace` | 全部通过（PTY pre-existing 失败不计） |
| Rust Lint | `cargo clippy --workspace --all-targets` | 无新增 warnings |
| Rust 格式 | `cargo fmt --check` | 合规 |
