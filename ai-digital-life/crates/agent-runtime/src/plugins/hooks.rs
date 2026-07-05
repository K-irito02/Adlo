use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PluginHook {
    ToolExecuteBefore { tool_name: String, args: serde_json::Value },
    ToolExecuteAfter { tool_name: String, args: serde_json::Value, result: serde_json::Value },
    ChatSystemTransform { system_prompt: String },
    ChatMessageBefore { messages: Vec<serde_json::Value> },
    ChatResponseAfter { response: serde_json::Value },
    SessionCreateBefore { workspace_id: String, title: String },
    SessionCreateAfter { session_id: String },
}

#[derive(Debug, Clone)]
pub enum HookResult {
    Pass,
    Modify(serde_json::Value),
    Abort(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hook_serializes() {
        let hook = PluginHook::ToolExecuteBefore {
            tool_name: "read".to_string(),
            args: serde_json::json!({"path": "src/main.rs"}),
        };
        let json = serde_json::to_string(&hook).unwrap();
        assert!(json.contains("read"));
        assert!(json.contains("tool_execute_before"));
    }

    #[test]
    fn hook_result_pass() {
        assert!(matches!(HookResult::Pass, HookResult::Pass));
    }
}
