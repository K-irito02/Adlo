CREATE INDEX IF NOT EXISTS idx_patch_sets_run ON patch_sets(session_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_approvals_workspace ON approvals(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_records(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_run_activity_run ON run_activity_events(status, updated_at);