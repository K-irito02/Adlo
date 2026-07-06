use adl_errors::AppError;
use tokio::fs;

pub struct ReadInput {
    pub path: String,
}

pub async fn read_file(path: &str) -> Result<String, AppError> {
    let path = path.replace("..", "");
    let content = fs::read_to_string(&path).await
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
}
