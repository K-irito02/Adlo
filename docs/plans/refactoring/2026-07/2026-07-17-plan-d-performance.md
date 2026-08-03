# Plan D: Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate performance bottlenecks across the Rust backend (SQL queries, file I/O, async blocking, SQLite pool configuration) and React frontend (streaming re-render storms, unbounded memory growth, lazy loading).

**Architecture:** Nine independent tasks. Five High-priority fixes (audit SQL push-down, file-read elimination in tree walk, search spawn-blocking fix, MessageStream memo fix, PTY buffer protocol) address active user-visible latency. Three Medium fixes (SQLite pool hardening, audit batch transactions, command-run DB write batching) address scalability under load. One Low task bundles two minor optimizations (motion/react lazy-load, redundant sort removal).

**Tech Stack:** Rust 1.85+, tokio, r2d2, rusqlite, React 19, TypeScript, react-window

## Global Constraints

- **Rust 1.85+**, **Node.js 24.15+**, **pnpm 10.x+**
- **`unwrap()` 禁用** in Rust non-test code — use `?` or pattern matching
- **`-D warnings` zero tolerance** — `cargo clippy --workspace --all-targets -- -D warnings` must pass
- **`rustfmt` default config** — `cargo fmt --all` must pass
- **TypeScript strict** — `pnpm --dir frontend run typecheck` must pass with 0 errors
- **ESLint** — `pnpm --dir frontend run lint` must pass
- **Error type**: `adl-errors::AppError` enum, no bare `String` results
- **No backward-compatibility code** — signature changes update all callers, no shims
- **Commit format**: `type(scope): summary` where type ∈ {feat, fix, docs, chore, refactor, test} and scope ∈ {core, frontend, rust, stores, browser, terminal, ipc, docs, deps}
- **Environment**: Set `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` before any cargo command; Set `$env:Path = "D:\Program Files\nodejs;$env:Path"` before any pnpm/npm command
- **Proxy**: Clash proxy at `127.0.0.1:7890` must be enabled for crate downloads
- **TDD**: write failing test first, verify RED, implement, verify GREEN
- **Performance tests**: use `cargo test -- --nocapture` with timing assertions or benchmark-style tests where applicable

---

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `crates/storage/src/crud.rs` | Add public `list_entities_with_limit` method | Task 1 |
| `src-tauri/src/commands/audit.rs` | Use `list_entities_with_limit` in `list_audit_entries_with_db` | Task 1 |
| `crates/workspace/src/tree.rs` | Replace `read_text_file` probe with `metadata` + extension check | Task 2 |
| `crates/workspace/src/search.rs` | Move `collect_text_files` into `spawn_blocking`; fix detached cancellation task | Task 3 |
| `frontend/src/app/components/MessageStream.tsx` | Fix `RowComponent` memo comparator to remove early `streamItems` identity check | Task 4 |
| `frontend/src/preview-bridge/preview-pty-bridge.ts` | Switch to incremental output protocol with cursor tracking | Task 5 |
| `frontend/dev/previewTerminalService.ts` | Server-side cursor tracking for PTY output | Task 5 |
| `crates/storage/src/connection.rs` | Add `connection_timeout` + `with_init` PRAGMA on every pool connection | Task 6 |
| `crates/storage/src/crud.rs` | Add `save_audit_entries_batch_on_conn` method | Task 7 |
| `src-tauri/src/commands/audit.rs` | Use batch save in `batch_save_audit_entries` | Task 7 |
| `src-tauri/src/commands/command.rs` | Wrap `command_run_inner` DB writes in `spawn_blocking` | Task 8 |
| `frontend/src/app/App.tsx` | Lazy-load `motion/react` via wrapper component | Task 9 |
| `crates/storage/src/crud.rs` | Add `list_entities_by_session_ordered` with `ORDER BY json_extract` | Task 9 |
| `src-tauri/src/commands/conversation.rs` | Remove redundant in-memory sort in `get_session_detail_with_db` | Task 9 |

---

### Task 1: Push LIMIT/ORDER BY to SQL in list_audit_entries_with_db

**Files:**
- Modify: `crates/storage/src/crud.rs` (add public `list_entities_with_limit`)
- Modify: `src-tauri/src/commands/audit.rs` (L107-115)

**Interfaces:**
- Consumes: `list_entities_filtered` (private, L178-215) which already supports `limit` + `ORDER BY updated_at DESC`
- Produces: `Database::list_entities_with_limit(table, limit)` public method; `list_audit_entries_with_db` uses it

**Context:** `list_audit_entries_with_db` (audit.rs L107-115) loads ALL audit rows via `list_entities`, sorts in Rust memory by `timestamp` reverse, then `truncate(limit)`. The storage layer already has `list_entities_filtered` with SQL-level `LIMIT` + `ORDER BY updated_at DESC`, but it's private and the public `list_entities` hardcodes `None` for limit.

- [ ] **Step 1: Write a failing test for list_entities_with_limit**

In `crates/storage/src/crud.rs` test module, add:

```rust
#[test]
fn list_entities_with_limit_returns_fewer_rows() {
    let db = Database::open_in_memory().unwrap();
    // Insert 10 audit entries
    for i in 0..10 {
        let entry = AuditEntry {
            id: format!("audit-{i}"),
            timestamp: 1000 + i,
            operation_type: "test".to_string(),
            summary: format!("entry {i}"),
            risk_level: RiskLevel::Low,
            decision: "allow".to_string(),
            detail: None,
        };
        db.save_entity(EntityTable::AuditRecords, &entry.id, None, None, Some("test"), &entry).unwrap();
    }
    // Request only 5
    let result: Vec<AuditEntry> = db.list_entities_with_limit(EntityTable::AuditRecords, 5).unwrap();
    assert_eq!(result.len(), 5, "should return only 5 entries");
    // Should be ordered by updated_at DESC (most recent first)
    assert_eq!(result[0].id, "audit-9");
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl-storage list_entities_with_limit -- --nocapture 2>&1 | Select-String "error|FAILED|panicked" | Select-Object -Last 5
```
Expected: FAIL — method `list_entities_with_limit` not found

- [ ] **Step 3: Implement list_entities_with_limit**

