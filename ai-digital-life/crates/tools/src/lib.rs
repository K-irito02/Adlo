/// Structured output of a tool execution, consumed by the Agent Loop
/// (B3) to build a Tool Part's state (output + metadata).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolOutput {
    pub output: String,
    pub success: bool,
    pub metadata: serde_json::Value,
}

pub mod apply_patch;
pub mod bash;
pub mod edit;
pub mod glob;
pub mod grep;
pub mod question;
pub mod read;
pub mod webfetch;
pub mod websearch;
pub mod write;
