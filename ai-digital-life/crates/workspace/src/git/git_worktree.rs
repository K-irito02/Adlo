use std::collections::HashMap;
use std::path::{Path, PathBuf};

use adl_errors::AppError;
use adl_types::{GitSwitchMode, WorktreeInfo};

use super::git_helpers::{run_git_required, stash_workspace_changes};
use super::git_snapshot::{capture_git_snapshot, git_has_local_changes};

/// Sanitize a branch name into a directory name: keep it readable, replace
/// path separators and Windows-reserved characters.
pub(crate) fn sanitize_branch_dir(branch: &str) -> String {
    let mut out = String::with_capacity(branch.len());
    for ch in branch.trim().chars() {
        if matches!(ch, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*' | '.')
            || ch.is_control()
        {
            out.push('-');
        } else {
            out.push(ch);
        }
    }
    let trimmed = out.trim_matches(['-', ' ', '.']).to_string();
    if trimmed.is_empty() {
        "branch".to_string()
    } else {
        trimmed
    }
}

/// Sibling directory for a branch worktree:
/// `<parent-of-root>/<root-name>-worktrees/<sanitized-branch>`.
/// On collision with an unrelated directory, suffix `-2`, `-3`, ….
pub fn sibling_worktree_dir(root: &Path, branch_name: &str) -> PathBuf {
    let base = sanitize_branch_dir(branch_name);
    let parent = root.parent().unwrap_or(Path::new("."));
    let root_name = root
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());
    let container = parent.join(format!("{root_name}-worktrees"));
    let mut candidate = container.join(&base);
    let mut index = 2;
    while candidate.exists() {
        candidate = container.join(format!("{base}-{index}"));
        index += 1;
    }
    candidate
}

fn parse_worktree_list(output: &str) -> Vec<WorktreeInfo> {
    let mut entries = Vec::new();
    let mut path: Option<String> = None;
    let mut head: Option<String> = None;
    let mut branch: Option<String> = None;
    let mut locked = false;
    let mut prunable = false;

    let mut flush = |path: &mut Option<String>,
                     head: &mut Option<String>,
                     branch: &mut Option<String>,
                     locked: &mut bool,
                     prunable: &mut bool| {
        if let Some(p) = path.take() {
            entries.push(WorktreeInfo {
                branch: branch.take(),
                path: p,
                is_main: entries.is_empty(),
                locked: *locked,
                prunable: *prunable,
                head: head.take(),
            });
            *locked = false;
            *prunable = false;
        }
    };

    for line in output.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            flush(&mut path, &mut head, &mut branch, &mut locked, &mut prunable);
            continue;
        }
        if let Some(value) = line.strip_prefix("worktree ") {
            flush(&mut path, &mut head, &mut branch, &mut locked, &mut prunable);
            // Git 输出恒用 `/`，与系统分隔符归一化后比较/删除才对得上。
            let raw = value.trim();
            #[cfg(windows)]
            let normalized = raw.replace('/', "\\");
            #[cfg(not(windows))]
            let normalized = raw.to_string();
            path = Some(normalized);
        } else if let Some(value) = line.strip_prefix("HEAD ") {
            head = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("branch ") {
            branch = value
                .trim()
                .strip_prefix("refs/heads/")
                .map(str::to_string)
                .or_else(|| Some(value.trim().to_string()));
        } else if line == "detached" {
            branch = None;
        } else if line.starts_with("locked") {
            locked = true;
        } else if line.starts_with("prunable") {
            prunable = true;
        }
    }
    flush(&mut path, &mut head, &mut branch, &mut locked, &mut prunable);
    entries
}

pub fn list_worktrees(root: &Path) -> Result<Vec<WorktreeInfo>, AppError> {
    let output = run_git_required(root, &["worktree", "list", "--porcelain"])?;
    Ok(parse_worktree_list(&output))
}

pub fn worktree_for_branch(
    worktrees: &[WorktreeInfo],
    branch_name: &str,
) -> Option<PathBuf> {
    worktrees
        .iter()
        .find(|entry| entry.branch.as_deref() == Some(branch_name))
        .map(|entry| PathBuf::from(&entry.path))
}

