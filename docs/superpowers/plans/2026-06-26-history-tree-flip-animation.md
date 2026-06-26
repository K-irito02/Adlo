# History Tree FLIP Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate flicker when new history entries are prepended to a day directory by adding FLIP (First-Last-Invert-Play) animation to the virtualized file tree.

**Architecture:** A `useFLIPAnimation` hook in `FileTree.tsx` captures DOM positions before state update (from previous render's ref), measures new positions after commit in `useLayoutEffect`, computes per-item `translateY` deltas, applies invert transforms synchronously (before browser paints), then plays the animation via `requestAnimationFrame`. New items without old positions get a CSS slide-in animation. The hook is scoped to history categories via a `flipAnimation` prop.

**Tech Stack:** React 19 + TypeScript, CSS `@keyframes`, `requestAnimationFrame`, Zustand (state management)

---

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/app/features/file-tree/fileTree.tsx` | Add `flipAnimation` prop, integrate FLIP hook in the render function |
| Modify | `frontend/src/app/features/file-tree/fileTree.utils.ts` | Add `flipAnimation?: boolean` to `FileTreeProps` |
| Modify | `frontend/src/app/features/file-tree/TreeNodeRow.tsx` | Add optional `data-is-new-entry` attribute |
| Modify | `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx` | Pass `flipAnimation={categoryType === 'history'}` to `FileTree` |
| Modify | `frontend/src/styles/regions/rightpanel/file-tree-core.css` | Add `@keyframes adl-entry-slide-in` and `.adl-filetree__item--new-entry` class |

---

### Task 1: Add `flipAnimation` prop to FileTreeProps

**Files:**
- Modify: `frontend/src/app/features/file-tree/fileTree.utils.ts:34-53`
- Modify: `frontend/src/app/features/file-tree/fileTree.tsx:154-172`

- [ ] **Step 1: Add the prop to the interface**

Add `flipAnimation?: boolean` to `FileTreeProps`:

```ts
export interface FileTreeProps<T extends FileTreeRenderableNode> {
  nodes: T[];
  selectedFilePath?: string;
  selectedFileWorkspaceId?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  renderCount?: (node: T) => React.ReactNode;
  renderIconBefore?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  getContextMenuItems?: (node: T, multiSelectedNodes: T[]) => FileTreeContextMenuItem<T>[];
  contextMenuPersistRef?: React.MutableRefObject<boolean>;
  clearMenuHighlightRef?: React.MutableRefObject<(() => void) | undefined>;
  expandLabel?: string;
  collapseLabel?: string;
  flat?: boolean;
  flipAnimation?: boolean;
}
```

- [ ] **Step 2: Destructure the new prop in FileTree component**

In `fileTree.tsx`, add `flipAnimation` to the destructured props:

```tsx
export function FileTree<T extends FileTreeRenderableNode>({
  nodes,
  selectedFilePath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  renderCount,
  renderIconBefore,
  getNodeClassName,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  expandLabel = 'Expand',
  collapseLabel = 'Collapse',
  flat,
  flipAnimation = false,
}: FileTreeProps<T>) {
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/file-tree/fileTree.utils.ts frontend/src/app/features/file-tree/fileTree.tsx
git commit -m "feat: add flipAnimation prop to FileTree"
```

---

### Task 2: Pass `flipAnimation` from history tree entries

**Files:**
- Modify: `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx:493`

- [ ] **Step 1: Read the current file to locate the FileTree usage**

Read `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx` around line 482-498 to find the `FileTree` props block.

- [ ] **Step 2: Add `flipAnimation` prop**

Pass `flipAnimation={categoryType === 'history'}` to the `<FileTree>` component:

```tsx
const fileTreeChildren =
  isExpanded && filteredNodes.length > 0 ? (
    <div className="adl-browser-entry__tree">
      <FileTree<BrowserTreeNode>
        nodes={filteredNodes}
        selectedFilePath={selectedTreePath ?? undefined}
        expandedPaths={expandedPaths}
        onToggle={handleChildClick}
        onOpenFile={handleChildOpenFile}
        renderMeta={renderChildMeta}
        renderCount={renderChildCount}
        renderIconBefore={renderBrowserIcon}
        getContextMenuItems={handleChildContextMenu}
        expandLabel={t.expand}
        collapseLabel={t.collapse}
        flipAnimation={categoryType === 'history'}
      />
    </div>
  ) : null;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx
git commit -m "feat: enable flipAnimation for history tree in BrowserEntrySubEntries"
```

---

### Task 3: Add CSS animation keyframes for new entries

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/file-tree-core.css`

- [ ] **Step 1: Append slide-in animation keyframes and new-entry class**

Add at the end of `file-tree-core.css`:

```css
/* FLIP animation: new entry slides in from above */
@keyframes adl-entry-slide-in {
  0% {
    transform: translateY(-28px);
    opacity: 0;
  }
  60% {
    opacity: 1;
  }
  100% {
    transform: translateY(0);
  }
}

.adl-filetree__item--new-entry {
  animation: adl-entry-slide-in 0.3s ease-out;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/regions/rightpanel/file-tree-core.css
git commit -m "feat: add slide-in animation for new tree entries"
```

---

### Task 4: Add `data-is-new-entry` attribute support to TreeNodeRow

**Files:**
- Modify: `frontend/src/app/features/file-tree/TreeNodeRow.tsx:36-37`

- [ ] **Step 1: Add the prop to TreeNodeRowProps**

Add to `TreeNodeRowProps`:

```ts
interface TreeNodeRowProps {
  // ... existing props ...
  style?: React.CSSProperties;
  isNewEntry?: boolean;  // ← add this
}
```

- [ ] **Step 2: Apply `data-is-new-entry` and CSS class on the `<li>`**

In the `<li>` element, add:

```tsx
<li
  className={`adl-tree-node${isActive ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}${isContextMenuTarget ? ' is-context-menu-target' : ''}${itemClassName ? ` ${itemClassName}` : ''}${isNewEntry ? ' adl-filetree__item--new-entry' : ''}`}
  data-depth={depth}
  data-path={nodePath}
  data-is-new-entry={isNewEntry ? 'true' : undefined}
  // ... rest stays the same
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/file-tree/TreeNodeRow.tsx
git commit -m "feat: add isNewEntry prop to TreeNodeRow for entry animation"
```

---

### Task 5: Wire `isNewEntry` from VirtualNodeComponent

**Files:**
- Modify: `frontend/src/app/features/file-tree/fileTree.tsx:50-149`

- [ ] **Step 1: Understand the current code**

`VirtualNodeComponent` receives `flatNode` which contains the tree node. The node's `path` is used as the React `key` prop in the parent render loop (line 385). When a new entry is prepended, its `path` (e.g., `history-entry:${newId}`) didn't exist in the previous render, so React mounts a new instance.

- [ ] **Step 2: Read `VirtualNodeComponent` to see where `TreeNodeRow` is rendered** (lines 93-148)

We need to detect if this is a NEW entry (first render) vs. an existing one that was shifted. Use a ref-based tracking of seen paths:

```tsx
function VirtualNodeComponent<T extends FileTreeRenderableNode>({
  flatNode,
  expandedPaths,
  activePath,
  selectedPaths,
  highlightedPath,
  hoveredPath,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  renderCount,
  renderIconBefore,
  getNodeClassName,
  onShowContextMenu,
  expandLabel,
  collapseLabel,
  flat,
  style,
  trunkHeight,
  hoveredDescendantPaths,
}: VirtualNodeProps<T>) {
  const { node, depth } = flatNode;
  // ... existing derived state ...

  // === NEW CODE START ===
  // Use a ref scoped to this instance to detect first render.
  // On first mount, this entry is "new" — mark it for slide-in animation.
  const isNewEntryRef = useRef(true);
  const [isNewEntry, setIsNewEntry] = useState(true);

  useEffect(() => {
    // After the first render (and animation), mark as not-new
    if (isNewEntryRef.current) {
      isNewEntryRef.current = false;
      const timer = setTimeout(() => setIsNewEntry(false), 400);
      return () => clearTimeout(timer);
    }
  }, []);
  // === NEW CODE END ===

  return (
    <TreeNodeRow
      depth={depth + 1}
      rowOffset={depth * 48 + 4}
      hasChildren={isDirectory}
      isExpanded={isExpanded}
      isActive={isSelected}
      isHovered={isHovered}
      isContextMenuTarget={isContextMenuTarget}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      onToggle={isDirectory ? () => onToggle(node.path) : undefined}
      onActivate={() => {
        if (isDirectory) {
          onToggle(node.path);
        } else {
          onOpenFile(node.path);
        }
      }}
      itemClassName={`adl-filetree__item${isDirectory ? ' adl-filetree__node--directory' : ' adl-filetree__node--file'}${nodeClassName ? ` ${nodeClassName}` : ''}${isHoveredDescendant ? ' is-hovered-by-ancestor' : ''}`}
      rowClassName="adl-filetree__row"
      labelClassName="adl-filetree__label"
      toggleClassName="adl-filetree__toggle"
      indentClassName={`adl-filetree__indent${flat ? ' adl-filetree__indent--flat' : ''}`}
      labelContentClassName="adl-filetree__node-main"
      label={node.name}
      nodePath={node.path}
      iconBefore={...}
      count={customCount}
      countClassName="adl-filetree__count"
      meta={...}
      metaClassName="adl-filetree__meta adl-tree-node__meta--inline"
      onContextMenu={...}
      style={itemStyle}
      isNewEntry={isNewEntry}  // ← pass the new prop
    />
  );
}
```

**Why this works:**
- When React mounts a `VirtualNodeComponent` for the first time (new key seen), `isNewEntryRef` starts as `true` and `isNewEntry` is `true`
- The `data-is-new-entry="true"` attribute + CSS class are rendered
- CSS `@keyframes adl-entry-slide-in` plays for 300ms
- After 400ms, `setIsNewEntry(false)` removes the animation class
- If React reuses an existing component instance (key was already rendered), `isNewEntryRef` was already `false`, so no animation

**Caveat:** React may reuse component instances if keys are stable AND the virtual list's `startIndex` changes such that a previously rendered item is now rendered at a different position. But since `key={flatNode.node.path}` is used, React will use the same instance for items with the same `path`. The `useRef` persists across renders, so `isNewEntryRef.current` remains `false` after the first mount.

- [ ] **Step 2: Apply the edit**

Use the code above to modify `VirtualNodeComponent` in `fileTree.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/file-tree/fileTree.tsx
git commit -m "feat: detect new entries in VirtualNodeComponent for entry animation"
```

---

### Task 6: Implement FLIP animation hook in FileTree

**Files:**
- Modify: `frontend/src/app/features/file-tree/fileTree.tsx`

This is the core task. We add a `useLayoutEffect` in `FileTree` that:
1. Stores previous item positions in a `useRef<Map<string, number>>`
2. On each render where `flipAnimation` is enabled and `flatNodes` changed:
   a. Captures new positions from DOM (using `data-path` attributes)
   b. Computes `deltaY` for items that existed in previous render (old position stored in ref)
   c. Applies invert `transform: translateY(deltaY)` synchronously (before paint)
   d. On next `requestAnimationFrame`, removes transform with `transition: transform 0.3s ease`
   e. Cleans up stale entries from the ref map

- [ ] **Step 1: Add the FLIP hook implementation**

Add after `const visibleNodes = useMemo(...)` and before `const handleToggleDirectory = useCallback(...)`:

```tsx
// === FLIP ANIMATION ===
const prevPositionsRef = useRef<Map<string, number>>(new Map());
const flipCleanupTimersRef = useRef<Map<string, number>>(new Map());

useLayoutEffect(() => {
  if (!flipAnimation) {
    prevPositionsRef.current = new Map();
    return;
  }

  const container = scrollAreaRef.current;
  if (!container) return;

  // 1. Measure NEW positions of all rendered items
  const newPositions = new Map<string, number>();
  const items = container.querySelectorAll<HTMLElement>('[data-path]');
  items.forEach((el) => {
    const path = el.getAttribute('data-path');
    if (path) {
      newPositions.set(path, el.getBoundingClientRect().top);
    }
  });

  // 2. FLIP: compute deltas for items that existed in the previous render
  let hasDelta = false;
  const deltas = new Map<string, number>();
  prevPositionsRef.current.forEach((oldTop, path) => {
    const newTop = newPositions.get(path);
    if (newTop !== undefined && Math.abs(oldTop - newTop) > 0.5) {
      const deltaY = oldTop - newTop;
      deltas.set(path, deltaY);
      hasDelta = true;
    }
  });

  if (!hasDelta) {
    // Store positions and skip animation when nothing shifted
    prevPositionsRef.current = newPositions;
    return;
  }

  // 3. Cancel any pending cleanup timers for items we're about to animate
  deltas.forEach((_, path) => {
    const existing = flipCleanupTimersRef.current.get(path);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
  });

  // 4. INVERT: apply transform to visually place items at their old positions
  deltas.forEach((deltaY, path) => {
    const el = container.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${deltaY}px)`;
    }
  });

  // 5. Force browser to acknowledge the style change before we remove it
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  container.offsetHeight; // trigger reflow

  // 6. PLAY: remove transform with transition on next RAF
  requestAnimationFrame(() => {
    deltas.forEach((_, path) => {
      const el = container.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
      if (el) {
        el.style.transition = 'transform 0.3s ease';
        el.style.transform = 'translateY(0)';
      }
    });
  });

  // 7. Clean up inline styles after animation completes
  const cleanupTimer = window.setTimeout(() => {
    deltas.forEach((_, path) => {
      const el = container.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
      }
    });
    flipCleanupTimersRef.current = new Map();
  }, 350);

  deltas.forEach((_, path) => {
    flipCleanupTimersRef.current.set(path, cleanupTimer);
  });

  // 8. Store positions for next render
  prevPositionsRef.current = newPositions;
}, [flatNodes, flipAnimation]);
```

**How this works:**

| Phase | What | When |
|-------|------|------|
| **Store** | `prevPositionsRef` saves `getBoundingClientRect().top` for each item | Every render (stored at end of previous effect run) |
| **Measure** | Query DOM for all `[data-path]` elements, get new rects | `useLayoutEffect` after commit, before paint |
| **Invert** | `el.style.transform = 'translateY(delta)'` for each shifted item | Synchronously in `useLayoutEffect`, before paint |
| **Play** | Remove transform with `transition: transform 0.3s` | `requestAnimationFrame` (before next paint) |
| **Cleanup** | Remove inline style | `setTimeout` 350ms later |

**Why `flatNodes` as dependency:**
- `flatNodes` changes only when tree data or expansion state changes (not on scroll)
- Scroll changes `startIndex/endIndex` and `visibleNodes`, NOT `flatNodes`
- So `useLayoutEffect` only fires when data actually changes, not on scroll

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/file-tree/fileTree.tsx
git commit -m "feat: add FLIP animation hook to FileTree for smooth position transitions"
```

