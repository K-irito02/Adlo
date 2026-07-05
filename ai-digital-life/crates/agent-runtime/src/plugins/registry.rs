use super::{Plugin, HookType, PluginHook, HookResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub name: String,
    pub description: String,
    pub hooks: Vec<String>,
    pub enabled: bool,
}

#[derive(Clone, Default)]
pub struct PluginRegistry {
    plugins: Arc<RwLock<HashMap<String, Arc<dyn Plugin>>>>,
    enabled: Arc<RwLock<HashMap<String, bool>>>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn register(&self, plugin: Arc<dyn Plugin>) {
        let name = plugin.name().to_string();
        self.enabled.write().await.insert(name.clone(), true);
        self.plugins.write().await.insert(name, plugin);
    }

    pub async fn unregister(&self, name: &str) {
        self.plugins.write().await.remove(name);
        self.enabled.write().await.remove(name);
    }

    pub async fn set_enabled(&self, name: &str, enabled: bool) {
        self.enabled.write().await.insert(name.to_string(), enabled);
    }

    pub async fn is_enabled(&self, name: &str) -> bool {
        self.enabled.read().await.get(name).copied().unwrap_or(false)
    }

    pub async fn list_plugins(&self) -> Vec<PluginInfo> {
        let plugins = self.plugins.read().await;
        let enabled = self.enabled.read().await;
        plugins.values().map(|p| PluginInfo {
            name: p.name().to_string(),
            description: p.description().to_string(),
            hooks: p.hooks().iter().map(|h| format!("{:?}", h)).collect(),
            enabled: enabled.get(p.name()).copied().unwrap_or(false),
        }).collect()
    }

    pub async fn fire_hook(&self, hook: &PluginHook) -> HookResult {
        let hook_type = hook_to_type(hook);
        let plugins = self.plugins.read().await;
        let enabled = self.enabled.read().await;

        let mut result = HookResult::Pass;

        for plugin in plugins.values() {
            if !enabled.get(plugin.name()).copied().unwrap_or(false) {
                continue;
            }
            if !plugin.hooks().contains(&hook_type) {
                continue;
            }

            match plugin.on_hook(hook).await {
                HookResult::Pass => continue,
                HookResult::Abort(msg) => return HookResult::Abort(msg),
                HookResult::Modify(val) => result = HookResult::Modify(val),
            }
        }

        result
    }
}

fn hook_to_type(hook: &PluginHook) -> HookType {
    match hook {
        PluginHook::ToolExecuteBefore { .. } => HookType::ToolExecuteBefore,
        PluginHook::ToolExecuteAfter { .. } => HookType::ToolExecuteAfter,
        PluginHook::ChatSystemTransform { .. } => HookType::ChatSystemTransform,
        PluginHook::ChatMessageBefore { .. } => HookType::ChatMessageBefore,
        PluginHook::ChatResponseAfter { .. } => HookType::ChatResponseAfter,
        PluginHook::SessionCreateBefore { .. } => HookType::SessionCreateBefore,
        PluginHook::SessionCreateAfter { .. } => HookType::SessionCreateAfter,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestPlugin;

    #[async_trait::async_trait]
    impl Plugin for TestPlugin {
        fn name(&self) -> &str { "test-plugin" }
        fn description(&self) -> &str { "A test plugin" }
        fn hooks(&self) -> &[HookType] { &[HookType::ToolExecuteBefore] }
        async fn on_hook(&self, _hook: &PluginHook) -> HookResult { HookResult::Pass }
    }

    #[tokio::test]
    async fn register_and_list_plugin() {
        let registry = PluginRegistry::new();
        registry.register(Arc::new(TestPlugin)).await;
        let plugins = registry.list_plugins().await;
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].name, "test-plugin");
        assert!(plugins[0].enabled);
    }

    #[tokio::test]
    async fn enable_disable_plugin() {
        let registry = PluginRegistry::new();
        registry.register(Arc::new(TestPlugin)).await;
        assert!(registry.is_enabled("test-plugin").await);
        registry.set_enabled("test-plugin", false).await;
        assert!(!registry.is_enabled("test-plugin").await);
    }

    #[tokio::test]
    async fn fire_hook_returns_pass_when_no_modification() {
        let registry = PluginRegistry::new();
        registry.register(Arc::new(TestPlugin)).await;
        let hook = PluginHook::ToolExecuteBefore {
            tool_name: "read".to_string(),
            args: serde_json::json!({}),
        };
        let result = registry.fire_hook(&hook).await;
        assert!(matches!(result, HookResult::Pass));
    }
}
