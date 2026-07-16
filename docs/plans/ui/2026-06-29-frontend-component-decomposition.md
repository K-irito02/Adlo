# Frontend Component Decomposition & Bundle Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce BrowserPanel (716→~400 lines) and BrowserNavigator (495→~300 lines) by extracting sub-components, restore React.lazy/Suspense for 12 heavy components, and replace deep relative imports in the browser module with `@` path aliases.

**Architecture:** Extract dialogs from BrowserPanel into a dedicated BrowserPanelDialogs component (reducing prop drilling by ~30 props). Split BrowserNavigator's 4 navigation modes into per-mode sub-components behind a thin shell. Wrap 12 heavy components (CodeMirror, xterm.js, etc.) with React.lazy + Suspense to enable code splitting. Replace `../../` pattern imports in the browser feature module with `@` aliases.

**Tech Stack:** React 19, TypeScript, Zustand, Vite (path aliases already configured)

## Global Constraints

- All changes must not alter UI/UX behavior or visual appearance
- ESLint: 0 errors, 0 warnings after each task
- TypeScript: 0 errors after each task
- Tests: all 273 existing tests must pass after each task
- No new dependencies added
- Use existing `@` path alias (configured in vite.config.ts → `@` → `frontend/src/`)
- Use existing i18n system (`useTCopy()`, `t` object) for all UI text
- Follow existing component patterns: no `React.FC`, use `export function`, destructure props in signature

---

## File Structure Map

| File | Responsibility | Lines (before) | Lines (after) |
|------|----------------|:---:|:---:|
| `frontend/src/app/features/browser/BrowserPanel.tsx` | Browser shell: state orchestration, hooks wiring, render | 716 | ~400 |
| `frontend/src/app/features/browser/BrowserPanelDialogs.tsx` | **NEW**: All dialog components from BrowserPanel | 0 | ~120 |
| `frontend/src/app/features/browser/BrowserNavigator.tsx` | Navigator shell: toolbar + mode switching | 495 | ~120 |
| `frontend/src/app/features/browser/BrowserNavOpenMode.tsx` | **NEW**: Open tabs flat list mode | 0 | ~60 |
| `frontend/src/app/features/browser/BrowserNavTabsMode.tsx` | **NEW**: Tab tree mode | 0 | ~100 |
| `frontend/src/app/features/browser/BrowserNavListMode.tsx` | **NEW**: List view mode | 0 | ~50 |
| `frontend/src/app/features/browser/BrowserNavSearchMode.tsx` | **NEW**: Search mode | 0 | ~80 |
| `frontend/src/app/App.tsx` | Lazy wrappers for 12 components | 203 | ~220 |
| `frontend/src/app/features/browser/*.tsx` (13 files) | Replace deep relative imports | various | unchanged |

---

### Task 1: Extract BrowserPanelDialogs from BrowserPanel

**Files:**
- Create: `frontend/src/app/features/browser/BrowserPanelDialogs.tsx`
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx:712-783`

**Interfaces:**
- Consumes: `BrowserPanel.tsx` state variables: `createTabDialog`, `editTabDialog`, `isCreatingTab`, `handleCreateTabConfirm`, `handleCreateTabCancel`, `handleEditTabConfirm`, `handleEditTabCancel`, `bookmarkDialogOpen`, `bookmarkTreeData`, `handleBookmarkAddToFolder`, `handleBookmarkCreateDir`, `setBookmarkDialogOpen`, `setBookmarkName`, `bookmarkName`, `renameFolderState`, `setRenameFolderState`, `createDirDialog`, `setCreateDirDialog`, `toastMessages`, `removeToast`, `t` (from `useTCopy()`)
- Produces: `BrowserPanelDialogs` component with props `BrowserPanelDialogsProps`

- [ ] **Step 1: Create BrowserPanelDialogs.tsx with props interface and component**

Create file `frontend/src/app/features/browser/BrowserPanelDialogs.tsx`:

```tsx
import React from 'react';
import { RenameDialog } from '../../components/RenameDialog';
import { ToastContainer } from '../../components/Toast';
import { CreateTabDialog } from './browser-landing';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { useAppStore } from '../../stores/slicedStore';
import type { CopyDict } from '../../i18n/types';
import type { ToastMessage } from '../../components/Toast';

