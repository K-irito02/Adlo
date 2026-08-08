# 模型网关 Reasoning 流 Implementation Plan（B1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为模型网关新增 reasoning（思考过程）流式通道：`StreamChunk::ReasoningDelta`、`SseEvent::Reasoning`、各 provider 的 reasoning 字段解析、`ModelResponse.reasoning`，使 Agent Loop（后续计划）能将思考过程输出为 Reasoning Part。

**Architecture:** 在 `adl-model-gateway` 的流式链路中区分"正文文本"与"思考文本"。`StreamChunk` 新增 `ReasoningDelta(String)`，`SseEvent` 新增 `Reasoning(String)`；`parse_sse_stream` 与各 provider 的 extract 闭包识别 reasoning 字段（DeepSeek/OpenAI-compatible 的 `delta.reasoning_content`、OpenAI 新模型 `delta.thinking`、Anthropic `content_block` 类型为 `thinking`、Google `thought`）。`consume_stream_to_response` 拼接 reasoning 并写入 `ModelResponse.reasoning`。本计划是 Plan B（Agent Loop）的基础，独立可测，不依赖其他计划。

**Tech Stack:** Rust 2024 edition、serde_json、reqwest、tokio-stream、async-trait。

## Global Constraints

- Rust edition 2024，rust-version 1.85
- `cargo clippy -- -D warnings` 必须 0 警告；避免 `unwrap_used`/`dbg_macro`/`todo`
- 未发布阶段禁止数据迁移/兼容代码
- 类型命名遵循 ADL 现有 `camelCase` serde 约定
- 不改变现有 `Delta`/`ToolCallDelta`/`Done` 的语义——仅新增变体，现有消费者不受破坏
- DeepSeek（OpenAI 兼容端点 `api.deepseek.com/v1`）的 `reasoning_content` 是主要目标；无 reasoning 的 provider 自然不产生 `ReasoningDelta`

---

### Task 1: StreamChunk 与 ModelResponse 扩展

**Files:**
- Modify: `crates/model-gateway/src/adapter.rs`
- Modify: `crates/types/src/types/model.rs`

**Interfaces:**
- Consumes: `adl_types::model::ModelResponse`, `adl_errors::AppError`
- Produces:
  - `adl_model_gateway::adapter::StreamChunk::ReasoningDelta(String)` 新增变体
  - `adl_types::ModelResponse.reasoning: Option<String>` 新增字段

- [ ] **Step 1: 编写失败的测试**

在 `crates/types/src/types/model.rs` 的 `mod tests`（或新建）追加:

```rust
#[test]
fn model_response_reasoning_roundtrips() {
    let resp = ModelResponse {
        provider_id: "deepseek".into(),
        model_id: "deepseek-chat".into(),
        content: "answer".into(),
        reasoning: Some("thinking".into()),
        synthetic: false,
        request_id: None,
        usage: None,
        route: None,
    };
    let encoded = serde_json::to_string(&resp).unwrap();
    let decoded: ModelResponse = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded.reasoning.as_deref(), Some("thinking"));
    assert!(encoded.contains("\"reasoning\""));
}

#[test]
fn model_response_reasoning_optional() {
    let resp = ModelResponse {
        provider_id: "x".into(),
        model_id: "y".into(),
        content: "hi".into(),
        reasoning: None,
        synthetic: false,
        request_id: None,
        usage: None,
        route: None,
    };
    let encoded = serde_json::to_string(&resp).unwrap();
    let decoded: ModelResponse = serde_json::from_str(&encoded).unwrap();
    assert!(decoded.reasoning.is_none());
}
```

在 `crates/model-gateway/src/adapter.rs` 的 `mod tests` 追加:

```rust
#[test]
fn stream_chunk_reasoning_delta_matches() {
    let chunk = StreamChunk::ReasoningDelta("思考".to_string());
    match &chunk {
        StreamChunk::ReasoningDelta(text) => assert_eq!(text, "思考"),
        _ => panic!("expected ReasoningDelta"),
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-types model_response_reasoning && cargo test -p adl-model-gateway stream_chunk_reasoning`
Expected: FAIL（`reasoning` 字段不存在 / `StreamChunk::ReasoningDelta` 不存在）

- [ ] **Step 3: 实现**

