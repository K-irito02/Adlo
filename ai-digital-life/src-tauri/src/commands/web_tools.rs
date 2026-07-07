use crate::commands::ipc;
use adl_agent_runtime::tools::webfetch::{webfetch_with_format, WebFetchFormat, WebFetchResult};
use adl_agent_runtime::tools::websearch::{websearch, WebSearchResult};
use adl_errors::AppError;
use adl_kernel::IpcResult;

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
