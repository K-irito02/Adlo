//! Clipboard domain HTTP handlers — exposed to the browser-preview frontend so
//! it can reach clipboard history without a Tauri backend. Mirrors the Tauri
//! `clipboard_list/remove/clear` commands (Task 6) over
//! `crate::ipc::to_response` (`IpcResult`).
//!
//! Routes: `list` / `remove` / `clear` / `write` / `update` (store CRUD +
//! clipboard write-back + in-place text edit) plus the static assets
//! `thumb/:filename` (thumbnail),
//! `image/:filename` (full-resolution original, for the zoom-in viewer),
//! `html/:filename` / `rtf/:filename` (rich-text sidecars) and
//! `export?id=N` (the item payload streamed as a downloadable file).
//!
//! Clipboard change notifications are pushed to the frontend over the WebSocket
//! route (`/ws/workspace` → `clipboard-changed`), not through this HTTP surface.
//! These handlers expose the store CRUD surface plus the static asset routes;
//! change events are deliberately not part of the HTTP contract.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_types::types::clipboard::ClipboardKind;
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBody {
    id: String,
    content: String,
}

/// POST `/clipboard/update` — body `{ id, content }`。`text` 与 `html` 条目可编辑
/// （html 编辑的是纯文本侧 `content`，与 sidecar 无关；sidecar 只由捕获写入）；
/// 原地更新 `content` 并**保留 `created_at`**（列表按 createdAt 倒序 → 位置不变），
/// 不动去重指纹（html 的 digest 仍按 sidecar 载荷）。
pub async fn update(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: UpdateBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut item = store
            .get(&input.id)?
            .ok_or_else(|| AppError::NotFound("clipboard item not found".into()))?;
        if item.kind != ClipboardKind::Text && item.kind != ClipboardKind::Html {
            return Err(AppError::InvalidInput("only text and html items are editable".into()));
        }
        if input.content.trim().is_empty() {
            return Err(AppError::InvalidInput("content must not be empty".into()));
        }
        item.content = Some(input.content);
        store.save(&item)?;
        Ok(serde_json::to_value(&item)?)
    })
    .await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
pub struct ExportQuery {
    pub id: String,
}

/// GET `/clipboard/export?id=N` — 以文件形式返回条目载荷（text→.txt / html→.html / rtf→.rtf / image→.png）。
pub async fn export(State(state): State<ServerState>, Query(q): Query<ExportQuery>) -> Response {
    let store = state.clipboard_store.clone();
    let loaded = run_blocking(move || -> Result<(Vec<u8>, String, &'static str), AppError> {
        let item = store
            .get(&q.id)?
            .ok_or_else(|| AppError::NotFound("clipboard item not found".into()))?;
        match item.kind {
            ClipboardKind::Image => {
                let p = item.image_path.ok_or_else(|| AppError::NotFound("no image".into()))?;
                let bytes = std::fs::read(&p).map_err(|e| AppError::Io(e.to_string()))?;
                Ok((bytes, format!("clipboard-{}.png", item.id), "image/png"))
            },
            ClipboardKind::Html => {
                let p = item.html_path.ok_or_else(|| AppError::NotFound("no html".into()))?;
                let bytes = std::fs::read(&p).map_err(|e| AppError::Io(e.to_string()))?;
                Ok((bytes, format!("clipboard-{}.html", item.id), "text/plain; charset=utf-8"))
            },
            ClipboardKind::Rtf => {
                let p = item.rtf_path.ok_or_else(|| AppError::NotFound("no rtf".into()))?;
                let bytes = std::fs::read(&p).map_err(|e| AppError::Io(e.to_string()))?;
                Ok((bytes, format!("clipboard-{}.rtf", item.id), "text/plain; charset=utf-8"))
            },
            ClipboardKind::Text => Ok((
                item.content.unwrap_or_default().into_bytes(),
                format!("clipboard-{}.txt", item.id),
                "text/plain; charset=utf-8",
            )),
        }
    })
    .await;
    match loaded {
        Ok((bytes, filename, ctype)) => (
            [
                (header::CONTENT_TYPE, ctype.to_string()),
                (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{filename}\"")),
            ],
            bytes,
        )
            .into_response(),
        // 失败时沿用本文件的统一 JSON `IpcResult` 错误体（非裸状态码）。
        Err(e) => ipc::to_response(Err(e)).into_response(),
    }
}

/// Serve a stored asset from `dir` under the given `content_type`. `filename`
/// is sanitised to its basename to prevent path traversal; empty or unknown
/// names return 404.
async fn serve_asset(dir: &Path, filename: &str, content_type: &'static str) -> Response {
    let safe = Path::new(filename)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if safe.is_empty() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    match tokio::fs::read(dir.join(&safe)).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, content_type)], bytes).into_response(),
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
    serve_asset(state.clipboard_store.thumbs_dir(), &filename, "image/png").await
}

