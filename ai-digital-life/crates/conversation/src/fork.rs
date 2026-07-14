use adl_types::conversation::{ConversationMessageRecord, ConversationSessionRecord};

/// Fork a session from a specific message.
pub fn fork_session(
    parent_session: &ConversationSessionRecord,
    existing_fork_count: u32,
) -> ConversationSessionRecord {
    let fork_number = existing_fork_count + 1;
    let title = Some(format!("{} (fork #{})", parent_session.title, fork_number));

    let mut child =
        crate::create_session(&parent_session.workspace_id, title, parent_session.unpinned_order);
    child.parent_id = Some(parent_session.id.clone());
    child
}

/// Get messages that belong to the fork point (all messages up to and including fork_message_id).
pub fn get_fork_context(
    all_messages: &[ConversationMessageRecord],
    fork_message_id: &str,
) -> Vec<ConversationMessageRecord> {
    let mut context = Vec::new();
    for msg in all_messages {
        context.push(msg.clone());
        if msg.id == fork_message_id {
            break;
        }
    }
    context
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::conversation::ConversationRole;

    fn make_parent(id: &str, title: &str) -> ConversationSessionRecord {
        ConversationSessionRecord {
            id: id.to_string(),
            workspace_id: "ws1".to_string(),
            title: title.to_string(),
            status: "active".to_string(),
            is_pinned: false,
            pinned_order: 0,
            unpinned_order: 0,
            manual_unread: false,
            last_read_at: None,
            archived_at: None,
            title_updated_at: None,
            created_at: adl_types::now_ms(),
            updated_at: adl_types::now_ms(),
            last_message_at: adl_types::now_ms(),
            parent_id: None,
        }
    }

    #[test]
    fn fork_session_creates_child_with_parent_id() {
        let parent = make_parent("parent-123", "Original session");
        let child = fork_session(&parent, 0);
        assert_eq!(child.parent_id, Some("parent-123".to_string()));
        assert!(child.title.contains("(fork #1)"));
    }

    #[test]
    fn fork_number_increments() {
        let parent = make_parent("parent-123", "Original");
        let child = fork_session(&parent, 2);
        assert!(child.title.contains("(fork #3)"));
    }

    #[test]
    fn get_fork_context_includes_up_to_message() {
        let messages: Vec<_> = (0..5)
            .map(|i| ConversationMessageRecord {
                id: format!("msg-{}", i),
                session_id: "sess".to_string(),
                run_id: None,
                role: ConversationRole::User,
                content: format!("Message {}", i),
                blocks: vec![],
                created_at: adl_types::now_ms(),
            })
            .collect();

        let context = get_fork_context(&messages, "msg-2");
        assert_eq!(context.len(), 3);
        assert_eq!(context[2].id, "msg-2");
    }
}
