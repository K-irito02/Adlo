use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::TimestampMs;
use super::agent::AgentRunStatus;
use super::conversation::{ConversationRole, ConversationScenario};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelChatMessage {
    pub role: ConversationRole,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelTokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub estimated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelRouteDecision {
    pub reason: String,
    pub chain: Vec<String>,
    pub synthetic: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelResponse {
    pub provider_id: String,
    pub model_id: String,
    pub content: String,
    pub synthetic: bool,
    pub request_id: Option<String>,
    pub usage: Option<ModelTokenUsage>,
    pub route: Option<ModelRouteDecision>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum DigitalLifeRunActivityEventV1 {
    #[serde(rename_all = "camelCase")]
    RunStart { v: i32, run_id: String, seq: i64, ts: TimestampMs, scenario: ConversationScenario },
    #[serde(rename_all = "camelCase")]
    ContextAdded {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        context_type: String,
        label: String,
        path: Option<String>,
        token_estimate: Option<usize>,
        truncated: Option<bool>,
    },
    #[serde(rename_all = "camelCase")]
    FileRead {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        path: String,
        bytes: Option<usize>,
        token_estimate: Option<usize>,
        truncated: Option<bool>,
    },
    #[serde(rename_all = "camelCase")]
    Search {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        query: String,
        hit_count: Option<usize>,
        sample_paths: Option<Vec<String>>,
    },
    #[serde(rename_all = "camelCase")]
    Command {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        command: String,
        args: Option<Vec<String>>,
        exit_code: Option<i32>,
    },
    #[serde(rename_all = "camelCase")]
    Patch {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        patch_set_id: String,
        file_count: Option<usize>,
        hunk_count: Option<usize>,
    },
    #[serde(rename_all = "camelCase")]
    Approval {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        approval_id: String,
        decision: Option<String>,
        reason: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Model {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        provider_id: Option<String>,
        model_id: Option<String>,
        reason: Option<String>,
        usage: Option<ModelTokenUsage>,
        message: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Error { v: i32, run_id: String, seq: i64, ts: TimestampMs, message: String },
    #[serde(rename_all = "camelCase")]
    RunDone { v: i32, run_id: String, seq: i64, ts: TimestampMs, status: AgentRunStatus },
}

impl DigitalLifeRunActivityEventV1 {
    pub fn seq(&self) -> i64 {
        match self {
            DigitalLifeRunActivityEventV1::RunStart { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::ContextAdded { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::FileRead { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Search { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Command { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Patch { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Approval { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Model { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Error { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::RunDone { seq, .. } => *seq,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RunActivityEventRecord {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub run_id: String,
    pub seq: i64,
    pub ts: TimestampMs,
    pub event: DigitalLifeRunActivityEventV1,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealthStatus {
    pub provider_id: String,
    pub healthy: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelGatewayHealthSnapshot {
    pub checked_at: TimestampMs,
    pub providers: Vec<ProviderHealthStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelCallAuditRecord {
    pub id: String,
    pub request_id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub provider_id: String,
    pub model_id: String,
    pub scenario: ConversationScenario,
    pub route_meta: ModelRouteDecision,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub latency_ms: i64,
    pub error: Option<String>,
    pub streamed: bool,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PromptRule {
    pub id: String,
    pub kind: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntry {
    pub id: String,
    pub r#type: String,
    pub label: String,
    pub content: String,
    pub token_estimate: usize,
    pub path: Option<String>,
}
