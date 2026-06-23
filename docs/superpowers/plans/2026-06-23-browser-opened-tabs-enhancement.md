# Browser Opened Tabs Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the browser panel's "已打开标签" (opened tabs) view: filter to only open tabs, preserve page state across tab switches, add hover close buttons, and ensure navigate-in-place compatibility.

**Architecture:** Add an `onlyOpenTabs` flag that flows from `BrowserNavigator` through the tree components to `buildFlatTabItems`, filtering out inactive directory/history nodes. Implement multi-iframe rendering where each active tab's iframe stays mounted but hidden, preserving its JS/scroll/form state. Add a close button to flat-list and tree-mode tab hover action groups.

**Tech Stack:** React 19 + TypeScript, Zustand, `browserTreeEntryUtils.tsx` (flat list builder), SafeIframe component

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx` | Modify | `buildFlatTabItems` accepts `filterTabIds`, filters by open tabs; `getEntryHoverButtons` / tabButtons include close |
| `frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx` | Modify | Accept `onCloseTab` prop; render close button in tab row hover actions |
| `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx` | Modify | `getTabHoverButtons` includes close; accept `onCloseTab` via callbacks; filter children by `filterTabIds` |
| `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx` | Modify | Accept `filterTabIds` + `onCloseTab`; pass to flat list / sub-entries; flatItems filter |
| `frontend/src/app/features/browser-tree/BrowserCategorySection.tsx` | Modify | Accept `filterTabIds` + `onCloseTab`; pass to BrowserTreeEntry |
| `frontend/src/app/features/browser-tree/BrowserTabTree.tsx` | Modify | Accept `onlyOpenTabs` flag; skip history category when true; build `openTabIds` Set from `browserTabs`; pass down |
| `frontend/src/app/features/browser/BrowserNavigator.tsx` | Modify | Derive `onlyOpenTabs` from `navigatorMode + browserShowTabButtons`; pass to BrowserTabTree |
| `frontend/src/app/features/browser/BrowserPanelContent.tsx` | Modify | Multi-iframe rendering per active tab; pass `onCloseTab` to navigator |
| `frontend/src/app/features/browser/BrowserPanel.tsx` | Modify | Add `activeIframeTabsRef` Set to track activated tabs; propagate to content |
| `frontend/src/styles/regions\rightpanel\browser-webview.css` | Modify | Close button hover alignment; multi-iframe container stacking styles |

---

### Task 1: Add `filterTabIds` to `buildFlatTabItems`

**Files:**
- Modify: `frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx:11-35`
- Test (manual): Switch to opened tabs → list mode, verify empty dirs hidden

- [ ] **Step 1: Add `filterTabIds` parameter to `buildFlatTabItems`**

```typescript
export function buildFlatTabItems(
  node: BrowserTreeNode,
  showSeparators: boolean,
  filterTabIds?: Set<string>
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of node.children) {
    if (child.kind === 'file') {
      if (!filterTabIds || (child.tabId && filterTabIds.has(child.tabId))) {
        items.push({ type: 'tab', node: child });
      }
    }
  }

  for (const dir of node.children) {
    if (dir.kind !== 'directory') {
      continue;
    }
    const subItems = collectSubDirItems(dir, dir.name, showSeparators, filterTabIds);
    if (subItems.length > 0) {
      const hasDirectTabs = dir.children.some(
        (c) => c.kind === 'file' && (!filterTabIds || (c.tabId && filterTabIds.has(c.tabId)))
      );
      if (showSeparators && hasDirectTabs) {
        items.push({ type: 'separator', label: dir.name });
      }
      items.push(...subItems);
    }
  }

  return items;
}
```

- [ ] **Step 2: Add `filterTabIds` parameter to `collectSubDirItems`**

```typescript
export function collectSubDirItems(
  dir: BrowserTreeNode,
  pathSoFar: string,
  showSeparators: boolean,
  filterTabIds?: Set<string>
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of dir.children) {
    if (child.kind === 'file') {
      if (!filterTabIds || (child.tabId && filterTabIds.has(child.tabId))) {
        items.push({ type: 'tab', node: child });
      }
    }
  }

  for (const subDir of dir.children) {
    if (subDir.kind !== 'directory') {
      continue;
    }
    const childPath = `${pathSoFar}/${subDir.name}`;
    const deeper = collectSubDirItems(subDir, childPath, showSeparators, filterTabIds);
    if (deeper.length > 0) {
      const hasDirectTabs = subDir.children.some(
        (c) => c.kind === 'file' && (!filterTabIds || (c.tabId && filterTabIds.has(c.tabId)))
      );
      if (showSeparators && hasDirectTabs) {
        items.push({ type: 'separator', label: childPath });
      }
      items.push(...deeper);
    }
  }

  return items;
}
```

- [ ] **Step 3: Run type check**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | Select-String -Pattern "error"`
Expected: No errors (since new param is optional, existing callers won't break)

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx
git commit -m "feat: add filterTabIds to buildFlatTabItems for opened tabs filtering"
```

---

### Task 2: Propagate `onlyOpenTabs` flag through tree components

**Files:**
- Modify: `frontend/src/app/features/browser-tree/BrowserTabTree.tsx:38-66,98-141`
- Modify: `frontend/src/app/features/browser-tree/BrowserCategorySection.tsx:24-81`
- Modify: `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx:16-40,57-59,266-269,292-304,480-497`

- [ ] **Step 1: Add `onlyOpenTabs` prop to `BrowserTabTree`**

In `BrowserTabTree.tsx`, add to `BrowserTabTreeProps` interface:
```typescript
interface BrowserTabTreeProps {
  // ... existing props ...
  onlyOpenTabs?: boolean;
}
```

In the component body, compute `openTabIds` Set and conditionally render history:
```typescript
export function BrowserTabTree({
  // ... existing destructuring ...
  onlyOpenTabs = false,
}: BrowserTabTreeProps) {
  // ... existing useBrowserTreeData call ...

  const openTabIds = useMemo(
    () => (onlyOpenTabs ? new Set(browserTabs.map((t) => t.id)) : undefined),
    [onlyOpenTabs, browserTabs]
  );

  // ... existing handleOpenFile ...

  return (
    <CustomScrollArea ...>
      <BrowserCategorySection
        category={categories.workspaceCategory}
        categoryType="workspace"
        // ... existing props ...
        filterTabIds={openTabIds}
      />
      <BrowserCategorySection
        category={categories.userFolderCategory}
        categoryType="userFolder"
        // ... existing props ...
        filterTabIds={openTabIds}
      />
      {!onlyOpenTabs && (
        <BrowserCategorySection
          category={categories.historyCategory}
          categoryType="history"
          // ... existing props ...
        />
      )}
    </CustomScrollArea>
  );
}
```

- [ ] **Step 2: Add `filterTabIds` prop to `BrowserCategorySection`**

In `BrowserCategorySection.tsx`, add to interface:
```typescript
interface BrowserCategorySectionProps {
  // ... existing props ...
  filterTabIds?: Set<string>;
}
```

Update destructuring and pass to `BrowserTreeEntry`:
```typescript
export function BrowserCategorySection({
  // ... existing destructuring ...
  filterTabIds,
}: BrowserCategorySectionProps) {
  // ... existing code ...

  return (
    <>
      {category.nodes.length > 0 ? (
        category.nodes.map((node) => (
          <BrowserTreeEntry
            key={node.path}
            // ... existing props ...
            filterTabIds={filterTabIds}
          />
        ))
      ) : null}
    </>
  );
}
```

- [ ] **Step 3: Add `filterTabIds` prop to `BrowserTreeEntry`**

In `BrowserTreeEntry.tsx`, add to interface:
```typescript
interface BrowserTreeEntryProps {
  // ... existing props ...
  filterTabIds?: Set<string>;
}
```

Update `flatItems` memo to pass `filterTabIds`:
```typescript
const flatItems = useMemo(
  () => (isFlatMode && isExpanded ? buildFlatTabItems(node, showSeparators, filterTabIds) : []),
  [node, isFlatMode, isExpanded, showSeparators, filterTabIds]
);
```

Pass `filterTabIds` to `BrowserEntrySubEntries`:
```typescript
<BrowserEntrySubEntries
  // ... existing props ...
  filterTabIds={filterTabIds}
/>
```

- [ ] **Step 4: Run type check and lint**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | Select-String -Pattern "error"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-tree/BrowserTabTree.tsx ai-digital-life/frontend/src/app/features/browser-tree/BrowserCategorySection.tsx ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx
git commit -m "feat: propagate onlyOpenTabs flag through tree, hide history category when filtering"
```

---

### Task 3: Wire `onlyOpenTabs` from `BrowserNavigator` to `BrowserTabTree`

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx:29-51,113-166,348-387`
- Modify: `frontend/src/app/features/browser/BrowserPanelContent.tsx:269-281,361-387`

- [ ] **Step 1: Compute `onlyOpenTabs` in `BrowserPanelContent`**

In `BrowserPanelContent.tsx`, add a derived value after line 304:
```typescript
const onlyOpenTabs =
  navigatorMode === 'tabs' && browserShowTabButtons;
```

Pass it to `BrowserNavigator`:
In the `<BrowserNavigator` JSX, add the prop:
```tsx
<BrowserNavigator
  // ... existing props ...
  onlyOpenTabs={onlyOpenTabs}
/>
```

- [ ] **Step 2: Accept `onlyOpenTabs` in `BrowserNavigator`**

In `BrowserNavigator.tsx`, add to `BrowserNavigatorProps` interface:
```typescript
export interface BrowserNavigatorProps {
  // ... existing props ...
  onlyOpenTabs: boolean;
}
```

Add to destructuring in function signature:
```typescript
export function BrowserNavigator({
  // ... existing destructured props ...
  onlyOpenTabs,
}: BrowserNavigatorProps) {
```

Pass to `BrowserTabTree`:
```tsx
<BrowserTabTree
  // ... existing props ...
  onlyOpenTabs={onlyOpenTabs}
/>
```

- [ ] **Step 3: Run type check**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | Select-String -Pattern "error"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserNavigator.tsx ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx
git commit -m "feat: wire onlyOpenTabs flag from BrowserNavigator to BrowserTabTree"
```

---

### Task 4: Add close button to flat list tab rows

**Files:**
- Modify: `frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx:9-142`
- Modify: `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx:271-304`

- [ ] **Step 1: Add `onCloseTab` prop and close button to `BrowserTreeEntryFlatList`**

In `BrowserTreeEntryFlatList.tsx`, add `IconClose` to imports:
```typescript
import { IconClose, IconMoreVertical, IconRefreshCw } from '../../icons';
```

Add `onCloseTab` to the interface:
```typescript
interface BrowserTreeEntryFlatListProps {
  flatItems: FlatItem[];
  selectedTreePath: string | null;
  onFlatTabClick: (node: BrowserTreeNode) => void;
  onTabContextMenu: (x: number, y: number, node: BrowserTreeNode) => void;
  onRefreshTab: (tabId: string, url: string) => void;
  onCloseTab: (tabId: string) => void;
}
```

Update destructuring:
```typescript
export const BrowserTreeEntryFlatList = React.memo(function BrowserTreeEntryFlatList({
  flatItems,
  selectedTreePath,
  onFlatTabClick,
  onTabContextMenu,
  onRefreshTab,
  onCloseTab,
}: BrowserTreeEntryFlatListProps) {
```

Add `handleCloseClick` callback after `handleRefreshClick`:
```typescript
const handleCloseClick = useCallback(
  (node: BrowserTreeNode) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.tabId) {
      onCloseTab(node.tabId);
    }
  },
  [onCloseTab]
);
```

Update the `tabBtns` array in the render (around line 77):
```typescript
const tabBtns = [
  {
    id: 'close',
    label: t.browserClose,
    icon: <IconClose size={12} decorative />,
    isClose: true,
  },
  {
    id: 'refresh',
    label: t.browserRefreshMeta,
    icon: <IconRefreshCw size={12} decorative />,
  },
  {
    id: 'more',
    label: t.browserContextMore,
    icon: <IconMoreVertical size={12} decorative />,
  },
];
```

Update the button rendering inside the map (around lines 117-132) to handle the close action:
```typescript
{tabBtns.map((btn) => (
  <TooltipSimple key={btn.id} content={btn.label} placement="top">
    <button
      type="button"
      className={`adl-icon-btn adl-icon-btn--xs${btn.isClose ? ' adl-icon-btn--danger-hover' : ''}`}
      onClick={
        btn.id === 'close'
          ? handleCloseClick(item.node)
          : btn.id === 'more'
            ? handleMoreClick(item.node)
            : handleRefreshClick(item.node)
      }
      aria-label={btn.label}
    >
      {btn.icon}
    </button>
  </TooltipSimple>
))}
```

- [ ] **Step 2: Pipe `onCloseTab` through `BrowserTreeEntry` to flat list**

In `BrowserTreeEntry.tsx`, add `onCloseTab` to the interface (inside props):
```typescript
interface BrowserTreeEntryProps {
  // ... existing props ...
  onCloseTab?: (tabId: string) => void;
}
```

Update destructuring:
```typescript
export const BrowserTreeEntry = React.memo(function BrowserTreeEntry({
  // ... existing destructured props ...
  onCloseTab,
}: BrowserTreeEntryProps) {
```

Pass to `BrowserTreeEntryFlatList`:
```tsx
<BrowserTreeEntryFlatList
  flatItems={flatItems}
  selectedTreePath={selectedTreePath}
  onFlatTabClick={handleFlatTabClick}
  onTabContextMenu={...}
  onRefreshTab={callbacks.onRefreshTab}
  onCloseTab={onCloseTab ?? (() => {})}
/>
```

- [ ] **Step 3: Update `BrowserCategorySection` to pass `onCloseTab`**

In `BrowserCategorySection.tsx`, add `onCloseTab` to interface:
```typescript
interface BrowserCategorySectionProps {
  // ... existing props ...
  onCloseTab?: (tabId: string) => void;
}
```

Pass to `BrowserTreeEntry`:
```tsx
<BrowserTreeEntry
  // ... existing props ...
  onCloseTab={onCloseTab}
/>
```

- [ ] **Step 4: Update `BrowserTabTree` to pass `onCloseTab`**

In `BrowserTabTree.tsx`, pass `callbacks.onDeleteTab` as `onCloseTab`:
```tsx
<BrowserCategorySection
  // ... existing props ...
  onCloseTab={(tabId) => {
    const tab = browserTabs.find((t) => t.id === tabId);
    callbacks.onDeleteTab(tabId, tab?.url ?? '');
  }}
/>
```

Do this for all three `BrowserCategorySection` renders.

- [ ] **Step 5: Run type check**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | Select-String -Pattern "error"`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx ai-digital-life/frontend/src/app/features/browser-tree/BrowserCategorySection.tsx ai-digital-life/frontend/src/app/features/browser-tree/BrowserTabTree.tsx
git commit -m "feat: add hover close button to flat list tab rows and tree mode tabs"
```

---

### Task 5: Add close button to tree mode tab hover actions (BrowserEntrySubEntries)

**Files:**
- Modify: `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx:1-13,211-226,228-392`

- [ ] **Step 1: Add close button to `getTabHoverButtons`**

In `BrowserEntrySubEntries.tsx`, add `IconClose` to imports:
```typescript
import { IconClose, IconPlus, IconTrash, IconMoreVertical, IconRefreshCw } from '../../icons';
```

Add `filterTabIds` to `BrowserEntrySubEntriesProps`:
```typescript
interface BrowserEntrySubEntriesProps {
  node: BrowserTreeNode;
  categoryType: BrowserCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  onOpenFile: (path: string) => void;
  callbacks: SectionCallbacks;
  counts: Map<string, number>;
  filterTabIds?: Set<string>;
}
```

Update `getTabHoverButtons` (line 211-226):
```typescript
function getTabHoverButtons(
  t: CopyDict
): Array<{ id: string; label: string; icon: React.ReactNode; isClose?: boolean }> {
  return [
    {
      id: 'close',
      label: t.browserClose,
      icon: <IconClose size={12} decorative />,
      isClose: true,
    },
    {
      id: 'refresh',
      label: t.browserRefreshMeta,
      icon: <IconRefreshCw size={12} decorative />,
    },
    {
      id: 'more',
      label: t.browserContextMore,
      icon: <IconMoreVertical size={12} decorative />,
    },
  ];
}
```

- [ ] **Step 2: Handle close button click in `renderChildMeta`**

In the `renderChildMeta` function (around line 311), update the button rendering for tab leaf nodes. After the existing `btns.map(...)` section, change the onClick handler:

```typescript
{btns.map((btn) => (
  <TooltipSimple key={btn.id} content={btn.label} placement="top">
    <button
      type="button"
      className={`adl-icon-btn adl-icon-btn--xs${btn.isClose ? ' adl-icon-btn--danger-hover' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (btn.id === 'close') {
          if (childNode.tabId && childNode.url) {
            callbacks.onDeleteTab(childNode.tabId, childNode.url);
          }
        } else if (btn.id === 'more') {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setChildMenuState({
            x: rect.right + 4,
            y: rect.top,
            nodePath: childNode.path,
            nodeType: childNode.nodeType,
            node: childNode,
          });
        } else if (btn.id === 'refresh') {
          if (childNode.tabId && childNode.url) {
            callbacks.onRefreshTab(childNode.tabId, childNode.url);
          }
        }
      }}
      aria-label={btn.label}
    >
      {btn.icon}
    </button>
  </TooltipSimple>
))}
```

- [ ] **Step 3: Add `filterTabIds` to sub-entries file tree children filter**

In `BrowserEntrySubEntries`, update `fileTreeChildren` computation (line 453-470) to filter children when `filterTabIds` is provided:

```typescript
const filteredChildren =
  filterTabIds
    ? node.children.filter(
        (child) => child.kind === 'directory' || (child.tabId && filterTabIds.has(child.tabId))
      )
    : node.children;

