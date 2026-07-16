# Plan C: Storage Dependency Inversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invert the upward dependency from `adl-storage` → `adl-agent-runtime` by defining storage trait interfaces in `adl-kernel` and implementing them in `adl-storage`.

**Architecture:** Currently `crates/storage/Cargo.toml` depends on `crates/agent-runtime`. This violates layered architecture (persistence depending on domain logic). Fix: Extract the session repository and workspace repository traits into `adl-kernel`, move `adl-agent-runtime` dependency from `storage` to `src-tauri` (the composition root), have `agent-runtime` implement the traits and register them in storage.

Wait — actually, let me re-read the actual dependency. Looking at it more carefully:

- `storage` depends on `agent-runtime`
- `storage/src/session_repo_impl.rs` likely implements session persistence for agent-runtime types

The inversion should be:
1. Define `SessionRepository` and other traits in `kernel` (types that use kernel types only)
2. `storage` implements those traits (depends on `kernel` only)
3. `agent-runtime` depends on `kernel` trait types, not on `storage`
4. `src-tauri` wires them together

This is a larger refactor involving trait extraction. Let me scope it carefully.

**Tech Stack:** Rust 2021, thiserror, trait objects or generics

## Global Constraints

- `unwrap()` prohibited in production code — use `?` or pattern matching
- All tests must pass: `cargo test --workspace`
- Clippy zero-warnings: `cargo clippy --workspace --all-targets`
- Follow `rustfmt.toml`

---

### Task 1: Audit the current storage → agent-runtime coupling

**Files:**
- Read-only: `crates/storage/Cargo.toml`
- Read-only: `crates/storage/src/` (all files)
- Read-only: `crates/agent-runtime/src/` (all files)

**Interfaces:**
- Consumes: None (pure investigation)
- Produces: List of all storage types and functions that reference agent-runtime types

- [ ] **Step 1: Find all agent-runtime imports in storage**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
grep -rn "adl_agent_runtime\|adl-agent-runtime" --include="*.rs" crates/storage/ | Select-Object -First 30
```

- [ ] **Step 2: Find what storage functions agent-runtime uses**

```powershell
grep -rn "crate::storage\|adl_storage" --include="*.rs" crates/agent-runtime/ | Select-Object -First 30
```

- [ ] **Step 3: Find what storage functions src-tauri uses**

```powershell
grep -rn "adl_storage" --include="*.rs" src-tauri/ | Select-Object -First 30
```

- [ ] **Step 4: Read the session_repo_impl to understand the trait boundary**

```powershell
Get-Content "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\storage\src\session_repo_impl.rs"
```

Document the exact trait methods and types being used from `agent-runtime`.

**Output**: Write a summary of:
- All agent-runtime types used by storage (e.g., `SessionRepository`, `RunRecord`, etc.)
- All storage functions/types used by agent-runtime
- All storage functions/types used by src-tauri

- [ ] **Step 5: Commit (documentation of findings)**

```powershell
git add -N crates/storage/
git commit -m "chore: document storage-agent-runtime coupling (pre-refactor audit)"
```

---

### Task 2: Define storage trait interfaces in kernel

**Files:**
- Create: `crates/kernel/src/types/storage.rs` — new module for storage traits
- Modify: `crates/kernel/src/types/mod.rs` — add `pub mod storage;`

**Interfaces:**
- Consumes: Kernel types already in `crates/kernel/src/types/` (e.g., `ConversationMessageRecord`, session types)
- Produces: Trait definitions that `storage` can implement without depending on `agent-runtime`

- [ ] **Step 1: Create the storage trait module**

Create `crates/kernel/src/types/storage.rs` with trait definitions extracted from `agent-runtime`'s public interface. Example based on what session_repo likely needs:

```rust
use crate::types::conversation::{ConversationDetail, ConversationMessageRecord};

/// Repository for session persistence.
/// Defined in kernel so both storage (impl) and agent-runtime (consumer)
/// depend only on kernel types.
pub trait SessionRepository: Send + Sync {
    /// Load a conversation by session ID.
    fn load_conversation(&self, session_id: &str) -> Result<Option<ConversationDetail>, crate::AppError>;

    /// Save a conversation.
    fn save_conversation(&self, session_id: &str, detail: &ConversationDetail) -> Result<(), crate::AppError>;

