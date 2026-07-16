# Plan F: BrowserPanel Context Refactoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate BrowserPanelContent as a 66-prop pass-through intermediary by splitting into two React Contexts and migrating child components to self-serve.

**Architecture:** Create `BrowserPanelStateContext` (data, `useMemo`-wrapped) and `BrowserPanelActionsContext` (callbacks, `useRef`-stabilized). Remove BrowserPanelContent. BrowserToolbar, BrowserNavigator, BrowserIframeStack read from Context instead of receiving props. This eliminates ~370 lines of prop forwarding, fixes a duplicate `visibleWorkspaces` computation, and isolates each child component's re-render boundary.

**Tech Stack:** React 19, TypeScript 5.6, Zustand 5

## Global Constraints

- React Context value must be stable: StateContext uses `useMemo`, ActionsContext uses `useRef` to prevent unnecessary re-renders
- Child components use `React.memo` + fine-grained store selectors
- No Behavior change — UI and interaction must remain identical
- All tests must pass: `pnpm run frontend:test`
- Lint zero warnings: `pnpm run frontend:lint`
- TypeScript zero errors: `pnpm run frontend:typecheck`

---

### Task 1: Create BrowserPanelStateContext and BrowserPanelActionsContext

**Files:**
- Create: `frontend/src/app/features/browser/BrowserPanelStateContext.ts`
- Create: `frontend/src/app/features/browser/BrowserPanelActionsContext.ts`

**Interfaces:**
- Produces: `BrowserPanelStateContext` (React Context of `BrowserPanelState`)
- Produces: `BrowserPanelActionsContext` (React Context of `BrowserPanelActions`)
- Consumed by: Task 2, 3, 4

- [ ] **Step 1: Create BrowserPanelStateContext.ts**

```typescript
// frontend/src/app/features/browser/BrowserPanelStateContext.ts
import { createContext, useContext } from 'react';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { TabFolderState } from '@stores/slices/browserFoldersSlice';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';
import type { BrowserMenuItem } from './useBrowserMenus';
import type { CopyDict } from '@i18n/types';

export interface BrowserPanelState {
  t: CopyDict;
  isBrowserVisible: boolean;
  activeTab: BrowserTabState | undefined;
  hasActiveTab: boolean;
  isBookmarked: boolean;
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  tabTreeExpanded: Record<string, boolean>;
  allTreeExpanded: boolean;
  navigatorQuery: string;
  searchScope: BrowserSearchScope;
  searchResults: { title: string; url: string; source: string }[];
  browserMenuOpen: boolean;
  browserMenuRef: React.RefObject<HTMLDivElement | null>;
  browserMenuItems: BrowserMenuItem[];
  loadingTabId: string | null;
  evictedTabIds: ReadonlySet<string>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  primaryRef: React.RefObject<HTMLDivElement | null>;
  iframeBlockedDetected: boolean;
  iframeLoadError: boolean;
  isEmbedPending: boolean;
  validatedUrlsRef: React.MutableRefObject<Set<string>>;
  navigatorMode: BrowserNavigatorMode;
  navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
  selectedTreePath: string | null;
  selectedTreePathRef: React.MutableRefObject<string | null>;
  activatedTabIdsRef: React.MutableRefObject<Set<string>>;
  urlState: {
    address: string;
    addressExpanded: boolean;
    addressSearchRef: React.RefObject<HTMLLabelElement | null>;
    addressInputRef: React.RefObject<HTMLInputElement | null>;
    handleAddressChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleAddressKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    handleAddressBlur: () => void;
    handleSearchClick: () => void;
  };
  navigatorCollapsed: boolean;
  browserNavigatorWidth: number;
  visibleWorkspaces: { id: string; name: string }[];
  handlePointerDown: (e: React.PointerEvent) => void;
  openTabCount: number;
  navigatorTitle: string;
}

export const BrowserPanelStateCtx = createContext<BrowserPanelState | null>(null);

export function useBrowserPanelState(): BrowserPanelState {
  const ctx = useContext(BrowserPanelStateCtx);
  if (!ctx) throw new Error('useBrowserPanelState must be used within BrowserPanelStateCtx.Provider');
  return ctx;
}
```

- [ ] **Step 2: Create BrowserPanelActionsContext.ts**

