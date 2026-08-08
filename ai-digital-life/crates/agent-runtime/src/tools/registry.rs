use adl_errors::AppError;
use adl_subagent::TaskToolInput;
use adl_tools::apply_patch;
use adl_tools::bash;
use adl_tools::edit;
use adl_tools::glob;
use adl_tools::grep;
use adl_tools::question;
use adl_tools::read;
use adl_tools::task;
use adl_tools::webfetch;
use adl_tools::websearch;
use adl_tools::write;
use adl_types::permission_types::PermissionRuleset;
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

use crate::permission_check::{PermissionCheckResult, check_tool_permission};

/// Definition of a tool available to the agent.
#[derive(Debug, Clone)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// Result of a tool execution.
#[derive(Debug, Clone)]
pub struct ToolExecutionResult {
    pub tool_name: String,
    pub output: String,
    pub success: bool,
    pub metadata: serde_json::Value,
}

/// Registry of all tools available to the agent.
///
/// Holds an optional plan mode context that is consulted before executing
/// `write` tool calls — only writes targeting the plan file are permitted
/// while plan mode is active.
#[derive(Debug, Default)]
pub struct ToolRegistry {
    tools: HashMap<String, ToolDefinition>,
    plan_mode_active: bool,
    plan_file_path: Option<String>,
}

/// Input shape for the `webfetch` tool (matches its parameters schema).
#[derive(Debug, serde::Deserialize)]
struct WebFetchInput {
    url: String,
    format: Option<String>,
}

/// Input shape for the `websearch` tool (matches its parameters schema).
#[derive(Debug, serde::Deserialize)]
struct WebSearchInput {
    query: String,
}

/// Input shape for the `read` tool.
#[derive(Debug, serde::Deserialize)]
struct ReadInput {
    path: String,
}

/// Input shape for the `glob` tool.
#[derive(Debug, serde::Deserialize)]
struct GlobInput {
    pattern: String,
}

/// Input shape for the `grep` tool.
#[derive(Debug, serde::Deserialize)]
struct GrepInput {
    pattern: String,
}

/// Input shape for the `write` tool.
#[derive(Debug, serde::Deserialize)]
struct WriteInput {
    path: String,
    content: String,
}

/// Input shape for the `edit` tool.
#[derive(Debug, serde::Deserialize)]
struct EditInput {
    path: String,
    old_string: String,
    new_string: String,
    replace_all: Option<bool>,
}

/// Input shape for the `bash` tool.
#[derive(Debug, serde::Deserialize)]
struct BashInput {
    command: String,
    workdir: Option<String>,
    timeout: Option<u64>,
}

/// Input shape for the `apply_patch` tool.
#[derive(Debug, serde::Deserialize)]
struct ApplyPatchInput {
    path: String,
    before: String,
    after: String,
    session_id: Option<String>,
}

/// Input shape for the `question` tool.
#[derive(Debug, serde::Deserialize)]
struct QuestionInput {
    questions: serde_json::Value,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register all built-in tools.
    pub fn with_builtins() -> Self {
        let mut registry = Self::new();
        registry.register(webfetch_tool_definition());
        registry.register(websearch_tool_definition());
        registry.register(read_tool_definition());
        registry.register(glob_tool_definition());
        registry.register(grep_tool_definition());
        registry.register(ToolDefinition {
            name: write::NAME.to_string(),
            description:
                "Write content to one file, creating parent directories as needed. Overwrites existing files."
                    .to_string(),
            parameters: (*write::PARAMETERS).clone(),
        });
        registry.register(ToolDefinition {
            name: edit::NAME.to_string(),
            description: "Replace exact text in a file. Fails if the old string is not found. Use replace_all to replace every occurrence."
                .to_string(),
            parameters: (*edit::PARAMETERS).clone(),
        });
        registry.register(ToolDefinition {
            name: bash::NAME.to_string(),
            description: "Run a shell command and capture its output. The command runs with the workspace as the working directory."
                .to_string(),
            parameters: (*bash::PARAMETERS).clone(),
        });
        registry.register(ToolDefinition {
            name: apply_patch::NAME.to_string(),
            description: "Apply a single-file change by providing the full before/after file content."
                .to_string(),
            parameters: (*apply_patch::PARAMETERS).clone(),
        });
        registry.register(ToolDefinition {
            name: question::NAME.to_string(),
            description: "Ask the user one or more questions and wait for answers."
                .to_string(),
            parameters: (*question::PARAMETERS).clone(),
        });
        registry.register(ToolDefinition {
            name: task::NAME.to_string(),
            description: "Dispatch a sub-agent task to be executed independently."
                .to_string(),
            parameters: (*task::PARAMETERS).clone(),
        });
        registry
    }