修改 `crates/types/src/types/model.rs` 的 `ModelResponse`，新增字段:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelResponse {
    pub provider_id: String,
    pub model_id: String,
    pub content: String,
    /// Concatenated reasoning/thinking text streamed by the model (if any).
    pub reasoning: Option<String>,
    pub synthetic: bool,
    pub request_id: Option<String>,
    pub usage: Option<ModelTokenUsage>,
    pub route: Option<ModelRouteDecision>,
}
```

修改 `crates/model-gateway/src/adapter.rs` 的 `StreamChunk`:

```rust
#[derive(Debug, Clone)]
pub enum StreamChunk {
    /// Partial text delta.
    Delta(String),
    /// Partial reasoning/thinking delta (separate from visible text).
    ReasoningDelta(String),
    /// Tool call delta (function name + arguments fragment).
    ToolCallDelta { id: String, name: String, arguments_delta: String },
    /// Stream completed with final usage info.
    Done(ModelTokenUsage),
}
```

注意：`crates/types/src/types/model.rs` 与 `crates/model-gateway/src/adapter.rs` 各自有测试模块；`ModelResponse` 变更会影响所有构造点（`lib.rs` 的 chat/chat_for_model、fallback、各 provider 的 chat 方法、src-tauri 的 consume_stream_to_response 等），需要为它们补充 `reasoning: None`。用编译错误定位所有构造点。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-types model_response_reasoning && cargo test -p adl-model-gateway stream_chunk_reasoning`
Expected: PASS

- [ ] **Step 5: 修复所有构造点编译错误**

Run: `cargo build --workspace`
Expected: 无错误（所有 `ModelResponse { .. }` 字面量已补 `reasoning: None`）。逐处修复编译错误，保持 `reasoning: None`。

- [ ] **Step 6: Clippy 检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 7: 提交**

```bash
git add crates/types/src/types/model.rs crates/model-gateway/src/adapter.rs
git commit -m "feat(model-gateway): add reasoning field and ReasoningDelta chunk"
```

---

### Task 2: SseEvent 与 parse_sse_stream 支持 Reasoning

**Files:**
- Modify: `crates/model-gateway/src/providers/base.rs`

**Interfaces:**
- Consumes: `crate::adapter::StreamChunk`, `crate::adapter::StreamReader`, `adl_errors::AppError`, `reqwest::Response`
- Produces:
  - `crate::providers::base::SseEvent::Reasoning(String)` 新增变体
  - `parse_sse_stream` 将 `SseEvent::Reasoning` 转为 `StreamChunk::ReasoningDelta`

- [ ] **Step 1: 编写失败的测试**

在 `crates/model-gateway/src/providers/base.rs` 的 `mod tests` 追加。注意 `parse_sse_stream` 接受 `reqwest::Response`，单测不便直接构造——改为测试 `SseEvent` 的构造与匹配语义，及抽取一个小型 helper:

```rust
#[test]
fn sse_event_reasoning_variant() {
    let ev = SseEvent::Reasoning("think".into());
    match &ev {
        SseEvent::Reasoning(text) => assert_eq!(text, "think"),
        _ => panic!("expected Reasoning"),
    }
}
```

同时新增一个可测试的映射函数（供 `parse_sse_stream` 内部复用），放在 `base.rs`:

```rust
/// Map an [`SseEvent`] to the corresponding [`StreamChunk`] outcome.
pub fn sse_event_to_chunk(event: SseEvent) -> Option<StreamChunk> {
    match event {
        SseEvent::Delta(d) => Some(StreamChunk::Delta(d)),
        SseEvent::Reasoning(r) => Some(StreamChunk::ReasoningDelta(r)),
        SseEvent::Done => Some(StreamChunk::Done(ModelTokenUsage {
            prompt_tokens: None,
            completion_tokens: None,
            total_tokens: None,
            estimated: None,
        })),
        SseEvent::Skip => None,
    }
}
```

测试:

```rust
#[test]
fn sse_event_to_chunk_maps_reasoning() {
    let chunk = sse_event_to_chunk(SseEvent::Reasoning("thinking".into()));
    match chunk {
        Some(StreamChunk::ReasoningDelta(t)) => assert_eq!(t, "thinking"),
        _ => panic!("expected ReasoningDelta"),
    }
}

#[test]
fn sse_event_to_chunk_maps_delta() {
    let chunk = sse_event_to_chunk(SseEvent::Delta("hi".into()));
    match chunk {
        Some(StreamChunk::Delta(t)) => assert_eq!(t, "hi"),
        _ => panic!("expected Delta"),
    }
}

#[test]
fn sse_event_to_chunk_skips_skip() {
    assert!(sse_event_to_chunk(SseEvent::Skip).is_none());
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-model-gateway sse_event`
Expected: FAIL（`SseEvent::Reasoning` / `sse_event_to_chunk` 不存在）