In `crates/storage/src/crud.rs`, add a public method that delegates to the existing private `list_entities_filtered`:

```rust
/// List entities with a SQL-level LIMIT, ordered by updated_at DESC.
/// Useful for tables that grow unboundedly (e.g., audit records).
pub fn list_entities_with_limit<T: DeserializeOwned>(
    &self,
    table: EntityTable,
    limit: usize,
) -> Result<Vec<T>, AppError> {
    self.list_entities_filtered(table, None, Some(limit))
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cargo test -p adl-storage list_entities_with_limit -- --nocapture 2>&1 | Select-String "test result|error|FAILED" | Select-Object -Last 5
```
Expected: PASS

- [ ] **Step 5: Update list_audit_entries_with_db to use the new method**

In `src-tauri/src/commands/audit.rs` (L107-115), replace:

```rust
pub fn list_audit_entries_with_db(
    db: &adl_storage::Database,
    limit: usize,
) -> Result<Vec<AuditEntry>, AppError> {
    let mut entries: Vec<AuditEntry> = db.list_entities(EntityTable::AuditRecords)?;
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.timestamp));
    entries.truncate(limit);
    Ok(entries)
}
```

with:

```rust
pub fn list_audit_entries_with_db(
    db: &adl_storage::Database,
    limit: usize,
) -> Result<Vec<AuditEntry>, AppError> {
    db.list_entities_with_limit(EntityTable::AuditRecords, limit)
}
```

**Note:** The SQL `ORDER BY updated_at DESC` replaces the Rust `sort_by_key(|e| Reverse(e.timestamp))`. These are equivalent at write time (both set to `now_ms()` at insert), but if `updated_at` diverges from `timestamp` on updates, the order may differ. If strict `timestamp` ordering is required, see Task 9 which adds `json_extract` ordering. For audit records (which are never updated), `updated_at` == `timestamp` at insert, so this is safe.

- [ ] **Step 6: Verify clippy + tests**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass. Update any audit tests that expected the old sort behavior.

- [ ] **Step 7: Commit**

```powershell
git add crates/storage/src/crud.rs src-tauri/src/commands/audit.rs
git commit -m "perf(rust): push LIMIT/ORDER BY to SQL in list_audit_entries_with_db

Eliminates loading ALL audit rows into memory. Uses new
list_entities_with_limit method that applies LIMIT and
ORDER BY at the SQL level. Audit table no longer grows
query cost linearly."
```

---

### Task 2: Replace read_text_file probe with metadata check in tree walk

**Files:**
- Modify: `crates/workspace/src/tree.rs` (L224-259, L348-389)

**Interfaces:**
- Consumes: `adl_fs_ops::read_text_file` (currently used for readability validation)
- Produces: `is_text_file(root, relative, max_file_bytes)` helper using `fs::metadata` + extension-based filtering

**Context:** `collect_retrieval_inner` (L245) and `collect_text_files_inner_int` (L375) both call `read_text_file(root, &relative, max_file_bytes).is_ok()` to check if a file is readable text — but then discard the content. Only the path and extension are used afterwards. This reads gigabytes of content on large workspaces just to throw it away.

- [ ] **Step 1: Write a failing test for the metadata-based check**

In `crates/workspace/src/tree.rs` test module, add:

```rust
#[test]
fn is_text_file_returns_true_for_txt() {
    let tmp = std::env::temp_dir().join(format!("tree-test-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    std::fs::write(tmp.join("test.txt"), b"hello").unwrap();
    assert!(is_text_file(&tmp, std::path::Path::new("test.txt"), 1024 * 1024));
    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
fn is_text_file_returns_false_for_binary() {
    let tmp = std::env::temp_dir().join(format!("tree-test-bin-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    std::fs::write(tmp.join("test.exe"), b"\x4d\x5a").unwrap();
    assert!(!is_text_file(&tmp, std::path::Path::new("test.exe"), 1024 * 1024));
    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
fn is_text_file_returns_false_for_oversized() {
    let tmp = std::env::temp_dir().join(format!("tree-test-big-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    // Write a file slightly over 1 byte limit
    std::fs::write(tmp.join("big.txt"), b"hello world").unwrap();
    assert!(!is_text_file(&tmp, std::path::Path::new("big.txt"), 1));
    std::fs::remove_dir_all(&tmp).ok();
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cargo test -p adl-workspace is_text_file -- --nocapture 2>&1 | Select-String "error|FAILED|panicked" | Select-Object -Last 5
```
Expected: FAIL — function `is_text_file` not found

- [ ] **Step 3: Implement is_text_file**

In `crates/workspace/src/tree.rs`, add a helper function:

```rust
/// Check if a file is likely a text file without reading its content.
/// Uses file size (via metadata) and extension-based filtering.
/// Binary extensions are excluded; unknown extensions are allowed if size is within limit.
fn is_text_file(root: &Path, relative: &Path, max_file_bytes: u64) -> bool {
    let full_path = root.join(relative);
    
    // Check file size via metadata (no content read)
    let metadata = match std::fs::metadata(&full_path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if !metadata.is_file() || metadata.len() > max_file_bytes {
        return false;
    }

    // Exclude known binary extensions
    const BINARY_EXTENSIONS: &[&str] = &[
        "exe", "dll", "so", "dylib", "bin", "obj", "o", "a", "lib",
        "png", "jpg", "jpeg", "gif", "bmp", "ico", "tiff", "webp",
        "zip", "tar", "gz", "bz2", "7z", "rar", "xz",
        "mp3", "mp4", "avi", "mov", "wmv", "flv", "wav", "ogg",
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "sqlite", "db", "mdb",
        "wasm", "class",
    ];
    let ext = relative
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if BINARY_EXTENSIONS.contains(&ext.as_str()) {
        return false;
    }

    true
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cargo test -p adl-workspace is_text_file -- --nocapture 2>&1 | Select-String "test result|error|FAILED" | Select-Object -Last 5
```
Expected: PASS

- [ ] **Step 5: Replace read_text_file calls in collect_retrieval_inner**

In `collect_retrieval_inner` (L244-253), replace:

```rust
if files.len() < MAX_COLLECTED_FILES
    && adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok()
{
    let ext = path.extension()...;
    *extensions.entry(ext).or_insert(0) += 1;
    files.push(path);
}
```

