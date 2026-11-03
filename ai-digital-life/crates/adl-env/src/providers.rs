//! Hosted-install providers for environment dependencies.
//!
//! `node`/`git`/`bash` are hosted-install providers; `webview2`/`adlserver`
//! are detect-only (registry / bundled binary) and `netprobe` is a
//! registry-reachability probe.

pub mod adlserver;
pub mod bash;
pub mod git;
pub mod netprobe;
pub mod node;
pub mod webview2;

use std::path::{Path, PathBuf};

use adl_errors::AppError;
use sha2::{Digest, Sha256};

/// Shared candidate ordering for binary assets: mirror first when the user's
/// npm registry is npmmirror, then the configured/official URL, then both
/// fallbacks. Duplicates are removed.
pub(crate) fn candidate_urls(
    primary: String,
    mirror: String,
    official: String,
    prefer_mirror: bool,
) -> Vec<String> {
    let mut urls = Vec::new();
    let mut push = |url: String| {
        if !urls.contains(&url) {
            urls.push(url);
        }
    };
    if prefer_mirror {
        push(mirror.clone());
    }
    push(primary);
    push(mirror);
    push(official);
    urls
}

/// Whether `value` is a 64-character hex SHA-256 digest.
pub(crate) fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Lowercase hex SHA-256 of the downloaded bytes.
pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Parse a Node `SHASUMS256.txt` body (`<hex>  <filename>`) for `asset`.
pub(crate) fn parse_sha256_manifest(body: &str, asset: &str) -> Option<String> {
    for line in body.lines() {
        let mut parts = line.split_whitespace();
        let Some(hash) = parts.next() else {
            continue;
        };
        let Some(name) = parts.next() else {
            continue;
        };
        let name = name.trim_start_matches('*');
        if name == asset && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(hash.to_ascii_lowercase());
        }
    }
    None
}

/// Fetch a checksum manifest and return the hash for `asset`.
pub(crate) async fn fetch_sha256_manifest(
    client: &reqwest::Client,
    url: &str,
    asset: &str,
) -> Result<String, AppError> {
    let resp =
        client.get(url).send().await.map_err(|e| AppError::Network(format!("fetch {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("fetch {url}: HTTP {}", resp.status())));
    }
    let body = resp.text().await.map_err(|e| AppError::Network(format!("read {url}: {e}")))?;
    parse_sha256_manifest(&body, asset)
        .ok_or_else(|| AppError::Network(format!("{asset} not found in {url}")))
}

fn verify_sha256(url: &str, bytes: &[u8], expected: &str) -> Result<(), AppError> {
    let actual = sha256_hex(bytes);
    if actual.eq_ignore_ascii_case(expected) {
        return Ok(());
    }
    Err(AppError::InvalidInput(format!(
        "checksum mismatch for {url}: expected {expected}, got {actual}"
    )))
}

/// Download a zip from `url` with the caller-supplied registry/proxy-aware
/// client (built via `adl_download_source::build_http_client` — never build a
/// second client here), extract it into a fresh staging dir, unwrap a single
/// top-level folder when the marker is not at the root (node dist ships
/// `node-v<V>-win-x64/`; PortableGit ships files at the root — both converge to
/// `marker_rel` at the staging root), validate `marker_rel`, and return the
/// staging dir for the caller to [`adl_hosted::swap_into_place`].
///
/// Marker missing, bad zip, HTTP error, or a SHA-256 mismatch against
/// `expected_sha256` → staging is removed and `Err`. The digest is checked
/// before extraction, so no unverified bytes are ever unpacked. Git uses the
/// SFX path ([`fetch_and_stage_sfx`]) because PortableGit ships as a 7-Zip
/// self-extracting archive.
///
/// Zip extraction runs on `spawn_blocking` so a large archive never stalls the
/// async runtime (JoinError propagates as `AppError::Io`).
pub async fn fetch_and_stage(
    client: &reqwest::Client,
    url: &str,
    marker_rel: &str,
    expected_sha256: &str,
) -> Result<PathBuf, AppError> {
    let staging = std::env::temp_dir().join(format!("adl-env-staging-{}", nonce()));
    std::fs::create_dir_all(&staging)
        .map_err(|e| AppError::Io(format!("create {}: {e}", staging.display())))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("download {url}: {e}"))))?;
    let meta = response_meta(&resp);
    if !resp.status().is_success() {
        return Err(abort(
            &staging,
            AppError::Network(format!("download {url}: HTTP {} ({meta})", resp.status())),
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("read {url} ({meta}): {e}"))))?;
    verify_sha256(url, &bytes, expected_sha256).map_err(|e| abort(&staging, e))?;

    // zip 解压是阻塞 CPU+IO（几十 MB 归档可达数秒）：搬到 blocking 池。
    let staging_for_zip = staging.clone();
    let marker_owned = marker_rel.to_string();
    let url_owned = url.to_string();
    let extracted = tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| AppError::InvalidInput(format!("open zip from {url_owned}: {e}")))?;
        // `extract` rejects absolute / `..` entries via `enclosed_name` (zip 2.x).
        archive
            .extract(&staging_for_zip)
            .map_err(|e| AppError::InvalidInput(format!("extract zip from {url_owned}: {e}")))?;
        unwrap_single_top_dir(&staging_for_zip, &marker_owned);
        Ok(())
    })
    .await;
    match extracted {
        Ok(Ok(())) => {},
        Ok(Err(e)) => return Err(abort(&staging, e)),
        Err(e) => {
            return Err(abort(&staging, AppError::Io(format!("zip extract task failed: {e}"))));
        },
    }

    if !staging.join(marker_rel).is_file() {
        return Err(abort(
            &staging,
            AppError::InvalidInput(format!("marker {marker_rel} missing after extracting {url}")),
        ));
    }
    Ok(staging)
}

