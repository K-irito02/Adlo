//! Clipboard domain HTTP handlers — exposed to the browser-preview frontend so
//! it can reach clipboard history without a Tauri backend. Mirrors the Tauri
//! `clipboard_list/remove/clear` commands (Task 6) over
//! `crate::ipc::to_response` (`IpcResult`).
//!
//! Routes: `list` / `remove` / `clear` / `write` (store CRUD + clipboard
//! write-back) plus the static assets `thumb/:filename` (thumbnail) and
//! `image/:filename` (full-resolution original, for the zoom-in viewer).
//!
//! Browser-mode clipboard updates rely on frontend polling, so these handlers
//! expose the store CRUD surface plus the two static asset routes; change
//! events are not part of the HTTP contract.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use axum::extract::{Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use std::path::Path;

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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteBody {
    id: String,
}

/// POST `/clipboard/write` — body `{ "id": string }`. 加载条目并按 kind 写回系统剪贴板
/// （text / html / rtf / image），写前统一清空剪贴板（见 `adl_clipboard::write_item_to_clipboard`）。
pub async fn write(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: WriteBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let item = store
            .get(&input.id)?
            .ok_or_else(|| AppError::NotFound("clipboard item not found".into()))?;
        adl_clipboard::write_item_to_clipboard(&item)?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

/// Serve a stored PNG from `dir`. `filename` is sanitised to its basename to
/// prevent path traversal; empty or unknown names return 404.
async fn serve_png(dir: &Path, filename: &str) -> Response {
    let safe = Path::new(filename)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if safe.is_empty() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    match tokio::fs::read(dir.join(&safe)).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, "image/png")], bytes).into_response(),
        Err(e) => {
            // 对外统一 404（静态资产不泄露服务端内情），但区分"文件不存在"与真实读失败，
            // 便于排查"图不显示"的根因（权限/磁盘/路径过长等）。
            if e.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(
                    error = %e,
                    dir = %dir.display(),
                    file = %safe,
                    "clipboard asset read failed"
                );
            }
            (StatusCode::NOT_FOUND, "not found").into_response()
        },
    }
}

/// GET `/clipboard/thumb/:filename` — serves a stored thumbnail image (PNG) from
/// the clipboard store's `thumbs_dir`, for the frontend `<img src>` in the
/// clipboard history panel.
pub async fn thumb(
    State(state): State<ServerState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Response {
    serve_png(state.clipboard_store.thumbs_dir(), &filename).await
}

/// GET `/clipboard/image/:filename` — serves the stored full-resolution PNG from
/// the clipboard store's `images_dir`, so the frontend "zoom in" viewer can show
/// the original image instead of the 256px-capped thumbnail.
pub async fn image(
    State(state): State<ServerState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Response {
    serve_png(state.clipboard_store.images_dir(), &filename).await
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
            html_path: None,
            rtf_path: None,
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

    #[tokio::test]
    async fn write_unknown_id_returns_not_found() {
        let state = test_server_state();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/write")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"id":"ghost"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), axum::http::StatusCode::NOT_FOUND);
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(false));
        assert_eq!(body["error"]["code"], "NOT_FOUND");
    }

    #[tokio::test]
    async fn write_text_item_succeeds() {
        let state = test_server_state();
        state.clipboard_store.insert_or_bump(&sample_item("c-1", "hello")).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/write")
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
    }

    #[tokio::test]
    async fn thumb_serves_stored_thumbnail_and_404s_unknown() {
        let state = test_server_state();
        // 写一张真实缩略图到 store 的 thumbs_dir
        let thumb_path = state.clipboard_store.thumbs_dir().join("thumb-x.png");
        std::fs::write(&thumb_path, b"\x89PNG-fake-bytes").unwrap();
        let app = app_router(state.clone()).with_state(state.clone());

        let ok = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/thumb/thumb-x.png")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(ok.status().is_success());

        let missing = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/thumb/does-not-exist.png")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), axum::http::StatusCode::NOT_FOUND);
        let _ = std::fs::remove_file(&thumb_path);
    }

    #[tokio::test]
    async fn image_serves_stored_original_and_404s_unknown() {
        let state = test_server_state();
        // 写一张"原图"到 store 的 images_dir
        let image_path = state.clipboard_store.images_dir().join("image-x.png");
        std::fs::write(&image_path, b"\x89PNG-fake-original").unwrap();
        // 在 thumbs_dir 写**同名**文件：断言响应字节等于 images_dir 的内容，才能证明原图路由未跨目录取缩略图
        let same_name_in_thumbs = state.clipboard_store.thumbs_dir().join("image-x.png");
        std::fs::write(&same_name_in_thumbs, b"\x89PNG-from-thumbs").unwrap();
        // 仅在 thumbs_dir 存在的文件：请求原图路由必须 404
        let thumbs_only = state.clipboard_store.thumbs_dir().join("thumbs-only.png");
        std::fs::write(&thumbs_only, b"\x89PNG-thumbs-only").unwrap();
        let app = app_router(state.clone()).with_state(state.clone());

        let ok = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/image/image-x.png")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(ok.status().is_success());
        let body = axum::body::to_bytes(ok.into_body(), 1024).await.unwrap();
        assert_eq!(body.as_ref(), b"\x89PNG-fake-original");

        // 原图路由不服务缩略图目录中的文件
        let wrong_dir = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/image/thumbs-only.png")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(wrong_dir.status(), axum::http::StatusCode::NOT_FOUND);

        let missing = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/image/does-not-exist.png")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), axum::http::StatusCode::NOT_FOUND);
        let _ = std::fs::remove_file(&image_path);
        let _ = std::fs::remove_file(&same_name_in_thumbs);
        let _ = std::fs::remove_file(&thumbs_only);
    }

    #[tokio::test]
    async fn asset_routes_reject_traversal_and_degenerate_names() {
        let state = test_server_state();
        // 上级目录放一个"机密"文件，验证穿越/绝对路径都不会被读取
        let secret = state.clipboard_store.images_dir().parent().unwrap().join("secret.png");
        std::fs::write(&secret, b"secret").unwrap();
        let app = app_router(state.clone()).with_state(state.clone());

        for uri in [
            "/clipboard/image/..",
            "/clipboard/image/.",
            "/clipboard/image/%2e%2e%2fsecret.png",
            "/clipboard/image/..%2Fsecret.png",
            "/clipboard/image/a%2F..%2F..%2Fsecret.png",
            "/clipboard/thumb/%2e%2e%2fsecret.png",
        ] {
            let resp = app
                .clone()
                .oneshot(Request::builder().method("GET").uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(resp.status(), axum::http::StatusCode::NOT_FOUND, "expected 404 for {uri}");
        }

        let _ = std::fs::remove_file(&secret);
    }
}
