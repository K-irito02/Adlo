//! Dsh-harness domain HTTP handlers — dsh 宿主壳业务（拉起/关闭 + 版本管理）。
//!
//! 遵循 retrieval 域配方：`State(state): State<ServerState>` 提取状态，
//! 结果用 [`crate::ipc::to_response`] 包装为 `IpcResult<T>`。dsh 进程宿主在
//! [`ServerState::dsh_state`]（`Arc<AsyncMutex<Option<HostedProcess>>>`）；
//! 由于 `HostedProcess` 内含 `tokio::process::Child` 不可 Clone，运行状态由锁内
//! `Option` 持有，handler 一律用 async `lock().await` 直写（不在 `spawn_blocking`
//! 内持有 tokio Mutex）。

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_webapp_host::HostedProcess;
use adl_webapp_host::spawn_and_wait_ready;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;

/// dsh 版本目录 root（宿主持有的版本目录位置）。
pub fn dsh_root(state: &ServerState) -> PathBuf {
    dsh_root_dir(&state.data_dir)
}

/// 含数据根目录的 dsh 版本目录拼接（纯函数，便于单测）。
fn dsh_root_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("dsh-versions")
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloseInput {
    #[serde(default = "default_true")]
    keep: bool,
}

fn default_true() -> bool {
    true
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionInput {
    version: String,
}

/// POST `/dsh/open` — 拉起 dsh 进程（若已运行返回已有 URL）。返回就绪 URL。
pub async fn open(State(state): State<ServerState>) -> impl IntoResponse {
    let result = run_open(state.dsh_state.clone()).await;
    ipc::to_response(result)
}

async fn run_open(
    dsh_guard: Arc<AsyncMutex<Option<HostedProcess>>>,
) -> Result<serde_json::Value, AppError> {
    let mut guard = dsh_guard.lock().await;
    if let Some(ref hp) = *guard {
        return Ok(serde_json::json!(hp.url));
    }
    // npx 固定版本：当前先用 @latest；将来版本号可从
    // `adl_dsh_version::read_selected` 读取代入选中的 `<version>`（spec §8 待细化）。
    let args =
        vec!["@deepseek-ai/dsh@latest", "--profile", "web"].into_iter().map(String::from).collect::<Vec<_>>();
    let hp = spawn_and_wait_ready("npx", &args, std::time::Duration::from_secs(60)).await?;
    let url = hp.url.clone();
    *guard = Some(hp);
    Ok(serde_json::json!(url))
}

/// POST `/dsh/close` — 关闭 dsh 进程。`keep=true`（缺省）：保留进程运行；
/// `keep=false`：kill 子进程并置 `dsh_state` 为 `None`。返回 `true`。
pub async fn close(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: CloseInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = close_inner(&state, input.keep).await;
    ipc::to_response(result)
}

async fn close_inner(state: &ServerState, keep: bool) -> Result<serde_json::Value, AppError> {
    // tokio Mutex 只在此 async 作用域短暂持有（不跨 spawn_blocking），符合规范。
    let mut guard = state.dsh_state.lock().await;
    if !keep {
        if let Some(mut hp) = guard.take() {
            let _ = hp.child.kill().await;
        }
    }
    Ok(serde_json::json!(true))
}

/// POST `/dsh/get-version-status` — 查询 dsh 版本目录状态（`VersionStatus`）。
pub async fn get_version_status(State(state): State<ServerState>) -> impl IntoResponse {
    let root = dsh_root(&state);
    let result = match adl_dsh_version::get_version_status(&root).await {
        Ok(v) => serde_json::to_value(&v).map_err(|e| AppError::Internal(e.to_string())),
        Err(e) => Err(e),
    };
    ipc::to_response(result)
}

/// POST `/dsh/update` — 升级 dsh 至最新可用版本，返回新版本串。
pub async fn update(State(state): State<ServerState>) -> impl IntoResponse {
    let root = dsh_root(&state);
    let result = adl_dsh_version::update(&root).await.map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// POST `/dsh/revert` — 回退到指定的已安装版本，返回该版本串。body: `{ version }`。
pub async fn revert(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root = dsh_root(&state);
    let result = adl_dsh_version::revert(&root, &input.version).await.map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

/// POST `/dsh/uninstall` — 卸载指定版本。body: `{ version }`，成功返回 `true`。
pub async fn uninstall(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: VersionInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root = dsh_root(&state);
    let result =
        adl_dsh_version::uninstall(&root, &input.version).await.map(|()| serde_json::json!(true));
    ipc::to_response(result)
}

/// POST `/dsh/reinstall` — 按当前选中版本重装最新可用版本，返回新版本串。
pub async fn reinstall(State(state): State<ServerState>) -> impl IntoResponse {
    let root = dsh_root(&state);
    let result = adl_dsh_version::reinstall(&root).await.map(|v| serde_json::json!(v));
    ipc::to_response(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// dsh_root 返回 data_dir 下的 dsh-versions。
    #[test]
    fn dsh_root_returns_data_dir_child() {
        let data_dir = Path::new("/tmp/data");
        assert_eq!(dsh_root_dir(data_dir), PathBuf::from("/tmp/data/dsh-versions"));
    }

    /// close 在进程未运行时（keep=任意）幂等返回 `true`，不 panic。
    #[tokio::test]
    async fn close_without_process_is_ok() {
        let dir = std::env::temp_dir().join(format!(
            "adl-dsh-close-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let state = crate::engine::init_server_state(&dir).await.unwrap();
        let result = close_inner(&state, true).await.unwrap();
        assert_eq!(result, serde_json::json!(true));
        let result = close_inner(&state, false).await.unwrap();
        assert_eq!(result, serde_json::json!(true));
        let guard = state.dsh_state.lock().await;
        assert!(guard.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// `revert`/`uninstall` 对非法 body 返回 BAD_REQUEST（INVALID_INPUT），不触达版本逻辑。
    #[test]
    fn version_input_camelcase_deserializes() {
        let v: VersionInput = serde_json::from_str(r#"{ "version": "1.2.3" }"#).unwrap();
        assert_eq!(v.version, "1.2.3");
    }
}