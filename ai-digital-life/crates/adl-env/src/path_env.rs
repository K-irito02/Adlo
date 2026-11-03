//! Environment dependency PATH contribution.
//!
//! The env group installs node/git copies into the data root, but detection
//! alone does not make them usable: dsh's hosted line spawns `node`, and the
//! workspace git layer spawns `git`, both resolved through the process `PATH`.
//! [`path_dirs`] is the single source of truth for "which directories the
//! current source preference should contribute"; the server prepends them to
//! its own PATH so terminals and child processes inherit them.
//!
//! - Hosted copies: `<data>/env-hosted/<dep>/installed/<v>` (node: version dir,
//!   git: version dir `cmd/`, bash: the same PortableGit version dir `bin/`).
//! - Custom paths: the parent directory of the validated executable, so
//!   `system` / `custom` / `auto` fallback modes actually use the file the user
//!   picked instead of only reporting it in the status snapshot.
//!
//! `bash`: the hosted PortableGit `bin/` is injected too. The built-in bash
//! terminal's shell picker (`shell_resolver`) prefers a PATH-resolved `bash`
//! first (the server prepends these dirs), then falls back to its fixed Git for
//! Windows / WSL paths.
//!
//! `system` mode without a custom path contributes nothing: the system copy is
//! already on PATH, and injecting a hosted copy would silently downgrade the
//! user's explicit choice (ADR-0007).

use std::path::{Path, PathBuf};

use adl_errors::AppError;

use crate::SourceMode;
use crate::config;
use crate::providers::{bash, git, node};

/// Directories the current source preferences should prepend to PATH.
///
/// Order is node → git → bash. Duplicates (e.g. node and git custom binaries in
/// the same directory) are collapsed case-insensitively.
pub fn path_dirs(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let sources = config::load(root)?;
    let mut dirs: Vec<PathBuf> = Vec::new();

    for (mode, custom_path, name, marker) in [
        (
            sources.node.mode,
            sources.node.custom_path.as_deref(),
            node::HOSTED_NAME,
            node::MARKER_REL,
        ),
        (sources.git.mode, sources.git.custom_path.as_deref(), git::HOSTED_NAME, git::MARKER_REL),
        // bash 的宿主副本来自同一个 PortableGit 版本目录：`bin/bash.exe`。
        (
            sources.bash.mode,
            sources.bash.custom_path.as_deref(),
            git::HOSTED_NAME,
            bash::HOSTED_MARKER_REL,
        ),
    ] {
        let host_dir = selected_bin_dir(root, name, marker);
        let custom_dir = custom_path.and_then(exe_bin_dir);
        let chosen = match mode {
            // 强制宿主：只认宿主副本，缺失即不注入（不静默降级）。
            SourceMode::Host => host_dir,
            // system/custom：检测走 custom_path（若填了），PATH 必须跟着走。
            SourceMode::System | SourceMode::Custom => custom_dir,
            // auto：宿主优先，其次指定路径；都没有时系统 PATH 已经可用。
            SourceMode::Auto => host_dir.or(custom_dir),
        };
        if let Some(dir) = chosen {
            push_unique(&mut dirs, dir);
        }
    }

    Ok(dirs)
}

/// `<version>/<marker>` 的父目录。`read_selected` 已校验 semver 与 marker 存在，
/// 因此这里不会把已删除的版本目录塞进 PATH。
fn selected_bin_dir(root: &Path, name: &str, marker_rel: &str) -> Option<PathBuf> {
    let hosted = adl_hosted::HostedVersions::open(root, name, marker_rel);
    let version = hosted.read_selected().ok().flatten()?;
    hosted.installed_marker(&version).parent().map(Path::to_path_buf)
}

/// 指定路径必须是已保存校验过的可执行文件；返回其父目录（PATH 的单位）。
fn exe_bin_dir(path: &str) -> Option<PathBuf> {
    let file = Path::new(path);
    if !file.is_file() {
        return None;
    }
    file.parent().filter(|dir| !dir.as_os_str().is_empty()).map(Path::to_path_buf)
}

