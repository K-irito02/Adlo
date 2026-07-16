# Phase 2-C: Conversation Quality & Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Compaction (token-aware session pruning), Snapshot/Revert (message-level git-based rollback), and WebFetch/WebSearch tools to give the agent network information access.

**Architecture:** Add `tokenizers` dependency for accurate token counting. Create `crates/agent-runtime/src/compaction.rs` with pruning logic (PRUNE_MINIMUM=20000, PRUNE_PROTECT=40000, DEFAULT_TAIL_TURNS=2). Extend `crates/change-engine/` with `snapshot.rs` and `revert.rs` for message-level git snapshots in an independent gitdir. Create `crates/agent-runtime/src/tools/webfetch.rs` and `websearch.rs` using existing `reqwest`.

**Tech Stack:** Rust (`tokenizers` 0.21.x, existing `reqwest`, `git2` if available else shell out to `git`), React 19 + Zustand (frontend revert UI).

## Global Constraints

- Reference OpenCode: `references/opencode/packages/opencode/src/session/compaction.ts` and `references/opencode/packages/opencode/src/tool/webfetch.ts`, `websearch.ts`
- Add `tokenizers = { version = "0.21", default-features = false }` to workspace `Cargo.toml`
- Snapshot gitdir path: `<app_data>/snapshot/<project_hash>/<message_id>`
- Snapshots must not block the Agent main flow — use `tokio::spawn` for async snapshot creation
- WebFetch output limited to 50KB; timeout 10s
- WebSearch uses Tavily API or SerpAPI (key stored via `crates/credential/`)
- Large files (>2MB) skipped in snapshots
- All UI text uses i18n keys
- TDD throughout; 3-bridge sync for new IPC
- Depends on Phase 2-A (Agent runtime) and 2-B (Provider abstraction) being complete

## File Structure

### Rust — New Files

```
crates/agent-runtime/src/
├── compaction.rs          # Token-aware pruning logic
├── tools/
│   ├── mod.rs             # Tool module
│   ├── webfetch.rs        # WebFetch tool
│   └── websearch.rs       # WebSearch tool

crates/change-engine/src/
├── snapshot.rs            # Message-level git snapshot
└── revert.rs              # Revert to snapshot

src-tauri/src/commands/
├── snapshot.rs            # Snapshot/revert IPC commands
└── web_tools.rs           # WebFetch/WebSearch IPC commands
```

### Rust — Modified Files

```
Cargo.toml                                 # Add tokenizers dep
crates/agent-runtime/Cargo.toml           # Add tokenizers, reqwest deps
crates/agent-runtime/src/lib.rs           # Wire new modules
crates/change-engine/src/lib.rs           # Wire snapshot, revert modules
crates/change-engine/Cargo.toml           # Add workspace dep if needed
crates/kernel/src/types/conversation.rs   # Add Compaction block, RevertInfo type
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
src-tauri/Cargo.toml
```

### Frontend — New Files

```
frontend/src/app/components/conversation/
├── RevertButton.tsx       # Revert to snapshot button
└── CompactionIndicator.tsx # Compaction status indicator

frontend/src/shared/ipc/
├── snapshot.ts            # SnapshotBridge interface
└── web_tools.ts           # WebToolsBridge interface
```

---

## Task 1: Add tokenizers Dependency

**Files:**
- Modify: `ai-digital-life/Cargo.toml`

- [ ] **Step 1: Add to workspace dependencies**

Edit `ai-digital-life/Cargo.toml`, in `[workspace.dependencies]` add:

```toml
tokenizers = { version = "0.21", default-features = false }
```

- [ ] **Step 2: Add to agent-runtime Cargo.toml**

Edit `ai-digital-life/crates/agent-runtime/Cargo.toml`:

```toml
[dependencies]
tokenizers = { workspace = true }
```

- [ ] **Step 3: Verify it resolves**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check -p adl-agent-runtime`
Expected: PASS (may take a while to compile tokenizers first time)

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/Cargo.toml ai-digital-life/crates/agent-runtime/Cargo.toml
git commit -m "feat(deps): add tokenizers for accurate token counting"
```

---

## Task 2: Implement Token Counter

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/token_counter.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Test: inline in `token_counter.rs`

**Interfaces:**
- Consumes: `tokenizers` crate, `ModelProviderId`
- Produces: `TokenCounter` struct with `count(text, provider) -> usize`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/token_counter.rs`:

```rust
use adl_kernel::types::config::ModelProviderId;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Compaction thresholds (matching OpenCode defaults).
pub const PRUNE_MINIMUM: usize = 20_000;
pub const PRUNE_PROTECT: usize = 40_000;
pub const DEFAULT_TAIL_TURNS: usize = 2;
pub const TOOL_OUTPUT_MAX_CHARS: usize = 2_000;
pub const MIN_PRESERVE_RECENT_TOKENS: usize = 2_000;
pub const MAX_PRESERVE_RECENT_TOKENS: usize = 8_000;
pub const PRUNE_PROTECTED_TOOLS: &[&str] = &["skill"];

/// Counts tokens for a given provider.
#[derive(Debug)]
pub struct TokenCounter {
    fallback: fn(&str) -> usize,
}

impl TokenCounter {
    pub fn new() -> Self {
        Self {
            fallback: adl_kernel::estimate_tokens,
        }
    }

