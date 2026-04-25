use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{create_id, now_ms, AuditEntry, RiskLevel};
use adl_storage::EntityTable;

pub fn save_audit_entry(
    state: &AppState,
    workspace_id: &str,
    session_id: Option<&str>,
    operation_type: &str,
    risk_level: RiskLevel,
    summary: impl Into<String>,
    decision: Option<&str>,
    detail: Option<String>,
) -> Result<AuditEntry, AppError> {
    let entry = AuditEntry {
        id: create_id("audit"),
        timestamp: now_ms(),
        operation_type: operation_type.to_string(),
        summary: summary.into(),
        risk_level,
        decision: decision.map(str::to_string),
        detail,
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

pub fn list_audit_entries(
    state: &AppState,
    limit: Option<usize>,
) -> Result<Vec<AuditEntry>, AppError> {
    let mut entries: Vec<AuditEntry> = state.db.list_entities(EntityTable::AuditRecords)?;
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.timestamp));
    entries.truncate(limit.unwrap_or(50));
    Ok(entries)
}
