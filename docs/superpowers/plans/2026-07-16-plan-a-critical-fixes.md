# Plan A: Critical Performance & Rule Violations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 5 Critical and 4 High findings from the refactoring insight report — convert sync Tauri commands to async, fix N+1 queries, eliminate empty catch blocks, and replace bypassed error capture patterns.

**Architecture:** Rust Tauri commands are converted from sync `pub fn` to `pub async fn` + `tokio::task::spawn_blocking`, mirroring the already-fixed `workspace_open` pattern. Frontend store slices and action modules are patched to add `console.warn` logging and use the canonical `captureError(get, error)` pipeline instead of direct `set({ error })`.

**Tech Stack:** Rust 1.85+ / Tauri 2.x / tokio / React 19 / TypeScript / Zustand / Vitest / cargo test

## Global Constraints

- Rust minimum version: 1.85+ (edition 2024)
- Node.js path must be set before frontend commands: `$env:Path = "D:\Program Files\nodejs;$env:Path"`
- Cargo path must be set before Rust commands: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- All Rust commands doing I/O MUST be `async fn` + `spawn_blocking` (per `tauri-shell.md` rule)
- All catch blocks MUST log at least `console.warn` (per `error-handling.md` rule)
- All mutation actions MUST use `captureError(get, error)` not `set({ error: msg })` (per `error-handling.md` rule)
- `unwrap()` is forbidden in non-test Rust code
- `else` is forbidden in TypeScript — use early return
- No backward-compatibility code in pre-release phase
- Commit format: `type(scope): summary` where type ∈ {fix, refactor, chore} and scope ∈ {rust, frontend, stores, ipc, core}

## Reference Pattern: Async Tauri Command (from `workspace_open`)

The already-fixed `workspace_open` command in `src-tauri/src/commands/workspace.rs` establishes the pattern all Rust tasks follow:

```rust
#[tauri::command]
pub async fn workspace_open(
    app: tauri::AppHandle,
    workspace_path: String,
) -> Result<IpcResult<WorkspaceMeta>, AppError> {
    let state = app.state::<AppState>();
    let path = PathBuf::from(workspace_path);
    let (meta, snapshot) = tokio::task::spawn_blocking(move || {
        // Heavy I/O work here
        let (meta, _recent) = adl_workspace::open_workspace(path.as_path())?;
        Ok::<_, AppError>((meta, snapshot))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    // DB writes + events back on async runtime
    Ok(ipc(Ok(meta)))
}
```

**Key points:**
1. `pub async fn` (not `pub fn`)
2. Parameter: `app: tauri::AppHandle` (not `state: tauri::State<'_, AppState>`)
3. Return: `Result<IpcResult<T>, AppError>` (not `IpcResult<T>`)
4. Extract state: `let state = app.state::<AppState>();`
5. Clone DB: `let db = state.db.clone();` (Database is Arc-backed, cheap to clone)
6. Wrap I/O in `spawn_blocking(move || { ... })`
7. Flatten errors: `.await.map_err(|e| AppError::Internal(...))??`
8. Return: `Ok(ipc(Ok(result)))`

---

## File Structure

### Rust files modified:
- `src-tauri/src/commands/retrieval.rs` — Task 1
- `src-tauri/src/commands/agent.rs` — Task 2
- `src-tauri/src/commands/conversation.rs` — Task 3 (adds `_with_db` helpers + converts 13 commands)
- `src-tauri/src/commands/permission.rs` — Task 4
- `src-tauri/src/commands/task.rs` — Task 5
- `src-tauri/src/commands/patch.rs` — Task 6
- `src-tauri/src/commands/workspace_sidebar.rs` — Task 7
- `src-tauri/src/commands/provider.rs` — Task 8
- `src-tauri/src/commands/app.rs` — Task 8

### Frontend files modified:
- `frontend/src/app/stores/storageHelpers.ts` — Task 9
- `frontend/src/app/stores/slices/ciSlice.ts` — Task 10
- `frontend/src/app/stores/slices/githubSlice.ts` — Task 10
- `frontend/src/app/stores/slices/githubSliceHelpers.ts` — Task 10
- `frontend/src/app/stores/slices/githubRepoSlice.ts` — Task 10
- `frontend/src/app/stores/slices/uiSlice.ts` — Task 10
- `frontend/src/app/stores/slices/communicateSlice.ts` — Task 10
- `frontend/src/app/stores/slices/workspaceSlice.ts` — Task 10
- `frontend/src/app/stores/slices/uiSliceWidths.ts` — Task 10
- `frontend/src/app/stores/slices/terminalSlice.ts` — Task 10
- `frontend/src/app/regions/left-sidebar/ResizeHandle.utils.ts` — Task 10
- `frontend/src/app/utils/fetchPageMeta.ts` — Task 11
- `frontend/src/preview-bridge/preview-storage.ts` — Task 11
- `frontend/src/app/stores/actions/sessionActions.ts` — Task 12
- `frontend/src/app/stores/actions/editorActions.ts` — Task 12
- `frontend/src/app/stores/actions/editorActionsHelpers.ts` — Task 12
- `frontend/src/app/stores/actions/gitActions.ts` — Task 12
- `frontend/src/app/stores/actions/searchActions.ts` — Task 12
- `frontend/src/app/features/browser/useBrowserSearch.ts` — Task 13

---

### Task 1: Convert `retrieval_rebuild_index` to async

**Files:**
- Modify: `src-tauri/src/commands/retrieval.rs` (lines 15-40)

**Interfaces:**
- Consumes: `AppState` (from `app.state::<AppState>()`), `adl_workspace::build_retrieval_snapshot`, `EntityTable::RetrievalSnapshots`
- Produces: `pub async fn retrieval_rebuild_index(app: tauri::AppHandle) -> Result<IpcResult<bool>, AppError>`

- [ ] **Step 1: Verify current tests pass (baseline)**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: All tests PASS

- [ ] **Step 2: Replace the sync command with async version**

Replace the entire `retrieval_rebuild_index` function (lines 15-40) in `src-tauri/src/commands/retrieval.rs` with:

```rust
#[tauri::command]
pub async fn retrieval_rebuild_index(
    app: tauri::AppHandle,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let workspace = {
        let ws = crate::commands::workspace::current_workspace(&state)?;
        ws
    };
    let workspace_id = workspace.id.clone();
    let root_path = workspace.root_path.clone();
    let db = state.db.clone();

    let snapshot = tokio::task::spawn_blocking(move || {
        adl_workspace::build_retrieval_snapshot(&workspace_id, PathBuf::from(&root_path).as_path())
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    db.save_entity(
        EntityTable::RetrievalSnapshots,
        &workspace_id,
        Some(&workspace_id),
        None,
        Some("completed"),
        &snapshot,
    )?;
    let _ = app.emit("digital-life://retrieval-status", &snapshot);
    state
        .event_bus
        .emit(adl_kernel::events::AppEvent::RetrievalStatusChanged(workspace_id));
    Ok(ipc(Ok(true)))
}
```

- [ ] **Step 3: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/commands/retrieval.rs
git commit -m "fix(rust): convert retrieval_rebuild_index to async + spawn_blocking

Eliminates main-thread blocking during workspace tree walk + file reads.
Mirrors the workspace_open async pattern."
```

---

### Task 2: Fix agent run N+1 query (use `list_entities_by_run`)

**Files:**
- Modify: `src-tauri/src/commands/agent.rs` (lines 63-134, 3 commands)

**Interfaces:**
- Consumes: `db.list_entities_by_run(EntityTable::AgentSteps, run_id)` from `crates/storage/src/crud.rs`
- Produces: Same command signatures, but with efficient SQL-level filtering instead of loading all steps + in-memory retain

- [ ] **Step 1: Verify current tests pass**

Run:
```powershell
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: All tests PASS

- [ ] **Step 2: Fix `agent_get_run` (lines 72-74)**

In `src-tauri/src/commands/agent.rs`, find the `agent_get_run` function's spawn_blocking closure. Replace:

```rust
        let mut steps: Vec<adl_types::AgentPlanStep> = db.list_entities(EntityTable::AgentSteps)?;
        steps.retain(|step| step.run_id == run_id);
        steps.sort_by_key(|step| step.created_at);
```

with:

```rust
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
        steps.sort_by_key(|step| step.created_at);
```

- [ ] **Step 3: Fix `agent_retry_run` (lines 94-96)**

In the same file, find `agent_retry_run`'s spawn_blocking closure. Replace:

```rust
        let mut steps: Vec<adl_types::AgentPlanStep> = db.list_entities(EntityTable::AgentSteps)?;
        steps.retain(|step| step.run_id == run_id);
        steps.sort_by_key(|step| step.created_at);
```

with:

```rust
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
        steps.sort_by_key(|step| step.created_at);
```

