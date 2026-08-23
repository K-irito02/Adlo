# Browser Tab Loading States Design

**Date:** 2026-08-23
**Status:** Approved
**Scope:** Browser tab favicon and title loading UX optimization

## Problem

When navigating to a URL (especially search engine results), the browser tab shows:
1. **Favicon**: Fallback letter → real favicon (visible flicker)
2. **Title**: Temporary title (e.g., "Google: 搜索词") → real title (visible text change)

This creates a jarring UX where content visibly transitions between states.

## Solution

Add loading states to favicon and title:
- **Favicon**: Show small spinner while fetching → show image or fallback letter
- **Title**: Show "新建标签页" with shimmer effect while fetching → show real title

## Design

### 1. Favicon Loading State

**Component:** `BrowserFavicon.tsx`

| State | Condition | Display |
|-------|-----------|---------|
| Loading | `!resolved && !faviconUrl` | 14px spinner (`.adl-spinner--sm`) |
| Loaded with image | `resolved && faviconUrl` | Favicon `<img>` |
| Loaded without image | `resolved && !faviconUrl` | Fallback letter (site initial) |

**Implementation:**
- Use existing `resolved` state from `siteMetaCache` subscription
- Render `<Spinner size="sm" />` when loading
- No new state variables needed

### 2. Title Loading State

**Store:** `browserTypes.ts` → `BrowserTabState`

Add field:
```typescript
titleResolved: boolean; // true = real title applied, false = loading
```

**State Transitions:**

| Event | `titleResolved` |
|-------|-----------------|
| New tab created | `false` |
| URL changes (`onUrlChanged`) | `false` |
| `handlePageMeta` updates title | `true` |
| `applyBroadcast` updates title | `true` |

**Tab Components:** `BrowserTabBar.tsx`, `BrowserOpenTabFlatListItem.tsx`

| State | Display |
|-------|---------|
| `!titleResolved` | "新建标签页" + shimmer effect |
| `titleResolved` | Actual title text |

### 3. Shimmer Effect

Use existing CSS class `.adl-loading-row__text--shimmer`:
- Gradient sweep animation (2s, 300% background-size)
- `prefers-reduced-motion` fallback included
- Applies to "新建标签页" text while title is loading

### 4. i18n

Use existing i18n key for "新建标签页" (new tab page).

## Files to Modify

| File | Change |
|------|--------|
| `BrowserFavicon.tsx` | Add spinner when `!resolved && !faviconUrl` |
| `browserTypes.ts` | Add `titleResolved: boolean` to `BrowserTabState` |
| `browserTabsSlice.ts` | Initialize `titleResolved: false` for new tabs |
| `useBrowserPageMeta.ts` | Set `titleResolved = true` when title updates |
| `useBrowserUrlChange.ts` | Set `titleResolved = false` when URL changes |
| `useBrowserPanelAddressSubmit.ts` | Set `titleResolved = false` on navigation |
| `BrowserTabBar.tsx` | Conditional render shimmer/real title |
| `BrowserOpenTabFlatListItem.tsx` | Conditional render shimmer/real title |
| `browser.css` | Add shimmer styles for tab title |

## Testing

1. Search on Google/Bing/DuckDuckGo — favicon shows spinner, then image
2. Tab title shows "新建标签页" shimmer, then real title
3. Navigate to different URL — loading states reset
4. `prefers-reduced-motion` — animations disabled
5. Favicon fetch failure — falls back to letter after spinner
