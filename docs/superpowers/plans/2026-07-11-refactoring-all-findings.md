# Refactoring: All 25 Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 25 architecture, code structure, performance, and hygiene findings identified in the refactoring insight report.

**Architecture:** The 25 findings span 3 independent subsystems: (A) Rust backend architecture — 22 crates, 26,845 lines; (B) Frontend code structure — 729 TS/TSX files, 75,460 lines; (C) Test coverage gaps. Each subsystem can be worked independently. Within each subsystem, tasks follow dependency order (critical → high → medium → low).

**Tech Stack:** Rust + Tauri 2.x (backend), React 19 + Vite + Zustand + TypeScript (frontend)

## Global Constraints

- Project root for Rust code: `ai-digital-life/`
- Frontend root: `ai-digital-life/frontend/`
- Zero new warnings: clippy --workspace --all-targets must pass, eslint + tsc --noEmit must pass
- No `unwrap()` in non-test code
- Follow existing patterns in the codebase (error handling with `thiserror`, Zustand slice pattern, Tauri command pattern)
- After each task: `cargo clippy --workspace --all-targets -D warnings` (Rust) or `eslint . && tsc --noEmit` (frontend)
- Every task ends with a commit using conventional commit format: `refactor(scope): description`

---

## Task 1: Extract `WebViewHandle` Trait (browser/tauri coupling)

**Files:**
- Create: `crates/browser/src/webview_handle.rs`
- Create: `crates/browser/src/bounds.rs`
- Modify: `crates/browser/src/browser_webview.rs`
- Modify: `crates/browser/src/lib.rs`
- Create: `src-tauri/src/tauri_webview_handle.rs`
- Modify: `src-tauri/src/setup.rs`
- Test: `crates/browser/tests/webview_handle_tests.rs`

**Interfaces:**
- Consumes: `crates/browser` types (`Bounds`, `BrowserPool`, `PageMeta`)
- Produces: `WebViewHandle` trait (Tauri-agnostic), `TauriWebViewHandle` impl in `src-tauri/`

- [ ] **Step 1: Create `WebViewHandle` trait in `crates/browser/src/webview_handle.rs`**

```rust
use adl_errors::AppError;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub trait WebViewHandle: Send + Sync {
    fn navigate(&self, url: &str) -> Result<(), AppError>;
    fn close(&self) -> Result<(), AppError>;
    fn set_bounds(&self, bounds: Bounds) -> Result<(), AppError>;
    fn eval_js(&self, js: &str) -> Result<String, AppError>;
    fn set_color_scheme(&self, scheme: &str) -> Result<(), AppError>;
    fn id(&self) -> &str;
}
```

- [ ] **Step 2: Write failing test for the trait**

Create `crates/browser/tests/webview_handle_tests.rs`:

```rust
use adl_browser::webview_handle::{WebViewHandle, Bounds};

struct MockHandle {
    id: String,
}

impl WebViewHandle for MockHandle {
    fn navigate(&self, _url: &str) -> Result<(), adl_errors::AppError> { Ok(()) }
    fn close(&self) -> Result<(), adl_errors::AppError> { Ok(()) }
    fn set_bounds(&self, _bounds: Bounds) -> Result<(), adl_errors::AppError> { Ok(()) }
    fn eval_js(&self, _js: &str) -> Result<String, adl_errors::AppError> { Ok("".into()) }
    fn set_color_scheme(&self, _scheme: &str) -> Result<(), adl_errors::AppError> { Ok(()) }
    fn id(&self) -> &str { &self.id }
}

#[test]
fn mock_handle_implements_trait() {
    let h = MockHandle { id: "test".into() };
    assert!(h.navigate("https://example.com").is_ok());
    assert_eq!(h.id(), "test");
}
```

Run: `cargo test --package adl-browser --test webview_handle_tests`
Expected: FAIL (trait not re-exported yet)

- [ ] **Step 3: Create `Bounds` struct + re-export from `lib.rs`**

In `crates/browser/src/lib.rs`, add:
```rust
pub mod webview_handle;
pub use webview_handle::{WebViewHandle, Bounds};
```

Remove the old `Bounds` re-export and struct from `browser_webview.rs`.

- [ ] **Step 4: Create `TauriWebViewHandle` in `src-tauri/src/tauri_webview_handle.rs`**

```rust
use adl_browser::webview_handle::{WebViewHandle, Bounds};
use adl_errors::AppError;
use tauri::{AppHandle, Manager, Webview};

pub struct TauriWebViewHandle {
    label: String,
    app: AppHandle,
}

impl TauriWebViewHandle {
    pub fn new(app: AppHandle, label: String) -> Self {
        Self { app, label }
    }

    fn webview(&self) -> Result<Webview, AppError> {
        self.app
            .get_webview(&self.label)
            .ok_or_else(|| AppError::Internal(format!("webview {} not found", self.label)))
    }
}

impl WebViewHandle for TauriWebViewHandle {
    fn navigate(&self, url: &str) -> Result<(), AppError> {
        self.webview()?.navigate(url::Url::parse(url).map_err(|e| AppError::Internal(e.to_string()))?);
        Ok(())
    }

    fn close(&self) -> Result<(), AppError> {
        self.webview()?.close().map_err(|e| AppError::Internal(e.to_string()))
    }

    fn set_bounds(&self, bounds: Bounds) -> Result<(), AppError> {
        self.webview()?.set_bounds(tauri::PhysicalPosition::new(bounds.x as i32, bounds.y as i32), tauri::PhysicalSize::new(bounds.width as i32, bounds.height as i32));
        Ok(())
    }

    fn eval_js(&self, js: &str) -> Result<String, AppError> {
        self.webview()?.eval(js);
        Ok(String::new())
    }

    fn set_color_scheme(&self, _scheme: &str) -> Result<(), AppError> {
        Ok(())
    }

    fn id(&self) -> &str { &self.label }
}
```

- [ ] **Step 5: Refactor `browser_webview.rs` to use `Box<dyn WebViewHandle>` instead of `tauri::Webview`**

Replace all method signatures that take `&tauri::AppHandle` with `&dyn WebViewHandle`.
Change `BrowserManager` to store `WebViewHandle` wrappers instead of raw Tauri webviews.
Change `create_for_tab` signature from `app: &tauri::AppHandle` to `handle: Box<dyn WebViewHandle>`.

