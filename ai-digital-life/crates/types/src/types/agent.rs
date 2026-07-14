use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::command::CommandExecutionResult;
use super::conversation::{ConversationScenario, DiagnosticSummary};
use super::TimestampMs;

/// Identifies a built-in or custom agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum AgentId {
    /// Primary agent for building/editing code (default).
    Build,
    /// Primary agent for read-only planning.
    Plan,
    /// Sub-agent for multi-step general tasks.
    General,
    /// Sub-agent for codebase exploration.
    Explore,
    /// Hidden system agent for session compaction.
    Compaction,
    /// Hidden system agent for generating session titles.
    Title,
    /// Hidden system agent for generating session summaries.
    Summary,
    /// Custom user-defined agent.
    Custom,
}

impl AgentId {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentId::Build => "build",
            AgentId::Plan => "plan",
            AgentId::General => "general",
            AgentId::Explore => "explore",
            AgentId::Compaction => "compaction",
            AgentId::Title => "title",
            AgentId::Summary => "summary",
            AgentId::Custom => "custom",
        }
    }
}

impl std::fmt::Display for AgentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Determines an agent's permissions and visibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMode {
    /// Top-level agent driven directly by user input.
    Primary,
    /// Spawned by another agent via the task tool.
    Subagent,
    /// System agent not shown to users.
    Hidden,
}

impl AgentMode {
    pub fn allows_write_tools(&self) -> bool {
        matches!(self, AgentMode::Primary)
    }

    pub fn is_subagent(&self) -> bool {
        matches!(self, AgentMode::Subagent)
    }

    pub fn is_hidden(&self) -> bool {
        matches!(self, AgentMode::Hidden)
    }
}

/// Configuration for a single agent instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: AgentId,
    pub name: String,
    pub description: String,
    pub mode: AgentMode,
    pub hidden: bool,
    /// When false, write tools (apply_patch, run_command) are disabled.
    pub allows_write_tools: bool,
    /// System prompt template identifier (resolved by prompt.rs).
    pub prompt_template: String,
    /// Optional model override; None uses workspace default.
    pub model_override: Option<String>,
    /// Tools explicitly allowed by this agent (inherited from parent for subagents).
    #[serde(default)]
    pub allowed_tools: Vec<String>,
}

