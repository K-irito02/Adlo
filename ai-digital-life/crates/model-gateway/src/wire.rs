use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub(crate) struct ChatCompletionRequest {
    pub(crate) model: String,
    pub(crate) messages: Vec<WireMessage>,
    pub(crate) stream: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct WireMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ChatCompletionResponse {
    pub(crate) id: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) choices: Vec<WireChoice>,
    pub(crate) usage: Option<WireUsage>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireChoice {
    pub(crate) message: WireAssistantMessage,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireAssistantMessage {
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireUsage {
    pub(crate) prompt_tokens: Option<u32>,
    pub(crate) completion_tokens: Option<u32>,
    pub(crate) total_tokens: Option<u32>,
}
