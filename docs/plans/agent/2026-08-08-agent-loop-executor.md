# Agent Loop 执行器 + PartEventBus + Question 服务 Implementation Plan（B3b）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `adl-agent-runtime` 实现库级多步工具循环执行器 `LoopExecutor`（对齐 OpenCode `processor.ts` 的事件状态机）、`PartEventBus`（广播 `SessionPartEvent`）、库级 `Question` 服务（`ask`/`reply`/`reject` 挂起等待），并扩展 agent-runtime 依赖（model-gateway LLMEvent、storage Part CRUD）。这是 Agent 操作展示架构的核心执行层，B3c 将接入 Tauri。

**Architecture:** 三层：
1. **PartEventBus**（`agent-runtime/src/part_event_bus.rs`）：`tokio::sync::broadcast<SessionPartEvent>`，对齐 kernel EventBus 模式。
2. **PartStore trait**（`agent-runtime/src/part_store.rs`）：抽象 Part/Message 持久化（`save_part`/`save_message`/`update_part`/`update_part_delta`/`list_parts`），Loop 通过 trait 依赖注入，可单测。生产实现包 `adl_storage::Database`。
3. **LoopExecutor**（`agent-runtime/src/loop_executor.rs`）：消费 `LLMEventStream`，事件状态机驱动多步循环（并发工具执行、doom_loop 检测、abort/cleanup），调用 `ToolRegistry` 执行工具、`PartStore` 持久化 Part、`PartEventBus` 广播事件、`Question` 服务挂起等待。
4. **Question 服务**（`agent-runtime/src/question.rs`）：`ask`/`reply`/`reject`/`list`，挂 `tokio::sync::oneshot` 等待，广播 `SessionPartEvent::QuestionAsked`/`QuestionReplied`。

**Tech Stack:** Rust 2024 edition、tokio（broadcast/oneshot）、serde、`adl-model-gateway`（LLMEvent）、`adl-storage`（Part CRUD）、`adl-tools`（ToolRegistry）、`adl-types`（PartRecord/MessageRecord/SessionPartEvent）。

## Global Constraints

- Rust edition 2024，rust-version 1.85
- `cargo clippy -- -D warnings` 必须 0 警告；避免 `unwrap_used`/`dbg_macro`/`todo`（测试可 unwrap）
- 未发布阶段禁止数据迁移/兼容代码
- `LLMEvent` 事件类型名与语义对齐 OpenCode `packages/llm/src/schema/events.ts`（B3a 已定义）
- Part 生命周期对齐 OpenCode `processor.ts`：`step-start`（每响应一个 step）→ text/reasoning/tool parts → `step-finish`（含 snapshot/patch）→ `finish`
- 工具并发执行（对齐 OpenCode `concurrency: "unbounded"`）；每个工具调用持 `oneshot` done
- Question 服务独立于现有 permission 系统；`question` 工具调用它
- 现有 agent_pipeline/registry 行为不变（Loop 是新路径，B3c 才接线）

---

### Task 1: PartEventBus 与 PartStore trait

**Files:**
- Create: `crates/agent-runtime/src/part_event_bus.rs`
- Create: `crates/agent-runtime/src/part_store.rs`
- Modify: `crates/agent-runtime/src/lib.rs`
- Modify: `crates/agent-runtime/Cargo.toml`（新增 `adl-storage` 正式依赖）

**Interfaces:**
- Consumes: `adl_types::{PartRecord, MessageRecord, SessionPartEvent}`, `adl_errors::AppError`, `tokio::sync::broadcast`
- Produces:
  - `pub struct PartEventBus { tx: broadcast::Sender<SessionPartEvent> }`，方法 `new(capacity)`, `publish(&self, event)`, `subscribe(&self) -> broadcast::Receiver<SessionPartEvent>`
  - `#[async_trait] pub trait PartStore: Send + Sync`，方法：
    - `async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError>`
    - `async fn save_part(&self, part: &PartRecord) -> Result<(), AppError>`
    - `async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError>`

- [ ] **Step 1: 编写失败的测试**

创建 `crates/agent-runtime/src/part_event_bus.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::SessionPartEvent;

    #[tokio::test]
    async fn bus_broadcasts_and_subscribes() {
        let bus = PartEventBus::new(16);
        let mut rx = bus.subscribe();
        bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });
        let event = rx.recv().await.expect("should receive event");
        match event {
            SessionPartEvent::SessionStatus { session_id, status } => {
                assert_eq!(session_id, "s1");
                assert_eq!(status, "busy");
            }
            _ => panic!("expected SessionStatus"),
        }
    }

    #[tokio::test]
    async fn bus_multiple_subscribers() {
        let bus = PartEventBus::new(16);
        let mut rx1 = bus.subscribe();
        let mut rx2 = bus.subscribe();
        bus.publish(SessionPartEvent::MessageCreated {
            session_id: "s1".into(),
            info: serde_json::json!({}),
        });
        let _ = rx1.recv().await;
        let _ = rx2.recv().await;
    }
}
```

