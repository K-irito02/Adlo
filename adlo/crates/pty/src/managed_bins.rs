//! 宿主托管 CLI 的终端注入注册表（PATH + 环境变量）。
//!
//! 服务端在「版本来源解析为宿主托管」时把对应版本的 bin 目录与数据隔离变量
//! 一起登记；PTY 创建时由 [`managed_state`] 一次性取快照并注入本会话。
//! 只影响新会话，不修改系统/用户环境变量（见 ADR-0005）。
//!
//! 目录与环境变量放在**同一个** `RwLock` 里：切换来源时两者必须同时生效，
//! 否则可能读到「新 PATH + 旧 OPENCODE_DB」的错配组合。

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// 一次来源解析得到的完整注入状态。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ManagedState {
    pub dirs: Vec<PathBuf>,
    pub env: Vec<(OsString, OsString)>,
}

static MANAGED: RwLock<ManagedState> =
    RwLock::new(ManagedState { dirs: Vec::new(), env: Vec::new() });

/// 原子覆盖 PATH 目录与注入变量（空 vec 即关闭注入）。
pub fn set_managed_state(dirs: Vec<PathBuf>, env: Vec<(OsString, OsString)>) {
    let mut guard = MANAGED.write().unwrap_or_else(|e| e.into_inner());
    *guard = ManagedState { dirs, env };
}

/// 当前注入状态的快照（PTY 创建时调用一次，避免两次加锁读到不同版本）。
pub fn managed_state() -> ManagedState {
    MANAGED.read().unwrap_or_else(|e| e.into_inner()).clone()
}

/// 当前登记的托管环境变量（调试/测试用）。
pub fn managed_env() -> Vec<(OsString, OsString)> {
    managed_state().env
}

/// 当前登记的目录（调试/测试用）。
pub fn managed_bin_dirs() -> Vec<PathBuf> {
    managed_state().dirs
}

/// 在继承的 PATH 前面拼上托管目录；无登记时返回 `None`（不改环境）。
///
/// 继承值必须先用 [`std::env::split_paths`] 拆成条目再交给
/// [`std::env::join_paths`]：Windows 上 `join_paths` 会给「元素内含 `;`」的条目
/// 整体加引号，把整条 PATH 当成单个元素拼进去会让结果变成
/// `shim;bin;"C:\a;C:\b;..."`，cmd.exe / Node 随后解析不到任何命令。
///
/// 空条目按 Windows PATH 语义相当于当前工作目录，本实现与
/// `crates/server/src/env_path.rs` 一致地丢弃；空目录同样无意义，一并丢弃。
/// 拼装失败时保留继承值、放弃本次托管注入并记警告：空 PATH 会让终端连系统命令
/// 都找不到，比缺少托管目录严重得多。
pub fn terminal_path_from(dirs: &[PathBuf], inherited: Option<&OsString>) -> Option<OsString> {
    if dirs.is_empty() {
        return None;
    }
    let mut parts: Vec<PathBuf> =
        dirs.iter().filter(|dir| !dir.as_os_str().is_empty()).cloned().collect();
    if let Some(base) = inherited {
        parts.extend(std::env::split_paths(base).filter(|part| !part.as_os_str().is_empty()));
    }
    if parts.is_empty() {
        return None;
    }
    match std::env::join_paths(&parts) {
        Ok(path) => Some(path),
        Err(error) => {
            tracing::warn!(
                error = %error,
                "pty: cannot merge managed dirs into PATH; keeping inherited PATH"
            );
            inherited.cloned().filter(|value| !value.is_empty())
        },
    }
}

/// 用户已显式设置的变量是否应阻止托管注入。
///
/// 空值（`KEY=`）视为「未设置」：注入托管值，避免托管 CLI 拿到空路径后直接失败。
pub fn user_value_blocks_injection(current: Option<&OsString>) -> bool {
    current.is_some_and(|value| !value.is_empty())
}

/// 托管注入中必须强制覆盖用户值的变量：
/// - `XDG_DATA_HOME` / `XDG_STATE_HOME`：隔离手段，沿用用户值会让 2.x 退回与桌面版
///   相同的数据目录（ADR-0010 的隔离承诺不成立）。
/// - `OPENCODE_DISABLE_AUTOUPDATE`：版本管理由应用负责，用户设 0 会让 TUI 原地替换
///   托管二进制，绕过版本目录与回退能力。
pub fn is_forced_managed_key(key: &std::ffi::OsStr) -> bool {
    key == "XDG_DATA_HOME" || key == "XDG_STATE_HOME" || key == "OPENCODE_DISABLE_AUTOUPDATE"
}

/// 便捷入口：给定版本目录与可执行相对路径，返回其父目录（bin）。
pub fn bin_dir_for(version_dir: &Path, marker_rel: &str) -> PathBuf {
    version_dir
        .join(marker_rel)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| version_dir.to_path_buf())
}

