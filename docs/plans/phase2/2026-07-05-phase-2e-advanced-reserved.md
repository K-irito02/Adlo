# Phase 2-E: Advanced & Reserved Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P2 features: Session Fork, LSP integration, Plugin system, Reference system, Custom Agent config, Hot Reloadable Config, Durable Session Execution, and reserve interfaces for ACP, HTTP API server, and CodeMode sandbox.

**Architecture:** Each P2 feature is implemented as an independent module. Session Fork extends `crates/conversation/` with parent/child branching. LSP integration creates a new `crates/lsp-client/` crate. Plugin system defines a `Plugin` trait with hooks. Reference system extends context building. Custom Agent config extends the agent registry. Hot Reload uses `notify` crate (already a dep). Durable Session adds crash recovery. ACP/HTTP API/CodeMode are interface-only stubs returning `NotImplemented`.

**Tech Stack:** Rust (`lsp-server` 0.7.x, `lsp-types` 0.97.x for LSP; existing `notify`, `tokio`, `serde`), React 19 + Zustand (frontend LSP panel, session fork UI).

## Global Constraints

- Add `lsp-server = "0.7"` and `lsp-types = "0.97"` to workspace `Cargo.toml` for LSP integration
- ACP, HTTP API server, CodeMode are **interface-only** — no implementation, return `NotImplemented` error
- Plugin system: define trait + hooks only, no third-party plugin loading (wasm/dylib) in this phase
- Hot Reloadable Config uses existing `notify` crate (no new dep)
- All UI text uses i18n keys
- TDD throughout; 3-bridge sync for new IPC
- Depends on Phases 2-A through 2-D being complete

## File Structure

### Rust — New Files

```
crates/lsp-client/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Public API
│   ├── client.rs           # LSP client lifecycle
│   ├── transport.rs        # LSP transport (stdio to language server)
│   ├── symbols.rs          # Symbol navigation (definition/references/symbols)
│   ├── diagnostics.rs      # Diagnostic collection
│   └── server_manager.rs   # Server startup/shutdown per language

crates/conversation/src/
├── fork.rs                 # Session forking logic

crates/agent-runtime/src/
├── plugins/
│   ├── mod.rs              # Plugin trait + Hook system
│   ├── registry.rs         # Plugin registry
│   └── hooks.rs            # Hook event definitions
├── durable.rs              # Durable session execution (crash recovery)

crates/context/src/
├── references.rs           # Reference system (extra directories)

crates/kernel/src/types/
├── plugin.rs               # Plugin config types
├── reference.rs            # Reference config types
└── reserved.rs             # ACP, HTTP API, CodeMode reserved interfaces

src-tauri/src/commands/
├── lsp.rs                  # LSP IPC commands
├── session_fork.rs         # Session fork IPC commands
├── plugin.rs               # Plugin management IPC
├── reference.rs            # Reference management IPC
├── custom_agent.rs         # Custom agent config IPC
├── durable.rs              # Durable session IPC
└── reserved.rs             # ACP/HTTP/CodeMode stub commands
```

### Rust — Modified Files

```
Cargo.toml                                 # Add lsp-server, lsp-types, lsp-client workspace member
crates/conversation/src/lib.rs            # Add fork module
crates/agent-runtime/src/lib.rs           # Add plugins, durable modules
crates/context/src/lib.rs                 # Add references module
crates/kernel/src/types/mod.rs            # Re-export new types
crates/kernel/src/config.rs               # Add plugins, references, custom_agents to AppConfig
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
```

### Frontend — New Files

```
frontend/src/app/features/lsp-panel/
├── LspDiagnostics.tsx       # Diagnostic list
└── LspSymbols.tsx           # Symbol tree

frontend/src/app/features/session-fork/
└── ForkButton.tsx           # Fork session button

frontend/src/shared/ipc/
├── lsp.ts
├── session_fork.ts
├── plugin.ts
├── reference.ts
├── custom_agent.ts
├── durable.ts
└── reserved.ts
```

---

## Task 1: Implement Session Fork

**Files:**
- Create: `ai-digital-life/crates/conversation/src/fork.rs`
- Modify: `ai-digital-life/crates/conversation/src/lib.rs`
- Test: inline in `fork.rs`

**Interfaces:**
- Consumes: `ConversationSessionRecord` (has `parent_id` from Phase 2-A), `ConversationMessageRecord`
- Produces: `fork_session()`, `list_forks()`, `ForkInfo`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/conversation/src/fork.rs`:

```rust
use adl_kernel::types::conversation::{ConversationSessionRecord, ConversationMessageRecord};

/// Information about a session fork.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ForkInfo {
    pub fork_session_id: String,
    pub parent_session_id: String,
    pub fork_message_id: String,
    pub fork_number: u32,
    pub created_at: u64,
}

/// Fork a session from a specific message.
/// Creates a new child session that inherits context up to the fork point.
pub fn fork_session(
    parent_session: &ConversationSessionRecord,
    fork_message_id: &str,
    existing_fork_count: u32,
) -> ConversationSessionRecord {
    let fork_number = existing_fork_count + 1;
    let title = format!("{} (fork #{})", parent_session.title, fork_number);

    let mut child = super::create_session(
        &parent_session.workspace_id,
        &title,
        parent_session.unpinned_order,
    );
    child.parent_id = Some(parent_session.id.clone());
    child
}

/// Get messages that belong to the fork point (all messages up to and including fork_message_id).
pub fn get_fork_context(
    all_messages: &[ConversationMessageRecord],
    fork_message_id: &str,
) -> Vec<ConversationMessageRecord> {
    let mut context = Vec::new();
    for msg in all_messages {
        context.push(msg.clone());
        if msg.id == fork_message_id {
            break;
        }
    }
    context
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::create_id;

    #[test]
    fn fork_session_creates_child_with_parent_id() {
        let parent = ConversationSessionRecord {
            id: "parent-123".to_string(),
            workspace_id: "ws1".to_string(),
            title: "Original session".to_string(),
            parent_id: None,
            unpinned_order: 0,
            // ... other fields with defaults
            created_at: adl_kernel::now_ms(),
            last_message_at: None,
            pinned: false,
            archived: false,
            unread: false,
        };
        let child = fork_session(&parent, "msg-5", 0);
        assert_eq!(child.parent_id, Some("parent-123".to_string()));
        assert!(child.title.contains("(fork #1)"));
    }

    #[test]
    fn fork_number_increments() {
        let parent = ConversationSessionRecord {
            id: "parent-123".to_string(),
            workspace_id: "ws1".to_string(),
            title: "Original".to_string(),
            parent_id: None,
            unpinned_order: 0,
            created_at: adl_kernel::now_ms(),
            last_message_at: None,
            pinned: false,
            archived: false,
            unread: false,
        };
        let child = fork_session(&parent, "msg-5", 2);
        assert!(child.title.contains("(fork #3)"));
    }

    #[test]
    fn get_fork_context_includes_up_to_message() {
        let messages: Vec<_> = (0..5).map(|i| ConversationMessageRecord {
            id: format!("msg-{}", i),
            session_id: "sess".to_string(),
            run_id: None,
            role: adl_kernel::types::conversation::ConversationRole::User,
            content: format!("Message {}", i),
            blocks: vec![],
            created_at: adl_kernel::now_ms(),
        }).collect();

        let context = get_fork_context(&messages, "msg-2");
        assert_eq!(context.len(), 3);
        assert_eq!(context[2].id, "msg-2");
    }
}
```

Note: Verify `ConversationSessionRecord` actual field names — the test uses `title`, `workspace_id`, `unpinned_order`, `parent_id`, `created_at`, `last_message_at`, `pinned`, `archived`, `unread`. Adjust to match actual struct.

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-conversation --lib fork`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/conversation/src/lib.rs`:

```rust
pub mod fork;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-conversation --lib fork`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/conversation/src/fork.rs ai-digital-life/crates/conversation/src/lib.rs
git commit -m "feat(core): add session fork functionality"
```

