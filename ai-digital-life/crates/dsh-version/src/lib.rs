use std::path::{Path, PathBuf};

use tokio::net::TcpStream;
use tokio::process::Command as TokioCommand;

use serde::{Deserialize, Serialize};

use adl_errors::AppError;

pub mod install;
pub mod task;

pub use task::{TaskReporter, VersionTask, VersionTaskKind, VersionTaskPhase};

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
/// 作用域硬边界：只读写宿主版本目录 `<root>`（`selected.txt` + `installed/<version>/`
/// + `bundled.txt`），绝不写入/改动 dsh 自身的会话/配置/插件目录。
///
/// 内置版本没有独立概念：安装包投放的内置包在服务启动时被收编成 `installed/<version>/`
/// 下的一条普通版本（收编逻辑在 `adl-dsh-bundle` crate），`bundled.txt` 只记录「它当初是
/// 内置预置的」这一来源事实，其余行为与其它已装版本完全一致。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionStatus {
    pub current_selected: Option<String>,
    /// 已安装到 `installed/<version>/` 的版本（含安装包预置、之后被收编的那一份）。
    pub installed: Vec<String>,
    /// 内置预置版本号（来源记录 `bundled.txt`）；该版本被卸载或重装后即消失。
    /// 仅供 UI 标「已内置 / 内置」徽章，不参与任何来源判定。
    pub bundled_version: Option<String>,
    /// 最新正式版（catalog 正式版桶最大；失败回退时为 dist-tag `latest`，可能为预发布）。
    pub latest_available: Option<String>,
    /// 是否有更新的正式版（统一走 semver 比较，不再用忽略 pre 后缀的 tokens 口径）。
    pub has_update: bool,
    /// 最新预发布版本（registry `next` 标签，缺失时回退为 semver 最大的预发布号）。
    /// `None` 表示官方暂无预发布或查询失败（见 `prerelease_unknown` 区分）。
    pub prerelease_available: Option<String>,
    /// 当前选中版本是否有更新的预发布可尝试（尝鲜通道提示用）。
    pub has_prerelease_update: bool,
    /// 预发布通道是否未知（catalog 拉取失败；此时不得按“暂无预发布”展示）。
    pub prerelease_unknown: bool,
}

/// 官方已发布版本条目（catalog 行）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub version: String,
    /// registry `time` 表中的发布时间（RFC3339），缺失为 None。
    pub published_at: Option<String>,
}

/// 官方版本目录：正式版与预发布分桶，各按 semver 降序。
/// 注意：当前 registry 的 `latest` 标签指向的也可能是 rc（如 `0.2.0-rc.2`），
/// 正式版桶可能为空——调用方须如实展示“暂无”，不得硬凑。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionCatalog {
    pub stable: Vec<VersionInfo>,
    pub prerelease: Vec<VersionInfo>,
    pub latest_stable: Option<String>,
    pub latest_prerelease: Option<String>,
}

pub(crate) fn selected_file(root: &Path) -> PathBuf {
    root.join("selected.txt")
}

pub(crate) fn installed_dir(root: &Path) -> PathBuf {
    root.join("installed")
}

/// 宿主版本可执行入口（真安装后的 bin.js）。
pub fn host_bin(root: &Path, version: &str) -> PathBuf {
    installed_dir(root)
        .join(version)
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("lib")
        .join("bin.js")
}

/// 宿主版本是否完整安装（以 bin.js 存在为准；空目录不算已安装）。
pub fn is_host_version_installed(root: &Path, version: &str) -> bool {
    host_bin(root, version).is_file()
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

/// 内置来源记录文件名（位于版本目录根，与 `selected.txt` 同级）。
///
/// 只记「这个版本号当初是由安装包预置的」；它是 UI「已内置/内置」徽章的唯一依据。
/// 用户卸载该版本、或重装/重新安装覆盖其内容后即删除记录——之后它只是一条普通
/// 宿主版本，不再算内置（用户 2026-10-22 要求）。
const BUNDLED_FILE: &str = "bundled.txt";

/// 读取内置来源记录；该版本已不完整存在时视为无记录。
pub fn read_bundled_version(root: &Path) -> Result<Option<String>, AppError> {
    let path = root.join(BUNDLED_FILE);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Ok(None);
    };
    let version = raw.trim().to_string();
    if version.is_empty() || !is_host_version_installed(root, &version) {
        return Ok(None);
    }
    Ok(Some(version))
}

