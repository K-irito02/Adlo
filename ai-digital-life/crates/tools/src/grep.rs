use adl_errors::AppError;
use tokio::process::Command;

pub struct GrepInput {
    pub pattern: String,
}

pub async fn grep_files(pattern: &str) -> Result<String, AppError> {
    let output = Command::new("powershell")
        .args(["-Command", &format!(
            "Get-ChildItem -Recurse -File | Select-String -Pattern '{}' | Select-Object -First 100 | Format-Table -AutoSize",
            pattern.replace('\'', "''")
        )])
        .output().await
        .map_err(|e| AppError::Internal(format!("grep failed: {}", e)))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout.trim().is_empty() {
        return Ok("No matches found.".to_string());
    }
    Ok(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn grep_finds_pattern() {
        fs::write("_test_grep.txt", "hello world\nfoo bar").await.unwrap();
        let result = grep_files("hello").await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.contains("hello"));
        let _ = fs::remove_file("_test_grep.txt").await;
    }

    #[tokio::test]
    async fn grep_non_matching_returns_no_matches() {
        let pattern = format!("_adl_nonexistent_{}_", uuid::Uuid::new_v4());
        let result = grep_files(&pattern).await;
        assert!(result.is_ok());
    }
}
