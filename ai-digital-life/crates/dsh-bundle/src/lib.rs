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

/// 检测「待收编」的内置包：`bundle_dir` 下 `manifest.json` 与 `package/lib/bin.js`
/// 同时可读、且版本号合法（semver）才视为有效。
///
/// 内置包不由运行期产生，只由安装器投放；`detect` 只用于收编前的读取，
/// 收编后该目录即被 [`adopt`] 删除，正常运行期它不应存在。
pub fn detect(bundle_dir: &Path) -> Result<Option<BundledDsh>, AppError> {
    let manifest_path = bundle_dir.join(MANIFEST_FILE);
    let bin_path = bundle_dir.join(PACKAGE_DIR).join(BIN_JS);

    if !manifest_path.exists() || !bin_path.exists() {
        return Ok(None);
    }

    let manifest_content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| AppError::Io(format!("Failed to read {}: {e}", manifest_path.display())))?;
    let manifest: BundleManifest = serde_json::from_str(&manifest_content).map_err(|e| {
        AppError::Config(format!("Failed to parse {}: {e}", manifest_path.display()))
    })?;

    // version.txt 优先，非法时回退 manifest.version（两者都非法才放弃）。
    let from_file = bundled_version(bundle_dir)?;
    let candidate = from_file.clone().unwrap_or_else(|| manifest.version.trim().to_string());
    let version = match semver::Version::parse(candidate.trim()) {
        Ok(_) => candidate.trim().to_string(),
        Err(_) => {
            let fallback = manifest.version.trim().to_string();
            if semver::Version::parse(&fallback).is_ok() {
                tracing::warn!(candidate = %candidate, "dsh-bundle: invalid version.txt, falling back to manifest");
                fallback
            } else {
                // 版本号会拼进宿主版本目录并被 `remove_dir_all` 使用：必须拦住 `..`/分隔符等
                // 非法值，不能把“目录名”当成可信输入（收编包含移动与删除）。
                tracing::warn!(%candidate, "dsh-bundle: invalid version in bundled package, ignored");
                return Ok(None);
            }
        },
    };

    Ok(Some(BundledDsh { version, path: bundle_dir.join(PACKAGE_DIR), manifest }))
}

/// 读取内置包版本号（`<bundle_dir>/version.txt`）。
pub fn bundled_version(bundle_dir: &Path) -> Result<Option<String>, AppError> {
    let path = bundle_dir.join(VERSION_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("Failed to read {}: {e}", path.display())))?;
    Ok(Some(content.trim().to_string()))
}

/// 把内置包「收编」成宿主版本目录下的一条普通已装版本。
///
/// 布局转换：`<bundle_dir>/package` → `<versions>/installed/<v>/node_modules/@deepseek-ai/dsh`。
/// 位移语义收敛至 hosted `swap_into_place`（同卷 `rename` O(1)，跨卷退化为
/// 「递归复制 + 删源」，失败尽力恢复旧版）。
/// 注：hosted 通用 `adopt_bundle` 以整目录搬运为整版本，无法表达 dsh 的深层
/// `node_modules/@deepseek-ai/dsh` 目标布局（改布局会破坏 `host_bin` 契约），
/// 故此处只复用其位移原语，来源检测与布局拼装保留 dsh 侧。
/// 差异：复制退化路径遇链接即报错（hosted 口径），旧实现静默物化链接——
/// 仅跨卷收编且包内含链接时触发（npm `.bin` 常见），此时返回 Err 留痕。
///
/// 收编成功后删除整个内置包目录（删除失败只告警，不影响已完成的收编）：
/// 内置包只消费一次，**不留第二份副本**。
///
/// 返回被收编的版本号；无内置包返回 `None`。若该版本已有完整安装副本（用户自己
/// 下过同一版本），保留用户那份并删除内置包，返回 `None`——用户下载的不算内置。
pub fn adopt(bundle_dir: &Path, versions_dir: &Path) -> Result<Option<String>, AppError> {
    let Some(bundled) = detect(bundle_dir)? else {
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
        tracing::info!(%version, "dsh-bundle: installed copy already exists, bundled package dropped");
        remove_bundle_dir(bundle_dir);
        return Ok(None);
    }

    adl_hosted::swap_into_place(&bundled.path, &target_pkg)?;
    if !target_pkg.join(BIN_JS).is_file() {
        // 此时源已移走，删目标会让两份都没了：只报错留痕，交给人工/下次安装处理。
        return Err(AppError::Io(format!("adopted bundled {version} without bin.js")));
    }
    remove_bundle_dir(bundle_dir);
    tracing::info!(%version, path = %target_pkg.display(), "dsh-bundle: adopted into host versions");
    Ok(Some(version))
}

