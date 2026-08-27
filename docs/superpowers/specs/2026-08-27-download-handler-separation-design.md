# Download Handler Separation Design

**Date**: 2026-08-27
**Status**: Draft
**Problem**: Background/silent webview pages trigger unwanted auto-downloads on startup

## Problem Statement

When the app starts, silent webviews (used for metadata pre-fetching/warmup) load URLs that respond with `Content-Disposition: attachment` headers. WebView2 automatically starts downloading these files to disk before our `DownloadStarting` handler can intervene. The current `is_download_url` heuristic only checks URL patterns and cannot predict server response headers.

### Root Cause

1. **WebView2 race condition** ([WebView2Feedback#2890](https://github.com/MicrosoftEdge/WebView2Feedback/issues/2890)): WebView2 starts writing to the default download path BEFORE the `DownloadStarting` event fires
2. **Heuristic limitation**: `is_download_url()` checks URL patterns (extensions, `/download/` path), but cannot predict `Content-Disposition: attachment` response headers
3. **No network-layer interception**: The patched tauri-runtime-wry does not expose `WebResourceRequested` / `WebResourceResponseReceived` APIs, so we cannot strip response headers like Chrome extensions do

### Chrome/Edge Behavior

Chrome and Edge handle this by:
- Background pages (Service Workers) use `chrome.downloads.onCreated` to observe downloads
- `chrome.webRequest` inspects HTTP response headers at the network layer
- Downloads from background pages are either cancelled or prompt the user

We cannot replicate the network-layer approach due to WebView2 API limitations. Instead, we use **handler separation**: silent webviews get an always-cancel download handler.

## Design

### Architecture

```
┌─────────────────────────────────────────────────┐
│              download_handler.rs                 │
│                                                  │
│  setup_download_handler(is_silent: bool)         │
│    ├─ is_silent=true  → always return false      │
│    └─ is_silent=false → existing logic           │
│         ├─ check duplicates                      │
│         ├─ check DownloadMode (Auto/Ask)         │
│         ├─ check disk space                      │
│         └─ create record + allow                 │
└─────────────────────────────────────────────────┘
         ▲                              ▲
         │                              │
    Silent webviews               Visible tabs
    (warmup/meta fetch)           (user navigation)
```

### Changes

#### 1. `download_handler.rs` — Add `is_silent` parameter

```rust
pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
    last_record_id: Arc<Mutex<Option<String>>>,
    is_silent: bool,  // NEW: true for silent/warmup webviews
) -> impl Fn(String, &mut PathBuf) -> bool + Send + Sync + 'static {
    // ...
    move |url: String, destination: &mut PathBuf| {
        // Silent webviews: cancel ALL downloads unconditionally
        if is_silent {
            tracing::warn!(
                url = &url,
                "[ADL-DL] download_requested: CANCELLED (silent webview)"
            );
            return false;
        }
        // ... existing logic for visible tabs
    }
}
```

#### 2. `browser_webview_setup.rs` — Pass `is_silent` to handler setup

`setup_webview2_handlers_for_platform` gains an `is_silent: bool` parameter:

```rust
pub(super) fn setup_webview2_handlers_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    tab_id: &str,
    label: &str,
    bridge: EventBridgeRef,
    download_path: &str,
    is_silent: bool,  // NEW
) {
    // ... passes is_silent to setup_download_handler
}
```

#### 3. `browser.rs` — Call sites pass correct `is_silent` value

| Call site | `is_silent` | Reason |
|-----------|-------------|--------|
| `attach_webview_child` (from `create_silent_webview`) | `true` | Silent/warmup webview |
| `browser_create_for_tab` (visible tabs) | `false` | User-visible navigation |

`attach_webview_child` gains `is_silent: bool` parameter. `create_silent_webview` passes `true`. `browser_create_for_tab` passes `false`.

#### 4. Remove `mark_silent_url` / `unmark_silent_url` / `is_silent_url`

These are no longer needed — the handler separation makes URL-level tracking unnecessary. Remove from `DownloadManager` and `download_handler.rs`.

#### 5. Remove `is_download_url` check from `create_silent_webview`

The check at the top of `create_silent_webview` (lines 163-175) is no longer needed — ALL downloads from silent webviews are cancelled by the handler, regardless of URL.

#### 6. Change `DownloadMode` default to `Ask`

In `download_types.rs`, change the default from `Auto` to `Ask`:

```rust
impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            mode: DownloadMode::Ask,  // Changed from Auto
            default_path: ...
        }
    }
}
```

This ensures visible tabs also prompt before downloading, matching Chrome/Edge behavior.

### Data Flow

1. App startup → `browser_page_meta_warmup` collects URLs from tabs/bookmarks/history
2. For each URL → `fetch_silent_meta` → `create_silent_webview` → `attach_webview_child(is_silent=true)`
3. `attach_webview_child` → `setup_webview2_handlers_for_platform(is_silent=true)`
4. `setup_download_handler(is_silent=true)` → handler always returns `false`
5. WebView2 loads URL → `Content-Disposition: attachment` triggers `DownloadStarting`
6. Handler returns `false` → `SetCancel(true)` → download cancelled, no file written

### Error Handling

- Silent webview handler never fails (always returns `false`)
- Visible tab handler follows existing error handling (disk space check, duplicate detection, etc.)
- `DownloadMode::Ask` emits `browser-download-ask` event to frontend

### Testing

1. **Unit tests**: `setup_download_handler(is_silent=true)` always returns `false` for any URL
2. **Integration test**: Create silent webview with a download URL, verify no file is created
3. **Manual test**: Start app with bookmarks/history containing download URLs, verify no auto-downloads

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Breaking visible tab downloads | `is_silent=false` path is unchanged |
| `DownloadMode::Ask` default change | Users who want auto-save can change setting |
| Removing `is_download_url` check | No longer needed — handler separation covers all cases |
| Removing `mark_silent_url` | No longer needed — handler separation is more reliable |
