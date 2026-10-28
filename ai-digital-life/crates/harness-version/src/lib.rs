use std::path::{Path, PathBuf};

use tokio::net::TcpStream;
use tokio::process::Command as TokioCommand;

use serde::{Deserialize, Serialize};

use adl_errors::AppError;
use adl_hosted::{HostedVersions, ProgressTask};

pub mod install;
pub mod install_opencode;
pub mod spec;

/// `ProgressTask::begin(kind, ...)` 的 kind 命名空间（dsh 版本任务）。
/// 纯字符串常量，不是旧的枚举/别名层；线装值必须与前端轮询过滤保持一致。
pub mod task_kind {
    pub const INSTALL: &str = "dsh-install";
    pub const UNINSTALL: &str = "dsh-uninstall";
    pub const REINSTALL: &str = "dsh-reinstall";
    /// 升级到最新（与“安装指定版本”区分展示/埋点）。
    pub const UPDATE: &str = "dsh-update";
    /// OpenCode 平台包安装（直接下载 tarball，不经 npm）。
    pub const OPENCODE_INSTALL: &str = "opencode-install";
}

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

/// 宿主管理的 harness 版本目录的版本管理：已装版本列表、查最新、回退、卸载、升级、重装。
///
/// 作用域硬边界：只读写宿主版本目录 `<root>`（`selected.txt` + `installed/<version>/`），
/// 绝不写入/改动 harness 自身的会话/配置/插件目录。
///
/// 本应用不随安装包预置任何 harness 版本：首次使用由 harness 向导按需下载。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionStatus {
    pub current_selected: Option<String>,
    /// 已安装到 `installed/<version>/` 的版本。
    pub installed: Vec<String>,
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

/// dsh 真安装的 bin.js 相对版本目录路径（`installed/<version>/` 下的 marker）。
const DSH_MARKER_REL: &str = "node_modules/@deepseek-ai/dsh/lib/bin.js";

/// dsh 版本目录的 hosted 视图：harness-version 的 `root` 即版本目录本身
/// （`installed/` 与 `selected.txt` 同级），`HostedVersions` 按
/// `<root>/<name>/installed` 寻址，故 `name` 取空串做直通映射。
fn dsh_versions(root: &Path) -> HostedVersions {
    HostedVersions::open(root, "", DSH_MARKER_REL)
}

/// 宿主版本可执行入口（真安装后的 bin.js）。
pub fn host_bin(root: &Path, version: &str) -> PathBuf {
    dsh_versions(root).installed_marker(version)
}

/// 按任意描述符取宿主版本的可执行 marker 路径（无存在性检查）。
pub fn host_bin_for(spec: &spec::HarnessSpec, root: &Path, version: &str) -> PathBuf {
    HostedVersions::open(root, "", spec.marker_rel).installed_marker(version)
}

/// 按任意描述符判断宿主版本是否完整安装（marker 存在即算）。
pub fn is_version_installed_for(spec: &spec::HarnessSpec, root: &Path, version: &str) -> bool {
    HostedVersions::open(root, "", spec.marker_rel).is_installed(version)
}

/// 宿主版本是否完整安装（以 bin.js 存在为准；空目录不算已安装）。
pub fn is_host_version_installed(root: &Path, version: &str) -> bool {
    dsh_versions(root).is_installed(version)
}

/// 读取当前选中的版本号。
pub fn read_selected(root: &Path) -> Result<Option<String>, AppError> {
    dsh_versions(root).read_selected()
}

pub(crate) fn list_installed(root: &Path) -> Result<Vec<String>, AppError> {
    // 枚举收敛至 hosted（已按 semver 合法 + marker 完整过滤），排序口径保留
    // dsh 原语义：semver 降序（hosted 只保证集合正确，不保证顺序）。
    let mut versions = dsh_versions(root).installed_versions();
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
    latest_available_for(&spec::DSH, data_dir).await
}

