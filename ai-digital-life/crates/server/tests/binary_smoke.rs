use std::io::BufRead;
use std::process::{Command, Stdio};
use std::time::Duration;

/// Real process smoke test: spawn the `ad-server` binary with `--port 0`
/// (ephemeral), parse the `AD_SERVER_PORT=` line it prints to stdout, poll
/// `/health`, assert 200 + `"ok":true`, then kill the child. A timeout guard
/// keeps a hung child from hanging CI.
#[tokio::test]
async fn binary_serves_health() {
    let bin = env!("CARGO_BIN_EXE_ad-server");
    let dir = std::env::temp_dir().join(format!("adl-bin-{}", uuid::Uuid::new_v4()));

    let mut child = Command::new(bin)
        .args(["--port", "0", "--data-dir"])
        .arg(&dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("ad-server binary should spawn");

    let health = async {
        // The binary prints the real bound port to stdout as
        // `AD_SERVER_PORT=<port>` then flushes. Scan lines in case tracing
        // output lands on stdout ahead of it.
        let stdout = child.stdout.take().expect("ad-server stdout should be piped");
        let port = tokio::task::spawn_blocking(move || -> Result<u16, String> {
            let mut reader = std::io::BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                if reader.read_line(&mut line).map_err(|e| format!("read stdout: {e}"))? == 0 {
                    return Err("ad-server exited before printing AD_SERVER_PORT".into());
                }
                if let Some(p) = line.trim().strip_prefix("AD_SERVER_PORT=") {
                    return p.parse().map_err(|e| format!("bad port in {line:?}: {e}"));
                }
            }
        })
        .await
        .expect("port reader task should not panic")?;

        // Poll /health until the freshly-started process answers.
        let client = reqwest::Client::new();
        let url = format!("http://127.0.0.1:{port}/health");
        for _ in 0..100 {
            match client.get(&url).send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let text = resp.text().await.unwrap_or_default();
                    if status.is_success() && text.contains("\"ok\":true") {
                        return Ok(());
                    }
                    return Err(format!(
                        "unexpected /health response: status={status} body={text:?}"
                    ));
                },
                Err(_) => tokio::time::sleep(Duration::from_millis(50)).await,
            }
        }
        Err("ad-server /health never became reachable".into())
    };

    let outcome = tokio::time::timeout(Duration::from_secs(30), health).await;

    let _ = child.kill();
    let _ = child.wait();
    let _ = std::fs::remove_dir_all(&dir);

    match outcome {
        Ok(Ok(())) => {},
        Ok(Err(msg)) => panic!("ad-server smoke test failed: {msg}"),
        Err(_) => panic!("ad-server did not become healthy within 30s"),
    }
}
