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

/// 内置包的落点：`<数据根>/dsh-bundle/`。
///
/// 这不是运行期目录，而是**安装器投放的一次性预置包**：服务启动时由 [`adopt`]
/// 搬进宿主版本目录，成为一条普通已装版本，搬完即删除本目录（不留第二份副本）。
fn bundle_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("dsh-bundle")
}

/// 检测「待收编」的内置包：`<数据根>/dsh-bundle/` 下 `manifest.json` 与
/// `package/lib/bin.js` 同时可读才视为有效。
///
/// 内置包不由运行期产生，只由安装器投放；`detect` 只用于收编前的读取，
/// 收编后该目录即被 [`adopt`] 删除，正常运行期它不应存在。
pub fn detect(data_dir: &Path) -> Result<Option<BundledDsh>, AppError> {
    let dir = bundle_dir(data_dir);
    let manifest_path = dir.join(MANIFEST_FILE);
    let bin_path = dir.join(PACKAGE_DIR).join(BIN_JS);

    if !manifest_path.exists() || !bin_path.exists() {
        return Ok(None);
    }

    let manifest_content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| AppError::Io(format!("Failed to read {}: {e}", manifest_path.display())))?;
    let manifest: BundleManifest = serde_json::from_str(&manifest_content).map_err(|e| {
        AppError::Config(format!("Failed to parse {}: {e}", manifest_path.display()))
    })?;

    let version = bundled_version(data_dir)?.unwrap_or_else(|| manifest.version.clone());

    Ok(Some(BundledDsh { version, path: dir.join(PACKAGE_DIR), manifest }))
}

/// Read the bundled version string from `data_dir/dsh-bundle/version.txt`.
pub fn bundled_version(data_dir: &Path) -> Result<Option<String>, AppError> {
    let path = bundle_dir(data_dir).join(VERSION_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("Failed to read {}: {e}", path.display())))?;
    Ok(Some(content.trim().to_string()))
}

/// 把内置包「收编」成宿主版本目录下的一条普通已装版本。
///
/// 布局转换：`dsh-bundle/package` → `<versions>/installed/<v>/node_modules/@deepseek-ai/dsh`。
/// 同卷直接 `rename`（O(1)），跨卷退化为「递归复制 + 删源」。收编成功后删除整个
/// `dsh-bundle/`：内置包只消费一次，**不留第二份副本**（用户 2026-10-22 决策：
/// 内置版本应与其它宿主版本完全同类，只是由安装包预置）。
///
/// 返回被收编的版本号；无内置包返回 `None`。若该版本已有完整安装副本（用户自己
/// 下过同一版本），保留用户那份并删除内置包，返回 `None`——用户下载的不算内置。
pub fn adopt(data_dir: &Path, versions_dir: &Path) -> Result<Option<String>, AppError> {
    let Some(bundled) = detect(data_dir)? else {
        return Ok(None);
    };
    let version = bundled.version.clone();
    let target_pkg = versions_dir
        .join("installed")
        .join(&version)
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh");

    if target_pkg.join(BIN_JS).is_file() {
        tracing::info!(%version, "dsh-bundle: bundled copy skipped, installed copy already exists");
        remove_bundle_dir(data_dir)?;
        return Ok(None);
    }

    if let Some(parent) = target_pkg.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("create {}: {e}", parent.display())))?;
    }
    // 半成品目标目录先清掉，避免 rename 因目标非空失败。
    if target_pkg.exists() {
        std::fs::remove_dir_all(&target_pkg)
            .map_err(|e| AppError::Io(format!("clean {}: {e}", target_pkg.display())))?;
    }
    match std::fs::rename(&bundled.path, &target_pkg) {
        Ok(()) => {},
        Err(rename_err) => {
            // 跨卷/占用等情形：退化为复制后删源（仍保证只有一份）。
            tracing::info!(%version, error = %rename_err, "dsh-bundle: rename failed, falling back to copy");
            copy_dir(&bundled.path, &target_pkg)?;
            std::fs::remove_dir_all(&bundled.path)
                .map_err(|e| AppError::Io(format!("remove {}: {e}", bundled.path.display())))?;
        },
    }
    if !target_pkg.join(BIN_JS).is_file() {
        return Err(AppError::Io(format!("adopted bundled {version} without bin.js")));
    }
    remove_bundle_dir(data_dir)?;
    tracing::info!(%version, path = %target_pkg.display(), "dsh-bundle: adopted into host versions");
    Ok(Some(version))
}

