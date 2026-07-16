# Refactoring Tasks 15-19 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining 5 tasks (15-19) of the 2026-07-10 refactoring effort: memoize ProviderConfig, migrate webview2_history to tokio, recover from mutex poisoning, document dead_code suppressions, and audit exhaustive-deps directives.

**Architecture:** Each task is a small, independently committable change. Tasks 15 and 19 are frontend-only; Tasks 16-18 are Rust-only. Task 15 first resolves a blocker from the prior session (missing `useMemo` import). Task 19 includes one real bug fix (missing `t` dependency in AddManualPortDialog) alongside documentation of intentional suppressions.

**Tech Stack:** Rust 1.85+ / Tauri 2.x / React 19 / Vite 8 / TypeScript 5.6 / Zustand 5 / Vitest 3 / pnpm 11

## Global Constraints

- **No `any` type**: Use precise types, `unknown`, and type guards (project rule `dev-rules.md`)
- **No `else`**: Use early-return pattern (project rule `dev-rules.md`)
- **No empty catch blocks**: All catches must at minimum `console.warn` (project rule `error-handling.md`)
- **Rust: no `unwrap()` in production code**: Use `?` or `.expect()` with context (project rule `dev-rules.md`)
- **Node.js PATH**: Run `$env:Path = "D:\Program Files\nodejs;$env:Path"` before any `pnpm`/`npm` command
- **Rust PATH**: Run `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` before any `cargo` command
- **PowerShell heredoc**: Use `@'...'@` here-strings for multi-line commit messages (NOT bash `$(cat <<'EOF')`)
- **Acceptance flow**: After all code changes, run the mandatory testing flow (ESLint + Prettier + typecheck + tests for frontend; rustfmt + clippy + check + tests for Rust)
- **Pre-existing errors**: 4 TS errors (workspace-browser/index.ts, StatusBar.tsx, StatusBarEditorInfo.tsx) and 2 Rust test failures (adl-model-gateway) are pre-existing and unrelated — do NOT fix them in this plan

---

## File Structure

### Files to Modify

| File | Change |
|------|--------|
| `ai-digital-life/frontend/src/app/features/provider-manager/ProviderConfig.tsx` | Add `useMemo` to line 1 import (line 14 already uses it) |
| `ai-digital-life/crates/browser/Cargo.toml` | Add `tokio.workspace = true` dependency |
| `ai-digital-life/crates/browser/src/webview2_history.rs` | Replace `std::thread::spawn` + `std::thread::sleep` with `tauri::async_runtime::spawn` + `tokio::time::sleep` |
| `ai-digital-life/crates/kernel/src/events.rs` | Replace 2 `.expect()` calls with `.unwrap_or_else(\|e\| e.into_inner())` |
| `ai-digital-life/crates/adl-logging/src/manager.rs` | Add doc comment to `#[allow(dead_code)]` on `terminal_file` field |
| `ai-digital-life/crates/browser/src/webview2_audio.rs` | Add doc comment to `#[allow(dead_code)]` on `HandlerBox` struct |
| `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts` | Add explanatory comment to eslint-disable |
| `ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts` | Add explanatory comment to eslint-disable |
| `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts` | Remove misplaced eslint-disable directive |
| `ai-digital-life/frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx` | Fix missing `t` dependency, remove eslint-disable block |
| `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` | Add explanatory comment to eslint-disable |

### Files to Create

None.

---

## Task 15: Add useMemo import to ProviderConfig.tsx