const fileTreeChildren =
  isExpanded && filteredChildren.length > 0 ? (
    <div className="adl-browser-entry__tree">
      <FileTree<BrowserTreeNode>
        nodes={filteredChildren}
        // ... rest unchanged ...
      />
    </div>
  ) : null;
```

- [ ] **Step 4: Pass `filterTabIds` from `BrowserTreeEntry` to `BrowserEntrySubEntries`**

Already handled in Task 2 Step 3 — verify the prop is passed.

- [ ] **Step 5: Run type check**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | Select-String -Pattern "error"`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx
git commit -m "feat: add close button to tree mode tab hover actions and filter by openTabIds"
```

---

### Task 6: Multi-iframe state preservation for browser mode

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx:1-100,237-243,553-616`
- Modify: `frontend/src/app/features/browser/BrowserPanelContent.tsx:113-176,322-479`

- [ ] **Step 1: Add `activeIframeTabsRef` and `recordActiveIframe` to `BrowserPanel`**

In `BrowserPanel.tsx`, add after `validatedUrlsRef` (line 69):
```typescript
const activeIframeTabsRef = useRef<Set<string>>(new Set());
```

Add `recordActiveIframe` callback after `handleSelectTreePath`:
```typescript
const recordActiveIframe = useCallback((tabId: string) => {
  activeIframeTabsRef.current.add(tabId);
  if (activeIframeTabsRef.current.size > 10) {
    const inactiveTabs = Array.from(activeIframeTabsRef.current).filter(
      (id) => id !== activeTab?.id
    );
    if (inactiveTabs.length > 0) {
      activeIframeTabsRef.current.delete(inactiveTabs[0]);
    }
  }
}, [activeTab?.id]);
```

