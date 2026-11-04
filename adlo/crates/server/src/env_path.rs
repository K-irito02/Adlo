//! Environment dependency PATH injection.
//!
//! `adl-env` owns the source model and [`adl_env::path_env::path_dirs`] decides
//! which directories the persisted preference should contribute (hosted copies
//! and/or a user-picked custom executable's parent). This module applies that
//! decision to the **server process** PATH:
//!
//! - dsh's hosted line spawns `node` (`spawn_node_direct("node", …)`),
//! - the workspace git layer spawns `git` (`Command::new("git")`),
//! - PTY sessions inherit the process environment.
//!
//! Without this, a successful hosted install (or a custom path) is only a status
//! badge: the app keeps using the system copy (or fails when there is none).
//!
//! All refreshes serialize on [`APPLIED`], and the directory set is computed
//! under that same lock, so an install finishing while the user switches source
//! cannot interleave a stale set. `std::env::set_var` is `unsafe` in edition
//! 2024; the accepted trade-off is a single writer with concurrent readers that
//! may observe the old or new value (Windows environment-block access does not
//! tear). Threading an explicit PATH through every `Command::new("git")` and the
//! dsh spawn is not feasible.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Directories this module injected last time (to remove them on a source switch).
static APPLIED: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// Recompute the environment PATH contribution and apply it to the process PATH.
///
/// Never fails the caller: a config read or path-join error keeps the current
/// PATH and logs a warning (env detection will surface config errors in the UI).
pub(crate) fn refresh(root: &Path) {
    let mut previous = APPLIED.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let dirs = match adl_env::path_env::path_dirs(root) {
        Ok(dirs) => dirs,
        Err(error) => {
            tracing::warn!(error = %error, "env: PATH refresh failed; keeping current PATH");
            return;
        },
    };
    let current = std::env::var_os("PATH").unwrap_or_default();
    let (merged, next_applied) = match plan(&current, &previous, &dirs) {
        Ok(planned) => planned,
        Err(error) => {
            // Do NOT record `dirs` as applied: the next refresh must retry, and the
            // log must not claim success while the hosted/custom dirs are absent.
            tracing::warn!(
                error = %error,
                "env: cannot merge PATH (quoted/illegal entry?); keeping current PATH"
            );
            return;
        },
    };
    // SAFETY: single writer (this mutex); see the module docs for the trade-off.
    unsafe {
        std::env::set_var("PATH", &merged);
    }
    if *previous != next_applied {
        tracing::info!(
            dirs = ?next_applied.iter().map(|d| d.display().to_string()).collect::<Vec<_>>(),
            "env: PATH updated"
        );
    }
    *previous = next_applied;
}

/// Pure planning step: merge the inherited PATH and return the next `APPLIED` set.
///
/// `next_applied` is only handed to the caller on success, so a failed merge can
/// never make the injector believe the hosted/custom dirs are active.
fn plan(
    current: &OsStr,
    previous: &[PathBuf],
    next: &[PathBuf],
) -> Result<(OsString, Vec<PathBuf>), std::env::JoinPathsError> {
    let merged = merge_path(current, previous, next)?;
    Ok((merged, next.to_vec()))
}

/// Replace previously injected dirs with `next`, then keep the inherited PATH.
///
/// Returns `Err` when `join_paths` rejects an entry (e.g. a quoted inherited
/// PATH entry); the caller must keep the old PATH and retry on the next refresh.
fn merge_path(
    current: &OsStr,
    previous: &[PathBuf],
    next: &[PathBuf],
) -> Result<OsString, std::env::JoinPathsError> {
    let mut parts: Vec<PathBuf> = Vec::new();
    for dir in next {
        if !dir.as_os_str().is_empty() {
            push_unique(&mut parts, dir.clone());
        }
    }
    let stale: Vec<String> = previous.iter().map(|p| normalize(p)).collect();
    for part in std::env::split_paths(current) {
        // 空条目在 Windows 上等价于当前工作目录（可执行文件劫持面），一律丢弃。
        if part.as_os_str().is_empty() {
            continue;
        }
        if stale.iter().any(|old| old == &normalize(&part)) {
            continue;
        }
        push_unique(&mut parts, part);
    }
    std::env::join_paths(&parts)
}

fn push_unique(parts: &mut Vec<PathBuf>, dir: PathBuf) {
    let key = normalize(&dir);
    if !parts.iter().any(|existing| normalize(existing) == key) {
        parts.push(dir);
    }
}

