//! Web-tools domain HTTP handlers — migrated from
//! `src-tauri/src/commands/web_tools.rs`. Faithful parity: both tools always
//! return a result struct (failures live in the struct's `error` field, never
//! as an HTTP error), matching `adl_tools::webfetch::webfetch_with_format` /
//! `adl_tools::websearch::websearch` and the `WebToolsBridge` contract.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_tools::webfetch::{WebFetchFormat, WebFetchResult, webfetch_with_format};
use adl_tools::websearch::{WebSearchResult, websearch};
use axum::extract::State;
use axum::response::IntoResponse;

#[derive(serde::Deserialize)]
struct WebFetchBody {
    url: String,
    format: Option<String>,
}

#[derive(serde::Deserialize)]
struct WebSearchBody {
    query: String,
}

/// POST `/web-tools/fetch` — fetch a URL and convert it to the requested
/// format (default markdown) (covers `WebToolsBridge.webFetch`).
pub async fn web_fetch(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WebFetchBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let fmt = match input.format.as_deref() {
        Some("text") => WebFetchFormat::Text,
        Some("html") => WebFetchFormat::Html,
        _ => WebFetchFormat::default(),
    };
    let result: WebFetchResult = webfetch_with_format(&input.url, fmt).await;
    let value = serde_json::to_value(&result).map_err(AppError::from);
    ipc::to_response(value)
}

/// POST `/web-tools/search` — web search via the Tavily API (covers
/// `WebToolsBridge.webSearch`).
pub async fn web_search(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WebSearchBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result: WebSearchResult = websearch(&input.query).await;
    let value = serde_json::to_value(&result).map_err(AppError::from);
    ipc::to_response(value)
}
