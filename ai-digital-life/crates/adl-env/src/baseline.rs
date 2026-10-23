//! Environment baseline versions (`env-baseline.json`, Task 11).
//!
//! The bundled resource file pins the versions new installs target:
//! `node.stable` (LTS), `git` tag+asset **verbatim** (the short semver does
//! NOT determine the asset name — `.windows.N` build-number handling is
//! ambiguous: N==1 omitted, N>1 appended — so both travel in the file), and
//! the `webview2` minimum (numeric-dotted floor, not strict semver).

use std::path::{Path, PathBuf};

use adl_errors::AppError;
use serde::{Deserialize, Serialize};

/// Bundled resource file name (also registered in `tauri.conf.json`).
pub const ENV_BASELINE_FILE: &str = "env-baseline.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NodeBaseline {
    pub stable: String,
    pub dist_base: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitBaseline {
    pub stable: String,
    pub tag: String,
    pub asset: String,
    pub base: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Webview2Baseline {
    pub minimum: String,
}

/// Whole-file baseline: node + git + webview2 floors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvBaseline {
    pub node: NodeBaseline,
    pub git: GitBaseline,
    pub webview2: Webview2Baseline,
}

/// Parse a baseline file from disk.
pub fn load_from(path: &Path) -> Result<EnvBaseline, AppError> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| AppError::Io(format!("Failed to read {}: {e}", path.display())))?;
    serde_json::from_str(&content)
        .map_err(|e| AppError::Config(format!("Failed to parse env baseline: {e}")))
}

/// The baseline install target for `dep`: `node`/`git` stable, `None` for
/// the rest (`bash` rides the git install, `webview2`/`adlserver` are not
/// installed by us, `netprobe` is a probe). Unknown deps are also `None`
/// (callers validate `dep` separately via `config`).
pub fn stable_of(baseline: &EnvBaseline, dep: &str) -> Option<String> {
    match dep {
        "node" => Some(baseline.node.stable.clone()),
        "git" => Some(baseline.git.stable.clone()),
        _ => None,
    }
}

/// Where to look for the bundled baseline at runtime, in order:
/// packaged layout (`<exe_dir>/resources/…`, Tauri `bundle.resources`) first,
/// then the dev-tree fallback (compile-time manifest path, only exists when
/// running from the repo). Pure for testability.
pub fn candidates(exe_dir: &Path) -> Vec<PathBuf> {
    vec![
        exe_dir.join("resources").join(ENV_BASELINE_FILE),
        exe_dir.join(ENV_BASELINE_FILE),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../src-tauri/resources")
            .join(ENV_BASELINE_FILE),
    ]
}

/// Load the first baseline file that exists; none found is `Internal`
/// (packaging bug — the file ships with the app).
pub fn load(exe_dir: &Path) -> Result<EnvBaseline, AppError> {
    for candidate in candidates(exe_dir) {
        if candidate.is_file() {
            return load_from(&candidate);
        }
    }
    Err(AppError::Internal(format!(
        "{ENV_BASELINE_FILE} not found (checked packaged resources and dev tree)"
    )))
}

#[cfg(test)]
mod tests {
    use super::{candidates, load, load_from, stable_of};
    use std::path::{Path, PathBuf};

    const SAMPLE: &str = r#"{
        "node": { "stable": "24.22.1", "dist_base": "https://nodejs.org/dist" },
        "git": {
            "stable": "2.56.0",
            "tag": "v2.56.0.windows.2",
            "asset": "MinGit-2.56.0.2-64-bit.zip",
            "base": "https://github.com/git-for-windows/git/releases/download"
        },
        "webview2": { "minimum": "140.0.0.0" }
    }"#;

    fn write_sample(dir: &Path) -> PathBuf {
        let path = dir.join("env-baseline.json");
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(&path, SAMPLE).unwrap();
        path
    }

    #[test]
    fn load_from_parses_and_stable_of_covers_matrix() {
        let tmp = std::env::temp_dir().join(format!(
            "adl_env_base_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let path = write_sample(&tmp);
        let base = load_from(&path).unwrap();
        assert_eq!(base.node.stable, "24.22.1");
        assert_eq!(base.git.tag, "v2.56.0.windows.2");
        assert_eq!(base.git.asset, "MinGit-2.56.0.2-64-bit.zip");
        assert_eq!(base.webview2.minimum, "140.0.0.0");
        // tag+asset 逐字透传：不得由 short semver 推导。
        assert!(base.git.tag.starts_with('v'));
        assert_ne!(base.git.asset, format!("MinGit-{}.zip", base.git.stable));
        assert_eq!(stable_of(&base, "node").as_deref(), Some("24.22.1"));
        assert_eq!(stable_of(&base, "git").as_deref(), Some("2.56.0"));
        assert_eq!(stable_of(&base, "bash"), None);
        assert_eq!(stable_of(&base, "webview2"), None);
        assert_eq!(stable_of(&base, "bogus"), None);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn candidates_prefers_packaged_layout_then_dev_tree() {
        let exe = Path::new("D:/app");
        let list = candidates(exe);
        assert!(list.len() >= 2);
        assert_eq!(list[0], PathBuf::from("D:/app/resources/env-baseline.json"));
    }

    #[test]
    fn load_picks_first_existing_candidate() {
        let tmp = std::env::temp_dir().join(format!(
            "adl_env_baseload_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        // exe_dir/resources 阴影：load 应命中打包布局候选。
        let res_dir = tmp.join("resources");
        write_sample(&res_dir);
        let base = load(&tmp).unwrap();
        assert_eq!(base.node.stable, "24.22.1");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn load_from_missing_file_is_internal_error() {
        let missing = std::env::temp_dir().join(format!(
            "adl_env_basemiss_{}.json",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let err = load_from(&missing).expect_err("missing baseline must fail");
        assert!(err.to_string().contains("adl_env_basemiss"), "unexpected error: {err}");
    }
}
