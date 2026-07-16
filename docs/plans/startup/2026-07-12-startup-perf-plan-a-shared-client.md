# Sub-Plan A: Shared `reqwest::Client` for Provider Adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ~3s Tauri desktop startup freeze by replacing 7 independent `reqwest::Client` instances with a single shared one.

**Architecture:** Each Provider struct (OpenAI, Anthropic, Google, Ollama, OpenRouter) currently calls `Client::new()` in its constructor. On Windows this takes 200-500ms each due to Schannel TLS init + system proxy detection. We add a `with_client(client: Client)` constructor to each, then register all providers using one `Client` created once in `setup.rs`.

**Tech Stack:** Rust, reqwest 0.12, Tauri 2.x

## Global Constraints

- All 5 existing Provider constructors (`new()`, `with_base_url()`) MUST continue to work unchanged — backward compat for tests
- The shared client MUST be created with `.user_agent()` set to identify this application
- `reqwest::Client` is `Clone` (Arc-wrapped internally), so sharing is zero-cost
- No provider should store a mutable reference to the client (all HTTP ops read-only)
- Existing tests that create providers directly must NOT be modified (they use `new()`)

---

### Task 1: Add `with_client()` constructor to all 5 Provider structs

**Files:**
- Modify: `ai-digital-life/crates/model-gateway/src/providers/openai.rs:26-34`
- Modify: `ai-digital-life/crates/model-gateway/src/providers/anthropic.rs:15-23`
- Modify: `ai-digital-life/crates/model-gateway/src/providers/google.rs:15-26`
- Modify: `ai-digital-life/crates/model-gateway/src/providers/ollama.rs:15-23`
- Modify: `ai-digital-life/crates/model-gateway/src/providers/openrouter.rs:15-23`
- Verify: `ai-digital-life/crates/model-gateway/src/providers/mod.rs` re-exports

**Interfaces:**
- Consumes: Each struct's existing `pub client: Client` field
- Produces: `pub fn with_client(client: Client) -> Self` on each struct, storing the given client instead of creating a new one

- [ ] **Step 1: Add `with_client()` to `OpenAIProvider` (`openai.rs:26-34`)**

```rust
impl OpenAIProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://api.openai.com/v1".to_string() }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: "https://api.openai.com/v1".to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

Add after the existing `with_base_url` method. Position the new methods alongside existing constructors.

- [ ] **Step 2: Add `with_client()` to `AnthropicProvider` (`anthropic.rs:15-23`)**

```rust
impl AnthropicProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://api.anthropic.com/v1".to_string() }
    }
    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: "https://api.anthropic.com/v1".to_string() }
    }
    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 3: Add `with_client()` to `GoogleProvider` (`google.rs:15-26`)**

```rust
impl GoogleProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://generativelanguage.googleapis.com/v1beta".to_string() }
    }
    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: "https://generativelanguage.googleapis.com/v1beta".to_string() }
    }
    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 4: Add `with_client()` to `OllamaProvider` (`ollama.rs:15-23`)**

```rust
impl OllamaProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "http://localhost:11434".to_string() }
    }
    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: "http://localhost:11434".to_string() }
    }
    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 5: Add `with_client()` to `OpenRouterProvider` (`openrouter.rs:15-23`)**