/// Local branch existence check (exact short name match).
pub(crate) fn has_local_branch(root: &Path, branch_name: &str) -> bool {
    run_git_required(root, &["show-ref", "--verify", "--quiet", &format!("refs/heads/{branch_name}")])
        .is_ok()
}

/// Remote-tracking ref existence: returns the full ref (e.g. `origin/foo`) if any.
pub(crate) fn remote_tracking_ref(root: &Path, branch_name: &str) -> Option<String> {
    let output = run_git_required(root, &["branch", "-r", "--format=%(refname:short)"]).ok()?;
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.contains("->"))
        .find(|line| line.split_once('/').is_some_and(|(_, name)| name == branch_name))
        .map(str::to_string)
}

/// Upstream map for all local branches: `branch -> upstream-short`
/// (via a single `for-each-ref` call; branches without upstream are absent).
pub(crate) fn branch_upstreams(root: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Ok(output) = run_git_required(
        root,
        &["for-each-ref", "--format=%(refname:short)%09%(upstream:short)", "refs/heads"],
    ) else {
        return map;
    };
    for line in output.lines() {
        let mut parts = line.split('\t');
        let (Some(branch), Some(upstream)) = (parts.next(), parts.next()) else {
            continue;
        };
        let (branch, upstream) = (branch.trim(), upstream.trim());
        if !branch.is_empty() && !upstream.is_empty() {
            map.insert(branch.to_string(), upstream.to_string());
        }
    }
    map
}

/// `(ahead, behind)` of `local...upstream` (None when unresolvable).
pub(crate) fn divergence_counts(
    root: &Path,
    local: &str,
    upstream: &str,
) -> Option<(i32, i32)> {
    let output =
        run_git_required(root, &["rev-list", "--left-right", "--count", &format!("{local}...{upstream}")])
            .ok()?;
    let mut parts = output.split_whitespace();
    let (Some(ahead), Some(behind)) = (parts.next(), parts.next()) else {
        return None;
    };
    Some((ahead.parse().ok()?, behind.parse().ok()?))
}

pub fn prune_worktrees(root: &Path) -> Result<(), AppError> {
    run_git_required(root, &["worktree", "prune"])?;
    Ok(())
}

/// Fetch `origin/<branch>` (or the resolved remote-tracking ref) into `path`.
fn fetch_branch(path: &Path, branch_name: &str) -> Result<String, AppError> {
    let remote_ref =
        remote_tracking_ref(path, branch_name).ok_or_else(|| {
            AppError::Workspace(format!("no remote branch found for: {branch_name}"))
        })?;
    let Some((remote, _)) = remote_ref.split_once('/') else {
        return Err(AppError::Workspace(format!("invalid remote ref: {remote_ref}")));
    };
    run_git_required(path, &["fetch", remote, branch_name])?;
    Ok(remote_ref)
}

fn stash_gate(path: &Path, branch_name: &str, allow_stash: bool) -> Result<bool, AppError> {
    let snapshot = capture_git_snapshot(path);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("target is not a Git repository".into()));
    }
    let dirty = git_has_local_changes(&snapshot);
    if dirty && !allow_stash {
        return Err(AppError::InvalidInput(
            "Dirty worktree requires explicit stash confirmation.".into(),
        ));
    }
    if dirty {
        stash_workspace_changes(path, branch_name)?;
    }
    Ok(dirty)
}

/// Reset the checked-out branch of `path` to its remote-tracking ref.
/// Dirty state is stashed first (gated by `allow_stash`).
pub(crate) fn reset_worktree_to_remote(
    path: &Path,
    branch_name: &str,
    allow_stash: bool,
) -> Result<bool, AppError> {
    let stashed = stash_gate(path, branch_name, allow_stash)?;
    let remote_ref = fetch_branch(path, branch_name)?;
    run_git_required(path, &["reset", "--hard", &remote_ref])?;
    Ok(stashed)
}

