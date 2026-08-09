//! Agent pipeline (loop / turn) domain HTTP handlers — migrated from
//! `src-tauri/src/commands/agent_loop.rs` (`agent_loop_run`, `agent_loop_abort`).
//!
//! Divergence from the Task-5 brief table: the brief lists `agent_pipeline_*` /
//! `agent_run_activity_*` prefixes routing to `/agent/pipeline/*` and
//! `/agent/turn/*`, but the real codebase has NO such tauri commands — the loop
//! machinery lives in `agent_loop_run` / `agent_loop_abort`, whose synchronous
//! LoopExecutor run is shared with the conversation/agent domains via
//! [`crate::agent_loop::run_loop`]. Those two commands are migrated here under
//! `/agent/turn/*`; loop progress streams over SSE through `part_bus` (the
//! LoopExecutor publishes `SessionPartEvent`s directly).

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_errors::AppError;
use adl_types::create_id;
use axum::extract::State;
use axum::response::IntoResponse;
use tokio_util::sync::CancellationToken;

/// POST `/agent/turn/run` — run the agent loop to completion synchronously
/// (faithful to the Tauri `agent_loop_run`, which awaits the full loop) and
/// return the `LoopRunResult`. The session's cancel token is registered for the
/// duration of the call so `POST /agent/turn/abort` can cancel an in-flight
/// run; it is unregistered on every path.
pub async fn loop_run(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: LoopRunInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    if input.prompt.trim().is_empty() {
        return ipc::to_response(Err(AppError::InvalidInput("missing 'prompt'".into())));
    }

    let cancel = CancellationToken::new();
    {
        let mut cancels = state.loop_cancels.lock().await;
        cancels.insert(input.session_id.clone(), cancel.clone());
    }
    let assistant_msg_id = create_id("msg");
    let result = agent_loop::run_loop(
        &state,
        &input.session_id,
        &assistant_msg_id,
        &input.prompt,
        input.provider_id,
        input.model_id,
        &cancel,
    )
    .await;
    {
        let mut cancels = state.loop_cancels.lock().await;
        cancels.remove(&input.session_id);
    }

    let result = match result {
        Ok((turn_count, status)) => {
            let status = if status == "idle" { "completed".to_string() } else { status };
            serde_json::to_value(LoopRunResult { run_id: assistant_msg_id, turn_count, status })
                .map_err(AppError::from)
        },
        Err(e) => Err(e),
    };
    ipc::to_response(result)
}

/// POST `/agent/turn/abort` — cancel the loop registered for a session (no-op
/// when none is running).
pub async fn loop_abort(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: AbortInput = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    agent_loop::abort_loop(&state.loop_cancels, &input.session_id).await;
    ipc::to_response(Ok(serde_json::json!(null)))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoopRunInput {
    session_id: String,
    prompt: String,
    #[serde(default)]
    provider_id: Option<String>,
    #[serde(default)]
    model_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AbortInput {
    session_id: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LoopRunResult {
    run_id: String,
    turn_count: u32,
    status: String,
}