```typescript
// frontend/src/app/features/browser/BrowserPanelActionsContext.ts
import { createContext, useContext } from 'react';

export interface BrowserPanelActions {
  handleCloseTab: (tabId: string) => void;
  handleCloseAllTabs: (workspaceId?: string) => void;
  handleClearTabDirectories: () => void;
  handleDoubleClick: (tabId: string, title: string) => void;
  handleOpenBookmarkDialog: () => void;
  handleEditTab: (tabId: string, name: string, url: string) => void;
  handleSetCreateTabDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; workspaceId?: string; folderId?: string }>
  >;
  setCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
  setRenameFolderState: React.Dispatch<
    React.SetStateAction<{ open: boolean; folderId: string; currentName: string }>
  >;
  setNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;
  handleToggleTreePath: (path: string) => void;
  handleDeleteAllChildTabs: (_categoryType: string, nodePath: string) => void;
  handleDeleteOwnChildTabs: (_categoryType: string, nodePath: string) => void;
  handleOpenAllInNewTabs: (_categoryType: string, nodePath: string) => void;
  handleRemoveFromArea: (workspaceId: string) => void;
  handleDeleteDirectory: (folderId: string) => void;
  handleDeleteHistoryLevel: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  handleExpandAllTree: () => void;
  handleCollapseAllTree: () => void;
  handleRefreshTab: (tabId: string, url: string) => Promise<void>;
  handleDeleteTab: (tabId: string, url: string) => void;
  handleCopyTabLink: (url: string) => Promise<void>;
  handleOpenTabInNewTab: (url: string, title: string) => void;
  handleOpenTabInCurrentTab: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
  setBrowserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleOpenTabFromTree: (url: string, tabId?: string) => void;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleReload: () => void;
  setNavigatorMode: React.Dispatch<React.SetStateAction<BrowserNavigatorMode>>;
  handleSelectTreePath: (path: string | null) => void;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
  browserOpenTab: (url?: string, title?: string, folderId?: string) => void;
  handleToggleNavigateMode: (checked: boolean) => void;
  toggleNavigator: (tool: string) => void;
}

export const BrowserPanelActionsCtx = createContext<BrowserPanelActions | null>(null);

export function useBrowserPanelActions(): BrowserPanelActions {
  const ctx = useContext(BrowserPanelActionsCtx);
  if (!ctx) throw new Error('useBrowserPanelActions must be used within BrowserPanelActionsCtx.Provider');
  return ctx;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd ai-digital-life/frontend
npx tsc --noEmit
```

Expected: No errors (the new files compile — they are not yet consumed, so no breakage)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/browser/BrowserPanelStateContext.ts frontend/src/app/features/browser/BrowserPanelActionsContext.ts
git commit -m "feat(browser): create BrowserPanelStateContext and BrowserPanelActionsContext"
```

---

### Task 2: Migrate BrowserToolbar to use Context + remove its props from BrowserPanelContent

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserToolbar.tsx` — replace props with context hooks
- Modify: `frontend/src/app/features/browser/BrowserPanelContent.tsx` — remove BrowserToolbar-related props and rendering

**Interfaces:**
- Consumes: `useBrowserPanelState()` from Task 1, `useBrowserPanelActions()` from Task 1

- [ ] **Step 1: Read current BrowserToolbar.tsx to understand its props interface**

```bash
cd ai-digital-life/frontend
Select-String -Path "src/app/features/browser/BrowserToolbar.tsx" -Pattern "interface BrowserToolbarProps|export function BrowserToolbar"
```

- [ ] **Step 2: Rewrite BrowserToolbar to self-serve from Context**

Replace the props interface and function signature:

```typescript
// Delete BrowserToolbarProps interface entirely
// Replace function signature:
export const BrowserToolbar = React.memo(function BrowserToolbar() {
  const {
    t, navigatorCollapsed, activeTab, isBookmarked,
    urlState: { address, addressExpanded, addressSearchRef, addressInputRef,
               handleAddressChange, handleAddressKeyDown, handleAddressBlur, handleSearchClick },
    browserMenuOpen, browserMenuRef, browserMenuItems,
  } = useBrowserPanelState();

  const {
    handleGoBack, handleGoForward, handleReload, browserOpenTab,
    handleOpenBookmarkDialog, setBrowserMenuOpen,
    handleToggleNavigateMode, toggleNavigator,
  } = useBrowserPanelActions();

  const browserNavigateInPlace = useAppStore(s => s.browserNavigateInPlace);
  // ... existing JSX remains unchanged (use local vars instead of props)
});
```

The key change: every `props.xxx` reference in the JSX becomes the local variable from context hooks. The JSX structure itself stays identical.

- [ ] **Step 3: Remove BrowserToolbar props from BrowserPanelContent**

In `BrowserPanelContent.tsx`:
- Delete the `BrowserToolbar` import and its JSX `<BrowserToolbar ...>` block
- Remove BrowserToolbar-specific props from the destructuring (they may still be needed by other children — only remove if exclusively for BrowserToolbar)

