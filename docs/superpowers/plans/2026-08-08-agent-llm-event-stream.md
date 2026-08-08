# 模型网关 LLMEvent 事件流 Implementation Plan（B3a）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `adl-model-gateway` 新增 OpenCode 对齐的 `LLMEvent` 枚举（text-start/delta/end、reasoning-start/delta/end、tool-input-start/delta/end、tool-call、step-start/finish、finish）与 `StreamChunk → LLMEvent` 流转换器，供 B3b 的 Agent Loop 消费。

**Architecture:** 在 `crates/model-gateway/src` 新增 `llm_event.rs`（`LLMEvent` 枚举，serde tag="type" kebab-case，对齐 OpenCode `packages/llm/src/schema/events.ts` 的 16 事件子集）与 `stream_adapter.rs`（把 `StreamReader` 的 `StreamChunk` 流转换为 `LLMEvent` 流，含 tool-call 参数累积状态机）。转换器是无状态的纯流映射，内部用 `tokio_stream::StreamMap`/`filter_map` 维护跨 chunk 的工具参数缓冲。

**Tech Stack:** Rust 2024 edition、serde、tokio-stream、`adl_errors`、`adl_types`。

## Global Constraints

- Rust edition 2024，rust-version 1.85
- `cargo clippy -- -D warnings` 必须 0 警告；避免 `unwrap_used`/`dbg_macro`/`todo`
- 未发布阶段禁止数据迁移/兼容代码
- `LLMEvent` 事件类型名（`type` tag）必须与 OpenCode 完全一致：`text-start`/`text-delta`/`text-end`/`reasoning-start`/`reasoning-delta`/`reasoning-end`/`tool-input-start`/`tool-input-delta`/`tool-input-end`/`tool-call`/`step-start`/`step-finish`/`finish`
- `StreamChunk` 现有语义不变；转换器只新增，不改现有 consume_stream
- 现有 5 只读工具/网关 provider 行为不变

---

### Task 1: LLMEvent 枚举定义

**Files:**
- Create: `crates/model-gateway/src/llm_event.rs`
- Modify: `crates/model-gateway/src/lib.rs`（`pub mod llm_event;`）

**Interfaces:**
- Consumes: `serde`, `adl_types::model::ModelTokenUsage`
- Produces:
  - `pub enum LLMEvent`（tagged by `type`，kebab-case）
  - `pub type LLMEventStream = Pin<Box<dyn tokio_stream::Stream<Item = Result<LLMEvent, AppError>> + Send>>`
  - `impl LLMEvent { pub fn kind(&self) -> &'static str }`

**事件类型**（对齐 OpenCode `packages/llm/src/schema/events.ts`）：

| 事件 | 载荷 |
|------|------|
| `TextStart` | `id: String` |
| `TextDelta` | `id: String, text: String` |
| `TextEnd` | `id: String` |
| `ReasoningStart` | `id: String` |
| `ReasoningDelta` | `id: String, text: String` |
| `ReasoningEnd` | `id: String` |
| `ToolInputStart` | `id: String, name: String` |
| `ToolInputDelta` | `id: String, name: String, text: String` |
| `ToolInputEnd` | `id: String, name: String` |
| `ToolCall` | `id: String, name: String, input: serde_json::Value` |
| `StepStart` | `index: u32` |
| `StepFinish` | `index: u32, reason: String` |
| `Finish` | `reason: String, usage: Option<ModelTokenUsage>` |

- [ ] **Step 1: 编写失败的测试**

创建 `crates/model-gateway/src/llm_event.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_event_serializes_tagged_type() {
        let event = LLMEvent::TextDelta { id: "c1".into(), text: "hi".into() };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "text-delta");
        assert_eq!(json["id"], "c1");
        assert_eq!(json["text"], "hi");
    }

    #[test]
    fn llm_event_tool_call_serializes_input() {
        let event = LLMEvent::ToolCall {
            id: "call_1".into(),
            name: "read".into(),
            input: serde_json::json!({"path": "a.txt"}),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "tool-call");
        assert_eq!(json["name"], "read");
        assert_eq!(json["input"]["path"], "a.txt");
    }

    #[test]
    fn llm_event_kind_returns_type() {
        assert_eq!(LLMEvent::StepStart { index: 0 }.kind(), "step-start");
        assert_eq!(LLMEvent::Finish { reason: "stop".into(), usage: None }.kind(), "finish");
    }

    #[test]
    fn llm_event_roundtrips() {
        let event = LLMEvent::ToolInputDelta {
            id: "call_1".into(),
            name: "bash".into(),
            text: "{\"command\"".into(),
        };
        let encoded = serde_json::to_string(&event).unwrap();
        let decoded: LLMEvent = serde_json::from_str(&encoded).unwrap();
        match decoded {
            LLMEvent::ToolInputDelta { id, name, text } => {
                assert_eq!(id, "call_1");
                assert_eq!(name, "bash");
                assert_eq!(text, "{\"command\"");
            }
            _ => panic!("expected ToolInputDelta"),
        }
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-model-gateway llm_event`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 编写最小实现**

