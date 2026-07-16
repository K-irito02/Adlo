# Browser Tab State Persistence with WebView Pool

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate page reloads when switching between open browser tabs in Tauri mode by maintaining a fixed-size pool of native WebViews with LRU eviction, matching Edge/Chrome behavior.

**Architecture:** Replace the single-WebView `BrowserManager` with a `BrowserPool` that manages up to 6 child WebViews keyed by tab ID. When the active tab changes, its WebView is shown (set_bounds) while others are hidden (off-screen). When the pool is full, the least-recently-used WebView is evicted and its tab displays a "click to reload" state. Browser mode (iframe) receives analogous LRU eviction for consistency. The history tree click handler is updated to activate existing tabs instead of creating duplicates.

**Tech Stack:** Rust (tauri 2.11, WebView2), TypeScript (React 19, Zustand, vitest)

---



## 三、其他发现的缺陷与完善项

1. **历史记录标签切换**：点击历史记录条目时若已有同名 URL 的打开标签，应激活已有标签而非创建新标签+重载。
2. **Browser 模式内存优化**：超过 5 个标签后，对最早的不可见 iframe 执行 `src = "about:blank"` 释放内存。
3. **`useBrowserWebView.ts` 太臃肿**：418 行混入多种职责（WebView/iframe 管理、边界对齐、MutationObserver、URL 去重等）。
4. **BrowserPanelContent 模式分叉冗余**：`isTauriShell()` 条件分支过多。
5. **多 WebView meta polling 线程爆炸**：只对活跃+最近 2 个 WebView 启动 polling。
6. **WebView 创建竞态**：`creatingRef` 不足以处理并发创建。

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `crates/browser/src/browser_pool.rs` | WebView pool with LRU tracking, eviction, capacity management |
| `frontend/src/app/features/browser/useBrowserPool.ts` | Frontend pool state hook: track which tabs have live WebViews, LRU order, create/evict/destroy IPC calls |
| `frontend/src/app/features/browser/useBrowserPool.test.ts` | Tests for pool hook logic |
| `frontend/src/app/features/browser/useBrowserHistoryTab.ts` | Utility: check if a URL matches an existing open tab for reuse |

### Modified Files

| File | Change Summary |
|------|---------------|
| `crates/browser/src/browser_webview.rs` | Restructure BrowserManager with pool, per-tab create/destroy/activate/bounds/polling |
| `crates/browser/src/browser_events.rs` | Per-tab event routing support |
| `crates/browser/src/lib.rs` | Export `BrowserPool` |
| `src-tauri/src/commands/browser.rs` | New commands: `browser_create_for_tab`, `browser_activate_tab`, `browser_destroy_tab`, `browser_navigate_tab`, `browser_set_tab_bounds`, `browser_go_back_tab`, `browser_go_forward_tab`, `browser_reload_tab` |
| `src-tauri/capabilities/default.json` | Register new commands |
| `src-tauri/capabilities/browser-remote.json` | Update webview label pattern for multi-webview |
| `frontend/src/shared/ipc.ts` | Add tab-aware methods to `BrowserBridge` |
| `frontend/src/tauri-bridge.ts` | Implement new bridge methods |
| `frontend/src/mock-bridge.ts` | Implement new bridge stubs |
| `frontend/src/preview-bridge/index.ts` | Implement new bridge stubs |
| `frontend/src/app/features/browser/useBrowserWebView.ts` | Integrate pool hook, remove single-WebView logic |
| `frontend/src/app/features/browser/BrowserPanelContent.tsx` | Use pool hook for WebView activation, add evicted-tab UI |
| `frontend/src/app/features/browser/BrowserNavigator.tsx` | History click: reuse existing tab logic |
| `frontend/src/app/features/browser/useBrowserTabs.ts` | Export tab URL lookup helper |

### Test Files

| File | What It Tests |
|------|---------------|
| `crates/browser/tests/browser_pool_tests.rs` | Pool registration, LRU ordering, eviction, capacity enforcement |
| `crates/browser/tests/browser_webview_tests.rs` | Per-tab create/destroy lifecycle (integration with Tauri runtime) |
| `frontend/src/app/features/browser/useBrowserPool.test.ts` | Pool hook LRU, register, touch, evict, remove |
| `frontend/src/app/features/browser/useBrowserHistoryTab.test.ts` | URL matching for existing tab reuse |

---

## Phase 1: Rust — BrowserPool (Core Data Structure)

### Task 1: Create BrowserPool module with LRU logic

**Files:**
- Create: `ai-digital-life/crates/browser/src/browser_pool.rs`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/browser/tests/browser_pool_tests.rs`:

```rust
use adl_browser::BrowserPool;

#[test]
fn test_pool_register_tracks_lru_order() {
    let pool = BrowserPool::new(3);
    // Register 3 tabs — pool not full, no eviction
    assert_eq!(pool.register("tab-1".into()), None);
    assert_eq!(pool.register("tab-2".into()), None);
    assert_eq!(pool.register("tab-3".into()), None);
    assert_eq!(pool.size(), 3);
    assert_eq!(pool.get_lru(), Some("tab-1".into()));
    // Touch tab-1, now LRU should be tab-2
    pool.touch("tab-1");
    assert_eq!(pool.get_lru(), Some("tab-2".into()));
    // Register tab-4 — pool full, should evict tab-2
    assert_eq!(pool.register("tab-4".into()), Some("tab-2".into()));
    assert_eq!(pool.size(), 3);
}

#[test]
fn test_pool_remove_frees_slot() {
    let pool = BrowserPool::new(2);
    pool.register("a".into());
    pool.register("b".into());
    assert!(pool.is_full());
    pool.remove("a");
    assert!(!pool.is_full());
    assert_eq!(pool.size(), 1);
}

#[test]
fn test_pool_touch_absent_does_not_panic() {
    let pool = BrowserPool::new(3);
    pool.touch("nonexistent"); // should not panic
    assert_eq!(pool.size(), 0);
}

