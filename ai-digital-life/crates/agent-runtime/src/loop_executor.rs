use crate::part_event_bus::PartEventBus;
use crate::part_store::PartStore;
use crate::question::QuestionService;
use crate::tools::registry::ToolRegistry;
use adl_errors::AppError;
use adl_model_gateway::llm_event::{LLMEvent, LLMEventStream};
use adl_types::{MessageRecord, PartRecord, PartType, SessionPartEvent, create_id, now_ms};
use std::sync::Arc;
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnResult {
    Continue,
    Stop,
    Error,
}

/// Inputs identifying and annotating the assistant message produced by a turn.
/// `parent_id` / `model` are threaded into the saved `MessageRecord` so the
/// executor never clobbers ownership metadata set by the caller (B3c).
#[derive(Debug, Clone)]
pub struct TurnConfig {
    pub session_id: String,
    pub message_id: String,
    pub parent_id: Option<String>,
    pub model: Option<serde_json::Value>,
}

/// Number of consecutive identical failed `(tool, input)` pairs after which
/// the turn is aborted as a doom loop (mirrors OpenCode `DOOM_LOOP_THRESHOLD`).
const DOOM_LOOP_THRESHOLD: u32 = 3;

/// Library-level multi-step tool loop executor. Consumes a stream of
/// provider-neutral LLMEvents, drives the event state machine (mirroring
/// OpenCode's processor.ts handleEvent), persists Parts via PartStore, and
/// broadcasts SessionPartEvents. Tool calls execute concurrently.
pub struct LoopExecutor {
    bus: PartEventBus,
    store: Arc<dyn PartStore>,
    #[allow(dead_code)] // reserved: QuestionService wiring lands in a later task
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
        config: TurnConfig,
        events: LLMEventStream,
        cancel: CancellationToken,
    ) -> Result<TurnResult, AppError> {
        use tokio_stream::StreamExt;

        let mut ctx = TurnContext::new(config);
        let mut stream = events;
        let mut loop_error: Option<AppError> = None;

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    // abort in-flight tools, mark interrupted, then fall through
                    // to cleanup so the turn finalizes instead of leaking tasks
                    self.abort_tools(&mut ctx).await;
                    break;
                }
                item = stream.next() => {
                    match item {
                        Some(Ok(event)) => {
                            if let Err(e) = self.handle_event(&mut ctx, event).await {
                                loop_error = Some(e);
                                break;
                            }
                        },
                        Some(Err(e)) => {
                            loop_error = Some(e);
                            break;
                        },
                        None => break,
                    }
                }
            }
        }

        // cleanup ALWAYS runs (awaits in-flight tools, marks interrupted,
        // finalizes the message) even when the loop bailed out on an error
        // or was cancelled.
        self.cleanup(&mut ctx, loop_error.as_ref()).await?;

        if let Some(e) = loop_error {
            return Err(e);
        }
        ctx.finish_result()
    }

    async fn handle_event(&self, ctx: &mut TurnContext, event: LLMEvent) -> Result<(), AppError> {
        match event {
            LLMEvent::StepStart { index } => {
                ctx.step_open = true;
                let part = ctx.new_part(
                    PartType::StepStart,
                    serde_json::json!({"type": "step-start", "index": index}),
                );
                self.save_and_publish(ctx, part).await?;
                // assistant message 在 step 打开时创建并广播
                let msg = MessageRecord {
                    id: ctx.message_id.clone(),
                    session_id: ctx.session_id.clone(),
                    role: "assistant".into(),
                    parent_id: ctx.parent_id.clone(),
                    agent: None,
                    model: ctx.model.clone(),
                    summary: None,
                    time_created: ctx.started_at,
                    time_completed: None,
                };
                self.store.save_message(&msg).await?;
                self.bus.publish(SessionPartEvent::MessageCreated {
                    session_id: ctx.session_id.clone(),
                    info: serde_json::json!({ "id": ctx.message_id, "finish": null }),
                });
            },
            LLMEvent::TextStart { .. } => {
                let part =
                    ctx.new_part(PartType::Text, serde_json::json!({"type": "text", "text": ""}));
                ctx.text_accum = Some(part.clone());
                self.save_and_publish(ctx, part).await?;
            },
            LLMEvent::TextDelta { id: _, text } => {
                if let Some(part) = &mut ctx.text_accum {
                    part.data["text"] = serde_json::Value::String(
                        part.data["text"].as_str().unwrap_or("").to_string() + &text,
                    );
                    self.store.save_part(part).await?;
                    self.bus.publish(SessionPartEvent::MessagePartDelta {
                        session_id: ctx.session_id.clone(),
                        message_id: ctx.message_id.clone(),
                        part_id: part.id.clone(),
                        field: "text".into(),
                        delta: text,
                    });
                }
            },
            LLMEvent::TextEnd { .. } => {},
            LLMEvent::ReasoningStart { .. } => {
                let part = ctx.new_part(
                    PartType::Reasoning,
                    serde_json::json!({"type": "reasoning", "text": ""}),
                );
                ctx.reasoning_accum = Some(part.clone());
                self.save_and_publish(ctx, part).await?;
            },
            LLMEvent::ReasoningDelta { id: _, text } => {
                if let Some(part) = &mut ctx.reasoning_accum {
                    part.data["text"] = serde_json::Value::String(
                        part.data["text"].as_str().unwrap_or("").to_string() + &text,
                    );
                    self.store.save_part(part).await?;
                    self.bus.publish(SessionPartEvent::MessagePartDelta {
                        session_id: ctx.session_id.clone(),
                        message_id: ctx.message_id.clone(),
                        part_id: part.id.clone(),
                        field: "text".into(),
                        delta: text,
                    });
                }
            },
            LLMEvent::ReasoningEnd { .. } => {},
            LLMEvent::ToolInputStart { id, name } => {
                let id_key = id.clone();
                let part = ctx.new_part(
                    PartType::Tool,
                    serde_json::json!({
                        "type": "tool",
                        "tool": name,
                        "callID": id,
                        "state": { "status": "pending", "input": {} },
                    }),
                );
                ctx.tool_parts.insert(id_key, part.clone());
                self.save_and_publish(ctx, part).await?;
            },
            LLMEvent::ToolInputDelta { .. } => {},
            LLMEvent::ToolInputEnd { .. } => {},
            LLMEvent::ToolCall { id, name, input } => {
                let input_json = serde_json::to_string(&input)?;
                let id_for_join = id.clone();
                let name_for_spawn = name.clone();
                let input_json_for_spawn = input_json.clone();
                let existing = ctx.tool_parts.get(&id).cloned();
                let part = if let Some(mut p) = existing {
                    p.data["state"] = serde_json::json!({
                        "status": "running",
                        "input": input,
                        "metadata": {},
                    });
                    p
                } else {
                    ctx.new_part(
                        PartType::Tool,
                        serde_json::json!({
                            "type": "tool",
                            "tool": name,
                            "callID": id,
                            "state": { "status": "running", "input": input, "metadata": {} },
                        }),
                    )
                };
                ctx.tool_parts.insert(id_for_join.clone(), part.clone());
                self.save_and_publish(ctx, part.clone()).await?;

                // 并发执行工具
                let registry = self.registry.clone();
                let store = self.store.clone();
                let bus = self.bus.clone();
                let session_id = ctx.session_id.clone();
                let message_id = ctx.message_id.clone();
                let part_id = part.id.clone();
                let part_for_spawn = part.clone();
                let (done_tx, done_rx) = oneshot::channel();
                let handle = tokio::spawn(async move {
                    let result = registry.execute(&name_for_spawn, &input_json_for_spawn).await;
                    let spawned_input = part_for_spawn.data["state"]["input"].clone();
                    // 简化：直接在 spawn 内更新 part 并发布
                    let final_part = match result {
                        Ok(out) => {
                            let mut p = part_for_spawn.clone();
                            p.data["state"] = serde_json::json!({
                                "status": "completed",
                                "input": spawned_input,
                                "output": out.output,
                                "title": name_for_spawn.clone(),
                                "metadata": out.metadata,
                                "time": { "start": now_ms(), "end": now_ms() },
                            });
                            p
                        },
                        Err(e) => {
                            let mut p = part_for_spawn.clone();
                            p.data["state"] = serde_json::json!({
                                "status": "error",
                                "input": spawned_input,
                                "error": e.to_string(),
                                "metadata": {},
                                "time": { "start": now_ms(), "end": now_ms() },
                            });
                            p
                        },
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
                ctx.tool_joins.insert(id_for_join, (handle, done_rx));
            },
            LLMEvent::StepFinish { .. } => {
                ctx.step_open = false;
                // 等待所有 in-flight 工具完成
                let keys: Vec<String> = ctx.tool_joins.keys().cloned().collect();
                for key in keys {
                    if let Some((handle, rx)) = ctx.tool_joins.remove(&key) {
                        let _ = handle.await;
                        if let Ok(final_part) = rx.await {
                            ctx.record_tool_result(&final_part);
                            ctx.tool_parts.insert(key, final_part);
                        }
                    }
                }
            },
            LLMEvent::Finish { reason, usage } => {
                ctx.finish_reason = Some(reason);
                ctx.usage = usage;
            },
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

    /// Abort all in-flight tool tasks and mark every non-terminal tool part as
    /// interrupted. Runs when the turn is cancelled so in-flight tools cannot
    /// keep writing after the turn ends. `cleanup` then handles the remainder
    /// (aborted joins are removed here, so nothing is double-processed).
    async fn abort_tools(&self, ctx: &mut TurnContext) {
        let keys: Vec<String> = ctx.tool_joins.keys().cloned().collect();
        for key in keys {
            if let Some((handle, _)) = ctx.tool_joins.remove(&key) {
                handle.abort();
            }
        }
        for (id, part) in ctx.tool_parts.clone() {
            let status = part.data["state"]["status"].as_str();
            if status == Some("pending") || status == Some("running") {
                let mut p = part.clone();
                p.data["state"] = serde_json::json!({
                    "status": "error",
                    "error": "Tool execution interrupted",
                    "metadata": { "interrupted": true },
                    "time": { "start": now_ms(), "end": now_ms() },
                });
                ctx.tool_parts.insert(id.clone(), p.clone());
                let _ = self.store.save_part(&p).await;
                self.bus.publish(SessionPartEvent::MessagePartUpdated {
                    session_id: ctx.session_id.clone(),
                    message_id: ctx.message_id.clone(),
                    part_id: id,
                    part: serde_json::to_value(&p).unwrap_or_default(),
                });
            }
        }
    }

    async fn cleanup(&self, ctx: &mut TurnContext, loop_error: Option<&AppError>) -> Result<(), AppError> {
        // 收尾：text/reasoning 已累积；in-flight 工具置 interrupted
        let keys: Vec<String> = ctx.tool_joins.keys().cloned().collect();
        for key in keys {
            if let Some((handle, rx)) = ctx.tool_joins.remove(&key) {
                let _ = handle.await;
                if let Ok(final_part) = rx.await {
                    ctx.record_tool_result(&final_part);
                    ctx.tool_parts.insert(key, final_part);
                }
            }
        }
        for (id, part) in ctx.tool_parts.clone() {
            let status = part.data["state"]["status"].as_str();
            if status == Some("pending") || status == Some("running") {
                let mut p = part.clone();
                p.data["state"] = serde_json::json!({
                    "status": "error",
                    "error": "Tool execution interrupted",
                    "metadata": { "interrupted": true },
                    "time": { "start": now_ms(), "end": now_ms() },
                });
                ctx.tool_parts.insert(id.clone(), p.clone());
                self.store.save_part(&p).await?;
                self.bus.publish(SessionPartEvent::MessagePartUpdated {
                    session_id: ctx.session_id.clone(),
                    message_id: ctx.message_id.clone(),
                    part_id: id,
                    part: serde_json::to_value(&p)?,
                });
            }
        }
        // 更新 assistant message（finish/error）
        let status = if ctx.doom_loop || loop_error.is_some()
            || ctx.finish_reason.as_deref() == Some("error")
        {
            "error"
        } else {
            "completed"
        };
        let msg = MessageRecord {
            id: ctx.message_id.clone(),
            session_id: ctx.session_id.clone(),
            role: "assistant".into(),
            parent_id: ctx.parent_id.clone(),
            agent: None,
            model: ctx.model.clone(),
            summary: None,
            time_created: ctx.started_at,
            time_completed: Some(now_ms()),
        };
        self.store.save_message(&msg).await?;
        let mut info = serde_json::json!({
            "id": ctx.message_id.clone(),
            "finish": status,
        });
        if let Some(usage) = &ctx.usage {
            info["usage"] = serde_json::to_value(usage)?;
        }
        if status == "error" {
            let error_text = loop_error
                .map(|e| e.to_string())
                .or_else(|| {
                    ctx.tool_parts
                        .values()
                        .filter_map(|p| p.data["state"]["error"].as_str())
                        .next()
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "Tool execution failed".to_string());
            info["error"] = serde_json::Value::String(error_text);
        }
        self.bus.publish(SessionPartEvent::MessageUpdated {
            session_id: ctx.session_id.clone(),
            info,
        });
        Ok(())
    }
}

struct TurnContext {
    session_id: String,
    message_id: String,
    parent_id: Option<String>,
    model: Option<serde_json::Value>,
    started_at: i64,
    #[allow(dead_code)] // reserved: step closure accounting for later steps
    step_open: bool,
    text_accum: Option<PartRecord>,
    reasoning_accum: Option<PartRecord>,
    tool_parts: std::collections::HashMap<String, PartRecord>,
    tool_joins: std::collections::HashMap<
        String,
        (tokio::task::JoinHandle<()>, oneshot::Receiver<PartRecord>),
    >,
    ordinal: i64,
    finish_reason: Option<String>,
    usage: Option<adl_types::model::ModelTokenUsage>,
    consecutive_failures: u32,
    last_failed_tool: Option<String>,
    last_failed_input: Option<String>,
    doom_loop: bool,
}

impl TurnContext {
    fn new(config: TurnConfig) -> Self {
        Self {
            session_id: config.session_id,
            message_id: config.message_id,
            parent_id: config.parent_id,
            model: config.model,
            started_at: now_ms(),
            step_open: false,
            text_accum: None,
            reasoning_accum: None,
            tool_parts: std::collections::HashMap::new(),
            tool_joins: std::collections::HashMap::new(),
            ordinal: 0,
            finish_reason: None,
            usage: None,
            consecutive_failures: 0,
            last_failed_tool: None,
            last_failed_input: None,
            doom_loop: false,
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

    /// Track a synced-back tool result for doom-loop detection. On an `error`
    /// status, compares `(tool, input)` with the previous consecutive failure;
    /// three consecutive identical failed pairs raise the `doom_loop` flag.
    fn record_tool_result(&mut self, final_part: &PartRecord) {
        let state = &final_part.data["state"];
        if state["status"].as_str() != Some("error") {
            self.consecutive_failures = 0;
            return;
        }
        let tool = final_part.data["tool"].as_str().unwrap_or("").to_string();
        let input = serde_json::to_string(&state["input"]).unwrap_or_default();
        let same = self.last_failed_tool.as_deref() == Some(tool.as_str())
            && self.last_failed_input.as_deref() == Some(input.as_str());
        self.consecutive_failures = if same { self.consecutive_failures + 1 } else { 1 };
        self.last_failed_tool = Some(tool);
        self.last_failed_input = Some(input);
        if self.consecutive_failures >= DOOM_LOOP_THRESHOLD {
            self.doom_loop = true;
        }
    }

    fn finish_result(&self) -> Result<TurnResult, AppError> {
        if self.doom_loop || self.finish_reason.as_deref() == Some("error") {
            return Ok(TurnResult::Error);
        }
        Ok(TurnResult::Stop)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::part_event_bus::PartEventBus;
    use crate::part_store::PartStore;
    use adl_errors::AppError;
    use adl_model_gateway::llm_event::{LLMEvent, LLMEventStream};
    use adl_types::{MessageRecord, PartRecord, PartType};
    use std::sync::{Arc, Mutex};

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
            let mut parts = self.parts.lock().unwrap();
            match parts.iter_mut().find(|p| p.id == part.id) {
                Some(existing) => *existing = part.clone(),
                None => parts.push(part.clone()),
            }
            Ok(())
        }
        async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
            Ok(self
                .parts
                .lock()
                .unwrap()
                .iter()
                .filter(|p| p.message_id == message_id)
                .cloned()
                .collect())
        }
    }

    fn event_stream(events: Vec<LLMEvent>) -> LLMEventStream {
        Box::pin(tokio_stream::iter(events.into_iter().map(Ok)))
    }

    fn config(session_id: &str, message_id: &str) -> TurnConfig {
        TurnConfig {
            session_id: session_id.into(),
            message_id: message_id.into(),
            parent_id: None,
            model: None,
        }
    }

    #[tokio::test]
    async fn text_turn_produces_text_part() {
        let bus = PartEventBus::new(16);
        let store = Arc::new(MemStore::default());
        let questions = crate::question::QuestionService::new(bus.clone());
        let registry = Arc::new(crate::tools::registry::ToolRegistry::with_builtins());
        let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);

        let events = vec![
            LLMEvent::StepStart { index: 1 },
            LLMEvent::TextStart { id: "t1".into() },
            LLMEvent::TextDelta { id: "t1".into(), text: "hi".into() },
            LLMEvent::StepFinish { index: 1, reason: "stop".into() },
            LLMEvent::Finish { reason: "stop".into(), usage: None },
        ];
        let result = executor
            .run_turn(config("s1", "msg_1"), event_stream(events), CancellationToken::new())
            .await
            .unwrap();
        assert!(matches!(result, TurnResult::Stop));

        let parts = store.list_parts("msg_1").await.unwrap();
        let text = parts.iter().find(|p| p.r#type == PartType::Text).expect("text part");
        assert_eq!(text.data["text"], "hi");
    }

    #[tokio::test]
    async fn tool_turn_executes_tool() {
        let bus = PartEventBus::new(16);
        let store = Arc::new(MemStore::default());
        let questions = crate::question::QuestionService::new(bus.clone());
        let registry = Arc::new(crate::tools::registry::ToolRegistry::with_builtins());
        let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);

        let events = vec![
            LLMEvent::StepStart { index: 1 },
            LLMEvent::ToolCall {
                id: "call_1".into(),
                name: "glob".into(),
                input: serde_json::json!({ "pattern": "_nonexistent_adl_*" }),
            },
            LLMEvent::StepFinish { index: 1, reason: "stop".into() },
            LLMEvent::Finish { reason: "stop".into(), usage: None },
        ];
        let result = executor
            .run_turn(config("s1", "msg_2"), event_stream(events), CancellationToken::new())
            .await
            .unwrap();
        assert!(matches!(result, TurnResult::Stop));

        let parts = store.list_parts("msg_2").await.unwrap();
        let tool = parts.iter().find(|p| p.r#type == PartType::Tool).expect("tool part");
        assert_eq!(tool.data["tool"], "glob");
        assert_eq!(tool.data["state"]["status"], "completed");
    }

    #[tokio::test]
    async fn error_turn_marks_parts_interrupted() {
        let bus = PartEventBus::new(16);
        let store = Arc::new(MemStore::default());
        let questions = crate::question::QuestionService::new(bus.clone());
        let registry = Arc::new(crate::tools::registry::ToolRegistry::with_builtins());
        let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);

        let events = vec![
            LLMEvent::StepStart { index: 1 },
            LLMEvent::ToolInputStart { id: "call_1".into(), name: "bash".into() },
            LLMEvent::Finish { reason: "error".into(), usage: None },
        ];
        let result = executor
            .run_turn(config("s1", "msg_3"), event_stream(events), CancellationToken::new())
            .await
            .unwrap();
        assert!(matches!(result, TurnResult::Error));

        let parts = store.list_parts("msg_3").await.unwrap();
        let tool = parts.iter().find(|p| p.r#type == PartType::Tool).expect("tool part");
        assert_eq!(tool.data["state"]["status"], "error");
        assert_eq!(tool.data["state"]["metadata"]["interrupted"], true);
    }

    #[tokio::test]
    async fn doom_loop_returns_error_after_three_failures() {
        let bus = PartEventBus::new(16);
        let store = Arc::new(MemStore::default());
        let questions = crate::question::QuestionService::new(bus.clone());
        let registry = Arc::new(crate::tools::registry::ToolRegistry::with_builtins());
        let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);

        // Three consecutive same-tool calls to a nonexistent tool -> error
        let mut events = Vec::new();
        events.push(LLMEvent::StepStart { index: 1 });
        for i in 0..3u32 {
            events.push(LLMEvent::ToolCall {
                id: format!("call_{i}"),
                name: "nonexistent_tool_xyz".into(),
                input: serde_json::json!({"path": "a.txt"}),
            });
        }
        events.push(LLMEvent::StepFinish { index: 1, reason: "stop".into() });
        events.push(LLMEvent::Finish { reason: "stop".into(), usage: None });

        let result = executor
            .run_turn(config("s1", "msg_4"), event_stream(events), CancellationToken::new())
            .await
            .unwrap();
        assert!(matches!(result, TurnResult::Error), "doom loop should return Error, got {result:?}");
    }

    #[tokio::test]
    async fn cancel_marks_pending_tools_interrupted_and_cleans_up() {
        let bus = PartEventBus::new(16);
        let store = Arc::new(MemStore::default());
        let questions = crate::question::QuestionService::new(bus.clone());
        let registry = Arc::new(crate::tools::registry::ToolRegistry::with_builtins());
        let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);

        // 流：StepStart + 一个 pending 工具，随后永久挂起（tx 保持存活）。
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<LLMEvent, AppError>>(16);
        tx.send(Ok(LLMEvent::StepStart { index: 1 })).await.unwrap();
        tx.send(Ok(LLMEvent::ToolInputStart { id: "call_1".into(), name: "bash".into() }))
            .await
            .unwrap();
        let stream: LLMEventStream = Box::pin(tokio_stream::wrappers::ReceiverStream::new(rx));

        let mut sub = bus.subscribe();
        let cancel = CancellationToken::new();
        let handle = tokio::spawn({
            let cancel = cancel.clone();
            async move { executor.run_turn(config("s1", "msg_cancel"), stream, cancel).await }
        });

        // 等到 pending 工具 part 发布后再取消，确保 abort_tools 能命中它
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                match sub.recv().await.unwrap() {
                    SessionPartEvent::MessagePartUpdated { part, .. } => {
                        if part["data"]["state"]["status"] == "pending" {
                            break;
                        }
                    },
                    _ => continue,
                }
            }
        })
        .await
        .expect("pending tool part should be published before cancel");
        cancel.cancel();
        let result = handle.await.unwrap().unwrap();
        assert!(matches!(result, TurnResult::Stop));

        let parts = store.list_parts("msg_cancel").await.unwrap();
        let tool = parts.iter().find(|p| p.r#type == PartType::Tool).expect("tool part");
        assert_eq!(tool.data["state"]["status"], "error");
        assert_eq!(tool.data["state"]["metadata"]["interrupted"], true);
        let messages = store.messages.lock().unwrap();
        assert!(
            messages.iter().any(|m| m.id == "msg_cancel"),
            "cleanup should finalize the assistant message on cancel"
        );
    }
}
