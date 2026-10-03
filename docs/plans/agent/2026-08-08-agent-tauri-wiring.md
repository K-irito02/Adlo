# Tauri 适配接线 Implementation Plan（B3c）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 B3b 的 `LoopExecutor` 接入 Tauri：实现 `DbPartStore`（`adl_storage::Database` → `PartStore`），新增 `agent_loop_run` Tauri 命令（ModelGateway → stream_adapter → LLMEventStream → run_turn 多回合 while 循环，CancellationToken abort），复用现有 conversation 命令/Part 持久化。采用**新命令并存**（对齐参考实现：SessionV2 prompt 与旧 TUI 是独立入口），旧 `agent_start_run`/`agent_pipeline` 暂不动，前端下阶段切换。

**Architecture:** 三层：
1. **DbPartStore**（src-tauri）：实现 `PartStore` trait，包 `adl_storage::Database`，用 `spawn_blocking`（rusqlite 是阻塞 API）。
2. **agent_loop 命令**（src-tauri/src/commands/agent_loop.rs）：`agent_loop_run` 命令——构造 `DbPartStore`/`PartEventBus`/`QuestionService`/`ToolRegistry`/`LoopExecutor`，驱动多回合 while 循环：`chat_stream_for_model` → `stream_chunks_to_llm_events` → `run_turn`，直到 `Stop`/`Error`。
3. **abort 管理**（AppState 增 `loop_cancels: AsyncMutex<HashMap<session_id, CancellationToken>>`）。

**Tech Stack:** Rust 2024 edition、tauri 2、tokio、`adl_agent_runtime`（LoopExecutor/PartEventBus/QuestionService/PartStore）、`adl_model_gateway`（chat_stream_for_model/stream_adapter）、`adl_storage`（Database/Part CRUD）、`adl_tools`（ToolRegistry）、`tokio-util`（CancellationToken）。

## Global Constraints

- Rust edition 2024，rust-version 1.85
- `cargo clippy -- -D warnings` 必须 0 警告；避免 `unwrap_used`/`dbg_macro`/`todo`
- 未发布阶段禁止数据迁移/兼容代码
- 新增 Tauri 命令必须类型化、登记到 `capabilities/*.json`、返回 `IpcResult<T>`
- 双端一致性：新命令在 Tauri 桌面与浏览器模式都可用（本计划 Tauri 端；前端桥接下阶段）
- 旧 `agent_pipeline`/`agent_start_run` 行为不变（新命令并存）
- `DbPartStore` 用 `spawn_blocking` 包裹所有 rusqlite 调用（阻塞 API 不能在 async 执行器上直接跑）

---

### Task 1: DbPartStore 实现

**Files:**
- Create: `src-tauri/src/commands/agent_loop.rs`
- Modify: `src-tauri/src/commands/mod.rs`

**Interfaces:**
- Consumes: `adl_agent_runtime::part_store::PartStore`, `adl_storage::Database`, `adl_types::{MessageRecord, PartRecord}`, `adl_errors::AppError`
- Produces: `pub struct DbPartStore(pub adl_storage::Database)`，实现 `PartStore`

- [ ] **Step 1: 编写失败的测试**