- [ ] **Step 4: Fix `agent_abort_run` (lines 120-122)**

In the same file, find `agent_abort_run`'s spawn_blocking closure. Replace:

```rust
        let mut steps: Vec<adl_types::AgentPlanStep> = db.list_entities(EntityTable::AgentSteps)?;
        steps.retain(|step| step.run_id == run_id);
        steps.sort_by_key(|step| step.created_at);
```

with:

```rust
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
        steps.sort_by_key(|step| step.created_at);
```

- [ ] **Step 5: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/commands/agent.rs
git commit -m "fix(rust): use list_entities_by_run instead of list_entities + retain

agent_get_run/retry_run/abort_run previously loaded ALL agent steps
across ALL runs, then filtered in memory. Now uses SQL-level
json_extract filtering via list_entities_by_run."
```

---

### Task 3: Convert conversation.rs sync commands to async

**Files:**
- Modify: `src-tauri/src/commands/conversation.rs` (13 sync commands + add `_with_db` helpers)

**Interfaces:**
- Consumes: `AppState`, `adl_storage::Database`, existing helpers (`active_workspace_scope_id`, `get_session_detail`)
- Produces: 13 `pub async fn` commands returning `Result<IpcResult<T>, AppError>`, plus new `_with_db` helper variants

- [ ] **Step 1: Verify current tests pass**

Run:
```powershell
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: All tests PASS

- [ ] **Step 2: Add `_with_db` helper variants**

Add these functions near the existing `require_session` and `save_session` helpers in `src-tauri/src/commands/conversation.rs` (after the existing helper definitions, before the command functions):

```rust
fn require_session_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<ConversationSessionRecord, AppError> {
    db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

fn save_session_with_db(
    db: &adl_storage::Database,
    session: &ConversationSessionRecord,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::Sessions,
        &session.id,
        Some(&session.workspace_id),
        Some(&session.id),
        Some(&session.status),
        session,
    )
}

fn set_pinned_with_db(
    db: &adl_storage::Database,
    session_id: &str,
    pinned: bool,
) -> Result<ConversationSessionRecord, AppError> {
    let mut session = require_session_with_db(db, session_id)?;
    if pinned {
        session.is_pinned = true;
        session.pinned_order = adl_types::now_ms();
    } else {
        session.is_pinned = false;
        session.unpinned_order = adl_types::now_ms();
    }
    session.updated_at = adl_types::now_ms();
    save_session_with_db(db, &session)?;
    Ok(session)
}

fn get_session_detail_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<Option<ConversationDetail>, AppError> {
    let Some(session) =
        db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
    else {
        return Ok(None);
    };
    let mut messages: Vec<ConversationMessageRecord> =
        db.list_entities_by_session(EntityTable::ConversationMessages, session_id)?;
    messages.sort_by_key(|message| message.created_at);
    Ok(Some(ConversationDetail { session, messages }))
}
```

- [ ] **Step 3: Convert `conversation_create_session`**

Replace the existing sync `conversation_create_session` function with:

```rust
#[tauri::command]
pub async fn conversation_create_session(
    app: tauri::AppHandle,
    title: Option<String>,
    workspace_id: Option<String>,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let wid = workspace_id.unwrap_or_else(|| active_workspace_scope_id(&state));
    let session = tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
        let existing: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &wid)?;
        let session = adl_conversation::create_session(&wid, title, existing.len() as i32);
        db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&wid),
            Some(&session.id),
            Some(&session.status),
            &session,
        )?;
        Ok(session)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}
```

- [ ] **Step 4: Convert `conversation_list_sessions`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_list_sessions(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let workspace_id = active_workspace_scope_id(&state);
    let sessions = tokio::task::spawn_blocking(move || {
        db.list_entities_by_workspace(EntityTable::Sessions, &workspace_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(sessions)))
}
```

- [ ] **Step 5: Convert `conversation_get_session`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_get_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<Option<ConversationDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || {
        get_session_detail_with_db(&db, &session_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}
```

- [ ] **Step 6: Convert `conversation_rename_session`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_rename_session(
    app: tauri::AppHandle,
    input: RenameSessionInput,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
        let mut session = require_session_with_db(&db, &input.session_id)?;
        session.title = input.title;
        session.title_updated_at = Some(adl_types::now_ms());
        session.updated_at = adl_types::now_ms();
        save_session_with_db(&db, &session)?;
        Ok(session)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}
```

- [ ] **Step 7: Convert `conversation_pin_session` and `conversation_unpin_session`**

Replace both with:

```rust
#[tauri::command]
pub async fn conversation_pin_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || {
        set_pinned_with_db(&db, &session_id, true)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

#[tauri::command]
pub async fn conversation_unpin_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || {
        set_pinned_with_db(&db, &session_id, false)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}
```

- [ ] **Step 8: Convert `conversation_archive_session`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_archive_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
        let mut session = require_session_with_db(&db, &session_id)?;
        session.status = "archived".into();
        session.archived_at = Some(adl_types::now_ms());
        session.updated_at = adl_types::now_ms();
        save_session_with_db(&db, &session)?;
        Ok(session)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}
```

- [ ] **Step 9: Convert `conversation_archive_all_in_workspace`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_archive_all_in_workspace(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let workspace_id = active_workspace_scope_id(&state);
    let sessions = tokio::task::spawn_blocking(move || -> Result<Vec<ConversationSessionRecord>, AppError> {
        let now = adl_types::now_ms();
        let mut sessions: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &workspace_id)?;
        for session in &mut sessions {
            session.status = "archived".into();
            session.archived_at = Some(now);
            session.updated_at = now;
        }
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions))?;
        Ok(sessions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(sessions)))
}
```

- [ ] **Step 10: Convert `conversation_reorder_sessions`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_reorder_sessions(
    app: tauri::AppHandle,
    input: ReorderSessionsInput,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let sessions = tokio::task::spawn_blocking(move || -> Result<Vec<ConversationSessionRecord>, AppError> {
        let now = adl_types::now_ms();
        let mut sessions: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &input.workspace_id)?;
        for session in &mut sessions {
            if let Some(order) = input.pinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = true;
                session.pinned_order = order as i32;
                session.updated_at = now;
            }
            if let Some(order) = input.unpinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = false;
                session.unpinned_order = order as i32;
                session.updated_at = now;
            }
        }
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions))?;
        sessions.sort_by_key(|session| {
            (
                !session.is_pinned,
                if session.is_pinned { session.pinned_order } else { session.unpinned_order },
            )
        });
        Ok(sessions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(sessions)))
}
```

