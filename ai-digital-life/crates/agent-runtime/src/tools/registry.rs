use adl_errors::AppError;
use adl_tools::webfetch;
use adl_tools::websearch;
use adl_tools::read;
use adl_tools::grep;
use adl_tools::glob;
use std::collections::HashMap;
use std::sync::OnceLock;

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

        let output = match name {
            "webfetch" => {
                let parsed: WebFetchInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid webfetch input: {}", e)))?;
                let format = match parsed.format.as_deref() {
                    Some("text") => webfetch::WebFetchFormat::Text,
                    Some("html") => webfetch::WebFetchFormat::Html,
                    _ => webfetch::WebFetchFormat::default(),
                };
                let result =
                    webfetch::webfetch_with_format(&parsed.url, format).await;
                serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize webfetch result: {}", e))
                })?
            },
            "websearch" => {
                let parsed: WebSearchInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid websearch input: {}", e)))?;
                let result = websearch::websearch(&parsed.query).await;
                serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize websearch result: {}", e))
                })?
            },
            "read" => {
                let parsed: ReadInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid read input: {}", e)))?;
                let result = read::read_file(&parsed.path).await;
                serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize read result: {}", e))
                })?
            },
            "glob" => {
                let parsed: GlobInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid glob input: {}", e)))?;
                let result = glob::glob_files(&parsed.pattern).await;
                serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize glob result: {}", e))
                })?
            },
            "grep" => {
                let parsed: GrepInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid grep input: {}", e)))?;
                let result = grep::grep_files(&parsed.pattern).await;
                serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize grep result: {}", e))
                })?
            },
            other => {
                return Err(AppError::Internal(format!(
                    "Tool '{}' is registered but has no execute implementation",
                    other
                )));
            },
        };
        Ok(ToolExecutionResult { tool_name: name.to_string(), output, success: true })
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
}
