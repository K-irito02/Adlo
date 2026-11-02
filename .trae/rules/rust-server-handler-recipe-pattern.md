---
description: Unified four-step recipe for adl-server HTTP handlers with blocking I/O isolation and IpcResult wrapping
globs: ai-digital-life/crates/server/**/*.rs
alwaysApply: false
---

## Rust 服务端 Handler 统一配方模式

### 规则描述

所有 adl-server HTTP handler 必须遵循统一的四步配方：

1. **State 提取**：`State(state): State<ServerState>` 获取服务端状态
2. **Body 解析**：`ipc::json_body(body)` 解析请求体
3. **阻塞操作**：阻塞 I/O 通过 `run_blocking()` 在 `spawn_blocking` 中执行
4. **响应包装**：`ipc::to_response(result)` 将 `Result<T, AppError>` 包装为 `IpcResult<T>` 格式

所有 handler 返回类型为 `impl IntoResponse`，请求体反序列化结构体使用 `#[serde(rename_all = "camelCase")]` 注解。

### 正确示例

```rust
// 完整 handler 实现
pub async fn create_session(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let body_val: serde_json::Value = ipc::json_body(body).await.unwrap_or_default();
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let s = adl_conversation::create_session(&wid, title, existing.len() as i32);
        db.save_entity(EntityTable::Sessions, &s.id, None, None, None, &s)?;
        Ok(serde_json::to_value(&s)?)
    }).await;
    ipc::to_response(result)
}

// 请求体反序列化结构体
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandRunInput {
    command: String,
    args: Vec<String>,
    #[serde(default)]
    shell: Option<bool>,
}
```

### 错误示例

```rust
// ❌ 错误：直接操作阻塞 I/O 而不使用 spawn_blocking
pub async fn bad_handler(State(state): State<ServerState>) -> impl IntoResponse {
    let result = std::fs::read_to_string("file.txt"); // 阻塞主线程
    ipc::to_response(result.map_err(|e| AppError::IO(e.to_string())))
}

// ❌ 错误：不使用 ipc::to_response，返回裸数据
pub async fn bad_handler(State(state): State<ServerState>) -> Json<Value> {
    Json(serde_json::json!({ "data": result }))
}
```

### 适用场景

所有 `crates/server/src/handlers/` 下的 HTTP handler 函数。此模式基于 axum 框架，与 Tauri Command 模式共存。

### 注意

- `run_blocking` 函数在 `agent_loop.rs` 中是 `pub` 的，建议所有 handler 优先复用 `crate::agent_loop::run_blocking`，避免在各 handler 文件中重复定义
- 响应格式统一为 `IpcResult<T>` 结构：`{ "ok": true, "data": ... }` 或 `{ "ok": false, "error": { "code": "...", "message": "..." } }`
- 140+ 个 handler 函数跨 28 个文件遵循此模式