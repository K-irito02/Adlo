use reqwest::Client;
use std::time::Duration;

const MAX_RESPONSE_SIZE: usize = 5 * 1024 * 1024; // 5MB (OpenCode parity)
const DEFAULT_TIMEOUT_SECS: u64 = 30; // 30s (OpenCode parity)

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub enum WebFetchFormat {
    Text,
    #[default]
    Markdown,
    Html,
}

impl WebFetchFormat {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Markdown => "markdown",
            Self::Html => "html",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WebFetchResult {
    pub url: String,
    pub status: u16,
    pub content_type: Option<String>,
    pub content: String,
    pub truncated: bool,
    pub format: String,
    pub error: Option<String>,
}

/// Fetch content from a URL, defaulting to Markdown format.
pub async fn webfetch(url: &str) -> WebFetchResult {
    webfetch_with_format(url, WebFetchFormat::default()).await
}

/// Fetch content from a URL with the specified output format.
pub async fn webfetch_with_format(url: &str, format: WebFetchFormat) -> WebFetchResult {
    let client = match Client::builder()
        .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .user_agent("Mozilla/5.0 (compatible; AIDigitalLife/1.0)")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return error_result(url, &format, format!("Failed to create HTTP client: {}", e))
        },
    };

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return error_result(url, &format, "URL must start with http:// or https://".into());
    }

    match client.get(url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let content_type =
                resp.headers().get("content-type").and_then(|v| v.to_str().ok()).map(String::from);

            let bytes = match resp.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    return error_result(url, &format, format!("Failed to read response: {}", e))
                },
            };

            let (text, truncated) = if bytes.len() > MAX_RESPONSE_SIZE {
                (String::from_utf8_lossy(&bytes[..MAX_RESPONSE_SIZE]).into_owned(), true)
            } else {
                (String::from_utf8_lossy(&bytes).into_owned(), false)
            };

            let content = convert_format(&text, &format);

            WebFetchResult {
                url: url.to_string(),
                status,
                content_type,
                content,
                truncated,
                format: format.as_str().into(),
                error: if status >= 400 { Some(format!("HTTP {}", status)) } else { None },
            }
        },
        Err(e) => error_result(url, &format, format!("Request failed: {}", e)),
    }
}

fn convert_format(html: &str, format: &WebFetchFormat) -> String {
    match format {
        WebFetchFormat::Html => html.to_string(),
        WebFetchFormat::Text => {
            html2text::from_read(html.as_bytes(), 80).unwrap_or_else(|_| html.to_string())
        },
        WebFetchFormat::Markdown => {
            html2text::from_read(html.as_bytes(), 120).unwrap_or_else(|_| html.to_string())
        },
    }
}

fn error_result(url: &str, format: &WebFetchFormat, error: String) -> WebFetchResult {
    WebFetchResult {
        url: url.to_string(),
        status: 0,
        content_type: None,
        content: String::new(),
        truncated: false,
        format: format.as_str().into(),
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_response_size_is_5mb() {
        assert_eq!(MAX_RESPONSE_SIZE, 5 * 1024 * 1024);
    }

    #[test]
    fn default_timeout_is_30_seconds() {
        assert_eq!(DEFAULT_TIMEOUT_SECS, 30);
    }

    #[test]
    fn default_format_is_markdown() {
        assert!(matches!(WebFetchFormat::default(), WebFetchFormat::Markdown));
    }

    #[test]
    fn format_as_str_returns_expected() {
        assert_eq!(WebFetchFormat::Text.as_str(), "text");
        assert_eq!(WebFetchFormat::Markdown.as_str(), "markdown");
        assert_eq!(WebFetchFormat::Html.as_str(), "html");
    }

    #[test]
    fn convert_format_html_passes_through() {
        let html = "<h1>Hello</h1><p>World</p>";
        let result = convert_format(html, &WebFetchFormat::Html);
        assert_eq!(result, html);
    }

    #[test]
    fn convert_format_text_strips_tags() {
        let html = "<h1>Hello</h1><p>World</p>";
        let result = convert_format(html, &WebFetchFormat::Text);
        assert!(result.contains("Hello"));
        assert!(result.contains("World"));
        assert!(!result.contains("<h1>"));
    }

    #[test]
    fn convert_format_markdown_strips_tags() {
        let html = "<h1>Hello</h1><p>World</p>";
        let result = convert_format(html, &WebFetchFormat::Markdown);
        assert!(result.contains("Hello"));
        assert!(result.contains("World"));
        assert!(!result.contains("<h1>"));
    }

    #[test]
    fn error_result_has_expected_fields() {
        let result =
            error_result("http://example.com", &WebFetchFormat::Markdown, "test error".into());
        assert_eq!(result.url, "http://example.com");
        assert_eq!(result.status, 0);
        assert!(result.content.is_empty());
        assert!(!result.truncated);
        assert_eq!(result.format, "markdown");
        assert_eq!(result.error.as_deref(), Some("test error"));
    }

    #[test]
    fn error_result_preserves_format() {
        let result = error_result("http://example.com", &WebFetchFormat::Text, "err".into());
        assert_eq!(result.format, "text");

        let result = error_result("http://example.com", &WebFetchFormat::Html, "err".into());
        assert_eq!(result.format, "html");
    }

    #[tokio::test]
    async fn webfetch_invalid_url_returns_error() {
        let result = webfetch("http://localhost:1/nonexistent").await;
        assert!(result.error.is_some());
        assert_eq!(result.status, 0);
    }

    #[tokio::test]
    async fn webfetch_non_http_url_returns_error() {
        let result = webfetch("ftp://example.com/file").await;
        assert!(result.error.is_some());
        assert!(result.error.as_deref().is_some_and(|e| e.contains("http://")));
    }

    #[tokio::test]
    async fn webfetch_with_format_html_preserves_raw() {
        let result =
            webfetch_with_format("http://localhost:1/nonexistent", WebFetchFormat::Html).await;
        assert_eq!(result.format, "html");
    }

    #[tokio::test]
    async fn webfetch_default_format_is_markdown() {
        let result = webfetch("http://localhost:1/nonexistent").await;
        assert_eq!(result.format, "markdown");
    }

    #[test]
    fn webfetch_format_serde_roundtrip() {
        let format = WebFetchFormat::Markdown;
        let json = serde_json::to_string(&format).expect("serialize");
        let deserialized: WebFetchFormat = serde_json::from_str(&json).expect("deserialize");
        assert!(matches!(deserialized, WebFetchFormat::Markdown));
    }
}
