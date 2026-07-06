use crate::commands::ipc;
use adl_agent_runtime::plugins::hooks::HookResult;
use adl_agent_runtime::plugins::registry::{PluginInfo, PluginRegistry};
use adl_agent_runtime::plugins::{HookType, Plugin, PluginHook};
use adl_errors::AppError;
use adl_kernel::IpcResult;
use async_trait::async_trait;
use std::sync::Arc;

#[allow(clippy::incompatible_msrv)]
pub(crate) static PLUGIN_REGISTRY: std::sync::LazyLock<Arc<PluginRegistry>> =
    std::sync::LazyLock::new(|| Arc::new(PluginRegistry::new()));

struct SimplePlugin {
    name: String,
    description: String,
    hooks: Vec<HookType>,
}

#[async_trait]
impl Plugin for SimplePlugin {
    fn name(&self) -> &str {
        &self.name
    }
    fn description(&self) -> &str {
        &self.description
    }
    fn hooks(&self) -> &[HookType] {
        &self.hooks
    }
    async fn on_hook(&self, _hook: &PluginHook) -> HookResult {
        HookResult::Pass
    }
}

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

#[tauri::command]
pub async fn register_plugin(
    name: String,
    description: String,
    hooks: Vec<String>,
) -> Result<IpcResult<()>, AppError> {
    Ok(ipc({
        let hook_types: Vec<HookType> = hooks
            .iter()
            .filter_map(|h| match h.as_str() {
                "ToolExecuteBefore" => Some(HookType::ToolExecuteBefore),
                "ToolExecuteAfter" => Some(HookType::ToolExecuteAfter),
                "ChatSystemTransform" => Some(HookType::ChatSystemTransform),
                "ChatMessageBefore" => Some(HookType::ChatMessageBefore),
                "ChatResponseAfter" => Some(HookType::ChatResponseAfter),
                "SessionCreateBefore" => Some(HookType::SessionCreateBefore),
                "SessionCreateAfter" => Some(HookType::SessionCreateAfter),
                _ => None,
            })
            .collect();
        let plugin = SimplePlugin { name: name.clone(), description, hooks: hook_types };
        PLUGIN_REGISTRY.register(Arc::new(plugin)).await;
        Ok(())
    }))
}

#[tauri::command]
pub async fn unregister_plugin(name: String) -> Result<IpcResult<()>, AppError> {
    Ok(ipc({
        PLUGIN_REGISTRY.unregister(&name).await;
        Ok(())
    }))
}
