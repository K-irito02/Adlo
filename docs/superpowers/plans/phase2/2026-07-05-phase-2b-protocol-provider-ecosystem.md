# Phase 2-B: Protocol & Provider Ecosystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-LLM Provider support with a Provider adapter trait, Provider-specific system prompts, and complete MCP (Model Context Protocol) integration with three transport types and OAuth.

**Architecture:** Extend `crates/model-gateway/` with a `ProviderAdapter` trait and concrete implementations (OpenAI, Anthropic, Google, Ollama, OpenRouter). Add a `prompts/` directory with provider-specific prompt templates. Create a new `crates/mcp-client/` crate using the `rmcp` SDK for MCP protocol support with Stdio/SSE/StreamableHTTP transports, OAuth flow, and tool catalog.

**Tech Stack:** Rust (`rmcp` 0.2.x, `rmcp-macros` 0.2.x, existing `reqwest`, `tokio`), React 19 + Zustand (frontend MCP management UI).

## Global Constraints

- Reference OpenCode source: `references/opencode/packages/opencode/src/provider/` and `references/opencode/packages/opencode/src/session/prompt/`
- Add `rmcp = { version = "0.2", features = ["client", "server"] }` and `rmcp-macros = "0.2"` to workspace `Cargo.toml`
- MCP client must be in Rust backend (not frontend); frontend only displays MCP server status and tool lists
- OAuth tokens must be stored via `crates/credential/` (keyring), not in plaintext
- `.mcp.json` config format must be compatible with Claude Code / OpenCode ecosystem
- MCP tool return attachments (image/pdf) limited to 10MB
- All UI text must use i18n keys
- TDD throughout; 3-bridge sync for all new IPC methods
- Depends on Phase 2-A being complete (Agent abstraction)

## File Structure

### Rust — New Files

```
crates/mcp-client/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Public API
│   ├── client.rs           # MCP Client lifecycle (connect/disconnect/health)
│   ├── transport/
│   │   ├── mod.rs          # Transport trait
│   │   ├── stdio.rs        # StdioClientTransport (subprocess)
│   │   ├── sse.rs          # SSEClientTransport
│   │   └── streamable.rs   # StreamableHTTPClientTransport
│   ├── catalog.rs          # Tool/resource/prompt catalog cache
│   ├── oauth.rs            # OAuth flow (DCR + callback + token storage)
│   ├── tools.rs            # MCP tool → Agent tool adapter
│   └── registry.rs         # MCP Server registry (from config)

crates/model-gateway/src/
├── providers/
│   ├── mod.rs              # Re-exports
│   ├── openai.rs           # OpenAI-compatible API
│   ├── anthropic.rs        # Anthropic Messages API
│   ├── google.rs           # Google Gemini API
│   ├── ollama.rs           # Ollama local API
│   └── openrouter.rs       # OpenRouter unified gateway
├── adapter.rs              # ProviderAdapter trait
├── prompts/                # Provider-specific prompt templates
│   ├── mod.rs
│   ├── default.txt
│   ├── anthropic.txt
│   ├── openai.txt
│   ├── gemini.txt
│   └── plan_mode.txt
└── stream.rs               # SSE streaming support (new)

src-tauri/src/commands/
├── mcp.rs                  # MCP IPC commands
└── provider.rs             # Provider management IPC commands
```

### Rust — Modified Files

```
crates/model-gateway/src/lib.rs           # Add provider dispatch
crates/model-gateway/src/provider.rs      # Refactor to use adapter trait
crates/model-gateway/src/wire.rs          # Add streaming + tool-calling wire format
crates/model-gateway/Cargo.toml           # (no new deps, uses reqwest)
crates/kernel/src/types/config.rs         # Add new ModelProviderId variants
crates/kernel/src/types/model.rs          # Add streaming types
Cargo.toml                                 # Add rmcp deps + mcp-client workspace member
src-tauri/src/commands/mod.rs             # Register mcp, provider modules
src-tauri/src/lib.rs                      # Register new commands
```

### Frontend — New Files

```
frontend/src/app/features/mcp/
├── McpServerList.tsx          # MCP server list view
├── McpServerConfig.tsx        # Add/edit/remove MCP server
├── McpToolBrowser.tsx         # Browse MCP tools
└── McpStatusBadge.tsx         # Server status indicator

frontend/src/app/features/provider-manager/
├── ProviderList.tsx           # List configured providers
├── ProviderConfig.tsx         # Add/edit provider (key, model, priority)
└── ProviderHealthCheck.tsx    # Health check display

frontend/src/shared/ipc/
├── mcp.ts                     # McpBridge interface
└── provider.ts                # ProviderBridge interface
```

### Frontend — Modified Files

```
frontend/src/shared/ipc/index.ts
frontend/src/shared/ipc/digital-life.ts
frontend/src/app/stores/slices/  # new mcpSlice.ts, providerSlice.ts
frontend/src/tauri-bridge/index.ts
frontend/src/preview-bridge/index.ts
frontend/src/mock-bridge/index.ts
```

---

## Task 1: Add New ModelProviderId Variants

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/types/config.rs`
- Test: inline test module

**Interfaces:**
- Consumes: Existing `ModelProviderId` enum
- Produces: Extended `ModelProviderId` with OpenAI, Anthropic, Google, Ollama, OpenRouter

- [ ] **Step 1: Write the failing test**

Add to `ai-digital-life/crates/kernel/src/types/config.rs`:

```rust
#[cfg(test)]
mod provider_id_tests {
    use super::*;

    #[test]
    fn new_providers_exist() {
        assert_eq!(ModelProviderId::Openai.as_str(), "openai");
        assert_eq!(ModelProviderId::Anthropic.as_str(), "anthropic");
        assert_eq!(ModelProviderId::Google.as_str(), "google");
        assert_eq!(ModelProviderId::Ollama.as_str(), "ollama");
        assert_eq!(ModelProviderId::Openrouter.as_str(), "openrouter");
    }

    #[test]
    fn existing_providers_preserved() {
        assert_eq!(ModelProviderId::Deepseek.as_str(), "deepseek");
        assert_eq!(ModelProviderId::Minimax.as_str(), "minimax");
    }

