use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use adl_download_source::ProxyMode;
use adl_errors::AppError;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command as TokioCommand};

use crate::task::{TaskReporter, VersionTaskPhase};
use crate::{
    fetch_catalog, host_bin, installed_dir, is_host_version_installed, read_selected, selected_file,
};

pub fn npm_install_args(tmp: &Path, version: &str, registry: &str) -> Vec<String> {
    vec![
        "install".to_string(),
        "--prefix".to_string(),
        tmp.to_string_lossy().into_owned(),
        format!("--registry={registry}"),
        "--no-audit".to_string(),
        "--no-fund".to_string(),
        "--loglevel=error".to_string(),
        format!("@deepseek-ai/dsh@{version}"),
    ]
}

pub fn npm_dry_run_args(tmp: &Path, version: &str, registry: &str) -> Vec<String> {
    vec![
        "install".to_string(),
        "--dry-run".to_string(),
        "--json".to_string(),
        "--ignore-scripts".to_string(),
        "--prefix".to_string(),
        tmp.to_string_lossy().into_owned(),
        format!("--registry={registry}"),
        "--no-audit".to_string(),
        "--no-fund".to_string(),
        format!("@deepseek-ai/dsh@{version}"),
    ]
}

fn nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
}

fn tail(text: &str, max_chars: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    let start = chars.len().saturating_sub(max_chars);
    chars[start..].iter().collect()
}

fn cancelled() -> AppError {
    AppError::Cancelled("version operation cancelled".into())
}

fn set_proxy_env(cmd: &mut TokioCommand, upper: &str, lower: &str, value: &Option<String>) {
    if let Some(v) = value {
        cmd.env(upper, v);
        cmd.env(lower, v);
    }
}

fn apply_proxy_env(cmd: &mut TokioCommand, config: &adl_download_source::DownloadSourceConfig) {
    match config.proxy.mode {
        ProxyMode::Manual => {
            set_proxy_env(cmd, "HTTP_PROXY", "http_proxy", &config.proxy.http_proxy);
            set_proxy_env(cmd, "HTTPS_PROXY", "https_proxy", &config.proxy.https_proxy);
            set_proxy_env(cmd, "NO_PROXY", "no_proxy", &config.proxy.no_proxy);
        },
        ProxyMode::None => {
            // 大小写双删：npm/node 会读取小写变量，只删大写等于没关代理。
            for key in
                ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
            {
                cmd.env_remove(key);
            }
            cmd.env("NO_PROXY", "*");
            cmd.env("no_proxy", "*");
        },
        ProxyMode::Auto => {},
    }
}

fn build_npm(
    program: &str,
    args: &[String],
    config: &adl_download_source::DownloadSourceConfig,
) -> TokioCommand {
    let mut cmd = TokioCommand::new(program);
    cmd.args(args).kill_on_drop(true);
    apply_proxy_env(&mut cmd, config);
    cmd
}

async fn spawn_npm(
    args: &[String],
    config: &adl_download_source::DownloadSourceConfig,
) -> Result<Child, AppError> {
    let mut cmd = build_npm("npm", args, config);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    match cmd.spawn() {
        Ok(child) => Ok(child),
        Err(first) => {
            #[cfg(target_os = "windows")]
            {
                let mut fallback = build_npm("npm.cmd", args, config);
                fallback.stdout(Stdio::piped()).stderr(Stdio::piped());
                fallback.spawn().map_err(|second| {
                    AppError::Io(format!(
                        "spawn npm failed ({first}); fallback npm.cmd also failed: {second}"
                    ))
                })
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err(AppError::Io(format!("spawn npm failed: {first}")))
            }
        },
    }
}

fn parse_dry_run_total(stdout: &[u8]) -> u64 {
    let text = String::from_utf8_lossy(stdout);
    let Some(start) = text.find("{\n").or_else(|| text.find('{')) else {
        return 0;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text[start..].trim()) else {
        return 0;
    };
    value
        .get("added")
        .and_then(|v| v.as_u64())
        .or_else(|| value.get("packages").and_then(|v| v.as_u64()))
        .unwrap_or(0)
}

/// 文件树 walk 护栏（计数与删除共用）：跳过链接/重解析点（防跟随出界），
/// 递归设深度与条目上限（防恶意包造环卡死）。
const WALK_MAX_DEPTH: usize = 12;
const WALK_MAX_ENTRIES: u64 = 200_000;