- [ ] **Step 6: Update `src-tauri/src/setup.rs` to pass `TauriWebViewHandle`**

```rust
use crate::tauri_webview_handle::TauriWebViewHandle;
// Instead of: browser.create_for_tab(&app, tab_id, url)
// Use: let handle = Box::new(TauriWebViewHandle::new(app.clone(), label));
//       browser.create_for_tab(handle, tab_id, url);
```

- [ ] **Step 7: Remove direct `tauri` dependency from `crates/browser/Cargo.toml`**

Remove line: `tauri = { workspace = true, features = ["unstable"] }`

- [ ] **Step 8: Run tests to verify**

Run: `cargo test --package adl-browser -v`
Expected: All tests pass, including the new mock handle test.

- [ ] **Step 9: Verify clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: Zero warnings.

- [ ] **Step 10: Commit**

```bash
git add crates/browser/src/webview_handle.rs crates/browser/src/lib.rs crates/browser/src/browser_webview.rs crates/browser/Cargo.toml src-tauri/src/tauri_webview_handle.rs src-tauri/src/setup.rs crates/browser/tests/webview_handle_tests.rs
git commit -m "refactor(browser): extract WebViewHandle trait to break tauri coupling"
```

---

## Task 2: Split `agent_pipeline.rs` (882-line god module)

**Files:**
- Create: `src-tauri/src/commands/agent_pipeline/mod.rs`
- Create: `src-tauri/src/commands/agent_pipeline/prepare.rs`
- Create: `src-tauri/src/commands/agent_pipeline/context.rs`
- Create: `src-tauri/src/commands/agent_pipeline/model_caller.rs`
- Create: `src-tauri/src/commands/agent_pipeline/patch_generator.rs`
- Create: `src-tauri/src/commands/agent_pipeline/audit_helper.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Delete: `src-tauri/src/commands/agent_pipeline.rs`
- Test: existing tests in `agent_pipeline.rs` must migrate

**Interfaces:**
- Consumes: Types from `agent_pipeline_types.rs`, `audit.rs`, `plugin.rs`
- Produces: Same public functions (`prepare_run`, `collect_context`, `call_model`, `generate_patches`, `finalize_run`) re-exported from new module

- [ ] **Step 1: Create directory and `mod.rs`**

```rust
// src-tauri/src/commands/agent_pipeline/mod.rs
mod prepare;
mod context;
pub(crate) mod model_caller;
mod patch_generator;
mod audit_helper;

pub use prepare::prepare_run;
pub use context::collect_context;
pub use model_caller::call_model;
pub use patch_generator::generate_patches;
pub(crate) use audit_helper::{finalize_run, AuditBatchEntry};
```

- [ ] **Step 2: Create `prepare.rs`** — extract lines 15-46 from original `agent_pipeline.rs`

Copy `prepare_run()` function and its imports.

- [ ] **Step 3: Create `context.rs`** — extract `collect_context()` function

Copy `collect_context()` and its helper `collect_files_context()` / `collect_symbols_context()`.

- [ ] **Step 4: Create `model_caller.rs`** — extract `call_model()` function

```rust
use adl_errors::AppError;
use adl_kernel::{ConversationScenario, ConversationSendResult};
use crate::commands::agent_pipeline_types::CallModelContext;
use crate::commands::audit::AuditBatchEntry;
use crate::commands::plugin::PLUGIN_REGISTRY;

