use crate::PatchProposal;
use adl_kernel::{create_id, now_ms, FilePatch, PatchHunk, PatchHunkDecision, PatchSet, PatchSetStatus};

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
        language: crate::language::language_for_path(proposal.relative_path),
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
