use adl_errors::AppError;
use crate::types::conversation::ConversationSessionRecord;

/// Query parameters for listing sessions.
pub struct SessionQuery {
    pub workspace_id: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// Repository interface for session persistence.
/// Defined in `adl-kernel` so both `adl-storage` (impl) and `adl-agent-runtime`
/// (consumer) depend only on kernel types — inverting the previous upward
/// dependency from storage → agent-runtime.
pub trait SessionRepository: Send + Sync {
    fn get_session(&self, id: &str) -> Result<Option<ConversationSessionRecord>, AppError>;
    fn save_session(&self, session: &ConversationSessionRecord) -> Result<(), AppError>;
    fn list_sessions(
        &self,
        query: &SessionQuery,
    ) -> Result<Vec<ConversationSessionRecord>, AppError>;
}