```rust
impl OpenRouterProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://openrouter.ai/api/v1".to_string() }
    }
    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: "https://openrouter.ai/api/v1".to_string() }
    }
    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 6: Verify `providers/mod.rs` exports all types**

Run: `grep -n "pub mod\|pub use" ai-digital-life/crates/model-gateway/src/providers/mod.rs`
Expected: all 5 provider modules listed
If missing, add the pub mod line.

- [ ] **Step 7: Run existing tests to confirm backward compat**

Run (from `ai-digital-life/`):
```bash
cargo test -p adl_model_gateway 2>&1
```
Expected: all tests PASS, no new warnings. This confirms `new()` and `with_base_url()` still work.

- [ ] **Step 8: Commit**

```bash
git add crates/model-gateway/src/providers/
git commit -m "feat: add with_client constructors to all 5 providers"
```

---

### Task 2: Create shared client in `setup.rs` and wire to `register_builtin_providers`

**Files:**
- Modify: `ai-digital-life/src-tauri/src/setup.rs:39-168`
- Test: verify via `cargo build`

**Interfaces:**
- Consumes: Task 1's `Provider::with_client(client)` constructors
- Produces: `register_builtin_providers()` now takes a `client: &Client` parameter

- [ ] **Step 1: Change `register_builtin_providers` signature to accept a client**

In `setup.rs`, change:
```rust
fn register_builtin_providers() -> ProviderRegistry {
```
to:
```rust
fn register_builtin_providers(shared_client: &Client) -> ProviderRegistry {
```

- [ ] **Step 2: Replace every `Provider::new()` / `Provider::with_base_url()` with `with_client()` variant**

Each provider in the function body changes from creating its own client to using the shared one:

```rust
// Before (openai):
registry.register(..., Box::new(OpenAIProvider::new()));
// After:
registry.register(..., Box::new(OpenAIProvider::with_client(shared_client.clone())));

// Before (anthropic):
registry.register(..., Box::new(AnthropicProvider::new()));
// After:
registry.register(..., Box::new(AnthropicProvider::with_client(shared_client.clone())));

// Before (google):
registry.register(..., Box::new(GoogleProvider::new()));
// After:
registry.register(..., Box::new(GoogleProvider::with_client(shared_client.clone())));

// Before (ollama):
registry.register(..., Box::new(OllamaProvider::new()));
// After:
registry.register(..., Box::new(OllamaProvider::with_client(shared_client.clone())));

// Before (openrouter):
registry.register(..., Box::new(OpenRouterProvider::new()));
// After:
registry.register(..., Box::new(OpenRouterProvider::with_client(shared_client.clone())));

// Before (deepseek — uses OpenAIProvider::with_base_url):
registry.register(..., Box::new(OpenAIProvider::with_base_url("https://api.deepseek.com".into())));
// After:
registry.register(..., Box::new(OpenAIProvider::with_client_and_base_url(
    shared_client.clone(),
    "https://api.deepseek.com".into(),
)));

// Before (minimax):
registry.register(..., Box::new(OpenAIProvider::with_base_url("https://api.minimax.io".into())));
// After:
registry.register(..., Box::new(OpenAIProvider::with_client_and_base_url(
    shared_client.clone(),
    "https://api.minimax.io".into(),
)));
```

- [ ] **Step 3: Add `reqwest` dependency to `src-tauri/Cargo.toml`**

Edit `ai-digital-life/src-tauri/Cargo.toml`, add after any existing workspace dependency:

```toml
reqwest.workspace = true
```

`reqwest` is already a workspace dependency in the root `Cargo.toml` (line 46), so this just pulls it into the binary crate's dependency graph for use in `setup.rs`.

- [ ] **Step 4: Add `use reqwest::Client;` import in `setup.rs`**

Add to the imports at the top of `ai-digital-life/src-tauri/src/setup.rs`:

```rust
use reqwest::Client;
```

- [ ] **Step 5: Create the shared client and wire to `register_builtin_providers`**

In `setup.rs`, change the `init_app_state` function. Before the `register_builtin_providers()` call, add:

```rust
let shared_client = Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .pool_max_idle_per_host(16)
    .user_agent("ai-digital-life/1.0")
    .build()
    .context("failed to build shared HTTP client")?;

let provider_registry = Arc::new(RwLock::new(register_builtin_providers(&shared_client)));
```

Add `use std::time::Duration;` if not already imported at the top of `setup.rs`.

- [ ] **Step 5: Build and verify**

Run (from `ai-digital-life/`):
```bash
cargo build -p adl_model_gateway 2>&1
```
Expected: clean build, no errors

- [ ] **Step 6: Run provider and registry tests**

Run:
```bash
cargo test -p adl_model_gateway 2>&1
```
Expected: all 150+ provider tests PASS

- [ ] **Step 7: Run full Tauri workspace test suite**

Run:
```bash
cargo test --workspace --all-targets 2>&1
```
Expected: all 508 tests PASS, clippy zero warnings

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/setup.rs src-tauri/Cargo.toml
git commit -m "perf: share single reqwest::Client across all providers to eliminate 3s Tauri startup freeze"
```

---

### Verification (run after both tasks)

- [ ] **Step 1: Build release binary**

Run (from `ai-digital-life/`):
```bash
cargo build --release -p adl_digital_life 2>&1
```
Expected: clean build

- [ ] **Step 2: Launch Tauri app and measure startup**

Launch the built app and verify the 3-4s unresponsive period is eliminated. The app should become interactive within <1s of the window appearing.

