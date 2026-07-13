use crate::EntityTable;
use adl_kernel::types::session::{SessionQuery, SessionRepository};
use adl_errors::AppError;
use adl_kernel::ConversationSessionRecord;

pub struct StorageSessionRepository {
    db: crate::Database,
}

impl StorageSessionRepository {
    pub fn new(db: crate::Database) -> Self {
        Self { db }
    }
}

impl SessionRepository for StorageSessionRepository {
    fn get_session(&self, id: &str) -> Result<Option<ConversationSessionRecord>, AppError> {
        self.db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, id)
    }
    fn save_session(&self, session: &ConversationSessionRecord) -> Result<(), AppError> {
        self.db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            None,
            session,
        )
    }
    fn list_sessions(
        &self,
        query: &SessionQuery,
    ) -> Result<Vec<ConversationSessionRecord>, AppError> {
        let mut sessions: Vec<ConversationSessionRecord> =
            self.db.list_entities(EntityTable::Sessions)?;
        if let Some(ws_id) = &query.workspace_id {
            sessions.retain(|s| &s.workspace_id == ws_id);
        }
        Ok(sessions)
    }
}
