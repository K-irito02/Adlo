//! Task-center / approval domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/task/{approval,snapshot}.rs`). Each test drives
//! `app_router` over a fresh `ServerState` via `tower::ServiceExt::oneshot` —
//! no sockets, no subprocesses (the positive approval-decide test uses a
//! non-command task operation so `run_approved_command` is never reached).

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_storage::EntityTable;
use adl_types::{ApprovalRecord, RiskLevel, TaskOperation, TaskRecord};
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-task-api-{}", uuid::Uuid::new_v4()));
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
    let bytes = axum::body::to_bytes(resp.into_body(), 4 * 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

/// Seed a `waiting-approval` task (non-command operation, so the approve path
/// never executes a subprocess) + its pending approval. Returns `(task_id,
/// approval_id)`.
fn seed_task_and_approval(db: &adl_storage::Database) -> (String, String) {
    let operation = TaskOperation {
        kind: "custom".into(),
        target: Some("custom-op".into()),
        params: json!({ "x": 1 }),
        risk_level: RiskLevel::Medium,
        reversible: false,
    };
    let mut task = adl_task::make_task("ws-1", "sess-1", "Test task", operation);
    let mut approval = adl_task::make_approval(&task, "Test approval");
    approval.run_id = Some("run-1".into());
    task.approval_id = Some(approval.id.clone());
    db.save_entity(
        EntityTable::Tasks,
        &task.id,
        Some("ws-1"),
        Some("sess-1"),
        Some("waiting-approval"),
        &task,
    )
    .unwrap();
    db.save_entity(
        EntityTable::Approvals,
        &approval.id,
        Some("ws-1"),
        Some("approval"),
        Some("pending"),
        &approval,
    )
    .unwrap();
    (task.id.clone(), approval.id.clone())
}

/// POST /task/snapshot returns a well-formed (empty) TaskCenterSnapshot on a
/// fresh state (covers `TaskBridge.getSnapshot`).
#[tokio::test]
async fn task_snapshot_returns_defaults() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/task/snapshot", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"]["tasks"].as_array().unwrap().is_empty(), "body: {body}");
    assert!(body["data"]["pendingApprovals"].as_array().unwrap().is_empty(), "body: {body}");
    assert!(body["data"]["policy"]["mode"].is_string(), "policy present: {body}");
    assert!(body["data"]["currentSession"].is_null(), "no workspace: {body}");
    assert!(body["data"]["latestCheckpoint"].is_null(), "no checkpoints: {body}");
}

/// POST /task/pending-approvals returns an empty list on a fresh state (covers
/// `TaskBridge.listPendingApprovals`).
#[tokio::test]
async fn task_list_pending_approvals_returns_empty() {
    let state = state().await;
    let (status, body) =
        send(state, Method::POST, "/task/pending-approvals", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "body: {body}");
}

/// POST /task/audit-entries returns an empty list on a fresh state (covers
/// `TaskBridge.listAuditEntries`).
#[tokio::test]
async fn task_list_audit_entries_returns_empty() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/task/audit-entries", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "body: {body}");
}

/// POST /task/checkpoint-preview for an unknown checkpoint → data null (covers
/// `TaskBridge.getCheckpointPreview`).
#[tokio::test]
async fn task_checkpoint_preview_unknown_returns_null() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/task/checkpoint-preview",
        Some(json!({ "checkpointId": "cp-nope" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].is_null(), "unknown checkpoint -> null: {body}");
}

/// POST /task/restore-checkpoint for an unknown checkpoint → 404 (covers
/// `TaskBridge.restoreCheckpoint`).
#[tokio::test]
async fn task_restore_checkpoint_unknown_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/task/restore-checkpoint",
        Some(json!({ "checkpointId": "cp-nope" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /task/decide-approval for an unknown approval → 404 (covers
/// `TaskBridge.decideApproval`).
#[tokio::test]
async fn task_decide_approval_unknown_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/task/decide-approval",
        Some(json!({ "approvalId": "approval-nope", "decision": "approved" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /task/decide-approval approves a seeded task: the approval + task
/// statuses persist, an audit entry is written, and a fresh TaskCenterSnapshot
/// is returned.
#[tokio::test]
async fn task_decide_approval_approves_task_and_persists() {
    let state = state().await;
    let (task_id, approval_id) = {
        let db = state.db.clone();
        seed_task_and_approval(&db)
    };

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/task/decide-approval",
        Some(json!({ "approvalId": approval_id, "decision": "approved", "reason": "ok" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    let snapshot = &body["data"];
    let tasks = snapshot["tasks"].as_array().unwrap();
    assert_eq!(tasks.len(), 1, "tasks: {body}");
    assert_eq!(tasks[0]["id"], task_id, "body: {body}");
    assert_eq!(tasks[0]["status"], "approved", "task approved in snapshot: {body}");
    assert!(snapshot["pendingApprovals"].as_array().unwrap().is_empty(), "no pending: {body}");

    // Persisted: approval decision + task status.
    let db = state.db.clone();
    let approval = db
        .load_entity::<ApprovalRecord>(EntityTable::Approvals, &approval_id)
        .unwrap()
        .expect("approval persists");
    assert_eq!(approval.decision, Some(adl_types::ApprovalDecision::Approved));
    let task = db.load_entity::<TaskRecord>(EntityTable::Tasks, &task_id).unwrap().unwrap();
    assert_eq!(task.status, adl_types::TaskStatus::Approved);

    // Audit entry written.
    let audits: Vec<adl_types::AuditEntry> = db.list_entities(EntityTable::AuditRecords).unwrap();
    assert!(
        audits.iter().any(|a| a.operation_type == "approval"),
        "approval audit entry: {audits:?}"
    );
}
