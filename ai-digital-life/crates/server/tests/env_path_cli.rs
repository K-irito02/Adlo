//! Regression: the real `adl-server` process prepends env-dependency dirs to PATH
//! and removes stale dirs when the source preference changes.
//!
//! `--print-env` prints the child process environment after startup refresh, so
//! the assertions never mutate the test process PATH (no cross-test pollution).
#![cfg(windows)]

use adl_env::SourceMode;
use adl_env::config::{self, DepSource, EnvSourcesConfig};
use adl_env::providers::{git, node};
use adl_hosted::HostedVersions;
use serde_json::Value;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

fn temp_root(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("adl_env_cli_{tag}_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("temp root");
    dir
}

fn install_fake(root: &Path, name: &str, marker: &str, version: &str) {
    let hv = HostedVersions::open(root, name, marker);
    hv.mark_installed(version).expect("marker");
    hv.write_selected(version).expect("selected");
}

fn write_sources(root: &Path, node_mode: SourceMode, git_mode: SourceMode) {
    let config = EnvSourcesConfig {
        node: DepSource { mode: node_mode, custom_path: None },
        git: DepSource { mode: git_mode, custom_path: None },
        ..EnvSourcesConfig::default()
    };
    config::save(root, &config).expect("save sources");
}

fn print_env(root: &Path) -> Value {
    let output = Command::new(env!("CARGO_BIN_EXE_adl-server"))
        .args(["--print-env", "--data-dir"])
        .arg(root)
        .output()
        .expect("spawn adl-server --print-env");
    assert!(
        output.status.success(),
        "adl-server --print-env failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line =
        stdout.lines().find(|line| line.starts_with("ADL_ENV_JSON=")).expect("ADL_ENV_JSON line");
    serde_json::from_str(&line["ADL_ENV_JSON=".len()..]).expect("valid env JSON")
}

fn path_contains(path: &str, dir: &Path) -> bool {
    let expected = dir.to_string_lossy();
    std::env::split_paths(OsStr::new(path))
        .any(|entry| entry.to_string_lossy().eq_ignore_ascii_case(&expected))
}

#[test]
fn print_env_prepends_hosted_dirs_and_removes_on_source_switch() {
    let root = temp_root("switch");
    install_fake(&root, node::HOSTED_NAME, node::MARKER_REL, "24.22.1");
    install_fake(&root, git::HOSTED_NAME, git::MARKER_REL, "2.56.0");
    write_sources(&root, SourceMode::Host, SourceMode::Host);

    let node_dir = node::host_bin_path(&root, "24.22.1").parent().unwrap().to_path_buf();
    let git_dir = git::host_bin_path(&root, "2.56.0").parent().unwrap().to_path_buf();

    let before = print_env(&root);
    let before_path = before["path"].as_str().expect("path string");
    let before_dirs: Vec<String> = before["pathDirs"]
        .as_array()
        .expect("pathDirs array")
        .iter()
        .map(|value| value.as_str().expect("dir string").to_string())
        .collect();
    assert_eq!(before_dirs.len(), 2, "node + git hosted dirs: {before_dirs:?}");
    assert!(path_contains(before_path, &node_dir), "node dir missing from PATH: {before_path}");
    assert!(path_contains(before_path, &git_dir), "git dir missing from PATH: {before_path}");

    // 切到 system：下一轮进程不得再继承上一轮的宿主目录。
    write_sources(&root, SourceMode::System, SourceMode::System);
    let after = print_env(&root);
    let after_path = after["path"].as_str().expect("path string");
    assert!(after["pathDirs"].as_array().expect("pathDirs array").is_empty());
    assert!(!path_contains(after_path, &node_dir), "stale node dir remained: {after_path}");
    assert!(!path_contains(after_path, &git_dir), "stale git dir remained: {after_path}");

    let _ = std::fs::remove_dir_all(&root);
}
