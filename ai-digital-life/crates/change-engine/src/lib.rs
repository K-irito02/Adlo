//! Patch preview, application, rollback, and checkpoint helpers.

pub mod document_patch;
pub mod language;
pub mod patch_apply;
pub mod patch_create;
pub mod revert;
pub mod snapshot;
pub mod validation;

pub use document_patch::create_patch_from_document;
pub use language::language_for_path;
pub use patch_apply::{apply_patch_set, rollback_patch_set};
pub use patch_create::create_single_file_patch_set;
pub use validation::{application_result, validation_result_from_command};

use adl_errors::AppError;
use adl_types::{now_ms, PatchHunkDecision, PatchSet};

pub struct PatchProposal<'a> {
    pub workspace_id: &'a str,
    pub session_id: &'a str,
    pub run_id: Option<String>,
    pub relative_path: &'a str,
    pub before_content: &'a str,
    pub after_content: &'a str,
    pub title: String,
    pub summary: String,
}

pub fn set_hunk_decision(
    mut patch_set: PatchSet,
    hunk_id: &str,
    decision: PatchHunkDecision,
) -> Result<PatchSet, AppError> {
    let mut found = false;
    for file_patch in &mut patch_set.file_patches {
        for hunk in &mut file_patch.hunks {
            if hunk.id == hunk_id {
                hunk.decision = decision;
                found = true;
            }
        }
    }
    if !found {
        return Err(AppError::NotFound(format!("hunk {hunk_id}")));
    }
    patch_set.updated_at = now_ms();
    Ok(patch_set)
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::{
        CommandExecutionResult, CommandProfile, CommandRequest, PatchSetStatus, RiskLevel,
    };

    #[test]
    fn hunk_decision_updates() {
        let patch = create_single_file_patch_set(PatchProposal {
            workspace_id: "w",
            session_id: "s",
            run_id: Some("r".into()),
            relative_path: "README.md",
            before_content: "before",
            after_content: "after",
            title: "title".into(),
            summary: "summary".into(),
        });
        let hunk_id = patch.file_patches[0].hunks[0].id.clone();
        let patch = set_hunk_decision(patch, &hunk_id, PatchHunkDecision::Accepted).unwrap();
        assert_eq!(patch.file_patches[0].hunks[0].decision, PatchHunkDecision::Accepted);
    }

    #[test]
    fn rejects_apply_without_accepted_hunks() {
        let patch = create_single_file_patch_set(PatchProposal {
            workspace_id: "w",
            session_id: "s",
            run_id: Some("r".into()),
            relative_path: "README.md",
            before_content: "before",
            after_content: "after",
            title: "title".into(),
            summary: "summary".into(),
        });
        let root = std::env::temp_dir().join(format!("adl-change-{}", now_ms()));
        let checkpoints = root.join("checkpoints");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("README.md"), "before").unwrap();
        let error = apply_patch_set(patch, &root, &checkpoints).unwrap_err();
        assert!(error.to_string().contains("No patch hunks were accepted"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn set_hunk_decision_returns_error_for_unknown_hunk() {
        let patch = create_single_file_patch_set(PatchProposal {
            workspace_id: "w",
            session_id: "s",
            run_id: Some("r".into()),
            relative_path: "README.md",
            before_content: "before",
            after_content: "after",
            title: "title".into(),
            summary: "summary".into(),
        });
        let error = set_hunk_decision(patch, "nonexistent-hunk-id", PatchHunkDecision::Accepted)
            .unwrap_err();
        assert!(error.to_string().contains("hunk nonexistent-hunk-id"));
    }

    #[test]
    fn apply_patch_set_updates_file_content() {
        let root = std::env::temp_dir().join(format!("adl-change-apply-{}", now_ms()));
        let checkpoints = root.join("checkpoints");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("config.txt"), "original content").unwrap();

        let mut patch = create_single_file_patch_set(PatchProposal {
            workspace_id: "w",
            session_id: "s",
            run_id: Some("r".into()),
            relative_path: "config.txt",
            before_content: "original content",
            after_content: "modified content",
            title: "Update config".into(),
            summary: "Update config.txt".into(),
        });
        let hunk_id = patch.file_patches[0].hunks[0].id.clone();
        patch = set_hunk_decision(patch, &hunk_id, PatchHunkDecision::Accepted).unwrap();

        let (updated_patch, _checkpoint) = apply_patch_set(patch, &root, &checkpoints).unwrap();
        assert_eq!(updated_patch.status, PatchSetStatus::Applied);

        let content = std::fs::read_to_string(root.join("config.txt")).unwrap();
        assert_eq!(content, "modified content");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn apply_patch_set_rejects_if_file_changed() {
        let root = std::env::temp_dir().join(format!("adl-change-conflict-{}", now_ms()));
        let checkpoints = root.join("checkpoints");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("data.txt"), "original content").unwrap();

        let mut patch = create_single_file_patch_set(PatchProposal {
            workspace_id: "w",
            session_id: "s",
            run_id: Some("r".into()),
            relative_path: "data.txt",
            before_content: "original content",
            after_content: "modified content",
            title: "Update data".into(),
            summary: "Update data.txt".into(),
        });
        let hunk_id = patch.file_patches[0].hunks[0].id.clone();
        patch = set_hunk_decision(patch, &hunk_id, PatchHunkDecision::Accepted).unwrap();

        std::fs::write(root.join("data.txt"), "someone else changed this").unwrap();

        let error = apply_patch_set(patch, &root, &checkpoints).unwrap_err();
        assert!(error.to_string().contains("file changed since patch creation"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rollback_patch_set_restores_original_content() {
        let root = std::env::temp_dir().join(format!("adl-change-rollback-{}", now_ms()));
        let checkpoints = root.join("checkpoints");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("sample.txt"), "original content").unwrap();

        let mut patch = create_single_file_patch_set(PatchProposal {
            workspace_id: "w",
            session_id: "s",
            run_id: Some("r".into()),
            relative_path: "sample.txt",
            before_content: "original content",
            after_content: "new content",
            title: "Update sample".into(),
            summary: "Update sample.txt".into(),
        });
        let hunk_id = patch.file_patches[0].hunks[0].id.clone();
        patch = set_hunk_decision(patch, &hunk_id, PatchHunkDecision::Accepted).unwrap();

        apply_patch_set(patch.clone(), &root, &checkpoints).unwrap();

        let rolled_back = rollback_patch_set(patch, &root).unwrap();
        assert_eq!(rolled_back.status, PatchSetStatus::RolledBack);

        let content = std::fs::read_to_string(root.join("sample.txt")).unwrap();
        assert_eq!(content, "original content");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn validation_result_from_command_success() {
        let result = validation_result_from_command(
            "w",
            Some("r".into()),
            Some("ps".into()),
            Some(&CommandExecutionResult {
                request: CommandRequest {
                    id: "cmd1".into(),
                    workspace_id: "w".into(),
                    run_id: Some("r".into()),
                    profile: CommandProfile::Test,
                    command: "cargo test".into(),
                    args: vec![],
                    shell: false,
                    risk_level: RiskLevel::Low,
                    created_at: now_ms(),
                },
                exit_code: Some(0),
                signal: None,
                stdout: "All tests passed".into(),
                stderr: String::new(),
                summary: "Tests passed".into(),
                success: true,
                started_at: now_ms(),
                completed_at: now_ms(),
            }),
        );
        assert_eq!(result.status, "passed");
        assert_eq!(result.summary, "Tests passed");
    }

    #[test]
    fn validation_result_from_command_failure() {
        let result = validation_result_from_command(
            "w",
            Some("r".into()),
            Some("ps".into()),
            Some(&CommandExecutionResult {
                request: CommandRequest {
                    id: "cmd1".into(),
                    workspace_id: "w".into(),
                    run_id: Some("r".into()),
                    profile: CommandProfile::Build,
                    command: "cargo build".into(),
                    args: vec![],
                    shell: false,
                    risk_level: RiskLevel::Medium,
                    created_at: now_ms(),
                },
                exit_code: Some(1),
                signal: None,
                stdout: String::new(),
                stderr: "error: failed to compile".into(),
                summary: "Build failed".into(),
                success: false,
                started_at: now_ms(),
                completed_at: now_ms(),
            }),
        );
        assert_eq!(result.status, "failed");
        assert!(!result.diagnostics.is_empty());
    }

    #[test]
    fn validation_result_skipped_when_no_command() {
        let result = validation_result_from_command("w", Some("r".into()), Some("ps".into()), None);
        assert_eq!(result.status, "skipped");
        assert!(result.diagnostics.is_empty());
    }
}
