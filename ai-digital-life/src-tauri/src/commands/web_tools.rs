use crate::commands::ipc;
use adl_agent_runtime::tools::webfetch::{webfetch, WebFetchResult};
use adl_agent_runtime::tools::websearch::{websearch, WebSearchResult};
use adl_errors::AppError;
use adl_kernel::IpcResult;

#[tauri::command]
pub async fn web_fetch(url: String) -> Result<IpcResult<WebFetchResult>, AppError> {
    Ok(ipc(Ok(webfetch(&url).await)))
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<IpcResult<WebSearchResult>, AppError> {
    Ok(ipc(Ok(websearch(&query).await)))
}