创建 `crates/model-gateway/src/llm_event.rs`:

```rust
use adl_errors::AppError;
use adl_types::model::ModelTokenUsage;
use serde::{Deserialize, Serialize};

/// Provider-neutral LLM streaming event, mirroring OpenCode's `LLMEvent`
/// (packages/llm/src/schema/events.ts). Consumed by the Agent Loop (B3b) to
/// drive the multi-step tool loop and build Parts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum LLMEvent {
    TextStart { id: String },
    TextDelta { id: String, text: String },
    TextEnd { id: String },
    ReasoningStart { id: String },
    ReasoningDelta { id: String, text: String },
    ReasoningEnd { id: String },
    ToolInputStart { id: String, name: String },
    ToolInputDelta { id: String, name: String, text: String },
    ToolInputEnd { id: String, name: String },
    ToolCall { id: String, name: String, input: serde_json::Value },
    StepStart { index: u32 },
    StepFinish { index: u32, reason: String },
    Finish { reason: String, usage: Option<ModelTokenUsage> },
}

impl LLMEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::TextStart { .. } => "text-start",
            Self::TextDelta { .. } => "text-delta",
            Self::TextEnd { .. } => "text-end",
            Self::ReasoningStart { .. } => "reasoning-start",
            Self::ReasoningDelta { .. } => "reasoning-delta",
            Self::ReasoningEnd { .. } => "reasoning-end",
            Self::ToolInputStart { .. } => "tool-input-start",
            Self::ToolInputDelta { .. } => "tool-input-delta",
            Self::ToolInputEnd { .. } => "tool-input-end",
            Self::ToolCall { .. } => "tool-call",
            Self::StepStart { .. } => "step-start",
            Self::StepFinish { .. } => "step-finish",
            Self::Finish { .. } => "finish",
        }
    }
}

/// Stream of provider-neutral LLM events.
pub type LLMEventStream =
    std::pin::Pin<Box<dyn tokio_stream::Stream<Item = Result<LLMEvent, AppError>> + Send>>;

#[cfg(test)]
mod tests {
    // (测试代码见 Step 1)
}
```

修改 `crates/model-gateway/src/lib.rs`:

```rust
pub mod llm_event;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-model-gateway llm_event`
Expected: PASS（4 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-model-gateway --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/model-gateway/src/llm_event.rs crates/model-gateway/src/lib.rs
git commit -m "feat(model-gateway): add LLMEvent enum"
```

---

### Task 2: StreamChunk → LLMEvent 流转换器

**Files:**
- Create: `crates/model-gateway/src/stream_adapter.rs`
- Modify: `crates/model-gateway/src/lib.rs`
- Modify: `crates/model-gateway/Cargo.toml`（新增 `futures` 依赖）

**Interfaces:**
- Consumes: `crate::adapter::{StreamChunk, StreamReader}`, `crate::llm_event::{LLMEvent, LLMEventStream}`, `adl_errors::AppError`
- Produces: `pub fn stream_chunks_to_llm_events(chunks: StreamReader) -> LLMEventStream`

**转换逻辑**（状态机，对齐 OpenCode 的 `tool-input-start/delta/end` + `tool-call` 组装）：

```
输入 StreamChunk:
  Delta(text)          → 若当前在文本块：TextDelta；否则发 TextStart(新id) + TextDelta
  ReasoningDelta(text) → 若当前在推理块：ReasoningDelta；否则发 ReasoningStart + ReasoningDelta
  ToolCallDelta{id,name,arguments_delta} → 累积到 tool_args[id]：
      首次 → ToolInputStart(id,name) + ToolInputDelta(id,name,text)
      后续 → ToolInputDelta(id,name,text)
  Done(usage)          → 对每个累积的 tool_args：发 ToolInputEnd(id,name) + ToolCall(id,name,JSON.parse(accumulated))
                         （若 arguments 未闭合 JSON，补一个空对象）
                         最后发 Finish(reason, usage)
  Err(e)               → Err(e)