/// 写入内置来源记录（收编内置包时调用一次）。
pub async fn set_bundled_version(root: &Path, version: &str) -> Result<(), AppError> {
    tokio::fs::create_dir_all(root)
        .await
        .map_err(|e| AppError::Io(format!("create version root: {e}")))?;
    tokio::fs::write(root.join(BUNDLED_FILE), format!("{version}\n"))
        .await
        .map_err(|e| AppError::Io(format!("write bundled marker: {e}")))
}

/// 内容被覆盖（重装/重新安装）或版本被卸载时清除来源记录：内置状态随之结束。
pub fn clear_bundled_version_if(root: &Path, version: &str) -> Result<(), AppError> {
    let path = root.join(BUNDLED_FILE);
    match std::fs::read_to_string(&path) {
        Ok(raw) if raw.trim() == version => std::fs::remove_file(&path)
            .map_err(|e| AppError::Io(format!("remove bundled marker: {e}"))),
        _ => Ok(()),
    }
}

pub(crate) fn list_installed(root: &Path) -> Result<Vec<String>, AppError> {
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
        .filter(|v| is_host_version_installed(root, v))
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

/// 已装版本中的最高语义版本（不依赖 `list_installed` 的排序方向，
/// 调用方不得用 `.next()` 隐含假设顺序）。
pub(crate) fn highest_installed(root: &Path) -> Result<Option<String>, AppError> {
    Ok(list_installed(root)?.into_iter().max_by(|a, b| {
        let na = semver::Version::parse(a)
            .unwrap_or_else(|_| semver::Version::parse("0.0.0").expect("0.0.0 parses"));
        let nb = semver::Version::parse(b)
            .unwrap_or_else(|_| semver::Version::parse("0.0.0").expect("0.0.0 parses"));
        na.cmp(&nb)
    }))
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
/// 返回 dist-tag `latest` 的指向（注意：它本身可能是 rc；正式版口径见 catalog）。
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
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(format!("query dsh latest failed: HTTP {status}")));
    }
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
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(format!("query dsh catalog failed: HTTP {status}")));
    }
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

/// 从 catalog 解析出“最新正式版”（纯函数，便于离线单测）。
/// 优先 catalog 正式版桶最大；桶为空时，若 dist-tag `latest` 本身是正式版则回退用它，
/// 否则为 None（调用方如实展示“暂无正式版”，升级入口隐藏）。
fn resolve_stable_latest(
    catalog: &VersionCatalog,
    dist_tag_latest: Option<&str>,
) -> Option<String> {
    if let Some(s) = &catalog.latest_stable {
        return Some(s.clone());
    }
    match dist_tag_latest {
        Some(t) if semver::Version::parse(t).is_ok_and(|v| v.pre.is_empty()) => Some(t.to_string()),
        _ => None,
    }
}

/// 聚合查询版本目录状态（当前选中、已装列表、最新正式版/预发布、是否有更新）。
///
/// catalog 拉取成功时：`latest_available` = 最新正式版，`has_update` 走 semver 全量比较，
/// 预发布通道同理，`prerelease_unknown = false`。
/// catalog 拉取失败时（如断网/镜像不可达）：稳定通道回退旧口径（dist-tag + tokens 比较），
/// 预发布通道置“未知”（`prerelease_available=None + prerelease_unknown=true`，
/// 调用方不得展示“暂无”）。两路皆失败时返回 `Err(Network)`（保留旧离线契约）。
pub async fn get_version_status(root: &Path, data_dir: &Path) -> Result<VersionStatus, AppError> {
    let current_selected = read_selected(root)?;
    let installed = list_installed(root)?;
    // 内置仅表示「该版本号由安装包预置」：记录存在且版本仍完整安装才算，
    // 卸载或重装覆盖后记录即被清除（不再算内置）。
    let bundled_version = read_bundled_version(root)?;
    let dist_latest = latest_available(data_dir).await.ok().flatten();
    match fetch_catalog(data_dir).await {
        Ok(catalog) => {
            let latest = resolve_stable_latest(&catalog, dist_latest.as_deref());
            let has_update = semver_is_newer(current_selected.as_deref(), latest.as_deref());
            let pre = catalog.latest_prerelease.clone();
            let has_pre = semver_is_newer(current_selected.as_deref(), pre.as_deref());
            tracing::debug!(
                ?latest,
                has_update,
                ?pre,
                has_prerelease_update = has_pre,
                ?bundled_version,
                "dsh-version: version status resolved"
            );
            Ok(VersionStatus {
                current_selected,
                installed,
                bundled_version,
                latest_available: latest,
                has_update,
                prerelease_available: pre,
                has_prerelease_update: has_pre,
                prerelease_unknown: false,
            })
        },
        Err(e) => {
            tracing::debug!(error = %e, "dsh-version: catalog unavailable");
            match dist_latest {
                Some(latest) => {
                    // 降级口径（旧逻辑）：tokens 比较，忽略 pre 后缀。
                    let has_update = match &current_selected {
                        Some(cur) => latest_is_newer(&ver_tokens(cur), &ver_tokens(&latest)),
                        None => true,
                    };
                    Ok(VersionStatus {
                        current_selected,
                        installed,
                        bundled_version,
                        latest_available: Some(latest),
                        has_update,
                        prerelease_available: None,
                        has_prerelease_update: false,
                        prerelease_unknown: true,
                    })
                },
                None => Err(AppError::Network(format!("version status unavailable: {e}"))),
            }
        },
    }
}

