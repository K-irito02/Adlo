use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use serde::{Deserialize, Serialize};

use adl_errors::AppError;

/// npm registry 上 @deepseek-ai/dsh 最新版本元数据端点。
pub const REGISTRY_LATEST: &str = "https://registry.npmjs.org/@deepseek-ai/dsh/latest";

/// 宿主管理的 dsh cli 版本目录的版本管理：已装版本列表、查最新、回退、卸载、升级、重装。
///
/// 作用域硬边界：只读写宿主版本目录 `<root>`（`selected.txt` + `installed/<version>/`），
/// 绝不写入/改动 dsh 自身的会话/配置/插件目录。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VersionStatus {
    pub current_selected: Option<String>,
    pub installed: Vec<String>,
    pub latest_available: Option<String>,
    pub has_update: bool,
}

fn selected_file(root: &Path) -> PathBuf {
    root.join("selected.txt")
}

fn installed_dir(root: &Path) -> PathBuf {
    root.join("installed")
}

/// 读取当前选中的版本号。
pub fn read_selected(root: &Path) -> Result<Option<String>, AppError> {
    let p = selected_file(root);
    let raw = match std::fs::read_to_string(&p) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(AppError::Io(format!("read {}: {e}", p.display()))),
    };
    let v = raw.trim().to_string();
    Ok((!v.is_empty()).then_some(v))
}

fn list_installed(root: &Path) -> Result<Vec<String>, AppError> {
    let dir = installed_dir(root);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut versions: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| AppError::Io(format!("read dir {}: {e}", dir.display())))?
        .filter_map(|e| match e {
            Ok(entry) => Some(entry),
            Err(e) => {
                tracing::warn!(path = %dir.display(), error = %e, "dsh-version: failed to read dir entry");
                None
            }
        })
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|v| semver::Version::parse(v).is_ok())
        .collect();
    versions.sort_by(|a, b| {
        let na = semver::Version::parse(a)
            .unwrap_or_else(|_| semver::Version::parse("0.0.0").expect("0.0.0 parses"));
        let nb = semver::Version::parse(b)
            .unwrap_or_else(|_| semver::Version::parse("0.0.0").expect("0.0.0 parses"));
        nb.cmp(&na)
    });
    Ok(versions)
}

/// 把版本字符串拆成主/次/补丁数值段；忽略 `-` 之后的 pre-release 后缀。
fn ver_tokens(v: &str) -> Vec<u64> {
    let core = v.split('-').next().unwrap_or(v);
    core.split('.').filter_map(|t| t.parse::<u64>().ok()).collect()
}

/// 逐段比较 `cur` 与 `latest` 的数值段，前段大则判定 latest 更新。
fn latest_is_newer(cur: &[u64], latest: &[u64]) -> bool {
    let len = cur.len().max(latest.len());
    for i in 0..len {
        let a = cur.get(i).copied().unwrap_or(0);
        let b = latest.get(i).copied().unwrap_or(0);
        if b > a {
            return true;
        }
        if b < a {
            return false;
        }
    }
    false
}

/// 只读查询 npm registry 返回 dsh 最新可用版本（不下载）。
pub async fn latest_available() -> Result<Option<String>, AppError> {
    let resp = reqwest::Client::new()
        .get(REGISTRY_LATEST)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::Network(format!("query dsh latest failed: {e}")))?;
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Network(format!("parse dsh latest failed: {e}")))?;
    Ok(json.get("version").and_then(|v| v.as_str()).map(|v| v.to_string()))
}

/// 聚合查询版本目录状态（当前选中、已装列表、最新可用、是否有更新）。
pub async fn get_version_status(root: &Path) -> Result<VersionStatus, AppError> {
    let current_selected = read_selected(root)?;
    let installed = list_installed(root)?;
    let latest = latest_available().await?;
    let has_update = match (&current_selected, &latest) {
        (Some(cur), Some(latest)) => {
            let cur_tokens = ver_tokens(cur);
            let lat_tokens = ver_tokens(latest);
            latest_is_newer(&cur_tokens, &lat_tokens)
        },
        (None, Some(_)) => true,
        _ => false,
    };
    Ok(VersionStatus { current_selected, installed, latest_available: latest, has_update })
}

