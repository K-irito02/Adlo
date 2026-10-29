//! OpenCode 平台包安装：直接下载 npm 平台包 tarball，解出单个自包含可执行文件。
//!
//! 与 DSH 的 npm 安装不同，OpenCode 的产物就是平台包里一个 exe（Windows）/
//! 可执行文件，不需要 node 运行时。上游 `opencode-ai/postinstall.mjs` 做的三件事
//! 在这里等价实现：按 AVX2 选普通/`-baseline` 包、取 `package/bin/opencode*`、
//! 跑一次 `--version` 校验。

use std::path::Path;

use adl_errors::AppError;
use adl_hosted::{ProgressPhase, ProgressTask};

use crate::spec;

/// 一次平台包安装的输入。
pub struct PlatformInstallInput<'a> {
    /// harness 版本目录（`installed/` 与 `selected.txt` 的父目录）。
    pub root: &'a Path,
    /// 数据根（读下载源/代理配置）。
    pub data_dir: &'a Path,
    pub version: &'a str,
    /// 安装完成后是否写 `selected.txt`。
    pub select: bool,
    /// `std::env::consts::OS` 口径（`windows`/`linux`/`macos`）。
    pub platform: &'a str,
    /// `std::env::consts::ARCH` 口径（`x86_64` 由调用方归一为 `x64`）。
    pub arch: &'a str,
    pub avx2: bool,
    /// 是否执行一次 `--version` 校验（生产为 true；离线单测可置 false）。
    pub verify: bool,
}

fn nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
}

/// npm 平台包 tarball 地址（仅未加 scope 的包，OpenCode 全部满足）。
pub fn platform_tarball_url(registry: &str, package: &str, version: &str) -> String {
    format!("{}/{package}/-/{package}-{version}.tgz", registry.trim_end_matches('/'))
}

fn percent(done: u64, total: u64) -> Option<u8> {
    done.checked_mul(100)?.checked_div(total).map(|p| p.min(99) as u8)
}

fn cancelled() -> AppError {
    AppError::Cancelled("opencode install cancelled".to_string())
}

async fn download_to_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    task: &ProgressTask,
) -> Result<u64, AppError> {
    let mut resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| AppError::Network(format!("download opencode package failed: {e}")))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(format!("download opencode package failed: HTTP {status}")));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| AppError::Io(format!("create {}: {e}", dest.display())))?;
    let mut done = 0u64;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| AppError::Network(format!("read opencode package failed: {e}")))?
    {
        if task.is_cancelled() {
            return Err(cancelled());
        }
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| AppError::Io(format!("write {}: {e}", dest.display())))?;
        done += chunk.len() as u64;
        task.update(ProgressPhase::Installing, percent(done, total), done, total, true);
    }
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|e| AppError::Io(format!("flush {}: {e}", dest.display())))?;
    Ok(done)
}

/// 从 `.tgz` 中解出 `package/<bin_rel>` 到 `dest`，返回写入字节数。
///
/// 只写目标条目：tar 里的其它路径（含绝对路径/`..`）一律不落地，天然规避
/// tar-slip；路径比较按 `/` 归一，兼容 Windows。
pub fn extract_binary_from_tgz(tgz: &Path, bin_rel: &str, dest: &Path) -> Result<u64, AppError> {
    let wanted = format!("package/{}", bin_rel.replace('\\', "/"));
    let file = std::fs::File::open(tgz)
        .map_err(|e| AppError::Io(format!("open {}: {e}", tgz.display())))?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
    let entries =
        archive.entries().map_err(|e| AppError::Io(format!("read tar {}: {e}", tgz.display())))?;
    for entry in entries {
        let mut entry =
            entry.map_err(|e| AppError::Io(format!("read tar entry in {}: {e}", tgz.display())))?;
        let path = entry
            .path()
            .map_err(|e| AppError::Io(format!("read tar path in {}: {e}", tgz.display())))?;
        if path.to_string_lossy().replace('\\', "/") != wanted {
            continue;
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Io(format!("create {}: {e}", parent.display())))?;
        }
        let mut out = std::fs::File::create(dest)
            .map_err(|e| AppError::Io(format!("create {}: {e}", dest.display())))?;
        let written = std::io::copy(&mut entry, &mut out)
            .map_err(|e| AppError::Io(format!("extract {}: {e}", dest.display())))?;
        return Ok(written);
    }
    Err(AppError::NotFound(format!("{} not found in {}", wanted, tgz.display())))
}

async fn verify_binary(path: &Path) -> Result<(), AppError> {
    let output = tokio::process::Command::new(path)
        .arg("--version")
        .output()
        .await
        .map_err(|e| AppError::Io(format!("run {} --version: {e}", path.display())))?;
    if !output.status.success() {
        return Err(AppError::Io(format!(
            "{} --version exited with {}",
            path.display(),
            output.status
        )));
    }
    Ok(())
}

