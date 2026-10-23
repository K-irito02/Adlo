use std::path::{Path, PathBuf};

use adl_errors::AppError;

use crate::HostedVersions;
use crate::atomic_swap::swap_rename_or_copy;

/// 把预置包「收编」成宿主版本目录下的一条普通已装版本（泛化 `dsh-bundle::adopt`）。
///
/// 布局转换：`<bundle_dir>/`（根下含 `<marker_rel>`）→ `<versions>/installed/<v>/`。
/// 同卷直接 `rename`（O(1)），跨卷退化为「递归复制 + 删源」（经 [`swap_rename_or_copy`]）。
/// 收编成功后删除整个预置包目录：预置包只消费一次，**不留第二份副本**。
///
/// 返回被收编的版本号；无预置包（marker 缺失）或版本非法（非 semver）返回 `None`
/// 且不动源目录。若该版本已有完整安装副本（用户自己下过同一版本），保留用户那份
/// 并删除预置包，返回 `None`——用户下载的不算预置。
pub fn adopt_bundle(
    bundle_dir: &Path,
    versions: &HostedVersions,
    manifest_version: &str,
    marker_rel: &str,
) -> Result<Option<String>, AppError> {
    if !bundle_dir.join(marker_rel).is_file() {
        return Ok(None);
    }
    let version = manifest_version.trim().to_string();
    // 版本号会被拼进宿主版本目录并被 `remove_dir_all` 使用：必须拦住 `..`/分隔符等
    // 非法值，不能把“目录名”当成可信输入（收编包含移动与删除）。
    if version.contains(['/', '\\']) || semver::Version::parse(&version).is_err() {
        return Ok(None);
    }
    let target = versions.version_dir(&version);
    let target_marker: PathBuf = target.join(marker_rel);

    if target_marker.is_file() {
        remove_bundle_dir(bundle_dir);
        return Ok(None);
    }

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("create {}: {e}", parent.display())))?;
    }
    // 半成品目标目录先清掉，避免 rename 因目标非空失败。
    if target.exists() {
        std::fs::remove_dir_all(&target)
            .map_err(|e| AppError::Io(format!("clean {}: {e}", target.display())))?;
    }
    swap_rename_or_copy(bundle_dir, &target)?;
    if !target.join(marker_rel).is_file() {
        // 此时源已移走，删目标会让两份都没了：只报错留痕，交给人工/下次安装处理。
        return Err(AppError::Io(format!("adopted bundled {version} without marker")));
    }
    remove_bundle_dir(bundle_dir);
    Ok(Some(version))
}

/// 删除预置包目录（收编完成后的一次性清理）。失败只告警：版本已经就位，
/// 让调用方因为“残留目录没删掉”而丢掉来源记录反而更糟。
fn remove_bundle_dir(bundle_dir: &Path) {
    if bundle_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(bundle_dir) {
            tracing::warn!(
                path = %bundle_dir.display(),
                error = %e,
                "adopt: remove bundled dir failed, left as residue"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::HostedVersions;

    fn nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default()
    }

    fn make_bundle(dir: &std::path::Path, content: &str) {
        std::fs::create_dir_all(dir.join("bin")).unwrap();
        std::fs::write(dir.join("bin").join("node.exe"), content).unwrap();
    }

    #[test]
    fn adopt_moves_package_into_host_versions_and_removes_bundle() {
        let tmp = std::env::temp_dir().join(format!("adl_adopt_{}", nanos()));
        let bundle = tmp.join("bundle");
        make_bundle(&bundle, "node");
        let versions = HostedVersions::open(&tmp, "node", "bin/node.exe");
        let adopted = adopt_bundle(&bundle, &versions, "22.14.0", "bin/node.exe").expect("adopt");
        assert_eq!(adopted.as_deref(), Some("22.14.0"));
        assert!(
            versions.version_dir("22.14.0").join("bin").join("node.exe").is_file(),
            "target installed/<v>/<marker> must exist"
        );
        assert!(!bundle.exists(), "bundle dir must be gone after adoption");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn adopt_keeps_existing_install_and_drops_bundle() {
        let tmp = std::env::temp_dir().join(format!("adl_adopt_{}", nanos()));
        let versions = HostedVersions::open(&tmp, "node", "bin/node.exe");
        let target = versions.version_dir("22.14.0");
        std::fs::create_dir_all(target.join("bin")).unwrap();
        std::fs::write(target.join("bin").join("node.exe"), "user copy").unwrap();
        let bundle = tmp.join("bundle");
        make_bundle(&bundle, "bundled");
        assert!(
            adopt_bundle(&bundle, &versions, "22.14.0", "bin/node.exe").expect("adopt").is_none()
        );
        assert_eq!(
            std::fs::read_to_string(target.join("bin").join("node.exe")).unwrap(),
            "user copy"
        );
        assert!(!bundle.exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn adopt_rejects_non_semver_without_touching_source() {
        let tmp = std::env::temp_dir().join(format!("adl_adopt_{}", nanos()));
        let bundle = tmp.join("bundle");
        make_bundle(&bundle, "node");
        let versions = HostedVersions::open(&tmp, "node", "bin/node.exe");
        assert!(
            adopt_bundle(&bundle, &versions, "../evil", "bin/node.exe").expect("adopt").is_none()
        );
        assert!(bundle.join("bin").join("node.exe").is_file());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn adopt_is_noop_without_marker() {
        let tmp = std::env::temp_dir().join(format!("adl_adopt_{}", nanos()));
        let bundle = tmp.join("bundle");
        std::fs::create_dir_all(&bundle).unwrap();
        let versions = HostedVersions::open(&tmp, "node", "bin/node.exe");
        assert!(
            adopt_bundle(&bundle, &versions, "22.14.0", "bin/node.exe").expect("adopt").is_none()
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
