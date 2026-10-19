use std::path::{Path, PathBuf};

use tokio::net::TcpStream;
use tokio::process::Command as TokioCommand;

use serde::{Deserialize, Serialize};

use adl_errors::AppError;

/// npm registry 上 @deepseek-ai/dsh 最新版本元数据端点（默认官方源）。
pub const REGISTRY_LATEST: &str = "https://registry.npmjs.org/@deepseek-ai/dsh/latest";

/// npm 上 dsh 包名（registry 路径段；catalog 查询用 `{base}/{DSH_PACKAGE}`）。
pub const DSH_PACKAGE: &str = "@deepseek-ai/dsh";

/// 按用户下载源配置拼接 registry 基址（尊重镜像；默认 registry.npmjs.org）。
/// 此前 `latest_available` 硬编码官方源，镜像用户查更新直连官方源，失败即误报“已是最新”。
fn registry_base(data_dir: &Path) -> Result<String, AppError> {
    let config = adl_download_source::load(data_dir)?;
    Ok(adl_download_source::resolve_registry(&config).trim_end_matches('/').to_string())
}

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
    /// 最新预发布版本（registry `next` 标签，缺失时回退为 semver 最大的预发布号）。
    /// `None` 表示查询失败或官方暂无预发布。
    pub prerelease_available: Option<String>,
    /// 当前选中版本是否有更新的预发布可尝试（尝鲜通道提示用；稳定更新仍看 `has_update`）。
    pub has_prerelease_update: bool,
}

/// 官方已发布版本条目（catalog 行）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VersionInfo {
    pub version: String,
    /// registry `time` 表中的发布时间（RFC3339），缺失为 None。
    pub published_at: Option<String>,
}

/// 官方版本目录：正式版与预发布分桶，各按 semver 降序。
/// 注意：当前 registry 的 `latest` 标签指向的也可能是 rc（如 `0.2.0-rc.2`），
/// 正式版桶可能为空——调用方须如实展示“暂无”，不得硬凑。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VersionCatalog {
    pub stable: Vec<VersionInfo>,
    pub prerelease: Vec<VersionInfo>,
    pub latest_stable: Option<String>,
    pub latest_prerelease: Option<String>,
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

/// 只读查询 registry 返回 dsh 最新可用版本（不下载）。
/// 按用户下载源配置走镜像（此前硬编码官方源，见 `registry_base` 注释）。
pub async fn latest_available(data_dir: &Path) -> Result<Option<String>, AppError> {
    let base = registry_base(data_dir)?;
    let download_config = adl_download_source::load(data_dir)?;
    let client = adl_download_source::build_http_client(&download_config)?;
    let url = format!("{base}/{DSH_PACKAGE}/latest");
    tracing::debug!(%url, "dsh-version: querying latest");
    let resp = client
        .get(url)
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

/// 从 packument JSON 拆出官方版本目录（纯函数，便于离线单测）。
/// `stable` = semver `pre` 为空；其余进 `prerelease`；各按 semver 降序。
/// `latest_stable` 优先取 `dist-tags.latest`（须落在正式版桶，否则回退桶首），
/// `latest_prerelease` 优先取 `dist-tags.next`（同理），再回退 `alpha`、桶首。
fn parse_catalog(json: &serde_json::Value) -> VersionCatalog {
    let empty_map = serde_json::Map::new();
    let versions = json.get("versions").and_then(|v| v.as_object()).unwrap_or(&empty_map);
    let times = json.get("time").and_then(|v| v.as_object());
    let mut stable: Vec<semver::Version> = Vec::new();
    let mut prerelease: Vec<semver::Version> = Vec::new();
    for name in versions.keys() {
        let Ok(parsed) = semver::Version::parse(name) else { continue };
        if parsed.pre.is_empty() {
            stable.push(parsed);
        } else {
            prerelease.push(parsed);
        }
    }
    stable.sort_by(|a, b| b.cmp(a));
    prerelease.sort_by(|a, b| b.cmp(a));
    let to_info = |v: &semver::Version| VersionInfo {
        version: v.to_string(),
        published_at: times
            .and_then(|t| t.get(&v.to_string()))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string()),
    };
    let stable_infos: Vec<VersionInfo> = stable.iter().map(to_info).collect();
    let prerelease_infos: Vec<VersionInfo> = prerelease.iter().map(to_info).collect();
    let tags = json.get("dist-tags");
    let tag_of =
        |tag: &str| tags.and_then(|t| t.get(tag)).and_then(|v| v.as_str()).map(|s| s.to_string());
    let in_stable = |v: &Option<String>| {
        v.as_ref().is_some_and(|s| stable_infos.iter().any(|i| &i.version == s))
    };
    let in_prerelease = |v: &Option<String>| {
        v.as_ref().is_some_and(|s| prerelease_infos.iter().any(|i| &i.version == s))
    };
    let tag_latest = tag_of("latest");
    let latest_stable = if in_stable(&tag_latest) {
        tag_latest
    } else {
        stable_infos.first().map(|i| i.version.clone())
    };
    let tag_next = tag_of("next");
    let latest_prerelease = if in_prerelease(&tag_next) {
        tag_next
    } else {
        let tag_alpha = tag_of("alpha");
        if in_prerelease(&tag_alpha) {
            tag_alpha
        } else {
            prerelease_infos.first().map(|i| i.version.clone())
        }
    };
    VersionCatalog {
        stable: stable_infos,
        prerelease: prerelease_infos,
        latest_stable,
        latest_prerelease,
    }
}