    pub fn register(&mut self, tool: ToolDefinition) {
        self.tools.insert(tool.name.clone(), tool);
    }

    pub fn get(&self, name: &str) -> Option<&ToolDefinition> {
        self.tools.get(name)
    }

    pub fn list(&self) -> Vec<&ToolDefinition> {
        self.tools.values().collect()
    }

    pub fn list_names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    /// Set plan mode context — when active, `write` tool calls are constrained
    /// to the plan file path via `is_write_allowed_for_plan_file`.
    pub fn set_plan_mode_context(&mut self, active: bool, plan_file_path: Option<String>) {
        self.plan_mode_active = active;
        self.plan_file_path = plan_file_path;
    }

    /// Returns whether plan mode is currently active on this registry.
    pub fn is_plan_mode_active(&self) -> bool {
        self.plan_mode_active
    }

    /// Execute a tool by name.
    ///
    /// `input` is a JSON string. For `webfetch` it must be `{"url":"..."}`;
    /// for `websearch` it must be `{"query":"..."}`. This matches the
    /// `parameters` schema advertised by each tool definition (object form),
    /// rather than a bare JSON-encoded string, so LLM tool-call payloads
    /// align with the published schema.
    pub async fn execute(&self, name: &str, input: &str) -> Result<ToolExecutionResult, AppError> {
        if !self.tools.contains_key(name) {
            return Err(AppError::Internal(format!("Tool '{}' not found in registry", name)));
        }

        // === Plan Mode gate: enforce tool whitelist and write path constraint ===
        if self.plan_mode_active {
            if !crate::plan_mode::is_tool_allowed_in_plan_mode(name) {
                return Err(AppError::Internal(format!(
                    "Tool '{}' is not allowed in Plan Mode",
                    name
                )));
            }
            if name == "write" {
                let write_target = Self::extract_write_target(input);
                if let Some(plan_path) = &self.plan_file_path {
                    if !crate::plan_mode::is_write_allowed_for_plan_file(
                        &write_target,
                        std::path::Path::new(plan_path),
                    ) {
                        return Err(AppError::Internal(format!(
                            "Plan Mode: write blocked — '{}' is not the plan file",
                            write_target
                        )));
                    }
                } else {
                    return Err(AppError::Internal(
                        "Plan Mode: write blocked — no plan file path configured".into(),
                    ));
                }
            }
        }

        let result = match name {
            "webfetch" => {
                let parsed: WebFetchInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid webfetch input: {}", e)))?;
                let format = match parsed.format.as_deref() {
                    Some("text") => webfetch::WebFetchFormat::Text,
                    Some("html") => webfetch::WebFetchFormat::Html,
                    _ => webfetch::WebFetchFormat::default(),
                };
                let result = webfetch::webfetch_with_format(&parsed.url, format).await;
                let output = serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize webfetch result: {}", e))
                })?;
                ToolExecutionResult {
                    tool_name: name.to_string(),
                    output,
                    success: true,
                    metadata: serde_json::json!({}),
                }
            },
            "websearch" => {
                let parsed: WebSearchInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid websearch input: {}", e)))?;
                let result = websearch::websearch(&parsed.query).await;
                let output = serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize websearch result: {}", e))
                })?;
                ToolExecutionResult {
                    tool_name: name.to_string(),
                    output,
                    success: true,
                    metadata: serde_json::json!({}),
                }
            },
            "read" => {
                let parsed: ReadInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid read input: {}", e)))?;
                let result = read::read_file(&parsed.path).await;
                let output = serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize read result: {}", e))
                })?;
                ToolExecutionResult {
                    tool_name: name.to_string(),
                    output,
                    success: true,
                    metadata: serde_json::json!({}),
                }
            },
            "glob" => {
                let parsed: GlobInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid glob input: {}", e)))?;
                let result = glob::glob_files(&parsed.pattern).await;
                let output = serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize glob result: {}", e))
                })?;
                ToolExecutionResult {
                    tool_name: name.to_string(),
                    output,
                    success: true,
                    metadata: serde_json::json!({}),
                }
            },
            "grep" => {
                let parsed: GrepInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid grep input: {}", e)))?;
                let result = grep::grep_files(&parsed.pattern).await;
                let output = serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize grep result: {}", e))
                })?;
                ToolExecutionResult {
                    tool_name: name.to_string(),
                    output,
                    success: true,
                    metadata: serde_json::json!({}),
                }
            },
            "write" => {
                if let Some(blocked) = self.gate_permission(name, input) {
                    return Ok(blocked);
                }
                let parsed: WriteInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid write input: {}", e)))?;
                let output =
                    write::execute(&parsed.path, &parsed.content, Path::new(".")).await?;
                bridge(name, output)
            },
            "edit" => {
                if let Some(blocked) = self.gate_permission(name, input) {
                    return Ok(blocked);
                }
                let parsed: EditInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid edit input: {}", e)))?;
                let output = edit::execute(
                    &parsed.path,
                    &parsed.old_string,
                    &parsed.new_string,
                    parsed.replace_all.unwrap_or(false),
                    Path::new("."),
                )
                .await?;
                bridge(name, output)
            },
            "bash" => {
                if let Some(blocked) = self.gate_permission(name, input) {
                    return Ok(blocked);
                }
                let parsed: BashInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid bash input: {}", e)))?;
                let output = bash::execute(
                    &parsed.command,
                    parsed.workdir.as_deref(),
                    Path::new("."),
                    parsed.timeout,
                )
                .await?;
                bridge(name, output)
            },
            "apply_patch" => {
                if let Some(blocked) = self.gate_permission(name, input) {
                    return Ok(blocked);
                }
                let parsed: ApplyPatchInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid apply_patch input: {}", e)))?;
                let output = apply_patch::execute(
                    &parsed.path,
                    &parsed.before,
                    &parsed.after,
                    Path::new("."),
                    parsed.session_id.as_deref().unwrap_or("agent"),
                )
                .await?;
                bridge(name, output)
            },
            "question" => {
                let parsed: QuestionInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid question input: {}", e)))?;
                let output = question::execute(&parsed.questions).await?;
                bridge(name, output)
            },
            "task" => {
                let parsed: TaskToolInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid task input: {}", e)))?;
                let output = task::execute(&parsed, |_| {
                    Ok(adl_tools::ToolOutput {
                        output: "Sub-agent task dispatched (stub dispatcher).".to_string(),
                        success: true,
                        metadata: serde_json::json!({ "state": "completed" }),
                    })
                })
                .await?;
                bridge(name, output)
            },
            other => {
                return Err(AppError::Internal(format!(
                    "Tool '{}' is registered but has no execute implementation",
                    other
                )));
            },
        };
        Ok(result)
    }

    /// Gate a mutating tool through the permission ruleset.
    ///
    /// Returns `Some(failure result)` when the tool call is denied or requires
    /// user approval (with `permission` + `reason` metadata), and `None` when it
    /// is allowed. Ruleset and doom-loop state are defaults for now; B3 injects
    /// the real session state.
    fn gate_permission(&self, tool_name: &str, input: &str) -> Option<ToolExecutionResult> {
        let ruleset = PermissionRuleset::default_rules();
        match check_tool_permission(tool_name, input, &ruleset, 0) {
            PermissionCheckResult::Allow => None,
            PermissionCheckResult::Deny(reason) => Some(ToolExecutionResult {
                tool_name: tool_name.to_string(),
                output: reason.clone(),
                success: false,
                metadata: serde_json::json!({ "permission": "deny", "reason": reason }),
            }),
            PermissionCheckResult::Ask(reason) => Some(ToolExecutionResult {
                tool_name: tool_name.to_string(),
                output: reason.clone(),
                success: false,
                metadata: serde_json::json!({ "permission": "ask", "reason": reason }),
            }),
        }
    }

    /// Extract the `path` field from a write tool's JSON input.
    ///
    /// Falls back to the raw input string when the field is missing or the
    /// input is not valid JSON, so that the plan mode path constraint still
    /// has a value to check against.
    fn extract_write_target(input: &str) -> String {
        serde_json::from_str::<serde_json::Value>(input)
            .ok()
            .and_then(|v| v.get("path")?.as_str().map(String::from))
            .unwrap_or_else(|| input.to_string())
    }
}

