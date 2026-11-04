//! Runtime resolution of the latest stable Node.js / Git for Windows versions.
//!
//! The bundled `env-baseline.json` remains the offline fallback: the server
//! tries these resolvers first and falls back to the pinned values on any
//! network/parse error. Node uses the latest LTS (the "stable" channel in the
//! baseline); Git uses the latest official PortableGit x64 asset.

use adl_errors::AppError;
use serde_json::Value;

/// Official Node distribution base used when the baseline does not pin one.
pub const OFFICIAL_NODE_DIST_BASE: &str = "https://nodejs.org/dist";
/// GitHub API endpoint for the latest Git for Windows release.
pub const GIT_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/git-for-windows/git/releases/latest";
/// Git for Windows release download base.
pub const GIT_RELEASE_BASE: &str = "https://github.com/git-for-windows/git/releases/download";

/// Latest official PortableGit asset metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitPortableLatest {
    /// Short semver used as the hosted version directory (`2.56.0`).
    pub version: String,
    /// Verbatim release tag (`v2.56.0.windows.4`).
    pub tag: String,
    /// Verbatim asset name (`PortableGit-2.56.0.4-64-bit.7z.exe`).
    pub asset: String,
    /// Download base (official GitHub release base).
    pub base: String,
    /// Asset digest from the GitHub release API (`sha256:<hex>` → `<hex>`).
    pub sha256: Option<String>,
}

