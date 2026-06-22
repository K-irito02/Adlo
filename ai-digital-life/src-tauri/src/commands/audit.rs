use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{create_id, now_ms, AuditEntry, RiskLevel};
use adl_storage::EntityTable;

pub struct AuditBatchEntry {
    pub workspace_id: String,
    pub session_id: Option<String>,
    pub operation_type: String,
    pub risk_level: RiskLevel,
    pub summary: String,
    pub decision: Option<String>,
    pub detail: Option<String>,
}

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

pub fn batch_save_audit_entries(
    state: &AppState,
    entries: Vec<AuditBatchEntry>,
) -> Result<Vec<AuditEntry>, AppError> {
    let mut saved = Vec::with_capacity(entries.len());
    for e in entries {
        let id = create_id("audit");
        let entry = AuditEntry {
            id,
            timestamp: now_ms(),
            operation_type: e.operation_type.clone(),
            summary: e.summary,
            risk_level: e.risk_level,
            decision: e.decision.clone(),
            detail: e.detail,
        };
        state.db.save_entity(
            EntityTable::AuditRecords,
            &entry.id,
            Some(&e.workspace_id),
            e.session_id.as_deref(),
            Some(&e.operation_type),
            &entry,
        )?;
        saved.push(entry);
    }
    Ok(saved)
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
