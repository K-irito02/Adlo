//! Hosted-install providers for environment dependencies.
//!
//! `node`/`git`/`bash` are hosted-install providers; `webview2`/`adlserver`
//! are detect-only (registry / bundled binary) and `netprobe` is a
//! registry-reachability probe.

pub mod adlserver;
pub mod bash;
pub mod git;
pub mod netprobe;
pub mod node;
pub mod webview2;

use std::path::{Path, PathBuf};

use adl_errors::AppError;

/// Download a zip from `url` with the caller-supplied registry/proxy-aware
/// client (built via `adl_download_source::build_http_client` — never build a
/// second client here), extract it into a fresh staging dir, unwrap a single
/// top-level folder when the marker is not at the root (node dist ships
/// `node-v<V>-win-x64/`; PortableGit ships files at the root — both converge to
/// `marker_rel` at the staging root), validate `marker_rel`, and return the
/// staging dir for the caller to [`adl_hosted::swap_into_place`].
///
/// Marker missing (or bad zip / HTTP error) → staging is removed and `Err`.
/// Git uses the SFX path ([`fetch_and_stage_sfx`]) because PortableGit ships
/// as a 7-Zip self-extracting archive.
///
/// Zip extraction runs on `spawn_blocking` so a large archive never stalls the
/// async runtime (JoinError propagates as `AppError::Io`).
pub async fn fetch_and_stage(
    client: &reqwest::Client,
    url: &str,
    marker_rel: &str,
) -> Result<PathBuf, AppError> {
    let staging = std::env::temp_dir().join(format!("adl-env-staging-{}", nonce()));
    std::fs::create_dir_all(&staging)
        .map_err(|e| AppError::Io(format!("create {}: {e}", staging.display())))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("download {url}: {e}"))))?;
    if !resp.status().is_success() {
        return Err(abort(
            &staging,
            AppError::Network(format!("download {url}: HTTP {}", resp.status())),
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("read {url}: {e}"))))?;

    // zip 解压是阻塞 CPU+IO（几十 MB 归档可达数秒）：搬到 blocking 池。
    let staging_for_zip = staging.clone();
    let marker_owned = marker_rel.to_string();
    let url_owned = url.to_string();
    let extracted = tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| AppError::InvalidInput(format!("open zip from {url_owned}: {e}")))?;
        // `extract` rejects absolute / `..` entries via `enclosed_name` (zip 2.x).
        archive
            .extract(&staging_for_zip)
            .map_err(|e| AppError::InvalidInput(format!("extract zip from {url_owned}: {e}")))?;
        unwrap_single_top_dir(&staging_for_zip, &marker_owned);
        Ok(())
    })
    .await;
    match extracted {
        Ok(Ok(())) => {},
        Ok(Err(e)) => return Err(abort(&staging, e)),
        Err(e) => {
            return Err(abort(&staging, AppError::Io(format!("zip extract task failed: {e}"))));
        },
    }

    if !staging.join(marker_rel).is_file() {
        return Err(abort(
            &staging,
            AppError::InvalidInput(format!("marker {marker_rel} missing after extracting {url}")),
        ));
    }
    Ok(staging)
}

/// Download a 7-Zip self-extracting archive (Git for Windows PortableGit
/// `PortableGit-*.7z.exe`), run its silent extract switches into a fresh
/// staging dir, validate `marker_rel`, and return the staging dir.
///
/// The archive is a PE executable: the caller must only pass a trusted URL
/// (the bundled baseline pins the official Git for Windows release). The
/// extractor runs on `spawn_blocking` and is hidden on Windows.
pub async fn fetch_and_stage_sfx(
    client: &reqwest::Client,
    url: &str,
    marker_rel: &str,
) -> Result<PathBuf, AppError> {
    let staging = std::env::temp_dir().join(format!("adl-env-staging-{}", nonce()));
    std::fs::create_dir_all(&staging)
        .map_err(|e| AppError::Io(format!("create {}: {e}", staging.display())))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("download {url}: {e}"))))?;
    if !resp.status().is_success() {
        return Err(abort(
            &staging,
            AppError::Network(format!("download {url}: HTTP {}", resp.status())),
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("read {url}: {e}"))))?;

    // 7z SFX 必须落成文件才能执行；放在 staging 旁边，避免污染最终目录。
    let archive = std::env::temp_dir().join(format!("adl-env-sfx-{}.7z.exe", nonce()));
    std::fs::write(&archive, &bytes)
        .map_err(|e| abort(&staging, AppError::Io(format!("write {}: {e}", archive.display()))))?;

    let staging_for_run = staging.clone();
    let archive_for_run = archive.clone();
    let marker_owned = marker_rel.to_string();
    let url_owned = url.to_string();
    let extracted = tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        let output = sfx_command(&archive_for_run, &staging_for_run)
            .output()
            .map_err(|e| AppError::Io(format!("run 7z sfx from {url_owned}: {e}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::InvalidInput(format!(
                "7z sfx from {url_owned} exited with {}: {}",
                output.status,
                stderr.trim()
            )));
        }
        unwrap_single_top_dir(&staging_for_run, &marker_owned);
        Ok(())
    })
    .await;
    let _ = std::fs::remove_file(&archive);
    match extracted {
        Ok(Ok(())) => {},
        Ok(Err(e)) => return Err(abort(&staging, e)),
        Err(e) => {
            return Err(abort(&staging, AppError::Io(format!("7z sfx extract task failed: {e}"))));
        },
    }

    if !staging.join(marker_rel).is_file() {
        return Err(abort(
            &staging,
            AppError::InvalidInput(format!("marker {marker_rel} missing after extracting {url}")),
        ));
    }
    Ok(staging)
}