fn remove_bundle_dir(data_dir: &Path) -> Result<(), AppError> {
    let dir = bundle_dir(data_dir);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| AppError::Io(format!("remove {}: {e}", dir.display())))?;
    }
    Ok(())
}

/// 递归复制目录（内置包内不应有链接；遇到无法复制的条目直接报错，不静默丢文件）。
fn copy_dir(from: &Path, to: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(to)
        .map_err(|e| AppError::Io(format!("create {}: {e}", to.display())))?;
    let entries = std::fs::read_dir(from)
        .map_err(|e| AppError::Io(format!("read {}: {e}", from.display())))?;
    for entry in entries.flatten() {
        let src = entry.path();
        let dst = to.join(entry.file_name());
        let file_type =
            entry.file_type().map_err(|e| AppError::Io(format!("stat {}: {e}", src.display())))?;
        if file_type.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst)
                .map_err(|e| AppError::Io(format!("copy {}: {e}", src.display())))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup() -> PathBuf {
        std::env::temp_dir().join(format!(
            "adl_dsh_bundle_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ))
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
        fs::write(dir.join(MANIFEST_FILE), serde_json::to_string_pretty(&manifest).unwrap())
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
        fs::write(dir.join(MANIFEST_FILE), serde_json::to_string_pretty(&manifest).unwrap())
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
        assert_eq!(bundled_version(&tmp).unwrap().unwrap(), "3.1.4");
        teardown(&tmp);
    }

    #[test]
    fn adopt_moves_package_into_host_versions_and_removes_bundle() {
        let data = setup();
        let dir = data.join("dsh-bundle");
        let pkg = dir.join(PACKAGE_DIR);
        fs::create_dir_all(pkg.join("lib")).unwrap();
        fs::write(pkg.join("lib").join("bin.js"), "console.log('dsh')").unwrap();
        fs::write(
            dir.join(MANIFEST_FILE),
            r#"{"version":"2.0.0","bundled_at":"2026-10-22","npm_registry":"https://registry.npmjs.org","package_hash":null}"#,
        )
        .unwrap();

        let versions = data.join("dsh-versions");
        let adopted = adopt(&data, &versions).unwrap().expect("adopted version");
        assert_eq!(adopted, "2.0.0");
        // 收编后：目标位置为宿主安装布局，且内置包目录已删除（只有一份）。
        let target = versions.join("installed").join("2.0.0").join("node_modules/@deepseek-ai/dsh");
        assert!(target.join("lib").join("bin.js").is_file());
        assert!(!dir.exists(), "bundle dir must be gone after adoption");
        teardown(&data);
    }

    #[test]
    fn adopt_keeps_existing_install_and_drops_bundle() {
        let data = setup();
        // 用户自己已装同版本：内置包不应覆盖，也不应把用户那份标成内置。
        let target = data.join("dsh-versions").join("installed").join("2.0.0");
        let lib = target.join("node_modules/@deepseek-ai/dsh/lib");
        fs::create_dir_all(&lib).unwrap();
        fs::write(lib.join("bin.js"), "// user copy").unwrap();

        let dir = data.join("dsh-bundle");
        fs::create_dir_all(dir.join(PACKAGE_DIR).join("lib")).unwrap();
        fs::write(dir.join(PACKAGE_DIR).join("lib").join("bin.js"), "// bundled").unwrap();
        fs::write(
            dir.join(MANIFEST_FILE),
            r#"{"version":"2.0.0","bundled_at":"2026-10-22","npm_registry":"https://registry.npmjs.org","package_hash":null}"#,
        )
        .unwrap();

        let versions = data.join("dsh-versions");
        assert!(adopt(&data, &versions).unwrap().is_none());
        assert_eq!(fs::read_to_string(lib.join("bin.js")).unwrap(), "// user copy");
        assert!(!dir.exists());
        teardown(&data);
    }

    #[test]
    fn adopt_is_noop_without_bundle() {
        let data = setup();
        assert!(adopt(&data, &data.join("dsh-versions")).unwrap().is_none());
        teardown(&data);
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
