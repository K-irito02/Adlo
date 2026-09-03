/// Check for doom loop pattern (repeated failures).
/// Returns true if the same command has failed more than 3 times in a row.
pub fn doom_loop_check(recent_failures: &[String], command: &str) -> bool {
    let consecutive_failures =
        recent_failures.iter().rev().take_while(|c| c.as_str() == command).count();

    consecutive_failures >= 3
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

/// Snapshot of doom-loop detection state derived from recent run statuses.
///
/// Used by the patch generator to decide whether to escalate the next
/// `apply_patch` permission check to `Ask`. The safety guard in
/// `check_tool_permission` only triggers when `consecutive_failures >= 3`,
/// so a value of `0` (the previous hardcoded default) effectively disabled
/// the guard.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DoomLoopState {
    consecutive_failures: u32,
}

impl DoomLoopState {
    /// Build a `DoomLoopState` from a slice of recent run status strings,
    /// ordered from **most recent to oldest**. Counts the trailing run of
    /// `"failed"` entries starting from index 0.
    ///
    /// Any non-`"failed"` status at index `i` breaks the streak; earlier
    /// failures (indices > i) are ignored. Empty input yields `0`.
    pub fn from_recent_statuses(statuses: &[&str]) -> Self {
        let consecutive_failures =
            statuses.iter().copied().take_while(|status| *status == "failed").count() as u32;
        Self { consecutive_failures }
    }

    /// Number of consecutive failed runs leading up to the current attempt.
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doom_loop_allows_under_threshold() {
        let failures = vec!["npm install".to_string(), "npm install".to_string()];
        assert!(!doom_loop_check(&failures, "npm install"));
    }

    #[test]
    fn doom_loop_asks_at_threshold() {
        let failures =
            vec!["npm install".to_string(), "npm install".to_string(), "npm install".to_string()];
        assert!(doom_loop_check(&failures, "npm install"));
    }

    #[test]
    fn doom_loop_resets_on_different_command() {
        let failures = vec![
            "npm install".to_string(),
            "npm install".to_string(),
            "npm install".to_string(),
            "git status".to_string(),
        ];
        assert!(!doom_loop_check(&failures, "npm install"));
    }

    #[test]
    fn doom_loop_state_from_empty_statuses_is_zero() {
        let state = DoomLoopState::from_recent_statuses(&[]);
        assert_eq!(state.consecutive_failures(), 0);
    }

    #[test]
    fn doom_loop_state_counts_leading_failed_streak() {
        let statuses = ["failed", "failed", "failed", "succeeded", "failed"];
        let state = DoomLoopState::from_recent_statuses(&statuses);
        assert_eq!(state.consecutive_failures(), 3);
    }

    #[test]
    fn doom_loop_state_stops_at_first_non_failed() {
        let statuses = ["failed", "succeeded", "failed", "failed"];
        let state = DoomLoopState::from_recent_statuses(&statuses);
        assert_eq!(state.consecutive_failures(), 1);
    }

    #[test]
    fn doom_loop_state_all_succeeded_is_zero() {
        let statuses = ["succeeded", "succeeded"];
        let state = DoomLoopState::from_recent_statuses(&statuses);
        assert_eq!(state.consecutive_failures(), 0);
    }
}
