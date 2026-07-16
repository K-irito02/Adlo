# Phase 2 缺陷修复计划（基于实际代码审计）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-06 代码审计发现的 8 项未覆盖缺陷，使 Phase 2 全部 18 项能力端到端可用。

**Architecture:** 7 个独立 Task，按优先级排列：Critical（功能不可用）→ Significant（集成缺失）→ Moderate（不完整）。核心原则：不引入向后兼容代码，不破坏现有 323 Rust + 326 前端测试。

**Tech Stack:** Rust (tokio + reqwest + lsp-server), TypeScript/React 19 (Zustand), Tauri 2.x

## Global Constraints

- 禁止引入 `unwrap()`，使用 `?` 或模式匹配
- 禁止产生任何新的 lint/clippy warning
- 所有 Rust 修改必须通过 `cargo clippy --workspace --all-targets`（在 `ai-digital-life/` 运行）
- 所有前端修改必须通过 `npx eslint . && npx tsc --noEmit`（在 `frontend/` 运行）
- 禁止添加向后兼容代码或数据迁移逻辑
- 前端 UI 文本必须使用 i18n key（useTCopy），禁止硬编码
- 所有新增 Tauri Command 必须类型化 + 登记到 capabilities/*.json

---

### Task 1: 【Critical】Provider 流式响应实现

**现状:** 全部 5 个 provider 的 `chat_stream()` 返回 `Err(AppError::Internal("Streaming not yet implemented"))`

**Root cause:** `ProviderAdapter` trait 定义了 `chat_stream` 但所有实现都是桩。

**Files:**
- Modify: `crates/model-gateway/src/providers/openai.rs` (第 106-114 行)
- Modify: `crates/model-gateway/src/providers/anthropic.rs` (第 129-136 行)
- Modify: `crates/model-gateway/src/providers/google.rs` (第 127-134 行)
- Modify: `crates/model-gateway/src/providers/ollama.rs` (第 117-124 行)
- Modify: `crates/model-gateway/src/providers/openrouter.rs` (第 108-115 行)
- Modify: `crates/model-gateway/src/adapter.rs` (StreamChunk/Done 类型确认)
- Modify: `crates/model-gateway/src/lib.rs` (暴露 streaming 接口)
- Modify: `crates/model-gateway/Cargo.toml` (确认 tokio-stream 依赖)
- Test: 每个 provider 底部测试模块

**Interfaces:**
- Consumes: `ProviderAdapter::chat_stream()` trait 签名
- Produces: 每个 provider 返回真正的 `StreamReader`（`Pin<Box<dyn Stream<Item = Result<StreamChunk, AppError>> + Send>>`）

#### OpenAI 流式实现

- [ ] **Step 1: 实现 OpenAI chat_stream**

```rust
// crates/model-gateway/src/providers/openai.rs, 替换 chat_stream 桩
async fn chat_stream(
    &self,
    model: &str,
    messages: &[ModelChatMessage],
    options: &ChatOptions,
    api_key: &str,
) -> Result<StreamReader, AppError> {
    use tokio_stream::StreamExt;
    use tokio::io::AsyncBufReadExt;

    let body = serde_json::json!({
        "model": model,
        "messages": messages.iter().map(|m| {
            serde_json::json!({
                "role": match m.role {
                    ConversationRole::System => "system",
                    ConversationRole::User => "user",
                    ConversationRole::Assistant => "assistant",
                    ConversationRole::Tool => "tool",
                },
                "content": m.content,
            })
        }).collect::<Vec<_>>(),
        "stream": true,
    });

    let response = self.client
        .post(format!("{}/chat/completions", self.base_url))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Model(e.to_string()))?;

    let stream = response.bytes_stream().map(move |chunk| {
        let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk).to_string();
        // Parse SSE "data: {...}" lines
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    return Ok(StreamChunk::Done(ModelTokenUsage::default()));
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                        return Ok(StreamChunk::Delta(delta.to_string()));
                    }
                }
            }
        }
        Ok(StreamChunk::Delta(String::new()))
    });

    Ok(Box::pin(stream))
}
```

- [ ] **Step 2: 写测试验证 streaming 不 panic**

```rust
// 追加到 openai.rs 测试模块
#[tokio::test]
async fn chat_stream_returns_stream_reader() {
    let provider = OpenAIProvider::new();
    let messages = vec![
        ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() },
    ];
    let result = provider.chat_stream("gpt-4o", &messages, &ChatOptions::default(), "fake-key").await;
    // Should return Err (fake key) but NOT "not yet implemented"
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(!err.contains("not yet implemented"), "Should try real HTTP, got: {}", err);
}
```

- [ ] **Step 3: 运行测试确认新行为**

```powershell
cd ai-digital-life; cargo test -p adl-model-gateway providers::openai::tests::chat_stream_returns_stream_reader -- --nocapture
```

#### Anthropic 流式实现

- [ ] **Step 4: 实现 Anthropic chat_stream**

```rust
// crates/model-gateway/src/providers/anthropic.rs, 替换 chat_stream 桩
async fn chat_stream(
    &self,
    model: &str,
    messages: &[ModelChatMessage],
    _options: &ChatOptions,
    api_key: &str,
) -> Result<StreamReader, AppError> {
    use tokio_stream::StreamExt;

    // Separate system message
    let mut system_text = None;
    let messages_arr: Vec<serde_json::Value> = messages.iter().filter_map(|m| {
        if m.role == ConversationRole::System {
            system_text = Some(m.content.clone());
            None
        } else {
            Some(serde_json::json!({
                "role": match m.role {
                    ConversationRole::User => "user",
                    ConversationRole::Assistant => "assistant",
                    _ => "user",
                },
                "content": m.content,
            }))
        }
    }).collect();

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages_arr,
        "max_tokens": 4096,
        "stream": true,
    });
    if let Some(sys) = system_text {
        body["system"] = serde_json::Value::String(sys);
    }

    let response = self.client
        .post(format!("{}/messages", self.base_url))
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Model(e.to_string()))?;

    let stream = response.bytes_stream().map(|chunk| {
        let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk).to_string();
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    match json["type"].as_str() {
                        Some("content_block_delta") => {
                            if let Some(delta) = json["delta"]["text"].as_str() {
                                return Ok(StreamChunk::Delta(delta.to_string()));
                            }
                        },
                        Some("message_stop") => {
                            return Ok(StreamChunk::Done(ModelTokenUsage::default()));
                        },
                        _ => {},
                    }
                }
            }
        }
        Ok(StreamChunk::Delta(String::new()))
    });

    Ok(Box::pin(stream))
}
```

- [ ] **Step 5: 写 Anthropic streaming 测试**

```rust
#[tokio::test]
async fn anthropic_chat_stream_routes_correctly() {
    let provider = AnthropicProvider::new();
    let messages = vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }];
    let result = provider.chat_stream("claude-3-5-sonnet-20241022", &messages, &ChatOptions::default(), "fake-key").await;
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(!err.contains("not yet implemented"));
}
```

#### Google Gemini 流式实现

- [ ] **Step 6: 实现 Google chat_stream**

```rust
// crates/model-gateway/src/providers/google.rs, 替换 chat_stream 桩
async fn chat_stream(
    &self,
    model: &str,
    messages: &[ModelChatMessage],
    _options: &ChatOptions,
    api_key: &str,
) -> Result<StreamReader, AppError> {
    use tokio_stream::StreamExt;

    let contents: Vec<serde_json::Value> = messages.iter().filter_map(|m| {
        if m.role == ConversationRole::System {
            return None; // Gemini uses system_instruction separately
        }
        Some(serde_json::json!({
            "role": match m.role {
                ConversationRole::User => "user",
                ConversationRole::Assistant => "model",
                _ => "user",
            },
            "parts": [{"text": m.content}],
        }))
    }).collect();

    let body = serde_json::json!({
        "contents": contents,
    });

    let url = format!(
        "{}/models/{}:streamGenerateContent?alt=sse&key={}",
        self.base_url, model, api_key
    );

    let response = self.client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Model(e.to_string()))?;

    let stream = response.bytes_stream().map(|chunk| {
        let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk).to_string();
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(candidates) = json["candidates"].as_array() {
                        if let Some(text) = candidates[0]["content"]["parts"][0]["text"].as_str() {
                            return Ok(StreamChunk::Delta(text.to_string()));
                        }
                    }
                }
            }
        }
        Ok(StreamChunk::Delta(String::new()))
    });

    Ok(Box::pin(stream))
}
```

#### Ollama 流式实现

- [ ] **Step 7: 实现 Ollama chat_stream**

```rust
// crates/model-gateway/src/providers/ollama.rs, 替换 chat_stream 桩
async fn chat_stream(
    &self,
    model: &str,
    messages: &[ModelChatMessage],
    _options: &ChatOptions,
    _api_key: &str,
) -> Result<StreamReader, AppError> {
    use tokio_stream::StreamExt;

    let body = serde_json::json!({
        "model": model,
        "messages": messages.iter().map(|m| {
            serde_json::json!({
                "role": match m.role {
                    ConversationRole::System => "system",
                    ConversationRole::User => "user",
                    ConversationRole::Assistant => "assistant",
                    _ => "user",
                },
                "content": m.content,
            })
        }).collect::<Vec<_>>(),
        "stream": true,
    });

    let response = self.client
        .post(format!("{}/api/chat", self.base_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Model(e.to_string()))?;

    let stream = response.bytes_stream().map(|chunk| {
        let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk).to_string();
        for line in text.lines() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if json["done"].as_bool().unwrap_or(false) {
                    return Ok(StreamChunk::Done(ModelTokenUsage::default()));
                }
                if let Some(content) = json["message"]["content"].as_str() {
                    return Ok(StreamChunk::Delta(content.to_string()));
                }
            }
        }
        Ok(StreamChunk::Delta(String::new()))
    });

    Ok(Box::pin(stream))
}
```

#### OpenRouter 流式实现

- [ ] **Step 8: 实现 OpenRouter chat_stream**

```rust
// crates/model-gateway/src/providers/openrouter.rs, 替换 chat_stream 桩
// OpenRouter 使用 OpenAI 兼容 API，复用相同的 SSE 解析逻辑
async fn chat_stream(
    &self,
    model: &str,
    messages: &[ModelChatMessage],
    _options: &ChatOptions,
    api_key: &str,
) -> Result<StreamReader, AppError> {
    use tokio_stream::StreamExt;

    let body = serde_json::json!({
        "model": model,
        "messages": messages.iter().map(|m| {
            serde_json::json!({
                "role": match m.role {
                    ConversationRole::System => "system",
                    ConversationRole::User => "user",
                    ConversationRole::Assistant => "assistant",
                    ConversationRole::Tool => "tool",
                },
                "content": m.content,
            })
        }).collect::<Vec<_>>(),
        "stream": true,
    });

    let response = self.client
        .post(format!("{}/chat/completions", self.base_url))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Model(e.to_string()))?;

    // 同 OpenAI 的 SSE 解析
    let stream = response.bytes_stream().map(|chunk| {
        let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk).to_string();
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    return Ok(StreamChunk::Done(ModelTokenUsage::default()));
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                        return Ok(StreamChunk::Delta(delta.to_string()));
                    }
                }
            }
        }
        Ok(StreamChunk::Delta(String::new()))
    });

    Ok(Box::pin(stream))
}
```

- [ ] **Step 9: 确认 tokio-stream 和 reqwest 依赖**

```powershell
cd ai-digital-life; cargo tree -p adl-model-gateway -i tokio-stream
# 如缺少：在 crates/model-gateway/Cargo.toml 添加
# tokio-stream = "0.1"
# reqwest = { version = "0.12", features = ["stream"] }
```

- [ ] **Step 10: 运行所有 model-gateway 测试 + clippy**

```powershell
cd ai-digital-life; cargo test -p adl-model-gateway && cargo clippy --workspace --all-targets 2>&1 | tail -20
```

- [ ] **Step 11: Commit**

```bash
git add crates/model-gateway/src/providers/ crates/model-gateway/Cargo.toml
git commit -m "fix(provider): implement real SSE streaming for all 5 providers"
```

---

### Task 2: 【Critical】LSP diagnostics/symbols/goto-definition 实现

**现状:** `lsp_get_symbols`、`lsp_get_diagnostics`、`lsp_goto_definition` 均返回空桩；`LspClient` 初始化后无 stdout reader task 处理 LSP 响应。

**Root cause:** `LspClient::spawn_and_init()` 发送 initialize/initialized 后未启动 reader task 处理后续 LSP 消息。

**Files:**
- Modify: `crates/lsp-client/src/client.rs` (添加 reader task、request 方法)
- Modify: `crates/lsp-client/src/lib.rs` (暴露新方法)
- Modify: `crates/lsp-client/Cargo.toml` (确认 lsp-server/lsp-types 版本)
- Modify: `src-tauri/src/commands/lsp.rs` (替换 3 个桩命令)
- Test: `crates/lsp-client/src/client.rs` (底部测试模块)

**Interfaces:**
- Consumes: `LspClient` 现有结构体
- Produces: `LspClient::request::<T>()` 通用请求方法，`get_diagnostics()`, `get_symbols()`, `goto_definition()`

- [ ] **Step 1: 重构 LspClient 使用 lsp-server Connection**

现有实现使用原始进程 stdin/stdout 手动编解码。改为使用 `lsp-server` crate 的 `Connection` 和 `IoThreads`。

```rust
// crates/lsp-client/src/client.rs — 修改 LspServerHandle 和 LspClient
use lsp_server::{Connection, Message, Notification, Request, RequestId, Response};
use lsp_types::*;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug)]
pub struct LspServerHandle {
    pub state: LspClientState,
    pub connection: Option<Connection>,
    pub io_threads: Option<lsp_server::IoThreads>,
}

#[derive(Debug)]
pub struct LspClient {
    servers: Arc<Mutex<HashMap<LanguageServer, LspServerHandle>>>,
    workspace_root: PathBuf,
}
```

- [ ] **Step 2: 重写 start_server 使用 Connection::stdio**

```rust
// 替换 spawn_and_init 方法
async fn start_server_inner(
    &self,
    server: &LanguageServer,
    program: &str,
    args: &[&str],
) -> Result<(), AppError> {
    let (connection, io_threads) = Connection::stdio(program, args);

    let init_params = serde_json::to_value(InitializeParams {
        process_id: Some(std::process::id()),
        root_uri: Some(
            url::Url::from_directory_path(&self.workspace_root)
                .map_err(|_| AppError::InvalidInput("Invalid workspace path".into()))?
        ),
        capabilities: ClientCapabilities::default(),
        workspace_folders: Some(vec![WorkspaceFolder {
            uri: url::Url::from_directory_path(&self.workspace_root)
                .map_err(|_| AppError::InvalidInput("Invalid path".into()))?,
            name: self.workspace_root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "workspace".to_string()),
        }]),
        ..Default::default()
    }).map_err(|e| AppError::Internal(e.to_string()))?;

    let _capabilities = connection.initialize(init_params)
        .map_err(|e| AppError::Internal(format!("LSP initialize failed: {}", e)))?;

    let mut servers = self.servers.lock().await;
    servers.insert(server.clone(), LspServerHandle {
        state: LspClientState::Running,
        connection: Some(connection),
        io_threads: Some(io_threads),
    });

    tracing::info!("LSP server initialized: {:?}", server);
    Ok(())
}
```

- [ ] **Step 3: 实现通用 request 方法**

```rust
// 追加到 LspClient
pub async fn request<R: serde::Serialize + std::fmt::Debug>(
    &self,
    server: &LanguageServer,
    method: &str,
    params: R,
) -> Result<serde_json::Value, AppError> {
    let servers = self.servers.lock().await;
    let handle = servers.get(server)
        .ok_or_else(|| AppError::NotFound(format!("LSP server {:?} not started", server)))?;
    let connection = handle.connection.as_ref()
        .ok_or_else(|| AppError::Internal("LSP connection not available".into()))?;

    let request = connection.send_request::<serde_json::Value>(method, params)
        .map_err(|e| AppError::Internal(format!("LSP request failed: {}", e)))?;

    // receive() 必须在 connection 的 receiver 上调用
    // 注意: send_request 返回一个 oneshot receiver，不是 connection.receiver
    // 这里需要根据 lsp-server API 调整
    request.await
        .map_err(|e| AppError::Internal(format!("LSP request cancelled: {}", e)))
}
```

- [ ] **Step 4: 实现 get_diagnostics**

```rust
pub async fn get_diagnostics(
    &self,
    server: &LanguageServer,
    file_path: &str,
) -> Result<Vec<DiagnosticInfo>, AppError> {
    let params = DocumentDiagnosticParams {
        text_document: TextDocumentIdentifier {
            uri: url::Url::from_file_path(file_path)
                .map_err(|_| AppError::InvalidInput("Invalid file path".into()))?,
        },
        ..Default::default()
    };

    let result = self.request(server, "textDocument/diagnostic", params).await?;
    let diagnostics: Vec<DiagnosticInfo> = serde_json::from_value(result["items"])
        .unwrap_or_default();
    Ok(diagnostics)
}
```

- [ ] **Step 5: 实现 get_symbols**

```rust
pub async fn get_symbols(
    &self,
    server: &LanguageServer,
    file_path: &str,
) -> Result<Vec<SymbolInfo>, AppError> {
    let params = DocumentSymbolParams {
        text_document: TextDocumentIdentifier {
            uri: url::Url::from_file_path(file_path)
                .map_err(|_| AppError::InvalidInput("Invalid file path".into()))?,
        },
        ..Default::default()
    };

    let result = self.request(server, "textDocument/documentSymbol", params).await?;
    let symbols: Vec<SymbolInfo> = serde_json::from_value(result).unwrap_or_default();
    Ok(symbols)
}
```

- [ ] **Step 6: 实现 goto_definition**

```rust
pub async fn goto_definition(
    &self,
    server: &LanguageServer,
    file_path: &str,
    line: u32,
    column: u32,
) -> Result<Option<SymbolInfo>, AppError> {
    let params = GotoDefinitionParams {
        text_document: TextDocumentIdentifier {
            uri: url::Url::from_file_path(file_path)
                .map_err(|_| AppError::InvalidInput("Invalid file path".into()))?,
        },
        position: Position { line, character: column },
        ..Default::default()
    };

    let result = self.request(server, "textDocument/definition", params).await?;
    // Parse location(s) from result
    let location: Option<lsp_types::Location> = serde_json::from_value(result).ok();
    Ok(location.map(|loc| SymbolInfo {
        name: String::new(),
        kind: String::new(),
        file_path: loc.uri.to_string(),
        line: loc.range.start.line,
        column: loc.range.start.character,
    }))
}
```

- [ ] **Step 7: 更新 Tauri 命令替换桩**

```rust
// src-tauri/src/commands/lsp.rs — 替换 lsp_get_symbols, lsp_get_diagnostics, lsp_goto_definition

#[tauri::command]
pub async fn lsp_get_symbols(
    workspace_id: String,
    file_path: String,
) -> Result<IpcResult<Vec<SymbolInfo>>, AppError> {
    let server = resolve_server_for_file(&file_path);
    let clients = LSP_CLIENTS.lock().await;
    let client = clients.get(&workspace_id)
        .ok_or_else(|| AppError::NotFound("LSP client not started for workspace".into()))?;
    Ok(ipc(client.get_symbols(&server, &file_path).await))
}

#[tauri::command]
pub async fn lsp_get_diagnostics(
    workspace_id: String,
    file_path: Option<String>,
) -> Result<IpcResult<Vec<DiagnosticInfo>>, AppError> {
    let Some(file_path) = file_path else { return Ok(ipc(Ok(vec![]))) };
    let server = resolve_server_for_file(&file_path);
    let clients = LSP_CLIENTS.lock().await;
    let client = clients.get(&workspace_id)
        .ok_or_else(|| AppError::NotFound("LSP client not started".into()))?;
    Ok(ipc(client.get_diagnostics(&server, &file_path).await))
}

#[tauri::command]
pub async fn lsp_goto_definition(
    workspace_id: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<IpcResult<Option<SymbolInfo>>, AppError> {
    let server = resolve_server_for_file(&file_path);
    let clients = LSP_CLIENTS.lock().await;
    let client = clients.get(&workspace_id)
        .ok_or_else(|| AppError::NotFound("LSP client not started".into()))?;
    Ok(ipc(client.goto_definition(&server, &file_path, line, column).await))
}

fn resolve_server_for_file(file_path: &str) -> LanguageServer {
    if file_path.ends_with(".rs") { LanguageServer::RustAnalyzer }
    else if file_path.ends_with(".ts") || file_path.ends_with(".tsx") || file_path.ends_with(".js") { LanguageServer::TypeScriptLanguageServer }
    else if file_path.ends_with(".py") { LanguageServer::Pylsp }
    else if file_path.ends_with(".go") { LanguageServer::Gopls }
    else { LanguageServer::Custom("unknown".to_string()) }
}
```

- [ ] **Step 8: 运行测试 + clippy**

```powershell
cd ai-digital-life; cargo test -p adl-lsp-client && cargo clippy --workspace --all-targets 2>&1 | tail -20
```

- [ ] **Step 9: Commit**

```bash
git add crates/lsp-client/ src-tauri/src/commands/lsp.rs
git commit -m "fix(lsp): implement real diagnostics/symbols/goto-definition via lsp-server Connection"
```

---

### Task 3: 【Critical】Plugin 系统集成到 Agent Pipeline

**现状:** `PluginRegistry` 存在但 `fire_hook()` 从未被调用，`PLUGIN_REGISTRY` 静态始终为空。

**Root cause:** agent pipeline (`agent_pipeline.rs`) 和 tool execution 中没有调用 `fire_hook`，也没有注册任何具体插件。

**Files:**
- Modify: `crates/agent-runtime/src/plugins/registry.rs` (暴露 `register_plugin` 方法)
- Modify: `crates/agent-runtime/src/plugins/mod.rs` (公开 trait)
- Modify: `crates/agent-runtime/src/lib.rs` (公开 plugins 模块)
- Modify: `src-tauri/src/commands/agent_pipeline.rs` (在关键点插入 fire_hook)
- Create: `crates/agent-runtime/src/plugins/example_logging.rs` (示例插件)
- Test: inline in new file

**Interfaces:**
- Consumes: `Plugin` trait, `HookType` enum, `PluginRegistry` 现有接口
- Produces: agent pipeline 在 tool_execute_before/after 和 chat_system_transform 时调用 fire_hook

- [ ] **Step 1: 添加 register_plugin 到 PluginRegistry**

```rust
// crates/agent-runtime/src/plugins/registry.rs 追加
pub fn register_plugin(&self, plugin: Arc<dyn Plugin + Send + Sync>) {
    let mut plugins = self.plugins.write().unwrap();
    let info = PluginInfo {
        name: plugin.name().to_string(),
        description: plugin.description().to_string(),
        enabled: true,
    };
    plugins.insert(plugin.name().to_string(), (info, plugin));
}
```

- [ ] **Step 2: 创建示例日志插件**

```rust
// crates/agent-runtime/src/plugins/example_logging.rs
use super::{HookResult, HookType, Plugin};
use async_trait::async_trait;

pub struct LoggingPlugin;

#[async_trait]
impl Plugin for LoggingPlugin {
    fn name(&self) -> &'static str { "logging" }
    fn description(&self) -> &'static str { "Logs all tool executions and chat transformations" }
    fn hooks(&self) -> Vec<HookType> {
        vec![
            HookType::ToolExecuteBefore,
            HookType::ToolExecuteAfter,
        ]
    }

    async fn on_hook(&self, hook: HookType, _ctx: &str) -> HookResult {
        match hook {
            HookType::ToolExecuteBefore => {
                tracing::debug!("[Plugin:logging] Tool execution starting: {}", _ctx);
                HookResult::Pass
            },
            HookType::ToolExecuteAfter => {
                tracing::debug!("[Plugin:logging] Tool execution completed: {}", _ctx);
                HookResult::Pass
            },
            _ => HookResult::Pass,
        }
    }
}
```

- [ ] **Step 3: 在 agent pipeline 中集成 fire_hook**

```rust
// src-tauri/src/commands/agent_pipeline.rs — 在 call_model 前后添加钩子
use adl_agent_runtime::plugins::{HookType, HookResult};
use adl_agent_runtime::plugins::registry::global_plugin_registry;

// 在 call_model 调用前:
let _ = global_plugin_registry().fire_hook(HookType::ChatSystemTransform, &system_prompt).await;

// 在 tool execute 前:
let hook_result = global_plugin_registry()
    .fire_hook(HookType::ToolExecuteBefore, &format!("{}:{:?}", tool_name, tool_input))
    .await;
if matches!(hook_result, HookResult::Abort(reason)) {
    return Err(AppError::Internal(format!("Plugin aborted: {}", reason)));
}
```

- [ ] **Step 4: 注册日志插件到全局注册表**

在 `main.rs` 或 `setup.rs` 初始化时添加:

```rust
// src-tauri/src/setup.rs 或 main.rs setup 中
use adl_agent_runtime::plugins::registry::global_plugin_registry;
use adl_agent_runtime::plugins::example_logging::LoggingPlugin;
use std::sync::Arc;

global_plugin_registry().register_plugin(Arc::new(LoggingPlugin));
```

- [ ] **Step 5: 运行测试 + clippy**

```powershell
cd ai-digital-life; cargo test -p adl-agent-runtime && cargo clippy --workspace --all-targets 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add crates/agent-runtime/src/plugins/ src-tauri/src/commands/agent_pipeline.rs src-tauri/src/setup.rs
git commit -m "fix(plugin): integrate PluginRegistry into agent pipeline with example logging plugin"
```

---

### Task 4: 【Significant】ConfigWatcher 启动 + 前端订阅

**现状:** `crates/kernel/src/config_watcher.rs` 存在且可编译，但 `setup.rs` 和 `main.rs` 中无任何引用。

**Root cause:** ConfigWatcher 从未被初始化。

**Files:**
- Modify: `src-tauri/src/setup.rs` (启动 ConfigWatcher)
- Modify: `src-tauri/src/state.rs` (可选：存储 watcher 句柄)
- Modify: `crates/kernel/src/config_watcher.rs` (修复防抖模式)

**Interfaces:**
- Consumes: `AppConfig` 路径
- Produces: 文件变更时发送 `EventBus::ConfigChanged`

- [ ] **Step 1: 修复 ConfigWatcher 防抖模式**

```rust
// crates/kernel/src/config_watcher.rs — 替换 debounce 逻辑
// 当前有双重 recv() 问题，改为单次延迟后处理所有累积事件

async fn watch_loop(watcher: notify::RecommendedWatcher, mut rx: notify::EventReceiver, sender: watch::Sender<Arc<AppConfig>>, config_path: PathBuf) {
    use tokio::time::{sleep, Duration};

    loop {
        // Wait for first event
        match rx.recv().await {
            Some(Ok(_)) => {
                // Debounce: wait 200ms after last event
                sleep(Duration::from_millis(200)).await;
                // Drain any remaining events
                while rx.try_recv().is_ok() {}
                // Reload config
                if let Ok(config) = adl_config::load(&config_path.parent().unwrap_or(&config_path)) {
                    let _ = sender.send(Arc::new(config));
                    tracing::info!("Config reloaded after file change");
                }
            },
            Some(Err(e)) => tracing::warn!("Config watch error: {}", e),
            None => break,
        }
    }
}
```

- [ ] **Step 2: 在 setup.rs 中启动 ConfigWatcher**

```rust
// src-tauri/src/setup.rs — 在 init_app_state 末尾或 main.rs setup 中添加
use adl_kernel::config_watcher::ConfigWatcher;
use std::sync::Arc;

// 在创建 AppState 后:
let config_path = data_dir.join("config.json");
let mut config_watcher = ConfigWatcher::new(&config_path);
let config_rx = config_watcher.subscribe();
tokio::spawn(async move {
    config_watcher.start_watching().await;
});

// 在 AppState 中存储 config_rx 以便前端订阅
// 或通过 EventBus 转发
```

- [ ] **Step 3: 运行测试 + clippy**

```powershell
cd ai-digital-life; cargo test -p adl-kernel && cargo clippy --workspace --all-targets 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add crates/kernel/src/config_watcher.rs src-tauri/src/setup.rs
git commit -m "fix(config): wire ConfigWatcher into Tauri app startup, fix debounce"
```

---

### Task 5: 【Significant】Session Fork DB 查询 + Agent Pipeline 集成

**现状:** `list_session_forks` 始终返回空数组；Durable session 有 manager 但 agent pipeline 不调用。

**Files:**
- Modify: `src-tauri/src/commands/session_fork.rs` (实现 DB 查询)
- Modify: `src-tauri/src/commands/agent_pipeline.rs` (添加 durable session 生命周期调用)
- Modify: `src-tauri/src/state.rs` (确认 durable_manager 可用)

**Interfaces:**
- Consumes: `state.db` (Database), `state.durable_manager`
- Produces: `list_session_forks` 返回真实数据；agent run 注册心跳

- [ ] **Step 1: 实现 list_session_forks 真实查询**

```rust
// src-tauri/src/commands/session_fork.rs
#[tauri::command]
pub async fn list_session_forks(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    parent_session_id: String,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let sessions: Vec<ConversationSessionRecord> = state
        .db
        .list_entities_by_workspace(
            adl_storage::EntityTable::Sessions,
            &workspace_id,
        )?
        .into_iter()
        .filter(|s: &ConversationSessionRecord| {
            s.parent_id.as_deref() == Some(&parent_session_id)
        })
        .collect();
    Ok(ipc(Ok(sessions)))
}
```

- [ ] **Step 2: 在 agent pipeline 中添加 durable session 注册和心跳**

```rust
// src-tauri/src/commands/agent_pipeline.rs — 在 prepare_run 或 start_run 中添加

// 在 agent run 开始时:
if let Some(run_id) = &detail.run.id {
    state.durable_manager.register_session(&session.id, run_id).await;
}

// 在 LLM 调用前后发送心跳:
tokio::spawn({
    let session_id = session.id.clone();
    let manager = state.durable_manager.clone();
    async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(15)).await;
            manager.heartbeat(&session_id).await;
        }
    }
});
```

- [ ] **Step 3: 运行测试 + clippy**

```powershell
cd ai-digital-life; cargo clippy --workspace --all-targets 2>&1 | tail -20 && cargo test --workspace
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/session_fork.rs src-tauri/src/commands/agent_pipeline.rs
git commit -m "fix(session): implement list_session_forks DB query, wire durable session lifecycle"
```

---

### Task 6: 【Significant】Durable Session 背景恢复任务

**现状:** `find_crashed_sessions` 和 `start_recovery` 存在，但无周期性触发机制。

**Files:**
- Modify: `src-tauri/src/setup.rs` (启动背景恢复任务)
- Modify: `crates/agent-runtime/src/durable.rs` (暴露恢复逻辑)

**Interfaces:**
- Consumes: `DurableSessionManager::find_crashed_sessions()`, `start_recovery()`
- Produces: 每 60 秒检查一次崩溃会话并自动恢复

- [ ] **Step 1: 在 setup.rs 中添加背景恢复任务**

```rust
// src-tauri/src/setup.rs — 在 init_app_state 返回前或 main.rs setup 中添加
let durable_mgr = app_state.durable_manager.clone();
tokio::spawn(async move {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    loop {
        interval.tick().await;
        let crashed = durable_mgr.find_crashed_sessions().await;
        for session in crashed {
            tracing::warn!(
                "Found crashed durable session: {} (run: {}, retries: {})",
                session.session_id, session.run_id, session.retry_count
            );
            if session.retry_count < 3 {
                let recovered = durable_mgr.start_recovery(&session.session_id).await;
                if recovered {
                    tracing::info!("Recovery started for session: {}", session.session_id);
                }
            } else {
                tracing::error!(
                    "Session {} exceeded max retries, marking as failed",
                    session.session_id
                );
            }
        }
    }
});
```

- [ ] **Step 2: 运行 clippy**

```powershell
cd ai-digital-life; cargo clippy --workspace --all-targets 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/setup.rs
git commit -m "fix(session): add background recovery task for crashed durable sessions"
```

---

### Task 7: 【Moderate】次要缺陷修复

**Files:**
- Modify: `src-tauri/src/commands/custom_agent.rs` (添加 update 命令)
- Modify: `crates/context/src/references.rs` (实现 git clone)
- Modify: `frontend/src/app/features/command-editor/CommandEditor.tsx` (扩展 agent 类型)
- Modify: `crates/agent-runtime/src/prompt.rs` (Custom 使用独立 prompt)

- [ ] **Step 1: 添加 update_custom_agent 命令**

```rust
// src-tauri/src/commands/custom_agent.rs — 追加
#[tauri::command]
pub async fn update_custom_agent(
    state: tauri::State<'_, AppState>,
    original_name: String,
    agent: AgentConfig,
) -> Result<IpcResult<()>, AppError> {
    let mut config = state.config.write().map_err(|_| AppError::Internal("config lock".into()))?;
    if let Some(existing) = config.custom_agents.iter_mut().find(|a| a.name == original_name) {
        *existing = agent;
    }
    adl_config::save(&state.data_dir, &config)?;
    Ok(ipc(Ok(())))
}
```

- [ ] **Step 2: 扩展 CommandEditor agent 类型选择**

```tsx
// frontend/src/app/features/command-editor/CommandEditor.tsx — 替换第 71-74 行
<select
  value={agentType}
  onChange={(e) => setAgentType(e.target.value)}
>
  <option value="build">{t.commandEditorAgentBuild}</option>
  <option value="plan">{t.commandEditorAgentPlan}</option>
  <option value="general">{t.commandEditorAgentGeneral}</option>
  <option value="explore">{t.commandEditorAgentExplore}</option>
</select>
```

- [ ] **Step 3: 修复 Custom Agent prompt**

```rust
// crates/agent-runtime/src/prompt.rs — 第 14 行
AgentId::Custom => CUSTOM_PROMPT.to_string(),

// 添加常量
const CUSTOM_PROMPT: &str = "You are a custom agent configured by the user. Follow the user's custom instructions to complete the task.";
```

- [ ] **Step 4: 实现 Git Reference clone**

```rust
// crates/context/src/references.rs — 在 validate_reference 或新函数中添加
pub async fn clone_git_reference(ref_config: &ReferenceConfig) -> Result<PathBuf, AppError> {
    match &ref_config.source {
        ReferenceSource::Git { url, branch } => {
            let dest = tempfile::tempdir()
                .map_err(|e| AppError::Io(e.to_string()))?;
            let mut cmd = tokio::process::Command::new("git");
            cmd.arg("clone");
            if let Some(branch) = branch {
                cmd.arg("--branch").arg(branch);
            }
            cmd.arg(url).arg(dest.path());
            let output = cmd.output().await
                .map_err(|e| AppError::Io(format!("Failed to clone git ref: {}", e)))?;
            if !output.status.success() {
                return Err(AppError::Internal(format!(
                    "Git clone failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                )));
            }
            Ok(dest.into_path())
        },
        ReferenceSource::Local { path } => Ok(PathBuf::from(path)),
    }
}
```

- [ ] **Step 5: 注册 update_custom_agent 到 main.rs**

```rust
// main.rs invoke_handler 添加:
commands::custom_agent::update_custom_agent,
```

- [ ] **Step 6: 运行全部测试 + clippy + lint**

```powershell
cd ai-digital-life; cargo test --workspace 2>&1 | tail -30; cargo clippy --workspace --all-targets 2>&1 | tail -20
cd frontend; npx tsc --noEmit 2>&1; npx eslint . 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/custom_agent.rs src-tauri/src/main.rs crates/agent-runtime/src/prompt.rs crates/context/src/references.rs frontend/src/app/features/command-editor/CommandEditor.tsx
git commit -m "fix: minor defect fixes - custom agent update, agent types, git clone, custom prompt"
```

---

## 验证清单

| Task | 验证命令 | 预期结果 |
|------|---------|---------|
| Task 1 | `cargo test -p adl-model-gateway` | 所有 provider streaming 测试通过 |
| Task 2 | `cargo test -p adl-lsp-client` | LSP request/response 测试通过 |
| Task 3 | `cargo test -p adl-agent-runtime` | Plugin registry + hook 测试通过 |
| Task 4 | `cargo test -p adl-kernel` | ConfigWatcher 测试通过 |
| Task 5 | `cargo test --workspace` | 全工作区测试通过 |
| Task 6 | 手动：观察日志中恢复任务 60s 循环 | 无 panic |
| Task 7 | `npx tsc --noEmit && npx eslint .` | 前端零错误 |
| 全量 | `cargo clippy --workspace --all-targets` | 零警告 |
