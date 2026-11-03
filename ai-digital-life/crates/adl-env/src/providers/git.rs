//! `git` provider: system detect + PortableGit hosted install.
//!
//! PortableGit only (`{base}/{tag}/{asset}` verbatim tag+asset), from the
//! official Git for Windows release or the npmmirror mirror of the same
//! asset. Unlike MinGit, PortableGit ships `bin/bash.exe`, so the same hosted
//! package backs both the Git and Bash rows. Downloads the 7-Zip SFX and
//! extracts it with [`super::fetch_and_stage_sfx`]
//! (`marker_rel = "cmd/git.exe"`).

use std::path::{Path, PathBuf};

use adl_download_source::DownloadSourceConfig;
use adl_errors::AppError;
use serde::{Deserialize, Serialize};

use adl_hosted::{HostedVersions, ProgressPhase, ProgressTask, swap_into_place};

use crate::UninstallOutcome;

/// `HostedVersions` name: the install dir is the version dir itself
/// (`<data_dir>/env-hosted/git/installed/<v>/cmd/git.exe`).
pub const HOSTED_NAME: &str = "env-hosted/git";
/// Marker inside each installed version dir (PortableGit ships files at the root).
pub const MARKER_REL: &str = "cmd/git.exe";
/// Marker for the bash that ships inside the same PortableGit version dir.
pub const BASH_MARKER_REL: &str = "bin/bash.exe";
/// Official PortableGit base (baseline default when no mirror is configured).
pub const OFFICIAL_GIT_BASE: &str = "https://github.com/git-for-windows/git/releases/download";
/// npmmirror Git for Windows mirror (same `{base}/{tag}/{asset}` layout).
pub const MIRROR_GIT_BASE: &str = "https://npmmirror.com/mirrors/git-for-windows";

/// System-side detection outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Detection {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

impl Detection {
    fn unavailable() -> Self {
        Self { available: false, version: None, path: None }
    }
}

/// Freshly hosted install outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Installed {
    pub version: String,
    pub path: String,
}

/// Inputs for [`install`]: `version` travels as its own arg (Task 8 shape
/// `install(version, registry_cfg, reporter)`); the data root, PortableGit base
/// and registry/proxy config ride together here for Task 11 callers.
/// `git_tag` / `git_asset` are passed through verbatim (Task 11 baseline
/// supplies both; no derivation from `version`).
#[derive(Debug, Clone, Copy)]
pub struct InstallConfig<'a> {
    pub data_dir: &'a Path,
    pub git_base: &'a str,
    pub git_tag: &'a str,
    pub git_asset: &'a str,
    pub download: &'a DownloadSourceConfig,
}

/// Official PortableGit URL: `{base}/{tag}/{asset}`, where `tag` includes the
/// leading `v` (e.g. `"v2.56.0.windows.4"`) and `asset` is the full file name
/// (e.g. `"PortableGit-2.56.0.4-64-bit.7z.exe"`).
/// Tag+asset are caller-supplied verbatim: the short semver does NOT
/// determine the asset name (`.windows.N` build-number handling is ambiguous:
/// N==1 omitted, N>1 appended).
pub fn portable_git_url(base: &str, tag: &str, asset: &str) -> String {
    format!("{base}/{tag}/{asset}")
}

fn push_unique(urls: &mut Vec<String>, url: String) {
    if !urls.contains(&url) {
        urls.push(url);
    }
}

/// Candidate URLs: configured/official first, then the npmmirror mirror. When
/// the user's npm registry is npmmirror, try the mirror first.
pub fn download_urls(base: &str, tag: &str, asset: &str, prefer_mirror: bool) -> Vec<String> {
    let primary = if base.is_empty() { OFFICIAL_GIT_BASE } else { base };
    let official = portable_git_url(OFFICIAL_GIT_BASE, tag, asset);
    let mirror = portable_git_url(MIRROR_GIT_BASE, tag, asset);
    let mut urls = Vec::new();
    if prefer_mirror {
        push_unique(&mut urls, mirror.clone());
    }
    push_unique(&mut urls, portable_git_url(primary, tag, asset));
    push_unique(&mut urls, mirror);
    push_unique(&mut urls, official);
    urls
}

