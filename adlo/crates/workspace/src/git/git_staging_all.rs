use std::path::Path;

use adl_errors::AppError;
use tracing::warn;

use super::git_helpers::{HeadState, git_head_state, run_git_required};

/// 暂存全部（含未跟踪与删除）：`git add -A`。
pub fn stage_all(root: &Path) -> Result<(), AppError> {
    run_git_required(root, &["add", "-A"]).map(|_| ()).inspect_err(|e| {
        warn!(root = %root.display(), error = %e, "stage_all failed");
    })
}

/// 取消暂存全部：有 HEAD 时 `restore --staged`；仓库尚无提交（无 HEAD）时 `reset`。
pub fn unstage_all(root: &Path) -> Result<(), AppError> {
    match git_head_state(root)? {
        HeadState::Present => run_git_required(root, &["restore", "--staged", "--", "."])
            .map(|_| ())
            .inspect_err(|error| {
                warn!(root = %root.display(), error = %error, "unstage_all failed");
            }),
        HeadState::Unborn => run_git_required(root, &["reset"]).map(|_| ()).inspect_err(|error| {
            warn!(root = %root.display(), error = %error, "unstage_all reset failed");
        }),
    }
}

/// 放弃全部本地更改（不可恢复）：已跟踪文件 restore 到 HEAD，未跟踪文件 clean。
/// 仓库没有 HEAD（刚 init）时先清索引再 clean（索引里的条目也属于要放弃的内容）。
pub fn discard_all(root: &Path) -> Result<(), AppError> {
    match git_head_state(root)? {
        HeadState::Present => {
            if let Err(error) = run_git_required(
                root,
                &["restore", "--source=HEAD", "--staged", "--worktree", "--", "."],
            ) {
                warn!(root = %root.display(), error = %error, "discard_all restore failed");
                return Err(error);
            }
        },
        HeadState::Unborn => {
            // 无 HEAD 时索引里的条目无法 restore；先清索引（-f 跳过 up-to-date 检查，
            // 覆盖「暂存后又编辑」），clean 才会把这些文件当作未跟踪项删除。
            run_git_required(root, &["rm", "-r", "-f", "--cached", "--ignore-unmatch", "--", "."])
                .map(|_| ())
                .inspect_err(|error| {
                    warn!(root = %root.display(), error = %error, "discard_all unstage failed");
                })?;
        },
    }
    run_git_required(root, &["clean", "-fd"]).map(|_| ()).inspect_err(|e| {
        warn!(root = %root.display(), error = %e, "discard_all clean failed");
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::git_helpers::{init_git_repo, run_git, run_git_test};

    fn temp_repo(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("adl-git-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        dir
    }

    fn commit_initial(dir: &Path) {
        std::fs::write(dir.join("tracked.txt"), "hello\n").unwrap();
        run_git_test(dir, &["add", "tracked.txt"]);
        run_git_test(dir, &["commit", "-m", "init"]);
    }

    #[test]
    fn stage_all_includes_untracked_and_deleted() {
        let dir = temp_repo("stage-all");
        commit_initial(&dir);
        std::fs::write(dir.join("tracked.txt"), "changed\n").unwrap();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();
        std::fs::remove_file(dir.join("tracked.txt")).ok();

        stage_all(&dir).unwrap();

        let staged = run_git(&dir, &["diff", "--cached", "--name-only"]).unwrap_or_default();
        assert!(staged.contains("new.txt"), "untracked file must be staged");
        assert!(staged.contains("tracked.txt"), "deleted file must be staged");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn unstage_all_clears_the_index() {
        let dir = temp_repo("unstage-all");
        commit_initial(&dir);
        std::fs::write(dir.join("tracked.txt"), "changed\n").unwrap();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();
        stage_all(&dir).unwrap();

        unstage_all(&dir).unwrap();

        let staged = run_git(&dir, &["diff", "--cached", "--name-only"]).unwrap_or_default();
        assert!(staged.trim().is_empty(), "index must be empty after unstage_all");
        let status = run_git(&dir, &["status", "--porcelain"]).unwrap_or_default();
        assert!(status.contains("new.txt"), "untracked file must stay on disk");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn discard_all_restores_tracked_and_removes_untracked() {
        let dir = temp_repo("discard-all");
        commit_initial(&dir);
        std::fs::write(dir.join("tracked.txt"), "changed\n").unwrap();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();
        stage_all(&dir).unwrap();
        std::fs::write(dir.join("tracked.txt"), "changed again\n").unwrap();

        discard_all(&dir).unwrap();

        let content = std::fs::read_to_string(dir.join("tracked.txt")).unwrap();
        assert_eq!(
            content.replace("\r\n", "\n"),
            "hello\n",
            "tracked file must be restored to HEAD"
        );
        assert!(!dir.join("new.txt").exists(), "untracked file must be removed");
        let status = run_git(&dir, &["status", "--porcelain"]).unwrap_or_default();
        assert!(status.trim().is_empty(), "worktree must be clean: {status}");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn unstage_all_without_head_clears_the_index() {
        let dir =
            std::env::temp_dir().join(format!("adl-git-unstage-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("one.txt"), "1\n").unwrap();
        std::fs::write(dir.join("two.txt"), "2\n").unwrap();
        stage_all(&dir).unwrap();

        unstage_all(&dir).unwrap();

        let staged = run_git(&dir, &["diff", "--cached", "--name-only"]).unwrap_or_default();
        assert!(staged.trim().is_empty(), "index must be empty: {staged}");
        assert!(dir.join("one.txt").exists());
        assert!(dir.join("two.txt").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn discard_all_without_head_clears_staged_entries() {
        let dir =
            std::env::temp_dir().join(format!("adl-git-discard-staged-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("one.txt"), "1\n").unwrap();
        std::fs::write(dir.join("two.txt"), "2\n").unwrap();
        stage_all(&dir).unwrap();
        // 暂存后继续编辑：无 HEAD 下 git rm --cached 需要 -f 才能清索引。
        std::fs::write(dir.join("one.txt"), "1-edited\n").unwrap();

        discard_all(&dir).unwrap();

        let staged = run_git(&dir, &["diff", "--cached", "--name-only"]).unwrap_or_default();
        assert!(staged.trim().is_empty(), "index must be empty: {staged}");
        assert!(!dir.join("one.txt").exists());
        assert!(!dir.join("two.txt").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn discard_all_rejects_a_corrupt_branch_ref_instead_of_clearing_the_worktree() {
        let dir = temp_repo("discard-corrupt-head");
        commit_initial(&dir);
        let branch = run_git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap();
        std::fs::write(dir.join(format!(".git/refs/heads/{branch}")), "not a valid oid\n").unwrap();

        let error = discard_all(&dir).unwrap_err();
        assert!(matches!(error, AppError::Workspace(_)));
        assert!(dir.join("tracked.txt").exists(), "worktree must be left untouched");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn discard_all_rejects_a_corrupt_packed_ref_instead_of_clearing_the_worktree() {
        let dir = temp_repo("discard-corrupt-packed");
        commit_initial(&dir);
        let branch = run_git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap();
        std::fs::remove_file(dir.join(format!(".git/refs/heads/{branch}"))).ok();
        std::fs::write(
            dir.join(".git/packed-refs"),
            format!("0000000000000000000000000000000000000000 refs/heads/{branch}\n"),
        )
        .unwrap();

        let error = discard_all(&dir).unwrap_err();
        assert!(matches!(error, AppError::Workspace(_)));
        assert!(dir.join("tracked.txt").exists(), "worktree must be left untouched");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn discard_all_without_head_removes_untracked_directories() {
        let dir =
            std::env::temp_dir().join(format!("adl-git-discard-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("loose.txt"), "x\n").unwrap();
        std::fs::create_dir_all(dir.join("nested")).unwrap();
        std::fs::write(dir.join("nested/deep.txt"), "y\n").unwrap();

        discard_all(&dir).unwrap();

        assert!(!dir.join("loose.txt").exists());
        assert!(!dir.join("nested").exists(), "untracked directory must be removed");
        let _ = std::fs::remove_dir_all(dir);
    }
}