export interface BrowserPanelDialogsProps {
  t: CopyDict;
  createTabDialog: { open: boolean; workspaceId?: string; folderId?: string };
  editTabDialog: { open: boolean; name: string; url: string };
  isCreatingTab: boolean;
  handleCreateTabConfirm: (name: string, url: string) => void;
  handleCreateTabCancel: () => void;
  handleEditTabConfirm: (name: string, url: string) => void;
  handleEditTabCancel: () => void;
  bookmarkDialogOpen: boolean;
  bookmarkTreeData: {
    workspaceNodes: Array<{ id: string; label: string; children: Array<{ id: string; label: string }> }>;
    userFolderNodes: Array<{ id: string; label: string; children: Array<{ id: string; label: string }> }>;
  };
  handleBookmarkAddToFolder: (folderId: string) => void;
  handleBookmarkCreateDir: (name: string) => void;
  setBookmarkDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBookmarkName: React.Dispatch<React.SetStateAction<string>>;
  bookmarkName: string;
  renameFolderState: { open: boolean; folderId: string; currentName: string };
  setRenameFolderState: React.Dispatch<
    React.SetStateAction<{ open: boolean; folderId: string; currentName: string }>
  >;
  createDirDialog: { open: boolean; parentPath: string | null };
  setCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
  toastMessages: ToastMessage[];
  removeToast: (id: string) => void;
}

export function BrowserPanelDialogs({
  t,
  createTabDialog,
  editTabDialog,
  isCreatingTab,
  handleCreateTabConfirm,
  handleCreateTabCancel,
  handleEditTabConfirm,
  handleEditTabCancel,
  bookmarkDialogOpen,
  bookmarkTreeData,
  handleBookmarkAddToFolder,
  handleBookmarkCreateDir,
  setBookmarkDialogOpen,
  setBookmarkName,
  bookmarkName,
  renameFolderState,
  setRenameFolderState,
  createDirDialog,
  setCreateDirDialog,
  toastMessages,
  removeToast,
}: BrowserPanelDialogsProps) {
  return (
    <>
      <CreateTabDialog
        open={createTabDialog.open || editTabDialog.open}
        loading={createTabDialog.open ? isCreatingTab : false}
        t={t}
        initialName={editTabDialog.open ? editTabDialog.name : undefined}
        initialUrl={editTabDialog.open ? editTabDialog.url : undefined}
        onConfirm={createTabDialog.open ? handleCreateTabConfirm : handleEditTabConfirm}
        onCancel={createTabDialog.open ? handleCreateTabCancel : handleEditTabCancel}
      />

      <BookmarkToFolderDialog
        open={bookmarkDialogOpen}
        t={t}
        workspaceNodes={bookmarkTreeData.workspaceNodes}
        userFolderNodes={bookmarkTreeData.userFolderNodes}
        onAddToFolder={handleBookmarkAddToFolder}
        onCreateDir={handleBookmarkCreateDir}
        onCancel={() => {
          setBookmarkDialogOpen(false);
          setBookmarkName('');
          useAppStore.getState().browserSetPendingBookmark(null);
        }}
        bookmarkName={bookmarkName}
        onBookmarkNameChange={setBookmarkName}
      />

      <RenameDialog
        open={renameFolderState.open}
        initialValue={renameFolderState.currentName}
        title={t.browserRenamePrompt as string}
        placeholder={t.browserRenamePrompt as string}
        onConfirm={(name) => {
          useAppStore.getState().browserUpdateTabFolder(renameFolderState.folderId, { name });
          setRenameFolderState((prev) => ({ ...prev, open: false }));
        }}
        onCancel={() => setRenameFolderState((prev) => ({ ...prev, open: false }))}
      />

      <RenameDialog
        open={createDirDialog.open}
        initialValue=""
        title={t.browserCreateDir as string}
        onConfirm={(name) => {
          const parentPath = createDirDialog.parentPath;
          if (parentPath?.startsWith('folder:')) {
            const folderId = parentPath.slice('folder:'.length);
            useAppStore.getState().browserCreateTabFolder(name, folderId, 'folder');
          } else if (parentPath?.startsWith('workspace:')) {
            const wsId = parentPath.slice('workspace:'.length);
            useAppStore.getState().browserCreateTabFolder(name, wsId, 'workspace');
          } else {
            useAppStore.getState().browserCreateTabFolder(name, undefined, undefined);
          }
          setCreateDirDialog({ open: false, parentPath: null });
        }}
        onCancel={() => setCreateDirDialog({ open: false, parentPath: null })}
      />

      <ToastContainer toasts={toastMessages} onRemove={removeToast} />
    </>
  );
}
```

- [ ] **Step 2: Add import for BrowserPanelDialogs in BrowserPanel.tsx**

In `frontend/src/app/features/browser/BrowserPanel.tsx`, add import after existing imports (around line 36):

```tsx
import { BrowserPanelDialogs } from './BrowserPanelDialogs';
```

- [ ] **Step 3: Replace inline dialogs JSX in BrowserPanel.tsx (lines 712-783)**

Replace lines 712-783 in `frontend/src/app/features/browser/BrowserPanel.tsx`:

```tsx
      <BrowserContextMenu
        contextMenu={contextMenu}
        onTogglePin={handleTogglePin}
        onRename={handleRenameFromContextMenu(browserTabs, contextMenu, handleDoubleClick)}
        onDelete={handleDeleteFromContextMenu(contextMenu, wrappedHandleCloseTab)}
        onCopyUrl={handleCopyUrlFromMenu}
        onOpenInNewTab={handleOpenInNewTab}
        onOpenInCurrentTab={handleOpenInCurrentTab}
        onEdit={handleRenameFromContextMenu(browserTabs, contextMenu, handleDoubleClick)}
        onCut={() => {}}
      />

      <BrowserPanelDialogs
        t={t}
        createTabDialog={createTabDialog}
        editTabDialog={editTabDialog}
        isCreatingTab={isCreatingTab}
        handleCreateTabConfirm={handleCreateTabConfirm}
        handleCreateTabCancel={handleCreateTabCancel}
        handleEditTabConfirm={handleEditTabConfirm}
        handleEditTabCancel={handleEditTabCancel}
        bookmarkDialogOpen={bookmarkDialogOpen}
        bookmarkTreeData={bookmarkTreeData}
        handleBookmarkAddToFolder={handleBookmarkAddToFolder}
        handleBookmarkCreateDir={handleBookmarkCreateDir}
        setBookmarkDialogOpen={setBookmarkDialogOpen}
        setBookmarkName={setBookmarkName}
        bookmarkName={bookmarkName}
        renameFolderState={renameFolderState}
        setRenameFolderState={setRenameFolderState}
        createDirDialog={createDirDialog}
        setCreateDirDialog={setCreateDirDialog}
        toastMessages={toastMessages}
        removeToast={removeToast}
      />
    </div>
  );
}
```

- [ ] **Step 4: Remove now-unused imports from BrowserPanel.tsx**

Remove the following imports (no longer needed inline):
- `RenameDialog` from `'../../components/RenameDialog'`
- `ToastContainer` from `'../../components/Toast'`
- `CreateTabDialog` from `'./browser-landing'`
- `BookmarkToFolderDialog` from `'./BookmarkToFolderDialog'`

- [ ] **Step 5: Verify typecheck and tests**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm exec vitest run
```

