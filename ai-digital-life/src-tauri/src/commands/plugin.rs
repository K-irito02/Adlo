use adl_agent_runtime::plugins::registry::{PluginInfo, PluginRegistry};
use std::sync::Arc;

#[allow(clippy::incompatible_msrv)]
static PLUGIN_REGISTRY: std::sync::LazyLock<Arc<PluginRegistry>> =
    std::sync::LazyLock::new(|| Arc::new(PluginRegistry::new()));

#[tauri::command]
pub async fn list_plugins() -> Result<Vec<PluginInfo>, adl_errors::AppError> {
    Ok(PLUGIN_REGISTRY.list_plugins().await)
}

#[tauri::command]
pub async fn set_plugin_enabled(name: String, enabled: bool) -> Result<(), adl_errors::AppError> {
    PLUGIN_REGISTRY.set_enabled(&name, enabled).await;
    Ok(())
}
