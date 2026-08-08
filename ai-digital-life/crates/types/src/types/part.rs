use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::TimestampMs;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum PartType {
    Text,
    Reasoning,
    Tool,
    File,
    StepStart,
    StepFinish,
    Patch,
    Snapshot,
}

/// A message in a session (mirrors OpenCode `Session.Message`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub role: String, // "user" | "assistant"
    #[serde(rename = "parentID")]
    pub parent_id: Option<String>,
    pub agent: Option<String>,
    pub model: Option<serde_json::Value>,
    pub summary: Option<serde_json::Value>,
    pub time_created: TimestampMs,
    pub time_completed: Option<TimestampMs>,
}

/// Tool invocation state machine (mirrors OpenCode `ToolState`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ToolState {
    Pending {
        input: serde_json::Value,
    },
    Running {
        input: serde_json::Value,
        title: Option<String>,
        #[serde(default)]
        metadata: serde_json::Value,
    },
    Completed {
        input: serde_json::Value,
        output: String,
        title: Option<String>,
        #[serde(default)]
        metadata: serde_json::Value,
        time: ToolTime,
    },
    Error {
        input: serde_json::Value,
        error: String,
        #[serde(default)]
        metadata: serde_json::Value,
        time: ToolTime,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ToolTime {
    pub start: TimestampMs,
    pub end: Option<TimestampMs>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TextPartData {
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningPartData {
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ToolPartData {
    pub tool: String,
    #[serde(rename = "callID")]
    pub call_id: String,
    pub state: ToolState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FilePartData {
    pub mime: String,
    pub filename: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PatchPartData {
    pub hash: String,
    pub files: Vec<String>,
}

/// The payload of a Part (mirrors OpenCode `SessionV1.Part`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PartData {
    Text(TextPartData),
    Reasoning(ReasoningPartData),
    Tool(ToolPartData),
    File(FilePartData),
    StepStart,
    StepFinish,
    Patch(PatchPartData),
    Snapshot { snapshot: String },
}

/// A stored Part row (mirrors OpenCode `part` table hydration).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PartRecord {
    pub id: String,
    #[serde(rename = "messageID")]
    pub message_id: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub r#type: PartType,
    pub ordinal: i64,
    pub time_created: TimestampMs,
    pub data: serde_json::Value,
}

/// Structured event broadcast to SSE clients (mirrors OpenCode session events).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionPartEvent {
    #[serde(rename = "message.part.updated")]
    MessagePartUpdated {
        #[serde(rename = "sessionID")]
        session_id: String,
        #[serde(rename = "messageID")]
        message_id: String,
        #[serde(rename = "partID")]
        part_id: String,
        part: serde_json::Value,
    },
    #[serde(rename = "message.part.delta")]
    MessagePartDelta {
        #[serde(rename = "sessionID")]
        session_id: String,
        #[serde(rename = "messageID")]
        message_id: String,
        #[serde(rename = "partID")]
        part_id: String,
        field: String,
        delta: String,
    },
    #[serde(rename = "message.created")]
    MessageCreated {
        #[serde(rename = "sessionID")]
        session_id: String,
        info: serde_json::Value,
    },
    #[serde(rename = "message.updated")]
    MessageUpdated {
        #[serde(rename = "sessionID")]
        session_id: String,
        info: serde_json::Value,
    },
    #[serde(rename = "session.status")]
    SessionStatus {
        #[serde(rename = "sessionID")]
        session_id: String,
        status: String,
    },
    #[serde(rename = "question.asked")]
    QuestionAsked {
        #[serde(rename = "sessionID")]
        session_id: String,
        #[serde(rename = "requestID")]
        request_id: String,
        questions: Vec<serde_json::Value>,
        tool: Option<serde_json::Value>,
    },
    #[serde(rename = "question.replied")]
    QuestionReplied {
        #[serde(rename = "sessionID")]
        session_id: String,
        #[serde(rename = "requestID")]
        request_id: String,
        answers: Vec<serde_json::Value>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn part_type_serializes_as_tagged_type() {
        let text = PartData::Text(TextPartData { text: "hello".into() });
        let json = serde_json::to_value(&text).unwrap();
        assert_eq!(json["type"], "text");
        assert_eq!(json["text"], "hello");
    }

    #[test]
    fn tool_state_pending_serializes_status() {
        let state = ToolState::Pending { input: json!({"url": "https://x.com"}) };
        let json = serde_json::to_value(&state).unwrap();
        assert_eq!(json["status"], "pending");
        assert_eq!(json["input"]["url"], "https://x.com");
    }

    #[test]
    fn tool_state_running_roundtrips() {
        let state = ToolState::Running {
            input: json!({"path": "a.txt"}),
            title: Some("Read a.txt".into()),
            metadata: json!({}),
        };
        let encoded = serde_json::to_string(&state).unwrap();
        let decoded: ToolState = serde_json::from_str(&encoded).unwrap();
        match decoded {
            ToolState::Running { input, title, .. } => {
                assert_eq!(input["path"], "a.txt");
                assert_eq!(title.as_deref(), Some("Read a.txt"));
            },
            _ => panic!("expected running state"),
        }
    }

    #[test]
    fn part_record_roundtrips() {
        let part = PartRecord {
            id: "part_1".into(),
            message_id: "msg_1".into(),
            session_id: "session_1".into(),
            r#type: PartType::Tool,
            ordinal: 0,
            time_created: 1700000000000,
            data: serde_json::json!({}),
        };
        let encoded = serde_json::to_string(&part).unwrap();
        let decoded: PartRecord = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded.id, "part_1");
        assert_eq!(decoded.r#type, PartType::Tool);
    }

    #[test]
    fn event_serializes_tagged_type() {
        let event = SessionPartEvent::MessagePartUpdated {
            session_id: "s1".into(),
            message_id: "m1".into(),
            part_id: "p1".into(),
            part: serde_json::json!({}),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "message.part.updated");
        assert_eq!(json["sessionID"], "s1");
    }

    #[test]
    fn message_record_serializes_camel_case() {
        let msg = MessageRecord {
            id: "msg_1".into(),
            session_id: "s1".into(),
            role: "assistant".into(),
            parent_id: Some("msg_0".into()),
            agent: Some("build".into()),
            model: Some(serde_json::json!({"providerID": "deepseek", "id": "deepseek-chat"})),
            summary: None,
            time_created: 1700000000000,
            time_completed: Some(1700000001000),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["sessionID"], "s1");
        assert_eq!(json["parentID"], "msg_0");
        assert_eq!(json["timeCreated"], 1700000000000_i64);
        assert_eq!(json["timeCompleted"], 1700000001000_i64);
    }
}
