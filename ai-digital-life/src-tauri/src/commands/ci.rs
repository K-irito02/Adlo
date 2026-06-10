use crate::commands::ipc;
use adl_ci_status::CiStatusClient;
use adl_kernel::{CiJobLogMap, CiRepoConfig, CiStatusSnapshot, IpcResult};

#[tauri::command]
pub async fn ci_get_status(config: CiRepoConfig) -> IpcResult<CiStatusSnapshot> {
    ipc(async move {
        let client = CiStatusClient::new();
        // 如果前端没传 token，尝试从 credential store 读取
        let access_token = match &config.access_token {
            Some(t) if !t.trim().is_empty() => Some(t.clone()),
            _ => adl_credential::get_ci_access_token(),
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
        adl_credential::set_ci_access_token(token.trim())
            .map(|_| true)
            .map_err(|e| adl_errors::AppError::Security(e.to_string()))
    }
    .await)
}

/// 从凭证存储清除 CI access token
#[tauri::command]
pub async fn ci_clear_access_token() -> IpcResult<bool> {
    ipc(async move {
        adl_credential::delete_ci_access_token()
            .map(|_| true)
            .map_err(|e| adl_errors::AppError::Security(e.to_string()))
    }
    .await)
}

/// 读取 CI access token 是否存在（不回显 token 内容，仅返回是否存在）
#[tauri::command]
pub async fn ci_has_access_token() -> IpcResult<bool> {
    ipc(async move { Ok(adl_credential::get_ci_access_token().is_some()) }.await)
}

/// 获取指定 Workflow Run 的 Job 日志（解压 ZIP，返回 job_id → log_text 映射）
#[tauri::command]
pub async fn ci_get_job_logs(config: CiRepoConfig, run_id: u64) -> IpcResult<CiJobLogMap> {
    ipc(async move {
        let client = CiStatusClient::new();
        let access_token = match &config.access_token {
            Some(t) if !t.trim().is_empty() => Some(t.clone()),
            _ => adl_credential::get_ci_access_token(),
        };
        let effective_config = CiRepoConfig { access_token, ..config };
        client
            .fetch_job_logs(&effective_config, run_id)
            .await
            .map_err(|e| adl_errors::AppError::Network(format!("fetch job logs: {e}")))
    }
    .await)
}