/// 是否链接（含 Windows junction/reparse point）：一律按叶子删，
/// 删链接本身，不跟随目标。
fn is_link(path: &Path) -> bool {
    let Ok(md) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if md.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        if md.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return true;
        }
    }
    false
}

fn count_installed_packages(root: &Path) -> u64 {
    // 与 dry-run total（npm `added` 包数）尽量同口径：只计持有 package.json 的
    // 目录（= 一个逻辑包），不计嵌套展开的中间目录。真实树仍可能大于干跑预测
    //（如 bundleDependencies 随包附带，不计入 `added`——用户确认保留真实计数，
    // N 可大于 M，含义见界面问号文案）。
    fn walk(dir: &Path, depth: usize, count: &mut u64) {
        if depth > WALK_MAX_DEPTH || *count >= WALK_MAX_ENTRIES {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            if *count >= WALK_MAX_ENTRIES {
                return;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            if is_link(&path) {
                continue;
            }
            if path.is_dir() {
                if path.join("package.json").is_file() {
                    *count += 1;
                }
                walk(&path, depth + 1, count);
            }
        }
    }
    let mut count = 0u64;
    walk(&root.join("node_modules"), 0, &mut count);
    count
}

fn install_percent(done: u64, total: u64) -> Option<u8> {
    if total == 0 {
        return None;
    }
    Some((5 + (90 * done.min(total) / total)).min(95) as u8)
}

async fn dry_run_total(
    tmp: &Path,
    version: &str,
    registry: &str,
    config: &adl_download_source::DownloadSourceConfig,
    task: &TaskReporter,
) -> Result<u64, AppError> {
    task.update(VersionTaskPhase::Preparing, None, 0, 0, true);
    let args = npm_dry_run_args(tmp, version, registry);
    let mut child = spawn_npm(&args, config).await?;
    // dry-run 同样可取消：180s 总超时内每 100ms 检查取消，取消即杀进程树。
    // 与 run_npm_with_progress 同构（wait 借用 + 管道任务收 stdout）。
    let mut stdout_pipe = child.stdout.take();
    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(pipe) = stdout_pipe.as_mut() {
            let _ = pipe.read_to_end(&mut buf).await;
        }
        buf
    });
    let status = tokio::time::timeout(Duration::from_secs(180), async {
        loop {
            tokio::select! {
                result = child.wait() => {
                    return result.map_err(|e| AppError::Io(format!("npm dry-run failed: {e}")));
                },
                _ = tokio::time::sleep(Duration::from_millis(100)) => {
                    if task.is_cancelled() {
                        kill_npm_tree(&mut child).await;
                        return Err(cancelled());
                    }
                }
            }
        }
    })
    .await
    .map_err(|_| AppError::Timeout("npm dry-run timed out".into()))??;
    let stdout = stdout_task.await.unwrap_or_default();
    if !status.success() {
        // 失败即 total=0（调用方 unwrap_or(0)），此处留痕以便定位（曾因 prefix
        // 目录不存在恒 ENOENT，用户实测 2026-10-21）。
        tracing::debug!(
            %version,
            %status,
            tail = %tail(&String::from_utf8_lossy(&stdout), 500),
            "dsh install: dry-run failed, total falls back to 0"
        );
        return Ok(0);
    }
    Ok(parse_dry_run_total(&stdout))
}

