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
    pub fn installed_versions(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let Ok(entries) = std::fs::read_dir(self.installed_dir()) else {
            return out;
        };
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if semver_check(&n) && self.is_installed(&n) {
                out.push(n);
            }
        }
        out.sort();
        out
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
}