/// Download a 7-Zip self-extracting archive (Git for Windows PortableGit
/// `PortableGit-*.7z.exe`), run its silent extract switches into a fresh
/// staging dir, validate `marker_rel`, and return the staging dir.
///
/// The archive is a PE executable: the caller must only pass a URL from the
/// official Git for Windows release or the configured npmmirror mirror (the
/// same asset path), and must pass the expected SHA-256 from the GitHub
/// release API (or the pinned baseline) so a mirror cannot swap the payload.
/// The extractor runs on `spawn_blocking` and is hidden on Windows.
pub async fn fetch_and_stage_sfx(
    client: &reqwest::Client,
    url: &str,
    marker_rel: &str,
    expected_sha256: &str,
) -> Result<PathBuf, AppError> {
    let staging = std::env::temp_dir().join(format!("adl-env-staging-{}", nonce()));
    std::fs::create_dir_all(&staging)
        .map_err(|e| AppError::Io(format!("create {}: {e}", staging.display())))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("download {url}: {e}"))))?;
    let meta = response_meta(&resp);
    if !resp.status().is_success() {
        return Err(abort(
            &staging,
            AppError::Network(format!("download {url}: HTTP {} ({meta})", resp.status())),
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| abort(&staging, AppError::Network(format!("read {url} ({meta}): {e}"))))?;
    verify_sha256(url, &bytes, expected_sha256).map_err(|e| abort(&staging, e))?;

    // 7z SFX 必须落成文件才能执行；放在 staging 旁边，避免污染最终目录。
    let archive = std::env::temp_dir().join(format!("adl-env-sfx-{}.7z.exe", nonce()));
    std::fs::write(&archive, &bytes)
        .map_err(|e| abort(&staging, AppError::Io(format!("write {}: {e}", archive.display()))))?;

    let staging_for_run = staging.clone();
    let archive_for_run = archive.clone();
    let marker_owned = marker_rel.to_string();
    let url_owned = url.to_string();
    let extracted = tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        let code = run_sfx(&archive_for_run, &staging_for_run)
            .map_err(|e| AppError::Io(format!("run 7z sfx from {url_owned}: {e}")))?;
        if code != 0 {
            return Err(AppError::InvalidInput(format!(
                "7z sfx from {url_owned} exited with code {code}"
            )));
        }
        unwrap_single_top_dir(&staging_for_run, &marker_owned);
        Ok(())
    })
    .await;
    let _ = std::fs::remove_file(&archive);
    match extracted {
        Ok(Ok(())) => {},
        Ok(Err(e)) => return Err(abort(&staging, e)),
        Err(e) => {
            return Err(abort(&staging, AppError::Io(format!("7z sfx extract task failed: {e}"))));
        },
    }

    if !staging.join(marker_rel).is_file() {
        return Err(abort(
            &staging,
            AppError::InvalidInput(format!("marker {marker_rel} missing after extracting {url}")),
        ));
    }
    Ok(staging)
}

