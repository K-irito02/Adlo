use adl_errors::AppError;
use tokio::process::Command;

pub struct GlobInput {
    pub pattern: String,
}

pub async fn glob_files(pattern: &str) -> Result<String, AppError> {
    let output = Command::new("powershell")
        .args(["-Command", &format!("Get-ChildItem -Path '{}' -Recurse -Name | Select-Object -First 100", pattern.replace('\'', "''"))])
        .output().await
        .map_err(|e| AppError::Internal(format!("glob failed: {}", e)))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout.lines().filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n"))
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
}
