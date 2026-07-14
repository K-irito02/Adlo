use adl_types::{ModelResponse, ModelRouteDecision, ModelTokenUsage};
use adl_model_gateway::adapter::{StreamChunk, StreamReader};
use tauri::Emitter;
use tokio_stream::StreamExt;

fn emit_stream_event(
    app: &tauri::AppHandle,
    run_id: &str,
    seq: usize,
    event_type: &str,
    payload: serde_json::Value,
) {
    let mut event = serde_json::json!({
        "v": 1,
        "runId": run_id,
        "seq": seq,
        "type": event_type,
    });
    if let (serde_json::Value::Object(event_map), serde_json::Value::Object(payload_map)) =
        (&mut event, payload)
    {
        event_map.extend(payload_map);
    }
    let _ = app.emit("digital-life://model-stream", event);
}

pub(crate) async fn consume_stream_to_response(
    app: &tauri::AppHandle,
    run_id: &str,
    stream: StreamReader,
    provider_id: &str,
    model_id: &str,
) -> ModelResponse {
    tokio::pin!(stream);
    let mut full_content = String::new();
    let mut final_usage: Option<ModelTokenUsage> = None;
    let mut seq = 1usize;

    emit_stream_event(
        app,
        run_id,
        0,
        "route",
        serde_json::json!({
            "providerId": provider_id,
            "modelId": model_id,
            "reason": "streaming route",
        }),
    );

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(StreamChunk::Delta(text)) => {
                full_content.push_str(&text);
                emit_stream_event(app, run_id, seq, "delta", serde_json::json!({ "text": text }));
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

    if let Some(ref usage) = final_usage {
        emit_stream_event(app, run_id, seq, "usage", serde_json::json!({ "usage": usage }));
        seq += 1;
    }

    emit_stream_event(app, run_id, seq, "done", serde_json::json!({}));

    ModelResponse {
        provider_id: provider_id.to_string(),
        model_id: model_id.to_string(),
        content: full_content,
        synthetic: false,
        request_id: None,
        usage: final_usage,
        route: Some(ModelRouteDecision {
            reason: "streaming route".to_string(),
            chain: vec![provider_id.to_string()],
            synthetic: None,
        }),
    }
}

#[cfg(test)]
mod tests {
    #[cfg(not(windows))]
    use super::*;
    #[cfg(not(windows))]
    use adl_model_gateway::adapter::StreamChunk;

    #[cfg(not(windows))]
    fn test_stream(chunks: Vec<Result<StreamChunk, adl_errors::AppError>>) -> StreamReader {
        Box::pin(tokio_stream::iter(chunks))
    }

    #[cfg(not(windows))]
    fn test_app_handle() -> tauri::AppHandle {
        let app = tauri::Builder::default()
            .build(tauri::generate_context!())
            .expect("failed to build test tauri app");
        app.handle().clone()
    }

    #[tokio::test]
    #[cfg(not(windows))]
    async fn consume_empty_stream() {
        let app = test_app_handle();
        let stream = test_stream(vec![]);
        let response =
            consume_stream_to_response(&app, "test-run", stream, "deepseek", "test-model").await;
        assert_eq!(response.content, "");
        assert!(response.usage.is_none());
        assert_eq!(response.provider_id, "deepseek");
        assert_eq!(response.model_id, "test-model");
    }

    #[tokio::test]
    #[cfg(not(windows))]
    async fn consume_single_delta() {
        let app = test_app_handle();
        let stream = test_stream(vec![Ok(StreamChunk::Delta("Hello ".to_string()))]);
        let response =
            consume_stream_to_response(&app, "test-run", stream, "deepseek", "test-model").await;
        assert_eq!(response.content, "Hello ");
    }

    #[tokio::test]
    #[cfg(not(windows))]
    async fn consume_multiple_deltas() {
        let app = test_app_handle();
        let stream = test_stream(vec![
            Ok(StreamChunk::Delta("Hello ".to_string())),
            Ok(StreamChunk::Delta("World".to_string())),
        ]);
        let response =
            consume_stream_to_response(&app, "test-run", stream, "deepseek", "test-model").await;
        assert_eq!(response.content, "Hello World");
    }

    #[tokio::test]
    #[cfg(not(windows))]
    async fn consume_stream_with_usage() {
        let app = test_app_handle();
        let usage = ModelTokenUsage {
            prompt_tokens: Some(10),
            completion_tokens: Some(5),
            total_tokens: Some(15),
            estimated: Some(false),
        };
        let stream = test_stream(vec![
            Ok(StreamChunk::Delta("hi".to_string())),
            Ok(StreamChunk::Done(usage.clone())),
        ]);
        let response =
            consume_stream_to_response(&app, "test-run", stream, "deepseek", "test-model").await;
        assert_eq!(response.content, "hi");
        let u = response.usage.expect("should have usage");
        assert_eq!(u.prompt_tokens, Some(10));
        assert_eq!(u.completion_tokens, Some(5));
    }

    #[tokio::test]
    #[cfg(not(windows))]
    async fn consume_stream_skips_tool_call_delta() {
        let app = test_app_handle();
        let stream = test_stream(vec![
            Ok(StreamChunk::Delta("text ".to_string())),
            Ok(StreamChunk::ToolCallDelta {
                id: "call_1".into(),
                name: "test_tool".into(),
                arguments_delta: "{}".into(),
            }),
            Ok(StreamChunk::Delta("content".to_string())),
        ]);
        let response =
            consume_stream_to_response(&app, "test-run", stream, "deepseek", "test-model").await;
        assert_eq!(response.content, "text content");
    }
}
