use std::sync::Mutex;

use adl_errors::AppError;
use adl_sysmon::SystemMonitor;
use adl_types::IpcResult;
use adl_types::types::system_monitor::SystemSnapshot;

use crate::commands::ipc;

/// Managed Tauri state holding the shared `SystemMonitor`. Wrapped in a `Mutex`
/// because `snapshot()` mutates internal sampling state (CPU/network deltas).
pub struct ManagedSysmon(pub Mutex<SystemMonitor>);

#[tauri::command]
pub fn sysmon_snapshot(state: tauri::State<'_, ManagedSysmon>) -> IpcResult<SystemSnapshot> {
    let result = state
        .0
        .lock()
        .map(|mut m| m.snapshot())
        .map_err(|_| AppError::Internal("sysmon lock poisoned".into()));
    ipc(result)
}
