use std::path::Path;
use std::time::Duration;

use adl_errors::AppError;
use tracing::warn;

use super::git_helpers::{run_git, run_git_required, run_git_required_with_timeout};

/// 网络操作（push/pull）超时：仅网络调用使用；本地 git 操作不设超时。
const NETWORK_TIMEOUT: Duration = Duration::from_secs(120);

/// 提交已暂存内容。空消息在服务端再拦一次，避免只靠前端校验。
pub fn commit(root: &Path, message: &str) -> Result<(), AppError> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("commit message is empty".into()));
    }
    run_git_required(root, &["commit", "-m", trimmed]).map(|_| ()).inspect_err(|e| {
        warn!(root = %root.display(), error = %e, "commit failed");
    })
}

/// 推送当前分支。已有 upstream 直接 push；没有 upstream 时选远程并 `-u` 建立跟踪。
///
/// 远程选择：优先 `origin`，其次唯一远程；多个远程且没有 `origin` 时拒绝，
/// 让用户先显式设置 upstream（避免推错仓库）。
pub fn push(root: &Path) -> Result<(), AppError> {
    let upstream = run_git(root, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
        .and_then(|value| {
            value.lines().map(str::trim).find(|line| !line.is_empty()).map(ToOwned::to_owned)
        });

    if upstream.is_some() {
        return run_git_required_with_timeout(root, &["push"], NETWORK_TIMEOUT)
            .map(|_| ())
            .inspect_err(|e| warn!(root = %root.display(), error = %e, "push failed"));
    }

    let remotes: Vec<String> = run_git(root, &["remote"])
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    let remote = if remotes.iter().any(|name| name == "origin") {
        "origin".to_string()
    } else if remotes.len() == 1 {
        remotes[0].clone()
    } else {
        return Err(AppError::Workspace(
            "no upstream branch and no unambiguous remote; set an upstream branch first".into(),
        ));
    };

    run_git_required_with_timeout(root, &["push", "-u", &remote, "HEAD"], NETWORK_TIMEOUT)
        .map(|_| ())
        .inspect_err(
            |e| warn!(root = %root.display(), remote = %remote, error = %e, "push -u failed"),
        )
}

/// 拉取（仅快进）。分叉时 git 返回错误，错误信息（含 stderr）原样上抛给 UI。
pub fn pull_ff_only(root: &Path) -> Result<(), AppError> {
    run_git_required_with_timeout(root, &["pull", "--ff-only"], NETWORK_TIMEOUT)
        .map(|_| ())
        .inspect_err(|e| warn!(root = %root.display(), error = %e, "pull --ff-only failed"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::git_helpers::{init_git_repo, run_git, run_git_test};

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("adl-git-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn init_with_commit(dir: &Path) {
        init_git_repo(dir);
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        run_git_test(dir, &["add", "a.txt"]);
        run_git_test(dir, &["commit", "-m", "init"]);
    }

    fn setup_remote() -> (std::path::PathBuf, std::path::PathBuf) {
        let remote = temp_dir("remote");
        run_git_test(&remote, &["init", "--bare"]);
        let local = temp_dir("local");
        init_with_commit(&local);
        run_git_test(&local, &["remote", "add", "origin", remote.to_str().unwrap()]);
        (remote, local)
    }

    #[test]
    fn commit_rejects_blank_message() {
        let dir = temp_dir("commit-blank");
        init_with_commit(&dir);
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        run_git_test(&dir, &["add", "a.txt"]);

        let error = commit(&dir, "   \n").unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn commit_records_staged_changes() {
        let dir = temp_dir("commit-ok");
        init_with_commit(&dir);
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        run_git_test(&dir, &["add", "a.txt"]);

        commit(&dir, "feat: update a").unwrap();

        let subject = run_git(&dir, &["log", "-1", "--pretty=%s"]).unwrap();
        assert_eq!(subject, "feat: update a");
        let status = run_git(&dir, &["status", "--porcelain"]).unwrap();
        assert!(status.trim().is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn push_sets_upstream_when_missing() {
        let (remote, local) = setup_remote();

        push(&local).unwrap();

        let upstream =
            run_git(&local, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
                .unwrap();
        let branch = run_git(&local, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap();
        assert_eq!(upstream, format!("origin/{branch}"));
        assert!(
            remote.join(format!("refs/heads/{branch}")).exists(),
            "remote must receive the branch"
        );

        let _ = std::fs::remove_dir_all(remote);
        let _ = std::fs::remove_dir_all(local);
    }

    #[test]
    fn push_fails_without_any_remote() {
        let dir = temp_dir("push-noremote");
        init_with_commit(&dir);
        let error = push(&dir).unwrap_err();
        assert!(matches!(error, AppError::Workspace(_)));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn push_uses_the_only_non_origin_remote() {
        let remote = temp_dir("upstream-remote");
        run_git_test(&remote, &["init", "--bare"]);
        let local = temp_dir("upstream-local");
        init_with_commit(&local);
        run_git_test(&local, &["remote", "add", "upstream", remote.to_str().unwrap()]);

        push(&local).unwrap();

        let branch = run_git(&local, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap();
        let upstream =
            run_git(&local, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
                .unwrap();
        assert_eq!(upstream, format!("upstream/{branch}"));
        assert!(remote.join(format!("refs/heads/{branch}")).exists());

        let _ = std::fs::remove_dir_all(remote);
        let _ = std::fs::remove_dir_all(local);
    }

    #[test]
    fn push_refuses_multiple_remotes_without_origin() {
        let remote_a = temp_dir("multi-a");
        run_git_test(&remote_a, &["init", "--bare"]);
        let remote_b = temp_dir("multi-b");
        run_git_test(&remote_b, &["init", "--bare"]);
        let local = temp_dir("multi-local");
        init_with_commit(&local);
        run_git_test(&local, &["remote", "add", "alpha", remote_a.to_str().unwrap()]);
        run_git_test(&local, &["remote", "add", "beta", remote_b.to_str().unwrap()]);

        let error = push(&local).unwrap_err();
        assert!(matches!(error, AppError::Workspace(_)));
        let branch = run_git(&local, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap();
        assert!(
            !remote_a.join(format!("refs/heads/{branch}")).exists()
                && !remote_b.join(format!("refs/heads/{branch}")).exists(),
            "no remote may receive the branch"
        );

        let _ = std::fs::remove_dir_all(remote_a);
        let _ = std::fs::remove_dir_all(remote_b);
        let _ = std::fs::remove_dir_all(local);
    }

    #[test]
    fn pull_ff_only_accepts_a_fast_forward() {
        let (remote, local) = setup_remote();
        push(&local).unwrap();

        let clone = temp_dir("clone");
        run_git_test(&clone, &["clone", remote.to_str().unwrap(), "."]);
        run_git_test(&clone, &["config", "user.email", "adl-tests@example.com"]);
        run_git_test(&clone, &["config", "user.name", "ADL Tests"]);
        std::fs::write(clone.join("b.txt"), "remote\n").unwrap();
        run_git_test(&clone, &["add", "b.txt"]);
        run_git_test(&clone, &["commit", "-m", "remote change"]);
        run_git_test(&clone, &["push", "origin", "HEAD"]);

        pull_ff_only(&local).unwrap();
        assert!(local.join("b.txt").exists(), "fast-forward must bring the remote file");

        let _ = std::fs::remove_dir_all(remote);
        let _ = std::fs::remove_dir_all(local);
        let _ = std::fs::remove_dir_all(clone);
    }

    #[test]
    fn pull_ff_only_rejects_diverged_history() {
        let (remote, local) = setup_remote();
        push(&local).unwrap();

        let clone = temp_dir("diverge-clone");
        run_git_test(&clone, &["clone", remote.to_str().unwrap(), "."]);
        run_git_test(&clone, &["config", "user.email", "adl-tests@example.com"]);
        run_git_test(&clone, &["config", "user.name", "ADL Tests"]);
        std::fs::write(clone.join("remote.txt"), "r\n").unwrap();
        run_git_test(&clone, &["add", "remote.txt"]);
        run_git_test(&clone, &["commit", "-m", "remote"]);
        run_git_test(&clone, &["push", "origin", "HEAD"]);
        run_git_test(&local, &["fetch", "origin"]);

        std::fs::write(local.join("a.txt"), "local\n").unwrap();
        run_git_test(&local, &["commit", "-am", "local"]);

        let error = pull_ff_only(&local).unwrap_err();
        assert!(matches!(error, AppError::Workspace(_)));

        let _ = std::fs::remove_dir_all(remote);
        let _ = std::fs::remove_dir_all(local);
        let _ = std::fs::remove_dir_all(clone);
    }
}