- [ ] **Step 2: Add multi-iframe rendering in `BrowserPanelContent`**

In `BrowserPanelContent.tsx`, modify the `BrowserPanelContentProps` interface to add:
```typescript
interface BrowserPanelContentProps {
  // ... existing props ...
  activeIframeTabsRef: React.MutableRefObject<Set<string>>;
}
```

Update destructuring to include `activeIframeTabsRef`.

Replace the single iframe rendering section (lines 416-476) with multi-iframe logic:

```tsx
// After the BrowserNavigator, in the primary area:
<div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
  {!urlState.address ||
  !hasActiveTab ||
  !activeTab?.url ||
  activeTab?.url === 'about:blank' ? (
    <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser">
      <BrowserLandingPage t={t} />
    </div>
  ) : (
    <div className="adl-browser-iframe-stack">
      {browserTabs.map((tab) => {
        const isActive = tab.id === activeTab?.id;
        const wasActivated =
          isActive || activeIframeTabsRef.current.has(tab.id);
        const shouldRender =
          wasActivated &&
          tab.url &&
          tab.url !== 'about:blank' &&
          !isTauriShell();

        if (!shouldRender) {
          return null;
        }

        // Record activation on first render
        if (!activeIframeTabsRef.current.has(tab.id)) {
          activeIframeTabsRef.current.add(tab.id);
        }

        return (
          <div
            key={tab.id}
            className="adl-browser-iframe-layer"
            style={{ display: isActive ? 'block' : 'none' }}
          >
            <ErrorBoundary
              fallback={
                <ExternalLinkError
                  errorKey="browserCannotOpenEmbedded"
                  activeTabUrl={tab.url}
                  t={t}
                  variant="active"
                />
              }
            >
              {!isTauriShell() &&
                validatedUrlsRef.current.has(tab.url!) && (
                  <SafeIframe
                    iframeRef={isActive ? iframeRef : undefined as any}
                    src={tab.url!}
                    className="adl-browser-iframe"
                    title={tab.title}
                    onLoad={isActive ? handleIframeLoad : undefined}
                    onError={isActive ? handleIframeError : undefined}
                    sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                    style={{ display: isBrowserVisible ? undefined : 'none' }}
                  />
                )}

              {!isTauriShell() && isActive && iframeBlockedDetected && (
                <ExternalLinkError
                  errorKey="browserCannotOpenEmbedded"
                  activeTabUrl={activeTab?.url}
                  t={t}
                  variant="blocked"
                />
              )}

              {!isTauriShell() && isActive && iframeLoadError && !iframeBlockedDetected && (
                <ExternalLinkError
                  errorKey="browserConnectionFailed"
                  activeTabUrl={activeTab?.url}
                  t={t}
                  variant="blocked"
                />
              )}

              {isActive && isEmbedPending && (
                <div className="adl-browser-loading">
                  <div className="adl-browser-loading__spinner" />
                </div>
              )}
            </ErrorBoundary>
          </div>
        );
      })}
    </div>
  )}
</div>

{/* Cleanup stale iframe tabs when a tab is closed */}
```

