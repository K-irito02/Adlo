use std::path::{Path, PathBuf};

use adl_errors::AppError;
use serde::{Deserialize, Serialize};

const MANIFEST_FILE: &str = "manifest.json";
const VERSION_FILE: &str = "version.txt";
const PACKAGE_DIR: &str = "package";
const BIN_JS: &str = "lib/bin.js";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleManifest {
    pub version: String,
    pub bundled_at: String,
    pub npm_registry: String,
    pub package_hash: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BundledDsh {
    pub version: String,
    pub path: PathBuf,
    pub manifest: BundleManifest,
}

fn bundle_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("dsh-bundle")
}

/// Check whether a bundled dsh exists at `data_dir/dsh-bundle/`.
///
/// Returns `Ok(Some(BundledDsh))` if both `manifest.json` and `package/lib/bin.js`
/// are present and readable, `Ok(None)` otherwise.
pub fn detect(data_dir: &Path) -> Result<Option<BundledDsh>, AppError> {
    let dir = bundle_dir(data_dir);
    let manifest_path = dir.join(MANIFEST_FILE);
    let bin_path = dir.join(PACKAGE_DIR).join(BIN_JS);

    if !manifest_path.exists() || !bin_path.exists() {
        return Ok(None);
    }

    let manifest_content = std::fs::read_to_string(&manifest_path).map_err(|e| {
        AppError::Io(format!(
            "Failed to read {}: {e}",
            manifest_path.display()
        ))
    })?;
    let manifest: BundleManifest = serde_json::from_str(&manifest_content).map_err(|e| {
        AppError::Config(format!("Failed to parse {}: {e}", manifest_path.display()))
    })?;

    let version = bundled_version(data_dir)?.unwrap_or_else(|| manifest.version.clone());

    Ok(Some(BundledDsh {
        version,
        path: dir.join(PACKAGE_DIR),
        manifest,
    }))
}

/// Read the bundled version string from `data_dir/dsh-bundle/version.txt`.
pub fn bundled_version(data_dir: &Path) -> Result<Option<String>, AppError> {
    let path = bundle_dir(data_dir).join(VERSION_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| {
        AppError::Io(format!("Failed to read {}: {e}", path.display()))
    })?;
    Ok(Some(content.trim().to_string()))
}

/// Build the launch command for a bundled dsh.
///
/// Returns `("node", ["<package_path>/lib/bin.js", "--profile", "web", "--no-open"])`.
pub fn launch_command(bundled: &BundledDsh) -> (String, Vec<String>) {
    let bin_path = bundled.path.join(BIN_JS);
    (
        "node".to_string(),
        vec![
            bin_path.to_string_lossy().into_owned(),
            "--profile".to_string(),
            "web".to_string(),
            "--no-open".to_string(),
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup() -> PathBuf {
        let tmp = std::env::temp_dir().join(format!(
            "adl_dsh_bundle_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        tmp
    }

    fn teardown(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn detect_returns_none_when_dir_missing() {
        let tmp = setup();
        assert!(detect(&tmp).unwrap().is_none());
        teardown(&tmp);
    }

    #[test]
    fn detect_returns_none_when_manifest_missing() {
        let tmp = setup();
        let pkg = tmp.join("dsh-bundle").join(PACKAGE_DIR).join(BIN_JS);
        fs::create_dir_all(pkg.parent().unwrap()).unwrap();
        fs::write(&pkg, "").unwrap();
        assert!(detect(&tmp).unwrap().is_none());
        teardown(&tmp);
    }

    #[test]
    fn detect_returns_none_when_bin_missing() {
        let tmp = setup();
        let dir = tmp.join("dsh-bundle");
        fs::create_dir_all(&dir).unwrap();
        let manifest = BundleManifest {
            version: "1.0.0".into(),
            bundled_at: "2026-01-01".into(),
            npm_registry: "https://registry.npmjs.org".into(),
            package_hash: None,
        };
        fs::write(
            dir.join(MANIFEST_FILE),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();
        assert!(detect(&tmp).unwrap().is_none());
        teardown(&tmp);
    }

    #[test]
    fn detect_returns_bundled_dsh_when_both_exist() {
        let tmp = setup();
        let dir = tmp.join("dsh-bundle");
        let pkg = dir.join(PACKAGE_DIR);
        fs::create_dir_all(pkg.join("lib")).unwrap();

        let manifest = BundleManifest {
            version: "2.0.0".into(),
            bundled_at: "2026-09-07".into(),
            npm_registry: "https://registry.npmjs.org".into(),
            package_hash: Some("abc123".into()),
        };
        fs::write(
            dir.join(MANIFEST_FILE),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();
        fs::write(pkg.join(BIN_JS), "console.log('dsh')").unwrap();

        let bundled = detect(&tmp).unwrap().unwrap();
        assert_eq!(bundled.version, "2.0.0");
        assert_eq!(bundled.manifest.package_hash.as_deref(), Some("abc123"));
        assert_eq!(bundled.path, pkg);
        teardown(&tmp);
    }

    #[test]
    fn bundled_version_returns_none_when_missing() {
        let tmp = setup();
        assert!(bundled_version(&tmp).unwrap().is_none());
        teardown(&tmp);
    }

    #[test]
    fn bundled_version_reads_trimmed_content() {
        let tmp = setup();
        let dir = tmp.join("dsh-bundle");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(VERSION_FILE), "  3.1.4  \n").unwrap();
        assert_eq!(
            bundled_version(&tmp).unwrap().unwrap(),
            "3.1.4"
        );
        teardown(&tmp);
    }

    #[test]
    fn launch_command_returns_expected_args() {
        let bundled = BundledDsh {
            version: "1.0.0".into(),
            path: PathBuf::from("/tmp/dsh-bundle/package"),
            manifest: BundleManifest {
                version: "1.0.0".into(),
                bundled_at: "2026-01-01".into(),
                npm_registry: "https://registry.npmjs.org".into(),
                package_hash: None,
            },
        };
        let (cmd, args) = launch_command(&bundled);
        assert_eq!(cmd, "node");
        assert_eq!(args.len(), 4);
        assert!(args[0].ends_with("lib/bin.js"));
        assert_eq!(args[1], "--profile");
        assert_eq!(args[2], "web");
        assert_eq!(args[3], "--no-open");
    }

    #[test]
    fn manifest_roundtrip_serde() {
        let manifest = BundleManifest {
            version: "1.0.0".into(),
            bundled_at: "2026-09-07".into(),
            npm_registry: "https://registry.npmjs.org".into(),
            package_hash: Some("def456".into()),
        };
        let json = serde_json::to_string(&manifest).unwrap();
        let decoded: BundleManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(manifest.version, decoded.version);
        assert_eq!(manifest.bundled_at, decoded.bundled_at);
        assert_eq!(manifest.npm_registry, decoded.npm_registry);
        assert_eq!(manifest.package_hash, decoded.package_hash);
    }
}
