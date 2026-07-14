/// Query parameters for listing sessions.
pub struct SessionQuery {
    pub workspace_id: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}
