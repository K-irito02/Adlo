use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{AuditBatchEntry, AuditEntry, RiskLevel, create_id, now_ms};

pub fn save_audit_entry(
    state: &AppState,
    workspace_id: &str,
    session_id: Option<&str>,
    operation_type: &str,
    risk_level: RiskLevel,
    summary: impl Into<String>,
    decision: Option<&str>,
    detail: Option<&str>,
) -> Result<AuditEntry, AppError> {
    let entry = AuditEntry {
        id: create_id("audit"),
        timestamp: now_ms(),
        operation_type: operation_type.to_string(),
        summary: summary.into(),
        risk_level,
        decision: decision.map(str::to_string),
        detail: detail.map(str::to_string),
    };
    state.db.save_entity(
        EntityTable::AuditRecords,
        &entry.id,
        Some(workspace_id),
        session_id,
        Some(operation_type),
        &entry,
    )?;
    Ok(entry)
}

/// 与 [`save_audit_entry`] 相同，但接受 `&Database` 而非 `&AppState`，便于在 `spawn_blocking` 中调用
pub fn save_audit_entry_with_db(
    db: &adl_storage::Database,
    workspace_id: &str,
    session_id: Option<&str>,
    operation_type: &str,
    risk_level: RiskLevel,
    summary: impl Into<String>,
    decision: Option<&str>,
    detail: Option<&str>,
) -> Result<AuditEntry, AppError> {
    let entry = AuditEntry {
        id: create_id("audit"),
        timestamp: now_ms(),
        operation_type: operation_type.to_string(),
        summary: summary.into(),
        risk_level,
        decision: decision.map(str::to_string),
        detail: detail.map(str::to_string),
    };
    db.save_entity(
        EntityTable::AuditRecords,
        &entry.id,
        Some(workspace_id),
        session_id,
        Some(operation_type),
        &entry,
    )?;
    Ok(entry)
}

/// Atomically saves a batch of audit entries in a single transaction.
///
/// All entries MUST share the same `workspace_id` (and ideally the same
/// `session_id`). The first entry's `workspace_id` / `session_id` are used
/// for the storage layer's indexing columns. This matches the current
/// usage pattern in `agent_pipeline::audit_helper::finalize_run`, which
/// pushes one entry per agent run into a per-call batch.
///
/// Returns the fully-formed `AuditEntry` records (with assigned `id` +
/// `timestamp`). If `entries` is empty, returns an empty vec without
/// touching the database.
pub fn batch_save_audit_entries(
    state: &AppState,
    entries: Vec<AuditBatchEntry>,
) -> Result<Vec<AuditEntry>, AppError> {
    if entries.is_empty() {
        return Ok(Vec::new());
    }
    let workspace_id = entries.first().map(|e| e.workspace_id.as_str()).unwrap_or("");
    let session_id = entries.first().and_then(|e| e.session_id.as_deref());
    state.db.transaction(|conn| {
        state.db.save_audit_entries_batch_on_conn(conn, &entries, workspace_id, session_id)
    })
}

/// 从数据库查询审计条目（可在线程池中调用）
pub fn list_audit_entries_with_db(
    db: &adl_storage::Database,
    limit: usize,
) -> Result<Vec<AuditEntry>, AppError> {
    db.list_entities_with_limit(EntityTable::AuditRecords, limit)
}