/// 同 [`latest_available`]，按任意 harness 描述符查询其 `latest` 标签。
pub async fn latest_available_for(
    spec: &spec::HarnessSpec,
    data_dir: &Path,
) -> Result<Option<String>, AppError> {
    let base = registry_base(data_dir)?;
    let download_config = adl_download_source::load(data_dir)?;
    let client = adl_download_source::build_http_client(&download_config)?;
    let url = format!("{base}/{}/latest", spec.package);
    tracing::debug!(%url, harness = spec.id.key(), "harness-version: querying latest");
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::Network(format!("query harness latest failed: {e}")))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(format!("query harness latest failed: HTTP {status}")));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Network(format!("parse harness latest failed: {e}")))?;
    Ok(json.get("version").and_then(|v| v.as_str()).map(|v| v.to_string()))
}

/// 从 packument JSON 拆出官方版本目录（纯函数，便于离线单测）。
/// `stable` = semver `pre` 为空；其余按描述符的预发布前缀过滤后进 `prerelease`；
/// 各按 semver 降序，并按描述符限量截断。
/// `latest_stable` 优先取 `dist-tags.latest`（须落在正式版桶，否则回退桶首），
/// `latest_prerelease` 按描述符的标签回退顺序取值（同理），再回退桶首。
fn parse_catalog(json: &serde_json::Value, policy: &spec::CatalogPolicy) -> VersionCatalog {
    let empty_map = serde_json::Map::new();
    let versions = json.get("versions").and_then(|v| v.as_object()).unwrap_or(&empty_map);
    let times = json.get("time").and_then(|v| v.as_object());
    let mut stable: Vec<semver::Version> = Vec::new();
    let mut prerelease: Vec<semver::Version> = Vec::new();
    for name in versions.keys() {
        let Ok(parsed) = semver::Version::parse(name) else { continue };
        if parsed.pre.is_empty() {
            stable.push(parsed);
        } else if policy.prerelease_prefix.is_none_or(|p| parsed.pre.as_str().starts_with(p)) {
            prerelease.push(parsed);
        }
    }
    stable.sort_by(|a, b| b.cmp(a));
    prerelease.sort_by(|a, b| b.cmp(a));
    if let Some(limit) = policy.stable_limit {
        stable.truncate(limit);
    }
    if let Some(limit) = policy.prerelease_limit {
        prerelease.truncate(limit);
    }
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
    let tag_latest = tag_of("latest");
    let latest_stable = if in_stable(&tag_latest) {
        tag_latest
    } else {
        stable_infos.first().map(|i| i.version.clone())
    };
    let latest_prerelease = policy
        .prerelease_tags
        .iter()
        .filter_map(|tag| tag_of(tag))
        .find(|v| prerelease_infos.iter().any(|i| &i.version == v))
        .or_else(|| prerelease_infos.first().map(|i| i.version.clone()));
    VersionCatalog {
        stable: stable_infos,
        prerelease: prerelease_infos,
        latest_stable,
        latest_prerelease,
    }
}

/// 只读查询 registry 返回官方版本目录（含正式版与预发布分桶，不下载）。
pub async fn fetch_catalog(data_dir: &Path) -> Result<VersionCatalog, AppError> {
    fetch_catalog_for(&spec::DSH, data_dir).await
}

/// 同 [`fetch_catalog`]，按任意 harness 描述符查询并按该描述符的限量策略截断。
pub async fn fetch_catalog_for(
    spec: &spec::HarnessSpec,
    data_dir: &Path,
) -> Result<VersionCatalog, AppError> {
    let base = registry_base(data_dir)?;
    let download_config = adl_download_source::load(data_dir)?;
    let client = adl_download_source::build_http_client(&download_config)?;
    let url = format!("{base}/{}", spec.package);
    tracing::debug!(%url, harness = spec.id.key(), "harness-version: fetching version catalog");
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::Network(format!("query harness catalog failed: {e}")))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(format!("query harness catalog failed: HTTP {status}")));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Network(format!("parse harness catalog failed: {e}")))?;
    Ok(parse_catalog(&json, &spec.catalog))
}

/// 精确查询某个版本是否已发布（catalog 限量后，历史版本仍可手动指定安装）。
pub async fn version_exists(
    spec: &spec::HarnessSpec,
    data_dir: &Path,
    version: &str,
) -> Result<bool, AppError> {
    let version = version.trim();
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    let base = registry_base(data_dir)?;
    let config = adl_download_source::load(data_dir)?;
    let client = adl_download_source::build_http_client(&config)?;
    let url = format!("{base}/{}/{version}", spec.package);
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::Network(format!("query version failed: {e}")))?;
    let status = resp.status();
    if status.is_success() {
        Ok(true)
    } else if status == reqwest::StatusCode::NOT_FOUND {
        Ok(false)
    } else {
        Err(AppError::Network(format!("query version failed: HTTP {status}")))
    }
}