/// 升级：安装最新正式版并选中。
/// 正式版取自 catalog（`latest` dist-tag 可能指向 rc，不能直接当稳定版用）；
/// catalog 不可达时回退 dist-tag（旧行为），两者皆无则报错。
pub async fn update(root: &Path, data_dir: &Path) -> Result<String, AppError> {
    update_with_task(root, data_dir, &TaskReporter::new()).await
}

pub async fn update_with_task(
    root: &Path,
    data_dir: &Path,
    task: &TaskReporter,
) -> Result<String, AppError> {
    let target = match fetch_catalog(data_dir).await {
        Ok(catalog) => resolve_stable_latest(&catalog, None),
        Err(e) => {
            tracing::debug!(error = %e, "dsh-version: update falls back to dist-tag latest");
            latest_available(data_dir).await.ok().flatten()
        },
    }
    .ok_or_else(|| AppError::NotFound("no stable release published upstream".into()))?;
    tracing::debug!(%target, "dsh-version: update to latest stable");
    task.set_version(&target);
    install::install(root, data_dir, &target, task, true).await
}

/// 安装指定版本（正式版或预发布均可）：校验版本号与官方发布状态，
/// 真下载到 `installed/<version>/`；select=true 时并选中（默认语义）。
pub async fn install_version(
    root: &Path,
    data_dir: &Path,
    version: &str,
) -> Result<String, AppError> {
    install_version_with_task(root, data_dir, version, &TaskReporter::new(), true).await
}

pub async fn install_version_with_task(
    root: &Path,
    data_dir: &Path,
    version: &str,
    task: &TaskReporter,
    select: bool,
) -> Result<String, AppError> {
    tracing::debug!(%version, select, "dsh-version::install_version: delegating to kernel");
    install::install(root, data_dir, version, task, select).await
}

/// 回退/切换：校验版本号并确认已完整安装后，把该版本写入 selected。
pub async fn revert(root: &Path, version: &str) -> Result<String, AppError> {
    tracing::debug!(%version, "dsh-version::revert: request");
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    if !is_host_version_installed(root, version) {
        tracing::debug!(%version, "dsh-version::revert: rejected (not installed)");
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    tokio::fs::write(selected_file(root), format!("{version}\n"))
        .await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    tracing::debug!(%version, "dsh-version::revert: selected written");
    Ok(version.to_string())
}

/// 卸载：删除 `installed/<version>/`；若恰好是当前选中版本，自动改选剩余最高
/// 已装版本，没有剩余则清空 selected。该版本若是内置预置的，来源记录一并删除
/// （卸载后它不再算内置）。
pub async fn uninstall_with_task(
    root: &Path,
    version: &str,
    task: &TaskReporter,
) -> Result<(), AppError> {
    tracing::debug!(%version, "dsh-version::uninstall: delegating to kernel");
    install::uninstall(root, version, task).await?;
    // 版本已删成功：来源记录清不掉不该让卸载报错（否则 UI 显示失败但磁盘已改）。
    if let Err(e) = clear_bundled_version_if(root, version) {
        tracing::warn!(%version, error = %e, "dsh-version::uninstall: clear bundled marker failed");
    }
    Ok(())
}

/// 重装：真重新安装当前选中版本，保持选中状态。
/// 语义为“修当前版本”，不是“升到最新”（升级走 `update`）。
pub async fn reinstall(root: &Path, data_dir: &Path) -> Result<String, AppError> {
    reinstall_with_task(root, data_dir, &TaskReporter::new()).await
}

pub async fn reinstall_with_task(
    root: &Path,
    data_dir: &Path,
    task: &TaskReporter,
) -> Result<String, AppError> {
    let selected =
        read_selected(root)?.ok_or_else(|| AppError::NotFound("no selected version".into()))?;
    tracing::debug!(version = %selected, "dsh-version::reinstall: reinstalling selected");
    install::install(root, data_dir, &selected, task, true).await
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
    HostInstalled { version: String, bin: PathBuf },
    System { info: SystemDshInfo },
    None,
}

/// 解析后的实际来源（供 UI 展示与来源选择）。
///
/// 内置版本不单列：它由安装包预置并收编成一条普通宿主版本，归属与其它已装版本
/// 完全相同，「是否内置」只由 [`read_bundled_version`] 的来源记录决定，与启动链路无关。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EffectiveSource {
    Running,
    Host,
    System,
    None,
}

