# Browser Navigation Mode Toggle & Auto-Refresh Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 2-3 auto-refresh bug when clicking links in Tauri's Browser panel, and add a toolbar toggle that switches between "create new tab on URL change" and "update current tab in-place" modes, working consistently in both Tauri and iframe modes.

**Architecture:** The root cause is that in Tauri mode, `handlePageMeta` always calls `browserOpenTab` (creates new tab) when a URL changes, rather than updating the existing tab. This is compounded by two parallel async paths (`meta-changed` event from INIT_SCRIPT title reporting vs `url-changed` + `browser_fetch_page_meta` IPC response) carrying potentially different URLs (e.g., with/without trailing slash), causing duplicate tab creation → each triggering `navigateTauriUrl` → redundant page reloads. The fix adds: (1) URL normalization for dedup comparison, (2) a `browserNavigateInPlace` store toggle, (3) routing `handlePageMeta` through `browserNavigateActiveTab` when toggle is on. The UI adds a simple toggle button using existing `IconToggleLeft`/`IconToggleRight` icons.

**Tech Stack:** React 19 + TypeScript + Zustand + Tauri 2.x

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/app/stores/actions/browserNavigateModeActions.ts` | Bridge action: reads the toggle from store, decides `browserOpenTab` vs `browserNavigateActiveTab` |

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/app/stores/StoreState.ts` | Add `browserNavigateInPlace: boolean` field |
| `frontend/src/app/stores/slices/browserslice.ts` | Add `browserNavigateInPlace` state + `setBrowserNavigateInPlace` action + persistence |
| `frontend/src/app/features/browser/useBrowserPageMeta.ts` | Add `onNavigation` param (normalized dedup + mode-aware routing) |
| `frontend/src/app/features/browser/browserpanel.tsx` | Wire the toggle state + new `handlePageMeta` logic |
| `frontend/src/app/features/browser/BrowserToolbar.tsx` | Add toggle button after Refresh |
| `frontend/src/app/i18n/zh-CN/browser.ts` | Add `browserNavigateInPlace` key |
| `frontend/src/app/i18n/en-US/browser.ts` | Add `browserNavigateInPlace` key |
| `frontend/src/app/icons/index.ts` | Re-export `IconToggleLeft`/`IconToggleRight` from status module if not already re-exported |

### No Changes Needed
| Reason | File |
|--------|------|
| iframe mode already correctly uses `browserNavigateActiveTab` in `handleIframeLoad` | `useBrowserUrlChange.ts` |
| INIT_SCRIPT interception logic is correct | `browser_navigation.rs` |
| Rust `navigation_handler` / `new_window_handler` emission is correct | `browser_events.rs` |

---

### Task 1: Add `browserNavigateInPlace` to store

**Files:**
- Modify: `frontend/src/app/stores/StoreState.ts`
- Modify: `frontend/src/app/stores/slices/browserslice.ts`
- Create: `frontend/src/app/stores/actions/browserNavigateModeActions.ts`

- [ ] **Step 1: Add field to StoreState**

Read `frontend/src/app/stores/StoreState.ts` to locate the `BrowserSlice` interface import and the main `StoreState` interface. Add `browserNavigateInPlace: boolean` to `StoreState`.

- [ ] **Step 2: Add field + action to browserSlice**

In `frontend/src/app/stores/slices/browserslice.ts`:

```typescript
// Add constant for persistence
const BROWSER_NAVIGATE_IN_PLACE_KEY = 'adl-ui:browser-navigate-in-place';
```

In `BrowserSlice` interface, add:
```typescript
browserNavigateInPlace: boolean;
setBrowserNavigateInPlace: (value: boolean) => void;
```

In `hydrateBrowserDefaults`, add:
```typescript
const navigateInPlace = readJson<boolean>(BROWSER_NAVIGATE_IN_PLACE_KEY, false);
// ... inside set({...}):
browserNavigateInPlace: navigateInPlace,
```

In the slice `return { ... }`, add default state:
```typescript
browserNavigateInPlace: false,
```

Add the action:
```typescript
setBrowserNavigateInPlace: (value: boolean) => {
    scheduleWrite(BROWSER_NAVIGATE_IN_PLACE_KEY, value);
    set({ browserNavigateInPlace: value });
},
```

- [ ] **Step 3: Export icons from index**

