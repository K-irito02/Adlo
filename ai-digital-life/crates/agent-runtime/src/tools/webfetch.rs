use reqwest::Client;
use std::time::Duration;

const MAX_OUTPUT_BYTES: usize = 50_000; // 50KB
const TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Clone, serde::Serialize)]
pub struct WebFetchResult {
    pub url: String,
    pub status: u16,
    pub content_type: Option<String>,
    pub content: String,
    pub truncated: bool,
    pub error: Option<String>,
}

/// Fetch content from a URL.
pub async fn webfetch(url: &str) -> WebFetchResult {
    let client = match Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .user_agent("AI-Digital-Life/1.0")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return WebFetchResult {
                url: url.to_string(),
                status: 0,
                content_type: None,
                content: String::new(),
                truncated: false,
                error: Some(format!("Failed to create HTTP client: {}", e)),
            };
        },
    };

    match client.get(url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let content_type =
                resp.headers().get("content-type").and_then(|v| v.to_str().ok()).map(String::from);

            let text = match resp.text().await {
                Ok(t) => t,
                Err(e) => {
                    return WebFetchResult {
                        url: url.to_string(),
                        status,
                        content_type,
                        content: String::new(),
                        truncated: false,
                        error: Some(format!("Failed to read response: {}", e)),
                    };
                },
            };

            let (content, truncated) = if text.len() > MAX_OUTPUT_BYTES {
                (text[..MAX_OUTPUT_BYTES].to_string(), true)
            } else {
                (text, false)
            };

            WebFetchResult {
                url: url.to_string(),
                status,
                content_type,
                content,
                truncated,
                error: if status >= 400 { Some(format!("HTTP {}", status)) } else { None },
            }
        },
        Err(e) => WebFetchResult {
            url: url.to_string(),
            status: 0,
            content_type: None,
            content: String::new(),
            truncated: false,
            error: Some(format!("Request failed: {}", e)),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_output_bytes_is_50kb() {
        assert_eq!(MAX_OUTPUT_BYTES, 50_000);
    }

    #[test]
    fn timeout_is_10_seconds() {
        assert_eq!(TIMEOUT_SECS, 10);
    }

    #[tokio::test]
    async fn webfetch_invalid_url_returns_error() {
        let result = webfetch("http://localhost:1/nonexistent").await;
        assert!(result.error.is_some());
        assert_eq!(result.status, 0);
    }
}
