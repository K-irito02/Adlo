//! `bash` provider: system-side detection + hosted PortableGit bash.
//!
//! The hosted Git asset is **PortableGit**, which ships `bin/bash.exe`; that
//! copy is the hosted bash source. System candidates remain the full Git for
//! Windows install, WSL, MSYS2, or an explicit manual path.
//!
//! No `adl-pty` dependency: the fixed-path probes are re-implemented here as
//! pure path constructors plus the pure ranking function
//! [`candidates_from_snapshot`]; only the thin [`detect`] wrapper touches the
//! real filesystem. `adl-pty` stays zero-change.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Bash source, in priority order (highest first).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BashKind {
    /// `bin/bash.exe` inside the hosted PortableGit version dir.
    Hosted,
    GitBundled,
    Wsl,
    Msys2,
    /// Caller-supplied (Task 11 set-custom-path), not produced by `detect()`.
    Manual,
}

/// Marker inside the hosted PortableGit version dir.
pub const HOSTED_MARKER_REL: &str = "bin/bash.exe";

/// One usable bash with its source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BashCandidate {
    pub kind: BashKind,
    pub path: String,
}

/// Point-in-time presence snapshot; pure input to
/// [`candidates_from_snapshot`]. `None` = that source is absent on this
/// machine. Real PATH/registry reads live in [`detect`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EnvSnapshot {
    pub git_bundled: Option<PathBuf>,
    pub wsl: Option<PathBuf>,
    pub msys2: Option<PathBuf>,
    pub manual: Option<PathBuf>,
}

/// Rank present snapshot entries: Git自带 > WSL > MSYS2 > Manual.
pub fn candidates_from_snapshot(snap: &EnvSnapshot) -> Vec<BashCandidate> {
    [
        (BashKind::GitBundled, &snap.git_bundled),
        (BashKind::Wsl, &snap.wsl),
        (BashKind::Msys2, &snap.msys2),
        (BashKind::Manual, &snap.manual),
    ]
    .into_iter()
    .filter_map(|(kind, path)| {
        path.as_ref().map(|p| BashCandidate { kind, path: p.to_string_lossy().into_owned() })
    })
    .collect()
}

/// Fixed Git-bundled candidates: `Program Files` + `Program Files (x86)`
/// variants (pure constructor; existence is checked by [`detect`]).
pub fn git_bundled_candidates(program_files: &Path, program_files_x86: &Path) -> [PathBuf; 2] {
    [program_files.join("Git/bin/bash.exe"), program_files_x86.join("Git/bin/bash.exe")]
}

/// Fixed MSYS2 candidates (pure constructor; existence is checked by [`detect`]).
pub fn msys2_candidates() -> [PathBuf; 2] {
    [PathBuf::from("C:/msys64/usr/bin/bash.exe"), PathBuf::from("C:/tools/msys64/usr/bin/bash.exe")]
}

/// Selected PortableGit version when that version actually contains
/// `bin/bash.exe`; `None` when Git is not installed or the asset lacks bash.
pub fn host_version(data_dir: &Path) -> Option<String> {
    crate::providers::git::host_bash_version(data_dir)
}

/// Absolute path of the hosted `bin/bash.exe` for `version` (no existence check).
pub fn host_bin_path(data_dir: &Path, version: &str) -> PathBuf {
    crate::providers::git::host_bash_path(data_dir, version)
}

/// Hosted bash candidate when PortableGit is installed with bash.
pub fn detect_hosted(data_dir: &Path) -> Option<BashCandidate> {
    let version = host_version(data_dir)?;
    let path = host_bin_path(data_dir, &version);
    path.is_file().then(|| BashCandidate {
        kind: BashKind::Hosted,
        path: path.to_string_lossy().into_owned(),
    })
}