/// GET `/clipboard/image/:filename` — serves the stored full-resolution PNG from
/// the clipboard store's `images_dir`, so the frontend "zoom in" viewer can show
/// the original image instead of the 256px-capped thumbnail.
pub async fn image(
    State(state): State<ServerState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Response {
    serve_asset(state.clipboard_store.images_dir(), &filename, "image/png").await
}

/// GET `/clipboard/html/:filename` — 服务 HTML 载荷 sidecar。
///
/// 以 `text/plain` 返回（**刻意**不返回 `text/html`）：前端 `fetch().text()` 取源后注入
/// `sandbox=""` 的 iframe 预览，避免浏览器把存储的 HTML 当文档渲染而引入 XSS。请勿改回 `text/html`。
pub async fn html(
    State(state): State<ServerState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Response {
    serve_asset(state.clipboard_store.html_dir(), &filename, "text/plain; charset=utf-8").await
}

/// GET `/clipboard/rtf/:filename` — 服务 RTF 载荷 sidecar。
pub async fn rtf(
    State(state): State<ServerState>,
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Response {
    serve_asset(state.clipboard_store.rtf_dir(), &filename, "text/plain; charset=utf-8").await
}

#[cfg(test)]
mod tests {
    use crate::router::app_router;
    use crate::test_util::test_server_state;
    use adl_types::now_ms;
    use adl_types::types::clipboard::{ClipboardItem, ClipboardKind};
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn sample_item(id: &str, content: &str) -> ClipboardItem {
        ClipboardItem {
            id: id.into(),
            kind: ClipboardKind::Text,
            content: Some(content.into()),
            digest: None,
            image_path: None,
            thumb_path: None,
            image_width: None,
            image_height: None,
            image_bytes: None,
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
            "/clipboard/html/%2e%2e%2fsecret.html",
            "/clipboard/rtf/..",
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

    #[tokio::test]
    async fn html_and_rtf_routes_serve_sidecars() {
        let state = test_server_state();
        std::fs::write(state.clipboard_store.html_dir().join("a.html"), b"<b>hi</b>").unwrap();
        std::fs::write(state.clipboard_store.rtf_dir().join("a.rtf"), b"{\\rtf1}").unwrap();
        let app = app_router(state.clone()).with_state(state.clone());

        let html = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/html/a.html")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(html.status().is_success());
        assert_eq!(
            html.headers().get(axum::http::header::CONTENT_TYPE).unwrap(),
            "text/plain; charset=utf-8"
        );
        let bytes = axum::body::to_bytes(html.into_body(), 1024).await.unwrap();
        assert_eq!(bytes.as_ref(), b"<b>hi</b>");

        let rtf = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/rtf/a.rtf")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(rtf.status().is_success());
        assert_eq!(
            rtf.headers().get(axum::http::header::CONTENT_TYPE).unwrap(),
            "text/plain; charset=utf-8"
        );
        let rtf_bytes = axum::body::to_bytes(rtf.into_body(), 1024).await.unwrap();
        assert_eq!(rtf_bytes.as_ref(), b"{\\rtf1}");

        let missing = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/html/nope.html")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), axum::http::StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn export_returns_payload_with_filename() {
        let state = test_server_state();
        state.clipboard_store.insert_or_bump(&sample_item("e-1", "hello")).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/clipboard/export?id=e-1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        assert!(resp.headers().get(axum::http::header::CONTENT_DISPOSITION).is_some());
        let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        assert_eq!(bytes.as_ref(), b"hello");
    }

    #[tokio::test]
    async fn update_edits_text_in_place_and_keeps_created_at() {
        let state = test_server_state();
        let mut it = sample_item("u-1", "before");
        it.created_at = 111;
        state.clipboard_store.insert_or_bump(&it).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/update")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"id":"u-1","content":"after"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["data"]["content"], serde_json::json!("after"));
        assert_eq!(body["data"]["createdAt"], serde_json::json!(111));

        let missing = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/update")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"id":"u-1","content":"  "}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), axum::http::StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn update_edits_html_text_side_and_leaves_sidecar_alone() {
        let state = test_server_state();
        let mut it = sample_item("h-1", "old text");
        it.kind = ClipboardKind::Html;
        it.html_path = Some("h-1.html".into());
        // 真实 Html 条目恒带载荷指纹：fixture 同样带上，否则"指纹不动"断言无意义。
        it.digest = Some("abc123".into());
        it.created_at = 222;
        state.clipboard_store.insert_or_bump(&it).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/clipboard/update")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"id":"h-1","content":"new text"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["data"]["content"], serde_json::json!("new text"));
        // sidecar 与指纹不动：文本编辑不碰富载荷（响应体 + 落库行双确认）。
        assert_eq!(body["data"]["htmlPath"], serde_json::json!("h-1.html"));
        assert_eq!(body["data"]["digest"], serde_json::json!("abc123"));
        assert_eq!(body["data"]["createdAt"], serde_json::json!(222));
        let stored = state.clipboard_store.get("h-1").unwrap().unwrap();
        assert_eq!(stored.content.as_deref(), Some("new text"));
        assert_eq!(stored.digest.as_deref(), Some("abc123"));
        assert_eq!(stored.html_path.as_deref(), Some("h-1.html"));
    }

    #[tokio::test]
    async fn update_rejects_non_editable_kinds_and_missing_ids() {
        let state = test_server_state();
        let mut img = sample_item("img-9", "x");
        img.kind = ClipboardKind::Image;
        state.clipboard_store.insert_or_bump(&img).unwrap();
        let mut rtf = sample_item("rtf-9", "x");
        rtf.kind = ClipboardKind::Rtf;
        state.clipboard_store.insert_or_bump(&rtf).unwrap();
        let app = app_router(state.clone()).with_state(state.clone());
        for (id, content, status) in [
            ("img-9", "new", axum::http::StatusCode::BAD_REQUEST),
            ("rtf-9", "new", axum::http::StatusCode::BAD_REQUEST),
            ("missing-9", "new", axum::http::StatusCode::NOT_FOUND),
        ] {
            let resp = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/clipboard/update")
                        .header("content-type", "application/json")
                        .body(Body::from(format!(r#"{{"id":"{id}","content":"{content}"}}"#)))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(resp.status(), status);
        }
    }
}