/// 升级：把最新版本登记为已装版本目录并写入 selected。
///
/// 边界说明：实际的 dsh cli 二进制下载/安装格式由 spec §8 待后续细化，
/// 本实现只"登记版本目录 + 记账"（创建 installed/<version>/ 目录并写入 selected）。
pub async fn update(root: &Path) -> Result<String, AppError> {
    let latest = latest_available()
        .await?
        .ok_or_else(|| AppError::Network("no latest version available".into()))?;
    let dir = installed_dir(root).join(&latest);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Io(format!("create {}: {e}", dir.display())))?;
    tokio::fs::write(selected_file(root), format!("{latest}\n"))
        .await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    Ok(latest)
}

/// 回退：校验版本号并确认已安装后，把该版本写入 selected。
pub async fn revert(root: &Path, version: &str) -> Result<String, AppError> {
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    if !installed_dir(root).join(version).is_dir() {
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    tokio::fs::write(selected_file(root), format!("{version}\n"))
        .await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    Ok(version.to_string())
}

/// 卸载：删除 installed/<version>/ 目录；若恰好是当前选中版本则清空 selected。
pub async fn uninstall(root: &Path, version: &str) -> Result<(), AppError> {
    let dir = installed_dir(root).join(version);
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    tokio::fs::remove_dir_all(&dir)
        .await
        .map_err(|e| AppError::Io(format!("remove {}: {e}", dir.display())))?;
    if read_selected(root)? == Some(version.to_string()) {
        tokio::fs::write(selected_file(root), "")
            .await
            .map_err(|e| AppError::Io(format!("clear selected: {e}")))?;
    }
    Ok(())
}

/// 重装：按当前选中版本重新安装最新可用版本。
pub async fn reinstall(root: &Path) -> Result<String, AppError> {
    if read_selected(root)?.is_none() {
        return Err(AppError::NotFound("no selected version".into()));
    }
    update(root).await
}

// ---------------------------------------------------------------------------
// System detection & smart source selection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SystemDshInfo {
    pub path: PathBuf,
    pub version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RunningDshInfo {
    pub url: String,
    pub port: u16,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum DshSource {
    ReuseRunning { url: String, port: u16 },
    System { info: SystemDshInfo },
    Bundled { bundled: adl_dsh_bundle::BundledDsh },
    Download { version: Option<String> },
}

/// Scan the system PATH for a `dsh` command.
///
/// - Windows: `where dsh`
/// - Unix: `which dsh`
///
/// On success, attempts `dsh --version` to obtain the version string.
pub fn detect_system_dsh() -> Option<SystemDshInfo> {
    let which_result = if cfg!(target_os = "windows") {
        StdCommand::new("where").arg("dsh").output()
    } else {
        StdCommand::new("which").arg("dsh").output()
    };

    let output = match which_result {
        Ok(o) if o.status.success() => o,
        _ => return None,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next()?.trim();
    let path = PathBuf::from(first_line);

    let version = StdCommand::new(&path)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|v| !v.is_empty());

    Some(SystemDshInfo { path, version })
}

/// Detect whether a dsh server is already running on `port`.
///
/// 1. Probe `TcpStream::connect` to confirm the port is listening.
/// 2. HTTP GET `http://127.0.0.1:{port}/` and check for a dsh-related response
///    (status 200 and body not empty).
pub fn detect_running_dsh(port: u16) -> Option<RunningDshInfo> {
    let addr = format!("127.0.0.1:{port}");
    if TcpStream::connect(&addr).is_err() {
        return None;
    }

    let url = format!("http://{addr}/");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()?;

    let resp = client.get(&url).send().ok()?;
    if !resp.status().is_success() {
        return None;
    }

    let body = resp.text().ok()?;
    if body.is_empty() {
        return None;
    }

    Some(RunningDshInfo { url, port, pid: None })
}

const DSH_DEFAULT_PORT: u16 = 3080;

/// Select the best available dsh source, in priority order:
///
/// 1. Already running (port 3080)
/// 2. System-installed (`dsh` on PATH)
/// 3. Bundled (via `adl-dsh-bundle`)
/// 4. Download (fallback — no local copy available)
pub fn select_dsh_source(
    _data_dir: &Path,
    bundled: Option<&adl_dsh_bundle::BundledDsh>,
) -> DshSource {
    if let Some(running) = detect_running_dsh(DSH_DEFAULT_PORT) {
        return DshSource::ReuseRunning { url: running.url, port: running.port };
    }

    if let Some(info) = detect_system_dsh() {
        return DshSource::System { info };
    }

    if let Some(b) = bundled {
        return DshSource::Bundled { bundled: b.clone() };
    }

    DshSource::Download { version: None }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("dshver-{}-{tag}", std::process::id()));
        if root.exists() {
            let _ = std::fs::remove_dir_all(&root);
        }
        root
    }

    #[test]
    fn list_installed_missing_dir_returns_empty() {
        let root = fresh_root("empty_list");
        let versions = list_installed(&root).expect("no error on missing dir");
        assert!(versions.is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn read_selected_missing_file_returns_none() {
        let root = fresh_root("no_selected");
        let sel = read_selected(&root).expect("no error on missing file");
        assert!(sel.is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn revert_uninstalled_is_not_found() {
        let root = fresh_root("revert_uninstalled");
        let err = revert(&root, "1.2.3").await.expect_err("should error");
        assert!(matches!(err, AppError::NotFound(_)));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn revert_installed_writes_selected() {
        let root = fresh_root("revert_installed");
        std::fs::create_dir_all(installed_dir(&root).join("1.2.3")).expect("mkdir");
        revert(&root, "1.2.3").await.expect("revert ok");
        assert_eq!(read_selected(&root).expect("read").as_deref(), Some("1.2.3"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_current_clears_selected() {
        let root = fresh_root("uninstall_current");
        std::fs::create_dir_all(installed_dir(&root).join("1.0.0")).expect("mkdir");
        std::fs::write(selected_file(&root), "1.0.0\n").expect("write selected");
        uninstall(&root, "1.0.0").await.expect("uninstall ok");
        assert_eq!(read_selected(&root).expect("read"), None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_missing_is_not_found() {
        let root = fresh_root("uninstall_missing");
        let err = uninstall(&root, "9.9.9").await.expect_err("should error");
        assert!(matches!(err, AppError::NotFound(_)));
        let _ = std::fs::remove_dir_all(&root);
    }

    /// get_version_status 仅在 read_selected 前置失败（selected.txt 为目录）时命中错误路径，
    /// 从而在不触碰真实 npm registry 的情况下覆盖错误处理。
    #[tokio::test]
    async fn get_version_status_offline_error_path() {
        let root = fresh_root("status_err");
        std::fs::create_dir_all(selected_file(&root)).expect("make selected a dir");
        let err = get_version_status(&root).await.expect_err("should error offline");
        assert!(matches!(err, AppError::Io(_)));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn ver_tokens_ignores_prerelease() {
        assert_eq!(ver_tokens("1.2.3"), vec![1, 2, 3]);
        assert_eq!(ver_tokens("1.2.3-alpha"), vec![1, 2, 3]);
        assert_eq!(ver_tokens("2.0.0"), vec![2, 0, 0]);
    }

    #[test]
    fn latest_is_newer_comparisons() {
        // 1.3.0 比 1.2.3 新
        assert!(latest_is_newer(&ver_tokens("1.2.3"), &ver_tokens("1.3.0")));
        assert!(!latest_is_newer(&ver_tokens("1.3.0"), &ver_tokens("1.2.3")));
        // 2.0.0 比 1.9.9 新
        assert!(latest_is_newer(&ver_tokens("1.9.9"), &ver_tokens("2.0.0")));
        assert!(!latest_is_newer(&ver_tokens("2.0.0"), &ver_tokens("2.0.0")));
        // 不同长度段：主段相同、次段缺省视作 0
        assert!(latest_is_newer(&ver_tokens("1.2"), &ver_tokens("1.2.1")));
    }
}
