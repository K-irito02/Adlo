use crate::adapter::{StreamChunk, StreamReader};
use crate::llm_event::{LLMEvent, LLMEventStream};
use futures::stream;
use futures::StreamExt;
use std::collections::HashMap;

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
                if !in_tool_step && current_block.is_some() {
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
                ev.push(LLMEvent::Finish { reason: "stop".into(), usage: Some(usage) });
                ev
            },
        };
        stream::iter(events.into_iter().map(Ok))
    });

    Box::pin(stream)
}

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