- [ ] **Step 11: Convert `conversation_delete_session`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_delete_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<bool, AppError> {
        db.delete_entities_by_session(EntityTable::ConversationMessages, &session_id)?;
        db.delete_entity(EntityTable::Sessions, &session_id)?;
        Ok(true)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 12: Convert `conversation_mark_session_read`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_mark_session_read(
    app: tauri::AppHandle,
    input: MarkSessionReadInput,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
        let mut session = require_session_with_db(&db, &input.session_id)?;
        session.manual_unread = false;
        session.last_read_at = Some(input.read_at.unwrap_or_else(adl_types::now_ms));
        save_session_with_db(&db, &session)?;
        Ok(session)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}
```

- [ ] **Step 13: Convert `conversation_cancel_message`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_cancel_message(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<adl_types::AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || -> Result<Option<adl_types::AgentRunDetail>, AppError> {
        let Some(run) =
            db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?
        else {
            return Ok(None);
        };
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
        steps.sort_by_key(|step| step.created_at);
        let detail = adl_types::AgentRunDetail { run, steps };
        let detail = adl_agent_runtime::abort_run(detail);
        crate::commands::agent::save_run_detail_with_db(&db, &detail)?;
        Ok(Some(detail))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}
```

- [ ] **Step 14: Convert `conversation_mark_session_unread`**

Replace with:

```rust
#[tauri::command]
pub async fn conversation_mark_session_unread(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
        let mut session = require_session_with_db(&db, &session_id)?;
        session.manual_unread = true;
        save_session_with_db(&db, &session)?;
        Ok(session)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}
```

- [ ] **Step 15: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 16: Commit**

```powershell
git add src-tauri/src/commands/conversation.rs
git commit -m "fix(rust): convert all 13 conversation commands to async + spawn_blocking

Adds _with_db helper variants (require_session_with_db, save_session_with_db,
set_pinned_with_db, get_session_detail_with_db) for use inside spawn_blocking.
Eliminates main-thread SQLite I/O on every conversation operation."
```

---

### Task 4: Convert permission.rs sync commands to async

**Files:**
- Modify: `src-tauri/src/commands/permission.rs` (5 sync commands)

**Interfaces:**
- Consumes: `adl_kernel::command_risk::{load, save, build_ruleset, evaluate_ruleset}`
- Produces: 5 `pub async fn` commands returning `Result<IpcResult<T>, AppError>`

- [ ] **Step 1: Convert all 5 permission commands**

Replace the 5 sync commands in `src-tauri/src/commands/permission.rs` with:

```rust
#[tauri::command]
pub async fn list_permission_rules(
    data_dir: String,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let config = tokio::task::spawn_blocking(move || {
        load(Path::new(&data_dir))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(config.permissions)))
}

#[tauri::command]
pub async fn add_permission_rule(
    data_dir: String,
    rule: PermissionRule,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let permissions = tokio::task::spawn_blocking(move || -> Result<PermissionRulesetConfig, AppError> {
        let mut config = load(Path::new(&data_dir))?;
        config.permissions.custom_rules.push(rule);
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(permissions)))
}

#[tauri::command]
pub async fn delete_permission_rule(
    data_dir: String,
    index: usize,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let permissions = tokio::task::spawn_blocking(move || -> Result<PermissionRulesetConfig, AppError> {
        let mut config = load(Path::new(&data_dir))?;
        if index >= config.permissions.custom_rules.len() {
            return Err(adl_errors::AppError::NotFound(format!(
                "Rule index {} out of bounds",
                index
            )));
        }
        config.permissions.custom_rules.remove(index);
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(permissions)))
}

#[tauri::command]
pub async fn set_permission_include_defaults(
    data_dir: String,
    include: bool,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let permissions = tokio::task::spawn_blocking(move || -> Result<PermissionRulesetConfig, AppError> {
        let mut config = load(Path::new(&data_dir))?;
        config.permissions.include_defaults = include;
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(permissions)))
}

#[tauri::command]
pub async fn evaluate_permission(
    data_dir: String,
    tool_name: String,
    command: String,
    args: Vec<String>,
) -> Result<IpcResult<PermissionDecision>, AppError> {
    let decision = tokio::task::spawn_blocking(move || -> Result<PermissionDecision, AppError> {
        let config = load(Path::new(&data_dir))?;
        let ruleset =
            build_ruleset(&config.permissions.custom_rules, config.permissions.include_defaults);
        Ok(evaluate_ruleset(&ruleset, &tool_name, &command, &args))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(decision)))
}
```

- [ ] **Step 2: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 3: Commit**

```powershell
git add src-tauri/src/commands/permission.rs
git commit -m "fix(rust): convert 5 permission commands to async + spawn_blocking

File load/save I/O moved off main thread. evaluate_permission no longer
blocks on every tool execution."
```

---

### Task 5: Convert task.rs sync commands to async

**Files:**
- Modify: `src-tauri/src/commands/task.rs` (4 sync commands: `task_get_snapshot`, `task_list_pending_approvals`, `task_get_checkpoint_preview`, `task_restore_checkpoint`)

**Interfaces:**
- Consumes: `AppState`, `snapshot()` helper (needs `_with_db` variant), `adl_fs_ops::read_checkpoint_preview`, `adl_fs_ops::restore_checkpoint_payload`
- Produces: 4 `pub async fn` commands

- [ ] **Step 1: Add `snapshot_with_db` helper**

In `src-tauri/src/commands/task.rs`, add a `_with_db` variant of the `snapshot` function near the existing `snapshot` helper:

```rust
fn snapshot_with_db(
    db: &adl_storage::Database,
    current_workspace: Option<WorkspaceMeta>,
) -> Result<TaskCenterSnapshot, AppError> {
    let tasks: Vec<TaskRecord> = db.list_entities(EntityTable::Tasks)?;
    let mut approvals: Vec<ApprovalRecord> = db.list_entities(EntityTable::Approvals)?;
    approvals.retain(|approval| approval.decision.is_none());
    let mut checkpoints: Vec<CheckpointRecord> = db.list_entities(EntityTable::Checkpoints)?;
    checkpoints.sort_by_key(|checkpoint| std::cmp::Reverse(checkpoint.created_at));
    let current_session = if let Some(workspace) = current_workspace {
        let conversation_sessions: Vec<adl_types::ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &workspace.id)?;
        conversation_sessions
            .into_iter()
            .filter(|session| session.status != "archived")
            .max_by_key(|session| session.updated_at)
            .map(|session| {
                let current_task_id = tasks
                    .iter()
                    .filter(|task| task.session_id == session.id)
                    .max_by_key(|task| task.updated_at)
                    .map(|task| task.id.clone());
                adl_types::SessionMeta {
                    id: session.id,
                    workspace_id: session.workspace_id,
                    status: adl_types::SessionStatus::Active,
                    approval_mode: "manual".into(),
                    current_task_id,
                    summary: adl_types::SessionSummary::default(),
                    created_at: session.created_at,
                    updated_at: session.updated_at,
                }
            })
    } else {
        None
    };
    Ok(TaskCenterSnapshot {
        tasks: tasks.iter().map(adl_task::task_summary).collect(),
        pending_approvals: approvals.into_iter().map(|approval| approval.request).collect(),
        policy: adl_task::default_policy(),
        current_session,
        latest_checkpoint: checkpoints.into_iter().next(),
    })
}
```

- [ ] **Step 2: Convert `task_get_snapshot`**

Replace the sync `task_get_snapshot` with:

```rust
#[tauri::command]
pub async fn task_get_snapshot(
    app: tauri::AppHandle,
) -> Result<IpcResult<TaskCenterSnapshot>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let current_workspace = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone();
    let snapshot = tokio::task::spawn_blocking(move || {
        snapshot_with_db(&db, current_workspace)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(snapshot)))
}
```

- [ ] **Step 3: Convert `task_list_pending_approvals`**

Replace with:

```rust
#[tauri::command]
pub async fn task_list_pending_approvals(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<ApprovalRequestSummary>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let approvals = tokio::task::spawn_blocking(move || -> Result<Vec<ApprovalRequestSummary>, AppError> {
        let approvals: Vec<ApprovalRecord> =
            db.list_entities_by_status(EntityTable::Approvals, "pending")?;
        Ok(approvals.into_iter().map(|approval| approval.request).collect())
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(approvals)))
}
```

- [ ] **Step 4: Convert `task_get_checkpoint_preview`**

Replace with:

```rust
#[tauri::command]
pub async fn task_get_checkpoint_preview(
    app: tauri::AppHandle,
    checkpoint_id: String,
) -> Result<IpcResult<Option<CheckpointPayloadPreview>>, AppError> {
    let state = app.state::<AppState>();
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let preview = tokio::task::spawn_blocking(move || {
        adl_fs_ops::read_checkpoint_preview(&checkpoints_dir, &checkpoint_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(preview)))
}
```

- [ ] **Step 5: Convert `task_restore_checkpoint`**

Replace with:

```rust
#[tauri::command]
pub async fn task_restore_checkpoint(
    app: tauri::AppHandle,
    checkpoint_id: String,
) -> Result<IpcResult<TaskCenterSnapshot>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let checkpoints_dir = state.data_dir.join("state").join("checkpoints");
    let current_workspace = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?
        .clone();
    let snapshot = tokio::task::spawn_blocking(move || -> Result<TaskCenterSnapshot, AppError> {
        let _ = adl_fs_ops::restore_checkpoint_payload(&checkpoints_dir, &checkpoint_id)?;
        if let Some(checkpoint) =
            db.load_entity::<CheckpointRecord>(EntityTable::Checkpoints, &checkpoint_id)?
        {
            let _ = crate::commands::audit::save_audit_entry_with_db(
                &db,
                &checkpoint.workspace_id,
                Some(&checkpoint.session_id),
                "patch-rollback",
                adl_types::RiskLevel::Medium,
                format!("Restored checkpoint {}.", checkpoint.id),
                Some("approved"),
                Some(&checkpoint.description),
            );
        }
        snapshot_with_db(&db, current_workspace)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(snapshot)))
}
```

**Note:** This requires `save_audit_entry_with_db` — see Step 6.

- [ ] **Step 6: Add `save_audit_entry_with_db` to audit.rs**

In `src-tauri/src/commands/audit.rs`, add a `_with_db` variant of `save_audit_entry`:

```rust
pub fn save_audit_entry_with_db(
    db: &adl_storage::Database,
    workspace_id: &str,
    session_id: Option<&str>,
    operation_type: &str,
    risk_level: RiskLevel,
    summary: impl Into<String>,
    decision: Option<&str>,
    detail: Option<&str>,
) -> Result<AuditEntry, AppError> {
    let entry = AuditEntry {
        id: create_id("audit"),
        timestamp: now_ms(),
        operation_type: operation_type.to_string(),
        summary: summary.into(),
        risk_level,
        decision: decision.map(str::to_string),
        detail: detail.map(str::to_string),
    };
    db.save_entity(
        EntityTable::AuditRecords,
        &entry.id,
        Some(workspace_id),
        session_id,
        Some(operation_type),
        &entry,
    )?;
    Ok(entry)
}
```

- [ ] **Step 7: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 8: Commit**

```powershell
git add src-tauri/src/commands/task.rs src-tauri/src/commands/audit.rs
git commit -m "fix(rust): convert 4 task commands to async + spawn_blocking

task_restore_checkpoint no longer freezes window during checkpoint
restoration. Adds snapshot_with_db and save_audit_entry_with_db
helpers for spawn_blocking use."
```

---

### Task 6: Convert patch.rs sync commands to async

**Files:**
- Modify: `src-tauri/src/commands/patch.rs` (3 sync commands)

**Interfaces:**
- Consumes: `AppState`, `require_patch_set`, `save_patch_set`, `adl_change_engine::rollback_patch_set`, `emit_patch_rollback_activity`
- Produces: 3 `pub async fn` commands

- [ ] **Step 1: Add `require_patch_set_with_db` and `save_patch_set_with_db` helpers**

In `src-tauri/src/commands/patch.rs`, add:

```rust
fn require_patch_set_with_db(
    db: &adl_storage::Database,
    patch_set_id: &str,
) -> Result<PatchSet, AppError> {
    db.load_entity::<PatchSet>(EntityTable::PatchSets, patch_set_id)?
        .ok_or_else(|| AppError::NotFound(format!("patch_set {patch_set_id}")))
}

fn save_patch_set_with_db(
    db: &adl_storage::Database,
    patch_set: &PatchSet,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::PatchSets,
        &patch_set.id,
        Some(&patch_set.workspace_id),
        patch_set.session_id.as_deref(),
        Some(&patch_set.status),
        patch_set,
    )
}
```

- [ ] **Step 2: Convert `patch_get_patch_set`**

Replace with:

```rust
#[tauri::command]
pub async fn patch_get_patch_set(
    app: tauri::AppHandle,
    patch_set_id: String,
) -> Result<IpcResult<Option<PatchSet>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let patch_set = tokio::task::spawn_blocking(move || {
        db.load_entity::<PatchSet>(EntityTable::PatchSets, &patch_set_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(patch_set)))
}
```

- [ ] **Step 3: Convert `patch_set_hunk_decision`**

Replace with:

```rust
#[tauri::command]
pub async fn patch_set_hunk_decision(
    app: tauri::AppHandle,
    input: HunkDecisionInput,
) -> Result<IpcResult<PatchSet>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let patch_set = tokio::task::spawn_blocking(move || -> Result<PatchSet, AppError> {
        let patch_set = require_patch_set_with_db(&db, &input.patch_set_id)?;
        let patch_set =
            adl_change_engine::set_hunk_decision(patch_set, &input.hunk_id, input.decision)?;
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(patch_set)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(patch_set)))
}
```

- [ ] **Step 4: Convert `patch_rollback_patch_set`**

Replace with:

```rust
#[tauri::command]
pub async fn patch_rollback_patch_set(
    app: tauri::AppHandle,
    patch_set_id: String,
) -> Result<IpcResult<PatchSet>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let workspace = crate::commands::workspace::current_workspace(&state)?;
    let root_path = workspace.root_path.clone();
    let workspace_id = workspace.id.clone();

    let patch_set = tokio::task::spawn_blocking(move || -> Result<PatchSet, AppError> {
        let patch_set = require_patch_set_with_db(&db, &patch_set_id)?;
        let patch_set = adl_change_engine::rollback_patch_set(
            patch_set,
            std::path::Path::new(&root_path),
        )?;
        let _ = crate::commands::audit::save_audit_entry_with_db(
            &db,
            &workspace_id,
            Some(&patch_set.session_id),
            "patch-rollback",
            adl_types::RiskLevel::Medium,
            format!("Rolled back {} on user request.", patch_set.title),
            Some("approved"),
            None,
        );
        if let Some(run_id) = &patch_set.run_id {
            let Some(mut run) = db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
            else { return Ok(patch_set); };
            let mut steps: Vec<adl_types::AgentPlanStep> =
                db.list_entities_by_run(EntityTable::AgentSteps, run_id)?;
            steps.sort_by_key(|step| step.created_at);
            let mut detail = adl_types::AgentRunDetail { run: run.clone(), steps };
            detail.run.status = adl_types::AgentRunStatus::RolledBack;
            detail.run.updated_at = adl_types::now_ms();
            crate::commands::agent::save_run_detail_with_db(&db, &detail)?;
        }
        save_patch_set_with_db(&db, &patch_set)?;
        Ok(patch_set)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    let _ = app.emit("digital-life://patch-rolled-back", &patch_set);
    Ok(ipc(Ok(patch_set)))
}
```

- [ ] **Step 5: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/commands/patch.rs
git commit -m "fix(rust): convert 3 patch commands to async + spawn_blocking

patch_rollback_patch_set no longer freezes window during filesystem
rollback + DB save + audit + run-detail load/save."
```

---

### Task 7: Convert workspace_sidebar.rs sync commands to async

**Files:**
- Modify: `src-tauri/src/commands/workspace_sidebar.rs` (8 sync commands)

**Interfaces:**
- Consumes: `AppState`, `load_or_seed_sidebar`, `save_sidebar_entries`, `presentable_recent_list`, `purge_workspace`
- Produces: 8 `pub async fn` commands

- [ ] **Step 1: Add `_with_db` variants for sidebar helpers**

In `src-tauri/src/commands/workspace_sidebar.rs`, add:

```rust
fn load_or_seed_sidebar_with_db(
    db: &adl_storage::Database,
) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let existing = db.get_state::<Vec<RecentWorkspaceEntry>>("recent_workspaces")?;
    if let Some(entries) = existing {
        return Ok(entries);
    }
    let workspaces: Vec<WorkspaceMeta> = db.list_entities(EntityTable::Workspaces)?;
    let entries: Vec<RecentWorkspaceEntry> = workspaces
        .iter()
        .map(|w| entry_from_workspace(w.clone(), 0))
        .collect();
    db.put_state("recent_workspaces", &entries)?;
    Ok(entries)
}