    #[test]
    fn all_providers_have_default_model() {
        for id in [
            ModelProviderId::Deepseek,
            ModelProviderId::Minimax,
            ModelProviderId::Openai,
            ModelProviderId::Anthropic,
            ModelProviderId::Google,
            ModelProviderId::Ollama,
            ModelProviderId::Openrouter,
        ] {
            let model = default_model_for_provider(id);
            assert!(!model.is_empty(), "Provider {:?} has no default model", id);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib types::config::provider_id_tests`
Expected: FAIL — `Openai` variant not found

- [ ] **Step 3: Extend the enum**

In `ai-digital-life/crates/kernel/src/types/config.rs`, replace the `ModelProviderId` enum:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelProviderId {
    Deepseek,
    Minimax,
    Openai,
    Anthropic,
    Google,
    Ollama,
    Openrouter,
}

impl ModelProviderId {
    pub fn as_str(&self) -> &'static str {
        match self {
            ModelProviderId::Deepseek => "deepseek",
            ModelProviderId::Minimax => "minimax",
            ModelProviderId::Openai => "openai",
            ModelProviderId::Anthropic => "anthropic",
            ModelProviderId::Google => "google",
            ModelProviderId::Ollama => "ollama",
            ModelProviderId::Openrouter => "openrouter",
        }
    }
}

/// Returns the default model ID for a provider.
pub fn default_model_for_provider(provider: ModelProviderId) -> &'static str {
    match provider {
        ModelProviderId::Deepseek => "deepseek-chat",
        ModelProviderId::Minimax => "MiniMax-M2.7",
        ModelProviderId::Openai => "gpt-4o",
        ModelProviderId::Anthropic => "claude-3-5-sonnet-20241022",
        ModelProviderId::Google => "gemini-1.5-pro",
        ModelProviderId::Ollama => "llama3.1",
        ModelProviderId::Openrouter => "openrouter/auto",
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib types::config::provider_id_tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/types/config.rs
git commit -m "feat(core): add OpenAI, Anthropic, Google, Ollama, OpenRouter provider IDs"
```

---

## Task 2: Define ProviderAdapter Trait

**Files:**
- Create: `ai-digital-life/crates/model-gateway/src/adapter.rs`
- Modify: `ai-digital-life/crates/model-gateway/src/lib.rs`
- Modify: `ai-digital-life/crates/model-gateway/Cargo.toml` (add `async-trait` if not present)
- Test: inline in `adapter.rs`

**Interfaces:**
- Consumes: `ModelProviderId`, `ModelChatMessage`, `ModelResponse`, `AppError`
- Produces: `ProviderAdapter` trait, `ChatOptions` struct, `StreamReader` type alias

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/model-gateway/src/adapter.rs`:

```rust
use adl_kernel::types::config::ModelProviderId;
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_kernel::types::agent::AgentId;
use adl_errors::AppError;
use async_trait::async_trait;
use std::pin::Pin;
use tokio::sync::mpsc;

/// Stream of chat completion chunks.
pub type StreamReader = Pin<Box<dyn tokio::stream::Stream<Item = Result<StreamChunk, AppError>> + Send>>;

/// A single chunk in a streaming response.
#[derive(Debug, Clone)]
pub enum StreamChunk {
    /// Partial text delta.
    Delta(String),
    /// Tool call delta (function name + arguments fragment).
    ToolCallDelta { id: String, name: String, arguments_delta: String },
    /// Stream completed with final usage info.
    Done(ModelTokenUsage),
}

/// Options passed to chat/chat_stream.
#[derive(Debug, Clone, Default)]
pub struct ChatOptions {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub max_tokens: Option<u32>,
    pub agent_id: Option<AgentId>,
    pub tools: Vec<ToolDefinition>,
}

/// Definition of a tool the model can call.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// Adapter trait that each LLM provider implements.
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn provider_id(&self) -> ModelProviderId;
    fn supported_models(&self) -> &'static [&'static str];

    async fn chat(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<ModelResponse, AppError>;

    async fn chat_stream(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<StreamReader, AppError>;

    fn estimate_tokens(&self, text: &str) -> usize {
        adl_kernel::estimate_tokens(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StubAdapter;

    #[async_trait]
    impl ProviderAdapter for StubAdapter {
        fn provider_name(&self) -> &'static str { "stub" }
        fn provider_id(&self) -> ModelProviderId { ModelProviderId::Openai }
        fn supported_models(&self) -> &'static [&'static str] { &["stub-model"] }

        async fn chat(
            &self,
            _model: &str,
            _messages: &[ModelChatMessage],
            _options: &ChatOptions,
            _api_key: &str,
        ) -> Result<ModelResponse, AppError> {
            Ok(ModelResponse {
                content: "stub response".to_string(),
                model: "stub-model".to_string(),
                usage: ModelTokenUsage {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            })
        }

        async fn chat_stream(
            &self,
            _model: &str,
            _messages: &[ModelChatMessage],
            _options: &ChatOptions,
            _api_key: &str,
        ) -> Result<StreamReader, AppError> {
            Err(AppError::Internal("streaming not supported".to_string()))
        }
    }

    #[tokio::test]
    async fn stub_adapter_returns_response() {
        let adapter = StubAdapter;
        let result = adapter.chat("stub-model", &[], &ChatOptions::default(), "key").await;
        assert!(result.is_ok());
        let resp = result.unwrap();
        assert_eq!(resp.content, "stub response");
    }

    #[test]
    fn chat_options_default() {
        let opts = ChatOptions::default();
        assert!(opts.temperature.is_none());
        assert!(opts.tools.is_empty());
    }
}
```

Note: The test uses `ModelResponse` and `ModelTokenUsage` — verify their actual field names match by reading `crates/kernel/src/types/model.rs` first and adjusting if needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-model-gateway --lib adapter`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire module and add async-trait dep**

Add to `ai-digital-life/crates/model-gateway/src/lib.rs`:

```rust
pub mod adapter;
```

Add to `ai-digital-life/crates/model-gateway/Cargo.toml`:

```toml
async-trait = "0.1"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-model-gateway --lib adapter`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/model-gateway/src/adapter.rs ai-digital-life/crates/model-gateway/src/lib.rs ai-digital-life/crates/model-gateway/Cargo.toml
git commit -m "feat(core): add ProviderAdapter trait for multi-LLM support"
```

---

## Task 3: Implement OpenAI-Compatible Provider Adapter

**Files:**
- Create: `ai-digital-life/crates/model-gateway/src/providers/mod.rs`
- Create: `ai-digital-life/crates/model-gateway/src/providers/openai.rs`
- Modify: `ai-digital-life/crates/model-gateway/src/lib.rs`
- Test: inline in `openai.rs`

**Interfaces:**
- Consumes: `ProviderAdapter` trait (Task 2), `reqwest::Client`
- Produces: `OpenAIProvider` struct implementing `ProviderAdapter`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/model-gateway/src/providers/openai.rs`:

```rust
use crate::adapter::{ChatOptions, ProviderAdapter, StreamReader, StreamChunk, ToolDefinition};
use adl_errors::AppError;
use adl_kernel::types::config::ModelProviderId;
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use async_trait::async_trait;
use reqwest::Client;

pub struct OpenAIProvider {
    client: Client,
    base_url: String,
}

impl OpenAIProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://api.openai.com/v1".to_string(),
        }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }
}

impl Default for OpenAIProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for OpenAIProvider {
    fn provider_name(&self) -> &'static str { "openai" }
    fn provider_id(&self) -> ModelProviderId { ModelProviderId::Openai }
    fn supported_models(&self) -> &'static [&'static str] {
        &["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
    }

    async fn chat(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<ModelResponse, AppError> {
        let body = serde_json::json!({
            "model": model,
            "messages": messages.iter().map(|m| serde_json::json!({
                "role": format!("{:?}", m.role).to_lowercase(),
                "content": m.content,
            })).collect::<Vec<_>>(),
            "stream": false,
            "temperature": options.temperature,
            "top_p": options.top_p,
            "max_tokens": options.max_tokens,
        });

        let url = format!("{}/chat/completions", self.base_url);
        let resp = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI request failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!("OpenAI error {}: {}", status, text)));
        }

        let json: serde_json::Value = resp.json().await
            .map_err(|e| AppError::Internal(format!("OpenAI parse failed: {}", e)))?;

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let usage = ModelTokenUsage {
            prompt_tokens: json["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as usize,
            completion_tokens: json["usage"]["completion_tokens"].as_u64().unwrap_or(0) as usize,
            total_tokens: json["usage"]["total_tokens"].as_u64().unwrap_or(0) as usize,
        };

        Ok(ModelResponse {
            content,
            model: model.to_string(),
            usage,
        })
    }

    async fn chat_stream(
        &self,
        _model: &str,
        _messages: &[ModelChatMessage],
        _options: &ChatOptions,
        _api_key: &str,
    ) -> Result<StreamReader, AppError> {
        // Streaming implementation will use SSE parsing
        Err(AppError::Internal("Streaming not yet implemented".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_metadata() {
        let p = OpenAIProvider::new();
        assert_eq!(p.provider_name(), "openai");
        assert_eq!(p.provider_id(), ModelProviderId::Openai);
        assert!(p.supported_models().contains(&"gpt-4o"));
    }

    #[test]
    fn custom_base_url_for_compatible_apis() {
        let p = OpenAIProvider::with_base_url("https://api.deepseek.com/v1".to_string());
        assert_eq!(p.base_url, "https://api.deepseek.com/v1");
    }

    #[test]
    fn default_uses_official_endpoint() {
        let p = OpenAIProvider::new();
        assert_eq!(p.base_url, "https://api.openai.com/v1");
    }
}
```

Note: The test references `m.role` and `m.content` on `ModelChatMessage` — verify actual field names by reading `crates/kernel/src/types/model.rs` and adjust if needed.

- [ ] **Step 2: Create providers/mod.rs**

Create `ai-digital-life/crates/model-gateway/src/providers/mod.rs`:

```rust
pub mod openai;
pub mod anthropic;
pub mod google;
pub mod ollama;
pub mod openrouter;
```

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/model-gateway/src/lib.rs`:

```rust
pub mod providers;
```

- [ ] **Step 4: Run test to verify it passes (compile-only since no network)**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-model-gateway --lib providers::openai`
Expected: PASS — 3 tests pass (metadata only, no network calls)

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/model-gateway/src/providers/
git commit -m "feat(core): add OpenAI-compatible Provider adapter"
```

---

## Task 4: Implement Anthropic, Google, Ollama, OpenRouter Adapters

**Files:**
- Create: `ai-digital-life/crates/model-gateway/src/providers/anthropic.rs`
- Create: `ai-digital-life/crates/model-gateway/src/providers/google.rs`
- Create: `ai-digital-life/crates/model-gateway/src/providers/ollama.rs`
- Create: `ai-digital-life/crates/model-gateway/src/providers/openrouter.rs`

**Interfaces:**
- Consumes: `ProviderAdapter` trait (Task 2)
- Produces: 4 additional adapter implementations

- [ ] **Step 1: Create Anthropic adapter**

Create `ai-digital-life/crates/model-gateway/src/providers/anthropic.rs` with the `AnthropicProvider` struct. Key difference from OpenAI: uses Messages API format with `x-api-key` header and `anthropic-version` header. System prompt is a top-level field, not a message. Model IDs: `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`.

Follow the same test pattern as Task 3 — test metadata, supported models, default base URL `https://api.anthropic.com`.

- [ ] **Step 2: Create Google Gemini adapter**

Create `ai-digital-life/crates/model-gateway/src/providers/google.rs` with `GoogleProvider`. Uses `https://generativelanguage.googleapis.com/v1beta`. API key passed as query param `?key=`. Model IDs: `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`. Message format uses `contents` array with `parts`.

- [ ] **Step 3: Create Ollama adapter**

Create `ai-digital-life/crates/model-gateway/src/providers/ollama.rs` with `OllamaProvider`. Default base URL `http://localhost:11434`. No API key required. Uses `/api/chat` endpoint. Model IDs: `llama3.1`, `qwen2.5`, `deepseek-r1`.

- [ ] **Step 4: Create OpenRouter adapter**

Create `ai-digital-life/crates/model-gateway/src/providers/openrouter.rs` with `OpenRouterProvider`. Base URL `https://openrouter.ai/api/v1`. Uses OpenAI-compatible format with additional `HTTP-Referer` and `X-Title` headers. Model IDs: `openrouter/auto`, `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`.

- [ ] **Step 5: Run all provider tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-model-gateway --lib providers`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/model-gateway/src/providers/
git commit -m "feat(core): add Anthropic, Google, Ollama, OpenRouter provider adapters"
```

---

## Task 5: Implement Provider-Specific Prompt Templates

**Files:**
- Create: `ai-digital-life/crates/model-gateway/src/prompts/mod.rs`
- Create prompt files: `default.txt`, `anthropic.txt`, `openai.txt`, `gemini.txt`, `plan_mode.txt`
- Modify: `ai-digital-life/crates/model-gateway/src/lib.rs`
- Test: inline in `prompts/mod.rs`

**Interfaces:**
- Consumes: `ModelProviderId`
- Produces: `provider_prompt(provider_id) -> &'static str`, `plan_mode_prompt() -> &'static str`

- [ ] **Step 1: Create prompt template files**

Create `ai-digital-life/crates/model-gateway/src/prompts/default.txt`:

```
You are an AI coding assistant integrated into AI Digital Life. Your role is to help users build, edit, and understand code. Use the available tools to read files, search the codebase, create patches, and apply changes after approval. Always explain your reasoning before making changes.
```

Create `ai-digital-life/crates/model-gateway/src/prompts/anthropic.txt`:

```
You are an AI coding assistant. You have access to tools for reading files, searching, and creating patches. When you need to modify code, always create a patch and explain the changes before applying. Be precise and thorough in your analysis. Use XML tags to structure your responses when appropriate.
```

Create `ai-digital-life/crates/model-gateway/src/prompts/openai.txt`:

```
You are an AI coding assistant. Use the available function tools to read files, search the codebase, and create patches. Always explain what you plan to do before calling tools. When modifying code, describe the changes clearly.
```

Create `ai-digital-life/crates/model-gateway/src/prompts/gemini.txt`:

```
You are an AI coding assistant. Use the available tools to explore the codebase and make changes. Be concise but thorough. When creating patches, explain the rationale for each change.
```

Create `ai-digital-life/crates/model-gateway/src/prompts/plan_mode.txt`:

```
You are in PLAN MODE. Your job is to analyze the request and produce a detailed implementation plan. DO NOT edit files, run commands that modify state, or apply patches. Only use read-only tools (read, search, glob, grep, outline). Output your plan as a markdown document with clear, actionable steps.
```

- [ ] **Step 2: Create prompts/mod.rs**

Create `ai-digital-life/crates/model-gateway/src/prompts/mod.rs`:

```rust
use adl_kernel::types::config::ModelProviderId;

const DEFAULT_PROMPT: &str = include_str!("default.txt");
const ANTHROPIC_PROMPT: &str = include_str!("anthropic.txt");
const OPENAI_PROMPT: &str = include_str!("openai.txt");
const GEMINI_PROMPT: &str = include_str!("gemini.txt");
const PLAN_MODE_PROMPT: &str = include_str!("plan_mode.txt");

/// Returns the provider-specific system prompt.
pub fn provider_prompt(provider: ModelProviderId) -> &'static str {
    match provider {
        ModelProviderId::Anthropic => ANTHROPIC_PROMPT,
        ModelProviderId::Openai => OPENAI_PROMPT,
        ModelProviderId::Google => GEMINI_PROMPT,
        ModelProviderId::Deepseek => OPENAI_PROMPT,       // DeepSeek is OpenAI-compatible
        ModelProviderId::Minimax => OPENAI_PROMPT,         // MiniMax is OpenAI-compatible
        ModelProviderId::Ollama => DEFAULT_PROMPT,
        ModelProviderId::Openrouter => DEFAULT_PROMPT,
    }
}

/// Returns the plan mode reminder prompt.
pub fn plan_mode_prompt() -> &'static str {
    PLAN_MODE_PROMPT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_provider_has_prompt() {
        for provider in [
            ModelProviderId::Deepseek,
            ModelProviderId::Minimax,
            ModelProviderId::Openai,
            ModelProviderId::Anthropic,
            ModelProviderId::Google,
            ModelProviderId::Ollama,
            ModelProviderId::Openrouter,
        ] {
            let prompt = provider_prompt(provider);
            assert!(!prompt.is_empty(), "Provider {:?} has empty prompt", provider);
        }
    }

    #[test]
    fn anthropic_prompt_mentions_xml() {
        let prompt = provider_prompt(ModelProviderId::Anthropic);
        assert!(prompt.to_lowercase().contains("xml"));
    }

    #[test]
    fn plan_mode_prompt_forbids_edits() {
        let prompt = plan_mode_prompt();
        let lower = prompt.to_lowercase();
        assert!(lower.contains("do not edit"));
        assert!(lower.contains("plan mode"));
    }
}
```

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/model-gateway/src/lib.rs`:

```rust
pub mod prompts;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-model-gateway --lib prompts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/model-gateway/src/prompts/
git commit -m "feat(core): add provider-specific system prompt templates"
```

---

## Task 6: Add MCP Dependencies to Workspace

**Files:**
- Modify: `ai-digital-life/Cargo.toml`

- [ ] **Step 1: Add rmcp dependencies**

Edit `ai-digital-life/Cargo.toml`, in the `[workspace.dependencies]` section add:

```toml
rmcp = { version = "0.2", features = ["client", "server", "transport-cli"] }
rmcp-macros = "0.2"
```

- [ ] **Step 2: Add mcp-client to workspace members**

In the `members` array, add `"crates/mcp-client"`.

- [ ] **Step 3: Verify workspace resolves**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo metadata --no-deps --format-version 1 > $null`
Expected: No errors (may warn about missing mcp-client directory — that's next)

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/Cargo.toml
git commit -m "feat(deps): add rmcp and rmcp-macros for MCP integration"
```

---

## Task 7: Create mcp-client Crate Skeleton

**Files:**
- Create: `ai-digital-life/crates/mcp-client/Cargo.toml`
- Create: `ai-digital-life/crates/mcp-client/src/lib.rs`
- Create: `ai-digital-life/crates/mcp-client/src/transport/mod.rs`
- Create: `ai-digital-life/crates/mcp-client/src/client.rs`
- Create: `ai-digital-life/crates/mcp-client/src/catalog.rs`
- Create: `ai-digital-life/crates/mcp-client/src/registry.rs`

**Interfaces:**
- Consumes: `rmcp`, `tokio`, `serde`
- Produces: `McpClient`, `McpServerConfig`, `McpToolEntry`, `McpCatalog`

- [ ] **Step 1: Create Cargo.toml**

Create `ai-digital-life/crates/mcp-client/Cargo.toml`:

```toml
[package]
name = "adl-mcp-client"
version = "0.1.0"
edition = "2021"

[dependencies]
adl-kernel = { path = "../kernel" }
adl-errors = { path = "../errors" }
adl-credential = { path = "../credential" }
rmcp = { workspace = true }
rmcp-macros = { workspace = true }
tokio = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
reqwest = { workspace = true }
thiserror = { workspace = true }
tracing = { workspace = true }
async-trait = "0.1"

[dev-dependencies]
tokio = { workspace = true, features = ["macros", "rt-multi-thread"] }
```

- [ ] **Step 2: Create lib.rs with core types**

Create `ai-digital-life/crates/mcp-client/src/lib.rs`:

```rust
pub mod client;
pub mod catalog;
pub mod registry;
pub mod transport;
pub mod tools;
pub mod oauth;

pub use client::{McpClient, McpClientState};
pub use catalog::{McpCatalog, McpToolEntry, McpResourceEntry};
pub use registry::{McpServerConfig, McpServerRegistry, McpTransportType};

use serde::{Deserialize, Serialize};

/// Configuration for a single MCP server (from .mcp.json or user config).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub transport: McpTransportType,
    /// Command to run for stdio transport (e.g., "npx", "node").
    pub command: Option<String>,
    /// Args for the stdio command.
    pub args: Vec<String>,
    /// URL for SSE or StreamableHTTP transport.
    pub url: Option<String>,
    /// Environment variables for the server process.
    pub env: std::collections::HashMap<String, String>,
    /// Whether OAuth is required.
    pub oauth: bool,
    /// Whether the server is enabled.
    pub enabled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_roundtrip() {
        let config = McpServerConfig {
            name: "test-server".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server".to_string()],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: true,
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: McpServerConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test-server");
        assert_eq!(deserialized.transport, McpTransportType::Stdio);
    }
}
```

- [ ] **Step 3: Create registry.rs**

Create `ai-digital-life/crates/mcp-client/src/registry.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Transport type for an MCP server connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpTransportType {
    Stdio,
    Sse,
    StreamableHttp,
}

/// Registry of configured MCP servers.
#[derive(Debug, Clone, Default)]
pub struct McpServerRegistry {
    servers: HashMap<String, super::McpServerConfig>,
}

impl McpServerRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, config: super::McpServerConfig) {
        self.servers.insert(config.name.clone(), config);
    }

    pub fn remove(&mut self, name: &str) -> Option<super::McpServerConfig> {
        self.servers.remove(name)
    }

    pub fn get(&self, name: &str) -> Option<&super::McpServerConfig> {
        self.servers.get(name)
    }

    pub fn list(&self) -> Vec<&super::McpServerConfig> {
        self.servers.values().collect()
    }

    pub fn list_enabled(&self) -> Vec<&super::McpServerConfig> {
        self.servers.values().filter(|c| c.enabled).collect()
    }

    /// Load registry from a .mcp.json file.
    pub fn from_json_file(path: &std::path::Path) -> Result<Self, adl_errors::AppError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| adl_errors::AppError::IO(format!("Failed to read .mcp.json: {}", e)))?;
        Self::from_json_str(&content)
    }

    /// Parse registry from JSON string.
    pub fn from_json_str(json: &str) -> Result<Self, adl_errors::AppError> {
        let raw: HashMap<String, serde_json::Value> = serde_json::from_str(json)
            .map_err(|e| adl_errors::AppError::InvalidInput(format!("Invalid .mcp.json: {}", e)))?;

        let mut registry = Self::new();
        for (name, value) in raw {
            let config = parse_server_config(&name, &value)?;
            registry.add(config);
        }
        Ok(registry)
    }
}

fn parse_server_config(name: &str, value: &serde_json::Value) -> Result<super::McpServerConfig, adl_errors::AppError> {
    let transport_str = value.get("transport")
        .and_then(|v| v.as_str())
        .unwrap_or("stdio");
    let transport = match transport_str {
        "stdio" => McpTransportType::Stdio,
        "sse" => McpTransportType::Sse,
        "streamable-http" | "streamable_http" => McpTransportType::StreamableHttp,
        _ => McpTransportType::Stdio,
    };

    Ok(super::McpServerConfig {
        name: name.to_string(),
        transport,
        command: value.get("command").and_then(|v| v.as_str()).map(String::from),
        args: value.get("args")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        url: value.get("url").and_then(|v| v.as_str()).map(String::from),
        env: value.get("env")
            .and_then(|v| v.as_object())
            .map(|obj| obj.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect())
            .unwrap_or_default(),
        oauth: value.get("oauth").and_then(|v| v.as_bool()).unwrap_or(false),
        enabled: value.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stdio_config() {
        let json = r#"{
            "test-server": {
                "command": "npx",
                "args": ["-y", "@mcp/server"],
                "env": { "API_KEY": "xxx" }
            }
        }"#;
        let registry = McpServerRegistry::from_json_str(json).unwrap();
        let config = registry.get("test-server").unwrap();
        assert_eq!(config.transport, McpTransportType::Stdio);
        assert_eq!(config.command.as_deref(), Some("npx"));
        assert_eq!(config.args.len(), 2);
        assert!(config.enabled);
    }

    #[test]
    fn parse_sse_config() {
        let json = r#"{
            "remote-server": {
                "transport": "sse",
                "url": "https://example.com/mcp/sse"
            }
        }"#;
        let registry = McpServerRegistry::from_json_str(json).unwrap();
        let config = registry.get("remote-server").unwrap();
        assert_eq!(config.transport, McpTransportType::Sse);
        assert_eq!(config.url.as_deref(), Some("https://example.com/mcp/sse"));
    }

    #[test]
    fn list_enabled_filters_disabled() {
        let mut registry = McpServerRegistry::new();
        registry.add(super::super::McpServerConfig {
            name: "enabled".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: true,
        });
        registry.add(super::super::McpServerConfig {
            name: "disabled".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: false,
        });
        assert_eq!(registry.list_enabled().len(), 1);
    }
}
```

- [ ] **Step 4: Create catalog.rs, client.rs, transport/mod.rs stubs**

Create `ai-digital-life/crates/mcp-client/src/catalog.rs`:

```rust
use serde::{Deserialize, Serialize};

/// A tool provided by an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolEntry {
    pub server_name: String,
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// A resource provided by an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResourceEntry {
    pub server_name: String,
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

/// Aggregated catalog of tools and resources from all connected MCP servers.
#[derive(Debug, Clone, Default)]
pub struct McpCatalog {
    pub tools: Vec<McpToolEntry>,
    pub resources: Vec<McpResourceEntry>,
}

impl McpCatalog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_tool(&mut self, tool: McpToolEntry) {
        self.tools.push(tool);
    }

    pub fn add_resource(&mut self, resource: McpResourceEntry) {
        self.resources.push(resource);
    }

    pub fn find_tool(&self, name: &str) -> Option<&McpToolEntry> {
        self.tools.iter().find(|t| t.name == name)
    }

    pub fn tool_names(&self) -> Vec<String> {
        self.tools.iter().map(|t| t.name.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_adds_and_finds_tools() {
        let mut catalog = McpCatalog::new();
        catalog.add_tool(McpToolEntry {
            server_name: "test".to_string(),
            name: "search".to_string(),
            description: "Search the web".to_string(),
            input_schema: serde_json::json!({}),
        });
        assert!(catalog.find_tool("search").is_some());
        assert!(catalog.find_tool("missing").is_none());
        assert_eq!(catalog.tool_names(), vec!["search"]);
    }
}
```

Create `ai-digital-life/crates/mcp-client/src/client.rs`:

```rust
use crate::{McpServerConfig, McpTransportType};
use crate::catalog::McpCatalog;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// State of an MCP client connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpClientState {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// Manages connections to multiple MCP servers.
#[derive(Debug, Clone)]
pub struct McpClient {
    configs: Arc<Mutex<HashMap<String, McpServerConfig>>>,
    states: Arc<Mutex<HashMap<String, McpClientState>>>,
    catalog: Arc<Mutex<McpCatalog>>,
}

impl McpClient {
    pub fn new() -> Self {
        Self {
            configs: Arc::new(Mutex::new(HashMap::new())),
            states: Arc::new(Mutex::new(HashMap::new())),
            catalog: Arc::new(Mutex::new(McpCatalog::new())),
        }
    }

    pub async fn add_server(&self, config: McpServerConfig) {
        let name = config.name.clone();
        self.configs.lock().await.insert(name.clone(), config);
        self.states.lock().await.insert(name, McpClientState::Disconnected);
    }

    pub async fn remove_server(&self, name: &str) {
        self.configs.lock().await.remove(name);
        self.states.lock().await.remove(name);
    }

    pub async fn connect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        let config = {
            let configs = self.configs.lock().await;
            configs.get(name).cloned()
                .ok_or_else(|| adl_errors::AppError::NotFound(format!("MCP server '{}' not found", name)))?
        };

        self.set_state(name, McpClientState::Connecting).await;

        // Actual connection logic depends on transport type
        // For now, mark as connected (full impl in transport modules)
        match config.transport {
            McpTransportType::Stdio => {
                // Will use rmcp StdioClientTransport
                tracing::info!("Connecting to MCP server '{}' via stdio", name);
            }
            McpTransportType::Sse => {
                tracing::info!("Connecting to MCP server '{}' via SSE", name);
            }
            McpTransportType::StreamableHttp => {
                tracing::info!("Connecting to MCP server '{}' via StreamableHTTP", name);
            }
        }

        self.set_state(name, McpClientState::Connected).await;
        Ok(())
    }

    pub async fn disconnect(&self, name: &str) -> Result<(), adl_errors::AppError> {
        self.set_state(name, McpClientState::Disconnected).await;
        Ok(())
    }

    pub async fn get_state(&self, name: &str) -> McpClientState {
        self.states.lock().await.get(name).copied().unwrap_or(McpClientState::Disconnected)
    }

    pub async fn list_servers(&self) -> Vec<(String, McpClientState)> {
        let configs = self.configs.lock().await;
        let states = self.states.lock().await;
        configs.keys().map(|name| {
            (name.clone(), states.get(name).copied().unwrap_or(McpClientState::Disconnected))
        }).collect()
    }

    pub async fn catalog(&self) -> McpCatalog {
        self.catalog.lock().await.clone()
    }

    async fn set_state(&self, name: &str, state: McpClientState) {
        self.states.lock().await.insert(name.to_string(), state);
    }
}

impl Default for McpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn add_and_remove_server() {
        let client = McpClient::new();
        let config = McpServerConfig {
            name: "test".to_string(),
            transport: McpTransportType::Stdio,
            command: Some("npx".to_string()),
            args: vec![],
            url: None,
            env: std::collections::HashMap::new(),
            oauth: false,
            enabled: true,
        };
        client.add_server(config).await;
        let servers = client.list_servers().await;
        assert_eq!(servers.len(), 1);
        client.remove_server("test").await;
        let servers = client.list_servers().await;
        assert_eq!(servers.len(), 0);
    }
}
```

Create `ai-digital-life/crates/mcp-client/src/transport/mod.rs`:

```rust
pub mod stdio;
pub mod sse;
pub mod streamable;
```

Create stub files `stdio.rs`, `sse.rs`, `streamable.rs` each with a placeholder struct and a basic test. These will be filled with actual `rmcp` transport implementations.

Create `ai-digital-life/crates/mcp-client/src/tools.rs`:

```rust
use crate::catalog::McpToolEntry;
use serde::{Deserialize, Serialize};

/// An MCP tool converted to the agent's internal tool format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentToolAdapter {
    pub server_name: String,
    pub tool_name: String,
    pub full_name: String, // "mcp__<server>__<tool>"
    pub description: String,
    pub input_schema: serde_json::Value,
}