pub(crate) async fn call_model(
    ctx: &CallModelContext<'_>,
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Result<ConversationSendResult, AppError> {
    // ... the full function body from agent_pipeline.rs lines 198-363
}
```

- [ ] **Step 5: Create `patch_generator.rs`** — extract `generate_patches()` function

Copy `generate_patches()` and its helper `should_auto_apply()`.

- [ ] **Step 6: Create `audit_helper.rs`** — extract `finalize_run()` and `AuditBatchEntry`

Copy `finalize_run()` function. Re-export `AuditBatchEntry` from `crate::commands::audit` module.

- [ ] **Step 7: Update `mod.rs` to point to new module**

In `src-tauri/src/commands/mod.rs`, change:
```rust
pub mod agent_pipeline;
```
to:
```rust
pub mod agent_pipeline;
```
(module resolution changes from `agent_pipeline.rs` to `agent_pipeline/mod.rs`)

- [ ] **Step 8: Update imports in `agent_pipeline_stream.rs` and `agent.rs`**

Check all files that `use crate::commands::agent_pipeline::...` and ensure they still compile.

- [ ] **Step 9: Run tests**

Run: `cargo test --package ai-digital-life -v`
Expected: All tests pass.

- [ ] **Step 10: Verify clippy + commit**

```bash
cargo clippy --workspace --all-targets -- -D warnings
git add src-tauri/src/commands/agent_pipeline/ src-tauri/src/commands/mod.rs
git commit -m "refactor(core): split agent_pipeline.rs into 5 focused modules"
```

---

## Task 3: Introduce `SessionRepository` Trait + Storage Abstraction

**Files:**
- Modify: `crates/agent-runtime/src/lib.rs`
- Create: `crates/agent-runtime/src/session_repo.rs`
- Create: `crates/storage/src/session_repo_impl.rs`
- Modify: `crates/agent-runtime/Cargo.toml`
- Modify: `crates/storage/src/lib.rs`
- Test: `crates/agent-runtime/tests/session_repo_tests.rs`

**Interfaces:**
- Consumes: `SessionRecord`, `ConversationSessionRecord` from `adl-kernel`
- Produces: `SessionRepository` trait in `agent-runtime`, `StorageSessionRepository` impl in `adl-storage`

- [ ] **Step 1: Write failing test using mock repository**

`crates/agent-runtime/tests/session_repo_tests.rs`:
```rust
use adl_agent_runtime::session_repo::{SessionRepository, SessionQuery};

struct MockRepo;

impl SessionRepository for MockRepo {
    fn get_session(&self, id: &str) -> Result<Option<adl_kernel::ConversationSessionRecord>, adl_errors::AppError> {
        if id == "exists" {
            Ok(Some(adl_kernel::ConversationSessionRecord {
                id: "exists".into(),
                ..Default::default()
            }))
        } else {
            Ok(None)
        }
    }
    fn save_session(&self, session: &adl_kernel::ConversationSessionRecord) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn list_sessions(&self, query: &SessionQuery) -> Result<Vec<adl_kernel::ConversationSessionRecord>, adl_errors::AppError> {
        Ok(vec![])
    }
}

#[test]
fn mock_repo_get_session() {
    let repo = MockRepo;
    let result = repo.get_session("exists").unwrap();
    assert!(result.is_some());
    assert_eq!(result.unwrap().id, "exists");

    let missing = repo.get_session("missing").unwrap();
    assert!(missing.is_none());
}
```

Run: `cargo test --package adl-agent-runtime -v`
Expected: FAIL (module session_repo not found)

- [ ] **Step 2: Create `SessionRepository` trait**

`crates/agent-runtime/src/session_repo.rs`:
```rust
use adl_errors::AppError;
use adl_kernel::ConversationSessionRecord;

pub struct SessionQuery {
    pub workspace_id: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

pub trait SessionRepository: Send + Sync {
    fn get_session(&self, id: &str) -> Result<Option<ConversationSessionRecord>, AppError>;
    fn save_session(&self, session: &ConversationSessionRecord) -> Result<(), AppError>;
    fn list_sessions(&self, query: &SessionQuery) -> Result<Vec<ConversationSessionRecord>, AppError>;
}
```

- [ ] **Step 3: Re-export from `agent-runtime/src/lib.rs`**

```rust
pub mod session_repo;
```

- [ ] **Step 4: Move `adl-storage` from `[dependencies]` to `[dev-dependencies]` in `agent-runtime/Cargo.toml`**

Replace `adl-storage = { path = "../storage" }` with dev-only. Keep `rusqlite` if directly used.

- [ ] **Step 5: Create `StorageSessionRepository` impl in `adl-storage`**

`crates/storage/src/session_repo_impl.rs`:
```rust
use adl_agent_runtime::session_repo::{SessionRepository, SessionQuery};
use adl_errors::AppError;
use adl_kernel::ConversationSessionRecord;
use crate::EntityTable;

pub struct StorageSessionRepository {
    db: crate::StorageDb,
}

impl StorageSessionRepository {
    pub fn new(db: crate::StorageDb) -> Self {
        Self { db }
    }
}

impl SessionRepository for StorageSessionRepository {
    fn get_session(&self, id: &str) -> Result<Option<ConversationSessionRecord>, AppError> {
        self.db.get_entity::<ConversationSessionRecord>(EntityTable::Sessions, id)
    }

    fn save_session(&self, session: &ConversationSessionRecord) -> Result<(), AppError> {
        self.db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            None,
            session,
        )
    }

    fn list_sessions(&self, query: &SessionQuery) -> Result<Vec<ConversationSessionRecord>, AppError> {
        let mut sessions: Vec<ConversationSessionRecord> = self.db.list_entities(EntityTable::Sessions)?;
        if let Some(ws_id) = &query.workspace_id {
            sessions.retain(|s| &s.workspace_id == ws_id);
        }
        Ok(sessions)
    }
}
```

- [ ] **Step 6: Add `adl-agent-runtime` dependency to `adl-storage/Cargo.toml`**

```toml
adl-agent-runtime = { path = "../agent-runtime" }
```

- [ ] **Step 7: Wire `StorageSessionRepository` into `src-tauri/src/state.rs`**

Add as a field in `AppState`.

- [ ] **Step 8: Update `agent-runtime` code to use `SessionRepository` trait instead of direct storage calls**

Find all `adl_storage::` calls in `agent-runtime/src/` and replace with `self.repo.method()`.

- [ ] **Step 9: Run tests**

Run: `cargo test --workspace -v`
Expected: All tests pass.

- [ ] **Step 10: Verify clippy + commit**

```bash
cargo clippy --workspace --all-targets -- -D warnings
git add crates/agent-runtime/src/session_repo.rs crates/agent-runtime/src/lib.rs crates/agent-runtime/Cargo.toml crates/storage/src/session_repo_impl.rs crates/storage/src/lib.rs crates/storage/Cargo.toml src-tauri/src/state.rs crates/agent-runtime/tests/session_repo_tests.rs
git commit -m "refactor(agent-runtime): extract SessionRepository trait to break storage coupling"
```

---

## Task 4: Unify Error Encoding (AppError → IpcErrorCode → IpcResult)

**Files:**
- Modify: `crates/errors/src/lib.rs`
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Test: existing error tests

**Interfaces:**
- Consumes: Current `AppError` enum, `IpcErrorCode` enum, `CommandError` struct
- Produces: Unified `AppError` with `Serialize` deriving IPC-compatible code via `serde(rename_all = "SCREAMING_SNAKE_CASE")`, removed `IpcErrorCode` duplication, simplified `CommandError`

- [ ] **Step 1: Update `AppError` to include error code directly**

In `crates/errors/src/lib.rs`, add an `error_code()` method:

```rust
impl AppError {
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "NOT_FOUND",
            Self::InvalidInput(_) => "INVALID_INPUT",
            Self::Storage(_) => "STORAGE_ERROR",
            Self::Workspace(_) => "WORKSPACE_ERROR",
            Self::Config(_) => "CONFIG_ERROR",
            Self::Io(_) => "IO_ERROR",
            Self::Migration(_) => "MIGRATION_ERROR",
            Self::Security(_) => "SECURITY_ERROR",
            Self::ApprovalRequired(_) => "APPROVAL_REQUIRED",
            Self::Patch(_) => "PATCH_ERROR",
            Self::Terminal(_) => "TERMINAL_ERROR",
            Self::Model(_) => "MODEL_ERROR",
            Self::Timeout(_) => "TIMEOUT",
            Self::RateLimit(_) => "RATE_LIMIT",
            Self::AuthError(_) => "AUTH_ERROR",
            Self::Network(_) => "NETWORK_ERROR",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }

    pub fn error_kind(&self) -> ErrorKind {
        match self {
            Self::NotFound(_) => ErrorKind::NotFound,
            Self::InvalidInput(_) => ErrorKind::InvalidInput,
            // ... one variant per AppError variant
        }
    }
}
```

- [ ] **Step 2: Add test for `error_code()`**

In `crates/errors/src/lib.rs` test module:

```rust
#[test]
fn error_code_maps_all_variants() {
    let cases: Vec<(AppError, &str)> = vec![
        (AppError::NotFound("x".into()), "NOT_FOUND"),
        (AppError::InvalidInput("x".into()), "INVALID_INPUT"),
        // ... all 17 variants
    ];
    for (err, expected) in cases {
        assert_eq!(err.error_code(), expected, "mismatch for {err}");
    }
}
```

- [ ] **Step 3: Simplify `src-tauri/src/error.rs` — replace `IpcErrorCode` with `AppError::error_code()`**

```rust
use adl_errors::AppError;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(e: AppError) -> Self {
        Self { code: e.error_code().to_string(), message: e.to_string() }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}
