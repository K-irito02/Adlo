use adl_errors::AppError;
use reqwest::{Client, Response};

/// Builder for HTTP requests to LLM provider chat endpoints.
///
/// Collects URL, headers, query pairs, and JSON body into a request that can
/// be sent via [`send_chat_request`] or [`send_stream_request`].
pub struct HttpRequestBuilder {
    client: Client,
    url: String,
    query: Vec<(String, String)>,
    headers: Vec<(String, String)>,
    body: Option<serde_json::Value>,
}

impl HttpRequestBuilder {
    pub fn new(client: Client, url: impl Into<String>) -> Self {
        Self { client, url: url.into(), query: Vec::new(), headers: Vec::new(), body: None }
    }

    /// Append a query key/value pair to the URL. Values are URL-encoded by
    /// `reqwest` when applied via `.query()`, so secrets (e.g. API keys) that
    /// contain `&`/`=`/`?` characters are safely handled and never double-
    /// encoded or truncated in-transit.
    pub fn query<K, V>(mut self, pairs: &[(K, V)]) -> Self
    where
        K: AsRef<str>,
        V: AsRef<str>,
    {
        for (k, v) in pairs {
            self.query.push((k.as_ref().to_string(), v.as_ref().to_string()));
        }
        self
    }

    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.push((key.into(), value.into()));
        self
    }

    pub fn json(mut self, body: serde_json::Value) -> Self {
        self.body = Some(body);
        self
    }

    fn build_post(&self) -> reqwest::RequestBuilder {
        let mut rb = self.client.post(&self.url);
        if !self.query.is_empty() {
            let pairs: Vec<(&str, &str)> =
                self.query.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
            rb = rb.query(&pairs);
        }
        for (key, value) in &self.headers {
            rb = rb.header(key.as_str(), value.as_str());
        }
        if let Some(body) = &self.body {
            rb = rb.json(body);
        }
        rb
    }
}

/// Send a non-streaming chat request.
/// Returns the parsed JSON response.
pub async fn send_chat_request(
    builder: &HttpRequestBuilder,
    provider_name: &str,
) -> Result<serde_json::Value, AppError> {
    let resp = builder
        .build_post()
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("{provider_name} request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("{provider_name} error {status}: {body}")));
    }

    resp.json().await.map_err(|e| AppError::Internal(format!("{provider_name} parse failed: {e}")))
}

/// Send a streaming chat request.
/// On success, returns the raw [`Response`] whose byte stream can be
/// processed by the caller into SSE chunks.
pub async fn send_stream_request(
    builder: &HttpRequestBuilder,
    provider_name: &str,
) -> Result<Response, AppError> {
    let resp = builder
        .build_post()
        .send()
        .await
        .map_err(|e| AppError::Model(format!("{provider_name} stream request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Model(format!("{provider_name} stream error {status}: {body}")));
    }

    Ok(resp)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builder_sets_url() {
        let client = Client::new();
        let builder = HttpRequestBuilder::new(client.clone(), "http://example.com/chat");
        assert_eq!(builder.url, "http://example.com/chat");
    }

    #[test]
    fn builder_sets_headers() {
        let client = Client::new();
        let builder = HttpRequestBuilder::new(client.clone(), "http://example.com/chat")
            .header("Authorization", "Bearer test-key")
            .header("X-Custom", "value");
        assert_eq!(builder.headers.len(), 2);
        assert!(builder.headers.contains(&("Authorization".into(), "Bearer test-key".into())));
        assert!(builder.headers.contains(&("X-Custom".into(), "value".into())));
    }

    #[test]
    fn builder_sets_body() {
        let client = Client::new();
        let body = json!({"model": "gpt-4", "messages": []});
        let builder =
            HttpRequestBuilder::new(client.clone(), "http://example.com/chat").json(body.clone());
        assert_eq!(builder.body, Some(body));
    }

    #[test]
    fn builder_empty_headers_by_default() {
        let client = Client::new();
        let builder = HttpRequestBuilder::new(client.clone(), "http://example.com/chat");
        assert!(builder.headers.is_empty());
    }

    #[test]
    fn builder_no_body_by_default() {
        let client = Client::new();
        let builder = HttpRequestBuilder::new(client.clone(), "http://example.com/chat");
        assert!(builder.body.is_none());
    }

    #[tokio::test]
    async fn send_chat_request_returns_error_on_timeout() {
        let client =
            Client::builder().timeout(std::time::Duration::from_millis(50)).build().unwrap();
        let builder = HttpRequestBuilder::new(client, "http://127.0.0.1:1/chat");
        let result = send_chat_request(&builder, "Test").await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Test"), "error should contain provider name, got: {err}");
    }

    #[tokio::test]
    async fn send_stream_request_returns_error_on_timeout() {
        let client =
            Client::builder().timeout(std::time::Duration::from_millis(50)).build().unwrap();
        let builder = HttpRequestBuilder::new(client, "http://127.0.0.1:1/chat");
        let result = send_stream_request(&builder, "Test").await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Test"), "error should contain provider name, got: {err}");
    }
}
