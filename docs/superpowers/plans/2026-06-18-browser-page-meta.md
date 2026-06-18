# Browser Page Meta (Favicon + Title) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically extract page title and favicon from websites loaded in the embedded browser (Tauri WebView + iframe modes).

**Architecture:** Two independent strategies per mode — (1) Tauri mode: inject JS extraction script into the WebView's init script, communicate back via `window.__TAURI_INTERNALS__.invoke` → Rust command → Tauri event → frontend listener. (2) iframe mode: Vite middleware proxy fetches HTML head, parses `<title>` and `<link rel="icon">`, returns via existing `requestPreviewApi` pattern; combined with progressive enhancement (same-origin reads `document.title` directly).

**Tech Stack:** Rust (Tauri 2.x, reqwest, serde), TypeScript/React (Vite middleware, Zustand), Node.js (Vite dev server)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `crates/browser/src/browser_meta.rs` | `PageMeta` struct, `PAGE_META_SCRIPT` injection script constant, `browser_emit_page_meta()` helper |
| `frontend/src/app/utils/fetchPageMeta.ts` | TTL-cached `fetchPageMeta()` for iframe mode; `getCachedFavicon()` / `setCachedFavicon()` for favicon cache |

### Modified Files
| File | Change |
|------|--------|
| `crates/browser/src/browser_navigation.rs` | Append meta extraction logic to `INIT_SCRIPT` |
| `crates/browser/src/lib.rs` | Add `mod browser_meta;` re-export |
| `src-tauri/src/commands/browser.rs` | Add `browser_report_page_meta` command |
| `src-tauri/src/main.rs` | Import `browser_report_page_meta` |
| `frontend/src/shared/ipc.ts` | Add `onMetaChanged` to `BrowserBridge` |
| `frontend/src/tauri-bridge.ts` | Implement `onMetaChanged` listener via Tauri event |
| `frontend/src/app/features/browser/useBrowserWebView.ts` | Wire meta events to tab title/favicon updates in both modes |
| `frontend/vite.config.ts` | Add `/browser/page-meta` route handler |
| `frontend/src/app/utils/favicon.ts` | Add `getCachedFaviconUrl()` that checks favicon cache before Google API |
| `frontend/src/app/features/browser/BrowserTabBar.tsx` | Use cached favicon URL instead of only Google API |

---

### Tauri Mode Setup

**Communication flow:**
```
INIT_SCRIPT (browser webview)
  → on window.load: reads title + extracts favicon <link>
  → on pushState/replaceState/popstate: re-reads for SPA route changes
  → window.__TAURI_INTERNALS__.invoke('browser_report_page_meta', { title, favicon, url })
  → Rust command handler
  → app.emit('digital-life://browser-meta-changed', payload)
  → Frontend tauri-bridge listens → browserUpdateTab({ title, faviconUrl })
```

**Pitfalls addressed:**
1. **SPA timing** — uses `window.load` not `DOMContentLoaded`; hijacks `history.pushState`/`replaceState` + popstate for SPA navigation
2. **Relative favicon paths** — absolutizes via `new URL(href, location.origin).href`
3. **Bridge race** — uses Tauri's built-in IPC (`__TAURI_INTERNALS__`) not a custom bridge object
4. **Memory leaks** — no persistent listeners; each invocation is fire-and-forget
5. **iframe interference** — script only runs in top window (`window === window.top`)

---

### iframe Mode Setup

**Communication flow:**
```
handleIframeLoad (iframe mode)
  → try { iframeWindow.document.title } → same-origin: fast path
  → catch { fetchPageMeta(url) } → cross-origin: Vite middleware proxy
  → browserUpdateTab({ title }) + setCachedFavicon(url, faviconUrl)

Vite middleware:
  → GET /__adl_preview_api__/browser/page-meta?url=...
  → fetch(targetUrl, { headers: { 'User-Agent': '...' }, signal: AbortSignal.timeout(5000) })
  → parse <title> + <link rel="icon"> from HTML head (first 64KB)
  → resolve relative paths to absolute
  → return JSON { title, favicon, url }
```