创建 `src-tauri/src/commands/agent_loop.rs`（先只写测试）。测试需构造临时 DB。由于 `Database::open` 是同步的，测试用 `adl_storage::Database::open(temp_path)` + `init_schema()`。但 `PartStore` 是 async trait——`spawn_blocking` 包 `save_part`/`save_message`/`list_parts`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use adl_agent_runtime::part_store::PartStore;
    use adl_types::{MessageRecord, PartRecord, PartType};

    fn temp_db() -> adl_storage::Database {
        let path = std::env::temp_dir().join(format!("adl-dbpartstore-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[tokio::test]
    async fn db_part_store_saves_and_lists_part() {
        let db = temp_db();
        let store = DbPartStore(db);
        let part = PartRecord {
            id: "part_1".into(),
            message_id: "msg_1".into(),
            session_id: "s1".into(),
            r#type: PartType::Text,
            ordinal: 0,
            time_created: 0,
            data: serde_json::json!({"type": "text", "text": "hi"}),
        };
        store.save_part(&part).await.unwrap();
        let parts = store.list_parts("msg_1").await.unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].data["text"], "hi");
    }

    #[tokio::test]
    async fn db_part_store_saves_message() {
        let db = temp_db();
        let store = DbPartStore(db);
        let msg = MessageRecord {
            id: "msg_1".into(),
            session_id: "s1".into(),
            role: "assistant".into(),
            parent_id: None,
            agent: None,
            model: None,
            summary: None,
            time_created: 0,
            time_completed: None,
        };
        store.save_message(&msg).await.unwrap();
        // 通过 load_message 验证持久化
        let loaded = db_load_message(&store.0, "msg_1").await;
        assert_eq!(loaded.unwrap().id, "msg_1");
    }

    async fn db_load_message(db: &adl_storage::Database, id: &str) -> Option<MessageRecord> {
        let db = db.clone();
        tokio::task::spawn_blocking(move || db.load_message(id).unwrap()).await.unwrap()
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p ai-digital-life db_part_store`
Expected: FAIL（`agent_loop` 模块不存在）

- [ ] **Step 3: 实现**

创建 `src-tauri/src/commands/agent_loop.rs`:

```rust
use adl_agent_runtime::part_store::PartStore;
use adl_errors::AppError;
use adl_storage::Database;
use adl_types::{MessageRecord, PartRecord};

/// `PartStore` backed by the ADL SQLite database. rusqlite is blocking, so
/// every operation runs via `spawn_blocking`.
pub struct DbPartStore(pub Database);

#[async_trait::async_trait]
impl PartStore for DbPartStore {
    async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError> {
        let db = self.0.clone();
        let msg = msg.clone();
        tokio::task::spawn_blocking(move || db.save_message(&msg)).await?
    }

    async fn save_part(&self, part: &PartRecord) -> Result<(), AppError> {
        let db = self.0.clone();
        let part = part.clone();
        tokio::task::spawn_blocking(move || db.save_part(&part)).await?
    }

    async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
        let db = self.0.clone();
        let message_id = message_id.to_string();
        tokio::task::spawn_blocking(move || db.list_parts(&message_id)).await?
    }
}
```

注意：`tokio::task::spawn_blocking` 返回 `JoinHandle<Result<T, AppError>>`，`.await?` 解包 JoinHandle 错误（`AppError::Internal`），内层 `?` 传播 AppError。若 `Database::clone` 不可用（r2d2 Pool 是 Clone），则用 `Database` 的 `Arc` 或确认 `Database` 实现 Clone（`#[derive(Clone)]` in connection.rs:8——是的，已实现）。

修改 `src-tauri/src/commands/mod.rs` 注册模块:

```rust
pub mod agent_loop;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p ai-digital-life db_part_store`
Expected: PASS（2 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p ai-digital-life --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands/agent_loop.rs src-tauri/src/commands/mod.rs
git commit -m "feat(agent): add DbPartStore implementing PartStore"
```

---

### Task 2: agent_loop_run 命令（多回合 while 循环）

**Files:**
- Modify: `src-tauri/src/commands/agent_loop.rs`
- Modify: `src-tauri/src/commands/mod.rs`（导出命令）
- Modify: `src-tauri/src/main.rs`（注册命令）
- Modify: `src-tauri/src/state.rs`（AppState 增 loop_cancels）
- Modify: `src-tauri/Cargo.toml`（新增 `tokio-util.workspace = true`）
- Modify: `src-tauri/src/setup.rs`（AppState 构造初始化 loop_cancels）

**Interfaces:**
- Consumes: `adl_agent_runtime::{LoopExecutor, PartEventBus, QuestionService}`, `adl_model_gateway::ModelGateway`, `adl_model_gateway::stream_adapter::stream_chunks_to_llm_events`, `adl_tools::registry::ToolRegistry`, `tokio_util::sync::CancellationToken`, `adl_agent_runtime::prompt`
- Produces:
  - `#[tauri::command] pub async fn agent_loop_run(app, state, input: LoopRunInput) -> Result<IpcResult<LoopRunResult>, CommandError>`
  - `LoopRunInput { session_id, prompt, provider_id, model_id }`
  - `LoopRunResult { run_id, turn_count, status }`
  - `#[tauri::command] pub async fn agent_loop_abort(app, session_id) -> Result<IpcResult<()>, CommandError>`

**核心：多回合 while 循环**（对齐参考实现的 `handle.process` 外层循环）：

```
1. require_session / current_workspace
2. 创建 user MessageRecord + save（复用 conversation::save_message 或 PartStore.save_message）
3. 创建 assistant MessageRecord（parent_id=user.id）+ save
4. 构造 LoopExecutor（DbPartStore + PartEventBus + QuestionService + ToolRegistry）
5. AppState.loop_cancels 存 CancellationToken
6. while 循环:
     a. 构造 messages（build_model_messages + 追加已有 assistant/user parts）
     b. gateway.chat_stream_for_model(provider, model, messages) → StreamReader
     c. stream_adapter::stream_chunks_to_llm_events(reader) → LLMEventStream
     d. executor.run_turn(session, assistant_msg_id, llm_events, cancel).await
     e. match TurnResult:
          Continue → 回到 a（新回合）
          Stop → break
          Error → break（标记错误）
7. 更新 run 状态 + 移除 cancel token
```

**build_model_messages**：复用现有 `agent_pipeline::model_caller` 中的 `adl_agent_runtime::build_model_messages(workspace, prompt, scenario, context)`——但需要检查其签名。若复杂，简化为直接构造 `Vec<ModelChatMessage>`（system + user prompt + 历史 parts）。

**abort**：`agent_loop_abort` 从 `loop_cancels` 取 token 并 `cancel()`。

- [ ] **Step 1: 编写失败的测试**

`agent_loop_run` 依赖 Tauri AppHandle + ModelGateway（真实网络），难以单测。测试 focus 于可测部分：
- `build_model_messages` 辅助函数（纯逻辑）
- `agent_loop_abort` 的 token 存取

在 `agent_loop.rs` 测试模块:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_llm_messages_from_prompt() {
        let messages = build_llm_messages("s1", "hello", None);
        assert_eq!(messages.len(), 2); // system + user
        assert_eq!(messages[1].role, adl_types::ConversationRole::User);
        assert_eq!(messages[1].content, "hello");
    }

    #[tokio::test]
    async fn loop_cancels_register_and_cancel() {
        let cancels = std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
        let token = tokio_util::sync::CancellationToken::new();
        cancels.lock().await.insert("s1".to_string(), token.clone());
        assert!(cancels.lock().await.contains_key("s1"));
        token.cancel();
        assert!(token.is_cancelled());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p ai-digital-life agent_loop`
Expected: FAIL（`agent_loop` 模块不存在或函数缺失）

- [ ] **Step 3: 实现**

实现 `agent_loop.rs` 的命令与辅助函数。核心 while 循环见下（implementer 基于实际 API 适配）:

```rust
use crate::commands::ipc;
use crate::state::AppState;
use adl_agent_runtime::loop_executor::{LoopExecutor, TurnResult};
use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_agent_runtime::question::QuestionService;
use adl_model_gateway::stream_adapter::stream_chunks_to_llm_events;
use adl_tools::registry::ToolRegistry;
use adl_types::model::ModelChatMessage;
use tokio_util::sync::CancellationToken;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRunInput {
    pub session_id: String,
    pub prompt: String,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRunResult {
    pub run_id: String,
    pub turn_count: u32,
    pub status: String,
}

fn build_llm_messages(session_id: &str, prompt: &str, _context: Option<&str>) -> Vec<ModelChatMessage> {
    vec![
        ModelChatMessage {
            role: adl_types::ConversationRole::System,
            content: "You are AI Digital Life, an agentic coding assistant. Use tools to help the user."
                .to_string(),
        },
        ModelChatMessage {
            role: adl_types::ConversationRole::User,
            content: prompt.to_string(),
        },
    ]
}

#[tauri::command]
pub async fn agent_loop_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: LoopRunInput,
) -> Result<ipc::IpcResult<LoopRunResult>, crate::error::CommandError> {
    Ok(ipc(agent_loop_run_inner(&app, &state, input).await))
}

async fn agent_loop_run_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    input: LoopRunInput,
) -> Result<LoopRunResult, AppError> {
    let session = crate::commands::conversation::require_session(state, &input.session_id)?;
    let workspace = crate::commands::workspace::current_workspace(state)
        .unwrap_or_else(|_| crate::commands::workspace::virtual_global_workspace());
    let workspace_root = std::path::Path::new(&workspace.root_path);

    // 1. user message
    let user_msg_id = adl_types::create_id("msg");
    let user_msg = adl_types::MessageRecord {
        id: user_msg_id.clone(),
        session_id: input.session_id.clone(),
        role: "user".into(),
        parent_id: None,
        agent: None,
        model: None,
        summary: None,
        time_created: adl_types::now_ms(),
        time_completed: None,
    };
    let store = DbPartStore(state.db.clone());
    store.save_message(&user_msg).await?;

    // 2. assistant message
    let assistant_msg_id = adl_types::create_id("msg");
    let assistant_msg = adl_types::MessageRecord {
        id: assistant_msg_id.clone(),
        session_id: input.session_id.clone(),
        role: "assistant".into(),
        parent_id: Some(user_msg_id.clone()),
        agent: None,
        model: None,
        summary: None,
        time_created: adl_types::now_ms(),
        time_completed: None,
    };
    store.save_message(&assistant_msg).await?;

    // 3. executor
    let bus = PartEventBus::new(256);
    let questions = QuestionService::new(bus.clone());
    let registry = ToolRegistry::with_builtins();
    let executor = LoopExecutor::new(bus.clone(), std::sync::Arc::new(store), questions, std::sync::Arc::new(registry));
    let cancel = CancellationToken::new();
    // 注册 cancel token（AppState.loop_cancels）
    register_cancel(state, &input.session_id, cancel.clone()).await;

    // 4. provider/model resolution（复用现有逻辑）
    let (provider_id, model_id) = resolve_provider_model(state, &input).await?;

    // 5. gateway
    let gateway = {
        let config = state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        adl_model_gateway::ModelGateway::new(config.model_preferences.clone(), state.provider_registry.clone())?
    };

    // 6. multi-round while loop
    let mut turn_count = 0u32;
    let mut status = "completed".to_string();
    loop {
        let messages = build_llm_messages(&input.session_id, &input.prompt, None);
        let stream = gateway.chat_stream_for_model(&provider_id, &model_id, messages).await?;
        let llm_events = stream_chunks_to_llm_events(stream);
        let result = executor
            .run_turn(
                adl_agent_runtime::loop_executor::TurnConfig {
                    session_id: input.session_id.clone(),
                    message_id: assistant_msg_id.clone(),
                    parent_id: Some(user_msg_id.clone()),
                    model: None,
                },
                llm_events,
                cancel.clone(),
            )
            .await;
        turn_count += 1;
        match result {
            Ok(TurnResult::Continue) => continue,
            Ok(TurnResult::Stop) => break,
            Ok(TurnResult::Error) => { status = "error".to_string(); break; }
            Err(e) => { status = format!("error: {e}"); break; }
        }
    }
    unregister_cancel(state, &input.session_id).await;

    Ok(LoopRunResult {
        run_id: assistant_msg_id,
        turn_count,
        status,
    })
}

#[tauri::command]
pub async fn agent_loop_abort(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<ipc::IpcResult<()>, crate::error::CommandError> {
    let cancels = state.loop_cancels.lock().await;
    if let Some(token) = cancels.get(&session_id) {
        token.cancel();
    }
    Ok(ipc(Ok(())))
}
```

**辅助函数**（implementer 需实现，基于实际 API）：
- `register_cancel(state, session_id, token)` / `unregister_cancel`：操作 `state.loop_cancels`
- `resolve_provider_model(state, input)`：复用 `model_caller.rs` 的 provider/model 解析逻辑
- `TurnConfig` 字段名以 B3b LoopExecutor 实际实现为准

修改 `src-tauri/src/state.rs`，AppState 增字段:

```rust
/// Cancellation tokens for active agent loops (session_id → token).
pub loop_cancels: tokio::sync::Mutex<std::collections::HashMap<String, tokio_util::sync::CancellationToken>>,
```

（在 `AppState::new`/构造处初始化——需查看 setup.rs 如何构造 AppState 并补齐初始化。）

修改 `src-tauri/src/commands/mod.rs` 导出命令、`src-tauri/src/main.rs` 注册 `agent_loop_run`/`agent_loop_abort`、`capabilities/*.json` 登记命令。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p ai-digital-life agent_loop`
Expected: PASS（build_llm_messages + loop_cancels 测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands/agent_loop.rs src-tauri/src/state.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs src-tauri/src/setup.rs src-tauri/Cargo.toml src-tauri/permissions/digital-life.toml
git commit -m "feat(agent): add agent_loop_run command with multi-round LoopExecutor"
```

---

### Task 3: 命令登记与前端桥接存根

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/permissions/digital-life.toml`（登记 `agent_loop_run`/`agent_loop_abort`）
- Modify（可选，前端下阶段）：无——本计划只做后端，前端桥接下阶段

**Interfaces:**
- Consumes: Task 1/2 的命令
- Produces: 命令在 Tauri 中可调用（`invoke("agent_loop_run", ...)`）

- [ ] **Step 1: 确认命令登记**

检查 `src-tauri/src/main.rs` 的 `invoke_handler` 是否包含 `agent_loop_run`/`agent_loop_abort`，`src-tauri/permissions/digital-life.toml` 的 allowed commands 是否包含。若无则补充（在 `agent_start_run` 附近添加）。查看现有 `agent_start_run` 的登记方式（main.rs invoke_handler 行 169 + digital-life.toml 行 51）并照做。

Run: `cargo build --workspace` 确认编译通过。

- [ ] **Step 2: 运行全工作区测试**

Run: `cargo test --workspace -- --skip google`
Expected: 全部通过

- [ ] **Step 3: Clippy 全量检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/main.rs src-tauri/permissions/digital-life.toml
git commit -m "chore(agent): register agent_loop commands in permissions"
```

---

## Self-Review 记录

**Spec coverage:**
- §B3c DbPartStore → Task 1 ✓
- §B3c agent_loop_run 多回合 while 循环 → Task 2 ✓
- §B3c abort 管理（loop_cancels）→ Task 2 ✓
- §B3c 命令登记 → Task 3 ✓

**Gap 说明**：
- 前端桥接（tauri-bridge/mock-bridge/preview-bridge）下阶段做——本计划只交付后端命令与能力登记。
- `build_llm_messages` 暂为简化版（system + user prompt），历史上下文/工具 schema 注入留后续增强。多回合 while 循环每回合用相同 messages（未累积历史）——这是简化，B3c 后续可补。
- 工具执行 metadata → Part 的完整链路由 LoopExecutor 处理（B3b 已实现），本计划只接线。

**Placeholder scan**：Task 2 标注"implementer 需实现"的辅助函数（register_cancel/resolve_provider_model）是明确指引；`TurnConfig` 字段名以实际实现为准是适配说明，非占位。

**Type consistency**：`DbPartStore`（Task 1）实现 `PartStore` trait（B3b 定义）；`LoopExecutor::run_turn`（B3b）消费 `LLMEventStream`（B3a）与 `TurnConfig`（B3b）；`PartEventBus`/`QuestionService`（B3b）被 Task 2 使用。
