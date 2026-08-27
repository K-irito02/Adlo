# Download Handler Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate download handlers for silent (warmup) vs visible webviews, ensuring all downloads from silent webviews are cancelled unconditionally.

**Architecture:** Add `is_silent: bool` parameter to `setup_download_handler` and `build_webview_builder`. Silent webviews get an always-cancel handler. Visible tabs keep existing logic. Remove obsolete `mark_silent_url` / `is_download_url` code.

**Tech Stack:** Rust, Tauri 2.x, WebView2 (wry)

## Global Constraints

- Rust stable, `cargo clippy --workspace --all-targets -- -D warnings` must pass
- Frontend: `pnpm --dir frontend run lint` must pass (0 errors)
- All existing tests must pass: `cargo test --package adl-browser`
- Follow existing code conventions (naming, error handling, tracing)

---

### Task 1: Add `is_silent` parameter to `setup_download_handler`

**Files:**
- Modify: `ai-digital-life/crates/browser/src/download_handler.rs:8-12`

**Interfaces:**
- Consumes: None (this is the first task)
- Produces: `setup_download_handler(app_handle, download_manager, last_record_id, is_silent)` — returns a closure that always returns `false` when `is_silent=true`

- [ ] **Step 1: Add `is_silent: bool` parameter and early-return logic**

```rust
pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
    last_record_id: Arc<Mutex<Option<String>>>,
    is_silent: bool,
) -> impl Fn(String, &mut PathBuf) -> bool + Send + Sync + 'static {
    let manager = download_manager;
    let handle = app_handle;

    move |url: String, destination: &mut PathBuf| {
        // Silent webviews (warmup/meta fetch): cancel ALL downloads unconditionally.
        // Matches Chrome/Edge behavior where background pages never auto-download.
        if is_silent {
            tracing::warn!(
                url = &url,
                "[ADL-DL] download_requested: CANCELLED (silent webview)"
            );
            return false;
        }

        let suggested_path = destination.to_string_lossy().to_string();
        tracing::info!(url = &url, suggested_path = &suggested_path, "[ADL-DL] download_requested: ENTER");
        // ... rest of existing logic unchanged
```

- [ ] **Step 2: Remove `is_silent_url` check from the closure**

Remove the block at lines ~20-30 that checks `manager.is_silent_url(&url)` — this is superseded by the `is_silent` parameter.

- [ ] **Step 3: Run tests**

Run: `cargo test --package adl-browser`
Expected: All tests pass (existing tests don't call `setup_download_handler` with the new signature yet — they'll need updating in Task 4)

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/crates/browser/src/download_handler.rs
git commit -m "feat(download): add is_silent parameter to setup_download_handler"
```

---

### Task 2: Add `is_silent` parameter to `build_webview_builder`

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs:106-122`

**Interfaces:**
- Consumes: `setup_download_handler(..., is_silent)` from Task 1
- Produces: `build_webview_builder(label, tab_id, target, app_handle, color_scheme, is_silent)` — passes `is_silent` to `setup_download_handler`

- [ ] **Step 1: Add `is_silent: bool` parameter to `build_webview_builder`**

```rust
pub(super) fn build_webview_builder(
    label: &str,
    tab_id: &str,
    target: url::Url,
    app_handle: tauri::AppHandle,
    color_scheme: &str,
    is_silent: bool,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
```

- [ ] **Step 2: Pass `is_silent` to `setup_download_handler`**

Change line 122 from:
```rust
setup_download_handler(app_handle.clone(), download_manager.clone(), last_record_id.clone());
```
to:
```rust
setup_download_handler(app_handle.clone(), download_manager.clone(), last_record_id.clone(), is_silent);
```

- [ ] **Step 3: Run tests**