> **Blocker context:** A prior session applied the `useMemo(() => ..., [providers])` wrapper on line 14 but the line 1 import edit (`import { useState, useMemo } from 'react';`) did not persist. The file currently uses `useMemo` on line 14 without importing it, causing `error TS2304: Cannot find name 'useMemo'`. This task fixes the import and completes the memoization.

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/provider-manager/ProviderConfig.tsx` (line 1)

**Interfaces:**
- Consumes: `useMemo` from `react`
- Produces: `configuredProviders` memoized array of provider IDs

- [ ] **Step 1: Read the current file state**

Read `ai-digital-life/frontend/src/app/features/provider-manager/ProviderConfig.tsx` lines 1-20.

Confirm:
- Line 1 is `import { useState } from 'react';` (missing `useMemo`)
- Line 14 is `const configuredProviders = useMemo(` (already using `useMemo`)

- [ ] **Step 2: Fix the import on line 1**

Change line 1 from:
```typescript
import { useState } from 'react';
```
To:
```typescript
import { useState, useMemo } from 'react';
```

- [ ] **Step 3: Run typecheck to verify the TS2304 error is resolved**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck 2>&1 | Select-String "ProviderConfig|error TS"
```

Expected: No `ProviderConfig` errors. The 4 pre-existing errors (workspace-browser/index.ts, StatusBar.tsx, StatusBarEditorInfo.tsx) may still appear — those are unrelated.

- [ ] **Step 4: Run lint and format**

```powershell
pnpm run lint:fix
pnpm run format
```

- [ ] **Step 5: Run tests to verify no regression**

```powershell
pnpm run test 2>&1 | Select-Object -Last 15
```

Expected: All tests pass (483 tests, same count as before Task 15).

- [ ] **Step 6: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/provider-manager/ProviderConfig.tsx
$msg = @'
perf(frontend): memoize configuredProviders in ProviderConfig

Wraps the providers.filter().map() chain in useMemo with [providers]
dependency to avoid recomputing the ID array on every render.
Resolves a prior incomplete edit that used useMemo without importing it.
'@
git commit -m $msg
```

---

## Task 16: Replace std::thread with tokio::spawn in webview2_history.rs

> **Context:** `spawn_spa_fallback` currently spawns an OS thread that sleeps for 2 seconds. OS threads are heavier than async tasks. Since Tauri's async runtime uses tokio, we switch to `tauri::async_runtime::spawn` + `tokio::time::sleep`. The workspace Cargo.toml already declares `tokio` with the `time` feature (line 40), but `adl-browser/Cargo.toml` does not yet depend on `tokio` directly.

**Files:**
- Modify: `ai-digital-life/crates/browser/Cargo.toml` (add tokio dependency)
- Modify: `ai-digital-life/crates/browser/src/webview2_history.rs` (lines 51-83)

**Interfaces:**
- Consumes: `tauri::async_runtime::spawn`, `tokio::time::sleep`
- Produces: Same `spawn_spa_fallback` signature, async-backed implementation

- [ ] **Step 1: Add tokio dependency to adl-browser crate**

Read `ai-digital-life/crates/browser/Cargo.toml`.

In the `[dependencies]` section (after line 11, the `tauri` line), add:
```toml
tokio.workspace = true
```

The full `[dependencies]` section should read:
```toml
[dependencies]
adl-errors = { path = "../errors" }
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
tauri = { workspace = true, features = ["unstable"] }
tokio.workspace = true
url.workspace = true
urlencoding = "2.1"
once_cell = "1"
```

- [ ] **Step 2: Replace spawn_spa_fallback implementation**

Read `ai-digital-life/crates/browser/src/webview2_history.rs` lines 47-83.

Replace the entire `spawn_spa_fallback` function (lines 51-83):
```rust
    fn spawn_spa_fallback(app: AppHandle, label: String, url: String) {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(2000));
            // Check if meta was already emitted for this URL
            let already_emitted = {
                if let Ok(last_url) = LAST_EMIT_URL.lock() {
                    *last_url == url
                } else {
                    false
                }
            };
            if already_emitted {
                return;
            }
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.eval(
                    r#"(function(){
                        var t = document.title;
                        if (t && t.trim()) {
                            try {
                                chrome.webview.postMessage(JSON.stringify({
                                    type: 'meta',
                                    title: t,
                                    favicon: '',
                                    url: location.href
                                }));
                            } catch(e) {}
                        }
                    })()"#,
                );
            }
        });
    }
