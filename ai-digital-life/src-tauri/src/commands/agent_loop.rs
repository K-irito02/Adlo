use adl_agent_runtime::part_store::PartStore;
use adl_errors::AppError;
use adl_storage::Database;
use adl_types::{MessageRecord, PartRecord};

/// `PartStore` backed by the ADL SQLite database. rusqlite is blocking, so
/// every operation runs via `spawn_blocking`.
#[allow(dead_code)] // reserved: wired into the Agent Loop executor in a later task
pub struct DbPartStore(pub Database);

#[async_trait::async_trait]
impl PartStore for DbPartStore {
    async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError> {
        let db = self.0.clone();
        let msg = msg.clone();
        tokio::task::spawn_blocking(move || db.save_message(&msg))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    }

    async fn save_part(&self, part: &PartRecord) -> Result<(), AppError> {
        let db = self.0.clone();
        let part = part.clone();
        tokio::task::spawn_blocking(move || db.save_part(&part))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    }

    async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
        let db = self.0.clone();
        let message_id = message_id.to_string();
        tokio::task::spawn_blocking(move || db.list_parts(&message_id))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_agent_runtime::part_store::PartStore;
    use adl_types::{MessageRecord, PartRecord, PartType};

    fn temp_db() -> adl_storage::Database {
        let path =
            std::env::temp_dir().join(format!("adl-dbpartstore-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[tokio::test]
    async fn db_part_store_saves_and_lists_part() {
        let db = temp_db();
        let store = DbPartStore(db);
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
        assert_eq!(parts[0].data["text"], "hi");
    }

    #[tokio::test]
    async fn db_part_store_saves_message() {
        let db = temp_db();
        let store = DbPartStore(db);
        let msg = MessageRecord {
            id: "msg_1".into(),
            session_id: "s1".into(),
            role: "assistant".into(),
            parent_id: None,
            agent: None,
            model: None,
            summary: None,
            time_created: 0,
            time_completed: None,
        };
        store.save_message(&msg).await.unwrap();
        // 通过 load_message 验证持久化
        let loaded = db_load_message(&store.0, "msg_1").await;
        assert_eq!(loaded.unwrap().id, "msg_1");
    }

    async fn db_load_message(db: &adl_storage::Database, id: &str) -> Option<MessageRecord> {
        let db = db.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || db.load_message(&id).unwrap()).await.unwrap()
    }
}
