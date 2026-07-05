pub mod hooks;
pub mod registry;

pub use hooks::{PluginHook, HookResult};
pub use registry::{PluginRegistry, PluginInfo};

use async_trait::async_trait;

#[async_trait]
pub trait Plugin: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn hooks(&self) -> &[HookType];
    async fn on_hook(&self, hook: &PluginHook) -> HookResult;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HookType {
    ToolExecuteBefore,
    ToolExecuteAfter,
    ChatSystemTransform,
    ChatMessageBefore,
    ChatResponseAfter,
    SessionCreateBefore,
    SessionCreateAfter,
}
