use adl_types::{GitSnapshot, now_ms};
use std::path::Path;

use super::git_helpers::{
    capture_git_paths_with_fallback, capture_git_paths_with_fallback_async, first_non_empty_line,
    run_git, run_git_required, run_git_with_timeout,
};

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

pub fn has_auto_stash(root: &Path, branch_name: &str) -> bool {
    let stash_list = match run_git_required(root, &["stash", "list", "--format=%s"]) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let needle = format!("adl-auto-stash:{}:", branch_name);
    stash_list.lines().any(|line| line.contains(&needle))
}

/// Resolve the newest `stash@{n}` ref whose message matches this branch's
/// auto-stash marker, or `None` when absent. `git stash list` enumerates
/// newest-first (`stash@{0}` is latest), so the FIRST match wins (P4 R5).
fn find_auto_stash_ref(root: &Path, needle: &str) -> Result<Option<String>, adl_errors::AppError> {
    let stash_list = run_git_required(root, &["stash", "list", "--format=%gd %s"])?;
    for line in stash_list.lines() {
        let Some((reference, message)) = line.split_once(' ') else {
            continue;
        };
        if message.contains(needle) {
            return Ok(Some(reference.trim().to_string()));
        }
    }
    Ok(None)
}

pub fn pop_auto_stash(root: &Path, target_branch: &str) -> Result<bool, adl_errors::AppError> {
    let needle = format!("adl-auto-stash:{}:", target_branch);
    for _ in 0..2 {
        let Some(stash_ref) = find_auto_stash_ref(root, &needle)? else {
            return Ok(true);
        };
        // Verify the ref still carries our marker: the list may have shifted
        // between resolve and pop (user stashing concurrently). On mismatch
        // re-resolve once; only a genuine pop failure keeps the entry.
        let verify = run_git_required(root, &["stash", "list", "--format=%gd %s"])?;
        let still_ours = verify.lines().any(|line| {
            line.split_once(' ')
                .is_some_and(|(reference, message)| reference.trim() == stash_ref && message.contains(&needle))
        });
        if !still_ours {
            continue;
        }
        let pop_result = run_git_required(root, &["stash", "pop", "--index", &stash_ref]);
        match pop_result {
            Ok(_) => return Ok(true),
            Err(_) => return Ok(false),
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::super::git_helpers::{init_git_repo, stash_workspace_changes};
    use super::*;
    use std::process::Command;

    #[test]
    #[ignore = "requires git in PATH"]
    fn has_auto_stash_returns_true_when_stash_exists() {
        let dir = std::env::temp_dir().join(format!("adl-has-stash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("readme.md"), "# Test").unwrap();
        let status =
            Command::new("git").args(["add", "readme.md"]).current_dir(&dir).status().unwrap();
        assert!(status.success());
        let status =
            Command::new("git").args(["commit", "-m", "init"]).current_dir(&dir).status().unwrap();
        assert!(status.success());

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
        let status =
            Command::new("git").args(["add", "readme.md"]).current_dir(&dir).status().unwrap();
        assert!(status.success());
        let status =
            Command::new("git").args(["commit", "-m", "init"]).current_dir(&dir).status().unwrap();
        assert!(status.success());

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
        let status =
            Command::new("git").args(["add", "readme.md"]).current_dir(&dir).status().unwrap();
        assert!(status.success());
        let status =
            Command::new("git").args(["commit", "-m", "init"]).current_dir(&dir).status().unwrap();
        assert!(status.success());

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
        let status =
            Command::new("git").args(["add", "readme.md"]).current_dir(&dir).status().unwrap();
        assert!(status.success());
        let status =
            Command::new("git").args(["commit", "-m", "init"]).current_dir(&dir).status().unwrap();
        assert!(status.success());

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
        let status =
            Command::new("git").args(["add", "readme.md"]).current_dir(&dir).status().unwrap();
        assert!(status.success());
        let status =
            Command::new("git").args(["commit", "-m", "init"]).current_dir(&dir).status().unwrap();
        assert!(status.success());

        let restored = pop_auto_stash(&dir, "main").unwrap();
        assert!(restored);
        let _ = std::fs::remove_dir_all(dir);
    }
}
