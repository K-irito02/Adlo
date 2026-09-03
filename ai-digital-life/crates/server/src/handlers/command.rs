//! Command domain HTTP handlers — migrated from `src-tauri/src/commands/
//! command.rs` (custom slash-commands, distinct from the commands_config
//! domain). Risky commands previously gated behind a waiting-approval flow;
//! that flow is removed (approvals are owned by the host / dsh). Low-risk
//! commands run via `adl_command::run_command` and persist the execution;
//! medium/high-risk commands are denied with an explicit error.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{CommandRequest, CommandRunResult, RiskLevel};
use axum::extract::State;
use axum::response::IntoResponse;

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
struct CommandRunInput {
    command: String,
    args: Vec<String>,
    #[serde(default)]
    shell: Option<bool>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListRecentBody {
    #[serde(default)]
    limit: Option<usize>,
}

/// POST `/command/run` — execute low-risk commands; deny medium / high-risk
/// requests with an explicit error (the approval flow that once gated them is
/// removed and owned by the host / dsh).
pub async fn run(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: CommandRunInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = run_inner(&state, input).await;
    ipc::to_response(result)
}

async fn run_inner(
    state: &ServerState,
    input: CommandRunInput,
) -> Result<serde_json::Value, AppError> {
    let workspace = crate::handlers::workspace::current_workspace(state)?;
    let request = adl_command::build_request(
        &workspace.id,
        None,
        input.command,
        input.args,
        input.shell.unwrap_or(false),
    );

    if request.risk_level != RiskLevel::Low {
        // Denied: medium/high-risk command runs previously required an
        // approval decision, and the approval flow has been removed (host /
        // dsh owns approvals). Nothing is persisted, nothing executes.
        return Err(AppError::Security(format!(
            "Command '{}' is denied: it requires approval, and the approval flow \
             has been removed (host-owned)",
            request.command
        )));
    }

    // Low-risk path: save request first (so it's recorded even if run_command
    // fails), then execute, then save execution result.
    {
        let db = state.db.clone();
        let workspace_id = workspace.id.clone();
        let request_clone = request.clone();
        run_blocking(move || -> Result<(), AppError> {
            db.save_entity(
                EntityTable::CommandRequests,
                &request_clone.id,
                Some(&workspace_id),
                None,
                Some("created"),
                &request_clone,
            )
        })
        .await?;
    }

    let result =
        adl_command::run_command(std::path::Path::new(&workspace.root_path), request.clone(), None)
            .await?;

    {
        let db = state.db.clone();
        let workspace_id = workspace.id.clone();
        let result_clone = result.clone();
        run_blocking(move || -> Result<(), AppError> {
            db.save_entity(
                EntityTable::CommandExecutions,
                &result_clone.request.id,
                Some(&workspace_id),
                None,
                Some(if result_clone.success { "completed" } else { "failed" }),
                &result_clone,
            )?;
            Ok(())
        })
        .await?;
    }

    Ok(serde_json::to_value(CommandRunResult {
        status: "completed".into(),
        task_id: result.request.id.clone(),
        request,
        result: Some(result),
        approval_request: None,
    })?)
}

/// POST `/command/recent` — most recent command requests (default limit 20).
pub async fn list_recent(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ListRecentBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let limit = input.limit.unwrap_or(20);
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let requests: Vec<CommandRequest> =
            db.list_entities_with_limit(EntityTable::CommandRequests, limit)?;
        Ok(serde_json::to_value(requests)?)
    })
    .await;
    ipc::to_response(result)
}
