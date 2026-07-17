use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_command::{build_request, run_command};
use adl_errors::AppError;
use adl_storage::{Database, EntityTable};
use adl_types::{CommandRequest, CommandRunResult, IpcResult, RiskLevel, TaskOperation};
use tauri::Manager;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRunInput {
    pub command: String,
    pub args: Vec<String>,
    pub shell: Option<bool>,
}

#[tauri::command]
pub async fn command_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: CommandRunInput,
) -> Result<IpcResult<CommandRunResult>, CommandError> {
    Ok(ipc(command_run_inner(&app, &state, input).await))
}

#[tauri::command]
pub async fn command_list_recent(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<IpcResult<Vec<CommandRequest>>, CommandError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let limit_val = limit.unwrap_or(20);
    let requests = tokio::task::spawn_blocking(move || -> Result<Vec<CommandRequest>, AppError> {
        let mut requests: Vec<CommandRequest> = db.list_entities(EntityTable::CommandRequests)?;
        requests.sort_by_key(|request| std::cmp::Reverse(request.created_at));
        requests.truncate(limit_val);
        Ok(requests)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(requests)))
}

async fn command_run_inner(
    _app: &tauri::AppHandle,
    state: &AppState,
    input: CommandRunInput,
) -> Result<CommandRunResult, AppError> {
    let workspace = crate::commands::workspace::current_workspace(state)?;
    let request =
        build_request(&workspace.id, None, input.command, input.args, input.shell.unwrap_or(false));

    if request.risk_level != RiskLevel::Low {
        // Risky path: save request + task + approval + audit in one spawn_blocking,
        // then return early (command does NOT execute — it awaits approval).
        let db = state.db.clone();
        let workspace_id = workspace.id.clone();
        let request_clone = request.clone();
        let audit_summary =
            format!("Command requires approval: {} {}", request.command, request.args.join(" "));

        let (task, approval) = tokio::task::spawn_blocking(
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
                let _ = crate::commands::audit::save_audit_entry_with_db(
                    &db,
                    &workspace_id,
                    Some("command"),
                    "approval",
                    request_clone.risk_level,
                    audit_summary,
                    None,
                    Some(&format!("taskId={}", task.id)),
                );
                Ok((task, approval))
            },
        )
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

        return Ok(CommandRunResult {
            status: "waiting-approval".into(),
            task_id: task.id,
            request,
            result: None,
            approval_request: Some(approval.request),
        });
    }

    // Low-risk path: save request first (so it's recorded even if run_command fails),
    // then execute, then save execution result + audit. Each DB-write cluster runs
    // in spawn_blocking to keep the async runtime worker thread free during SQLite I/O.
    {
        let db = state.db.clone();
        let workspace_id = workspace.id.clone();
        let request_clone = request.clone();
        tokio::task::spawn_blocking(move || -> Result<(), AppError> {
            db.save_entity(
                EntityTable::CommandRequests,
                &request_clone.id,
                Some(&workspace_id),
                None,
                Some("created"),
                &request_clone,
            )
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    }

    let result =
        run_command(std::path::Path::new(&workspace.root_path), request.clone(), None).await?;

    {
        let db = state.db.clone();
        let workspace_id = workspace.id.clone();
        let request_clone = request.clone();
        let result_clone = result.clone();
        let audit_summary = result.summary.clone();
        let risk_level = request.risk_level;
        tokio::task::spawn_blocking(move || -> Result<(), AppError> {
            db.save_entity(
                EntityTable::CommandExecutions,
                &result_clone.request.id,
                Some(&workspace_id),
                None,
                Some(if result_clone.success { "completed" } else { "failed" }),
                &result_clone,
            )?;
            let _ = crate::commands::audit::save_audit_entry_with_db(
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
            );
            Ok(())
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    }

    Ok(CommandRunResult {
        status: "completed".into(),
        task_id: result.request.id.clone(),
        request,
        result: Some(result),
        approval_request: None,
    })
}

fn approval_for_command_with_db(
    db: &Database,
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
    let approval = adl_task::make_approval(&task, "Command execution approval");
    let mut approval = approval;
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
