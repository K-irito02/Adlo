# Browser Tab Suspend — Dual-Trigger (Idle Duration + Memory Pressure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed WebView-pool capacity-6 LRU eviction with an Edge-style idle-duration + Chrome-style system-memory-pressure dual trigger that suspends inactive tab WebViews, with the idle threshold configurable via the settings page.

**Architecture:** Frontend is the single suspension orchestrator (it holds the tab list, per-tab last-active time, and protected flags). A periodic scheduler in `useBrowserWebView` suspends eligible inactive tabs: idle pass (age > threshold) and memory pass (a new Rust `browser_memory_pressure()` query). Rust keeps only primitives: create/destroy/show-hide + a memory-pressure query; the capacity-based eviction in `BrowserPool` and the previous `set_tab_protected` mechanism are removed.

**Tech Stack:** React 19 + Zustand (frontend), Rust + Tauri 2 (backend), WebView2, ts-rs generated types, Windows API `GlobalMemoryStatusEx`.

## Global Constraints

- Rust must not run blocking I/O on the main thread; `browser_memory_pressure` reads one Windows API call and is `pub fn` (memory read is fast, non-blocking).
- All UI text uses i18n keys in `frontend/src/app/i18n/{zh-CN,en-US}/browser.ts`; `CopyKey` is derived from `zhCN`.
- Rust↔TS shared types: every `#[derive(TS)]` struct requires `#[serde(rename_all = "camelCase")]`; optional fields use `#[ts(optional)]` and `#[serde(default)]`.
- Frontend selectors: use `useAppStore((s) => s.field)` for single fields; `useShallow` for object/array selection.
- No `any`, no `else`, early-return, `const` first (frontend dev-rules).
- Test files co-located in `__tests__/` (frontend) or `#[cfg(test)]`/`tests/` (Rust).
- Bridge pattern: any change to `BrowserBridge` must update Tauri, Preview, Mock **and** HTTP (`httpBridge.ts`) implementations.
- The previous `browser_set_tab_protected` command + bridge method + Rust `BrowserPool::set_protected`/`protected` are now dead code and MUST be removed (their protection logic moves to the frontend scheduler, which reads `tab.isPinned` / `tab.isPlayingAudio` directly).

---

### Task 1: Rust — Remove capacity eviction & protected set from BrowserPool

**Files:**
- Modify: `ai-digital-life/crates/browser/src/browser_pool.rs`
- Test: `ai-digital-life/crates/browser/tests/browser_pool_tests.rs`

**Interfaces:**
- Consumes: none.
- Produces: `BrowserPool::register(&self, tab_id: String) -> Option<String>` now never evicts (the argument still has type `Option<String>` for signature compatibility with `create_for_tab`, but always returns `None`). `set_protected`, the `protected` field, and `lock_protected` are deleted.

- [ ] **Step 1: Write the failing test** (assert `register` never evicts even beyond the old capacity, and that a removed `protected` API no longer exists)

```rust
    use adl_browser::BrowserPool;
    #[test]
    fn register_never_evicts_after_capacity_removed() {
        let pool = BrowserPool::new(2);
        assert_eq!(pool.register("a".into()), None);
        assert_eq!(pool.register("b".into()), None);
        // No longer evicts on capacity — "c" registers without evicting "a".
        assert_eq!(pool.register("c".into()), None);
        assert_eq!(pool.size(), 3);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ai-digital-life/`): `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -p adl-browser`
Expected: FAIL — `register("c".into())` returns `Some("a")` (old evicting behavior).

- [ ] **Step 3: Implement** (remove `protected`, `set_protected`, `lock_protected`, `std::collections::HashSet`, and the eviction branch)

