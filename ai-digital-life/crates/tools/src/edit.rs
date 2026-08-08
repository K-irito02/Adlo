use adl_errors::AppError;
use std::path::Path;

use crate::write::resolve_path;
use crate::ToolOutput;

pub const NAME: &str = "edit";

/// JSON schema for the edit tool (consumed by the Agent Loop to build
/// the LLM tool definition; the ToolDefinition wrapper lives in
/// adl-agent-runtime and is bridged in Task 7).
pub static PARAMETERS: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": { "type": "string", "description": "File path to edit" },
            "old_string": { "type": "string", "description": "Exact text to replace" },
            "new_string": { "type": "string", "description": "Replacement text" },
            "replace_all": { "type": "boolean", "description": "Replace all occurrences (default false)" }
        },
        "required": ["path", "old_string", "new_string"]
    })
});

/// Replace exact text in a file. Mirrors OpenCode's edit tool semantics.
pub async fn execute(
    path: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
    workspace_root: &Path,
) -> Result<ToolOutput, AppError> {
    if old_string == new_string {
        return Ok(ToolOutput {
            output: "No changes to apply: oldString and newString are identical.".to_string(),
            success: false,
            metadata: serde_json::json!({ "path": path, "replacements": 0 }),
        });
    }
    let full_path = resolve_path(path, workspace_root);
    let content = std::fs::read_to_string(&full_path)?;
    let count = if replace_all {
        content.matches(old_string).count()
    } else {
        content.match_indices(old_string).take(1).count()
    };
    if count == 0 {
        return Ok(ToolOutput {
            output: format!("Unable to edit {path}: oldString not found. Read the file first."),
            success: false,
            metadata: serde_json::json!({ "path": path, "replacements": 0 }),
        });
    }
    let updated = if replace_all {
        content.replace(old_string, new_string)
    } else {
        content.replacen(old_string, new_string, 1)
    };
    let before_lines: std::collections::HashSet<&str> = content.lines().collect();
    let after_lines: std::collections::HashSet<&str> = updated.lines().collect();
    let additions = after_lines.difference(&before_lines).count();
    let deletions = before_lines.difference(&after_lines).count();
    std::fs::write(&full_path, &updated)?;
    Ok(ToolOutput {
        output: format!("Edited file successfully: {path} (replacements: {count})"),
        success: true,
        metadata: serde_json::json!({
            "path": path,
            "replacements": count,
            "additions": additions,
            "deletions": deletions,
            "filediff": { "file": path, "replacements": count, "additions": additions, "deletions": deletions },
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn edit_replaces_single_occurrence() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "hello world hello").unwrap();
        let result =
            execute(&path.to_string_lossy(), "hello", "hi", false, &dir).await.unwrap();
        assert!(result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hi world hello");
        assert_eq!(result.metadata["replacements"], 1);
        assert_eq!(result.metadata["filediff"]["additions"], 1);
        assert_eq!(result.metadata["filediff"]["deletions"], 1);
        assert_eq!(result.metadata["additions"], 1);
        assert_eq!(result.metadata["deletions"], 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn edit_replace_all() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "hello hello").unwrap();
        let result =
            execute(&path.to_string_lossy(), "hello", "hi", true, &dir).await.unwrap();
        assert!(result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hi hi");
        assert_eq!(result.metadata["replacements"], 2);
        assert!(result.metadata["filediff"]["additions"].is_number());
        assert!(result.metadata["filediff"]["deletions"].is_number());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn edit_no_occurrence_fails() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "hello").unwrap();
        let result = execute(&path.to_string_lossy(), "xyz", "abc", false, &dir).await.unwrap();
        assert!(!result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello", "file unchanged on no match");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn edit_identical_strings_fails() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "same").unwrap();
        let result = execute(&path.to_string_lossy(), "same", "same", false, &dir).await.unwrap();
        assert!(!result.success);
        let _ = std::fs::remove_dir_all(dir);
    }
}