    /// List all sessions for a workspace.
    fn list_sessions(&self, workspace_id: &str) -> Result<Vec<String>, crate::AppError>;

    /// Delete a session.
    fn delete_session(&self, session_id: &str) -> Result<(), crate::AppError>;
}
```

**Note**: Exact trait method signatures depend on what the real `session_repo_impl.rs` implements. Update the above to match actual types found in the audit.

- [ ] **Step 2: Register the module in kernel types**

In `crates/kernel/src/types/mod.rs`, add:

```rust
pub mod storage;
```

- [ ] **Step 3: Verify kernel crate still compiles**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo check -p adl-kernel 2>&1 | Select-String "error"
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```powershell
git add crates/kernel/src/types/storage.rs crates/kernel/src/types/mod.rs
git commit -m "feat: add storage trait interfaces to kernel crate"
```

---

### Task 3: Implement storage traits in storage crate

**Files:**
- Modify: `crates/storage/Cargo.toml` — remove `adl-agent-runtime` dependency
- Modify: `crates/storage/src/lib.rs` — add `impl SessionRepository for StorageDb`
- Modify: `crates/storage/src/session_repo_impl.rs` — adapt to use kernel traits

**Interfaces:**
- Consumes: `SessionRepository` trait from `adl-kernel::types::storage`
- Produces: Concrete `impl SessionRepository for StorageDb` in `adl-storage`

- [ ] **Step 1: Remove agent-runtime dependency from storage/Cargo.toml**

```toml
# Before (in crates/storage/Cargo.toml):
[dependencies]
adl-agent-runtime = { path = "../agent-runtime" }
adl-kernel = { path = "../kernel" }
adl-errors = { path = "../errors" }
# ...

# After:
[dependencies]
adl-kernel = { path = "../kernel" }
adl-errors = { path = "../errors" }
# ...
```

- [ ] **Step 2: Adapt session_repo_impl to use kernel trait types**

Read the current implementation to understand what needs to change.

If the current code implements a struct that wraps `rusqlite::Connection` and provides methods like `load_session`, `save_session` that consume `agent-runtime` types:

```rust
use adl_kernel::types::storage::SessionRepository;
use adl_kernel::types::conversation::ConversationDetail;
use adl_errors::AppError;
use rusqlite::Connection;

pub struct SqliteSessionRepository {
    conn: Connection,
}

impl SessionRepository for SqliteSessionRepository {
    fn load_conversation(&self, session_id: &str) -> Result<Option<ConversationDetail>, AppError> {
        // Existing implementation from session_repo_impl.rs, adapted to use
        // kernel types instead of agent-runtime types
        let mut stmt = self.conn.prepare("SELECT detail FROM sessions WHERE id = ?1")?;
        let mut rows = stmt.query_map(rusqlite::params![session_id], |row| {
            let json: String = row.get(0)?;
            Ok(json)
        })?;
        match rows.next() {
            Some(Ok(json)) => {
                let detail: ConversationDetail = serde_json::from_str(&json)
                    .map_err(|e| AppError::Internal(format!("deserialize session: {e}")))?;
                Ok(Some(detail))
            },
            Some(Err(e)) => Err(AppError::Internal(format!("query session: {e}"))),
            None => Ok(None),
        }
    }

    fn save_conversation(&self, session_id: &str, detail: &ConversationDetail) -> Result<(), AppError> {
        let json = serde_json::to_string(detail)
            .map_err(|e| AppError::Internal(format!("serialize session: {e}")))?;
        self.conn.execute(
            "INSERT OR REPLACE INTO sessions (id, detail) VALUES (?1, ?2)",
            rusqlite::params![session_id, json],
        )?;
        Ok(())
    }

    fn list_sessions(&self, workspace_id: &str) -> Result<Vec<String>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM sessions WHERE workspace_id = ?1 ORDER BY updated_at DESC"
        )?;
        let ids = stmt.query_map(rusqlite::params![workspace_id], |row| {
            row.get(0)
        })?.filter_map(|r| r.ok()).collect();
        Ok(ids)
    }

    fn delete_session(&self, session_id: &str) -> Result<(), AppError> {
        self.conn.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![session_id])?;
        Ok(())
    }
}
```

- [ ] **Step 3: Update storage/src/lib.rs to export the new impl**

```rust
// In crates/storage/src/lib.rs:
pub mod session_repo_impl;
pub use session_repo_impl::SqliteSessionRepository;
```

- [ ] **Step 4: Verify storage crate compiles without agent-runtime**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo check -p adl-storage 2>&1 | Select-String "error"
```

