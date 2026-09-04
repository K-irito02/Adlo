//! System-monitor domain HTTP handler — exposes a `sysinfo`-based snapshot to the
//! browser-preview frontend, mirroring the Tauri `sysmon_snapshot` command (Task 6).
//!
//! `SystemMonitor::snapshot` takes `&mut self`, so the monitor lives behind an
//! `Arc<StdMutex<SystemMonitor>>` in `ServerState`. The lock is taken and released
//! entirely inside the `run_blocking` closure, so no `MutexGuard` crosses an await.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use axum::extract::State;
use axum::response::IntoResponse;

/// Run a blocking closure on `spawn_blocking` and collapse a join error into
/// `AppError::Internal` (recipe shared with the workspace/snapshot handlers).
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

/// GET `/sysmon/snapshot` — a fresh `SystemSnapshot` (cpu/memory/disk/network/processes).
pub async fn snapshot(State(state): State<ServerState>) -> impl IntoResponse {
    let sysmon = state.sysmon.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut monitor =
            sysmon.lock().map_err(|_| AppError::Internal("sysmon lock poisoned".into()))?;
        let snap = monitor.snapshot();
        Ok(serde_json::to_value(&snap)?)
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

    #[tokio::test]
    async fn snapshot_returns_well_formed() {
        let state = test_server_state();
        let app = app_router(state.clone()).with_state(state.clone());
        // warm-up snapshot so a second read yields network/cpu data
        {
            let _ = state.sysmon.lock().unwrap().snapshot();
        }
        let resp = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sysmon/snapshot")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(resp.status().is_success());
        let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["ok"], serde_json::json!(true));
        assert!(body["data"]["memoryTotal"].is_number());
        assert!(body["data"]["cpuPerCore"].as_array().map(|a| !a.is_empty()).unwrap_or(false));
    }
}
