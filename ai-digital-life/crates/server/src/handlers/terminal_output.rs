//! Terminal-output persistence domain HTTP handlers — save / load / delete
//! session-scoped terminal output blobs. Backed by the `terminal_output`
//! SQLite table (migration v9).

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use axum::extract::State;
use axum::response::IntoResponse;
use rusqlite::params;
use rusqlite::OptionalExtension;

/// Run a blocking closure and collapse the `spawn_blocking` join error into an
/// `AppError::Internal`.
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveBody {
    session_id: String,
    output: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionIdBody {
    session_id: String,
}

/// POST `/terminal/save` — upsert terminal output for a session.
pub async fn save(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SaveBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => {
            return ipc::to_response(Err(AppError::InvalidInput(msg)));
        }
    };
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let conn = db.conn()?;
        conn.execute(
            "INSERT OR REPLACE INTO terminal_output (session_id, output, byte_size, updated_at)
             VALUES (?1, ?2, ?3, unixepoch())",
            params![input.session_id, input.output.as_bytes(), input.output.len() as i64],
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(serde_json::json!(null))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/terminal/load` — load terminal output for a session.
pub async fn load(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SessionIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => {
            return ipc::to_response(Err(AppError::InvalidInput(msg)));
        }
    };
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let conn = db.conn()?;
        let output: Option<String> = conn
            .query_row(
                "SELECT output FROM terminal_output WHERE session_id = ?1",
                params![input.session_id],
                |row| {
                    let bytes: Vec<u8> = row.get(0)?;
                    Ok(String::from_utf8_lossy(&bytes).to_string())
                },
            )
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(serde_json::json!(output))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/terminal/delete` — delete terminal output for a session.
pub async fn delete(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SessionIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => {
            return ipc::to_response(Err(AppError::InvalidInput(msg)));
        }
    };
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let conn = db.conn()?;
        conn.execute(
            "DELETE FROM terminal_output WHERE session_id = ?1",
            params![input.session_id],
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(serde_json::json!(null))
    })
    .await;
    ipc::to_response(result)
}

#[cfg(test)]
mod tests {
    use crate::router::app_router;
    use crate::test_util::test_server_state;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    async fn body_json(resp: axum::response::Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn save_and_load_round_trip() {
        let state = test_server_state();
        let app = app_router(state.clone()).with_state(state.clone());

        // Save
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/terminal/save")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"sessionId":"s1","output":"hello world"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(true));

        // Load
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/terminal/load")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"sessionId":"s1"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(true));
        assert_eq!(body["data"], serde_json::json!("hello world"));
    }

    #[tokio::test]
    async fn load_missing_returns_null() {
        let state = test_server_state();
        let app = app_router(state.clone()).with_state(state.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/terminal/load")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"sessionId":"ghost"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let body = body_json(resp).await;
        assert_eq!(body["ok"], serde_json::json!(true));
        assert_eq!(body["data"], serde_json::json!(null));
    }

    #[tokio::test]
    async fn delete_removes_entry() {
        let state = test_server_state();
        let app = app_router(state.clone()).with_state(state.clone());

        // Save
        app.clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/terminal/save")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"sessionId":"s2","output":"data"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Delete
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/terminal/delete")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"sessionId":"s2"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());

        // Load should return null
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/terminal/load")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"sessionId":"s2"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = body_json(resp).await;
        assert_eq!(body["data"], serde_json::json!(null));
    }
}