Expected: 0 errors.

- [ ] **Step 5: Run storage tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test -p adl-storage 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 6: Commit**

```powershell
git add crates/storage/
git commit -m "refactor: implement SessionRepository in storage using kernel traits"
```

---

### Task 4: Update agent-runtime to use kernel trait interfaces

**Files:**
- Modify: `crates/agent-runtime/Cargo.toml` — may need to remove direct storage dep if it exists
- Modify: `crates/agent-runtime/src/lib.rs` — use `SessionRepository` from kernel trait instead of concrete types

**Interfaces:**
- Consumes: `SessionRepository` trait from `adl-kernel::types::storage`
- Produces: `AgentRuntime` that takes `Box<dyn SessionRepository>` or generic `T: SessionRepository`

- [ ] **Step 1: Remove direct storage dependency from agent-runtime**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
grep -rn "adl_storage\|adl-storage" --include="*.toml" --include="*.rs" crates/agent-runtime/
```

- [ ] **Step 2: Inject SessionRepository via trait object in AgentRuntime**

In `crates/agent-runtime/src/lib.rs`, change the `AgentRuntime` struct to accept a `Box<dyn SessionRepository>`:

```rust
use adl_kernel::types::storage::SessionRepository;

pub struct AgentRuntime {
    // ... existing fields ...
    session_repo: Box<dyn SessionRepository>,
}

impl AgentRuntime {
    pub fn new(
        // ... existing params ...
        session_repo: Box<dyn SessionRepository>,
    ) -> Self {
        Self {
            // ... existing fields ...
            session_repo,
        }
    }
}
```

- [ ] **Step 3: Update agent-runtime code to use `self.session_repo` instead of direct storage calls**

Replace calls like:
```rust
// Before:
let detail = storage::load_conversation(session_id)?;
// After:
let detail = self.session_repo.load_conversation(session_id)?;
```

- [ ] **Step 4: Verify agent-runtime compiles**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo check -p adl-agent-runtime 2>&1 | Select-String "error"
```

Expected: 0 errors.

- [ ] **Step 5: Run agent-runtime tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test -p adl-agent-runtime 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 6: Commit**

```powershell
git add crates/agent-runtime/
git commit -m "refactor: inject SessionRepository via trait in agent-runtime"
```

---

### Task 5: Wire everything together in src-tauri (composition root)

**Files:**
- Modify: `src-tauri/src/commands/agent.rs` or `src-tauri/src/setup.rs` — where AgentRuntime and Storage are constructed

**Interfaces:**
- Consumes: `SqliteSessionRepository` from `adl-storage`, `AgentRuntime::new` with `Box<dyn SessionRepository>`
- Produces: Working application with inverted dependencies

- [ ] **Step 1: Find agent-runtime and storage construction sites**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
grep -rn "AgentRuntime::new\|StorageDb::new\|adl_storage::" --include="*.rs" src-tauri/ | Select-Object -First 20
```

- [ ] **Step 2: Update construction to wire trait impl**

In `setup.rs` or wherever the construction happens, change from:

```rust
// Before:
use adl_storage::StorageDb;
use adl_agent_runtime::AgentRuntime;

let storage = StorageDb::new(db_path)?;
let runtime = AgentRuntime::new(storage, ...)?;
```

To:

```rust
// After:
use adl_storage::SqliteSessionRepository;
use adl_agent_runtime::AgentRuntime;
use adl_kernel::types::storage::SessionRepository;

let session_repo = SqliteSessionRepository::new(db_path)?;
let runtime = AgentRuntime::new(
    Box::new(session_repo) as Box<dyn SessionRepository>,
    ...,
)?;
```

- [ ] **Step 3: Verify full workspace compiles**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo check --workspace 2>&1 | Select-String "error"
```

Expected: 0 errors across all 22 crates + binary.

- [ ] **Step 4: Run full workspace tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test --workspace 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. 488 passed; 0 failed`

- [ ] **Step 5: Run clippy across workspace**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo clippy --workspace --all-targets 2>&1 | Select-String "warning|error"
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/
git commit -m "refactor: wire storage trait via composition root in src-tauri"
```
