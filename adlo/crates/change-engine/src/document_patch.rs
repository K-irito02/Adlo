//! Builds a patch set from a workspace file document.

use adl_types::{PatchSet, WorkspaceFileDocument};

use crate::{PatchProposal, create_single_file_patch_set};

pub fn create_patch_from_document(
    workspace_id: &str,
    session_id: &str,
    run_id: Option<&str>,
    prompt: &str,
    document: &WorkspaceFileDocument,
) -> PatchSet {
    let note = format!("// Adlo task: {}\n", prompt.trim());
    let after = if document.content.starts_with(&note) {
        document.content.clone()
    } else {
        format!("{note}{}", document.content)
    };
    create_single_file_patch_set(PatchProposal {
        workspace_id,
        session_id,
        run_id: run_id.map(|s| s.to_string()),
        relative_path: &document.path,
        before_content: &document.content,
        after_content: &after,
        title: format!("Update {}", document.path),
        summary: format!("Patch preview for {}", document.path),
    })
}