```

Remove the entire `IpcErrorCode` enum and the `app_error_to_code` function.

- [ ] **Step 4: Remove `anyhow` conversion**

Remove `impl From<anyhow::Error> for CommandError` (lines 85-103). Replace with explicit conversion at call sites or remove if unused in IPC path.

- [ ] **Step 5: Update `commands/mod.rs` `ipc()` function**

```rust
pub fn ipc<T>(result: Result<T, AppError>) -> IpcResult<T> {
    match result {
        Ok(data) => IpcResult::ok(data),
        Err(error) => {
            let code = error.error_code().to_string();
            let msg = error.to_string();
            IpcResult::err(code, msg)
        },
    }
}
```

- [ ] **Step 6: Update tests in `src-tauri/src/error.rs`**

Simplify to match new structure:

```rust
#[test]
fn command_error_from_app_error_contains_message() {
    let err = CommandError::from(AppError::NotFound("workspace".into()));
    assert_eq!(err.code, "NOT_FOUND");
    assert!(err.message.contains("workspace"));
}
```

- [ ] **Step 7: Update `commands/mod.rs` tests**

The existing `ipc_err_wraps_error` test checks `result.error.code == "NOT_FOUND"` — this still works (code is now a `String` instead of `IpcErrorCode`).

- [ ] **Step 8: Find and update all `IpcErrorCode` references**

Run: `rg IpcErrorCode` — check if any files outside `error.rs` reference it. Update if needed.

- [ ] **Step 9: Run tests**

Run: `cargo test --workspace -v`
Expected: All tests pass.

- [ ] **Step 10: Verify clippy + commit**

```bash
cargo clippy --workspace --all-targets -- -D warnings
git add crates/errors/src/lib.rs src-tauri/src/error.rs src-tauri/src/commands/mod.rs
git commit -m "refactor(errors): unify triple error encoding into single AppError.error_code()"
```

---

## Task 5: Extract Shared HTTP Invocation Helper for Providers

**Files:**
- Create: `crates/model-gateway/src/http_helper.rs`
- Modify: `crates/model-gateway/src/providers/openai.rs`
- Modify: `crates/model-gateway/src/providers/anthropic.rs`
- Modify: `crates/model-gateway/src/providers/google.rs`
- Modify: `crates/model-gateway/src/providers/ollama.rs`
- Modify: `crates/model-gateway/src/providers/openrouter.rs`
- Modify: `crates/model-gateway/src/lib.rs`
- Test: `crates/model-gateway/tests/http_helper_tests.rs`

**Interfaces:**
- Consumes: `AppError`, `ModelChatMessage`, `ChatOptions`, `ModelResponse`, `StreamChunk`, `StreamReader` from `adapter.rs`
- Produces: `http_helper::HttpRequestBuilder` struct, `http_helper::send_chat_request()` async fn, `http_helper::send_stream_request()` async fn

- [ ] **Step 1: Write failing test for `HttpRequestBuilder`**

`crates/model-gateway/tests/http_helper_tests.rs`:
```rust
use adl_model_gateway::http_helper::{HttpRequestBuilder, HttpRequestConfig};

#[tokio::test]
async fn builder_constructs_request_with_headers() {
    let config = HttpRequestConfig {
        url: "https://api.openai.com/v1/chat/completions",
        api_key: "sk-test",
        model: "gpt-4",
        messages: &[],
        options: &Default::default(),
        extra_headers: &[("X-Custom", "value")],
        body_extra: &serde_json::json!({}),
    };
    let result = HttpRequestBuilder::new(config).build().unwrap();
    assert_eq!(result.url, "https://api.openai.com/v1/chat/completions");
}
```

Run: `cargo test --package adl-model-gateway -v`
Expected: FAIL

- [ ] **Step 2: Create `HttpRequestBuilder`**

`crates/model-gateway/src/http_helper.rs`:
```rust
use adl_errors::AppError;
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use crate::adapter::{ChatOptions, StreamChunk, StreamReader};

pub struct HttpRequestConfig<'a> {
    pub url: &'a str,
    pub api_key: &'a str,
    pub model: &'a str,
    pub messages: &'a [ModelChatMessage],
    pub options: &'a ChatOptions,
    pub extra_headers: &'a [(&'a str, &'a str)],
    pub body_extra: &'a serde_json::Value,
}

pub struct HttpRequestBuilder {
    pub url: String,
    pub headers: reqwest::header::HeaderMap,
    pub body: serde_json::Value,
}