Expected: TypeScript 0 errors, 273 tests passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/BrowserPanelDialogs.tsx
git add frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "refactor: extract BrowserPanelDialogs from BrowserPanel (716→~600 lines)"
```

---

### Task 2: Extract BrowserNavOpenMode from BrowserNavigator

**Files:**
- Create: `frontend/src/app/features/browser/BrowserNavOpenMode.tsx`
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx:321-333`

**Interfaces:**
- Consumes: `browserTabs`, `activeTabId`, `evictedTabIds`, `handleOpenTabFromTree`, `handleCloseTabHandler`
- Produces: `BrowserNavOpenMode` component with props `BrowserNavOpenModeProps`

- [ ] **Step 1: Create BrowserNavOpenMode.tsx**

```tsx
import React from 'react';
import { BrowserOpenTabFlatList } from './BrowserOpenTabFlatList';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

export interface BrowserNavOpenModeProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  evictedTabIds?: ReadonlySet<string>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function BrowserNavOpenMode({
  browserTabs,
  activeTabId,
  evictedTabIds,
  onSelectTab,
  onCloseTab,
}: BrowserNavOpenModeProps) {
  return (
    <BrowserOpenTabFlatList
      browserTabs={browserTabs}
      activeTabId={activeTabId}
      onSelectTab={onSelectTab}
      onCloseTab={onCloseTab}
      evictedTabIds={evictedTabIds}
    />
  );
}
```

- [ ] **Step 2: Add import in BrowserNavigator.tsx**

```tsx
import { BrowserNavOpenMode } from './BrowserNavOpenMode';
```

- [ ] **Step 3: Replace open mode JSX in BrowserNavigator.tsx (lines 321-333)**

Replace:
```tsx
      {navigatorMode === 'open' ? (
        <BrowserOpenTabFlatList
          browserTabs={browserTabs}
          activeTabId={activeTabId}
          onSelectTab={(tabId) => {
            const tab = browserTabs.find((t) => t.id === tabId);
            if (tab) {
              handleOpenTabFromTree(tab.url, tab.id);
            }
          }}
          onCloseTab={(tabId) => handleCloseTabHandler?.(tabId)}
          evictedTabIds={evictedTabIds}
        />
      ) : navigatorMode === 'tabs' ? (
```