/// 来源优先级解析（纯函数，便于离线单测）。
///
/// `running` 恒优先：3080 上已有经指纹验证的 dsh 时无法再起第二个，只能复用。
/// 其余来源按用户偏好决定；`auto` 为 宿主 > 系统 > 无。
pub fn resolve_effective_source(
    mode: adl_download_source::VersionSourceMode,
    has_running: bool,
    has_host: bool,
    has_system: bool,
) -> EffectiveSource {
    use adl_download_source::VersionSourceMode as Mode;
    if has_running {
        return EffectiveSource::Running;
    }
    match mode {
        Mode::System => {
            if has_system {
                EffectiveSource::System
            } else {
                EffectiveSource::None
            }
        },
        Mode::Host => {
            if has_host {
                EffectiveSource::Host
            } else {
                EffectiveSource::None
            }
        },
        Mode::Auto => {
            if has_host {
                EffectiveSource::Host
            } else if has_system {
                EffectiveSource::System
            } else {
                EffectiveSource::None
            }
        },
    }
}

/// dsh 响应指纹：401 鉴权文案，或已鉴权页面的产品标题。
/// 取舍说明（有意设计）：2xx 要求精确标题串，误判普通页面（旧事故）已消除，
/// 代价是 dsh 改版标题即漏检；漏检后果可控——调用方会尝试重起并撞端口，
/// 端口占用路径（free_stale + freedPort 提示）会自愈，不会静默双跑。
pub fn is_dsh_http_response(status: u16, body: &str) -> bool {
    (status == 401 && adl_webapp_host::is_auth_required_body(body))
        || ((200..300).contains(&status) && body.contains("DeepSeek Harness"))
}

/// Scan the system PATH for a `dsh` command.
///
/// - Windows: `where dsh`
/// - Unix: `which dsh`
///
/// 版本号经 `dsh --version` 懒检测（本机实测约 0.3s；2.5s 超时，失败/超时则为 `None`，
/// UI 按“版本未知”诚实展示，不编造）。结果按进程缓存一次：系统级安装在会话内几乎
/// 不变，每次 `source-status` 都重跑子进程纯属浪费；测试进程如需隔离，改调纯函数
/// `parse_dsh_version_output`（见单测），不要依赖此缓存。
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

    let version = cached_system_dsh_version(&path).await;
    Some(SystemDshInfo { path, version })
}

/// 会话级缓存的系统 dsh 版本号：探测到的 path 配其版本（`None` = 该 path
/// 检测过但未知）；整体 `None` = 未检测过。
/// 缓存键带 path：同一会话内 PATH 变化导致 `where dsh` 首行改变时重探，
/// 避免“新 path 配旧版本”的错配展示（R1-M1）。
type SystemVersionCache =
    std::sync::OnceLock<tokio::sync::Mutex<Option<(PathBuf, Option<String>)>>>;
static SYSTEM_DSH_VERSION_CACHE: SystemVersionCache = std::sync::OnceLock::new();

async fn cached_system_dsh_version(path: &Path) -> Option<String> {
    let slot = SYSTEM_DSH_VERSION_CACHE.get_or_init(|| tokio::sync::Mutex::new(None));
    {
        let cached = slot.lock().await;
        if let Some((cached_path, version)) = cached.as_ref() {
            if cached_path == path {
                tracing::debug!("dsh-version: system version cache HIT");
                return version.clone();
            }
            tracing::debug!(
                cached_path = %cached_path.display(),
                probed_path = %path.display(),
                "dsh-version: system path changed — re-probing dsh --version",
            );
        }
    }
    tracing::debug!("dsh-version: system version cache MISS — probing dsh --version");
    let probed = probe_dsh_version(path).await;
    *slot.lock().await = Some((path.to_path_buf(), probed.clone()));
    probed
}

