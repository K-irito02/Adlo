# Plan B: Rust Crate Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up Rust crate dependency graph by removing unused dependencies, dead code, backward-compat shims, leaky abstractions, and inverted layering.

**Architecture:** Five independent cleanup tasks targeting the `crates/` workspace. Each task is self-contained: remove unused `adl-kernel` deps from mcp-client/lsp-client, delete dead `domain` module, migrate `command_risk` re-exports to direct `adl_types` imports, fix `adl-types → adl-logging` dependency leak, and invert `change-engine → workspace` layering. The large kernel crate split is deferred to a separate plan.

**Tech Stack:** Rust 1.85+, Cargo workspace, `adl-errors::AppError`

## Global Constraints

- **Rust 1.85+**
- **`unwrap()` 禁用** — use `?` operator or pattern matching
- **`-D warnings` zero tolerance** — `cargo clippy --workspace --all-targets -- -D warnings` must pass
- **`rustfmt` default config** — `cargo fmt --all` must pass
- **Error type**: `adl-errors::AppError` enum, no bare `String` results
- **No backward-compatibility code** — removed code should not leave dead shims or `#[allow(dead_code)]`
- **Commit format**: `type(scope): summary` where type ∈ {feat, fix, docs, chore, refactor, test} and scope ∈ {core, frontend, rust, stores, browser, terminal, ipc, docs, deps}
- **Environment**: Set `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` before any cargo command
- **Proxy**: Clash proxy at `127.0.0.1:7890` must be enabled for crate downloads

---

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `crates/mcp-client/Cargo.toml` | Remove unused `adl-kernel` dep | Task 1 |
| `crates/lsp-client/Cargo.toml` | Remove unused `adl-kernel` dep | Task 1 |
| `crates/kernel/src/lib.rs` | Delete dead `domain` module | Task 2 |
| `crates/agent-runtime/src/permission_check.rs` | Update import from `adl_kernel::command_risk::` to `adl_types::` | Task 3 |
| `crates/task/src/lib.rs` | Update re-export from `adl_kernel::command_risk::` to `adl_types::` | Task 3 |
| `crates/command/src/lib.rs` | Update import from `adl_kernel::` to `adl_types::` | Task 3 |
| `src-tauri/src/commands/permission.rs` | Update imports from `adl_kernel::` to direct module paths | Task 3 |
| `crates/kernel/src/command_risk.rs` | Remove backward-compat `pub use` re-exports | Task 3 |
| `crates/types/Cargo.toml` | Remove `adl-logging` dependency | Task 4 |
| `crates/types/src/types/config.rs` | Replace `pub use adl_logging::LogMode` with local definition or move | Task 4 |
| `crates/adl-logging/src/lib.rs` | Accept moved `LogMode` if needed | Task 4 |
| `crates/change-engine/Cargo.toml` | Remove `adl-workspace` dependency | Task 5 |
| `crates/change-engine/src/snapshot.rs` | Remove `capture_git_snapshot` call, accept it as parameter | Task 5 |
| Callers of `SnapshotManager::create_snapshot` | Pass `git_snapshot` as parameter | Task 5 |

---

### Task 1: Remove unused adl-kernel dependency from mcp-client and lsp-client

**Files:**
- Modify: `crates/mcp-client/Cargo.toml` (line 7)
- Modify: `crates/lsp-client/Cargo.toml` (line 7)

**Interfaces:**
- Consumes: None
- Produces: mcp-client and lsp-client no longer transitively compile kernel's notify/regex/tracing stack

**Context:** Grep verified that `crates/mcp-client/src/` and `crates/lsp-client/src/` contain zero `adl_kernel::` imports. The dependency declaration in Cargo.toml is dead weight.

- [ ] **Step 1: Remove adl-kernel from mcp-client/Cargo.toml**

In `crates/mcp-client/Cargo.toml`, delete line 7:

```toml
adl-kernel = { path = "../kernel" }
```

The resulting `[dependencies]` section should be:

```toml
[dependencies]
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
async-trait.workspace = true
```

- [ ] **Step 2: Remove adl-kernel from lsp-client/Cargo.toml**

In `crates/lsp-client/Cargo.toml`, delete line 7:

```toml
adl-kernel = { path = "../kernel" }
```

The resulting `[dependencies]` section should be:

