use std::path::PathBuf;

use futures::StreamExt;
use tokio::io::AsyncWriteExt;

pub struct RangeResumeDownload {
    pub url: String,
    pub file_path: PathBuf,
    pub offset: u64,
    pub total_bytes: Option<u64>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    client: reqwest::Client,
}

#[derive(Debug)]
pub struct RangeResumeResult {
    pub bytes_received: u64,
    pub completed: bool,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum RangeResumeError {
    #[error("Server does not support range requests (returned 200 instead of 206)")]
    ServerNoRange,
    #[error("Requested range not satisfiable (416)")]
    RangeNotSatisfiable,
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("File I/O error: {0}")]
    FileError(String),
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}

impl RangeResumeDownload {
    pub fn new(
        url: String,
        file_path: PathBuf,
        offset: u64,
        total_bytes: Option<u64>,
        etag: Option<String>,
        last_modified: Option<String>,
    ) -> Self {
        let client = reqwest::Client::builder()
            // Bound the connection setup, NOT the total body read: a large/slow
            // download legitimately streams for longer than 30s, and a total
            // `timeout()` here would make every resume of a big file fail. A
            // per-read idle timeout still guards against a hung connection that
            // stops sending bytes (firewall/proxy accepting but never writing) —
            // without it the retry thread would block forever holding the
            // `.crdownload` handle and the progress monitor would never exit.
            .connect_timeout(std::time::Duration::from_secs(30))
            .read_timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest client should build");
        Self { url, file_path, offset, total_bytes, etag, last_modified, client }
    }

    pub async fn start(&self) -> Result<RangeResumeResult, RangeResumeError> {
        let mut request = self.client.get(&self.url);

        if self.offset > 0 {
            request = request.header("Range", format!("bytes={}-", self.offset));
        }

        if let Some(etag) = &self.etag {
            request = request.header("If-Range", etag.as_str());
        } else if let Some(lm) = &self.last_modified {
            request = request.header("If-Range", lm.as_str());
        }

        let response =
            request.send().await.map_err(|e| RangeResumeError::NetworkError(e.to_string()))?;

        let status = response.status();

        if self.offset > 0 {
            if status == reqwest::StatusCode::OK {
                return Err(RangeResumeError::ServerNoRange);
            }
            if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                return Err(RangeResumeError::RangeNotSatisfiable);
            }
            if status != reqwest::StatusCode::PARTIAL_CONTENT {
                return Err(RangeResumeError::InvalidResponse(format!(
                    "Expected 206, got {}",
                    status
                )));
            }
        } else if !status.is_success() {
            return Err(RangeResumeError::NetworkError(format!("HTTP {}", status)));
        }

        let resp_etag =
            response.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
        let resp_lm = response
            .headers()
            .get("last-modified")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await
            .map_err(|e| RangeResumeError::FileError(e.to_string()))?;

