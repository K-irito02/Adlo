use adl_errors::AppError;
use adl_types::{GitBranchSummary, GitDivergeStatus};
use std::path::Path;

use super::git_helpers::{first_non_empty_line, run_git_required, stash_workspace_changes};
use super::git_snapshot::{capture_git_snapshot, git_has_local_changes, pop_auto_stash};
use super::git_worktree::{
    branch_upstreams, divergence_counts, list_worktrees, reset_worktree_to_remote,
    sync_worktree_with_remote, worktree_for_branch,
};

fn parse_local_branches(output: &str) -> Vec<String> {
    output.lines().map(str::trim).filter(|line| !line.is_empty()).map(|s| s.to_string()).collect()
}

fn parse_remote_branch_names(output: &str) -> std::collections::HashSet<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| line.split_once('/').map(|(_, name)| name.to_string()))
        .collect()
}

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

fn diverge_status_for(ahead: Option<i32>, behind: Option<i32>) -> Option<GitDivergeStatus> {
    match (ahead, behind) {
        (Some(0), Some(0)) => Some(GitDivergeStatus::Synced),
        (Some(a), Some(0)) if a > 0 => Some(GitDivergeStatus::Ahead),
        (Some(0), Some(b)) if b > 0 => Some(GitDivergeStatus::Behind),
        (Some(a), Some(b)) if a > 0 && b > 0 => Some(GitDivergeStatus::Diverged),
        _ => None,
    }
}

/// Pure merge of local/remote/stash sets (no git I/O) — unit-test seam.
fn merge_branch_names(
    local_branches: Vec<String>,
    remote_branches: &std::collections::HashSet<String>,
    stashed_branches: &std::collections::HashSet<String>,
    current_branch: &str,
) -> Vec<(String, bool, bool, bool, bool)> {
    let mut seen = std::collections::HashSet::new();
    let mut merged: Vec<(String, bool, bool, bool, bool)> = Vec::new();

    for name in local_branches {
        let is_current = name == current_branch;
        let remote = remote_branches.contains(&name);
        let has_stash = stashed_branches.contains(name.as_str());
        seen.insert(name.clone());
        merged.push((name, is_current, true, remote, has_stash));
    }

    for name in remote_branches {
        if !seen.contains(name) {
            let has_stash = stashed_branches.contains(name.as_str());
            merged.push((name.clone(), false, false, true, has_stash));
        }
    }

    merged.sort_by(|left, right| {
        right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0))
    });
    merged
}

fn build_branch_summaries(
    root: &Path,
    local_branches: Vec<String>,
    remote_branches: std::collections::HashSet<String>,
    stashed_branches: &std::collections::HashSet<String>,
    current_branch: &str,
) -> Vec<GitBranchSummary> {
    let mut branches: Vec<GitBranchSummary> = Vec::new();
    let upstreams = branch_upstreams(root);
    let worktrees = list_worktrees(root).unwrap_or_default();

    for (name, is_current, local, remote, has_stash) in
        merge_branch_names(local_branches, &remote_branches, stashed_branches, current_branch)
    {
        if local {
            let upstream = upstreams.get(&name).cloned();
            let (ahead, behind) = upstream
                .as_deref()
                .and_then(|upstream_ref| divergence_counts(root, &name, upstream_ref))
                .map(|(ahead, behind)| (Some(ahead), Some(behind)))
                .unwrap_or((None, None));
            let diverge_status = diverge_status_for(ahead, behind);
            let worktree_path = worktree_for_branch(&worktrees, &name)
                .map(|path| path.to_string_lossy().to_string());
            branches.push(GitBranchSummary {
                name,
                is_current,
                local,
                remote,
                has_stash,
                upstream,
                ahead,
                behind,
                diverge_status,
                worktree_path,
            });
        } else {
            branches.push(GitBranchSummary {
                name,
                is_current,
                local,
                remote,
                has_stash,
                upstream: None,
                ahead: None,
                behind: None,
                diverge_status: None,
                worktree_path: None,
            });
        }
    }

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
        root,
        local_branches,
        remote_branches,
        &stashed_branches,
        &current_branch,
    ))
}

pub fn switch_git_branch(
    root: &Path,
    branch_name: &str,
    allow_stash: bool,
    mode: adl_types::GitSwitchMode,
) -> Result<(adl_types::GitSnapshot, bool, Option<String>, bool), AppError> {
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

    match mode {
        adl_types::GitSwitchMode::Local => {
            run_git_required(root, &["switch", branch_name])?;
        }
        adl_types::GitSwitchMode::Remote => {
            // Switch first (cheap), then reset the fresh checkout to remote.
            // Stash above already isolated dirty state.
            run_git_required(root, &["switch", branch_name])?;
            reset_worktree_to_remote(root, branch_name, true)?;
        }
        adl_types::GitSwitchMode::Sync => {
            run_git_required(root, &["switch", branch_name])?;
            sync_worktree_with_remote(root, branch_name, true)?;
        }
    }

    let has_restored = pop_auto_stash(root, branch_name)?;

    Ok((capture_git_snapshot(root), should_stash, previous_branch, has_restored))
}

pub fn create_git_branch(
    root: &Path,
    branch_name: &str,
    base_branch: Option<&str>,
    allow_stash: bool,
) -> Result<(adl_types::GitSnapshot, bool, Option<String>), AppError> {
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

#[cfg(test)]
mod tests {
    use super::super::git_helpers::{init_git_repo, stash_workspace_changes};
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

        let summaries = merge_branch_names(local, &remote, &stashed, current);

        assert_eq!(summaries.len(), 3);

        let main = summaries.iter().find(|s| s.0 == "main").unwrap();
        assert!(main.1);
        assert!(main.2);
        assert!(main.3);
        assert!(!main.4);

        let develop = summaries.iter().find(|s| s.0 == "develop").unwrap();
        assert!(!develop.1);
        assert!(develop.2);
        assert!(!develop.3);
        assert!(develop.4);

        let release = summaries.iter().find(|s| s.0 == "release").unwrap();
        assert!(!release.1);
        assert!(!release.2);
        assert!(release.3);
        assert!(!release.4);
    }

    #[test]
    fn build_branch_summaries_sorts_current_first_then_alphabetical() {
        let local: Vec<String> = vec!["zebra".to_string(), "alpha".to_string(), "main".to_string()];
        let remote = std::collections::HashSet::new();
        let stashed = std::collections::HashSet::new();
        let current = "main";

        let summaries = merge_branch_names(local, &remote, &stashed, current);

        assert_eq!(summaries[0].0, "main");
        assert!(summaries[0].1);
        assert_eq!(summaries[1].0, "alpha");
        assert_eq!(summaries[2].0, "zebra");
    }

    #[test]
    fn diverge_status_for_maps_counts() {
        assert_eq!(diverge_status_for(Some(0), Some(0)), Some(GitDivergeStatus::Synced));
        assert_eq!(diverge_status_for(Some(2), Some(0)), Some(GitDivergeStatus::Ahead));
        assert_eq!(diverge_status_for(Some(0), Some(3)), Some(GitDivergeStatus::Behind));
        assert_eq!(diverge_status_for(Some(1), Some(1)), Some(GitDivergeStatus::Diverged));
        assert_eq!(diverge_status_for(None, Some(0)), None);
    }
}
