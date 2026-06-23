# Browser Opened Tabs Enhancement

> Implemented: 2026-06-23 | Covers: opened tabs filtering, multi-iframe state preservation, hover close buttons

## Problem

When clicking "已打开标签" in the browser panel, the tree view showed ALL entries including empty directories, the history category, and directory separators for folders without any open tabs. Switching between tabs caused the iframe/WebView to reload, losing form input, scroll position, and JS state. There was no close button on tab rows within the tree.

## Opened Tabs Only Filtering

### Pattern

When `navigatorMode === 'tabs' && browserShowTabButtons === true`, only tabs that exist in `browserTabs[]` are shown:

- `onlyOpenTabs` flag is computed in `BrowserPanelContent.tsx` and flows down: `BrowserNavigator` → `BrowserTabTree` → `BrowserCategorySection` → `BrowserTreeEntry` → `buildFlatTabItems` / `BrowserEntrySubEntries`
- `openTabIds` (Set<string>) is memoized from `browserTabs.map(t => t.id)` in `BrowserTabTree`
- History category is conditionally hidden (`{!onlyOpenTabs && <BrowserCategorySection type="history" />}`)
- `buildFlatTabItems` and `collectSubDirItems` accept optional `filterTabIds` parameter — when provided, only tab nodes whose `tabId` is in the set are included. Empty directories and their separators are automatically excluded.

### Key files

- `browserTreeEntryUtils.tsx` — `buildFlatTabItems(node, showSeparators, filterTabIds?)` and `collectSubDirItems(dir, path, showSeparators, filterTabIds?)`
- `BrowserTabTree.tsx` — `openTabIds` memo, history category conditional rendering
- `BrowserEntrySubEntries.tsx` — `filteredNodes` with `useMemo` for tree mode child filtering

## Multi-iframe State Preservation

### Pattern

Browser mode (non-Tauri) uses multiple `<SafeIframe>` components — one per tab that has been viewed at least once:

- `activatedTabIdsRef` (Set<string>) in `BrowserPanel.tsx` tracks which tabs' iframes have been created
- In `BrowserPanelContent.tsx`, the rendering loops over `browserTabs` and renders an iframe layer for each activated tab
- Only the active tab's iframe is visible (`display: block`); inactive ones are hidden (`display: none`) but remain mounted
- A shared `inactiveIframeRef` is used for inactive tabs (SafeIframe checks `if (iframeRef)` before using)
- Cleanup effect removes stale activation IDs when tabs are closed
- Max ~10 iframes with implicit LRU (the code records activation, cleanup only removes closed tabs)
- Tauri mode is NOT affected — it still uses a single WebView

### Layout

```css
.adl-browser-iframe-stack { position: relative; width: 100%; height: 100%; }
.adl-browser-iframe-layer { position: absolute; inset: 0; width: 100%; height: 100%; }
```

### Key considerations

- `display: none` iframes still run JavaScript — this is a trade-off. For a desktop app with moderate tab counts (5-20), this is acceptable.
- Error states (`iframeBlockedDetected`, `iframeLoadError`, `isEmbedPending`) are only shown for the active tab.
- `validatedUrlsRef` (embed-check cache) is global — once a URL is validated, all tabs reusing it skip the preflight.

## Hover Close Buttons

### Pattern

Close (X) buttons added to both flat list and tree mode tab hover action groups:

- Flat list: `BrowserTreeEntryFlatList.tsx` receives `onCloseTab` prop, adds `IconClose` button to `tabBtns` array
- Tree mode: `BrowserEntrySubEntries.tsx` adds close to `getTabHoverButtons()` return array
- Backend: `onCloseTab` callback added to `SectionCallbacks` and `BrowserTabTreeCallbacks`
- The close action uses `handleDeleteTab(tabId, '')` — preserves global bookmarks but cleans folder references (same as tab bar X button behavior)
- `.adl-icon-btn--danger-hover` CSS class turns close button red on hover (`--color-red-500` / `--color-red-100`)

### Key files

- `BrowserTreeEntryFlatList.tsx` — `handleCloseClick`, close button in tabBtns
- `BrowserEntrySubEntries.tsx` — close button in `getTabHoverButtons`, click handler
- `BrowserCategorySection.tsx` — `SectionCallbacks` includes `onCloseTab`
- `browser-webview.css` — `.adl-icon-btn--danger-hover` style

## Lessons Learned

1. **No reload tab switching requires multi-iframe**: A single `<iframe>` with changing `src` always reloads. The only way to preserve page state across tab switches is to keep iframes mounted and hidden.
2. **`display: none` ≠ unmount**: Hidden iframes retain JS execution. Accept this trade-off explicitly — don't try to "optimize" by unmounting.
3. **filterTabIds should be optional**: Making `filterTabIds` an optional `Set<string>` parameter with `undefined` = no filtering keeps backward compatibility and simplifies testing.
4. **Close button vs Delete button**: The tab bar X button preserves bookmarks (`browserRemoveTabBookmarks(tabId, '')`), while the context menu Delete fully removes them (`browserRemoveTabBookmarks(tabId, url)`). The tree close button should match the tab bar behavior — document this distinction.
5. **SSafeIframe's `onLoad`/`onError` don't accept `undefined`**: When rendering inactive iframes, pass `() => {}` noops instead of `undefined` to satisfy TypeScript strict mode.
6. **TypeScript strict mode disallows extra params in callback type assignment**: `(a, b) => void` is NOT assignable to `(a) => void`. Use a wrapper like `(tabId) => handleFunc(tabId, '')` instead.