/// 只读查询 registry 返回官方版本目录（含正式版与预发布分桶，不下载）。
pub async fn fetch_catalog(data_dir: &Path) -> Result<VersionCatalog, AppError> {
    let base = registry_base(data_dir)?;
    let download_config = adl_download_source::load(data_dir)?;
    let client = adl_download_source::build_http_client(&download_config)?;
    let url = format!("{base}/{DSH_PACKAGE}");
    tracing::debug!(%url, "dsh-version: fetching version catalog");
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::Network(format!("query dsh catalog failed: {e}")))?;
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Network(format!("parse dsh catalog failed: {e}")))?;
    Ok(parse_catalog(&json))
}

/// semver 全量比较（含 pre 段）：`latest` 是否严格新于 `current`。
/// `current` 缺失（从未选中）且 `latest` 存在 → 视为有更新（与 `has_update` 旧语义对齐）。
fn semver_is_newer(current: Option<&str>, latest: Option<&str>) -> bool {
    match (current, latest) {
        (_, None) => false,
        (None, Some(_)) => true,
        (Some(cur), Some(lat)) => {
            match (semver::Version::parse(cur), semver::Version::parse(lat)) {
                (Ok(c), Ok(l)) => l > c,
                _ => false,
            }
        },
    }
}

/// 聚合查询版本目录状态（当前选中、已装列表、最新可用、是否有更新，含预发布通道）。
pub async fn get_version_status(root: &Path, data_dir: &Path) -> Result<VersionStatus, AppError> {
    let current_selected = read_selected(root)?;
    let installed = list_installed(root)?;
    let latest = latest_available(data_dir).await?;
    let has_update = match (&current_selected, &latest) {
        (Some(cur), Some(latest)) => {
            let cur_tokens = ver_tokens(cur);
            let lat_tokens = ver_tokens(latest);
            latest_is_newer(&cur_tokens, &lat_tokens)
        },
        (None, Some(_)) => true,
        _ => false,
    };
    // 预发布通道：catalog 失败（断网）时回退为“未知”（None/false），
    // 调用方须把“未知”与“无更新”区分展示，不得误报“已是最新”。
    let (prerelease_available, has_prerelease_update) = match fetch_catalog(data_dir).await {
        Ok(catalog) => {
            let pre = catalog.latest_prerelease.clone();
            let has = semver_is_newer(current_selected.as_deref(), pre.as_deref());
            tracing::debug!(
                ?pre,
                has_prerelease_update = has,
                "dsh-version: prerelease channel resolved"
            );
            (pre, has)
        },
        Err(e) => {
            tracing::debug!(error = %e, "dsh-version: catalog unavailable, prerelease unknown");
            (None, false)
        },
    };
    Ok(VersionStatus {
        current_selected,
        installed,
        latest_available: latest,
        has_update,
        prerelease_available,
        has_prerelease_update,
    })
}

/// 登记指定版本为已装并选中（“安装”的宿主侧语义）。
///
/// 诚实边界：本函数只“登记版本目录 + 记账”（创建 `installed/<version>/` 并写入 selected），
/// 实际的 dsh 程序体在下次 `open` 时由 `npx @deepseek-ai/dsh@<version>` 按需拉取，
/// 不做二进制下载/解压。调用前须确认版本在官方确已存在（`install_version` 已做），
/// 避免登记一个拉不起来的版本号。
async fn register_version(root: &Path, version: &str) -> Result<String, AppError> {
    let dir = installed_dir(root).join(version);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Io(format!("create {}: {e}", dir.display())))?;
    tokio::fs::write(selected_file(root), format!("{version}\n"))
        .await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    Ok(version.to_string())
}

/// 升级：把最新版本登记为已装版本目录并写入 selected。
pub async fn update(root: &Path, data_dir: &Path) -> Result<String, AppError> {
    let latest = latest_available(data_dir)
        .await?
        .ok_or_else(|| AppError::Network("no latest version available".into()))?;
    tracing::debug!(%latest, "dsh-version: update to latest");
    register_version(root, &latest).await
}