/// Parse `git --version` output (`git version 2.47.1.windows.1` plus trailing
/// newline): strip the `git version ` prefix, take the first token, cut the
/// `.windows.N` suffix, then semver-check. `None` on any mismatch.
pub fn parse_version(out: &str) -> Option<String> {
    let token = out.strip_prefix("git version ")?.split_whitespace().next()?;
    let core = token.split(".windows.").next().unwrap_or(token);
    core.parse::<semver::Version>().ok()?;
    Some(core.to_string())
}

/// Detect the system git: `where git` → `git --version` → [`parse_version`].
/// Any step failing yields `unavailable` (no error thrown).
pub fn detect() -> Detection {
    let path = std::process::Command::new("where").arg("git").output().ok().and_then(|o| {
        if !o.status.success() {
            return None;
        }
        let line = String::from_utf8_lossy(&o.stdout).lines().next()?.trim().to_string();
        if line.is_empty() { None } else { Some(line) }
    });
    let Some(path) = path else {
        return Detection::unavailable();
    };
    let version = std::process::Command::new(&path).arg("--version").output().ok().and_then(|o| {
        if !o.status.success() {
            return None;
        }
        parse_version(&String::from_utf8_lossy(&o.stdout))
    });
    match version {
        Some(version) => Detection { available: true, version: Some(version), path: Some(path) },
        None => Detection::unavailable(),
    }
}

fn hosted(data_dir: &Path) -> HostedVersions {
    HostedVersions::open(data_dir, HOSTED_NAME, MARKER_REL)
}

/// Absolute path of the hosted `cmd/git.exe` for `version` (no existence
/// check; the offline-tested half of the hosted-git launch path).
pub fn host_bin_path(data_dir: &Path, version: &str) -> PathBuf {
    hosted(data_dir).installed_marker(version)
}

/// Absolute path of the hosted `bin/bash.exe` for `version` (no existence
/// check; PortableGit ships it next to `cmd/git.exe`).
pub fn host_bash_path(data_dir: &Path, version: &str) -> PathBuf {
    adl_hosted::HostedVersions::open(data_dir, HOSTED_NAME, BASH_MARKER_REL)
        .installed_marker(version)
}

/// Selected PortableGit version when that version actually contains
/// `bin/bash.exe`; `None` when Git is not installed or the asset lacks bash.
pub fn host_bash_version(data_dir: &Path) -> Option<String> {
    adl_hosted::HostedVersions::open(data_dir, HOSTED_NAME, BASH_MARKER_REL)
        .read_selected()
        .ok()
        .flatten()
}

/// Validate a fetched staging dir and adopt it: marker `cmd/git.exe` check →
/// [`swap_into_place`] → `write_selected`. Rejection removes the staging dir.
pub fn adopt_staging(
    staging: &Path,
    data_dir: &Path,
    version: &str,
) -> Result<Installed, AppError> {
    if version.parse::<semver::Version>().is_err() {
        let _ = std::fs::remove_dir_all(staging);
        return Err(AppError::InvalidInput(format!("bad git version {version}")));
    }
    if !staging.join(MARKER_REL).is_file() {
        let _ = std::fs::remove_dir_all(staging);
        return Err(AppError::InvalidInput(format!(
            "staging {} lacks {MARKER_REL}",
            staging.display()
        )));
    }
    let hv = hosted(data_dir);
    let target = hv.version_dir(version);
    swap_into_place(staging, &target)?;
    hv.write_selected(version)?;
    Ok(Installed { version: version.to_string(), path: target.to_string_lossy().into_owned() })
}

