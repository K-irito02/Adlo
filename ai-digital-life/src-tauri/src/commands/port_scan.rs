use std::time::Instant;

use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;

use super::ipc;
use crate::error::CommandError;
use adl_errors::AppError;
use adl_types::IpcResult;

const SCAN_TIMEOUT_MS: u64 = 300;
const MAX_CONCURRENCY: usize = 10;
const MAX_PORTS_PER_SCAN: usize = 100;

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

    let is_open =
        tokio::time::timeout(timeout, TcpStream::connect(&addr)).await.is_ok_and(|r| r.is_ok());

    ScannedPort { port, is_open, response_time_ms: start.elapsed().as_millis() as u64 }
}

fn validate_ports(ports: &[u16]) -> Result<(), CommandError> {
    if ports.is_empty() {
        return Err(CommandError::from(AppError::Internal("port list is empty".to_string())));
    }
    if ports.len() > MAX_PORTS_PER_SCAN {
        return Err(CommandError::from(AppError::Internal(format!(
            "port list too long: {} exceeds maximum of {}",
            ports.len(),
            MAX_PORTS_PER_SCAN
        ))));
    }
    for &port in ports {
        if port == 0 {
            return Err(CommandError::from(AppError::Internal(
                "invalid port number: 0".to_string(),
            )));
        }
    }
    Ok(())
}

/// Scans a list of TCP ports on localhost (127.0.0.1) for connectivity.
///
/// Deduplicates and sorts input ports. Returns results sorted by port number.
/// Each port is probed with a 300ms timeout, up to 10 concurrent connections.
#[tauri::command]
pub async fn browser_scan_ports(
    ports: Vec<u16>,
) -> Result<IpcResult<Vec<ScannedPort>>, CommandError> {
    let scan_start = Instant::now();

    validate_ports(&ports)?;

    let mut unique_ports: Vec<u16> =
        ports.into_iter().collect::<std::collections::HashSet<_>>().into_iter().collect();
    unique_ports.sort();

    let port_count = unique_ports.len();
    tracing::debug!(port_count, unique_count = port_count, "browser_scan_ports: starting scan");

    let mut results: Vec<ScannedPort> = stream::iter(unique_ports)
        .map(scan_single_port)
        .buffer_unordered(MAX_CONCURRENCY)
        .collect()
        .await;

    results.sort_by_key(|p| p.port);

    let elapsed_ms = scan_start.elapsed().as_millis() as u64;
    let open_count = results.iter().filter(|p| p.is_open).count();
    tracing::debug!(port_count, open_count, elapsed_ms, "browser_scan_ports: completed");

    Ok(ipc(Ok(results)))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortProcessInfo {
    pub pid: u32,
    pub name: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortDetails {
    pub port: u16,
    pub is_open: bool,
    pub protocol: String,
    pub local_address: String,
    pub processes: Vec<PortProcessInfo>,
    pub process_error: Option<String>,
}

#[cfg(target_os = "windows")]
async fn get_port_process_info(port: u16) -> Result<Vec<PortProcessInfo>, CommandError> {
    let output =
        tokio::process::Command::new("netstat").args(["-ano"]).output().await.map_err(|e| {
            CommandError::from(AppError::Internal(format!("failed to run netstat: {e}")))
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut pids = Vec::new();

    for line in stdout.lines() {
        if line.contains(&format!(":{port}")) && line.contains("LISTENING") {
            if let Some(pid_str) = line.split_whitespace().last() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    if !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
        }
    }

    let mut processes = Vec::new();
    for pid in &pids {
        let task_output = tokio::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output()
            .await;

        if let Ok(out) = task_output {
            let task_stdout = String::from_utf8_lossy(&out.stdout);
            for line in task_stdout.lines() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 2 {
                    let name = parts[0].trim_matches('"').to_string();
                    processes.push(PortProcessInfo { pid: *pid, name, command: String::new() });
                }
            }
        }
    }

    Ok(processes)
}

#[cfg(target_os = "macos")]
async fn get_port_process_info(port: u16) -> Result<Vec<PortProcessInfo>, CommandError> {
    let output = tokio::process::Command::new("lsof")
        .args(["-i", &format!(":{port}"), "-P", "-n"])
        .output()
        .await
        .map_err(|e| CommandError::from(AppError::Internal(format!("failed to run lsof: {e}"))))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut processes = Vec::new();

    for line in stdout.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            if let Ok(pid) = parts[1].parse::<u32>() {
                if !processes.iter().any(|p: &PortProcessInfo| p.pid == pid) {
                    processes.push(PortProcessInfo { pid, name, command: String::new() });
                }
            }
        }
    }

    Ok(processes)
}

#[cfg(all(unix, not(target_os = "macos")))]
async fn get_port_process_info(port: u16) -> Result<Vec<PortProcessInfo>, CommandError> {
    let output = tokio::process::Command::new("lsof")
        .args(["-i", &format!(":{port}"), "-P", "-n"])
        .output()
        .await
        .map_err(|e| CommandError::from(AppError::Internal(format!("failed to run lsof: {e}"))))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut processes = Vec::new();

    for line in stdout.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            if let Ok(pid) = parts[1].parse::<u32>() {
                if !processes.iter().any(|p: &PortProcessInfo| p.pid == pid) {
                    processes.push(PortProcessInfo { pid, name, command: String::new() });
                }
            }
        }
    }

    Ok(processes)
}