/// Detect usable bashes on this machine: probe the fixed paths (`Git`-bundled,
/// MSYS2) and `PATH` (`bash`, `wsl`), build a snapshot, and rank it.
pub fn detect() -> Vec<BashCandidate> {
    let program_files = std::env::var_os("ProgramFiles")
        .map_or_else(|| PathBuf::from("C:/Program Files"), PathBuf::from);
    let program_files_x86 = std::env::var_os("ProgramFiles(x86)")
        .map_or_else(|| PathBuf::from("C:/Program Files (x86)"), PathBuf::from);
    let bundled = git_bundled_candidates(&program_files, &program_files_x86);
    candidates_from_snapshot(&EnvSnapshot {
        git_bundled: first_existing(&bundled).or_else(|| where_first("bash")),
        wsl: where_first("wsl"),
        msys2: first_existing(&msys2_candidates()),
        manual: None,
    })
}

fn first_existing(paths: &[PathBuf]) -> Option<PathBuf> {
    paths.iter().find(|p| p.is_file()).cloned()
}

fn where_first(prog: &str) -> Option<PathBuf> {
    let out = std::process::Command::new("where").arg(prog).output().ok()?;
    if !out.status.success() {
        return None;
    }
    // 跳过宿主副本（见 first_system_candidate）：它不算系统安装的候选。
    super::first_system_candidate(&String::from_utf8_lossy(&out.stdout)).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::{BashKind, EnvSnapshot, candidates_from_snapshot, detect_hosted, host_bin_path};
    use std::path::{Path, PathBuf};

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "adl_env_bash_{tag}_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("temp root");
        dir
    }

    fn install_portable_git(root: &Path, version: &str, with_bash: bool) {
        let hv = adl_hosted::HostedVersions::open(
            root,
            crate::providers::git::HOSTED_NAME,
            crate::providers::git::MARKER_REL,
        );
        hv.mark_installed(version).expect("git marker");
        hv.write_selected(version).expect("select git");
        if with_bash {
            let bash = host_bin_path(root, version);
            std::fs::create_dir_all(bash.parent().expect("bash parent")).expect("bash dir");
            std::fs::write(&bash, b"x").expect("bash marker");
        }
    }

    #[test]
    fn hosted_bash_is_detected_from_portable_git() {
        let root = temp_root("hosted");
        install_portable_git(&root, "2.56.0", true);
        let candidate = detect_hosted(&root).expect("hosted bash");
        assert_eq!(candidate.kind, BashKind::Hosted);
        assert_eq!(candidate.path, host_bin_path(&root, "2.56.0").to_string_lossy());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn hosted_bash_is_absent_without_the_marker() {
        let root = temp_root("hosted-missing");
        install_portable_git(&root, "2.56.0", false);
        assert!(detect_hosted(&root).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn ranking_prefers_system_git_over_wsl_and_msys2() {
        let snap = EnvSnapshot {
            git_bundled: Some(PathBuf::from("C:/Program Files/Git/bin/bash.exe")),
            wsl: Some(PathBuf::from("C:/Windows/System32/wsl.exe")),
            msys2: Some(PathBuf::from("C:/msys64/usr/bin/bash.exe")),
            manual: None,
        };
        let kinds: Vec<BashKind> =
            candidates_from_snapshot(&snap).into_iter().map(|c| c.kind).collect();
        assert_eq!(kinds, vec![BashKind::GitBundled, BashKind::Wsl, BashKind::Msys2]);
    }

    #[test]
    fn manual_path_is_ranked_last() {
        let snap = EnvSnapshot {
            git_bundled: None,
            wsl: Some(PathBuf::from("C:/Windows/System32/wsl.exe")),
            msys2: None,
            manual: Some(PathBuf::from("D:/tools/bash.exe")),
        };
        let kinds: Vec<BashKind> =
            candidates_from_snapshot(&snap).into_iter().map(|c| c.kind).collect();
        assert_eq!(kinds, vec![BashKind::Wsl, BashKind::Manual]);
    }
}