With:
```tsx
      {navigatorMode === 'open' ? (
        <BrowserNavOpenMode
          browserTabs={browserTabs}
          activeTabId={activeTabId}
          evictedTabIds={evictedTabIds}
          onSelectTab={(tabId) => {
            const tab = browserTabs.find((t) => t.id === tabId);
            if (tab) {
              handleOpenTabFromTree(tab.url, tab.id);
            }
          }}
          onCloseTab={(tabId) => handleCloseTabHandler?.(tabId)}
        />
      ) : navigatorMode === 'tabs' ? (
```

- [ ] **Step 4: Remove BrowserOpenTabFlatList import in BrowserNavigator.tsx**

Remove: `import { BrowserOpenTabFlatList } from './BrowserOpenTabFlatList';`

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm exec vitest run
```

Expected: TypeScript 0 errors, 273 tests passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/BrowserNavOpenMode.tsx
git add frontend/src/app/features/browser/BrowserNavigator.tsx
git commit -m "refactor: extract BrowserNavOpenMode from BrowserNavigator"
```

---

### Task 3: Extract BrowserNavTabsMode from BrowserNavigator

**Files:**
- Create: `frontend/src/app/features/browser/BrowserNavTabsMode.tsx`
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx:334-376`

**Interfaces:**
- Consumes: `BrowserTabTree` from `'../browser-tree'`, all tab tree props currently passed inline
- Produces: `BrowserNavTabsMode` component

- [ ] **Step 1: Create BrowserNavTabsMode.tsx**

```tsx
import React from 'react';
import { BrowserTabTree } from '../browser-tree';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { BrowserBookmark } from '../../stores/slices/browserSlice';
import type { TabFolderState } from '../../stores/slices/browserFoldersSlice';
import type { BrowserHistoryState } from '../../stores/slices/browserHistorySlice';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { WorkspaceBookmarkEntry } from '../../stores/slices/browserSlice';

export interface BrowserNavTabsModeProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  browserBookmarks?: BrowserBookmark[];
  browserBookmarkTabIdUrlMap?: Record<string, string>;
  tabTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: string, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: string, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: string, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
  labels: {
    workspaceCategory: string;
    userFolderCategory: string;
    historyCategory: string;
  };
}

export function BrowserNavTabsMode({
  visibleWorkspaces,
  browserTabs,
  browserTabFolders,
  browserHistory,
  browserWorkspaceBookmarks,
  browserBookmarks,
  browserBookmarkTabIdUrlMap,
  tabTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  onCreateTab,
  onDeleteAllChildTabs,
  onDeleteOwnChildTabs,
  onOpenAllInNewTabs,
  onRemoveFromArea,
  onDeleteDirectory,
  onRenameDirectory,
  onDeleteHistory,
  onOpenTab,
  onRefreshTab,
  onEditTab,
  onDeleteTab,
  onCopyTabLink,
  onOpenTabInNewTab,
  onOpenTabInCurrentTab,
  onBookmarkTab,
  onRemoveBookmarkTab,
  labels,
}: BrowserNavTabsModeProps) {
  return (
    <BrowserTabTree
      workspaces={visibleWorkspaces}
      browserTabs={browserTabs}
      browserTabFolders={browserTabFolders}
      browserHistory={browserHistory}
      browserWorkspaceBookmarks={browserWorkspaceBookmarks}
      browserBookmarks={browserBookmarks}
      browserBookmarkTabIdUrlMap={browserBookmarkTabIdUrlMap}
      tabTreeExpanded={tabTreeExpanded}
      selectedTreePath={selectedTreePath}
      onSelectTreePath={onSelectTreePath}
      onTogglePath={onTogglePath}
      callbacks={{
        onCreateTab,
        onDeleteAllChildTabs,
        onDeleteOwnChildTabs,
        onOpenAllInNewTabs,
        onRemoveFromArea,
        onDeleteDirectory,
        onRenameDirectory,
        onDeleteHistory,
        onOpenTab,
        onRefreshTab,
        onEditTab,
        onDeleteTab,
        onCopyTabLink,
        onOpenTabInNewTab,
        onOpenTabInCurrentTab,
        onBookmarkTab,
        onRemoveBookmarkTab,
      }}
      labels={labels}
    />
  );
}
```

- [ ] **Step 2: Add import in BrowserNavigator.tsx**

```tsx
import { BrowserNavTabsMode } from './BrowserNavTabsMode';
```

- [ ] **Step 3: Replace tabs mode JSX in BrowserNavigator.tsx (lines 334-376)**

Replace the entire `BrowserTabTree` block for the tabs mode with `BrowserNavTabsMode` component, passing the same props.

- [ ] **Step 4: Remove BrowserTabTree import in BrowserNavigator.tsx**

Remove: `import { BrowserTabTree } from '../browser-tree';`

- [ ] **Step 5: Verify typecheck and tests**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm exec vitest run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/BrowserNavTabsMode.tsx
git add frontend/src/app/features/browser/BrowserNavigator.tsx
git commit -m "refactor: extract BrowserNavTabsMode from BrowserNavigator"
```

