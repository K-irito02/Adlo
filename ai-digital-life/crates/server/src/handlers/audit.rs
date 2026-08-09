//! Audit domain HTTP handler + shared audit helpers — migrated from
//! `src-tauri/src/commands/audit.rs`.
//!
//! The Tauri audit module holds *helpers* (`save_audit_entry_with_db`,
//! `list_audit_entries_with_db`) with no Tauri command attributes. Its HTTP
//! read surface is `POST /audit/list`; the write helper is hosted here as
//! [`save_audit_entry_with_db`] and consumed by the command / patch / task
//! handlers (replacing their identical inlined copies).

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::{Database, EntityTable};
use adl_types::{AuditEntry, RiskLevel, create_id, now_ms};
use axum::extract::State;
use axum::response::IntoResponse;

/// Persist a single audit entry via `&Database` (callable from `spawn_blocking`).
/// Faithful port of `src-tauri/src/commands/audit.rs::save_audit_entry_with_db`.
pub(crate) fn save_audit_entry_with_db(
    db: &Database,
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

#[derive(serde::Deserialize)]
struct ListAuditEntriesBody {
    limit: Option<usize>,
}

/// POST `/audit/list` — most recent audit entries, optional `limit` (defaults
/// to the storage layer's cap). Faithful port of
/// `list_audit_entries_with_db`.
pub async fn list_audit_entries(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ListAuditEntriesBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let limit = input.limit.unwrap_or(50);
    let db = state.db.clone();
    let result = crate::agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let entries: Vec<AuditEntry> =
            db.list_entities_with_limit(EntityTable::AuditRecords, limit)?;
        Ok(serde_json::to_value(&entries)?)
    })
    .await;
    ipc::to_response(result)
}