/// 串行化测试对全局注册表的改写（cargo 默认并行跑同 crate 的测试）。
#[cfg(test)]
pub(crate) fn test_guard() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepends_managed_dirs_to_inherited_path() {
        let _guard = test_guard();
        set_managed_state(
            vec![PathBuf::from("/managed/a"), PathBuf::from("/managed/b")],
            Vec::new(),
        );
        let inherited = OsString::from("/usr/bin");
        let dirs = managed_bin_dirs();
        let path = terminal_path_from(&dirs, Some(&inherited)).expect("path");
        let text = path.to_string_lossy();
        assert!(
            text.starts_with(&format!("/managed/a{}", std::path::MAIN_SEPARATOR))
                || text.starts_with("/managed/a")
        );
        assert!(text.contains("/managed/b"));
        assert!(text.contains("/usr/bin"));
        set_managed_state(Vec::new(), Vec::new());
        assert!(terminal_path_from(&managed_bin_dirs(), Some(&inherited)).is_none());
    }

    #[test]
    fn inherited_entries_are_split_instead_of_collapsed_into_one() {
        let inherited = std::env::join_paths([
            PathBuf::from("sys/a"),
            PathBuf::from("sys/b"),
            PathBuf::from("sys/c"),
        ])
        .expect("join inherited");
        let dirs = vec![PathBuf::from("managed/a")];
        let path = terminal_path_from(&dirs, Some(&inherited)).expect("path");
        let parts: Vec<PathBuf> = std::env::split_paths(&path).collect();
        assert_eq!(parts.len(), 4, "managed + three inherited entries: {parts:?}");
        assert_eq!(parts[0], PathBuf::from("managed/a"));
        assert_eq!(parts[3], PathBuf::from("sys/c"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_inherited_path_is_joined_without_quotes() {
        // 回归：整条 PATH 作为单个元素交给 join_paths 会被整体加引号，
        // 于是 cmd.exe / Node 解析不到任何命令（codegraph MCP 启动失败即此症状）。
        let dirs = vec![PathBuf::from(r"C:\managed\shim")];
        let inherited = OsString::from(
            r"E:\Program Files\PowerShell\7;C:\Windows\System32;D:\Tools\ripgrep\bin",
        );
        let path = terminal_path_from(&dirs, Some(&inherited)).expect("path");
        let text = path.to_string_lossy();
        assert!(!text.contains('"'), "joined PATH must not quote entries: {text}");
        let parts: Vec<PathBuf> = std::env::split_paths(&path).collect();
        assert_eq!(parts.len(), 4, "managed + three inherited entries: {parts:?}");
        assert_eq!(parts[1], PathBuf::from(r"E:\Program Files\PowerShell\7"));
    }

    #[test]
    fn drops_empty_inherited_entries() {
        // 空条目在 Windows 上等于当前工作目录；不得因合并重新引入。
        let separator = if cfg!(windows) { ';' } else { ':' };
        let inherited = OsString::from(format!("sys/a{separator}"));
        let dirs = vec![PathBuf::from("managed/a")];
        let path = terminal_path_from(&dirs, Some(&inherited)).expect("path");
        let parts: Vec<PathBuf> = std::env::split_paths(&path).collect();
        assert_eq!(parts, vec![PathBuf::from("managed/a"), PathBuf::from("sys/a")]);
    }

    #[cfg(windows)]
    #[test]
    fn unjoinable_managed_dir_keeps_inherited_path_instead_of_emptying() {
        // join_paths 拒绝含引号的条目；此时必须保留继承值，而不是返回空 PATH。
        let dirs = vec![PathBuf::from("C:\\bad\"dir")];
        let inherited = OsString::from(r"C:\Windows\System32");
        let path = terminal_path_from(&dirs, Some(&inherited)).expect("inherited kept");
        assert_eq!(path, inherited);
    }

    #[cfg(windows)]
    #[test]
    fn unjoinable_managed_dir_without_inherited_returns_none() {
        let dirs = vec![PathBuf::from("C:\\bad\"dir")];
        assert!(terminal_path_from(&dirs, None).is_none());
    }

    #[test]
    fn no_inherited_path_keeps_only_managed_dirs() {
        let dirs = vec![PathBuf::from("managed/a"), PathBuf::from("managed/b")];
        let path = terminal_path_from(&dirs, Some(&OsString::new())).expect("path");
        let parts: Vec<PathBuf> = std::env::split_paths(&path).collect();
        assert_eq!(parts, dirs);
    }

    #[test]
    fn empty_inputs_do_not_produce_an_empty_path() {
        // 空 PATH 会让终端连系统命令都找不到；无有效条目时应当不注入。
        let empty_dirs = vec![PathBuf::new()];
        assert!(terminal_path_from(&empty_dirs, None).is_none());
        assert!(terminal_path_from(&empty_dirs, Some(&OsString::new())).is_none());
    }

    #[test]
    fn managed_state_round_trips_and_can_be_cleared() {
        let _guard = test_guard();
        let key = OsString::from("OPENCODE_DB");
        let value = OsString::from("/tmp/managed/opencode.db");
        set_managed_state(vec![PathBuf::from("/managed/a")], vec![(key.clone(), value.clone())]);
        let state = managed_state();
        assert_eq!(state.dirs, vec![PathBuf::from("/managed/a")]);
        assert_eq!(state.env, vec![(key, value)]);
        set_managed_state(Vec::new(), Vec::new());
        assert!(managed_state().dirs.is_empty());
        assert!(managed_env().is_empty());
    }

    #[test]
    fn empty_user_value_does_not_block_injection() {
        let _guard = test_guard();
        assert!(!user_value_blocks_injection(None));
        assert!(!user_value_blocks_injection(Some(&OsString::new())));
        assert!(user_value_blocks_injection(Some(&OsString::from("custom.db"))));
    }

    #[test]
    fn xdg_isolation_and_autoupdate_keys_override_user_values() {
        assert!(is_forced_managed_key(std::ffi::OsStr::new("XDG_DATA_HOME")));
        assert!(is_forced_managed_key(std::ffi::OsStr::new("XDG_STATE_HOME")));
        assert!(is_forced_managed_key(std::ffi::OsStr::new("OPENCODE_DISABLE_AUTOUPDATE")));
        assert!(!is_forced_managed_key(std::ffi::OsStr::new("OPENCODE_DB")));
    }
}