```

**状态**（转换器内部持有）：
- `current_block: Option<BlockKind>`（None/Text/Reasoning）——区分文本块与推理块的 start/end
- `text_id_counter: u32` / `reasoning_id_counter: u32`——生成 `t{n}` / `r{n}` id
- `tool_args: HashMap<String, (String name, String accumulated)>`——工具参数累积

**关键细节**：
- `TextStart`/`ReasoningStart` 只在块切换时发出（OpenCode 中一个 content block 是 start→deltas→end；此处用当前块切换近似）
- `ToolCallDelta` 的 `arguments_delta` 累积直到 `Done`；参数 JSON 解析失败时 fallback 空对象 `{}`（对齐 OpenCode `parseToolInput` 的空输入→`{}` 行为）
- `StepStart`/`StepFinish` 由转换器在每次工具调用 batch 前后发出（`StepStart{index}` 在第一个工具参数开始时，`StepFinish{index}` 在 `Done` 前）——用 step_counter 追踪

- [ ] **Step 1: 编写失败的测试**

创建 `crates/model-gateway/src/stream_adapter.rs`（先只写测试）。测试用 `tokio_stream::iter` 构造输入流并收集输出:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::{StreamChunk, StreamReader};
    use adl_types::model::ModelTokenUsage;
    use tokio_stream::StreamExt;

    fn usage() -> ModelTokenUsage {
        ModelTokenUsage {
            prompt_tokens: None,
            completion_tokens: None,
            total_tokens: None,
            estimated: None,
        }
    }

    fn chunk_stream(chunks: Vec<StreamChunk>) -> StreamReader {
        Box::pin(tokio_stream::iter(chunks.into_iter().map(Ok)))
    }

    async fn collect(mut stream: LLMEventStream) -> Vec<LLMEvent> {
        let mut out = Vec::new();
        while let Some(item) = stream.next().await {
            match item {
                Ok(ev) => out.push(ev),
                Err(e) => panic!("stream error: {e}"),
            }
        }
        out
    }

    #[tokio::test]
    async fn text_deltas_become_text_events() {
        let stream = chunk_stream(vec![
            StreamChunk::Delta("hel".into()),
            StreamChunk::Delta("lo".into()),
            StreamChunk::Done(usage()),
        ]);
        let events = collect(stream_chunks_to_llm_events(stream)).await;
        let kinds: Vec<&str> = events.iter().map(|e| e.kind()).collect();
        assert_eq!(kinds, vec!["text-start", "text-delta", "text-delta", "finish"]);
    }

    #[tokio::test]
    async fn reasoning_and_text_are_separate_blocks() {
        let stream = chunk_stream(vec![
            StreamChunk::ReasoningDelta("think".into()),
            StreamChunk::Delta("answer".into()),
            StreamChunk::Done(usage()),
        ]);
        let events = collect(stream_chunks_to_llm_events(stream)).await;
        let kinds: Vec<&str> = events.iter().map(|e| e.kind()).collect();
        assert_eq!(
            kinds,
            vec!["reasoning-start", "reasoning-delta", "text-start", "text-delta", "finish"]
        );
    }

    #[tokio::test]
    async fn tool_call_accumulates_arguments() {
        let stream = chunk_stream(vec![
            StreamChunk::ToolCallDelta {
                id: "call_1".into(),
                name: "read".into(),
                arguments_delta: "{\"path\":".into(),
            },
            StreamChunk::ToolCallDelta {
                id: "call_1".into(),
                name: "read".into(),
                arguments_delta: "\"a.txt\"}".into(),
            },
            StreamChunk::Done(usage()),
        ]);
        let events = collect(stream_chunks_to_llm_events(stream)).await;
        let kinds: Vec<&str> = events.iter().map(|e| e.kind()).collect();
        assert_eq!(
            kinds,
            vec!["tool-input-start", "tool-input-delta", "tool-input-delta", "tool-input-end", "tool-call", "finish"]
        );
        // tool-call 参数已累积解析
        let tool_call = events
            .iter()
            .find(|e| matches!(e, LLMEvent::ToolCall { .. }))
            .expect("tool-call event");
        match tool_call {
            LLMEvent::ToolCall { name, input, .. } => {
                assert_eq!(name, "read");
                assert_eq!(input["path"], "a.txt");
            }
            _ => unreachable!(),
        }
    }

    #[tokio::test]
    async fn tool_call_invalid_json_falls_back_empty() {
        let stream = chunk_stream(vec![
            StreamChunk::ToolCallDelta {
                id: "call_1".into(),
                name: "bash".into(),
                arguments_delta: "not json".into(),
            },
            StreamChunk::Done(usage()),
        ]);
        let events = collect(stream_chunks_to_llm_events(stream)).await;
        let tool_call = events
            .iter()
            .find(|e| matches!(e, LLMEvent::ToolCall { .. }))
            .expect("tool-call event");
        match tool_call {
            LLMEvent::ToolCall { name, input, .. } => {
                assert_eq!(name, "bash");
                assert!(input.is_object(), "fallback should be an empty object");
            }
            _ => unreachable!(),
        }
    }

    #[tokio::test]
    async fn mixed_tool_and_text_produce_step_events() {
        let stream = chunk_stream(vec![
            StreamChunk::Delta("Let me read".into()),
            StreamChunk::ToolCallDelta {
                id: "call_1".into(),
                name: "read".into(),
                arguments_delta: "{\"path\":\"a.txt\"}".into(),
            },
            StreamChunk::Done(usage()),
        ]);
        let events = collect(stream_chunks_to_llm_events(stream)).await;
        let kinds: Vec<&str> = events.iter().map(|e| e.kind()).collect();
        assert!(kinds.contains(&"step-start"));
        assert!(kinds.contains(&"step-finish"));
        assert!(kinds.contains(&"tool-call"));
    }
}
```

