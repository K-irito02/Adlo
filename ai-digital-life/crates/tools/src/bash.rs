use adl_errors::AppError;
use std::path::Path;
use tokio::process::Command;

use crate::ToolOutput;

pub const NAME: &str = "bash";
pub const DEFAULT_TIMEOUT_SECS: u64 = 120;

/// JSON schema for the bash tool (consumed by the Agent Loop to build
/// the LLM tool definition; the ToolDefinition wrapper lives in
/// adl-agent-runtime and is bridged in Task 7).
pub static PARAMETERS: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "command": { "type": "string", "description": "Command to execute" },
            "workdir": { "type": "string", "description": "Working directory (optional)" },
            "timeout": { "type": "integer", "description": "Timeout seconds (optional)" }
        },
        "required": ["command"]
    })
});

/// Run a command in the workspace and capture its output. Mirrors OpenCode's
/// bash tool semantics (spawn failures propagate as errors via `?`).
///
/// `_workdir` is reserved for the schema's `workdir` input; actual workdir
/// resolution happens at the registry / Agent Loop layer in Task 7.
pub async fn execute(
    command: &str,
    _workdir: Option<&str>,
    workspace_root: &Path,
    timeout_secs: Option<u64>,
) -> Result<ToolOutput, AppError> {
    // Split command into program + args (simple tokenization; complex quoting
    // is handled by the permission engine at the Tauri layer).
    let mut parts = command.split_whitespace();
    let program = parts.next().unwrap_or("");
    let args: Vec<String> = parts.map(String::from).collect();
    if program.is_empty() {
        return Ok(ToolOutput {
            output: "No command provided.".to_string(),
            success: false,
            metadata: serde_json::json!({
                "command": command,
                "output": "",
                "exitCode": serde_json::Value::Null,
                "truncated": false,
            }),
        });
    }

    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));

    let result = tokio::time::timeout(timeout, async {
        Command::new(program)
            .args(&args)
            .current_dir(workspace_root)
            .output()
            .await
    })
    .await
    .map_err(|_| AppError::Terminal(format!("bash tool timed out after {timeout:?}")))?
    .map_err(|e| AppError::Terminal(format!("bash tool failed: {e}")))?;

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    let truncated = stdout.len() >= 60_000 || stderr.len() >= 60_000;
    let success = result.status.success();
    Ok(ToolOutput {
        output: format!("{stdout}{stderr}"),
        success,
        metadata: serde_json::json!({
            "command": command,
            "output": stdout,
            "exitCode": result.status.code(),
            "truncated": truncated,
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bash_runs_command_and_captures_output() {
        let dir = std::env::temp_dir().join(format!("adl-tool-bash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let result = execute("echo", None, &dir, Some(10)).await.unwrap();
        assert!(result.success);
        assert!(result.metadata["command"].as_str().is_some());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn bash_failed_command_returns_err() {
        let dir = std::env::temp_dir().join(format!("adl-tool-bash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let result = execute("nonexistent_command_xyz_123", None, &dir, Some(5)).await;
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(dir);
    }
}