/// Fetch `{dist_base}/index.json` and return the latest LTS version without
/// the leading `v`. Falls back to the latest release when no LTS exists.
pub async fn resolve_node_stable(
    client: &reqwest::Client,
    dist_base: &str,
) -> Result<String, AppError> {
    let base = if dist_base.is_empty() { OFFICIAL_NODE_DIST_BASE } else { dist_base };
    let url = format!("{}/index.json", base.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("fetch {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("fetch {url}: HTTP {}", resp.status())));
    }
    let body = resp.text().await.map_err(|e| AppError::Network(format!("read {url}: {e}")))?;
    parse_node_index(&body)
        .ok_or_else(|| AppError::InvalidInput(format!("no stable Node release in {url}")))
}

/// Pure parser for Node's `dist/index.json`: prefer the highest LTS semver,
/// otherwise the highest release semver.
pub fn parse_node_index(body: &str) -> Option<String> {
    let releases: Vec<Value> = serde_json::from_str(body).ok()?;
    let mut best_lts: Option<semver::Version> = None;
    let mut best_any: Option<semver::Version> = None;
    for release in releases {
        let Some(raw) = release.get("version").and_then(Value::as_str) else {
            continue;
        };
        let Ok(version) = raw.trim_start_matches('v').parse::<semver::Version>() else {
            continue;
        };
        if best_any.as_ref().is_none_or(|best| version > *best) {
            best_any = Some(version.clone());
        }
        let is_lts = release.get("lts").is_some_and(|value| value != &Value::Bool(false));
        if is_lts && best_lts.as_ref().is_none_or(|best| version > *best) {
            best_lts = Some(version);
        }
    }
    best_lts.or(best_any).map(|version| version.to_string())
}

/// Fetch the latest Git for Windows release and pick its x64 PortableGit asset.
pub async fn resolve_git_portable(client: &reqwest::Client) -> Result<GitPortableLatest, AppError> {
    let resp = client
        .get(GIT_LATEST_RELEASE_API)
        .header("User-Agent", "adlo")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| AppError::Network(format!("fetch git latest release: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("fetch git latest release: HTTP {}", resp.status())));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| AppError::Network(format!("read git latest release: {e}")))?;
    parse_git_release(&body)
        .ok_or_else(|| AppError::InvalidInput("no x64 PortableGit asset in latest release".into()))
}

/// Pure parser for the GitHub release JSON: `tag_name` → short semver, and the
/// first `PortableGit-*-64-bit.7z.exe` asset (arm64/MinGit are ignored).
pub fn parse_git_release(body: &str) -> Option<GitPortableLatest> {
    let value: Value = serde_json::from_str(body).ok()?;
    let tag = value.get("tag_name").and_then(Value::as_str)?.to_string();
    let version = parse_git_version(&tag)?;
    let asset = value.get("assets").and_then(Value::as_array)?.iter().find(|asset| {
        asset.get("name").and_then(Value::as_str).is_some_and(|name| {
            name.starts_with("PortableGit-") && name.ends_with("-64-bit.7z.exe")
        })
    })?;
    let asset_name = asset.get("name").and_then(Value::as_str)?.to_string();
    // GitHub returns `"digest": "sha256:<hex>"`; keep only the hex part.
    let sha256 = asset
        .get("digest")
        .and_then(Value::as_str)
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|digest| crate::providers::is_sha256_hex(digest))
        .map(str::to_string);
    Some(GitPortableLatest {
        version,
        tag,
        asset: asset_name,
        base: GIT_RELEASE_BASE.to_string(),
        sha256,
    })
}

/// `v2.56.0.windows.4` → `2.56.0` (the hosted version dir must be semver).
fn parse_git_version(tag: &str) -> Option<String> {
    let core = tag.strip_prefix('v')?.split(".windows.").next()?;
    core.parse::<semver::Version>().ok()?;
    Some(core.to_string())
}

#[cfg(test)]
mod tests {
    use super::{parse_git_release, parse_node_index};

    const NODE_INDEX: &str = r#"[
        { "version": "v22.11.0", "lts": "Jod" },
        { "version": "v24.11.0", "lts": "Krypton" },
        { "version": "v25.0.0", "lts": false },
        { "version": "v24.10.0", "lts": "Krypton" }
    ]"#;

    const NODE_INDEX_NO_LTS: &str = r#"[
        { "version": "v24.9.0", "lts": false },
        { "version": "v25.0.0", "lts": false }
    ]"#;

    const GIT_RELEASE: &str = r#"{
        "tag_name": "v2.56.0.windows.4",
        "assets": [
            { "name": "MinGit-2.56.0.4-64-bit.zip" },
            { "name": "PortableGit-2.56.0.4-arm64.7z.exe" },
            {
                "name": "PortableGit-2.56.0.4-64-bit.7z.exe",
                "digest": "sha256:b1f3e52216e2ed6882d1bebfd4d3fdf319bec40d2edbbf9fd26ec4fd3fce7ed1"
            }
        ]
    }"#;

    #[test]
    fn node_index_prefers_the_latest_lts() {
        assert_eq!(parse_node_index(NODE_INDEX).as_deref(), Some("24.11.0"));
    }

    #[test]
    fn node_index_falls_back_to_the_latest_release() {
        assert_eq!(parse_node_index(NODE_INDEX_NO_LTS).as_deref(), Some("25.0.0"));
    }

    #[test]
    fn git_release_picks_the_x64_portable_asset() {
        let latest = parse_git_release(GIT_RELEASE).expect("latest");
        assert_eq!(latest.version, "2.56.0");
        assert_eq!(latest.tag, "v2.56.0.windows.4");
        assert_eq!(latest.asset, "PortableGit-2.56.0.4-64-bit.7z.exe");
        assert_eq!(
            latest.sha256.as_deref(),
            Some("b1f3e52216e2ed6882d1bebfd4d3fdf319bec40d2edbbf9fd26ec4fd3fce7ed1")
        );
    }

    #[test]
    fn git_release_without_digest_keeps_sha256_empty() {
        let latest = parse_git_release(
            r#"{
                "tag_name": "v2.56.0.windows.4",
                "assets": [{ "name": "PortableGit-2.56.0.4-64-bit.7z.exe" }]
            }"#,
        )
        .expect("latest");
        assert!(latest.sha256.is_none());
    }

    #[test]
    fn git_release_without_portable_asset_is_rejected() {
        assert!(parse_git_release(r#"{ "tag_name": "v1.0.0.windows.1", "assets": [] }"#).is_none());
    }
}
