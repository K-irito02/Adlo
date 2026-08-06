use crate::commands::ipc;
use adl_ci_status::CiStatusClient;
use adl_types::{CiJobLogMap, CiRepoConfig, CiStatusSnapshot, IpcResult};

/// Read the CI access token off the async runtime (blocking keyring/file I/O
/// must run on a `spawn_blocking` thread, never on the tokio executor). A join
/// failure is logged and degrades to `None`, same as an absent token — reads
/// may safely degrade, whereas `ci_set_access_token` / `ci_clear_access_token`
/// surface join failures as `AppError::Internal` because a write must never
/// silently succeed.
async fn read_ci_access_token() -> Option<String> {
    tokio::task::spawn_blocking(adl_credential::get_ci_access_token)
        .await
        .inspect_err(|e| tracing::warn!(error = %e, "CI credential read task panicked"))
        .ok()
        .flatten()
}

#[tauri::command]
pub async fn ci_get_status(config: CiRepoConfig) -> IpcResult<CiStatusSnapshot> {
    ipc(async move {
        let client = CiStatusClient::new();
        // 如果前端没传 token，尝试从 credential store 读取
        let access_token = match &config.access_token {
            Some(t) if !t.trim().is_empty() => Some(t.clone()),
            _ => read_ci_access_token().await,
        };
        let effective_config = CiRepoConfig { access_token, ..config };
        client
            .fetch_status(&effective_config)
            .await
            .map_err(|e| adl_errors::AppError::Network(format!("CI status: {e}")))
    }
    .await)
}

#[tauri::command]
pub async fn ci_get_status_without_token(
    owner: String,
    repo: String,
    branch: String,
) -> IpcResult<CiStatusSnapshot> {
    ipc(async move {
        let client = CiStatusClient::new();
        let config = CiRepoConfig { owner, repo, branch, workflow_id: None, access_token: None };
        client
            .fetch_status(&config)
            .await
            .map_err(|e| adl_errors::AppError::Network(format!("CI status: {e}")))
    }
    .await)
}

/// 设置 CI access token 到凭证存储（系统钥匙串优先，失败时使用加密文件回退）
#[tauri::command]
pub async fn ci_set_access_token(token: String) -> IpcResult<bool> {
    ipc(async move {
        let token = token.trim().to_string();
        tokio::task::spawn_blocking(move || adl_credential::set_ci_access_token(&token))
            .await
            .map_err(|e| adl_errors::AppError::Internal(format!("spawn_blocking failed: {e}")))?
            .map(|_| true)
    }
    .await)
}

/// 从凭证存储清除 CI access token
#[tauri::command]
pub async fn ci_clear_access_token() -> IpcResult<bool> {
    ipc(async move {
        tokio::task::spawn_blocking(adl_credential::delete_ci_access_token)
            .await
            .map_err(|e| adl_errors::AppError::Internal(format!("spawn_blocking failed: {e}")))?
            .map(|_| true)
    }
    .await)
}

/// 读取 CI access token 是否存在（不回显 token 内容，仅返回是否存在）
#[tauri::command]
pub async fn ci_has_access_token() -> IpcResult<bool> {
    ipc(async move { Ok(read_ci_access_token().await.is_some()) }.await)
}

/// 获取指定 Workflow Run 的 Job 日志（解压 ZIP，返回 job_id → log_text 映射）
#[tauri::command]
pub async fn ci_get_job_logs(config: CiRepoConfig, run_id: u64) -> IpcResult<CiJobLogMap> {
    ipc(async move {
        let client = CiStatusClient::new();
        let access_token = match &config.access_token {
            Some(t) if !t.trim().is_empty() => Some(t.clone()),
            _ => read_ci_access_token().await,
        };
        let effective_config = CiRepoConfig { access_token, ..config };
        client
            .fetch_job_logs(&effective_config, run_id)
            .await
            .map_err(|e| adl_errors::AppError::Network(format!("fetch job logs: {e}")))
    }
    .await)
}
