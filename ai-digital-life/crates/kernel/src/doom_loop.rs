use crate::permission_types::PermissionDecision;

/// Check for doom loop pattern (repeated failures).
/// Returns Ask if the same command has failed more than 3 times in a row.
pub fn doom_loop_check(recent_failures: &[String], command: &str) -> PermissionDecision {
    let consecutive_failures =
        recent_failures.iter().rev().take_while(|c| c.as_str() == command).count();

    if consecutive_failures >= 3 {
        PermissionDecision::Ask
    } else {
        PermissionDecision::Allow
    }
}

/// Check if a path is external to the workspace.
pub fn is_external_directory(path: &str, workspace_root: &str) -> bool {
    let normalized_path = std::path::Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(path));
    let normalized_root = std::path::Path::new(workspace_root)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(workspace_root));

    !normalized_path.starts_with(&normalized_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doom_loop_allows_under_threshold() {
        let failures = vec!["npm install".to_string(), "npm install".to_string()];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Allow);
    }

    #[test]
    fn doom_loop_asks_at_threshold() {
        let failures =
            vec!["npm install".to_string(), "npm install".to_string(), "npm install".to_string()];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Ask);
    }

    #[test]
    fn doom_loop_resets_on_different_command() {
        let failures = vec![
            "npm install".to_string(),
            "npm install".to_string(),
            "npm install".to_string(),
            "git status".to_string(),
        ];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Allow);
    }
}