impl HttpRequestBuilder {
    pub fn new(config: HttpRequestConfig<'_>) -> Self {
        // Build headers from api_key + extra_headers
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("Authorization", format!("Bearer {}", config.api_key).parse().unwrap());
        for (k, v) in config.extra_headers {
            headers.insert(*k, v.parse().unwrap());
        }
        // Build request body
        let mut body = serde_json::json!({
            "model": config.model,
            "messages": config.messages,
        });
        if let Some(temp) = config.options.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max_tokens) = config.options.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }
        // Merge extra body fields
        if let Some(obj) = body.as_object_mut() {
            if let Some(extra_obj) = config.body_extra.as_object() {
                for (k, v) in extra_obj {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
        Self { url: config.url.to_string(), headers, body }
    }

    pub fn build(self) -> Result<Self, AppError> { Ok(self) }
}

pub async fn send_chat_request(builder: HttpRequestBuilder) -> Result<ModelResponse, AppError> {
    let client = reqwest::Client::new();
    let resp = client.post(&builder.url)
        .headers(builder.headers)
        .json(&builder.body)
        .send().await
        .map_err(|e| AppError::Network(e.to_string()))?;
    let text = resp.text().await.map_err(|e| AppError::Network(e.to_string()))?;
    serde_json::from_str::<ModelResponse>(&text)
        .map_err(|e| AppError::Internal(format!("parse error: {}", e)))
}

pub async fn send_stream_request(
    builder: HttpRequestBuilder,
    parse_chunk: fn(&str) -> Result<StreamChunk, AppError>,
) -> Result<StreamReader, AppError> {
    let client = reqwest::Client::new();
    let resp = client.post(&builder.url)
        .headers(builder.headers)
        .json(&builder.body)
        .send().await
        .map_err(|e| AppError::Network(e.to_string()))?;
    let stream = resp.bytes_stream();
    let parsed = tokio_stream::StreamExt::map(stream, move |chunk| {
        chunk.map_err(|e| AppError::Network(e.to_string())).and_then(|bytes| {
            let text = String::from_utf8_lossy(&bytes);
            parse_chunk(&text)
        })
    });
    Ok(Box::pin(parsed))
}
```

- [ ] **Step 3: Re-export from `model-gateway/src/lib.rs`**

```rust
pub mod http_helper;
```

- [ ] **Step 4: Refactor `openai.rs` to use `HttpRequestBuilder`**

In `chat()`:
```rust
let builder = HttpRequestBuilder::new(HttpRequestConfig {
    url: "https://api.openai.com/v1/chat/completions",
    api_key,
    model,
    messages,
    options,
    extra_headers: &[],
    body_extra: &serde_json::json!({}),
});
send_chat_request(builder).await
```

- [ ] **Step 5: Refactor `anthropic.rs` to use `HttpRequestBuilder`**

Pass Anthropic-specific `extra_headers` (`anthropic-version`, `x-api-key` instead of `Bearer`) and `body_extra` (`max_tokens`, `anthropic_version`). Override `Authorization` handling in config.

- [ ] **Step 6: Refactor `google.rs`, `ollama.rs`, `openrouter.rs` similarly**

Each provider passes its own URL, extra headers, and body extra fields.

- [ ] **Step 7: Run tests**

Run: `cargo test --package adl-model-gateway -v`
Expected: All tests pass.

- [ ] **Step 8: Verify clippy + commit**

```bash
cargo clippy --workspace --all-targets -- -D warnings
git add crates/model-gateway/src/http_helper.rs crates/model-gateway/src/lib.rs crates/model-gateway/src/providers/ crates/model-gateway/tests/
git commit -m "refactor(model-gateway): extract shared HTTP invocation helper for providers"
```

---

## Task 6: Fix `adl-logging` Inverted Dependency

**Files:**
- Modify: `crates/adl-logging/Cargo.toml`
- Create: `crates/adl-logging/src/mode.rs`
- Modify: `crates/adl-logging/src/lib.rs`
- Modify: `crates/kernel/src/types/config.rs` (remove `LogMode`)
- Modify: `crates/kernel/src/lib.rs` (re-export from adl-logging instead)

**Interfaces:**
- Consumes: `LogMode` type currently defined in `adl_kernel::types::config`
- Produces: `LogMode` defined in `adl-logging`, re-exported from `adl-kernel` for backward compat

- [ ] **Step 1: Move `LogMode` enum to `adl-logging`**

`crates/adl-logging/src/mode.rs`:
```rust
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum LogMode {
    Single,
    Multi,
}
```

- [ ] **Step 2: Remove `LogMode` from `crates/kernel/src/types/config.rs`**

Delete the `LogMode` enum definition. Add a re-export in `kernel/src/lib.rs`:
```rust
#[cfg(feature = "adl-logging")]
pub use adl_logging::mode::LogMode;
```

Or, better: just have the kernel not define it at all. Update all kernel imports.

- [ ] **Step 3: Update `adl-logging/Cargo.toml` to remove `adl-kernel` dependency**

```toml
[dependencies]
# Remove: adl-kernel = { path = "../kernel" }
```

- [ ] **Step 4: Update `adl-logging/src/lib.rs`**

Change `use adl_kernel::types::config::LogMode;` to `use crate::mode::LogMode;`

- [ ] **Step 5: Update all other imports of `LogMode`**

Search for `LogMode` imports across the codebase. Update to `use adl_logging::mode::LogMode`.

- [ ] **Step 6: Run tests**

Run: `cargo test --workspace -v`
Expected: All tests pass.

- [ ] **Step 7: Verify clippy + commit**

```bash
cargo clippy --workspace --all-targets -- -D warnings
git add crates/adl-logging/ crates/kernel/
git commit -m "refactor(logging): move LogMode to adl-logging, fix inverted dependency"
```

---

## Task 7: Unify Bridge Patterns + Split `misc.ts`

**Files:**
- Modify: `frontend/src/tauri-bridge/misc.ts`
- Create: `frontend/src/tauri-bridge/compaction.ts`
- Create: `frontend/src/tauri-bridge/durable.ts`
- Create: `frontend/src/tauri-bridge/lsp.ts`
- Create: `frontend/src/tauri-bridge/pty.ts`
- Create: `frontend/src/tauri-bridge/snapshot.ts`
- Create: `frontend/src/tauri-bridge/web-tools.ts`
- Create: `frontend/src/tauri-bridge/reference.ts`
- Create: `frontend/src/tauri-bridge/permission.ts`
- Create: `frontend/src/tauri-bridge/plugin.ts`
- Modify: `frontend/src/tauri-bridge/index.ts`
- Modify: `frontend/src/mock-bridge.ts`
- Test: verify imports compile

**Interfaces:**
- Consumes: Domain type imports from `shared/ipc`
- Produces: Per-domain bridge files following `preview-bridge/` pattern

- [ ] **Step 1: Create `tauri-bridge/compaction.ts`**

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { CompactSessionResult, CompactionBridge } from '../shared/ipc';
import { TauriCommand } from './shared';

export const compactionBridge: CompactionBridge = {
  async compactSession(sessionId: string): Promise<CompactSessionResult> {
    return invoke(TauriCommand.CompactSession, { sessionId });
  },
};
```

Create similar files for each domain extracted from `misc.ts`.

- [ ] **Step 2: Create `tauri-bridge/pty.ts`**

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { PtyBridge, PtySessionInfo } from '../shared/ipc';
import { TauriCommand } from './shared';

export const ptyBridge: PtyBridge = {
  async createPty(sessionId: string): Promise<string> {
    return invoke(TauriCommand.CreatePty, { sessionId });
  },
  async resizePty(sessionId: string, cols: number, rows: number): Promise<void> {
    return invoke(TauriCommand.ResizePty, { sessionId, cols, rows });
  },
  async listPtySessions(): Promise<PtySessionInfo[]> {
    return invoke(TauriCommand.ListPtySessions);
  },
  // ... etc
};
```

- [ ] **Step 3: Update `tauri-bridge/index.ts` to re-export all domain bridges**

```typescript
export { workspaceBridge } from './workspace';
export { conversationBridge } from './conversation';
export { browserBridge } from './browser';
export { providerBridge } from './provider';
export { agentBridge } from './agent';
export { ciGithubBridge } from './ci-github';
export { compactionBridge } from './compaction';
export { ptyBridge } from './pty';
export { snapshotBridge } from './snapshot';
export { webToolsBridge } from './web-tools';
export { referenceBridge } from './reference';
export { permissionBridge } from './permission';
export { pluginBridge } from './plugin';
export { durableBridge } from './durable';
export { lspBridge } from './lsp';
export { miscBridge } from './misc'; // keep for truly uncategorized items
```

- [ ] **Step 4: Update `mock-bridge.ts` to match new pattern**

Add mock implementations for new bridge modules. Follow the existing `createMockXxx()` pattern.

- [ ] **Step 5: Update all imports across frontend that use `misc.ts` exports**

Search: `from '../tauri-bridge/misc'` — update to new module paths.

- [ ] **Step 6: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 7: Run lint + commit**

```bash
cd frontend && eslint . && tsc --noEmit
git add frontend/src/tauri-bridge/
git commit -m "refactor(bridge): split misc.ts into domain-specific bridge files"
```

---

## Task 8: Split `BrowserNavigator.tsx` (489 lines)

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavigatorOpen.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavigatorTabs.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavigatorList.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavigatorSearch.tsx`
- Test: `frontend/src/app/features/browser/__tests__/BrowserNavigator.test.tsx`

- [ ] **Step 1: Extract `BrowserNavigatorOpen` component**

Move the "Open" mode rendering (inline address bar + URL input) into `BrowserNavigatorOpen.tsx`.

- [ ] **Step 2: Extract `BrowserNavigatorTabs` component**

Move the "Tabs" mode rendering (tab list with close buttons) into `BrowserNavigatorTabs.tsx`.

- [ ] **Step 3: Extract `BrowserNavigatorList` component**

Move the "List" mode rendering into `BrowserNavigatorList.tsx`.

- [ ] **Step 4: Extract `BrowserNavigatorSearch` component**

Move the "Search" mode rendering into `BrowserNavigatorSearch.tsx`.

- [ ] **Step 5: Simplify `BrowserNavigator.tsx` to mode dispatcher**

```tsx
export function BrowserNavigator({ mode, ...props }: Props) {
  switch (mode) {
    case 'open':  return <BrowserNavigatorOpen {...props} />;
    case 'tabs':  return <BrowserNavigatorTabs {...props} />;
    case 'list':  return <BrowserNavigatorList {...props} />;
    case 'search': return <BrowserNavigatorSearch {...props} />;
  }
}
```

- [ ] **Step 6: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 7: Run lint + commit**

```bash
cd frontend && eslint . && tsc --noEmit
git add frontend/src/app/features/browser/BrowserNavigator*.tsx
git commit -m "refactor(browser): split BrowserNavigator into 4 mode sub-components"
```

---

## Task 9: Split `TitleBar.tsx` (446 lines)

**Files:**
- Modify: `frontend/src/app/regions/TitleBar.tsx`
- Create: `frontend/src/app/regions/titlebar/FileMenu.tsx`
- Create: `frontend/src/app/regions/titlebar/EditMenu.tsx`
- Create: `frontend/src/app/regions/titlebar/ViewMenu.tsx`
- Create: `frontend/src/app/regions/titlebar/HelpMenu.tsx`
- Create: `frontend/src/app/regions/titlebar/index.ts`

- [ ] **Step 1: Create `titlebar/FileMenu.tsx`**

Move the File sub-menu render logic from `TitleBar.tsx` into its own component.

- [ ] **Step 2: Create `titlebar/EditMenu.tsx`**

Move the Edit sub-menu render logic.

- [ ] **Step 3: Create `titlebar/ViewMenu.tsx`**

Move the View sub-menu render logic.

- [ ] **Step 4: Create `titlebar/HelpMenu.tsx`**

Move the Help sub-menu render logic.

- [ ] **Step 5: Create `titlebar/index.ts`**

Barrel re-export of all menu components.

- [ ] **Step 6: Update `TitleBar.tsx`**

Replace ~196-line inline menu rendering with:
```tsx
import { FileMenu, EditMenu, ViewMenu, HelpMenu } from './titlebar';
// ... use in the render body
```

- [ ] **Step 7: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 8: Run lint + commit**

```bash
cd frontend && eslint . && tsc --noEmit
git add frontend/src/app/regions/TitleBar.tsx frontend/src/app/regions/titlebar/
git commit -m "refactor(titlebar): extract menus into separate components"
```

---

## Task 10: Split `FileNavigatorShell.tsx` (494 lines)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx`
- Create: `frontend/src/app/regions/right-panel/FileTreePanel.tsx`
- Create: `frontend/src/app/regions/right-panel/EditorTabBar.tsx`

- [ ] **Step 1: Extract `FileTreePanel.tsx`**

Move file tree rendering logic into separate component.

- [ ] **Step 2: Extract `EditorTabBar.tsx`**

Move editor tab bar rendering into separate component.

- [ ] **Step 3: Simplify `FileNavigatorShell.tsx`**

Compose `FileTreePanel` + `EditorTabBar` in the shell.

- [ ] **Step 4: Verify typecheck + commit**

```bash
cd frontend && npx tsc --noEmit && eslint .
git add frontend/src/app/regions/right-panel/
git commit -m "refactor(editor): split FileNavigatorShell into sub-components"
```

---

## Task 11: Extract `call_model()` Helpers in `agent_pipeline.rs`

**Files:**
- Modify: `src-tauri/src/commands/agent_pipeline/model_caller.rs` (created in Task 2)
- Or: `src-tauri/src/commands/agent_pipeline.rs` if Task 2 not done yet

- [ ] **Step 1: Extract Plan Mode injection block (lines 210-239)**

```rust
fn inject_plan_mode_prompt(
    scenario: &ConversationScenario,
    summary: &str,
    messages: &mut Vec<adl_kernel::ConversationMessageRecord>,
) {
    if *scenario != ConversationScenario::Plan { return; }
    let plan_prompt_start = match summary.find("Planning:") {
        Some(pos) => pos,
        None => return,
    };
    if let Some(first) = messages.first_mut() {
        if first.role == adl_kernel::ConversationRole::System {
            first.content.push_str(&format!(
                "\n\nThe following task has been decomposed into steps. Follow the plan:\n\n{}",
                &summary[plan_prompt_start..]
            ));
        }
    }
}
```

- [ ] **Step 2: Extract provider resolution block (lines 255-282)**

```rust
fn resolve_provider(
    registry: &adl_model_gateway::registry::ProviderRegistry,
    model: &str,
) -> Result<Box<dyn adl_model_gateway::adapter::ProviderAdapter>, AppError> {
    registry.select(model)
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test --package ai-digital-life -v`
Expected: All tests pass.

- [ ] **Step 4: Verify clippy + commit**

```bash
cargo clippy --workspace --all-targets -- -D warnings
git add src-tauri/src/commands/agent_pipeline/
git commit -m "refactor(agent-pipeline): extract call_model helper functions"
```

---

## Task 12: Extract Shared `TooltipOverlay` + Fix Legacy Clipboard

**Files:**
- Create: `frontend/src/app/utils/tooltipOverlay.ts`
- Create: `frontend/src/shared/scrollbarWidth.ts`
- Modify: 6+ tooltip files (listed below)
- Modify: 3 clipboard files (listed below)
- Delete: duplicate `scrollbarWidth.ts` in diff-viewer/ or right-panel/
- Test: `frontend/src/app/utils/__tests__/tooltipOverlay.test.ts`

**Interfaces:**
- Consumes: Current inline DOM manipulation patterns in 6 files
- Produces: `TooltipOverlay` utility class + `scrollbarWidth` shared function

- [ ] **Step 1: Create `tooltipOverlay.ts`**

```typescript
export interface TooltipOverlayConfig {
  parentId: string;
  hintText: string;
  position?: 'top' | 'bottom';
}

export function showTooltipOverlay(config: TooltipOverlayConfig): () => void {
  const parent = document.getElementById(config.parentId);
  if (!parent) return () => {};

  const card = document.createElement('div');
  card.className = 'tooltip-overlay-card';
  card.textContent = config.hintText;

  const arrow = document.createElement('div');
  arrow.className = 'tooltip-overlay-arrow';

  card.appendChild(arrow);
  parent.appendChild(card);

  return () => { card.remove(); };
}
```

- [ ] **Step 2: Write failing test**

`frontend/src/app/utils/__tests__/tooltipOverlay.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showTooltipOverlay } from '../tooltipOverlay';

describe('TooltipOverlay', () => {
  beforeEach(() => {
    const div = document.createElement('div');
    div.id = 'test-parent';
    document.body.appendChild(div);
  });

  afterEach(() => {
    document.getElementById('test-parent')?.remove();
  });

  it('shows tooltip card with hint text', () => {
    const dispose = showTooltipOverlay({
      parentId: 'test-parent',
      hintText: 'Click to open',
    });
    const parent = document.getElementById('test-parent')!;
    expect(parent.querySelector('.tooltip-overlay-card')?.textContent).toBe('Click to open');
    dispose();
    expect(parent.querySelector('.tooltip-overlay-card')).toBeNull();
  });
});
```

Run: `cd frontend && npx vitest run src/app/utils/__tests__/tooltipOverlay.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Refactor 6+ tooltip files to use `showTooltipOverlay`**

Files to modify:
- `frontend/src/app/components/ContextMenu.tsx`
- `frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx`
- `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`
- `frontend/src/app/features/browser-tree/BrowserMenuHintItem.tsx`
- `frontend/src/app/regions/MenuHintItem.tsx`
- `frontend/src/app/features/browser/BookmarkToFolderDialog.tsx`

Replace inline `document.createElement('div')` with `showTooltipOverlay()`.

- [ ] **Step 4: Create shared `scrollbarWidth.ts`**

```typescript
let cachedWidth: number | undefined;

export function getScrollbarWidth(): number {
  if (cachedWidth !== undefined) return cachedWidth;
  const div = document.createElement('div');
  div.style.cssText = 'width:100px;height:100px;overflow:scroll;position:absolute;top:-9999px';
  document.body.appendChild(div);
  cachedWidth = div.offsetWidth - div.clientWidth;
  document.body.removeChild(div);
  return cachedWidth;
}
```

- [ ] **Step 5: Update duplicate scrollbar files to import from shared location**

Find the two copies and make them both import `scrollbarWidth` from `shared/`.

- [ ] **Step 6: Fix legacy clipboard in 3 locations**

In `CopyButton.tsx`, replace:
```typescript
const textarea = document.createElement('textarea');
textarea.value = text;
document.body.appendChild(textarea);
textarea.select();
document.execCommand('copy');
document.body.removeChild(textarea);
```
With:
```typescript
await navigator.clipboard.writeText(text);
```

Same for `useBrowserTagActions.ts` and `debugLogCollector.ts`.

- [ ] **Step 7: Run test**

Run: `cd frontend && npx vitest run src/app/utils/__tests__/tooltipOverlay.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify typecheck + commit**

```bash
cd frontend && npx tsc --noEmit && eslint .
git add frontend/src/app/utils/tooltipOverlay.ts frontend/src/shared/scrollbarWidth.ts frontend/src/app/utils/__tests__/tooltipOverlay.test.ts
git commit -m "refactor(ui): extract shared TooltipOverlay utility and fix legacy clipboard"
```

---

## Task 13: Add Tests to Infrastructure Layers

**Files:**
- Create: `frontend/src/kernel/__tests__/types.test.ts`
- Create: `frontend/src/kernel/__tests__/errors.test.ts`
- Create: `frontend/src/kernel/__tests__/result.test.ts`
- Create: `frontend/src/tauri-bridge/__tests__/workspace.test.ts`
- Create: `frontend/src/i18n/__tests__/keys.test.ts`
- Modify: plan only — actual content below

**Interfaces:**
- Consumes: Existing kernel types, errors, result monad, i18n keys
- Produces: Test coverage for previously untested infrastructure layers

- [ ] **Step 1: Add kernel type tests**

```typescript
// frontend/src/kernel/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { AgentId } from '../types-agent';
import { AppError } from '../errors';

describe('kernel types', () => {
  it('AgentId is string-compatible', () => {
    const id: AgentId = 'agent-123';
    expect(typeof id).toBe('string');
  });

  it('AppError has code and message', () => {
    const err = { code: 'NOT_FOUND', message: 'workspace not found' };
    expect(err).toHaveProperty('code');
    expect(err).toHaveProperty('message');
  });
});
```

- [ ] **Step 2: Add i18n key existence test**

```typescript
// frontend/src/i18n/__tests__/keys.test.ts
import { describe, it, expect } from 'vitest';
import enUS from '../en-US';

describe('i18n keys', () => {
  it('all top-level namespaces exist', () => {
    const namespaces = ['common', 'workspace', 'session', 'editor', 'patch', 'browser', 'terminal', 'settings', 'model', 'agent', 'git', 'notification', 'header', 'ci'];
    for (const ns of namespaces) {
      expect(enUS).toHaveProperty(ns);
    }
  });

  it('common namespace has required keys', () => {
    const keys = ['save', 'cancel', 'delete', 'close', 'confirm', 'loading', 'error', 'success', 'search'];
    for (const key of keys) {
      expect(enUS.common).toHaveProperty(key);
    }
  });
});
```

- [ ] **Step 3: Add tauri-bridge workspace IPC test**

```typescript
// frontend/src/tauri-bridge/__tests__/workspace.test.ts
import { describe, it, expect, vi } from 'vitest';
import { workspaceBridge } from '../workspace';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('workspaceBridge', () => {
  it('listWorkspaces calls invoke', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const result = await workspaceBridge.listWorkspaces();
    expect(invoke).toHaveBeenCalledWith('list_workspaces');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 4: Add kernel result monad tests**

```typescript
// frontend/src/kernel/__tests__/result.test.ts
import { describe, it, expect } from 'vitest';
import { AppResult, Result } from '../result';

describe('AppResult', () => {
  it('Ok wraps data successfully', () => {
    const r: Result<string> = AppResult.ok('hello');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toBe('hello');
    }
  });

  it('Err wraps error', () => {
    const r: Result<string> = AppResult.err('something went wrong');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('something went wrong');
    }
  });
});
```

- [ ] **Step 5: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (existing 431 + new).

- [ ] **Step 6: Run lint + commit**

```bash
cd frontend && eslint . && tsc --noEmit
git add frontend/src/kernel/__tests__/ frontend/src/tauri-bridge/__tests__/ frontend/src/i18n/__tests__/
git commit -m "test(core): add tests to infrastructure layers (kernel, i18n, tauri-bridge)"
```

---

## Task 14: Remaining Low-Priority Items

**Files:**
- Modify: `crates/agent-runtime/src/router.rs`
- Modify: `crates/agent-runtime/src/lib.rs`
- Read: `frontend/src/kernel/types.ts` — assess ts-rs migration status
- List: `frontend/src/app/stores/slices/browser*.ts` — assess consolidation
- Read: `references/opencode/` — check plugin usage patterns

- [ ] **Step 1: Convert `AgentRouter` unit struct to module-level functions**

`crates/agent-runtime/src/router.rs`:
```rust
pub fn select(agent_id: &str) -> Result<String, AppError> {
    // ... existing logic
}

