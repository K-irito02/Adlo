use adl_errors::AppError;
use adl_types::{now_ms, GitBranchSummary, GitSnapshot};
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tokio::time::timeout as tokio_timeout;
use tracing::{debug, warn};

const GIT_TIMEOUT_SECS: u64 = 30;

pub fn capture_git_snapshot(root: &Path) -> GitSnapshot {
    let branch = run_git(root, &["branch", "--show-current"]).and_then(first_non_empty_line);
    let head = run_git(root, &["rev-parse", "--short", "HEAD"]).and_then(first_non_empty_line);
    let staged = capture_git_paths_with_fallback(
        root,
        &["diff", "--name-only", "--cached", "-z"],
        "diff --cached",
    );
    let unstaged = capture_git_paths_with_fallback(root, &["diff", "--name-only", "-z"], "diff");
    let untracked = capture_git_paths_with_fallback(
        root,
        &["ls-files", "--others", "--exclude-standard", "-z"],
        "ls-files --others",
    );
    let conflicts = capture_git_paths_with_fallback(
        root,
        &["diff", "--name-only", "--diff-filter=U", "-z"],
        "diff --diff-filter=U",
    );
    GitSnapshot {
        is_repo: root.join(".git").exists() || branch.is_some() || head.is_some(),
        branch,
        head,
        ahead: None,
        behind: None,
        staged,
        unstaged,
        untracked,
        conflicts,
        captured_at: now_ms(),
    }
}

pub async fn capture_git_snapshot_async(root: &Path) -> GitSnapshot {
    let is_repo_check = root.join(".git").exists();
    let (branch_raw, head_raw, staged, unstaged, untracked, conflicts) = tokio::join!(
        run_git_with_timeout(root, &["branch", "--show-current"]),
        run_git_with_timeout(root, &["rev-parse", "--short", "HEAD"]),
        capture_git_paths_with_fallback_async(root, &["diff", "--name-only", "--cached", "-z"]),
        capture_git_paths_with_fallback_async(root, &["diff", "--name-only", "-z"]),
        capture_git_paths_with_fallback_async(
            root,
            &["ls-files", "--others", "--exclude-standard", "-z"]
        ),
        capture_git_paths_with_fallback_async(
            root,
            &["diff", "--name-only", "--diff-filter=U", "-z"]
        ),
    );
    let branch = branch_raw.and_then(first_non_empty_line);
    let head = head_raw.and_then(first_non_empty_line);
    GitSnapshot {
        is_repo: is_repo_check || branch.is_some() || head.is_some(),
        branch,
        head,
        ahead: None,
        behind: None,
        staged,
        unstaged,
        untracked,
        conflicts,
        captured_at: now_ms(),
    }
}

pub fn git_has_local_changes(snapshot: &GitSnapshot) -> bool {
    !snapshot.staged.is_empty() || !snapshot.unstaged.is_empty() || !snapshot.untracked.is_empty()
}

/// Parse `git branch --format=%(refname:short)` output into a list of local branch names.
/// Skips empty lines and trims whitespace.
fn parse_local_branches(output: &str) -> Vec<String> {
    output.lines().map(str::trim).filter(|line| !line.is_empty()).map(|s| s.to_string()).collect()
}

/// Parse `git branch -r --format=%(refname:short)` output into a set of branch names
/// (stripping the remote prefix, e.g. `origin/main` → `main`).
fn parse_remote_branch_names(output: &str) -> std::collections::HashSet<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| line.split_once('/').map(|(_, name)| name.to_string()))
        .collect()
}

/// Parse `git stash list --format=%s` output to extract branch names from
/// `adl-auto-stash:<branch>:...` markers. Returns a set of branch names that
/// have an auto-stash entry.
fn parse_stashed_branches(output: &str) -> std::collections::HashSet<String> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let marker = "adl-auto-stash:";
            trimmed.find(marker).and_then(|pos| {
                let after_marker = &trimmed[pos + marker.len()..];
                after_marker.split(':').next().map(|s| s.to_string())
            })
        })
        .collect()
}

