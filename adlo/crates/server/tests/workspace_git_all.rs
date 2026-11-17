//! Workspace-git and workspace-git-vis domain HTTP endpoints. Combines tests
//! from the original `workspace_git.rs` and `workspace_git_vis.rs` files.
//! Deterministic coverage: the non-git paths fail fast (no repo → error), and
//! real temp git repos exercise the positive status/branch/init paths. `git`
//! is required for the positive-repo and init tests (the repo itself is
//! git-based, so git is present). Each test drives `app_router` over a fresh
//! `ServerState` via `tower::ServiceExt::oneshot`.

#![allow(clippy::unwrap_used)]

mod common;

use common::{init_git_repo, send_post, state, temp_dir};
use serde_json::json;

async fn open_workspace(state: adl_server::ServerState, prefix: &str) -> String {
    common::open_workspace_via_api(state, prefix).await
}

// ---------------------------------------------------------------------------
// Workspace-git tests (originally workspace_git.rs)
// ---------------------------------------------------------------------------

/// POST /workspace/git/status on a non-git dir returns an `isRepo:false`
/// snapshot (never errors) (covers `WorkspaceBridge.getGitStatus`).
#[tokio::test]
async fn get_git_status_non_git_dir_returns_is_repo_false() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("status");
    let (status, body) = send_post(
        state,
        "/workspace/git/status",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["isRepo"], false, "body: {body}");
    assert!(body["data"]["branch"].is_null(), "no branch: {body}");
}