fn save_sidebar_entries_with_db(
    db: &adl_storage::Database,
    entries: &[RecentWorkspaceEntry],
) -> Result<(), AppError> {
    db.put_state("recent_workspaces", entries)
}

fn presentable_recent_list_with_db(
    db: &adl_storage::Database,
) -> Result<Vec<RecentWorkspaceEntry>, AppError> {
    let mut all = load_or_seed_sidebar_with_db(db)?;
    let workspaces: Vec<WorkspaceMeta> = db.list_entities(EntityTable::Workspaces)?;
    for entry in &mut all {
        if let Some(ws) = workspaces.iter().find(|w| w.id == entry.id) {
            entry.name = ws.name.clone();
            entry.root_path = ws.root_path.clone();
        }
    }
    Ok(all)
}
```

**Note:** These `_with_db` variants assume `get_state`/`put_state`/`list_entities` are methods on `Database`. Verify the actual method signatures match — if `get_state`/`put_state` require `&self` on `Database`, this works. If they require `&AppState`, inline the logic instead.

- [ ] **Step 2: Convert `workspace_list_recent`**

Replace with:

```rust
#[tauri::command]
pub async fn workspace_list_recent(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || {
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}
```

- [ ] **Step 3: Convert `workspace_pin`**

Replace with:

```rust
#[tauri::command]
pub async fn workspace_pin(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
        let mut all = load_or_seed_sidebar_with_db(&db)?;
        let Some(idx) = all.iter().position(|e| e.id == workspace_id) else {
            return Err(AppError::NotFound(format!("workspace {workspace_id}")));
        };
        let max_p = all
            .iter()
            .filter(|e| e.is_pinned && e.id != workspace_id)
            .map(|e| e.pinned_order)
            .max()
            .unwrap_or(-1);
        let entry = &mut all[idx];
        entry.is_pinned = true;
        entry.pinned_order = max_p + 1;
        save_sidebar_entries_with_db(&db, &all)?;
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}
```

- [ ] **Step 4: Convert `workspace_unpin`**

Replace with:

```rust
#[tauri::command]
pub async fn workspace_unpin(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
        let mut all = load_or_seed_sidebar_with_db(&db)?;
        let Some(idx) = all.iter().position(|e| e.id == workspace_id) else {
            return Err(AppError::NotFound(format!("workspace {workspace_id}")));
        };
        let max_u = all
            .iter()
            .filter(|e| !e.is_pinned && e.id != workspace_id)
            .map(|e| e.unpinned_order)
            .max()
            .unwrap_or(-1);
        let entry = &mut all[idx];
        entry.is_pinned = false;
        entry.unpinned_order = max_u + 1;
        save_sidebar_entries_with_db(&db, &all)?;
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}
```

- [ ] **Step 5: Convert `workspace_reorder`**

Replace with:

```rust
#[tauri::command]
pub async fn workspace_reorder(
    app: tauri::AppHandle,
    input: ReorderWorkspacesInput,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
        let mut all = load_or_seed_sidebar_with_db(&db)?;
        for (i, id) in input.pinned_ids.iter().enumerate() {
            if let Some(e) = all.iter_mut().find(|e| e.id == *id) {
                e.is_pinned = true;
                e.pinned_order = i as i32;
            }
        }
        for (i, id) in input.unpinned_ids.iter().enumerate() {
            if let Some(e) = all.iter_mut().find(|e| e.id == *id) {
                e.is_pinned = false;
                e.unpinned_order = i as i32;
            }
        }
        save_sidebar_entries_with_db(&db, &all)?;
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}
```

- [ ] **Step 6: Convert `workspace_remove_from_sidebar`**

Replace with:

```rust
#[tauri::command]
pub async fn workspace_remove_from_sidebar(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
        let root_path = db
            .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
            .map(|m| m.root_path);
        let report = db.purge_workspace(&workspace_id, root_path.as_deref())?;
        tracing::info!(
            workspace_id = %report.workspace_id,
            total_rows_deleted = report.total_rows_deleted,
            tables_touched = report.per_table.len(),
            "workspace data purged on remove-from-sidebar"
        );
        let mut all = load_or_seed_sidebar_with_db(&db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = true;
            e.hidden_from_right_panels = true;
        }
        save_sidebar_entries_with_db(&db, &all)?;
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}
```

- [ ] **Step 7: Convert `workspace_restore_to_sidebar`**

Replace with:

```rust
#[tauri::command]
pub async fn workspace_restore_to_sidebar(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
        let mut all = load_or_seed_sidebar_with_db(&db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.removed_from_sidebar = false;
        } else {
            let meta = db
                .load_entity::<WorkspaceMeta>(EntityTable::Workspaces, &workspace_id)?
                .ok_or_else(|| AppError::NotFound(format!("workspace {workspace_id}")))?;
            let max = unpinned_max(&all);
            all.push(entry_from_workspace(meta, max));
        }
        save_sidebar_entries_with_db(&db, &all)?;
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}
```

- [ ] **Step 8: Convert `workspace_hide_from_right_panels` and `workspace_show_in_right_panels`**

Replace both with:

```rust
#[tauri::command]
pub async fn workspace_hide_from_right_panels(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
        let mut all = load_or_seed_sidebar_with_db(&db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.hidden_from_right_panels = true;
        }
        save_sidebar_entries_with_db(&db, &all)?;
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}

#[tauri::command]
pub async fn workspace_show_in_right_panels(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<IpcResult<Vec<RecentWorkspaceEntry>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<RecentWorkspaceEntry>, AppError> {
        let mut all = load_or_seed_sidebar_with_db(&db)?;
        if let Some(e) = all.iter_mut().find(|e| e.id == workspace_id) {
            e.hidden_from_right_panels = false;
        }
        save_sidebar_entries_with_db(&db, &all)?;
        presentable_recent_list_with_db(&db)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(entries)))
}
```

- [ ] **Step 9: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 10: Commit**

```powershell
git add src-tauri/src/commands/workspace_sidebar.rs
git commit -m "fix(rust): convert 8 workspace_sidebar commands to async + spawn_blocking