---

## Task 2: Create lsp-client Crate

**Files:**
- Modify: `ai-digital-life/Cargo.toml` (add lsp-server, lsp-types deps + workspace member)
- Create: `ai-digital-life/crates/lsp-client/Cargo.toml`
- Create: `ai-digital-life/crates/lsp-client/src/lib.rs`
- Create: `ai-digital-life/crates/lsp-client/src/client.rs`
- Create: `ai-digital-life/crates/lsp-client/src/server_manager.rs`
- Create: `ai-digital-life/crates/lsp-client/src/symbols.rs`
- Create: `ai-digital-life/crates/lsp-client/src/diagnostics.rs`

- [ ] **Step 1: Add LSP dependencies**

Edit `ai-digital-life/Cargo.toml`:

```toml
[workspace.dependencies]
lsp-server = "0.7"
lsp-types = "0.97"
```

Add `"crates/lsp-client"` to members.

- [ ] **Step 2: Create Cargo.toml**

Create `ai-digital-life/crates/lsp-client/Cargo.toml`:

```toml
[package]
name = "adl-lsp-client"
version = "0.1.0"
edition = "2021"

[dependencies]
adl-kernel = { path = "../kernel" }
adl-errors = { path = "../errors" }
lsp-server = { workspace = true }
lsp-types = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
tracing = { workspace = true }
thiserror = { workspace = true }

[dev-dependencies]
tokio = { workspace = true, features = ["macros", "rt-multi-thread"] }
```

- [ ] **Step 3: Create lib.rs with core types**

Create `ai-digital-life/crates/lsp-client/src/lib.rs`:

```rust
pub mod client;
pub mod server_manager;
pub mod symbols;
pub mod diagnostics;

pub use client::{LspClient, LspClientState};
pub use server_manager::{LspServerManager, LanguageServerConfig};
pub use symbols::{SymbolInfo, SymbolKind, DefinitionLocation};
pub use diagnostics::DiagnosticInfo;

use serde::{Deserialize, Serialize};

/// Supported language servers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageServer {
    RustAnalyzer,
    TypeScriptLanguageServer,
    Pylsp,
    Gopls,
    Custom(String),
}

impl LanguageServer {
    pub fn command(&self) -> Vec<&str> {
        match self {
            LanguageServer::RustAnalyzer => vec!["rust-analyzer"],
            LanguageServer::TypeScriptLanguageServer => vec!["typescript-language-server", "--stdio"],
            LanguageServer::Pylsp => vec!["pylsp"],
            LanguageServer::Gopls => vec!["gopls", "serve"],
            LanguageServer::Custom(cmd) => vec![cmd.as_str()],
        }
    }

    pub fn from_file_extension(ext: &str) -> Option<Self> {
        match ext {
            "rs" => Some(LanguageServer::RustAnalyzer),
            "ts" | "tsx" | "js" | "jsx" => Some(LanguageServer::TypeScriptLanguageServer),
            "py" => Some(LanguageServer::Pylsp),
            "go" => Some(LanguageServer::Gopls),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rust_extension_maps_to_rust_analyzer() {
        assert_eq!(
            LanguageServer::from_file_extension("rs"),
            Some(LanguageServer::RustAnalyzer)
        );
    }

    #[test]
    fn ts_extension_maps_to_ts_server() {
        assert_eq!(
            LanguageServer::from_file_extension("ts"),
            Some(LanguageServer::TypeScriptLanguageServer)
        );
    }

    #[test]
    fn unknown_extension_returns_none() {
        assert!(LanguageServer::from_file_extension("xyz").is_none());
    }

    #[test]
    fn rust_analyzer_command() {
        let server = LanguageServer::RustAnalyzer;
        assert_eq!(server.command(), vec!["rust-analyzer"]);
    }
}
```

- [ ] **Step 4: Create client.rs**

Create `ai-digital-life/crates/lsp-client/src/client.rs`:

```rust
use crate::LanguageServer;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LspClientState {
    Stopped,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Clone)]
pub struct LspClient {
    servers: Arc<Mutex<HashMap<LanguageServer, LspClientState>>>,
    workspace_root: PathBuf,
}

impl LspClient {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
            workspace_root,
        }
    }

    pub async fn start_server(&self, server: LanguageServer) -> Result<(), adl_errors::AppError> {
        let mut servers = self.servers.lock().await;
        if servers.contains_key(&server) {
            return Ok(()); // Already started
        }

        servers.insert(server.clone(), LspClientState::Starting);

        // Actual LSP server startup would use lsp_server::Connection
        // For now, mark as running (stub implementation)
        tracing::info!("Starting LSP server: {:?}", server);
        servers.insert(server, LspClientState::Running);

        Ok(())
    }

    pub async fn stop_server(&self, server: &LanguageServer) -> Result<(), adl_errors::AppError> {
        let mut servers = self.servers.lock().await;
        servers.remove(server);
        Ok(())
    }

    pub async fn get_state(&self, server: &LanguageServer) -> LspClientState {
        self.servers.lock().await.get(server).copied().unwrap_or(LspClientState::Stopped)
    }

    pub async fn list_servers(&self) -> Vec<(LanguageServer, LspClientState)> {
        self.servers.lock().await.iter().map(|(k, v)| (k.clone(), *v)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn start_and_stop_server() {
        let client = LspClient::new(PathBuf::from("/workspace"));
        client.start_server(LanguageServer::RustAnalyzer).await.unwrap();
        assert_eq!(client.get_state(&LanguageServer::RustAnalyzer).await, LspClientState::Running);
        client.stop_server(&LanguageServer::RustAnalyzer).await.unwrap();
        assert_eq!(client.get_state(&LanguageServer::RustAnalyzer).await, LspClientState::Stopped);
    }

    #[tokio::test]
    async fn list_servers_empty_initially() {
        let client = LspClient::new(PathBuf::from("/workspace"));
        let servers = client.list_servers().await;
        assert!(servers.is_empty());
    }
}
```