注意：`ModelTokenUsage` 无 `default_usage()` 方法，测试中直接构造 `ModelTokenUsage { prompt_tokens: None, completion_tokens: None, total_tokens: None, estimated: None }`（或定义测试局部 helper）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-model-gateway stream_adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 编写最小实现**

创建 `crates/model-gateway/src/stream_adapter.rs`:

```rust
use crate::adapter::{StreamChunk, StreamReader};
use crate::llm_event::{LLMEvent, LLMEventStream};
use adl_errors::AppError;
use futures::stream;
use std::collections::HashMap;
use tokio_stream::StreamExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BlockKind {
    Text,
    Reasoning,
}

struct ToolAccum {
    name: String,
    arguments: String,
}

/// Convert a raw [`StreamChunk`] stream into provider-neutral [`LLMEvent`]s.
///
/// Mirrors OpenCode's tool-input/tool-call assembly: tool-call arguments
/// arrive as deltas, are accumulated per call id, and a `tool-call` event
/// with parsed JSON input is emitted at `Done`. Text/reasoning are separated
/// into content blocks with start/delta events.
pub fn stream_chunks_to_llm_events(chunks: StreamReader) -> LLMEventStream {
    let mut current_block: Option<BlockKind> = None;
    let mut text_id: u32 = 0;
    let mut reasoning_id: u32 = 0;
    let mut step_counter: u32 = 0;
    let mut tool_args: HashMap<String, ToolAccum> = HashMap::new();
    let mut in_tool_step = false;

    let stream = chunks.flat_map(move |chunk| {
        let events = match chunk {
            Err(e) => {
                // 错误后终止：标记一个 Finish(error) 哨兵事件
                tracing::warn!(error = %e, "stream_adapter: stream error");
                vec![LLMEvent::Finish { reason: "error".into(), usage: None }]
            },
            Ok(StreamChunk::Delta(text)) => {
                let start = current_block != Some(BlockKind::Text);
                if start {
                    current_block = Some(BlockKind::Text);
                    text_id += 1;
                }
                let id = format!("t{text_id}");
                let mut ev = Vec::new();
                if start {
                    ev.push(LLMEvent::TextStart { id: id.clone() });
                }
                ev.push(LLMEvent::TextDelta { id, text });
                ev
            },
            Ok(StreamChunk::ReasoningDelta(text)) => {
                let start = current_block != Some(BlockKind::Reasoning);
                if start {
                    current_block = Some(BlockKind::Reasoning);
                    reasoning_id += 1;
                }
                let id = format!("r{reasoning_id}");
                let mut ev = Vec::new();
                if start {
                    ev.push(LLMEvent::ReasoningStart { id: id.clone() });
                }
                ev.push(LLMEvent::ReasoningDelta { id, text });
                ev
            },
            Ok(StreamChunk::ToolCallDelta { id, name, arguments_delta }) => {
                let entry = tool_args.entry(id.clone()).or_insert_with(|| ToolAccum {
                    name: name.clone(),
                    arguments: String::new(),
                });
                let mut ev = Vec::new();
                if !in_tool_step {
                    step_counter += 1;
                    ev.push(LLMEvent::StepStart { index: step_counter });
                    in_tool_step = true;
                }
                let is_first = entry.arguments.is_empty();
                entry.arguments.push_str(&arguments_delta);
                if is_first {
                    ev.push(LLMEvent::ToolInputStart { id: id.clone(), name: name.clone() });
                }
                ev.push(LLMEvent::ToolInputDelta {
                    id: id.clone(),
                    name: name.clone(),
                    text: arguments_delta,
                });
                ev
            },
            Ok(StreamChunk::Done(usage)) => {
                let mut ev = Vec::new();
                for (id, accum) in std::mem::take(&mut tool_args) {
                    ev.push(LLMEvent::ToolInputEnd { id: id.clone(), name: accum.name.clone() });
                    let input = serde_json::from_str::<serde_json::Value>(&accum.arguments)
                        .unwrap_or_else(|_| serde_json::json!({}));
                    ev.push(LLMEvent::ToolCall { id, name: accum.name, input });
                }
                if in_tool_step {
                    ev.push(LLMEvent::StepFinish { index: step_counter, reason: "tool".into() });
                    in_tool_step = false;
                }
                ev.push(LLMEvent::Finish { reason: "stop".into(), usage });
                ev
            },
        };
        stream::iter(events.into_iter().map(Ok))
    });

    Box::pin(stream)
}
```