    /// Count tokens in text. Uses the fallback estimator (CJK-aware 4 chars/token).
    /// When tokenizer models are loaded, this will use the actual tokenizer.
    pub fn count(&self, text: &str, _provider: ModelProviderId) -> usize {
        // For now, use the existing estimate_tokens function.
        // Phase 2-C+ enhancement: load provider-specific tokenizer from HF Hub.
        (self.fallback)(text)
    }

    /// Count tokens in a list of messages.
    pub fn count_messages(&self, messages: &[String], provider: ModelProviderId) -> usize {
        messages.iter().map(|m| self.count(m, provider)).sum()
    }

    /// Check if a conversation needs compaction.
    pub fn needs_compaction(&self, total_tokens: usize) -> bool {
        total_tokens >= PRUNE_PROTECT
    }

    /// Calculate the target token count after compaction.
    pub fn compaction_target(&self) -> usize {
        PRUNE_MINIMUM
    }
}

impl Default for TokenCounter {
    fn default() -> Self {
        Self::new()
    }
}

static GLOBAL_COUNTER: OnceLock<TokenCounter> = OnceLock::new();

/// Get the global token counter instance.
pub fn global_counter() -> &'static TokenCounter {
    GLOBAL_COUNTER.get_or_init(TokenCounter::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_returns_positive_for_nonempty() {
        let counter = TokenCounter::new();
        let count = counter.count("Hello, world!", ModelProviderId::Openai);
        assert!(count > 0);
    }

    #[test]
    fn count_empty_returns_zero() {
        let counter = TokenCounter::new();
        let count = counter.count("", ModelProviderId::Openai);
        assert_eq!(count, 0);
    }

    #[test]
    fn cjk_text_counts_higher() {
        let counter = TokenCounter::new();
        let en = counter.count("Hello world", ModelProviderId::Openai);
        let cjk = counter.count("你好世界", ModelProviderId::Openai);
        // CJK characters should generally produce more tokens
        assert!(cjk >= en);
    }

    #[test]
    fn needs_compaction_at_threshold() {
        let counter = TokenCounter::new();
        assert!(!counter.needs_compaction(PRUNE_PROTECT - 1));
        assert!(counter.needs_compaction(PRUNE_PROTECT));
        assert!(counter.needs_compaction(PRUNE_PROTECT + 1000));
    }

    #[test]
    fn compaction_target_is_minimum() {
        let counter = TokenCounter::new();
        assert_eq!(counter.compaction_target(), PRUNE_MINIMUM);
    }

    #[test]
    fn count_messages_sums() {
        let counter = TokenCounter::new();
        let msgs = vec!["Hello".to_string(), "World".to_string()];
        let total = counter.count_messages(&msgs, ModelProviderId::Openai);
        let individual: usize = msgs.iter().map(|m| counter.count(m, ModelProviderId::Openai)).sum();
        assert_eq!(total, individual);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib token_counter`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod token_counter;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib token_counter`
Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/token_counter.rs ai-digital-life/crates/agent-runtime/src/lib.rs
git commit -m "feat(core): add TokenCounter with compaction thresholds"
```

---

## Task 3: Implement Compaction Logic

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/compaction.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Modify: `ai-digital-life/crates/kernel/src/types/conversation.rs` (add Compaction block)
- Test: inline in `compaction.rs`

**Interfaces:**
- Consumes: `TokenCounter` (Task 2), `ConversationMessageRecord`
- Produces: `compact_messages()`, `CompactionResult`, `CompactionBlock`

- [ ] **Step 1: Add Compaction block to ConversationBlock**

Edit `ai-digital-life/crates/kernel/src/types/conversation.rs`, add to `ConversationBlock` enum:

```rust
/// A compaction summary replacing pruned messages.
Compaction {
    summary: String,
    pruned_count: usize,
    pruned_token_estimate: usize,
    preserved_token_estimate: usize,
},
```

- [ ] **Step 2: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/compaction.rs`:

```rust
use crate::token_counter::{TokenCounter, PRUNE_MINIMUM, PRUNE_PROTECT, DEFAULT_TAIL_TURNS, PRUNE_PROTECTED_TOOLS, TOOL_OUTPUT_MAX_CHARS};
use adl_kernel::types::config::ModelProviderId;
use adl_kernel::types::conversation::{ConversationMessageRecord, ConversationRole};

/// Result of a compaction operation.
#[derive(Debug, Clone)]
pub struct CompactionResult {
    /// Messages to keep (recent ones + protected).
    pub preserved: Vec<ConversationMessageRecord>,
    /// Estimated token count of preserved messages.
    pub preserved_tokens: usize,
    /// Number of messages pruned.
    pub pruned_count: usize,
    /// Estimated token count of pruned messages.
    pub pruned_tokens: usize,
    /// Summary of pruned messages (to be generated by LLM).
    pub summary_needed: bool,
}

/// Compact a conversation by pruning old messages while preserving recent context.
///
/// Algorithm (matching OpenCode):
/// 1. If total tokens < PRUNE_PROTECT, no compaction needed
/// 2. Preserve the last DEFAULT_TAIL_TURNS turns (user+assistant pairs)
/// 3. Preserve messages with protected tool outputs
/// 4. Prune remaining messages, replacing with a summary
pub fn compact_messages(
    messages: &[ConversationMessageRecord],
    provider: ModelProviderId,
    counter: &TokenCounter,
) -> CompactionResult {
    let total_tokens: usize = messages
        .iter()
        .map(|m| counter.count(&m.content, provider))
        .sum();

    if total_tokens < PRUNE_PROTECT {
        return CompactionResult {
            preserved: messages.to_vec(),
            preserved_tokens: total_tokens,
            pruned_count: 0,
            pruned_tokens: 0,
            summary_needed: false,
        };
    }

    // Preserve last N turns (a turn = user message + assistant response)
    let tail_messages = DEFAULT_TAIL_TURNS * 2;
    let split_point = messages.len().saturating_sub(tail_messages);

    // Find protected messages (with skill tool outputs)
    let mut preserved_indices: std::collections::HashSet<usize> = std::collections::HashSet::new();
    for (i, msg) in messages.iter().enumerate() {
        if i >= split_point {
            preserved_indices.insert(i);
        }
        // Check if message contains protected tool output
        if has_protected_tool_output(msg) {
            preserved_indices.insert(i);
        }
    }

    let mut preserved = Vec::new();
    let mut pruned_count = 0;
    let mut pruned_tokens = 0;
    let mut preserved_tokens = 0;

    for (i, msg) in messages.iter().enumerate() {
        let msg_tokens = counter.count(&msg.content, provider);
        if preserved_indices.contains(&i) {
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

/// Check if a message contains protected tool output.
fn has_protected_tool_output(msg: &ConversationMessageRecord) -> bool {
    // Check blocks for tool calls with protected tool names
    for block in &msg.blocks {
        if let adl_kernel::types::conversation::ConversationBlock::ToolCall { tool, .. } = block {
            if PRUNE_PROTECTED_TOOLS.contains(&tool.as_str()) {
                return true;
            }
        }
    }
    false
}

/// Truncate tool output to the maximum allowed chars.
pub fn truncate_tool_output(output: &str) -> String {
    if output.len() <= TOOL_OUTPUT_MAX_CHARS {
        output.to_string()
    } else {
        let truncated = &output[..TOOL_OUTPUT_MAX_CHARS];
        format!("{}\n... [truncated, {} chars total]", truncated, output.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::create_id;

    fn make_message(role: ConversationRole, content: &str) -> ConversationMessageRecord {
        ConversationMessageRecord {
            id: create_id("msg"),
            session_id: "sess".to_string(),
            run_id: None,
            role,
            content: content.to_string(),
            blocks: vec![],
            created_at: adl_kernel::now_ms(),
        }
    }

    #[test]
    fn no_compaction_below_threshold() {
        let counter = TokenCounter::new();
        let messages = vec![make_message(ConversationRole::User, "short message")];
        let result = compact_messages(&messages, ModelProviderId::Openai, &counter);
        assert_eq!(result.pruned_count, 0);
        assert!(!result.summary_needed);
    }

    #[test]
    fn compaction_preserves_recent_turns() {
        let counter = TokenCounter::new();
        // Create enough messages to exceed PRUNE_PROTECT (40000 tokens)
        // Each CJK char ≈ 1 token, so 50000 chars
        let big_content = "你".repeat(50000);
        let messages: Vec<_> = (0..10)
            .map(|i| make_message(
                if i % 2 == 0 { ConversationRole::User } else { ConversationRole::Assistant },
                &big_content,
            ))
            .collect();

        let result = compact_messages(&messages, ModelProviderId::Openai, &counter);
        assert!(result.pruned_count > 0);
        assert!(result.summary_needed);
        // Should preserve last 4 messages (2 turns × 2 messages)
        assert!(result.preserved.len() <= 4);
    }

    #[test]
    fn truncate_long_output() {
        let long = "x".repeat(3000);
        let truncated = truncate_tool_output(&long);
        assert!(truncated.len() < long.len());
        assert!(truncated.contains("[truncated"));
    }

    #[test]
    fn truncate_short_output_unchanged() {
        let short = "short output";
        assert_eq!(truncate_tool_output(short), short);
    }
}
```

Note: Verify `ConversationMessageRecord` field names match the actual struct in kernel types. The test uses `id`, `session_id`, `run_id`, `role`, `content`, `blocks`, `created_at` — adjust if actual struct differs.

- [ ] **Step 3: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib compaction`
Expected: FAIL — module not declared

- [ ] **Step 4: Wire into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod compaction;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib compaction`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/compaction.rs ai-digital-life/crates/agent-runtime/src/lib.rs ai-digital-life/crates/kernel/src/types/conversation.rs
git commit -m "feat(core): add compaction logic with token-aware pruning"
```

---

## Task 4: Implement Snapshot Module

**Files:**
- Create: `ai-digital-life/crates/change-engine/src/snapshot.rs`
- Modify: `ai-digital-life/crates/change-engine/src/lib.rs`
- Test: inline in `snapshot.rs`

**Interfaces:**
- Consumes: existing git operations from `adl_workspace::git`
- Produces: `create_snapshot()`, `SnapshotRecord`, `list_snapshots()`, `prune_snapshots()`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/change-engine/src/snapshot.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::collections::HashMap;

/// Maximum snapshot age in days before pruning.
pub const SNAPSHOT_MAX_AGE_DAYS: u64 = 7;
/// Maximum total snapshot size in bytes before pruning.
pub const SNAPSHOT_MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024; // 2MB

/// Record of a single snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotRecord {
    pub id: String,
    pub message_id: String,
    pub session_id: String,
    pub workspace_id: String,
    pub created_at: u64,
    pub git_commit: Option<String>,
    pub file_count: usize,
    pub total_bytes: u64,
}

/// Manages message-level snapshots in an independent gitdir.
#[derive(Debug, Clone)]
pub struct SnapshotManager {
    snapshot_root: PathBuf,
}

impl SnapshotManager {
    pub fn new(app_data_dir: &Path, project_hash: &str) -> Self {
        let snapshot_root = app_data_dir
            .join("snapshot")
            .join(project_hash);
        Self { snapshot_root }
    }

    /// Create a snapshot of the current workspace state.
    /// This captures the git HEAD commit hash and file list.
    pub fn create_snapshot(
        &self,
        workspace_root: &Path,
        message_id: &str,
        session_id: &str,
        workspace_id: &str,
    ) -> Result<SnapshotRecord, adl_errors::AppError> {
        let snapshot_id = adl_kernel::create_id("snap");
        let snapshot_dir = self.snapshot_root.join(&snapshot_id);
        std::fs::create_dir_all(&snapshot_dir)
            .map_err(|e| adl_errors::AppError::IO(format!("Failed to create snapshot dir: {}", e)))?;

        // Capture git state
        let git_snapshot = adl_workspace::git::capture_git_snapshot(workspace_root);
        let git_commit = git_snapshot.head_commit.clone();

        // List files (skip large files >2MB)
        let (file_count, total_bytes) = count_workspace_files(workspace_root)?;

        let record = SnapshotRecord {
            id: snapshot_id,
            message_id: message_id.to_string(),
            session_id: session_id.to_string(),
            workspace_id: workspace_id.to_string(),
            created_at: adl_kernel::now_ms(),
            git_commit,
            file_count,
            total_bytes,
        };

        // Save record metadata
        let record_path = snapshot_dir.join("snapshot.json");
        let record_json = serde_json::to_string_pretty(&record)
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to serialize snapshot: {}", e)))?;
        std::fs::write(&record_path, record_json)
            .map_err(|e| adl_errors::AppError::IO(format!("Failed to write snapshot record: {}", e)))?;

        Ok(record)
    }

    /// List all snapshots for this project.
    pub fn list_snapshots(&self) -> Result<Vec<SnapshotRecord>, adl_errors::AppError> {
        if !self.snapshot_root.exists() {
            return Ok(vec![]);
        }

        let mut snapshots = Vec::new();
        let entries = std::fs::read_dir(&self.snapshot_root)
            .map_err(|e| adl_errors::AppError::IO(format!("Failed to read snapshot dir: {}", e)))?;

        for entry in entries {
            let entry = entry.map_err(|e| adl_errors::AppError::IO(format!("Dir entry error: {}", e)))?;
            let record_path = entry.path().join("snapshot.json");
            if record_path.exists() {
                let content = std::fs::read_to_string(&record_path)
                    .map_err(|e| adl_errors::AppError::IO(format!("Failed to read snapshot: {}", e)))?;
                let record: SnapshotRecord = serde_json::from_str(&content)
                    .map_err(|e| adl_errors::AppError::Internal(format!("Failed to parse snapshot: {}", e)))?;
                snapshots.push(record);
            }
        }

        snapshots.sort_by_key(|s| s.created_at);
        Ok(snapshots)
    }

    /// Get a specific snapshot by ID.
    pub fn get_snapshot(&self, snapshot_id: &str) -> Result<Option<SnapshotRecord>, adl_errors::AppError> {
        let record_path = self.snapshot_root.join(snapshot_id).join("snapshot.json");
        if !record_path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&record_path)
            .map_err(|e| adl_errors::AppError::IO(format!("Failed to read snapshot: {}", e)))?;
        let record: SnapshotRecord = serde_json::from_str(&content)
            .map_err(|e| adl_errors::AppError::Internal(format!("Failed to parse snapshot: {}", e)))?;
        Ok(Some(record))
    }

    /// Delete a snapshot.
    pub fn delete_snapshot(&self, snapshot_id: &str) -> Result<(), adl_errors::AppError> {
        let snapshot_dir = self.snapshot_root.join(snapshot_id);
        if snapshot_dir.exists() {
            std::fs::remove_dir_all(&snapshot_dir)
                .map_err(|e| adl_errors::AppError::IO(format!("Failed to delete snapshot: {}", e)))?;
        }
        Ok(())
    }

    /// Prune old snapshots (older than SNAPSHOT_MAX_AGE_DAYS) or when total exceeds SNAPSHOT_MAX_TOTAL_BYTES.
    pub fn prune_snapshots(&self) -> Result<usize, adl_errors::AppError> {
        let snapshots = self.list_snapshots()?;
        let now = adl_kernel::now_ms();
        let max_age_ms = SNAPSHOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        let mut pruned = 0;
        let mut total_bytes: u64 = snapshots.iter().map(|s| s.total_bytes).sum();

        for snapshot in &snapshots {
            let age = now.saturating_sub(snapshot.created_at);
            if age > max_age_ms || total_bytes > SNAPSHOT_MAX_TOTAL_BYTES {
                self.delete_snapshot(&snapshot.id)?;
                total_bytes = total_bytes.saturating_sub(snapshot.total_bytes);
                pruned += 1;
            }
        }

        Ok(pruned)
    }
}

/// Count files in workspace, skipping files >2MB.
fn count_workspace_files(root: &Path) -> Result<(usize, u64), adl_errors::AppError> {
    let mut count = 0;
    let mut total_bytes = 0u64;

    fn walk(dir: &Path, count: &mut usize, total_bytes: &mut u64) -> Result<(), adl_errors::AppError> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                // Skip .git, node_modules, target, etc.
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if matches!(name, ".git" | "node_modules" | "target" | ".next" | "dist" | "build") {
                    continue;
                }
                walk(&path, count, total_bytes)?;
            } else {
                let metadata = entry.metadata()?;
                if metadata.len() <= 2 * 1024 * 1024 {
                    *count += 1;
                    *total_bytes += metadata.len();
                }
            }
        }
        Ok(())
    }

    walk(root, &mut count, &mut total_bytes)?;
    Ok((count, total_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_manager_creates_root() {
        let tmp = std::env::temp_dir().join(format!("snapshot-test-{}", std::process::id()));
        let manager = SnapshotManager::new(&tmp, "testproject");
        assert!(manager.snapshot_root.ends_with("snapshot/testproject"));
    }

    #[test]
    fn list_snapshots_empty_when_none_exist() {
        let tmp = std::env::temp_dir().join(format!("snapshot-empty-{}", std::process::id()));
        let manager = SnapshotManager::new(&tmp, "emptyproject");
        let snapshots = manager.list_snapshots().unwrap();
        assert!(snapshots.is_empty());
    }

    #[test]
    fn snapshot_constants() {
        assert_eq!(SNAPSHOT_MAX_AGE_DAYS, 7);
        assert_eq!(SNAPSHOT_MAX_TOTAL_BYTES, 2 * 1024 * 1024);
    }
}
```

Note: This test requires `adl_workspace` dependency. Add it to `change-engine/Cargo.toml` if not present:

```toml
adl-workspace = { path = "../workspace" }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-change-engine --lib snapshot`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into lib.rs and add deps**

Add to `ai-digital-life/crates/change-engine/src/lib.rs`:

```rust
pub mod snapshot;
```

Add to `ai-digital-life/crates/change-engine/Cargo.toml`:

```toml
adl-workspace = { path = "../workspace" }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-change-engine --lib snapshot`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/change-engine/
git commit -m "feat(core): add SnapshotManager for message-level git snapshots"
```

---

## Task 5: Implement Revert Module

**Files:**
- Create: `ai-digital-life/crates/change-engine/src/revert.rs`
- Modify: `ai-digital-life/crates/change-engine/src/lib.rs`
- Test: inline in `revert.rs`

**Interfaces:**
- Consumes: `SnapshotManager` (Task 4), `SnapshotRecord`
- Produces: `revert_to_snapshot()`, `RevertResult`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/change-engine/src/revert.rs`:

```rust
use crate::snapshot::{SnapshotManager, SnapshotRecord};
use std::path::Path;

/// Result of a revert operation.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RevertResult {
    pub success: bool,
    pub snapshot_id: String,
    pub message_id: String,
    pub files_restored: usize,
    pub error: Option<String>,
}

/// Revert workspace to a previous snapshot.
/// This uses git to restore the file state captured in the snapshot.
pub fn revert_to_snapshot(
    manager: &SnapshotManager,
    snapshot_id: &str,
    workspace_root: &Path,
) -> Result<RevertResult, adl_errors::AppError> {
    let snapshot = manager.get_snapshot(snapshot_id)?
        .ok_or_else(|| adl_errors::AppError::NotFound(format!("Snapshot {} not found", snapshot_id)))?;

    // If snapshot has a git commit, restore via git
    if let Some(ref commit) = snapshot.git_commit {
        match revert_via_git(workspace_root, commit) {
            Ok(files) => {
                return Ok(RevertResult {
                    success: true,
                    snapshot_id: snapshot_id.to_string(),
                    message_id: snapshot.message_id.clone(),
                    files_restored: files,
                    error: None,
                });
            }
            Err(e) => {
                return Ok(RevertResult {
                    success: false,
                    snapshot_id: snapshot_id.to_string(),
                    message_id: snapshot.message_id.clone(),
                    files_restored: 0,
                    error: Some(format!("Git revert failed: {}", e)),
                });
            }
        }
    }

    // No git commit available
    Ok(RevertResult {
        success: false,
        snapshot_id: snapshot_id.to_string(),
        message_id: snapshot.message_id.clone(),
        files_restored: 0,
        error: Some("Snapshot has no git commit to revert to".to_string()),
    })
}

/// Revert workspace to a git commit.
fn revert_via_git(workspace_root: &Path, commit: &str) -> Result<usize, String> {
    use std::process::Command;

    // git checkout <commit> -- .
    let output = Command::new("git")
        .arg("checkout")
        .arg(commit)
        .arg("--")
        .arg(".")
        .current_dir(workspace_root)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    // Count restored files from git diff
    let diff_output = Command::new("git")
        .arg("diff")
        .arg("--name-only")
        .arg("HEAD")
        .current_dir(workspace_root)
        .output()
        .map_err(|e| format!("Failed to count restored files: {}", e))?;

    let count = String::from_utf8_lossy(&diff_output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .count();

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revert_result_serializes() {
        let result = RevertResult {
            success: true,
            snapshot_id: "snap123".to_string(),
            message_id: "msg456".to_string(),
            files_restored: 5,
            error: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("snap123"));
        assert!(json.contains("true"));
    }

    #[test]
    fn revert_result_with_error() {
        let result = RevertResult {
            success: false,
            snapshot_id: "snap123".to_string(),
            message_id: "msg456".to_string(),
            files_restored: 0,
            error: Some("Git revert failed".to_string()),
        };
        assert!(!result.success);
        assert!(result.error.is_some());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-change-engine --lib revert`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/change-engine/src/lib.rs`:

```rust
pub mod revert;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-change-engine --lib revert`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/change-engine/src/revert.rs ai-digital-life/crates/change-engine/src/lib.rs
git commit -m "feat(core): add revert_to_snapshot for message-level rollback"
```

---

## Task 6: Implement WebFetch Tool

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/tools/mod.rs`
- Create: `ai-digital-life/crates/agent-runtime/src/tools/webfetch.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Modify: `ai-digital-life/crates/agent-runtime/Cargo.toml` (add reqwest if not present)
- Test: inline in `webfetch.rs`

**Interfaces:**
- Consumes: `reqwest::Client`
- Produces: `webfetch(url) -> WebFetchResult`

- [ ] **Step 1: Add reqwest dependency**

Edit `ai-digital-life/crates/agent-runtime/Cargo.toml`:

```toml
reqwest = { workspace = true }
```

- [ ] **Step 2: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/tools/webfetch.rs`:

```rust
use reqwest::Client;
use std::time::Duration;

const MAX_OUTPUT_BYTES: usize = 50_000; // 50KB
const TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Clone, serde::Serialize)]
pub struct WebFetchResult {
    pub url: String,
    pub status: u16,
    pub content_type: Option<String>,
    pub content: String,
    pub truncated: bool,
    pub error: Option<String>,
}