- [ ] **Step 5: Create symbols.rs and diagnostics.rs stubs**

Create `ai-digital-life/crates/lsp-client/src/symbols.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolInfo {
    pub name: String,
    pub kind: SymbolKind,
    pub location: DefinitionLocation,
    pub container_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SymbolKind {
    File, Module, Namespace, Package, Class, Method, Property, Field,
    Constructor, Enum, Interface, Function, Variable, Constant, String,
    Number, Boolean, Array, Object, Key, Null, Struct, Event, Operator,
    TypeParameter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefinitionLocation {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub end_line: Option<u32>,
    pub end_column: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn symbol_info_serializes() {
        let symbol = SymbolInfo {
            name: "my_function".to_string(),
            kind: SymbolKind::Function,
            location: DefinitionLocation {
                file_path: "src/main.rs".to_string(),
                line: 10,
                column: 4,
                end_line: Some(15),
                end_column: Some(4),
            },
            container_name: Some("my_module".to_string()),
        };
        let json = serde_json::to_string(&symbol).unwrap();
        assert!(json.contains("my_function"));
    }
}
```

Create `ai-digital-life/crates/lsp-client/src/diagnostics.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticInfo {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub source: Option<String>,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_serializes() {
        let diag = DiagnosticInfo {
            file_path: "src/main.rs".to_string(),
            line: 10,
            column: 5,
            severity: DiagnosticSeverity::Error,
            message: "expected `;`".to_string(),
            source: Some("rustc".to_string()),
            code: Some("E0001".to_string()),
        };
        let json = serde_json::to_string(&diag).unwrap();
        assert!(json.contains("expected"));
    }
}
```

Create `ai-digital-life/crates/lsp-client/src/server_manager.rs`:

```rust
use crate::LanguageServer;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageServerConfig {
    pub language: String,
    pub server: LanguageServer,
    pub command: String,
    pub args: Vec<String>,
    pub init_options: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default)]
pub struct LspServerManager {
    configs: Vec<LanguageServerConfig>,
}

impl LspServerManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_config(&mut self, config: LanguageServerConfig) {
        self.configs.push(config);
    }

    pub fn find_for_file(&self, file_extension: &str) -> Option<&LanguageServerConfig> {
        LanguageServer::from_file_extension(file_extension)
            .and_then(|server| self.configs.iter().find(|c| c.server == server))
    }

    pub fn list_configs(&self) -> &[LanguageServerConfig] {
        &self.configs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_config_for_rust() {
        let mut manager = LspServerManager::new();
        manager.add_config(LanguageServerConfig {
            language: "rust".to_string(),
            server: LanguageServer::RustAnalyzer,
            command: "rust-analyzer".to_string(),
            args: vec![],
            init_options: None,
        });
        let config = manager.find_for_file("rs");
        assert!(config.is_some());
    }

    #[test]
    fn find_config_returns_none_for_unknown() {
        let manager = LspServerManager::new();
        assert!(manager.find_for_file("xyz").is_none());
    }
}
```

- [ ] **Step 6: Run tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-lsp-client`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/Cargo.toml ai-digital-life/crates/lsp-client/
git commit -m "feat(core): create adl-lsp-client crate for LSP integration"
```

---

## Task 3: Implement Plugin System (Trait + Hooks)

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/plugins/mod.rs`
- Create: `ai-digital-life/crates/agent-runtime/src/plugins/registry.rs`
- Create: `ai-digital-life/crates/agent-runtime/src/plugins/hooks.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Test: inline in modules

- [ ] **Step 1: Define hook events**

Create `ai-digital-life/crates/agent-runtime/src/plugins/hooks.rs`:

```rust
use serde::{Deserialize, Serialize};

/// Events that plugins can hook into.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PluginHook {
    /// Before a tool is executed.
    ToolExecuteBefore {
        tool_name: String,
        args: serde_json::Value,
    },
    /// After a tool is executed.
    ToolExecuteAfter {
        tool_name: String,
        args: serde_json::Value,
        result: serde_json::Value,
    },
    /// Transform the system prompt before sending to LLM.
    ChatSystemTransform {
        system_prompt: String,
    },
    /// Before a message is sent to the LLM.
    ChatMessageBefore {
        messages: Vec<serde_json::Value>,
    },
    /// After a response is received from the LLM.
    ChatResponseAfter {
        response: serde_json::Value,
    },
    /// Before a session is created.
    SessionCreateBefore {
        workspace_id: String,
        title: String,
    },
    /// After a session is created.
    SessionCreateAfter {
        session_id: String,
    },
}

/// Result of a hook execution.
#[derive(Debug, Clone)]
pub enum HookResult {
    /// Continue with original values (no modification).
    Pass,
    /// Modify the input and continue.
    Modify(serde_json::Value),
    /// Abort the operation with an error message.
    Abort(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hook_serializes() {
        let hook = PluginHook::ToolExecuteBefore {
            tool_name: "read".to_string(),
            args: serde_json::json!({"path": "src/main.rs"}),
        };
        let json = serde_json::to_string(&hook).unwrap();
        assert!(json.contains("read"));
        assert!(json.contains("tool_execute_before"));
    }

    #[test]
    fn hook_result_pass() {
        let result = HookResult::Pass;
        assert!(matches!(result, HookResult::Pass));
    }

    #[test]
    fn hook_result_modify() {
        let result = HookResult::Modify(serde_json::json!({"modified": true}));
        assert!(matches!(result, HookResult::Modify(_)));
    }
}
```

- [ ] **Step 2: Define Plugin trait**

Create `ai-digital-life/crates/agent-runtime/src/plugins/mod.rs`:

```rust
pub mod hooks;
pub mod registry;

pub use hooks::{PluginHook, HookResult};
pub use registry::{PluginRegistry, PluginInfo};

use async_trait::async_trait;

/// A plugin that can hook into the agent lifecycle.
/// Plugins are registered at startup and called synchronously.
#[async_trait]
pub trait Plugin: Send + Sync {
    /// Unique name for this plugin.
    fn name(&self) -> &str;

    /// Human-readable description.
    fn description(&self) -> &str;

    /// Hooks this plugin wants to subscribe to.
    fn hooks(&self) -> &[HookType];

    /// Called when a hook event fires.
    /// The plugin can inspect the event and return a HookResult.
    async fn on_hook(&self, hook: &PluginHook) -> HookResult;
}

/// Types of hooks a plugin can subscribe to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookType {
    ToolExecuteBefore,
    ToolExecuteAfter,
    ChatSystemTransform,
    ChatMessageBefore,
    ChatResponseAfter,
    SessionCreateBefore,
    SessionCreateAfter,
}
```

Add `async-trait = "0.1"` to `ai-digital-life/crates/agent-runtime/Cargo.toml` if not present.

- [ ] **Step 3: Create PluginRegistry**

Create `ai-digital-life/crates/agent-runtime/src/plugins/registry.rs`:

