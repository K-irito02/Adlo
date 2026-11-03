//! `node` provider: system detect + portable-zip hosted install (Task 8).
//!
//! Official dist only (`https://nodejs.org/dist`, or a baseline mirror base
//! with the identical `{base}/v{V}/node-v{V}-win-x64.zip` layout) —
//! no third-party binaries.

use std::path::{Path, PathBuf};
use std::time::Duration;

use adl_download_source::DownloadSourceConfig;
use adl_errors::AppError;
use serde::{Deserialize, Serialize};

use adl_hosted::{HostedVersions, ProgressPhase, ProgressTask, swap_into_place};

use crate::UninstallOutcome;

/// `HostedVersions` name: the install dir is the version dir itself
/// (`<data_dir>/env-hosted/node/installed/<v>/node.exe`).
pub const HOSTED_NAME: &str = "env-hosted/node";
/// Marker inside each installed version dir.
pub const MARKER_REL: &str = "node.exe";
/// Official distribution base (baseline default when no mirror is configured).
pub const OFFICIAL_DIST_BASE: &str = "https://nodejs.org/dist";
/// npmmirror Node mirror (same `{base}/v{V}/node-v{V}-win-x64.zip` layout).
pub const MIRROR_DIST_BASE: &str = "https://npmmirror.com/mirrors/node";

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

/// Inputs for [`install`]: `version` travels as its own arg (brief shape
/// `install(version, registry_cfg, reporter)`); the data root, dist base and
/// registry/proxy config ride together here for Task 11 callers.
#[derive(Debug, Clone, Copy)]
pub struct InstallConfig<'a> {
    pub data_dir: &'a Path,
    pub dist_base: &'a str,
    pub download: &'a DownloadSourceConfig,
    /// Pinned baseline hash. When present it is the authoritative checksum for
    /// the bundled version (no manifest can override it); `None` means the
    /// caller must fetch `SHASUMS256.txt`.
    pub sha256: Option<&'a str>,
}

/// Official portable-zip URL: `{base}/v{version}/node-v{version}-win-x64.zip`.
pub fn node_dist_url(base: &str, version: &str) -> String {
    format!("{base}/v{version}/node-v{version}-win-x64.zip")
}

/// Candidate URLs: configured/official first, then the npmmirror mirror. When
/// the user's npm registry is npmmirror, try the mirror first (their network
/// already prefers it).
pub fn download_urls(base: &str, version: &str, prefer_mirror: bool) -> Vec<String> {
    let primary = if base.is_empty() { OFFICIAL_DIST_BASE } else { base };
    super::candidate_urls(
        node_dist_url(primary, version),
        node_dist_url(MIRROR_DIST_BASE, version),
        node_dist_url(OFFICIAL_DIST_BASE, version),
        prefer_mirror,
    )
}

/// `…/v24.22.1/node-v24.22.1-win-x64.zip` → `…/v24.22.1/SHASUMS256.txt`.
fn checksum_url(url: &str) -> Option<String> {
    let (dir, file) = url.rsplit_once('/')?;
    if dir.is_empty() || file.is_empty() {
        return None;
    }
    Some(format!("{dir}/SHASUMS256.txt"))
}

/// Last path segment (`node-v24.22.1-win-x64.zip`).
fn asset_name(url: &str) -> &str {
    url.rsplit('/').next().filter(|name| !name.is_empty()).unwrap_or(url)
}

/// Pinned baseline hash wins over any fetched manifest (authoritative anchor).
fn pick_checksum(pin: Option<&str>, manifest: Option<String>) -> Option<String> {
    pin.map(str::to_string).or(manifest)
}

/// Checksum manifest candidates: official first (authoritative), then the
/// payload's own origin (best effort when the official host is unreachable).
fn manifest_urls(official_base: &str, url: &str, version: &str) -> Vec<String> {
    let official = format!("{official_base}/v{version}/SHASUMS256.txt");
    match checksum_url(url) {
        Some(same_origin) if same_origin != official => vec![official, same_origin],
        _ => vec![official],
    }
}

/// Parse `node --version` output (`v22.14.0` plus trailing newline);
/// `None` when it is not a clean semver after the `v` strip.
pub fn parse_version(out: &str) -> Option<String> {
    let trimmed = out.trim();
    let v = trimmed.strip_prefix('v').unwrap_or(trimmed);
    v.parse::<semver::Version>().ok()?;
    Some(v.to_string())
}

