use adl_errors::AppError;
use std::path::Path;

pub struct GlobInput {
    pub pattern: String,
}

pub async fn glob_files(pattern: &str) -> Result<String, AppError> {
    if pattern.contains("..")
        || pattern.starts_with('/')
        || pattern.starts_with('\\')
        || pattern.len() > 2 && pattern.as_bytes()[1] == b':'
    {
        return Err(AppError::Security(
            "Path traversal denied: glob pattern must not contain '..' or be absolute".into(),
        ));
    }
    let pattern = pattern.to_string();
    tokio::task::spawn_blocking(move || {
        let entries: Vec<String> = glob::glob(&pattern)
            .map_err(|e| AppError::InvalidInput(format!("Invalid glob pattern: {}", e)))?
            .filter_map(|entry| {
                entry.ok().and_then(|p| {
                    let path = p.strip_prefix("./").unwrap_or(&p);
                    if path == Path::new("") {
                        None
                    } else {
                        Some(path.display().to_string())
                    }
                })
            })
            .take(100)
            .collect();
        Ok(entries.join("\n"))
    })
    .await
    .map_err(|e| AppError::Internal(format!("glob spawn failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn glob_finds_files() {
        fs::write("_test_glob_a.txt", "a").await.unwrap();
        fs::write("_test_glob_b.txt", "b").await.unwrap();
        let result = glob_files("*_test_glob_*.txt").await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.contains("_test_glob_a.txt"));
        assert!(output.contains("_test_glob_b.txt"));
        let _ = fs::remove_file("_test_glob_a.txt").await;
        let _ = fs::remove_file("_test_glob_b.txt").await;
    }

    #[tokio::test]
    async fn glob_non_matching_returns_empty() {
        let result = glob_files("_nonexistent_glob_pattern_xyz_*").await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn glob_rejects_path_traversal() {
        let result = glob_files("../etc/passwd").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn glob_allows_subdirectory_pattern() {
        let result = glob_files("src/**/*.rs").await;
        assert!(result.is_ok());
    }
}
