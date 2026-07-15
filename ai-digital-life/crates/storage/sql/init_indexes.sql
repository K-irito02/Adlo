CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_patch_sets_run ON patch_sets(session_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_approvals_workspace ON approvals(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_records(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_run_activity_run ON run_activity_events(status, updated_at);

-- H4: speed up load_run_detail filtering by run_id (stored inside JSON
-- column as "runId" due to serde camelCase). SQLite supports expression
-- indexes on json_extract since 3.9.0 (rusqlite bundles 3.x with JSON1).
CREATE INDEX IF NOT EXISTS idx_agent_steps_run_json
  ON agent_steps(json_extract(json, '$.runId'));