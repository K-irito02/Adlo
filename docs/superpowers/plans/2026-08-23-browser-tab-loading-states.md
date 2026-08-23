# Browser Tab Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add loading states to browser tab favicon (spinner) and title (shimmer) to eliminate visual flicker during metadata fetch.

**Architecture:** Add `titleResolved` boolean to tab state. Modify `BrowserFavicon` to show spinner while unresolved. Modify tab title rendering to show shimmer text while unresolved.

**Tech Stack:** React, Zustand, TypeScript, CSS animations

## Global Constraints

- Must work in both Tauri desktop and browser modes
- Must respect `prefers-reduced-motion`
- Use existing `Spinner` component (`@components/Spinner`)
- Use existing `ShimmeringText` component (`@/components/shimmering-text`)
- Use existing i18n key `common.newTabPage` for "新建标签页"
- No new CSS animations — use existing `.adl-loading-row__text--shimmer` pattern

---

### Task 1: Add `titleResolved` to BrowserTabState

**Files:**
- Modify: `frontend/src/app/stores/slices/browserTypes.ts:1-22`

**Interfaces:**
- Produces: `BrowserTabState.titleResolved: boolean`, `BrowserTabStateUpdate.titleResolved?: boolean`

- [ ] **Step 1: Add field to BrowserTabState**

```typescript
export interface BrowserTabState {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  titleResolved: boolean;
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
  isPlayingAudio: boolean;
  isAudioMuted: boolean;
}
```

- [ ] **Step 2: Add field to BrowserTabStateUpdate**

