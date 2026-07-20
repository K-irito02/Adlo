use adl_errors::AppError;
use adl_types::{CheckpointRecord, PatchHunkDecision, PatchSet, PatchSetStatus, create_id, now_ms};
use std::path::Path;
use tracing::warn;

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
    if !matches!(patch_set.status, PatchSetStatus::Ready | PatchSetStatus::Failed) {
        return Err(AppError::Patch(format!(
            "patch set is not ready to apply: {:?}",
            patch_set.status
        )));
    }

    let accepted_paths = patch_set
        .file_patches
        .iter()
        .filter(|file_patch| {
            file_patch.hunks.iter().any(|hunk| hunk.decision == PatchHunkDecision::Accepted)
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
        let current = match adl_fs_ops::read_text_file(root, &file_patch.relative_path, u64::MAX) {
            Ok(content) => content,
            Err(e) => {
                warn!(
                    error = %e,
                    path = %file_patch.relative_path,
                    "failed to read file for patch hash check, using empty content"
                );
                String::new()
            },
        };
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
        if file_patch.hunks.iter().any(|hunk| hunk.decision == PatchHunkDecision::Accepted) {
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