```

With:
```rust
    fn spawn_spa_fallback(app: AppHandle, label: String, url: String) {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            // Check if meta was already emitted for this URL
            let already_emitted = {
                if let Ok(last_url) = LAST_EMIT_URL.lock() {
                    *last_url == url
                } else {
                    false
                }
            };
            if already_emitted {
                return;
            }
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.eval(
                    r#"(function(){
                        var t = document.title;
                        if (t && t.trim()) {
                            try {
                                chrome.webview.postMessage(JSON.stringify({
                                    type: 'meta',
                                    title: t,
                                    favicon: '',
                                    url: location.href
                                }));
                            } catch(e) {}
                        }
                    })()"#,
                );
            }
        });
    }
```

- [ ] **Step 3: Run Rust checks**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check -p adl-browser 2>&1 | Select-Object -Last 10
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Run clippy**

```powershell
cargo clippy -p adl-browser -- -D warnings 2>&1 | Select-Object -Last 15
```

Expected: No warnings. If clippy reports `unused_imports` for `std::thread`, remove the `use std::thread` import if one exists (the file does not currently import `std::thread` directly — it uses the fully-qualified path `std::thread::spawn`, so no import removal is needed).

- [ ] **Step 5: Run adl-browser tests**

```powershell
cargo test -p adl-browser 2>&1 | Select-Object -Last 15
```

Expected: All tests pass. (Note: `adl-browser` has few tests; the SPA fallback is tested via integration/manual testing.)

- [ ] **Step 6: Run workspace check to verify no breakage**

```powershell
cargo check --workspace 2>&1 | Select-Object -Last 5
```

Expected: `Finished` with no errors.

- [ ] **Step 7: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/browser/Cargo.toml crates/browser/src/webview2_history.rs
$msg = @'
perf(rust): replace std::thread with tokio::spawn in webview2_history

Uses tauri::async_runtime::spawn + tokio::time::sleep for the 2s SPA
fallback timer instead of spawning an OS thread. Reduces per-navigation
thread creation overhead. Adds tokio workspace dependency to adl-browser.
'@
git commit -m $msg
```

---

## Task 17: Replace mutex .expect() with poison recovery in events.rs

> **Context:** `EventBus` stores a `by_type: Arc<Mutex<BTreeMap<...>>>` for diagnostics counters. Two call sites use `.expect("event diagnostics mutex poisoned")` which panics if the mutex is poisoned. Since this mutex guards only diagnostic counters (not business state), recovering from poison by accessing the inner data is safe and preferable to crashing the process.

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/events.rs` (lines 68, 80)

**Interfaces:**
- Consumes: `std::sync::Mutex` poison error via `PoisonError`
- Produces: Same `emit()` and `diagnostics()` signatures, no-panic behavior

- [ ] **Step 1: Read the current file**

Read `ai-digital-life/crates/kernel/src/events.rs` lines 63-84.

Confirm the two `.expect()` call sites:
- Line 68 (in `emit()`): `let mut by_type = self.by_type.lock().expect("event diagnostics mutex poisoned");`
- Line 80 (in `diagnostics()`): `let by_type = self.by_type.lock().expect("event diagnostics mutex poisoned");`

- [ ] **Step 2: Replace line 68 in emit()**

Change:
```rust
            let mut by_type = self.by_type.lock().expect("event diagnostics mutex poisoned");
```
To:
```rust
            let mut by_type = self
                .by_type
                .lock()
                .unwrap_or_else(|e| e.into_inner());
```

- [ ] **Step 3: Replace line 80 in diagnostics()**

Change:
```rust
        let by_type = self.by_type.lock().expect("event diagnostics mutex poisoned");
```
To:
```rust
        let by_type = self
            .by_type
            .lock()
            .unwrap_or_else(|e| e.into_inner());
```

- [ ] **Step 4: Run Rust checks**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check -p adl-kernel 2>&1 | Select-Object -Last 10
cargo clippy -p adl-kernel -- -D warnings 2>&1 | Select-Object -Last 10
```

Expected: No errors or warnings.

- [ ] **Step 5: Run adl-kernel tests**

```powershell
cargo test -p adl-kernel 2>&1 | Select-Object -Last 15
```

Expected: All tests pass, including the existing `event_bus_delivers` test.

- [ ] **Step 6: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/kernel/src/events.rs
$msg = @'
fix(rust): recover from mutex poisoning in event diagnostics