/// 系统安装的 harness（不在应用数据目录内的那份）。
#[derive(Debug, Clone)]
pub struct SystemHarnessInfo {
    pub path: PathBuf,
    pub version: Option<String>,
}

/// 探测 PATH 上的系统安装：`where <bin>` → `<bin> --version` → 取最后一个可解析 semver 的 token。
/// 任一步失败都返回 `None`（不抛错）；版本无法解析时保留 path、version=None。
pub fn detect_system_bin(spec: &spec::HarnessSpec) -> Option<SystemHarnessInfo> {
    let output = std::process::Command::new("where").arg(spec.system_bin).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()?
        .trim()
        .to_string();
    if path.is_empty() {
        return None;
    }
    let version = std::process::Command::new(&path)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| parse_version_token(&String::from_utf8_lossy(&o.stdout)));
    Some(SystemHarnessInfo { path: PathBuf::from(path), version })
}

fn parse_version_token(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .rev()
        .find_map(|t| semver::Version::parse(t.trim_start_matches('v')).ok())
        .map(|v| v.to_string())
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
    get_version_status_for(&spec::DSH, root, data_dir).await
}

/// 同 [`get_version_status`]，按任意 harness 描述符查询。
pub async fn get_version_status_for(
    spec: &spec::HarnessSpec,
    root: &Path,
    data_dir: &Path,
) -> Result<VersionStatus, AppError> {
    let current_selected = read_selected(root)?;
    let installed = list_installed(root)?;
    let dist_latest = latest_available_for(spec, data_dir).await.ok().flatten();
    match fetch_catalog_for(spec, data_dir).await {
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
                "harness-version: version status resolved"
            );
            Ok(VersionStatus {
                current_selected,
                installed,
                latest_available: latest,
                has_update,
                prerelease_available: pre,
                has_prerelease_update: has_pre,
                prerelease_unknown: false,
            })
        },
        Err(e) => {
            tracing::debug!(error = %e, "harness-version: catalog unavailable");
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
    update_with_task(root, data_dir, &ProgressTask::new()).await
}

pub async fn update_with_task(
    root: &Path,
    data_dir: &Path,
    task: &ProgressTask,
) -> Result<String, AppError> {
    update_for(&spec::DSH, root, data_dir, task).await
}

/// 任意 harness 升级到最新可用版本（稳定桶为空时回退 `latest` 标签）。
pub async fn update_for(
    spec: &spec::HarnessSpec,
    root: &Path,
    data_dir: &Path,
    task: &ProgressTask,
) -> Result<String, AppError> {
    let dist_latest = latest_available_for(spec, data_dir).await.ok().flatten();
    let target = match fetch_catalog_for(spec, data_dir).await {
        Ok(catalog) => resolve_stable_latest(&catalog, dist_latest.as_deref())
            .or_else(|| dist_latest.clone()),
        Err(e) => {
            tracing::debug!(error = %e, harness = spec.id.key(), "harness-version: update falls back to dist-tag latest");
            dist_latest.clone()
        },
    }
    .ok_or_else(|| AppError::NotFound("no release published upstream".into()))?;
    tracing::debug!(%target, harness = spec.id.key(), "harness-version: update to latest");
    task.set_version(&target);
    install::install_for(spec, root, data_dir, &target, task, true).await
}

/// 安装指定版本（正式版或预发布均可）：校验版本号与官方发布状态，
/// 真下载到 `installed/<version>/`；select=true 时并选中（默认语义）。
pub async fn install_version(
    root: &Path,
    data_dir: &Path,
    version: &str,
) -> Result<String, AppError> {
    install_version_with_task(root, data_dir, version, &ProgressTask::new(), true).await
}

pub async fn install_version_with_task(
    root: &Path,
    data_dir: &Path,
    version: &str,
    task: &ProgressTask,
    select: bool,
) -> Result<String, AppError> {
    install_version_with_task_for(&spec::DSH, root, data_dir, version, task, select).await
}