async fn try_candidate(
    input: &PlatformInstallInput<'_>,
    package: &str,
    client: &reqwest::Client,
    registry: &str,
    tgz: &Path,
    task: &ProgressTask,
) -> Result<(), AppError> {
    let url = platform_tarball_url(registry, package, input.version);
    tracing::info!(%url, "opencode install: downloading platform package");
    download_to_file(client, &url, tgz, task).await?;
    let staging =
        crate::installed_dir(input.root).join(format!(".tmp-{}-{}", input.version, nonce()));
    if staging.exists() {
        let _ = tokio::fs::remove_dir_all(&staging).await;
    }
    tokio::fs::create_dir_all(&staging)
        .await
        .map_err(|e| AppError::Io(format!("create {}: {e}", staging.display())))?;
    let dest = staging.join(spec::OPENCODE_BIN_REL);
    let extract_tgz = tgz.to_path_buf();
    let extract_dest = dest.clone();
    let bin_rel = spec::OPENCODE_BIN_REL.to_string();
    let written = match tokio::task::spawn_blocking(move || {
        extract_binary_from_tgz(&extract_tgz, &bin_rel, &extract_dest)
    })
    .await
    {
        Ok(Ok(written)) => written,
        Ok(Err(e)) => {
            let _ = tokio::fs::remove_dir_all(&staging).await;
            return Err(e);
        },
        Err(e) => {
            let _ = tokio::fs::remove_dir_all(&staging).await;
            return Err(AppError::Io(format!("extract task failed: {e}")));
        },
    };
    if written == 0 {
        let _ = tokio::fs::remove_dir_all(&staging).await;
        return Err(AppError::Io(format!("extracted {} is empty", dest.display())));
    }
    if input.verify {
        if let Err(e) = verify_binary(&dest).await {
            let _ = tokio::fs::remove_dir_all(&staging).await;
            return Err(e);
        }
    }
    let final_dir = crate::installed_dir(input.root).join(input.version);
    let swap_staging = staging.clone();
    let swap_target = final_dir.clone();
    let swapped = tokio::task::spawn_blocking(move || {
        adl_hosted::swap_into_place(&swap_staging, &swap_target)
    })
    .await
    .unwrap_or_else(|e| Err(AppError::Io(format!("swap task failed: {e}"))));
    if let Err(e) = swapped {
        let _ = tokio::fs::remove_dir_all(&staging).await;
        return Err(e);
    }
    Ok(())
}

async fn install_inner(
    input: &PlatformInstallInput<'_>,
    task: &ProgressTask,
) -> Result<String, AppError> {
    let version = input.version.trim();
    semver::Version::parse(version)
        .map_err(|_| AppError::InvalidInput(format!("invalid version {version}")))?;
    let config = adl_download_source::load(input.data_dir)?;
    let registry = adl_download_source::resolve_registry(&config).to_string();
    let client = adl_download_source::build_http_client(&config)?;
    let installed = crate::installed_dir(input.root);
    tokio::fs::create_dir_all(&installed)
        .await
        .map_err(|e| AppError::Io(format!("create {}: {e}", installed.display())))?;
    let tgz = installed.join(format!(".tmp-{version}-{}.tgz", nonce()));
    let candidates = spec::opencode_platform_packages(input.platform, input.arch, input.avx2);
    let mut last_error: Option<AppError> = None;
    for package in candidates {
        if task.is_cancelled() {
            let _ = tokio::fs::remove_file(&tgz).await;
            return Err(cancelled());
        }
        task.update(ProgressPhase::Preparing, None, 0, 0, true);
        match try_candidate(input, &package, &client, &registry, &tgz, task).await {
            Ok(()) => {
                let _ = tokio::fs::remove_file(&tgz).await;
                if !crate::is_version_installed_for(&spec::OPENCODE, input.root, version) {
                    return Err(AppError::Io(format!("installed {version} is incomplete")));
                }
                if input.select {
                    tokio::fs::write(crate::selected_file(input.root), format!("{version}\n"))
                        .await
                        .map_err(|e| AppError::Io(format!("write selected: {e}")))?;
                }
                task.update(ProgressPhase::Finalizing, Some(100), 1, 1, false);
                tracing::info!(%version, package = %package, "opencode install: completed");
                return Ok(version.to_string());
            },
            Err(e @ AppError::Cancelled(_)) => {
                let _ = tokio::fs::remove_file(&tgz).await;
                return Err(e);
            },
            Err(e) => {
                tracing::warn!(package = %package, error = %e, "opencode install: candidate failed");
                let _ = tokio::fs::remove_file(&tgz).await;
                last_error = Some(e);
            },
        }
    }
    Err(last_error.unwrap_or_else(|| {
        AppError::NotFound(format!("no opencode platform package for {version}"))
    }))
}

