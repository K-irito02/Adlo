//! Run-activity domain HTTP handler — migrated from
//! `src-tauri/src/commands/run_activity.rs`. The domain is **history-query
//! only**: the Tauri persistence writes (`save_and_emit_run_activity`) were
//! already disabled (spec §7.2), so this surface only reads existing
//! `RunActivityEvents` rows back by run id. Follows the conversation-domain
//! recipe: blocking rusqlite in `spawn_blocking`, responses via
//! [`crate::ipc::to_response`].

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::DigitalLifeRunActivityEventV1;
use axum::extract::State;
use axum::response::IntoResponse;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListByRunIdBody {
    run_id: String,
    limit: Option<usize>,
}

/// POST `/run-activity/list` — activity events for a run id, sorted by `seq`
/// and truncated by the optional `limit` (covers `RunActivityBridge.listByRunId`).
///
/// Faithful to `run_activity_list_by_run_id`: the `status` column carries the
/// run id for this table (generic storage API).
pub async fn list_by_run_id(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ListByRunIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let result = crate::agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut events: Vec<DigitalLifeRunActivityEventV1> =
            db.list_entities_by_status(EntityTable::RunActivityEvents, &input.run_id)?;
        events.sort_by_key(|e| e.seq());
        if let Some(limit) = input.limit {
            events.truncate(limit);
        }
        Ok(serde_json::to_value(&events)?)
    })
    .await;
    ipc::to_response(result)
}
