use adl_errors::AppError;
use tokio::fs;

pub struct ReadInput {
    pub path: String,
}

pub async fn read_file(path: &str) -> Result<String, AppError> {
    let resolved = std::fs::canonicalize(path)
        .map_err(|e| AppError::NotFound(format!("Cannot resolve path '{}': {}", path, e)))?;

    let cwd = std::fs::canonicalize(
        &std::env::current_dir()
            .map_err(|e| AppError::Internal(format!("Cannot get current dir: {}", e)))?,
    )
    .map_err(|e| AppError::Internal(format!("Cannot canonicalize cwd: {}", e)))?;

    if !resolved.starts_with(&cwd) {
        return Err(AppError::Security(
            format!("Path traversal denied: '{}' resolves outside workspace", path),
        ));
    }

    let content = fs::read_to_string(&resolved)
        .await
        .map_err(|e| AppError::NotFound(format!("Cannot read file '{}': {}", path, e)))?;
    if content.len() > 51_200 {
        Ok(format!("{}...\n[Output truncated at 50KB]", &content[..51_200]))
    } else {
        Ok(content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn reads_existing_file() {
        fs::write("_test_read_ok.txt", "test content").await.unwrap();
        let result = read_file("_test_read_ok.txt").await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "test content");
        let _ = fs::remove_file("_test_read_ok.txt").await;
    }

    #[tokio::test]
    async fn returns_error_for_missing_file() {
        let result = read_file("_nonexistent_file_xyz.txt").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn blocks_path_traversal_outside_workspace() {
        let tmp = std::env::temp_dir().join("_adl_test_outside.txt");
        std::fs::write(&tmp, "outside").unwrap();
        let result = read_file(tmp.to_str().unwrap()).await;
        let _ = std::fs::remove_file(&tmp);
        assert!(matches!(result, Err(AppError::Security(_))));
    }

    #[tokio::test]
    async fn blocks_path_traversal_via_dotdot() {
        let result = read_file("../outside_workspace.txt").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn blocks_path_traversal_via_dotdotdot() {
        let result = read_file("..../outside_workspace.txt").await;
        assert!(result.is_err());
    }
}
