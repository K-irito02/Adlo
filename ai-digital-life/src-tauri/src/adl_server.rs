//! `adl-server` child-process manager for the narrowed Tauri shell.
//!
//! Task 10 makes the desktop spawn the standalone `adl-server` binary at
//! startup (`crates/server`, bin `adl-server`) with `--data-dir <app data dir>`
//! and `--port 0` (ephemeral). The bound port is read from the child's stdout
//! line `AD_SERVER_PORT=<port>`, and the resulting `http://127.0.0.1:<port>`
//! base URL is exposed to the frontend via the `app_get_server_info` command so
//! the desktop `httpBridge` connects to the real engine over HTTP/SSE/WS.
//!
//! Graceful degradation: if the binary is missing or fails to report a port,
//! the handle carries `base_url: None` and the shell logs a clear
//! `[adl-shell]` warning — the desktop keeps its system-only surface alive and
//! business calls fail over HTTP (no silent fallback to old invoke commands).
//!
//! Child lifetime: the child handle lives in `AppState`; its `Drop` kills the
//! child process tree on app exit (Windows uses `taskkill /T /F`).

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, RwLock};
use std::time::Duration;

/// Time to wait for the child's `AD_SERVER_PORT=` stdout line before giving up.
const PORT_LINE_TIMEOUT: Duration = Duration::from_secs(60);
/// Machine-parseable prefix the adl-server prints after binding (see
/// `crates/server/src/bin/adl-server.rs`).
const AD_SERVER_PORT_PREFIX: &str = "AD_SERVER_PORT=";

/// Extract the bound port from a child stdout line, e.g.
/// `AD_SERVER_PORT=54321` → `Some(54321)`. Pure + testable.
pub fn parse_ad_server_port_line(line: &str) -> Option<u16> {
    let trimmed = line.trim();
    trimmed.strip_prefix(AD_SERVER_PORT_PREFIX)?.trim().parse().ok()
}

/// Bundled sidecar file name for the current platform. The target triple in
/// Tauri's `externalBin` pattern (`binary-name{-target-triple}{.system-extension}`)
/// is a **build-time selector only**: the bundler copies the artifact next to
/// the app binary under the plain name. Runtime therefore looks for
/// `adl-server.exe` on Windows (matching the dev artifact in `target/debug/`
/// and the `adl-env` provider) and `adl-server` elsewhere (dev-only path today).
fn sidecar_file_name() -> &'static str {
    if cfg!(target_os = "windows") { "adl-server.exe" } else { "adl-server" }
}

/// Pure sibling-sidecar lookup: `Some(sibling)` when `dir/sidecar_file_name`
/// exists, else `None` (the caller then walks the workspace `target/`
/// fallback). Kept pure so unit tests need not touch `current_exe`.
fn resolve_in(dir: &Path) -> Option<PathBuf> {
    let sibling = dir.join(sidecar_file_name());
    if sibling.is_file() { Some(sibling) } else { None }
}

/// Resolve the `adl-server` binary path: ① the sidecar bundled next to the
/// running host binary (release/`cargo tauri build` layout), ② the workspace
/// `target/{debug,release}` output (dev/`cargo tauri dev` layout). Returns
/// `None` (→ graceful system-only shell) when neither exists.
fn resolve_ad_server_binary() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(sibling) = resolve_in(dir) {
                return Some(sibling);
            }
        }
    }
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent()?; // src-tauri → workspace
    let profile = if cfg!(debug_assertions) { "debug" } else { "release" };
    let exe = if cfg!(target_os = "windows") { "adl-server.exe" } else { "adl-server" };
    let candidate = workspace_root.join("target").join(profile).join(exe);
    if candidate.exists() { Some(candidate) } else { None }
}

/// Read the child's stdout line by line on a background thread, sending the
/// parsed port over the channel as soon as `AD_SERVER_PORT=` appears. The main
/// thread applies a timeout so a hung/absent binary cannot block setup forever.
fn read_bound_port(stdout: std::process::ChildStdout) -> std::sync::mpsc::Receiver<Option<u16>> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<u16>>();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => {
                    let _ = tx.send(None);
                    break;
                },
                Ok(_) => {
                    if let Some(port) = parse_ad_server_port_line(&line) {
                        let _ = tx.send(Some(port));
                        break;
                    }
                },
            }
        }
    });
    rx
}