/// Remove the hosted copy of `version`. System installs are never touched.
/// Non-hosted version → [`AppError::InvalidInput`]. Removing the selected
/// version falls back to the highest remaining one, or clears the selection
/// when none remain.
pub fn uninstall(data_dir: &Path, version: &str) -> Result<UninstallOutcome, AppError> {
    if version.parse::<semver::Version>().is_err() {
        return Err(AppError::InvalidInput("invalid-version".into()));
    }
    let hv = hosted(data_dir);
    if !hv.is_installed(version) {
        return Err(AppError::InvalidInput("not-hosted".into()));
    }
    let was_selected = hv.read_selected()?.as_deref() == Some(version);
    let target = hv.version_dir(version);
    std::fs::remove_dir_all(&target)
        .map_err(|e| AppError::Io(format!("remove {}: {e}", target.display())))?;
    let selected = if was_selected {
        let next = hv.best_fallback();
        match &next {
            Some(v) => hv.write_selected(v)?,
            None => {
                let selected_file = hv.selected_file_path();
                match std::fs::remove_file(&selected_file) {
                    Ok(()) => {},
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
                    Err(e) => {
                        return Err(AppError::Io(format!(
                            "remove {}: {e}",
                            selected_file.display()
                        )));
                    },
                }
            },
        }
        next
    } else {
        hv.read_selected()?
    };
    Ok(UninstallOutcome { removed: version.to_string(), selected })
}

