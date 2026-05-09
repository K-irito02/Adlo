//! Patch preview, application, rollback, and checkpoint helpers.

use adl_errors::AppError;
use adl_kernel::{
    create_id, now_ms, CheckpointRecord, DiagnosticSummary, FilePatch, PatchApplicationResult,
    PatchHunk, PatchHunkDecision, PatchSet, PatchSetStatus, ValidationResult,
};
use std::path::Path;

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

pub fn create_single_file_patch_set(proposal: PatchProposal<'_>) -> PatchSet {
    let now = now_ms();
    let patch_set_id = create_id("patchset");
    let file_patch_id = create_id("filepatch");
    let hunk_id = create_id("hunk");
    let before_lines = proposal.before_content.lines().count().max(1);
    let after_lines = proposal.after_content.lines().count().max(1);
    let hunk = PatchHunk {
        id: hunk_id,
        file_patch_id: file_patch_id.clone(),
        patch_set_id: patch_set_id.clone(),
        relative_path: proposal.relative_path.to_string(),
        old_start: 1,
        old_lines: before_lines,
        new_start: 1,
        new_lines: after_lines,
        preview: format!("Update {}", proposal.relative_path),
        before_text: proposal.before_content.to_string(),
        after_text: proposal.after_content.to_string(),
        decision: PatchHunkDecision::Pending,
    };
    let file_patch = FilePatch {
        id: file_patch_id,
        patch_set_id: patch_set_id.clone(),
        relative_path: proposal.relative_path.to_string(),
        language: language_for_path(proposal.relative_path),
        before_content: proposal.before_content.to_string(),
        after_content: proposal.after_content.to_string(),
        before_hash: adl_fs_ops::content_hash(proposal.before_content),
        hunks: vec![hunk],
    };
    PatchSet {
        id: patch_set_id,
        workspace_id: proposal.workspace_id.to_string(),
        session_id: proposal.session_id.to_string(),
        run_id: proposal.run_id,
        title: proposal.title,
        summary: proposal.summary,
        status: PatchSetStatus::Ready,
        checkpoint_id: None,
        file_patches: vec![file_patch],
        created_at: now,
        updated_at: now,
    }
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

pub fn apply_patch_set(
    mut patch_set: PatchSet,
    root: &Path,
    checkpoints_dir: &Path,
) -> Result<(PatchSet, CheckpointRecord), AppError> {
    if !matches!(
        patch_set.status,
        PatchSetStatus::Ready | PatchSetStatus::Failed
    ) {
        return Err(AppError::Patch(format!(
            "patch set is not ready to apply: {:?}",
            patch_set.status
        )));
    }

    let accepted_paths = patch_set
        .file_patches
        .iter()
        .filter(|file_patch| {
            file_patch
                .hunks
                .iter()
                .any(|hunk| hunk.decision == PatchHunkDecision::Accepted)
        })
        .map(|file_patch| file_patch.relative_path.clone())
        .collect::<Vec<_>>();
    if accepted_paths.is_empty() {
        return Err(AppError::Patch(
            "No patch hunks were accepted. Accept at least one hunk before applying.".into(),
        ));
    }

    let paths = patch_set
        .file_patches
        .iter()
        .map(|file_patch| file_patch.relative_path.clone())
        .collect::<Vec<_>>();
    for file_patch in &patch_set.file_patches {
        let current = adl_fs_ops::read_text_file(root, &file_patch.relative_path, u64::MAX)
            .unwrap_or_default();
        let current_hash = adl_fs_ops::content_hash(&current);
        if current_hash != file_patch.before_hash {
            return Err(AppError::Patch(format!(
                "file changed since patch creation: {}",
                file_patch.relative_path
            )));
        }
    }

    let checkpoint_id = create_id("checkpoint");
    let payload =
        adl_fs_ops::create_checkpoint_payload(checkpoints_dir, &checkpoint_id, root, &paths)?;
    let checkpoint = CheckpointRecord {
        id: checkpoint_id.clone(),
        session_id: patch_set.session_id.clone(),
        workspace_id: patch_set.workspace_id.clone(),
        r#type: "patch-apply".into(),
        description: format!("Before applying {}", patch_set.title),
        manifest: serde_json::to_value(payload)?,
        created_at: now_ms(),
    };

    patch_set.status = PatchSetStatus::Applying;
    patch_set.checkpoint_id = Some(checkpoint_id);
    for file_patch in &patch_set.file_patches {
        if file_patch
            .hunks
            .iter()
            .any(|hunk| hunk.decision == PatchHunkDecision::Accepted)
        {
            adl_fs_ops::atomic_write(root, &file_patch.relative_path, &file_patch.after_content)?;
        }
    }
    patch_set.status = PatchSetStatus::Applied;
    patch_set.updated_at = now_ms();
    Ok((patch_set, checkpoint))
}

pub fn rollback_patch_set(mut patch_set: PatchSet, root: &Path) -> Result<PatchSet, AppError> {
    for file_patch in &patch_set.file_patches {
        adl_fs_ops::atomic_write(root, &file_patch.relative_path, &file_patch.before_content)?;
    }
    patch_set.status = PatchSetStatus::RolledBack;
    patch_set.updated_at = now_ms();
    Ok(patch_set)
}

pub fn validation_result_from_command(
    workspace_id: &str,
    run_id: Option<String>,
    patch_set_id: Option<String>,
    command_result: Option<&adl_kernel::CommandExecutionResult>,
) -> ValidationResult {
    match command_result {
        Some(result) if result.success => ValidationResult {
            id: create_id("validation"),
            workspace_id: workspace_id.to_string(),
            run_id,
            patch_set_id,
            status: "passed".into(),
            summary: result.summary.clone(),
            diagnostics: vec![],
            created_at: now_ms(),
        },
        Some(result) => ValidationResult {
            id: create_id("validation"),
            workspace_id: workspace_id.to_string(),
            run_id,
            patch_set_id,
            status: "failed".into(),
            summary: result.summary.clone(),
            diagnostics: parse_diagnostics(&result.stderr),
            created_at: now_ms(),
        },
        None => ValidationResult {
            id: create_id("validation"),
            workspace_id: workspace_id.to_string(),
            run_id,
            patch_set_id,
            status: "skipped".into(),
            summary: "No validation command was selected for this workspace.".into(),
            diagnostics: vec![],
            created_at: now_ms(),
        },
    }
}

pub fn application_result(
    patch_set: PatchSet,
    validation: Option<ValidationResult>,
    command_result: Option<adl_kernel::CommandExecutionResult>,
    rolled_back: bool,
) -> PatchApplicationResult {
    PatchApplicationResult {
        patch_set,
        repair_patch_set: None,
        validation,
        command_result,
        rolled_back,
    }
}

fn parse_diagnostics(stderr: &str) -> Vec<DiagnosticSummary> {
    stderr
        .lines()
        .take(12)
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| DiagnosticSummary {
            id: format!("diagnostic-{index}"),
            source: "system".into(),
            severity: "error".into(),
            message: line.chars().take(240).collect(),
            path: None,
            line: None,
            column: None,
        })
        .collect()
}

