//! Hosted-install providers for environment dependencies (Task 8).
//!
//! `pub mod node;` ships now; Task 9 appends `git`/`bash`, Task 10 appends
//! `webview2`/`adlserver`/`netprobe` declarations here.

pub mod node;

use std::path::{Path, PathBuf};

use adl_errors::AppError;

/// Download a zip from `url` with the caller-supplied registry/proxy-aware
/// client (built via `adl_download_source::build_http_client` — never build a
/// second client here), extract it into a fresh staging dir, unwrap a single
/// top-level folder when the marker is not at the root (node dist ships
/// `node-v<V>-win-x64/`; MinGit ships files at the root — both converge to
/// `marker_rel` at the staging root), validate `marker_rel`, and return the
/// staging dir for the caller to [`adl_hosted::swap_into_place`].
///
/// Marker missing (or bad zip / HTTP error) → staging is removed and `Err`.
/// Task 9 reuses this for MinGit (`marker_rel = "cmd/git.exe"`).
///
/// Note: blocking fs/zip work runs inline in this `async` fn — same accepted
/// trade-off as the dsh install path (sync `swap_into_place` in async ctx).
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

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| {
        abort(&staging, AppError::InvalidInput(format!("open zip from {url}: {e}")))
    })?;
    // `extract` rejects absolute / `..` entries via `enclosed_name` (zip 2.x).
    archive.extract(&staging).map_err(|e| {
        abort(&staging, AppError::InvalidInput(format!("extract zip from {url}: {e}")))
    })?;
    unwrap_single_top_dir(&staging, marker_rel);

    if !staging.join(marker_rel).is_file() {
        return Err(abort(
            &staging,
            AppError::InvalidInput(format!("marker {marker_rel} missing after extracting {url}")),
        ));
    }
    Ok(staging)
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