/// `--version` 探测候选（纯函数，便于单测）：Windows 上 npm 系安装首行常为无后缀
/// shim（如 `…\node_global\dsh`），直接 spawn 报 193（`%1 不是有效的 Win32 应用程序`）；
/// 与 `webapp-host::spawn_capturing` 同口径追加 `.cmd` 回退。去重保序，原 path 优先。
pub fn system_probe_candidates(path: &Path) -> Vec<PathBuf> {
    let mut out = vec![path.to_path_buf()];
    #[cfg(target_os = "windows")]
    {
        let raw = path.to_string_lossy();
        if !raw.ends_with(".cmd") {
            let fallback = PathBuf::from(format!("{raw}.cmd"));
            if fallback != out[0] {
                out.push(fallback);
            }
        }
    }
    out
}

/// 逐候选跑一次 `dsh --version` 并解析（每候选 2.5s 超时；全部失败一律 `None`，
/// 调用方按未知展示）。不直接复用 PATH：显式用探测到的 `path` 派生候选，
/// 避免 `where` 与执行时解析到不同副本。
async fn probe_dsh_version(path: &Path) -> Option<String> {
    for candidate in system_probe_candidates(path) {
        let output = tokio::time::timeout(
            std::time::Duration::from_millis(2500),
            TokioCommand::new(&candidate).arg("--version").output(),
        )
        .await;
        let parsed = match output {
            Ok(Ok(o)) if o.status.success() => {
                parse_dsh_version_output(&String::from_utf8_lossy(&o.stdout))
            },
            _ => None,
        };
        tracing::debug!(candidate = %candidate.display(), parsed = ?parsed, "dsh-version: system version probed");
        if parsed.is_some() {
            return parsed;
        }
    }
    // 全候选失败（未安装/超时/不可解析/193 全灭）：warn 汇总，调用方按未知展示。
    // 会话缓存限频（同 path 每进程只到这里一次），不会刷屏（R1-L3）。
    tracing::warn!(path = %path.display(), "dsh-version: dsh --version probe failed for all candidates");
    None
}

/// 解析 `dsh --version` 输出（纯函数，便于离线单测）。
/// 实测为裸版本号（如 `0.2.0-rc.2`）；兼容 `dsh vX.Y.Z` / `X.Y.Z ...` 等前后缀形态：
/// 整串 trim 后先整体试 semver，不成则按空白切 token 逐个试，首个合法即返回原文 token。
pub fn parse_dsh_version_output(output: &str) -> Option<String> {
    let trimmed = output.trim();
    let whole = trimmed.strip_prefix('v').unwrap_or(trimmed);
    if semver::Version::parse(whole).is_ok() {
        return Some(whole.to_string());
    }
    for token in trimmed.split_whitespace() {
        let t = token.trim();
        let candidate = t.strip_prefix('v').unwrap_or(t).trim_end_matches([',', ';', ')']);
        if semver::Version::parse(candidate).is_ok() {
            return Some(candidate.to_string());
        }
    }
    None
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
    let status = resp.status().as_u16();
    let body = resp.text().await.ok()?;
    if !is_dsh_http_response(status, &body) {
        return None;
    }

    Some(RunningDshInfo { url, port })
}

