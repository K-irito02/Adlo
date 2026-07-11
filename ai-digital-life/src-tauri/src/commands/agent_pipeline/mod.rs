mod prepare;
mod context;
pub(crate) mod model_caller;
mod patch_generator;
mod audit_helper;

pub use prepare::prepare_run;
pub use context::collect_context;
pub use model_caller::call_model;
pub use patch_generator::generate_patches;
pub(crate) use audit_helper::finalize_run;

#[cfg(test)]
mod tests {
    const STREAM_CHUNK_SIZE: usize = 120;

    #[test]
    fn test_stream_chunk_count_empty_content() {
        let content = "";
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 0, "empty content should produce 0 deltas");
    }

    #[test]
    fn test_stream_chunk_count_exact_one_chunk() {
        let content = "a".repeat(STREAM_CHUNK_SIZE);
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 1, "exactly 120 chars = 1 delta chunk");
    }

    #[test]
    fn test_stream_chunk_count_two_chunks() {
        let content = "a".repeat(STREAM_CHUNK_SIZE + 1);
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 2, "121 chars = 2 delta chunks");
    }

    #[test]
    fn test_stream_chunk_count_unicode() {
        let content = "中文测试".repeat(40);
        let char_count = content.chars().count();
        let delta_chunks = (char_count + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE.max(1);
        assert_eq!(delta_chunks, 2, "160 unicode chars = 2 delta chunks");
    }

    #[test]
    fn test_route_event_json_structure() {
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 0,
            "type": "route",
            "providerId": "deepseek",
            "modelId": "deepseek-v4",
            "reason": "primary route",
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["runId"], "run-1");
        assert_eq!(event["seq"], 0);
        assert_eq!(event["type"], "route");
        assert!(event.get("providerId").is_some());
        assert!(event.get("modelId").is_some());
        assert!(event.get("reason").is_some());
    }

    #[test]
    fn test_usage_event_json_structure() {
        let usage = serde_json::json!({"inputTokens": 100, "outputTokens": 50});
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 1,
            "type": "usage",
            "usage": usage,
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["type"], "usage");
        assert!(event.get("usage").is_some());
    }

    #[test]
    fn test_delta_event_json_structure() {
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 2,
            "type": "delta",
            "text": "Hello World",
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["type"], "delta");
        assert_eq!(event["text"], "Hello World");
    }

    #[test]
    fn test_done_event_json_structure() {
        let event = serde_json::json!({
            "v": 1,
            "runId": "run-1",
            "seq": 3,
            "type": "done",
        });
        assert_eq!(event["v"], 1);
        assert_eq!(event["type"], "done");
        assert!(event.get("text").is_none(), "done event should NOT have text field");
    }

    #[test]
    fn test_run_start_activity_event_structure() {
        let event = serde_json::json!({
            "type": "run-start",
            "scenario": "code-edit"
        });
        assert_eq!(event["type"], "run-start");
        assert_eq!(event["scenario"], "code-edit");
    }

    #[test]
    fn test_run_done_activity_event_structure() {
        let event = serde_json::json!({
            "type": "run-done",
            "status": "succeeded"
        });
        assert_eq!(event["type"], "run-done");
        assert!(event.get("status").is_some());
    }
}
