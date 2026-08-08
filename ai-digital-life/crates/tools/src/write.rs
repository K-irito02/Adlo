use adl_errors::AppError;
use std::path::Path;

use crate::ToolOutput;

pub const NAME: &str = "write";

/// JSON schema for the write tool (consumed by the Agent Loop to build
/// the LLM tool definition; the ToolDefinition wrapper lives in
/// adl-agent-runtime and is bridged in Task 7).
pub static PARAMETERS: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": { "type": "string", "description": "File path to write" },
            "content": { "type": "string", "description": "Content to write" }
        },
        "required": ["path", "content"]
    })
});

/// Write content to a file (creates parent directories). Mirrors OpenCode's
/// write tool semantics.
pub async fn execute(
    path: &str,
    content: &str,
    workspace_root: &Path,
) -> Result<ToolOutput, AppError> {
    let full_path = resolve_path(path, workspace_root);
    let existed = full_path.exists();
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full_path, content)?;
    Ok(ToolOutput {
        output: if existed {
            format!("Wrote file successfully: {path}")
        } else {
            format!("Created file successfully: {path}")
        },
        success: true,
        metadata: serde_json::json!({
            "path": path,
            "existed": existed,
        }),
    })
}

/// Resolve a (possibly relative) path against the workspace root.
pub fn resolve_path(path: &str, workspace_root: &Path) -> std::path::PathBuf {
    let p = Path::new(path);
    if p.is_absolute() { p.to_path_buf() } else { workspace_root.join(p) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn write_creates_new_file() {
        let dir = std::env::temp_dir().join(format!("adl-tool-write-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("hello.txt");
        let result = execute(&path.to_string_lossy(), "hello world", &dir).await.unwrap();
        assert!(result.success);
        assert!(path.exists());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello world");
        assert_eq!(result.metadata["existed"], false);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn write_overwrites_existing_file() {
        let dir = std::env::temp_dir().join(format!("adl-tool-write-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("hello.txt");
        std::fs::write(&path, "old").unwrap();
        let result = execute(&path.to_string_lossy(), "new", &dir).await.unwrap();
        assert!(result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(result.metadata["existed"], true);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn write_creates_parent_dirs() {
        let dir = std::env::temp_dir().join(format!("adl-tool-write-{}", uuid::Uuid::new_v4()));
        let path = dir.join("nested").join("deep").join("file.txt");
        let result = execute(&path.to_string_lossy(), "hi", &dir).await.unwrap();
        assert!(result.success);
        assert!(path.exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}