```rust
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

fn lock_pool(inner: &Mutex<Vec<String>>) -> MutexGuard<'_, Vec<String>> {
    inner.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Debug, Clone)]
pub struct BrowserPool {
    inner: Arc<Mutex<Vec<String>>>,
}

impl BrowserPool {
    pub fn new(_capacity: usize) -> Self {
        Self { inner: Arc::new(Mutex::new(Vec::new())) }
    }

    /// Register a tab's recency. Pool is unbounded; never evicts.
    pub fn register(&self, tab_id: String) -> Option<String> {
        let mut order = lock_pool(&self.inner);
        order.retain(|id| id != &tab_id);
        order.push(tab_id);
        None
    }

    /// Mark a tab as recently used (move to end of list). No-op if tab not in pool.
    pub fn touch(&self, tab_id: &str) {
        let mut order = lock_pool(&self.inner);
        if order.iter().any(|id| id == tab_id) {
            order.retain(|id| id != tab_id);
            order.push(tab_id.to_string());
        }
    }

    /// Remove a tab from the pool.
    pub fn remove(&self, tab_id: &str) {
        lock_pool(&self.inner).retain(|id| id != tab_id);
    }

    /// Returns the least-recently-used tab_id, if any.
    pub fn get_lru(&self) -> Option<String> {
        lock_pool(&self.inner).first().cloned()
    }

    pub fn is_full(&self) -> bool {
        false
    }

    pub fn size(&self) -> usize {
        lock_pool(&self.inner).len()
    }

    /// All tab IDs in pool (for hiding inactive WebViews).
    pub fn tab_ids(&self) -> Vec<String> {
        lock_pool(&self.inner).clone()
    }

    /// Check if a tab_id is in the pool.
    pub fn contains(&self, tab_id: &str) -> bool {
        lock_pool(&self.inner).iter().any(|id| id == tab_id)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -p adl-browser`
Expected: PASS (all pool tests, including the new no-eviction test).

- [ ] **Step 5: Remove `BrowserManager::set_protected`**

In `ai-digital-life/crates/browser/src/browser_webview.rs`, delete the `set_protected` method (added last round). Run `cargo test -p adl-browser` again — PASS.

- [ ] **Step 6: Run clippy**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo clippy -p adl-browser --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/crates/browser/src/browser_pool.rs ai-digital-life/crates/browser/src/browser_webview.rs ai-digital-life/crates/browser/tests/browser_pool_tests.rs
git commit -m "refactor(browser): remove pool capacity eviction and protected set (protection moves to frontend scheduler)"
```

---

### Task 2: Rust — Add `browser_memory_pressure` command

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs`
- Modify: `ai-digital-life/src-tauri/src/main.rs` (register command)
- Create: `ai-digital-life/src-tauri/src/commands/browser_memory.rs` (Windows memory helper)

**Interfaces:**
- Consumes: `ipc()` wrapper from `crate::commands` (per `tauri-command-ipc-wrapper-pattern`).
- Produces: `#[tauri::command] pub fn browser_memory_pressure() -> Result<IpcResult<bool>, CommandError>` and helper `fn system_memory_pressured() -> bool`.

- [ ] **Step 1: Write the helper with a cfg-guarded unit test**

Create `ai-digital-life/src-tauri/src/commands/browser_memory.rs`:

```rust
/// Windows: report memory pressure when available physical RAM is < 1 GiB,
/// or the installed-memory load is > 90%. Non-Windows always returns false.
#[cfg(windows)]
pub fn system_memory_pressured() -> bool {
    use windows::Win32::System::SystemInformation::{
        GlobalMemoryStatusEx, MEMORYSTATUSEX,
    };
    let mut mem = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // Safe: `mem` is a fully-initialized struct passed by pointer.
    let ok = unsafe { GlobalMemoryStatusEx(&mut mem) };
    if !ok.as_bool() {
        return false;
    }
    mem.ullAvailPhys < 1_074_741_824 || mem.dwMemoryLoad > 90
}

#[cfg(not(windows))]
pub fn system_memory_pressured() -> bool {
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn threshold_logic_short_circuits_on_low_avail() {
        // 0 avail → pressure true; 8 GiB avail with load 10% → false.
        let pressure = |avail: u64, load: u32| avail < 1_074_741_824 || load > 90;
        assert!(pressure(500_000_000, 10));
        assert!(!pressure(8_589_934_592, 10));
        assert!(pressure(8_589_934_592, 95));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -p ai-digital-life commands::browser_memory`
