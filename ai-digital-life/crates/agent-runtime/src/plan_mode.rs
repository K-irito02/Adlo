use adl_kernel::types::agent::AgentId;
use std::path::{Path, PathBuf};

/// State of plan mode for a workspace.
#[derive(Debug, Clone, Default)]
pub struct PlanModeState {
    pub active: bool,
    pub plan_file: Option<PathBuf>,
}

impl PlanModeState {
    pub fn enter(&mut self, workspace_root: &Path) -> PathBuf {
        self.active = true;
        let plan_dir = workspace_root.join(".ai-digital-life").join("plans");
        let plan_file = plan_dir.join(format!("plan-{}.md", adl_kernel::create_id("plan")));
        self.plan_file = Some(plan_file.clone());
        plan_file
    }

    pub fn exit(&mut self) -> Option<PathBuf> {
        self.active = false;
        self.plan_file.take()
    }

    pub fn is_active(&self) -> bool {
        self.active
    }
}

/// Returns the agent ID to use when plan mode is active.
pub fn plan_agent_id() -> AgentId {
    AgentId::Plan
}

/// Check if a tool is allowed in plan mode.
pub fn is_tool_allowed_in_plan_mode(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "read" | "list_tree" | "search" | "outline" | "glob" | "grep" | "webfetch" | "websearch"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enter_sets_active_and_creates_plan_path() {
        let mut state = PlanModeState::default();
        let path = state.enter(Path::new("/workspace"));
        assert!(state.is_active());
        assert!(path.starts_with("/workspace/.ai-digital-life/plans/"));
        assert!(path.to_string_lossy().ends_with(".md"));
    }

    #[test]
    fn exit_clears_active_state() {
        let mut state = PlanModeState::default();
        state.enter(Path::new("/workspace"));
        let path = state.exit();
        assert!(!state.is_active());
        assert!(path.is_some());
        assert!(state.plan_file.is_none());
    }

    #[test]
    fn read_tools_allowed_in_plan_mode() {
        assert!(is_tool_allowed_in_plan_mode("read"));
        assert!(is_tool_allowed_in_plan_mode("search"));
        assert!(is_tool_allowed_in_plan_mode("glob"));
    }

    #[test]
    fn write_tools_blocked_in_plan_mode() {
        assert!(!is_tool_allowed_in_plan_mode("apply_patch"));
        assert!(!is_tool_allowed_in_plan_mode("run_command"));
        assert!(!is_tool_allowed_in_plan_mode("write"));
    }

    #[test]
    fn plan_agent_id_is_plan() {
        assert_eq!(plan_agent_id(), AgentId::Plan);
    }
}