/// 安装 OpenCode 指定版本：按平台包候选依次尝试，首个成功即落盘。
///
/// 任务生命周期归调用方（服务端 begin/finish）；本函数只推进进度并在失败时记录错误。
pub async fn install(
    input: PlatformInstallInput<'_>,
    task: &ProgressTask,
) -> Result<String, AppError> {
    match install_inner(&input, task).await {
        Ok(version) => Ok(version),
        Err(e) => {
            task.set_error(&e.to_string());
            Err(e)
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default()
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("adl_oc_{tag}_{}", nanos()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn write_tgz(path: &Path, entries: &[(&str, &[u8])]) {
        let bytes = tgz_bytes(entries);
        std::fs::write(path, bytes).expect("write tgz");
    }

    fn tgz_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        {
            let mut builder = tar::Builder::new(&mut gz);
            for (name, data) in entries {
                let mut header = tar::Header::new_gnu();
                header.set_size(data.len() as u64);
                header.set_mode(0o755);
                header.set_mtime(0);
                header.set_cksum();
                builder.append_data(&mut header, name, *data).expect("append tar entry");
            }
            builder.finish().expect("finish tar");
        }
        gz.finish().expect("finish gzip")
    }

    #[tokio::test]
    async fn installs_from_a_local_registry_and_selects_the_version() {
        let dir = temp_dir("e2e-install");
        let data = dir.join("data");
        let root = dir.join("versions");
        std::fs::create_dir_all(data.join("config")).expect("config dir");
        let body = tgz_bytes(&[("package/bin/opencode.exe", b"fake-opencode")]);

        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        let served = body.clone();
        tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                let mut buf = [0u8; 2048];
                let _ = sock.read(&mut buf).await;
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",
                    served.len()
                );
                let _ = sock.write_all(header.as_bytes()).await;
                let _ = sock.write_all(&served).await;
                let _ = sock.shutdown().await;
            }
        });
        std::fs::write(
            data.join("config").join("download-sources.json"),
            format!(
                "{{\"npm_registry\":\"http://{addr}\",\"source_mode\":\"manual\",\"proxy\":{{\"mode\":\"none\"}}}}"
            ),
        )
        .expect("write config");

        let task = ProgressTask::new();
        task.begin("opencode-install", "1.0.0");
        let input = PlatformInstallInput {
            root: &root,
            data_dir: &data,
            version: "1.0.0",
            select: true,
            platform: "windows",
            arch: "x64",
            avx2: true,
            verify: false,
        };
        install(input, &task).await.expect("install");
        assert!(crate::is_version_installed_for(&spec::OPENCODE, &root, "1.0.0"));
        assert_eq!(
            std::fs::read_to_string(root.join("selected.txt")).expect("selected").trim(),
            "1.0.0"
        );
        assert_eq!(
            std::fs::read(root.join("installed/1.0.0/bin/opencode.exe")).expect("marker"),
            b"fake-opencode"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tarball_url_is_registry_relative() {
        assert_eq!(
            platform_tarball_url("https://registry.npmjs.org/", "opencode-windows-x64", "1.19.5"),
            "https://registry.npmjs.org/opencode-windows-x64/-/opencode-windows-x64-1.19.5.tgz"
        );
        assert_eq!(
            platform_tarball_url("https://registry.npmmirror.com", "opencode-ai", "1.0.0"),
            "https://registry.npmmirror.com/opencode-ai/-/opencode-ai-1.0.0.tgz"
        );
    }

    #[test]
    fn extracts_only_the_platform_binary() {
        let dir = temp_dir("extract");
        let tgz = dir.join("pkg.tgz");
        write_tgz(
            &tgz,
            &[
                ("package/package.json", b"{}"),
                ("package/bin/opencode.exe", b"fake-binary"),
                ("package/unrelated.txt", b"noise"),
            ],
        );
        let dest = dir.join("out").join("bin").join("opencode.exe");
        let written = extract_binary_from_tgz(&tgz, "bin/opencode.exe", &dest).expect("extract");
        assert_eq!(written, b"fake-binary".len() as u64);
        assert_eq!(std::fs::read(&dest).expect("read"), b"fake-binary");
        assert!(!dir.join("out").join("unrelated.txt").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_binary_is_not_found() {
        let dir = temp_dir("missing");
        let tgz = dir.join("pkg.tgz");
        write_tgz(&tgz, &[("package/readme.txt", b"nothing here")]);
        let dest = dir.join("out").join("opencode.exe");
        let err = extract_binary_from_tgz(&tgz, "bin/opencode.exe", &dest).unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)), "unexpected error: {err:?}");
        assert!(!dest.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn entries_outside_the_package_dir_are_ignored() {
        let dir = temp_dir("slip");
        let tgz = dir.join("pkg.tgz");
        write_tgz(
            &tgz,
            &[("other/bin/opencode.exe", b"evil"), ("package/bin/opencode.exe", b"good")],
        );
        let dest = dir.join("out").join("opencode.exe");
        let written = extract_binary_from_tgz(&tgz, "bin/opencode.exe", &dest).expect("extract");
        assert_eq!(written, b"good".len() as u64);
        assert_eq!(std::fs::read(&dest).expect("read"), b"good");
        assert!(!dir.join("out").join("other").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