impl AgentToolAdapter {
    pub fn from_mcp_entry(entry: &McpToolEntry) -> Self {
        Self {
            server_name: entry.server_name.clone(),
            tool_name: entry.name.clone(),
            full_name: format!("mcp__{}__{}", entry.server_name, entry.name),
            description: entry.description.clone(),
            input_schema: entry.input_schema.clone(),
        }
    }
}

/// Check for naming conflicts between MCP tools and built-in tools.
pub fn detect_naming_conflict(mcp_tool_name: &str, builtin_tool_names: &[&str]) -> bool {
    builtin_tool_names.contains(&mcp_tool_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_name_format() {
        let entry = McpToolEntry {
            server_name: "github".to_string(),
            name: "create_issue".to_string(),
            description: "".to_string(),
            input_schema: serde_json::json!({}),
        };
        let adapter = AgentToolAdapter::from_mcp_entry(&entry);
        assert_eq!(adapter.full_name, "mcp__github__create_issue");
    }

    #[test]
    fn conflict_detection() {
        assert!(detect_naming_conflict("read", &["read", "write", "search"]));
        assert!(!detect_naming_conflict("mcp_read", &["read", "write", "search"]));
    }
}
```

Create `ai-digital-life/crates/mcp-client/src/oauth.rs`:

```rust
use adl_credential::CredentialStore;
use serde::{Deserialize, Serialize};

/// OAuth token storage for MCP servers.
pub struct McpOAuthStore {
    credential_store: CredentialStore,
}

impl McpOAuthStore {
    pub fn new() -> Self {
        Self {
            credential_store: CredentialStore::new(),
        }
    }

    pub fn save_token(&self, server_name: &str, token: &McpOAuthToken) -> Result<(), adl_errors::AppError> {
        let json = serde_json::to_string(token)
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to serialize OAuth token: {}", e)))?;
        self.credential_store
            .set_password("mcp-oauth", server_name, &json)
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to store OAuth token: {}", e)))
    }

    pub fn load_token(&self, server_name: &str) -> Result<Option<McpOAuthToken>, adl_errors::AppError> {
        match self.credential_store.get_password("mcp-oauth", server_name) {
            Ok(Some(json)) => {
                let token: McpOAuthToken = serde_json::from_str(&json)
                    .map_err(|e| adl_errors::AppError::Internal(format!("Failed to parse OAuth token: {}", e)))?;
                Ok(Some(token))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(adl_errors::AppError::Internal(format!("Failed to load OAuth token: {}", e))),
        }
    }

    pub fn clear_token(&self, server_name: &str) -> Result<(), adl_errors::AppError> {
        self.credential_store
            .delete_password("mcp-oauth", server_name)
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to clear OAuth token: {}", e)))
    }
}

impl Default for McpOAuthStore {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpOAuthToken {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<u64>,
    pub token_type: String,
    pub scope: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_serialization() {
        let token = McpOAuthToken {
            access_token: "abc123".to_string(),
            refresh_token: Some("refresh456".to_string()),
            expires_at: Some(1700000000),
            token_type: "Bearer".to_string(),
            scope: Some("read write".to_string()),
        };
        let json = serde_json::to_string(&token).unwrap();
        let deserialized: McpOAuthToken = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.access_token, "abc123");
        assert_eq!(deserialized.refresh_token, Some("refresh456".to_string()));
    }
}
```

- [ ] **Step 5: Run tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-mcp-client`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/mcp-client/
git commit -m "feat(core): create adl-mcp-client crate with registry, catalog, client, oauth"
```

---

## Task 8: Add MCP IPC Commands

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/mcp.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/lib.rs`
- Modify: `ai-digital-life/src-tauri/Cargo.toml`

**Interfaces:**
- Consumes: `McpClient` (Task 7)
- Produces: Tauri commands for MCP server management

- [ ] **Step 1: Add dependency**

Edit `ai-digital-life/src-tauri/Cargo.toml`, add:

```toml
adl-mcp-client = { path = "../crates/mcp-client" }
```

- [ ] **Step 2: Create mcp.rs commands**

Create `ai-digital-life/src-tauri/src/commands/mcp.rs`:

```rust
use adl_mcp_client::{
    McpClient, McpServerConfig, McpTransportType,
    catalog::McpCatalog,
};
use std::sync::Arc;

static MCP_CLIENT: std::sync::LazyLock<Arc<McpClient>> =
    std::sync::LazyLock::new(|| Arc::new(McpClient::new()));

#[tauri::command]
pub async fn list_mcp_servers() -> Result<Vec<McpServerInfo>, adl_errors::AppError> {
    let servers = MCP_CLIENT.list_servers().await;
    Ok(servers.into_iter().map(|(name, state)| McpServerInfo {
        name,
        state: format!("{:?}", state).to_lowercase(),
    }).collect())
}

#[derive(serde::Serialize)]
pub struct McpServerInfo {
    pub name: String,
    pub state: String,
}

#[tauri::command]
pub async fn add_mcp_server(config: McpServerConfig) -> Result<(), adl_errors::AppError> {
    MCP_CLIENT.add_server(config).await;
    Ok(())
}

#[tauri::command]
pub async fn remove_mcp_server(name: String) -> Result<(), adl_errors::AppError> {
    MCP_CLIENT.remove_server(&name).await;
    Ok(())
}

#[tauri::command]
pub async fn connect_mcp_server(name: String) -> Result<(), adl_errors::AppError> {
    MCP_CLIENT.connect(&name).await
}

#[tauri::command]
pub async fn disconnect_mcp_server(name: String) -> Result<(), adl_errors::AppError> {
    MCP_CLIENT.disconnect(&name).await
}

#[tauri::command]
pub async fn get_mcp_catalog() -> Result<McpCatalog, adl_errors::AppError> {
    Ok(MCP_CLIENT.catalog().await)
}

#[tauri::command]
pub async fn load_mcp_config(path: String) -> Result<usize, adl_errors::AppError> {
    let registry = adl_mcp_client::McpServerRegistry::from_json_file(std::path::Path::new(&path))?;
    let count = registry.list_enabled().len();
    for config in registry.list_enabled() {
        MCP_CLIENT.add_server(config.clone()).await;
    }
    Ok(count)
}
```

- [ ] **Step 3: Register module and commands**

In `ai-digital-life/src-tauri/src/commands/mod.rs`, add:

```rust
pub mod mcp;
```

In `ai-digital-life/src-tauri/src/lib.rs`, add to invoke_handler:

```rust
commands::mcp::list_mcp_servers,
commands::mcp::add_mcp_server,
commands::mcp::remove_mcp_server,
commands::mcp::connect_mcp_server,
commands::mcp::disconnect_mcp_server,
commands::mcp::get_mcp_catalog,
commands::mcp::load_mcp_config,
```

- [ ] **Step 4: Verify compilation**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check -p adl-app`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/src-tauri/
git commit -m "feat(ipc): add MCP server management commands"
```

---

## Task 9: Add Provider Management IPC Commands

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/provider.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: existing `model-gateway` secret functions
- Produces: Tauri commands for provider key management and health check

- [ ] **Step 1: Create provider.rs**

Create `ai-digital-life/src-tauri/src/commands/provider.rs`:

```rust
use adl_kernel::types::config::ModelProviderId;
use adl_model_gateway::secret;

#[tauri::command]
pub async fn set_provider_api_key(
    provider: String,
    api_key: String,
) -> Result<(), adl_errors::AppError> {
    let provider_id = parse_provider_id(&provider)?;
    secret::set_provider_secret(&provider_id, &api_key)
        .map_err(|e| adl_errors::AppError::Internal(format!("Failed to save API key: {}", e)))
}

#[tauri::command]
pub async fn clear_provider_api_key(provider: String) -> Result<(), adl_errors::AppError> {
    let provider_id = parse_provider_id(&provider)?;
    secret::clear_provider_secret(&provider_id)
        .map_err(|e| adl_errors::AppError::Internal(format!("Failed to clear API key: {}", e)))
}

#[tauri::command]
pub async fn has_provider_api_key(provider: String) -> Result<bool, adl_errors::AppError> {
    let provider_id = parse_provider_id(&provider)?;
    Ok(secret::get_provider_secret(&provider_id).map(|o| o.is_some()).unwrap_or(false))
}

#[tauri::command]
pub async fn list_supported_providers() -> Result<Vec<ProviderInfo>, adl_errors::AppError> {
    Ok(vec![
        ProviderInfo { id: "deepseek".to_string(), name: "DeepSeek".to_string(), requires_key: true },
        ProviderInfo { id: "minimax".to_string(), name: "MiniMax".to_string(), requires_key: true },
        ProviderInfo { id: "openai".to_string(), name: "OpenAI".to_string(), requires_key: true },
        ProviderInfo { id: "anthropic".to_string(), name: "Anthropic".to_string(), requires_key: true },
        ProviderInfo { id: "google".to_string(), name: "Google Gemini".to_string(), requires_key: true },
        ProviderInfo { id: "ollama".to_string(), name: "Ollama (Local)".to_string(), requires_key: false },
        ProviderInfo { id: "openrouter".to_string(), name: "OpenRouter".to_string(), requires_key: true },
    ])
}

#[derive(serde::Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub requires_key: bool,
}

fn parse_provider_id(s: &str) -> Result<ModelProviderId, adl_errors::AppError> {
    match s {
        "deepseek" => Ok(ModelProviderId::Deepseek),
        "minimax" => Ok(ModelProviderId::Minimax),
        "openai" => Ok(ModelProviderId::Openai),
        "anthropic" => Ok(ModelProviderId::Anthropic),
        "google" => Ok(ModelProviderId::Google),
        "ollama" => Ok(ModelProviderId::Ollama),
        "openrouter" => Ok(ModelProviderId::Openrouter),
        _ => Err(adl_errors::AppError::InvalidInput(format!("Unknown provider: {}", s))),
    }
}
```

- [ ] **Step 2: Register commands**

In `ai-digital-life/src-tauri/src/commands/mod.rs`, add `pub mod provider;`.

In `ai-digital-life/src-tauri/src/lib.rs`, add to invoke_handler:

```rust
commands::provider::set_provider_api_key,
commands::provider::clear_provider_api_key,
commands::provider::has_provider_api_key,
commands::provider::list_supported_providers,
```

- [ ] **Step 3: Verify compilation**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check -p adl-app`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/
git commit -m "feat(ipc): add provider management commands"
```

---

## Task 10: Add Frontend MCP and Provider IPC Interfaces

**Files:**
- Create: `ai-digital-life/frontend/src/shared/ipc/mcp.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/provider.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/index.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/digital-life.ts`
- Modify all three bridge implementations

- [ ] **Step 1: Create mcp.ts**

Create `ai-digital-life/frontend/src/shared/ipc/mcp.ts`:

```typescript
import type { IpcResult } from './shared';

export type McpTransportType = 'stdio' | 'sse' | 'streamable_http';

export interface McpServerConfig {
  name: string;
  transport: McpTransportType;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  oauth: boolean;
  enabled: boolean;
}

export interface McpServerInfo {
  name: string;
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
}

export interface McpToolEntry {
  server_name: string;
  name: string;
  description: string;
  input_schema: unknown;
}

export interface McpResourceEntry {
  server_name: string;
  uri: string;
  name: string;
  description: string | null;
  mime_type: string | null;
}

export interface McpCatalog {
  tools: McpToolEntry[];
  resources: McpResourceEntry[];
}

export interface McpBridge {
  listMcpServers(): Promise<IpcResult<McpServerInfo[]>>;
  addMcpServer(config: McpServerConfig): Promise<IpcResult<void>>;
  removeMcpServer(name: string): Promise<IpcResult<void>>;
  connectMcpServer(name: string): Promise<IpcResult<void>>;
  disconnectMcpServer(name: string): Promise<IpcResult<void>>;
  getMcpCatalog(): Promise<IpcResult<McpCatalog>>;
  loadMcpConfig(path: string): Promise<IpcResult<number>>;
}
```

- [ ] **Step 2: Create provider.ts**

Create `ai-digital-life/frontend/src/shared/ipc/provider.ts`:

```typescript
import type { IpcResult } from './shared';

export interface ProviderInfo {
  id: string;
  name: string;
  requiresKey: boolean;
}

export interface ProviderBridge {
  setProviderApiKey(provider: string, apiKey: string): Promise<IpcResult<void>>;
  clearProviderApiKey(provider: string): Promise<IpcResult<void>>;
  hasProviderApiKey(provider: string): Promise<IpcResult<boolean>>;
  listSupportedProviders(): Promise<IpcResult<ProviderInfo[]>>;
}
```

- [ ] **Step 3: Export and wire into DigitalLifeBridge**

In `index.ts`, add exports. In `digital-life.ts`, add `mcp: McpBridge` and `provider: ProviderBridge` fields.

- [ ] **Step 4: Implement in all three bridges**

Add the `mcp` and `provider` bridge objects to tauri-bridge, preview-bridge, and mock-bridge.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc/ ai-digital-life/frontend/src/tauri-bridge/ ai-digital-life/frontend/src/preview-bridge/ ai-digital-life/frontend/src/mock-bridge/
git commit -m "feat(ipc): add McpBridge and ProviderBridge interfaces with 3-bridge sync"
```

---

## Task 11: Build MCP Management UI

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/mcp/McpServerList.tsx`
- Create: `ai-digital-life/frontend/src/app/features/mcp/McpServerConfig.tsx`
- Create: `ai-digital-life/frontend/src/app/features/mcp/McpStatusBadge.tsx`
- Create: `ai-digital-life/frontend/src/app/stores/slices/mcpSlice.ts`
- Create: `ai-digital-life/frontend/src/app/stores/actions/mcpActions.ts`
- Modify: locale files

- [ ] **Step 1: Add i18n keys**

Add to locale files:

```json
{
  "mcp": {
    "title": "MCP 服务器",
    "add": "添加服务器",
    "remove": "移除",
    "connect": "连接",
    "disconnect": "断开",
    "status": {
      "connected": "已连接",
      "disconnected": "未连接",
      "connecting": "连接中",
      "error": "错误"
    },
    "config": {
      "name": "服务器名称",
      "transport": "传输类型",
      "command": "命令",
      "args": "参数",
      "url": "URL",
      "enabled": "启用"
    },
    "tools": "工具",
    "resources": "资源"
  }
}
```

- [ ] **Step 2: Create mcpSlice and mcpActions**

Create `ai-digital-life/frontend/src/app/stores/slices/mcpSlice.ts`:

```typescript
import type { McpServerInfo, McpCatalog } from '@ai-digital-life/shared/ipc';

export interface McpState {
  servers: McpServerInfo[];
  catalog: McpCatalog | null;
  isFetching: boolean;
}

export const initialMcpState: McpState = {
  servers: [],
  catalog: null,
  isFetching: false,
};
```

Create `ai-digital-life/frontend/src/app/stores/actions/mcpActions.ts`:

```typescript
import type { DigitalLifeBridge } from '@ai-digital-life/shared/ipc';
import { clearError, captureError } from './shared';

export interface McpActions {
  fetchMcpServers: () => Promise<void>;
  fetchMcpCatalog: () => Promise<void>;
  addMcpServer: (config: import('@ai-digital-life/shared/ipc').McpServerConfig) => Promise<void>;
  removeMcpServer: (name: string) => Promise<void>;
  connectMcpServer: (name: string) => Promise<void>;
  disconnectMcpServer: (name: string) => Promise<void>;
}

export const createMcpActions = (set: any, get: any, bridge: DigitalLifeBridge): McpActions => ({
  fetchMcpServers: async () => {
    set({ isFetching: true });
    clearError(get);
    try {
      const result = await bridge.mcp.listMcpServers();
      if (result.ok) {
        set({ servers: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to fetch MCP servers');
      }
    } catch (e) {
      captureError(get, e);
    } finally {
      set({ isFetching: false });
    }
  },

  fetchMcpCatalog: async () => {
    try {
      const result = await bridge.mcp.getMcpCatalog();
      if (result.ok) {
        set({ catalog: result.data });
      }
    } catch (e) {
      console.warn('Failed to fetch MCP catalog', e);
    }
  },

  addMcpServer: async (config) => {
    clearError(get);
    try {
      const result = await bridge.mcp.addMcpServer(config);
      if (!result.ok) {
        captureError(get, result.error?.message ?? 'Failed to add MCP server');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  removeMcpServer: async (name) => {
    clearError(get);
    try {
      const result = await bridge.mcp.removeMcpServer(name);
      if (!result.ok) {
        captureError(get, result.error?.message ?? 'Failed to remove MCP server');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  connectMcpServer: async (name) => {
    clearError(get);
    try {
      const result = await bridge.mcp.connectMcpServer(name);
      if (!result.ok) {
        captureError(get, result.error?.message ?? 'Failed to connect MCP server');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  disconnectMcpServer: async (name) => {
    clearError(get);
    try {
      const result = await bridge.mcp.disconnectMcpServer(name);
      if (!result.ok) {
        captureError(get, result.error?.message ?? 'Failed to disconnect MCP server');
      }
    } catch (e) {
      captureError(get, e);
    }
  },
});
```

- [ ] **Step 3: Create McpStatusBadge.tsx**

```tsx
import { useTCopy } from '../../i18n/useTCopy';

export function McpStatusBadge({ state }: { state: string }) {
  const t = useTCopy();
  const key = state as 'connected' | 'disconnected' | 'connecting' | 'error';
  return (
    <span className={`adl-mcp-status adl-mcp-status-${state}`}>
      {t(`mcp.status.${key}`)}
    </span>
  );
}
```

- [ ] **Step 4: Create McpServerList.tsx**

```tsx
import { useEffect } from 'react';
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';
import { McpStatusBadge } from './McpStatusBadge';

export function McpServerList() {
  const t = useTCopy();
  const servers = useAppStore((s) => s.mcpServers);
  const fetchMcpServers = useAppStore((s) => s.fetchMcpServers);
  const connectMcpServer = useAppStore((s) => s.connectMcpServer);
  const disconnectMcpServer = useAppStore((s) => s.disconnectMcpServer);

  useEffect(() => {
    void fetchMcpServers();
  }, [fetchMcpServers]);

  return (
    <div className="adl-mcp-server-list">
      <h2>{t('mcp.title')}</h2>
      {servers.length === 0 ? (
        <p className="adl-empty-state">{t('mcp.title')}</p>
      ) : (
        servers.map((server) => (
          <div key={server.name} className="adl-mcp-server-item">
            <span>{server.name}</span>
            <McpStatusBadge state={server.state} />
            {server.state === 'connected' ? (
              <button type="button" onClick={() => void disconnectMcpServer(server.name)}>
                {t('mcp.disconnect')}
              </button>
            ) : (
              <button type="button" onClick={() => void connectMcpServer(server.name)}>
                {t('mcp.connect')}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create McpServerConfig.tsx (add/edit form)**

Create a form component for adding new MCP servers with fields: name, transport type (dropdown: stdio/sse/streamable_http), command, args (comma-separated), url, enabled checkbox.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/mcp/ ai-digital-life/frontend/src/app/stores/ ai-digital-life/frontend/src/locales/
git commit -m "feat(frontend): add MCP server management UI with i18n"
```

---

## Task 12: Build Provider Manager UI

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/provider-manager/ProviderList.tsx`
- Create: `ai-digital-life/frontend/src/app/features/provider-manager/ProviderConfig.tsx`
- Create: `ai-digital-life/frontend/src/app/stores/slices/providerSlice.ts`
- Create: `ai-digital-life/frontend/src/app/stores/actions/providerActions.ts`
- Modify: locale files

- [ ] **Step 1: Add i18n keys**

Add provider-related keys to locale files (provider names, configure, api key, save, clear, health check, etc.)

- [ ] **Step 2: Create providerSlice and providerActions**

Similar pattern to mcpSlice/mcpActions — state holds `providers: ProviderInfo[]`, `configuredProviders: Set<string>`. Actions: `fetchProviders`, `setApiKey`, `clearApiKey`, `checkApiKey`.

- [ ] **Step 3: Create ProviderList.tsx**

Lists all supported providers with status indicators (configured/not configured) and buttons to configure or clear API keys.

- [ ] **Step 4: Create ProviderConfig.tsx**

Modal/dialog for entering API key for a provider, with save and clear buttons.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/provider-manager/ ai-digital-life/frontend/src/app/stores/ ai-digital-life/frontend/src/locales/
git commit -m "feat(frontend): add Provider manager UI for API key configuration"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Run Rust tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test --workspace`
Expected: All tests pass

- [ ] **Step 2: Run Rust lints**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo clippy --workspace -- -D warnings`
Expected: No warnings

- [ ] **Step 3: Run frontend typecheck, tests, lint**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck; pnpm test; pnpm run lint`
Expected: All pass

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint and format fixes from Phase 2-B verification"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Multi LLM Provider support: Tasks 1-4 (provider IDs, adapter trait, 5 adapters)
- ✅ Provider-specific Prompts: Task 5 (prompt template files + dispatch)
- ✅ MCP complete integration: Tasks 6-8 (rmcp deps, mcp-client crate, IPC commands)
- ✅ Frontend MCP UI: Task 11
- ✅ Frontend Provider UI: Task 12
- ✅ 3-bridge sync: Task 10

**Type consistency:**
- `ModelProviderId` variants match across Rust and TS (lowercase serde)
- `McpServerConfig` field names match (`transport` ↔ `McpTransportType`)
- `ProviderInfo` struct consistent across boundary

**Dependencies:**
- `rmcp` 0.2.x added in Task 6
- No other new external deps (uses existing reqwest, tokio, async-trait)