/// Build the final list of `GitBranchSummary` entries from parsed components.
/// Local branches are listed first (marked with `local: true`), then remote-only
/// branches. The current branch is flagged. Results are sorted: current branch
/// first, then alphabetical by name.
fn build_branch_summaries(
    local_branches: &[String],
    remote_branches: &std::collections::HashSet<String>,
    stashed_branches: &std::collections::HashSet<String>,
    current_branch: &str,
) -> Vec<GitBranchSummary> {
    let mut seen = std::collections::HashSet::new();
    let mut branches: Vec<GitBranchSummary> = Vec::new();

    for name in local_branches {
        seen.insert(name.clone());
        branches.push(GitBranchSummary {
            name: name.clone(),
            is_current: name == current_branch,
            local: true,
            remote: remote_branches.contains(name),
            has_stash: stashed_branches.contains(name.as_str()),
        });
    }

    for name in remote_branches {
        if !seen.contains(name) {
            branches.push(GitBranchSummary {
                name: name.clone(),
                is_current: false,
                local: false,
                remote: true,
                has_stash: stashed_branches.contains(name.as_str()),
            });
        }
    }

    branches.sort_by(|left, right| {
        right.is_current.cmp(&left.is_current).then_with(|| left.name.cmp(&right.name))
    });
    branches
}

pub fn list_git_branches(root: &Path) -> Result<Vec<GitBranchSummary>, AppError> {
    let current_branch =
        run_git_required(root, &["branch", "--show-current"]).and_then(|value| {
            first_non_empty_line(value)
                .ok_or_else(|| AppError::Workspace("failed to resolve current branch".into()))
        })?;
    let local_output = run_git_required(root, &["branch", "--format=%(refname:short)"])?;
    let remote_output =
        run_git_required(root, &["branch", "-r", "--format=%(refname:short)"]).unwrap_or_default();

    let local_branches = parse_local_branches(&local_output);
    let remote_branches = parse_remote_branch_names(&remote_output);

    if local_branches.is_empty() {
        return Err(AppError::Workspace("no local branches found".into()));
    }

    let stash_list = run_git_required(root, &["stash", "list", "--format=%s"]).unwrap_or_default();
    let stashed_branches = parse_stashed_branches(&stash_list);

    Ok(build_branch_summaries(
        &local_branches,
        &remote_branches,
        &stashed_branches,
        &current_branch,
    ))
}

pub fn switch_git_branch(
    root: &Path,
    branch_name: &str,
    allow_stash: bool,
) -> Result<(GitSnapshot, bool, Option<String>, bool), AppError> {
    let snapshot = capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }
    let previous_branch = snapshot.branch.clone();

    let should_stash = git_has_local_changes(&snapshot);
    if should_stash && !allow_stash {
        return Err(AppError::InvalidInput(
            "Dirty worktree requires explicit stash confirmation.".into(),
        ));
    }
    if should_stash {
        stash_workspace_changes(root, &previous_branch.clone().unwrap_or_default())?;
    }

    run_git_required(root, &["switch", branch_name])?;

    let has_restored = pop_auto_stash(root, branch_name)?;

    Ok((capture_git_snapshot(root), should_stash, previous_branch, has_restored))
}

pub fn create_git_branch(
    root: &Path,
    branch_name: &str,
    base_branch: Option<&str>,
    allow_stash: bool,
) -> Result<(GitSnapshot, bool, Option<String>), AppError> {
    let snapshot = capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }
    let previous_branch = snapshot.branch.clone();
    let current_branch = previous_branch
        .clone()
        .ok_or_else(|| AppError::Workspace("failed to resolve current branch".into()))?;
    let base_branch =
        base_branch.map(str::trim).filter(|value| !value.is_empty()).unwrap_or(&current_branch);
    let should_stash = base_branch != current_branch && git_has_local_changes(&snapshot);
    if should_stash && !allow_stash {
        return Err(AppError::InvalidInput(
            "Dirty worktree requires explicit stash confirmation.".into(),
        ));
    }
    if should_stash {
        stash_workspace_changes(root, &previous_branch.clone().unwrap_or_default())?;
    }
    if base_branch != current_branch {
        run_git_required(root, &["switch", base_branch])?;
    }
    run_git_required(root, &["switch", "-c", branch_name])?;
    Ok((capture_git_snapshot(root), should_stash, previous_branch))
}

fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).current_dir(root).output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

async fn run_git_with_timeout(root: &Path, args: &[&str]) -> Option<String> {
    let root_owned = root.to_path_buf();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let result = tokio_timeout(Duration::from_secs(GIT_TIMEOUT_SECS), async move {
        tokio::task::spawn_blocking(move || {
            let output =
                Command::new("git").args(&args_owned).current_dir(&root_owned).output().ok()?;
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
        .await
        .ok()?
    })
    .await;
    result.ok().flatten()
}

fn run_git_bytes(root: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let output = Command::new("git").args(args).current_dir(root).output().ok()?;
    if output.status.success() {
        Some(output.stdout)
    } else {
        None
    }
}

fn run_git_paths(root: &Path, args: &[&str]) -> Option<Vec<String>> {
    let stdout = run_git_bytes(root, args)?;
    Some(
        stdout
            .split(|byte| *byte == 0)
            .filter(|chunk| !chunk.is_empty())
            .map(|chunk| String::from_utf8_lossy(chunk).replace('\\', "/"))
            .collect(),
    )
}

fn capture_git_paths_with_fallback(root: &Path, args: &[&str], command_name: &str) -> Vec<String> {
    run_git_paths(root, args).unwrap_or_else(|| {
        debug!(root = %root.to_string_lossy(), "git {} failed, defaulting to empty list", command_name);
        Vec::new()
    })
}

fn run_git_required(root: &Path, args: &[&str]) -> Result<String, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::Workspace(if stderr.is_empty() {
            format!("git command failed: git {}", args.join(" "))
        } else {
            stderr
        }))
    }
}

pub(crate) fn git_show_file(root: &Path, relative_path: &str) -> Result<Option<String>, AppError> {
    let object_path = format!("HEAD:{relative_path}");
    let output = Command::new("git")
        .args(["show", &object_path])
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    if output.status.success() {
        if output.stdout.len() as u64 > crate::DEFAULT_MAX_FILE_BYTES {
            return Err(AppError::Workspace(format!(
                "git blob is too large to preview: {relative_path}"
            )));
        }
        String::from_utf8(output.stdout)
            .map(Some)
            .map_err(|error| AppError::Workspace(format!("file is not valid UTF-8: {error}")))
    } else {
        Ok(None)
    }
}

pub(crate) fn git_file_exists(root: &Path, relative_path: &str) -> Result<bool, AppError> {
    let object_path = format!("HEAD:{relative_path}");
    let output = Command::new("git")
        .args(["cat-file", "-e", &object_path])
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    Ok(output.status.success())
}

fn stash_workspace_changes(root: &Path, branch_name: &str) -> Result<(), AppError> {
    let message = format!("adl-auto-stash:{}:{}", branch_name, now_ms());
    run_git_required(root, &["stash", "push", "--include-untracked", "--message", &message])?;
    Ok(())
}

pub fn has_auto_stash(root: &Path, branch_name: &str) -> bool {
    let stash_list = match run_git_required(root, &["stash", "list", "--format=%s"]) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let needle = format!("adl-auto-stash:{}:", branch_name);
    stash_list.lines().any(|line| line.contains(&needle))
}

pub fn pop_auto_stash(root: &Path, target_branch: &str) -> Result<bool, AppError> {
    let stash_list = run_git_required(root, &["stash", "list", "--format=%s"])?;
    let needle = format!("adl-auto-stash:{}:", target_branch);
    let lines: Vec<&str> = stash_list.lines().collect();
    for (i, line) in lines.iter().rev().enumerate() {
        if line.contains(&needle) {
            let index = lines.len() - 1 - i;
            let stash_ref = format!("stash@{{{}}}", index);
            let pop_result = run_git_required(root, &["stash", "pop", "--index", &stash_ref]);
            match pop_result {
                Ok(_) => return Ok(true),
                Err(_) => return Ok(false),
            }
        }
    }
    Ok(true)
}

