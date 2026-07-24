use adl_errors::AppError;
use regex::Regex;
use std::io::BufRead;

pub struct GrepInput {
    pub pattern: String,
}

pub async fn grep_files(pattern: &str) -> Result<String, AppError> {
    let pattern = pattern.to_string();
    tokio::task::spawn_blocking(move || {
        let re = Regex::new(&pattern)
            .map_err(|e| AppError::InvalidInput(format!("Invalid regex pattern: {}", e)))?;
        let mut results: Vec<String> = Vec::new();

        for entry in walkdir::WalkDir::new(".")
            .into_iter()
            .filter_entry(|e| !is_hidden(e))
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .take(500)
        {
            let path = entry.path();
            if let Ok(file) = std::fs::File::open(path) {
                let reader = std::io::BufReader::new(file);
                for (line_no, line) in reader.lines().enumerate() {
                    if let Ok(line) = line {
                        if re.is_match(&line) {
                            let trimmed = line.trim();
                            let display = if trimmed.len() > 200 {
                                format!("{}...", &trimmed[..200])
                            } else {
                                trimmed.to_string()
                            };
                            let short_path = path
                                .strip_prefix("./")
                                .unwrap_or(path)
                                .display();
                            results.push(format!("{}:{} {}", short_path, line_no + 1, display));
                            if results.len() >= 100 {
                                return Ok(results.join("\n"));
                            }
                        }
                    }
                }
            }
        }
        if results.is_empty() {
            Ok("No matches found.".to_string())
        } else {
            Ok(results.join("\n"))
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("grep spawn failed: {}", e)))?
}

fn is_hidden(entry: &walkdir::DirEntry) -> bool {
    entry.depth() > 0
        && entry
            .file_name()
            .to_str()
            .map(|s| s.starts_with('.') || s == "target" || s == "node_modules")
            .unwrap_or(false)
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

    #[tokio::test]
    async fn grep_invalid_regex_returns_error() {
        let result = grep_files("[invalid").await;
        assert!(result.is_err());
    }
}