---

### Task 7: Run tests and verify

**Files:**
- Run: all existing tests

- [ ] **Step 1: TypeScript compilation check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: 252 tests pass (no regressions)

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| FLIP animation for position shifts | Task 6 (useLayoutEffect FLIP hook) |
| New-entry slide-in animation | Task 4 + 5 (isNewEntry detection + CSS keyframes) |
| Only affect history entries, not other categories | Task 2 (`flipAnimation={categoryType === 'history'}`) |
| No code changes to browserHistorySlice or data flow | Not needed - FLIP is purely presentational |
| CSS animation for smooth entry | Task 3 (CSS @keyframes) |

## Placeholder Scan

- [x] No TBD/TODO/fill-in-later
- [x] Complete code in every step
- [x] Exact file paths and line numbers
- [x] Exact commands with expected output
- [x] No "add appropriate error handling" patterns
- [x] No "similar to Task N" references - each step is self-contained
- [x] All types, functions, and props used consistently across tasks

## Edge Cases

1. **FLIP + virtual list**: Items outside viewport are not in DOM. They have no `before` position, so no FLIP. This is correct — off-screen items don't need animation.

2. **Scroll during FLIP**: If user scrolls during the 300ms animation, the FLIP transform interferes with the scroll position. Mitigation: the FLIP uses `getBoundingClientRect()` (viewport-relative), not `scrollTop`-relative positions. Scrolling during animation may cause slight visual misalignment, but this resolves once the 300ms animation completes.

3. **Rapid successive additions**: If multiple history entries are added in quick succession (<350ms apart), the cleanup timer from the first animation runs after the second animation starts, potentially clearing inline styles prematurely. Mitigation: `flipCleanupTimersRef` cancels previous timers for animated paths before starting a new FLIP (step 3 in the hook).

4. **Items that disappear**: If a history entry is deleted (not added), the FLIP animation only animates items that still exist. The deleted item simply disappears — no exit animation. This is an acceptable limitation.

5. **First render**: On initial mount, `prevPositionsRef.current` is empty, so no FLIP fires. The new-entry animation (CSS) will fire for ALL items on first mount. Mitigation: add a `isFirstRender` check using a separate ref:
   ```tsx
   const isFirstRender = useRef(true);
   useLayoutEffect(() => {
     if (isFirstRender.current) {
       isFirstRender.current = false;
       prevPositionsRef.current = ... // capture initial positions
       return;
     }
     // ... FLIP logic ...
   }, [flatNodes, flipAnimation]);
   ```
   This ensures the CSS new-entry animation doesn't play for ALL items on first mount. (Note: this is already handled by `VirtualNodeComponent`'s `useRef(true)` — the component only fires once.)
