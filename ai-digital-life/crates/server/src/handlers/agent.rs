//! Agent domain HTTP handlers — migrated from `src-tauri/src/commands/agent/`
//! (`run.rs`, `config.rs`, `plan_mode.rs`). The run-creation + async loop kick
//! is shared with the conversation domain via
//! [`crate::agent_loop::kick_agent_run`]; run CRUD (get/retry/abort) and the
//! built-in agent listing/selection plus the per-workspace plan-mode state are
//! ported here.
//!
//! Migration note: the Tauri `agent_start_run` ran the full pipeline
//! synchronously (prepare → model → patches → finalize → audit batch). Per the
//! async+SSE decision (2026-08-09) the HTTP version returns a quick
//! `ConversationSendResult` ack and streams loop progress over SSE via
//! `state.part_bus` — the plan-mode scenario forcing + prompt injection are
//! preserved, the context/audit pipeline pieces belong to the agent_pipeline
//! domain and are intentionally not replicated here.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_agent_runtime::plan_mode::PlanModeState;
use adl_agent_runtime::registry::AgentRegistry;
use adl_agent_runtime::router;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::agent::AgentConfig;
use adl_types::{
    AgentPlanStep, AgentRunDetail, AgentRunRecord, AgentRunStatus, ConversationScenario,
    ConversationSessionRecord, now_ms,
};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;

// ─────────────────────────────────────────────────────────────────────────────
// Plan Mode state (per workspace, process-global — mirrors the Tauri static)
// ─────────────────────────────────────────────────────────────────────────────

static PLAN_MODE_STATES: OnceLock<Mutex<HashMap<String, PlanModeState>>> = OnceLock::new();

fn plan_mode_states() -> &'static Mutex<HashMap<String, PlanModeState>> {
    PLAN_MODE_STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Returns `true` if Plan Mode is currently active for the given workspace.
pub(crate) fn is_plan_mode_active(workspace_id: &str) -> bool {
    let states = plan_mode_states();
    let states = states.lock().unwrap_or_else(|e| e.into_inner());
    states.get(workspace_id).map(|s| s.is_active()).unwrap_or(false)
}

/// Returns the plan file path configured for the active Plan Mode session in
/// the given workspace, if any.
pub(crate) fn get_plan_file_path(workspace_id: &str) -> Option<PathBuf> {
    let states = plan_mode_states();
    let states = states.lock().unwrap_or_else(|e| e.into_inner());
    states.get(workspace_id).and_then(|s| s.plan_file.clone())
}

// ─────────────────────────────────────────────────────────────────────────────
// Run CRUD helpers (blocking)
// ─────────────────────────────────────────────────────────────────────────────

pub(crate) fn load_run_detail(
    db: &adl_storage::Database,
    run_id: &str,
) -> Result<Option<AgentRunDetail>, AppError> {
    let Some(run) = db.load_entity::<AgentRunRecord>(EntityTable::AgentRuns, run_id)? else {
        return Ok(None);
    };
    let mut steps: Vec<AgentPlanStep> = db.list_entities_by_run(EntityTable::AgentSteps, run_id)?;
    steps.sort_by_key(|step| step.created_at);
    Ok(Some(AgentRunDetail { run, steps }))
}