- [ ] **Step 3: 实现**

修改 `crates/model-gateway/src/providers/base.rs`:

1. `SseEvent` 增加 `Reasoning(String)` 变体:

```rust
pub enum SseEvent {
    /// A text delta chunk to yield.
    Delta(String),
    /// A reasoning/thinking delta chunk to yield.
    Reasoning(String),
    /// Stream is done.
    Done,
    /// No matching event in this JSON value.
    Skip,
}
```

2. 新增 `sse_event_to_chunk`（见 Step 1 代码）。

3. 修改 `parse_sse_stream`，用 `sse_event_to_chunk` 替代手写 match:

```rust
if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
    match extract(&json) {
        SseEvent::Delta(d) => return Ok(StreamChunk::Delta(d)),
        SseEvent::Reasoning(r) => return Ok(StreamChunk::ReasoningDelta(r)),
        SseEvent::Done => {
            return Ok(StreamChunk::Done(ModelTokenUsage {
                prompt_tokens: None,
                completion_tokens: None,
                total_tokens: None,
                estimated: None,
            }));
        },
        SseEvent::Skip => {},
    }
}
```

（保持现有 match 结构即可——`Reasoning` 分支直接产出 `ReasoningDelta`。`sse_event_to_chunk` 作为独立可测 helper 存在，`parse_sse_stream` 可保持现有内联 match 或改用 helper；若改用 helper 需注意 `Done` 返回值的结构一致性。）

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-model-gateway sse_event`
Expected: PASS（4 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-model-gateway --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/model-gateway/src/providers/base.rs
git commit -m "feat(model-gateway): support reasoning in SseEvent parsing"
```

---

### Task 3: OpenAI-compatible provider 解析 reasoning_content

**Files:**
- Modify: `crates/model-gateway/src/providers/openai.rs`
- Modify: `crates/model-gateway/src/providers/openrouter.rs`

**Interfaces:**
- Consumes: `crate::providers::base::SseEvent`
- Produces: OpenAI-compatible extract 同时识别 `delta.content`（→ Delta）与 `delta.reasoning_content` / `delta.thinking`（→ Reasoning）。DeepSeek（`api.deepseek.com/v1`）走本路径。

- [ ] **Step 1: 编写失败的测试**

OpenAI extract 目前是内联闭包（openai.rs:262-267），无法直接单测。抽取为命名函数 `extract_openai_delta(json: &serde_json::Value) -> SseEvent`，放在 `openai.rs` 顶部或测试模块，并让 `chat_stream` 引用它。测试:

```rust
#[test]
fn extract_openai_delta_content() {
    let json = serde_json::json!({"choices": [{"delta": {"content": "hi"}}]});
    match extract_openai_delta(&json) {
        SseEvent::Delta(t) => assert_eq!(t, "hi"),
        other => panic!("expected Delta, got {other:?}"),
    }
}

#[test]
fn extract_openai_delta_reasoning_content() {
    // DeepSeek reasoning_content field
    let json = serde_json::json!({"choices": [{"delta": {"reasoning_content": "think"}}]});
    match extract_openai_delta(&json) {
        SseEvent::Reasoning(t) => assert_eq!(t, "think"),
        other => panic!("expected Reasoning, got {other:?}"),
    }
}

#[test]
fn extract_openai_delta_thinking() {
    // OpenAI o-series thinking field
    let json = serde_json::json!({"choices": [{"delta": {"thinking": "plan"}}]});
    match extract_openai_delta(&json) {
        SseEvent::Reasoning(t) => assert_eq!(t, "plan"),
        other => panic!("expected Reasoning, got {other:?}"),
    }
}

#[test]
fn extract_openai_delta_skip_when_empty() {
    let json = serde_json::json!({"choices": [{"delta": {}}]});
    assert!(matches!(extract_openai_delta(&json), SseEvent::Skip));
}
```

