use adl_model_gateway::http_helper::{HttpRequestBuilder, send_chat_request, send_stream_request};
use reqwest::Client;

/// Tests that the builder can be constructed with all fields without panicking.
#[test]
fn integration_builder_constructs_request_with_all_fields() {
    let client = Client::new();
    let body = serde_json::json!({"model": "gpt-4", "messages": [{"role": "user", "content": "hi"}]});
    let _builder = HttpRequestBuilder::new(client.clone(), "http://test.example/v1/chat")
        .header("Authorization", "Bearer test-key")
        .header("X-Custom", "value")
        .json(body);
    // Builder constructed without error
}

#[tokio::test]
async fn integration_send_chat_request_network_error() {
    let client = Client::builder()
        .timeout(std::time::Duration::from_millis(50))
        .build()
        .unwrap();
    let builder = HttpRequestBuilder::new(client, "http://127.0.0.1:1/chat");
    let result = send_chat_request(&builder, "IntegrationTest").await;
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("IntegrationTest"));
}

#[tokio::test]
async fn integration_send_stream_request_network_error() {
    let client = Client::builder()
        .timeout(std::time::Duration::from_millis(50))
        .build()
        .unwrap();
    let builder = HttpRequestBuilder::new(client, "http://127.0.0.1:1/chat");
    let result = send_stream_request(&builder, "IntegrationTest").await;
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("IntegrationTest"));
}
