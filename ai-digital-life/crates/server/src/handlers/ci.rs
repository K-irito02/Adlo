//! CI / GitHub domain HTTP handlers — migrated from
//! `src-tauri/src/commands/ci.rs`. The frontend `GitHubBridge` contract is
//! served entirely by `ci_*` commands (there are no separate `github_*` tauri
//! commands in the real code).
//!
//! The access token is **write-only over HTTP**: it is
//! submitted once in the request body, stored in the OS credential store via
//! [`adl_credential`], and never read back — `POST /ci/access-token/has` returns
//! only a boolean. Outbound `CiStatusClient` calls read the stored token
//! server-side as needed, never into the response.

use crate::ServerState;
use crate::ipc;
use adl_ci_status::CiStatusClient;
use adl_errors::AppError;
use adl_types::{CiJobLogMap, CiRepoConfig, CiStatusSnapshot};
use axum::extract::State;
use axum::response::IntoResponse;

/// Read the CI access token off the async runtime (blocking keyring/file I/O
/// must run on a `spawn_blocking` thread, never on the tokio executor). A join
/// failure degrades to `None`, same as an absent token. The file fallback dir
/// comes from `StoragePaths::credentials_dir`.
async fn read_ci_access_token(state: &ServerState) -> Option<String> {
    let dir = state.storage.paths().credentials_dir.clone();
    tokio::task::spawn_blocking(move || adl_credential::get_ci_access_token_in_dir(&dir))
        .await
        .inspect_err(|e| tracing::warn!(error = %e, "CI credential read task panicked"))
        .ok()
        .flatten()
}

fn effective_config(config: &CiRepoConfig, stored: Option<String>) -> CiRepoConfig {
    let access_token = match &config.access_token {
        Some(t) if !t.trim().is_empty() => Some(t.clone()),
        _ => stored,
    };
    CiRepoConfig { access_token, ..config.clone() }
}

/// POST `/ci/status` — CI status for a repo config (covers
/// `GitHubBridge.getStatus`). A token in the body wins; otherwise the stored
/// credential is used.
pub async fn get_status(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let config: CiRepoConfig = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let client = CiStatusClient::new();
    let stored = read_ci_access_token(&state).await;
    let effective = effective_config(&config, stored);
    let result: Result<CiStatusSnapshot, AppError> = client
        .fetch_status(&effective)
        .await
        .map_err(|e| AppError::Network(format!("CI status: {e}")));
    ipc::to_response(result.and_then(|s| serde_json::to_value(&s).map_err(AppError::from)))
}

#[derive(serde::Deserialize)]
struct StatusWithoutTokenBody {
    owner: String,
    repo: String,
    branch: String,
}

/// POST `/ci/status-without-token` — CI status for a public repo without a
/// token (covers `GitHubBridge.getStatusWithoutToken`).
pub async fn get_status_without_token(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: StatusWithoutTokenBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let client = CiStatusClient::new();
    let config = CiRepoConfig {
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        workflow_id: None,
        access_token: None,
    };
    let result: Result<CiStatusSnapshot, AppError> = client
        .fetch_status(&config)
        .await
        .map_err(|e| AppError::Network(format!("CI status: {e}")));
    ipc::to_response(result.and_then(|s| serde_json::to_value(&s).map_err(AppError::from)))
}

#[derive(serde::Deserialize)]
struct SetAccessTokenBody {
    token: String,
}

/// POST `/ci/access-token` — store the CI access token to the credential store
/// (write-only; returns `true`, never the token) (covers
/// `GitHubBridge.setAccessToken`).
pub async fn set_access_token(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SetAccessTokenBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let token = input.token.trim().to_string();
    let credentials_dir = state.storage.paths().credentials_dir.clone();
    let result = tokio::task::spawn_blocking(move || {
        adl_credential::set_ci_access_token_in_dir(&token, credentials_dir)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))
    .and_then(|r| r.map(|()| serde_json::json!(true)));
    ipc::to_response(result)
}

/// POST `/ci/access-token/clear` — remove the stored CI access token (covers
/// `GitHubBridge.clearAccessToken`).
pub async fn clear_access_token(State(state): State<ServerState>) -> impl IntoResponse {
    let credentials_dir = state.storage.paths().credentials_dir.clone();
    let result = tokio::task::spawn_blocking(move || {
        adl_credential::delete_ci_access_token_in_dir(&credentials_dir)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))
    .and_then(|r| r.map(|()| serde_json::json!(true)));
    ipc::to_response(result)
}

/// POST `/ci/access-token/has` — whether a CI access token is configured
/// (boolean only, never the token) (covers `GitHubBridge.hasAccessToken`).
pub async fn has_access_token(State(state): State<ServerState>) -> impl IntoResponse {
    let present = read_ci_access_token(&state).await.is_some();
    ipc::to_response(Ok(serde_json::json!(present)))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobLogsBody {
    config: CiRepoConfig,
    run_id: u64,
}

/// POST `/ci/job-logs` — job logs for a workflow run (covers
/// `GitHubBridge.getJobLogs`).
pub async fn get_job_logs(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: JobLogsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let client = CiStatusClient::new();
    let stored = read_ci_access_token(&state).await;
    let effective = effective_config(&input.config, stored);
    let result: Result<CiJobLogMap, AppError> = client
        .fetch_job_logs(&effective, input.run_id)
        .await
        .map_err(|e| AppError::Network(format!("fetch job logs: {e}")));
    ipc::to_response(result.and_then(|m| serde_json::to_value(&m).map_err(AppError::from)))
}