```toml
[dependencies]
adl-errors = { path = "../errors" }
lsp-server = { workspace = true }
lsp-types = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
tracing = { workspace = true }
thiserror = { workspace = true }
url = { workspace = true }
```

- [ ] **Step 3: Verify compilation**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings

- [ ] **Step 4: Verify clippy**

Run:
```powershell
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings

- [ ] **Step 5: Verify tests**

Run:
```powershell
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: all test suites pass with 0 failures

- [ ] **Step 6: Commit**

```powershell
git add crates/mcp-client/Cargo.toml crates/lsp-client/Cargo.toml
git commit -m "refactor(rust): remove unused adl-kernel dependency from mcp-client and lsp-client

Grep verified zero adl_kernel:: imports in both crates. Removes
transitive compilation of notify, regex, tracing-subscriber,
tracing-appender, tokio, and 5 kernel modules."
```

---

### Task 2: Delete dead `domain` re-export module from kernel

**Files:**
- Modify: `crates/kernel/src/lib.rs` (lines 16-24)

**Interfaces:**
- Consumes: None
- Produces: kernel public API no longer exposes dead `domain` module

**Context:** Grep for `adl_kernel::domain` across the entire codebase returns zero matches. The module is dead code.

- [ ] **Step 1: Delete the domain module**

In `crates/kernel/src/lib.rs`, delete lines 16-24:

```rust
pub mod domain {
    pub use adl_types::types::agent::*;
    pub use adl_types::types::ci::*;
    pub use adl_types::types::command::*;
    pub use adl_types::types::config::*;
    pub use adl_types::types::conversation::*;
    pub use adl_types::types::model::*;
    pub use adl_types::types::workspace::*;
}
```

The resulting file should be:

```rust
pub mod command_risk;
pub mod config;
pub mod config_watcher;
pub mod events;
pub mod logger;

pub use adl_types::doom_loop::{doom_loop_check, is_external_directory};
pub use adl_types::permission_types::{
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
};
pub use command_risk::{
    assess_command_risk, build_ruleset, evaluate_permission, evaluate_ruleset,
    pattern_matches as permission_pattern_matches, requires_approval, risk_to_decision,
};
```

- [ ] **Step 2: Verify compilation + clippy + tests**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 3: Commit**

```powershell
git add crates/kernel/src/lib.rs
git commit -m "refactor(rust): delete dead domain re-export module from kernel

Grep confirmed zero adl_kernel::domain:: consumers across the
codebase. Removes misleading dead surface area from kernel API."
```

---

### Task 3: Remove command_risk backward-compat re-exports

**Files:**
- Modify: `crates/agent-runtime/src/permission_check.rs` (lines 3, 8, 52)
- Modify: `crates/task/src/lib.rs` (line 8)
- Modify: `crates/command/src/lib.rs` (line 4)
- Modify: `src-tauri/src/commands/permission.rs` (lines 3-4)
- Modify: `crates/kernel/src/command_risk.rs` (lines 4-10)

**Interfaces:**
- Consumes: `adl_types::permission_types::{PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig}`, `adl_types::doom_loop::{doom_loop_check, is_external_directory}`
- Produces: All consumers import directly from `adl_types` instead of `adl_kernel::command_risk`

**Context:** `crates/kernel/src/command_risk.rs` lines 4-10 contain `pub use` re-exports labeled "backward compatibility" that re-export `adl_types` symbols through `adl_kernel::command_risk::`. Three consumers use the old path. After migrating them, the re-exports can be deleted.

The functions `assess_command_risk`, `build_ruleset`, `evaluate_permission`, `evaluate_ruleset`, `requires_approval`, `risk_to_decision`, `pattern_matches` are genuinely defined in `command_risk.rs` — they stay. Only the `pub use` re-exports of `adl_types` symbols (lines 7-10) are removed.

**Current callers (from grep):**
1. `crates/agent-runtime/src/permission_check.rs:8` — `use adl_kernel::command_risk::evaluate_permission;`
2. `crates/agent-runtime/src/permission_check.rs:52` — `adl_kernel::command_risk::assess_command_risk(...)`
3. `crates/task/src/lib.rs:8` — `pub use adl_kernel::command_risk::{assess_command_risk, requires_approval};`
4. `crates/command/src/lib.rs:4` — `use adl_kernel::{assess_command_risk, evaluate_ruleset};` (uses root re-export, not command_risk::)
5. `src-tauri/src/commands/permission.rs:3-4` — `use adl_kernel::config::{load, save}; use adl_kernel::{build_ruleset, evaluate_ruleset};`