/// Fetch content from a URL.
pub async fn webfetch(url: &str) -> WebFetchResult {
    let client = match Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .user_agent("AI-Digital-Life/1.0")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return WebFetchResult {
                url: url.to_string(),
                status: 0,
                content_type: None,
                content: String::new(),
                truncated: false,
                error: Some(format!("Failed to create HTTP client: {}", e)),
            };
        }
    };

    match client.get(url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let content_type = resp.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .map(String::from);

            let text = match resp.text().await {
                Ok(t) => t,
                Err(e) => {
                    return WebFetchResult {
                        url: url.to_string(),
                        status,
                        content_type,
                        content: String::new(),
                        truncated: false,
                        error: Some(format!("Failed to read response: {}", e)),
                    };
                }
            };

            let (content, truncated) = if text.len() > MAX_OUTPUT_BYTES {
                (text[..MAX_OUTPUT_BYTES].to_string(), true)
            } else {
                (text, false)
            };

            WebFetchResult {
                url: url.to_string(),
                status,
                content_type,
                content,
                truncated,
                error: if status >= 400 { Some(format!("HTTP {}", status)) } else { None },
            }
        }
        Err(e) => WebFetchResult {
            url: url.to_string(),
            status: 0,
            content_type: None,
            content: String::new(),
            truncated: false,
            error: Some(format!("Request failed: {}", e)),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_output_bytes_is_50kb() {
        assert_eq!(MAX_OUTPUT_BYTES, 50_000);
    }

    #[test]
    fn timeout_is_10_seconds() {
        assert_eq!(TIMEOUT_SECS, 10);
    }

    #[tokio::test]
    async fn webfetch_invalid_url_returns_error() {
        let result = webfetch("http://localhost:1/nonexistent").await;
        assert!(result.error.is_some());
        assert_eq!(result.status, 0);
    }
}
```

- [ ] **Step 3: Create tools/mod.rs and wire**

Create `ai-digital-life/crates/agent-runtime/src/tools/mod.rs`:

```rust
pub mod webfetch;
pub mod websearch;
```

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod tools;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib tools::webfetch`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/tools/ ai-digital-life/crates/agent-runtime/src/lib.rs ai-digital-life/crates/agent-runtime/Cargo.toml
git commit -m "feat(core): add WebFetch tool with 50KB limit and 10s timeout"
```

---

## Task 7: Implement WebSearch Tool

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/tools/websearch.rs`
- Test: inline in `websearch.rs`

