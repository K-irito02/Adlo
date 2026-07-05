use adl_agent_runtime::tools::webfetch::{webfetch, WebFetchResult};
use adl_agent_runtime::tools::websearch::{websearch, WebSearchResult};

#[tauri::command]
pub async fn web_fetch(url: String) -> Result<WebFetchResult, adl_errors::AppError> {
    Ok(webfetch(&url).await)
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<WebSearchResult, adl_errors::AppError> {
    Ok(websearch(&query).await)
}