workspace_remove_from_sidebar no longer freezes window during
cascade-delete transaction."
```

---

### Task 8: Convert provider.rs and app.rs sync commands to async

**Files:**
- Modify: `src-tauri/src/commands/provider.rs` (3 sync commands)
- Modify: `src-tauri/src/commands/app.rs` (3 sync commands)

**Interfaces:**
- Consumes: `adl_model_gateway::{set_provider_secret, clear_provider_secret, get_provider_secret}`, `AppState`, `LogManager`
- Produces: 6 `pub async fn` commands

- [ ] **Step 1: Convert provider.rs commands**

Replace the 3 sync provider commands in `src-tauri/src/commands/provider.rs` with:

```rust
#[tauri::command]
pub async fn set_provider_api_key(
    provider_id: String,
    api_key: String,
) -> Result<IpcResult<bool>, AppError> {
    let result = tokio::task::spawn_blocking(move || {
        adl_model_gateway::set_provider_secret(&provider_id, &api_key)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result.is_ok())))
}

#[tauri::command]
pub async fn clear_provider_api_key(
    provider_id: String,
) -> Result<IpcResult<bool>, AppError> {
    let result = tokio::task::spawn_blocking(move || {
        adl_model_gateway::clear_provider_secret(&provider_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result.is_ok())))
}