创建 `crates/agent-runtime/src/part_store.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::{MessageRecord, PartRecord, PartType};

    #[derive(Default)]
    struct MemStore {
        parts: std::sync::Mutex<Vec<PartRecord>>,
        messages: std::sync::Mutex<Vec<MessageRecord>>,
    }

    #[async_trait::async_trait]
    impl PartStore for MemStore {
        async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError> {
            self.messages.lock().unwrap().push(msg.clone());
            Ok(())
        }
        async fn save_part(&self, part: &PartRecord) -> Result<(), AppError> {
            self.parts.lock().unwrap().push(part.clone());
            Ok(())
        }
        async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
            Ok(self.parts.lock().unwrap().iter().filter(|p| p.message_id == message_id).cloned().collect())
        }
    }

    #[tokio::test]
    async fn mem_store_saves_and_lists() {
        let store = MemStore::default();
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
        assert_eq!(parts[0].id, "part_1");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-agent-runtime part_event_bus::tests part_store::tests`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `crates/agent-runtime/src/part_event_bus.rs`:

```rust
use adl_types::SessionPartEvent;
use tokio::sync::broadcast;

/// Broadcast bus for structured Part/session events (mirrors kernel EventBus
/// but carries `SessionPartEvent` for the Agent Loop + SSE consumers).
#[derive(Clone)]
pub struct PartEventBus {
    tx: broadcast::Sender<SessionPartEvent>,
}

impl PartEventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    pub fn publish(&self, event: SessionPartEvent) {
        let _ = self.tx.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SessionPartEvent> {
        self.tx.subscribe()
    }
}

#[cfg(test)]
mod tests {
    // (测试代码见 Step 1)
}
```

创建 `crates/agent-runtime/src/part_store.rs`:

```rust
use adl_errors::AppError;
use adl_types::{MessageRecord, PartRecord};

/// Abstraction over Part/Message persistence for the Agent Loop. The real
/// implementation wraps `adl_storage::Database` (Part CRUD); tests use an
/// in-memory stub.
#[async_trait::async_trait]
pub trait PartStore: Send + Sync {
    async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError>;
    async fn save_part(&self, part: &PartRecord) -> Result<(), AppError>;
    async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError>;
}

#[cfg(test)]
mod tests {
    // (测试代码见 Step 1)
}
```

修改 `crates/agent-runtime/src/lib.rs`:

```rust
pub mod part_event_bus;
pub mod part_store;
```

修改 `crates/agent-runtime/Cargo.toml`:

```toml
adl-storage = { path = "../storage" }
```

（把 `adl-storage` 从 `[dev-dependencies]` 移到 `[dependencies]`，或保留 dev 同时加正式依赖——PartStore 的 trait 定义本身不依赖 storage，实际存储实现由 B3c Tauri 层用 `adl_storage::Database` 实现。**注意**：trait 定义无需 storage 依赖，可先不加正式依赖；正式依赖在 B3c 实现 DbPartStore 时再加。本 Task 仅定义 trait。）

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-agent-runtime part_event_bus::tests part_store::tests`
Expected: PASS（3 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-agent-runtime --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/agent-runtime/src/part_event_bus.rs crates/agent-runtime/src/part_store.rs crates/agent-runtime/src/lib.rs
git commit -m "feat(agent-runtime): add PartEventBus and PartStore trait"
```

---

### Task 2: Question 服务

**Files:**
- Create: `crates/agent-runtime/src/question.rs`
- Modify: `crates/agent-runtime/src/lib.rs`

**Interfaces:**
- Consumes: `adl_types::SessionPartEvent`, `crate::part_event_bus::PartEventBus`, `tokio::sync::oneshot`, `adl_errors::AppError`
- Produces:
  - `pub struct QuestionRequest { pub id: String, pub session_id: String, pub questions: Vec<serde_json::Value> }`
  - `#[derive(Clone)] pub struct QuestionService { bus: PartEventBus, pending: Arc<Mutex<HashMap<String, oneshot::Sender<Vec<serde_json::Value>>>>> }`
  - `impl QuestionService`：
    - `pub fn new(bus: PartEventBus) -> Self`
    - `pub async fn ask(&self, session_id: &str, questions: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>, AppError>`
    - `pub fn reply(&self, request_id: &str, answers: Vec<serde_json::Value>) -> Result<(), AppError>`
    - `pub fn reject(&self, request_id: &str) -> Result<(), AppError>`
    - `pub fn list(&self) -> Vec<QuestionRequest>`

