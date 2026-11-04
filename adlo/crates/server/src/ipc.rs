use adl_errors::AppError;
use axum::Json;
use axum::http::StatusCode;
use serde_json::Value;

/// Deserialize an axum request body (`Bytes`) into `T`. Shared by every
/// business handler so later domains copy the same error shape.
pub async fn json_body<T: serde::de::DeserializeOwned>(
    it: axum::body::Bytes,
) -> Result<T, (StatusCode, String)> {
    serde_json::from_slice(&it).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))
}

/// Wrap a handler `Result<Value, AppError>` into the frontend `IpcResult<T>`
/// shape (`{ ok, data }` / `{ ok, error }`) plus the matching HTTP status code.
/// The `error.code` strings mirror `ErrorKind::as_str` and the frontend
/// `IpcErrorCode` set.
pub fn to_response(result: Result<Value, AppError>) -> (StatusCode, Json<Value>) {
    match result {
        Ok(v) => (StatusCode::OK, Json(serde_json::json!({ "ok": true, "data": v }))),
        Err(e) => {
            let code = e.error_code();
            let status = match code {
                "NOT_FOUND" => StatusCode::NOT_FOUND,
                "INVALID_INPUT" => StatusCode::BAD_REQUEST,
                "AUTH_ERROR" | "ANNOUNCE" => StatusCode::UNAUTHORIZED,
                "STORAGE_ERROR" | "INTERNAL_ERROR" => StatusCode::INTERNAL_SERVER_ERROR,
                _ => StatusCode::BAD_REQUEST,
            };
            (
                status,
                Json(serde_json::json!({
                    "ok": false,
                    "error": { "code": code, "message": e.to_string() },
                })),
            )
        },
    }
}