- [ ] **Step 4: Verify compilation and tests**

```bash
cd ai-digital-life/frontend
npx tsc --noEmit
npx eslint .
pnpm run test -- --run src/app/features/browser/
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(browser): migrate BrowserToolbar to use Context instead of props"
```

---

### Task 3: Migrate BrowserNavigator to use Context

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx` — replace props with context hooks
- Modify: `frontend/src/app/features/browser/BrowserPanelContent.tsx` — remove Navigator-related props and rendering

**Interfaces:**
- Consumes: `useBrowserPanelState()` from Task 1, `useBrowserPanelActions()` from Task 1
- Consumes: Store selectors for bookmarks/history data

- [ ] **Step 1: Read BrowserNavigator.tsx to understand its props interface**

```bash
cd ai-digital-life/frontend
Select-String -Path "src/app/features/browser/BrowserNavigator.tsx" -Pattern "interface BrowserNavigatorProps|export function BrowserNavigator"
```

- [ ] **Step 2: Rewrite BrowserNavigator to self-serve from Context + Store**

Same pattern as Task 2: delete props interface, read from context hooks and store selectors. The `navigatorTitle` and `openTabCount` computations currently in BrowserPanelContent move into BrowserNavigator.

Move this logic from BrowserPanelContent into BrowserNavigator:

```typescript
// Inside BrowserNavigator:
const navigatorTitle = navigatorMode === 'open'
  ? t.browserOpenTabs
  : navigatorMode === 'tabs'
    ? t.browserTabDir
    : navigatorMode === 'list'
      ? t.browserViewModeList
      : t.browserSearchTabs;
```

```typescript
const {
  handleOpenTabFromTree: _handleOpenTabFromTree,
  navigatorCount, navigatorCollapsed, browserNavigatorWidth,
  visibleWorkspaces, t, ...
} = useBrowserPanelState();
```

- [ ] **Step 3: Remove BrowserNavigator props from BrowserPanelContent**

Delete the `<BrowserNavigator ...>` JSX block from BrowserPanelContent and its associated import.

- [ ] **Step 4: Verify compilation and tests**

```bash
cd ai-digital-life/frontend
npx tsc --noEmit
npx eslint .
pnpm run test -- --run src/app/features/browser/
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(browser): migrate BrowserNavigator to use Context instead of props"
```

---

### Task 4: Migrate BrowserIframeStack to use Context

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserIframeStack.tsx` — replace props with context hooks
- Modify: `frontend/src/app/features/browser/BrowserPanelContent.tsx` — remove iframe-related props and rendering

**Interfaces:**
- Consumes: `useBrowserPanelState()` from Task 1, `useBrowserPanelActions()` from Task 1

- [ ] **Step 1: Rewrite BrowserIframeStack to self-serve from Context**

Replace props interface with:
```typescript
export const BrowserIframeStack = React.memo(function BrowserIframeStack() {
  const {
    t, activeTab, hasActiveTab, browserTabs, isBrowserVisible,
    loadingTabId, iframeRef, iframeBlockedDetected, iframeLoadError,
    isEmbedPending, validatedUrlsRef, activatedTabIdsRef,
  } = useBrowserPanelState();
  const { handleIframeLoad, handleIframeError } = useBrowserPanelActions();
  // ... existing JSX unchanged
});
```

- [ ] **Step 2: Remove BrowserIframeStack props from BrowserPanelContent**

Delete the `<BrowserIframeStack ...>` JSX block.

- [ ] **Step 3: Verify compilation and tests**

```bash
cd ai-digital-life/frontend
npx tsc --noEmit
npx eslint .
pnpm run test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(browser): migrate BrowserIframeStack to use Context instead of props"
```

---

### Task 5: Remove BrowserPanelContent, wire Context in BrowserPanel