```rust
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

#[derive(Debug, Clone, Default)]
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

    /// Fire a hook event to all subscribed, enabled plugins.
    /// Returns the aggregated result (first Abort wins, otherwise last Modify wins).
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
}
```

- [ ] **Step 4: Wire into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod plugins;
```

- [ ] **Step 5: Run tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib plugins`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/plugins/ ai-digital-life/crates/agent-runtime/src/lib.rs ai-digital-life/crates/agent-runtime/Cargo.toml
git commit -m "feat(core): add Plugin system with hooks and registry"
```

---

## Task 4: Implement Reference System

**Files:**
- Create: `ai-digital-life/crates/context/src/references.rs`
- Modify: `ai-digital-life/crates/context/src/lib.rs`
- Modify: `ai-digital-life/crates/kernel/src/types/` (add ReferenceConfig)
- Test: inline in `references.rs`

- [ ] **Step 1: Define ReferenceConfig type**

Create `ai-digital-life/crates/kernel/src/types/reference.rs`:

```rust
use serde::{Deserialize, Serialize};

/// Source type for a reference directory.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReferenceSource {
    /// Local filesystem path.
    Local,
    /// Git repository (cloned to local cache).
    Git,
}

/// Configuration for a reference directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceConfig {
    /// Display name for this reference.
    pub name: String,
    /// Source type.
    pub source: ReferenceSource,
    /// Local path (for Local source) or git URL (for Git source).
    pub path: String,
    /// Branch or tag (for Git source).
    #[serde(default)]
    pub branch: Option<String>,
    /// Whether this reference is enabled.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool { true }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_serializes() {
        let config = ReferenceConfig {
            name: "opencode".to_string(),
            source: ReferenceSource::Local,
            path: "/refs/opencode".to_string(),
            branch: None,
            enabled: true,
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: ReferenceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "opencode");
        assert_eq!(deserialized.source, ReferenceSource::Local);
    }
}
```

Add to `ai-digital-life/crates/kernel/src/types/mod.rs`:

```rust
pub mod reference;
pub use reference::{ReferenceConfig, ReferenceSource};
```

- [ ] **Step 2: Create references.rs in context crate**

Create `ai-digital-life/crates/context/src/references.rs`:

```rust
use adl_kernel::types::reference::{ReferenceConfig, ReferenceSource};
use std::path::Path;

/// Validate that a reference's path exists.
pub fn validate_reference(config: &ReferenceConfig) -> Result<(), adl_errors::AppError> {
    match config.source {
        ReferenceSource::Local => {
            let path = Path::new(&config.path);
            if !path.exists() {
                return Err(adl_errors::AppError::NotFound(format!(
                    "Reference path does not exist: {}", config.path
                )));
            }
            if !path.is_dir() {
                return Err(adl_errors::AppError::InvalidInput(format!(
                    "Reference path is not a directory: {}", config.path
                )));
            }
            Ok(())
        }
        ReferenceSource::Git => {
            // For git references, we'd clone to a cache directory
            // For now, just validate the URL format
            if config.path.is_empty() {
                return Err(adl_errors::AppError::InvalidInput("Git reference URL is empty".to_string()));
            }
            Ok(())
        }
    }
}

/// Build a system prompt fragment that lists available references.
pub fn references_prompt(references: &[ReferenceConfig]) -> String {
    let enabled: Vec<_> = references.iter().filter(|r| r.enabled).collect();
    if enabled.is_empty() {
        return String::new();
    }

    let mut prompt = String::from("\n\n## Available References\n\n");
    prompt.push_str("The following reference directories are available for consultation:\n\n");

    for ref_config in enabled {
        prompt.push_str(&format!(
            "- **{}** ({:?}): `{}`\n",
            ref_config.name, ref_config.source, ref_config.path
        ));
    }

    prompt.push_str("\nYou can read files from these directories to find relevant patterns and examples.\n");
    prompt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_local_reference_existing_dir() {
        let config = ReferenceConfig {
            name: "test".to_string(),
            source: ReferenceSource::Local,
            path: std::env::temp_dir().to_string_lossy().to_string(),
            branch: None,
            enabled: true,
        };
        assert!(validate_reference(&config).is_ok());
    }

    #[test]
    fn validate_local_reference_nonexistent() {
        let config = ReferenceConfig {
            name: "test".to_string(),
            source: ReferenceSource::Local,
            path: "/nonexistent/path/xyz".to_string(),
            branch: None,
            enabled: true,
        };
        assert!(validate_reference(&config).is_err());
    }

    #[test]
    fn references_prompt_empty_when_no_references() {
        let prompt = references_prompt(&[]);
        assert!(prompt.is_empty());
    }

    #[test]
    fn references_prompt_lists_enabled_references() {
        let refs = vec![
            ReferenceConfig {
                name: "opencode".to_string(),
                source: ReferenceSource::Local,
                path: "/refs/opencode".to_string(),
                branch: None,
                enabled: true,
            },
            ReferenceConfig {
                name: "disabled".to_string(),
                source: ReferenceSource::Local,
                path: "/refs/disabled".to_string(),
                branch: None,
                enabled: false,
            },
        ];
        let prompt = references_prompt(&refs);
        assert!(prompt.contains("opencode"));
        assert!(!prompt.contains("disabled"));
    }
}
```

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/context/src/lib.rs`:

```rust
pub mod references;
```

- [ ] **Step 4: Run tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-context --lib references`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/context/src/references.rs ai-digital-life/crates/context/src/lib.rs ai-digital-life/crates/kernel/src/types/reference.rs ai-digital-life/crates/kernel/src/types/mod.rs
git commit -m "feat(core): add Reference system for extra accessible directories"
```

---

## Task 5: Implement Custom Agent Config

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/config.rs` (add custom_agents field)
- Modify: `ai-digital-life/crates/agent-runtime/src/registry.rs` (load from config)
- Test: inline

- [ ] **Step 1: Add custom_agents to AppConfig**

Edit `ai-digital-life/crates/kernel/src/config.rs`, add field:

```rust
#[serde(default)]
pub custom_agents: Vec<AgentConfig>,
```

- [ ] **Step 2: Update AgentRegistry to load custom agents**

Modify `ai-digital-life/crates/agent-runtime/src/registry.rs`:

```rust
impl AgentRegistry {
    pub fn with_custom_agents(custom: &[adl_kernel::types::agent::AgentConfig]) -> Self {
        let mut agents = std::collections::HashMap::new();
        for config in adl_kernel::types::agent::AgentConfig::all_built_in() {
            agents.insert(config.id, config);
        }
        for config in custom {
            agents.insert(config.id, config.clone());
        }
        Self { agents }
    }
}
```

- [ ] **Step 3: Write test**

Add to registry.rs test module:

```rust
#[test]
fn registry_loads_custom_agents() {
    let custom = vec![adl_kernel::types::agent::AgentConfig {
        id: adl_kernel::types::agent::AgentId::Custom,
        name: "my-custom-agent".to_string(),
        description: "My custom agent".to_string(),
        mode: adl_kernel::types::agent::AgentMode::Primary,
        hidden: false,
        allows_write_tools: true,
        prompt_template: "custom".to_string(),
        model_override: Some("gpt-4o".to_string()),
    }];
    let registry = AgentRegistry::with_custom_agents(&custom);
    let agent = registry.get(adl_kernel::types::agent::AgentId::Custom);
    assert!(agent.is_some());
    assert_eq!(agent.unwrap().name, "my-custom-agent");
}
```

- [ ] **Step 4: Run test**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib registry`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/config.rs ai-digital-life/crates/agent-runtime/src/registry.rs
git commit -m "feat(core): add custom agent config support"
```

---

## Task 6: Implement Hot Reloadable Config

**Files:**
- Create: `ai-digital-life/crates/kernel/src/config_watcher.rs`
- Modify: `ai-digital-life/crates/kernel/src/lib.rs`
- Test: inline

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/kernel/src/config_watcher.rs`:

