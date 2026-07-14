use adl_errors::AppError;
use adl_types::WorkspaceSearchHit;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const MAX_SEARCH_RESULTS: usize = 200;
const CANCEL_CHECK_INTERVAL: usize = 100;

pub fn search_text(root: &Path, query: &str) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let files = crate::tree::collect_text_files(root, crate::DEFAULT_MAX_FILE_BYTES)?;
    search_text_in_files(&files, root, query, &|| false)
}

pub async fn search_text_async(
    root: &Path,
    query: &str,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query = query.to_string();
    let root_owned = root.to_path_buf();
    let files = crate::tree::collect_text_files(root, crate::DEFAULT_MAX_FILE_BYTES)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_listener = cancelled.clone();

    tokio::spawn(async move {
        cancellation.recv().await.ok();
        cancelled_listener.store(true, Ordering::Relaxed);
    });

    tokio::task::spawn_blocking(move || {
        search_text_in_files(&files, &root_owned, &query, &|| cancelled.load(Ordering::Relaxed))
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?
}

fn search_text_in_files(
    files: &[PathBuf],
    root: &Path,
    query: &str,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    let query_lower = query.to_lowercase();
    let mut hits = Vec::new();
    let max_results = MAX_SEARCH_RESULTS;

    for file in files {
        if is_cancelled() {
            return Ok(hits);
        }

        let relative = crate::tree::relative_path(root, file);
        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(path = %file.display(), error = %e, "failed to read file during search");
                String::new()
            },
        };

        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                hits.push(WorkspaceSearchHit {
                    path: relative.clone(),
                    line: index + 1,
                    preview: line.trim().chars().take(240).collect(),
                });
                if hits.len() >= max_results {
                    return Ok(hits);
                }
            }
            if index % CANCEL_CHECK_INTERVAL == 0 && is_cancelled() {
                return Ok(hits);
            }
        }
    }
    Ok(hits)
}