Expected: PASS.

- [ ] **Step 3: Wire the command**

In `ai-digital-life/src-tauri/src/commands/browser.rs` add:

```rust
use crate::commands::browser_memory::system_memory_pressured;

#[tauri::command]
pub fn browser_memory_pressure() -> Result<IpcResult<bool>, CommandError> {
    tracing::info!("[ADL-DEBUG][browser] memory_pressure = {}", system_memory_pressured());
    Ok(ipc(Ok(system_memory_pressured())))
}
```

- [ ] **Step 4: Register in main.rs**

In `ai-digital-life/src-tauri/src/main.rs`, add `commands::browser::browser_memory_pressure,` to the `generate_handler!` list.

- [ ] **Step 5: Compile check**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check -p ai-digital-life`
Expected: compiles.

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/browser.rs ai-digital-life/src-tauri/src/commands/browser_memory.rs ai-digital-life/src-tauri/src/main.rs
git commit -m "feat(browser): add browser_memory_pressure command (GlobalMemoryStatusEx)"
```

---

### Task 3: Rust — Remove `browser_set_tab_protected` command & registration

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs`
- Modify: `ai-digital-life/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: Task 1 removed `BrowserManager::set_protected`.
- Produces: nothing (removal).

- [ ] **Step 1: Delete the command**

In `commands/browser.rs` remove the `browser_set_tab_protected` function block (added last round).

- [ ] **Step 2: Delete the registration**

In `main.rs` remove `commands::browser::browser_set_tab_protected,` from `generate_handler!`.

- [ ] **Step 3: Compile check**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check -p ai-digital-life`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/browser.rs ai-digital-life/src-tauri/src/main.rs
git commit -m "refactor(browser): remove browser_set_tab_protected command (dead code after frontend-driven suspend)"
```

---

### Task 4: Frontend — Bridge: add `memoryPressure`, remove `setTabProtected`

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/browser.ts`
- Modify: `ai-digital-life/frontend/src/tauri-bridge/tauri-browser.ts`
- Modify: `ai-digital-life/frontend/src/mock/mock-browser.ts`
- Modify: `ai-digital-life/frontend/src/preview-bridge/index.ts`
- Modify: `ai-digital-life/frontend/src/httpBridge.ts`

**Interfaces:**
- Consumes: existing `BrowserBridge` interface.
- Produces: `BrowserBridge.memoryPressure: () => Promise<boolean>`; `setTabProtected` removed.

- [ ] **Step 1: Update the interface**

In `shared/ipc/browser.ts` remove:
```ts
  /** Mark a tab protected (pinned / playing audio) so it is exempt from LRU eviction. */
  setTabProtected: (tabId: string, isProtected: boolean) => Promise<void>;
```
Add:
```ts
  /** Whether the system is under memory pressure (Tauri/Windows). False in browser mode. */
  memoryPressure: () => Promise<boolean>;
```

- [ ] **Step 2: Update Tauri impl**

In `tauri-browser.ts` remove the `setTabProtected:` block; add:
```ts
    memoryPressure: () =>
      invokeIpc<boolean>('browser_memory_pressure').then((r) => r.ok && !!r.data),
```

- [ ] **Step 3: Update Mock + Preview + HTTP impls**

`mock-browser.ts` / `preview-bridge/index.ts` / `httpBridge.ts`: remove their `setTabProtected: () => Promise.resolve()` lines; add `memoryPressure: () => Promise.resolve(false)`.

- [ ] **Step 4: Typecheck**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`
Expected: no errors (confirms all implementations satisfy the interface).