---

### Task 4: Extract BrowserNavListMode and BrowserNavSearchMode from BrowserNavigator

**Files:**
- Create: `frontend/src/app/features/browser/BrowserNavListMode.tsx`
- Create: `frontend/src/app/features/browser/BrowserNavSearchMode.tsx`
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx:377-460`

**Interfaces:**
- Consumes: Same `BrowserTabTree` for list mode, `SearchResultItem` + `CustomScrollArea` for search mode
- Produces: `BrowserNavListMode`, `BrowserNavSearchMode` components

- [ ] **Step 1: Create BrowserNavListMode.tsx**

```tsx
import React from 'react';
import { BrowserTabTree } from '../browser-tree';
import type { BrowserNavTabsModeProps } from './BrowserNavTabsMode';

export interface BrowserNavListModeProps {
  visibleWorkspaces: BrowserNavTabsModeProps['visibleWorkspaces'];
  browserTabs: BrowserNavTabsModeProps['browserTabs'];
  browserTabFolders: BrowserNavTabsModeProps['browserTabFolders'];
  browserHistory: BrowserNavTabsModeProps['browserHistory'];
  browserWorkspaceBookmarks: BrowserNavTabsModeProps['browserWorkspaceBookmarks'];
  browserBookmarks?: BrowserNavTabsModeProps['browserBookmarks'];
  browserBookmarkTabIdUrlMap?: BrowserNavTabsModeProps['browserBookmarkTabIdUrlMap'];
  tabTreeExpanded: BrowserNavTabsModeProps['tabTreeExpanded'];
  selectedTreePath: BrowserNavTabsModeProps['selectedTreePath'];
  onSelectTreePath: BrowserNavTabsModeProps['onSelectTreePath'];
  onTogglePath: BrowserNavTabsModeProps['onTogglePath'];
  onCreateTab: BrowserNavTabsModeProps['onCreateTab'];
  onDeleteAllChildTabs: BrowserNavTabsModeProps['onDeleteAllChildTabs'];
  onDeleteOwnChildTabs: BrowserNavTabsModeProps['onDeleteOwnChildTabs'];
  onOpenAllInNewTabs: BrowserNavTabsModeProps['onOpenAllInNewTabs'];
  onRemoveFromArea: BrowserNavTabsModeProps['onRemoveFromArea'];
  onDeleteDirectory: BrowserNavTabsModeProps['onDeleteDirectory'];
  onRenameDirectory: BrowserNavTabsModeProps['onRenameDirectory'];
  onDeleteHistory: BrowserNavTabsModeProps['onDeleteHistory'];
  onOpenTab: BrowserNavTabsModeProps['onOpenTab'];
  onRefreshTab: BrowserNavTabsModeProps['onRefreshTab'];
  onEditTab: BrowserNavTabsModeProps['onEditTab'];
  onDeleteTab: BrowserNavTabsModeProps['onDeleteTab'];
  onCopyTabLink: BrowserNavTabsModeProps['onCopyTabLink'];
  onOpenTabInNewTab: BrowserNavTabsModeProps['onOpenTabInNewTab'];
  onOpenTabInCurrentTab: BrowserNavTabsModeProps['onOpenTabInCurrentTab'];
  onBookmarkTab?: BrowserNavTabsModeProps['onBookmarkTab'];
  onRemoveBookmarkTab?: BrowserNavTabsModeProps['onRemoveBookmarkTab'];
  labels: BrowserNavTabsModeProps['labels'];
}