在 `openrouter.rs` 中，若其 extract 与 openai 一致（同样解析 `delta.content`），复用 `extract_openai_delta`（从 openai.rs 导出 `pub fn`）或为其单独建同名函数。参考 openrouter.rs 现有 extract（openrouter.rs:230-236），若结构与 openai 相同，直接复用:

```rust
// openrouter.rs: chat_stream 内
parse_sse_stream(response, crate::providers::openai::extract_openai_delta)
```

并在 openrouter.rs 测试模块追加一个 reasoning 测试（直接调用 `extract_openai_delta`）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-model-gateway extract_openai_delta`
Expected: FAIL（`extract_openai_delta` 不存在）

- [ ] **Step 3: 实现**

在 `openai.rs` 新增:

```rust
/// Extract a text or reasoning delta from an OpenAI-compatible SSE chunk.
///
/// Priority: `delta.reasoning_content` (DeepSeek) → `delta.thinking`
/// (OpenAI o-series) → `delta.content` (normal text). Returns `Skip` when
/// none are present.
pub fn extract_openai_delta(json: &serde_json::Value) -> SseEvent {
    let delta = &json["choices"][0]["delta"];
    if let Some(t) = delta["reasoning_content"].as_str() {
        if !t.is_empty() {
            return SseEvent::Reasoning(t.to_string());
        }
    }
    if let Some(t) = delta["thinking"].as_str() {
        if !t.is_empty() {
            return SseEvent::Reasoning(t.to_string());
        }
    }
    delta["content"]
        .as_str()
        .map(|s| SseEvent::Delta(s.to_string()))
        .unwrap_or(SseEvent::Skip)
}
```

修改 `openai.rs` 的 `chat_stream`:

```rust
parse_sse_stream(response, extract_openai_delta)
```

`openai.rs` 顶部导入 `SseEvent`（若尚未导入）:

```rust
use crate::providers::base::SseEvent;
```

`openrouter.rs` 的 `chat_stream` 改为引用 `extract_openai_delta`:

```rust
parse_sse_stream(response, crate::providers::openai::extract_openai_delta)
```

（若 openrouter.rs 的 delta 结构不同——例如使用 `choices[0].delta` 的变体——保留其现有 extract 并追加 reasoning 分支；以实际代码为准。）

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-model-gateway extract_openai_delta`
Expected: PASS（4 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-model-gateway --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/model-gateway/src/providers/openai.rs crates/model-gateway/src/providers/openrouter.rs
git commit -m "feat(model-gateway): parse reasoning_content for OpenAI-compatible providers"
```

---

### Task 4: Anthropic 与 Google provider 解析 reasoning

**Files:**
- Modify: `crates/model-gateway/src/providers/anthropic.rs`
- Modify: `crates/model-gateway/src/providers/google.rs`

**Interfaces:**
- Consumes: `crate::providers::base::SseEvent`
- Produces:
  - Anthropic：`content_block_delta` 中 `delta.type == "thinking_delta"` → Reasoning
  - Google：`candidates[0].content.parts[]` 中 `thought` 为 true 的 part → Reasoning

- [ ] **Step 1: 编写失败的测试**

在 `anthropic.rs` 测试模块追加（抽取 `extract_anthropic_event` 供测试）:

```rust
#[test]
fn extract_anthropic_thinking_delta() {
    let json = serde_json::json!({
        "type": "content_block_delta",
        "delta": {"type": "thinking_delta", "thinking": "ponder"}
    });
    match extract_anthropic_event(&json) {
        SseEvent::Reasoning(t) => assert_eq!(t, "ponder"),
        other => panic!("expected Reasoning, got {other:?}"),
    }
}

#[test]
fn extract_anthropic_text_delta() {
    let json = serde_json::json!({
        "type": "content_block_delta",
        "delta": {"type": "text_delta", "text": "hello"}
    });
    match extract_anthropic_event(&json) {
        SseEvent::Delta(t) => assert_eq!(t, "hello"),
        other => panic!("expected Delta, got {other:?}"),
    }
}

#[test]
fn extract_anthropic_message_stop() {
    let json = serde_json::json!({"type": "message_stop"});
    assert!(matches!(extract_anthropic_event(&json), SseEvent::Done));
}
```

在 `google.rs` 测试模块追加（抽取 `extract_google_delta` 供测试）:

```rust
#[test]
fn extract_google_thought_part() {
    let json = serde_json::json!({
        "candidates": [{"content": {"parts": [
            {"text": "inner monologue", "thought": true},
            {"text": "visible answer"}
        ]}}]
    });
    match extract_google_delta(&json) {
        SseEvent::Reasoning(t) => assert_eq!(t, "inner monologue"),
        other => panic!("expected Reasoning, got {other:?}"),
    }
}

