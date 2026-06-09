use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use std::time::Duration;

fn read_all_output(mut reader: Box<dyn Read + Send>, timeout: Duration) -> Vec<u8> {
    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        let mut result = Vec::new();
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => result.extend_from_slice(&buf[..n]),
                Err(_) => break,
            }
        }
        let _ = tx.send(result);
    });

    match rx.recv_timeout(timeout) {
        Ok(data) => data,
        Err(_) => {
            eprintln!("read_all_output timed out after {:?}", timeout);
            Vec::new()
        }
    }
}

#[cfg(target_os = "windows")]
mod windows_pty_tests {
    use super::*;

    #[test]
    fn test_cmd_echo_utf8() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
            .expect("openpty failed");

        let mut cmd = CommandBuilder::new("cmd");
        cmd.args(["/c", "echo", "你好 world 🎉"]);
        let mut child = pair.slave.spawn_command(cmd).expect("spawn command failed");

        let reader = pair.master.try_clone_reader().expect("clone reader failed");
        let _writer = pair.master.take_writer();

        let output = read_all_output(reader, Duration::from_secs(10));
        let output_str = String::from_utf8_lossy(&output);

        assert!(
            output_str.contains("你好 world 🎉"),
            "Expected UTF-8 '你好 world 🎉' in output, got: {:?}",
            output_str,
        );

        child.wait().expect("wait for child failed");
    }

    #[test]
    fn test_cmd_large_output() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
            .expect("openpty failed");

        let mut cmd = CommandBuilder::new("cmd");
        cmd.args(["/c", "for /l %i in (1,1,1000) do echo Line %i"]);
        let mut child = pair.slave.spawn_command(cmd).expect("spawn command failed");

        let reader = pair.master.try_clone_reader().expect("clone reader failed");
        let _writer = pair.master.take_writer();

        let output = read_all_output(reader, Duration::from_secs(10));
        let output_str = String::from_utf8_lossy(&output);

        let line_count = output_str.lines().count();
        assert!(line_count >= 900, "Expected at least 900 lines, got {} lines", line_count,);

        assert!(output_str.contains("Line 500"), "Expected 'Line 500' in large output",);

        child.wait().expect("wait for child failed");
    }

    #[test]
    fn test_powershell_echo() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
            .expect("openpty failed");

        let mut cmd = CommandBuilder::new("powershell");
        cmd.args(["-Command", "Write-Output 'Hello from PowerShell'"]);
        let mut child = pair.slave.spawn_command(cmd).expect("spawn command failed");

        let reader = pair.master.try_clone_reader().expect("clone reader failed");
        let _writer = pair.master.take_writer();

        let output = read_all_output(reader, Duration::from_secs(10));
        let output_str = String::from_utf8_lossy(&output);

        assert!(
            output_str.contains("Hello from PowerShell"),
            "Expected 'Hello from PowerShell' in output, got: {:?}",
            output_str,
        );

        child.wait().expect("wait for child failed");
    }

    #[test]
    fn test_exit_code_detection() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
            .expect("openpty failed");

        let mut cmd = CommandBuilder::new("cmd");
        cmd.args(["/c", "exit /b 42"]);
        let mut child = pair.slave.spawn_command(cmd).expect("spawn command failed");

        let reader = pair.master.try_clone_reader().expect("clone reader failed");
        let _writer = pair.master.take_writer();

        let _output = read_all_output(reader, Duration::from_secs(10));

        let exit_status = child.wait().expect("wait for child failed");
        assert!(!exit_status.success(), "Expected non-zero exit status");
        assert_eq!(
            exit_status.exit_code(),
            42,
            "Expected exit code 42, got {}",
            exit_status.exit_code(),
        );
    }
}

#[cfg(not(target_os = "windows"))]
#[test]
fn skip_windows_pty_tests() {
    println!("Skipping Windows-specific PTY tests");
}
