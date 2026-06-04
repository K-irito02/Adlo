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

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::{ConversationBlock, ConversationRole};

    #[test]
    fn create_session_with_title() {
        let session = create_session("ws-1", Some("My Session".into()), 0);
        assert_eq!(session.workspace_id, "ws-1");
        assert_eq!(session.title, "My Session");
        assert_eq!(session.status, "active");
        assert!(!session.is_pinned);
        assert!(!session.manual_unread);
        assert!(session.archived_at.is_none());
    }

    #[test]
    fn create_session_without_title_uses_default() {
        let session = create_session("ws-1", None, 0);
        assert_eq!(session.title, "Single Agent Session");
    }

    #[test]
    fn create_session_sets_correct_order() {
        let session = create_session("ws-1", None, 5);
        assert_eq!(session.unpinned_order, 5);
        assert_eq!(session.pinned_order, 0);
    }

    #[test]
    fn create_session_sets_timestamps() {
        let before = now_ms();
        let session = create_session("ws-1", None, 0);
        let after = now_ms();
        assert!(session.created_at >= before);
        assert!(session.created_at <= after);
        assert!(session.last_read_at.is_some());
    }

    #[test]
    fn create_message_user_role() {
        let blocks =
            vec![ConversationBlock::Markdown { id: "test-block-1".into(), text: "Hello".into() }];
        let msg = create_message("sess-1", ConversationRole::User, "Hello", blocks.clone(), None);
        assert_eq!(msg.session_id, "sess-1");
        assert_eq!(msg.role, ConversationRole::User);
        assert_eq!(msg.content, "Hello");
        assert_eq!(msg.blocks.len(), 1);
        assert!(msg.run_id.is_none());
    }

    #[test]
    fn create_message_assistant_role() {
        let blocks = vec![ConversationBlock::Markdown {
            id: "test-block-2".into(),
            text: "Hi there!".into(),
        }];
        let msg = create_message(
            "sess-1",
            ConversationRole::Assistant,
            "Hi there!",
            blocks,
            Some("run-123".into()),
        );
        assert_eq!(msg.role, ConversationRole::Assistant);
        assert!(msg.run_id.is_some());
        assert_eq!(msg.run_id.unwrap(), "run-123");
    }

    #[test]
    fn create_message_system_role() {
        let msg =
            create_message("sess-1", ConversationRole::System, "You are helpful.", vec![], None);
        assert_eq!(msg.role, ConversationRole::System);
    }

    #[test]
    fn touch_session_updates_timestamps() {
        let mut session = create_session("ws-1", None, 0);
        let original_updated = session.updated_at;
        let new_time = original_updated + 1000;
        std::thread::sleep(std::time::Duration::from_millis(10));
        touch_session(&mut session, new_time);
        assert_eq!(session.updated_at, new_time);
        assert_eq!(session.last_message_at, new_time);
    }

    #[test]
    fn create_session_id_format() {
        let session = create_session("ws-1", None, 0);
        assert!(session.id.starts_with("conversation_"));
    }

    #[test]
    fn create_message_id_format() {
        let msg = create_message("sess-1", ConversationRole::User, "test", vec![], None);
        assert!(msg.id.starts_with("message_"));
    }
}
