//! Agent domain HTTP endpoints (migrated from `src-tauri/src/commands/agent/`:
//! `agent_start_run`, `agent_get_run`, `agent_retry_run`, `agent_abort_run`,
//! `list_agents`, `select_agent`, `enter_plan_mode`, `exit_plan_mode`,
//! `get_plan_mode_state`). Each test drives `app_router` over a fresh
//! `ServerState` via `tower::ServiceExt::oneshot` — no sockets, no subprocesses.
//!
//! The agent loop itself is kicked asynchronously (per the async+SSE decision
//! 2026-08-09) and returns a quick `ConversationSendResult` ack; loop progress
//! streams over the SSE `/event` channel via `part_bus`.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-agent-api-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: ad_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: ad_server::ServerState,
    method: Method,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    let body_bytes = body.map(|v| Body::from(v.to_string())).unwrap_or_else(Body::empty);
    let req = builder.body(body_bytes).unwrap();
    let resp = app(state).oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

/// Create a session and return its id.
async fn make_session(state: &ad_server::ServerState) -> String {
    let (status, body) =
        send(state.clone(), Method::POST, "/session", Some(json!({ "title": "agent-test" }))).await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

/// POST /agent/start-run kicks the agent loop asynchronously and returns a
/// typed ConversationSendResult ack (user message persisted, assistant message
/// id == run id, session marked busy).
#[tokio::test]
async fn start_run_kicks_loop_and_returns_send_result() {
    let state = state().await;
    let session_id = make_session(&state).await;

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/agent/start-run",
        Some(json!({
            "sessionId": session_id,
            "prompt": "hello ad-server agent",
            "scenario": "chat"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "start body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["userMessage"]["content"], "hello ad-server agent");
    let run_id = body["data"]["runDetail"]["run"]["id"].as_str().expect("run id").to_string();
    assert_eq!(body["data"]["assistantMessage"]["runId"], run_id);
    assert!(body["data"]["patchSet"].is_null(), "async kick has no patch set: {body}");
    assert_eq!(body["data"]["session"]["status"], "busy", "session in-flight: {body}");

    // The user message is persisted on the session.
    let (_, detail) = send(state, Method::GET, &format!("/session/{session_id}"), None).await;
    let messages = detail["data"]["messages"].as_array().unwrap();
    assert!(
        messages.iter().any(|m| m["content"] == "hello ad-server agent" && m["role"] == "user"),
        "user message should be persisted: {messages:?}"
    );
}

/// POST /agent/start-run for an unknown session → 404.
#[tokio::test]
async fn start_run_missing_session_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/agent/start-run",
        Some(json!({ "sessionId": "nope", "prompt": "hi" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /agent/start-run with an empty prompt → 400.
#[tokio::test]
async fn start_run_without_prompt_returns_400() {
    let state = state().await;
    let session_id = make_session(&state).await;
    let (status, body) = send(
        state,
        Method::POST,
        "/agent/start-run",
        Some(json!({ "sessionId": session_id, "prompt": "   " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");
}

/// GET /agent/run/{id} returns the run detail for an existing run and `null`
/// for an unknown run id.
#[tokio::test]
async fn get_run_returns_detail_or_null() {
    let state = state().await;
    let session_id = make_session(&state).await;
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/agent/start-run",
        Some(json!({ "sessionId": session_id, "prompt": "run me" })),
    )
    .await;
    let run_id = body["data"]["runDetail"]["run"]["id"].as_str().unwrap().to_string();

    let (status, body) =
        send(state.clone(), Method::GET, &format!("/agent/run/{run_id}"), None).await;
    assert_eq!(status, StatusCode::OK, "get body: {body}");
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["run"]["id"], run_id);
    assert!(body["data"]["steps"].is_array(), "steps expected: {body}");

    let (_, body) = send(state, Method::GET, "/agent/run/does-not-exist", None).await;
    assert!(body["data"].is_null(), "unknown run should map to null: {body}");
}

/// POST /agent/run/{id}/retry resets the run status to `ready` and persists it.
#[tokio::test]
async fn retry_run_sets_ready_and_persists() {
    let state = state().await;
    let session_id = make_session(&state).await;
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/agent/start-run",
        Some(json!({ "sessionId": session_id, "prompt": "retry me" })),
    )
    .await;
    let run_id = body["data"]["runDetail"]["run"]["id"].as_str().unwrap().to_string();

    let (status, body) =
        send(state.clone(), Method::POST, &format!("/agent/run/{run_id}/retry"), None).await;
    assert_eq!(status, StatusCode::OK, "retry body: {body}");
    assert_eq!(body["data"]["run"]["id"], run_id);
    assert_eq!(body["data"]["run"]["status"], "ready");

    // Persisted: a fresh GET reflects the new status.
    let (_, body) = send(state, Method::GET, &format!("/agent/run/{run_id}"), None).await;
    assert_eq!(body["data"]["run"]["status"], "ready", "persisted: {body}");
}

/// POST /agent/run/{id}/abort marks the run `aborted` and persists it.
#[tokio::test]
async fn abort_run_marks_aborted() {
    let state = state().await;
    let session_id = make_session(&state).await;
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/agent/start-run",
        Some(json!({ "sessionId": session_id, "prompt": "abort me" })),
    )
    .await;
    let run_id = body["data"]["runDetail"]["run"]["id"].as_str().unwrap().to_string();

    let (status, body) =
        send(state.clone(), Method::POST, &format!("/agent/run/{run_id}/abort"), None).await;
    assert_eq!(status, StatusCode::OK, "abort body: {body}");
    assert_eq!(body["data"]["run"]["status"], "aborted");

    let (_, body) = send(state, Method::GET, &format!("/agent/run/{run_id}"), None).await;
    assert_eq!(body["data"]["run"]["status"], "aborted", "persisted: {body}");
}

/// Finding 2: POST /agent/run/{id}/abort must ALSO cancel the live loop token
/// registered under the run's session (`state.loop_cancels[session_id]`), so
/// the in-flight model request stops instead of running/charging to completion.
#[tokio::test]
async fn abort_run_cancels_live_loop_token() {
    let state = state().await;
    let session_id = make_session(&state).await;
    // Build a run record directly (no async loop kicked, so the token below is
    // the only one and stays registered) and save it exactly like the
    // agent-loop kick does.
    let session_row = state
        .db
        .load_entity::<adl_types::ConversationSessionRecord>(
            adl_storage::EntityTable::Sessions,
            &session_id,
        )
        .unwrap()
        .expect("session should exist");
    let detail = adl_agent_runtime::create_run(
        &session_row.workspace_id,
        &session_id,
        "abort me",
        adl_types::ConversationScenario::Chat,
    );
    let run_id = detail.run.id.clone();
    state
        .db
        .save_entity(
            adl_storage::EntityTable::AgentRuns,
            &run_id,
            Some(&detail.run.workspace_id),
            Some(&session_id),
            Some(detail.run.status.as_status_str()),
            &detail.run,
        )
        .unwrap();

    // Simulate an in-flight agent loop: register a live cancellation token.
    let token = tokio_util::sync::CancellationToken::new();
    state.loop_cancels.lock().await.insert(session_id.clone(), token.clone());

    let (status, body) =
        send(state.clone(), Method::POST, &format!("/agent/run/{run_id}/abort"), None).await;
    assert_eq!(status, StatusCode::OK, "abort body: {body}");
    assert_eq!(body["data"]["run"]["status"], "aborted");
    assert!(token.is_cancelled(), "abort must cancel the live loop token");

    // The token is removed from the registry.
    assert!(
        !state.loop_cancels.lock().await.contains_key(&session_id),
        "loop token should be unregistered after abort"
    );
}

/// GET /agent/list returns the built-in primary agents (covers
/// `AgentBridge.listAgents`). Faithful to `list_agents_inner`: only
/// `mode == primary && !hidden` agents are listed (build + plan; general is a
/// subagent and must NOT appear).
#[tokio::test]
async fn list_agents_returns_builtin_primary_agents() {
    let state = state().await;
    let (status, body) = send(state, Method::GET, "/agent/list", None).await;
    assert_eq!(status, StatusCode::OK, "list body: {body}");
    assert_eq!(body["ok"], true);
    let agents = body["data"].as_array().unwrap();
    let ids: Vec<&str> = agents.iter().filter_map(|a| a["id"].as_str()).collect();
    assert!(ids.contains(&"build"), "build agent: {ids:?}");
    assert!(ids.contains(&"plan"), "plan agent: {ids:?}");
    assert!(!ids.contains(&"general"), "general is a subagent, not primary: {ids:?}");
}

/// POST /agent/select routes a scenario to its agent (covers
/// `AgentBridge.selectAgent`).
#[tokio::test]
async fn select_agent_plan_scenario_returns_plan_agent() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/agent/select",
        Some(json!({ "scenario": "plan", "userPrompt": "analyze auth" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "select body: {body}");
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["id"], "plan", "body: {body}");
}

/// Plan mode lifecycle: enter → active → exit → inactive (covers
/// `AgentBridge.enterPlanMode` / `exitPlanMode` / `getPlanModeState`).
#[tokio::test]
async fn plan_mode_enter_exit_state_round_trip() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/agent/plan-mode/enter",
        Some(json!({ "workspaceId": "ws-1", "workspaceRoot": "C:\\fake\\root" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "enter body: {body}");
    assert_eq!(body["ok"], true);
    let plan_path = body["data"].as_str().expect("plan path").to_string();
    assert!(plan_path.ends_with(".md"), "plan path should end with .md: {plan_path}");

    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/agent/plan-mode/state",
        Some(json!({ "workspaceId": "ws-1" })),
    )
    .await;
    assert_eq!(body["data"], true, "plan mode should be active: {body}");

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/agent/plan-mode/exit",
        Some(json!({ "workspaceId": "ws-1" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "exit body: {body}");
    assert_eq!(body["data"], plan_path, "exit returns the plan path: {body}");

    let (_, body) =
        send(state, Method::POST, "/agent/plan-mode/state", Some(json!({ "workspaceId": "ws-1" })))
            .await;
    assert_eq!(body["data"], false, "plan mode should be inactive after exit: {body}");
}