/// POST /workspace/git/status without an active workspace and no explicit path
/// returns 404 NOT_FOUND.
#[tokio::test]
async fn get_git_status_without_active_workspace_returns_404() {
    let state = state("ws-git-api").await;
    let (status, body) = send_post(state, "/workspace/git/status", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /workspace/git/status on a real git repo reports the repo + current
/// branch.
#[tokio::test]
async fn get_git_status_in_git_repo_reports_branch() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("repo-status");
    init_git_repo(&dir);
    let (status, body) = send_post(
        state,
        "/workspace/git/status",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["isRepo"], true, "body: {body}");
    assert!(body["data"]["branch"].is_string(), "branch resolved: {body}");
}

/// POST /workspace/git/init without `workspacePath` must return 400 and must
/// NOT fall back to the active workspace (multi-workspace safety).
#[tokio::test]
async fn init_git_repo_without_workspace_path_returns_400_and_leaves_active_workspace_untouched() {
    let state = state("ws-git-init").await;
    let dir = temp_dir("init-active");
    std::fs::write(dir.join("keep.txt"), "keep\n").unwrap();
    let (open_status, open_body) = send_post(
        state.clone(),
        "/workspace/open",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(open_status, axum::http::StatusCode::OK, "open failed: {open_body}");

    let (status, body) = send_post(state, "/workspace/git/init", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
    assert!(!dir.join(".git").exists(), "active workspace must not be initialized");
}

/// POST /workspace/git/init creates a local repository at the explicit path,
/// is idempotent, and never touches existing files.
#[tokio::test]
async fn init_git_repo_creates_local_repo_and_is_idempotent() {
    let state = state("ws-git-init").await;
    let dir = temp_dir("init-target");
    std::fs::write(dir.join("note.txt"), "keep me\n").unwrap();

    let (status, body) = send_post(
        state.clone(),
        "/workspace/git/init",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["isRepo"], true, "body: {body}");
    assert!(dir.join(".git").is_dir(), ".git must exist");
    assert_eq!(std::fs::read_to_string(dir.join("note.txt")).unwrap(), "keep me\n");

    let (second_status, second_body) = send_post(
        state,
        "/workspace/git/init",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(second_status, axum::http::StatusCode::OK, "body: {second_body}");
    assert_eq!(second_body["data"]["isRepo"], true, "body: {second_body}");
    assert!(second_body["data"]["head"].is_null(), "no commit yet: {second_body}");
    assert_eq!(std::fs::read_to_string(dir.join("note.txt")).unwrap(), "keep me\n");
}

/// POST /workspace/git/branches on a non-git dir returns an error (the branch
/// listing requires a repo) (covers `WorkspaceBridge.listGitBranches`).
#[tokio::test]
async fn list_branches_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("branches");
    let (status, body) = send_post(
        state,
        "/workspace/git/branches",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/branches on a real repo returns the branch list with a
/// current branch.
#[tokio::test]
async fn list_branches_in_git_repo_returns_branches() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("repo-branches");
    init_git_repo(&dir);
    let (status, body) = send_post(
        state,
        "/workspace/git/branches",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let branches = body["data"].as_array().unwrap();
    assert!(!branches.is_empty(), "at least one branch: {body}");
    assert!(branches.iter().any(|b| b["isCurrent"] == true), "a current branch: {body}");
}

/// POST /workspace/git/switch with an empty branch name returns 400
/// INVALID_INPUT (requires an active workspace, checked first like the Tauri
/// original).
#[tokio::test]
async fn switch_branch_empty_name_returns_400() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "switch-empty").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/switch",
        Some(json!({ "input": { "branchName": "", "allowStash": false } })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /workspace/git/switch on a non-git workspace returns the git error
/// (covers `WorkspaceBridge.switchGitBranch`).
#[tokio::test]
async fn switch_branch_non_git_workspace_returns_error() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "switch-nongit").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/switch",
        Some(json!({ "input": { "branchName": "feature", "allowStash": false } })),
    )
    .await;
    assert!(status.is_client_error(), "non-git workspace -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/create with an empty branch name returns 400
/// INVALID_INPUT.
#[tokio::test]
async fn create_branch_empty_name_returns_400() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "create-empty").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/create",
        Some(json!({ "input": { "branchName": "  ", "allowStash": false } })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /workspace/git/create on a non-git workspace returns the git error
/// (covers `WorkspaceBridge.createGitBranch`).
#[tokio::test]
async fn create_branch_non_git_workspace_returns_error() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "create-nongit").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/create",
        Some(json!({ "input": { "branchName": "feature", "allowStash": false } })),
    )
    .await;
    assert!(status.is_client_error(), "non-git workspace -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/stage on a non-git dir runs the real git subprocess and
/// surfaces the git-level error (covers `WorkspaceBridge.gitStageFile`). The
/// camelCase body (`relativePath`/`workspacePath`) must deserialize — a 400
/// here must come from git, not from body parsing.
#[tokio::test]
async fn stage_file_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("stage");
    let (status, body) = send_post(
        state,
        "/workspace/git/stage",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    // The git subprocess actually ran and failed (not a body-parse 400).
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR", "git-level error: {body}");
    assert!(
        body["error"]["message"].as_str().unwrap().to_lowercase().contains("not a git repository"),
        "message mentions the failed git op: {body}"
    );
}

/// POST /workspace/git/unstage on a non-git dir runs the real git subprocess and
/// surfaces the git-level error (covers `WorkspaceBridge.gitUnstageFile`).
#[tokio::test]
async fn unstage_file_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("unstage");
    let (status, body) = send_post(
        state,
        "/workspace/git/unstage",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR", "git-level error: {body}");
    assert!(
        body["error"]["message"].as_str().unwrap().to_lowercase().contains("not a git repository"),
        "message mentions the failed git op: {body}"
    );
}

/// POST /workspace/git/discard on a non-git dir runs the real git subprocess and
/// surfaces the git-level error (covers `WorkspaceBridge.gitDiscardFile`).
#[tokio::test]
async fn discard_file_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("discard");
    let (status, body) = send_post(
        state,
        "/workspace/git/discard",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR", "git-level error: {body}");
    assert!(
        body["error"]["message"].as_str().unwrap().to_lowercase().contains("not a git repository"),
        "message mentions the failed git op: {body}"
    );
}

// ---------------------------------------------------------------------------
// Workspace-git-vis tests (originally workspace_git_vis.rs)
// ---------------------------------------------------------------------------

/// POST /workspace/git-vis/commit-stats on a non-git dir returns an error
/// (covers `GitVisBridge.commitStats`).
#[tokio::test]
async fn commit_stats_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("commit-stats");
    let (status, body) =
        send_post(state, "/workspace/git-vis/commit-stats", Some(common::root_path_body(&dir)))
            .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/first-commit-year on a non-git dir returns `null`
/// (the git probe degrades to None, never errors).
#[tokio::test]
async fn first_commit_year_non_git_dir_returns_null() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("first-year");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/first-commit-year",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "no commits -> null: {body}");
}

/// POST /workspace/git-vis/first-commit-year on a real repo returns the commit
/// year (positive path; requires git).
#[tokio::test]
async fn first_commit_year_in_git_repo_returns_year() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("first-year-repo");
    init_git_repo(&dir);
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/first-commit-year",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert!(body["data"].as_i64().is_some(), "commit year returned: {body}");
    assert!(body["data"].as_i64().unwrap() >= 1970, "sane year: {body}");
}

/// POST /workspace/git-vis/code-evolution on a non-git dir returns an error.
#[tokio::test]
async fn code_evolution_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("code-evolution");
    let (status, body) =
        send_post(state, "/workspace/git-vis/code-evolution", Some(common::root_path_body(&dir)))
            .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/contributor-modules on a non-git dir returns an
/// error.
#[tokio::test]
async fn contributor_modules_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("contributor");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/contributor-modules",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/branch-graph on a non-git dir returns an error.
#[tokio::test]
async fn branch_graph_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("branch-graph");
    let (status, body) =
        send_post(state, "/workspace/git-vis/branch-graph", Some(common::root_path_body(&dir)))
            .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/file-hotspots on a non-git dir returns an error.
#[tokio::test]
async fn file_hotspots_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("hotspots");
    let (status, body) =
        send_post(state, "/workspace/git-vis/file-hotspots", Some(common::root_path_body(&dir)))
            .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

// ---------------------------------------------------------------------------
// Workspace-git bulk/remote endpoints（事项3：工作区文件夹菜单）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn stage_all_then_commit_roundtrip_in_real_repo() {
    let state = state("ws-git-bulk").await;
    let dir = temp_dir("bulk-roundtrip");
    init_git_repo(&dir);
    std::fs::write(dir.join("bulk.txt"), "bulk\n").unwrap();

    let (stage_status, stage_body) = send_post(
        state.clone(),
        "/workspace/git/stage-all",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(stage_status, axum::http::StatusCode::OK, "body: {stage_body}");

    let (commit_status, commit_body) = send_post(
        state,
        "/workspace/git/commit",
        Some(json!({
            "workspacePath": dir.to_string_lossy(),
            "message": "feat: bulk commit",
        })),
    )
    .await;
    assert_eq!(commit_status, axum::http::StatusCode::OK, "body: {commit_body}");

    let output = std::process::Command::new("git")
        .args(["log", "-1", "--pretty=%s"])
        .current_dir(&dir)
        .output()
        .unwrap();
    let subject = String::from_utf8_lossy(&output.stdout).trim().to_string();
    assert_eq!(subject, "feat: bulk commit");
}

#[tokio::test]
async fn unstage_all_and_discard_all_clear_the_worktree() {
    let state = state("ws-git-bulk").await;
    let dir = temp_dir("bulk-discard");
    init_git_repo(&dir);
    std::fs::write(dir.join("loose.txt"), "loose\n").unwrap();
    std::fs::write(dir.join("readme.md"), "changed\n").unwrap();
    common::run_git(&dir, &["add", "-A"]);

    let (unstage_status, unstage_body) = send_post(
        state.clone(),
        "/workspace/git/unstage-all",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(unstage_status, axum::http::StatusCode::OK, "body: {unstage_body}");

    let (discard_status, discard_body) = send_post(
        state,
        "/workspace/git/discard-all",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(discard_status, axum::http::StatusCode::OK, "body: {discard_body}");
    assert!(!dir.join("loose.txt").exists(), "untracked file removed");
    let readme = std::fs::read_to_string(dir.join("readme.md")).unwrap();
    assert_eq!(readme.replace("\r\n", "\n"), "# test\n", "tracked file restored");
}

#[tokio::test]
async fn commit_with_empty_message_returns_invalid_input() {
    let state = state("ws-git-bulk").await;
    let dir = temp_dir("bulk-empty-commit");
    init_git_repo(&dir);
    let (status, body) = send_post(
        state,
        "/workspace/git/commit",
        Some(json!({ "workspacePath": dir.to_string_lossy(), "message": "   " })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

#[tokio::test]
async fn push_and_pull_without_remote_return_errors() {
    let state = state("ws-git-bulk").await;
    let dir = temp_dir("bulk-noremote");
    init_git_repo(&dir);

    let (push_status, push_body) = send_post(
        state.clone(),
        "/workspace/git/push",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(push_status.is_client_error(), "push without remote -> error: {push_body}");
    assert_eq!(push_body["ok"], false, "body: {push_body}");

    let (pull_status, pull_body) = send_post(
        state,
        "/workspace/git/pull",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(pull_status.is_client_error(), "pull without remote -> error: {pull_body}");
    assert_eq!(pull_body["ok"], false, "body: {pull_body}");
}

#[tokio::test]
async fn bulk_ops_require_an_explicit_workspace_path() {
    let state = state("ws-git-bulk").await;
    let dir = temp_dir("bulk-paths");
    init_git_repo(&dir);
    std::fs::write(dir.join("keep.txt"), "keep\n").unwrap();
    std::fs::write(dir.join("untracked.txt"), "u\n").unwrap();
    // 真正把 dir 设为活动工作区：缺 path 的批量操作若回退到活动工作区，
    // 就会在这里产生可见副作用（discard-all 会删掉 untracked.txt）。
    let (open_status, open_body) = send_post(
        state.clone(),
        "/workspace/open",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(open_status, axum::http::StatusCode::OK, "open: {open_body}");

    for path in [
        "/workspace/git/stage-all",
        "/workspace/git/unstage-all",
        "/workspace/git/discard-all",
        "/workspace/git/push",
        "/workspace/git/pull",
    ] {
        let (status, body) = send_post(state.clone(), path, Some(json!({}))).await;
        assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "{path}: {body}");
        assert_eq!(body["error"]["code"], "INVALID_INPUT", "{path}: {body}");
    }

    let (status, body) =
        send_post(state, "/workspace/git/commit", Some(json!({ "message": "no workspace" }))).await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
    assert!(dir.join("keep.txt").exists(), "active workspace must stay untouched");
    assert!(
        dir.join("untracked.txt").exists(),
        "discard-all without workspacePath must not fall back to the active workspace"
    );
}

#[tokio::test]
async fn bulk_ops_on_non_git_dir_return_workspace_errors() {
    let state = state("ws-git-bulk").await;
    let dir = temp_dir("bulk-nongit");
    for path in [
        "/workspace/git/stage-all",
        "/workspace/git/unstage-all",
        "/workspace/git/discard-all",
        "/workspace/git/push",
        "/workspace/git/pull",
    ] {
        let (status, body) =
            send_post(state.clone(), path, Some(json!({ "workspacePath": dir.to_string_lossy() })))
                .await;
        assert!(status.is_client_error(), "{path} -> error: {status} {body}");
        assert_eq!(body["ok"], false, "{path} body: {body}");
    }
}