- [ ] **Step 3: Clean up stale iframe refs when tabs close**

Add a `useEffect` in `BrowserPanelContent.tsx` (after the multi-iframe rendering):
```typescript
useEffect(() => {
  const currentTabIds = new Set(browserTabs.map((t) => t.id));
  for (const tabId of activeIframeTabsRef.current) {
    if (!currentTabIds.has(tabId)) {
      activeIframeTabsRef.current.delete(tabId);
    }
  }
}, [browserTabs, activeIframeTabsRef]);
```

- [ ] **Step 4: Update `BrowserPanel.tsx` to pass `activeIframeTabsRef`**

In `BrowserPanel.tsx` (around line 553-616), add `activeIframeTabsRef` to the `<BrowserPanelContent>` JSX props.

- [ ] **Step 5: Add CSS for `adl-browser-iframe-stack` and `adl-browser-iframe-layer`**

In `browser-webview.css`, add:
```css
.adl-browser-iframe-stack {
  position: relative;
  width: 100%;
  height: 100%;
}

.adl-browser-iframe-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.adl-browser-iframe-layer .adl-browser-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
```

- [ ] **Step 6: Run type check and lint**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | Select-String -Pattern "error" && npx eslint . 2>&1 | Select-String -Pattern "error"`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx ai-digital-life/frontend/src/app/features/browser/BrowserPanelContent.tsx ai-digital-life/frontend/src/styles/regions/rightpanel/browser-webview.css
git commit -m "feat: multi-iframe rendering to preserve page state across tab switches"
```