```rust
use crate::config::{load, AppConfig};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::watch;

/// Watches the config file for changes and provides the latest config.
pub struct ConfigWatcher {
    tx: watch::Sender<Arc<AppConfig>>,
    rx: watch::Receiver<Arc<AppConfig>>,
}

impl ConfigWatcher {
    pub fn new(initial: AppConfig) -> Self {
        let (tx, rx) = watch::channel(Arc::new(initial));
        Self { tx, rx }
    }

    /// Start watching the config file for changes.
    /// When the file changes, reload it and notify subscribers.
    pub async fn start_watching(&self, config_path: PathBuf, data_dir: PathBuf) {
        let tx = self.tx.clone();
        tokio::spawn(async move {
            let (notify_tx, mut notify_rx) = tokio::sync::mpsc::channel::<()>(16);

            // Spawn notify watcher in blocking context
            let path_clone = config_path.clone();
            let notify_tx_clone = notify_tx.clone();
            tokio::task::spawn_blocking(move || {
                use notify::{Watcher, RecursiveMode, Event};
                let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();
                let mut watcher = match notify::recommended_watcher(tx) {
                    Ok(w) => w,
                    Err(e) => {
                        tracing::error!("Failed to create file watcher: {}", e);
                        return;
                    }
                };

                if let Err(e) = watcher.watch(&path_clone, RecursiveMode::NonRecursive) {
                    tracing::error!("Failed to watch config file: {}", e);
                    return;
                }

                for event in rx {
                    if let Ok(_e) = event {
                        let _ = notify_tx_clone.blocking_send(());
                    }
                }
            });

            while notify_rx.recv().await.is_some() {
                // Debounce: wait a bit for multiple events
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                notify_rx.recv().await; // Drain any pending

                match load(&data_dir) {
                    Ok(new_config) => {
                        tracing::info!("Config file changed, reloading");
                        let _ = tx.send(Arc::new(new_config));
                    }
                    Err(e) => {
                        tracing::warn!("Failed to reload config: {}", e);
                    }
                }
            }
        });
    }

    /// Get the current config.
    pub fn current(&self) -> Arc<AppConfig> {
        self.rx.borrow().clone()
    }

    /// Subscribe to config changes.
    pub fn subscribe(&self) -> watch::Receiver<Arc<AppConfig>> {
        self.rx.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::config::{LanguageCode, ThemeMode, LogLevel, LogMode};
    use crate::types::permission::PermissionRulesetConfig;

    fn test_config() -> AppConfig {
        AppConfig {
            language: LanguageCode::EnUs,
            theme_mode: ThemeMode::System,
            log_level: LogLevel::Info,
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
            max_recent_workspaces: 10,
            model_preferences: Default::default(),
            commands: vec![],
            permissions: PermissionRulesetConfig::default(),
            custom_agents: vec![],
        }
    }

    #[test]
    fn watcher_returns_initial_config() {
        let watcher = ConfigWatcher::new(test_config());
        let current = watcher.current();
        assert_eq!(current.max_recent_workspaces, 10);
    }

    #[tokio::test]
    async fn watcher_subscribe_receives_initial() {
        let watcher = ConfigWatcher::new(test_config());
        let mut rx = watcher.subscribe();
        assert!(rx.has_changed());
        let config = rx.borrow_and_update().clone();
        assert_eq!(config.max_recent_workspaces, 10);
    }
}
```

Add `notify` dependency to `ai-digital-life/crates/kernel/Cargo.toml` if not already present (check — it may already be there per doc 08).

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib config_watcher`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/kernel/src/lib.rs`:

```rust
pub mod config_watcher;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib config_watcher`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/config_watcher.rs ai-digital-life/crates/kernel/src/lib.rs
git commit -m "feat(core): add ConfigWatcher for hot-reloadable config"
```

---

## Task 7: Implement Durable Session Execution

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/durable.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Test: inline in `durable.rs`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/durable.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// State of a durable session that can survive crashes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DurableSessionState {
    pub session_id: String,
    pub run_id: String,
    pub status: DurableStatus,
    pub checkpoint_message_id: Option<String>,
    pub last_heartbeat: u64,
    pub retry_count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DurableStatus {
    Running,
    Paused,
    Completed,
    Failed,
    Recovering,
}

/// Manages durable session execution with crash recovery.
#[derive(Debug, Clone)]
pub struct DurableSessionManager {
    sessions: Arc<Mutex<HashMap<String, DurableSessionState>>>,
    max_retries: u32,
    heartbeat_timeout_ms: u64,
}

impl DurableSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            max_retries: 3,
            heartbeat_timeout_ms: 30_000, // 30 seconds
        }
    }

    pub async fn register_session(&self, session_id: &str, run_id: &str) {
        let state = DurableSessionState {
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            status: DurableStatus::Running,
            checkpoint_message_id: None,
            last_heartbeat: adl_kernel::now_ms(),
            retry_count: 0,
        };
        self.sessions.lock().await.insert(session_id.to_string(), state);
    }

    pub async fn heartbeat(&self, session_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.last_heartbeat = adl_kernel::now_ms();
        }
    }

    pub async fn checkpoint(&self, session_id: &str, message_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.checkpoint_message_id = Some(message_id.to_string());
        }
    }

    pub async fn complete(&self, session_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.status = DurableStatus::Completed;
        }
    }

    pub async fn fail(&self, session_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.status = DurableStatus::Failed;
        }
    }

    /// Find sessions that have timed out (crashed) and need recovery.
    pub async fn find_crashed_sessions(&self) -> Vec<DurableSessionState> {
        let now = adl_kernel::now_ms();
        let sessions = self.sessions.lock().await;
        sessions
            .values()
            .filter(|s| {
                s.status == DurableStatus::Running
                    && now.saturating_sub(s.last_heartbeat) > self.heartbeat_timeout_ms
                    && s.retry_count < self.max_retries
            })
            .cloned()
            .collect()
    }

    /// Mark a session as recovering and increment retry count.
    pub async fn start_recovery(&self, session_id: &str) -> bool {
        let mut sessions = self.sessions.lock().await;
        if let Some(state) = sessions.get_mut(session_id) {
            if state.retry_count >= self.max_retries {
                state.status = DurableStatus::Failed;
                return false;
            }
            state.status = DurableStatus::Recovering;
            state.retry_count += 1;
            return true;
        }
        false
    }
}

impl Default for DurableSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn register_and_complete_session() {
        let manager = DurableSessionManager::new();
        manager.register_session("sess1", "run1").await;
        manager.complete("sess1").await;
        let sessions = manager.sessions.lock().await;
        let state = sessions.get("sess1").unwrap();
        assert_eq!(state.status, DurableStatus::Completed);
    }

    #[tokio::test]
    async fn heartbeat_updates_timestamp() {
        let manager = DurableSessionManager::new();
        manager.register_session("sess1", "run1").await;
        let before = {
            let sessions = manager.sessions.lock().await;
            sessions.get("sess1").unwrap().last_heartbeat
        };
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        manager.heartbeat("sess1").await;
        let after = {
            let sessions = manager.sessions.lock().await;
            sessions.get("sess1").unwrap().last_heartbeat
        };
        assert!(after > before);
    }

    #[tokio::test]
    async fn find_crashed_sessions() {
        let manager = DurableSessionManager::new();
        // Register a session with an old heartbeat
        manager.register_session("crashed", "run1").await;
        {
            let mut sessions = manager.sessions.lock().await;
            let state = sessions.get_mut("crashed").unwrap();
            state.last_heartbeat = adl_kernel::now_ms().saturating_sub(60_000); // 60s ago
        }
        let crashed = manager.find_crashed_sessions().await;
        assert_eq!(crashed.len(), 1);
        assert_eq!(crashed[0].session_id, "crashed");
    }

    #[tokio::test]
    async fn start_recovery_increments_retry() {
        let manager = DurableSessionManager::new();
        manager.register_session("sess1", "run1").await;
        assert!(manager.start_recovery("sess1").await);
        assert!(manager.start_recovery("sess1").await);
        assert!(manager.start_recovery("sess1").await);
        // 4th retry should fail (max_retries = 3)
        assert!(!manager.start_recovery("sess1").await);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib durable`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod durable;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib durable`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/durable.rs ai-digital-life/crates/agent-runtime/src/lib.rs
git commit -m "feat(core): add DurableSessionManager for crash recovery"
```