- [ ] **Step 5: Run bridge tests**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/tauri-bridge/__tests__/bridge.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc/browser.ts ai-digital-life/frontend/src/tauri-bridge/tauri-browser.ts ai-digital-life/frontend/src/mock/mock-browser.ts ai-digital-life/frontend/src/preview-bridge/index.ts ai-digital-life/frontend/src/httpBridge.ts
git commit -m "feat(browser): add memoryPressure bridge, remove setTabProtected"
```

---

### Task 5: Frontend — Simplify useBrowserPool (remove capacity / protected)

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserPool.ts`
- Test: `ai-digital-life/frontend/src/app/features/browser/useBrowserPool.test.ts`

**Interfaces:**
- Consumes: `BrowserBridge.memoryPressure` (not used here), `destroyTab`.
- Produces (retained): `isTabInPool(tabId): boolean`, `createWebViewForTab(...)`, `activateTabInPool`, `navigateTabInPool`, `removeFromPool(tabId)` (the only suspend action), `poolVersion`. Removed: `POOL_CAPACITY`, `evictLocalLRU`, `protectedRef`, `setTabProtected`, `poolSize` capacity enforcement.

- [ ] **Step 1: Update the failing/verification test in useBrowserPool.test.ts**

Replace the "evicts LRU tab when pool is full" test with one asserting the pool no longer evicts on capacity:

```ts
it('does not evict on capacity (unbounded pool)', async () => {
  setMockBrowser();
  const { result } = renderHook(() => useBrowserPool());
  for (const id of ['a', 'b', 'c']) {
    await act(async () => {
      await result.current.createWebViewForTab(id, `https://${id}.com`);
    });
  }
  expect(result.current.isTabInPool('a')).toBe(true);
  expect(result.current.isTabInPool('b')).toBe(true);
  expect(result.current.isTabInPool('c')).toBe(true);
});
```
Remove the old "evicts LRU tab when pool is full" and "coalesces concurrent duplicate creation" stays (in-flight guard retained).

- [ ] **Step 2: Run test to verify (new assertion fails with old code)**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/features/browser/useBrowserPool.test.ts`
Expected: the new unbounded test FAILS (old `evictLocalLRU` evicted `a`).

- [ ] **Step 3: Implement** (edit `useBrowserPool.ts`)

Delete `const POOL_CAPACITY = 6;`, `protectedRef`, `creatingRef` stays, `evictLocalLRU`, `setTabProtected`, and in `createWebViewForTab` remove the `if (!isTauriShell()) { evictLocalLRU(); }` block and the `poolSizeBefore` debug log's reliance on a removed constant is fine (keep `poolSizeBefore: poolSetRef.current.size`). Keep `removeFromPool`, `destroyTabWebView`, in-flight guard.

- [ ] **Step 4: Run test to verify passes**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/features/browser/useBrowserPool.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Lint + typecheck**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec eslint src/app/features/browser/useBrowserPool.ts; pnpm --dir frontend run typecheck`
Expected: no errors/warnings.

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserPool.ts ai-digital-life/frontend/src/app/features/browser/useBrowserPool.test.ts
git commit -m "refactor(browser): make WebView pool unbounded, drop local capacity LRU + protected sync"
```

---

### Task 6: Frontend — Suspend scheduler (idle + memory) in useBrowserWebView

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserWebView.ts`
- Test: `ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserSuspendScheduler.test.ts` (extract pure helper)

**Interfaces:**
- Consumes: `removeFromPool`, `isTabInPool` (from `useBrowserPool`), `useAppStore((s) => s.browserTabs)`, `useAppStore((s) => s.browserActiveTabId)`, `window.digitalLife.browser.memoryPressure`.
- Produces: pure helper `selectSuspendCandidates(tabs, opts)` and hook `useBrowserSuspendScheduler` (internal, invoked from `useBrowserWebView`).

- [ ] **Step 1: Write failing tests for the pure selector**

Create `ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserSuspendScheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyIdlePass } from '../useBrowserSuspendScheduler';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const tab = (id: string, patch: Partial<BrowserTabState> = {}): BrowserTabState => ({
  id, workspaceId: '', title: 't', url: 'https://x.com', titleResolved: true,
  isPinned: false, sortOrder: 0, isPlayingAudio: false, isAudioMuted: false, ...patch,
});

