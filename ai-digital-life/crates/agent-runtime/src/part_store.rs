use adl_errors::AppError;
use adl_types::{MessageRecord, PartRecord};

/// Abstraction over Part/Message persistence for the Agent Loop. The real
/// implementation wraps `adl_storage::Database` (Part CRUD); tests use an
/// in-memory stub.
#[async_trait::async_trait]
pub trait PartStore: Send + Sync {
    async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError>;
    async fn save_part(&self, part: &PartRecord) -> Result<(), AppError>;
    async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::{MessageRecord, PartRecord, PartType};

    #[derive(Default)]
    struct MemStore {
        parts: std::sync::Mutex<Vec<PartRecord>>,
        messages: std::sync::Mutex<Vec<MessageRecord>>,
    }

    #[async_trait::async_trait]
    impl PartStore for MemStore {
        async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError> {
            self.messages.lock().unwrap().push(msg.clone());
            Ok(())
        }
        async fn save_part(&self, part: &PartRecord) -> Result<(), AppError> {
            self.parts.lock().unwrap().push(part.clone());
            Ok(())
        }
        async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
            Ok(self
                .parts
                .lock()
                .unwrap()
                .iter()
                .filter(|p| p.message_id == message_id)
                .cloned()
                .collect())
        }
    }

    #[tokio::test]
    async fn mem_store_saves_and_lists() {
        let store = MemStore::default();
        let part = PartRecord {
            id: "part_1".into(),
            message_id: "msg_1".into(),
            session_id: "s1".into(),
            r#type: PartType::Text,
            ordinal: 0,
            time_created: 0,
            data: serde_json::json!({"type": "text", "text": "hi"}),
        };
        store.save_part(&part).await.unwrap();
        let parts = store.list_parts("msg_1").await.unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].id, "part_1");
    }

    #[tokio::test]
    async fn mem_store_saves_message() {
        let store = MemStore::default();
        let msg = MessageRecord {
            id: "msg_1".into(),
            session_id: "s1".into(),
            role: "assistant".into(),
            parent_id: None,
            agent: None,
            model: None,
            summary: None,
            time_created: 0,
            time_completed: Some(1),
        };
        store.save_message(&msg).await.unwrap();
        let messages = store.messages.lock().unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, "msg_1");
        assert_eq!(messages[0].session_id, "s1");
    }
}