pub async fn install_version_with_task_for(
    spec: &spec::HarnessSpec,
    root: &Path,
    data_dir: &Path,
    version: &str,
    task: &ProgressTask,
    select: bool,
) -> Result<String, AppError> {
    tracing::debug!(
        %version,
        select,
        harness = spec.id.key(),
        "harness-version::install_version: delegating to kernel"
    );
    install::install_for(spec, root, data_dir, version, task, select).await
}

/// 回退/切换：校验版本号并确认已完整安装后，把该版本写入 selected。
pub async fn revert(root: &Path, version: &str) -> Result<String, AppError> {
    revert_for(&spec::DSH, root, version).await
}

pub async fn revert_for(
    spec: &spec::HarnessSpec,
    root: &Path,
    version: &str,
) -> Result<String, AppError> {
    tracing::debug!(%version, harness = spec.id.key(), "harness-version::revert: request");
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    if !is_version_installed_for(spec, root, version) {
        tracing::debug!(%version, "harness-version::revert: rejected (not installed)");
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    tokio::fs::write(selected_file(root), format!("{version}\n"))
        .await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    tracing::debug!(%version, "harness-version::revert: selected written");
    Ok(version.to_string())
}

/// 卸载：删除 `installed/<version>/`；若恰好是当前选中版本，自动改选剩余最高
/// 已装版本，没有剩余则清空 selected。该版本若是内置预置的，来源记录一并删除
/// （卸载后它不再算内置）。
pub async fn uninstall_with_task(
    root: &Path,
    version: &str,
    task: &ProgressTask,
) -> Result<(), AppError> {
    tracing::debug!(%version, "harness-version::uninstall: delegating to kernel");
    install::uninstall(root, version, task).await?;
    Ok(())
}

/// 重装：真重新安装当前选中版本，保持选中状态。
/// 语义为“修当前版本”，不是“升到最新”（升级走 `update`）。
pub async fn reinstall(root: &Path, data_dir: &Path) -> Result<String, AppError> {
    reinstall_with_task(root, data_dir, &ProgressTask::new()).await
}

pub async fn reinstall_with_task(
    root: &Path,
    data_dir: &Path,
    task: &ProgressTask,
) -> Result<String, AppError> {
    reinstall_for(&spec::DSH, root, data_dir, task).await
}

pub async fn reinstall_for(
    spec: &spec::HarnessSpec,
    root: &Path,
    data_dir: &Path,
    task: &ProgressTask,
) -> Result<String, AppError> {
    let selected =
        read_selected(root)?.ok_or_else(|| AppError::NotFound("no selected version".into()))?;
    tracing::debug!(version = %selected, harness = spec.id.key(), "harness-version::reinstall: reinstalling selected");
    install::install_for(spec, root, data_dir, &selected, task, true).await
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
                tracing::debug!("harness-version: system version cache HIT");
                return version.clone();
            }
            tracing::debug!(
                cached_path = %cached_path.display(),
                probed_path = %path.display(),
                "harness-version: system path changed — re-probing dsh --version",
            );
        }
    }
    tracing::debug!("harness-version: system version cache MISS — probing dsh --version");
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
        tracing::debug!(candidate = %candidate.display(), parsed = ?parsed, "harness-version: system version probed");
        if parsed.is_some() {
            return parsed;
        }
    }
    // 全候选失败（未安装/超时/不可解析/193 全灭）：warn 汇总，调用方按未知展示。
    // 会话缓存限频（同 path 每进程只到这里一次），不会刷屏（R1-L3）。
    tracing::warn!(path = %path.display(), "harness-version: dsh --version probe failed for all candidates");
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

