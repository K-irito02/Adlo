use std::time::Instant;

use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;

use crate::error::CommandError;
use super::ipc;
use adl_types::IpcResult;

const SCAN_TIMEOUT_MS: u64 = 300;
const MAX_CONCURRENCY: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedPort {
    pub port: u16,
    pub is_open: bool,
    pub response_time_ms: u64,
}

async fn scan_single_port(port: u16) -> ScannedPort {
    let start = Instant::now();
    let addr = format!("127.0.0.1:{port}");
    let timeout = std::time::Duration::from_millis(SCAN_TIMEOUT_MS);

    let is_open = tokio::time::timeout(timeout, TcpStream::connect(&addr))
        .await
        .is_ok_and(|r| r.is_ok());

    ScannedPort { port, is_open, response_time_ms: start.elapsed().as_millis() as u64 }
}

/// Scans a list of TCP ports on localhost (127.0.0.1) for connectivity.
///
/// Deduplicates and sorts input ports. Returns results sorted by port number.
/// Each port is probed with a 300ms timeout, up to 10 concurrent connections.
#[tauri::command]
pub async fn browser_scan_ports(ports: Vec<u16>) -> Result<IpcResult<Vec<ScannedPort>>, CommandError> {
    let mut unique_ports: Vec<u16> =
        ports.into_iter().collect::<std::collections::HashSet<_>>().into_iter().collect();
    unique_ports.sort();

    let mut results: Vec<ScannedPort> = stream::iter(unique_ports)
        .map(scan_single_port)
        .buffer_unordered(MAX_CONCURRENCY)
        .collect()
        .await;

    results.sort_by_key(|p| p.port);
    Ok(ipc(Ok(results)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip() {
        let port = ScannedPort { port: 8080, is_open: true, response_time_ms: 12 };
        let json = serde_json::to_string(&port).unwrap();
        let back: ScannedPort = serde_json::from_str(&json).unwrap();
        assert_eq!(back.port, 8080);
        assert!(back.is_open);
        assert_eq!(back.response_time_ms, 12);
    }

    #[test]
    fn serde_camel_case() {
        let port = ScannedPort { port: 3000, is_open: false, response_time_ms: 0 };
        let json = serde_json::to_string(&port).unwrap();
        assert!(json.contains("isOpen"), "json: {json}");
        assert!(json.contains("responseTimeMs"), "json: {json}");
    }

    #[tokio::test]
    async fn scan_single_port_closed_returns_not_open() {
        let result = scan_single_port(1).await;
        assert_eq!(result.port, 1);
        assert!(!result.is_open);
    }

    #[tokio::test]
    async fn scan_single_port_localhost_server() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let result = scan_single_port(port).await;
        assert_eq!(result.port, port);
        assert!(result.is_open);

        drop(listener);
    }

    fn unwrap_ipc(result: IpcResult<Vec<ScannedPort>>) -> Vec<ScannedPort> {
        match result {
            IpcResult::Ok { data, .. } => data,
            other => panic!("expected IpcResult::Ok, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn scan_ports_dedupes_and_sorts() {
        let ports = vec![3001, 3000, 3001, 3000];
        let ipc_result = browser_scan_ports(ports).await.unwrap();
        let results = unwrap_ipc(ipc_result);
        let port_numbers: Vec<u16> = results.iter().map(|p| p.port).collect();
        assert_eq!(port_numbers, vec![3000, 3001]);
    }

    #[tokio::test]
    async fn scan_ports_empty_input() {
        let ipc_result = browser_scan_ports(vec![]).await.unwrap();
        let results = unwrap_ipc(ipc_result);
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn scan_ports_returns_sorted_results() {
        let ports = vec![9003, 9001, 9002];
        let ipc_result = browser_scan_ports(ports).await.unwrap();
        let results = unwrap_ipc(ipc_result);
        let port_numbers: Vec<u16> = results.iter().map(|p| p.port).collect();
        assert_eq!(port_numbers, vec![9001, 9002, 9003]);
    }
}