async fn kill_npm_tree(child: &mut Child) {
    // Windows 用 taskkill /T 杀整棵进程树；Unix 目前只有 child.kill()
    //（npm 父进程），孙子 node 进程可能残留——项目仅发 Windows 包，
    // 此处如实记录缺口，不引入未经验证的 setsid/killpg 逻辑。
    #[cfg(target_os = "windows")]
    if let Some(pid) = child.id() {
        let _ = TokioCommand::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .await;
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}

async fn run_npm_with_progress(
    args: &[String],
    config: &adl_download_source::DownloadSourceConfig,
    tmp: &Path,
    total: u64,
    task: &TaskReporter,
    registry: &str,
) -> Result<(), AppError> {
    let mut child = spawn_npm(args, config).await?;
    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();
    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(pipe) = stdout_pipe.as_mut() {
            let _ = pipe.read_to_end(&mut buf).await;
        }
        buf
    });
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(pipe) = stderr_pipe.as_mut() {
            let _ = pipe.read_to_end(&mut buf).await;
        }
        buf
    });
    let mut ticker = tokio::time::interval(Duration::from_millis(400));
    // 取消快速通道（用户实测 2026-10-26：第一次取消 11 秒无响应）：
    // 同步 walk 在大树上曾阻塞本任务数秒，连带饿死取消检查。
    // walk 已搬进 spawn_blocking（见下），此 100ms 分支只做取消检查、
    // 不碰文件系统，双保险保证取消在 1 拍内生效。
    let mut cancel_tick = tokio::time::interval(Duration::from_millis(100));
    // 自适应计数节流：walk 耗时按 2 倍计入下次间隔（400ms～5s），
    // 大树下不饿死事件循环；百分比停顿时由 UI 扫光＋阶段文案说明在干活。
    let mut next_count_at = tokio::time::Instant::now();
    loop {
        tokio::select! {
            _ = cancel_tick.tick() => {
                if task.is_cancelled() {
                    kill_npm_tree(&mut child).await;
                    return Err(cancelled());
                }
            }
            status = child.wait() => {
                let status = status.map_err(|e| AppError::Io(format!("npm wait failed: {e}")))?;
                let stdout = stdout_task.await.unwrap_or_default();
                let stderr = stderr_task.await.unwrap_or_default();
                if !status.success() {
                    let raw = format!(
                        "{}\n{}",
                        String::from_utf8_lossy(&stderr),
                        String::from_utf8_lossy(&stdout)
                    );
                    let redacted = raw.replace(registry, "<registry>");
                    return Err(AppError::Io(format!(
                        "npm install failed: {}",
                        tail(&redacted, 2000)
                    )));
                }
                return Ok(());
            }
            _ = ticker.tick() => {
                if task.is_cancelled() {
                    kill_npm_tree(&mut child).await;
                    return Err(cancelled());
                }
                if tokio::time::Instant::now() < next_count_at {
                    continue;
                }
                // 同步 walk 必须在 blocking 池跑：直接在 select 任务里走大树
                // 会饿死同一任务的取消分支（用户实测 2026-10-26 第一次取消
                // 11 秒无响应）。搬出去后，取消只取决于 100ms 快检分支。
                let started = tokio::time::Instant::now();
                let tmp_owned = tmp.to_path_buf();
                let done = tokio::task::spawn_blocking(move || count_installed_packages(&tmp_owned))
                    .await
                    .unwrap_or(0);
                let cost = started.elapsed();
                next_count_at =
                    started + cost.mul_f32(2.0).clamp(Duration::from_millis(400), Duration::from_secs(5));
                task.update(
                    VersionTaskPhase::Installing,
                    install_percent(done, total),
                    done,
                    total,
                    true,
                );
            }
        }
    }
}