        let mut stream = response.bytes_stream();
        let mut bytes_received = 0u64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| RangeResumeError::NetworkError(e.to_string()))?;
            file.write_all(&chunk).await.map_err(|e| RangeResumeError::FileError(e.to_string()))?;
            bytes_received += chunk.len() as u64;
        }

        file.flush().await.map_err(|e| RangeResumeError::FileError(e.to_string()))?;

        let completed =
            self.total_bytes.map(|total| self.offset + bytes_received >= total).unwrap_or(false);

        Ok(RangeResumeResult { bytes_received, completed, etag: resp_etag, last_modified: resp_lm })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read as _, Write as _};
    use std::net::TcpListener;
    use std::path::PathBuf;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("adl_test_{}", name))
    }

    /// Spawn a minimal blocking HTTP server on an ephemeral port that serves a
    /// single request according to `handler`. Returns the base URL. The server
    /// thread terminates after one accepted connection.
    fn spawn_single_response_server(
        handler: impl FnOnce(&str, &str) -> (u16, Vec<(String, String)>, Vec<u8>) + Send + 'static,
    ) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
        let addr = listener.local_addr().unwrap();
        let url = format!("http://{addr}/file.bin");
        let url_for_handler = url.clone();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).expect("read request");
            let request = String::from_utf8_lossy(&buf[..n]).to_string();
            let (status, headers, body) = handler(&request, &url_for_handler);
            let mut resp = format!(
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n",
                body.len()
            );
            for (k, v) in headers {
                resp.push_str(&format!("{k}: {v}\r\n"));
            }
            resp.push_str("\r\n");
            let _ = stream.write_all(resp.as_bytes());
            let _ = stream.write_all(&body);
            let _ = stream.flush();
        });
        url
    }

    #[test]
    fn error_display_messages() {
        let e = RangeResumeError::ServerNoRange;
        assert!(e.to_string().contains("range"));

        let e = RangeResumeError::RangeNotSatisfiable;
        assert!(e.to_string().contains("416"));

        let e = RangeResumeError::NetworkError("timeout".into());
        assert!(e.to_string().contains("timeout"));

        let e = RangeResumeError::FileError("permission denied".into());
        assert!(e.to_string().contains("permission denied"));

        let e = RangeResumeError::InvalidResponse("bad".into());
        assert!(e.to_string().contains("bad"));
    }

    #[test]
    fn new_sets_fields_correctly() {
        let path = temp_path("new_test");
        let dl = RangeResumeDownload::new(
            "https://example.com/file.bin".into(),
            path.clone(),
            1024,
            Some(4096),
            Some("abc123".into()),
            Some("Wed, 01 Jan 2025 00:00:00 GMT".into()),
        );
        assert_eq!(dl.url, "https://example.com/file.bin");
        assert_eq!(dl.file_path, path);
        assert_eq!(dl.offset, 1024);
        assert_eq!(dl.total_bytes, Some(4096));
        assert_eq!(dl.etag.as_deref(), Some("abc123"));
        assert_eq!(dl.last_modified.as_deref(), Some("Wed, 01 Jan 2025 00:00:00 GMT"));
    }

    #[test]
    fn new_with_none_validators() {
        let path = temp_path("none_validators");
        let dl = RangeResumeDownload::new(
            "https://example.com/file.bin".into(),
            path,
            0,
            None,
            None,
            None,
        );
        assert_eq!(dl.offset, 0);
        assert!(dl.total_bytes.is_none());
        assert!(dl.etag.is_none());
        assert!(dl.last_modified.is_none());
    }

    #[tokio::test]
    async fn start_returns_network_error_on_connection_refused() {
        let path = temp_path("net_err");
        let _ = tokio::fs::remove_file(&path).await;
        let dl = RangeResumeDownload::new(
            "http://127.0.0.1:19999/nonexistent".into(),
            path.clone(),
            0,
            None,
            None,
            None,
        );
        let result = dl.start().await;
        assert!(result.is_err());
        match result.unwrap_err() {
            RangeResumeError::NetworkError(_) => {},
            other => panic!("Expected NetworkError, got {:?}", other),
        }
        // File not created because request failed before file open
        assert!(!path.exists());
    }

    #[tokio::test]
    async fn start_with_offset_requires_206_and_sends_range_header() {
        let path = temp_path("range_206");
        // Pre-seed 5 bytes: the resumed transfer appends the remaining 5 bytes.
        tokio::fs::write(&path, b"abcde").await.expect("seed file");
        let url = spawn_single_response_server(|request, _| {
            assert!(
                request.to_ascii_lowercase().contains("range: bytes=5-"),
                "must send Range header (reqwest lowercases header names)"
            );
            assert!(
                request.to_ascii_lowercase().contains("if-range: etag-1"),
                "must send If-Range header (reqwest lowercases header names)"
            );
            (206, vec![("Content-Range".into(), "bytes 5-9/10".into())], b"fghij".to_vec())
        });
        let dl =
            RangeResumeDownload::new(url, path.clone(), 5, Some(10), Some("etag-1".into()), None);
        let result = dl.start().await.expect("206 resume should succeed");
        assert_eq!(result.bytes_received, 5, "received the 5 trailing bytes");
        assert!(result.completed, "offset 5 + 5 bytes == total 10");
        // Appended at the correct offset: 5-byte body written after the pre-seeded 5 bytes.
        let content = tokio::fs::read(&path).await.expect("file should exist");
        assert_eq!(&content, b"abcde\x66\x67\x68\x69\x6a", "bytes appended at offset 5");
        let _ = tokio::fs::remove_file(&path).await;
    }

    #[tokio::test]
    async fn start_without_offset_accepts_200() {
        let path = temp_path("range_200");
        let _ = tokio::fs::remove_file(&path).await;
        let url = spawn_single_response_server(|request, _| {
            assert!(
                !request.to_ascii_lowercase().contains("range:"),
                "no Range header when offset == 0"
            );
            (200, vec![("Content-Length".into(), "3".into())], b"abc".to_vec())
        });
        let dl = RangeResumeDownload::new(url, path.clone(), 0, Some(3), None, None);
        let result = dl.start().await.expect("200 without offset should succeed");
        assert_eq!(result.bytes_received, 3);
        assert!(result.completed);
        let _ = tokio::fs::remove_file(&path).await;
    }

    #[tokio::test]
    async fn start_with_offset_rejects_200_as_no_range() {
        let path = temp_path("range_no_range");
        let _ = tokio::fs::remove_file(&path).await;
        // Pre-seed 5 bytes so the test exercises the "server ignored Range" path.
        tokio::fs::write(&path, b"abcde").await.expect("seed file");
        let url = spawn_single_response_server(|_req, _| (200, vec![], b"full".to_vec()));
        let dl = RangeResumeDownload::new(url, path.clone(), 5, Some(10), None, None);
        let result = dl.start().await;
        match result {
            Err(RangeResumeError::ServerNoRange) => {},
            other => panic!("Expected ServerNoRange, got {:?}", other),
        }
        let _ = tokio::fs::remove_file(&path).await;
    }

    #[tokio::test]
    async fn start_with_offset_rejects_416() {
        let path = temp_path("range_416");
        let _ = tokio::fs::remove_file(&path).await;
        let url = spawn_single_response_server(|_req, _| (416, vec![], vec![]));
        let dl = RangeResumeDownload::new(url, path.clone(), 999, Some(10), None, None);
        let result = dl.start().await;
        match result {
            Err(RangeResumeError::RangeNotSatisfiable) => {},
            other => panic!("Expected RangeNotSatisfiable, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn start_reports_incomplete_when_bytes_fall_short() {
        let path = temp_path("range_short");
        let _ = tokio::fs::remove_file(&path).await;
        let url = spawn_single_response_server(|_req, _| {
            (206, vec![("Content-Range".into(), "bytes 5-6/10".into())], b"fg".to_vec())
        });
        let dl = RangeResumeDownload::new(url, path.clone(), 5, Some(10), None, None);
        let result = dl.start().await.expect("206 should succeed");
        assert_eq!(result.bytes_received, 2);
        assert!(!result.completed, "offset 5 + 2 bytes < total 10 → not complete");
        let _ = tokio::fs::remove_file(&path).await;
    }

    #[test]
    fn error_debug_trait() {
        let e = RangeResumeError::ServerNoRange;
        let debug = format!("{:?}", e);
        assert!(debug.contains("ServerNoRange"));
    }
}
