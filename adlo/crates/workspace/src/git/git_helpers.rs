use adl_errors::AppError;
use adl_types::now_ms;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tokio::time::timeout as tokio_timeout;
use tracing::{debug, warn};

const GIT_TIMEOUT_SECS: u64 = 30;

/// 以显式工作区根为准的 `git` 子进程。
///
/// 继承自外部的 `GIT_DIR` / `GIT_WORK_TREE` 等仓库定位变量会覆盖
/// `current_dir`，让「调用方传入的 root」实际指向另一个仓库（典型场景：
/// 从 git hook 继承环境时，非仓库目录会被误判为仓库）。本 crate 的每次
/// git 调用都以 root 为准，因此统一移除这些变量。
pub(crate) fn git_command(root: &Path) -> Command {
    let mut command = Command::new("git");
    command.current_dir(root);
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_COMMON_DIR",
        "GIT_NAMESPACE",
        "GIT_CEILING_DIRECTORIES",
        "GIT_DISCOVERY_ACROSS_FILESYSTEM",
    ] {
        command.env_remove(key);
    }
    command
}

pub(crate) fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    let output = git_command(root).args(args).output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

pub(crate) async fn run_git_with_timeout(root: &Path, args: &[&str]) -> Option<String> {
    let root_owned = root.to_path_buf();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let result = tokio_timeout(Duration::from_secs(GIT_TIMEOUT_SECS), async move {
        tokio::task::spawn_blocking(move || {
            let output = git_command(&root_owned).args(&args_owned).output().ok()?;
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

pub(crate) fn run_git_bytes(root: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let output = git_command(root).args(args).output().ok()?;
    if output.status.success() { Some(output.stdout) } else { None }
}

pub(crate) fn run_git_paths(root: &Path, args: &[&str]) -> Option<Vec<String>> {
    let stdout = run_git_bytes(root, args)?;
    Some(
        stdout
            .split(|byte| *byte == 0)
            .filter(|chunk| !chunk.is_empty())
            .map(|chunk| String::from_utf8_lossy(chunk).replace('\\', "/"))
            .collect(),
    )
}

pub(crate) fn capture_git_paths_with_fallback(
    root: &Path,
    args: &[&str],
    command_name: &str,
) -> Vec<String> {
    run_git_paths(root, args).unwrap_or_else(|| {
        debug!(
            root = %root.to_string_lossy(),
            "git {} failed, defaulting to empty list",
            command_name
        );
        Vec::new()
    })
}

pub(crate) fn run_git_required(root: &Path, args: &[&str]) -> Result<String, AppError> {
    let output = git_command(root)
        .args(args)
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

pub(crate) fn first_non_empty_line(value: String) -> Option<String> {
    value.lines().map(str::trim).find(|line| !line.is_empty()).map(ToOwned::to_owned)
}

pub(crate) fn stash_workspace_changes(root: &Path, branch_name: &str) -> Result<(), AppError> {
    let message = format!("adl-auto-stash:{}:{}", branch_name, now_ms());
    run_git_required(root, &["stash", "push", "--include-untracked", "--message", &message])?;
    Ok(())
}

pub(crate) async fn capture_git_paths_with_fallback_async(
    root: &Path,
    args: &[&str],
) -> Vec<String> {
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

pub(crate) fn git_show_file(root: &Path, relative_path: &str) -> Result<Option<String>, AppError> {
    let object_path = format!("HEAD:{relative_path}");
    let output = git_command(root)
        .args(["show", &object_path])
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    if output.status.success() {
        // 事项3：与变更预览 current 侧对齐到 8MB（此前 1MB；base 侧同样不应先于
        // 前端 HeavyPreviewGate 拒掉，是否渲染由前端确认门决定）。
        if output.stdout.len() as u64 > crate::DEFAULT_MAX_TEXT_FILE_BYTES {
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
    let output = git_command(root)
        .args(["cat-file", "-e", &object_path])
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    Ok(output.status.success())
}

#[cfg(test)]
pub(crate) fn run_git_test(dir: &Path, args: &[&str]) {
    let status = git_command(dir).args(args).status().expect("git should be available");
    assert!(status.success(), "git command failed: git {}", args.join(" "));
}

#[cfg(test)]
pub(crate) fn init_git_repo(dir: &Path) {
    run_git_test(dir, &["init"]);
    run_git_test(dir, &["config", "user.email", "adl-tests@example.com"]);
    run_git_test(dir, &["config", "user.name", "ADL Tests"]);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 回归：git hook 会把 `GIT_DIR` 等变量传给子进程，若不清除，显式传入的
    /// 非仓库目录会被判定为仓库（`capture_git_snapshot_short_circuits_non_repo`）。
    #[test]
    fn git_command_drops_inherited_repo_locators() {
        let removed: Vec<String> = git_command(Path::new("."))
            .get_envs()
            .filter(|(_, value)| value.is_none())
            .map(|(key, _)| key.to_string_lossy().into_owned())
            .collect();
        for key in [
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
            "GIT_COMMON_DIR",
            "GIT_NAMESPACE",
            "GIT_CEILING_DIRECTORIES",
            "GIT_DISCOVERY_ACROSS_FILESYSTEM",
        ] {
            assert!(removed.iter().any(|item| item == key), "{key} should be removed");
        }
    }
}
