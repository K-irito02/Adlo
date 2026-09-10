use rust_pty::PtyConfig;
use rust_pty::traits::{PtySystem as RustPtySystem, PtyMaster};
use std::time::Duration;
use tokio::io::AsyncReadExt;

async fn read_all_output(
    mut master: impl PtyMaster + 'static,
    timeout: Duration,
) -> Vec<u8> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tokio::spawn(async move {
        let mut result = Vec::new();
        let mut buf = [0u8; 8192];
        loop {
            match master.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => result.extend_from_slice(&buf[..n]),
                Err(_) => break,
            }
        }
        let _ = tx.send(result);
    });
    
    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(data)) => data,
        _ => {
            eprintln!("read_all_output timed out after {:?}", timeout);
            Vec::new()
        },
    }
}

/// These tests require a working ConPTY (Windows Pseudo Console).
/// In CI/automation environments without a real interactive session,
/// `rust_pty` may open successfully but the child process I/O
/// produces no output. To run these tests on a machine with ConPTY:
///   cargo test -p adl-pty --test windows_compat -- --include-ignored
/// Or:
///   $env:ADL_PTY_TEST = "1"; cargo test -p adl-pty --test windows_compat
#[cfg(target_os = "windows")]
mod windows_pty_tests {
    use super::*;
    
    fn should_run_pty_tests() -> bool {
        std::env::var("ADL_PTY_TEST").map(|v| v == "1").unwrap_or(false)
    }
    
    #[tokio::test]
    async fn test_cmd_echo_utf8() {
        if !should_run_pty_tests() {
            eprintln!("Skipping test_cmd_echo_utf8: set ADL_PTY_TEST=1 to run");
            return;
        }
        
        let config = PtyConfig {
            window_size: (120, 40),
            ..Default::default()
        };
        
        let (master, mut child) = rust_pty::WindowsPtySystem::spawn(
            "cmd",
            &["/c", "echo", "你好 world 🎉"],
            &config,
        ).await.expect("spawn failed");
        
        let output = tokio::time::timeout(
            Duration::from_secs(10),
            read_all_output(master, Duration::from_secs(5)),
        ).await.unwrap_or_default();
        
        let output_str = String::from_utf8_lossy(&output);
        assert!(
            output_str.contains("你好 world 🎉"),
            "Expected UTF-8 in output, got: {:?}",
            output_str,
        );
        
        child.wait().await.expect("wait failed");
    }
    
    #[tokio::test]
    async fn test_powershell_echo() {
        if !should_run_pty_tests() {
            eprintln!("Skipping test_powershell_echo: set ADL_PTY_TEST=1 to run");
            return;
        }
        
        let config = PtyConfig {
            window_size: (120, 40),
            ..Default::default()
        };
        
        let (master, mut child) = rust_pty::WindowsPtySystem::spawn(
            "powershell",
            &["-Command", "Write-Output 'Hello from PowerShell'"],
            &config,
        ).await.expect("spawn failed");
        
        let output = tokio::time::timeout(
            Duration::from_secs(10),
            read_all_output(master, Duration::from_secs(5)),
        ).await.unwrap_or_default();
        
        let output_str = String::from_utf8_lossy(&output);
        assert!(
            output_str.contains("Hello from PowerShell"),
            "Expected PowerShell output, got: {:?}",
            output_str,
        );
        
        child.wait().await.expect("wait failed");
    }
}

#[cfg(not(target_os = "windows"))]
#[test]
fn skip_windows_pty_tests() {
    println!("Skipping Windows-specific PTY tests");
}