pub(crate) fn save_run_detail_with_db(
    db: &adl_storage::Database,
    detail: &AgentRunDetail,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::AgentRuns,
        &detail.run.id,
        Some(&detail.run.workspace_id),
        Some(&detail.run.session_id),
        Some(detail.run.status.as_status_str()),
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

// ─────────────────────────────────────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartRunInput {
    session_id: String,
    prompt: String,
    #[serde(default)]
    scenario: Option<ConversationScenario>,
    #[serde(default)]
    provider_id: Option<String>,
    #[serde(default)]
    model_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScenarioBody {
    scenario: String,
    user_prompt: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRootBody {
    workspace_id: String,
    workspace_root: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceIdBody {
    workspace_id: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/// POST `/agent/start-run` — kick an agent run asynchronously (plan-mode aware)
/// and return the `ConversationSendResult` ack. Faithful to
/// `agent_start_run`'s plan-mode forcing (Plan scenario + injected prompt) but,
/// per the async+SSE decision, the pipeline is not run synchronously — the
/// shared [`crate::agent_loop::kick_agent_run`] persists the run + user message,
/// publishes the busy/MessageCreated signals and spawns the loop.
pub async fn start_run(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: StartRunInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    if input.prompt.trim().is_empty() {
        return ipc::to_response(Err(AppError::InvalidInput("missing 'prompt'".into())));
    }

    // Load the session to resolve the workspace scope id + validate existence.
    let db = state.db.clone();
    let session_id_for_load = input.session_id.clone();
    let session: ConversationSessionRecord = match agent_loop::run_blocking(move || {
        agent_loop::require_session(&db, &session_id_for_load)
    })
    .await
    {
        Ok(s) => s,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let workspace_scope_id = session.workspace_id.clone();

    // Plan Mode integration (faithful to `start_run_inner`).
    let plan_mode_active = is_plan_mode_active(&workspace_scope_id);
    let scenario = if plan_mode_active {
        ConversationScenario::Plan
    } else {
        input.scenario.unwrap_or(ConversationScenario::CodeEdit)
    };
    let plan_prompt = if plan_mode_active {
        get_plan_file_path(&workspace_scope_id).map(|plan_file| {
            let plan_exists = std::path::Path::new(&plan_file).exists();
            adl_agent_runtime::plan_mode::plan_mode_system_prompt(
                &plan_file.to_string_lossy(),
                plan_exists,
            )
        })
    } else {
        None
    };

    let result = agent_loop::kick_agent_run(
        &state,
        &input.session_id,
        &input.prompt,
        scenario,
        input.provider_id,
        input.model_id,
        plan_prompt,
    )
    .await;
    match result {
        Ok(value) => match serde_json::to_value(&value) {
            Ok(v) => ipc::to_response(Ok(v)),
            Err(e) => ipc::to_response(Err(AppError::from(e))),
        },
        Err(e) => ipc::to_response(Err(e)),
    }
}

/// GET `/agent/run/:run_id` — run detail or `null` (covers `AgentBridge.getRun`).
pub async fn get_run(
    State(state): State<ServerState>,
    Path(run_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let detail = load_run_detail(&db, &run_id)?;
        Ok(serde_json::to_value(detail)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/agent/run/:run_id/retry` — reset a run to `ready` and persist it
/// (covers `AgentBridge.retryRun`).
pub async fn retry_run(
    State(state): State<ServerState>,
    Path(run_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let Some(mut detail) = load_run_detail(&db, &run_id)? else {
            return Ok(serde_json::Value::Null);
        };
        detail.run.status = AgentRunStatus::Ready;
        detail.run.updated_at = now_ms();
        save_run_detail_with_db(&db, &detail)?;
        Ok(serde_json::to_value(detail)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/agent/run/:run_id/abort` — abort a run, cancel its live loop, and
/// persist the aborted record (covers `AgentBridge.abortRun`). Per Finding 2,
/// abort must ALSO cancel the live agent loop registered under the run's
/// session (`state.loop_cancels[session_id]`) — the run id alone does not stop
/// the in-flight model request, and the frontend `cancelMessage(runId)` only
/// has the run id. The run record carries `session_id`, so we resolve run →
/// session first.
pub async fn abort_run(
    State(state): State<ServerState>,
    Path(run_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();

    // Resolve run → session id (blocking DB read; needed before the async
    // cancel so the loop token lookup key is known).
    let run_id_for_session = run_id.clone();
    let session_id =
        match agent_loop::run_blocking(move || -> Result<Option<String>, AppError> {
            let Some(detail) = load_run_detail(&db, &run_id_for_session)? else {
                return Ok(None);
            };
            Ok(Some(detail.run.session_id))
        })
        .await
        {
            Ok(v) => v,
            Err(e) => return ipc::to_response(Err(e)),
        };

    // Cancel the live loop token for the run's session, then flip the record.
    if let Some(session_id) = session_id {
        agent_loop::abort_loop(&state.loop_cancels, &session_id).await;
        // Unregister the token — the run is aborted, so no loop may remain
        // registered under its session.
        state.loop_cancels.lock().await.remove(&session_id);
    }

    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let Some(detail) = load_run_detail(&db, &run_id)? else {
            return Ok(serde_json::Value::Null);
        };
        let detail = adl_agent_runtime::abort_run(detail);
        save_run_detail_with_db(&db, &detail)?;
        Ok(serde_json::to_value(detail)?)
    })
    .await;
    ipc::to_response(result)
}

/// GET `/agent/list` — the built-in primary agents (covers
/// `AgentBridge.listAgents`).
pub async fn list_agents(State(_state): State<ServerState>) -> impl IntoResponse {
    let result = agent_loop::run_blocking(|| -> Result<serde_json::Value, AppError> {
        let registry = AgentRegistry::new();
        let agents: Vec<AgentConfig> = registry.list_primary().into_iter().cloned().collect();
        Ok(serde_json::to_value(agents)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/agent/select` — route a scenario to its agent (covers
/// `AgentBridge.selectAgent`).
pub async fn select_agent(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ScenarioBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let conv_scenario = match input.scenario.as_str() {
            "plan" => ConversationScenario::Plan,
            "code_edit" => ConversationScenario::CodeEdit,
            _ => ConversationScenario::Chat,
        };
        let agent_id = router::select(conv_scenario, &input.user_prompt);
        let registry = AgentRegistry::new();
        let agent = registry
            .get(agent_id)
            .cloned()
            .ok_or_else(|| AppError::Internal(format!("agent {agent_id:?} not found")))?;
        Ok(serde_json::to_value(agent)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/agent/plan-mode/enter` — enter Plan Mode for a workspace, returning
/// the generated plan file path (covers `AgentBridge.enterPlanMode`).
pub async fn enter_plan_mode(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceRootBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let states = plan_mode_states();
        let mut states = states.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let state = states.entry(input.workspace_id).or_default();
        let path = state.enter(&PathBuf::from(input.workspace_root));
        Ok(serde_json::to_value(path.to_string_lossy().to_string())?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/agent/plan-mode/exit` — exit Plan Mode, returning the plan file path
/// when one existed (covers `AgentBridge.exitPlanMode`).
pub async fn exit_plan_mode(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let states = plan_mode_states();
        let mut states = states.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let state = states.entry(input.workspace_id).or_default();
        Ok(serde_json::to_value(state.exit().map(|p| p.to_string_lossy().to_string()))?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/agent/plan-mode/state` — whether Plan Mode is active for a workspace
/// (covers `AgentBridge.getPlanModeState`).
pub async fn get_plan_mode_state(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let states = plan_mode_states();
        let states = states.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(serde_json::json!(
            states.get(&input.workspace_id).map(|s| s.is_active()).unwrap_or(false)
        ))
    })
    .await;
    ipc::to_response(result)
}