```typescript
export interface BrowserTabStateUpdate {
  workspaceId?: string;
  title?: string;
  url?: string;
  titleResolved?: boolean;
  isPinned?: boolean;
  pinnedAt?: number;
  sortOrder?: number;
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: Errors about missing `titleResolved` in tab creation sites (fixed in later tasks)

---

### Task 2: Initialize `titleResolved` in tab creation

**Files:**
- Modify: `frontend/src/app/stores/slices/browserTabsSlice.ts:67-80` (`browserOpenTab`)
- Modify: `frontend/src/app/stores/slices/browserSlice.ts:220-268` (`browserNavigateActiveTab`)

**Interfaces:**
- Consumes: `BrowserTabState.titleResolved` (from Task 1)
- Produces: All new tabs initialized with `titleResolved: false`

- [ ] **Step 1: Set `titleResolved: false` in browserOpenTab**

In `browserTabsSlice.ts`, find the `browserOpenTab` function. In the tab object creation (around line 73), add `titleResolved: false`:

```typescript
const tab: BrowserTabState = {
  id: createUiId('browser'),
  workspaceId: workspaceId ?? '',
  title: title?.trim() || '',
  url: url?.trim() || '',
  titleResolved: false,
  isPinned: false,
  sortOrder: maxSortOrder + 1,
  isPlayingAudio: false,
  isAudioMuted: false,
};
```

- [ ] **Step 2: Set `titleResolved: false` in browserNavigateActiveTab (new tab case)**

In `browserSlice.ts`, find `browserNavigateActiveTab`. In the CASE 1 branch (no active tab, creates new tab around line 240), add `titleResolved: false`:

```typescript
const newTab: BrowserTabState = {
  id: createUiId('browser'),
  workspaceId: '',
  title: tabTitle,
  url,
  titleResolved: false,
  isPinned: false,
  isPlayingAudio: false,
  isAudioMuted: false,
  sortOrder: maxSortOrder + 1,
};
```

- [ ] **Step 3: Set `titleResolved: false` in browserNavigateActiveTab (update case)**

In the CASE 2 branch (active tab exists, around line 253), add `titleResolved: false` to the update:

```typescript
nextTabs = nextTabs.map((tab) => {
  if (tab.id === state.browserActiveTabId) {
    return {
      ...tab,
      url,
      title: title || '',
      titleResolved: false,
    };
  }
  return tab;
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: Fewer errors than Task 1 step 3

---

### Task 3: Set `titleResolved: true` when real title arrives

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserPageMeta.ts:91-112` (`applyBroadcast`)
- Modify: `frontend/src/app/features/browser/useBrowserPageMeta.ts:116-210` (`handlePageMeta`)

**Interfaces:**
- Consumes: `browserUpdateTab` (existing), `titleSourceRef` (existing)
- Produces: Tabs get `titleResolved: true` when title is updated

- [ ] **Step 1: Set titleResolved in applyBroadcast**

In `useBrowserPageMeta.ts`, find the `applyBroadcast` callback. After `state.browserUpdateTab(tab.id, { title: p.title })` (around line 102), also set `titleResolved: true`:

```typescript
if (applied) {
  state.browserUpdateTab(tab.id, { title: p.title, titleResolved: true });
  titleSourceRef.set(tab.id, p.source);
}
```

- [ ] **Step 2: Set titleResolved in handlePageMeta (exact match branch)**

In `handlePageMeta`, find the `if (exact)` branch. Inside the for loop, after `state.browserUpdateTab(t.id, { title: meta.title })` (around line 179), also set `titleResolved: true`:

```typescript
if (applied) {
  state.browserUpdateTab(t.id, { title: meta.title, titleResolved: true });
  titleSourceRef.set(t.id, effectiveSource);
}
```

- [ ] **Step 3: Set titleResolved in handlePageMeta (activeTab branch)**

In the `else if (activeTab)` branch, update the `browserUpdateTab` call (around line 197) to include `titleResolved`:

```typescript
state.browserUpdateTab(activeTab.id, {
  url: cleanUrl,
  title: shouldTitle ? meta.title : activeTab.title,
  titleResolved: shouldTitle,
});
```

- [ ] **Step 4: Set titleResolved in useBrowserUrlChange.ts tryPrefetch**

In `useBrowserUrlChange.ts`, find the `tryPrefetch` function. After `onPageMeta?.(...)` call (around line 347), the title will be updated via `handlePageMeta` which already sets `titleResolved: true`. No change needed here.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: Clean compilation

---

### Task 4: Add spinner to BrowserFavicon

**Files:**
- Modify: `frontend/src/app/components/BrowserFavicon.tsx:31-119`

**Interfaces:**
- Consumes: `Spinner` from `@components/Spinner`
- Produces: Spinner shown when `!resolved && !faviconUrl`

- [ ] **Step 1: Import Spinner**

Add import at top of `BrowserFavicon.tsx`:

```typescript
import { Spinner } from '@components/Spinner';
```

- [ ] **Step 2: Add loading state rendering**

In the `BrowserFavicon` component, after the `showImg` computation (line 84), add a loading check. Modify the return JSX to show spinner when loading:

```typescript
const current = faviconUrl;
const showImg = Boolean(current) && !degraded;
const isLoading = !resolved && !current && !degraded;
const handleError = useCallback(() => {
  setDegraded(true);
}, []);

// ... (existing new tab page check)

return (
  <span
    className={`adl-filetree__file-icon ${showImg ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}
  >
    {showImg && (
      <img
        src={current}
        alt=""
        className="adl-browser-tree__favicon"
        style={{ width: size, height: size, transition: 'opacity 0.15s ease-in-out' }}
        onError={handleError}
      />
    )}
    {isLoading && (
      <Spinner size="sm" speed="normal" />
    )}
    <span
      className="adl-browser-tree__link-fallback"
      style={showImg || isLoading ? { display: 'none' } : undefined}
    >
      {showImg || isLoading ? '' : resolved ? siteInitial(url) : ''}
    </span>
  </span>
);
```

- [ ] **Step 3: Run lint**

Run: `cd frontend && pnpm run lint`
Expected: Clean

---

### Task 5: Add shimmer to tab title rendering

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserTabBar.tsx:103-123`
- Modify: `frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx:32-49`

**Interfaces:**
- Consumes: `ShimmeringText` from `@/components/shimmering-text`, `common.newTabPage` i18n key, `tab.titleResolved`
- Produces: Shimmer text shown when `!tab.titleResolved`

- [ ] **Step 1: Add imports to BrowserTabBar.tsx**

Add imports at top of `BrowserTabBar.tsx`:

```typescript
import { ShimmeringText } from '@/components/shimmering-text';
import { useTCopy } from '@i18n/tCopy';
```

Inside the component function, add:

```typescript
const _t = useTCopy();
```

- [ ] **Step 2: Modify title rendering in BrowserTabBar.tsx**

Find the title span (around line 123). Replace the static title with conditional rendering:

```typescript
<span className="adl-tool-list__title">
  {tab.titleResolved ? (
    tab.title
  ) : (
    <ShimmeringText text={_t.newTabPage} />
  )}
</span>
```

- [ ] **Step 3: Add imports to BrowserOpenTabFlatListItem.tsx**

Add imports at top of `BrowserOpenTabFlatListItem.tsx`:

```typescript
import { ShimmeringText } from '@/components/shimmering-text';
import { useTCopy } from '@i18n/tCopy';
```

Inside the component function, add:

```typescript
const _t = useTCopy();
```

- [ ] **Step 4: Modify title rendering in BrowserOpenTabFlatListItem.tsx**

Find the title span (around line 47). Replace the static title with conditional rendering:

```typescript
<span className="adl-filetree__label-text">
  {tab.titleResolved ? (
    tab.title
  ) : (
    <ShimmeringText text={_t.newTabPage} />
  )}
</span>
```

- [ ] **Step 5: Run lint**

Run: `cd frontend && pnpm run lint`
Expected: Clean

---

### Task 6: Add shimmer CSS for tab title

**Files:**
- Create/Modify: `frontend/src/styles/regions/rightpanel/browser-webview.css`

**Interfaces:**
- Consumes: Existing `.adl-loading-row__text--shimmer` animation pattern
- Produces: `.adl-tool-list__title--loading` and `.adl-filetree__label-text--loading` classes

- [ ] **Step 1: Add shimmer animation for tab titles**

Add to `browser-webview.css` (after the evicted tab styles around line 322):

```css
/* Tab title loading shimmer */
.adl-tool-list__title--loading,
.adl-filetree__label-text--loading {
  background: linear-gradient(
    90deg,
    var(--color-text) 0%,
    var(--color-text) 40%,
    var(--color-text-secondary, var(--color-text)) 50%,
    var(--color-text) 60%,
    var(--color-text) 100%
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: adl-tab-title-shimmer 2s ease-in-out infinite;
}

@keyframes adl-tab-title-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: -100% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .adl-tool-list__title--loading,
  .adl-filetree__label-text--loading {
    animation: none;
  }
}
```

- [ ] **Step 2: Run lint**

Run: `cd frontend && pnpm run lint`
Expected: Clean

---

### Task 7: Update ShimmeringText usage to use CSS class

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserTabBar.tsx`
- Modify: `frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`

**Interfaces:**
- Consumes: CSS classes from Task 6
- Produces: ShimmeringText with correct className

- [ ] **Step 1: Add className to ShimmeringText in BrowserTabBar.tsx**

Update the ShimmeringText usage to include the shimmer className:

```typescript
<span className="adl-tool-list__title">
  {tab.titleResolved ? (
    tab.title
  ) : (
    <ShimmeringText text={_t.newTabPage} className="adl-tool-list__title--loading" />
  )}
</span>
```

- [ ] **Step 2: Add className to ShimmeringText in BrowserOpenTabFlatListItem.tsx**

Update the ShimmeringText usage to include the shimmer className:

```typescript
<span className="adl-filetree__label-text">
  {tab.titleResolved ? (
    tab.title
  ) : (
    <ShimmeringText text={_t.newTabPage} className="adl-filetree__label-text--loading" />
  )}
</span>
```

- [ ] **Step 3: Run lint and typecheck**

Run: `cd frontend && pnpm run lint && npx tsc --noEmit`
Expected: Clean

---

### Task 8: Verify and commit

- [ ] **Step 1: Run full lint**

Run: `cd frontend && pnpm run lint`
Expected: 0 errors

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Run tests**

Run: `cd frontend && pnpm run test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(browser): add loading states to tab favicon and title

- Add titleResolved field to BrowserTabState
- Show spinner in BrowserFavicon while meta is unresolved
- Show shimmer text in tab title while real title is loading
- Use existing ShimmeringText and Spinner components
- Respect prefers-reduced-motion"
```