/// 本机 loopback 探测共用客户端：连接池/TLS 会话复用，5s 轮询不再每次新建
///（L3）。`Client::clone` 为廉价的 Arc 克隆，每次调用方各取一份。
fn loopback_client() -> reqwest::Client {
    static LOOPBACK_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    LOOPBACK_CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_millis(500))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new())
        })
        .clone()
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
    // 把 127.0.0.1 请求路由到代理而误判 dsh 未运行。客户端全局复用，不再每次新建。
    let client = loopback_client();

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

    /// 任务 kind 是前后端线装契约，值不得漂移。
    #[test]
    fn task_kind_constants_pin_wire_values() {
        assert_eq!(task_kind::INSTALL, "dsh-install");
        assert_eq!(task_kind::UNINSTALL, "dsh-uninstall");
        assert_eq!(task_kind::REINSTALL, "dsh-reinstall");
        assert_eq!(task_kind::UPDATE, "dsh-update");
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
        uninstall_with_task(&root, "2.0.0", &ProgressTask::new()).await.expect("uninstall ok");
        assert_eq!(read_selected(&root).expect("read").as_deref(), Some("1.0.0"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_current_clears_selected() {
        let root = fresh_root("uninstall_current");
        std::fs::create_dir_all(installed_dir(&root).join("1.0.0")).expect("mkdir");
        std::fs::write(selected_file(&root), "1.0.0\n").expect("write selected");
        uninstall_with_task(&root, "1.0.0", &ProgressTask::new()).await.expect("uninstall ok");
        assert_eq!(read_selected(&root).expect("read"), None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_missing_is_not_found() {
        let root = fresh_root("uninstall_missing");
        let err = uninstall_with_task(&root, "9.9.9", &ProgressTask::new())
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
        let catalog = parse_catalog(&catalog_fixture(), &spec::DSH.catalog);
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
    fn opencode_catalog_keeps_latest_50_stable_and_only_the_newest_beta() {
        let mut versions = serde_json::Map::new();
        for i in 1..=60 {
            versions.insert(format!("1.0.{i}"), serde_json::json!({}));
        }
        versions.insert("0.0.0-beta-202608110357".to_string(), serde_json::json!({}));
        versions.insert("0.0.0-beta-202608110326".to_string(), serde_json::json!({}));
        versions.insert("0.0.0-dev-202610280534".to_string(), serde_json::json!({}));
        versions.insert("0.0.0-next-202606270058".to_string(), serde_json::json!({}));
        let json = serde_json::json!({
            "dist-tags": { "latest": "1.0.60", "beta": "0.0.0-beta-202608110357" },
            "versions": versions,
        });
        let catalog = parse_catalog(&json, &spec::OPENCODE.catalog);
        assert_eq!(catalog.stable.len(), 50);
        assert_eq!(catalog.stable[0].version, "1.0.60");
        assert_eq!(catalog.prerelease.len(), 1);
        assert_eq!(catalog.prerelease[0].version, "0.0.0-beta-202608110357");
        assert_eq!(catalog.latest_prerelease.as_deref(), Some("0.0.0-beta-202608110357"));
    }

    #[test]
    fn parse_catalog_prefers_dist_tags_with_bucket_fallback() {
        // latest 标签指向 rc 时不落正式版桶，回退桶首
        let json = serde_json::json!({
            "dist-tags": { "latest": "0.2.0-rc.2" },
            "versions": { "0.1.0": {}, "0.2.0-rc.2": {} },
            "time": {}
        });
        let catalog = parse_catalog(&json, &spec::DSH.catalog);
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
        let catalog = parse_catalog(&catalog_fixture(), &spec::DSH.catalog);
        // 正式版桶首（0.2.0），即使 dist-tag latest 指向同一版本也一致。
        assert_eq!(resolve_stable_latest(&catalog, Some("0.2.0")).as_deref(), Some("0.2.0"));
        // dist-tag 指向 rc 时不被采用（须落在正式版桶）。
        assert_eq!(resolve_stable_latest(&catalog, Some("0.2.1-rc.2")).as_deref(), Some("0.2.0"));
        // 桶空 + dist-tag 为正式版 → 回退采用。
        let mut empty = parse_catalog(&catalog_fixture(), &spec::DSH.catalog);
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
            latest_available: None,
            has_update: false,
            prerelease_available: Some("0.2.1-rc.2".into()),
            has_prerelease_update: true,
            prerelease_unknown: false,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["currentSelected"], "0.2.0");
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

    #[test]
    fn read_selected_returns_none_when_selected_dangles() {
        let root = fresh_root("selected_dangles");
        std::fs::create_dir_all(&root).expect("mkdir root");
        std::fs::write(selected_file(&root), "9.9.9\n").expect("write selected");
        assert_eq!(read_selected(&root).expect("read"), None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn hosted_paths_match_legacy_layout() {
        let root = fresh_root("hosted_paths");
        assert_eq!(
            HostedVersions::open(&root, "", DSH_MARKER_REL).installed_marker("1.0.0"),
            host_bin(&root, "1.0.0")
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
