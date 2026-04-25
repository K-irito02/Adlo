use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    now_ms, AuditEntry, CommandExecutionResult, CommandProfileSummary, CommandRequest,
    CommandRunResult, CommandRunStreamStart, IpcResult, RiskLevel, TaskOperation,
};
use adl_storage::{Database, EntityTable};
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{oneshot, Mutex};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRunInput {
    pub command: String,
    pub args: Vec<String>,
    pub shell: Option<bool>,
}

#[tauri::command]
pub fn command_get_profiles() -> IpcResult<Vec<CommandProfileSummary>> {
    IpcResult::ok(vec![
        CommandProfileSummary {
            id: "build".into(),
            label: "Build".into(),
        },
        CommandProfileSummary {
            id: "test".into(),
            label: "Test".into(),
        },
        CommandProfileSummary {
            id: "lint".into(),
            label: "Lint".into(),
        },
        CommandProfileSummary {
            id: "install".into(),
            label: "Install".into(),
        },
    ])
}

#[tauri::command]
pub async fn command_run(
    state: tauri::State<'_, AppState>,
    input: CommandRunInput,
) -> Result<IpcResult<CommandRunResult>, CommandError> {
    Ok(ipc(command_run_inner(&state, input).await))
}

#[tauri::command]
pub async fn command_run_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: CommandRunInput,
) -> Result<IpcResult<CommandRunStreamStart>, CommandError> {
    Ok(ipc(command_run_stream_inner(app, &state, input).await))
}

#[tauri::command]
pub async fn command_stop_stream(
    state: tauri::State<'_, AppState>,
    execution_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    let result: Result<bool, AppError> = if let Some(cancel) = state
        .command_cancellations
        .lock()
        .await
        .remove(&execution_id)
    {
        let _ = cancel.send(());
        Ok(true)
    } else {
        Ok(false)
    };
    Ok(ipc(result))
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
        let (task, approval) = approval_for_command(state, &workspace.id, &request)?;
        let _ = crate::commands::audit::save_audit_entry(
            state,
            &workspace.id,
            Some("command"),
            "approval",
            request.risk_level,
            format!("Command requires approval: {} {}", request.command, request.args.join(" ")),
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
        Some(format!("command={} {}", request.command, request.args.join(" "))),
    );
    Ok(CommandRunResult {
        status: "completed".into(),
        task_id: result.request.id.clone(),
        request,
        result: Some(result),
        approval_request: None,
    })
}

async fn command_run_stream_inner(
    app: tauri::AppHandle,
    state: &AppState,
    input: CommandRunInput,
) -> Result<CommandRunStreamStart, AppError> {
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
        let (task, approval) = approval_for_command(state, &workspace.id, &request)?;
        let _ = crate::commands::audit::save_audit_entry(
            state,
            &workspace.id,
            Some("command"),
            "approval",
            request.risk_level,
            format!("Streaming command requires approval: {} {}", request.command, request.args.join(" ")),
            None,
            Some(format!("taskId={}", task.id)),
        );
        return Ok(CommandRunStreamStart::WaitingApproval {
            task_id: task.id,
            request,
            approval_request: approval.request,
        });
    }

    let execution_id = adl_kernel::create_id("termexec");
    let task_id = request.id.clone();
    let (cancel_tx, cancel_rx) = oneshot::channel();
    state
        .command_cancellations
        .lock()
        .await
        .insert(execution_id.clone(), cancel_tx);
    spawn_stream(
        app,
        execution_id.clone(),
        workspace.root_path.clone(),
        workspace.id.clone(),
        request.clone(),
        state.db.clone(),
        state.command_cancellations.clone(),
        cancel_rx,
    );
    Ok(CommandRunStreamStart::Started {
        execution_id,
        task_id,
        request,
    })
}

fn approval_for_command(
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
        Some("command"),
        Some("pending"),
        &approval,
    )?;
    Ok((task, approval))
}