pub fn stage_file(root: &Path, relative_path: &str) -> Result<(), AppError> {
    match run_git_required(root, &["add", "--", relative_path]) {
        Ok(_) => Ok(()),
        Err(e) => {
            warn!(path = %relative_path, root = %root.display(), error = %e, "stage_file failed");
            Err(e)
        },
    }
}

pub fn unstage_file(root: &Path, relative_path: &str) -> Result<(), AppError> {
    match run_git_required(root, &["restore", "--staged", "--", relative_path]) {
        Ok(_) => Ok(()),
        Err(e) => {
            warn!(path = %relative_path, root = %root.display(), error = %e, "unstage_file failed");
            Err(e)
        },
    }
}

pub fn discard_file_changes(root: &Path, relative_path: &str) -> Result<(), AppError> {
    if run_git_required(
        root,
        &["restore", "--source=HEAD", "--staged", "--worktree", "--", relative_path],
    )
    .is_ok()
    {
        return Ok(());
    }
    let is_tracked =
        run_git(root, &["ls-files", "--", relative_path]).and_then(first_non_empty_line).is_some();
    if !is_tracked {
        run_git_required(root, &["clean", "-f", "--", relative_path])?;
    }
    Ok(())
}

fn first_non_empty_line(value: String) -> Option<String> {
    value.lines().map(str::trim).find(|line| !line.is_empty()).map(ToOwned::to_owned)
}

async fn capture_git_paths_with_fallback_async(root: &Path, args: &[&str]) -> Vec<String> {
    let root_owned = root.to_path_buf();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let command_name = args_owned.join(" ");
    match tokio_timeout(Duration::from_secs(GIT_TIMEOUT_SECS), async move {
        match tokio::task::spawn_blocking(move || {
            capture_git_paths_with_fallback(
                &root_owned,
                &args_owned.iter().map(String::as_str).collect::<Vec<&str>>(),
                &command_name,
            )
        })
        .await
        {
            Ok(paths) => paths,
            Err(e) => {
                warn!(error = %e, "git spawn_blocking join failed, returning empty list");
                Vec::new()
            },
        }
    })
    .await
    {
        Ok(paths) => paths,
        Err(e) => {
            warn!(error = %e, "git command timed out, returning empty list");
            Vec::new()
        },
    }
}