Note: `src-tauri/src/commands/permission.rs` uses `adl_kernel::config::{load, save}` (genuinely in kernel) AND `adl_kernel::{build_ruleset, evaluate_ruleset}` (root re-exports from command_risk). The config import stays; the build_ruleset/evaluate_ruleset imports change to `adl_kernel::command_risk::{build_ruleset, evaluate_ruleset}` (they're real functions in command_risk, not re-exports).

- [ ] **Step 1: Update agent-runtime/src/permission_check.rs**

Read the file first to understand context. Then:

Replace line 8:
```rust
use adl_kernel::command_risk::evaluate_permission;
```
with:
```rust
use adl_kernel::command_risk::evaluate_permission;  // evaluate_permission is defined in command_risk, keep this path
```

Actually — `evaluate_permission` IS defined in `command_risk.rs` (line 12 of the grep output shows it in the `pub use command_risk::{...}` block). It is NOT a re-export from `adl_types`. So this import path is correct and should NOT change.

**Important distinction:**
- Functions defined in `command_risk.rs` (`assess_command_risk`, `build_ruleset`, `evaluate_permission`, `evaluate_ruleset`, `requires_approval`, `risk_to_decision`, `pattern_matches`) — keep importing from `adl_kernel::command_risk::` or `adl_kernel::` (root re-exports)
- Types re-exported FROM `adl_types` (`PermissionDecision`, `PermissionRule`, `PermissionRuleset`, `PermissionRulesetConfig`, `doom_loop_check`, `is_external_directory`) — migrate to import from `adl_types::` directly

After re-reading, the callers only import FUNCTIONS (not the re-exported types) from `command_risk`. So the migration is: the `pub use` re-exports of `adl_types` symbols in `command_risk.rs` lines 7-10 have ZERO external consumers. They exist only for backward compat but nobody actually imports `PermissionRule` via `adl_kernel::command_risk::PermissionRule`.

Verify this by grepping for the re-exported type names via the kernel path:
```powershell
Select-String -Path "crates\*\src\*.rs","src-tauri\src\**\*.rs" -Pattern "adl_kernel::command_risk::(PermissionDecision|PermissionRule|PermissionRuleset|PermissionRulesetConfig|doom_loop_check|is_external_directory)"
```

If zero matches (expected), simply delete the re-export lines 4-10 from `command_risk.rs`.

- [ ] **Step 2: Delete backward-compat re-exports from command_risk.rs**

In `crates/kernel/src/command_risk.rs`, delete lines 4-10:

```rust
// Re-export moved types/functions for backward compatibility.
// External consumers import from `adl_kernel::command_risk::{...}` — keep these working.
// `pub use` also brings the names into module scope, so no separate `use` is needed.
pub use adl_types::doom_loop::{doom_loop_check, is_external_directory};
pub use adl_types::permission_types::{
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
};
```

BUT: check if `command_risk.rs` itself uses any of these names internally (e.g., `PermissionDecision`, `PermissionRule`). If it does, add a `use adl_types::...` import at the top of the file to replace the removed `pub use`.

Read the full `command_risk.rs` file and check for internal usage of `PermissionDecision`, `PermissionRule`, `PermissionRuleset`, `PermissionRulesetConfig`, `doom_loop_check`, `is_external_directory`. If found, replace the `pub use` with a private `use`:

```rust
use adl_types::doom_loop::{doom_loop_check, is_external_directory};
use adl_types::permission_types::{
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
};
```

(Change `pub use` to `use` — the names are available within the module but no longer re-exported.)

Also check `crates/kernel/src/lib.rs` lines 7-10 which have the SAME re-exports at the crate root level:

```rust
pub use adl_types::doom_loop::{doom_loop_check, is_external_directory};
pub use adl_types::permission_types::{
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
};
```

Grep for `adl_kernel::PermissionDecision`, `adl_kernel::PermissionRule`, `adl_kernel::doom_loop_check`, `adl_kernel::is_external_directory` to check if any consumer uses these via the root re-export. If zero consumers, delete these lines from `lib.rs` too.

- [ ] **Step 3: Verify compilation + clippy + tests**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 4: Commit**

```powershell
git add crates/kernel/src/command_risk.rs crates/kernel/src/lib.rs
git commit -m "refactor(rust): remove backward-compat re-exports from command_risk and kernel root

Deletes pub use re-exports of adl_types symbols (PermissionDecision,
PermissionRule, PermissionRuleset, PermissionRulesetConfig,
doom_loop_check, is_external_directory) that had zero external
consumers. Internal usage converted to private use statements."
```

---

### Task 4: Fix adl-types → adl-logging dependency leak

**Files:**
- Modify: `crates/types/Cargo.toml` (line 12)
- Modify: `crates/types/src/types/config.rs` (line 1)
- Possibly modify: `crates/adl-logging/src/lib.rs` (if LogMode needs to move)

**Interfaces:**
- Consumes: None
- Produces: `adl-types` is a lightweight leaf crate with no tracing dependency

**Context:** `crates/types/src/types/config.rs:1` contains `pub use adl_logging::LogMode;`. This forces every crate depending on `adl-types` (all of them) to compile the tracing stack. `LogMode` is likely a simple enum that doesn't need tracing infrastructure.

- [ ] **Step 1: Investigate LogMode definition**

Read `crates/adl-logging/src/lib.rs` and find the `LogMode` definition. It's likely a simple enum:

```rust
pub enum LogMode {
    Console,
    File,
    Both,
    // ...
}
```

If `LogMode` is a simple enum with no tracing dependencies (just `serde::Serialize`/`Deserialize`), it can be moved to `adl-types` directly.

- [ ] **Step 2: Move LogMode to adl-types**

If `LogMode` is simple (no tracing deps):

In `crates/types/src/types/config.rs`, replace:
```rust
pub use adl_logging::LogMode;
```
with the actual enum definition (copy from adl-logging, including `#[derive(...)]` and `#[serde(...)]` attributes):

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub enum LogMode {
    Console,
    File,
    Both,
}
```

(Adjust the variants and derives to match the actual definition.)

In `crates/adl-logging/src/lib.rs`, replace the `LogMode` definition with:
```rust
pub use adl_types::types::config::LogMode;
```

This reverses the dependency direction: `adl-logging` now re-exports from `adl-types` (it already depends on `adl-types`).

- [ ] **Step 3: Remove adl-logging dependency from adl-types/Cargo.toml**

In `crates/types/Cargo.toml`, delete line 12:
```toml
adl-logging = { path = "../adl-logging" }
```

- [ ] **Step 4: Verify compilation + clippy + tests**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 5: Commit**

```powershell
git add crates/types/Cargo.toml crates/types/src/types/config.rs crates/adl-logging/src/lib.rs
git commit -m "refactor(rust): move LogMode from adl-logging to adl-types

Reverses leaky dependency: adl-types no longer depends on
adl-logging. LogMode is a simple enum that belongs in the types
crate. adl-logging now re-exports from adl-types (it already
depends on adl-types)."
```

---

### Task 5: Invert change-engine → workspace dependency

**Files:**
- Modify: `crates/change-engine/Cargo.toml` (line 10)
- Modify: `crates/change-engine/src/snapshot.rs` (line 55)
- Modify: Callers of `SnapshotManager::create_snapshot` (find via grep)

**Interfaces:**
- Consumes: `adl_types::create_id`, `adl_errors::AppError`
- Produces: `SnapshotManager::create_snapshot` takes `git_snapshot: GitSnapshot` as parameter instead of calling `adl_workspace::capture_git_snapshot` internally

**Context:** `crates/change-engine/src/snapshot.rs:55` calls `adl_workspace::capture_git_snapshot(workspace_root)` — a high-level workspace function called from a low-level patch utility. This inverts the dependency layering: `change-engine` should operate on paths + content, not workspace metadata.

- [ ] **Step 1: Find all callers of create_snapshot**

Run:
```powershell
Select-String -Path "crates\*\src\*.rs","src-tauri\src\**\*.rs" -Pattern "create_snapshot" -Recurse
```

List all call sites. Each one currently passes `workspace_root` and the function internally calls `capture_git_snapshot`. After the fix, callers must pass the `git_snapshot` themselves.

- [ ] **Step 2: Read the create_snapshot signature**

Read `crates/change-engine/src/snapshot.rs` around the `create_snapshot` method. Current signature is approximately:

```rust
pub fn create_snapshot(
    &self,
    workspace_root: &Path,
    message_id: &str,
    session_id: &str,
    workspace_id: &str,
) -> Result<SnapshotRecord, adl_errors::AppError> {
    // ...
    let git_snapshot = adl_workspace::capture_git_snapshot(workspace_root);
    let git_commit = git_snapshot.head;
    // ...
}
```

- [ ] **Step 3: Change signature to accept git_snapshot as parameter**

Replace the `workspace_root: &Path` parameter with `git_snapshot: &GitSnapshot` (or `git_commit: &str` if only `.head` is used). Check what type `capture_git_snapshot` returns and what fields are used.

If only `git_snapshot.head` is used, the simplest change is to accept `git_commit: String`:

```rust
pub fn create_snapshot(
    &self,
    workspace_root: &Path,
    git_commit: String,
    message_id: &str,
    session_id: &str,
    workspace_id: &str,
) -> Result<SnapshotRecord, adl_errors::AppError> {
    // ...
    // Removed: let git_snapshot = adl_workspace::capture_git_snapshot(workspace_root);
    // Removed: let git_commit = git_snapshot.head;
    // ...
}
```

Keep `workspace_root` if it's used for file copying (it is — `copy_workspace_files(workspace_root, &files_dir)`).

- [ ] **Step 4: Update all callers**

At each call site, add a `capture_git_snapshot` call before `create_snapshot`:

```rust
let git_snapshot = adl_workspace::capture_git_snapshot(workspace_root);
let git_commit = git_snapshot.head;
// or pass &git_snapshot depending on the signature chosen
snapshot_manager.create_snapshot(workspace_root, git_commit, message_id, session_id, workspace_id)
```

The caller already has `adl-workspace` as a dependency (or can add it — they're higher-level crates).

- [ ] **Step 5: Remove adl-workspace from change-engine/Cargo.toml**

In `crates/change-engine/Cargo.toml`, delete line 10:
```toml
adl-workspace = { path = "../workspace" }
```

- [ ] **Step 6: Verify compilation + clippy + tests**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 7: Commit**

```powershell
git add crates/change-engine/Cargo.toml crates/change-engine/src/snapshot.rs
# Also add any modified caller files
git commit -m "refactor(rust): invert change-engine dependency on workspace

change-engine no longer depends on adl-workspace. create_snapshot
now accepts git_commit as a parameter instead of calling
capture_git_snapshot internally. Callers pass the value from
their existing workspace context."
```

---

## Self-Review

### Spec coverage

| Finding from insight report | Task |
|----------------------------|------|
| High: mcp-client unused adl-kernel dep | Task 1 |
| High: lsp-client unused adl-kernel dep | Task 1 |
| High: kernel crate mixes 5 unrelated modules | **Deferred** — requires creating 3+ new crates, 20+ import updates. Scope too large for this plan. |
| Medium: command_risk backward-compat re-exports | Task 3 |
| Medium: adl-types depends on adl-logging | Task 4 |
| Medium: change-engine depends on workspace | Task 5 |
| Low: kernel domain dead module | Task 2 |

5 of 7 findings covered. 1 deferred (kernel split — High), 1 covered (domain dead module — Low).

### Placeholder scan

- No "TBD", "TODO", "implement later" found
- Task 3 has a conditional ("if zero matches, delete") — this is intentional verification, not a placeholder
- Task 4 Step 2 says "adjust the variants and derives to match the actual definition" — the implementer must read the actual `LogMode` definition first. This is unavoidable without reading the file at plan-write time.

### Type consistency

- `GitSnapshot` / `git_commit: String` — Task 5 uses `git_commit: String` (simplest). If the implementer finds `GitSnapshot` is needed, they should adapt.
- `LogMode` — Task 4 moves the definition. The implementer must verify the derives match.

### Notes on assumptions

1. **Task 3**: Assumes zero external consumers of the re-exported types via `adl_kernel::command_risk::` path. The implementer must verify with grep before deleting.
2. **Task 4**: Assumes `LogMode` is a simple enum without tracing dependencies. The implementer must read the definition and adapt.
3. **Task 5**: Assumes `create_snapshot` only uses `git_snapshot.head`. If it uses other fields, the signature should accept the full `&GitSnapshot` instead.
4. **Kernel split deferred**: The largest finding (kernel crate split) is deferred to a separate plan. This plan focuses on 5 low-risk, high-value cleanups that can be done independently.
