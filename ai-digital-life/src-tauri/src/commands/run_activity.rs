use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{DigitalLifeRunActivityEventV1, IpcResult};
use adl_storage::EntityTable;

#[tauri::command]
pub fn run_activity_list_by_run_id(
    state: tauri::State<'_, AppState>,
    run_id: String,
    limit: Option<usize>,
) -> IpcResult<Vec<DigitalLifeRunActivityEventV1>> {
    ipc(list_by_run_id(&state, &run_id, limit))
}

fn list_by_run_id(
    state: &AppState,
    run_id: &str,
    limit: Option<usize>,
) -> Result<Vec<DigitalLifeRunActivityEventV1>, AppError> {
    // `status` column is used as a generic filter field across entity tables.
    // We store run_id in `status` for this table to keep the generic storage API.
    let mut events: Vec<DigitalLifeRunActivityEventV1> = state
        .db
        .list_entities_by_status(EntityTable::RunActivityEvents, run_id)?;
    events.sort_by_key(|event| match event {
        DigitalLifeRunActivityEventV1::RunStart { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::ContextAdded { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::FileRead { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::Search { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::Command { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::Model { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::Patch { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::Approval { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::Error { seq, .. } => *seq,
        DigitalLifeRunActivityEventV1::RunDone { seq, .. } => *seq,
    });
    if let Some(limit) = limit {
        events.truncate(limit);
    }
    Ok(events)
}