---

## Task 8: Create Reserved Interface Stubs (ACP, HTTP API, CodeMode)

**Files:**
- Create: `ai-digital-life/crates/kernel/src/types/reserved.rs`
- Create: `ai-digital-life/src-tauri/src/commands/reserved.rs`
- Modify: `ai-digital-life/crates/kernel/src/types/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/lib.rs`
- Test: inline

- [ ] **Step 1: Define reserved types**

Create `ai-digital-life/crates/kernel/src/types/reserved.rs`:

```rust
use serde::{Deserialize, Serialize};

/// ACP (Agent Client Protocol) configuration — reserved for future.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AcpConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub port: Option<u16>,
}

/// HTTP API server configuration — reserved for future.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HttpApiConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub cors_origins: Vec<String>,
}

/// CodeMode (sandbox JS execution) configuration — reserved, experimental.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CodeModeConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_max_concurrency")]
    pub max_concurrency: u32,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_max_output_bytes")]
    pub max_output_bytes: usize,
}

fn default_max_concurrency() -> u32 { 8 }
fn default_timeout_ms() -> u64 { 30_000 }
fn default_max_output_bytes() -> usize { 1_048_576 } // 1MB

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acp_config_default_disabled() {
        let config = AcpConfig::default();
        assert!(!config.enabled);
    }

    #[test]
    fn http_api_config_default_disabled() {
        let config = HttpApiConfig::default();
        assert!(!config.enabled);
    }

    #[test]
    fn codemode_config_defaults() {
        let config = CodeModeConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.max_concurrency, 8);
        assert_eq!(config.timeout_ms, 30_000);
        assert_eq!(config.max_output_bytes, 1_048_576);
    }
}
```

Add to `ai-digital-life/crates/kernel/src/types/mod.rs`:

```rust
pub mod reserved;
pub use reserved::{AcpConfig, HttpApiConfig, CodeModeConfig};
```

- [ ] **Step 2: Create reserved IPC commands (all return NotImplemented)**

Create `ai-digital-life/src-tauri/src/commands/reserved.rs`:

```rust
use adl_kernel::types::reserved::{AcpConfig, HttpApiConfig, CodeModeConfig};

/// ACP commands — reserved, not implemented.
#[tauri::command]
pub async fn acp_get_status() -> Result<serde_json::Value, adl_errors::AppError> {
    Err(adl_errors::AppError::Internal("ACP is not implemented (reserved for future)".to_string()))
}

#[tauri::command]
pub async fn acp_get_config() -> Result<AcpConfig, adl_errors::AppError> {
    Ok(AcpConfig::default())
}

/// HTTP API commands — reserved, not implemented.
#[tauri::command]
pub async fn http_api_get_status() -> Result<serde_json::Value, adl_errors::AppError> {
    Err(adl_errors::AppError::Internal("HTTP API server is not implemented (reserved for future)".to_string()))
}

#[tauri::command]
pub async fn http_api_get_config() -> Result<HttpApiConfig, adl_errors::AppError> {
    Ok(HttpApiConfig::default())
}

/// CodeMode commands — reserved, experimental.
#[tauri::command]
pub async fn codemode_execute(_code: String) -> Result<serde_json::Value, adl_errors::AppError> {
    Err(adl_errors::AppError::Internal("CodeMode is not implemented (experimental, reserved for future)".to_string()))
}

#[tauri::command]
pub async fn codemode_get_config() -> Result<CodeModeConfig, adl_errors::AppError> {
    Ok(CodeModeConfig::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn acp_get_status_returns_not_implemented() {
        let result = acp_get_status().await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("not implemented"));
    }

    #[tokio::test]
    async fn http_api_get_config_returns_default() {
        let config = http_api_get_config().await.unwrap();
        assert!(!config.enabled);
    }

    #[tokio::test]
    async fn codemode_execute_returns_not_implemented() {
        let result = codemode_execute("1+1".to_string()).await;
        assert!(result.is_err());
    }
}
```

- [ ] **Step 3: Register commands**

In `ai-digital-life/src-tauri/src/commands/mod.rs`, add `pub mod reserved;`.

In `ai-digital-life/src-tauri/src/lib.rs`, add to invoke_handler:

```rust
commands::reserved::acp_get_status,
commands::reserved::acp_get_config,
commands::reserved::http_api_get_status,
commands::reserved::http_api_get_config,
commands::reserved::codemode_execute,
commands::reserved::codemode_get_config,
```