/// Silent 7-Zip SFX extraction arguments. Never add `-gm2`: the official
/// Git for Windows SFX ignores it and can exit 0 without extracting anything.
fn sfx_args(staging: &Path) -> Vec<String> {
    vec!["-y".to_string(), format!("-o{}", staging.display())]
}

/// Run the SFX with its GUI window hidden (`STARTF_USESHOWWINDOW` + `SW_HIDE`)
/// and return its exit code. `CREATE_NO_WINDOW` alone only hides consoles, not
/// the SFX's own progress dialog.
#[cfg(windows)]
fn run_sfx(archive: &Path, staging: &Path) -> Result<u32, AppError> {
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{
        CREATE_NO_WINDOW, CreateProcessW, GetExitCodeProcess, INFINITE, PROCESS_INFORMATION,
        WaitForSingleObject,
    };
    use windows::core::{PCWSTR, PWSTR};

    let exe: Vec<u16> = archive.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut command_line: Vec<u16> = format!(
        "{} {}",
        quote_windows_arg(&archive.to_string_lossy()),
        sfx_args(staging).iter().map(|arg| quote_windows_arg(arg)).collect::<Vec<_>>().join(" ")
    )
    .encode_utf16()
    .chain(Some(0))
    .collect();
    let startup = hidden_startup_info();
    let mut process = PROCESS_INFORMATION::default();
    unsafe {
        CreateProcessW(
            PCWSTR(exe.as_ptr()),
            Some(PWSTR(command_line.as_mut_ptr())),
            None,
            None,
            false,
            CREATE_NO_WINDOW,
            None,
            PCWSTR::null(),
            &startup,
            &mut process,
        )
        .map_err(|e| AppError::Io(format!("launch 7z sfx {}: {e}", archive.display())))?;
        let wait = WaitForSingleObject(process.hProcess, INFINITE);
        let mut code = 0u32;
        let _ = GetExitCodeProcess(process.hProcess, &mut code);
        let _ = CloseHandle(process.hProcess);
        let _ = CloseHandle(process.hThread);
        if wait != WAIT_OBJECT_0 {
            return Err(AppError::Io(format!(
                "wait for 7z sfx {} failed: {wait:?}",
                archive.display()
            )));
        }
        Ok(code)
    }
}

#[cfg(windows)]
fn hidden_startup_info() -> windows::Win32::System::Threading::STARTUPINFOW {
    use windows::Win32::System::Threading::{STARTF_USESHOWWINDOW, STARTUPINFOW};

    STARTUPINFOW {
        cb: std::mem::size_of::<STARTUPINFOW>() as u32,
        dwFlags: STARTF_USESHOWWINDOW,
        wShowWindow: 0, // SW_HIDE
        ..Default::default()
    }
}

/// Windows command-line quoting for `CreateProcessW` (spaces/quotes).
fn quote_windows_arg(arg: &str) -> String {
    if !arg.chars().any(|c| c == ' ' || c == '\t' || c == '"') {
        return arg.to_string();
    }
    let mut out = String::with_capacity(arg.len() + 2);
    out.push('"');
    let mut backslashes = 0;
    for ch in arg.chars() {
        match ch {
            '\\' => {
                backslashes += 1;
                out.push('\\');
            },
            '"' => {
                out.push_str(&"\\".repeat(backslashes + 1));
                out.push('"');
                backslashes = 0;
            },
            _ => {
                backslashes = 0;
                out.push(ch);
            },
        }
    }
    out.push_str(&"\\".repeat(backslashes));
    out.push('"');
    out
}

#[cfg(not(windows))]
fn run_sfx(archive: &Path, staging: &Path) -> Result<u32, AppError> {
    let output = std::process::Command::new(archive)
        .args(sfx_args(staging))
        .output()
        .map_err(|e| AppError::Io(format!("run 7z sfx {}: {e}", archive.display())))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::InvalidInput(format!(
            "7z sfx {} exited with {}: {}",
            archive.display(),
            output.status,
            stderr.trim()
        )));
    }
    Ok(0)
}

