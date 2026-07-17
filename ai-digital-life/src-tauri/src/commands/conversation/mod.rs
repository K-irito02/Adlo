pub use self::messaging::*;
pub use self::session::*;
pub use self::state::*;

mod messaging;
mod session;
mod state;

use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    ConversationMessageRecord, ConversationRole, ConversationSessionRecord,
};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub session_id: String,
    pub content: String,
    pub scenario: Option<adl_types::ConversationScenario>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSessionInput {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderSessionsInput {
    pub workspace_id: String,
    pub pinned_ids: Vec<String>,
    pub unpinned_ids: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkSessionReadInput {
    pub session_id: String,
    pub read_at: Option<i64>,
}

pub fn active_workspace_scope_id(state: &AppState) -> String {
    state
        .current_workspace
        .read()
        .unwrap_or_else(|poison| {
            tracing::warn!("workspace mutex poisoned, recovering inner value");
            poison.into_inner()
        })
        .as_ref()
        .map(|workspace| workspace.id.clone())
        .unwrap_or_else(|| adl_types::GLOBAL_WORKSPACE_ID.to_string())
}

pub fn require_session(
    state: &AppState,
    session_id: &str,
) -> Result<ConversationSessionRecord, AppError> {
    state
        .db
        .load_entity(EntityTable::Sessions, session_id)?
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

pub fn save_session(state: &AppState, session: &ConversationSessionRecord) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::Sessions,
        &session.id,
        Some(&session.workspace_id),
        Some(&session.id),
        Some(&session.status),
        session,
    )
}

pub fn save_message(
    state: &AppState,
    workspace_id: &str,
    message: &ConversationMessageRecord,
) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::ConversationMessages,
        &message.id,
        Some(workspace_id),
        Some(&message.session_id),
        Some(match message.role {
            ConversationRole::System => "system",
            ConversationRole::User => "user",
            ConversationRole::Assistant => "assistant",
            ConversationRole::Tool => "tool",
        }),
        message,
    )
}

fn require_session_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<ConversationSessionRecord, AppError> {
    db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

fn save_session_with_db(
    db: &adl_storage::Database,
    session: &ConversationSessionRecord,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::Sessions,
        &session.id,
        Some(&session.workspace_id),
        Some(&session.id),
        Some(&session.status),
        session,
    )
}

fn set_pinned_with_db(
    db: &adl_storage::Database,
    session_id: &str,
    pinned: bool,
) -> Result<ConversationSessionRecord, AppError> {
    let mut session = require_session_with_db(db, session_id)?;
    session.is_pinned = pinned;
    session.updated_at = adl_types::now_ms();
    save_session_with_db(db, &session)?;
    Ok(session)
}

fn get_session_detail_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<Option<adl_types::ConversationDetail>, AppError> {
    let Some(session) =
        db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
    else {
        return Ok(None);
    };
    let messages: Vec<ConversationMessageRecord> =
        db.list_entities_by_session_ordered(EntityTable::ConversationMessages, session_id)?;
    Ok(Some(adl_types::ConversationDetail { session, messages }))
}