fn kill_child_tree(child: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        let _ =
            Command::new("taskkill").args(["/pid", &child.id().to_string(), "/T", "/F"]).status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Owns the spawned `adl-server` child + its discovered base URL. `Drop` kills
/// the child tree, so storing this in managed `AppState` reaps the engine on
/// app exit.
pub struct AdServerHandle {
    child: RwLock<Option<Child>>,
    base_url: RwLock<Option<String>>,
}

impl AdServerHandle {
    /// Spawn `adl-server` for `data_dir`, wait for its ephemeral port, and store
    /// the base URL. Returns a handle with `base_url: None` (system-only) on any
    /// failure — never panics, never blocks setup beyond [`PORT_LINE_TIMEOUT`].
    pub fn spawn(data_dir: &Path) -> Arc<Self> {
        let Some(binary) = resolve_ad_server_binary() else {
            tracing::warn!(
                "[adl-shell] adl-server binary not found; desktop runs system-only (business over HTTP unavailable). \
                 Build it with `cargo build -p adl-server`."
            );
            return Arc::new(Self { child: RwLock::new(None), base_url: RwLock::new(None) });
        };

        let mut cmd = Command::new(&binary);
        cmd.arg("--data-dir").arg(data_dir).arg("--port").arg("0");
        cmd.stdout(Stdio::piped()).stderr(Stdio::inherit());
        tracing::info!(
            "[adl-shell] spawning adl-server: {} --data-dir {} --port 0",
            binary.display(),
            data_dir.display()
        );

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("[adl-shell] failed to spawn adl-server: {e}");
                return Arc::new(Self { child: RwLock::new(None), base_url: RwLock::new(None) });
            },
        };

        let rx = match child.stdout.take() {
            Some(stdout) => read_bound_port(stdout),
            None => {
                tracing::error!("[adl-shell] adl-server stdout not piped; killing child");
                kill_child_tree(&mut child);
                return Arc::new(Self { child: RwLock::new(None), base_url: RwLock::new(None) });
            },
        };

        let port = rx.recv_timeout(PORT_LINE_TIMEOUT).ok().flatten();
        match port {
            Some(port) => {
                let base_url = format!("http://127.0.0.1:{port}");
                tracing::info!("[adl-shell] adl-server bound at {base_url}");
                Arc::new(Self {
                    child: RwLock::new(Some(child)),
                    base_url: RwLock::new(Some(base_url)),
                })
            },
            None => {
                tracing::warn!(
                    "[adl-shell] adl-server did not report AD_SERVER_PORT within {PORT_LINE_TIMEOUT:?}; \
                     killing child and running system-only"
                );
                kill_child_tree(&mut child);
                Arc::new(Self { child: RwLock::new(None), base_url: RwLock::new(None) })
            },
        }
    }

    /// The discovered adl-server base URL (`http://127.0.0.1:<port>`), or `None`
    /// when the engine did not start.
    pub fn base_url(&self) -> Option<String> {
        self.base_url.read().map(|b| b.clone()).unwrap_or(None)
    }

    /// Whether an adl-server is running (base URL known and child alive).
    pub fn is_running(&self) -> bool {
        if self.base_url().is_none() {
            return false;
        }
        match self.child.write() {
            Ok(mut guard) => match guard.as_mut() {
                Some(child) => child.try_wait().map(|s| s.is_none()).unwrap_or(false),
                None => false,
            },
            Err(_) => false,
        }
    }
}

impl Drop for AdServerHandle {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.write() {
            if let Some(mut child) = guard.take() {
                tracing::info!("[adl-shell] shutting down adl-server (pid {})", child.id());
                kill_child_tree(&mut child);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_port_line_with_prefix() {
        assert_eq!(parse_ad_server_port_line("AD_SERVER_PORT=54321"), Some(54321));
    }

    #[test]
    fn parses_port_line_with_trailing_whitespace() {
        assert_eq!(parse_ad_server_port_line("  AD_SERVER_PORT=12345\n"), Some(12345));
    }

    #[test]
    fn rejects_missing_prefix() {
        assert_eq!(parse_ad_server_port_line("AD_SERVER_BIND=12345"), None);
        assert_eq!(parse_ad_server_port_line("hello"), None);
        assert_eq!(parse_ad_server_port_line(""), None);
    }

    #[test]
    fn rejects_non_numeric_port() {
        assert_eq!(parse_ad_server_port_line("AD_SERVER_PORT=not-a-number"), None);
        assert_eq!(parse_ad_server_port_line("AD_SERVER_PORT="), None);
    }

    #[test]
    fn rejects_out_of_range_port() {
        assert_eq!(parse_ad_server_port_line("AD_SERVER_PORT=999999"), None);
    }

    #[test]
    fn handle_without_child_reports_not_running() {
        let handle = AdServerHandle { child: RwLock::new(None), base_url: RwLock::new(None) };
        assert_eq!(handle.base_url(), None);
        assert!(!handle.is_running());
    }

    #[test]
    fn handle_with_base_url_reports_running_only_with_live_child() {
        // base_url set but no child → not running (spawned, then child exited).
        let handle = AdServerHandle {
            child: RwLock::new(None),
            base_url: RwLock::new(Some("http://127.0.0.1:54321".into())),
        };
        assert_eq!(handle.base_url(), Some("http://127.0.0.1:54321".into()));
        assert!(!handle.is_running());
    }

    /// 运行时 sidecar 名是 bundle 后的纯名：target triple 只是构建期选择器，
    /// 打包器不会把 triple 带进落盘文件名。
    #[test]
    fn sidecar_file_name_is_plain_bundle_name() {
        #[cfg(target_os = "windows")]
        assert_eq!(sidecar_file_name(), "adl-server.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(sidecar_file_name(), "adl-server");
    }

    #[test]
    fn prefers_sibling_sidecar_over_target_dir() {
        // `resolve_in` is a pure helper so tests need not touch `current_exe`:
        // a sibling sidecar next to the host binary wins; when absent the
        // caller falls back to the workspace target/ lookup.
        let tag = format!(
            "adl-resolve-in-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let dir = std::env::temp_dir().join(tag);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let sibling = dir.join(sidecar_file_name());
        // Absent → None (caller walks the target/ fallback).
        assert_eq!(resolve_in(&dir), None);
        // Present → Some(sibling).
        std::fs::write(&sibling, b"stub").expect("write stub sidecar");
        assert_eq!(resolve_in(&dir), Some(sibling));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
