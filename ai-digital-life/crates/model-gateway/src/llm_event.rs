use adl_errors::AppError;
use adl_types::model::ModelTokenUsage;
use serde::{Deserialize, Serialize};

/// Provider-neutral LLM streaming event, mirroring OpenCode's `LLMEvent`
/// (packages/llm/src/schema/events.ts). Consumed by the Agent Loop (B3b) to
/// drive the multi-step tool loop and build Parts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum LLMEvent {
    TextStart { id: String },
    TextDelta { id: String, text: String },
    TextEnd { id: String },
    ReasoningStart { id: String },
    ReasoningDelta { id: String, text: String },
    ReasoningEnd { id: String },
    ToolInputStart { id: String, name: String },
    ToolInputDelta { id: String, name: String, text: String },
    ToolInputEnd { id: String, name: String },
    ToolCall { id: String, name: String, input: serde_json::Value },
    StepStart { index: u32 },
    StepFinish { index: u32, reason: String },
    Finish { reason: String, usage: Option<ModelTokenUsage> },
}

impl LLMEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::TextStart { .. } => "text-start",
            Self::TextDelta { .. } => "text-delta",
            Self::TextEnd { .. } => "text-end",
            Self::ReasoningStart { .. } => "reasoning-start",
            Self::ReasoningDelta { .. } => "reasoning-delta",
            Self::ReasoningEnd { .. } => "reasoning-end",
            Self::ToolInputStart { .. } => "tool-input-start",
            Self::ToolInputDelta { .. } => "tool-input-delta",
            Self::ToolInputEnd { .. } => "tool-input-end",
            Self::ToolCall { .. } => "tool-call",
            Self::StepStart { .. } => "step-start",
            Self::StepFinish { .. } => "step-finish",
            Self::Finish { .. } => "finish",
        }
    }
}

/// Stream of provider-neutral LLM events.
pub type LLMEventStream =
    std::pin::Pin<Box<dyn tokio_stream::Stream<Item = Result<LLMEvent, AppError>> + Send>>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_event_serializes_tagged_type() {
        let event = LLMEvent::TextDelta { id: "c1".into(), text: "hi".into() };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "text-delta");
        assert_eq!(json["id"], "c1");
        assert_eq!(json["text"], "hi");
    }

    #[test]
    fn llm_event_tool_call_serializes_input() {
        let event = LLMEvent::ToolCall {
            id: "call_1".into(),
            name: "read".into(),
            input: serde_json::json!({"path": "a.txt"}),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "tool-call");
        assert_eq!(json["name"], "read");
        assert_eq!(json["input"]["path"], "a.txt");
    }

    #[test]
    fn llm_event_kind_returns_type() {
        assert_eq!(LLMEvent::StepStart { index: 0 }.kind(), "step-start");
        assert_eq!(LLMEvent::Finish { reason: "stop".into(), usage: None }.kind(), "finish");
    }

    #[test]
    fn llm_event_roundtrips() {
        let event = LLMEvent::ToolInputDelta {
            id: "call_1".into(),
            name: "bash".into(),
            text: "{\"command\"".into(),
        };
        let encoded = serde_json::to_string(&event).unwrap();
        let decoded: LLMEvent = serde_json::from_str(&encoded).unwrap();
        match decoded {
            LLMEvent::ToolInputDelta { id, name, text } => {
                assert_eq!(id, "call_1");
                assert_eq!(name, "bash");
                assert_eq!(text, "{\"command\"");
            },
            _ => panic!("expected ToolInputDelta"),
        }
    }
}