/// 删除内置包目录（收编完成后的一次性清理）。失败只告警：版本已经就位，
/// 让调用方因为“残留目录没删掉”而丢掉来源记录反而更糟。
fn remove_bundle_dir(bundle_dir: &Path) {
    if bundle_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(bundle_dir) {
            tracing::warn!(
                path = %bundle_dir.display(),
                error = %e,
                "dsh-bundle: remove bundled dir failed, left as residue"
            );
        }
    }
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
        assert!(detect(&tmp.join("dsh-bundle")).unwrap().is_none());
        teardown(&tmp);
    }

    #[test]
    fn detect_returns_none_when_manifest_missing() {
        let tmp = setup();
        let pkg = tmp.join("dsh-bundle").join(PACKAGE_DIR).join(BIN_JS);
        fs::create_dir_all(pkg.parent().unwrap()).unwrap();
        fs::write(&pkg, "").unwrap();
        assert!(detect(&tmp.join("dsh-bundle")).unwrap().is_none());
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
        assert!(detect(&tmp.join("dsh-bundle")).unwrap().is_none());
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

        let bundled = detect(&tmp.join("dsh-bundle")).unwrap().unwrap();
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
        assert_eq!(bundled_version(&dir).unwrap().unwrap(), "3.1.4");
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
        let adopted = adopt(&data.join("dsh-bundle"), &versions).unwrap().expect("adopted version");
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
        assert!(adopt(&data.join("dsh-bundle"), &versions).unwrap().is_none());
        assert_eq!(fs::read_to_string(lib.join("bin.js")).unwrap(), "// user copy");
        assert!(!dir.exists());
        teardown(&data);
    }

    fn make_bundle_files(dir: &Path, manifest_version: &str, version_txt: Option<&str>) {
        fs::create_dir_all(dir.join(PACKAGE_DIR).join("lib")).unwrap();
        fs::write(dir.join(PACKAGE_DIR).join("lib").join("bin.js"), "").unwrap();
        fs::write(
            dir.join(MANIFEST_FILE),
            format!(
                r#"{{"version":"{manifest_version}","bundled_at":"2026-10-22","npm_registry":"https://registry.npmjs.org","package_hash":null}}"#
            ),
        )
        .unwrap();
        if let Some(text) = version_txt {
            fs::write(dir.join(VERSION_FILE), text).unwrap();
        }
    }

    /// version.txt 非法时回退 manifest（不能因为一个坏文件就整体放弃预置版本）。
    #[test]
    fn detect_falls_back_to_manifest_when_version_txt_invalid() {
        let data = setup();
        let dir = data.join("dsh-bundle");
        make_bundle_files(&dir, "2.0.0", Some("../../evil"));
        let bundled = detect(&dir).unwrap().expect("manifest fallback");
        assert_eq!(bundled.version, "2.0.0");
        teardown(&data);
    }

    /// 两处版本号都非法时整体拒绝：版本号会被拼进宿主版本目录并用于删除。
    #[test]
    fn detect_rejects_non_semver_version() {
        let data = setup();
        let dir = data.join("dsh-bundle");
        make_bundle_files(&dir, "../evil", Some("../../evil"));
        assert!(detect(&dir).unwrap().is_none());
        // 收编同样不动手（不创建越界目录，也不删除内置包）。
        assert!(adopt(&dir, &data.join("dsh-versions")).unwrap().is_none());
        assert!(dir.join(PACKAGE_DIR).join("lib").join("bin.js").is_file());
        teardown(&data);
    }

    #[test]
    fn adopt_is_noop_without_bundle() {
        let data = setup();
        assert!(adopt(&data.join("dsh-bundle"), &data.join("dsh-versions")).unwrap().is_none());
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
