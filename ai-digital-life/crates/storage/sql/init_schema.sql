CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS recent_workspaces (
    root_path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    last_opened TEXT NOT NULL,
    json TEXT
);
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, updated_at);
CREATE TABLE IF NOT EXISTS retrieval_snapshots (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_records (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_steps (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_invocations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patch_sets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_patches (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patch_hunks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_requests (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_executions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS validation_results (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_preferences (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_call_audit (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_activity_events (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS durable_session_state (
    session_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    checkpoint_message_id TEXT,
    last_heartbeat INTEGER NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);