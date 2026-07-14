use crate::commands::agent::StartRunInput;
use crate::commands::audit::AuditBatchEntry;
use crate::state::AppState;
use adl_types::{
    AgentRunDetail, ContextEntry, ConversationMessageRecord, ConversationScenario,
    ConversationSessionRecord, DigitalLifeRunActivityEventV1, ModelResponse, PatchSet,
    WorkspaceMeta,
};

pub struct CallModelContext<'a, F: Fn(serde_json::Value)> {
    pub state: &'a AppState,
    pub workspace: &'a WorkspaceMeta,
    pub session: &'a ConversationSessionRecord,
    pub scenario: ConversationScenario,
    pub context: Vec<ContextEntry>,
    pub detail: &'a AgentRunDetail,
    pub input: &'a StartRunInput,
    pub app: &'a tauri::AppHandle,
    pub emit_activity: F,
    pub audit_batch: &'a mut Vec<AuditBatchEntry>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

pub struct FinalizeRunContext<'a, F: Fn(serde_json::Value)> {
    pub state: &'a AppState,
    pub workspace: &'a WorkspaceMeta,
    pub session: &'a mut ConversationSessionRecord,
    pub detail: AgentRunDetail,
    pub model_response: &'a ModelResponse,
    pub patch_set: Option<&'a PatchSet>,
    pub scenario: ConversationScenario,
    pub user_message: ConversationMessageRecord,
    pub emit_activity: F,
    pub audit_batch: &'a mut Vec<AuditBatchEntry>,
}

pub struct RunActivityContext<'a> {
    pub state: &'a AppState,
    pub app: &'a tauri::AppHandle,
    pub workspace_id: &'a str,
    pub session_id: &'a str,
    pub run_id: &'a str,
    pub event: &'a DigitalLifeRunActivityEventV1,
    pub event_type: &'a str,
    pub seq: i64,
    pub ts: i64,
    pub extra: serde_json::Value,
}
