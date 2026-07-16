use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{create_id, now_ms, AuditEntry, RiskLevel};

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

/// 从数据库查询审计条目（可在线程池中调用）
pub fn list_audit_entries_with_db(
    db: &adl_storage::Database,
    limit: usize,
) -> Result<Vec<AuditEntry>, AppError> {
    db.list_entities_with_limit(EntityTable::AuditRecords, limit)
}
