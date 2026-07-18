use adl_errors::AppError;
use adl_types::GitBranchSummary;
use std::path::Path;

use super::git_helpers::{first_non_empty_line, run_git_required, stash_workspace_changes};
use super::git_snapshot::{capture_git_snapshot, git_has_local_changes, pop_auto_stash};

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

fn build_branch_summaries(
    local_branches: Vec<String>,
    remote_branches: std::collections::HashSet<String>,
    stashed_branches: &std::collections::HashSet<String>,
    current_branch: &str,
) -> Vec<GitBranchSummary> {
    let mut seen = std::collections::HashSet::new();
    let mut branches: Vec<GitBranchSummary> = Vec::new();

    for name in local_branches {
        let is_current = name == current_branch;
        let remote = remote_branches.contains(&name);
        let has_stash = stashed_branches.contains(name.as_str());
        seen.insert(name.clone());
        branches.push(GitBranchSummary { name, is_current, local: true, remote, has_stash });
    }

    for name in remote_branches {
        if !seen.contains(&name) {
            let has_stash = stashed_branches.contains(name.as_str());
            branches.push(GitBranchSummary {
                name,
                is_current: false,
                local: false,
                remote: true,
                has_stash,
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

    Ok(build_branch_summaries(local_branches, remote_branches, &stashed_branches, &current_branch))
}

pub fn switch_git_branch(
    root: &Path,
    branch_name: &str,
    allow_stash: bool,
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

    run_git_required(root, &["switch", branch_name])?;

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

        let summaries = build_branch_summaries(local, remote, &stashed, current);

        assert_eq!(summaries.len(), 3);

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

        let summaries = build_branch_summaries(local, remote, &stashed, current);

        assert_eq!(summaries[0].name, "main");
        assert!(summaries[0].is_current);
        assert_eq!(summaries[1].name, "alpha");
        assert_eq!(summaries[2].name, "zebra");
    }
}
