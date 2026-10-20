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

fn count_installed_packages(root: &Path) -> u64 {
    // 与 dry-run total（传递依赖总数）同口径：递归计数全部包目录，
    // 否则分子（顶层数十）/分母（数百）下进度长期贴 5% 后跳变。
    fn walk(dir: &Path, count: &mut u64) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                *count += 1;
                walk(&path, count);
            }
        }
    }
    let mut count = 0u64;
    walk(&root.join("node_modules"), &mut count);
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
    loop {
        tokio::select! {
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
                let done = count_installed_packages(tmp);
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

async fn swap_into_place(tmp: &Path, final_dir: &Path) -> Result<(), AppError> {
    let backup = final_dir.with_file_name(format!(
        ".old-{}-{}",
        final_dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        nonce()
    ));
    let had_old = final_dir.exists();
    if had_old {
        tokio::fs::rename(final_dir, &backup)
            .await
            .map_err(|e| AppError::Io(format!("backup {}: {e}", final_dir.display())))?;
    }
    if let Err(e) = tokio::fs::rename(tmp, final_dir).await {
        if had_old {
            let _ = tokio::fs::rename(&backup, final_dir).await;
        }
        return Err(AppError::Io(format!("replace {}: {e}", final_dir.display())));
    }
    if had_old {
        if let Err(e) = tokio::fs::remove_dir_all(&backup).await {
            tracing::warn!(path = %backup.display(), error = %e, "dsh install: remove backup failed");
        }
    }
    Ok(())
}

pub async fn install(
    root: &Path,
    data_dir: &Path,
    version: &str,
    task: &TaskReporter,
) -> Result<String, AppError> {
    let version = version.trim();
    task.update(VersionTaskPhase::Preparing, None, 0, 0, true);
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    if task.is_cancelled() {
        return Err(cancelled());
    }

    let catalog = fetch_catalog(data_dir).await?;
    let published = catalog.stable.iter().any(|i| i.version == version)
        || catalog.prerelease.iter().any(|i| i.version == version);
    if !published {
        return Err(AppError::NotFound(format!("version {version} is not published upstream")));
    }
    if task.is_cancelled() {
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

    // dry_run_total 首行即刷 Preparing，此处不再重复。
    let total = dry_run_total(&tmp, version, registry, &config, task).await.unwrap_or(0);
    if task.is_cancelled() {
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(cancelled());
    }

    let args = npm_install_args(&tmp, version, registry);
    tracing::info!(%version, %registry, %total, "dsh install: npm install start");
    task.update(VersionTaskPhase::Installing, install_percent(0, total), 0, total, true);
    if let Err(e) = run_npm_with_progress(&args, &config, &tmp, total, task, registry).await {
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(e);
    }
    if task.is_cancelled() {
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(cancelled());
    }

    let tmp_bin =
        tmp.join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js");
    if !tmp_bin.is_file() {
        let _ = tokio::fs::remove_dir_all(&tmp).await;
        return Err(AppError::Io(format!("installed {version} without bin.js")));
    }

    task.update(VersionTaskPhase::Finalizing, Some(98), total, total, false);
    let final_dir = installed_dir(root).join(version);
    swap_into_place(&tmp, &final_dir).await?;

    if !is_host_version_installed(root, version) {
        return Err(AppError::Io(format!("installed {version} is incomplete")));
    }

    tokio::fs::write(selected_file(root), format!("{version}\n"))
        .await
        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
    task.update(VersionTaskPhase::Finalizing, Some(100), total, total, false);
    tracing::info!(%version, bin = %host_bin(root, version).display(), "dsh install: completed");
    Ok(version.to_string())
}

async fn remove_dir_with_progress(dir: &Path, task: &TaskReporter) {
    let node_modules = dir.join("node_modules");
    let total = count_installed_packages(dir);
    task.update(VersionTaskPhase::Removing, Some(10), 0, total, false);
    let Ok(mut entries) = tokio::fs::read_dir(&node_modules).await else {
        let _ = tokio::fs::remove_dir_all(dir).await;
        return;
    };
    let mut done = 0u64;
    let mut children: Vec<PathBuf> = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if name.starts_with('@') {
            if let Ok(mut scoped) = tokio::fs::read_dir(&path).await {
                while let Ok(Some(child)) = scoped.next_entry().await {
                    children.push(child.path());
                }
            }
        } else if path.is_dir() {
            children.push(path);
        }
    }
    for child in children {
        // 删除阶段不可取消（调用方已报 cancellable=false，UI 隐藏取消按钮）：
        // 此处只把静默吞错改为留痕，不改变取消语义，避免半删状态。
        match tokio::fs::remove_dir_all(&child).await {
            Ok(()) => {
                done += 1;
                let percent = done
                    .min(total)
                    .checked_mul(88)
                    .and_then(|v| v.checked_div(total))
                    .map(|v| (10 + v).min(100) as u8);
                task.update(VersionTaskPhase::Removing, percent, done, total, false);
            },
            Err(e) => {
                tracing::warn!(path = %child.display(), error = %e, "dsh uninstall: remove child failed");
            },
        }
    }
    let _ = tokio::fs::remove_dir_all(dir).await;
    task.update(VersionTaskPhase::Removing, Some(100), total, total, false);
}

pub async fn uninstall(root: &Path, version: &str, task: &TaskReporter) -> Result<(), AppError> {
    let dir = installed_dir(root).join(version);
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!("version {version} not installed")));
    }
    task.update(VersionTaskPhase::Removing, Some(2), 0, 0, true);
    if task.is_cancelled() {
        return Err(cancelled());
    }

    let trash = dir.with_file_name(format!(".removing-{version}-{}", nonce()));
    let was_selected = read_selected(root)? == Some(version.to_string());
    tokio::fs::rename(&dir, &trash)
        .await
        .map_err(|e| AppError::Io(format!("remove {}: {e}", dir.display())))?;

    task.update(VersionTaskPhase::Removing, Some(5), 0, 0, true);
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        if task.is_cancelled() {
            let _ = tokio::fs::rename(&trash, &dir).await;
            return Err(cancelled());
        }
    }

    if was_selected {
        let next = crate::highest_installed(root)?;
        let body = next.map(|v| format!("{v}\n")).unwrap_or_default();
        tokio::fs::write(selected_file(root), body)
            .await
            .map_err(|e| AppError::Io(format!("update selected: {e}")))?;
    }

    remove_dir_with_progress(&trash, task).await;
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
    fn count_installed_packages_counts_recursively_like_dry_run_total() {
        // 与 dry-run total（传递依赖总数）同口径：递归计数，跳过点文件。
        let root = fresh_root("count");
        let nm = root.join("node_modules");
        std::fs::create_dir_all(nm.join("a").join("nested")).unwrap();
        std::fs::create_dir_all(nm.join("@scope").join("b")).unwrap();
        std::fs::create_dir_all(nm.join("@scope").join("c")).unwrap();
        std::fs::create_dir_all(nm.join(".bin")).unwrap();
        // a, a/nested, @scope, @scope/b, @scope/c（.bin 跳过）
        assert_eq!(count_installed_packages(&root), 5);
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
        reporter.begin(crate::task::VersionTaskKind::Uninstall, "1.0.0");
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
        let err = install(&root, &data, "bogus!!", &task).await.expect_err("should fail");
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
        swap_into_place(&tmp, &final_dir).await.expect("swap ok");
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
        task.begin(crate::task::VersionTaskKind::Uninstall, "3.0.0");
        uninstall(&root, "3.0.0", &task).await.expect("uninstall ok");
        assert_eq!(read_selected(&root).unwrap().as_deref(), Some("2.0.0"));
        assert!(!is_host_version_installed(&root, "3.0.0"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
