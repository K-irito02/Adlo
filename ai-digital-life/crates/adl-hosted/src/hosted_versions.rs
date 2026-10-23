use adl_errors::AppError;
use std::path::{Path, PathBuf};

pub struct HostedVersions {
    root: PathBuf,
    name: String,
    marker_rel: PathBuf,
}

impl HostedVersions {
    pub fn open(root: &Path, name: &str, marker_rel: &str) -> Self {
        Self {
            root: root.to_path_buf(),
            name: name.to_string(),
            marker_rel: PathBuf::from(marker_rel),
        }
    }
    fn installed_dir(&self) -> PathBuf {
        self.root.join(&self.name).join("installed")
    }
    pub fn version_dir(&self, v: &str) -> PathBuf {
        self.installed_dir().join(v)
    }
    pub fn installed_marker(&self, v: &str) -> PathBuf {
        self.version_dir(v).join(&self.marker_rel)
    }
    pub fn is_installed(&self, v: &str) -> bool {
        self.installed_marker(v).is_file()
    }
    pub fn mark_installed(&self, v: &str) -> Result<(), AppError> {
        let m = self.installed_marker(v);
        std::fs::create_dir_all(m.parent().expect("marker has parent"))
            .map_err(|e| AppError::Io(format!("create {}: {e}", m.display())))?;
        std::fs::write(&m, "").map_err(|e| AppError::Io(format!("write {}: {e}", m.display())))
    }
    /// Installed versions sorted ascending by `semver::Version` (not
    /// lexicographically: `9.0.0` < `10.0.0`, and `24.22.1-rc.1` < `24.22.1`).
    pub fn installed_versions(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(self.installed_dir()) else {
            return Vec::new();
        };
        let mut parsed: Vec<(semver::Version, String)> = Vec::new();
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if !self.is_installed(&n) {
                continue;
            }
            if let Ok(v) = semver::Version::parse(&n) {
                parsed.push((v, n));
            }
        }
        parsed.sort_by(|a, b| a.0.cmp(&b.0));
        parsed.into_iter().map(|(_, v)| v).collect()
    }
    pub fn best_fallback(&self, except: Option<&str>) -> Option<String> {
        self.installed_versions().into_iter().rev().find(|v| Some(v.as_str()) != except)
    }
    pub fn selected_file_path(&self) -> PathBuf {
        self.root.join(&self.name).join("selected.txt")
    }
    pub fn read_selected(&self) -> Result<Option<String>, AppError> {
        let p = self.selected_file_path();
        if !p.exists() {
            return Ok(None);
        }
        let raw = std::fs::read_to_string(&p)
            .map_err(|e| AppError::Io(format!("read {}: {e}", p.display())))?;
        let v = raw.trim().to_string();
        // 选中值是磁盘上的不可信输入：非 semver（含 `..`/分隔符）一律视为未选中。
        if !semver_check(&v) {
            return Ok(None);
        }
        Ok(if self.is_installed(&v) { Some(v) } else { None })
    }
    pub fn write_selected(&self, v: &str) -> Result<(), AppError> {
        if !self.is_installed(v) {
            return Err(AppError::InvalidInput(format!("{v} not installed")));
        }
        let p = self.selected_file_path();
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Io(format!("create {}: {e}", parent.display())))?;
        }
        std::fs::write(&p, v).map_err(|e| AppError::Io(format!("write {}: {e}", p.display())))
    }
}

fn semver_check(v: &str) -> bool {
    // marker 目录名即版本：拒绝 `..`/分隔符（与 dsh-bundle 同一安全口径）
    !v.contains(['/', '\\']) && v.parse::<semver::Version>().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_empty_dirs_and_non_semver() {
        let tmp = std::env::temp_dir().join(format!(
            "adl_hv_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let hv = HostedVersions::open(&tmp, "node", ".installed-ok");
        // 空目录 + 非 semver 不算已装（须落在 hv 实际扫描的 <root>/<name>/installed 下）
        std::fs::create_dir_all(tmp.join("node").join("installed").join("empty")).unwrap();
        std::fs::create_dir_all(tmp.join("node").join("installed").join("xx")).unwrap();
        hv.mark_installed("22.14.0").expect("mark");
        assert_eq!(hv.installed_versions(), vec!["22.14.0".to_string()]);
        assert_eq!(hv.best_fallback(None).as_deref(), Some("22.14.0"));
        hv.write_selected("22.14.0").expect("select");
        assert_eq!(hv.read_selected().expect("read").as_deref(), Some("22.14.0"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn selected_file_path_lands_under_name_dir() {
        let hv = HostedVersions::open(Path::new("D:/d"), "env-hosted/node", "node.exe");
        assert_eq!(hv.selected_file_path(), PathBuf::from("D:/d/env-hosted/node/selected.txt"));
    }

    fn temp_hv(tag: &str) -> (std::path::PathBuf, HostedVersions) {
        let tmp = std::env::temp_dir().join(format!(
            "adl_hv_{tag}_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let hv = HostedVersions::open(&tmp, "node", ".installed-ok");
        (tmp, hv)
    }

    #[test]
    fn installed_versions_sorts_by_semver_not_lexicographic() {
        let (tmp, hv) = temp_hv("semver_sort");
        hv.mark_installed("10.0.0").expect("mark 10");
        hv.mark_installed("9.0.0").expect("mark 9");
        assert_eq!(hv.installed_versions(), vec!["9.0.0".to_string(), "10.0.0".to_string()]);
        assert_eq!(hv.best_fallback(None).as_deref(), Some("10.0.0"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn stable_outranks_prerelease_but_prerelease_sorts_first() {
        let (tmp, hv) = temp_hv("pre_sort");
        hv.mark_installed("24.22.1-rc.1").expect("mark rc");
        hv.mark_installed("24.22.1").expect("mark stable");
        assert_eq!(
            hv.installed_versions(),
            vec!["24.22.1-rc.1".to_string(), "24.22.1".to_string()]
        );
        assert_eq!(hv.best_fallback(None).as_deref(), Some("24.22.1"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn read_selected_rejects_non_semver_values() {
        let (tmp, hv) = temp_hv("bad_selected");
        std::fs::create_dir_all(tmp.join("node")).expect("mkdir");
        std::fs::write(hv.selected_file_path(), "../../evil\n").expect("write selected");
        assert_eq!(hv.read_selected().expect("read"), None);
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