export function BrowserNavListMode({
  visibleWorkspaces,
  browserTabs,
  browserTabFolders,
  browserHistory,
  browserWorkspaceBookmarks,
  browserBookmarks,
  browserBookmarkTabIdUrlMap,
  tabTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  onCreateTab,
  onDeleteAllChildTabs,
  onDeleteOwnChildTabs,
  onOpenAllInNewTabs,
  onRemoveFromArea,
  onDeleteDirectory,
  onRenameDirectory,
  onDeleteHistory,
  onOpenTab,
  onRefreshTab,
  onEditTab,
  onDeleteTab,
  onCopyTabLink,
  onOpenTabInNewTab,
  onOpenTabInCurrentTab,
  onBookmarkTab,
  onRemoveBookmarkTab,
  labels,
}: BrowserNavListModeProps) {
  return (
    <BrowserTabTree
      viewMode="list"
      workspaces={visibleWorkspaces}
      browserTabs={browserTabs}
      browserTabFolders={browserTabFolders}
      browserHistory={browserHistory}
      browserWorkspaceBookmarks={browserWorkspaceBookmarks}
      browserBookmarks={browserBookmarks}
      browserBookmarkTabIdUrlMap={browserBookmarkTabIdUrlMap}
      tabTreeExpanded={tabTreeExpanded}
      selectedTreePath={selectedTreePath}
      onSelectTreePath={onSelectTreePath}
      onTogglePath={onTogglePath}
      callbacks={{
        onCreateTab,
        onDeleteAllChildTabs,
        onDeleteOwnChildTabs,
        onOpenAllInNewTabs,
        onRemoveFromArea,
        onDeleteDirectory,
        onRenameDirectory,
        onDeleteHistory,
        onOpenTab,
        onRefreshTab,
        onEditTab,
        onDeleteTab,
        onCopyTabLink,
        onOpenTabInNewTab,
        onOpenTabInCurrentTab,
        onBookmarkTab,
        onRemoveBookmarkTab,
      }}
      labels={labels}
    />
  );
}
```

- [ ] **Step 2: Create BrowserNavSearchMode.tsx**

```tsx
import React from 'react';
import { SearchResultItem } from './BrowserSearchOverlay';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';

export interface BrowserNavSearchModeProps {
  searchResults: Array<{ title: string; url: string; source: string }>;
  onSelectResult: (url: string) => void;
}

