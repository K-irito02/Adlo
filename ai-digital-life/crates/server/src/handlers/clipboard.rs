//! Clipboard domain HTTP handlers — exposed to the browser-preview frontend so
//! it can reach clipboard history without a Tauri backend. Mirrors the Tauri
//! `clipboard_list/remove/clear` commands (Task 6) over
//! `crate::ipc::to_response` (`IpcResult`).
//!
//! Browser-mode clipboard updates rely on frontend `sinceId` polling, so these
//! handlers only expose the store CRUD surface (list/remove/clear); change
//! events are not part of the HTTP contract.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

/// Run a blocking closure on `spawn_blocking` and collapse a join error into
/// `AppError::Internal`, keeping the `impl IntoResponse` signature a plain
/// `(StatusCode, Json<Value>)` (recipe shared with the workspace/snapshot handlers).
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

/// GET `/clipboard/list?limit=N` — clipboard history newest-first, capped at 500.
pub async fn list(
    State(state): State<ServerState>,
    Query(q): Query<ListQuery>,
) -> impl IntoResponse {
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let items = store.list(q.limit.unwrap_or(100).min(500))?;
        Ok(serde_json::to_value(&items)?)
    })
    .await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    pub limit: Option<usize>,
}

/// POST `/clipboard/remove` — body `{ "id": string }`; hard-deletes one entry
/// (DB row + its image/thumbnail files).
pub async fn remove(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RemoveBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let removed = store.remove(&input.id)?;
        Ok(serde_json::json!(removed))
    })
    .await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveBody {
    id: String,
}

/// POST `/clipboard/clear` — wipes the whole clipboard history, returns removed count.
pub async fn clear(State(state): State<ServerState>) -> impl IntoResponse {
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let count = store.clear()?;
        Ok(serde_json::json!(count))
    })
    .await;
    ipc::to_response(result)
}

#[cfg(test)]
mod tests {
    use crate::router::app_router;
    use crate::test_util::test_server_state;
    use adl_types::now_ms;
    use adl_types::types::clipboard::ClipboardItem;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn sample_item(id: &str, content: &str) -> ClipboardItem {
        ClipboardItem {
            id: id.into(),
            kind: "text".into(),
            content: Some(content.into()),
            digest: None,
            image_path: None,
            thumb_path: None,
            image_width: None,
            image_height: None,
            source_app: None,
            created_at: now_ms(),
        }
    }

    async fn body_json(resp: axum::response::Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn list_returns_items_newest_first() {
        let state = test_server_state();
        state.clipboard_store.insert_or_bump(&sample_item("c-1", "hello")).unwrap();
        state.clipboard_store.insert_or_bump(&sample_item("c-2", "world")).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/list?limit=10")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(true));
        assert_eq!(body["data"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn remove_hard_deletes_one_item() {
        let state = test_server_state();
        state.clipboard_store.insert_or_bump(&sample_item("c-1", "x")).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/remove")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"id":"c-1"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(true));
        assert_eq!(body["data"], serde_json::json!(true));
        assert_eq!(state.clipboard_store.list(10).unwrap().len(), 0);
    }

    #[tokio::test]
    async fn clear_wipes_whole_history() {
        let state = test_server_state();
        state.clipboard_store.insert_or_bump(&sample_item("c-1", "a")).unwrap();
        state.clipboard_store.insert_or_bump(&sample_item("c-2", "b")).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/clear")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(true));
        assert_eq!(body["data"], serde_json::json!(2));
        assert_eq!(state.clipboard_store.list(10).unwrap().len(), 0);
    }
}