/// 安装指定版本（正式版或预发布均可）：先校验版本号合法且官方确已发布，
/// 再登记并选中。`open` 下次拉起即按该版本启动。
pub async fn install_version(
    root: &Path,
    data_dir: &Path,
    version: &str,
) -> Result<String, AppError> {
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    let catalog = fetch_catalog(data_dir).await?;
    let published = catalog.stable.iter().any(|i| i.version == version)
        || catalog.prerelease.iter().any(|i| i.version == version);
    if !published {
        return Err(AppError::NotFound(format!("version {version} is not published upstream")));
    }
    tracing::debug!(%version, "dsh-version: installing published version");
    register_version(root, version).await
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

/// 重装：按当前选中版本重新登记并选中（校验官方仍在发布；版本已下架则报错）。
/// 语义为“修当前版本”，不是“升到最新”（升级走 `update`）。
pub async fn reinstall(root: &Path, data_dir: &Path) -> Result<String, AppError> {
    let selected =
        read_selected(root)?.ok_or_else(|| AppError::NotFound("no selected version".into()))?;
    install_version(root, data_dir, &selected).await
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
/// 当前**不**检测版本号（`dsh --version` 约 1.5s，仅用于展示），故 `version` 恒为 `None`。
pub async fn detect_system_dsh() -> Option<SystemDshInfo> {
    let which_result = if cfg!(target_os = "windows") {
        TokioCommand::new("where").arg("dsh").output().await
    } else {
        TokioCommand::new("which").arg("dsh").output().await
    };

    let output = match which_result {
        Ok(o) if o.status.success() => o,
        _ => return None,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next()?.trim();
    let path = PathBuf::from(first_line);

    // 不检测版本（见函数文档），version 恒为 None。
    Some(SystemDshInfo { path, version: None })
}

/// Detect whether a dsh server is already running on `port`.
///
/// 1. Probe `TcpStream::connect` to confirm the port is listening.
/// 2. HTTP GET `http://127.0.0.1:{port}/` and check for a dsh-related response
///    (status 200 and body not empty).
///
/// 全异步实现：调用方运行在 ad-server 的 tokio 运行时内，绝不可使用
/// `reqwest::blocking`（其内部会在异步上下文里构建并 drop 一个 runtime，
/// debug 构建下 tokio 直接 panic，导致 handler 连接被重置）。
pub async fn detect_running_dsh(port: u16) -> Option<RunningDshInfo> {
    let addr = format!("127.0.0.1:{port}");
    // 快速 TCP 探测（100ms，与 `webapp-host::check_port_fast` 对齐）：本机端口若被防火墙
    // 黑洞（SYN 无响应），裸 connect 会退化到 OS 默认超时（Windows ~21s），拖住 `/dsh/open`。
    let connected =
        tokio::time::timeout(std::time::Duration::from_millis(100), TcpStream::connect(&addr))
            .await
            .is_ok_and(|r| r.is_ok());
    if !connected {
        return None;
    }

    let url = format!("http://{addr}/");
    // 探测目标是本机 loopback：显式禁用代理（含系统代理），避免配置了系统代理的环境
    // 把 127.0.0.1 请求路由到代理而误判 dsh 未运行。
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_millis(500))
        .build()
        .ok()?;

    let resp = client.get(&url).send().await.ok()?;
    let status = resp.status();
    let body = resp.text().await.ok()?;
    // 需认证的本地应用在未带 token/cookie 的裸 `/` 上返回 401 + 指纹文案
    //（dsh 见 `adl_webapp_host::DSH_AUTH_REQUIRED_BODY`），此时进程确实在运行
    //（已就绪），必须视为 running，否则每次都会误判为未运行而重复 spawn
    // 撞上 EADDRINUSE。指纹匹配表由 `adl_webapp_host::is_auth_required_body` 统一维护，
    // 未来其它站点追加指纹时此处无需改动。
    if status == reqwest::StatusCode::UNAUTHORIZED && adl_webapp_host::is_auth_required_body(&body)
    {
        return Some(RunningDshInfo { url, port });
    }
    if !status.is_success() {
        return None;
    }

    if body.is_empty() {
        return None;
    }

    Some(RunningDshInfo { url, port })
}

const DSH_DEFAULT_PORT: u16 = 3080;

/// Select the best available dsh source, in priority order:
///
/// 1. Already running (port 3080)
/// 2. System-installed (`dsh` on PATH)
/// 3. Bundled (via `adl-dsh-bundle`)
/// 4. Download (fallback — no local copy available)
pub async fn select_dsh_source(
    data_dir: &Path,
    bundled: Option<&adl_dsh_bundle::BundledDsh>,
) -> DshSource {
    if let Some(running) = detect_running_dsh(DSH_DEFAULT_PORT).await {
        return DshSource::ReuseRunning { url: running.url, port: running.port };
    }

    if let Some(info) = detect_system_dsh().await {
        return DshSource::System { info };
    }

    if let Some(b) = bundled {
        return DshSource::Bundled { bundled: b.clone() };
    }

    // Read selected version from dsh-versions directory
    let root = data_dir.join("dsh-versions");
    let version = read_selected(&root).ok().flatten();
    DshSource::Download { version }
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
        let data_dir = fresh_root("status_err_data");
        std::fs::create_dir_all(selected_file(&root)).expect("make selected a dir");
        let err = get_version_status(&root, &data_dir).await.expect_err("should error offline");
        assert!(matches!(err, AppError::Io(_)));
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&data_dir);
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

    fn catalog_fixture() -> serde_json::Value {
        serde_json::json!({
            "dist-tags": { "latest": "0.2.0", "next": "0.2.1-rc.2", "alpha": "0.2.1-alpha.5" },
            "versions": {
                "0.1.0": {},
                "0.2.0": {},
                "0.2.0-rc.2": {},
                "0.2.1-alpha.5": {},
                "0.2.1-rc.1": {},
                "0.2.1-rc.2": {},
                "not-a-version": {}
            },
            "time": {
                "0.1.0": "2026-08-20T10:00:00.000Z",
                "0.2.0": "2026-09-29T09:56:27.000Z",
                "0.2.1-rc.2": "2026-10-17T08:36:31.000Z"
            }
        })
    }

    #[test]
    fn parse_catalog_splits_stable_and_prerelease_desc() {
        let catalog = parse_catalog(&catalog_fixture());
        let stable: Vec<&str> = catalog.stable.iter().map(|i| i.version.as_str()).collect();
        let pre: Vec<&str> = catalog.prerelease.iter().map(|i| i.version.as_str()).collect();
        assert_eq!(stable, vec!["0.2.0", "0.1.0"]);
        assert_eq!(pre, vec!["0.2.1-rc.2", "0.2.1-rc.1", "0.2.1-alpha.5", "0.2.0-rc.2"]);
        assert_eq!(catalog.latest_stable.as_deref(), Some("0.2.0"));
        assert_eq!(catalog.latest_prerelease.as_deref(), Some("0.2.1-rc.2"));
        assert_eq!(
            catalog
                .stable
                .iter()
                .find(|i| i.version == "0.2.0")
                .and_then(|i| i.published_at.as_deref()),
            Some("2026-09-29T09:56:27.000Z")
        );
        // time 缺失的版本 published_at 为 None，不阻断解析
        assert!(
            catalog
                .prerelease
                .iter()
                .find(|i| i.version == "0.2.1-rc.1")
                .and_then(|i| i.published_at.as_ref())
                .is_none()
        );
    }

    #[test]
    fn parse_catalog_prefers_dist_tags_with_bucket_fallback() {
        // latest 标签指向 rc 时不落正式版桶，回退桶首
        let json = serde_json::json!({
            "dist-tags": { "latest": "0.2.0-rc.2" },
            "versions": { "0.1.0": {}, "0.2.0-rc.2": {} },
            "time": {}
        });
        let catalog = parse_catalog(&json);
        assert_eq!(catalog.latest_stable.as_deref(), Some("0.1.0"));
        // 无 next/alpha 标签时回退预发布桶首
        assert_eq!(catalog.latest_prerelease.as_deref(), Some("0.2.0-rc.2"));
    }

    #[test]
    fn semver_is_newer_handles_prerelease_ordering() {
        assert!(semver_is_newer(Some("0.2.0"), Some("0.2.1-rc.2")));
        assert!(semver_is_newer(Some("0.2.0-rc.2"), Some("0.2.0")));
        assert!(!semver_is_newer(Some("0.2.1-rc.2"), Some("0.2.1-rc.2")));
        assert!(!semver_is_newer(Some("0.2.1-rc.2"), Some("0.2.1-rc.1")));
        assert!(semver_is_newer(None, Some("0.1.0")));
        assert!(!semver_is_newer(Some("0.1.0"), None));
        assert!(!semver_is_newer(Some("bogus"), Some("0.1.0")));
    }

    /// 非法版本号在触网前即被拒绝（离线可测）。
    #[tokio::test]
    async fn install_version_rejects_invalid_semver_offline() {
        let root = fresh_root("install_bad");
        let data_dir = fresh_root("install_bad_data");
        let err =
            install_version(&root, &data_dir, "not-a-version").await.expect_err("should error");
        assert!(matches!(err, AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&data_dir);
    }
}
