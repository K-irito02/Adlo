#![allow(clippy::unwrap_used)]

use adl_server::engine::init_server_state;
use adl_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use tower::ServiceExt;

pub async fn state(prefix: &str) -> adl_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-{}-{}", prefix, uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

pub fn app(state: adl_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

pub async fn send_post(
    state: adl_server::ServerState,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(Method::POST).uri(uri);
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

pub async fn send_request(
    state: adl_server::ServerState,
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

pub fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("adl-tmp-{}-{}", name, uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

pub fn run_git(dir: &Path, args: &[&str]) {
    let status = std::process::Command::new("git").args(args).current_dir(dir).status().unwrap();
    assert!(status.success(), "git {} failed", args.join(" "));
}

pub fn init_git_repo(dir: &Path) {
    std::fs::create_dir_all(dir).unwrap();
    run_git(dir, &["init"]);
    run_git(dir, &["config", "user.email", "test@example.com"]);
    run_git(dir, &["config", "user.name", "Test User"]);
    std::fs::write(dir.join("readme.md"), "# test\n").unwrap();
    run_git(dir, &["add", "."]);
    run_git(dir, &["commit", "-m", "init"]);
}

pub fn make_workspace(prefix: &str) -> PathBuf {
    let dir = temp_dir(prefix);
    std::fs::write(dir.join("package.json"), "{}").unwrap();
    std::fs::write(dir.join("notes.txt"), "hello adl-server\nsecond line").unwrap();
    dir
}

pub fn make_workspace_dir(prefix: &str) -> PathBuf {
    let dir = temp_dir(prefix);
    std::fs::write(dir.join("hello.txt"), "hello world").unwrap();
    dir
}

pub async fn open_workspace_via_api(state: adl_server::ServerState, prefix: &str) -> String {
    let dir = make_workspace_dir(prefix);
    let (status, body) = send_post(
        state,
        "/workspace/open",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "open failed: {body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

pub fn root_path_body(dir: &Path) -> Value {
    json!({ "rootPath": dir.display().to_string() })
}