- [ ] **Step 4: Run tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib types::reserved; cargo test -p adl-app --lib commands::reserved`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/types/reserved.rs ai-digital-life/crates/kernel/src/types/mod.rs ai-digital-life/src-tauri/src/commands/reserved.rs ai-digital-life/src-tauri/src/commands/mod.rs ai-digital-life/src-tauri/src/lib.rs
git commit -m "feat(core): add reserved interface stubs for ACP, HTTP API, CodeMode"
```

---

## Task 9: Add IPC Commands for LSP, Session Fork, Plugins, References, Custom Agents, Durable

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/lsp.rs`
- Create: `ai-digital-life/src-tauri/src/commands/session_fork.rs`
- Create: `ai-digital-life/src-tauri/src/commands/plugin.rs`
- Create: `ai-digital-life/src-tauri/src/commands/reference.rs`
- Create: `ai-digital-life/src-tauri/src/commands/custom_agent.rs`
- Create: `ai-digital-life/src-tauri/src/commands/durable.rs`
- Modify: `mod.rs`, `lib.rs`, `Cargo.toml`

- [ ] **Step 1: Create LSP commands**

Create `ai-digital-life/src-tauri/src/commands/lsp.rs`:

```rust
use adl_lsp_client::{LspClient, LanguageServer, client::LspClientState};
use adl_lsp_client::symbols::SymbolInfo;
use adl_lsp_client::diagnostics::DiagnosticInfo;
use std::path::PathBuf;
use std::sync::Arc;

static LSP_CLIENTS: std::sync::LazyLock<Arc<tokio::sync::Mutex<std::collections::HashMap<String, Arc<LspClient>>>>> =
    std::sync::LazyLock::new(|| Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())));

#[tauri::command]
pub async fn lsp_start_server(workspace_id: String, workspace_root: String, server: String) -> Result<(), adl_errors::AppError> {
    let server_enum = match server.as_str() {
        "rust-analyzer" => LanguageServer::RustAnalyzer,
        "typescript-language-server" => LanguageServer::TypeScriptLanguageServer,
        "pylsp" => LanguageServer::Pylsp,
        "gopls" => LanguageServer::Gopls,
        other => LanguageServer::Custom(other.to_string()),
    };

    let client = LspClient::new(PathBuf::from(&workspace_root));
    client.start_server(server_enum).await?;

    let mut clients = LSP_CLIENTS.lock().await;
    clients.insert(workspace_id, Arc::new(client));
    Ok(())
}

#[tauri::command]
pub async fn lsp_stop_server(workspace_id: String, server: String) -> Result<(), adl_errors::AppError> {
    let server_enum = match server.as_str() {
        "rust-analyzer" => LanguageServer::RustAnalyzer,
        "typescript-language-server" => LanguageServer::TypeScriptLanguageServer,
        "pylsp" => LanguageServer::Pylsp,
        "gopls" => LanguageServer::Gopls,
        other => LanguageServer::Custom(other.to_string()),
    };

    let clients = LSP_CLIENTS.lock().await;
    if let Some(client) = clients.get(&workspace_id) {
        client.stop_server(&server_enum).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn lsp_get_symbols(_workspace_id: String, _file_path: String) -> Result<Vec<SymbolInfo>, adl_errors::AppError> {
    // Actual symbol retrieval would query the running LSP server
    Ok(vec![])
}

#[tauri::command]
pub async fn lsp_get_diagnostics(_workspace_id: String, _file_path: Option<String>) -> Result<Vec<DiagnosticInfo>, adl_errors::AppError> {
    // Actual diagnostic retrieval would query the running LSP server
    Ok(vec![])
}

#[tauri::command]
pub async fn lsp_goto_definition(_workspace_id: String, _file_path: String, _line: u32, _column: u32) -> Result<Option<SymbolInfo>, adl_errors::AppError> {
    Ok(None)
}
```

- [ ] **Step 2: Create session_fork commands**

Create `ai-digital-life/src-tauri/src/commands/session_fork.rs`:

```rust
use adl_conversation::fork::{fork_session, ForkInfo};
use adl_kernel::types::conversation::ConversationSessionRecord;

#[tauri::command]
pub async fn fork_session_cmd(
    parent_session: ConversationSessionRecord,
    fork_message_id: String,
    existing_fork_count: u32,
) -> Result<ConversationSessionRecord, adl_errors::AppError> {
    Ok(fork_session(&parent_session, &fork_message_id, existing_fork_count))
}

#[tauri::command]
pub async fn list_session_forks(_workspace_id: String, _parent_session_id: String) -> Result<Vec<ForkInfo>, adl_errors::AppError> {
    // Actual implementation would query the database for child sessions
    Ok(vec![])
}
```

- [ ] **Step 3: Create plugin commands**

Create `ai-digital-life/src-tauri/src/commands/plugin.rs`:

```rust
use adl_agent_runtime::plugins::registry::{PluginRegistry, PluginInfo};
use std::sync::Arc;

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
```

- [ ] **Step 4: Create reference, custom_agent, durable commands**

Create `ai-digital-life/src-tauri/src/commands/reference.rs`:

```rust
use adl_kernel::types::reference::ReferenceConfig;
use adl_context::references::{validate_reference, references_prompt};
use adl_kernel::config::{load, save};

#[tauri::command]
pub async fn list_references(data_dir: String) -> Result<Vec<ReferenceConfig>, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    // References are stored in a separate config section
    Ok(config.references)
}

#[tauri::command]
pub async fn add_reference(data_dir: String, reference: ReferenceConfig) -> Result<Vec<ReferenceConfig>, adl_errors::AppError> {
    validate_reference(&reference)?;
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.references.push(reference);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.references)
}

#[tauri::command]
pub async fn remove_reference(data_dir: String, name: String) -> Result<Vec<ReferenceConfig>, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.references.retain(|r| r.name != name);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.references)
}

#[tauri::command]
pub async fn get_references_prompt(data_dir: String) -> Result<String, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    Ok(references_prompt(&config.references))
}
```

Note: Add `references: Vec<ReferenceConfig>` field to `AppConfig` in `config.rs` (similar to commands/permissions).

Create `ai-digital-life/src-tauri/src/commands/custom_agent.rs`:

```rust
use adl_kernel::types::agent::AgentConfig;
use adl_kernel::config::{load, save};

#[tauri::command]
pub async fn list_custom_agents(data_dir: String) -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    Ok(config.custom_agents)
}

#[tauri::command]
pub async fn add_custom_agent(data_dir: String, agent: AgentConfig) -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.custom_agents.push(agent);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.custom_agents)
}

#[tauri::command]
pub async fn delete_custom_agent(data_dir: String, name: String) -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.custom_agents.retain(|a| a.name != name);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.custom_agents)
}
```

Create `ai-digital-life/src-tauri/src/commands/durable.rs`:

```rust
use adl_agent_runtime::durable::{DurableSessionManager, DurableSessionState};
use std::sync::Arc;

static DURABLE_MANAGER: std::sync::LazyLock<Arc<DurableSessionManager>> =
    std::sync::LazyLock::new(|| Arc::new(DurableSessionManager::new()));