Run: `cargo test --package adl-browser && cargo check --package ai-digital-life`
Expected: Compiles (call sites will have type errors until Task 3 fixes them)

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs
git commit -m "feat(download): pass is_silent through build_webview_builder"
```

---

### Task 3: Update call sites in `browser.rs`

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs:56` (visible tab)
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs:203` (silent webview)

**Interfaces:**
- Consumes: `build_webview_builder(..., is_silent)` from Task 2
- Produces: All call sites compile with correct `is_silent` values

- [ ] **Step 1: Update visible tab call site (line 56)**

Change:
```rust
let webview_builder = build_webview_builder(&label, &tab_id, blank_url, app_inner.clone(), &cs);
```
to:
```rust
let webview_builder = build_webview_builder(&label, &tab_id, blank_url, app_inner.clone(), &cs, false);
```

- [ ] **Step 2: Update silent webview call site (line 203)**

Change:
```rust
let webview_builder = build_silent_webview_builder(&label, blank_url, &cs);
```
to:
```rust
let webview_builder = build_silent_webview_builder(&label, blank_url, &cs, true);
```

- [ ] **Step 3: Add `is_silent` parameter to `build_silent_webview_builder`**

In `browser_webview_setup.rs:316-328`, add `is_silent: bool` parameter and set up download handler:

```rust
pub(super) fn build_silent_webview_builder(
    label: &str,
    target: url::Url,
    color_scheme: &str,
    is_silent: bool,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    let init_script = adl_browser::init_script_with_background(color_scheme);
    tracing::debug!(
        color_scheme,
        "build_silent_webview_builder: generated init_script with background"
    );
    tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        .initialization_script(init_script)
}
```

Note: `build_silent_webview_builder` does NOT set up `.on_download()` — the download handler is set via `setup_webview2_handlers_for_platform` in `attach_webview_child`. We need to pass `is_silent` through `attach_webview_child` instead.

- [ ] **Step 4: Add `is_silent` to `attach_webview_child` and `setup_webview2_handlers_for_platform`**

In `browser.rs:112-137`, add `is_silent: bool`:
```rust
fn attach_webview_child(
    window: &tauri::Window<tauri::Wry>,
    label: &str,
    tab_id: &str,
    webview_builder: tauri::webview::WebviewBuilder<tauri::Wry>,
    make_bridge: impl FnOnce() -> EventBridgeRef,
    download_path: &str,
    is_silent: bool,
) -> Result<(), AppError> {
    // ... add_child unchanged ...
    if let Some(webview) = window.get_webview(label) {
        let bridge = make_bridge();
        setup_webview2_handlers_for_platform(&webview, tab_id, label, bridge, download_path, is_silent);
    }
    Ok(())
}
```

In `browser_webview_setup.rs:330-358`, add `is_silent: bool`:
```rust
pub(super) fn setup_webview2_handlers_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    tab_id: &str,
    label: &str,
    bridge: EventBridgeRef,
    download_path: &str,
    is_silent: bool,
) {
    // ... passes is_silent to setup_download_handler inside with_webview closure
}
```

- [ ] **Step 5: Update `attach_webview_child` call sites**

In `browser.rs`, both call sites of `attach_webview_child` need the `is_silent` parameter:
- Line 66 (visible tab): `attach_webview_child(..., false)`
- Line 211 (silent webview): `attach_webview_child(..., true)`

- [ ] **Step 6: Run full compilation check**

Run: `cargo check --package ai-digital-life`
Expected: Compiles with no errors

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/browser.rs ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs
git commit -m "feat(download): thread is_silent through webview creation chain"
```

---

### Task 4: Remove obsolete `mark_silent_url` / `is_download_url` code