/// If `marker_rel` is not at the `staging` root but lives one level down
/// under a single top-level directory (node portable-zip layout), hoist its
/// children to the root. Best-effort and infallible: the marker check after
/// extraction decides accept/reject.
fn unwrap_single_top_dir(staging: &Path, marker_rel: &str) {
    if staging.join(marker_rel).exists() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(staging) else {
        return;
    };
    let tops: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    if tops.len() != 1 || !tops[0].is_dir() || !tops[0].join(marker_rel).exists() {
        return;
    }
    let top = &tops[0];
    let Ok(children) = std::fs::read_dir(top) else {
        return;
    };
    let mut moved = true;
    for child in children.flatten() {
        if std::fs::rename(child.path(), staging.join(child.file_name())).is_err() {
            moved = false;
            break;
        }
    }
    if moved {
        let _ = std::fs::remove_dir(top);
    }
}

/// Best-effort staging cleanup; returns `err` so call sites read as one line.
fn abort(staging: &Path, err: AppError) -> AppError {
    let _ = std::fs::remove_dir_all(staging);
    err
}

/// Response header summary for diagnostics (never the body).
fn response_meta(resp: &reqwest::Response) -> String {
    let header = |name: reqwest::header::HeaderName| {
        resp.headers().get(name).and_then(|value| value.to_str().ok()).unwrap_or("-")
    };
    format!(
        "content-encoding={}, content-length={}, content-type={}",
        header(reqwest::header::CONTENT_ENCODING),
        header(reqwest::header::CONTENT_LENGTH),
        header(reqwest::header::CONTENT_TYPE),
    )
}