export function BrowserNavSearchMode({
  searchResults,
  onSelectResult,
}: BrowserNavSearchModeProps) {
  return (
    <CustomScrollArea>
      <ul className="adl-browser-search-results" role="list">
        {searchResults.map((item, index) => (
          <SearchResultItem
            key={`${item.url}-${index}`}
            title={item.title}
            url={item.url}
            source={item.source}
            onSelect={() => onSelectResult(item.url)}
          />
        ))}
      </ul>
    </CustomScrollArea>
  );
}
```

- [ ] **Step 3: Add imports and replace JSX in BrowserNavigator.tsx**

Add imports:
```tsx
import { BrowserNavListMode } from './BrowserNavListMode';
import { BrowserNavSearchMode } from './BrowserNavSearchMode';
```

Replace the list mode JSX (lines 377-395) with:
```tsx
      ) : navigatorMode === 'list' ? (
        <BrowserNavListMode
          visibleWorkspaces={visibleWorkspaces}
          browserTabs={browserTabs}
          browserTabFolders={browserTabFolders}
          browserHistory={browserHistory}
          browserWorkspaceBookmarks={browserWorkspaceBookmarks}
          browserBookmarks={browserBookmarks}
          browserBookmarkTabIdUrlMap={browserBookmarkTabIdUrlMap}
          tabTreeExpanded={tabTreeExpanded}
          selectedTreePath={selectedTreePath}
          onSelectTreePath={handleSelectTreePath}
          onTogglePath={handleToggleTreePath}
          onCreateTab={(workspaceId?: string, folderId?: string) => {
            setCreateTabDialog({ open: true, workspaceId, folderId });
          }}
          onDeleteAllChildTabs={handleDeleteAllChildTabs}
          onDeleteOwnChildTabs={handleDeleteOwnChildTabs}
          onOpenAllInNewTabs={handleOpenAllInNewTabs}
          onRemoveFromArea={handleRemoveFromArea}
          onDeleteDirectory={handleDeleteDirectory}
          onRenameDirectory={(folderId: string) => {
            const folder = browserTabFolders.find((f) => f.id === folderId);
            setRenameFolderState({ open: true, folderId, currentName: folder?.name ?? '' });
          }}
          onDeleteHistory={handleDeleteHistoryLevel}
          onOpenTab={handleOpenTabFromTree}
          onRefreshTab={handleRefreshTab}
          onEditTab={handleEditTab}
          onDeleteTab={handleDeleteTab}
          onCopyTabLink={handleCopyTabLink}
          onOpenTabInNewTab={handleOpenTabInNewTab}
          onOpenTabInCurrentTab={handleOpenTabInCurrentTab}
          onBookmarkTab={handleBookmarkTab}
          onRemoveBookmarkTab={handleRemoveBookmarkTab}
          labels={{
            workspaceCategory: t.browserCategoryWorkspace,
            userFolderCategory: t.browserCategoryUserFolder,
            historyCategory: t.browserCategoryHistory,
          }}
        />
```

Replace the search mode JSX (lines 396-420) with:
```tsx
      ) : navigatorMode === 'search' ? (
        <BrowserNavSearchMode
          searchResults={searchResults}
          onSelectResult={(url) => {
            handleOpenTabFromTree(url);
          }}
        />
```

- [ ] **Step 4: Remove unused imports from BrowserNavigator.tsx**

Remove:
- `import { BrowserTabTree } from '../browser-tree';` (if not already removed)
- `import { CustomScrollArea } from '../file-tree/CustomScrollArea';`
- `import { SearchResultItem } from './BrowserSearchOverlay';`

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm exec vitest run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/BrowserNavListMode.tsx
git add frontend/src/app/features/browser/BrowserNavSearchMode.tsx
git add frontend/src/app/features/browser/BrowserNavigator.tsx
git commit -m "refactor: extract BrowserNavListMode and BrowserNavSearchMode from BrowserNavigator"
```

---

### Task 5: Deep Relative Import Replacement in Browser Module

**Files:**
- Modify: 13 files in `frontend/src/app/features/browser/` and `frontend/src/app/features/browser-tree/`

**Interfaces:**
- Consumes: Vite `@` path alias (already configured: `@` → `frontend/src/`)
- Produces: No API changes, only import path changes

- [ ] **Step 1: Replace `../../` imports in BrowserPanel.tsx**

In `frontend/src/app/features/browser/BrowserPanel.tsx`, replace the following imports:

```tsx
// Before:
import { RenameDialog } from '../../components/RenameDialog';
import { ToastContainer } from '../../components/Toast';
import { useBrowserToast } from './useBrowserToast';
import { useBrowserDialogs } from './useBrowserDialogs';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useBrowserTabs } from './useBrowserTabs';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserUrlChange } from './useBrowserUrlChange';
import { useBrowserSearch, findInBrowserLookupIndex } from './useBrowserSearch';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserPageMeta } from './useBrowserPageMeta';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { useBrowserMenus } from './useBrowserMenus';
import { BrowserContextMenu } from './BrowserContextMenu';
import { BrowserPanelContent } from './BrowserPanelContent';
import { useBrowserThemeSync } from './useBrowserThemeSync';
import { isTauriShell } from '../../../tauri-bridge';
import { CreateTabDialog } from './browser-landing';
import type { BrowserPanelProps } from '../../regions/right-panel/types';
import { useTCopy } from '../../i18n/useTCopy';
import {
  handleRenameFromContextMenu,
  handleDeleteFromContextMenu,
  buildBookmarkDirectoryTree,
} from './browserPanelHelpers';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import { setCachedFavicon } from '../../utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '../../utils/favicon';

// After:
import { RenameDialog } from '@components/RenameDialog';
import { ToastContainer } from '@components/Toast';
import { useBrowserToast } from './useBrowserToast';
import { useBrowserDialogs } from './useBrowserDialogs';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserTabs } from './useBrowserTabs';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserUrlChange } from './useBrowserUrlChange';
import { useBrowserSearch, findInBrowserLookupIndex } from './useBrowserSearch';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserPageMeta } from './useBrowserPageMeta';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { useBrowserMenus } from './useBrowserMenus';
import { BrowserContextMenu } from './BrowserContextMenu';
import { BrowserPanelContent } from './BrowserPanelContent';
import { useBrowserThemeSync } from './useBrowserThemeSync';
import { isTauriShell } from '@tauri-bridge';
import { CreateTabDialog } from './browser-landing';
import type { BrowserPanelProps } from '@regions/right-panel/types';
import { useTCopy } from '@i18n/useTCopy';
import {
  handleRenameFromContextMenu,
  handleDeleteFromContextMenu,
  buildBookmarkDirectoryTree,
} from './browserPanelHelpers';
import { BookmarkToFolderDialog } from './BookmarkToFolderDialog';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import { setCachedFavicon } from '@utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '@utils/favicon';
```

- [ ] **Step 2: Replace deep relative imports in BrowserNavigator.tsx**

Replace `../../icons` → `@icons`, `../../components/Tooltip` → `@components/Tooltip`, `@components/NavigatorResizeHandle` (already using alias), `../../stores/slices/browserSlice` → `@stores/slices/browserSlice`, `../../stores/slices/browserFoldersSlice` → `@stores/slices/browserFoldersSlice`, `../../stores/slices/browserHistorySlice` → `@stores/slices/browserHistorySlice`, `../../components/Toast` → `@components/Toast`, `../../i18n/types` → `@i18n/types`.

- [ ] **Step 3: Replace deep relative imports in BrowserPanelContent.tsx**

Target `../../` imports → `@` aliases: `../../components/Tooltip` → `@components/Tooltip`, `../../stores/slicedStore` → `@stores/slicedStore`, `../../components/ConfirmDialog` → `@components/ConfirmDialog`, `../../hooks/useTooltip` → `@hooks/useTooltip`, `../../i18n/useTCopy` → `@i18n/useTCopy`, `../../utils/fetchPageMeta` → `@utils/fetchPageMeta`, `../../utils/favicon` → `@utils/favicon`.

- [ ] **Step 4: Replace deep relative imports in remaining 10 browser files**

For each file in the browser module with `../../` imports, replace with `@` alias equivalents:
- `BrowserPanelDialogs.tsx`: `../../components/RenameDialog` → `@components/RenameDialog`, `../../components/Toast` → `@components/Toast`, `../../stores/slicedStore` → `@stores/slicedStore`, `../../i18n/types` → `@i18n/types`
- `BrowserOpenTabFlatList.tsx`, `BrowserContextMenu.tsx`, `BrowserSearchOverlay.tsx`, `browser-landing/`, `BookmarkToFolderDialog.tsx`, `checkEmbed.ts`, `browserPanelHelpers.ts`, `useBrowserMenus.ts`, `useBrowserDialogs.ts`, `useBrowserToast.ts`: replace all `../../` and `../../../` imports

- [ ] **Step 5: Verify typecheck and tests**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm exec vitest run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/
git add frontend/src/app/features/browser-tree/
git commit -m "refactor: replace deep relative imports with @ aliases in browser module"
```

---

### Task 6: Restore React.lazy + Suspense for 12 Heavy Components

**Files:**
- Modify: `frontend/src/app/App.tsx:1-30`

**Interfaces:**
- Consumes: React.lazy, React.Suspense
- Produces: Lazy-loaded component wrappers, no API changes

- [ ] **Step 1: Add React.lazy imports in App.tsx**

In `frontend/src/app/App.tsx`, replace the existing static imports of heavy components:

```tsx
import React, { lazy, Suspense } from 'react';

// Lazy-loaded heavy components
const RightPanel = lazy(() => import('@regions/RightPanel'));
const EditorSurfaceShell = lazy(() => import('@regions/right-panel/EditorSurfaceShell'));
const DiffEditorSection = lazy(() => import('@regions/right-panel/panels/DiffEditorSection'));
const ChangesPanel = lazy(() => import('@regions/right-panel/panels/ChangesPanel'));
const GitHubPanel = lazy(() => import('@regions/right-panel/panels/communicate/GitHubPanel'));
const BrowserPanel = lazy(() => import('@regions/right-panel/panels/BrowserPanel'));
const TerminalPanel = lazy(() => import('@regions/right-panel/panels/TerminalPanel'));
const SearchPanel = lazy(() => import('@regions/right-panel/panels/SearchPanel'));
const FilesPanel = lazy(() => import('@regions/right-panel/panels/FilesPanel'));
const SettingsPanel = lazy(() => import('@regions/right-panel/panels/SettingsPanel'));
const AuditPanel = lazy(() => import('@regions/right-panel/panels/AuditPanel'));
const ModelPanel = lazy(() => import('@regions/right-panel/panels/ModelPanel'));
```

- [ ] **Step 2: Wrap each lazy component usage with Suspense**

For each usage of the above components in the render tree, wrap with:

```tsx
<Suspense fallback={<div className="skeleton" style={{ flex: 1 }} />}>
  <RightPanel ... />
</Suspense>
```

Note: The `skeleton` class already exists in `frontend/src/styles/components/skeleton.css` with the `skeleton-shimmer` animation.

- [ ] **Step 3: Verify typecheck and tests**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm exec vitest run
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/App.tsx
git commit -m "perf: restore React.lazy + Suspense for 12 heavy components"
```

---

### Task 7: Final Acceptance — Full Quality Gate

- [ ] **Step 1: Run ESLint fix**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run lint:fix
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run Prettier**

```powershell
pnpm run format
```

Expected: All files unchanged (already formatted).

- [ ] **Step 3: Run TypeScript typecheck**

```powershell
pnpm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```powershell
pnpm exec vitest run
```

Expected: 273 tests passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: quality gate — ESLint, Prettier, typecheck, 273 tests all pass"
```