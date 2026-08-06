use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const TIMEOUT_SECS: u64 = 15;
const MAX_RESULTS: usize = 10;
const TAVILY_API_URL: &str = "https://api.tavily.com/search";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub query: String,
    pub results: Vec<SearchResultItem>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub score: Option<f64>,
}

/// Search the web using Tavily API (AI-optimized search).
/// API key is retrieved from the credential store.
pub async fn websearch(query: &str) -> WebSearchResult {
    let api_key = {
        // Blocking keyring/credential-file I/O must never run on the tokio
        // executor (D-Bus / Windows Credential Manager can block). Read the key
        // on a blocking thread; a join failure is logged and degrades to the
        // same "no key" result as an absent credential.
        match tokio::task::spawn_blocking(get_search_api_key).await {
            Ok(key) => key,
            Err(e) => {
                tracing::warn!(error = %e, "websearch: credential read task panicked");
                None
            },
        }
    };
    let Some(api_key) = api_key else {
        return WebSearchResult {
            query: query.to_string(),
            results: vec![],
            error: Some(
                "No search API key configured. Set Tavily API key in settings.".to_string(),
            ),
        };
    };

    let client = match Client::builder().timeout(Duration::from_secs(TIMEOUT_SECS)).build() {
        Ok(c) => c,
        Err(e) => {
            return WebSearchResult {
                query: query.to_string(),
                results: vec![],
                error: Some(format!("Failed to create HTTP client: {}", e)),
            };
        },
    };

    let body = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "max_results": MAX_RESULTS,
        "search_depth": "basic",
    });

    match client.post(TAVILY_API_URL).json(&body).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                return WebSearchResult {
                    query: query.to_string(),
                    results: vec![],
                    error: Some(format!("Search API returned {}", resp.status())),
                };
            }

            let json: serde_json::Value = match resp.json().await {
                Ok(j) => j,
                Err(e) => {
                    return WebSearchResult {
                        query: query.to_string(),
                        results: vec![],
                        error: Some(format!("Failed to parse search response: {}", e)),
                    };
                },
            };

            let results = json["results"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .take(MAX_RESULTS)
                        .map(|item| SearchResultItem {
                            title: item["title"].as_str().unwrap_or("").to_string(),
                            url: item["url"].as_str().unwrap_or("").to_string(),
                            snippet: item["content"].as_str().unwrap_or("").to_string(),
                            score: item["score"].as_f64(),
                        })
                        .collect()
                })
                .unwrap_or_default();

            WebSearchResult { query: query.to_string(), results, error: None }
        },
        Err(e) => WebSearchResult {
            query: query.to_string(),
            results: vec![],
            error: Some(format!("Search request failed: {}", e)),
        },
    }
}

/// Retrieve Tavily API key from credential store.
fn get_search_api_key() -> Option<String> {
    let store = adl_credential::CredentialStore::new("ai-digital-life", "websearch-tavily");
    store.get_password().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_results_is_10() {
        assert_eq!(MAX_RESULTS, 10);
    }

    #[test]
    fn timeout_is_15_seconds() {
        assert_eq!(TIMEOUT_SECS, 15);
    }

    #[test]
    fn empty_result_serializes() {
        let result = WebSearchResult { query: "test".to_string(), results: vec![], error: None };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("test"));
    }
}