describe('applyIdlePass (idle)', () => {
  const now = 10_000;
  it('suspends idle unprotected inactive in-pool tabs, oldest first', () => {
    const ids = applyIdlePass({
      tabs: [tab('old'), tab('new'), tab('active')],
      activeTabId: 'active',
      inPool: (id) => id !== 'active',
      lastActivatedMs: { old: 1_000, new: 9_000 },
      idleMs: 5_000,
      protected: (t) => t.isPinned || t.isPlayingAudio,
      now,
    });
    expect(ids).toEqual(['old']);
  });
  it('skips protected (pinned/audio) and active tabs', () => {
    const ids = applyIdlePass({
      tabs: [tab('pinned', { isPinned: true }), tab('audio', { isPlayingAudio: true }), tab('ok')],
      activeTabId: 'none',
      inPool: () => true,
      lastActivatedMs: { pinned: 0, audio: 0, ok: 0 },
      idleMs: 5_000,
      protected: (t) => t.isPinned || t.isPlayingAudio,
      now,
    });
    expect(ids).toEqual(['ok']);
  });
  it('returns [] when nothing is idle', () => {
    const ids = applyIdlePass({
      tabs: [tab('fresh')], activeTabId: 'none',
      inPool: () => true, lastActivatedMs: { fresh: 9_500 }, idleMs: 5_000,
      protected: () => false, now,
    });
    expect(ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/features/browser/__tests__/useBrowserSuspendScheduler.test.ts`
Expected: FAIL (module/function not found).

- [ ] **Step 3: Implement the pure helper + hook**

Create `ai-digital-life/frontend/src/app/features/browser/useBrowserSuspendScheduler.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const IDLE_INTERVAL_MS = 20_000;
const DEFAULT_IDLE_MS = 3_600_000;

export interface SuspendPassInput {
  tabs: BrowserTabState[];
  activeTabId: string;
  inPool: (tabId: string) => boolean;
  lastActivatedMs: Record<string, number>;
  idleMs: number;
  protected: (t: BrowserTabState) => boolean;
  now: number;
}

/** Return tab IDs (unprotected, inactive, in-pool, idle) ordered oldest-first. */
export function applyIdlePass(input: SuspendPassInput): string[] {
  const { tabs, activeTabId, inPool, lastActivatedMs, idleMs, protected: isProtected, now } = input;
  return tabs
    .filter(
      (t) =>
        t.id !== activeTabId &&
        inPool(t.id) &&
        !isProtected(t) &&
        now - (lastActivatedMs[t.id] ?? now) >= idleMs,
    )
    .sort((a, b) => (lastActivatedMs[a.id] ?? 0) - (lastActivatedMs[b.id] ?? 0))
    .map((t) => t.id);
}

interface SchedulerOptions {
  isVisible: boolean;
  removeFromPool: (tabId: string) => void;
  isTabInPool: (tabId: string) => boolean;
  activeTabId: string;
}

export function useBrowserSuspendScheduler(opts: SchedulerOptions) {
  const lastActivatedMsRef = useRef<Record<string, number>>({});
  const { isVisible, removeFromPool, isTabInPool, activeTabId } = opts;

  // Record activation recency.
  useEffect(() => {
    if (activeTabId) {
      lastActivatedMsRef.current[activeTabId] = Date.now();
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const idleMs =
      useAppStore.getState().appInfo?.config?.browserInactiveTabSuspendMs ?? DEFAULT_IDLE_MS;
    const tick = () => {
      const now = Date.now();
      const state = useAppStore.getState();
      const tabs = state.browserTabs;
      const activeId = state.browserActiveTabId;
      const isProtected = (t: BrowserTabState): boolean => t.isPinned || t.isPlayingAudio;

      const idleIds = applyIdlePass({
        tabs,
        activeTabId: activeId,
        inPool: isTabInPool,
        lastActivatedMs: lastActivatedMsRef.current,
        idleMs,
        protected: isProtected,
        now,
      });
      for (const id of idleIds) {
        removeFromPool(id);
      }

      if (isTauriShell()) {
        void (async () => {
          try {
            let pressured = await window.digitalLife?.browser?.memoryPressure?.() ?? false;
            while (pressured) {
              const state2 = useAppStore.getState();
              const candidates = applyIdlePass({
                tabs: state2.browserTabs,
                activeTabId: state2.browserActiveTabId,
                inPool: isTabInPool,
                lastActivatedMs: lastActivatedMsRef.current,
                idleMs: 0, // memory pressure: suspend oldest unprotected inactive in-pool even if not idle
                protected: isProtected,
                now: Date.now(),
              });
              if (candidates.length === 0) {
                break;
              }
              removeFromPool(candidates[0]);
              pressured = await window.digitalLife?.browser?.memoryPressure?.() ?? false;
            }
          } catch (e) {
            console.warn('[ADL-DEBUG][browser] memory-pressure pass failed:', e);
          }
        })();
      }
    };
    tick();
    const timer = window.setInterval(tick, IDLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isVisible, removeFromPool, isTabInPool]);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec vitest run src/app/features/browser/__tests__/useBrowserSuspendScheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into useBrowserWebView & remove the old protected-sync effect**

In `useBrowserWebView.ts`:
- Delete the `useAppStore((s) => s.browserTabs)` + `protectedStateRef` + the protected-sync `useEffect` (added last round).
- Remove `setTabProtected` from the `useBrowserPool()` destructure.
- Delete the old pool-capacity bail in `useBrowserWebView` if any (none — capacity lives in useBrowserPool, already removed in Task 5).
- Add near the end, after the visibility hook (passing existing members):

```ts
useBrowserSuspendScheduler({
  isVisible: options.isVisible,
  removeFromPool,
  isTabInPool,
  activeTabId: activeTab?.id ?? '',
});
```

- [ ] **Step 6: Typecheck + lint + run existing browser tests**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck; pnpm --dir frontend exec eslint src/app/features/browser/useBrowserWebView.ts src/app/features/browser/useBrowserSuspendScheduler.ts; pnpm --dir frontend exec vitest run src/app/features/browser/useBrowserPool.test.ts src/app/features/browser/__tests__/useBrowserSuspendScheduler.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserWebView.ts ai-digital-life/frontend/src/app/features/browser/useBrowserSuspendScheduler.ts ai-digital-life/frontend/src/app/features/browser/__tests__/useBrowserSuspendScheduler.test.ts
git commit -m "feat(browser): dual-trigger suspend scheduler (idle + memory pressure) in useBrowserWebView"
```

---

### Task 7: Frontend — Browser iframe mode: remove capacity cap, render by pool

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserIframeStack.tsx`

**Interfaces:**
- Consumes: `evictedTabIds` (already = tabs not in pool, computed in `BrowserPanel.tsx:393`).
- Produces: removes `IFRAME_POOL_SIZE = 5` and the `iframeLruOrderRef` LRU eviction; rendering follows pool membership so the scheduler's `removeFromPool` is what removes idle iframes.

- [ ] **Step 1: Remove the capacity constant**

Delete `const IFRAME_POOL_SIZE = 5;` (line 11).

- [ ] **Step 2: Remove the LRU eviction effect**

Delete the `useEffect` (lines ~69-86) that pushes `tabId` to `iframeLruOrderRef` and evicts when length > `IFRAME_POOL_SIZE`. Remove the now-unused `iframeLruOrderRef` ref declaration (keep `evictedTabIds` state and `inactiveIframeRef`).

- [ ] **Step 3: Verify no other reference to the removed symbol**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend run typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `$env:Path="C:\Program Files\nodejs;$env:Path"; pnpm --dir frontend exec eslint src/app/features/browser/BrowserIframeStack.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserIframeStack.tsx
git commit -m "refactor(browser): browser-mode iframe stack renders by pool membership (no fixed cap)"
```

---

### Task 8: Config preference `browserInactiveTabSuspendMs`

**Files:**
- Modify: `ai-digital-life/crates/types/src/types/config.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/app.rs`
- Modify: `ai-digital-life/frontend/src/kernel/types.ts` (after ts-rs regen) and any manual `AppPreferencePatch` / `ConfigSnapshot` copies
- Modify: `ai-digital-life/frontend/src/shared/preferencesMerger.ts`

**Interfaces:**
- Consumes: existing `Config`, `ConfigSnapshot`, `AppPreferencePatch`.
- Produces: `AppPreferencePatch.browser_inactive_tab_suspend_ms: Option<u64>`, `ConfigSnapshot.browser_inactive_tab_suspend_ms: u64` (default `3_600_000`), applied in `app_update_preferences`.

- [ ] **Step 1: Add to AppPreferencePatch**

In `config.rs` `AppPreferencePatch`, add:
```rust
    #[ts(optional)]
    pub browser_inactive_tab_suspend_ms: Option<u64>,
```

- [ ] **Step 2: Add to the Config (runtime) struct and merge + default**

Add to the struct that holds `theme_mode: ThemeMode` (~line 268 area is `ConfigSnapshot`; the runtime `Config` here is persisted by `app_update_preferences` — add a matching field and set it in `app_update_preferences`):

```rust
    pub browser_inactive_tab_suspend_ms: u64,
```
and a default:
```rust
fn default_browser_inactive_tab_suspend_ms() -> u64 { 3_600_000 }
```
Apply the default where `Config` is initialized (mirror how `max_concurrent_workspaces` default is handled), and in `app_update_preferences`:
```rust
        if let Some(v) = patch.browser_inactive_tab_suspend_ms {
            config.browser_inactive_tab_suspend_ms = v;
        }
```

- [ ] **Step 3: Add to ConfigSnapshot**

```rust
    #[serde(default = "default_browser_inactive_tab_suspend_ms")]
    pub browser_inactive_tab_suspend_ms: u64,
```

- [ ] **Step 4: Regenerate ts-rs types & sync frontend**

Run `cargo build` / `cargo check` (triggers ts-rs export) then verify `frontend/src/shared/ipc/generated/` and the barrel pick up `browserInactiveTabSuspendMs`. Update `frontend/src/kernel/types.ts` exports and `preferencesMerger.ts` `applyPreferencePatch` to pass through the new field if the generated patch already includes it (add pass-through if not).

- [ ] **Step 5: Compile check + typecheck**

Run: `cargo check -p ai-digital-life` and `pnpm --dir frontend run typecheck`.
Expected: both compile.

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/types/src/types/config.rs ai-digital-life/src-tauri/src/commands/app.rs ai-digital-life/frontend/src/kernel/types.ts ai-digital-life/frontend/src/shared/preferencesMerger.ts
git commit -m "feat(browser): add configurable browserInactiveTabSuspendMs preference (default 1h)"
```

---

### Task 9: Settings UI — BrowserPerformanceSettings + i18n

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/browser-settings/BrowserPerformanceSettings.tsx`
- Modify: the settings page container that renders `ModelSettings` / `WorkspaceSettings` sections to include the new section
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts`, `ai-digital-life/frontend/src/app/i18n/en-US/browser.ts`

**Interfaces:**
- Consumes: `useAppStore((s) => s.appInfo?.config?.browserInactiveTabSuspendMs)`, `updatePreferences` action.
- Produces: UI section; i18n keys `browserSettingsSuspendTitle`, `browserSettingsSuspendDesc`, `browserSettingsSuspendOff`, `browserSettingsSuspendMin` (with `{n}` param), `browserSettingsSuspendMinLabel` options.

- [ ] **Step 1: Add i18n keys**

`zh-CN/browser.ts`:
```ts
  browserSettingsSuspendTitle: '不活跃标签挂起时长',
  browserSettingsSuspendDesc: '不活跃标签闲置超过该时长后自动释放页面（重新打开时重新加载）。关闭则仅靠内存压力触发。',
  browserSettingsSuspendOff: '关闭',
  browserSettingsSuspendMin: '{n} 分钟',
```
`en-US/browser.ts`:
```ts
  browserSettingsSuspendTitle: 'Suspend inactive tabs after',
  browserSettingsSuspendDesc: 'Inactive tabs are released after this idle time (reloads on reopen). Off relies on memory pressure only.',
  browserSettingsSuspendOff: 'Off',
  browserSettingsSuspendMin: '{n} min',
```

- [ ] **Step 2: Create the component**

```tsx
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';

const MINUTE_MS = 60_000;
const OPTIONS: { label: 'off' | 'min'; value: number }[] = [
  { label: 'off', value: 0 },
  { label: 'min', value: 5 * MINUTE_MS },
  { label: 'min', value: 15 * MINUTE_MS },
  { label: 'min', value: 30 * MINUTE_MS },
  { label: 'min', value: 60 * MINUTE_MS },
  { label: 'min', value: 120 * MINUTE_MS },
];

export function BrowserPerformanceSettings() {
  const { t } = useTCopy();
  const current = useAppStore((s) => s.appInfo?.config?.browserInactiveTabSuspendMs ?? 0);

  const handleChange = (ms: number) => {
    useAppStore.getState().updatePreferences({ browserInactiveTabSuspendMs: ms });
  };

  return (
    <section>
      <h2>{t.browserSettingsSuspendTitle}</h2>
      <p>{t.browserSettingsSuspendDesc}</p>
      {/* render a <select> mapping OPTIONS to {t.browserSettingsSuspendOff} or {t.browserSettingsSuspendMin.replace('{n}', String(value/MINUTE_MS))} */}
    </section>
  );
}
```
(When adding the section, follow the `WorkspaceSettings` `SettingsHeader` + `adl-settings-row` layout and the actual `updatePreferences` action signature found in the codebase.)

- [ ] **Step 3: Register the section**

Add `<BrowserPerformanceSettings />` to the settings page render alongside `ModelSettings` / `WorkspaceSettings`.

- [ ] **Step 4: Typecheck + lint + run i18n check**

Run: `pnpm --dir frontend run typecheck; pnpm --dir frontend exec eslint src/app/features/browser-settings/BrowserPerformanceSettings.tsx; pnpm --dir frontend run check:i18n` (or the repo's i18n key-check script).
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-settings/BrowserPerformanceSettings.tsx ai-digital-life/frontend/src/app/i18n/zh-CN/browser.ts ai-digital-life/frontend/src/app/i18n/en-US/browser.ts
git commit -m "feat(browser): add inactive-tab suspend duration setting + i18n"
```

---

### Task 10: Full verification + cleanup

**Files:** none new (verification + doc sync).

- [ ] **Step 1: Rust full check**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace; cargo clippy --workspace --all-targets -- -D warnings; cargo test --workspace`
Expected: all green, clippy 0 warnings.

- [ ] **Step 2: Frontend full check**

Run: `pnpm --dir frontend run lint`; `pnpm --dir frontend run typecheck`; `pnpm --dir frontend run format`; `pnpm --dir frontend run test`
Expected: all green.

- [ ] **Step 3: Grep for orphaned symbols**

Run: search the repo for any remaining `setTabProtected`, `POOL_CAPACITY`, `evictLocalLRU`, `protectedRef`, `browser_set_tab_protected`, `IFRAME_POOL_SIZE`. Expect zero matches.

- [ ] **Step 4: Update docs**

In `docs/root-cause-resolution/2026-08/progress-20260824-browser-tab-design.md`, mark 事项4 as 已完成 (after user confirmation) and note the implementation commit(s). Update `docs/superpowers/specs/2026-08-24-browser-tab-suspend-dual-strategy-design.md` status to "已实施".

- [ ] **Step 5: Commit docs**

```bash
git add docs/root-cause-resolution/2026-08/progress-20260824-browser-tab-design.md docs/superpowers/specs/2026-08-24-browser-tab-suspend-dual-strategy-design.md
git commit -m "docs(browser): mark dual-trigger suspend implemented"
```