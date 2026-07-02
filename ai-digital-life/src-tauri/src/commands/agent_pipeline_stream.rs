use adl_kernel::ModelResponse;
use tauri::Emitter;

const MODEL_STREAM_CHARS: usize = 120;

/// Splits `content` into chunks of at most `chunk_size` Unicode scalar values.
/// Returns an empty vector when `content` is empty.
fn chunk_model_content(content: &str, chunk_size: usize) -> Vec<String> {
    if content.is_empty() {
        return vec![];
    }
    let mut chunks = Vec::new();
    let mut buf = String::new();
    let mut char_count = 0usize;
    for ch in content.chars() {
        buf.push(ch);
        char_count += 1;
        if char_count >= chunk_size {
            chunks.push(buf.clone());
            buf.clear();
            char_count = 0;
        }
    }
    if !buf.is_empty() {
        chunks.push(buf);
    }
    chunks
}

/// Emits a single `digital-life://model-stream` event with the common envelope
/// fields (`v`, `runId`, `seq`, `type`) merged with the provided `payload`.
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

pub(crate) fn emit_model_stream_events(
    app: &tauri::AppHandle,
    run_id: &str,
    response: &ModelResponse,
) {
    let reason = response.route.as_ref().map(|r| r.reason.as_str()).unwrap_or("primary route");
    emit_stream_event(
        app,
        run_id,
        0,
        "route",
        serde_json::json!({
            "providerId": response.provider_id,
            "modelId": response.model_id,
            "reason": reason,
        }),
    );
    if let Some(usage) = &response.usage {
        emit_stream_event(
            app,
            run_id,
            1,
            "usage",
            serde_json::json!({
                "usage": usage,
            }),
        );
    }
    let mut seq = 2usize;
    let content = &response.content;
    if content.is_empty() {
        emit_stream_event(app, run_id, seq, "done", serde_json::json!({}));
        return;
    }
    for chunk in chunk_model_content(content, MODEL_STREAM_CHARS) {
        emit_stream_event(
            app,
            run_id,
            seq,
            "delta",
            serde_json::json!({
                "text": chunk,
            }),
        );
        seq += 1;
    }
    emit_stream_event(app, run_id, seq, "done", serde_json::json!({}));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 计算 emit_model_stream_events 的 seq 号序列
    fn compute_seq_numbers(has_usage: bool, delta_count: usize) -> Vec<(usize, &'static str)> {
        let mut events = Vec::new();
        events.push((0, "route"));
        if has_usage {
            events.push((1, "usage"));
        }
        let base = 2usize;
        for i in 0..delta_count {
            events.push((base + i, "delta"));
        }
        events.push((base + delta_count, "done"));
        events
    }

    #[test]
    fn emit_empty_content_produces_zero_chunks() {
        let chunks = chunk_model_content("", MODEL_STREAM_CHARS);
        assert!(chunks.is_empty());
        // seq: route(0), usage(1), done(2)
        let seqs = compute_seq_numbers(true, 0);
        assert_eq!(seqs.len(), 3);
        assert_eq!(seqs[0], (0, "route"));
        assert_eq!(seqs[1], (1, "usage"));
        assert_eq!(seqs[2], (2, "done"));
    }

    #[test]
    fn emit_short_content_produces_one_chunk() {
        let content = "Hello World";
        let chunks = chunk_model_content(content, MODEL_STREAM_CHARS);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Hello World");
        // seq: route(0), usage(1), delta(2), done(3)
        let seqs = compute_seq_numbers(true, 1);
        assert_eq!(seqs.len(), 4);
        assert_eq!(seqs[0], (0, "route"));
        assert_eq!(seqs[1], (1, "usage"));
        assert_eq!(seqs[2], (2, "delta"));
        assert_eq!(seqs[3], (3, "done"));
    }

    #[test]
    fn emit_multi_chunk_250_chars_produces_three_chunks() {
        let content = "a".repeat(250);
        assert_eq!(content.chars().count(), 250);
        let chunks = chunk_model_content(&content, MODEL_STREAM_CHARS);
        assert_eq!(chunks.len(), 3, "250 chars → 3 chunks (120+120+10)");
        assert_eq!(chunks[0].len(), 120);
        assert_eq!(chunks[1].len(), 120);
        assert_eq!(chunks[2].len(), 10);
        // seq: route(0), usage(1), delta(2), delta(3), delta(4), done(5)
        let seqs = compute_seq_numbers(true, 3);
        assert_eq!(seqs.len(), 6);
        assert_eq!(seqs[0], (0, "route"));
        assert_eq!(seqs[1], (1, "usage"));
        assert_eq!(seqs[2], (2, "delta"));
        assert_eq!(seqs[3], (3, "delta"));
        assert_eq!(seqs[4], (4, "delta"));
        assert_eq!(seqs[5], (5, "done"));
    }

    #[test]
    fn emit_no_usage_skips_seq_1() {
        // seq: route(0), delta(2), delta(3), ..., done(2+N)
        let seqs = compute_seq_numbers(false, 2);
        assert_eq!(seqs.len(), 4);
        assert_eq!(seqs[0], (0, "route"));
        assert_eq!(seqs[1], (2, "delta"));
        assert_eq!(seqs[2], (3, "delta"));
        assert_eq!(seqs[3], (4, "done"));
        // 确保没有 seq=1
        assert!(!seqs.iter().any(|(s, _)| *s == 1));
    }

    #[test]
    fn emit_no_usage_empty_content_done_at_seq_2() {
        // seq: route(0), done(2) — 无 delta
        let seqs = compute_seq_numbers(false, 0);
        assert_eq!(seqs.len(), 2);
        assert_eq!(seqs[0], (0, "route"));
        assert_eq!(seqs[1], (2, "done"));
    }

    #[test]
    fn emit_exact_chunk_boundary_120_chars() {
        let content = "a".repeat(120);
        let chunks = chunk_model_content(&content, MODEL_STREAM_CHARS);
        assert_eq!(chunks.len(), 1, "exactly 120 chars = 1 chunk");
        assert_eq!(chunks[0].len(), 120);
    }

    #[test]
    fn emit_exact_chunk_boundary_240_chars() {
        let content = "a".repeat(240);
        let chunks = chunk_model_content(&content, MODEL_STREAM_CHARS);
        assert_eq!(chunks.len(), 2, "exactly 240 chars = 2 chunks");
        assert_eq!(chunks[0].len(), 120);
        assert_eq!(chunks[1].len(), 120);
    }

    #[test]
    fn emit_unicode_chunking_preserves_char_boundaries() {
        let content = "中文测试".repeat(40);
        assert_eq!(content.chars().count(), 160);
        let chunks = chunk_model_content(&content, MODEL_STREAM_CHARS);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].chars().count(), 120);
        assert_eq!(chunks[1].chars().count(), 40);
        // 确保每个 chunk 都是有效的 UTF-8
        assert!(std::str::from_utf8(chunks[0].as_bytes()).is_ok());
        assert!(std::str::from_utf8(chunks[1].as_bytes()).is_ok());
    }

    // ========== emit_model_stream_events integration tests (non-Windows) ==========
    // These tests call the actual function with a real Tauri AppHandle.
    // On Windows, the event loop can't be created in test threads, so these
    // are gated behind #[cfg(not(windows))].

    #[cfg(not(windows))]
    fn test_app_handle() -> tauri::AppHandle {
        let app = tauri::Builder::default()
            .build(tauri::generate_context!())
            .expect("failed to build test tauri app");
        app.handle().clone()
    }

    #[test]
    #[cfg(not(windows))]
    fn emit_model_stream_events_empty_content() {
        let app = test_app_handle();
        let response = adl_kernel::ModelResponse {
            provider_id: adl_kernel::ModelProviderId::Deepseek,
            model_id: "test-model".into(),
            content: String::new(),
            synthetic: false,
            request_id: None,
            route: Some(adl_kernel::ModelRouteDecision {
                reason: "test route".into(),
                chain: vec![],
                synthetic: None,
            }),
            usage: Some(adl_kernel::ModelTokenUsage {
                prompt_tokens: Some(100),
                completion_tokens: Some(0),
                total_tokens: Some(100),
                estimated: None,
            }),
        };
        emit_model_stream_events(&app, "test-run", &response);
    }

    #[test]
    #[cfg(not(windows))]
    fn emit_model_stream_events_short_content() {
        let app = test_app_handle();
        let response = adl_kernel::ModelResponse {
            provider_id: adl_kernel::ModelProviderId::Deepseek,
            model_id: "test-model".into(),
            content: "Hello World".into(),
            synthetic: false,
            request_id: None,
            route: None,
            usage: None,
        };
        emit_model_stream_events(&app, "test-run", &response);
    }

    #[test]
    #[cfg(not(windows))]
    fn emit_model_stream_events_multi_chunk() {
        let app = test_app_handle();
        let content = "a".repeat(250);
        let response = adl_kernel::ModelResponse {
            provider_id: adl_kernel::ModelProviderId::Deepseek,
            model_id: "test-model".into(),
            content,
            synthetic: false,
            request_id: None,
            route: Some(adl_kernel::ModelRouteDecision {
                reason: "primary route".into(),
                chain: vec![],
                synthetic: None,
            }),
            usage: Some(adl_kernel::ModelTokenUsage {
                prompt_tokens: Some(100),
                completion_tokens: Some(250),
                total_tokens: Some(350),
                estimated: None,
            }),
        };
        emit_model_stream_events(&app, "test-run", &response);
    }

    #[test]
    #[cfg(not(windows))]
    fn emit_model_stream_events_no_route() {
        let app = test_app_handle();
        let response = adl_kernel::ModelResponse {
            provider_id: adl_kernel::ModelProviderId::Minimax,
            model_id: "test-model".into(),
            content: "some content".into(),
            synthetic: false,
            request_id: None,
            route: None,
            usage: Some(adl_kernel::ModelTokenUsage {
                prompt_tokens: Some(30),
                completion_tokens: Some(12),
                total_tokens: Some(42),
                estimated: None,
            }),
        };
        emit_model_stream_events(&app, "test-run", &response);
    }

    #[test]
    #[cfg(not(windows))]
    fn emit_model_stream_events_no_usage() {
        let app = test_app_handle();
        let response = adl_kernel::ModelResponse {
            provider_id: adl_kernel::ModelProviderId::Deepseek,
            model_id: "test-model".into(),
            content: "no usage info".into(),
            synthetic: false,
            request_id: None,
            route: Some(adl_kernel::ModelRouteDecision {
                reason: "primary route".into(),
                chain: vec![],
                synthetic: None,
            }),
            usage: None,
        };
        emit_model_stream_events(&app, "test-run", &response);
    }
}