impl AgentConfig {
    pub fn built_in(id: AgentId) -> Self {
        match id {
            AgentId::Build => Self {
                id,
                name: "build".to_string(),
                description: "Primary agent for building and editing code".to_string(),
                mode: AgentMode::Primary,
                hidden: false,
                allows_write_tools: true,
                prompt_template: "build".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
            AgentId::Plan => Self {
                id,
                name: "plan".to_string(),
                description: "Read-only planning agent for analysis without edits".to_string(),
                mode: AgentMode::Primary,
                hidden: false,
                allows_write_tools: false,
                prompt_template: "plan".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
            AgentId::General => Self {
                id,
                name: "general".to_string(),
                description: "Sub-agent for multi-step general tasks".to_string(),
                mode: AgentMode::Subagent,
                hidden: false,
                allows_write_tools: false,
                prompt_template: "general".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
            AgentId::Explore => Self {
                id,
                name: "explore".to_string(),
                description: "Sub-agent for codebase exploration".to_string(),
                mode: AgentMode::Subagent,
                hidden: false,
                allows_write_tools: false,
                prompt_template: "explore".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
            AgentId::Compaction => Self {
                id,
                name: "compaction".to_string(),
                description: "System agent for session compaction".to_string(),
                mode: AgentMode::Hidden,
                hidden: true,
                allows_write_tools: false,
                prompt_template: "compaction".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
            AgentId::Title => Self {
                id,
                name: "title".to_string(),
                description: "System agent for generating session titles".to_string(),
                mode: AgentMode::Hidden,
                hidden: true,
                allows_write_tools: false,
                prompt_template: "title".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
            AgentId::Summary => Self {
                id,
                name: "summary".to_string(),
                description: "System agent for generating session summaries".to_string(),
                mode: AgentMode::Hidden,
                hidden: true,
                allows_write_tools: false,
                prompt_template: "summary".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
            AgentId::Custom => Self {
                id,
                name: "custom".to_string(),
                description: "User-defined custom agent".to_string(),
                mode: AgentMode::Primary,
                hidden: false,
                allows_write_tools: true,
                prompt_template: "default".to_string(),
                model_override: None,
                allowed_tools: vec![],
            },
        }
    }

    pub fn all_built_in() -> Vec<AgentConfig> {
        [
            AgentId::Build,
            AgentId::Plan,
            AgentId::General,
            AgentId::Explore,
            AgentId::Compaction,
            AgentId::Title,
            AgentId::Summary,
        ]
        .iter()
        .map(|id| AgentConfig::built_in(*id))
        .collect()
    }
}

/// Backward-compat default for `AgentRunRecord::agent_id` when deserializing
/// older DB rows that predate the multi-agent system.
fn default_agent_id() -> AgentId {
    AgentId::Build
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum AgentRunStatus {
    Draft,
    Planning,
    Ready,
    Executing,
    WaitingApproval,
    Applying,
    Verifying,
    Succeeded,
    Failed,
    RolledBack,
    Aborted,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRecord {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub prompt: String,
    pub scenario: ConversationScenario,
    pub status: AgentRunStatus,
    pub summary: Option<String>,
    pub patch_set_id: Option<String>,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
    pub completed_at: Option<TimestampMs>,
    /// Which built-in or custom agent produced this run. Defaults to `Build`
    /// for rows serialized before multi-agent support landed.
    #[serde(default = "default_agent_id")]
    pub agent_id: AgentId,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlanStep {
    pub id: String,
    pub run_id: String,
    pub title: String,
    pub detail: Option<String>,
    pub status: String,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunDetail {
    pub run: AgentRunRecord,
    pub steps: Vec<AgentPlanStep>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum PatchHunkDecision {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum PatchSetStatus {
    Draft,
    Ready,
    Applying,
    Applied,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PatchHunk {
    pub id: String,
    pub file_patch_id: String,
    pub patch_set_id: String,
    pub relative_path: String,
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub preview: String,
    pub before_text: String,
    pub after_text: String,
    pub decision: PatchHunkDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FilePatch {
    pub id: String,
    pub patch_set_id: String,
    pub relative_path: String,
    pub language: Option<String>,
    pub before_content: String,
    pub after_content: String,
    pub before_hash: String,
    pub hunks: Vec<PatchHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PatchSet {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub title: String,
    pub summary: String,
    pub status: PatchSetStatus,
    pub checkpoint_id: Option<String>,
    pub file_patches: Vec<FilePatch>,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub id: String,
    pub workspace_id: String,
    pub run_id: Option<String>,
    pub patch_set_id: Option<String>,
    pub status: String,
    pub summary: String,
    pub diagnostics: Vec<DiagnosticSummary>,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PatchApplicationResult {
    pub patch_set: PatchSet,
    pub repair_patch_set: Option<PatchSet>,
    pub validation: Option<ValidationResult>,
    pub command_result: Option<CommandExecutionResult>,
    pub rolled_back: bool,
}

#[cfg(test)]
mod agent_mode_tests {
    use super::*;

    #[test]
    fn agent_mode_primary_allows_write_tools() {
        let mode = AgentMode::Primary;
        assert!(mode.allows_write_tools());
        assert!(!mode.is_subagent());
        assert!(!mode.is_hidden());
    }

    #[test]
    fn agent_mode_subagent_restricts_scope() {
        let mode = AgentMode::Subagent;
        assert!(!mode.allows_write_tools());
        assert!(mode.is_subagent());
        assert!(!mode.is_hidden());
    }

    #[test]
    fn agent_mode_hidden_for_system_agents() {
        let mode = AgentMode::Hidden;
        assert!(!mode.allows_write_tools());
        assert!(!mode.is_subagent());
        assert!(mode.is_hidden());
    }

    #[test]
    fn agent_config_build_is_primary() {
        let build = AgentConfig::built_in(AgentId::Build);
        assert_eq!(build.mode, AgentMode::Primary);
        assert_eq!(build.name, "build");
        assert!(!build.hidden);
    }

    #[test]
    fn agent_config_plan_is_primary_readonly() {
        let plan = AgentConfig::built_in(AgentId::Plan);
        assert_eq!(plan.mode, AgentMode::Primary);
        assert!(!plan.allows_write_tools);
    }

    #[test]
    fn agent_config_explore_is_subagent() {
        let explore = AgentConfig::built_in(AgentId::Explore);
        assert_eq!(explore.mode, AgentMode::Subagent);
    }

    #[test]
    fn agent_config_compaction_is_hidden() {
        let compaction = AgentConfig::built_in(AgentId::Compaction);
        assert_eq!(compaction.mode, AgentMode::Hidden);
        assert!(compaction.hidden);
    }
}