fn push_unique(dirs: &mut Vec<PathBuf>, dir: PathBuf) {
    let key = normalize(&dir);
    if !dirs.iter().any(|existing| normalize(existing) == key) {
        dirs.push(dir);
    }
}

/// Windows paths are case-insensitive and may mix `/` and `\`.
fn normalize(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{self, DepSource, EnvSourcesConfig};
    use adl_hosted::HostedVersions;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "adl_env_path_{tag}_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("temp root");
        dir
    }

    fn install_fake(root: &Path, name: &str, marker: &str, version: &str) {
        let hv = HostedVersions::open(root, name, marker);
        hv.mark_installed(version).expect("marker");
        hv.write_selected(version).expect("selected");
    }

    fn fake_exe(root: &Path, sub: &str, name: &str) -> PathBuf {
        let dir = root.join(sub);
        std::fs::create_dir_all(&dir).expect("bin dir");
        let file = dir.join(name);
        std::fs::write(&file, b"x").expect("fake exe");
        file
    }

    fn write_sources(
        root: &Path,
        node: (SourceMode, Option<PathBuf>),
        git: (SourceMode, Option<PathBuf>),
        bash_custom: Option<PathBuf>,
    ) {
        let config = EnvSourcesConfig {
            node: DepSource {
                mode: node.0,
                custom_path: node.1.map(|p| p.to_string_lossy().into()),
            },
            git: DepSource { mode: git.0, custom_path: git.1.map(|p| p.to_string_lossy().into()) },
            bash: DepSource {
                mode: SourceMode::Auto,
                custom_path: bash_custom.map(|p| p.to_string_lossy().into()),
            },
            ..EnvSourcesConfig::default()
        };
        config::save(root, &config).expect("save sources");
    }

    #[test]
    fn auto_prefers_selected_hosted_dirs() {
        let root = temp_root("auto");
        install_fake(&root, node::HOSTED_NAME, node::MARKER_REL, "24.22.1");
        install_fake(&root, git::HOSTED_NAME, git::MARKER_REL, "2.56.0");
        write_sources(&root, (SourceMode::Auto, None), (SourceMode::Auto, None), None);

        let dirs = path_dirs(&root).expect("dirs");
        assert_eq!(
            dirs,
            vec![
                node::host_bin_path(&root, "24.22.1").parent().unwrap().to_path_buf(),
                git::host_bin_path(&root, "2.56.0").parent().unwrap().to_path_buf(),
            ]
        );
        assert!(dirs[1].ends_with("cmd"), "git bin dir is <version>/cmd: {:?}", dirs[1]);
    }

    #[test]
    fn host_mode_with_install_contributes() {
        let root = temp_root("host");
        install_fake(&root, node::HOSTED_NAME, node::MARKER_REL, "24.22.1");
        write_sources(&root, (SourceMode::Host, None), (SourceMode::Auto, None), None);
        assert_eq!(path_dirs(&root).expect("dirs").len(), 1);
    }

    #[test]
    fn host_without_install_contributes_nothing() {
        let root = temp_root("missing");
        write_sources(&root, (SourceMode::Host, None), (SourceMode::Auto, None), None);
        assert!(path_dirs(&root).expect("dirs").is_empty());
    }

    #[test]
    fn system_and_custom_without_path_contribute_nothing() {
        let root = temp_root("system");
        install_fake(&root, node::HOSTED_NAME, node::MARKER_REL, "24.22.1");
        install_fake(&root, git::HOSTED_NAME, git::MARKER_REL, "2.56.0");
        write_sources(&root, (SourceMode::System, None), (SourceMode::Custom, None), None);
        assert!(path_dirs(&root).expect("dirs").is_empty());
    }

    #[test]
    fn custom_path_contributes_its_bin_dir_even_when_hosted_exists() {
        let root = temp_root("custom");
        install_fake(&root, node::HOSTED_NAME, node::MARKER_REL, "24.22.1");
        let node_exe = fake_exe(&root, "custom-node", "node.exe");
        let git_exe = fake_exe(&root, "custom-git", "git.exe");
        write_sources(
            &root,
            (SourceMode::System, Some(node_exe.clone())),
            (SourceMode::Custom, Some(git_exe.clone())),
            None,
        );
        assert_eq!(
            path_dirs(&root).expect("dirs"),
            vec![node_exe.parent().unwrap().to_path_buf(), git_exe.parent().unwrap().to_path_buf()]
        );
    }

    #[test]
    fn auto_without_host_falls_back_to_custom_path() {
        let root = temp_root("auto-custom");
        let node_exe = fake_exe(&root, "custom-node", "node.exe");
        write_sources(
            &root,
            (SourceMode::Auto, Some(node_exe.clone())),
            (SourceMode::Auto, None),
            None,
        );
        assert_eq!(path_dirs(&root).expect("dirs"), vec![node_exe.parent().unwrap().to_path_buf()]);
    }

    #[test]
    fn auto_prefers_hosted_over_custom_when_both_exist() {
        let root = temp_root("auto-both");
        install_fake(&root, node::HOSTED_NAME, node::MARKER_REL, "24.22.1");
        let node_exe = fake_exe(&root, "custom-node", "node.exe");
        write_sources(&root, (SourceMode::Auto, Some(node_exe)), (SourceMode::Auto, None), None);
        let dirs = path_dirs(&root).expect("dirs");
        assert_eq!(dirs.len(), 1);
        assert_eq!(
            dirs[0],
            node::host_bin_path(&root, "24.22.1").parent().unwrap().to_path_buf(),
            "auto must prefer the hosted copy over a custom path (resolve() contract)"
        );
    }

    #[test]
    fn bash_custom_path_contributes_its_bin_dir() {
        let root = temp_root("bash");
        let bash = fake_exe(&root, "custom-bash", "bash.exe");
        write_sources(
            &root,
            (SourceMode::Auto, None),
            (SourceMode::Auto, None),
            Some(bash.clone()),
        );
        assert_eq!(path_dirs(&root).expect("dirs"), vec![bash.parent().unwrap().to_path_buf()]);
    }

    #[test]
    fn auto_contributes_hosted_bash_bin_dir() {
        let root = temp_root("bash-hosted");
        install_fake(&root, git::HOSTED_NAME, git::MARKER_REL, "2.56.0");
        let bash = root.join("env-hosted/git/installed/2.56.0/bin/bash.exe");
        std::fs::create_dir_all(bash.parent().expect("bash parent")).expect("bash dir");
        std::fs::write(&bash, b"x").expect("bash marker");
        write_sources(&root, (SourceMode::Auto, None), (SourceMode::Auto, None), None);

        let dirs = path_dirs(&root).expect("dirs");
        assert!(
            dirs.iter().any(|d| d == bash.parent().expect("bash parent")),
            "hosted bash bin dir missing: {dirs:?}"
        );
    }

    #[test]
    fn deduplicates_dirs_that_are_the_same_after_normalization() {
        let root = temp_root("dedupe");
        let node_exe = fake_exe(&root, "same", "node.exe");
        let git_exe = fake_exe(&root, "same", "git.exe");
        write_sources(
            &root,
            (SourceMode::Custom, Some(node_exe)),
            (SourceMode::Custom, Some(git_exe)),
            None,
        );
        assert_eq!(path_dirs(&root).expect("dirs").len(), 1);
    }

    #[test]
    fn stale_selected_version_is_ignored() {
        let root = temp_root("stale");
        let hosted = HostedVersions::open(&root, node::HOSTED_NAME, node::MARKER_REL);
        std::fs::create_dir_all(hosted.selected_file_path().parent().unwrap()).unwrap();
        std::fs::write(hosted.selected_file_path(), "24.22.1").unwrap();
        assert!(path_dirs(&root).expect("dirs").is_empty());
    }
}