pub async fn install(
    root: &Path,
    data_dir: &Path,
    version: &str,
    task: &TaskReporter,
    select: bool,
) -> Result<String, AppError> {
    let version = version.trim();
    tracing::debug!(%version, "dsh install: request (trimmed)");
    task.update(VersionTaskPhase::Preparing, None, 0, 0, true);
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    if task.is_cancelled() {
        tracing::debug!(%version, "dsh install: cancelled before catalog");
        return Err(cancelled());
    }

    let catalog = fetch_catalog(data_dir).await?;
    let published = catalog.stable.iter().any(|i| i.version == version)
        || catalog.prerelease.iter().any(|i| i.version == version);
    if !published {
        tracing::debug!(%version, "dsh install: rejected (not published upstream)");
        return Err(AppError::NotFound(format!("version {version} is not published upstream")));
    }
    if task.is_cancelled() {
        tracing::debug!(%version, "dsh install: cancelled after catalog");
        return Err(cancelled());
    }

    let config = adl_download_source::load(data_dir)?;
    let registry = adl_download_source::resolve_registry(&config);
    let dir = installed_dir(root);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Io(format!("create {}: {e}", dir.display())))?;

    let tmp = dir.join(format!(".tmp-{version}-{}", nonce()));
    if tmp.exists() {
        let _ = tokio::fs::remove_dir_all(&tmp).await;
    }
    // dry-run 要求 prefix 目录事先存在（npm 不会自动创建，不存在即 ENOENT 失败，
    // total 回退为 0 → 进度恒为不确定态；用户实测 2026-10-21 定位）。
    if let Err(e) = tokio::fs::create_dir_all(&tmp).await {
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(AppError::Io(format!("create {}: {e}", tmp.display())));
    }

    // dry_run_total 首行即刷 Preparing，此处不再重复。
    // 分母恒用 dry-run 预测（npm `added` 理想树计数）；真实树可能更大
    //（如 bundleDependencies 随包附带，不计入预测——用户确认保留真实计数、
    // N 可大于 M，含义见界面文案）。
    let total = dry_run_total(&tmp, version, registry, &config, task).await.unwrap_or(0);
    tracing::debug!(%version, %registry, %total, "dsh install: dry-run done");
    if task.is_cancelled() {
        tracing::debug!(%version, "dsh install: cancelled after dry-run, tmp removed");
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(cancelled());
    }

    let args = npm_install_args(&tmp, version, registry);
    tracing::info!(%version, %registry, %total, "dsh install: npm install start");
    task.update(VersionTaskPhase::Installing, install_percent(0, total), 0, total, true);
    if let Err(e) = run_npm_with_progress(&args, &config, &tmp, total, task, registry).await {
        tracing::debug!(%version, error = %e, "dsh install: npm failed, tmp removed");
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(e);
    }
    if task.is_cancelled() {
        tracing::debug!(%version, "dsh install: cancelled after npm, tmp removed");
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(cancelled());
    }

    let tmp_bin =
        tmp.join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js");
    if !tmp_bin.is_file() {
        tracing::debug!(%version, "dsh install: rejected (installed without bin.js)");
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(AppError::Io(format!("installed {version} without bin.js")));
    }

    task.update(VersionTaskPhase::Finalizing, Some(98), total, total, false);
    let final_dir = installed_dir(root).join(version);
    tracing::debug!(%version, path = %final_dir.display(), "dsh install: swapping into place");
    // 原子换位收敛至 hosted（同卷 rename，跨卷复制后删源；失败尽力恢复旧版）。
    if let Err(e) = adl_hosted::swap_into_place(&tmp, &final_dir) {
        // 与 npm 失败路径同构：swap 失败也要清 tmp（此前直接 `?` 传播会残留）。
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(e);
    }

    if !is_host_version_installed(root, version) {
        tracing::debug!(%version, "dsh install: rejected (incomplete after swap)");
        return Err(AppError::Io(format!("installed {version} is incomplete")));
    }
    // 内容已被覆盖：若该版本号原本是内置预置的，从此刻起不再算内置（用户 2026-10-22）。
    // 记录清除失败不该让整次安装报错（版本内容已就位），只留痕。
    if let Err(e) = crate::clear_bundled_version_if(root, version) {
        tracing::warn!(%version, error = %e, "dsh install: clear bundled marker failed");
    }

    if select {
        tokio::fs::write(selected_file(root), format!("{version}\n"))
            .await
            .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
        tracing::debug!(%version, "dsh install: selected written");
    } else {
        // 非当前重装（行内“重装”）：只修该版本目录，保持原选中不变，
        // 切换仍需用户手动点“切换到该版本”。
        tracing::debug!(%version, "dsh install: select=false, keeping previous selected");
    }
    task.update(VersionTaskPhase::Finalizing, Some(100), total, total, false);
    tracing::info!(%version, bin = %host_bin(root, version).display(), "dsh install: completed");
    Ok(version.to_string())
}

/// 收集待删除的全部条目（后序：子项在前，父目录在后；根目录自身不计入，
/// 最后整体删——此时已空，很快）。
/// 只深入“真实落在此次删除范围内的目录”：链接/重解析点一律按叶子处理，
/// 防止跟随外部目标误删（npm 树内可能含 junction/链接）。
/// 与计数 walk 同口径的深度/条目上限（防恶意包造环卡死；超限部分由最后的
/// 整体 `remove_dir_all` 兜底删除）。
fn collect_for_removal(dir: &Path, root_canon: &Path, out: &mut Vec<PathBuf>) {
    collect_into(dir, root_canon, 0, out);
}

fn collect_into(dir: &Path, root_canon: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > WALK_MAX_DEPTH || out.len() as u64 >= WALK_MAX_ENTRIES {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() as u64 >= WALK_MAX_ENTRIES {
            return;
        }
        let path = entry.path();
        let dominated = !is_link(&path)
            && path.canonicalize().map(|c| c.starts_with(root_canon)).unwrap_or(false);
        if dominated && path.is_dir() {
            collect_into(&path, root_canon, depth + 1, out);
        }
        out.push(path);
    }
}