/// Build the silent 7-Zip SFX extraction command (`-y -o<dir>`), suppressing the
/// console window on Windows.
fn sfx_command(archive: &Path, staging: &Path) -> std::process::Command {
    let mut cmd = std::process::Command::new(archive);
    cmd.arg("-y").arg(format!("-o{}", staging.display()));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// If `marker_rel` is not at the `staging` root but lives one level down
/// under a single top-level directory (node portable-zip layout), hoist its
/// children to the root. Best-effort and infallible: the marker check after
/// extraction decides accept/reject.
fn unwrap_single_top_dir(staging: &Path, marker_rel: &str) {
    if staging.join(marker_rel).exists() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(staging) else {
        return;
    };
    let tops: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    if tops.len() != 1 || !tops[0].is_dir() || !tops[0].join(marker_rel).exists() {
        return;
    }
    let top = &tops[0];
    let Ok(children) = std::fs::read_dir(top) else {
        return;
    };
    let mut moved = true;
    for child in children.flatten() {
        if std::fs::rename(child.path(), staging.join(child.file_name())).is_err() {
            moved = false;
            break;
        }
    }
    if moved {
        let _ = std::fs::remove_dir(top);
    }
}

/// Best-effort staging cleanup; returns `err` so call sites read as one line.
fn abort(staging: &Path, err: AppError) -> AppError {
    let _ = std::fs::remove_dir_all(staging);
    err
}

fn nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{git, webview2};

    #[test]
    fn parses_reg_query_pv_line() {
        let out = "    pv    REG_SZ    140.0.3485.94";
        assert_eq!(webview2::parse_pv(out), Some("140.0.3485.94".into()));
        assert_eq!(webview2::parse_pv(""), None);
    }

    #[test]
    fn picks_highest_of_hklm_hkcu() {
        assert_eq!(
            webview2::pick_highest(Some("139.0.0.0"), Some("140.0.0.0")),
            Some("140.0.0.0".into())
        );
    }

    #[test]
    fn webview2_queries_documented_clients_keys() {
        assert_eq!(
            webview2::hklm_machine_keys(),
            [
                r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            ]
        );
        assert_eq!(
            webview2::hkcu_key(),
            r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        );
    }

    #[test]
    fn picks_highest_across_three_hives() {
        let machine_best = webview2::pick_highest(Some("139.0.0.0"), Some("155.0.4283.62"));
        assert_eq!(
            webview2::pick_highest(machine_best.as_deref(), Some("140.0.0.0")),
            Some("155.0.4283.62".into())
        );
    }

    #[test]
    fn git_portable_url_uses_verbatim_tag_and_asset() {
        assert_eq!(
            git::portable_git_url(
                git::OFFICIAL_GIT_BASE,
                "v2.56.0.windows.4",
                "PortableGit-2.56.0.4-64-bit.7z.exe"
            ),
            "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.4/PortableGit-2.56.0.4-64-bit.7z.exe"
        );
    }

    #[test]
    fn sfx_command_uses_silent_output_switch() {
        let cmd = super::sfx_command(
            std::path::Path::new("PortableGit.7z.exe"),
            std::path::Path::new("C:/tmp/stage"),
        );
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args, vec!["-y".to_string(), "-oC:/tmp/stage".to_string()]);
    }

    #[test]
    fn git_version_parses() {
        assert_eq!(git::parse_version("git version 2.47.1.windows.1"), Some("2.47.1".into()));
        assert_eq!(git::parse_version("not git"), None);
    }
}