/// Bridge an `adl_tools::ToolOutput` into a registry `ToolExecutionResult`,
/// carrying through the `metadata` field.
fn bridge(name: &str, output: adl_tools::ToolOutput) -> ToolExecutionResult {
    ToolExecutionResult {
        tool_name: name.to_string(),
        output: output.output,
        success: output.success,
        metadata: output.metadata,
    }
}

/// Global tool registry instance.
static GLOBAL_REGISTRY: OnceLock<ToolRegistry> = OnceLock::new();

pub fn global_registry() -> &'static ToolRegistry {
    GLOBAL_REGISTRY.get_or_init(ToolRegistry::with_builtins)
}

fn webfetch_tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: "webfetch".to_string(),
        description:
            "Fetch content from a URL via HTTP GET. Returns content in the specified format (markdown, text, or html). Max 5MB, 30s timeout."
                .to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch"
                },
                "format": {
                    "type": "string",
                    "enum": ["markdown", "text", "html"],
                    "description": "Output format: 'markdown' (default, HTML converted to markdown), 'text' (plain text), 'html' (raw HTML)"
                }
            },
            "required": ["url"]
        }),
    }
}

fn websearch_tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: "websearch".to_string(),
        description: "Search the web using Tavily API. Returns up to 10 search results."
            .to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                }
            },
            "required": ["query"]
        }),
    }
}