**Pitfalls addressed:**
1. **SPA routing** — no iframe reload on SPA route change; parent re-fetches via `handleIframeLoad` only triggers on full navigation. Explicitly call `fetchPageMeta` on user tab switch as fallback.
2. **HTML parsing** — regex is inherently fragile. Add `<meta property="og:title">` fallback for title. Also strip HTML entities and whitespace.
3. **Cache TTL** — `fetchPageMeta` cache has 5-minute TTL; cache cleared on manual refresh.

---

### Task 1: Tauri — Create browser_meta.rs

**Files:**
- Create: `crates/browser/src/browser_meta.rs`
- Modify: `crates/browser/src/lib.rs`

- [ ] **Step 1: Write browser_meta.rs**

```rust
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageMeta {
    pub title: String,
    pub favicon: String,
    pub url: String,
}

/// JS snippet injected via INIT_SCRIPT to extract page metadata
/// after page load and on SPA route changes.
pub(crate) const PAGE_META_SCRIPT: &str = r#"
(function() {
    if (window !== window.top) return;

    function absolutizeUrl(href) {
        if (!href) return '';
        try {
            return new URL(href, location.origin).href;
        } catch {
            return href.startsWith('//') ? location.protocol + href : href;
        }
    }

    function extractFavicon() {
        var link = document.querySelector('link[rel*="icon"]');
        if (link) return absolutizeUrl(link.href);
        return location.origin + '/favicon.ico';
    }

    function extractTitle() {
        var t = document.title;
        if (t && t.trim()) return t.trim();
        var og = document.querySelector('meta[property="og:title"]');
        if (og) return og.getAttribute('content') || t;
        return t;
    }

    function reportMeta() {
        var payload = {
            title: extractTitle(),
            favicon: extractFavicon(),
            url: location.href
        };
        try {
            if (window.__TAURI_INTERNALS__) {
                window.__TAURI_INTERNALS__.invoke('browser_report_page_meta', payload)
                    .catch(function() {});
            }
        } catch(e) {}
    }

    // 1. On full page load
    window.addEventListener('load', reportMeta);

    // 2. On visibility change (catches late-loading SPAs)
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') reportMeta();
    });

    // 3. SPA route changes: hijack pushState + replaceState
    (function() {
        var origPush = history.pushState;
        var origReplace = history.replaceState;
        history.pushState = function() {
            origPush.apply(this, arguments);
            setTimeout(reportMeta, 300);
        };
        history.replaceState = function() {
            origReplace.apply(this, arguments);
            setTimeout(reportMeta, 100);
        };
        window.addEventListener('popstate', function() {
            setTimeout(reportMeta, 300);
        });
    })();
})();
"#;

/// Emit page metadata as a Tauri event
pub(crate) fn emit_page_meta(app: &tauri::AppHandle, meta: &PageMeta) {
    let _ = app.emit("digital-life://browser-meta-changed", meta);
}
```

- [ ] **Step 2: Update lib.rs**

Replace lines 1-5 with:

```rust
mod browser_events;
mod browser_meta;
mod browser_navigation;
mod browser_webview;

pub use browser_meta::PageMeta;
pub use browser_webview::{Bounds, BrowserManager};
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p adl-browser`
Expected: success

---

### Task 2: Tauri — Extend INIT_SCRIPT

**Files:**
- Modify: `crates/browser/src/browser_navigation.rs` (line ~6, after INIT_SCRIPT const closes)

- [ ] **Step 1: Append PAGE_META_SCRIPT to INIT_SCRIPT**

Change the closing of INIT_SCRIPT from `"#;` to appending the meta script. At the end of the INIT_SCRIPT string (before the closing `"#;), inject the PAGE_META_SCRIPT content:

Edit `crates/browser/src/browser_navigation.rs`:

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="edit">
<｜｜DSML｜｜parameter name="filePath" string="true">E:\AI-DIGITAL-LIFE\SourceWorkspace\crates\browser\src\browser_navigation.rs