#[tauri::command]
pub async fn register_durable_session(session_id: String, run_id: String) -> Result<(), adl_errors::AppError> {
    DURABLE_MANAGER.register_session(&session_id, &run_id).await;
    Ok(())
}

#[tauri::command]
pub async fn heartbeat_durable_session(session_id: String) -> Result<(), adl_errors::AppError> {
    DURABLE_MANAGER.heartbeat(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn find_crashed_sessions() -> Result<Vec<DurableSessionState>, adl_errors::AppError> {
    Ok(DURABLE_MANAGER.find_crashed_sessions().await)
}

#[tauri::command]
pub async fn recover_session(session_id: String) -> Result<bool, adl_errors::AppError> {
    Ok(DURABLE_MANAGER.start_recovery(&session_id).await)
}
```

- [ ] **Step 5: Register all commands**

In `mod.rs`:

```rust
pub mod lsp;
pub mod session_fork;
pub mod plugin;
pub mod reference;
pub mod custom_agent;
pub mod durable;
```

In `lib.rs`, add all new commands to invoke_handler.

Add to `ai-digital-life/src-tauri/Cargo.toml`:

```toml
adl-lsp-client = { path = "../crates/lsp-client" }
```

- [ ] **Step 6: Verify compilation**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check -p adl-app`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/src-tauri/
git commit -m "feat(ipc): add LSP, session fork, plugin, reference, custom agent, durable commands"
```

---

## Task 10: Add Frontend IPC and UI for P2 Features

**Files:**
- Create: `ai-digital-life/frontend/src/shared/ipc/lsp.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/session_fork.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/plugin.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/reference.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/custom_agent.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/durable.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/reserved.ts`
- Create: `ai-digital-life/frontend/src/app/features/lsp-panel/LspDiagnostics.tsx`
- Create: `ai-digital-life/frontend/src/app/features/lsp-panel/LspSymbols.tsx`
- Create: `ai-digital-life/frontend/src/app/features/session-fork/ForkButton.tsx`
- Modify: `index.ts`, `digital-life.ts`, all three bridges, locale files

- [ ] **Step 1: Create all IPC interface files**

Create each TypeScript interface file matching the Rust commands. Follow the same pattern as previous phases — interface definitions with `IpcResult<T>` wrappers.

- [ ] **Step 2: Wire into DigitalLifeBridge**

Add `lsp`, `sessionFork`, `plugin`, `reference`, `customAgent`, `durable`, `reserved` bridges to `DigitalLifeBridge`.

- [ ] **Step 3: Implement in all three bridges**

Add implementations to tauri-bridge, preview-bridge, mock-bridge.

- [ ] **Step 4: Add i18n keys**

Add keys for: LSP panel (diagnostics, symbols, go to definition), session fork (fork button, fork count), plugin management (enable/disable), reference management (add/remove), custom agent (add/edit/delete), durable sessions (status, recovery).

- [ ] **Step 5: Create LspDiagnostics.tsx**

```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { DiagnosticInfo } from '@ai-digital-life/shared/ipc';

export function LspDiagnostics({ filePath }: { filePath: string }) {
  const t = useTCopy();
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo[]>([]);
  const workspaceId = useAppStore((s) => s.activeCiWorkspaceId);

  useEffect(() => {
    // Fetch diagnostics for the file
    // void fetchDiagnostics(workspaceId, filePath);
  }, [filePath, workspaceId]);

  return (
    <div className="adl-lsp-diagnostics">
      {diagnostics.length === 0 ? (
        <p className="adl-empty-state">{t('lsp.noDiagnostics')}</p>
      ) : (
        diagnostics.map((diag, i) => (
          <div key={i} className={`adl-diagnostic adl-diagnostic-${diag.severity}`}>
            <span className="adl-diagnostic-location">{diag.file_path}:{diag.line}:{diag.column}</span>
            <span className="adl-diagnostic-message">{diag.message}</span>
            {diag.source && <span className="adl-diagnostic-source">{diag.source}</span>}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create LspSymbols.tsx**

Similar pattern — lists symbols in a tree structure with kind icons.

- [ ] **Step 7: Create ForkButton.tsx**

```tsx
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';

export function ForkButton({ messageId }: { messageId: string }) {
  const t = useTCopy();
  const forkSession = useAppStore((s) => s.forkSession);
  const currentSession = useAppStore((s) => s.currentSession);

  const handleFork = async () => {
    if (currentSession) {
      await forkSession(currentSession, messageId);
    }
  };

  return (
    <button type="button" className="adl-fork-button" onClick={handleFork}>
      {t('session.fork')}
    </button>
  );
}
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add ai-digital-life/frontend/
git commit -m "feat(frontend): add P2 feature UI (LSP panel, fork button, plugin/reference/agent management)"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Run Rust tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test --workspace`
Expected: All tests pass

- [ ] **Step 2: Run Rust lints**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo clippy --workspace -- -D warnings`
Expected: No warnings

- [ ] **Step 3: Run frontend checks**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck; pnpm test; pnpm run lint`
Expected: All pass

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint and format fixes from Phase 2-E verification"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Session Fork / branch: Task 1 (fork_session, get_fork_context, ForkInfo)
- ✅ LSP integration: Task 2 (lsp-client crate with client, symbols, diagnostics, server_manager)
- ✅ Plugin system: Task 3 (Plugin trait, HookType, PluginRegistry with enable/disable)
- ✅ ACP (reserved): Task 8 (AcpConfig type + NotImplemented IPC stubs)
- ✅ HTTP API server (reserved): Task 8 (HttpApiConfig type + NotImplemented IPC stubs)
- ✅ CodeMode (experimental/reserved): Task 8 (CodeModeConfig type + NotImplemented IPC stubs)
- ✅ Reference system: Task 4 (ReferenceConfig, validate_reference, references_prompt)
- ✅ Custom Agent config: Task 5 (custom_agents in AppConfig, with_custom_agents in registry)
- ✅ Hot Reloadable Config: Task 6 (ConfigWatcher with notify + watch channel)
- ✅ Durable Session Execution: Task 7 (DurableSessionManager with heartbeat, crash detection, recovery)
- ✅ IPC + Frontend: Tasks 9-10 (all commands + UI components)

**Type consistency:**
- `LanguageServer` enum: Rust and TS use lowercase serde rename
- `SymbolKind` and `DiagnosticSeverity`: snake_case serde in both
- `DurableStatus` variants: running/paused/completed/failed/recovering
- `PluginInfo` fields: name, description, hooks (Vec<String>), enabled
- `ReferenceConfig` fields: name, source, path, branch, enabled — consistent

**Dependencies:**
- `lsp-server` 0.7.x and `lsp-types` 0.97.x added in Task 2
- `notify` already a project dependency (used for file watching)
- `async-trait` already added in Phase 2-B
- No other new external deps

**Reserved features note:** ACP, HTTP API, and CodeMode are interface-only. Their IPC commands return `NotImplemented` errors. Config types exist with `enabled: false` defaults. No third-party dependencies are introduced for these features.