fn spawn_stream(
    app: tauri::AppHandle,
    execution_id: String,
    root_path: String,
    workspace_id: String,
    request: CommandRequest,
    db: Database,
    command_cancellations: Arc<Mutex<std::collections::HashMap<String, oneshot::Sender<()>>>>,
    mut cancel_rx: oneshot::Receiver<()>,
) {
    tauri::async_runtime::spawn(async move {
        let mut child = tokio::process::Command::new(&request.command);
        child.args(&request.args);
        child.current_dir(root_path);
        child.stdout(std::process::Stdio::piped());
        child.stderr(std::process::Stdio::piped());
        child.kill_on_drop(true);
        match child.spawn() {
            Ok(mut child) => {
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                let stdout_capture = Arc::new(Mutex::new(String::new()));
                let stderr_capture = Arc::new(Mutex::new(String::new()));
                let mut seq = 0usize;
                let mut stdout_handle = None;
                let mut stderr_handle = None;
                if let Some(stdout) = stdout {
                    let app = app.clone();
                    let execution_id = execution_id.clone();
                    let stdout_capture = Arc::clone(&stdout_capture);
                    stdout_handle = Some(tauri::async_runtime::spawn(async move {
                        let mut lines = BufReader::new(stdout).lines();
                        let mut seq = 0usize;
                        while let Ok(Some(line)) = lines.next_line().await {
                            seq += 1;
                            let text = format!("{line}\n");
                            stdout_capture.lock().await.push_str(&text);
                            let _ = app.emit(
                                "digital-life://terminal-stream",
                                serde_json::json!({"v":1,"executionId":execution_id,"seq":seq,"type":"stdout","text":text}),
                            );
                        }
                    }));
                }
                if let Some(stderr) = stderr {
                    let app = app.clone();
                    let execution_id = execution_id.clone();
                    let stderr_capture = Arc::clone(&stderr_capture);
                    stderr_handle = Some(tauri::async_runtime::spawn(async move {
                        let mut lines = BufReader::new(stderr).lines();
                        let mut seq = 0usize;
                        while let Ok(Some(line)) = lines.next_line().await {
                            seq += 1;
                            let text = format!("{line}\n");
                            stderr_capture.lock().await.push_str(&text);
                            let _ = app.emit(
                                "digital-life://terminal-stream",
                                serde_json::json!({"v":1,"executionId":execution_id,"seq":seq,"type":"stderr","text":text}),
                            );
                        }
                    }));
                }
                let (status, was_cancelled) = tokio::select! {
                    status = child.wait() => (status.ok(), false),
                    _ = &mut cancel_rx => {
                        let _ = child.kill().await;
                        (child.wait().await.ok(), true)
                    }
                };
                if let Some(handle) = stdout_handle {
                    let _ = handle.await;
                }
                if let Some(handle) = stderr_handle {
                    let _ = handle.await;
                }
                command_cancellations.lock().await.remove(&execution_id);
                seq += 1;
                let exit_code = status.and_then(|status| status.code());
                let success = !was_cancelled && exit_code == Some(0);
                let summary = if was_cancelled {
                    "Command was cancelled.".to_string()
                } else if success {
                    "Command completed.".to_string()
                } else {
                    format!("Command failed with exit code {}.", exit_code.map_or("null".into(), |code| code.to_string()))
                };
                let stdout = adl_terminal::truncate_output(&stdout_capture.lock().await.clone());
                let stderr = adl_terminal::truncate_output(&stderr_capture.lock().await.clone());
                let result = CommandExecutionResult {
                    request: request.clone(),
                    exit_code,
                    signal: None,
                    stdout,
                    stderr,
                    summary: summary.clone(),
                    success,
                    started_at: request.created_at,
                    completed_at: now_ms(),
                };
                let _ = save_stream_execution(&db, &workspace_id, &result);
                let _ = app.emit(
                    "digital-life://terminal-stream",
                    serde_json::json!({"v":1,"executionId":execution_id,"seq":seq,"type":"done","exitCode":exit_code,"success":success,"summary":summary}),
                );
            }
            Err(error) => {
                command_cancellations.lock().await.remove(&execution_id);
                let result = CommandExecutionResult {
                    request: request.clone(),
                    exit_code: None,
                    signal: None,
                    stdout: String::new(),
                    stderr: error.to_string(),
                    summary: format!("Failed to spawn command: {}", error),
                    success: false,
                    started_at: request.created_at,
                    completed_at: now_ms(),
                };
                let _ = save_stream_execution(&db, &workspace_id, &result);
                let _ = app.emit(
                    "digital-life://terminal-stream",
                    serde_json::json!({"v":1,"executionId":execution_id,"seq":1,"type":"error","message":error.to_string()}),
                );
            }
        }
    });
}

fn save_stream_execution(
    db: &Database,
    workspace_id: &str,
    result: &CommandExecutionResult,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::CommandExecutions,
        &result.request.id,
        Some(workspace_id),
        Some("command"),
        Some(if result.success { "completed" } else { "failed" }),
        result,
    )?;

    let audit = AuditEntry {
        id: adl_kernel::create_id("audit"),
        timestamp: now_ms(),
        operation_type: "command".into(),
        summary: result.summary.clone(),
        risk_level: result.request.risk_level,
        decision: Some("auto".into()),
        detail: Some(format!(
            "command={} {}",
            result.request.command,
            result.request.args.join(" ")
        )),
    };
    db.save_entity(
        EntityTable::AuditRecords,
        &audit.id,
        Some(workspace_id),
        Some("command"),
        Some("command"),
        &audit,
    )?;
    Ok(())
}