/// 按来源偏好与已检测到的库存选择实际来源。
///
/// 顺序：运行中（恒优先）→ 宿主（选中且完整安装）→ 系统 → 无。
/// 内置版本已是普通宿主版本，故此处没有任何内置特例分支。
pub fn select_dsh_source(
    root: &Path,
    mode: adl_download_source::VersionSourceMode,
    running: Option<RunningDshInfo>,
    system: Option<SystemDshInfo>,
) -> DshSource {
    let host_version = read_selected(root)
        .ok()
        .flatten()
        .filter(|version| is_host_version_installed(root, version));
    let effective =
        resolve_effective_source(mode, running.is_some(), host_version.is_some(), system.is_some());
    match effective {
        EffectiveSource::Running => {
            let running = running.expect("running source requires running info");
            DshSource::ReuseRunning { url: running.url, port: running.port }
        },
        EffectiveSource::Host => {
            let version = host_version.expect("host source requires installed version");
            let bin = host_bin(root, &version);
            DshSource::HostInstalled { version, bin }
        },
        EffectiveSource::System => {
            DshSource::System { info: system.expect("system source requires system info") }
        },
        EffectiveSource::None => DshSource::None,
    }
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

    /// 内置只是「来源记录」：记录存在且版本完整安装时才对外报告为内置。
    #[test]
    fn bundled_marker_requires_complete_install_and_clears_on_match() {
        let root = fresh_root("bundled_marker");
        std::fs::create_dir_all(&root).expect("mkdir root");
        // 记录在、版本不存在 → 视为无内置。
        std::fs::write(root.join("bundled.txt"), "2.0.0\n").expect("write marker");
        assert_eq!(read_bundled_version(&root).expect("read"), None);
        // 版本完整安装 → 报告为内置。
        let lib = root.join("installed").join("2.0.0").join("node_modules/@deepseek-ai/dsh/lib");
        std::fs::create_dir_all(&lib).expect("mkdir");
        std::fs::write(lib.join("bin.js"), "").expect("write bin");
        assert_eq!(read_bundled_version(&root).expect("read").as_deref(), Some("2.0.0"));
        // 其它版本被覆盖/卸载不影响本记录。
        clear_bundled_version_if(&root, "1.0.0").expect("clear other");
        assert_eq!(read_bundled_version(&root).expect("read").as_deref(), Some("2.0.0"));
        // 命中记录 → 清除（重装覆盖 / 卸载后不再算内置）。
        clear_bundled_version_if(&root, "2.0.0").expect("clear");
        assert_eq!(read_bundled_version(&root).expect("read"), None);
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
        let lib = root.join("installed").join("1.2.3").join("node_modules/@deepseek-ai/dsh/lib");
        std::fs::create_dir_all(&lib).expect("mkdir");
        std::fs::write(lib.join("bin.js"), "").expect("write bin");
        revert(&root, "1.2.3").await.expect("revert ok");
        assert_eq!(read_selected(&root).expect("read").as_deref(), Some("1.2.3"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_current_selects_highest_remaining() {
        let root = fresh_root("uninstall_pick");
        for version in ["1.0.0", "2.0.0"] {
            let lib =
                root.join("installed").join(version).join("node_modules/@deepseek-ai/dsh/lib");
            std::fs::create_dir_all(&lib).expect("mkdir");
            std::fs::write(lib.join("bin.js"), "").expect("write bin");
        }
        std::fs::write(selected_file(&root), "2.0.0\n").expect("write selected");
        uninstall_with_task(&root, "2.0.0", &TaskReporter::new()).await.expect("uninstall ok");
        assert_eq!(read_selected(&root).expect("read").as_deref(), Some("1.0.0"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_current_clears_selected() {
        let root = fresh_root("uninstall_current");
        std::fs::create_dir_all(installed_dir(&root).join("1.0.0")).expect("mkdir");
        std::fs::write(selected_file(&root), "1.0.0\n").expect("write selected");
        uninstall_with_task(&root, "1.0.0", &TaskReporter::new()).await.expect("uninstall ok");
        assert_eq!(read_selected(&root).expect("read"), None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_missing_is_not_found() {
        let root = fresh_root("uninstall_missing");
        let err = uninstall_with_task(&root, "9.9.9", &TaskReporter::new())
            .await
            .expect_err("should error");
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

    #[test]
    fn resolve_stable_latest_prefers_catalog_bucket() {
        let catalog = parse_catalog(&catalog_fixture());
        // 正式版桶首（0.2.0），即使 dist-tag latest 指向同一版本也一致。
        assert_eq!(resolve_stable_latest(&catalog, Some("0.2.0")).as_deref(), Some("0.2.0"));
        // dist-tag 指向 rc 时不被采用（须落在正式版桶）。
        assert_eq!(resolve_stable_latest(&catalog, Some("0.2.1-rc.2")).as_deref(), Some("0.2.0"));
        // 桶空 + dist-tag 为正式版 → 回退采用。
        let mut empty = parse_catalog(&catalog_fixture());
        empty.stable.clear();
        empty.latest_stable = None;
        assert_eq!(resolve_stable_latest(&empty, Some("0.2.0")).as_deref(), Some("0.2.0"));
        // 桶空 + dist-tag 为 rc/缺失 → 无正式版。
        assert_eq!(resolve_stable_latest(&empty, Some("0.2.1-rc.2")), None);
        assert_eq!(resolve_stable_latest(&empty, None), None);
    }

    /// 非法版本号在触网前即被拒绝（离线可测；首尾空格先 trim 再判）。
    #[tokio::test]
    async fn install_version_rejects_invalid_semver_offline() {
        let root = fresh_root("install_bad");
        let data_dir = fresh_root("install_bad_data");
        let err =
            install_version(&root, &data_dir, "not-a-version").await.expect_err("should error");
        assert!(matches!(err, AppError::InvalidInput(_)));
        let err = install_version(&root, &data_dir, "  bogus!!  ").await.expect_err("should error");
        assert!(matches!(err, AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&data_dir);
    }

    /// catalog 拉取失败但 dist-tag 成功时预发布通道标记未知（离线可测：本地 stub）。
    /// 代理显式关闭（proxy.mode=none），不依赖机器代理环境。
    #[tokio::test]
    async fn get_version_status_catalog_failure_marks_prerelease_unknown() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind stub");
        let port = listener.local_addr().expect("addr").port();
        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let Ok((mut socket, _)) = listener.accept().await else { break };
                let mut buf = vec![0u8; 4096];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let first = String::from_utf8_lossy(&buf[..n])
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                if first.contains("/latest") {
                    let body = r#"{"version":"0.2.0"}"#;
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    socket.write_all(resp.as_bytes()).await.ok();
                } else {
                    socket
                        .write_all(b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n")
                        .await
                        .ok();
                }
            }
        });
        let root = fresh_root("status_partial");
        let data_dir = fresh_root("status_partial_data");
        std::fs::create_dir_all(data_dir.join("config")).expect("mkdir config");
        std::fs::write(
            data_dir.join("config").join("download-sources.json"),
            format!(
                r#"{{"npm_registry": "http://127.0.0.1:{port}", "proxy": {{"mode": "none", "http_proxy": null, "https_proxy": null, "no_proxy": null}}}}"#
            ),
        )
        .expect("write config");
        let status = get_version_status(&root, &data_dir).await.expect("dist-tag ok");
        assert_eq!(status.latest_available.as_deref(), Some("0.2.0"));
        // 降级口径：catalog 失败时稳定通道回退旧 tokens 比较（当前未选 → 有更新）。
        assert!(status.has_update);
        assert_eq!(status.prerelease_available, None);
        assert!(!status.has_prerelease_update);
        assert!(status.prerelease_unknown);
        server.abort();
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&data_dir);
    }

    /// registry 不可达时状态查询整体失败（离线可测：指向本地闭合端口）。
    /// latest_available 与 catalog 双双失败 → 保留旧离线契约 Err(Network)。
    #[tokio::test]
    async fn get_version_status_offline_marks_unknown() {
        let root = fresh_root("status_unknown");
        let data_dir = fresh_root("status_unknown_data");
        std::fs::create_dir_all(data_dir.join("config")).expect("mkdir config");
        std::fs::write(
            data_dir.join("config").join("download-sources.json"),
            r#"{"npm_registry": "http://127.0.0.1:1/", "proxy": {"mode": "none", "http_proxy": null, "https_proxy": null, "no_proxy": null}}"#,
        )
        .expect("write config");
        let err = get_version_status(&root, &data_dir).await.expect_err("both fetches fail");
        assert!(matches!(err, AppError::Network(_)));
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&data_dir);
    }

    #[test]
    fn version_status_serializes_camel_case() {
        let status = VersionStatus {
            current_selected: Some("0.2.0".into()),
            installed: vec!["0.2.0".into()],
            bundled_version: Some("0.2.0".into()),
            latest_available: None,
            has_update: false,
            prerelease_available: Some("0.2.1-rc.2".into()),
            has_prerelease_update: true,
            prerelease_unknown: false,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["currentSelected"], "0.2.0");
        assert_eq!(json["bundledVersion"], "0.2.0");
        assert!(json["latestAvailable"].is_null());
        assert_eq!(json["prereleaseAvailable"], "0.2.1-rc.2");
        assert_eq!(json["hasPrereleaseUpdate"], true);
        assert_eq!(json["prereleaseUnknown"], false);
        assert!(json.get("current_selected").is_none());
    }

    #[test]
    fn version_catalog_serializes_camel_case() {
        let catalog = VersionCatalog {
            stable: vec![VersionInfo {
                version: "0.2.0".into(),
                published_at: Some("2026-09-29T09:56:27.000Z".into()),
            }],
            prerelease: vec![],
            latest_stable: Some("0.2.0".into()),
            latest_prerelease: None,
        };
        let json = serde_json::to_value(&catalog).unwrap();
        assert_eq!(json["stable"][0]["publishedAt"], "2026-09-29T09:56:27.000Z");
        assert_eq!(json["latestStable"], "0.2.0");
        assert!(json["latestPrerelease"].is_null());
        assert!(json.get("latest_stable").is_none());
    }

    #[test]
    fn resolve_source_modes() {
        use adl_download_source::VersionSourceMode::{Auto, Host, System};
        assert_eq!(resolve_effective_source(Auto, true, true, true), EffectiveSource::Running);
        assert_eq!(resolve_effective_source(Auto, false, true, true), EffectiveSource::Host);
        assert_eq!(resolve_effective_source(Auto, false, false, true), EffectiveSource::System);
        assert_eq!(resolve_effective_source(Auto, false, false, false), EffectiveSource::None);
        assert_eq!(resolve_effective_source(System, false, true, true), EffectiveSource::System);
        assert_eq!(resolve_effective_source(System, false, true, false), EffectiveSource::None);
        // mode=host 只要宿主有选中且完整安装的版本即命中 Host（预置版本收编后就在其中，无特例）。
        assert_eq!(resolve_effective_source(Host, false, true, true), EffectiveSource::Host);
        assert_eq!(resolve_effective_source(Host, false, false, true), EffectiveSource::None);
    }

    #[test]
    fn dsh_response_fingerprint() {
        assert!(is_dsh_http_response(
            401,
            "dsh web authentication required; reopen the URL printed by dsh web."
        ));
        assert!(is_dsh_http_response(200, "<title>DeepSeek Harness</title>"));
        assert!(!is_dsh_http_response(200, "<title>Some Dev Server</title>"));
        assert!(!is_dsh_http_response(404, "DeepSeek Harness"));
        assert!(!is_dsh_http_response(200, ""));
    }

    #[test]
    fn parse_dsh_version_output_table() {
        // 本机实测：裸版本号。
        assert_eq!(parse_dsh_version_output("0.2.0-rc.2\n"), Some("0.2.0-rc.2".into()));
        assert_eq!(parse_dsh_version_output("0.2.0"), Some("0.2.0".into()));
        // 兼容前后缀形态。
        assert_eq!(parse_dsh_version_output("dsh v0.2.0"), Some("0.2.0".into()));
        assert_eq!(parse_dsh_version_output("v1.2.3, extra"), Some("1.2.3".into()));
        // 非法输出一律 None（调用方按未知展示，不编造）。
        assert_eq!(parse_dsh_version_output(""), None);
        assert_eq!(parse_dsh_version_output("not a version"), None);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn system_probe_candidates_cmd_fallback_windows() {
        // Windows：无后缀 shim 优先，`.cmd` 兜底（与 webapp-host spawn 同口径）。
        let cands = system_probe_candidates(Path::new(r"D:\nodejs-v22\node_global\dsh"));
        assert_eq!(cands.len(), 2);
        assert_eq!(cands[1], PathBuf::from(r"D:\nodejs-v22\node_global\dsh.cmd"));
        // 已是 .cmd 不再追加。
        let cands = system_probe_candidates(Path::new(r"D:\x\dsh.cmd"));
        assert_eq!(cands, vec![PathBuf::from(r"D:\x\dsh.cmd")]);
    }

    #[test]
    fn system_probe_candidates_single_or_fallback() {
        // 全平台：首候选恒为原 path（Windows 上为 [原, 原.cmd]，其它平台仅 [原]）。
        let cands = system_probe_candidates(Path::new("dsh"));
        assert!(!cands.is_empty());
        assert_eq!(cands[0], PathBuf::from("dsh"));
        assert!(cands.len() <= 2);
    }

    #[test]
    fn host_installed_requires_bin_js() {
        let root = fresh_root("host_complete");
        let version = root.join("installed").join("1.0.0");
        std::fs::create_dir_all(&version).expect("mkdir");
        assert!(!is_host_version_installed(&root, "1.0.0"));
        let bin = version.join("node_modules").join("@deepseek-ai").join("dsh").join("lib");
        std::fs::create_dir_all(&bin).expect("mkdir bin");
        std::fs::write(bin.join("bin.js"), "").expect("write bin");
        assert!(is_host_version_installed(&root, "1.0.0"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