async fn remove_dir_with_progress(dir: &Path, task: &TaskReporter) {
    // 旧逻辑只对顶层子项计数并逐个整体删，最后 `remove_dir_all` 原子收尾，
    // 进度长期停在 ~20% 后瞬间 100%（用户实测 2026-10-21）。改为全量收集后
    // 逐个删除、按条目数线性上报（外部调研结论：阶段文案＋真实计数，不伪造）。
    // 收集是同步全树 walk（大 node_modules 可达数秒），必须搬进 blocking 池，
    // 否则堵住本 async 任务的取消检查与进度（与 install 侧 H1 同类问题）。
    let root_canon = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    let dir_owned = dir.to_path_buf();
    let entries: Vec<PathBuf> = tokio::task::spawn_blocking(move || {
        let mut out = Vec::new();
        collect_for_removal(&dir_owned, &root_canon, &mut out);
        out
    })
    .await
    .unwrap_or_default();
    let total = entries.len() as u64;
    task.update(VersionTaskPhase::Removing, Some(5), 0, total, false);
    let mut done = 0u64;
    for path in entries {
        let ok = if is_link(&path) || path.is_file() {
            tokio::fs::remove_file(&path).await.is_ok()
        } else {
            tokio::fs::remove_dir(&path).await.is_ok()
        };
        if !ok {
            // 顽固条目留痕不断链：最后整体删会再试一次。
            tracing::warn!(path = %path.display(), "dsh uninstall: remove entry failed, will retry with whole dir");
        }
        done += 1;
        if done % 16 == 0 || done == total {
            let percent = 5 + (90 * done.min(total) / total.max(1)).min(90);
            task.update(VersionTaskPhase::Removing, Some(percent as u8), done, total, false);
        }
    }
    let _ = tokio::fs::remove_dir_all(dir).await;
    task.update(VersionTaskPhase::Removing, Some(100), total, total, false);
}