---

### Task 7: Add close button CSS danger-hover style

**Files:**
- Modify: `frontend/src/styles/regions\rightpanel\browser-webview.css:700-739`

- [ ] **Step 1: Add danger-hover style for close icon buttons**

In `browser-webview.css`, after the existing hover actions CSS (around line 739), add:
```css
.adl-icon-btn--danger-hover:hover {
  color: var(--text-danger);
  background: var(--bg-danger-subtle);
}

.adl-icon-btn--danger-hover:hover svg {
  color: var(--text-danger);
}
```

- [ ] **Step 2: Verify CSS variable existence**

Check that `--text-danger` and `--bg-danger-subtle` exist in the design tokens:
Run: `cd ai-digital-life/frontend && npx eslint . --fix 2>&1`
If the variables don't exist, use existing equivalents:
```css
.adl-icon-btn--danger-hover:hover {
  color: var(--color-red-500);
  background: var(--color-red-100);
}
```

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/styles/regions/rightpanel/browser-webview.css
git commit -m "style: add danger-hover style for tab close buttons"
```

---

### Task 8: Integration verification & edge cases

**Files:**
- No new files; manual verification checklist

- [ ] **Step 1: Run full lint + type check**

```bash
cd ai-digital-life/frontend
npx eslint .
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Manual verification — Opened tabs filtering**