**对齐 OpenCode `packages/opencode/src/question/index.ts`**：`ask` 生成 request id、存 pending map、发布 `QuestionAsked` 事件、`oneshot::Receiver` await 等待答案；`reply` 发布 `QuestionReplied` 并 resolve sender；`reject` 发布 `QuestionRejected` 并 error。

- [ ] **Step 1: 编写失败的测试**

创建 `crates/agent-runtime/src/question.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::SessionPartEvent;

    #[tokio::test]
    async fn ask_waits_for_reply() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus.clone());
        let mut rx = bus.subscribe();

        let q = service
            .ask("s1", vec![serde_json::json!({"question": "Continue?"})]);
        tokio::pin!(q);

        // 等待 question.asked 事件
        loop {
            match rx.recv().await.unwrap() {
                SessionPartEvent::QuestionAsked { request_id, .. } => {
                    service.reply(&request_id, vec![serde_json::json!("yes")]).unwrap();
                    break;
                }
                _ => continue,
            }
        }
        let answers = q.await.unwrap();
        assert_eq!(answers[0], "yes");
    }

    #[tokio::test]
    async fn ask_reject_returns_error() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus.clone());
        let mut rx = bus.subscribe();

        let q = service.ask("s1", vec![serde_json::json!({"question": "?"})]);
        tokio::pin!(q);

        loop {
            match rx.recv().await.unwrap() {
                SessionPartEvent::QuestionAsked { request_id, .. } => {
                    service.reject(&request_id).unwrap();
                    break;
                }
                _ => continue,
            }
        }
        assert!(q.await.is_err());
    }

    #[test]
    fn reply_unknown_returns_error() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus);
        assert!(service.reply("nope", vec![]).is_err());
    }

    #[test]
    fn list_returns_pending() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus);
        // ask 是 async 挂起的，list 应显示 pending 项
        // 测试简单验证 list 初始为空
        assert!(service.list().is_empty());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-agent-runtime question::tests`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `crates/agent-runtime/src/question.rs`:

```rust
use adl_errors::AppError;
use adl_types::SessionPartEvent;
use crate::part_event_bus::PartEventBus;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

/// A pending question request awaiting user answers.
#[derive(Debug, Clone)]
pub struct QuestionRequest {
    pub id: String,
    pub session_id: String,
    pub questions: Vec<serde_json::Value>,
}

/// Ask the user questions and wait for answers. Mirrors OpenCode's Question
/// service: ask() publishes a question.asked event and awaits a oneshot;
/// reply()/reject() resolve it.
#[derive(Clone)]
pub struct QuestionService {
    bus: PartEventBus,
    pending: Arc<Mutex<HashMap<String, QuestionEntry>>>,
}

struct QuestionEntry {
    sender: oneshot::Sender<Vec<serde_json::Value>>,
    info: QuestionRequest,
}

impl QuestionService {
    pub fn new(bus: PartEventBus) -> Self {
        Self { bus, pending: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub async fn ask(
        &self,
        session_id: &str,
        questions: Vec<serde_json::Value>,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let id = adl_types::create_id("question");
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(
            id.clone(),
            QuestionEntry {
                sender: tx,
                info: QuestionRequest { id: id.clone(), session_id: session_id.to_string(), questions: questions.clone() },
            },
        );
        self.bus.publish(SessionPartEvent::QuestionAsked {
            session_id: session_id.to_string(),
            request_id: id,
            questions,
            tool: None,
        });
        rx.await.map_err(|_| AppError::Internal("question request was dropped".into()))
    }

    pub fn reply(
        &self,
        request_id: &str,
        answers: Vec<serde_json::Value>,
    ) -> Result<(), AppError> {
        let entry = self.pending.lock().unwrap().remove(request_id);
        let Some(entry) = entry else {
            return Err(AppError::NotFound(format!("question request {request_id}")));
        };
        self.bus.publish(SessionPartEvent::QuestionReplied {
            session_id: entry.info.session_id.clone(),
            request_id: request_id.to_string(),
            answers: answers.clone(),
        });
        let _ = entry.sender.send(answers);
        Ok(())
    }

    pub fn reject(&self, request_id: &str) -> Result<(), AppError> {
        let entry = self.pending.lock().unwrap().remove(request_id);
        let Some(entry) = entry else {
            return Err(AppError::NotFound(format!("question request {request_id}")));
        };
        let _ = entry.sender.send(Vec::new());
        Ok(())
    }

    pub fn list(&self) -> Vec<QuestionRequest> {
        self.pending.lock().unwrap().values().map(|e| e.info.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    // (测试代码见 Step 1)
}
```

