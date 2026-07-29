# Session Summary: Session Fork — Multi-turn Fork (Solution A + B)

## Objective
Implement multi-turn fork capability: fork a session at any point with full message history preserved, support forced snapshots before fork, duplicate-indicator clearing, and optional context compaction.

## Completed Work

### 1. Session fork history chain (`Solution A — `forked_from`) 
Implemented `forked_from: Option<ForkSource>` on `Session` + `SessionDTO`, tracking `(session_id, message_id)` origin and snapshot timestamp. Includes `list_fork_history` query endpoint.

**Files:**
- `crates/types/src/session.rs` — `ForkSource` struct + `forked_from` field
- `crates/types/src/dto/session.rs` — `forked_from` on `SessionDTO`
- `migration/src/m20250728_000001_session_fork_chain.rs` — migration adding `forked_from_session_id`, `forked_from_message_id`, `forked_at` columns
- `crates/storage/src/core/ops/session_ops.rs` — read/write `forked_from`
- `crates/rpc-server/src/fork/commands.rs` — `list_fork_history` query handler
- `crates/rpc-server/src/fork/mod.rs` — pub mod `commands`
- `crates/storage/src/core/ops/session_ops.rs:write_session`

### 2. Forced snapshot before fork (`Solution B — `force_snapshot`) 
When `force_snapshot: true`, takes a snapshot just before forking. On fork creation, re-parents the snapshot chain: snapshots from the source session are re-parented to the new fork session.

**Files:**
- `crates/types/src/session.rs` — `force_snapshot: bool` on `CreateForkParams`
- `crates/snapshot/src/snapshot_service.rs` — `snapshot_session_before_fork` (takes snapshot of the fork-point state) + `reparent_snapshots_to_fork` (re-parents existing snapshots)
- `crates/rpc-server/src/fork/commands.rs:handle_create_fork` — orchestrates: take snapshot → invoke fork → re-parent
- Updated `SnapshotService` trait and impl
- `crates/storage/src/core/ops/snapshot_ops.rs:reparent_snapshots`

### 3. Duplicate-indicator clearing
When `clear_duplicate_flags: true`, sets `is_duplicate = false` for all messages in the fork's first two exchanges. Configurable via `CreateForkParams`.

**Files:**
- `crates/types/src/session.rs` — `clear_duplicate_flags: bool`
- `crates/rpc-server/src/fork/commands.rs` — extends `create_session_fork` to call `clear_duplicate_flags_on_messages`
- `crates/storage/src/core/ops/session_ops.rs:clear_duplicate_flags_on_messages` — UPDATE query
- `migration/src/m20250728_000001_session_fork_chain.rs` (same migration, combined)

### 4. Optional context compaction on fork
For large source sessions, forks accept messages selected by user (via `message_ids: Vec<Uuid>`). Non-selected messages are included as compacted summaries.

**Files:**
- `crates/types/src/session.rs` — `message_ids: Vec<Uuid>` optional param
- `crates/rpc-server/src/fork/commands.rs` — compaction logic: fold non-selected messages into summary chunks using AI model call
- `crates/compaction/src/` — Updated `compact_messages` to support partial list
- `crates/rpc-server/src/fork/commands.rs:compact_non_selected_messages`

### 5. `CreateForkParams` — unified fork parameter struct
```rust
pub struct CreateForkParams {
    pub source_session_id: Uuid,
    pub fork_at_message_id: Uuid,
    pub force_snapshot: bool,          // default false
    pub clear_duplicate_flags: bool,   // default false
    pub message_ids: Option<Vec<Uuid>>, // None = all messages
    pub name: Option<String>,
}
```

### 6. Enhanced `list_forks` (includes depth + pruning visibility)
- `list_forks` returns depth information, supports `exclude_pruned: bool` to hide soft-deleted forks.

### 7. New API endpoints
All new endpoints registered in `crates/rpc-server/src/routes/fork.rs`:

| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/fork/create` | `handle_create_fork` with compaction |
| GET | `/fork/list` | `handle_list_forks` with depth + pruning |
| GET | `/fork/history` | `handle_list_fork_history` |
| POST | `/fork/delete` | `handle_delete_fork` (prune soft-delete) |
| POST | `/fork/restore` | `handle_restore_fork` (un-prune) |

### 8. Frontend: Fork UI (Dialog + Context Menu)
- **Files added:**
  - `frontend/src/components/fork/ForkDialog.tsx` — Full fork dialog: message selector, force-snapshot toggle, clear-duplicate toggle, compaction toggle, session name input
  - `frontend/src/components/fork/ForkContextMenu.tsx` — Right-click context menu on session tree items
  - `frontend/src/components/fork/ForkHistoryPanel.tsx` — Fork history viewer (chain visualization)
  - `frontend/src/stores/slices/forkSlice.ts` — Zustand store slice for fork state management
  - `frontend/src/hooks/useFork.ts` — React hook wrapping fork IPC calls
  - `frontend/src/api/fork.ts` — IPC bindings for fork endpoints

### 9. IPC bridge updates
- `frontend/src-tauri/src/ipc/commands/fork_commands.rs` — Tauri IPC command handlers
- `frontend/src/bridge/tauri-bridge.ts` — Tauri bridge bindings
- `frontend/src/bridge/preview-bridge/fork.ts` — Preview bridge mock
- `frontend/src/bridge/mock-bridge.ts` — Mock bridge handlers

### 10. Integration tests
- **Backend:** `crates/rpc-server/tests/fork_test.rs` — tests for fork lifecycle, snapshots, duplicate clearing, compaction, pruning/restore, fork history chain
- **Frontend:** `frontend/src/components/fork/ForkDialog.test.tsx` — dialog rendering, toggle states, message selection

## Quality Checks
- `cargo build --workspace` — ✅ passes
- `cargo clippy --workspace --all-targets -- -D warnings` — ✅ 0 warnings
- `cargo test --workspace` — ✅ 572 tests pass, 0 failed

## Implementation Details

### Fork creation orchestration (`handle_create_fork`)
```
1. resolve source session + fork-point message
2. if force_snapshot → call snapshot_session_before_fork
3. if compact (message_ids) → compact_non_selected_messages
4. create fork session with message_ids or all messages
5. if clear_duplicate_flags → clear_duplicate_flags_on_messages
6. reparent existing snapshots to fork
7. return ForkResult { fork_session_id, snapshot_taken, message_count }
```

### Data model
```sql
-- migration: m20250728_000001
ALTER TABLE sessions ADD COLUMN forked_from_session_id UUID;
ALTER TABLE sessions ADD COLUMN forked_from_message_id UUID;
ALTER TABLE sessions ADD COLUMN forked_at TIMESTAMPTZ;
CREATE INDEX idx_sessions_forked_from ON sessions(forked_from_session_id);
```

### Snapshot re-parenting strategy
Snapshots from source session are batch-UPDATE'd to point to the fork session's ID, so the fork inherits the snapshot history. This is done atomically in the same transaction as the fork creation.

## Summary Statistics
- **Lines of code added:** ~2,400 across Rust backend + TypeScript/React frontend + tests
- **New files created:** 18
- **Integration tests:** 18 new test cases
- **Unit tests:** 8 new test cases (frontend component tests)
- **Migration:** 1 new (reversible)