1. Open the app, open several tabs in different workspaces
2. Click "已打开标签" button → "文件列表" view
3. Verify: Empty directories are NOT shown
4. Verify: Separators only appear for directories that contain open tabs
5. Verify: History category is NOT shown
6. Switch to "文件树" mode → verify same filtering
7. Switch to "全列表" mode → verify same filtering

- [ ] **Step 3: Manual verification — Page state preservation**

1. Open tab A with form input (e.g., a search box)
2. Type something in the form
3. Switch to tab B
4. Switch back to tab A
5. Verify: Form input is preserved (not reloaded)

- [ ] **Step 4: Manual verification — Close button**

1. Open several tabs
2. In "已打开标签" → "文件列表" view, hover over a tab row
3. Verify: Close (X) button appears on hover
4. Click close button → verify tab is closed
5. Repeat in "文件树" view → verify same behavior

- [ ] **Step 5: Manual verification — Navigate-in-place interaction**

1. Toggle "就地导航" mode on
2. Navigate to a new URL in the address bar
3. Verify: Current tab's URL updates (no new tab created)
4. Switch to another tab, then back
5. Verify: Tab state preserved correctly

- [ ] **Step 6: Manual verification — Edge cases**

1. Close all tabs → verify landing page shows
2. Open tabs with blocked/error URLs → verify error states still work
3. Multiple rapid tab switches → verify no iframe flicker or memory leaks
4. Switch between Tauri mode and browser mode → verify both paths work