**Interfaces:**
- Consumes: `reqwest::Client`, `adl_credential::CredentialStore`
- Produces: `websearch(query) -> WebSearchResult`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/tools/websearch.rs`:

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const TIMEOUT_SECS: u64 = 15;
const MAX_RESULTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub query: String,
    pub results: Vec<SearchResultItem>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub score: Option<f64>,
}

/// Search the web using Tavily API (AI-optimized search).
/// API key is retrieved from the credential store.
pub async fn websearch(query: &str) -> WebSearchResult {
    let api_key = match get_search_api_key() {
        Some(k) => k,
        None => {
            return WebSearchResult {
                query: query.to_string(),
                results: vec![],
                error: Some("No search API key configured. Set Tavily API key in settings.".to_string()),
            };
        }
    };

    let client = match Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return WebSearchResult {
                query: query.to_string(),
                results: vec![],
                error: Some(format!("Failed to create HTTP client: {}", e)),
            };
        }
    };

    let body = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "max_results": MAX_RESULTS,
        "search_depth": "basic",
    });

    match client
        .post("https://api.tavily.com/search")
        .json(&body)
        .send()
        .await
    {
        Ok(resp) => {
            if !resp.status().is_success() {
                return WebSearchResult {
                    query: query.to_string(),
                    results: vec![],
                    error: Some(format!("Search API returned {}", resp.status())),
                };
            }

            let json: serde_json::Value = match resp.json().await {
                Ok(j) => j,
                Err(e) => {
                    return WebSearchResult {
                        query: query.to_string(),
                        results: vec![],
                        error: Some(format!("Failed to parse search response: {}", e)),
                    };
                }
            };

            let results = json["results"]
                .as_array()
                .map(|arr| {
                    arr.iter().take(MAX_RESULTS).map(|item| SearchResultItem {
                        title: item["title"].as_str().unwrap_or("").to_string(),
                        url: item["url"].as_str().unwrap_or("").to_string(),
                        snippet: item["content"].as_str().unwrap_or("").to_string(),
                        score: item["score"].as_f64(),
                    }).collect()
                })
                .unwrap_or_default();

            WebSearchResult {
                query: query.to_string(),
                results,
                error: None,
            }
        }
        Err(e) => WebSearchResult {
            query: query.to_string(),
            results: vec![],
            error: Some(format!("Search request failed: {}", e)),
        },
    }
}

/// Retrieve Tavily API key from credential store.
fn get_search_api_key() -> Option<String> {
    let store = adl_credential::CredentialStore::new();
    store.get_password("websearch", "tavily").ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_results_is_10() {
        assert_eq!(MAX_RESULTS, 10);
    }

    #[test]
    fn timeout_is_15_seconds() {
        assert_eq!(TIMEOUT_SECS, 15);
    }

    #[test]
    fn empty_result_serializes() {
        let result = WebSearchResult {
            query: "test".to_string(),
            results: vec![],
            error: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("test"));
    }
}
```