#[tauri::command]
pub async fn has_provider_api_key(
    provider_id: String,
) -> Result<IpcResult<bool>, AppError> {
    let result = tokio::task::spawn_blocking(move || {
        adl_model_gateway::get_provider_secret(&provider_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?;
    Ok(ipc(Ok(result.is_ok())))
}
```

- [ ] **Step 2: Convert `app_update_preferences`**

Replace the sync `app_update_preferences` in `src-tauri/src/commands/app.rs` with:

```rust
#[tauri::command]
pub async fn app_update_preferences(
    app: tauri::AppHandle,
    patch: AppPreferencePatch,
) -> Result<IpcResult<AppInfo>, AppError> {
    let state = app.state::<AppState>();
    {
        let mut config = state
            .config
            .write()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        if let Some(language) = patch.language {
            config.language = language;
        }
        if let Some(mode) = patch.theme_mode {
            config.theme_mode = mode;
        }
        if let Some(level) = patch.log_level {
            config.log_level = level;
        }
        if let Some(mode) = patch.terminal_log_mode {
            config.terminal_log_mode = mode;
            let _ = state.log_manager.set_mode(adl_logging::LogTarget::Terminal, mode);
        }
        if let Some(mode) = patch.debug_log_mode {
            config.debug_log_mode = mode;
            let _ = state.log_manager.set_mode(adl_logging::LogTarget::Debug, mode);
        }
        if let Some(model_preferences) = patch.model_preferences {
            for (provider, patch) in model_preferences {
                let provider_id = provider.clone();
                let entry =
                    config.model_preferences.providers.entry(provider).or_insert_with(|| {
                        adl_types::ModelProviderPreference {
                            enabled: true,
                            priority: 10,
                            model_id: provider_id.clone(),
                        }
                    });
                if let Some(enabled) = patch.enabled {
                    entry.enabled = enabled;
                }
                if let Some(priority) = patch.priority {
                    entry.priority = priority;
                }
                if let Some(model_id) = patch.model_id {
                    entry.model_id = model_id;
                }
            }
        }
        if let Some(keybinds) = patch.keybinds {
            config.keybinds = keybinds;
        }
        if let Some(fonts) = patch.fonts {
            if let Some(ui) = fonts.ui_font {
                config.fonts.ui_font = Some(ui);
            }
            if let Some(code) = fonts.code_font {
                config.fonts.code_font = Some(code);
            }
            if let Some(term) = fonts.terminal_font {
                config.fonts.terminal_font = Some(term);
            }
        }
    }
    let state_clone = app.state::<AppState>();
    let config_clone = state_clone.config.read().unwrap().clone();
    tokio::task::spawn_blocking(move || {
        crate::setup::save_config_to_dir(&config_clone)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    .map_err(|e| AppError::Config(e.to_string()))?;
    state.event_bus.emit(adl_kernel::events::AppEvent::ConfigChanged);
    let info = build_app_info(&state)?;
    Ok(ipc(Ok(info)))
}
```

**Note:** This assumes `save_config` can be split into `save_config_to_dir` that takes a config value. If `save_config` requires `&AppState`, wrap the entire save call in spawn_blocking with a cloned config. Verify the actual `save_config` signature and adapt accordingly. The key point: file I/O must not happen on the main thread.

- [ ] **Step 3: Convert `write_debug_logs` and `app_set_log_mode`**

Replace with:

```rust
#[tauri::command]
pub async fn write_debug_logs(
    app: tauri::AppHandle,
    content: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let log_manager = state.log_manager.clone();
    tokio::task::spawn_blocking(move || {
        log_manager.write_debug_logs(&content)
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn app_set_log_mode(
    app: tauri::AppHandle,
    target: String,
    mode: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let log_target: adl_logging::LogTarget = match target.as_str() {
        "terminal" => adl_logging::LogTarget::Terminal,
        "debug" => adl_logging::LogTarget::Debug,
        other => return Err(format!("Invalid log target: {other}")),
    };
    let log_mode: adl_logging::LogMode =
        mode.parse().map_err(|e: String| format!("Invalid log mode: {e}"))?;
    state
        .log_manager
        .set_mode(log_target, log_mode)
        .map_err(|e| e.to_string())?;
    {
        let mut config = state.config.write().map_err(|_| "config lock poisoned".to_string())?;
        match log_target {
            adl_logging::LogTarget::Terminal => config.terminal_log_mode = log_mode,
            adl_logging::LogTarget::Debug => config.debug_log_mode = log_mode,
        }
    }
    let state_clone = app.state::<AppState>();
    let config_clone = state_clone.config.read().unwrap().clone();
    tokio::task::spawn_blocking(move || crate::setup::save_config_to_dir(&config_clone))
        .await
        .map_err(|e| format!("spawn_blocking failed: {e}"))?
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

**Note:** `LogManager` must be `Clone` for this pattern. If it's not, wrap it in `Arc` or pass the necessary path + content into spawn_blocking. Verify `LogManager`'s Clone derivation.

- [ ] **Step 4: Run cargo check + clippy + test**

Run:
```powershell
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo clippy --workspace -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace -p src-tauri 2>&1 | Select-String "test result"
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/commands/provider.rs src-tauri/src/commands/app.rs
git commit -m "fix(rust): convert provider + app commands to async + spawn_blocking

OS keyring access and config file writes moved off main thread."
```

---

### Task 9: Fix storageHelpers.ts empty catch blocks

**Files:**
- Modify: `frontend/src/app/stores/storageHelpers.ts`

**Interfaces:**
- Consumes: None (leaf utility module)
- Produces: `readJson`, `writeJson`, `readNumber`, `writeNumber`, `readFlag`, `writeFlag` with `console.warn` logging in catch blocks

- [ ] **Step 1: Write failing test**

Create `frontend/src/app/stores/storageHelpers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, writeJson, readNumber, writeNumber, readFlag, writeFlag } from './storageHelpers';

describe('storageHelpers error logging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('writeJson logs console.warn on QuotaExceededError', () => {
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw error;
    });
    writeJson('test-key', { data: 'value' });
    expect(warnSpy).toHaveBeenCalledWith('storageHelpers.writeJson failed:', error);
  });

  it('writeJson logs console.warn on other errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeJson('test-key', { data: 'value' });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('readJson logs console.warn on parse error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{invalid json');
    readJson('test-key', { fallback: true });
    expect(warnSpy).toHaveBeenCalledWith('storageHelpers.readJson failed:', expect.any(SyntaxError));
  });

  it('writeNumber logs console.warn on error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeNumber('test-key', 42);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('writeFlag logs console.warn on error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Write failed');
    });
    writeFlag('test-key', true);
    expect(warnSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm exec vitest run src/app/stores/storageHelpers.test.ts 2>&1 | Select-String "FAIL|PASS|×|✓"
```
Expected: FAIL — `console.warn` not called

- [ ] **Step 3: Fix `readJson`**

In `frontend/src/app/stores/storageHelpers.ts`, replace the `readJson` function:

```typescript
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch (err) {
    console.warn('storageHelpers.readJson failed:', err);
  }
  return fallback;
}
```

- [ ] **Step 4: Fix `writeJson`**

Replace the `writeJson` function:

```typescript
export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('storageHelpers.writeJson failed:', err);
  }
}
```

- [ ] **Step 5: Fix `readNumber`**

Replace the `readNumber` function:

```typescript
export function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = Number(window.localStorage.getItem(key));
    if (Number.isFinite(raw)) {
      return clamp(raw, min, max);
    }
  } catch (err) {
    console.warn('storageHelpers.readNumber failed:', err);
  }
  return fallback;
}
```

- [ ] **Step 6: Fix `writeNumber`**

Replace the `writeNumber` function:

```typescript
export function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (err) {
    console.warn('storageHelpers.writeNumber failed:', err);
  }
}
```

- [ ] **Step 7: Fix `readFlag`**

Replace the `readFlag` function:

```typescript
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') {
      return true;
    }
    if (raw === '0') {
      return false;
    }
  } catch (err) {
    console.warn('storageHelpers.readFlag failed:', err);
  }
  return fallback;
}
```

- [ ] **Step 8: Fix `writeFlag`**

Replace the `writeFlag` function:

```typescript
export function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch (err) {
    console.warn('storageHelpers.writeFlag failed:', err);
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run:
```powershell
pnpm exec vitest run src/app/stores/storageHelpers.test.ts 2>&1 | Select-String "FAIL|PASS|×|✓"
```
Expected: PASS — all tests pass

- [ ] **Step 10: Run full typecheck + lint + test**

Run:
```powershell
pnpm run typecheck 2>&1 | Select-String "error" | Select-Object -Last 3
pnpm run lint 2>&1 | Select-String "error|warning" | Select-Object -Last 3
pnpm run test 2>&1 | Select-String "Test Files|Tests" | Select-Object -Last 3
```
Expected: 0 type errors, 0 lint errors, all tests pass

- [ ] **Step 11: Commit**

```powershell
git add frontend/src/app/stores/storageHelpers.ts frontend/src/app/stores/storageHelpers.test.ts
git commit -m "fix(stores): add console.warn to storageHelpers catch blocks

All read/write helpers now log errors per error-handling.md rule.
Previously QuotaExceededError and parse errors were silently swallowed."
```

---

### Task 10: Fix store slices' empty catch blocks

**Files:**
- Modify: `frontend/src/app/stores/slices/ciSlice.ts` (7 blocks)
- Modify: `frontend/src/app/stores/slices/githubSlice.ts` (6 blocks)
- Modify: `frontend/src/app/stores/slices/githubSliceHelpers.ts` (5 blocks)
- Modify: `frontend/src/app/stores/slices/githubRepoSlice.ts` (5 blocks)
- Modify: `frontend/src/app/stores/slices/uiSlice.ts` (4 blocks)
- Modify: `frontend/src/app/stores/slices/communicateSlice.ts` (3 blocks)
- Modify: `frontend/src/app/stores/slices/workspaceSlice.ts` (2 blocks + remove local readJson/writeJson duplicates)
- Modify: `frontend/src/app/stores/slices/uiSliceWidths.ts` (2 blocks)
- Modify: `frontend/src/app/stores/slices/terminalSlice.ts` (2 blocks)
- Modify: `frontend/src/app/regions/left-sidebar/ResizeHandle.utils.ts` (2 blocks)

**Interfaces:**
- Consumes: `storageHelpers.ts` (fixed in Task 9)
- Produces: All catch blocks in store slices log `console.warn` with context

- [ ] **Step 1: Fix ciSlice.ts**

In `frontend/src/app/stores/slices/ciSlice.ts`, replace every occurrence of:

```typescript
  } catch {
    /* ignore */
  }
```

with:

```typescript
  } catch (err) {
    console.warn('ciSlice: localStorage/bridge operation failed:', err);
  }
```

There are 7 occurrences (lines ~82, ~95, ~107, ~174, ~188, ~201, ~211, ~222). Use `replace_all` if the comment text is identical, otherwise replace each individually.

- [ ] **Step 2: Fix githubSlice.ts**

In `frontend/src/app/stores/slices/githubSlice.ts`, replace every:

```typescript
        } catch {
          /* ignore */
        }
```

with:

```typescript
        } catch (err) {
          console.warn('githubSlice: localStorage/bridge operation failed:', err);
        }
```

There are 6 occurrences (lines ~128, ~151, ~164, ~176, ~185, ~197).

- [ ] **Step 3: Fix githubSliceHelpers.ts**

In `frontend/src/app/stores/slices/githubSliceHelpers.ts`, replace every:

```typescript
    } catch {
      /* ignore */
    }
```

with:

```typescript
    } catch (err) {
      console.warn('githubSliceHelpers: localStorage/bridge operation failed:', err);
    }
```

There are 5 occurrences (lines ~72, ~89, ~99, ~110, ~138).

- [ ] **Step 4: Fix githubRepoSlice.ts**

In `frontend/src/app/stores/slices/githubRepoSlice.ts`, replace every:

```typescript
        } catch {
          /* ignore */
        }
```

with:

```typescript
        } catch (err) {
          console.warn('githubRepoSlice: localStorage operation failed:', err);
        }
```

There are 5 occurrences (lines ~93, ~296, ~322, ~337, ~357).

- [ ] **Step 5: Fix uiSlice.ts**

In `frontend/src/app/stores/slices/uiSlice.ts`, replace every:

```typescript
  } catch {
    /* ignore */
  }
```

with:

```typescript
  } catch (err) {
    console.warn('uiSlice: localStorage operation failed:', err);
  }
```

There are 4 occurrences (lines ~147, ~155, ~167, ~175).

- [ ] **Step 6: Fix communicateSlice.ts**

In `frontend/src/app/stores/slices/communicateSlice.ts`, replace every:

```typescript
        } catch {
          /* ignore */
        }