/// Detect the system node: `where node` → `node --version` → strip `v` →
/// semver check. Any step failing yields `unavailable` (no error thrown).
pub fn detect() -> Detection {
    let path = std::process::Command::new("where").arg("node").output().ok().and_then(|o| {
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

/// Absolute path of the hosted `node.exe` for `version` (no existence check).
pub fn host_bin_path(data_dir: &Path, version: &str) -> PathBuf {
    hosted(data_dir).installed_marker(version)
}

/// Validate a fetched staging dir and adopt it: marker `node.exe` check →
/// [`swap_into_place`] → `write_selected`. Rejection removes the staging dir.
pub fn adopt_staging(
    staging: &Path,
    data_dir: &Path,
    version: &str,
) -> Result<Installed, AppError> {
    if version.parse::<semver::Version>().is_err() {
        let _ = std::fs::remove_dir_all(staging);
        return Err(AppError::InvalidInput(format!("bad node version {version}")));
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

/// Download the portable zip (via the shared registry/proxy-aware client),
/// extract, and adopt. Failure records the error on `reporter` and leaves the
/// task open for progress polling; success finishes it.
pub async fn install(
    version: &str,
    cfg: &InstallConfig<'_>,
    reporter: &ProgressTask,
) -> Result<Installed, AppError> {
    if version.parse::<semver::Version>().is_err() {
        return Err(AppError::InvalidInput(format!("bad node version {version}")));
    }
    reporter.begin_with("env-node-install", &format!("node {version}"), false);
    let base = if cfg.dist_base.is_empty() { OFFICIAL_DIST_BASE } else { cfg.dist_base };
    // 大文件用 identity 编码 + 5 分钟超时；官方/镜像按候选顺序尝试。
    let client =
        adl_download_source::build_binary_http_client(cfg.download).await.inspect_err(|e| {
            reporter.set_error(&e.to_string());
        })?;
    // 清单是小文本：用 15s 短超时客户端，避免沿用 300s 的二进制超时。
    let manifest_client = if cfg.sha256.is_some() {
        None
    } else {
        Some(
            adl_download_source::build_http_client_with_timeout(
                cfg.download,
                Duration::from_secs(15),
            )
            .await
            .inspect_err(|e| {
                reporter.set_error(&e.to_string());
            })?,
        )
    };
    let urls = download_urls(base, version, cfg.download.npm_registry.contains("npmmirror.com"));
    let mut staging = None;
    let mut errors = Vec::new();
    for url in &urls {
        if reporter.is_cancelled() {
            let err = AppError::Cancelled("node install cancelled".to_string());
            reporter.set_error(&err.to_string());
            return Err(err);
        }
        reporter.update(ProgressPhase::Installing, Some(10), 0, 100, false);
        // 钉死版本用 baseline 哈希作为权威锚点（镜像清单不可信）；其余版本
        // 先取官方 SHASUMS256.txt，官方不可达才退同源清单。两条路径都必须
        // 有哈希，绝不无校验解压。
        let manifest = match manifest_client.as_ref() {
            None => None,
            Some(manifest_client) => {
                let asset = asset_name(url);
                let mut found = None;
                let mut last_error = None;
                for manifest_url in manifest_urls(OFFICIAL_DIST_BASE, url, version) {
                    match super::fetch_sha256_manifest(manifest_client, &manifest_url, asset).await
                    {
                        Ok(hash) => {
                            found = Some(hash);
                            break;
                        },
                        Err(e) => {
                            tracing::warn!(url = %manifest_url, error = %e, "node: checksum manifest unavailable");
                            last_error = Some(e);
                        },
                    }
                }
                match (found, last_error) {
                    (Some(hash), _) => Some(hash),
                    (None, Some(e)) => {
                        errors.push(e.to_string());
                        continue;
                    },
                    (None, None) => {
                        errors.push(format!("{url}: no checksum URL"));
                        continue;
                    },
                }
            },
        };
        let Some(expected) = pick_checksum(cfg.sha256, manifest) else {
            errors.push(format!("{url}: no checksum available"));
            continue;
        };
        match super::fetch_and_stage(&client, url, MARKER_REL, &expected).await {
            Ok(staged) => {
                staging = Some(staged);
                break;
            },
            Err(e) => {
                tracing::warn!(url = %url, error = %e, "node: download source failed; trying next");
                errors.push(format!("{url}: {e}"));
            },
        }
    }
    let Some(staging) = staging else {
        let detail = format!("all node download sources failed: {}", errors.join(" | "));
        // 完整性失败不是网络问题：单独归类，避免前端把用户引向代理/换源。
        let err = if errors.iter().any(|e| e.contains("checksum mismatch")) {
            AppError::InvalidInput(detail)
        } else {
            AppError::Network(detail)
        };
        reporter.set_error(&err.to_string());
        return Err(err);
    };
    if reporter.is_cancelled() {
        let _ = std::fs::remove_dir_all(&staging);
        let err = AppError::Cancelled("node install cancelled".to_string());
        reporter.set_error(&err.to_string());
        return Err(err);
    }
    reporter.update(ProgressPhase::Finalizing, Some(90), 90, 100, false);
    // rename/copy 是阻塞文件系统操作（大树跨卷复制可达数秒）：不得占运行时。
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
            let err = AppError::Io(format!("node adopt task failed: {e}"));
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
        HOSTED_NAME, MARKER_REL, MIRROR_DIST_BASE, OFFICIAL_DIST_BASE, adopt_staging, asset_name,
        checksum_url, download_urls, host_bin_path, manifest_urls, node_dist_url, pick_checksum,
        uninstall,
    };

    #[test]
    fn manifest_urls_try_official_before_the_payload_origin() {
        assert_eq!(
            manifest_urls(
                OFFICIAL_DIST_BASE,
                "https://npmmirror.com/mirrors/node/v26.13.0/node-v26.13.0-win-x64.zip",
                "26.13.0"
            ),
            vec![
                "https://nodejs.org/dist/v26.13.0/SHASUMS256.txt".to_string(),
                "https://npmmirror.com/mirrors/node/v26.13.0/SHASUMS256.txt".to_string(),
            ]
        );
        assert_eq!(
            manifest_urls(
                OFFICIAL_DIST_BASE,
                "https://nodejs.org/dist/v26.13.0/node-v26.13.0-win-x64.zip",
                "26.13.0"
            ),
            vec!["https://nodejs.org/dist/v26.13.0/SHASUMS256.txt".to_string()]
        );
    }

    #[test]
    fn pinned_checksum_wins_over_a_fetched_manifest() {
        assert_eq!(
            pick_checksum(Some("pin"), Some("manifest".to_string())).as_deref(),
            Some("pin")
        );
        assert_eq!(pick_checksum(None, Some("manifest".to_string())).as_deref(), Some("manifest"));
        assert_eq!(pick_checksum(None, None), None);
    }

    #[test]
    fn checksum_url_sits_next_to_the_zip() {
        assert_eq!(
            checksum_url("https://npmmirror.com/mirrors/node/v24.22.1/node-v24.22.1-win-x64.zip")
                .as_deref(),
            Some("https://npmmirror.com/mirrors/node/v24.22.1/SHASUMS256.txt")
        );
        assert_eq!(
            asset_name("https://npmmirror.com/mirrors/node/v24.22.1/node-v24.22.1-win-x64.zip"),
            "node-v24.22.1-win-x64.zip"
        );
    }

    #[test]
    fn download_urls_falls_back_to_the_mirror() {
        let urls = download_urls(OFFICIAL_DIST_BASE, "26.13.0", false);
        assert_eq!(
            urls,
            vec![
                "https://nodejs.org/dist/v26.13.0/node-v26.13.0-win-x64.zip".to_string(),
                "https://npmmirror.com/mirrors/node/v26.13.0/node-v26.13.0-win-x64.zip".to_string(),
            ]
        );
    }

    #[test]
    fn download_urls_with_empty_base_prefers_official() {
        assert_eq!(
            download_urls("", "26.13.0", false),
            vec![
                "https://nodejs.org/dist/v26.13.0/node-v26.13.0-win-x64.zip".to_string(),
                "https://npmmirror.com/mirrors/node/v26.13.0/node-v26.13.0-win-x64.zip".to_string(),
            ]
        );
    }

    #[test]
    fn download_urls_prefers_the_mirror_for_npmmirror_users() {
        let urls = download_urls(OFFICIAL_DIST_BASE, "26.13.0", true);
        assert_eq!(
            urls[0],
            "https://npmmirror.com/mirrors/node/v26.13.0/node-v26.13.0-win-x64.zip"
        );
        assert!(
            urls.contains(
                &"https://nodejs.org/dist/v26.13.0/node-v26.13.0-win-x64.zip".to_string()
            )
        );
        assert_eq!(MIRROR_DIST_BASE, "https://npmmirror.com/mirrors/node");
    }

    fn nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default()
    }

    fn make_staging(tmp: &Path, version: &str) -> PathBuf {
        let staging = tmp.join(format!("stage-{version}"));
        std::fs::create_dir_all(&staging).expect("mkdir staging");
        std::fs::write(staging.join(MARKER_REL), "").expect("write marker");
        staging
    }

    #[test]
    fn uninstall_selected_falls_back_to_highest_remaining() {
        let tmp = std::env::temp_dir().join(format!("adl_un_{}", nanos()));
        adopt_staging(&make_staging(&tmp, "22.14.0"), &tmp, "22.14.0").expect("stage 1");
        adopt_staging(&make_staging(&tmp, "24.22.1"), &tmp, "24.22.1").expect("stage 2");
        let hv = adl_hosted::HostedVersions::open(&tmp, HOSTED_NAME, MARKER_REL);
        hv.write_selected("24.22.1").expect("select");
        let out = uninstall(&tmp, "24.22.1").expect("uninstall");
        assert_eq!(out.removed, "24.22.1");
        assert_eq!(out.selected.as_deref(), Some("22.14.0"));
        assert!(!hv.is_installed("24.22.1"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn uninstall_last_version_clears_selection() {
        let tmp = std::env::temp_dir().join(format!("adl_un3_{}", nanos()));
        adopt_staging(&make_staging(&tmp, "22.14.0"), &tmp, "22.14.0").expect("stage");
        let hv = adl_hosted::HostedVersions::open(&tmp, HOSTED_NAME, MARKER_REL);
        hv.write_selected("22.14.0").expect("select");
        let out = uninstall(&tmp, "22.14.0").expect("uninstall");
        assert_eq!(out.removed, "22.14.0");
        assert_eq!(out.selected, None);
        assert!(!hv.selected_file_path().exists(), "selection must be cleared");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn uninstall_rejects_non_hosted_version() {
        let tmp = std::env::temp_dir().join(format!("adl_un2_{}", nanos()));
        let err = uninstall(&tmp, "22.14.0").expect_err("not hosted");
        assert!(matches!(err, adl_errors::AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn uninstall_rejects_invalid_version_and_leaves_disk_untouched() {
        let tmp = std::env::temp_dir().join(format!("adl_un_bad_{}", nanos()));
        adopt_staging(&make_staging(&tmp, "22.14.0"), &tmp, "22.14.0").expect("stage");
        let hv = adl_hosted::HostedVersions::open(&tmp, HOSTED_NAME, MARKER_REL);
        for bad in ["../evil", "./22.14.0"] {
            let err = uninstall(&tmp, bad).expect_err("invalid version");
            assert!(
                matches!(err, adl_errors::AppError::InvalidInput(ref m) if m == "invalid-version"),
                "unexpected error: {err}"
            );
            assert!(hv.is_installed("22.14.0"), "disk must be untouched for {bad}");
        }
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn node_dist_url_points_at_official() {
        assert_eq!(
            node_dist_url("https://nodejs.org/dist", "22.14.0"),
            "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip"
        );
    }

    #[test]
    fn adopt_staging_validates_node_exe_marker() {
        // staging 缺 node.exe → adopt 拒绝并清理 staging
        let tmp = std::env::temp_dir().join(format!("adl_env_node_{}", nanos()));
        let staging = tmp.join("staging");
        let data_dir = tmp.join("data");
        std::fs::create_dir_all(&staging).expect("mkdir staging");
        std::fs::write(staging.join("other.txt"), "decoy").expect("write decoy");
        let err = adopt_staging(&staging, &data_dir, "22.14.0").expect_err("adopt must reject");
        assert!(err.to_string().contains("node.exe"), "unexpected error: {err}");
        assert!(!staging.exists(), "staging must be removed on rejection");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn host_bin_path_lands_under_version_dir() {
        let p = host_bin_path(Path::new("D:/d"), "22.14.0");
        assert_eq!(p, PathBuf::from("D:/d/env-hosted/node/installed/22.14.0/node.exe"));
    }
}