/// Fast-forward the checked-out branch of `path`, falling back to a
/// no-edit merge. Merge conflicts abort back to a clean worktree.
pub(crate) fn sync_worktree_with_remote(
    path: &Path,
    branch_name: &str,
    allow_stash: bool,
) -> Result<bool, AppError> {
    let stashed = stash_gate(path, branch_name, allow_stash)?;
    let remote_ref = fetch_branch(path, branch_name)?;
    if run_git_required(path, &["merge", "--ff-only", &remote_ref]).is_ok() {
        return Ok(stashed);
    }
    if run_git_required(path, &["merge", "--no-edit", &remote_ref]).is_err() {
        let _ = run_git_required(path, &["merge", "--abort"]);
        return Err(AppError::Workspace(format!(
            "sync conflict on {branch_name}: merge aborted, resolve manually in {remote_ref}"
        )));
    }
    Ok(stashed)
}

/// Ensure a sibling worktree exists for `branch_name` and apply `mode`.
/// Returns `(worktree_path, created)`. Focus (openWorkspace) happens on the
/// caller side so file/changes panels refresh through the normal bootstrap.
pub fn ensure_branch_worktree(
    root: &Path,
    branch_name: &str,
    mode: GitSwitchMode,
    allow_stash: bool,
) -> Result<(PathBuf, bool), AppError> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err(AppError::InvalidInput("branch name is required".into()));
    }
    if !capture_git_snapshot(root).is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }
    let _ = run_git_required(root, &["worktree", "prune"]);

    // Reuse: branch already checked out in some worktree (incl. main) → focus it.
    let worktrees = list_worktrees(root)?;
    if let Some(path) = worktree_for_branch(&worktrees, branch_name) {
        match mode {
            GitSwitchMode::Local => return Ok((path, false)),
            GitSwitchMode::Remote => {
                reset_worktree_to_remote(&path, branch_name, allow_stash)?;
                return Ok((path, false));
            }
            GitSwitchMode::Sync => {
                sync_worktree_with_remote(&path, branch_name, allow_stash)?;
                return Ok((path, false));
            }
        }
    }

    let local = has_local_branch(root, branch_name);
    let remote_ref = remote_tracking_ref(root, branch_name);
    if !local && remote_ref.is_none() {
        return Err(AppError::Workspace(format!(
            "branch not found locally or on remotes: {branch_name}"
        )));
    }
    if matches!(mode, GitSwitchMode::Remote) && remote_ref.is_none() {
        return Err(AppError::Workspace(format!(
            "no remote branch to reset from: {branch_name}"
        )));
    }

    // Fresh sibling directory (recompute after prune so stale dirs are skipped).
    let mut target = sibling_worktree_dir(root, branch_name);
    if worktree_for_branch(&list_worktrees(root).unwrap_or_default(), branch_name).is_some() {
        let worktrees = list_worktrees(root)?;
        return Ok((
            worktree_for_branch(&worktrees, branch_name).ok_or_else(|| {
                AppError::Workspace(format!("worktree vanished for: {branch_name}"))
            })?,
            false,
        ));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| AppError::Workspace(format!("failed to create worktree dir: {error}")))?;
    }

    let target_str = target.to_string_lossy().to_string();
    let add_result = match (&mode, local, remote_ref.clone()) {
        (GitSwitchMode::Remote, _, Some(remote)) => {
            run_git_required(root, &["worktree", "add", "-B", branch_name, &target_str, &remote])
        }
        (_, true, _) => run_git_required(root, &["worktree", "add", &target_str, branch_name]),
        (_, false, Some(remote)) => run_git_required(
            root,
            &["worktree", "add", "-b", branch_name, &target_str, &remote],
        ),
        (_, false, None) => Err(AppError::Workspace(format!(
            "branch not found locally or on remotes: {branch_name}"
        ))),
    };
    if let Err(error) = add_result {
        // Lost race: another caller materialized it (or it was already in use).
        let worktrees = list_worktrees(root)?;
        if let Some(path) = worktree_for_branch(&worktrees, branch_name) {
            target = path;
        } else {
            return Err(error);
        }
    }

    match mode {
        GitSwitchMode::Local => Ok((target, true)),
        GitSwitchMode::Remote => {
            reset_worktree_to_remote(&target, branch_name, allow_stash)?;
            Ok((target, true))
        }
        GitSwitchMode::Sync => {
            sync_worktree_with_remote(&target, branch_name, allow_stash)?;
            Ok((target, true))
        }
    }
}