Replaces .expect() with .unwrap_or_else(into_inner) for the
diagnostics-only by_type mutex in EventBus. Prevents unnecessary
process panics when a thread holding the lock panics — the counter
data may be stale but diagnostics are best-effort anyway.
'@
git commit -m $msg
```

---

## Task 18: Document #[allow(dead_code)] suppressions

> **Context:** Two `#[allow(dead_code)]` attributes suppress clippy warnings for fields/structs that are intentionally kept alive for their side effects (Arc reference counting, COM handler lifetime) rather than direct access. The suppressions are correct but undocumented — future readers may not understand why.

**Files:**
- Modify: `ai-digital-life/crates/adl-logging/src/manager.rs` (line 41)
- Modify: `ai-digital-life/crates/browser/src/webview2_audio.rs` (line 22)

**Interfaces:**
- Consumes: nothing
- Produces: documented suppressions (no behavior change)

- [ ] **Step 1: Read manager.rs around line 41**

Read `ai-digital-life/crates/adl-logging/src/manager.rs` lines 36-43.

Confirm:
```rust
pub struct LogManager {
    config: Arc<RwLock<LogConfig>>,
    log_dir: PathBuf,
    terminal_sessions: Arc<Mutex<SessionTracker>>,
    debug_sessions: Arc<Mutex<SessionTracker>>,
    #[allow(dead_code)]
    terminal_file: Arc<Mutex<Option<TerminalFileState>>>,
}
```

The `terminal_file` field is stored on `LogManager` to keep the `Arc` alive for the lifetime of the manager — `TerminalMakeWriter` (line 198) holds a clone of the same `Arc` and reads/writes the inner `TerminalFileState`. Without this field, the `Arc` would be dropped after `init()` returns, and `TerminalMakeWriter`'s clone would be the only reference (which is fine semantically, but the field is kept as an explicit lifetime anchor). The field itself is never read via `self.terminal_file` in any method, hence the `dead_code` warning.

- [ ] **Step 2: Add doc comment to manager.rs line 41**

Change:
```rust
    #[allow(dead_code)]
    terminal_file: Arc<Mutex<Option<TerminalFileState>>>,
```
To:
```rust
    #[allow(dead_code)] // Lifetime anchor: keeps the Arc alive so TerminalMakeWriter's clone remains valid
    terminal_file: Arc<Mutex<Option<TerminalFileState>>>,
```

- [ ] **Step 3: Read webview2_audio.rs around line 22**

Read `ai-digital-life/crates/browser/src/webview2_audio.rs` lines 19-30.

Confirm:
```rust
    /// Wrapper that makes COM handlers (which are `!Send` due to raw COM pointers)
    /// storable behind a `Mutex`. The handlers' closures capture only `Send` types
    /// (AppHandle, String), and COM's AddRef/Release are thread-safe.
    #[allow(dead_code)]
    struct HandlerBox(Box<dyn Any>);
```

`HandlerBox` wraps COM handler interface pointers (`IsDocumentPlayingAudioChangedEventHandler`, `IsMutedChangedEventHandler`) behind a `Box<dyn Any>` so they can be stored in a `Vec` inside a `Mutex<HashMap>`. The inner `Box<dyn Any>` is never downcast or read — the struct exists solely to keep the COM handlers alive (defensive measure against premature drop). The `dead_code` warning fires because the field `0` is write-only.

- [ ] **Step 4: Add doc comment to webview2_audio.rs line 22**

Change:
```rust
    #[allow(dead_code)]
    struct HandlerBox(Box<dyn Any>);
```
To:
```rust
    #[allow(dead_code)] // Inner field is write-only: struct exists to keep COM handlers alive, never downcast
    struct HandlerBox(Box<dyn Any>);
```

- [ ] **Step 5: Run Rust checks**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace 2>&1 | Select-Object -Last 10
cargo clippy --workspace -- -D warnings 2>&1 | Select-Object -Last 15
```

Expected: No errors or warnings.

- [ ] **Step 6: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/adl-logging/src/manager.rs crates/browser/src/webview2_audio.rs
$msg = @'
docs(rust): document #[allow(dead_code)] suppressions

Adds inline comments explaining why terminal_file (LogManager) and
HandlerBox (webview2_audio) are kept despite clippy flagging them
as dead code: both serve as lifetime anchors for Arc/COM references.
'@
git commit -m $msg
```