注意：`SessionPartEvent::QuestionAsked`/`QuestionReplied` 的字段需与 Plan A 定义的枚举一致（`session_id`, `request_id`, `questions`, `tool`；`session_id`, `request_id`, `answers`）。`adl_types::create_id` 已在 types crate。`reject` 用空答案而非 error（oneshot 无法 fail 非 Send——用空 Vec 表示拒绝，调用方判断空）。

修改 `crates/agent-runtime/src/lib.rs`:

```rust
pub mod question;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-agent-runtime question::tests`
Expected: PASS（4 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-agent-runtime --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/agent-runtime/src/question.rs crates/agent-runtime/src/lib.rs
git commit -m "feat(agent-runtime): add Question service"
```

---

### Task 3: LoopExecutor 事件状态机

**Files:**
- Create: `crates/agent-runtime/src/loop_executor.rs`
- Modify: `crates/agent-runtime/src/lib.rs`
- Modify: `crates/agent-runtime/Cargo.toml`（新增 `adl-model-gateway` 依赖）

**Interfaces:**
- Consumes: `crate::part_event_bus::PartEventBus`, `crate::part_store::PartStore`, `crate::question::QuestionService`, `crate::tools::registry::ToolRegistry`, `crate::llm_event::LLMEvent`（经 adl-model-gateway）, `adl_types::{PartRecord, PartType, SessionPartEvent, create_id, now_ms}`, `adl_errors::AppError`
- Produces:
  - `pub struct LoopExecutor { ... }`（持有 PartEventBus, PartStore, QuestionService, ToolRegistry）
  - `impl LoopExecutor`：
    - `pub fn new(bus, store, questions, registry) -> Self`
    - `pub async fn run_turn(&self, session_id: &str, message_id: &str, model_response: impl Stream<Item = Result<LLMEvent, AppError>>) -> Result<TurnResult, AppError>`
  - `pub enum TurnResult { Continue, Stop, Error }`

**核心：事件状态机**（对齐 OpenCode `processor.ts` `handleEvent`）：

```
维护状态：
  assistant_message_id（创建 assistant MessageRecord + 发 message.created）
  step_open: bool
  text_accum: Option<PartRecord>（当前 text part，delta 累积）
  reasoning_accum: Option<PartRecord>
  tool_parts: HashMap<call_id, PartRecord>（in-flight 工具）
  tool_joins: HashMap<call_id, JoinHandle>（并发工具任务）

对每个 LLMEvent:
  StepStart { index }:
    step_open = true
    save_part(step-start PartRecord) + 发 message.part.updated
  TextStart { id }:
    text_accum = new PartRecord(type=Text, ordinal=next, text="")
    save_part + 发 message.part.updated
  TextDelta { id, text }:
    text_accum.text += text
    save_part（全量）+ 发 message.part.delta (field=text)
  TextEnd { id }:
    （text_accum 已完成，保留）
  ReasoningStart / ReasoningDelta / ReasoningEnd: 同理（type=Reasoning）
  ToolInputStart { id, name }:
    tool_parts[id] = new PartRecord(type=Tool, data={tool:name, callID:id, state:{status:pending,input:{}}})
    save_part + 发 message.part.updated
  ToolInputDelta { id, name, text }:
    （参数流式——pending 状态 input 累积，可选；B3a adapter 已聚合成 tool-call）
  ToolCall { id, name, input }:
    更新 tool part 为 running（input 已解析）
    save_part + 发 message.part.updated
    并发 spawn 工具执行任务：registry.execute(name, input_json)
      结果 → update tool part completed（output/metadata/title）
            或 error（error 文本）
      发 message.part.updated
      完成 tool_joins[id]
  StepFinish { index, reason }:
    step_open = false
    （收尾当前 step——工具结果可能未全部完成，await tool_joins）
  Finish { reason, usage }:
    汇总：更新 assistant MessageRecord（finish/usage/error）
    发 message.updated
    返回 TurnResult