/// Windows path semantics only: case-insensitive and `/` treated as `\`.
/// The desktop app ships Windows only; on a POSIX build this normalization would
/// merge distinct directories (`/Bin` vs `/bin`), so the tests are gated to Windows.
fn normalize(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use adl_env::SourceMode;
    use adl_env::config::{self, DepSource, EnvSourcesConfig};
    use adl_env::providers::node;
    use adl_hosted::HostedVersions;

    #[test]
    fn prepends_next_and_removes_previous() {
        let old = PathBuf::from(r"C:\old\bin");
        let current = std::env::join_paths([old.clone(), PathBuf::from(r"C:\sys\bin")])
            .expect("join current");
        let next = vec![PathBuf::from(r"C:\new\bin")];
        let merged = merge_path(&current, &[old], &next).expect("merge");
        let parts: Vec<PathBuf> = std::env::split_paths(&merged).collect();
        assert_eq!(parts, vec![PathBuf::from(r"C:\new\bin"), PathBuf::from(r"C:\sys\bin")]);
    }

    #[test]
    fn deduplicates_and_is_case_insensitive_on_windows_paths() {
        let same = PathBuf::from(r"C:\New\Bin");
        let current = std::env::join_paths([PathBuf::from(r"c:/new/bin")]).expect("join");
        let merged = merge_path(&current, &[], std::slice::from_ref(&same)).expect("merge");
        let parts: Vec<PathBuf> = std::env::split_paths(&merged).collect();
        assert_eq!(parts.len(), 1, "same dir must not appear twice: {parts:?}");
    }

    #[test]
    fn drops_empty_inherited_entries() {
        // 空条目 = 当前工作目录；不得因为合并而重新引入。
        let current = OsString::from(r"C:\sys;");
        let merged = merge_path(&current, &[], &[PathBuf::from(r"C:\new")]).expect("merge");
        let parts: Vec<PathBuf> = std::env::split_paths(&merged).collect();
        assert_eq!(parts, vec![PathBuf::from(r"C:\new"), PathBuf::from(r"C:\sys")]);
    }

    #[test]
    fn unjoinable_entry_is_reported_instead_of_silently_dropping_our_dirs() {
        // join_paths 在 Windows 上拒绝含引号的条目；必须返回 Err，调用方据此保留原 PATH
        // 且不把 next 记为已应用（否则 H1 症状静默复现）。
        let bad = PathBuf::from(r#"C:\bad"dir"#);
        let result = merge_path(&OsString::new(), &[], &[bad]);
        assert!(result.is_err());
    }

    #[test]
    fn merged_path_wins_over_inherited_path_for_where() {
        let dir = std::env::temp_dir().join(format!(
            "adl_env_path_where_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        std::fs::write(dir.join("node.exe"), b"").expect("fake node");
        let inherited = std::env::var_os("PATH").unwrap_or_default();
        let merged = merge_path(&inherited, &[], std::slice::from_ref(&dir)).expect("merge");
        let output = std::process::Command::new("where")
            .arg("node")
            .env("PATH", &merged)
            .output()
            .expect("run where");
        let first =
            String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
        assert_eq!(
            first.to_lowercase(),
            dir.join("node.exe").to_string_lossy().to_lowercase(),
            "hosted dir must be resolved before the system node"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "adl_server_env_path_{tag}_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("temp root");
        dir
    }

    fn install_fake_node(root: &Path) -> PathBuf {
        let hosted = HostedVersions::open(root, node::HOSTED_NAME, node::MARKER_REL);
        hosted.mark_installed("24.22.1").expect("marker");
        hosted.write_selected("24.22.1").expect("selected");
        hosted.installed_marker("24.22.1").parent().expect("marker has parent").to_path_buf()
    }

    fn write_node_mode(root: &Path, mode: SourceMode) {
        let config = EnvSourcesConfig {
            node: DepSource { mode, custom_path: None },
            ..EnvSourcesConfig::default()
        };
        config::save(root, &config).expect("save sources");
    }

    #[test]
    fn source_switch_changes_the_merged_path() {
        // 纯函数链（path_dirs + plan）覆盖注入/摘除与 APPLIED 簿记，不修改进程 PATH：
        // 同进程其它测试会并发 init_server_state → refresh，直接 set_var 会互相污染。
        let root = temp_root("switch");
        let hosted_dir = install_fake_node(&root);
        write_node_mode(&root, SourceMode::Auto);

        let auto_dirs = adl_env::path_env::path_dirs(&root).expect("auto dirs");
        let (auto_path, auto_applied) =
            plan(&OsString::from(r"C:\sys"), &[], &auto_dirs).expect("plan auto");
        assert_eq!(auto_applied, auto_dirs);
        assert!(
            std::env::split_paths(&auto_path).any(|p| p == hosted_dir),
            "auto mode must inject the hosted node dir"
        );

        write_node_mode(&root, SourceMode::System);
        let system_dirs = adl_env::path_env::path_dirs(&root).expect("system dirs");
        assert!(system_dirs.is_empty(), "system mode must not inject the hosted copy");
        // 关键：current 用第一次注入后的 PATH，才能证明 previous 被摘除。
        let (system_path, system_applied) =
            plan(&auto_path, &auto_applied, &system_dirs).expect("plan system");
        assert!(system_applied.is_empty());
        assert!(
            !std::env::split_paths(&system_path).any(|p| p == hosted_dir),
            "system mode must remove the previously injected hosted dir"
        );
    }
}