**Files:**
- Modify: `ai-digital-life/crates/browser/src/download_manager.rs` — remove `silent_urls` field, `mark_silent_url`, `unmark_silent_url`, `is_silent_url` methods
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs` — remove `mark_silent_url`/`unmark_silent_url` calls in `fetch_silent_meta`, remove `is_download_url` import and check in `create_silent_webview`
- Modify: `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs` — remove `is_download_url` function and `DOWNLOAD_EXTENSIONS` constant (if only used by `is_download_url`)

**Interfaces:**
- Consumes: None
- Produces: Cleaner codebase with no obsolete tracking code

- [ ] **Step 1: Remove `silent_urls` from `DownloadManager`**

In `download_manager.rs`:
- Remove `silent_urls: Arc<Mutex<HashSet<String>>>` field from struct
- Remove `silent_urls` from `DownloadManager::new()`
- Remove `mark_silent_url`, `unmark_silent_url`, `is_silent_url` methods
- Remove `use std::collections::HashSet` if no longer needed

- [ ] **Step 2: Remove mark/unmark calls from `fetch_silent_meta`**

In `browser.rs`, remove:
- `state.download_manager.mark_silent_url(url);` (before webview creation)
- `state.download_manager.unmark_silent_url(url);` (after destroy + all error paths)

- [ ] **Step 3: Remove `is_download_url` check from `create_silent_webview`**

In `browser.rs:163-175`, remove the entire `is_download_url` check block.

- [ ] **Step 4: Remove `is_download_url` function and `DOWNLOAD_EXTENSIONS`**

In `browser_webview_setup.rs`, remove:
- `pub(crate) fn is_download_url(...)` function
- `static DOWNLOAD_EXTENSIONS` constant
- `use url::Url` if no longer needed

- [ ] **Step 5: Remove `is_download_url` import from `browser.rs`**

Remove `is_download_url` from the import list.

- [ ] **Step 6: Remove `is_download_url` usage from `new_window_handler`**

In `browser_webview_setup.rs:59-93`, the `new_window_handler` function calls `is_download_url`. Since we're removing this function, the handler should just deny all non-http(s) schemes and allow http(s) (the existing behavior after the `is_download_url` check).

- [ ] **Step 7: Run tests and clippy**

Run: `cargo test --package adl-browser && cargo clippy --package adl-browser --package ai-digital-life -- -D warnings`
Expected: All tests pass, 0 warnings

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/crates/browser/src/download_manager.rs ai-digital-life/src-tauri/src/commands/browser.rs ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs
git commit -m "refactor(download): remove obsolete mark_silent_url and is_download_url"
```

---

### Task 5: Change `DownloadMode` default to `Ask`

**Files:**
- Modify: `ai-digital-life/crates/browser/src/download_types.rs:61`

**Interfaces:**
- Consumes: None
- Produces: Default download mode changes from `Auto` to `Ask`

- [ ] **Step 1: Change default**

```rust
impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            mode: DownloadMode::Ask,  // Changed from Auto
            default_path: super::download_manager::get_default_download_path()
                .to_string_lossy()
                .to_string(),
        }
    }
}
```

- [ ] **Step 2: Update test if it asserts default mode**

In `download_handler.rs` tests, check if `create_download_manager_returns_arc` asserts `DownloadMode::Auto` — update to `Ask`.

- [ ] **Step 3: Run tests**

Run: `cargo test --package adl-browser`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/crates/browser/src/download_types.rs ai-digital-life/crates/browser/src/download_handler.rs
git commit -m "feat(download): change default DownloadMode to Ask"
```

---

### Task 6: Clean up frontend debug logs

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserDownloadsSlice.ts`

**Interfaces:**
- Consumes: None
- Produces: Production-ready code without debug `console.log` statements

- [ ] **Step 1: Remove all `[ADL-DL-FE]` console.log statements**

Remove the 9 `console.log` lines with `[ADL-DL-FE]` prefix (lines 104, 106, 117, 119, 130, 132, 161-163, 319, 346-348, and the new `browser-download-ask` listener log).

- [ ] **Step 2: Run lint**

Run: `cd ai-digital-life/frontend && pnpm run lint`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/browserDownloadsSlice.ts
git commit -m "chore(frontend): remove debug console.log from browserDownloadsSlice"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run all Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass

- [ ] **Step 2: Run clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: Run frontend lint and type check**

Run: `cd ai-digital-life/frontend && pnpm run lint && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Manual smoke test**

Start the app, verify:
- No auto-downloads on startup
- Visible tab downloads still work (click a download link in a normal tab)
- `DownloadMode::Ask` shows the download is blocked and emits event

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(download): complete handler separation for silent webviews"
```