fn nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{git, webview2};

    #[test]
    fn parses_reg_query_pv_line() {
        let out = "    pv    REG_SZ    140.0.3485.94";
        assert_eq!(webview2::parse_pv(out), Some("140.0.3485.94".into()));
        assert_eq!(webview2::parse_pv(""), None);
    }

    #[test]
    fn picks_highest_of_hklm_hkcu() {
        assert_eq!(
            webview2::pick_highest(Some("139.0.0.0"), Some("140.0.0.0")),
            Some("140.0.0.0".into())
        );
    }

    #[test]
    fn webview2_queries_documented_clients_keys() {
        assert_eq!(
            webview2::hklm_machine_keys(),
            [
                r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            ]
        );
        assert_eq!(
            webview2::hkcu_key(),
            r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        );
    }

    #[test]
    fn picks_highest_across_three_hives() {
        let machine_best = webview2::pick_highest(Some("139.0.0.0"), Some("155.0.4283.62"));
        assert_eq!(
            webview2::pick_highest(machine_best.as_deref(), Some("140.0.0.0")),
            Some("155.0.4283.62".into())
        );
    }

    #[test]
    fn git_portable_url_uses_verbatim_tag_and_asset() {
        assert_eq!(
            git::portable_git_url(
                git::OFFICIAL_GIT_BASE,
                "v2.56.0.windows.4",
                "PortableGit-2.56.0.4-64-bit.7z.exe"
            ),
            "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.4/PortableGit-2.56.0.4-64-bit.7z.exe"
        );
    }

    #[test]
    fn sfx_args_use_silent_output_and_never_gm2() {
        let args = super::sfx_args(std::path::Path::new("C:/tmp/stage"));
        assert_eq!(args, vec!["-y".to_string(), "-oC:/tmp/stage".to_string()]);
        assert!(!args.iter().any(|arg| arg.contains("-gm2")));
    }

    #[test]
    fn windows_arg_quoting_handles_spaces_and_quotes() {
        assert_eq!(super::quote_windows_arg("plain"), "plain");
        assert_eq!(super::quote_windows_arg(r"C:\Program Files\Git"), r#""C:\Program Files\Git""#);
        assert_eq!(super::quote_windows_arg(r#"a"b"#), r#""a\"b""#);
    }

    #[cfg(windows)]
    #[test]
    fn sfx_startup_info_hides_the_window() {
        use windows::Win32::System::Threading::STARTF_USESHOWWINDOW;

        let info = super::hidden_startup_info();
        assert_eq!(info.dwFlags, STARTF_USESHOWWINDOW);
        assert_eq!(info.wShowWindow, 0);
        assert_eq!(
            info.cb as usize,
            std::mem::size_of::<windows::Win32::System::Threading::STARTUPINFOW>()
        );
    }

    #[test]
    fn git_version_parses() {
        assert_eq!(git::parse_version("git version 2.47.1.windows.1"), Some("2.47.1".into()));
        assert_eq!(git::parse_version("not git"), None);
    }

    #[test]
    fn sha256_hex_matches_known_digest() {
        assert_eq!(
            super::sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_manifest_picks_the_matching_asset() {
        let body = "\
d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5  node-v24.22.1-win-x64.zip
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  node-v24.22.1-win-x86.zip
";
        assert_eq!(
            super::parse_sha256_manifest(body, "node-v24.22.1-win-x64.zip").as_deref(),
            Some("d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5")
        );
        assert!(super::parse_sha256_manifest(body, "missing.zip").is_none());
    }

    #[test]
    fn verify_sha256_rejects_a_mismatch() {
        let err = super::verify_sha256(
            "https://example/asset.zip",
            b"payload",
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .expect_err("mismatch must fail");
        assert!(err.to_string().contains("checksum mismatch"), "{err}");
    }

    #[test]
    fn candidate_urls_are_unique_and_mirror_first_when_preferred() {
        let primary = "https://configured/asset";
        let mirror = "https://mirror/asset";
        let official = "https://official/asset";
        assert_eq!(
            super::candidate_urls(primary.into(), mirror.into(), official.into(), true),
            vec![mirror, primary, official]
        );
        assert_eq!(
            super::candidate_urls(primary.into(), mirror.into(), official.into(), false),
            vec![primary, mirror, official]
        );
    }

    #[test]
    fn is_sha256_hex_requires_64_hex_chars() {
        assert!(super::is_sha256_hex(
            "d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5"
        ));
        assert!(!super::is_sha256_hex(""));
        assert!(!super::is_sha256_hex("xyz"));
        assert!(!super::is_sha256_hex(
            "d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa"
        ));
    }

    fn sample_zip() -> Vec<u8> {
        use std::io::Write;
        let mut buffer = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buffer);
            writer
                .start_file("node.exe", zip::write::SimpleFileOptions::default())
                .expect("start zip entry");
            writer.write_all(b"fake node").expect("write zip entry");
            writer.finish().expect("finish zip");
        }
        buffer.into_inner()
    }

    async fn spawn_http_stub(body: Vec<u8>) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind stub");
        let addr = listener.local_addr().expect("stub addr");
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut request = [0u8; 2048];
                let _ = socket.read(&mut request).await;
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = socket.write_all(header.as_bytes()).await;
                let _ = socket.write_all(&body).await;
            }
        });
        format!("http://{addr}/node-v24.22.1-win-x64.zip")
    }

    #[tokio::test]
    async fn fetch_and_stage_accepts_the_matching_checksum() {
        let zip = sample_zip();
        let expected = super::sha256_hex(&zip);
        let url = spawn_http_stub(zip).await;
        let client = reqwest::Client::builder().no_proxy().build().expect("client");
        let staging = super::fetch_and_stage(&client, &url, "node.exe", &expected)
            .await
            .expect("verified staging");
        assert!(staging.join("node.exe").is_file());
        let _ = std::fs::remove_dir_all(&staging);
    }

    #[tokio::test]
    async fn fetch_and_stage_rejects_a_checksum_mismatch() {
        let url = spawn_http_stub(sample_zip()).await;
        let client = reqwest::Client::builder().no_proxy().build().expect("client");
        let err = super::fetch_and_stage(
            &client,
            &url,
            "node.exe",
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .await
        .expect_err("mismatch must fail");
        assert!(err.to_string().contains("checksum mismatch"), "{err}");
    }

    #[tokio::test]
    async fn fetch_and_stage_sfx_rejects_before_executing() {
        let url = spawn_http_stub(b"not a real sfx".to_vec()).await;
        let client = reqwest::Client::builder().no_proxy().build().expect("client");
        let err = super::fetch_and_stage_sfx(
            &client,
            &url,
            "cmd/git.exe",
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .await
        .expect_err("mismatch must fail");
        assert!(err.to_string().contains("checksum mismatch"), "{err}");
    }
}
