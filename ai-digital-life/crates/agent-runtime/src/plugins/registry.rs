use super::{HookResult, HookType, Plugin, PluginHook};
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

type PluginEntry = (String, Arc<dyn Plugin>);

#[derive(Clone, Default)]
pub struct PluginRegistry {
    /// Ordered by insertion time so that hooks fire deterministically.
    plugins: Arc<RwLock<Vec<PluginEntry>>>,
    enabled: Arc<RwLock<HashMap<String, bool>>>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn register(&self, plugin: Arc<dyn Plugin>) {
        let name = plugin.name().to_string();
        self.enabled.write().await.insert(name.clone(), true);
        let mut plugins = self.plugins.write().await;
        if let Some(entry) = plugins.iter_mut().find(|(n, _)| n == &name) {
            entry.1 = plugin;
        } else {
            plugins.push((name, plugin));
        }
    }

    pub async fn unregister(&self, name: &str) {
        self.plugins.write().await.retain(|(n, _)| n != name);
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
        plugins
            .iter()
            .map(|(_, p)| PluginInfo {
                name: p.name().to_string(),
                description: p.description().to_string(),
                hooks: p.hooks().iter().map(|h| format!("{:?}", h)).collect(),
                enabled: enabled.get(p.name()).copied().unwrap_or(false),
            })
            .collect()
    }

    pub async fn fire_hook(&self, hook: &PluginHook) -> HookResult {
        let hook_type = hook_to_type(hook);
        let plugins = self.plugins.read().await;
        let enabled = self.enabled.read().await;

        let mut current_hook = hook.clone();
        let mut result = HookResult::Pass;

        for (_, plugin) in plugins.iter() {
            if !enabled.get(plugin.name()).copied().unwrap_or(false) {
                continue;
            }
            if !plugin.hooks().contains(&hook_type) {
                continue;
            }

            match plugin.on_hook(&current_hook).await {
                HookResult::Pass => continue,
                HookResult::Abort(msg) => return HookResult::Abort(msg),
                HookResult::Modify(val) => {
                    current_hook = update_hook_with_modification(&current_hook, &val);
                    result = HookResult::Modify(val);
                },
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

/// Update a hook with modification data from a previous plugin.
fn update_hook_with_modification(
    hook: &PluginHook,
    modification: &serde_json::Value,
) -> PluginHook {
    match hook {
        PluginHook::ChatSystemTransform { system_prompt } => {
            let new_prompt = modification
                .get("system_prompt")
                .and_then(|v| v.as_str())
                .unwrap_or(system_prompt.as_str())
                .to_string();
            PluginHook::ChatSystemTransform { system_prompt: new_prompt }
        },
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestPlugin;

    #[async_trait::async_trait]
    impl Plugin for TestPlugin {
        fn name(&self) -> &str {
            "test-plugin"
        }
        fn description(&self) -> &str {
            "A test plugin"
        }
        fn hooks(&self) -> &[HookType] {
            &[HookType::ToolExecuteBefore]
        }
        async fn on_hook(&self, _hook: &PluginHook) -> HookResult {
            HookResult::Pass
        }
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

    #[tokio::test]
    async fn fire_hook_chains_multiple_modify_results() {
        struct PluginA;

        #[async_trait::async_trait]
        impl Plugin for PluginA {
            fn name(&self) -> &str {
                "plugin-a"
            }
            fn description(&self) -> &str {
                "A"
            }
            fn hooks(&self) -> &[HookType] {
                &[HookType::ChatSystemTransform]
            }
            async fn on_hook(&self, _hook: &PluginHook) -> HookResult {
                HookResult::Modify(serde_json::json!({ "system_prompt": "Part A" }))
            }
        }

        struct PluginB;

        #[async_trait::async_trait]
        impl Plugin for PluginB {
            fn name(&self) -> &str {
                "plugin-b"
            }
            fn description(&self) -> &str {
                "B"
            }
            fn hooks(&self) -> &[HookType] {
                &[HookType::ChatSystemTransform]
            }
            async fn on_hook(&self, hook: &PluginHook) -> HookResult {
                if let PluginHook::ChatSystemTransform { system_prompt } = hook {
                    let combined = format!("{} + Part B", system_prompt);
                    HookResult::Modify(serde_json::json!({ "system_prompt": combined }))
                } else {
                    HookResult::Pass
                }
            }
        }

        let registry = PluginRegistry::new();
        registry.register(Arc::new(PluginA)).await;
        registry.register(Arc::new(PluginB)).await;

        let hook = PluginHook::ChatSystemTransform { system_prompt: "Original".to_string() };
        let result = registry.fire_hook(&hook).await;

        if let HookResult::Modify(val) = result {
            let prompt = val["system_prompt"].as_str().map_or("", |s| s);
            assert!(
                prompt.contains("Part A"),
                "should contain Plugin A's modification, got: {}",
                prompt,
            );
            assert!(
                prompt.contains("Part B"),
                "should contain Plugin B's modification, got: {}",
                prompt,
            );
        } else {
            panic!("Expected Modify result, got {:?}", result);
        }
    }

    #[tokio::test]
    async fn fire_hook_abort_short_circuits_chain() {
        struct ModifyingPlugin;

        #[async_trait::async_trait]
        impl Plugin for ModifyingPlugin {
            fn name(&self) -> &str {
                "modifying"
            }
            fn description(&self) -> &str {
                "Modifies"
            }
            fn hooks(&self) -> &[HookType] {
                &[HookType::ChatSystemTransform]
            }
            async fn on_hook(&self, _hook: &PluginHook) -> HookResult {
                HookResult::Modify(serde_json::json!({ "system_prompt": "Modified" }))
            }
        }

        struct AbortingPlugin;

        #[async_trait::async_trait]
        impl Plugin for AbortingPlugin {
            fn name(&self) -> &str {
                "aborting"
            }
            fn description(&self) -> &str {
                "Aborts"
            }
            fn hooks(&self) -> &[HookType] {
                &[HookType::ChatSystemTransform]
            }
            async fn on_hook(&self, _hook: &PluginHook) -> HookResult {
                HookResult::Abort("stop".to_string())
            }
        }

        let registry = PluginRegistry::new();
        registry.register(Arc::new(ModifyingPlugin)).await;
        registry.register(Arc::new(AbortingPlugin)).await;

        let hook = PluginHook::ChatSystemTransform { system_prompt: "Original".to_string() };
        let result = registry.fire_hook(&hook).await;
        assert!(matches!(result, HookResult::Abort(_)));
    }
}