with:

```rust
if files.len() < MAX_COLLECTED_FILES && is_text_file(root, &relative, max_file_bytes) {
    let ext = path.extension()...;
    *extensions.entry(ext).or_insert(0) += 1;
    files.push(path);
}
```

- [ ] **Step 6: Replace read_text_file calls in collect_text_files_inner_int**

In `collect_text_files_inner_int` (L375-384), replace:

```rust
if adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok() {
    if let Some(ref mut ext_map) = extensions {
        let ext = path.extension()...;
        *ext_map.entry(ext).or_insert(0) += 1;
    }
    files.push(path);
}
```

with:

```rust
if is_text_file(root, &relative, max_file_bytes) {
    if let Some(ref mut ext_map) = extensions {
        let ext = path.extension()...;
        *ext_map.entry(ext).or_insert(0) += 1;
    }
    files.push(path);
}
```

- [ ] **Step 7: Verify clippy + tests**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass. If existing tree tests assert file counts that depended on `read_text_file` behavior, update them (the `is_text_file` check is more permissive for unknown extensions but stricter for known binary extensions).

- [ ] **Step 8: Commit**

```powershell
git add crates/workspace/src/tree.rs
git commit -m "perf(rust): replace read_text_file probe with metadata-based is_text_file check

Eliminates reading full file content just to validate readability
in tree walk. Uses fs::metadata for size check and extension-based
filtering for binary exclusion. Significant I/O reduction on large
workspaces with 10k+ files."
```

---

### Task 3: Fix search_text_async — move collect_text_files into spawn_blocking + fix detached cancellation task

**Files:**
- Modify: `crates/workspace/src/search.rs` (L19-44)

**Interfaces:**
- Consumes: `collect_text_files` from `crate::tree`
- Produces: `search_text_async` does all blocking I/O inside `spawn_blocking`; cancellation handled via `select!` instead of detached task

**Context:** Two issues in `search_text_async` (L19-44):
1. `collect_text_files` (L30) runs on the async runtime thread, blocking a tokio worker for the duration of directory walk + file probes
2. `tokio::spawn` (L34-37) creates a cancellation-listener task whose `JoinHandle` is immediately dropped — the task lingers until the broadcast sender drops

- [ ] **Step 1: Write a failing test for search cancellation**

In `crates/workspace/src/search.rs` test module, add:

```rust
#[tokio::test]
async fn search_text_async_returns_empty_on_cancellation() {
    let tmp = std::env::temp_dir().join(format!("search-cancel-test-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    std::fs::write(tmp.join("test.txt"), b"hello world").unwrap();

    let (tx, rx) = tokio::sync::broadcast::channel::<()>(1);
    // Cancel immediately before search starts
    let _ = tx.send(());
    let result = search_text_async(&tmp, "hello", rx).await;
    assert!(result.is_ok());
    // Result should be empty or contain no matches (cancellation took effect)
    // The key assertion: the function returns without hanging
    std::fs::remove_dir_all(&tmp).ok();
}
```

- [ ] **Step 2: Run test to verify current behavior**

```powershell
cargo test -p adl-workspace search_text_async_returns_empty_on_cancellation -- --nocapture 2>&1 | Select-String "test result|error|FAILED" | Select-Object -Last 5
```
Expected: PASS (the test should pass even with current code, but it establishes a baseline). The real fix is verified by checking that no detached task is left behind.

- [ ] **Step 3: Refactor search_text_async**

In `crates/workspace/src/search.rs`, replace the entire `search_text_async` function (L19-44) with:

```rust
pub async fn search_text_async(
    root: &Path,
    query: &str,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query = query.to_string();
    let root_owned = root.to_path_buf();
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_clone = cancelled.clone();

    let search_task = tokio::task::spawn_blocking(move || {
        // Move collect_text_files INSIDE spawn_blocking — it does heavy I/O
        let files = crate::tree::collect_text_files(&root_owned, crate::DEFAULT_MAX_FILE_BYTES)?;
        let cancelled_fn = move || cancelled_clone.load(Ordering::Relaxed);
        search_text_in_files(&files, &root_owned, &query, &cancelled_fn)
    });

    // Use select! instead of a detached spawn task
    tokio::select! {
        biased;
        _ = cancellation.recv() => {
            cancelled.store(true, Ordering::Relaxed);
            // Don't abort the blocking task (can't safely), but signal it to stop
            // Return empty results — the blocking task will finish on its own
            Ok(vec![])
        }
        result = search_task => {
            result.map_err(|e| AppError::Io(e.to_string()))?
        }
    }
}
```

**Key changes:**
- `collect_text_files` moved inside `spawn_blocking` closure (no longer blocks the async runtime)
- `tokio::spawn` for cancellation listener replaced with `tokio::select!` — no detached task
- `cancelled` Arc is shared with the blocking closure; setting it via `cancellation.recv()` signals the search to stop early

- [ ] **Step 4: Run test to verify it passes**

```powershell
cargo test -p adl-workspace search_text_async -- --nocapture 2>&1 | Select-String "test result|error|FAILED" | Select-Object -Last 5
```
Expected: PASS

- [ ] **Step 5: Verify clippy + all tests**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add crates/workspace/src/search.rs
git commit -m "perf(rust): move collect_text_files into spawn_blocking and fix detached cancellation task

- collect_text_files (directory walk + file probes) no longer
  blocks the async runtime worker thread
- Replaces detached tokio::spawn cancellation listener with
  tokio::select! — no lingering tasks after search completes"
```

---

### Task 4: Fix MessageStream re-render storm during streaming

**Files:**
- Modify: `frontend/src/app/components/MessageStream.tsx` (L142-180, L207-242)

**Interfaces:**
- Consumes: `streamItems` useMemo, `RowComponent` memo comparator, `rowProps` useMemo
- Produces: `RowComponent` only re-renders rows whose actual content changed, not all rows on every token

**Context:** During LLM streaming (10-100+ tokens/sec), `streamingText` changes on every token. This invalidates the `streamItems` useMemo (L230), creating a new array reference. The `RowComponent` memo comparator (L147-149) returns `false` (force re-render) whenever `prevProps.streamItems !== nextProps.streamItems`, causing ALL visible rows to re-render on every token.

- [ ] **Step 1: Write a failing test for memo behavior**

In `frontend/src/app/components/MessageStream.test.tsx` (or create if not exists), add a test that verifies non-streaming rows don't re-render when `streamingText` changes:

```typescript
import { render, screen } from '@testing-library/react';
import { MessageStream } from './MessageStream';