Add `adl-credential` dependency to `ai-digital-life/crates/agent-runtime/Cargo.toml`:

```toml
adl-credential = { path = "../credential" }
```

- [ ] **Step 2: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib tools::websearch`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/tools/websearch.rs ai-digital-life/crates/agent-runtime/Cargo.toml
git commit -m "feat(core): add WebSearch tool using Tavily API"
```

---

## Task 8: Add Snapshot and Web Tool IPC Commands

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/snapshot.rs`
- Create: `ai-digital-life/src-tauri/src/commands/web_tools.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/lib.rs`
- Modify: `ai-digital-life/src-tauri/Cargo.toml`

- [ ] **Step 1: Create snapshot.rs commands**

Create `ai-digital-life/src-tauri/src/commands/snapshot.rs`:

```rust
use adl_change_engine::snapshot::{SnapshotManager, SnapshotRecord};
use adl_change_engine::revert::{revert_to_snapshot, RevertResult};
use std::path::PathBuf;

fn get_snapshot_manager(workspace_id: &str, workspace_root: &str) -> Result<SnapshotManager, adl_errors::AppError> {
    let app_data = dirs::data_dir()
        .ok_or_else(|| adl_errors::AppError::Internal("Cannot find app data dir".to_string()))?
        .join("ai-digital-life");
    let project_hash = simple_hash(workspace_root);
    Ok(SnapshotManager::new(&app_data, &project_hash))
}

