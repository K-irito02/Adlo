//! 宿主托管 CLI 的终端 PATH 注入注册表。
//!
//! 服务端在「版本来源解析为宿主托管」时把对应版本的 bin 目录登记进来；
//! PTY 创建时由 [`terminal_path`] 前置到该会话的 PATH。只影响新会话，
//! 不修改系统/用户环境变量（见 ADR-0005）。

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

static MANAGED_BIN_DIRS: RwLock<Vec<PathBuf>> = RwLock::new(Vec::new());

/// 覆盖当前登记目录（空 vec 即关闭注入）。
pub fn set_managed_bin_dirs(dirs: Vec<PathBuf>) {
    let mut guard = MANAGED_BIN_DIRS.write().unwrap_or_else(|e| e.into_inner());
    *guard = dirs;
}

/// 当前登记的目录（调试/测试用）。
pub fn managed_bin_dirs() -> Vec<PathBuf> {
    MANAGED_BIN_DIRS.read().unwrap_or_else(|e| e.into_inner()).clone()
}

/// 在继承的 PATH 前面拼上托管目录；无登记时返回 `None`（不改环境）。
pub fn terminal_path(inherited: Option<&OsString>) -> Option<OsString> {
    let dirs = managed_bin_dirs();
    if dirs.is_empty() {
        return None;
    }
    let mut parts: Vec<OsString> = dirs.iter().map(|d| d.as_os_str().to_os_string()).collect();
    if let Some(base) = inherited {
        if !base.is_empty() {
            parts.push(base.clone());
        }
    }
    Some(std::env::join_paths(parts).unwrap_or_else(|_| OsString::new()))
}

/// 便捷入口：给定版本目录与可执行相对路径，返回其父目录（bin）。
pub fn bin_dir_for(version_dir: &Path, marker_rel: &str) -> PathBuf {
    version_dir
        .join(marker_rel)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| version_dir.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepends_managed_dirs_to_inherited_path() {
        set_managed_bin_dirs(vec![PathBuf::from("/managed/a"), PathBuf::from("/managed/b")]);
        let inherited = OsString::from("/usr/bin");
        let path = terminal_path(Some(&inherited)).expect("path");
        let text = path.to_string_lossy();
        assert!(
            text.starts_with(&format!("/managed/a{}", std::path::MAIN_SEPARATOR))
                || text.starts_with("/managed/a")
        );
        assert!(text.contains("/managed/b"));
        assert!(text.contains("/usr/bin"));
        set_managed_bin_dirs(Vec::new());
        assert!(terminal_path(Some(&inherited)).is_none());
    }
}