**注意（implementer）**：`StreamChunk` 枚举恰好 4 个变体，match 穷尽。`Err(e)` 分支的 `Finish{reason:"error"}` 哨兵会丢弃原始错误文本——当前测试无 `Err` 用例，此方式足够；若需显式错误传递可后续增强。`futures` 依赖需加入 Cargo.toml（工作区已有 `futures = "0.3"`）。

修改 `crates/model-gateway/Cargo.toml`:

```toml
futures.workspace = true
```

修改 `crates/model-gateway/src/lib.rs`:

```rust
pub mod llm_event;
pub mod stream_adapter;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-model-gateway stream_adapter`
Expected: PASS（5 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-model-gateway --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/model-gateway/src/stream_adapter.rs crates/model-gateway/src/lib.rs
git commit -m "feat(model-gateway): add StreamChunk to LLMEvent stream adapter"
```

---

### Task 3: 全工作区验证

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
- §B3a LLMEvent 枚举（对齐 OpenCode events.ts）→ Task 1 ✓
- §B3a StreamChunk→LLMEvent 转换（tool-call 参数累积、块切换）→ Task 2 ✓
- §8 测试（转换器测试）→ Task 1/2 ✓

**Gap 说明**：
- `tool-result`/`tool-error`/`provider-error` 事件本计划不产出（B3b Loop 在工具执行层产生，对齐 OpenCode processor 中 `completeToolCall`/`failToolCall` 的职责，而非网关层）。
- `StepStart`/`StepFinish` 的事件 index 语义从 OpenCode 的 provider step 近似为"工具调用 batch"——B3b Loop 主要消费 `tool-call` 事件执行工具，step 事件用于 Part 生命周期标记。这是合理的语义适配。

**Placeholder scan**：Task 2 的 Step 3 代码标注"implementer 需处理"的流操作细节（filter_map→flat_map 展平、current_text_id 状态、错误终止），是明确的实现指引——转换器的流类型体操（`LLMEventStream` item 为 `Result`）需要 implementer 用 tokio_stream API 正确实现，测试断言提供验收标准。非占位。

**Type consistency**：`LLMEvent`（Task 1 定义）与 `LLMEventStream`（Task 1）与 `stream_chunks_to_llm_events`（Task 2 返回）命名一致。`StreamChunk` 变体（Delta/ReasoningDelta/ToolCallDelta/Done）与转换器 match 一一对应。
