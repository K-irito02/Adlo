use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    CommandRequest, CommandRunResult, IpcResult,
    RiskLevel, TaskOperation,
};
use adl_storage::EntityTable;

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
pub fn command_list_recent(
    state: tauri::State<'_, AppState>,
    limit: Option<usize>,
) -> IpcResult<Vec<CommandRequest>> {
    crate::commands::ipc_try(|| {
        let mut requests: Vec<CommandRequest> =
            state.db.list_entities(EntityTable::CommandRequests)?;
        requests.sort_by_key(|request| std::cmp::Reverse(request.created_at));
        requests.truncate(limit.unwrap_or(20));
        Ok(requests)
    })
}

async fn command_run_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    input: CommandRunInput,
) -> Result<CommandRunResult, AppError> {
    let workspace = crate::commands::workspace::current_workspace(state)?;
    let request = adl_terminal::build_request(
        &workspace.id,
        None,
        input.command,
        input.args,
        input.shell.unwrap_or(false),
    );
    state.db.save_entity(
        EntityTable::CommandRequests,
        &request.id,
        Some(&workspace.id),
        None,
        Some("created"),
        &request,
    )?;
    if request.risk_level != RiskLevel::Low {
        let (task, approval) = approval_for_command(app, state, &workspace.id, &request)?;
        let _ = crate::commands::audit::save_audit_entry(
            state,
            &workspace.id,
            Some("command"),
            "approval",
            request.risk_level,
            format!(
                "Command requires approval: {} {}",
                request.command,
                request.args.join(" ")
            ),
            None,
            Some(format!("taskId={}", task.id)),
        );
        return Ok(CommandRunResult {
            status: "waiting-approval".into(),
            task_id: task.id,
            request,
            result: None,
            approval_request: Some(approval.request),
        });
    }
    let result = adl_terminal::run_command(
        std::path::Path::new(&workspace.root_path),
        request.clone(),
        None,
    )
    .await?;
    state.db.save_entity(
        EntityTable::CommandExecutions,
        &result.request.id,
        Some(&workspace.id),
        None,
        Some(if result.success {
            "completed"
        } else {
            "failed"
        }),
        &result,
    )?;
    let _ = crate::commands::audit::save_audit_entry(
        state,
        &workspace.id,
        Some("command"),
        "command",
        request.risk_level,
        result.summary.clone(),
        Some("auto"),
        Some(format!(
            "command={} {}",
            request.command,
            request.args.join(" ")
        )),
    );
    Ok(CommandRunResult {
        status: "completed".into(),
        task_id: result.request.id.clone(),
        request,
        result: Some(result),
        approval_request: None,
    })
}

fn approval_for_command(
    _app: &tauri::AppHandle,
    state: &AppState,
    workspace_id: &str,
    request: &CommandRequest,
) -> Result<(adl_kernel::TaskRecord, adl_kernel::ApprovalRecord), AppError> {
    let operation = TaskOperation {
        kind: "command.run".into(),
        target: Some(format!("{} {}", request.command, request.args.join(" "))),
        params: serde_json::to_value(request)?,
        risk_level: request.risk_level,
        reversible: false,
    };
    let mut task = adl_task::make_task(
        workspace_id,
        "command",
        "Command requires approval.",
        operation,
    );
    let approval = adl_task::make_approval(&task, "Command execution approval");
    let mut approval = approval;
    approval.run_id = request.run_id.clone();
    task.approval_id = Some(approval.id.clone());
    state.db.save_entity(
        EntityTable::Tasks,
        &task.id,
        Some(workspace_id),
        Some("command"),
        Some("waiting-approval"),
        &task,
    )?;
    state.db.save_entity(
        EntityTable::Approvals,
        &approval.id,
        Some(workspace_id),
        Some(&task.session_id),
        Some("pending"),
        &approval,
    )?;
    Ok((task, approval))
}
