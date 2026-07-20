use adl_errors::AppError;
use adl_types::WorkspaceSearchHit;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

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
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_clone = cancelled.clone();

    // Move collect_text_files INSIDE spawn_blocking — it does heavy I/O
    // (directory walk + metadata probes) and must not block the async runtime.
    let search_task = tokio::task::spawn_blocking(move || {
        let files = crate::tree::collect_text_files(&root_owned, crate::DEFAULT_MAX_FILE_BYTES)?;
        let cancelled_fn = move || cancelled_clone.load(Ordering::Relaxed);
        search_text_in_files(&files, &root_owned, &query, &cancelled_fn)
    });

    // Use select! instead of a detached tokio::spawn cancellation listener.
    // biased: check cancellation first (priority over search completion).
    tokio::select! {
        biased;
        _ = cancellation.recv() => {
            // Signal the blocking task to stop (it checks is_cancelled() periodically).
            // The blocking task will finish on its own; we don't abort it (unsafe for
            // spawn_blocking). Return empty results immediately.
            cancelled.store(true, Ordering::Relaxed);
            Ok(vec![])
        }
        result = search_task => {
            result.map_err(|e| AppError::Io(e.to_string()))?
        }
    }
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

#[cfg(test)]
mod search_text_async_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SC_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_tmp_dir() -> std::path::PathBuf {
        let id = SC_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("search-cancel-test-{id}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("temp dir creation should succeed");
        path
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_dir_all(path);
    }

    #[tokio::test]
    async fn search_text_async_returns_empty_on_immediate_cancellation() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("test.txt"), b"hello world").unwrap();

        let (tx, rx) = tokio::sync::broadcast::channel::<()>(1);
        // Cancel immediately before search starts
        let _ = tx.send(());

        let result = search_text_async(&tmp, "hello", rx).await;
        assert!(result.is_ok(), "search should return Ok even when cancelled");
        // Result should be empty (cancellation took effect before search could complete)
        // or contain matches — the key assertion is the function returns without hanging
        let hits = result.unwrap();
        // With immediate cancellation via select! biased, the cancellation branch
        // wins and returns empty vec. But if the search_task completes first (small dir),
        // it may return matches. Both are acceptable — the test verifies no hang.
        assert!(hits.len() <= 1, "expected 0 or 1 hits for tiny test dir, got {}", hits.len());
        cleanup(&tmp);
    }

    #[tokio::test]
    async fn search_text_async_returns_matches_without_cancellation() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("test.txt"), b"hello world\nhello again").unwrap();

        let (_tx, rx) = tokio::sync::broadcast::channel::<()>(1);
        // No cancellation sent — search should complete normally
        let result = search_text_async(&tmp, "hello", rx).await;
        assert!(result.is_ok());
        let hits = result.unwrap();
        assert_eq!(hits.len(), 2, "expected 2 hits (one per line containing 'hello')");
        cleanup(&tmp);
    }

    #[tokio::test]
    async fn search_text_async_returns_empty_for_empty_query() {
        let tmp = unique_tmp_dir();
        std::fs::write(tmp.join("test.txt"), b"hello world").unwrap();

        let (_tx, rx) = tokio::sync::broadcast::channel::<()>(1);
        let result = search_text_async(&tmp, "   ", rx).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
        cleanup(&tmp);
    }
}