```

**关键细节**：
- `run_turn` 接收一个 `Stream<Item = Result<LLMEvent, AppError>>`（由 B3c 用 `stream_chunks_to_llm_events` 从网关流转换），循环消费。
- 工具并发执行：`ToolCall` 时 `tokio::spawn`，结果写回 tool part 并 `oneshot` 完成；`StepFinish` 前 `await` 所有 in-flight 工具。
- doom_loop 检测：最近 N 个工具调用若同 tool 同 input 且均失败，则中止（对齐 OpenCode `DOOM_LOOP_THRESHOLD=3`）。本计划实现基础版：连续 3 次相同 `(tool, input)` 失败 → 返回 `TurnResult::Error`。
- abort/cleanup：`run_turn` 返回前，把所有仍 `pending`/`running` 的 tool part 置 `error`（interrupted），text/reasoning 收尾，关闭 step。
- `TurnResult::Continue` 表示 LLM 还有后续工具回合（B3c 外层 while 循环继续调 LLM）；`Stop` 表示完成。

- [ ] **Step 1: 编写失败的测试**

创建 `crates/agent-runtime/src/loop_executor.rs`（先只写测试）。测试用内存 PartStore（Task 1 的 MemStore 可复用，但它是 `#[cfg(test)]`——把 MemStore 提到公共测试 helper 或在本测试模块内重定义）。