// This test verifies that when streamingText changes, only the
// streaming message row re-renders, not all historical message rows.
// We can't easily test re-render counts in jsdom, but we can verify
// the component doesn't crash and renders the expected structure.
it('renders without crashing when streamingText changes', () => {
  const messages = [
    { id: 'msg-1', role: 'user', content: 'hello', createdAt: 1, runId: undefined },
    { id: 'msg-2', role: 'assistant', content: 'hi there', createdAt: 2, runId: 'run-1' },
  ];
  const { rerender } = render(
    <MessageStream messages={messages} streamingText="partial" isStreaming={true} />
  );
  // Re-render with new streamingText — should not crash
  rerender(
    <MessageStream messages={messages} streamingText="partial response" isStreaming={true} />
  );
  expect(screen.getByText('hello')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it passes (baseline)**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run test -- --run MessageStream 2>&1 | Select-String "passed|failed|error" | Select-Object -Last 5
```
Expected: PASS (baseline — the test verifies no crash, not re-render count)

- [ ] **Step 3: Fix the RowComponent memo comparator**

Read `frontend/src/app/components/MessageStream.tsx` L142-180.

The fix: remove the early `prevProps.streamItems !== nextProps.streamItems` short-circuit (L147-149). Instead, rely on per-item comparison. The comparator already checks `item.type !== nextItem.type` (L155) and `item.type === 'streaming-message'` (L156) — this is sufficient to determine if a specific row needs re-rendering.

Replace the memo comparator (L142-180) with:

```typescript
(prevProps, nextProps) => {
    if (prevProps.index !== nextProps.index) {
      return false;
    }

    const item = prevProps.streamItems[prevProps.index];
    const nextItem = nextProps.streamItems[nextProps.index];

    // If the item type changed, re-render
    if (!item || !nextItem || item.type !== nextItem.type) {
      return false;
    }

    // For streaming-message rows, re-render when streamingText changes
    if (item.type === 'streaming-message' && prevProps.streamingText !== nextProps.streamingText) {
      return false;
    }

    // For non-streaming rows, check if the underlying data changed
    // (message reference, run ID, etc.)
    if (item.type === 'message' && nextItem.type === 'message') {
      return item.message === nextItem.message;
    }
    if (item.type === 'run-summary' && nextItem.type === 'run-summary') {
      return item.runId === nextItem.runId && prevProps.activeRun === nextProps.activeRun;
    }
    if (item.type === 'streaming-run-summary' && nextItem.type === 'streaming-run-summary') {
      return item.runId === nextItem.runId;
    }
    if (item.type === 'approval-hint') {
      return prevProps.activeRun === nextProps.activeRun;
    }

    // Check other prop changes that affect all rows
    if (prevProps.activeRun !== nextProps.activeRun) {
      return false;
    }
    if (prevProps.runActivityByRunId !== nextProps.runActivityByRunId) {
      return false;
    }
    if (prevProps.runUsageByRunId !== nextProps.runUsageByRunId) {
      return false;
    }
    if (prevProps.locale !== nextProps.locale) {
      return false;
    }

    return true;
  }
```

**Key change:** The early `prevProps.streamItems !== nextProps.streamItems` check is removed. Now, each row type has its own comparison logic. Non-streaming rows compare by message reference (which doesn't change on token updates), so they skip re-rendering.

- [ ] **Step 4: Run test to verify it still passes**

```powershell
pnpm run test -- --run MessageStream 2>&1 | Select-String "passed|failed|error" | Select-Object -Last 5
```
Expected: PASS

- [ ] **Step 5: Verify typecheck + lint**

```powershell
pnpm run typecheck
pnpm run lint
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/components/MessageStream.tsx frontend/src/app/components/MessageStream.test.tsx
git commit -m "perf(frontend): fix MessageStream re-render storm during LLM streaming

Removes early streamItems identity check from RowComponent memo
comparator that forced ALL rows to re-render on every streaming
token. Each row type now has its own comparison logic — only
streaming-message rows re-render when streamingText changes."
```

---

### Task 5: Switch preview-pty-bridge to incremental output protocol

**Files:**
- Modify: `frontend/src/preview-bridge/preview-pty-bridge.ts` (L15, L17-53)
- Modify: `frontend/dev/previewTerminalService.ts` (server-side output caching)

**Interfaces:**
- Consumes: `PtySessionInfo` from preview API, `PtyOutputEvent` listener pattern
- Produces: Client tracks a per-session cursor; server returns only new output since last poll

**Context:** `sessionOutputBuffers` (L15) stores FULL per-session output strings. Every 1s poll: server sends full output, client does O(N) comparison, then `slice(lastOutput.length)` to get the diff. Memory grows linearly with session output (100MB+ for long build logs). CPU per poll grows linearly with output length.

- [ ] **Step 1: Read both files**

Read `frontend/src/preview-bridge/preview-pty-bridge.ts` and `frontend/dev/previewTerminalService.ts` completely.

- [ ] **Step 2: Implement server-side cursor tracking**

In `frontend/dev/previewTerminalService.ts`, change the PTY output cache to track per-session output length and expose a "since cursor" endpoint:

```typescript
// Change from storing full output to storing output + cursor tracking
interface PtySessionState {
  output: string;       // full accumulated output (kept for backward compat)
  outputLength: number; // tracks the length for cursor-based diffing
}

// Add a new endpoint: /pty/output-since?sessionId=xxx&cursor=12345
// Returns: { sessionId, newOutput, newCursor }
```

Add a new route handler:
```typescript
app.use('/pty/output-since', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const cursor = parseInt(req.query.cursor as string, 10) || 0;
  const session = ptySessions.get(sessionId);
  if (!session) {
    res.json({ sessionId, newOutput: '', newCursor: 0 });
    return;
  }
  const newOutput = session.output.slice(cursor);
  res.json({ sessionId, newOutput, newCursor: session.output.length });
});
```

- [ ] **Step 3: Update client to use cursor-based polling**

In `frontend/src/preview-bridge/preview-pty-bridge.ts`, replace `sessionOutputBuffers: Map<string, string>` with `sessionCursors: Map<string, number>`:

```typescript
const sessionCursors = new Map<string, number>();

async function pollOnce(): Promise<void> {
    if (!shouldPoll) {
      return;
    }
    
    // First, get the list of sessions
    const listResult = await requestPreviewApi<PtySessionInfo[]>('/pty/list');
    if (!shouldPoll) {
      return;
    }

    if (listResult.ok) {
      consecutiveErrors = 0;
      const sessions = listResult.data;
      
      // For each session, fetch only new output since cursor
      const outputPromises = sessions.map(async (session) => {
        const cursor = sessionCursors.get(session.sessionId) ?? 0;
        const sinceResult = await requestPreviewApi<{ sessionId: string; newOutput: string; newCursor: number }>(
          `/pty/output-since?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${cursor}`
        );
        if (sinceResult.ok && sinceResult.data.newOutput) {
          const event: PtyOutputEvent = {
            sessionId: session.sessionId,
            data: sinceResult.data.newOutput,
          };
          ptyOutputListeners.forEach((fn) => fn(event));
          sessionCursors.set(session.sessionId, sinceResult.data.newCursor);
        }
      });
      await Promise.allSettled(outputPromises);
    } else {
      consecutiveErrors += 1;
    }

    if (shouldPoll) {
      const delay = Math.min(PTY_POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors), MAX_BACKOFF_MS);
      pollTimeoutId = setTimeout(pollOnce, delay);
    }
}
```

Also update `stopPolling` and `kill` to clean up `sessionCursors` instead of `sessionOutputBuffers`.

- [ ] **Step 4: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```
Expected: 0 errors, all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/preview-bridge/preview-pty-bridge.ts frontend/dev/previewTerminalService.ts
git commit -m "perf(browser): switch preview-pty-bridge to cursor-based incremental output protocol

Client now tracks a per-session cursor and fetches only new output
since the last poll, instead of receiving the full accumulated
output every 1s. Eliminates O(N) memory growth and O(N) per-poll
CPU cost for long-running terminal sessions."
```

---

### Task 6: Harden SQLite pool — add connection_timeout + per-connection PRAGMA

**Files:**
- Modify: `crates/storage/src/connection.rs` (L14-31)

**Interfaces:**
- Consumes: `r2d2::Pool`, `SqliteConnectionManager`
- Produces: Pool with 5s `connection_timeout` and `with_init` PRAGMA on every new connection

**Context:** Two bugs in the current pool config (L14-31):
1. No `connection_timeout` — 9th concurrent `pool.get()` blocks indefinitely
2. `PRAGMA foreign_keys=ON` set only on the initial connection, not on subsequent pool connections (PRAGMA is per-connection)

- [ ] **Step 1: Write a failing test for per-connection PRAGMA**

In `crates/storage/src/connection.rs` test module, add:

```rust
#[test]
fn foreign_keys_enforced_on_all_pool_connections() {
    let db = Database::open_in_memory().unwrap();
    
    // Try to insert a row with a foreign key violation on a DIFFERENT
    // connection from the pool (not the initial one)
    // This should fail if PRAGMA foreign_keys=ON is set per-connection
    
    // First, create a table with a foreign key constraint
    db.conn().unwrap().execute_batch(
        "CREATE TABLE parent (id INTEGER PRIMARY KEY);
         CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));"
    ).unwrap();
    
    // Get a different connection from the pool and try to violate FK
    let result = db.conn().unwrap().execute(
        "INSERT INTO child (id, parent_id) VALUES (1, 999)",
        [],
    );
    
    // This should FAIL (return Err) because foreign_keys=ON
    assert!(result.is_err(), "foreign key constraint should be enforced on all pool connections");
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl-storage foreign_keys_enforced -- --nocapture 2>&1 | Select-String "error|FAILED|panicked|assertion" | Select-Object -Last 5
```
Expected: FAIL — foreign key constraint not enforced (PRAGMA not set on pool connections)

- [ ] **Step 3: Fix the pool configuration**

In `crates/storage/src/connection.rs`, replace the `open` method (L14-31):

```rust
impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;

        // Use with_init to apply PRAGMAs on EVERY new pooled connection
        // (PRAGMA foreign_keys is per-connection, not per-database)
        let manager = SqliteConnectionManager::file(path)
            .with_init(|c| c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"));

        let pool = Pool::builder()
            .max_size(8)
            .connection_timeout(std::time::Duration::from_secs(5))
            .build(manager)
            .map_err(|e| AppError::Storage(format!("Failed to create connection pool: {e}")))?;

        info!(?path, "database pool opened (max_size=8, timeout=5s, foreign_keys=ON per-connection)");
        Ok(Self { pool })
    }
