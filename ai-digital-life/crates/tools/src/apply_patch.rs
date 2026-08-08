use adl_change_engine::{PatchProposal, apply_patch_set, create_single_file_patch_set};
use adl_errors::AppError;
use adl_types::PatchHunkDecision;
use std::path::Path;

use crate::ToolOutput;

pub const NAME: &str = "apply_patch";

/// JSON schema for the apply_patch tool (consumed by the Agent Loop to build
/// the LLM tool definition; the ToolDefinition wrapper lives in
/// adl-agent-runtime and is bridged in Task 7).
pub static PARAMETERS: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": { "type": "string", "description": "File path (relative to workspace)" },
            "before": { "type": "string", "description": "Current file content" },
            "after": { "type": "string", "description": "New file content" }
        },
        "required": ["path", "before", "after"]
    })
});

/// Apply a single-file change via the change-engine's structured PatchSet
/// model. Creates a PatchSet from before/after content, accepts all hunks,
/// and applies it atomically (with a checkpoint).
pub async fn execute(
    relative_path: &str,
    before_content: &str,
    after_content: &str,
    workspace_root: &Path,
    session_id: &str,
) -> Result<ToolOutput, AppError> {
    let proposal = PatchProposal {
        workspace_id: "",
        session_id,
        run_id: None,
        relative_path,
        before_content,
        after_content,
        title: format!("Edit {relative_path}"),
        summary: format!("Apply patch to {relative_path}"),
    };
    let mut patch_set = create_single_file_patch_set(proposal);
    // Accept all hunks (the Loop has already approved the edit via permission gate)
    let hunk_ids: Vec<String> = patch_set
        .file_patches
        .iter()
        .flat_map(|fp| fp.hunks.iter().map(|h| h.id.clone()))
        .collect();
    for hunk_id in hunk_ids {
        patch_set = adl_change_engine::set_hunk_decision(
            patch_set,
            &hunk_id,
            PatchHunkDecision::Accepted,
        )?;
    }
    let checkpoints_dir = workspace_root.join(".ai-digital-life").join("checkpoints");
    std::fs::create_dir_all(&checkpoints_dir)?;
    apply_patch_set(patch_set, workspace_root, &checkpoints_dir)?;
    Ok(ToolOutput {
        output: format!("Applied patch to {relative_path}"),
        success: true,
        metadata: serde_json::json!({ "files": [relative_path] }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn apply_patch_modifies_file() {
        let dir = std::env::temp_dir().join(format!("adl-tool-patch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.txt");
        std::fs::write(&file, "line1\nline2\n").unwrap();
        let result =
            execute("a.txt", "line1\nline2\n", "changed\nline2\n", &dir, "sess-test")
                .await
                .unwrap();
        assert!(result.success);
        let content = std::fs::read_to_string(&file).unwrap();
        assert!(content.contains("changed"));
        assert_eq!(result.metadata["files"][0], "a.txt");
        let _ = std::fs::remove_dir_all(dir);
    }
}