#[cfg(test)]
mod git_tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    fn run_git_test(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .expect("git should be available");
        assert!(status.success(), "git command failed: git {}", args.join(" "));
    }

    fn init_git_repo(dir: &Path) {
        run_git_test(dir, &["init"]);
        run_git_test(dir, &["config", "user.email", "adl-tests@example.com"]);
        run_git_test(dir, &["config", "user.name", "ADL Tests"]);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn has_auto_stash_returns_true_when_stash_exists() {
        let dir = std::env::temp_dir().join(format!("adl-has-stash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::write(dir.join("readme.md"), "# Modified").unwrap();
        stash_workspace_changes(&dir, "main").unwrap();

        assert!(has_auto_stash(&dir, "main"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn has_auto_stash_returns_false_for_unrelated_branch() {
        let dir = std::env::temp_dir().join(format!("adl-no-stash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::write(dir.join("readme.md"), "# Modified").unwrap();
        stash_workspace_changes(&dir, "main").unwrap();

        assert!(!has_auto_stash(&dir, "feature"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn has_auto_stash_returns_false_when_no_stash() {
        let dir = std::env::temp_dir().join(format!("adl-clean-stash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        assert!(!has_auto_stash(&dir, "main"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn pop_auto_stash_restores_changes() {
        let dir = std::env::temp_dir().join(format!("adl-pop-stash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::write(dir.join("readme.md"), "# Modified").unwrap();
        stash_workspace_changes(&dir, "main").unwrap();

        assert!(has_auto_stash(&dir, "main"));
        let restored = pop_auto_stash(&dir, "main").unwrap();
        assert!(restored);

        let content = std::fs::read_to_string(dir.join("readme.md")).unwrap();
        assert_eq!(content, "# Modified");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn pop_auto_stash_returns_true_when_no_stash() {
        let dir = std::env::temp_dir().join(format!("adl-pop-none-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        let restored = pop_auto_stash(&dir, "main").unwrap();
        assert!(restored);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn list_git_branches_includes_has_stash() {
        let dir = std::env::temp_dir().join(format!("adl-has-stash-list-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::write(dir.join("readme.md"), "# Modified").unwrap();
        stash_workspace_changes(&dir, "master").unwrap();

        let branches = list_git_branches(&dir).unwrap();
        let master = branches.iter().find(|b| b.name == "master").expect("master branch exists");
        assert!(master.has_stash);
        let _ = std::fs::remove_dir_all(dir);
    }

    // === 纯解析函数测试（无需 git in PATH）===

    #[test]
    fn parse_local_branches_handles_basic_output() {
        let output = "main\nfeature/branch-1\ndevelop\n";
        let branches = parse_local_branches(output);
        assert_eq!(branches, vec!["main", "feature/branch-1", "develop"]);
    }

    #[test]
    fn parse_local_branches_skips_empty_lines() {
        let output = "main\n\n\ndevelop\n";
        let branches = parse_local_branches(output);
        assert_eq!(branches, vec!["main", "develop"]);
    }

    #[test]
    fn parse_local_branches_handles_empty_output() {
        let output = "";
        let branches = parse_local_branches(output);
        assert!(branches.is_empty());
    }

    #[test]
    fn parse_remote_branch_names_extracts_branch_after_slash() {
        let output = "origin/main\norigin/feature/test\nupstream/develop\n";
        let names = parse_remote_branch_names(output);
        assert!(names.contains("main"));
        assert!(names.contains("feature/test"));
        assert!(names.contains("develop"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn parse_remote_branch_names_skips_empty_lines() {
        let output = "origin/main\n\norigin/develop\n";
        let names = parse_remote_branch_names(output);
        assert_eq!(names.len(), 2);
    }

    #[test]
    fn parse_stashed_branches_extracts_adl_auto_stash_markers() {
        let output = "adl-auto-stash:main:WIP on main\nadl-auto-stash:feature:WIP on feature\nstash@{2}: other stash";
        let stashed = parse_stashed_branches(output);
        assert!(stashed.contains("main"));
        assert!(stashed.contains("feature"));
        assert_eq!(stashed.len(), 2);
    }

    #[test]
    fn parse_stashed_branches_returns_empty_for_no_adl_markers() {
        let output = "stash@{0}: WIP on main\nstash@{1}: WIP on develop";
        let stashed = parse_stashed_branches(output);
        assert!(stashed.is_empty());
    }

    #[test]
    fn build_branch_summaries_merges_local_and_remote() {
        let local: Vec<String> = vec!["main".to_string(), "develop".to_string()];
        let remote: std::collections::HashSet<String> =
            ["main".to_string(), "release".to_string()].into_iter().collect();
        let stashed: std::collections::HashSet<String> =
            ["develop".to_string()].into_iter().collect();
        let current = "main";

        let summaries = build_branch_summaries(&local, &remote, &stashed, current);

        assert_eq!(summaries.len(), 3); // main, develop, release

        let main = summaries.iter().find(|s| s.name == "main").unwrap();
        assert!(main.is_current);
        assert!(main.local);
        assert!(main.remote);
        assert!(!main.has_stash);

        let develop = summaries.iter().find(|s| s.name == "develop").unwrap();
        assert!(!develop.is_current);
        assert!(develop.local);
        assert!(!develop.remote);
        assert!(develop.has_stash);

        let release = summaries.iter().find(|s| s.name == "release").unwrap();
        assert!(!release.is_current);
        assert!(!release.local);
        assert!(release.remote);
        assert!(!release.has_stash);
    }

    #[test]
    fn build_branch_summaries_sorts_current_first_then_alphabetical() {
        let local: Vec<String> = vec!["zebra".to_string(), "alpha".to_string(), "main".to_string()];
        let remote = std::collections::HashSet::new();
        let stashed = std::collections::HashSet::new();
        let current = "main";

        let summaries = build_branch_summaries(&local, &remote, &stashed, current);

        assert_eq!(summaries[0].name, "main"); // current first
        assert!(summaries[0].is_current);
        assert_eq!(summaries[1].name, "alpha"); // alphabetical
        assert_eq!(summaries[2].name, "zebra");
    }
}