/// 卸载指定版本：删除 `installed/<version>/`。
///
/// 内置预置版本也是普通已装版本，走同一条路径（来源记录由调用方清除）。
pub async fn uninstall(root: &Path, version: &str, task: &TaskReporter) -> Result<(), AppError> {
    tracing::debug!(%version, "dsh uninstall: request");
    let dir = installed_dir(root).join(version);
    if !dir.is_dir() {
        tracing::debug!(%version, "dsh uninstall: rejected (not installed)");
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    task.update(VersionTaskPhase::Removing, Some(2), 0, 0, true);
    if task.is_cancelled() {
        tracing::debug!(%version, "dsh uninstall: cancelled before move-to-trash");
        return Err(cancelled());
    }

    let trash = dir.with_file_name(format!(".removing-{version}-{}", nonce()));
    let was_selected = read_selected(root)? == Some(version.to_string());
    tracing::debug!(%version, was_selected, "dsh uninstall: moving to trash");
    tokio::fs::rename(&dir, &trash)
        .await
        .map_err(|e| AppError::Io(format!("remove {}: {e}", dir.display())))?;

    task.update(VersionTaskPhase::Removing, Some(5), 0, 0, true);
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        if task.is_cancelled() {
            tracing::debug!(%version, "dsh uninstall: cancelled during grace window, restored");
            let _ = tokio::fs::rename(&trash, &dir).await;
            return Err(cancelled());
        }
    }

    if was_selected {
        let next = crate::highest_installed(root)?;
        tracing::debug!(%version, next = ?next, "dsh uninstall: was selected, reselecting");
        let body = next.map(|v| format!("{v}\n")).unwrap_or_default();
        tokio::fs::write(selected_file(root), body)
            .await
            .map_err(|e| AppError::Io(format!("update selected: {e}")))?;
    }

    remove_dir_with_progress(&trash, task).await;
    tracing::info!(%version, was_selected, "dsh uninstall: completed");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("dshinstall-{}-{tag}", std::process::id()));
        if root.exists() {
            let _ = std::fs::remove_dir_all(&root);
        }
        root
    }

    #[test]
    fn npm_args_include_prefix_registry_and_version() {
        let args = npm_install_args(Path::new("/tmp/x"), "1.2.3", "https://registry.npmmirror.com");
        assert!(args.windows(2).any(|w| w == ["--prefix", "/tmp/x"]));
        assert!(args.contains(&"--registry=https://registry.npmmirror.com".to_string()));
        assert!(args.contains(&"@deepseek-ai/dsh@1.2.3".to_string()));
        assert!(args.contains(&"--no-audit".to_string()));
        assert!(args.contains(&"--no-fund".to_string()));
    }

    #[test]
    fn dry_run_args_include_json_and_dry_run() {
        let args = npm_dry_run_args(Path::new("/tmp/x"), "1.2.3", "https://registry.npmjs.org");
        assert!(args.contains(&"--dry-run".to_string()));
        assert!(args.contains(&"--json".to_string()));
        assert!(args.contains(&"@deepseek-ai/dsh@1.2.3".to_string()));
    }

    #[test]
    fn parse_dry_run_total_reads_added() {
        assert_eq!(parse_dry_run_total(br#"{"added": 613}"#), 613);
        assert_eq!(parse_dry_run_total(br#"{"packages": 42}"#), 42);
        assert_eq!(parse_dry_run_total(b"add pkg 1.0.0\n{\n  \"added\": 683\n}"), 683);
        assert_eq!(parse_dry_run_total(b"not json"), 0);
    }

    #[test]
    fn count_installed_packages_counts_package_json_holders_like_dry_run_added() {
        // 与 dry-run total（npm `added` 包数）同口径：只计持有 package.json 的目录
        // （= 一个逻辑包），跳过点文件与链接；无 package.json 的中间目录不计。
        let root = fresh_root("count");
        let nm = root.join("node_modules");
        std::fs::create_dir_all(nm.join("a").join("nested")).unwrap();
        std::fs::create_dir_all(nm.join("@scope").join("b")).unwrap();
        std::fs::create_dir_all(nm.join("@scope").join("c")).unwrap();
        std::fs::create_dir_all(nm.join(".bin")).unwrap();
        std::fs::write(nm.join("a").join("package.json"), "{}").unwrap();
        std::fs::write(nm.join("a").join("nested").join("package.json"), "{}").unwrap();
        std::fs::write(nm.join("@scope").join("b").join("package.json"), "{}").unwrap();
        // a, a/nested, @scope/b（@scope/c 无 package.json 不计，.bin 跳过）
        assert_eq!(count_installed_packages(&root), 3);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn uninstall_cancel_restores_directory_and_selected() {
        let root = fresh_root("uninstall_cancel");
        let lib = root.join("installed").join("1.0.0").join("node_modules/@deepseek-ai/dsh/lib");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("bin.js"), "").unwrap();
        std::fs::write(selected_file(&root), "1.0.0\n").unwrap();

        let reporter = TaskReporter::new();
        let task_reporter = reporter.clone();
        reporter.begin(crate::task::VersionTaskKind::UNINSTALL, "1.0.0");
        let root_for_task = root.clone();
        let handle =
            tokio::spawn(async move { uninstall(&root_for_task, "1.0.0", &task_reporter).await });
        tokio::time::sleep(Duration::from_millis(250)).await;
        reporter.cancel();
        let result = handle.await.unwrap();
        assert!(result.is_err());
        assert!(is_host_version_installed(&root, "1.0.0"));
        assert_eq!(read_selected(&root).unwrap().as_deref(), Some("1.0.0"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn install_rejects_invalid_semver_offline() {
        let root = fresh_root("bad");
        let data = fresh_root("bad_data");
        let task = TaskReporter::new();
        let err = install(&root, &data, "bogus!!", &task, true).await.expect_err("should fail");
        assert!(matches!(err, AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&data);
    }

    #[tokio::test]
    async fn swap_replaces_existing_directory() {
        let root = fresh_root("swap");
        let tmp = root.join(".tmp");
        let final_dir = root.join("1.0.0");
        std::fs::create_dir_all(tmp.join("node_modules")).unwrap();
        std::fs::write(tmp.join("node_modules").join("new"), "").unwrap();
        std::fs::create_dir_all(&final_dir).unwrap();
        std::fs::write(final_dir.join("old"), "").unwrap();
        // 换位语义收敛至 hosted：此处只断言结果，覆盖其同步实现。
        adl_hosted::swap_into_place(&tmp, &final_dir).expect("swap ok");
        assert!(final_dir.join("node_modules").join("new").is_file());
        assert!(!final_dir.join("old").exists());
        assert!(!root.join(".tmp").exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn tail_keeps_last_chars() {
        assert_eq!(tail("abcdef", 3), "def");
        assert_eq!(tail("abc", 10), "abc");
    }

    #[test]
    fn collect_for_removal_caps_depth_and_skips_out_of_scope() {
        // 20 层链（每层带 package.json）：收集在 WALK_MAX_DEPTH 处截断，
        // 更深部分由最后的整体 remove_dir_all 兜底删除（不无限递归）。
        // 断言结构性质而非精确条数（截断边界层的子项不展开）。
        let root = fresh_root("collect_cap");
        let mut d = root.join("trash");
        std::fs::create_dir_all(&d).unwrap();
        for i in 0..20 {
            d = d.join(format!("n{i}"));
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join("package.json"), "{}").unwrap();
        }
        let trash = root.join("trash");
        let canon = trash.canonicalize().unwrap();
        let mut out: Vec<std::path::PathBuf> = Vec::new();
        collect_for_removal(&trash, &canon, &mut out);
        // 全量应为 40 项（20 目录 + 20 文件）；截断后必须显著更少。
        assert!(out.len() < 40, "walk should be capped, got {}", out.len());
        // n13 及更深不得被收集。
        for deep in 13..20 {
            let name = format!("n{deep}");
            assert!(
                !out.iter()
                    .any(|p| p.components().any(|c| c.as_os_str() == std::ffi::OsStr::new(&name))),
                "deep level {name} must not be collected"
            );
        }
        // 浅层必须在：n0 目录与其 package.json 都在。
        assert!(out.iter().any(|p| p.ends_with("trash/n0")));
        assert!(out.iter().any(|p| p.ends_with("trash/n0/package.json")));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn apply_proxy_env_covers_lowercase_vars() {
        use adl_download_source::{DownloadSourceConfig, ProxyConfig, ProxyMode};
        let mut manual = TokioCommand::new("npm");
        apply_proxy_env(
            &mut manual,
            &DownloadSourceConfig {
                proxy: ProxyConfig {
                    mode: ProxyMode::Manual,
                    http_proxy: Some("http://127.0.0.1:8080".into()),
                    https_proxy: None,
                    no_proxy: Some("localhost".into()),
                },
                ..Default::default()
            },
        );
        // TokioCommand 不暴露 env 快照：至少保证函数可调用且不 panic；
        // 大小写双写由实现逐行保证（见函数体 set_proxy_env）。
        let mut none = TokioCommand::new("npm");
        apply_proxy_env(
            &mut none,
            &DownloadSourceConfig {
                proxy: ProxyConfig { mode: ProxyMode::None, ..Default::default() },
                ..Default::default()
            },
        );
    }

    fn make_complete_version(root: &Path, version: &str) {
        let lib = root.join("installed").join(version).join("node_modules/@deepseek-ai/dsh/lib");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("bin.js"), "").unwrap();
    }

    #[tokio::test]
    async fn uninstall_current_selects_highest_remaining() {
        // 三版本回归：删最高后应选次高（2.0.0），而非最低（1.0.0）。
        let root = fresh_root("uninstall_highest");
        for v in ["1.0.0", "2.0.0", "3.0.0"] {
            make_complete_version(&root, v);
        }
        std::fs::write(selected_file(&root), "3.0.0\n").unwrap();
        let task = TaskReporter::new();
        task.begin(crate::task::VersionTaskKind::UNINSTALL, "3.0.0");
        uninstall(&root, "3.0.0", &task).await.expect("uninstall ok");
        assert_eq!(read_selected(&root).unwrap().as_deref(), Some("2.0.0"));
        assert!(!is_host_version_installed(&root, "3.0.0"));
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 内置预置版本按普通版本卸载，且来源记录随之清除（之后不再算内置）。
    #[tokio::test]
    async fn uninstall_bundled_version_clears_marker() {
        let root = fresh_root("uninstall_bundled");
        std::fs::create_dir_all(&root).unwrap();
        make_complete_version(&root, "2.0.0");
        std::fs::write(root.join("bundled.txt"), "2.0.0\n").unwrap();
        let task = TaskReporter::new();
        task.begin(crate::task::VersionTaskKind::UNINSTALL, "2.0.0");
        crate::uninstall_with_task(&root, "2.0.0", &task).await.expect("uninstall ok");
        assert!(!is_host_version_installed(&root, "2.0.0"));
        assert!(!root.join("bundled.txt").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