#[test]
fn extract_google_text_part() {
    let json = serde_json::json!({
        "candidates": [{"content": {"parts": [{"text": "answer"}]}}]
    });
    match extract_google_delta(&json) {
        SseEvent::Delta(t) => assert_eq!(t, "answer"),
        other => panic!("expected Delta, got {other:?}"),
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-model-gateway extract_anthropic && cargo test -p adl-model-gateway extract_google`
Expected: FAIL（函数不存在）

- [ ] **Step 3: 实现**

**Anthropic**（参考 anthropic.rs:291-296 现有 extract，抽取为命名函数）:

```rust
fn extract_anthropic_event(json: &serde_json::Value) -> SseEvent {
    match json["type"].as_str() {
        Some("content_block_delta") => {
            let delta_type = json["delta"]["type"].as_str().unwrap_or("");
            match delta_type {
                "thinking_delta" => json["delta"]["thinking"]
                    .as_str()
                    .map(|s| SseEvent::Reasoning(s.to_string()))
                    .unwrap_or(SseEvent::Skip),
                "text_delta" => json["delta"]["text"]
                    .as_str()
                    .map(|s| SseEvent::Delta(s.to_string()))
                    .unwrap_or(SseEvent::Skip),
                _ => SseEvent::Skip,
            }
        },
        Some("message_stop") => SseEvent::Done,
        _ => SseEvent::Skip,
    }
}
```

修改 `anthropic.rs` 的 `parse_sse_stream` 调用改为 `extract_anthropic_event`（删除原内联闭包）。

**Google**（参考 google.rs:260-300 现有 extract，抽取为命名函数）:

```rust
fn extract_google_delta(json: &serde_json::Value) -> SseEvent {
    let parts = &json["candidates"][0]["content"]["parts"];
    let parts = match parts.as_array() {
        Some(p) => p,
        None => return SseEvent::Skip,
    };
    for part in parts {
        let text = part["text"].as_str().unwrap_or("");
        let is_thought = part["thought"].as_bool().unwrap_or(false);
        if text.is_empty() {
            continue;
        }
        if is_thought {
            return SseEvent::Reasoning(text.to_string());
        }
        return SseEvent::Delta(text.to_string());
    }
    SseEvent::Skip
}
```

修改 `google.rs` 的 `parse_sse_stream` 调用改为 `extract_google_delta`（删除原内联闭包）。**注意**：需先阅读 google.rs 现有 extract 的确切结构（可能逐 part 产出多个 Delta，或一次产出全文），以实际代码为准调整——核心是增加 `thought` 分支产出 `Reasoning`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-model-gateway extract_anthropic && cargo test -p adl-model-gateway extract_google`
Expected: PASS

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-model-gateway --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/model-gateway/src/providers/anthropic.rs crates/model-gateway/src/providers/google.rs
git commit -m "feat(model-gateway): parse thinking for Anthropic and Google"
```

---

### Task 5: consume_stream_to_response 拼接 reasoning

**Files:**
- Modify: `src-tauri/src/commands/agent_pipeline_stream.rs`

**Interfaces:**
- Consumes: `adl_model_gateway::adapter::StreamChunk`, `adl_model_gateway::adapter::StreamReader`, `adl_types::ModelResponse`
- Produces: `consume_stream_to_response` 返回的 `ModelResponse.reasoning` 为拼接后的完整思考文本

- [ ] **Step 1: 编写失败的测试**

`consume_stream_to_response` 依赖 `tauri::AppHandle`（用于 emit 事件）。现有测试（agent_pipeline_stream.rs 90-185）用 `test_app_handle()` 构造。追加测试:

```rust
#[tokio::test]
#[cfg(not(windows))]
async fn consume_stream_accumulates_reasoning() {
    let app = test_app_handle();
    let stream = test_stream(vec![
        Ok(StreamChunk::ReasoningDelta("think".to_string())),
        Ok(StreamChunk::ReasoningDelta(" more".to_string())),
        Ok(StreamChunk::Delta("answer".to_string())),
    ]);
    let response =
        consume_stream_to_response(&app, "test-run", stream, "deepseek", "test-model").await;
    assert_eq!(response.content, "answer");
    assert_eq!(response.reasoning.as_deref(), Some("think more"));
}

#[tokio::test]
#[cfg(not(windows))]
async fn consume_stream_reasoning_none_when_absent() {
    let app = test_app_handle();
    let stream = test_stream(vec![Ok(StreamChunk::Delta("hi".to_string()))]);
    let response =
        consume_stream_to_response(&app, "test-run", stream, "deepseek", "test-model").await;
    assert_eq!(response.content, "hi");
    assert!(response.reasoning.is_none());
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p ai-digital-life consume_stream 2>&1 | Select-String -Pattern "consume_stream_accumulates_reasoning|FAILED|error\["`
Expected: FAIL（`response.reasoning` 字段在 Task 1 已加但此处未填充）

- [ ] **Step 3: 实现**

修改 `consume_stream_to_response`，维护 `full_reasoning` 拼接:

```rust
let mut full_content = String::new();
let mut full_reasoning = String::new();
let mut final_usage: Option<ModelTokenUsage> = None;
let mut seq = 1usize;

// ... (route 事件不变)

while let Some(chunk_result) = stream.next().await {
    match chunk_result {
        Ok(StreamChunk::Delta(text)) => {
            full_content.push_str(&text);
            emit_stream_event(app, run_id, seq, "delta", serde_json::json!({ "text": text }));
            seq += 1;
        },
        Ok(StreamChunk::ReasoningDelta(text)) => {
            full_reasoning.push_str(&text);
            emit_stream_event(app, run_id, seq, "reasoning-delta", serde_json::json!({ "text": text }));
            seq += 1;
        },
        Ok(StreamChunk::ToolCallDelta { .. }) => {},
        Ok(StreamChunk::Done(usage)) => {
            final_usage = Some(usage);
        },
        Err(e) => {
            tracing::warn!(error = %e, "stream read error");
        },
    }
}

// ... (usage/done 事件不变)

ModelResponse {
    provider_id: provider_id.to_string(),
    model_id: model_id.to_string(),
    content: full_content,
    reasoning: (!full_reasoning.is_empty()).then_some(full_reasoning),
    synthetic: false,
    request_id: None,
    usage: final_usage,
    route: Some(ModelRouteDecision {
        reason: "streaming route".to_string(),
        chain: vec![provider_id.to_string()],
        synthetic: None,
    }),
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p ai-digital-life consume_stream`
Expected: PASS（含 2 个新测试 + 既有 4 个测试）

- [ ] **Step 5: 全工作区构建 + Clippy**

Run: `cargo build --workspace && cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/commands/agent_pipeline_stream.rs
git commit -m "feat(agent): accumulate reasoning stream into ModelResponse"
```

---

### Task 6: 全工作区验证

**Files:**
- 无新增/修改（验证性任务）

- [ ] **Step 1: 运行全工作区测试**

Run: `cargo test --workspace`
Expected: 全部通过（含既有 ~662 测试 + 本计划新增 ~15 测试）

- [ ] **Step 2: Clippy 全量检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: 提交（如有修复）**

---

## Self-Review 记录

**Spec coverage:**
- §5.1 StreamChunk 扩展 → Task 1 ✓
- §5.2 Provider 解析（DeepSeek/OpenAI/Ollama/无 reasoning 跳过）→ Task 3、4 ✓
- §5.3 消费端 consume_stream_to_response → Task 5 ✓
- §5.3 ModelResponse.reasoning → Task 1 ✓
- §8 Reasoning 流测试 → Task 1-5 ✓

**Gap 说明**：Ollama reasoning 解析（spec §5.2 提到"若有"）——Ollama 的思考字段格式不统一且非主要目标，本计划不做，Agent Loop 侧对无 ReasoningDelta 自然跳过。属于合理的范围裁剪。

**Placeholder scan**：无 TBD/TODO。Task 3/4 中标注"以实际代码为准"的 provider extract 结构调整，是让 implementer 基于真实代码做最小改动的明确指引，非占位。

**Type consistency**：`StreamChunk::ReasoningDelta`（Task 1 定义）与 `SseEvent::Reasoning`（Task 2）与 `extract_*_delta` 返回值（Task 3/4）与 `consume_stream_to_response` 消费（Task 5）命名一致。