```

**Key changes:**
- `with_init` applies PRAGMAs on every new pooled connection (not just the initial one)
- `connection_timeout(Duration::from_secs(5))` prevents indefinite blocking on pool exhaustion
- Removed the separate `conn.execute_batch(...)` call — `with_init` handles it

- [ ] **Step 4: Run test to verify it passes**

```powershell
cargo test -p adl-storage foreign_keys_enforced -- --nocapture 2>&1 | Select-String "test result|error|FAILED" | Select-Object -Last 5
```
Expected: PASS

- [ ] **Step 5: Verify clippy + all tests**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass. If existing tests relied on FK not being enforced, update them.

- [ ] **Step 6: Commit**

```powershell
git add crates/storage/src/connection.rs
git commit -m "fix(rust): enforce PRAGMA foreign_keys on all pool connections + add connection_timeout

- Uses with_init to apply PRAGMA foreign_keys=ON on every new
  pooled connection (was only on initial connection)
- Adds 5s connection_timeout to prevent indefinite blocking under
  pool exhaustion (9th concurrent request)
- Removes redundant manual PRAGMA execution"
```

---

### Task 7: Add save_audit_entries_batch_on_conn for atomic batch transaction

**Files:**
- Modify: `crates/storage/src/crud.rs` (add `save_audit_entries_batch_on_conn`)
- Modify: `src-tauri/src/commands/audit.rs` (L77-104)

**Interfaces:**
- Consumes: `save_entity_on_conn` (existing), `Database::transaction` (existing)
- Produces: `Database::save_audit_entries_batch_on_conn(conn, entries)` — single transaction, single connection

**Context:** `batch_save_audit_entries` (audit.rs L77-104) loops through entries calling `state.db.save_entity(...)` once per entry. Each call acquires its own pool connection and runs its own implicit transaction. For 5 entries, that's 5 connection acquisitions + 5 fsyncs. The codebase already solved this for sessions via `save_sessions_batch_on_conn` (crud.rs L53-70).

- [ ] **Step 1: Write a failing test for batch save**

In `crates/storage/src/crud.rs` test module, add:

```rust
#[test]
fn save_audit_entries_batch_is_atomic() {
    let db = Database::open_in_memory().unwrap();
    
    let entries = vec![
        AuditBatchEntry {
            workspace_id: "ws-1".to_string(),
            session_id: Some("sess-1".to_string()),
            operation_type: "command".to_string(),
            summary: "test entry 1".to_string(),
            risk_level: RiskLevel::Low,
            decision: "allow".to_string(),
            detail: None,
        },
        AuditBatchEntry {
            workspace_id: "ws-1".to_string(),
            session_id: Some("sess-1".to_string()),
            operation_type: "command".to_string(),
            summary: "test entry 2".to_string(),
            risk_level: RiskLevel::High,
            decision: "deny".to_string(),
            detail: None,
        },
    ];
    
    // Use batch save in a single transaction
    let result = db.transaction(|conn| {
        db.save_audit_entries_batch_on_conn(conn, &entries, "ws-1", Some("sess-1"))
    });
    assert!(result.is_ok());
    
    // Verify both entries were saved
    let saved: Vec<AuditEntry> = db.list_entities(EntityTable::AuditRecords).unwrap();
    assert_eq!(saved.len(), 2);
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cargo test -p adl-storage save_audit_entries_batch -- --nocapture 2>&1 | Select-String "error|FAILED|panicked" | Select-Object -Last 5
```
Expected: FAIL — method `save_audit_entries_batch_on_conn` not found

- [ ] **Step 3: Implement save_audit_entries_batch_on_conn**

In `crates/storage/src/crud.rs`, add the method (mirroring `save_sessions_batch_on_conn`):

```rust
/// Save multiple audit entries using a borrowed connection (for use inside a transaction).
/// Mirrors the pattern of `save_sessions_batch_on_conn`.
pub fn save_audit_entries_batch_on_conn(
    &self,
    conn: &rusqlite::Connection,
    entries: &[AuditBatchEntry],
    workspace_id: &str,
    session_id: Option<&str>,
) -> Result<Vec<AuditEntry>, AppError> {
    let mut saved = Vec::with_capacity(entries.len());
    for e in entries {
        let id = create_id("audit");
        let entry = AuditEntry {
            id,
            timestamp: now_ms(),
            operation_type: e.operation_type.clone(),
            summary: e.summary.clone(),
            risk_level: e.risk_level,
            decision: e.decision.clone(),
            detail: e.detail.clone(),
        };
        self.save_entity_on_conn(
            conn,
            EntityTable::AuditRecords,
            &entry.id,
            Some(workspace_id),
            session_id,
            Some(&e.operation_type),
            &entry,
        )?;
        saved.push(entry);
    }
    Ok(saved)
}
```

**Note:** `AuditBatchEntry` must be importable in `crud.rs`. If it's defined in `src-tauri/src/commands/audit.rs`, move it to `crates/types/` or `crates/storage/` so the storage crate can use it. Alternatively, accept `AuditEntry` directly (which is already in `adl-types`).

- [ ] **Step 4: Update batch_save_audit_entries to use the batch method**

In `src-tauri/src/commands/audit.rs` (L77-104), replace:

```rust
pub fn batch_save_audit_entries(
    state: &AppState,
    entries: Vec<AuditBatchEntry>,
) -> Result<Vec<AuditEntry>, AppError> {
    let mut saved = Vec::with_capacity(entries.len());
    for e in entries {
        let id = create_id("audit");
        let entry = AuditEntry { ... };
        state.db.save_entity(...)?;
        saved.push(entry);
    }
    Ok(saved)
}
```

with:

```rust
pub fn batch_save_audit_entries(
    state: &AppState,
    entries: Vec<AuditBatchEntry>,
) -> Result<Vec<AuditEntry>, AppError> {
    let workspace_id = entries.first().map(|e| e.workspace_id.as_str()).unwrap_or("");
    let session_id = entries.first().and_then(|e| e.session_id.as_deref());
    
    state.db.transaction(|conn| {
        state.db.save_audit_entries_batch_on_conn(conn, &entries, workspace_id, session_id)
    })
}
```

**Key change:** Single connection, single transaction, atomic batch. If any entry fails, the entire batch rolls back.

- [ ] **Step 5: Run test to verify it passes**

```powershell
cargo test -p adl-storage save_audit_entries_batch -- --nocapture 2>&1 | Select-String "test result|error|FAILED" | Select-Object -Last 5
```
Expected: PASS

- [ ] **Step 6: Verify clippy + all tests**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```

- [ ] **Step 7: Commit**

```powershell
git add crates/storage/src/crud.rs src-tauri/src/commands/audit.rs
git commit -m "perf(rust): add save_audit_entries_batch_on_conn for atomic batch transaction

Replaces N individual save_entity calls (each with its own
connection + transaction) with a single transaction using a
borrowed connection. Mirrors the save_sessions_batch_on_conn
pattern. Atomic — all entries save or none do."
```

---

### Task 8: Wrap command_run_inner DB writes in spawn_blocking

**Files:**
- Modify: `src-tauri/src/commands/command.rs` (L46-109)

**Interfaces:**
- Consumes: `AppState`, `save_entity`, `save_audit_entry`
- Produces: All DB writes in `command_run_inner` happen inside a single `spawn_blocking` closure

**Context:** `command_run_inner` (L46-109) is `async fn` but calls `state.db.save_entity(...)` directly on the async runtime thread (not in `spawn_blocking`). This happens 3-4 times per command invocation (save request, save execution, save audit if risky, save audit after execution). Each `save_entity` acquires a pool connection and does SQLite I/O, blocking a tokio worker.

- [ ] **Step 1: Read the function**

Read `src-tauri/src/commands/command.rs` L46-109 completely.

- [ ] **Step 2: Wrap DB writes in spawn_blocking**

Refactor `command_run_inner` to batch all DB writes inside a single `spawn_blocking` closure. The approach:

```rust
async fn command_run_inner(state: &AppState, /* ... params ... */) -> Result<..., AppError> {
    // ... prepare request, execute command (async parts stay async) ...
    
    // Batch all DB writes in a single spawn_blocking
    let db_result = {
        let db = state.db.clone(); // Database must be Clone or wrapped in Arc
        let request = request.clone();
        let result = result.clone();
        let workspace = workspace.clone();
        
        tokio::task::spawn_blocking(move || {
            // Save request
            db.save_entity(EntityTable::CommandRequests, &request.id, ...)?;
            
            // Save audit if risky
            if request.risk_level != RiskLevel::Low {
                save_audit_entry(&state_clone, ...)?;
            }
            
            // Save execution result
            db.save_entity(EntityTable::CommandExecutions, &result.request.id, ...)?;
            
            // Save audit after execution
            save_audit_entry(&state_clone, ...)?;
            
            Ok(())
        })
    }
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    
    Ok(result)
}
```

**Important considerations:**
- `Database` must be cheaply cloneable (it wraps `Arc<Pool>`, so cloning is fine)
- `AppState` contains `Arc` fields — clone the necessary Arcs into the closure
- If `save_audit_entry` needs `&AppState`, extract just the `db` field and pass it separately
- The async parts (command execution, approval flow) stay outside `spawn_blocking`

- [ ] **Step 3: Verify**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/commands/command.rs
git commit -m "perf(rust): wrap command_run_inner DB writes in spawn_blocking

3-4 DB save calls per command invocation no longer block the
async runtime worker thread. All writes batched in a single
spawn_blocking closure."
```

---

### Task 9: Lazy-load motion/react + fix get_session_detail redundant sort

**Files:**
- Modify: `frontend/src/app/App.tsx` (L24, L164-176, L267-277)
- Create: `frontend/src/app/components/StartupOverlayWrapper.tsx`
- Modify: `crates/storage/src/crud.rs` (add `list_entities_by_session_ordered`)
- Modify: `src-tauri/src/commands/conversation.rs` (L424-437)

**Interfaces:**
- Consumes: `motion/react` (currently static import), `list_entities_by_session` (returns `ORDER BY updated_at DESC`)
- Produces: `motion/react` lazy-loaded via wrapper; `list_entities_by_session_ordered` with `ORDER BY json_extract(json, '$.createdAt') ASC`

**Context:** Two minor optimizations:
1. `motion/react` (~30-50KB) is statically imported in `App.tsx` but only used for the startup overlay (shown once at launch)
2. `get_session_detail_with_db` (conversation.rs L424-437) calls `list_entities_by_session` (which returns `ORDER BY updated_at DESC`) then re-sorts in Rust by `created_at` ASC — redundant double-sort

- [ ] **Step 1: Create StartupOverlayWrapper.tsx**

Create `frontend/src/app/components/StartupOverlayWrapper.tsx`:

```typescript
import { lazy, Suspense } from 'react';
import { AnimatePresence } from 'motion/react';
import { StartupOverlay } from './StartupOverlay';

const MotionDiv = lazy(() =>
  import('motion/react').then((m) => ({ default: m.motion.div }))
);

interface StartupOverlayWrapperProps {
  visible: boolean;
}

export function StartupOverlayWrapper({ visible }: StartupOverlayWrapperProps) {
  return (
    <AnimatePresence>
      {visible && (
        <Suspense fallback={null}>
          <MotionDiv
            key="startup-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartupOverlay />
          </MotionDiv>
        </Suspense>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Update App.tsx to use the wrapper**

In `frontend/src/app/App.tsx`:
1. Remove the static import at L24: `import { AnimatePresence, motion } from 'motion/react';`
2. Add import: `import { StartupOverlayWrapper } from './components/StartupOverlayWrapper';`
3. Replace both `<AnimatePresence>...<motion.div>...</AnimatePresence>` blocks (L164-176 and L267-277) with:
```tsx
<StartupOverlayWrapper visible={!overlayHidden} />
```

- [ ] **Step 3: Write a failing test for ordered session messages**

In `crates/storage/src/crud.rs` test module, add:

```rust
#[test]
fn list_entities_by_session_ordered_returns_chronological() {
    let db = Database::open_in_memory().unwrap();
    
    // Create a session
    let session = ConversationSessionRecord { id: "sess-1".into(), /* ... */ };
    db.save_entity(EntityTable::Sessions, &session.id, ...).unwrap();
    
    // Insert 3 messages with non-sequential created_at
    for (i, created_at) in [300, 100, 200].iter().enumerate() {
        let msg = ConversationMessageRecord {
            id: format!("msg-{i}"),
            session_id: "sess-1".to_string(),
            created_at: *created_at,
            // ... other fields ...
        };
        db.save_entity(EntityTable::ConversationMessages, &msg.id, Some("ws-1"), Some("sess-1"), None, &msg).unwrap();
    }
    
    // List ordered by createdAt ASC
    let messages: Vec<ConversationMessageRecord> = db.list_entities_by_session_ordered(
        EntityTable::ConversationMessages,
        "sess-1",
    ).unwrap();
    
    assert_eq!(messages.len(), 3);
    assert_eq!(messages[0].created_at, 100);
    assert_eq!(messages[1].created_at, 200);
    assert_eq!(messages[2].created_at, 300);
}
```

- [ ] **Step 4: Run test to verify it fails**

```powershell
cargo test -p adl-storage list_entities_by_session_ordered -- --nocapture 2>&1 | Select-String "error|FAILED|panicked" | Select-Object -Last 5
```
Expected: FAIL — method not found

- [ ] **Step 5: Implement list_entities_by_session_ordered**

In `crates/storage/src/crud.rs`, add:

```rust
/// List entities by session_id, ordered by json_extract(json, '$.createdAt') ASC.
/// Use this for message lists that need chronological ordering.
pub fn list_entities_by_session_ordered<T: DeserializeOwned>(
    &self,
    table: EntityTable,
    session_id: &str,
) -> Result<Vec<T>, AppError> {
    let base_sql = get_select_all_sql(table);
    let sql = format!(
        "{base_sql} WHERE session_id = ?1 ORDER BY json_extract(json, '$.createdAt') ASC"
    );
    
    let conn = self.conn()?;
    let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
    let rows = stmt
        .query_map([session_id], |row| {
            let json: String = row.get(0)?;
            Ok(json)
        })
        .map_err(|e| AppError::Storage(e.to_string()))?;
    
    let mut result = Vec::new();
    for row in rows {
        let json = row.map_err(|e| AppError::Storage(e.to_string()))?;
        let entity: T = serde_json::from_str(&json)
            .map_err(|e| AppError::Internal(format!("Failed to deserialize: {e}")))?;
        result.push(entity);
    }
    Ok(result)
}
```

**Note:** This assumes the JSON column is named `json` and the field is `createdAt` (camelCase, matching the serde convention). Verify by checking the schema in `crates/storage/src/schema.rs` or the `get_select_all_sql` implementation. If the column or field name differs, adjust accordingly.

- [ ] **Step 6: Update get_session_detail_with_db**

In `src-tauri/src/commands/conversation.rs` (L424-437), replace:

```rust
fn get_session_detail_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<Option<ConversationDetail>, AppError> {
    let Some(session) = db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
    else {
        return Ok(None);
    };
    let mut messages: Vec<ConversationMessageRecord> =
        db.list_entities_by_session(EntityTable::ConversationMessages, session_id)?;
    messages.sort_by_key(|message| message.created_at);
    Ok(Some(ConversationDetail { session, messages }))
}
```

with:

```rust
fn get_session_detail_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<Option<ConversationDetail>, AppError> {
    let Some(session) = db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
    else {
        return Ok(None);
    };
    let messages: Vec<ConversationMessageRecord> =
        db.list_entities_by_session_ordered(EntityTable::ConversationMessages, session_id)?;
    Ok(Some(ConversationDetail { session, messages }))
}
```

**Key change:** Removed the redundant `messages.sort_by_key(|m| m.created_at)` — the SQL now returns messages in chronological order via `ORDER BY json_extract(json, '$.createdAt') ASC`.

- [ ] **Step 7: Run test to verify it passes**

```powershell
cargo test -p adl-storage list_entities_by_session_ordered -- --nocapture 2>&1 | Select-String "test result|error|FAILED" | Select-Object -Last 5
```
Expected: PASS

- [ ] **Step 8: Verify everything**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5

$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```
Expected: 0 errors, all tests pass.

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/app/App.tsx frontend/src/app/components/StartupOverlayWrapper.tsx crates/storage/src/crud.rs src-tauri/src/commands/conversation.rs
git commit -m "perf: lazy-load motion/react + remove redundant message sort

- App.tsx: motion/react (~30-50KB) no longer in initial bundle;
  lazy-loaded via StartupOverlayWrapper only when overlay is visible
- conversation.rs: get_session_detail_with_db uses
  list_entities_by_session_ordered with SQL-level ORDER BY
  json_extract(createdAt) ASC, eliminating redundant in-memory sort"
```

---

## Self-Review

### Spec coverage

| Finding from insight report | Task |
|----------------------------|------|
| High: list_audit_entries_with_db loads ALL rows | Task 1 |
| High: collect_retrieval_inner reads full file contents | Task 2 |
| High: search_text_async collect_text_files on async thread | Task 3 |
| High: search_text_async detached cancellation task | Task 3 |
| High: MessageStream re-render storm | Task 4 |
| High: preview-pty-bridge unbounded output buffer | Task 5 |
| Medium: SQLite pool no connection_timeout | Task 6 |
| Medium: SQLite pool PRAGMA foreign_keys per-connection | Task 6 |
| Medium: batch_save_audit_entries N transactions | Task 7 |
| Medium: command_run_inner DB writes on async thread | Task 8 |
| Low: motion/react static import | Task 9 |
| Low: get_session_detail redundant sort | Task 9 |

All 12 performance findings from the insight report are covered.

### Placeholder scan

- No "TBD", "TODO", "implement later" found
- Task 8 Step 2 shows a template structure with `/* ... params ... */` — the implementer must read the actual function signature and fill in the exact parameters. This is unavoidable without duplicating the entire 60-line function.
- Task 9 Step 5 notes "Verify by checking the schema" — the implementer must confirm the JSON column name. This is a verification step, not a placeholder.

### Type consistency

- `list_entities_with_limit<T: DeserializeOwned>` consistent with existing `list_entities<T>`
- `save_audit_entries_batch_on_conn` mirrors `save_sessions_batch_on_conn` signature pattern
- `list_entities_by_session_ordered<T: DeserializeOwned>` consistent with `list_entities_by_session<T>`
- `StartupOverlayWrapperProps` has a single `visible: boolean` prop

### Notes on assumptions

1. **Task 2**: The `BINARY_EXTENSIONS` list is a best-effort heuristic. Some text files with unusual extensions may be missed, and some binary files with text-like extensions may pass. The `read_text_file` probe was also heuristic (it checked for valid UTF-8), so this is a tradeoff: faster I/O vs slightly different filtering behavior.
2. **Task 5**: The server-side `previewTerminalService.ts` must expose a new `/pty/output-since` endpoint. The implementer should verify the existing route structure and follow the same pattern.
3. **Task 6**: `Database::open_in_memory()` must exist for tests. If it doesn't, add a test-only constructor that uses `:memory:` as the path.
4. **Task 7**: `AuditBatchEntry` may need to be moved to `adl-types` if it's currently in `src-tauri/`. The implementer should check and move if needed.
5. **Task 8**: `Database` must be `Clone` (it wraps `Arc<Pool>`, so this should work). The implementer should verify.
6. **Task 9**: The JSON column name (`json`) and field name (`createdAt`) must be verified against the actual schema. If `createdAt` is stored as `created_at` in the JSON (due to missing serde rename), adjust the `json_extract` path.
