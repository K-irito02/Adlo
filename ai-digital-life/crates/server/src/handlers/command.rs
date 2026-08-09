//! Command domain HTTP handlers — migrated from `src-tauri/src/commands/
//! command.rs` (custom slash-commands, distinct from the commands_config
//! domain). Risky commands are persisted as waiting-for-approval (task +
//! approval + audit) without executing; low-risk commands run via
//! `adl_command::run_command` and persist the execution + audit.

use crate::ServerState;
use crate::handlers::audit::save_audit_entry_with_db;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{CommandRequest, CommandRunResult, RiskLevel, TaskOperation};
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

/// POST `/command/run` — execute (low risk) or gate behind approval (medium /
/// high risk). Faithful port of the Tauri `command_run` + `command_run_inner`.
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
        // Risky path: save request + task + approval + audit in one spawn_blocking,
        // then return early (command does NOT execute — it awaits approval).
        let db = state.db.clone();
        let workspace_id = workspace.id.clone();
        let request_clone = request.clone();
        let audit_summary =
            format!("Command requires approval: {} {}", request.command, request.args.join(" "));

        let (task, approval) = run_blocking(
            move || -> Result<(adl_types::TaskRecord, adl_types::ApprovalRecord), AppError> {
                db.save_entity(
                    EntityTable::CommandRequests,
                    &request_clone.id,
                    Some(&workspace_id),
                    None,
                    Some("created"),
                    &request_clone,
                )?;
                let (task, approval) =
                    approval_for_command_with_db(&db, &workspace_id, &request_clone)?;
                if let Err(e) = save_audit_entry_with_db(
                    &db,
                    &workspace_id,
                    Some("command"),
                    "approval",
                    request_clone.risk_level,
                    audit_summary,
                    None,
                    Some(&format!("taskId={}", task.id)),
                ) {
                    tracing::warn!(error = %e, "failed to save audit entry for command approval");
                }
                Ok((task, approval))
            },
        )
        .await?;

        return Ok(serde_json::to_value(CommandRunResult {
            status: "waiting-approval".into(),
            task_id: task.id,
            request,
            result: None,
            approval_request: Some(approval.request),
        })?);
    }

    // Low-risk path: save request first (so it's recorded even if run_command
    // fails), then execute, then save execution result + audit.
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
        let request_clone = request.clone();
        let result_clone = result.clone();
        let audit_summary = result.summary.clone();
        let risk_level = request.risk_level;
        run_blocking(move || -> Result<(), AppError> {
            db.save_entity(
                EntityTable::CommandExecutions,
                &result_clone.request.id,
                Some(&workspace_id),
                None,
                Some(if result_clone.success { "completed" } else { "failed" }),
                &result_clone,
            )?;
            if let Err(e) = save_audit_entry_with_db(
                &db,
                &workspace_id,
                Some("command"),
                "command",
                risk_level,
                audit_summary,
                Some("auto"),
                Some(&format!(
                    "command={} {}",
                    request_clone.command,
                    request_clone.args.join(" ")
                )),
            ) {
                tracing::warn!(error = %e, "failed to save audit entry for command execution");
            }
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

/// Create the approval task + approval records for a risky command (faithful
/// port of the Tauri `approval_for_command_with_db`).
fn approval_for_command_with_db(
    db: &adl_storage::Database,
    workspace_id: &str,
    request: &CommandRequest,
) -> Result<(adl_types::TaskRecord, adl_types::ApprovalRecord), AppError> {
    let operation = TaskOperation {
        kind: "command.run".into(),
        target: Some(format!("{} {}", request.command, request.args.join(" "))),
        params: serde_json::to_value(request)?,
        risk_level: request.risk_level,
        reversible: false,
    };
    let mut task =
        adl_task::make_task(workspace_id, "command", "Command requires approval.", operation);
    let mut approval = adl_task::make_approval(&task, "Command execution approval");
    approval.run_id = request.run_id.clone();
    task.approval_id = Some(approval.id.clone());
    db.save_entity(
        EntityTable::Tasks,
        &task.id,
        Some(workspace_id),
        Some("command"),
        Some("waiting-approval"),
        &task,
    )?;
    db.save_entity(
        EntityTable::Approvals,
        &approval.id,
        Some(workspace_id),
        Some(&task.session_id),
        Some("pending"),
        &approval,
    )?;
    Ok((task, approval))
}
