use adl_errors::AppError;
use adl_types::ConversationSessionRecord;

use crate::connection::Database;
use crate::entity_table::EntityTable;

impl Database {
    pub fn save_session(&self, session: &ConversationSessionRecord) -> Result<(), AppError> {
        self.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            Some(&session.status),
            session,
        )
    }

    /// Bulk-saves a slice of `ConversationSessionRecord` using a single
    /// borrowed connection (typically inside a `transaction` closure).
    ///
    /// Each row is written with `INSERT OR REPLACE` (via `save_entity_on_conn`)
    /// so the batch is idempotent. The caller is responsible for wrapping the
    /// call in `state.db.transaction(|conn| ...)` to guarantee atomicity.
    ///
    /// Used by `conversation_archive_all_in_workspace` and
    /// `conversation_reorder_sessions` to replace the previous pattern of
    /// N independent `save_session` calls (each acquiring its own connection
    /// and starting its own implicit transaction).
    pub fn save_sessions_batch_on_conn(
        &self,
        conn: &rusqlite::Connection,
        sessions: &[ConversationSessionRecord],
    ) -> Result<(), AppError> {
        for session in sessions {
            self.save_entity_on_conn(
                conn,
                EntityTable::Sessions,
                &session.id,
                Some(&session.workspace_id),
                Some(&session.id),
                Some(&session.status),
                session,
            )?;
        }
        Ok(())
    }

    pub fn load_session(&self, id: &str) -> Result<Option<ConversationSessionRecord>, AppError> {
        self.load_entity(EntityTable::Sessions, id)
    }

    pub fn list_sessions(&self) -> Result<Vec<ConversationSessionRecord>, AppError> {
        self.list_entities(EntityTable::Sessions)
    }

    pub fn delete_session(&self, id: &str) -> Result<bool, AppError> {
        self.delete_entity(EntityTable::Sessions, id)
    }
}
