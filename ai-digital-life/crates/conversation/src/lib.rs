//! Conversation sessions and message persistence.

use adl_kernel::{
    create_id, now_ms, ConversationBlock, ConversationMessageRecord, ConversationRole,
    ConversationSessionRecord,
};

pub fn create_session(
    workspace_id: &str,
    title: Option<String>,
    unpinned_order: i32,
) -> ConversationSessionRecord {
    let now = now_ms();
    ConversationSessionRecord {
        id: create_id("conversation"),
        workspace_id: workspace_id.to_string(),
        title: title.unwrap_or_else(|| "Single Agent Session".into()),
        status: "active".into(),
        is_pinned: false,
        pinned_order: 0,
        unpinned_order,
        manual_unread: false,
        last_read_at: Some(now),
        archived_at: None,
        title_updated_at: Some(now),
        created_at: now,
        updated_at: now,
        last_message_at: now,
    }
}

pub fn create_message(
    session_id: &str,
    role: ConversationRole,
    content: impl Into<String>,
    blocks: Vec<ConversationBlock>,
    run_id: Option<String>,
) -> ConversationMessageRecord {
    ConversationMessageRecord {
        id: create_id("message"),
        session_id: session_id.to_string(),
        role,
        content: content.into(),
        blocks,
        run_id,
        created_at: now_ms(),
    }
}

pub fn touch_session(session: &mut ConversationSessionRecord, message_at: i64) {
    session.updated_at = message_at;
    session.last_message_at = message_at;
}
