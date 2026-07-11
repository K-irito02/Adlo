use adl_errors::AppError;
use adl_kernel::ConversationSessionRecord;

pub struct SessionQuery {
    pub workspace_id: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

pub trait SessionRepository: Send + Sync {
    fn get_session(&self, id: &str) -> Result<Option<ConversationSessionRecord>, AppError>;
    fn save_session(&self, session: &ConversationSessionRecord) -> Result<(), AppError>;
    fn list_sessions(&self, query: &SessionQuery) -> Result<Vec<ConversationSessionRecord>, AppError>;
}
