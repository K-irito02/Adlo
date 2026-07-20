use crate::commands::ipc;
use adl_errors::AppError;
use adl_tools::webfetch::{WebFetchFormat, WebFetchResult, webfetch_with_format};
use adl_tools::websearch::{WebSearchResult, websearch};
use adl_types::IpcResult;

#[tauri::command]
pub async fn web_fetch(
    url: String,
    format: Option<String>,
) -> Result<IpcResult<WebFetchResult>, AppError> {
    let fmt = match format.as_deref() {
        Some("text") => WebFetchFormat::Text,
        Some("html") => WebFetchFormat::Html,
        _ => WebFetchFormat::default(),
    };
    Ok(ipc(Ok(webfetch_with_format(&url, fmt).await)))
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<IpcResult<WebSearchResult>, AppError> {
    Ok(ipc(Ok(websearch(&query).await)))
}