/// Download the PortableGit 7-Zip SFX (via the shared registry/proxy-aware
/// client), extract, and adopt. Failure records the error on `reporter` and
/// leaves the task open for progress polling; success finishes it.
pub async fn install(
    version: &str,
    cfg: &InstallConfig<'_>,
    reporter: &ProgressTask,
) -> Result<Installed, AppError> {
    if version.parse::<semver::Version>().is_err() {
        return Err(AppError::InvalidInput(format!("bad git version {version}")));
    }
    reporter.begin_with("env-git-install", &format!("git {version}"), false);
    let base = if cfg.git_base.is_empty() { OFFICIAL_GIT_BASE } else { cfg.git_base };
    // 大文件用 identity 编码 + 5 分钟超时；官方/镜像按候选顺序尝试。
    let client =
        adl_download_source::build_binary_http_client(cfg.download).await.inspect_err(|e| {
            reporter.set_error(&e.to_string());
        })?;
    let urls = download_urls(
        base,
        cfg.git_tag,
        cfg.git_asset,
        cfg.download.npm_registry.contains("npmmirror.com"),
    );
    let mut staging = None;
    let mut errors = Vec::new();
    for url in &urls {
        if reporter.is_cancelled() {
            let err = AppError::Cancelled("git install cancelled".to_string());
            reporter.set_error(&err.to_string());
            return Err(err);
        }
        reporter.update(ProgressPhase::Installing, Some(10), 0, 100, false);
        match super::fetch_and_stage_sfx(&client, url, MARKER_REL).await {
            Ok(staged) => {
                staging = Some(staged);
                break;
            },
            Err(e) => {
                tracing::warn!(url = %url, error = %e, "git: download source failed; trying next");
                errors.push(format!("{url}: {e}"));
            },
        }
    }
    let Some(staging) = staging else {
        let err =
            AppError::Network(format!("all git download sources failed: {}", errors.join(" | ")));
        reporter.set_error(&err.to_string());
        return Err(err);
    };
    if reporter.is_cancelled() {
        let _ = std::fs::remove_dir_all(&staging);
        let err = AppError::Cancelled("git install cancelled".to_string());
        reporter.set_error(&err.to_string());
        return Err(err);
    }
    reporter.update(ProgressPhase::Finalizing, Some(90), 90, 100, false);
    // rename/copy 是阻塞文件系统操作：搬到 blocking 池，别占运行时。
    let staging_for_adopt = staging.clone();
    let data_dir = cfg.data_dir.to_path_buf();
    let version_owned = version.to_string();
    let installed = match tokio::task::spawn_blocking(move || {
        adopt_staging(&staging_for_adopt, &data_dir, &version_owned)
    })
    .await
    {
        Ok(Ok(installed)) => installed,
        Ok(Err(e)) => {
            reporter.set_error(&e.to_string());
            return Err(e);
        },
        Err(e) => {
            let err = AppError::Io(format!("git adopt task failed: {e}"));
            reporter.set_error(&err.to_string());
            return Err(err);
        },
    };
    reporter.finish();
    Ok(installed)
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{
        HOSTED_NAME, MARKER_REL, MIRROR_GIT_BASE, OFFICIAL_GIT_BASE, adopt_staging, download_urls,
        uninstall,
    };

    #[test]
    fn download_urls_falls_back_to_the_mirror() {
        let urls = download_urls(
            OFFICIAL_GIT_BASE,
            "v2.56.0.windows.4",
            "PortableGit-2.56.0.4-64-bit.7z.exe",
            false,
        );
        assert_eq!(
            urls,
            vec![
                "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.4/PortableGit-2.56.0.4-64-bit.7z.exe".to_string(),
                "https://npmmirror.com/mirrors/git-for-windows/v2.56.0.windows.4/PortableGit-2.56.0.4-64-bit.7z.exe".to_string(),
            ]
        );
        assert_eq!(MIRROR_GIT_BASE, "https://npmmirror.com/mirrors/git-for-windows");
    }

    fn nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default()
    }

    fn make_staging(tmp: &Path, version: &str) -> PathBuf {
        let staging = tmp.join(format!("stage-{version}"));
        std::fs::create_dir_all(staging.join("cmd")).expect("mkdir staging");
        std::fs::write(staging.join(MARKER_REL), "").expect("write marker");
        staging
    }

    #[test]
    fn uninstall_selected_falls_back_to_highest_remaining() {
        let tmp = std::env::temp_dir().join(format!("adl_un_git_{}", nanos()));
        adopt_staging(&make_staging(&tmp, "2.47.1"), &tmp, "2.47.1").expect("stage 1");
        adopt_staging(&make_staging(&tmp, "2.56.0"), &tmp, "2.56.0").expect("stage 2");
        let hv = adl_hosted::HostedVersions::open(&tmp, HOSTED_NAME, MARKER_REL);
        hv.write_selected("2.56.0").expect("select");
        let out = uninstall(&tmp, "2.56.0").expect("uninstall");
        assert_eq!(out.removed, "2.56.0");
        assert_eq!(out.selected.as_deref(), Some("2.47.1"));
        assert!(!hv.is_installed("2.56.0"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn uninstall_last_version_clears_selection() {
        let tmp = std::env::temp_dir().join(format!("adl_un_git3_{}", nanos()));
        adopt_staging(&make_staging(&tmp, "2.47.1"), &tmp, "2.47.1").expect("stage");
        let hv = adl_hosted::HostedVersions::open(&tmp, HOSTED_NAME, MARKER_REL);
        hv.write_selected("2.47.1").expect("select");
        let out = uninstall(&tmp, "2.47.1").expect("uninstall");
        assert_eq!(out.removed, "2.47.1");
        assert_eq!(out.selected, None);
        assert!(!hv.selected_file_path().exists(), "selection must be cleared");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn uninstall_rejects_non_hosted_version() {
        let tmp = std::env::temp_dir().join(format!("adl_un_git2_{}", nanos()));
        let err = uninstall(&tmp, "2.47.1").expect_err("not hosted");
        assert!(matches!(err, adl_errors::AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn uninstall_rejects_invalid_version_and_leaves_disk_untouched() {
        let tmp = std::env::temp_dir().join(format!("adl_un_git_bad_{}", nanos()));
        adopt_staging(&make_staging(&tmp, "2.47.1"), &tmp, "2.47.1").expect("stage");
        let hv = adl_hosted::HostedVersions::open(&tmp, HOSTED_NAME, MARKER_REL);
        for bad in ["../evil", "./2.47.1"] {
            let err = uninstall(&tmp, bad).expect_err("invalid version");
            assert!(
                matches!(err, adl_errors::AppError::InvalidInput(ref m) if m == "invalid-version"),
                "unexpected error: {err}"
            );
            assert!(hv.is_installed("2.47.1"), "disk must be untouched for {bad}");
        }
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