**Files:**
- Delete: `frontend/src/app/features/browser/BrowserPanelContent.tsx`
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` — wrap children in Context Provider, render child components directly

**Interfaces:**
- Produces: Final BrowserPanel that directly renders BrowserToolbar + BrowserNavigator + BrowserIframeStack

- [ ] **Step 1: Read BrowserPanel.tsx to understand where to place Providers**

- [ ] **Step 2: Add Provider wrappers to BrowserPanel.tsx**

```typescript
// Inside BrowserPanel return, replace <BrowserPanelContent ... /> with:
const actionsRef = useRef<BrowserPanelActions>({
  handleCloseTab: wrappedHandleCloseTab,
  handleCloseAllTabs,
  handleClearTabDirectories,
  handleDoubleClick,
  handleOpenBookmarkDialog,
  handleEditTab,
  handleSetCreateTabDialog,
  setCreateDirDialog,
  setRenameFolderState,
  setNavigatorQuery,
  setSearchScope,
  handleToggleTreePath,
  handleDeleteAllChildTabs,
  handleDeleteOwnChildTabs,
  handleOpenAllInNewTabs,
  handleRemoveFromArea,
  handleDeleteDirectory,
  handleDeleteHistoryLevel,
  handleExpandAllTree,
  handleCollapseAllTree,
  handleRefreshTab,
  handleDeleteTab,
  handleCopyTabLink,
  handleOpenTabInNewTab,
  handleOpenTabInCurrentTab,
  onBookmarkTab: handleBookmarkFromUrl,
  onRemoveBookmarkTab: handleRemoveBookmarkTab,
  setBrowserMenuOpen,
  handleOpenTabFromTree,
  handleIframeLoad,
  handleIframeError,
  handleGoBack,
  handleGoForward,
  handleReload,
  setNavigatorMode,
  handleSelectTreePath,
  showToast,
  browserOpenTab,
  handleToggleNavigateMode,
  toggleNavigator,
});
// Update on each render so callbacks stay current
useEffect(() => { actionsRef.current = { ...updatedActions }; });

const stateMemo = useMemo(() => ({
  t,
  isBrowserVisible,
  activeTab,
  hasActiveTab,
  isBookmarked,
  browserTabs,
  browserTabFolders,
  tabTreeExpanded,
  allTreeExpanded,
  navigatorQuery,
  searchScope,
  searchResults,
  browserMenuOpen,
  browserMenuRef,
  browserMenuItems,
  loadingTabId,
  evictedTabIds,
  iframeRef,
  primaryRef,
  iframeBlockedDetected,
  iframeLoadError,
  isEmbedPending,
  validatedUrlsRef,
  navigatorMode,
  navigatorSearchRef,
  navigatorSearchInputRef,
  selectedTreePath,
  selectedTreePathRef,
  activatedTabIdsRef,
  urlState,
  navigatorCollapsed,
  browserNavigatorWidth,
  visibleWorkspaces,
  handlePointerDown: handleNavigatorResizeStart,
  openTabCount: navigatorCount,
  navigatorTitle,
}), [
  t, isBrowserVisible, activeTab, hasActiveTab, isBookmarked, browserTabs,
  browserTabFolders, tabTreeExpanded, allTreeExpanded,
  navigatorQuery, searchScope, searchResults,
  browserMenuOpen, browserMenuRef, browserMenuItems,
  loadingTabId, evictedTabIds, iframeRef, primaryRef,
  iframeBlockedDetected, iframeLoadError, isEmbedPending, validatedUrlsRef,
  navigatorMode, navigatorSearchRef, navigatorSearchInputRef,
  selectedTreePath, selectedTreePathRef, activatedTabIdsRef,
  urlState, navigatorCollapsed, browserNavigatorWidth,
  visibleWorkspaces, handleNavigatorResizeStart,
  navigatorCount, navigatorTitle,
]);

return (
  <BrowserPanelStateCtx.Provider value={stateMemo}>
    <BrowserPanelActionsCtx.Provider value={actionsRef.current}>
      <div className="adl-tool-panel adl-tool-panel--browser">
        <BrowserToolbar />
        <div className="adl-tool-surface adl-tool-surface--files...">
          <BrowserNavigator />
          <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
            <BrowserIframeStack />
          </div>
        </div>
        <BrowserContextMenu ... />
        <BrowserPanelDialogs ... />
      </div>
    </BrowserPanelActionsCtx.Provider>
  </BrowserPanelStateCtx.Provider>
);
```

- [ ] **Step 3: Delete BrowserPanelContent.tsx**

```bash
rm frontend/src/app/features/browser/BrowserPanelContent.tsx
```

- [ ] **Step 4: Remove any remaining imports referencing BrowserPanelContent from other files**

```bash
cd ai-digital-life/frontend
Select-String -Path "src/**/*.{ts,tsx}" -Pattern "BrowserPanelContent" | Select-String -NotMatch "BrowserPanelContentProps"
```

Expected: Only the deleted file and BrowserPanel.tsx (which we already changed).

- [ ] **Step 5: Verify full test suite and typecheck**

```bash
cd ai-digital-life/frontend
npx tsc --noEmit
npx eslint .
pnpm run test
pnpm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(browser): remove BrowserPanelContent, wire Context in BrowserPanel

Final step of the Context refactor. BrowserPanel now directly renders
BrowserToolbar, BrowserNavigator, and BrowserIframeStack via two
Contexts (state + actions). Removed ~370 lines of prop forwarding."
```