fn language_for_path(path: &str) -> Option<String> {
    path.rsplit('.').next().and_then(|extension| {
        let language = match extension {
            "rs" => "rust",
            "ts" | "tsx" => "typescript",
            "js" | "jsx" => "javascript",
            "md" => "markdown",
            "json" => "json",
            _ => return None,
        };
        Some(language.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::{CommandProfile, RiskLevel};

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
        assert_eq!(
            patch.file_patches[0].hunks[0].decision,
            PatchHunkDecision::Accepted
        );
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
            Some(&adl_kernel::CommandExecutionResult {
                request: adl_kernel::CommandRequest {
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
            Some(&adl_kernel::CommandExecutionResult {
                request: adl_kernel::CommandRequest {
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
        let result = validation_result_from_command(
            "w",
            Some("r".into()),
            Some("ps".into()),
            None,
        );
        assert_eq!(result.status, "skipped");
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn language_for_path_returns_correct_language() {
        assert_eq!(language_for_path("main.rs").unwrap(), "rust");
        assert_eq!(language_for_path("app.ts").unwrap(), "typescript");
        assert_eq!(language_for_path("app.tsx").unwrap(), "typescript");
        assert_eq!(language_for_path("index.js").unwrap(), "javascript");
        assert_eq!(language_for_path("readme.md").unwrap(), "markdown");
        assert_eq!(language_for_path("config.json").unwrap(), "json");
        assert!(language_for_path("image.png").is_none());
        assert!(language_for_path("document.pdf").is_none());
    }
}
