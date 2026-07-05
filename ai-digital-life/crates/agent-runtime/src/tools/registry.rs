use adl_errors::AppError;
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
#[derive(Debug, Default)]
pub struct ToolRegistry {
    tools: HashMap<String, ToolDefinition>,
}

/// Input shape for the `webfetch` tool (matches its parameters schema).
#[derive(Debug, serde::Deserialize)]
struct WebFetchInput {
    url: String,
}

/// Input shape for the `websearch` tool (matches its parameters schema).
#[derive(Debug, serde::Deserialize)]
struct WebSearchInput {
    query: String,
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
        let output = match name {
            "webfetch" => {
                let parsed: WebFetchInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid webfetch input: {}", e)))?;
                let result = crate::tools::webfetch::webfetch(&parsed.url).await;
                serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize webfetch result: {}", e))
                })?
            },
            "websearch" => {
                let parsed: WebSearchInput = serde_json::from_str(input)
                    .map_err(|e| AppError::Internal(format!("Invalid websearch input: {}", e)))?;
                let result = crate::tools::websearch::websearch(&parsed.query).await;
                serde_json::to_string(&result).map_err(|e| {
                    AppError::Internal(format!("Failed to serialize websearch result: {}", e))
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
            "Fetch content from a URL via HTTP GET. Returns text content (truncated to 50KB)."
                .to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch"
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
    async fn execute_registered_but_unimplemented_tool_returns_error() {
        // read/glob/grep are registered but have no execute implementation
        let registry = ToolRegistry::with_builtins();
        let result = registry.execute("read", "{\"path\":\"/tmp/x\"}").await;
        assert!(result.is_err());
        let err_str = result.unwrap_err().to_string();
        assert!(
            err_str.contains("no execute implementation"),
            "expected no-execute error, got: {err_str}"
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
}
