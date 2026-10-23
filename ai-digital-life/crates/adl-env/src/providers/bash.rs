//! `bash` provider: system-side detection (Task 9).
//!
//! The hosted Git asset is **MinGit**, which does not ship `bash.exe`, so
//! there is no hosted bash source. Candidates come from the full system Git
//! for Windows install, WSL, MSYS2, or an explicit manual path.
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
    GitBundled,
    Wsl,
    Msys2,
    /// Caller-supplied (Task 11 set-custom-path), not produced by `detect()`.
    Manual,
}

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
    let line = String::from_utf8_lossy(&out.stdout).lines().next()?.trim().to_string();
    if line.is_empty() { None } else { Some(PathBuf::from(line)) }
}

#[cfg(test)]
mod tests {
    use super::{BashKind, EnvSnapshot, candidates_from_snapshot};
    use std::path::PathBuf;

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