pub fn remove_worktree(root: &Path, branch_name: &str, force: bool) -> Result<(), AppError> {
    let worktrees = list_worktrees(root)?;
    let Some(path) = worktree_for_branch(&worktrees, branch_name) else {
        return Err(AppError::Workspace(format!(
            "no worktree found for branch: {branch_name}"
        )));
    };
    if worktrees.first().is_some_and(|main| main.path == path.to_string_lossy()) {
        return Err(AppError::InvalidInput(
            "cannot remove the main worktree; remove the sibling directory instead".into(),
        ));
    }
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    let path_str = path.to_string_lossy().to_string();
    args.push(&path_str);
    run_git_required(root, &args)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::git_helpers::{init_git_repo, run_git_test};
    use super::*;

    fn setup_repo(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("adl-wt-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);
        dir
    }

    #[test]
    fn sanitize_branch_dir_replaces_separators() {
        assert_eq!(sanitize_branch_dir("feature/foo"), "feature-foo");
        assert_eq!(sanitize_branch_dir("a:b*c?d"), "a-b-c-d");
        assert_eq!(sanitize_branch_dir("  main  "), "main");
        assert_eq!(sanitize_branch_dir("///"), "branch");
    }

    #[test]
    fn sibling_worktree_dir_is_next_to_root() {
        let root = Path::new("E:/AI-DIGITAL-LIFE/Git-Test-Repository");
        let dir = sibling_worktree_dir(root, "feature/x");
        assert_eq!(
            dir,
            Path::new("E:/AI-DIGITAL-LIFE/Git-Test-Repository-worktrees/feature-x")
        );
    }

    #[test]
    fn parse_worktree_list_handles_main_and_linked() {
        let output = "worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-wt/feat\nHEAD def456\nbranch refs/heads/feat\nlocked\n\nworktree /repo-wt/old\nHEAD 000000\nbranch refs/heads/old\nprunable gitdir file points to non existent location\n";
        let entries = parse_worktree_list(output);
        assert_eq!(entries.len(), 3);
        assert!(entries[0].is_main);
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert!(!entries[0].locked);
        assert!(entries[1].locked);
        assert!(entries[2].prunable);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn list_worktrees_roundtrip_add_remove() {
        let dir = setup_repo("roundtrip");
        let worktrees = list_worktrees(&dir).unwrap();
        assert_eq!(worktrees.len(), 1);
        assert!(worktrees[0].is_main);

        run_git_test(&dir, &["branch", "feature"]);
        let sibling = sibling_worktree_dir(&dir, "feature");
        let sibling_str = sibling.to_string_lossy().to_string();
        run_git_test(&dir, &["worktree", "add", &sibling_str, "feature"]);

        let worktrees = list_worktrees(&dir).unwrap();
        assert_eq!(worktrees.len(), 2);
        let found = worktree_for_branch(&worktrees, "feature").unwrap();
        assert_eq!(found, sibling);

        remove_worktree(&dir, "feature", false).unwrap();
        let worktrees = list_worktrees(&dir).unwrap();
        assert_eq!(worktrees.len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn divergence_counts_detect_ahead() {
        let dir = setup_repo("diverge");
        run_git_test(&dir, &["checkout", "-b", "ahead"]);
        std::fs::write(dir.join("readme.md"), "# Modified").unwrap();
        run_git_test(&dir, &["add", "readme.md"]);
        run_git_test(&dir, &["commit", "-m", "extra"]);
        // Deterministic range regardless of the init default branch name.
        let counts = divergence_counts(&dir, "ahead", "ahead~1").expect("counts resolve");
        assert_eq!(counts, (1, 0));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn branch_upstreams_empty_without_remote() {
        let dir = setup_repo("upstream");
        let map = branch_upstreams(&dir);
        assert!(map.is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }
}
