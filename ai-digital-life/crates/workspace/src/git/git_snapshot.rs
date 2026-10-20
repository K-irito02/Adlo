use adl_types::{GitSnapshot, now_ms};
use std::path::Path;

use super::git_helpers::{
    capture_git_paths_with_fallback, capture_git_paths_with_fallback_async, first_non_empty_line,
    run_git, run_git_required, run_git_with_timeout,
};

/// 非仓库短路：直接返回空快照（`is_repo=false` + 全空 + `captured_at` 照常），
/// 与逐条命令失败逐字段一致，但省掉 6 次 git 子进程与
/// `failed, defaulting to empty list` DEBUG 噪音（事项 2026-10-20/1）。
/// 判定口径（与旧逻辑逐字等价，R1-F1/F2 实证锁定）：
/// 1) 根下有 `.git`（文件或目录，worktree 的 `.git` 文件同样命中）→ 仓库；
/// 2) 否则单次静默探测 `rev-parse --is-inside-work-tree --is-bare-repository`，
///    任一为 `true` 即仓库（覆盖“仓库子目录靠上溯判定”、“空裸仓靠 branch 隐式判定”）；
/// 3) 其余（非仓库/缺目录/git 缺失）→ 空快照。注意 git 缺失**且**有 `.git` 时
///    仍走旧路径（`is_repo=true` + 全空），与旧逻辑一致，本函数不改变该语义。
fn empty_snapshot() -> GitSnapshot {
    GitSnapshot {
        is_repo: false,
        branch: None,
        head: None,
        ahead: None,
        behind: None,
        staged: Vec::new(),
        unstaged: Vec::new(),
        untracked: Vec::new(),
        conflicts: Vec::new(),
        captured_at: now_ms(),
    }
}

/// 仓库判定（静默，无日志）：供 `capture_git_snapshot[_async]` 前置短路。
/// 任一来源为真即视为仓库；探测失败（非仓库/缺目录/无 git）一律 false。
fn has_git_repo(root: &Path) -> bool {
    if root.join(".git").exists() {
        return true;
    }
    run_git(root, &["rev-parse", "--is-inside-work-tree", "--is-bare-repository"])
        .map(|s| s.lines().any(|line| line.trim() == "true"))
        .unwrap_or(false)
}

/// 异步版仓库判定（同上语义；阻塞式命令走 `spawn_blocking` + 超时，不占运行时）。
async fn has_git_repo_async(root: &Path) -> bool {
    if root.join(".git").exists() {
        return true;
    }
    run_git_with_timeout(root, &["rev-parse", "--is-inside-work-tree", "--is-bare-repository"])
        .await
        .map(|s| s.lines().any(|line| line.trim() == "true"))
        .unwrap_or(false)
}

pub fn capture_git_snapshot(root: &Path) -> GitSnapshot {
    if !has_git_repo(root) {
        return empty_snapshot();
    }
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
    if !has_git_repo_async(root).await {
        return empty_snapshot();
    }
    // 非仓库已在上游短路，此处恒为真（保留变量名以维持下文 is_repo 表达式不变）。
    let is_repo_check = true;
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
            line.split_once(' ').is_some_and(|(reference, message)| {
                reference.trim() == stash_ref && message.contains(&needle)
            })
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

    /// 非仓库短路：无 `.git` 且探测全否则直接返回空快照（与逐条失败同一结果），
    /// 覆盖 P0 实证：非 git 工作区（`毕设`/`视频剪辑`）与已删除目录（`large-delete-repro`）。
    #[test]
    fn capture_git_snapshot_short_circuits_non_repo() {
        for tag in ["norepo", "missing"] {
            let dir = std::env::temp_dir()
                .join(format!("adl-git-shortcircuit-{tag}-{}", uuid::Uuid::new_v4()));
            if tag == "norepo" {
                std::fs::create_dir_all(&dir).unwrap();
            }
            assert!(!dir.join(".git").exists());
            let snapshot = capture_git_snapshot(&dir);
            assert!(!snapshot.is_repo);
            assert!(snapshot.branch.is_none());
            assert!(snapshot.head.is_none());
            assert!(snapshot.ahead.is_none());
            assert!(snapshot.behind.is_none());
            assert!(snapshot.staged.is_empty());
            assert!(snapshot.unstaged.is_empty());
            assert!(snapshot.untracked.is_empty());
            assert!(snapshot.conflicts.is_empty());
            assert!(snapshot.captured_at > 0);
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[tokio::test]
    async fn capture_git_snapshot_async_short_circuits_non_repo() {
        let dir = std::env::temp_dir()
            .join(format!("adl-git-shortcircuit-async-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let snapshot = capture_git_snapshot_async(&dir).await;
        assert!(!snapshot.is_repo);
        assert!(snapshot.branch.is_none());
        assert!(snapshot.head.is_none());
        assert!(snapshot.ahead.is_none());
        assert!(snapshot.behind.is_none());
        assert!(snapshot.staged.is_empty());
        assert!(snapshot.unstaged.is_empty());
        assert!(snapshot.untracked.is_empty());
        assert!(snapshot.conflicts.is_empty());
        assert!(snapshot.captured_at > 0);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// 仓库子目录保持旧语义（R1-F1）：旧逻辑经 git 上溯判 `is_repo=true`，
    /// 门控不得将其改判为非仓库（需真实 git，故忽略标记与文件内其它用例一致）。
    #[test]
    #[ignore = "requires git in PATH"]
    fn capture_git_snapshot_keeps_repo_subdirectory_as_repo() {
        let dir = std::env::temp_dir().join(format!("adl-git-subdir-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        init_git_repo(&dir);
        let snapshot = capture_git_snapshot(&dir.join("sub"));
        assert!(snapshot.is_repo);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// 空裸仓保持旧语义（R1-F2）：旧逻辑经 `branch` 隐式判 `is_repo=true`。
    #[test]
    #[ignore = "requires git in PATH"]
    fn capture_git_snapshot_keeps_empty_bare_repo_as_repo() {
        let dir = std::env::temp_dir().join(format!("adl-git-bare-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let status = Command::new("git")
            .args(["init", "--bare", "repo.git"])
            .current_dir(&dir)
            .status()
            .unwrap();
        assert!(status.success());
        let snapshot = capture_git_snapshot(&dir.join("repo.git"));
        assert!(snapshot.is_repo);
        let _ = std::fs::remove_dir_all(dir);
    }

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
