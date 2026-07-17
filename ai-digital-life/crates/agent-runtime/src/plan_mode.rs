use adl_types::agent::AgentId;
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
        let plan_file = plan_dir.join(format!("plan-{}.md", adl_types::create_id("plan")));
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
        "read"
            | "list_tree"
            | "search"
            | "outline"
            | "glob"
            | "grep"
            | "webfetch"
            | "websearch"
            | "write"
    )
}

/// Check if a write operation targets the plan file (only plan file writes are allowed).
pub fn is_write_allowed_for_plan_file(write_target: &str, plan_file: &Path) -> bool {
    let target_normalized = write_target.replace('\\', "/");
    let plan_normalized = plan_file.to_string_lossy().replace('\\', "/");
    target_normalized == plan_normalized
        || target_normalized.ends_with(&format!("/{}", plan_normalized))
}

/// Plan Mode system prompt template (参考 OpenCode packages/opencode/src/session/prompt/plan-mode.txt)
const PLAN_MODE_TEMPLATE: &str = r#"You are operating in Plan Mode. Your goal is to create a detailed implementation plan, NOT to make any code changes.

## Workflow
1. **Initial Understanding**: Use read-only tools (read, list_tree, search, glob, grep) to explore the codebase. You may use the explore subagent for parallel exploration.
2. **Design**: Analyze the requirements and design the implementation approach.
3. **Review**: Read key files to verify your design is feasible.
4. **Final Plan**: Write the plan to the plan file using the write tool.
5. **Exit**: Call plan_exit tool to end planning and switch to build agent.

## Constraints
- You MUST NOT make any edits to source files (with the exception of the plan file).
- You MUST NOT run any commands that modify the filesystem.
- You MAY use: read, list_tree, search, outline, glob, grep, webfetch, websearch, write (plan file only).
- Your turn should only end with either asking the user a question or calling plan_exit.

## Plan File
{PLAN_INFO}

## Plan File Format
Use Markdown with the following structure:
```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]
**Architecture:** [2-3 sentences about approach]

## Tasks
### Task 1: [Component Name]
- [ ] Step 1: ...
- [ ] Step 2: ...
```
"#;

/// Generate the system prompt for Plan Mode.
///
/// `plan_file_path` is the absolute path to the plan file the agent should read
/// or create. `plan_exists` indicates whether the file is already present on
/// disk; when `false`, the prompt instructs the agent to create it via the
/// `write` tool.
pub fn plan_mode_system_prompt(plan_file_path: &str, plan_exists: bool) -> String {
    let plan_info = if plan_exists {
        format!(
            "A plan file already exists at {}. You can read it and make incremental edits using the write tool.",
            plan_file_path
        )
    } else {
        format!(
            "No plan file exists yet. You should create your plan at {} using the write tool.",
            plan_file_path
        )
    };
    PLAN_MODE_TEMPLATE.replace("{PLAN_INFO}", &plan_info)
}

/// Filter tool list for Plan Mode — only allow read-only tools plus `write`.
///
/// Tools that are not in the allowlist (e.g. `apply_patch`, `run_command`)
/// are removed from the returned list. The `write` tool is allowed but callers
/// must further constrain it to the plan file path via
/// `is_write_allowed_for_plan_file`.
pub fn filter_tools_for_plan_mode(tool_names: &[String]) -> Vec<String> {
    tool_names.iter().filter(|name| is_tool_allowed_in_plan_mode(name)).cloned().collect()
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
    }

    #[test]
    fn write_tool_allowed_in_plan_mode() {
        assert!(is_tool_allowed_in_plan_mode("write"));
    }

    #[test]
    fn run_command_still_blocked_in_plan_mode() {
        assert!(!is_tool_allowed_in_plan_mode("run_command"));
        assert!(!is_tool_allowed_in_plan_mode("apply_patch"));
    }

    #[test]
    fn write_path_constraint_allows_plan_file() {
        let plan_file = std::path::Path::new("/workspace/.ai-digital-life/plans/plan-abc.md");
        assert!(is_write_allowed_for_plan_file(
            "/workspace/.ai-digital-life/plans/plan-abc.md",
            plan_file
        ));
    }

    #[test]
    fn write_path_constraint_blocks_other_files() {
        let plan_file = std::path::Path::new("/workspace/.ai-digital-life/plans/plan-abc.md");
        assert!(!is_write_allowed_for_plan_file("/workspace/src/main.rs", plan_file));
    }

    #[test]
    fn write_path_constraint_blocks_suffix_bypass() {
        let plan_file = std::path::Path::new(".ai-digital-life/plans/plan.md");
        // Should NOT match even though it contains the plan path as a prefix
        assert!(!is_write_allowed_for_plan_file(".ai-digital-life/plans/plan.md.evil", plan_file));
    }

    #[test]
    fn write_path_constraint_blocks_directory_suffix_bypass() {
        let plan_file = std::path::Path::new(".ai-digital-life/plans/plan.md");
        // A path that appends a directory separator + extra chars should not match
        assert!(!is_write_allowed_for_plan_file(
            ".ai-digital-life/plans/plan.md/secret.txt",
            plan_file
        ));
    }

    #[test]
    fn write_path_constraint_allows_windows_separators() {
        let plan_file = std::path::Path::new(".ai-digital-life\\plans\\plan.md");
        // Windows-style backslash path should match after normalization
        assert!(is_write_allowed_for_plan_file(".ai-digital-life/plans/plan.md", plan_file));
    }

    #[test]
    fn plan_agent_id_is_plan() {
        assert_eq!(plan_agent_id(), AgentId::Plan);
    }

    #[test]
    fn plan_mode_system_prompt_contains_workflow() {
        let prompt =
            plan_mode_system_prompt("/workspace/.ai-digital-life/plans/plan-test.md", true);
        assert!(prompt.contains("Plan Mode"), "prompt should mention Plan Mode");
        assert!(prompt.contains("plan-test.md"), "prompt should reference plan file path");
        assert!(prompt.contains("MUST NOT"), "prompt should contain edit prohibition");
    }

    #[test]
    fn plan_mode_system_prompt_for_new_plan() {
        let prompt =
            plan_mode_system_prompt("/workspace/.ai-digital-life/plans/plan-test.md", false);
        assert!(prompt.contains("No plan file exists yet"), "prompt should guide creation");
        assert!(prompt.contains("write tool"), "prompt should mention write tool");
    }

    #[test]
    fn filter_tools_keeps_read_only_tools() {
        let tools = vec![
            "read".to_string(),
            "list_tree".to_string(),
            "search".to_string(),
            "glob".to_string(),
            "grep".to_string(),
            "webfetch".to_string(),
            "websearch".to_string(),
        ];
        let filtered = filter_tools_for_plan_mode(&tools);
        assert_eq!(filtered.len(), tools.len(), "all read-only tools should be kept");
    }

    #[test]
    fn filter_tools_removes_write_tools_except_write() {
        let tools = vec![
            "read".to_string(),
            "apply_patch".to_string(),
            "write".to_string(),
            "run_command".to_string(),
        ];
        let filtered = filter_tools_for_plan_mode(&tools);
        assert!(!filtered.contains(&"apply_patch".to_string()), "apply_patch should be filtered");
        assert!(!filtered.contains(&"run_command".to_string()), "run_command should be filtered");
        assert!(filtered.contains(&"write".to_string()), "write should be kept in plan mode");
        assert!(filtered.contains(&"read".to_string()), "read should be kept");
    }
}