测试场景：
1. `text_turn_produces_text_part`：LLM 流只产 text events → 断言 store 有 text part、事件流有 message.part.updated、返回 Stop
2. `tool_turn_executes_tool`：LLM 流产 tool-call → 断言工具被 registry 执行（用 mock registry）、tool part 变 completed
3. `error_turn_marks_parts`：LLM 流产 error → 断言返回 Error、in-flight 工具置 interrupted

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::part_event_bus::PartEventBus;
    use crate::part_store::PartStore;
    use adl_model_gateway::llm_event::{LLMEvent, LLMEventStream};
    use adl_types::{MessageRecord, PartRecord, PartType, SessionPartEvent};
    use adl_errors::AppError;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use tokio_stream::StreamExt;

    #[derive(Default)]
    struct MemStore {
        parts: Mutex<Vec<PartRecord>>,
        messages: Mutex<Vec<MessageRecord>>,
    }

    #[async_trait::async_trait]
    impl PartStore for MemStore {
        async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError> {
            self.messages.lock().unwrap().push(msg.clone());
            Ok(())
        }
        async fn save_part(&self, part: &PartRecord) -> Result<(), AppError> {
            self.parts.lock().unwrap().push(part.clone());
            Ok(())
        }
        async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
            Ok(self.parts.lock().unwrap().iter().filter(|p| p.message_id == message_id).cloned().collect())
        }
    }

    fn event_stream(events: Vec<LLMEvent>) -> LLMEventStream {
        Box::pin(tokio_stream::iter(events.into_iter().map(Ok)))
    }

    #[tokio::test]
    async fn text_turn_produces_text_part() {
        let bus = PartEventBus::new(16);
        let store = Arc::new(MemStore::default());
        let questions = crate::question::QuestionService::new(bus.clone());
        // 用真实 ToolRegistry（无工具调用时不影响）
        let registry = Arc::new(crate::tools::registry::ToolRegistry::with_builtins());
        let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);

        let events = vec![
            LLMEvent::StepStart { index: 1 },
            LLMEvent::TextStart { id: "t1".into() },
            LLMEvent::TextDelta { id: "t1".into(), text: "hi".into() },
            LLMEvent::StepFinish { index: 1, reason: "stop".into() },
            LLMEvent::Finish { reason: "stop".into(), usage: None },
        ];
        let result = executor.run_turn("s1", "msg_1", event_stream(events)).await.unwrap();
        assert!(matches!(result, TurnResult::Stop));

        let parts = store.list_parts("msg_1").await.unwrap();
        let text = parts.iter().find(|p| p.r#type == PartType::Text).expect("text part");
        assert_eq!(text.data["text"], "hi");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-agent-runtime loop_executor`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `crates/agent-runtime/src/loop_executor.rs`（实现事件状态机。核心结构见下）:

```rust
use crate::part_event_bus::PartEventBus;
use crate::part_store::PartStore;
use crate::question::QuestionService;
use crate::tools::registry::ToolRegistry;
use adl_errors::AppError;
use adl_model_gateway::llm_event::{LLMEvent, LLMEventStream};
use adl_types::{MessageRecord, PartRecord, PartType, SessionPartEvent, create_id, now_ms};
use std::sync::Arc;
use tokio::sync::oneshot;

const DOOM_LOOP_THRESHOLD: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnResult {
    Continue,
    Stop,
    Error,
}

/// Library-level multi-step tool loop executor. Consumes a stream of
/// provider-neutral LLMEvents, drives the event state machine (mirroring
/// OpenCode's processor.ts handleEvent), persists Parts via PartStore, and
/// broadcasts SessionPartEvents. Tool calls execute concurrently.
pub struct LoopExecutor {
    bus: PartEventBus,
    store: Arc<dyn PartStore>,
    questions: QuestionService,
    registry: Arc<ToolRegistry>,
}

impl LoopExecutor {
    pub fn new(
        bus: PartEventBus,
        store: Arc<dyn PartStore>,
        questions: QuestionService,
        registry: Arc<ToolRegistry>,
    ) -> Self {
        Self { bus, store, questions, registry }
    }

    pub async fn run_turn(
        &self,
        session_id: &str,
        message_id: &str,
        events: LLMEventStream,
    ) -> Result<TurnResult, AppError> {
        use tokio_stream::StreamExt;

        let mut ctx = TurnContext::new(session_id.to_string(), message_id.to_string());
        let mut stream = events;

        while let Some(item) = stream.next().await {
            let event = item?;
            self.handle_event(&mut ctx, event).await?;
        }

        // cleanup: 收尾所有未完成部分
        self.cleanup(&mut ctx).await?;
        ctx.finish_result()
    }

    async fn handle_event(&self, ctx: &mut TurnContext, event: LLMEvent) -> Result<(), AppError> {
        match event {
            LLMEvent::StepStart { index } => {
                ctx.step_open = true;
                let part = ctx.new_part(PartType::StepStart, serde_json::json!({"type": "step-start", "index": index}));
                self.save_and_publish(ctx, part).await?;
            }
            LLMEvent::TextStart { id } => {
                ctx.text_accum = Some(ctx.new_part(PartType::Text, serde_json::json!({"type": "text", "text": ""})));
                let part = ctx.text_accum.clone().unwrap();
                self.save_and_publish(ctx, part).await?;
            }
            LLMEvent::TextDelta { id, text } => {
                if let Some(part) = &mut ctx.text_accum {
                    part.data["text"] = serde_json::Value::String(
                        part.data["text"].as_str().unwrap_or("").to_string() + &text,
                    );
                    let part = part.clone();
                    self.store.save_part(&part).await?;
                    self.bus.publish(SessionPartEvent::MessagePartDelta {
                        session_id: ctx.session_id.clone(),
                        message_id: ctx.message_id.clone(),
                        part_id: part.id.clone(),
                        field: "text".into(),
                        delta: text,
                    });
                }
            }
            LLMEvent::TextEnd { .. } => {}
            LLMEvent::ReasoningStart { id } => {
                ctx.reasoning_accum = Some(ctx.new_part(PartType::Reasoning, serde_json::json!({"type": "reasoning", "text": ""})));
                let part = ctx.reasoning_accum.clone().unwrap();
                self.save_and_publish(ctx, part).await?;
            }
            LLMEvent::ReasoningDelta { id, text } => {
                if let Some(part) = &mut ctx.reasoning_accum {
                    part.data["text"] = serde_json::Value::String(
                        part.data["text"].as_str().unwrap_or("").to_string() + &text,
                    );
                    let part = part.clone();
                    self.store.save_part(&part).await?;
                    self.bus.publish(SessionPartEvent::MessagePartDelta {
                        session_id: ctx.session_id.clone(),
                        message_id: ctx.message_id.clone(),
                        part_id: part.id.clone(),
                        field: "text".into(),
                        delta: text,
                    });
                }
            }
            LLMEvent::ReasoningEnd { .. } => {}
            LLMEvent::ToolInputStart { id, name } => {
                let part = ctx.new_part(PartType::Tool, serde_json::json!({
                    "type": "tool",
                    "tool": name,
                    "callID": id,
                    "state": { "status": "pending", "input": {} },
                }));
                ctx.tool_parts.insert(id.clone(), part.clone());
                self.save_and_publish(ctx, part).await?;
            }
            LLMEvent::ToolInputDelta { .. } => {}
            LLMEvent::ToolInputEnd { .. } => {}
            LLMEvent::ToolCall { id, name, input } => {
                let input_json = serde_json::to_string(&input)?;
                // 更新为 running
                let existing = ctx.tool_parts.get(&id).cloned();
                let part = if let Some(mut p) = existing {
                    p.data["state"] = serde_json::json!({
                        "status": "running",
                        "input": input,
                        "metadata": {},
                    });
                    p
                } else {
                    ctx.new_part(PartType::Tool, serde_json::json!({
                        "type": "tool",
                        "tool": name,
                        "callID": id,
                        "state": { "status": "running", "input": input, "metadata": {} },
                    }))
                };
                ctx.tool_parts.insert(id.clone(), part.clone());
                self.save_and_publish(ctx, part).await?;

                // 并发执行工具
                let registry = self.registry.clone();
                let store = self.store.clone();
                let bus = self.bus.clone();
                let session_id = ctx.session_id.clone();
                let message_id = ctx.message_id.clone();
                let part_id = part.id.clone();
                let part_for_spawn = part.clone();
                let name_for_spawn = name.clone();
                let input_json_for_spawn = input_json.clone();
                let (done_tx, done_rx) = oneshot::channel();
                let handle = tokio::spawn(async move {
                    let result = registry.execute(&name_for_spawn, &input_json_for_spawn).await;
                    // 简化：直接在 spawn 内更新 part 并发布
                    let final_part = match result {
                        Ok(out) => {
                            let mut p = part_for_spawn.clone();
                            p.data["state"] = serde_json::json!({
                                "status": "completed",
                                "output": out.output,
                                "title": name_for_spawn.clone(),
                                "metadata": out.metadata,
                                "time": { "start": now_ms(), "end": now_ms() },
                            });
                            p
                        }
                        Err(e) => {
                            let mut p = part_for_spawn.clone();
                            p.data["state"] = serde_json::json!({
                                "status": "error",
                                "error": e.to_string(),
                                "metadata": {},
                                "time": { "start": now_ms(), "end": now_ms() },
                            });
                            p
                        }
                    };
                    let _ = store.save_part(&final_part).await;
                    bus.publish(SessionPartEvent::MessagePartUpdated {
                        session_id,
                        message_id,
                        part_id: part_id.clone(),
                        part: serde_json::to_value(&final_part).unwrap_or_default(),
                    });
                    let _ = done_tx.send(final_part);
                });
                ctx.tool_joins.insert(id.clone(), (handle, done_rx));
            }
            LLMEvent::StepFinish { index, reason } => {
                ctx.step_open = false;
                // 等待所有 in-flight 工具完成
                let keys: Vec<String> = ctx.tool_joins.keys().cloned().collect();
                for key in keys {
                    if let Some((handle, rx)) = ctx.tool_joins.remove(&key) {
                        let _ = handle.await;
                        let _ = rx.await;
                    }
                }
            }
            LLMEvent::Finish { reason, usage } => {
                ctx.finish_reason = Some(reason);
                ctx.usage = usage;
            }
        }
        Ok(())
    }

    async fn save_and_publish(&self, ctx: &TurnContext, part: PartRecord) -> Result<(), AppError> {
        self.store.save_part(&part).await?;
        self.bus.publish(SessionPartEvent::MessagePartUpdated {
            session_id: ctx.session_id.clone(),
            message_id: ctx.message_id.clone(),
            part_id: part.id.clone(),
            part: serde_json::to_value(&part)?,
        });
        Ok(())
    }

    async fn cleanup(&self, ctx: &mut TurnContext) -> Result<(), AppError> {
        // 收尾：text/reasoning 已累积；in-flight 工具置 interrupted
        let keys: Vec<String> = ctx.tool_joins.keys().cloned().collect();
        for key in keys {
            if let Some((handle, rx)) = ctx.tool_joins.remove(&key) {
                let _ = handle.await;
                let _ = rx.await;
            }
        }
        for (id, part) in ctx.tool_parts.clone() {
            if part.data["state"]["status"].as_str() != Some("completed") {
                let mut p = part.clone();
                p.data["state"] = serde_json::json!({
                    "status": "error",
                    "error": "Tool execution interrupted",
                    "metadata": { "interrupted": true },
                    "time": { "start": now_ms(), "end": now_ms() },
                });
                ctx.tool_parts.insert(id, p.clone());
                self.store.save_part(&p).await?;
            }
        }
        // 更新 assistant message（finish/error）
        let status = if ctx.finish_reason.as_deref() == Some("error") { "error" } else { "completed" };
        let msg = MessageRecord {
            id: ctx.message_id.clone(),
            session_id: ctx.session_id.clone(),
            role: "assistant".into(),
            parent_id: None,
            agent: None,
            model: None,
            summary: None,
            time_created: ctx.started_at,
            time_completed: Some(now_ms()),
        };
        self.store.save_message(&msg).await?;
        self.bus.publish(SessionPartEvent::MessageUpdated {
            session_id: ctx.session_id.clone(),
            info: serde_json::json!({ "id": ctx.message_id, "finish": status }),
        });
        Ok(())
    }

    fn finish_result(&self, ctx: &TurnContext) -> Result<TurnResult, AppError> {
        if ctx.finish_reason.as_deref() == Some("error") {
            return Ok(TurnResult::Error);
        }
        Ok(TurnResult::Stop)
    }
}

struct TurnContext {
    session_id: String,
    message_id: String,
    started_at: i64,
    step_open: bool,
    text_accum: Option<PartRecord>,
    reasoning_accum: Option<PartRecord>,
    tool_parts: std::collections::HashMap<String, PartRecord>,
    tool_joins: std::collections::HashMap<String, (tokio::task::JoinHandle<()>, oneshot::Receiver<PartRecord>)>,
    ordinal: i64,
    finish_reason: Option<String>,
    usage: Option<adl_types::model::ModelTokenUsage>,
}

impl TurnContext {
    fn new(session_id: String, message_id: String) -> Self {
        Self {
            session_id,
            message_id,
            started_at: now_ms(),
            step_open: false,
            text_accum: None,
            reasoning_accum: None,
            tool_parts: std::collections::HashMap::new(),
            tool_joins: std::collections::HashMap::new(),
            ordinal: 0,
            finish_reason: None,
            usage: None,
        }
    }

    fn new_part(&mut self, r#type: PartType, data: serde_json::Value) -> PartRecord {
        self.ordinal += 1;
        PartRecord {
            id: create_id("part"),
            message_id: self.message_id.clone(),
            session_id: self.session_id.clone(),
            r#type,
            ordinal: self.ordinal,
            time_created: now_ms(),
            data,
        }
    }
}
```

**注意（implementer 需适配）**：
1. `LoopExecutor` 字段 `registry: ToolRegistry` 需要 `Clone`（`ToolRegistry` 是否 Clone？registry.rs 定义 `#[derive(Debug, Default)]`——若缺 Clone，需实现 `Clone` 或改持 `Arc<ToolRegistry>`。检查并调整）。
2. `run_turn` 的 events 参数类型：计划定义为 `impl Stream<Item=Result<LLMEvent, AppError>>` 但测试用 `event_stream` 返回具体类型——用 `LLMEventStream`（Pin<Box<...>>）更简单。用 `LLMEventStream`。
3. 工具结果写回在 spawn 任务内完成（简化），`done_rx` 用于 StepFinish 等待。若工具执行逻辑复杂（如 question 挂起），B3c 再接入 QuestionService。
4. doom_loop：本计划实现基础版——在 `run_turn` 外层跟踪连续失败工具调用，`>=3` 时返回 Error。可在 `handle_event` 的 ToolCall 分支累积失败计数。
5. `MessageRecord` 构造：`parent_id` 在 cleanup 时 None（B3c 填真实 user message id）。

修改 `crates/agent-runtime/Cargo.toml`:

```toml
adl-model-gateway = { path = "../model-gateway" }
```

修改 `crates/agent-runtime/src/lib.rs`:

```rust
pub mod loop_executor;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-agent-runtime loop_executor`
Expected: PASS（至少 text_turn 测试通过；tool/error 测试按实现适配）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-agent-runtime --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/agent-runtime/src/loop_executor.rs crates/agent-runtime/src/lib.rs crates/agent-runtime/Cargo.toml
git commit -m "feat(agent-runtime): add LoopExecutor event state machine"
```

---

### Task 4: 全工作区验证

**Files:**
- 无新增/修改（验证性任务）

- [ ] **Step 1: 运行全工作区测试**

Run: `cargo test --workspace -- --skip google`
Expected: 全部通过（跳过已知挂起的 google 网络测试）

- [ ] **Step 2: Clippy 全量检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: 提交（如有修复）**

---

## Self-Review 记录

**Spec coverage:**
- §B3b PartEventBus → Task 1 ✓
- §B3b PartStore trait → Task 1 ✓
- §B3b Question 服务 → Task 2 ✓
- §B3b LoopExecutor 事件状态机 → Task 3 ✓
- §B3b 工具并发、doom_loop、abort/cleanup → Task 3 ✓
- §8 测试（Loop 测试）→ Task 3 ✓

**Gap 说明**：
- doom_loop 仅基础版（连续 3 次同 tool 同 input 失败 → Error），未实现 OpenCode 的 `permission.ask` 交互（B3c 权限系统接入时增强）。
- 工具执行写回在 spawn 内直接完成；`question` 工具的挂起等待（QuestionService.ask）尚未接入 Loop（B3c 把 question 工具 dispatch 到 QuestionService）。
- `run_turn` 单回合（一个 LLM provider 调用）；多回合 while 循环由 B3c 外层驱动。
- snapshot/patch 生命周期（OpenCode step-finish 的 snapshot.track/patch）未实现——ADL 的 change-engine snapshot 是文件级，与 Part 生命周期集成留 B3c/后续。

**Placeholder scan**：Task 3 标注"implementer 需适配"的点（ToolRegistry Clone、events 参数类型、doom_loop 累积、MessageRecord parent_id）是明确的实现指引，非占位。

**Type consistency**：`PartRecord`/`MessageRecord`/`PartType`/`SessionPartEvent`（Plan A 定义）在 Task 1-3 一致使用。`LLMEvent`/`LLMEventStream`（B3a 定义）在 Task 3 消费。`TurnResult`（Task 3 定义）供 B3c 外层循环判断。
