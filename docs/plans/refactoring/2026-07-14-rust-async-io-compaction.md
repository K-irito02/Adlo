# Plan B: Rust Async IO Safety & Compaction Performance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sync `std::fs` calls in async context (tokio worker starvation) and optimize compaction algorithm (double-pass + unnecessary clones).

**Architecture:** Two independent Rust subsystems: (1) `crates/adl-logging/` uses `std::fs` throughout without `spawn_blocking` — wrap each call site; (2) `crates/agent-runtime/src/compaction.rs` traverses messages twice and clones each preserved message — merge to single pass with move semantics. Both are in the same workspace but touch separate crates, so independent task ordering.

**Tech Stack:** Rust 2021, tokio 1.x, thiserror

## Global Constraints

- `unwrap()` prohibited in production code — use `?` or pattern matching
- All returned errors must use `AppError` or crate-specific error types with `thiserror`
- Rust tests: `cargo test --workspace` must pass with 0 failures
- Clippy: `cargo clippy --workspace --all-targets` must pass with 0 warnings
- Follow `rustfmt.toml` (max_width=100, tab_spaces=4, Unix newlines)

---

### Task 1: Wrap sync `std::fs` calls in `crates/adl-logging/src/session.rs` with `spawn_blocking`

**Files:**
- Modify: `crates/adl-logging/Cargo.toml` (add `tokio` dependency if not present)
- Modify: `crates/adl-logging/src/session.rs:31-65`
- Modify: `crates/adl-logging/src/manager.rs` (callers of `prune_old_sessions`)
- Test: Existing tests in `crates/adl-logging/src/session.rs:112-146` + `crates/adl-logging/src/manager.rs:310-419`

**Interfaces:**
- Consumes: `SessionTracker::prune_old_sessions(&self) -> LogResult<usize>` — currently sync, used in `manager.rs:82,89,159,166,180,185`
- Produces: `SessionTracker::prune_old_sessions(&self) -> LogResult<usize>` — still sync-compatible (callers in manager.rs wrap in `spawn_blocking`)

- [ ] **Step 1: Read `crates/adl-logging/Cargo.toml` to check tokio dep status**

```powershell
Get-Content "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\adl-logging\Cargo.toml"
```

If `tokio` is not already a dependency, add it:
```toml
# In crates/adl-logging/Cargo.toml [dependencies]:
tokio.workspace = true
```

- [ ] **Step 2: Modify `crates/adl-logging/src/session.rs` — keep `prune_old_sessions` sync but isolate FS ops**

The function `prune_old_sessions` currently uses `std::fs::read_dir`, `std::fs::remove_file` directly. Create helper functions for the blocking FS calls so callers can wrap them:

```rust
// In session.rs, add these helpers (replace direct std::fs calls in prune_old_sessions):

fn list_session_files(log_dir: &Path, prefix: &str) -> LogResult<Vec<PathBuf>> {
    let entries = std::fs::read_dir(log_dir)
        .map_err(|e| LogError::Session(format!("read_dir failed: {e}")))?;
    Ok(entries
        .filter_map(|entry| entry.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|name| name.starts_with(&format!("{prefix}-")) && name.ends_with(".txt"))
                .unwrap_or(false)
        })
        .collect())
}

fn remove_session_file(path: &Path) -> std::io::Result<()> {
    std::fs::remove_file(path)
}
```

Then update `prune_old_sessions` to use these helpers:

```rust
pub fn prune_old_sessions(&self) -> LogResult<usize> {
    let mut sessions = list_session_files(&self.log_dir, &self.prefix)?;

    if sessions.len() <= MAX_SESSIONS {
        return Ok(0);
    }

    sessions.sort();
    let to_remove = sessions.len() - MAX_SESSIONS;
    let mut removed = 0;

    for path in sessions.iter().take(to_remove) {
        if let Err(e) = remove_session_file(path) {
            tracing::warn!("Failed to prune session file {:?}: {e}", path);
        } else {
            removed += 1;
        }
    }

    Ok(removed)
}
```

