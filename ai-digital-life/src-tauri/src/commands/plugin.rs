use crate::commands::ipc;
use adl_agent_runtime::plugins::registry::{PluginInfo, PluginRegistry};
use adl_errors::AppError;
use adl_kernel::IpcResult;
use std::sync::Arc;

#[allow(clippy::incompatible_msrv)]
pub(crate) static PLUGIN_REGISTRY: std::sync::LazyLock<Arc<PluginRegistry>> =
    std::sync::LazyLock::new(|| Arc::new(PluginRegistry::new()));



#[tauri::command]
pub async fn list_plugins() -> Result<IpcResult<Vec<PluginInfo>>, AppError> {
    Ok(ipc(Ok(PLUGIN_REGISTRY.list_plugins().await)))
}

#[tauri::command]
pub async fn set_plugin_enabled(name: String, enabled: bool) -> Result<IpcResult<()>, AppError> {
    Ok(ipc({
        PLUGIN_REGISTRY.set_enabled(&name, enabled).await;
        Ok(())
    }))
}