fn read_tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: "read".to_string(),
        description: "Read the contents of a file.".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The file path to read"
                }
            },
            "required": ["path"]
        }),
    }
}

fn glob_tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: "glob".to_string(),
        description: "Find files matching a glob pattern.".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "The glob pattern"
                }
            },
            "required": ["pattern"]
        }),
    }
}

fn grep_tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: "grep".to_string(),
        description: "Search file contents using a regex pattern.".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "The regex pattern"
                }
            },
            "required": ["pattern"]
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_lists_builtins() {
        let registry = ToolRegistry::with_builtins();
        let names = registry.list_names();
        assert!(names.contains(&"webfetch".to_string()));
        assert!(names.contains(&"websearch".to_string()));
        assert!(names.contains(&"read".to_string()));
        assert!(names.contains(&"glob".to_string()));
        assert!(names.contains(&"grep".to_string()));
    }

    #[test]
    fn get_returns_definition() {
        let registry = ToolRegistry::with_builtins();
        let tool = registry.get("webfetch");
        assert!(tool.is_some());
        let tool = tool.unwrap();
        assert_eq!(tool.name, "webfetch");
        assert!(tool.description.contains("HTTP GET"));
    }

    #[test]
    fn get_returns_none_for_unknown() {
        let registry = ToolRegistry::with_builtins();
        assert!(registry.get("nonexistent").is_none());
    }

    #[tokio::test]
    async fn execute_unknown_tool_returns_error() {
        let registry = ToolRegistry::with_builtins();
        let result = registry.execute("nonexistent", "{}").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn execute_read_tool() {
        let registry = ToolRegistry::with_builtins();
        // Use a file that exists
        let result = registry.execute("read", "{\"path\":\"_test_exec_read.txt\"}").await;
        // May fail because file doesn't exist, but should not be "no execute implementation"
        let err_str = result.as_ref().err().map(|e| e.to_string()).unwrap_or_default();
        assert!(
            !err_str.contains("no execute implementation"),
            "read tool should have an execute implementation, got: {err_str}"
        );
    }

    #[tokio::test]
    async fn execute_glob_tool() {
        let registry = ToolRegistry::with_builtins();
        let result = registry.execute("glob", "{\"pattern\":\"_nonexistent_*\"}").await;
        let err_str = result.as_ref().err().map(|e| e.to_string()).unwrap_or_default();
        assert!(
            !err_str.contains("no execute implementation"),
            "glob tool should have an execute implementation, got: {err_str}"
        );
    }

    #[tokio::test]
    async fn execute_grep_tool() {
        let registry = ToolRegistry::with_builtins();
        let result = registry.execute("grep", "{\"pattern\":\"nonexistent\"}").await;
        let err_str = result.as_ref().err().map(|e| e.to_string()).unwrap_or_default();
        assert!(
            !err_str.contains("no execute implementation"),
            "grep tool should have an execute implementation, got: {err_str}"
        );
    }

    #[test]
    fn global_registry_is_initialized_with_builtins() {
        let registry = global_registry();
        assert!(registry.get("webfetch").is_some());
        assert!(registry.get("websearch").is_some());
    }

    #[test]
    fn webfetch_input_parses_object_form() {
        let input: WebFetchInput =
            serde_json::from_str("{\"url\":\"https://example.com\"}").unwrap();
        assert_eq!(input.url, "https://example.com");
    }

    #[test]
    fn websearch_input_parses_object_form() {
        let input: WebSearchInput = serde_json::from_str("{\"query\":\"rust async\"}").unwrap();
        assert_eq!(input.query, "rust async");
    }

    #[test]
    fn read_input_parses_object_form() {
        let input: ReadInput = serde_json::from_str("{\"path\":\"/tmp/x\"}").unwrap();
        assert_eq!(input.path, "/tmp/x");
    }

    #[test]
    fn glob_input_parses_object_form() {
        let input: GlobInput = serde_json::from_str("{\"pattern\":\"*.rs\"}").unwrap();
        assert_eq!(input.pattern, "*.rs");
    }

    #[test]
    fn grep_input_parses_object_form() {
        let input: GrepInput = serde_json::from_str("{\"pattern\":\"fn main\"}").unwrap();
        assert_eq!(input.pattern, "fn main");
    }

    #[test]
    fn plan_mode_default_is_inactive() {
        let registry = ToolRegistry::with_builtins();
        assert!(!registry.is_plan_mode_active());
    }

    #[test]
    fn plan_mode_set_context_activates() {
        let mut registry = ToolRegistry::with_builtins();
        registry.set_plan_mode_context(true, Some("/tmp/plan.md".into()));
        assert!(registry.is_plan_mode_active());
    }

    #[tokio::test]
    async fn plan_mode_blocks_non_whitelisted_tool() {
        let mut registry = ToolRegistry::with_builtins();
        // Register a fake tool that is NOT in the plan mode whitelist
        registry.register(ToolDefinition {
            name: "apply_patch".into(),
            description: "test".into(),
            parameters: serde_json::json!({}),
        });
        registry.set_plan_mode_context(true, Some("/tmp/plan.md".into()));
        let result = registry.execute("apply_patch", "{}").await;
        assert!(result.is_err(), "non-whitelisted tool should be blocked in plan mode");
        let err = result.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(err.contains("not allowed in Plan Mode"), "error should mention plan mode: {err}");
    }

    #[tokio::test]
    async fn plan_mode_blocks_write_to_non_plan_file() {
        let mut registry = ToolRegistry::with_builtins();
        // Register write tool so it passes the "tool exists" check
        registry.register(ToolDefinition {
            name: "write".into(),
            description: "test".into(),
            parameters: serde_json::json!({}),
        });
        registry
            .set_plan_mode_context(true, Some("/workspace/.ai-digital-life/plans/plan.md".into()));
        let result = registry
            .execute("write", "{\"path\":\"/workspace/src/main.rs\",\"content\":\"hello\"}")
            .await;
        assert!(result.is_err(), "write to non-plan file should be blocked");
        let err = result.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(err.contains("write blocked"), "error should mention write blocked: {err}");
    }

    #[tokio::test]
    async fn plan_mode_blocks_write_with_suffix_bypass() {
        let mut registry = ToolRegistry::with_builtins();
        registry.register(ToolDefinition {
            name: "write".into(),
            description: "test".into(),
            parameters: serde_json::json!({}),
        });
        registry
            .set_plan_mode_context(true, Some("/workspace/.ai-digital-life/plans/plan.md".into()));
        let result = registry
            .execute(
                "write",
                "{\"path\":\"/workspace/.ai-digital-life/plans/plan.md.evil\",\"content\":\"x\"}",
            )
            .await;
        assert!(result.is_err(), "suffix bypass should be blocked");
    }

    #[tokio::test]
    async fn plan_mode_blocks_write_when_no_plan_file_configured() {
        let mut registry = ToolRegistry::with_builtins();
        registry.register(ToolDefinition {
            name: "write".into(),
            description: "test".into(),
            parameters: serde_json::json!({}),
        });
        registry.set_plan_mode_context(true, None);
        let result =
            registry.execute("write", "{\"path\":\"anything.md\",\"content\":\"x\"}").await;
        assert!(result.is_err(), "write should be blocked when no plan file is configured");
        let err = result.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(
            err.contains("no plan file path configured"),
            "error should mention missing plan file: {err}"
        );
    }

    #[test]
    fn extract_write_target_from_json_path() {
        let target =
            ToolRegistry::extract_write_target("{\"path\":\"/foo/bar.md\",\"content\":\"x\"}");
        assert_eq!(target, "/foo/bar.md");
    }

    #[test]
    fn extract_write_target_falls_back_to_raw_input() {
        let target = ToolRegistry::extract_write_target("not-json");
        assert_eq!(target, "not-json");
    }

    #[test]
    fn extract_write_target_falls_back_when_no_path_field() {
        let target = ToolRegistry::extract_write_target("{\"content\":\"hello\"}");
        assert_eq!(target, "{\"content\":\"hello\"}");
    }

    #[test]
    fn registry_lists_all_builtins() {
        let registry = ToolRegistry::with_builtins();
        let names = registry.list_names();
        let expected = [
            "read",
            "glob",
            "grep",
            "webfetch",
            "websearch",
            "write",
            "edit",
            "bash",
            "apply_patch",
            "question",
            "task",
        ];
        for name in expected {
            assert!(names.contains(&name.to_string()), "missing tool: {name}");
        }
    }

    #[tokio::test]
    async fn write_tool_executes_in_registry() {
        let registry = ToolRegistry::with_builtins();
        let dir = std::env::temp_dir().join(format!("adl-registry-write-{}", uuid::Uuid::new_v4()));
        let path = dir.join("x.txt");
        // 注意：现有 execute 签名是 (name, input: &str)。input 为 {"path": "...", "content": "..."}。
        // 路径使用正斜杠以保证 JSON 合法（Windows 反斜杠需转义），仍为绝对路径。
        let path_str = path.to_string_lossy().replace('\\', "/");
        let input = format!(r#"{{"path":"{}","content":"hi"}}"#, path_str);
        let result = registry.execute("write", &input).await;
        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(result.success);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn bash_tool_denied_by_permission_returns_ask() {
        // 构造一个应被权限规则拒绝的命令（如 rm -rf）
        let registry = ToolRegistry::with_builtins();
        let result = registry.execute("bash", "{\"command\":\"rm -rf /\"}").await;
        // 取决于默认规则：rm -rf / 应被 Deny 或 Ask。断言 success 为 false。
        let result = result.unwrap_or_else(|_| panic!("should not hard-error"));
        assert!(!result.success);
    }
}