```

with:

```typescript
        } catch (err) {
          console.warn('communicateSlice: localStorage operation failed:', err);
        }
```

There are 3 occurrences (lines ~36, ~78, ~89).

- [ ] **Step 7: Fix workspaceSlice.ts**

In `frontend/src/app/stores/slices/workspaceSlice.ts`, remove the local `readJson`/`writeJson` duplicate functions (lines 19-37) and import from `../shared` instead. If other code in the file depends on the local versions, update the imports. For any remaining catch blocks, add `console.warn`.

Add at the top of the file (after existing imports):
```typescript
import { readJson, writeJson } from '../shared';
```

Remove the local `readJson` and `writeJson` function definitions (lines 19-37).

- [ ] **Step 8: Fix uiSliceWidths.ts**

In `frontend/src/app/stores/slices/uiSliceWidths.ts`, replace every:

```typescript
  } catch {
    /* ignore */
  }
```

with:

```typescript
  } catch (err) {
    console.warn('uiSliceWidths: localStorage operation failed:', err);
  }
```

There are 2 occurrences (lines ~49, ~58).

- [ ] **Step 9: Fix terminalSlice.ts**

In `frontend/src/app/stores/slices/terminalSlice.ts`, replace every:

```typescript
      } catch {
        /* ignore */
      }
```

with:

```typescript
      } catch (err) {
        console.warn('terminalSlice: localStorage operation failed:', err);
      }
```

There are 2 occurrences (lines ~316, ~331).

- [ ] **Step 10: Fix ResizeHandle.utils.ts**

In `frontend/src/app/regions/left-sidebar/ResizeHandle.utils.ts`, replace every:

```typescript
  } catch {
    /* ignore */
  }
```

with:

```typescript
  } catch (err) {
    console.warn('ResizeHandle: localStorage operation failed:', err);
  }
```

There are 2 occurrences (lines ~13, ~22).

- [ ] **Step 11: Verify no remaining `/* ignore */` catch blocks**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
Select-String -Path "src\app\stores\slices\*.ts","src\app\regions\left-sidebar\ResizeHandle.utils.ts" -Pattern "catch \{(/\* ignore \*/)?\}" | Measure-Object | Select-Object Count
```
Expected: Count = 0

- [ ] **Step 12: Run typecheck + lint + test**

Run:
```powershell
pnpm run typecheck 2>&1 | Select-String "error" | Select-Object -Last 3
pnpm run lint 2>&1 | Select-String "error|warning" | Select-Object -Last 3
pnpm run test 2>&1 | Select-String "Test Files|Tests" | Select-Object -Last 3
```
Expected: 0 type errors, 0 lint errors, all tests pass

- [ ] **Step 13: Commit**

```powershell
git add frontend/src/app/stores/slices/ frontend/src/app/regions/left-sidebar/ResizeHandle.utils.ts
git commit -m "fix(stores): add console.warn to all empty catch blocks in store slices

Eliminates 44 silent error-swallowing catch blocks across 10 files.
Per error-handling.md rule, all catch blocks must log at minimum
console.warn. Also removes local readJson/writeJson duplicates in
workspaceSlice.ts in favor of shared storageHelpers."
```

---

### Task 11: Fix fetchPageMeta.ts and preview-storage.ts empty catch blocks

**Files:**
- Modify: `frontend/src/app/utils/fetchPageMeta.ts` (8 empty catch blocks)
- Modify: `frontend/src/preview-bridge/preview-storage.ts` (6 empty catch blocks)

**Interfaces:**
- Consumes: None
- Produces: All catch blocks log `console.warn` with context

- [ ] **Step 1: Fix fetchPageMeta.ts**

In `frontend/src/app/utils/fetchPageMeta.ts`, replace each empty catch block. For localStorage operations, add `console.warn`. For listener error isolation (lines ~109, ~118), keep the catch but add a debug-level log.

Replace the localStorage catch blocks (lines ~33, ~51) — find:

```typescript
    } catch {
      // localStorage quota exceeded or unavailable — silently skip
    }
```

replace with:

```typescript
    } catch (err) {
      console.warn('fetchPageMeta: localStorage persist failed:', err);
    }
```

Replace the corrupted-data catch (line ~69):

```typescript
  } catch {
    // Corrupted data or unavailable — start fresh
  }
```

with:

```typescript
  } catch (err) {
    console.warn('fetchPageMeta: localStorage load failed, starting fresh:', err);
  }
```

Replace the URL parse catch (line ~69 in `normalizeUrlForCache`):

```typescript
  } catch {
```

with:

```typescript
  } catch (err) {
    console.warn('fetchPageMeta: URL normalization failed:', err);
```

For listener error catches (lines ~109, ~118), replace:

```typescript
      } catch {
        /* ignore listener errors */
      }
```

with:

```typescript
      } catch (err) {
        console.warn('fetchPageMeta: favicon listener threw:', err);
      }
```

For network fetch catches (lines ~186, ~217, ~231), replace:

```typescript
  } catch {
    return null;
  }
```

with:

```typescript
  } catch (err) {
    console.warn('fetchPageMeta: fetch failed:', err);
    return null;
  }
```

- [ ] **Step 2: Fix preview-storage.ts**

In `frontend/src/preview-bridge/preview-storage.ts`, replace each empty catch block. For the `loadRecentWorkspaces` catch (line ~20):

```typescript
  } catch {
    return [];
  }
```

with:

```typescript
  } catch (err) {
    console.warn('preview-storage: loadRecentWorkspaces failed:', err);
    return [];
  }
```

For `persistRecentWorkspaces` (line ~28):

```typescript
  } catch {
    // ignore persistence errors in preview mode
  }
```

with:

```typescript
  } catch (err) {
    console.warn('preview-storage: persistRecentWorkspaces failed:', err);
  }
```

For `loadPreviewPreferences` (line ~58):

```typescript
  } catch {
    return {};
  }
```

with:

```typescript
  } catch (err) {
    console.warn('preview-storage: loadPreviewPreferences failed:', err);
    return {};
  }
```

For `persistPreviewPreferences` (line ~74):

```typescript
  } catch {
    // ignore persistence errors in preview mode
  }
```

with:

```typescript
  } catch (err) {
    console.warn('preview-storage: persistPreviewPreferences failed:', err);
  }
```

For `loadActiveWorkspacePath` (line ~82):

```typescript
  } catch {
    return undefined;
  }
```

with:

```typescript
  } catch (err) {
    console.warn('preview-storage: loadActiveWorkspacePath failed:', err);
    return undefined;
  }
```

For `persistActiveWorkspacePath` (line ~94):

```typescript
  } catch {
    // ignore persistence errors in preview mode
  }
```

with:

```typescript
  } catch (err) {
    console.warn('preview-storage: persistActiveWorkspacePath failed:', err);
  }
```

- [ ] **Step 3: Run typecheck + lint + test**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck 2>&1 | Select-String "error" | Select-Object -Last 3
pnpm run lint 2>&1 | Select-String "error|warning" | Select-Object -Last 3
pnpm run test 2>&1 | Select-String "Test Files|Tests" | Select-Object -Last 3
```
Expected: 0 type errors, 0 lint errors, all tests pass

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/app/utils/fetchPageMeta.ts frontend/src/preview-bridge/preview-storage.ts
git commit -m "fix(frontend): add console.warn to empty catch blocks in fetchPageMeta + preview-storage

Eliminates 14 silent error-swallowing catch blocks."
```

---

### Task 12: Replace `set({ error })` with `captureError(get, error)`

**Files:**
- Modify: `frontend/src/app/stores/actions/sessionActions.ts` (7 locations)
- Modify: `frontend/src/app/stores/actions/editorActions.ts` (2 locations)
- Modify: `frontend/src/app/stores/actions/editorActionsHelpers.ts` (1 location)
- Modify: `frontend/src/app/stores/actions/gitActions.ts` (1 location)
- Modify: `frontend/src/app/stores/actions/searchActions.ts` (1 location)

**Interfaces:**
- Consumes: `captureError(get, error)` from `cacheHelpers.ts`, `clearError(get)` from `cacheHelpers.ts`
- Produces: All mutation actions use the typed error capture pipeline

- [ ] **Step 1: Fix sessionActions.ts**

In `frontend/src/app/stores/actions/sessionActions.ts`, add import at the top:

```typescript
import { clearError, captureError } from '../cacheHelpers';
```

Then in each of the 7 locations, replace:

```typescript
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
```

with:

```typescript
    if (!result.ok) {
      captureError(get, result.error);
      return;
    }
```

Also add `clearError(get);` at the start of each mutation action (after any `set(...)` calls that reset state). The 7 locations are in: `sessionMutate` (L17), `createSession` (L45), `selectSession` (L102), `renameSession` (L135), `archiveAllSessions` (L229), `reorderSessions` (L259), `markAllSessionsRead` (L281).