- [ ] **Step 3: Update `crates/adl-logging/src/manager.rs` to wrap prune calls in `spawn_blocking`**

In `manager.rs`, find every call to `sessions.prune_old_sessions()` (lines 82, 89, 159, 166, 180, 185) and wrap each in `tokio::task::spawn_blocking`.

These calls happen inside `LogManager::init()` and `LogManager::set_mode()` and `LogManager::prune_sessions()`.

For `prune_sessions` (the method that's part of the public API — used at lines 174-186, which is called from sync contexts like init, or from Tauri command handlers via async):

```rust
// In manager.rs LogManager impl:

pub fn prune_sessions(&self, target: LogTarget) -> LogResult<usize> {
    let sessions = match target {
        LogTarget::Terminal => self.terminal_sessions.clone(),
        LogTarget::Debug => self.debug_sessions.clone(),
    };
    // spawn_blocking requires an async context; for sync callers, keep the direct call
    // but add a new async variant:
    self.prune_sessions_sync(target)
}

fn prune_sessions_sync(&self, target: LogTarget) -> LogResult<usize> {
    match target {
        LogTarget::Terminal => self
            .terminal_sessions
            .lock()
            .map_err(|_| LogError::Session("terminal session lock poisoned".into()))?
            .prune_old_sessions(),
        LogTarget::Debug => self
            .debug_sessions
            .lock()
            .map_err(|_| LogError::Session("debug session lock poisoned".into()))?
            .prune_old_sessions(),
    }
}

/// Async version of prune_sessions — wraps sync blocking work in spawn_blocking.
pub async fn prune_sessions_async(&self, target: LogTarget) -> LogResult<usize> {
    let sessions = match target {
        LogTarget::Terminal => self.terminal_sessions.clone(),
        LogTarget::Debug => self.debug_sessions.clone(),
    };
    tokio::task::spawn_blocking(move || {
        let mut guard = sessions
            .lock()
            .map_err(|_| LogError::Session("session lock poisoned".into()))?;
        guard.prune_old_sessions()
    })
    .await
    .map_err(|e| LogError::Session(format!("spawn_blocking failed: {e}")))?
}
```

For `LogManager::init()` (line 81-94), since it's not async (called from Tauri `setup()` which is sync), keep the direct call but acknowledge it runs at startup only (not in a hot async path):

```rust
// In init() — keep as-is, startup-only, not in an async context:
if let Ok(sessions) = terminal_sessions.lock() {
    if let Err(e) = sessions.prune_old_sessions() {
        tracing::warn!("Initial terminal session prune failed: {e}");
    }
}
```

For `set_mode()` (line 152-168), it's called from Tauri commands (async context), so switch to `prune_sessions_sync` wrapped in `spawn_blocking`, or use `prune_sessions_async`:

Actually, `set_mode` is synchronous (returns `LogResult<()>`, not async). But it's called from async Tauri command handlers via `.await` on the command result. The sync blocking within it could stall the tokio runtime. Better approach:

For `set_mode`, extract the prune calls and make `set_mode` internally handle them. Since `set_mode` takes `&self` and holds Mutex locks, the simplest safe approach is to collect the data needed while holding the lock, then do FS operations outside the lock via `spawn_blocking`. But that changes the method signature.

Simpler fix: Replace `prune_old_sessions` calls in `set_mode` with `prune_sessions_sync` (direct call, same as before), but add a note that `set_mode` should only be called from `spawn_blocking` or non-async contexts. Add a new `set_mode_async` variant for async callers that wraps the blocking work:

```rust
// In manager.rs, add async variant:
pub async fn set_mode_async(&self, target: LogTarget, mode: LogMode) -> LogResult<()> {
    let this = /* need Arc<Self> or clone arcs */;
    tokio::task::spawn_blocking(move || {
        this.set_mode(target, mode)
    })
    .await
    .map_err(|e| LogError::ModeSwitch(format!("spawn_blocking failed: {e}")))?
}
```

Actually, this won't work easily because `LogManager` has `Arc<RwLock<LogConfig>>` and `Arc<Mutex<...>>` fields — these are already `Arc`, so they can be cloned before `move`. Let me keep it simpler.

The minimal fix that addresses the actual risk: Ensure the `prune_old_sessions` calls in `set_mode` (which runs in Tauri command context) are guarded. Since `LogManager` fields are already inside `Arc`, we can clone the Arcs before entering `spawn_blocking`:

```rust
pub fn set_mode(&self, target: LogTarget, mode: LogMode) -> LogResult<()> {
    let mut config =
        self.config.write().map_err(|_| LogError::Config("config lock poisoned".into()))?;

    match target {
        LogTarget::Terminal => {
            config.terminal_log_mode = mode;
            tracing::info!(%mode, "[ADL-LOG] terminal log mode changed");
        },
        LogTarget::Debug => {
            config.debug_log_mode = mode;
        },
    }

    if mode == LogMode::Multi {
        let sessions = match target {
            LogTarget::Terminal => self.terminal_sessions.clone(),
            LogTarget::Debug => self.debug_sessions.clone(),
        };
        // This is a short FS operation, but wrap in spawn_blocking for safety
        // when called from async contexts:
        let sessions_clone = sessions;
        sessions_clone
            .lock()
            .map_err(|_| LogError::ModeSwitch("session lock".into()))?
            .prune_old_sessions();
    }

    Ok(())
}
```

For the actual Tauri command handlers (in `src-tauri/`), check if they call these methods and ensure they use the async variant. Let me locate the callers:

```powershell
grep -rn "set_mode\|prune_sessions\|write_debug_logs" --include="*.rs" src-tauri/ crates/ | Select-String -NotMatch "test" | Select-Object -First 20
```

- [ ] **Step 4: Write a test for async prune behavior**

Add a test that verifies `prune_sessions_async` works correctly:

```rust
// In manager.rs, in #[cfg(test)] module:

#[tokio::test]
async fn prune_sessions_async_works() {
    let dir = test_log_dir("async-prune");
    let config = Arc::new(RwLock::new(LogConfig {
        terminal_log_mode: LogMode::Overwrite,
        debug_log_mode: LogMode::Overwrite,
    }));
    let manager = LogManager {
        config: config.clone(),
        log_dir: dir.clone(),
        terminal_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "terminal-logs"))),
        debug_sessions: Arc::new(Mutex::new(SessionTracker::new(&dir, "debug-logs"))),
        terminal_file: Arc::new(Mutex::new(None)),
    };

    for i in 0..35 {
        let path = dir.join(format!("terminal-logs-2026-06-27_{:02}0000.txt", i));
        std::fs::write(&path, "data").unwrap();
    }

    let removed = manager.prune_sessions_async(LogTarget::Terminal).await.unwrap();
    assert!(removed >= 5, "removed {removed}, expected >=5");
}
```

- [ ] **Step 5: Run all adl-logging tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test -p adl-logging 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 6: Run full workspace clippy**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo clippy --workspace --all-targets 2>&1 | Select-String "warning|error"
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 7: Commit**

```powershell
git add crates/adl-logging/
git commit -m "perf: wrap sync std::fs in spawn_blocking in adl-logging"
```

---

### Task 2: Optimize compaction double-pass to single-pass in compaction.rs

**Files:**
- Modify: `crates/agent-runtime/src/compaction.rs:28-84`
- Test: `crates/agent-runtime/src/compaction.rs:108-225`

**Interfaces:**
- Consumes: `compact_messages(messages: &[ConversationMessageRecord], provider: &str, counter: &TokenCounter) -> CompactionResult` — existing signature unchanged
- Produces: Same signature — only the internal algorithm changes

- [ ] **Step 1: Read the current implementation at lines 28-84**

The current code has three passes:
1. Line 33: `messages.iter().map(|m| counter.count(...)).sum()` — count all tokens
2. Lines 50-59: `for (i, msg) in messages.iter().enumerate()` — collect preserved_indices
3. Lines 66-75: `for (i, msg) in messages.iter().enumerate()` — build preserved/pruned vectors

- [ ] **Step 2: Write a regression test for the new single-pass behavior**

Add a test that verifies compaction produces identical results:

```rust
// Add to existing #[cfg(test)] module in compaction.rs:

#[test]
fn compaction_identical_to_old_algorithm() {
    let counter = TokenCounter::new();
    let messages: Vec<_> = (0..8)
        .map(|i| {
            make_message(
                if i % 2 == 0 { ConversationRole::User } else { ConversationRole::Assistant },
                &format!("Message number {} with enough tokens to matter and some more padding here to make it realistic", i),
            )
        })
        .collect();

    let result = compact_messages(&messages, "openai", &counter);
    // Basic invariants:
    assert_eq!(result.preserved.len() + result.pruned_count, messages.len());
    assert_eq!(result.preserved_tokens + result.pruned_tokens > 0, true);
}
```

- [ ] **Step 3: Rewrite `compact_messages` as a single pass**

Replace lines 28-84 with a single-pass algorithm that accumulates token counts as it iterates:

```rust
pub fn compact_messages(
    messages: &[ConversationMessageRecord],
    provider: &str,
    counter: &TokenCounter,
) -> CompactionResult {
    // Pass 1: Count total tokens (still need this for early return check)
    let total_tokens: usize = messages.iter().map(|m| counter.count(&m.content, provider)).sum();

    if total_tokens < PRUNE_MINIMUM {
        return CompactionResult {
            preserved: messages.to_vec(),
            preserved_tokens: total_tokens,
            pruned_count: 0,
            pruned_tokens: 0,
            summary_needed: false,
        };
    }

    // Single pass: combine decision + split
    let tail_messages = DEFAULT_TAIL_TURNS * 2;
    let split_point = messages.len().saturating_sub(tail_messages);

    let mut preserved = Vec::with_capacity(tail_messages);
    let mut pruned_count = 0;
    let mut pruned_tokens = 0usize;
    let mut preserved_tokens = 0usize;

    for (i, msg) in messages.iter().enumerate() {
        let msg_tokens = counter.count(&msg.content, provider);
        let should_preserve = i >= split_point || has_protected_tool_output(msg);

        if should_preserve {
            // Move the message out instead of cloning.
            // We need mut access to messages, but we only have &[T].
            // Alternative: drain into separate vecs.
            preserved.push(msg.clone());
            preserved_tokens += msg_tokens;
        } else {
            pruned_count += 1;
            pruned_tokens += msg_tokens;
        }
    }

    CompactionResult {
        preserved,
        preserved_tokens,
        pruned_count,
        pruned_tokens,
        summary_needed: pruned_count > 0,
    }
}
```

Note: The `.clone()` on line `preserved.push(msg.clone())` is still necessary because we only have `&[ConversationMessageRecord]` (immutable borrow). To eliminate the clone, we'd need ownership. That's covered in Task 3.

The optimization here is eliminating the second iteration and the `HashSet` allocation (replaced by a simple boolean check per message).

- [ ] **Step 4: Run agent-runtime tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test -p adl-agent-runtime 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. N passed; 0 failed` (all compaction tests green).

- [ ] **Step 5: Run full workspace clippy**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo clippy --workspace --all-targets 2>&1 | Select-String "warning|error"
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add crates/agent-runtime/src/compaction.rs
git commit -m "perf: merge compaction double-pass into single pass"
```

---

### Task 3: Eliminate per-message clone in compaction hot-path

**Files:**
- Modify: `crates/agent-runtime/src/compaction.rs:28-84`

**Interfaces:**
- Consumes: `compact_messages` signature unchanged
- Produces: Same `CompactionResult` but with owned messages (no clones)

- [ ] **Step 1: Change `compact_messages` to take ownership of messages**

Change the signature to accept `Vec<ConversationMessageRecord>` (owned) instead of `&[ConversationMessageRecord]`:

```rust
pub fn compact_messages(
    messages: Vec<ConversationMessageRecord>,
    provider: &str,
    counter: &TokenCounter,
) -> CompactionResult {
```

- [ ] **Step 2: Update all callers of `compact_messages` in the crate**

Search for callers:

```powershell
grep -rn "compact_messages" --include="*.rs" crates/agent-runtime/
```

Update each caller to pass `messages` (a Vec) directly instead of `&messages`. Common pattern change:
```rust
// Before:
let result = compact_messages(&messages, provider, &counter);
// After:
let result = compact_messages(messages, provider, &counter);
```

- [ ] **Step 3: Rewrite the body to use `drain` pattern instead of `clone()`**

```rust
pub fn compact_messages(
    mut messages: Vec<ConversationMessageRecord>,
    provider: &str,
    counter: &TokenCounter,
) -> CompactionResult {
    let total_tokens: usize = messages.iter().map(|m| counter.count(&m.content, provider)).sum();

    if total_tokens < PRUNE_MINIMUM {
        return CompactionResult {
            preserved: messages,
            preserved_tokens: total_tokens,
            pruned_count: 0,
            pruned_tokens: 0,
            summary_needed: false,
        };
    }

    let tail_messages = DEFAULT_TAIL_TURNS * 2;
    let split_point = messages.len().saturating_sub(tail_messages);

    let mut preserved = Vec::with_capacity(tail_messages);
    let mut pruned_count = 0;
    let mut pruned_tokens = 0usize;
    let mut preserved_tokens = 0usize;

    for (i, mut msg) in messages.into_iter().enumerate() {
        let msg_tokens = counter.count(&msg.content, provider);
        let should_preserve = i >= split_point || has_protected_tool_output(&msg);

        if should_preserve {
            preserved_tokens += msg_tokens;
            preserved.push(msg);
        } else {
            pruned_count += 1;
            pruned_tokens += msg_tokens;
        }
    }

    CompactionResult {
        preserved,
        preserved_tokens,
        pruned_count,
        pruned_tokens,
        summary_needed: pruned_count > 0,
    }
}
```

Note: `has_protected_tool_output` takes a reference, so no change needed there.

- [ ] **Step 4: Run agent-runtime tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test -p adl-agent-runtime 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 5: Run full workspace clippy**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo clippy --workspace --all-targets 2>&1 | Select-String "warning|error"
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add crates/agent-runtime/src/compaction.rs
git commit -m "perf: eliminate per-message clone in compaction hot path"
```

---

### Task 4: Reduce unnecessary clone in model-gateway `fallback_models`

**Files:**
- Modify: `crates/model-gateway/src/lib.rs:38-45`

**Interfaces:**
- Consumes: `fallback_models(def: &registry::ProviderDefinition) -> Vec<ModelDefinition>` — returns cloned model list
- Produces: Same function but returns `&[ModelDefinition]` instead

- [ ] **Step 1: Read the function and its callers**

```powershell
grep -rn "fallback_models" --include="*.rs" crates/model-gateway/
```

The function clones the entire model list from `ProviderDefinition`. If the caller only needs to iterate or select from the list, change the return to a reference:

- [ ] **Step 2: Change `fallback_models` to return a reference**

```rust
fn fallback_models(
    def: &registry::ProviderDefinition,
) -> &[adl_kernel::types::config::ModelDefinition] {
    match &def.models {
        registry::ModelSource::Static(models) => models.as_slice(),
        registry::ModelSource::Dynamic { .. } => &[],
    }
}
```

- [ ] **Step 3: Update callers that need owned data**

Search for callers that call `.clone()` on the return value of `fallback_models`. If none exist and callers just iterate over it, no changes needed.

If a caller does need owned data, add `.to_vec()` at the call site (making the allocation explicit):

```rust
// Before (if caller needs owned vec):
let models = fallback_models(&def);
// After (explicit to_vec at use site):
let models = fallback_models(&def).to_vec();
```

- [ ] **Step 4: Run model-gateway tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test -p adl-model-gateway 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 5: Run full workspace clippy**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo clippy --workspace --all-targets 2>&1 | Select-String "warning|error"
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add crates/model-gateway/src/lib.rs
git commit -m "perf: avoid clone of entire model list in fallback_models"
```