In `frontend/src/app/icons/index.ts`, confirm `IconToggleLeft` and `IconToggleRight` are exported. They are in the `status` import block (lines 107-108). The export is already re-exported via `export { ... IconToggleLeft, IconToggleRight ... }` in the status section. Verify this exists. If not, add them.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slices/browserslice.ts
git commit -m "feat(store): add browserNavigateInPlace toggle state"
```

---

### Task 2: Add i18n keys

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `frontend/src/app/i18n/en-US/browser.ts`

- [ ] **Step 1: Add Chinese key**

In `frontend/src/app/i18n/zh-CN/browser.ts`, add before the closing `as const`:
```typescript
browserNavigateInPlace: '就地导航：新链接在当前标签打开',
browserNavigateNewTab: '新建标签：新链接在新标签打开',
```

- [ ] **Step 2: Add English key**

In `frontend/src/app/i18n/en-US/browser.ts`, add before the closing `as const`:
```typescript
browserNavigateInPlace: 'Navigate in-place: links open in current tab',
browserNavigateNewTab: 'New tab: links open in new tabs',
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/i18n/zh-CN/browser.ts frontend/src/app/i18n/en-US/browser.ts
git commit -m "feat(i18n): add browser navigation mode labels"
```

---

### Task 3: Fix `handlePageMeta` with URL normalization + mode awareness

**Files:**
- Modify: `frontend/src/app/features/browser/browserpanel.tsx`
- Modify: `frontend/src/app/features/browser/useBrowserPageMeta.ts`

This is the core fix. The `handlePageMeta` callback is the final common path for both `meta-changed` and `browser_fetch_page_meta` responses. It needs three changes:

1. **URL normalization** before comparing `tab.url === meta.url` — strip trailing slash, lowercase hostname
2. **Mode-aware routing**: when `browserNavigateInPlace` is true, call `browserNavigateActiveTab` instead of `browserOpenTab`
3. **Dedup guard**: prevent double-processing by tracking recently-seen URLs

- [ ] **Step 1: Add URL normalization helper**

In `frontend/src/app/features/browser/useBrowserPageMeta.ts`, add a helper:

```typescript
function normalizeUrlForDedup(url: string): string {
  try {
    const u = new URL(url);
    // Strip trailing slash from pathname (but not for root "/")
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}
```

- [ ] **Step 2: Rewrite `handlePageMeta`**

Replace the `handlePageMeta` callback in `useBrowserPageMeta.ts`:

```typescript
const handlePageMeta = useCallback(
  (meta: { title: string; favicon: string; url: string }) => {
    const faviconToCache = meta.favicon || (meta.url ? getGoogleFaviconUrl(meta.url) : '');
    if (faviconToCache) {
      setCachedFavicon(meta.url, faviconToCache);
      new Image().src = faviconToCache;
    }

    if (!meta.title) {
      return;
    }

    pendingNavigationsRef.current.delete(meta.url);

    const urlHostname = hostnameFromUrl(meta.url);
    if (meta.title === urlHostname) {
      return;
    }

    const pageTitle = meta.title;
    if (!pageTitle) {
      return;
    }

    const state = useAppStore.getState();
    const normalizedMetaUrl = normalizeUrlForDedup(meta.url);

    // Check if any existing tab matches this URL (normalized dedup)
    const matchingTab = state.browserTabs.find(
      (t) => normalizeUrlForDedup(t.url) === normalizedMetaUrl
    );

    if (matchingTab) {
      // Tab already exists — update its title and metadata
      if (matchingTab.title !== pageTitle) {
        state.browserUpdateTab(matchingTab.id, { title: pageTitle });
      }
      state.browserUpdateBookmarkTitle(meta.url, pageTitle);
      state.browserUpdateHistoryTitle(meta.url, pageTitle);
      return;
    }

    if (state.browserNavigateInPlace) {
      // In-place mode: update current active tab's URL
      state.browserNavigateActiveTab(meta.url, pageTitle);
      state.browserAddToHistory(meta.url, pageTitle);
    } else {
      // New-tab mode: create a new tab
      state.browserOpenTab(meta.url, pageTitle);
      state.browserAddToHistory(meta.url, pageTitle);
    }
  },
  []
);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserPageMeta.ts
git commit -m "fix(browser): normalize URL dedup + mode-aware handlePageMeta"
```

---

### Task 4: Add toggle button to BrowserToolbar

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserToolbar.tsx`
- Modify: `frontend/src/app/features/browser/browserpanel.tsx`

- [ ] **Step 1: Add toggle button to BrowserToolbar**

In `frontend/src/app/features/browser/BrowserToolbar.tsx`:

1. Add imports:
```typescript
import { IconToggleLeft, IconToggleRight } from '../../icons';
```

2. Add props to `BrowserToolbarProps`:
```typescript
browserNavigateInPlace: boolean;
onToggleNavigateMode: () => void;
```

3. Add the toggle button after the Refresh button (after line 128, before the address bar `label`):

```typescript
<TooltipSimple
  content={props.browserNavigateInPlace ? t.browserNavigateInPlace : t.browserNavigateNewTab}
  placement="top"
>
  <button
    type="button"
    className={`adl-tool-context__iconbtn${props.browserNavigateInPlace ? ' is-active' : ''}`}
    onClick={props.onToggleNavigateMode}
    aria-label={props.browserNavigateInPlace ? t.browserNavigateInPlace : t.browserNavigateNewTab}
  >
    {props.browserNavigateInPlace ? (
      <IconToggleLeft size={14} decorative />
    ) : (
      <IconToggleRight size={14} decorative />
    )}
  </button>
</TooltipSimple>
```

- [ ] **Step 2: Wire the toggle in browserpanel.tsx**

In `frontend/src/app/features/browser/browserpanel.tsx`:

Add store selector for the new state:
```typescript
browserNavigateInPlace: state.browserNavigateInPlace,
setBrowserNavigateInPlace: state.setBrowserNavigateInPlace,
```

Add a callback:
```typescript
const handleToggleNavigateMode = useCallback(() => {
  setBrowserNavigateInPlace(!browserNavigateInPlace);
}, [browserNavigateInPlace, setBrowserNavigateInPlace]);
```

Pass to `BrowserToolbar`:
```typescript
browserNavigateInPlace={browserNavigateInPlace}
onToggleNavigateMode={handleToggleNavigateMode}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/browser/BrowserToolbar.tsx frontend/src/app/features/browser/browserpanel.tsx
git commit -m "feat(browser): add navigation mode toggle button to toolbar"
```

---

### Task 5: Fix `isUrlRecentlySeen` timing window

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserWebView.ts`

The existing 1-second `isUrlRecentlySeen` window is too short for slow page loads. When `handlePageMeta` fires >1000ms after the initial `url-changed` event, the dedup entry is already evicted from the map, allowing a redundant `browser_navigate` IPC call.

The fix extends the TTL to 3000ms (matching the existing `setExpectedUrl` timeout) to cover slow HTTP fetches and SPA title-reporting delays.

- [ ] **Step 1: Extend the TTL**

In `frontend/src/app/features/browser/useBrowserWebView.ts`, change the TTL from 1000ms to 3000ms:

```typescript
const URL_SEEN_TTL = 3000; // ms — must cover slow page loads + meta fetch
```

Replace the hard-coded `1000` in `isUrlRecentlySeen`:
```typescript
const isUrlRecentlySeen = useCallback((url: string): boolean => {
  const ts = recentNavigatedUrlsRef.current.get(url);
  if (ts === undefined) {
    return false;
  }
  if (Date.now() - ts > URL_SEEN_TTL) {
    recentNavigatedUrlsRef.current.delete(url);
    return false;
  }
  return true;
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserWebView.ts
git commit -m "fix(browser): extend isUrlRecentlySeen TTL to 3s for slow page loads"
```

---

### Task 6: Clean up INIT_SCRIPT — remove `stopImmediatePropagation`

**Files:**
- Modify: `frontend/crates/browser/src/browser_navigation.rs`

The `stopAll(event)` function in `INIT_SCRIPT` calls `event.stopImmediatePropagation()`. This is unnecessary: the capture-phase listener already fires before any other listener, and `preventDefault()` + `stopPropagation()` are sufficient to block the default navigation. `stopImmediatePropagation` can interfere with legitimate page-level event handling (e.g., analytics, SPA routers).

- [ ] **Step 1: Modify `stopAll`**

In `frontend/crates/browser/src/browser_navigation.rs`, line 11-15, change:

```typescript
function stopAll(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}
```

to:

```typescript
function stopAll(event) {
    event.preventDefault();
    event.stopPropagation();
    // Intentionally NOT calling stopImmediatePropagation:
    // page-level scripts may need to observe click events for analytics or routing
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/crates/browser/src/browser_navigation.rs
git commit -m "fix(browser): remove overly aggressive stopImmediatePropagation in INIT_SCRIPT"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Task 1: Store toggle field + persistence
- ✅ Task 2: i18n keys for both locales
- ✅ Task 3: URL normalization dedup + mode-aware routing in `handlePageMeta`
- ✅ Task 4: Toolbar toggle button using `IconToggleLeft`/`IconToggleRight`
- ✅ Task 5: Extend dedup TTL for slow page loads
- ✅ Task 6: Remove unnecessary `stopImmediatePropagation`

**2. Placeholder scan:** No placeholders, TODOs, or TBDs found.

**3. Type consistency:**
- `browserNavigateInPlace: boolean` — consistent across StoreState, browserSlice, browserpanel, BrowserToolbar
- `normalizeUrlForDedup(url: string): string` — used in `handlePageMeta` only
- `setBrowserNavigateInPlace(value: boolean)` — action defined in browserSlice
- Icon exports: `IconToggleLeft` and `IconToggleRight` already exist in project's icon set (status.tsx)
- `BROWSER_NAVIGATE_IN_PLACE_KEY` — consistent between store and persistence