For `sessionMutate` (the helper function), add `clearError(get)` before the `await`:

```typescript
async function sessionMutate<T>(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  sessionId: string,
  ipcCall: (sessionId: string) => Promise<IpcResult<T>>
) {
  clearError(get);
  const result = await ipcCall(sessionId);
  if (!result.ok) {
    captureError(get, result.error);
    return;
  }
  // ... rest unchanged
}
```

- [ ] **Step 2: Fix editorActions.ts**

In `frontend/src/app/stores/actions/editorActions.ts`, ensure import exists:

```typescript
import { clearError, captureError } from '../cacheHelpers';
```

In `createWorkspaceFile` (L94), replace:

```typescript
      if (!result.ok) {
        set({ error: result.error.message });
        return undefined;
      }
```

with:

```typescript
      if (!result.ok) {
        captureError(get, result.error);
        return undefined;
      }
```

Add `clearError(get);` at the start of `createWorkspaceFile` and `createWorkspaceFolder`.

In `createWorkspaceFolder` (L132), replace:

```typescript
      if (!result.ok) {
        set({ error: result.error.message });
        return undefined;
      }
```

with:

```typescript
      if (!result.ok) {
        captureError(get, result.error);
        return undefined;
      }
```

- [ ] **Step 3: Fix editorActionsHelpers.ts**

In `frontend/src/app/stores/actions/editorActionsHelpers.ts`, add import:

```typescript
import { clearError, captureError } from '../cacheHelpers';
```

In `openFileGeneric` (L93), replace:

```typescript
  if (!fileResult.ok) {
    set({ error: fileResult.error.message });
    return;
  }
```

with:

```typescript
  if (!fileResult.ok) {
    captureError(get, fileResult.error);
    return;
  }
```

**Note:** `openFileGeneric` takes `_get` (underscore-prefixed, currently unused). Rename to `get` and use it. Update the function signature:

```typescript
export async function openFileGeneric(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  relativePath: string,
  requestSeq: number,
  config: OpenFileConfig
) {
```

Also update all callers of `openFileGeneric` to pass `get` instead of `_get` or `undefined`.

In `openChangePreviewGeneric` (L141), the current code silently swallows errors (sets state but no error). Add error capture:

```typescript
  if (!result.ok) {
    captureError(get, result.error);
    set({
      selectedChangePreviewPath: relativePath,
      selectedChangePreviewWorkspaceId: config.workspaceId,
      changePreviewLoading: false,
      changePreview: get().changePreview?.path === relativePath ? undefined : get().changePreview,
    });
    return;
  }
```

- [ ] **Step 4: Fix gitActions.ts**

In `frontend/src/app/stores/actions/gitActions.ts`, ensure import exists (may already be present for other functions):

```typescript
import { clearError, captureError } from '../cacheHelpers';
```

In `fetchGitBranches` (L154), replace:

```typescript
      if (!result.ok) {
        set({ error: result.error.message, gitBranches: [] });
        return;
      }
```

with:

```typescript
      if (!result.ok) {
        captureError(get, result.error);
        set({ gitBranches: [] });
        return;
      }
```

- [ ] **Step 5: Fix searchActions.ts**

In `frontend/src/app/stores/actions/searchActions.ts`, add import:

```typescript
import { clearError, captureError } from '../cacheHelpers';
```

In `searchFiles` (L31), replace:

```typescript
        if (!result.ok) {
          set({ error: result.error.message });
          return;
        }
```

with:

```typescript
        if (!result.ok) {
          captureError(get, result.error);
          return;
        }
```

- [ ] **Step 6: Run typecheck + lint + test**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck 2>&1 | Select-String "error" | Select-Object -Last 3
pnpm run lint 2>&1 | Select-String "error|warning" | Select-Object -Last 3
pnpm run test 2>&1 | Select-String "Test Files|Tests" | Select-Object -Last 3
```
Expected: 0 type errors, 0 lint errors, all tests pass

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/stores/actions/
git commit -m "fix(stores): replace set({ error }) with captureError in 12 action locations

sessionActions (7), editorActions (2), editorActionsHelpers (1),
gitActions (1), searchActions (1). All mutation actions now use the
typed error capture pipeline per error-handling.md rule."
```

---

### Task 13: Remove hardcoded localhost:5173 URL

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserSearch.ts` (line 64)

**Interfaces:**
- Consumes: `import.meta.env.DEV` (Vite dev mode flag)
- Produces: `quickLinks` array that only includes dev URL in dev mode

- [ ] **Step 1: Fix the hardcoded URL**

In `frontend/src/app/features/browser/useBrowserSearch.ts`, find the `quickLinks` useMemo (around line 57-63):

```typescript
  const quickLinks = useMemo(
    () => [
      { title: t.browserLocalPreview, url: 'http://localhost:5173/' },
      { title: t.browserBlankTab, url: 'about:blank' },
    ],
    [t.browserBlankTab, t.browserLocalPreview]
  );
```

Replace with:

```typescript
  const quickLinks = useMemo(
    () => [
      ...(import.meta.env.DEV
        ? [{ title: t.browserLocalPreview, url: `http://localhost:${import.meta.env.VITE_PORT ?? 5173}/` }]
        : []),
      { title: t.browserBlankTab, url: 'about:blank' },
    ],
    [t.browserBlankTab, t.browserLocalPreview]
  );
```

- [ ] **Step 2: Run typecheck + lint + test**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck 2>&1 | Select-String "error" | Select-Object -Last 3
pnpm run lint 2>&1 | Select-String "error|warning" | Select-Object -Last 3
pnpm run test 2>&1 | Select-String "Test Files|Tests" | Select-Object -Last 3
```
Expected: 0 type errors, 0 lint errors, all tests pass

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/app/features/browser/useBrowserSearch.ts
git commit -m "fix(frontend): gate localhost:5173 quick link to dev mode only

The hardcoded dev server URL would not resolve in Tauri production
builds. Now only shown when import.meta.env.DEV is true."
```

---

## Self-Review

### Spec coverage

| Finding from insight report | Task(s) |
|----------------------------|---------|
| Critical: retrieval_rebuild_index sync | Task 1 |
| Critical: agent N+1 query | Task 2 |
| Critical: ~35 sync Tauri commands | Tasks 3-8 (conversation 13, permission 5, task 4, patch 3, sidebar 8, provider 3, app 3 = 39 total) |
| Critical: 44 empty catch blocks | Task 10 (store slices) + Task 9 (storageHelpers) |
| High: storageHelpers empty catch | Task 9 |
| High: fetchPageMeta empty catch | Task 11 |
| High: preview-storage empty catch | Task 11 |
| High: 11 set({ error }) bypasses | Task 12 |
| High: hardcoded localhost:5173 | Task 13 |

All 9 findings from Plan A scope are covered.

### Placeholder scan

- No "TBD", "TODO", "implement later" found
- All code blocks contain complete implementation code
- All file paths are exact
- All commands include expected output

### Type consistency

- `captureError(get, error)` signature matches across all tasks (from `cacheHelpers.ts`)
- `clearError(get)` signature matches
- `_with_db` helper naming is consistent: `require_session_with_db`, `save_session_with_db`, `set_pinned_with_db`, `get_session_detail_with_db`, `snapshot_with_db`, `save_audit_entry_with_db`, `require_patch_set_with_db`, `save_patch_set_with_db`, `load_or_seed_sidebar_with_db`, `save_sidebar_entries_with_db`, `presentable_recent_list_with_db`
- All async commands follow the same pattern: `pub async fn name(app: tauri::AppHandle, ...) -> Result<IpcResult<T>, AppError>`

### Notes on assumptions

1. **`save_config_to_dir`**: Task 8 assumes `save_config` can be refactored into `save_config_to_dir(config)` that takes a config value. If `save_config` requires `&AppState`, the implementer should wrap the entire `save_config(&state)` call in `spawn_blocking` by cloning `state.data_dir` and passing it. The key requirement: file I/O must not happen on the main thread.

2. **`LogManager` Clone**: Task 8 assumes `LogManager` is `Clone` or can be wrapped in `Arc`. If not, the implementer should pass the necessary path + content into `spawn_blocking` instead of cloning the manager.

3. **`get_state`/`put_state` on Database**: Task 7 assumes `Database` has `get_state`/`put_state` methods. If these are on `AppState`, the implementer should inline the key-value state operations using `db.execute()` or equivalent.

4. **Frontend bridge compatibility**: Converting sync Tauri commands to async does NOT require frontend bridge changes — Tauri's `invoke()` returns a Promise for both sync and async commands. The `IpcResult<T>` envelope is unchanged.

5. **`generate_handler!` macro**: No changes needed — Tauri's `generate_handler!` accepts both sync and async commands automatically.