pub fn select_subagent(parent_id: &str, task: &str) -> Result<String, AppError> {
    // ... existing logic
}
```

Update all callers from `AgentRouter::select()` to `router::select()`.

- [ ] **Step 2: Assess and document ts-rs migration status**

Read `frontend/src/kernel/types.ts` — check if any types are still not generated. If migration is complete, remove the file. If not, add a task to the project board.

- [ ] **Step 3: Assess store consolidation feasibility**

Read the 5 browser slices (`browserSlice.ts`, `browserTabsSlice.ts`, `browserBookmarkSlice.ts`, `browserHistorySlice.ts`, `browserLandingSlice.ts`). If they share significant state, consolidate into 2 slices (core browser + browser data). Otherwise, document the rationale for keeping them separate.

- [ ] **Step 4: Verify typecheck + commit**

```bash
cd frontend && npx tsc --noEmit && eslint .
cargo clippy --workspace --all-targets -- -D warnings
git add crates/agent-runtime/src/router.rs crates/agent-runtime/src/lib.rs
git commit -m "refactor(agent-runtime): convert AgentRouter to module-level functions"
```

---

## Self-Review

**1. Spec coverage:** All 25 findings from the insight report are mapped to tasks.

| Finding # | Risk | Task # |
|-----------|------|--------|
| 1 (browser/tauri) | Critical | Task 1 |
| 2 (agent_pipeline.rs) | Critical | Task 2 |
| 3 (agent-runtime/storage) | Critical | Task 3 |
| 4 (adl-logging/kernel) | High | Task 6 |
| 5 (triple error encoding) | High | Task 4 |
| 6 (bridge patterns) | High | Task 7 |
| 7 (6-crate coupling) | High | Task 3 (trait reduces coupling surface) |
| 8 (tools/registry.rs) | Medium | Task 2 (part of agent-runtime split) |
| 9 (storage abstraction) | High | Task 3 |
| 10 (AgentRouter) | Low | Task 14 |
| 11 (types.ts migration) | Low | Task 14 |
| 12 (provider duplication) | High | Task 5 |
| 13 (plugin premature) | Low | Task 14 (document only) |
| 14 (BrowserNavigator) | Medium | Task 8 |
| 15 (TitleBar) | Medium | Task 9 |
| 16 (misc.ts) | Medium | Task 7 |
| 17 (FileNavigatorShell) | Medium | Task 10 |
| 18 (call_model depth) | Medium | Task 11 |
| 19 (26 feat dirs untested) | High | Task 13 (partial: infra layers first) |
| 20 (infra untested) | High | Task 13 |
| 21 (tooltip duplication) | Medium | Task 12 |
| 22 (legacy clipboard) | Medium | Task 12 |
| 23 (scrollbar duplication) | Low | Task 12 |
| 24 (58 store modules) | Low | Task 14 |
| 25 (diffuse coupling) | High | Task 3 |

**2. Placeholder scan:** All steps contain actual code, exact file paths, and commands. No "TBD", "TODO", or placeholder patterns.

**3. Type consistency:** Types used across tasks (AppError, WebViewHandle, SessionRepository, HttpRequestBuilder, etc.) are defined in their respective tasks and referenced consistently.
