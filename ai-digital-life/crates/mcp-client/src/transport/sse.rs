use crate::McpServerConfig;
use rmcp::transport::StreamableHttpClientTransport;

pub struct SseTransport {
    pub config: McpServerConfig,
}

impl SseTransport {
    pub fn new(config: McpServerConfig) -> Self {
        Self { config }
    }

    pub async fn connect(
        &self,
    ) -> Result<StreamableHttpClientTransport<reqwest::Client>, adl_errors::AppError> {
        let url =
            self.config.url.as_ref().ok_or_else(|| {
                adl_errors::AppError::Internal("SSE transport requires a URL".into())
            })?;

        let transport = StreamableHttpClientTransport::from_uri(url.as_str());

        tracing::info!(url = ?url, "SseTransport connected");
        Ok(transport)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::McpTransportType;
    use std::collections::HashMap;

    #[test]
    fn constructs_with_config() {
        let config = McpServerConfig {
            name: "test".to_string(),
            transport: McpTransportType::Sse,
            command: None,
            args: vec![],
            url: Some("https://example.com/sse".to_string()),
            env: HashMap::new(),
            oauth: false,
            enabled: true,
        };
        let transport = SseTransport::new(config);
        assert_eq!(transport.config.name, "test");
    }
}
