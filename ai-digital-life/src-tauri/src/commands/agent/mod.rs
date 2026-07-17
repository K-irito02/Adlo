pub use self::config::*;
pub use self::plan_mode::*;
pub use self::run::*;

mod config;
mod plan_mode;
mod run;

use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{create_id, now_ms, AgentRunDetail, DigitalLifeRunActivityEventV1};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter;

pub(crate) const RUN_ACTIVITY_EVENT: &str = "digital-life://run-activity";

pub(crate) fn emit_run_activity(app: &tauri::AppHandle, payload: serde_json::Value) {
    let _ = app.emit(RUN_ACTIVITY_EVENT, payload);
}

pub(crate) fn persist_run_activity(
    state: &AppState,
    workspace_id: &str,
    session_id: &str,
    run_id: &str,
    event: &DigitalLifeRunActivityEventV1,
) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::RunActivityEvents,
        &create_id("runact"),
        Some(workspace_id),
        Some(session_id),
        Some(run_id),
        event,
    )
}

pub(crate) fn make_activity_emitter<'a>(
    app: &'a tauri::AppHandle,
    state: &'a AppState,
    workspace_scope_id: &str,
    session_id: &str,
    run_id: &str,
) -> impl Fn(serde_json::Value) + 'a {
    let workspace_scope_id = workspace_scope_id.to_string();
    let session_id = session_id.to_string();
    let run_id = run_id.to_string();
    move |event: serde_json::Value| {
        let ts = now_ms();
        let seq = adl_agent_runtime::run_activity_seq::next_run_activity_seq(ts);
        let payload = match event {
            serde_json::Value::Object(mut obj) => {
                let event_type = obj
                    .remove("type")
                    .and_then(|v| match v {
                        serde_json::Value::String(s) => Some(s),
                        _ => None,
                    })
                    .unwrap_or_else(|| "error".into());
                adl_kernel::events::run_activity_event(
                    &run_id,
                    seq,
                    ts,
                    &event_type,
                    serde_json::Value::Object(obj),
                )
            },
            other => adl_kernel::events::run_activity_event(
                &run_id,
                seq,
                ts,
                "error",
                serde_json::json!({
                    "message": format!("Invalid run-activity payload: {other:?}")
                }),
            ),
        };
        if let Ok(typed) = serde_json::from_value::<DigitalLifeRunActivityEventV1>(payload.clone())
        {
            let _ = persist_run_activity(state, &workspace_scope_id, &session_id, &run_id, &typed);
        }
        emit_run_activity(app, payload);
    }
}

/// Returns `true` if Plan Mode is currently active for the given workspace.
pub(crate) fn is_plan_mode_active(workspace_id: &str) -> bool {
    let mutex = plan_mode_states();
    let states = mutex.lock().unwrap_or_else(|e| e.into_inner());
    states.get(workspace_id).map(|s| s.is_active()).unwrap_or(false)
}

/// Returns the plan file path configured for the active Plan Mode session in
/// the given workspace, if any.
pub(crate) fn get_plan_file_path(workspace_id: &str) -> Option<std::path::PathBuf> {
    let mutex = plan_mode_states();
    let states = mutex.lock().unwrap_or_else(|e| e.into_inner());
    states.get(workspace_id).and_then(|s| s.plan_file.clone())
}

pub fn load_run_detail(state: &AppState, run_id: &str) -> Result<Option<AgentRunDetail>, AppError> {
    let Some(run) =
        state.db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
    else {
        return Ok(None);
    };
    let mut steps: Vec<adl_types::AgentPlanStep> =
        state.db.list_entities_by_run(EntityTable::AgentSteps, run_id)?;
    steps.sort_by_key(|step| step.created_at);
    Ok(Some(AgentRunDetail { run, steps }))
}

pub fn save_run_detail(state: &AppState, detail: &AgentRunDetail) -> Result<(), AppError> {
    save_run_detail_with_db(&state.db, detail)
}

pub fn save_run_detail_with_db(
    db: &adl_storage::Database,
    detail: &AgentRunDetail,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::AgentRuns,
        &detail.run.id,
        Some(&detail.run.workspace_id),
        Some(&detail.run.session_id),
        Some(match detail.run.status {
            adl_types::AgentRunStatus::Draft => "draft",
            adl_types::AgentRunStatus::Planning => "planning",
            adl_types::AgentRunStatus::Ready => "ready",
            adl_types::AgentRunStatus::Executing => "executing",
            adl_types::AgentRunStatus::WaitingApproval => "waiting-approval",
            adl_types::AgentRunStatus::Applying => "applying",
            adl_types::AgentRunStatus::Verifying => "verifying",
            adl_types::AgentRunStatus::Succeeded => "succeeded",
            adl_types::AgentRunStatus::Failed => "failed",
            adl_types::AgentRunStatus::RolledBack => "rolled-back",
            adl_types::AgentRunStatus::Aborted => "aborted",
        }),
        &detail.run,
    )?;
    for step in &detail.steps {
        db.save_entity(
            EntityTable::AgentSteps,
            &step.id,
            Some(&detail.run.workspace_id),
            Some(&detail.run.session_id),
            Some(&step.status),
            step,
        )?;
    }
    Ok(())
}

/// Global plan mode state per workspace (keyed by workspace_id).
static PLAN_MODE_STATES: std::sync::OnceLock<
    Mutex<HashMap<String, adl_agent_runtime::plan_mode::PlanModeState>>,
> = std::sync::OnceLock::new();

fn plan_mode_states() -> &'static Mutex<HashMap<String, adl_agent_runtime::plan_mode::PlanModeState>>
{
    PLAN_MODE_STATES.get_or_init(|| Mutex::new(HashMap::new()))
}