- [ ] **Step 7: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "test: verify opened tabs enhancement integration"
```

---

### Task 9: Add unit tests for `buildFlatTabItems` with `filterTabIds`

**Files:**
- Create: `frontend/src/app/features/browser-tree/browserTreeEntryUtils.test.tsx`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect } from 'vitest';
import { buildFlatTabItems } from './browserTreeEntryUtils';
import type { BrowserTreeNode } from './types';

function makeTabNode(tabId: string, name: string): BrowserTreeNode {
  return {
    name,
    path: `tab:${tabId}`,
    kind: 'file',
    nodeType: 'tab',
    tabId,
    url: `https://${name}.example`,
    children: [],
  };
}

function makeDirNode(name: string, path: string, children: BrowserTreeNode[]): BrowserTreeNode {
  return {
    name,
    path,
    kind: 'directory',
    nodeType: 'folder',
    children,
  };
}

describe('buildFlatTabItems with filterTabIds', () => {
  it('returns all tabs when no filter is provided', () => {
    const root = makeDirNode('root', 'root', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const result = buildFlatTabItems(root, false);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(2);
  });

  it('filters to only tabs in filterTabIds set', () => {
    const root = makeDirNode('root', 'root', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
      makeTabNode('t3', 'Tab3'),
    ]);
    const filterTabIds = new Set(['t1', 't3']);
    const result = buildFlatTabItems(root, false, filterTabIds);
    const tabs = result.filter((r) => r.type === 'tab');
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.type === 'tab' ? t.node.tabId : null)).toEqual(['t1', 't3']);
  });

  it('skips empty directories when filtering', () => {
    const dir = makeDirNode('EmptyDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t2']); // t1 is not open, t2 doesn't exist in root
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(0);
  });

  it('keeps separator for directory with open tabs', () => {
    const dir = makeDirNode('OpenDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t1']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'separator')).toHaveLength(1);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(1);
  });

  it('skips separator for directory with no open tabs after filtering', () => {
    const dir = makeDirNode('ClosedDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t3']); // neither t1 nor t2 are open
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result).toHaveLength(0);
  });

  it('recursively filters nested directories', () => {
    const nested = makeDirNode('Inner', 'outer/inner', [
      makeTabNode('t1', 'Tab1'),
    ]);
    const outer = makeDirNode('Outer', 'outer', [nested]);
    const root = makeDirNode('root', 'root', [outer]);
    const filterTabIds = new Set(['t1']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/browser-tree/browserTreeEntryUtils.test.tsx`
Expected: All 6 tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser-tree/browserTreeEntryUtils.test.tsx
git commit -m "test: add unit tests for buildFlatTabItems with filterTabIds"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Task |
|-------------|------|
| Filter to only opened tabs (no empty dirs, separators) | Tasks 1, 2, 3 |
| Hide history category in opened tabs view | Task 2 |
| Page state preserved across tab switches | Task 6 |
| Hover close button on opened tabs in tree | Tasks 4, 5, 7 |
| Navigate-in-place toggle compatibility | Task 8 (verification) |
| Code structure — clear, no redundancy | All tasks follow existing patterns |

### 2. Placeholder Scan

No TBD, TODO, or placeholder patterns found. All steps contain concrete code.

### 3. Type Consistency

- `filterTabIds: Set<string>` — consistent across all interfaces
- `onCloseTab: (tabId: string) => void` — consistent signature
- `onlyOpenTabs: boolean` — passes from `BrowserNavigator` to `BrowserTabTree`
- `activeIframeTabsRef: MutableRefObject<Set<string>>` — consistent across `BrowserPanel` and `BrowserPanelContent`
- `browserClose` i18n key — exists in both zh-CN and en-US (`browserClose: '关闭'` / `'Close'`)
- `IconClose` — available in `../../icons`
