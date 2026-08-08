use crate::adapter::{StreamChunk, StreamReader};
use adl_errors::AppError;
use adl_types::ConversationRole;
use adl_types::model::{ModelChatMessage, ModelTokenUsage};

/// Event returned by provider-specific SSE delta extractors.
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

/// Parse an SSE stream from a provider response.
///
/// Handles the common `data: ` line prefix, `[DONE]` signal, and line-by-line
/// iteration. The `extract` closure receives each parsed JSON value and returns
/// an [`SseEvent`] indicating what to do with it.
pub fn parse_sse_stream<F>(
    response: reqwest::Response,
    extract: F,
) -> Result<StreamReader, AppError>
where
    F: Fn(&serde_json::Value) -> SseEvent + Send + 'static,
{
    use tokio_stream::StreamExt;

    let stream = response.bytes_stream().map(move |chunk| {
        let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    return Ok(StreamChunk::Done(ModelTokenUsage {
                        prompt_tokens: None,
                        completion_tokens: None,
                        total_tokens: None,
                        estimated: None,
                    }));
                }
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
            }
        }
        Ok(StreamChunk::Delta(String::new()))
    });
    Ok(Box::pin(stream))
}

/// Build a JSON request body for OpenAI-compatible chat completions.
///
/// Sets `model`, `messages`, and `stream`. The `extra` map is merged after
/// those base fields so callers can add provider-specific keys
/// (e.g. `max_tokens` for Anthropic).
pub fn build_request_body(
    model: &str,
    messages: &[ModelChatMessage],
    stream: bool,
    extra: Option<serde_json::Value>,
) -> serde_json::Value {
    let messages_json: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": match m.role {
                    ConversationRole::System => "system",
                    ConversationRole::User => "user",
                    ConversationRole::Assistant => "assistant",
                    ConversationRole::Tool => "tool",
                },
                "content": m.content,
            })
        })
        .collect();
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages_json,
        "stream": stream,
    });
    if let Some(val) = extra {
        if let Some(obj) = val.as_object() {
            for (k, v) in obj {
                body[k] = v.clone();
            }
        }
    }
    body
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_request_body_works() {
        let msgs = vec![ModelChatMessage { role: ConversationRole::User, content: "hi".into() }];
        let body = build_request_body("gpt-4", &msgs, true, None);
        assert_eq!(body["model"], "gpt-4");
        assert_eq!(body["stream"], true);
        assert_eq!(body["messages"][0]["content"], "hi");
    }

    #[test]
    fn build_request_body_merges_extra() {
        let msgs = vec![];
        let extra = serde_json::json!({"temperature": 0.7});
        let body = build_request_body("gpt-4", &msgs, false, Some(extra));
        assert_eq!(body["temperature"], 0.7);
    }

    #[test]
    fn build_request_body_role_mapping() {
        use ConversationRole::*;
        let msgs = vec![
            ModelChatMessage { role: System, content: "sys".into() },
            ModelChatMessage { role: User, content: "usr".into() },
            ModelChatMessage { role: Assistant, content: "ast".into() },
            ModelChatMessage { role: Tool, content: "tool".into() },
        ];
        let body = build_request_body("m", &msgs, false, None);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(body["messages"][2]["role"], "assistant");
        assert_eq!(body["messages"][3]["role"], "tool");
    }

    #[test]
    fn sse_event_reasoning_variant() {
        let ev = SseEvent::Reasoning("think".into());
        match &ev {
            SseEvent::Reasoning(text) => assert_eq!(text, "think"),
            _ => panic!("expected Reasoning"),
        }
    }

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
}
