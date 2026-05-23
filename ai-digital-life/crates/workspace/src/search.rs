use adl_errors::AppError;
use adl_kernel::WorkspaceSearchHit;
use std::path::{Path, PathBuf};
use std::fs;

const MAX_SEARCH_RESULTS: usize = 200;
const CANCEL_CHECK_INTERVAL: usize = 100;

pub fn search_text(root: &Path, query: &str) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let files = crate::tree::collect_text_files(root, crate::DEFAULT_MAX_FILE_BYTES)?;
    search_text_in_files(&files, root, query, None)
}

pub async fn search_text_async(
    root: &Path,
    query: &str,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();
    let root_owned = root.to_path_buf();
    let files = crate::tree::collect_text_files(root, crate::DEFAULT_MAX_FILE_BYTES)?;

    let mut hits = Vec::new();
    let max_results = MAX_SEARCH_RESULTS;

    for file in files {
        if cancellation.try_recv().is_ok() {
            break;
        }

        let relative = crate::tree::relative_path(&root_owned, &file);
        let content = tokio::fs::read_to_string(&file).await.unwrap_or_default();

        if cancellation.try_recv().is_ok() {
            break;
        }

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
            if index % CANCEL_CHECK_INTERVAL == 0 && cancellation.try_recv().is_ok() {
                return Ok(hits);
            }
        }
    }
    Ok(hits)
}

fn search_text_in_files(
    files: &[PathBuf],
    root: &Path,
    query: &str,
    mut cancel: Option<&mut tokio::sync::broadcast::Receiver<()>>,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    let query_lower = query.to_lowercase();
    let mut hits = Vec::new();
    let max_results = MAX_SEARCH_RESULTS;

    for file in files {
        if let Some(ch) = &mut cancel {
            if ch.try_recv().is_ok() { break; }
        }

        let relative = crate::tree::relative_path(root, file);
        let content = fs::read_to_string(file).unwrap_or_default();

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
            if let Some(ch) = &mut cancel {
                if index % CANCEL_CHECK_INTERVAL == 0 && ch.try_recv().is_ok() {
                    return Ok(hits);
                }
            }
        }
    }
    Ok(hits)
}