---

## Task 19: Audit react-hooks/exhaustive-deps eslint-disable directives

> **Context:** 6 `eslint-disable` directives for `react-hooks/exhaustive-deps` exist in the browser and git-visualization features. Audit found:
> - 1 already documented (`SafeIframe.tsx:93`) — no change
> - 1 misplaced directive (`useBrowserUrlChange.ts:312`) — remove
> - 1 hiding a real bug (`AddManualPortDialog.tsx:28`) — fix missing `t` dep, remove directive
> - 3 undocumented mount-only effects (`useECharts.ts:33`, `useBrowserPageMeta.ts:274`, `LocalPortSection.tsx:99`) — add comments

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts` (line 33)
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts` (line 274)
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts` (line 312)
- Modify: `ai-digital-life/frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx` (lines 28-41)
- Modify: `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` (line 99)
- No change: `ai-digital-life/frontend/src/app/features/browser/SafeIframe.tsx` (line 93 — already documented)

**Interfaces:**
- Consumes: nothing
- Produces: documented suppressions + 1 bug fix (AddManualPortDialog `t` dependency)

- [ ] **Step 1: Add comment to useECharts.ts line 33**

Read `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts` lines 30-35.

Change:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```
To:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: init chart + ResizeObserver once; option updates handled by the effect below
  }, []);
```

- [ ] **Step 2: Add comment to useBrowserPageMeta.ts line 274**

Read `ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts` lines 270-277.

Change:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
```
To:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: handler reads latest state via refs; adding deps would recreate the callback and break the subscription
    []
  );
```

- [ ] **Step 3: Remove misplaced directive in useBrowserUrlChange.ts**

Read `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts` lines 308-318.

The directive on line 312 is inside a cleanup function, suppressing the `for` loop line — not a deps array. It is ineffective and misleading. Remove it.

Change:
```typescript
    return () => {
      unsubUrl();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const timer of fallbackTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      fallbackTimeoutsRef.current.clear();
    };
```
To:
```typescript
    return () => {
      unsubUrl();
      for (const timer of fallbackTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      fallbackTimeoutsRef.current.clear();
    };
```

- [ ] **Step 4: Fix missing `t` dependency in AddManualPortDialog.tsx**

Read `ai-digital-life/frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx` lines 28-41.

The `handleConfirm` callback uses `t.browserAddPortInvalid` (line 36) but `t` is not in the deps array `[port, label, onConfirm]`. The `/* eslint-disable */` block is hiding this. Fix by adding `t` to deps and removing the disable block.

Change:
```typescript
  /* eslint-disable react-hooks/exhaustive-deps */
  const handleConfirm = useCallback(() => {
    const trimmedPort = port.trim();
    if (!trimmedPort) {
      return;
    }
    const num = Number.parseInt(trimmedPort, 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
      setError(t.browserAddPortInvalid || 'Invalid port number (1-65535)');
      return;
    }
    onConfirm(num, label.trim() || undefined);
  }, [port, label, onConfirm]);
  /* eslint-enable react-hooks/exhaustive-deps */
```
To:
```typescript
  const handleConfirm = useCallback(() => {
    const trimmedPort = port.trim();
    if (!trimmedPort) {
      return;
    }
    const num = Number.parseInt(trimmedPort, 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
      setError(t.browserAddPortInvalid || 'Invalid port number (1-65535)');
      return;
    }
    onConfirm(num, label.trim() || undefined);
  }, [port, label, onConfirm, t]);
```

- [ ] **Step 5: Add comment to LocalPortSection.tsx line 99**

Read `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` lines 95-100.

Change:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```
To:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: initial port scan; scanPorts is stable via useCallback and reads latest state from stores
  }, []);
```

- [ ] **Step 6: Run lint to verify no new warnings**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run lint 2>&1 | Select-String "exhaustive-deps|error|warning" | Select-Object -First 20
```