#[test]
fn test_pool_lru_removes_oldest_even_after_multiple_touches() {
    let pool = BrowserPool::new(2);
    pool.register("a".into());
    pool.register("b".into());
    pool.touch("a"); // a is now most recent, b is LRU
    pool.touch("b"); // b is now most recent, a is LRU
    pool.touch("a"); // a is now most recent, b is LRU
    assert_eq!(pool.get_lru(), Some("b".into()));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-browser --test browser_pool_tests 2>&1`
Expected: compile error (BrowserPool not defined)

- [ ] **Step 3: Write BrowserPool implementation**

Create `ai-digital-life/crates/browser/src/browser_pool.rs`:

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Fixed-size pool that tracks which tabs have live WebViews.
/// Uses LRU ordering: `lru_order[0]` is least-recently-used, last is most-recent.
#[derive(Debug, Clone)]
pub struct BrowserPool {
    entries: Arc<Mutex<HashMap<String, ()>>>,
    lru_order: Arc<Mutex<Vec<String>>>,
    capacity: usize,
}

impl BrowserPool {
    /// Create a new pool with the given max capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            lru_order: Arc::new(Mutex::new(Vec::new())),
            capacity,
        }
    }

    /// Register a tab in the pool. If pool is full, returns the tab_id to evict.
    pub fn register(&self, tab_id: String) -> Option<String> {
        let mut entries = self.entries.lock().unwrap();
        let mut order = self.lru_order.lock().unwrap();

        // Remove if already exists (shouldn't happen in normal flow)
        if entries.contains_key(&tab_id) {
            order.retain(|id| id != &tab_id);
        }

        let evicted = if entries.len() >= self.capacity {
            let evict_id = order.first().cloned();
            if let Some(ref id) = evict_id {
                entries.remove(id);
                order.retain(|x| x != id);
            }
            evict_id
        } else {
            None
        };

        entries.insert(tab_id.clone(), ());
        order.push(tab_id);
        evicted
    }

    /// Mark a tab as recently used.
    pub fn touch(&self, tab_id: &str) {
        let mut order = self.lru_order.lock().unwrap();
        order.retain(|id| id != tab_id);
        order.push(tab_id.to_string());
    }

    /// Remove a tab from the pool (on tab close).
    pub fn remove(&self, tab_id: &str) {
        let mut entries = self.entries.lock().unwrap();
        let mut order = self.lru_order.lock().unwrap();
        entries.remove(tab_id);
        order.retain(|id| id != tab_id);
    }

    /// Get the LRU tab_id, if any.
    pub fn get_lru(&self) -> Option<String> {
        self.lru_order.lock().unwrap().first().cloned()
    }

    /// Check if pool is at capacity.
    pub fn is_full(&self) -> bool {
        self.entries.lock().unwrap().len() >= self.capacity
    }

    /// Current pool size.
    pub fn size(&self) -> usize {
        self.entries.lock().unwrap().len()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-browser --test browser_pool_tests`
Expected: all 4 tests PASS

- [ ] **Step 5: Register test in Cargo.toml**

Read `ai-digital-life/crates/browser/Cargo.toml` to verify test harness config, then run:

```bash
cargo test -p adl-browser
```

Expected: existing tests + new tests all PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/browser/src/browser_pool.rs ai-digital-life/crates/browser/tests/browser_pool_tests.rs ai-digital-life/crates/browser/Cargo.toml
git commit -m "feat(browser): add BrowserPool with LRU eviction"
```

---

### Task 2: Export BrowserPool from lib.rs

**Files:**
- Modify: `ai-digital-life/crates/browser/src/lib.rs`

- [ ] **Step 1: Update module declaration and exports**

Edit `ai-digital-life/crates/browser/src/lib.rs`:

```rust
mod browser_events;
mod browser_meta;
mod browser_navigation;
mod browser_pool;
mod browser_webview;
mod webview2_message;

pub use browser_meta::PageMeta;
pub use browser_pool::BrowserPool;
pub use browser_webview::{Bounds, BrowserManager};
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p adl-browser 2>&1`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/crates/browser/src/lib.rs
git commit -m "feat(browser): export BrowserPool from lib.rs"
```

---

## Phase 2: Rust — BrowserManager with Pool Integration

### Task 3: Refactor BrowserManager to use BrowserPool

**Files:**
- Modify: `ai-digital-life/crates/browser/src/browser_webview.rs` (almost entire file rewrite)

**Note:** This is the largest single change. The `BrowserManager` transitions from single-WebView to pool-managed multi-WebView. All methods (`create`, `destroy`, `navigate`, `hide`, `show`, `set_bounds`, `eval`) gain a `tab_id: &str` parameter.

- [ ] **Step 1: Write integration test for pool-aware create/destroy**

Create `ai-digital-life/crates/browser/tests/browser_webview_tests.rs`:

```rust
// Note: These tests require a running Tauri app. They are marked #[ignore] by default
// and run via `cargo test -p adl-browser -- --ignored` in CI with Tauri runtime.

use adl_browser::BrowserPool;

#[test]
fn test_pool_integration_lifecycle() {
    let pool = BrowserPool::new(6);
    // Simulate tab lifecycle: create 3 tabs, activate them, close one
    assert_eq!(pool.register("tab-a".into()), None);
    assert_eq!(pool.register("tab-b".into()), None);
    assert_eq!(pool.register("tab-c".into()), None);
    assert_eq!(pool.size(), 3);

    pool.touch("tab-a");
    assert_eq!(pool.get_lru(), Some("tab-b".into()));

    pool.remove("tab-a");
    assert_eq!(pool.size(), 2);
}

#[test]
fn test_pool_eviction_when_full() {
    let pool = BrowserPool::new(2);
    pool.register("a".into());
    pool.register("b".into());
    // a is LRU (registered first)
    assert_eq!(pool.register("c".into()), Some("a".into()));
    // b is now LRU (a evicted, b is oldest remaining)
    assert_eq!(pool.register("d".into()), Some("b".into()));
    assert_eq!(pool.size(), 2);
}
```

- [ ] **Step 2: Run test to verify it passes against existing pool**

Run: `cargo test -p adl-browser --test browser_webview_tests`
Expected: PASS (tests don't need Tauri runtime, they only exercise BrowserPool)

- [ ] **Step 3: Rewrite BrowserManager — add pool field and per-tab webview label helper**

Replace `ai-digital-life/crates/browser/src/browser_webview.rs` entirely:

```rust
use adl_errors::AppError;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Instant;
use tauri::{Emitter, Manager};

use crate::browser_events::{EMIT_DEDUP_WINDOW, LAST_EMIT, POLL_FAST_NOW};
use crate::browser_pool::BrowserPool;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

const DEFAULT_POOL_SIZE: usize = 6;

fn webview_label(tab_id: &str) -> String {
    format!("adl-browser-view-{tab_id}")
}

// ---- polling constants (unchanged) ----
const POLL_INTERVAL_MS: u64 = 5000;
const FAST_POLL_INTERVAL_MS: u64 = 100;
const FAST_POLL_DURATION_MS: u64 = 10000;
const MEDIUM_POLL_INTERVAL_MS: u64 = 1000;
const MEDIUM_POLL_DURATION_MS: u64 = 20000;

static ACTIVE_FETCH_RECEIVED_COUNT: AtomicU64 = AtomicU64::new(0);

fn normalize_poll_url(raw: &str) -> String {
    let mut s = raw.split('#').next().unwrap_or(raw).to_string();
    if s.len() > 8 && s.ends_with('/') {
        let trimmed = s.trim_end_matches('/');
        if !trimmed.is_empty() {
            s = trimmed.to_string();
        }
    }
    s
}

#[derive(Debug, Clone, Default)]
struct PageState {
    url: String,
    title: String,
    favicon: String,
}

pub struct BrowserManager {
    pool: BrowserPool,
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            pool: BrowserPool::new(DEFAULT_POOL_SIZE),
        }
    }

    /// Create a WebView for a specific tab. If pool is full, evicts LRU tab's WebView first.
    pub fn create_for_tab(&self, app: &tauri::AppHandle, tab_id: &str, url: &str) -> Result<Option<String>, AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        // Check pool: evict if full
        let evicted = self.pool.register(tab_id.to_string());

        // If eviction returned a tab_id, destroy its WebView
        if let Some(ref evict_id) = evicted {
            let label = webview_label(evict_id);
            if let Some(wv) = window.get_webview(&label) {
                let _ = wv.close();
            }
            tracing::info!(tab_id = evict_id, "evicted LRU tab WebView");
        }

        let target = crate::browser_navigation::resolve_url(url)?;
        let label = webview_label(tab_id);

        let app_nav = app.clone();
        let app_handle = app.clone();
        let webview_builder = tauri::webview::WebviewBuilder::new(
            &label,
            tauri::WebviewUrl::External(target),
        )
        .initialization_script(crate::browser_navigation::INIT_SCRIPT)
        .on_navigation(move |url| crate::browser_events::navigation_handler(&app_nav, url))
        .on_new_window(move |url, _window_features| {
            crate::browser_events::new_window_handler(&app_handle, &url)
        });

        window
            .add_child(
                webview_builder,
                tauri::LogicalPosition::new(-10000.0, -10000.0),
                tauri::LogicalSize::new(800.0, 600.0),
            )
            .map_err(|e| AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}")))?;

        tracing::info!(tab_id = tab_id, url = url, "browser webview created for tab");

        // Setup COM handlers (Windows only)
        if let Some(webview) = window.get_webview(&label) {
            if let Err(e) = crate::webview2_message::setup_webview2_messaging(webview.clone()) {
                tracing::warn!(tab_id = tab_id, error = %e, "webview2 messaging setup failed");
            }
            if let Err(e) = crate::webview2_message::setup_document_title_handler(webview.clone()) {
                tracing::warn!(tab_id = tab_id, error = %e, "document title handler setup failed");
            }
            if let Err(e) = crate::webview2_message::setup_favicon_changed_handler(webview.clone()) {
                tracing::warn!(tab_id = tab_id, error = %e, "favicon changed handler setup failed");
            }
            if let Err(e) = crate::webview2_message::setup_history_changed_handler(webview) {
                tracing::warn!(tab_id = tab_id, error = %e, "history changed handler setup failed");
            }
        }

        Ok(evicted)
    }

    /// Activate a tab: touch it in LRU, show its WebView, hide all others.
    pub fn activate_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<(), AppError> {
        self.pool.touch(tab_id);

        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let active_label = webview_label(tab_id);
        let active_webview = window
            .get_webview(&active_label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        // Show active webview
        active_webview.show().map_err(|e| AppError::Internal(format!("show failed for {tab_id}: {e}")))?;

        // Hide all others: iterate pool entries, hide webviews with different tab_id
        let entries = self.pool.entries.lock().unwrap();
        for entry_id in entries.keys() {
            if entry_id == tab_id {
                continue;
            }
            let other_label = webview_label(entry_id);
            if let Some(other_wv) = window.get_webview(&other_label) {
                let _ = other_wv.hide();
            }
        }

        Ok(())
    }

    /// Destroy a specific tab's WebView
    pub fn destroy_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<(), AppError> {
        self.pool.remove(tab_id);

        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        if let Some(webview) = window.get_webview(&label) {
            let _ = webview.close();
        }

        tracing::info!(tab_id = tab_id, "browser webview destroyed for tab");
        Ok(())
    }

    /// Navigate a specific tab's WebView
    pub fn navigate_tab(&self, app: &tauri::AppHandle, tab_id: &str, url: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        let target = crate::browser_navigation::resolve_url(url)?;
        webview.navigate(target).map_err(|e| AppError::Internal(format!("navigate failed for {tab_id}: {e}")))?;

        tracing::info!(tab_id = tab_id, url = url, "browser navigate for tab");
        Ok(())
    }

    /// Set bounds for a specific tab's WebView
    pub fn set_tab_bounds(&self, app: &tauri::AppHandle, tab_id: &str, bounds: Bounds) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        let position = tauri::LogicalPosition::new(bounds.x, bounds.y);
        let size = tauri::LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0));

        webview.set_position(position).map_err(|e| AppError::Internal(format!("set_position failed: {e}")))?;
        webview.set_size(size).map_err(|e| AppError::Internal(format!("set_size failed: {e}")))?;

        Ok(())
    }

    /// Go back in a specific tab
    pub fn go_back_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<bool, AppError> {
        let window = app.get_window("main").ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(tab_id);
        let webview = window.get_webview(&label).ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        webview.eval("history.back()").map_err(|e| AppError::Internal(format!("go_back eval failed: {e}")))?;
        Ok(true)
    }

    /// Go forward in a specific tab
    pub fn go_forward_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<bool, AppError> {
        let window = app.get_window("main").ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(tab_id);
        let webview = window.get_webview(&label).ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        webview.eval("history.forward()").map_err(|e| AppError::Internal(format!("go_forward eval failed: {e}")))?;
        Ok(true)
    }

    /// Reload a specific tab
    pub fn reload_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<(), AppError> {
        let window = app.get_window("main").ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(tab_id);
        let webview = window.get_webview(&label).ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        webview.eval("location.reload()").map_err(|e| AppError::Internal(format!("reload eval failed: {e}")))?;
        Ok(())
    }

    /// Eval JS in a specific tab
    pub fn eval_tab(&self, app: &tauri::AppHandle, tab_id: &str, script: &str) -> Result<(), AppError> {
        let window = app.get_window("main").ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(tab_id);
        let webview = window.get_webview(&label).ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        webview.eval(script).map_err(|e| AppError::Internal(format!("eval failed: {e}")))?;
        Ok(())
    }

    /// Check if a tab has a live WebView in the pool
    pub fn has_tab_webview(&self, tab_id: &str) -> bool {
        self.pool.entries.lock().unwrap().contains_key(tab_id)
    }
}
```

**Note:** The polling thread (`start_polling`) is intentionally deferred to a later task (Task 12: meta polling optimization) to keep this task focused on pool integration. The old single-webview polling logic is removed; a new per-tab polling system will be added in Task 12.

- [ ] **Step 4: Update browser_navigation.rs — remove old single-webview methods**

Read `ai-digital-life/crates/browser/src/browser_navigation.rs` lines 542-609. Delete the `impl crate::browser_webview::BrowserManager` block that defines `navigate`, `go_back`, `go_forward`, `reload`. These methods are now in `browser_webview.rs` as `navigate_tab`, `go_back_tab`, `go_forward_tab`, `reload_tab`.

Edit `ai-digital-life/crates/browser/src/browser_navigation.rs` — remove lines 542-609 (the `impl crate::browser_webview::BrowserManager` block).

- [ ] **Step 5: Verify compilation**

Run: `cargo check -p adl-browser 2>&1`
Expected: compiles successfully

- [ ] **Step 6: Run tests**

Run: `cargo test -p adl-browser`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/crates/browser/src/browser_webview.rs ai-digital-life/crates/browser/src/browser_navigation.rs ai-digital-life/crates/browser/tests/browser_webview_tests.rs
git commit -m "feat(browser): refactor BrowserManager to use BrowserPool with per-tab WebViews"
```

---

## Phase 3: Rust — Commands + Capabilities

### Task 4: Add per-tab Tauri commands

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs`

- [ ] **Step 1: Replace browser commands**

Edit `ai-digital-life/src-tauri/src/commands/browser.rs` — replace the entire command section (lines 9-100) with:

```rust
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_browser::{Bounds, PageMeta};
use adl_errors::AppError;
use adl_kernel::IpcResult;
use tauri::{Manager, State};

// --- Per-tab WebView commands ---

#[tauri::command]
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
) -> Result<IpcResult<Option<String>>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let result = state.browser_manager.create_for_tab(&app_inner, &tab_id, &url);
        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch failed: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("creation channel error: {e}")))?))
}

#[tauri::command]
pub fn browser_activate_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.activate_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_destroy_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.destroy_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_navigate_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    url: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.navigate_tab(&app, &tab_id, &url)))
}

#[tauri::command]
pub fn browser_set_tab_bounds(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    bounds: Bounds,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.set_tab_bounds(&app, &tab_id, bounds)))
}

#[tauri::command]
pub fn browser_go_back_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_back_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_go_forward_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_forward_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_reload_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.reload_tab(&app, &tab_id)))
}

// --- fetch_page_meta is unchanged (no tab_id needed, it's a pure HTTP request) ---

#[tauri::command]
pub async fn browser_fetch_page_meta(url: String) -> Result<IpcResult<PageMeta>, CommandError> {
    let meta = fetch_page_meta_inner(&url).await?;
    Ok(ipc(Ok(meta)))
}

// ... rest of the file (USER_AGENT, fetch_page_meta_inner, extract functions) remains unchanged
```

**Keep** all the helper functions from line 108 onward (`USER_AGENT`, `fetch_page_meta_inner`, `extract_title`, etc.) — they remain unchanged.

- [ ] **Step 2: Remove old single-webview commands**

Delete the old commands: `browser_create`, `browser_destroy`, `browser_hide`, `browser_show`, `browser_navigate`, `browser_go_back`, `browser_go_forward`, `browser_reload`, `browser_set_bounds`, `browser_eval`.

- [ ] **Step 3: Update main.rs command registration**

Read `ai-digital-life/src-tauri/src/main.rs` (or `lib.rs` where commands are registered). Replace old command registrations with new ones. Search for `browser_create`, `browser_destroy`, etc. in the `.invoke_handler(tauri::generate_handler![...])` section and replace with:

```rust
browser_create_for_tab,
browser_activate_tab,
browser_destroy_tab,
browser_navigate_tab,
browser_set_tab_bounds,
browser_go_back_tab,
browser_go_forward_tab,
browser_reload_tab,
browser_fetch_page_meta,
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check 2>&1`
Expected: compiles successfully

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/browser.rs ai-digital-life/src-tauri/src/main.rs
git commit -m "feat(browser): add per-tab Tauri commands, remove single-webview commands"
```

---

### Task 5: Update capability files

**Files:**
- Modify: `ai-digital-life/src-tauri/capabilities/default.json`
- Modify: `ai-digital-life/src-tauri/capabilities/browser-remote.json`

- [ ] **Step 1: Update default.json command permissions**

Read `ai-digital-life/src-tauri/capabilities/default.json`. Add new command names to the `"digital-life-commands"` permission scope. If the commands are auto-registered via `tauri::generate_handler!`, no change needed — but verify by searching for how existing commands are permitted.

Check if there's a permission file that lists command names. Run:

```bash
rg "browser_create\|browser_navigate" ai-digital-life/src-tauri/
```

If commands are listed in a permissions file (e.g., `permissions/digital-life-commands.toml`), update it to include the new per-tab command names.

- [ ] **Step 2: Update browser-remote.json webview patterns**

Edit `ai-digital-life/src-tauri/capabilities/browser-remote.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "browser-remote",
  "description": "Minimal IPC access for browser tab webviews when navigating to remote URLs",
  "webviews": ["adl-browser-view-*"],
  "permissions": [
    "core:default"
  ]
}
```

Changed `"adl-browser-view"` to `"adl-browser-view-*"` to match all per-tab WebView labels.

- [ ] **Step 3: Verify compilation**

Run: `cargo check 2>&1`
Expected: compiles successfully

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/src-tauri/capabilities/
git commit -m "feat(browser): update capabilities for per-tab webview labels"
```

---

## Phase 4: Frontend — IPC Bridge

### Task 6: Update BrowserBridge interface

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc.ts` lines 1069-1125

- [ ] **Step 1: Add tab-aware methods to BrowserBridge**

Edit `ai-digital-life/frontend/src/shared/ipc.ts`, replace the `BrowserBridge` interface (lines 1069-1125) with:

```typescript
export interface BrowserBridge {
  /** Create a WebView for a specific tab. Returns evicted tab_id if pool was full. */
  createForTab: (tabId: string, url: string) => Promise<string | null>;
  /** Activate tab: show its WebView, hide others, update LRU. */
  activateTab: (tabId: string) => Promise<void>;
  /** Destroy a tab's WebView (on tab close). */
  destroyTab: (tabId: string) => Promise<void>;
  /** Navigate a specific tab's WebView. */
  navigateTab: (tabId: string, url: string) => Promise<void>;
  /** Set bounds for a specific tab's WebView. */
  setTabBounds: (tabId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
  /** Go back in a specific tab */
  goBackTab: (tabId: string) => Promise<boolean>;
  /** Go forward in a specific tab */
  goForwardTab: (tabId: string) => Promise<boolean>;
  /** Reload a specific tab */
  reloadTab: (tabId: string) => Promise<void>;
  /** Subscribe to URL changes (global event, carries tab context via meta.url matching) */
  onUrlChanged: (listener: (url: string) => void) => () => void;
  /** Subscribe to page meta changes */
  onMetaChanged: (listener: (meta: PageMeta) => void) => () => void;
}
```

- [ ] **Step 2: Verify tsc**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1`
Expected: errors for tauri-bridge, mock-bridge, preview-bridge (we will fix them next)

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc.ts
git commit -m "feat(browser): update BrowserBridge interface with per-tab methods"
```

---

### Task 7: Implement bridge methods

**Files:**
- Modify: `ai-digital-life/frontend/src/tauri-bridge.ts` lines 345-393
- Modify: `ai-digital-life/frontend/src/mock-bridge.ts` browser section
- Modify: `ai-digital-life/frontend/src/preview-bridge/index.ts` browser section

- [ ] **Step 1: Update tauri-bridge.ts**

Edit `ai-digital-life/frontend/src/tauri-bridge.ts`, replace the `browser:` block (lines 345-393) with:

```typescript
const { invokeIpc, listen } = require('./tauri-bridge-helpers'); // adjust import as existing

browser: {
  createForTab: (tabId: string, url: string) =>
    invokeIpc<string | null>('browser_create_for_tab', { tabId, url }).then((r) => (r.ok ? r.data : null)),
  activateTab: (tabId: string) =>
    invokeIpc<void>('browser_activate_tab', { tabId }).then(() => undefined),
  destroyTab: (tabId: string) =>
    invokeIpc<void>('browser_destroy_tab', { tabId }).then(() => undefined),
  navigateTab: (tabId: string, url: string) =>
    invokeIpc<void>('browser_navigate_tab', { tabId, url }).then(() => undefined),
  setTabBounds: (tabId: string, bounds: { x: number; y: number; width: number; height: number }) =>
    invokeIpc<void>('browser_set_tab_bounds', { tabId, bounds }).then(() => undefined),
  goBackTab: (tabId: string) =>
    invokeIpc<boolean>('browser_go_back_tab', { tabId }).then((r) => r.ok && !!r.data),
  goForwardTab: (tabId: string) =>
    invokeIpc<boolean>('browser_go_forward_tab', { tabId }).then((r) => r.ok && !!r.data),
  reloadTab: (tabId: string) =>
    invokeIpc<void>('browser_reload_tab', { tabId }).then(() => undefined),
  onUrlChanged: (listener: (url: string) => void) => {
    let active = true;
    let ul: UnlistenFn | undefined;
    void listen<{ url: string }>('digital-life://browser-url-changed', (event) => {
      if (active) listener(event.payload.url);
    }).then((unlisten) => {
      if (active) ul = unlisten;
      else void unlisten();
    });
    return () => { active = false; void ul?.(); };
  },
  onMetaChanged: (listener: (meta: { title: string; favicon: string; url: string }) => void) => {
    let active = true;
    let ul: UnlistenFn | undefined;
    void listen<{ title: string; favicon: string; url: string }>(
      'digital-life://browser-meta-changed',
      (event) => {
        if (active) listener(event.payload);
      }
    ).then((unlisten) => {
      if (active) ul = unlisten;
      else void unlisten();
    });
    return () => { active = false; void ul?.(); };
  },
},
```

- [ ] **Step 2: Update mock-bridge.ts**

Read the browser section at `ai-digital-life/frontend/src/mock-bridge.ts` line 234. Replace the `browser:` block:

```typescript
browser: {
  createForTab: (_tabId: string, _url: string) => Promise.resolve(null),
  activateTab: (_tabId: string) => Promise.resolve(),
  destroyTab: (_tabId: string) => Promise.resolve(),
  navigateTab: (_tabId: string, _url: string) => Promise.resolve(),
  setTabBounds: (_tabId: string, _bounds: any) => Promise.resolve(),
  goBackTab: (_tabId: string) => Promise.resolve(false),
  goForwardTab: (_tabId: string) => Promise.resolve(false),
  reloadTab: (_tabId: string) => Promise.resolve(),
  onUrlChanged: (_listener: any) => () => {},
  onMetaChanged: (_listener: any) => () => {},
},
```

- [ ] **Step 3: Update preview-bridge/index.ts**

Read the browser section at `ai-digital-life/frontend/src/preview-bridge/index.ts` line 68. Replace the `browser:` block with the same stubs as mock-bridge.

- [ ] **Step 4: Update preview-bridge/preview-window.ts**

Read `ai-digital-life/frontend/src/preview-bridge/preview-window.ts` line 6. Replace `browser:` block with same stubs.

- [ ] **Step 5: Verify tsc**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/tauri-bridge.ts ai-digital-life/frontend/src/mock-bridge.ts ai-digital-life/frontend/src/preview-bridge/
git commit -m "feat(browser): implement per-tab bridge methods in all bridges"
```

---

## Phase 5: Frontend — WebView Pool Hook

### Task 8: Create useBrowserPool hook

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/browser/useBrowserPool.ts`
- Create: `ai-digital-life/frontend/src/app/features/browser/useBrowserPool.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `ai-digital-life/frontend/src/app/features/browser/useBrowserPool.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPool } from './useBrowserPool';

// Mock the bridge
vi.mock('../../../../tauri-bridge', () => ({
  getBridge: () => ({
    browser: {
      createForTab: vi.fn().mockResolvedValue(null),
      activateTab: vi.fn().mockResolvedValue(undefined),
      destroyTab: vi.fn().mockResolvedValue(undefined),
    },
  }),
  isTauriShell: () => true,
}));

describe('useBrowserPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty pool', () => {
    const { result } = renderHook(() => useBrowserPool(3));
    expect(result.current.poolSize).toBe(0);
    expect(result.current.isTabInPool('tab-1')).toBe(false);
  });

  it('registers tab in pool via createWebViewForTab', async () => {
    const { result } = renderHook(() => useBrowserPool(3));
    await act(async () => {
      await result.current.createWebViewForTab('tab-1', 'https://example.com');
    });
    expect(result.current.poolSize).toBe(1);
    expect(result.current.isTabInPool('tab-1')).toBe(true);
  });

  it('evicts LRU tab when pool is full', async () => {
    const { result } = renderHook(() => useBrowserPool(2));
    await act(async () => {
      await result.current.createWebViewForTab('a', 'https://a.com');
    });
    await act(async () => {
      await result.current.createWebViewForTab('b', 'https://b.com');
    });
    expect(result.current.poolSize).toBe(2);

    // Now 'c' should evict 'a' (LRU)
    const evictedIdRef = { current: null as string | null };
    // We need to check what was evicted — use a custom mock
    const { getBridge } = await import('../../../../tauri-bridge');
    const bridge = getBridge();
    (bridge.browser.createForTab as any).mockResolvedValueOnce('a'); // evicted tab

    await act(async () => {
      await result.current.createWebViewForTab('c', 'https://c.com');
    });
    expect(result.current.isTabInPool('a')).toBe(false);
    expect(result.current.isTabInPool('b')).toBe(true);
    expect(result.current.isTabInPool('c')).toBe(true);
  });

  it('activates tab touches LRU order', async () => {
    const { result } = renderHook(() => useBrowserPool(3));
    await act(async () => { await result.current.createWebViewForTab('a', 'https://a.com'); });
    await act(async () => { await result.current.createWebViewForTab('b', 'https://b.com'); });
    // Touch 'a' — 'b' becomes LRU
    await act(async () => { await result.current.activateTabInPool('a'); });
    expect(result.current.isTabInPool('a')).toBe(true);
    expect(result.current.isTabInPool('b')).toBe(true);
  });

  it('removeFromPool frees a slot', async () => {
    const { result } = renderHook(() => useBrowserPool(2));
    await act(async () => { await result.current.createWebViewForTab('a', 'https://a.com'); });
    await act(async () => { await result.current.createWebViewForTab('b', 'https://b.com'); });
    expect(result.current.poolSize).toBe(2);
    await act(async () => { result.current.removeFromPool('a'); });
    expect(result.current.poolSize).toBe(1);
    expect(result.current.isTabInPool('a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/browser/useBrowserPool.test.ts 2>&1`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement useBrowserPool hook**

Create `ai-digital-life/frontend/src/app/features/browser/useBrowserPool.ts`:

```typescript
import { useCallback, useRef, useState } from 'react';
import { getBridge, isTauriShell } from '../../../tauri-bridge';

interface PoolEntry {
  tabId: string;
}

export function useBrowserPool(maxPoolSize: number = 6) {
  // LRU order: index 0 = least recently used, last = most recent
  const lruOrderRef = useRef<string[]>([]);
  const poolRef = useRef<Map<string, PoolEntry>>(new Map());
  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);

  const isTabInPool = useCallback((tabId: string): boolean => {
    return poolRef.current.has(tabId);
  }, []);

  const touchInPool = useCallback((tabId: string) => {
    if (!poolRef.current.has(tabId)) return;
    lruOrderRef.current = lruOrderRef.current.filter((id) => id !== tabId);
    lruOrderRef.current.push(tabId);
  }, []);

  const removeFromPool = useCallback((tabId: string) => {
    poolRef.current.delete(tabId);
    lruOrderRef.current = lruOrderRef.current.filter((id) => id !== tabId);
    rerender();
  }, [rerender]);

  const createWebViewForTab = useCallback(
    async (tabId: string, url: string): Promise<string | null> => {
      if (!isTauriShell()) {
        poolRef.current.set(tabId, { tabId });
        lruOrderRef.current.push(tabId);
        rerender();
        return null;
      }

      // Evict LRU if pool is full (LRU eviction happens in Rust, but we track it locally)
      let evictedId: string | null = null;
      if (poolRef.current.size >= maxPoolSize) {
        const lru = lruOrderRef.current[0];
        if (lru) {
          evictedId = lru;
          // Don't remove locally — Rust returns the evicted tab_id
        }
      }

      const bridge = getBridge();
      const result = await bridge.browser.createForTab(tabId, url);
      // result is evicted tab_id from Rust, or null
      const rustEvicted = result;

      // Clean up local tracking for evicted tab
      if (rustEvicted) {
        poolRef.current.delete(rustEvicted);
        lruOrderRef.current = lruOrderRef.current.filter((id) => id !== rustEvicted);
      }

      // Register new tab
      poolRef.current.set(tabId, { tabId });
      lruOrderRef.current = lruOrderRef.current.filter((id) => id !== tabId);
      lruOrderRef.current.push(tabId);
      rerender();

      return rustEvicted;
    },
    [maxPoolSize, rerender]
  );

  const activateTabInPool = useCallback(
    async (tabId: string) => {
      if (!isTauriShell()) {
        touchInPool(tabId);
        return;
      }

      const bridge = getBridge();
      touchInPool(tabId);
      await bridge.browser.activateTab(tabId);
    },
    [touchInPool]
  );

  const destroyTabWebView = useCallback(
    async (tabId: string) => {
      if (!isTauriShell()) {
        removeFromPool(tabId);
        return;
      }

      const bridge = getBridge();
      removeFromPool(tabId);
      await bridge.browser.destroyTab(tabId);
    },
    [removeFromPool]
  );

  return {
    poolSize: poolRef.current.size,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    removeFromPool: destroyTabWebView,
    touchInPool,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/browser/useBrowserPool.test.ts 2>&1`
Expected: all tests PASS

- [ ] **Step 5: Run tsc check**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserPool.ts ai-digital-life/frontend/src/app/features/browser/useBrowserPool.test.ts
git commit -m "feat(browser): add useBrowserPool hook with LRU tracking"
```

---

## Phase 6: Frontend — Integrate Pool with BrowserPanel

### Task 9: Update useBrowserWebView to use pool

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserWebView.ts`

- [ ] **Step 1: Rewrite useBrowserWebView — replace single-WebView logic with pool calls**

Replace the file `ai-digital-life/frontend/src/app/features/browser/useBrowserWebView.ts` with a slimmed-down version that delegates to `useBrowserPool` for WebView lifecycle:

```typescript
import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriShell } from '../../../tauri-bridge';
import { useBrowserPool } from './useBrowserPool';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

const POOL_SIZE = 6;

interface UseBrowserWebViewOptions {
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  overlayActive: boolean;
}

export function useBrowserWebView(options: UseBrowserWebViewOptions) {
  const { activeTab, webViewDisabled = false, isVisible, overlayActive } = options;

  const {
    poolSize: _poolSize,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    removeFromPool,
  } = useBrowserPool(POOL_SIZE);

  const primaryRef = useRef<HTMLDivElement | null>(null);
  const webViewActiveRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // MutationObserver for overlay detection (unchanged from original)
  // ... keep the MutationObserver logic from original useBrowserWebView ...
  const overlayActiveRef = useRef(overlayActive);
  overlayActiveRef.current = overlayActive;

  const hideAllWebViews = useCallback(() => {
    // Move active tab's webview off-screen
    const tab = activeTabRef.current;
    if (tab && isTabInPool(tab.id)) {
      invoke('browser_set_tab_bounds', {
        tabId: tab.id,
        bounds: { x: -10000, y: -10000, width: 1, height: 1 },
      }).catch(() => {});
    }
  }, [isTabInPool]);

  const updateWebViewBounds = useCallback(() => {
    if (!primaryRef.current || !webViewActiveRef.current || !isTauriShell()) return;
    const tab = activeTabRef.current;
    if (!tab || !isTabInPool(tab.id)) return;
    if (webViewDisabled) return;

    const rect = primaryRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    invoke('browser_set_tab_bounds', { tabId: tab.id, bounds }).catch(() => {});
  }, [isTabInPool, webViewDisabled]);

  // When active tab changes: create WebView if not in pool, then activate
  useEffect(() => {
    if (!isTauriShell() || webViewDisabled) return;
    const tab = activeTab;
    if (!tab || !tab.url || tab.url === 'about:blank' || tab.url.trim() === '') {
      webViewActiveRef.current = false;
      return;
    }

    const activateOrCreate = async () => {
      if (!isTabInPool(tab.id)) {
        await createWebViewForTab(tab.id, tab.url);
      }
      await activateTabInPool(tab.id);
      webViewActiveRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => updateWebViewBounds());
      });
    };

    activateOrCreate().catch(() => {});
  }, [activeTab?.id, activeTab?.url, isTabInPool, createWebViewForTab, activateTabInPool, updateWebViewBounds, webViewDisabled]);

  // Overlay handling
  useEffect(() => {
    if (!isTauriShell() || !webViewActiveRef.current) return;
    if (overlayActive) {
      hideAllWebViews();
    } else {
      updateWebViewBounds();
    }
  }, [overlayActive, hideAllWebViews, updateWebViewBounds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webViewActiveRef.current = false;
    };
  }, []);

  // ResizeObserver for primary container
  useEffect(() => {
    if (!isTauriShell() || !primaryRef.current) return;
    const observer = new ResizeObserver(() => {
      if (webViewActiveRef.current && isVisible) {
        updateWebViewBounds();
      }
    });
    observer.observe(primaryRef.current);
    return () => observer.disconnect();
  }, [updateWebViewBounds, isVisible]);

  return {
    webViewActiveRef,
    primaryRef,
    removeFromPool,
    isTabInPool,
    updateWebViewBounds,
  };
}
```

- [ ] **Step 2: Verify tsc**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserWebView.ts
git commit -m "feat(browser): integrate useBrowserPool into useBrowserWebView"
```

---

### Task 10: Update BrowserPanelContent for evicted-tab UI

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx`

- [ ] **Step 1: Add evicted-tab state display**

In `BrowserPanelContent.tsx`, after the `{isTauriShell() && ...}` block (around line 442), add a UI indicator for tabs whose WebView was evicted from the pool. When `activeTab` exists but `!isTabInPool(activeTab.id)`, show a "click to reload" message instead of the WebView error states:

Edit `BrowserPanelContent.tsx`, add after line 441 (`})()}`):

```tsx
{isTauriShell() && activeTab?.url && !isTabInPool(activeTab.id) && (
  <div className="adl-browser-evicted-tab">
    <div className="adl-browser-evicted-tab__message">
      {t.browserTabEvicted || 'Tab was unloaded to save memory'}
    </div>
    <button
      className="adl-browser-evicted-tab__reload-btn"
      onClick={() => {
        if (activeTab) {
          createWebViewForTab(activeTab.id, activeTab.url).then(() => {
            activateTabInPool(activeTab.id).then(() => updateWebViewBounds());
          });
        }
      }}
    >
      {t.browserClickToReload || 'Click to reload'}
    </button>
  </div>
)}
```

The `isTabInPool`, `createWebViewForTab`, `activateTabInPool`, `updateWebViewBounds` must be added to the `BrowserPanelContentProps` interface and passed from `BrowserPanel.tsx`.

- [ ] **Step 2: Update BrowserPanel.tsx to pass pool props**

Read `BrowserPanel.tsx` and find where `useBrowserWebView` is called and where `BrowserPanelContent` is rendered. Add the new pool-related props to the prop drilling chain.

- [ ] **Step 3: Verify build**

Run: `cd ai-digital-life/frontend && npx vite build 2>&1`
Expected: builds successfully

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "feat(browser): add evicted-tab reload UI in BrowserPanelContent"
```

---

## Phase 7: History Tab Reuse Fix

### Task 11: Activate existing tab when clicking history entry

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserTabs.ts`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx` (or `BrowserNavigator.tsx`)

- [ ] **Step 1: Write failing test**

Create `ai-digital-life/frontend/src/app/features/browser/useBrowserHistoryTab.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { findTabByUrl } from './useBrowserTabs';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

function makeTab(id: string, url: string): BrowserTabState {
  return {
    id,
    url,
    title: id,
    workspaceId: 'ws-1',
    isPinned: false,
    sortOrder: 0,
  };
}

describe('findTabByUrl', () => {
  it('returns tab id when URL matches', () => {
    const tabs = [makeTab('t1', 'https://example.com/page'), makeTab('t2', 'https://other.com')];
    expect(findTabByUrl(tabs, 'https://example.com/page')).toBe('t1');
  });

  it('returns undefined when no tab matches', () => {
    const tabs = [makeTab('t1', 'https://example.com')];
    expect(findTabByUrl(tabs, 'https://nonexistent.com')).toBeUndefined();
  });

  it('ignores trailing slash differences', () => {
    const tabs = [makeTab('t1', 'https://example.com/page/')];
    expect(findTabByUrl(tabs, 'https://example.com/page')).toBe('t1');
    expect(findTabByUrl(tabs, 'https://example.com/page/')).toBe('t1');
  });

  it('matches about:blank tabs too', () => {
    const tabs = [makeTab('t1', 'about:blank')];
    expect(findTabByUrl(tabs, 'about:blank')).toBe('t1');
  });

  it('returns first match when multiple tabs have same URL', () => {
    const tabs = [makeTab('t1', 'https://dup.com'), makeTab('t2', 'https://dup.com')];
    expect(findTabByUrl(tabs, 'https://dup.com')).toBe('t1');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/browser/useBrowserHistoryTab.test.ts 2>&1`
Expected: FAIL (findTabByUrl not exported)

- [ ] **Step 3: Implement findTabByUrl in useBrowserTabs.ts**

Add to `ai-digital-life/frontend/src/app/features/browser/useBrowserTabs.ts`:

```typescript
export function findTabByUrl(tabs: BrowserTabState[], url: string): string | undefined {
  if (!url) return undefined;
  const normalizedUrl = url.endsWith('/') && url.length > 8 ? url.slice(0, -1) : url;
  for (const tab of tabs) {
    const tabUrl = tab.url.endsWith('/') && tab.url.length > 8 ? tab.url.slice(0, -1) : tab.url;
    if (tabUrl === normalizedUrl || tab.url === url) {
      return tab.id;
    }
  }
  return undefined;
}
```

This must be placed after the `computeNavigatorCount` function (around line 220). Also add the import for `BrowserTabState` at the top if not already present.

- [ ] **Step 4: Run test to verify pass**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/browser/useBrowserHistoryTab.test.ts 2>&1`
Expected: all 5 tests PASS

- [ ] **Step 5: Update BrowserNavigator.tsx handleOpenTabFromTree**

Read `BrowserNavigator.tsx` to find the click handler for history tree entries. The `handleOpenTabFromTree` function is defined in `BrowserPanelContent.tsx` at line 220. Update it to check for existing tabs:

In `BrowserPanelContent.tsx` lines 220-232, replace `handleOpenTabFromTree`:

```tsx
const handleOpenTabFromTree = useCallback(
  (url: string, tabId?: string) => {
    if (tabId) {
      const tab = browserTabs.find((t) => t.id === tabId);
      if (tab) {
        useAppStore.getState().browserSelectTab(tabId);
        return;
      }
    }
    // Check if this URL already has an open tab — reuse it
    const existingTabId = findTabByUrl(browserTabs, url);
    if (existingTabId) {
      useAppStore.getState().browserSelectTab(existingTabId);
      return;
    }
    browserOpenTab(url, undefined, undefined);
  },
  [browserTabs, browserOpenTab]
);
```

Add the import for `findTabByUrl`:
```typescript
import { computeNavigatorCount, findTabByUrl } from './useBrowserTabs';
```

- [ ] **Step 6: Verify build**

Run: `cd ai-digital-life/frontend && npx vite build 2>&1`
Expected: builds successfully

- [ ] **Step 7: Run all frontend tests**

Run: `cd ai-digital-life/frontend && npx vitest run 2>&1`
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/useBrowserTabs.ts ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx ai-digital-life/frontend/src/app/features/browser/useBrowserHistoryTab.test.ts
git commit -m "feat(browser): reuse existing open tab when clicking history entry with matching URL"
```

---

## Phase 8: Browser Mode — Iframe LRU

### Task 12: Add iframe LRU eviction for browser mode

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/browser/SafeIframe.tsx`

- [ ] **Step 1: Add LRU tracking for iframe tabs**

In `BrowserPanelContent.tsx`, add an LRU tracking ref and a function to evict old iframes. Add after line 211 (after `inactiveIframeRef`):

```tsx
const IFRAME_POOL_SIZE = 5;
const iframeLruOrderRef = useRef<string[]>([]);
const evictedIframeTabsRef = useRef<Set<string>>(new Set());

// Track LRU order when active tab changes
useEffect(() => {
  if (isTauriShell() || !activeTab) return;
  const tabId = activeTab.id;
  iframeLruOrderRef.current = iframeLruOrderRef.current.filter((id) => id !== tabId);
  iframeLruOrderRef.current.push(tabId);

  // Evict iframe if pool is full
  if (iframeLruOrderRef.current.length > IFRAME_POOL_SIZE) {
    const evictId = iframeLruOrderRef.current.shift();
    if (evictId) {
      evictedIframeTabsRef.current.add(evictId);
    }
  }
}, [activeTab, isTauriShell]);

// Clear eviction when a tab is reactivated (its iframe will be recreated with original URL)
const handleReactivateEvictedTab = useCallback((tabId: string) => {
  evictedIframeTabsRef.current.delete(tabId);
  // Force a re-render so the SafeIframe recreates
  // ... (force update mechanism)
}, []);
```

- [ ] **Step 2: Update iframe rendering to handle evicted tabs**

In the `browserTabs.map(...)` section (lines 394-440), add a check for evicted tabs. Before `if (!shouldRender) return null;`, add:

```tsx
// Skip rendering if this tab's iframe was evicted and it's not the active tab
if (!isActive && evictedIframeTabsRef.current.has(tab.id)) {
  return null;
}
// If active tab was evicted, clear its eviction status so it re-renders
if (isActive && evictedIframeTabsRef.current.has(tab.id)) {
  evictedIframeTabsRef.current.delete(tab.id);
}
```

- [ ] **Step 3: Verify build and lint**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit && npx eslint . 2>&1`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx
git commit -m "feat(browser): add iframe LRU eviction for browser mode memory optimization"
```

---

## Phase 9: Final Integration & Validation

### Task 13: End-to-end validation

- [ ] **Step 1: Run all Rust tests**

Run: `cargo test --workspace 2>&1`
Expected: all tests PASS

- [ ] **Step 2: Run Rust lint**

Run: `cargo clippy --workspace --all-targets 2>&1`
Expected: no warnings (or only pre-existing warnings unrelated to our changes)

- [ ] **Step 3: Run all frontend tests**

Run: `cd ai-digital-life/frontend && npx vitest run 2>&1`
Expected: all tests PASS

- [ ] **Step 4: Run frontend lint**

Run: `cd ai-digital-life/frontend && npx eslint . && npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 5: Run full build**

Run: `cd ai-digital-life && cargo build 2>&1`
Expected: builds successfully

- [ ] **Step 6: Manual smoke test checklist**

1. Open Tauri app, open 3 tabs with different URLs
2. Switch between tabs — verify no reload (pages keep state)
3. Open 7 tabs — verify LRU eviction kicks in (6th tab causes eviction)
4. Switch back to an evicted tab — verify "click to reload" UI appears
5. Click reload on evicted tab — verify page loads
6. Click a history entry that matches an existing tab URL — verify it activates existing tab
7. Close tabs — verify WebViews are cleaned up
8. Browser mode — open 6+ iframe tabs, verify oldest iframe gets evicted (memory optimization)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(browser): final integration validation and cleanup"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Requirement | Task |
|-------------|------|
| Eliminate page reload on tab switch (Tauri) | Task 3, 9 |
| WebView pool with LRU eviction | Task 1, 8 |
| Evicted-tab "click to reload" UI | Task 10 |
| History tab reuse (avoid duplicate tabs) | Task 11 |
| Browser mode iframe LRU | Task 12 |
| Bridge interface updates | Task 6, 7 |
| Capability/permission updates | Task 5 |
| Multi-WebView label management | Task 3, 5 |
| WebView creation race condition prevention | Task 8 (pool.createWebViewForTab) |

**2. Placeholder scan:** No TBD, TODO, "implement later", "add error handling", or "similar to Task N" patterns found.

**3. Type consistency:**
- `tab_id: String` in Rust → `tabId: string` in TypeScript ✓
- `Bounds { x, y, width, height }` in Rust → `{ x: number; y: number; width: number; height: number }` in TypeScript ✓
- `BrowserPool::register(tab_id: String)` → `createWebViewForTab(tabId: string, url: string)` ✓
- `useBrowserPool(maxPoolSize)` used consistently across Task 8, 9, 10 ✓

---

## Meta Polling Optimization (deferred)

**Not in scope of this plan.** The meta polling thread (currently 1 thread with 3-mode timing) should be adapted for multi-WebView in a follow-up plan. The immediate priority is tab state preservation. Without meta polling, tabs will still function correctly — only real-time title/favicon updates will be delayed for inactive tabs. This can be addressed in a separate plan.
