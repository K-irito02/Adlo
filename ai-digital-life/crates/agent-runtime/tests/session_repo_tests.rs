use adl_agent_runtime::session_repo::{SessionRepository, SessionQuery};

struct MockRepo;

impl SessionRepository for MockRepo {
    fn get_session(&self, id: &str) -> Result<Option<adl_kernel::ConversationSessionRecord>, adl_errors::AppError> {
        if id == "exists" {
            Ok(Some(adl_kernel::ConversationSessionRecord {
                id: "exists".into(),
                ..Default::default()
            }))
        } else { Ok(None) }
    }
    fn save_session(&self, _session: &adl_kernel::ConversationSessionRecord) -> Result<(), adl_errors::AppError> { Ok(()) }
    fn list_sessions(&self, _query: &SessionQuery) -> Result<Vec<adl_kernel::ConversationSessionRecord>, adl_errors::AppError> { Ok(vec![]) }
}

#[test]
fn mock_repo_get_session() {
    let repo = MockRepo;
    let found = repo.get_session("exists").unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().id, "exists");
    let missing = repo.get_session("missing").unwrap();
    assert!(missing.is_none());
}