/// Get detailed information about a specific port, including process info.
///
/// Returns port status, protocol, and process details (pid, name).
/// Uses platform-specific commands (netstat on Windows, lsof on macOS/Linux).
/// Process information retrieval may require elevated permissions.
#[tauri::command]
pub async fn browser_get_port_details(port: u16) -> Result<IpcResult<PortDetails>, CommandError> {
    let is_open = {
        let addr = format!("127.0.0.1:{port}");
        let timeout = std::time::Duration::from_millis(SCAN_TIMEOUT_MS);
        tokio::time::timeout(timeout, TcpStream::connect(&addr)).await.is_ok_and(|r| r.is_ok())
    };

    let (processes, process_error) = if is_open {
        match get_port_process_info(port).await {
            Ok(list) => (list, None),
            Err(e) => (Vec::new(), Some(e.to_string())),
        }
    } else {
        (Vec::new(), None)
    };

    let details = PortDetails {
        port,
        is_open,
        protocol: "TCP".to_string(),
        local_address: format!("127.0.0.1:{port}"),
        processes,
        process_error,
    };

    Ok(ipc(Ok(details)))
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
    async fn scan_ports_empty_input_returns_error() {
        let result = browser_scan_ports(vec![]).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("empty"), "unexpected error: {}", err.message);
    }

    #[tokio::test]
    async fn scan_ports_too_many_returns_error() {
        let ports: Vec<u16> = (0..101).map(|i| i + 1).collect();
        let result = browser_scan_ports(ports).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("too long"), "unexpected error: {}", err.message);
    }

    #[tokio::test]
    async fn scan_ports_zero_port_returns_error() {
        let result = browser_scan_ports(vec![0, 8080]).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("invalid port"), "unexpected error: {}", err.message);
    }

    #[tokio::test]
    async fn scan_ports_returns_sorted_results() {
        let ports = vec![9003, 9001, 9002];
        let ipc_result = browser_scan_ports(ports).await.unwrap();
        let results = unwrap_ipc(ipc_result);
        let port_numbers: Vec<u16> = results.iter().map(|p| p.port).collect();
        assert_eq!(port_numbers, vec![9001, 9002, 9003]);
    }

    #[test]
    fn port_details_serde_round_trip() {
        let details = PortDetails {
            port: 8080,
            is_open: true,
            protocol: "TCP".to_string(),
            local_address: "127.0.0.1:8080".to_string(),
            processes: vec![PortProcessInfo {
                pid: 1234,
                name: "node".to_string(),
                command: String::new(),
            }],
            process_error: None,
        };
        let json = serde_json::to_string(&details).unwrap();
        let back: PortDetails = serde_json::from_str(&json).unwrap();
        assert_eq!(back.port, 8080);
        assert!(back.is_open);
        assert_eq!(back.protocol, "TCP");
        assert_eq!(back.processes.len(), 1);
        assert_eq!(back.processes[0].pid, 1234);
        assert!(back.process_error.is_none());
    }

    #[test]
    fn port_details_camel_case() {
        let details = PortDetails {
            port: 3000,
            is_open: false,
            protocol: "TCP".to_string(),
            local_address: "127.0.0.1:3000".to_string(),
            processes: vec![],
            process_error: None,
        };
        let json = serde_json::to_string(&details).unwrap();
        assert!(json.contains("is_open") || json.contains("isOpen"), "json: {json}");
        assert!(json.contains("localAddress") || json.contains("local_address"), "json: {json}");
        assert!(json.contains("processError") || json.contains("process_error"), "json: {json}");
    }

    #[tokio::test]
    async fn get_port_details_closed_port() {
        let ipc_result = browser_get_port_details(1).await.unwrap();
        match ipc_result {
            IpcResult::Ok { data, .. } => {
                assert_eq!(data.port, 1);
                assert!(!data.is_open);
                assert_eq!(data.protocol, "TCP");
                assert!(data.processes.is_empty());
            },
            other => panic!("expected IpcResult::Ok, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn get_port_details_open_port() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let ipc_result = browser_get_port_details(port).await.unwrap();
        match ipc_result {
            IpcResult::Ok { data, .. } => {
                assert_eq!(data.port, port);
                assert!(data.is_open);
                assert_eq!(data.protocol, "TCP");
                assert_eq!(data.local_address, format!("127.0.0.1:{port}"));
            },
            other => panic!("expected IpcResult::Ok, got {other:?}"),
        }

        drop(listener);
    }
}