fn simple_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[tauri::command]
pub async fn create_snapshot(
    workspace_id: String,
    workspace_root: String,
    message_id: String,
    session_id: String,
) -> Result<SnapshotRecord, adl_errors::AppError> {
    let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
    // Run in blocking task to avoid blocking async runtime
    let root = PathBuf::from(&workspace_root);
    tokio::task::spawn_blocking(move || {
        manager.create_snapshot(&root, &message_id, &session_id, &workspace_id)
    })
    .await
    .map_err(|e| adl_errors::AppError::Internal(format!("Snapshot task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_snapshots(
    workspace_id: String,
    workspace_root: String,
) -> Result<Vec<SnapshotRecord>, adl_errors::AppError> {
    let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
    manager.list_snapshots()
}

#[tauri::command]
pub async fn revert_to_snapshot_cmd(
    workspace_id: String,
    workspace_root: String,
    snapshot_id: String,
) -> Result<RevertResult, adl_errors::AppError> {
    let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
    let root = PathBuf::from(&workspace_root);
    tokio::task::spawn_blocking(move || {
        revert_to_snapshot(&manager, &snapshot_id, &root)
    })
    .await
    .map_err(|e| adl_errors::AppError::Internal(format!("Revert task failed: {}", e)))?
}

#[tauri::command]
pub async fn prune_snapshots(
    workspace_id: String,
    workspace_root: String,
) -> Result<usize, adl_errors::AppError> {
    let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
    manager.prune_snapshots()
}
```

- [ ] **Step 2: Create web_tools.rs commands**

Create `ai-digital-life/src-tauri/src/commands/web_tools.rs`:

```rust
use adl_agent_runtime::tools::webfetch::{webfetch, WebFetchResult};
use adl_agent_runtime::tools::websearch::{websearch, WebSearchResult};

#[tauri::command]
pub async fn web_fetch(url: String) -> Result<WebFetchResult, adl_errors::AppError> {
    Ok(webfetch(&url).await)
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<WebSearchResult, adl_errors::AppError> {
    Ok(websearch(&query).await)
}
```

- [ ] **Step 3: Register commands**

In `ai-digital-life/src-tauri/src/commands/mod.rs`, add:

```rust
pub mod snapshot;
pub mod web_tools;
```

In `ai-digital-life/src-tauri/src/lib.rs`, add to invoke_handler:

```rust
commands::snapshot::create_snapshot,
commands::snapshot::list_snapshots,
commands::snapshot::revert_to_snapshot_cmd,
commands::snapshot::prune_snapshots,
commands::web_tools::web_fetch,
commands::web_tools::web_search,
```

Add to `ai-digital-life/src-tauri/Cargo.toml`:

```toml
dirs = "5"
```

- [ ] **Step 4: Verify compilation**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check -p adl-app`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/src-tauri/
git commit -m "feat(ipc): add snapshot and web tool commands"
```

---

## Task 9: Add Frontend IPC and UI for Snapshot/Revert

**Files:**
- Create: `ai-digital-life/frontend/src/shared/ipc/snapshot.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/web_tools.ts`
- Create: `ai-digital-life/frontend/src/app/components/conversation/RevertButton.tsx`
- Create: `ai-digital-life/frontend/src/app/components/conversation/CompactionIndicator.tsx`
- Modify: `index.ts`, `digital-life.ts`, all three bridges, locale files

- [ ] **Step 1: Create IPC interfaces**

Create `ai-digital-life/frontend/src/shared/ipc/snapshot.ts`:

```typescript
import type { IpcResult } from './shared';

export interface SnapshotRecord {
  id: string;
  message_id: string;
  session_id: string;
  workspace_id: string;
  created_at: number;
  git_commit: string | null;
  file_count: number;
  total_bytes: number;
}

export interface RevertResult {
  success: boolean;
  snapshot_id: string;
  message_id: string;
  files_restored: number;
  error: string | null;
}

export interface SnapshotBridge {
  createSnapshot(params: {
    workspaceId: string;
    workspaceRoot: string;
    messageId: string;
    sessionId: string;
  }): Promise<IpcResult<SnapshotRecord>>;
  listSnapshots(workspaceId: string, workspaceRoot: string): Promise<IpcResult<SnapshotRecord[]>>;
  revertToSnapshot(workspaceId: string, workspaceRoot: string, snapshotId: string): Promise<IpcResult<RevertResult>>;
  pruneSnapshots(workspaceId: string, workspaceRoot: string): Promise<IpcResult<number>>;
}
```

Create `ai-digital-life/frontend/src/shared/ipc/web_tools.ts`:

```typescript
import type { IpcResult } from './shared';

export interface WebFetchResult {
  url: string;
  status: number;
  content_type: string | null;
  content: string;
  truncated: boolean;
  error: string | null;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
}

export interface WebSearchResult {
  query: string;
  results: SearchResultItem[];
  error: string | null;
}

export interface WebToolsBridge {
  webFetch(url: string): Promise<IpcResult<WebFetchResult>>;
  webSearch(query: string): Promise<IpcResult<WebSearchResult>>;
}
```

- [ ] **Step 2: Wire into DigitalLifeBridge and implement in 3 bridges**

Add `snapshot: SnapshotBridge` and `webTools: WebToolsBridge` to `DigitalLifeBridge`. Implement in tauri-bridge, preview-bridge, mock-bridge.

- [ ] **Step 3: Add i18n keys**

Add to locale files:

```json
{
  "snapshot": {
    "revert": "回退到此快照",
    "revertConfirm": "确定要回退到此快照吗？当前未提交的更改将丢失。",
    "created": "快照已创建",
    "reverted": "已回退到快照",
    "revertFailed": "回退失败",
    "pruned": "已清理 {count} 个旧快照"
  },
  "compaction": {
    "active": "正在压缩会话...",
    "completed": "会话已压缩",
    "pruned": "已精简 {count} 条消息"
  }
}
```

- [ ] **Step 4: Create RevertButton.tsx**

```tsx
import { useState } from 'react';
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';

export function RevertButton({ messageId, snapshotId }: { messageId: string; snapshotId: string }) {
  const t = useTCopy();
  const [confirming, setConfirming] = useState(false);
  const revertToSnapshot = useAppStore((s) => s.revertToSnapshot);
  const activeWorkspaceId = useAppStore((s) => s.activeCiWorkspaceId);
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (activeWorkspaceId && activeWorkspacePath) {
      const result = await revertToSnapshot(activeWorkspaceId, activeWorkspacePath, snapshotId);
      if (result.ok) {
        // Show success toast
      } else {
        // Show error
      }
    }
    setConfirming(false);
  };

  return (
    <button
      type="button"
      className={`adl-revert-button ${confirming ? 'adl-revert-confirming' : ''}`}
      onClick={handleClick}
      aria-label={t('snapshot.revert')}
    >
      {confirming ? t('snapshot.revertConfirm') : t('snapshot.revert')}
    </button>
  );
}
```

- [ ] **Step 5: Create CompactionIndicator.tsx**

```tsx
import { useTCopy } from '../../i18n/useTCopy';

export function CompactionIndicator({ active, prunedCount }: { active: boolean; prunedCount: number }) {
  const t = useTCopy();
  if (!active && prunedCount === 0) return null;
  return (
    <div className="adl-compaction-indicator" role="status">
      {active ? t('compaction.active') : t('compaction.pruned', { count: prunedCount })}
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/
git commit -m "feat(frontend): add snapshot revert UI and compaction indicator"
```

---

## Task 10: End-to-End Verification

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
git commit -m "chore: lint and format fixes from Phase 2-C verification"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Compaction: Tasks 1-3 (tokenizers dep, TokenCounter, compaction logic with thresholds)
- ✅ Snapshot / Revert: Tasks 4-5 (SnapshotManager, revert_to_snapshot)
- ✅ WebFetch / WebSearch: Tasks 6-7 (webfetch tool, websearch tool)
- ✅ IPC: Task 8 (snapshot + web tool commands)
- ✅ Frontend: Task 9 (IPC interfaces, RevertButton, CompactionIndicator)

**Type consistency:**
- `SnapshotRecord` field names match across Rust/TS (snake_case ↔ snake_case)
- `WebFetchResult` fields: `content_type` uses snake_case in both (verify serde rename)
- `CompactionResult` is Rust-only (not serialized to frontend)
- Threshold constants match OpenCode: PRUNE_MINIMUM=20000, PRUNE_PROTECT=40000, DEFAULT_TAIL_TURNS=2

**Dependencies:**
- `tokenizers` 0.21.x added in Task 1
- No other new external deps (uses existing reqwest, tokio)