Expected: No `react-hooks/exhaustive-deps` warnings for the 5 modified files. The `SafeIframe.tsx` directive (unchanged) should also produce no warning since it already has the suppression.

- [ ] **Step 7: Run typecheck**

```powershell
pnpm run typecheck 2>&1 | Select-String "error TS" | Select-Object -First 10
```

Expected: Only the 4 pre-existing errors (workspace-browser/index.ts, StatusBar.tsx, StatusBarEditorInfo.tsx). No new errors from the AddManualPortDialog dep fix.

- [ ] **Step 8: Run tests**

```powershell
pnpm run test 2>&1 | Select-Object -Last 15
```

Expected: All 483 tests pass. The `t` dependency addition is a correctness fix — `handleConfirm` now recreates when `t` changes (language switch), which is the correct behavior.

- [ ] **Step 9: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/hooks/useECharts.ts frontend/src/app/features/browser/useBrowserPageMeta.ts frontend/src/app/features/browser/useBrowserUrlChange.ts frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx
$msg = @'
chore(frontend): audit react-hooks/exhaustive-deps suppressions

Documents 3 intentional mount-only-effect suppressions (useECharts,
useBrowserPageMeta, LocalPortSection). Removes 1 misplaced directive
in useBrowserUrlChange cleanup. Fixes 1 real bug in AddManualPortDialog:
handleConfirm used t.browserAddPortInvalid without t in deps array,
hidden by a block-level eslint-disable. SafeIframe already documented.
'@
git commit -m $msg
```

---

## Final Acceptance

After all 5 tasks complete, run the full mandatory testing flow:

### Frontend

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

Expected:
- ESLint: 0 errors (pre-existing warnings may remain)
- Prettier: formats applied
- Typecheck: only 4 pre-existing errors (workspace-browser/index.ts, StatusBar.tsx ×2, StatusBarEditorInfo.tsx)
- Tests: 483 passing

### Rust

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
```

Expected:
- rustfmt: formats applied
- clippy: 0 warnings
- check: 0 errors
- tests: all pass except 2 pre-existing failures in `adl-model-gateway` (environmental — Clash proxy intercepting fake-key API calls)

### Post-Completion

After acceptance passes, update the SDD progress ledger at `.superpowers/sdd/progress.md`:
- Mark Tasks 15-19 as ✅ Complete with commit hashes
- Then proceed to the final whole-branch review using `superpowers:requesting-code-review`
- Then use `superpowers:finishing-a-development-branch` to merge or create a PR

---

## Self-Review

**1. Spec coverage:**
- Task 15 (ProviderConfig useMemo): ✅ Step 2 fixes the import, Step 3 verifies typecheck
- Task 16 (webview2_history tokio): ✅ Steps 1-2 add dep + replace impl, Steps 3-6 verify
- Task 17 (events.rs poison recovery): ✅ Steps 2-3 replace both call sites, Steps 4-5 verify
- Task 18 (dead_code docs): ✅ Steps 2, 4 add comments to both files, Step 5 verifies
- Task 19 (exhaustive-deps audit): ✅ Steps 1-5 cover all 5 files needing changes, Step 6 verifies lint. SafeIframe (no change) is documented in the task header.

**2. Placeholder scan:**
- No "TBD", "TODO", "implement later" found
- All code blocks contain actual code
- All commands are complete with expected output

**3. Type consistency:**
- `spawn_spa_fallback` signature unchanged (`fn(AppHandle, String, String)`)
- `emit()` and `diagnostics()` signatures unchanged
- `handleConfirm` deps array gains `t` (type `Record<string, string>` from props) — consistent with existing `t: Record<string, string>` in `AddManualPortDialogProps`
- All eslint-disable comments use `--` separator before explanation (standard ESLint inline comment syntax)

**4. Pre-existing issues respected:**
- 4 TS errors explicitly called out as pre-existing (do not fix)
- 2 Rust test failures in adl-model-gateway explicitly called out as environmental (do not fix)
- ~15 pre-existing uncommitted changes in working tree (App.tsx, gitSlice.ts, etc.) — not touched by any task
