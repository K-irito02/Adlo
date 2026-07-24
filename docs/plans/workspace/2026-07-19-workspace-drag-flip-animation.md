# Workspace Drag FLIP Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static box-shadow indicator drag feedback on the left-sidebar workspace top-level entries with a FLIP (First-Last-Invert-Play) reorder animation, so other items smoothly slide out of the way during drag and there is no jump on mouseup.

**Architecture:** Keep the existing native mouse-event drag skeleton in `WorkspaceList.tsx`. Add a `localOrder` state that drives render order; on each `mousemove` target change, run FLIP directly on the DOM (record old tops → re-render → invert with `transform: translateY(dy)` → play with `transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)`). Remove `dragTargetId` / `dragTargetPosition` state and the corresponding `box-shadow` indicators — the let-through animation itself is the feedback. Persist via existing `onReorderWorkspaces({ pinnedIds, unpinnedIds })` IPC on mouseup only when order actually changed. Pinned/unpinned buckets stay isolated (no FLIP, no IPC call when crossing buckets).

**Tech Stack:** React 19 + TypeScript 5.6 + Vitest 3.x + jsdom. No new dependencies. Pure functions extracted to `dragUtils.ts` for unit testability.

## Global Constraints

- All code must pass `pnpm --dir frontend run lint` (0 errors)
- All code must pass `pnpm --dir frontend run typecheck` (0 errors)
- All frontend tests must pass `pnpm --dir frontend run test`
- ESLint rules: `consistent-type-imports`, `no-require-imports`, `no-empty-object-type`, no `any`, `const`-first, no `else` after return, no import aliases, no star imports
- TypeScript: prefer type inference, use `unknown` + type guards over `any`
- CSS: use `var(--…)` tokens, no hardcoded colors, no `transition: all`
- No new third-party dependencies (the spec explicitly chose native implementation)
- Pinned / unpinned buckets stay isolated — no cross-bucket drag response
- Animation parameters fixed: `200ms` / `cubic-bezier(0.2, 0.8, 0.2, 1)` / `opacity: 0.4` for dragged item
- Spec reference: `docs/specs/2026-07-19-workspace-drag-flip-animation-design.md`

---

### Task 1: Add `mergeOrderPreserving` and `computeReorderedList` pure utilities with tests

**Files:**
- Modify: `ai-digital-life/frontend/src/app/utils/dragUtils.ts`
- Create: `ai-digital-life/frontend/src/app/utils/dragUtils.test.ts`

**Interfaces:**
- Consumes: existing `moveIdBeforeTarget`, `moveIdAfterTarget` from same file
- Produces:
  - `mergeOrderPreserving(currentOrder: string[], externalIds: string[]): string[]` — merges an external id list into a current order, preserving current order for ids still present and appending new ids at the end
  - `computeReorderedList(currentOrder, draggedId, targetId, position, isPinnedBucket, isPinnedById): string[]` — pure function that computes the new full-list order after a single-bucket reorder

- [ ] **Step 1: Write failing tests for `mergeOrderPreserving`**

Create `ai-digital-life/frontend/src/app/utils/dragUtils.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  computeReorderedList,
  mergeOrderPreserving,
  moveIdAfterTarget,
  moveIdBeforeTarget,
  moveIdToBucketEnd,
} from './dragUtils';

describe('moveIdBeforeTarget', () => {
  it('moves dragged id to before target', () => {
    expect(moveIdBeforeTarget(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
  });

  it('appends when target not found', () => {
    expect(moveIdBeforeTarget(['a', 'b'], 'a', 'z')).toEqual(['b', 'a']);
  });

  it('handles dragged id not in list', () => {
    expect(moveIdBeforeTarget(['a', 'b'], 'x', 'b')).toEqual(['x', 'a', 'b']);
  });
});

describe('moveIdAfterTarget', () => {
  it('moves dragged id to after target', () => {
    expect(moveIdAfterTarget(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c']);
  });

  it('appends when target not found', () => {
    expect(moveIdAfterTarget(['a', 'b'], 'a', 'z')).toEqual(['b', 'a']);
  });
});

describe('moveIdToBucketEnd', () => {
  it('moves dragged id to end', () => {
    expect(moveIdToBucketEnd(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
  });
});

describe('mergeOrderPreserving', () => {
  it('preserves current order for ids still present and appends new ones', () => {
    const current = ['a', 'b', 'c'];
    const external = ['c', 'a', 'd']; // 'b' removed, 'd' added
    expect(mergeOrderPreserving(current, external)).toEqual(['a', 'c', 'd']);
  });

  it('returns external when current is empty', () => {
    expect(mergeOrderPreserving([], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('returns empty when both empty', () => {
    expect(mergeOrderPreserving([], [])).toEqual([]);
  });

  it('handles identical lists', () => {
    expect(mergeOrderPreserving(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('does not duplicate ids', () => {
    expect(mergeOrderPreserving(['a', 'b'], ['a', 'b', 'a'])).toEqual(['a', 'b']);
  });
});

describe('computeReorderedList', () => {
  const isPinnedById = (id: string) => id.startsWith('p');

  it('reorders within pinned bucket, keeps unpinned at end', () => {
    const current = ['p1', 'p2', 'u1', 'u2'];
    const result = computeReorderedList(current, 'p1', 'p2', 'after', true, isPinnedById);
    expect(result).toEqual(['p2', 'p1', 'u1', 'u2']);
  });

  it('reorders within unpinned bucket, keeps pinned at start', () => {
    const current = ['p1', 'u1', 'u2', 'u3'];
    const result = computeReorderedList(current, 'u1', 'u3', 'before', false, isPinnedById);
    expect(result).toEqual(['p1', 'u3', 'u1', 'u2']);
  });

  it('returns same order when dragged and target are same', () => {
    const current = ['p1', 'p2', 'u1'];
    const result = computeReorderedList(current, 'p1', 'p1', 'after', true, isPinnedById);
    expect(result).toEqual(['p1', 'p2', 'u1']);
  });

  it('appends to bucket end when target not found', () => {
    const current = ['p1', 'p2', 'u1'];
    const result = computeReorderedList(current, 'p1', 'pZ', 'after', true, isPinnedById);
    expect(result).toEqual(['p2', 'p1', 'u1']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/app/utils/dragUtils.test.ts`
Expected: FAIL with errors "mergeOrderPreserving is not exported" / "computeReorderedList is not exported"

- [ ] **Step 3: Implement `mergeOrderPreserving` and `computeReorderedList`**

Modify `ai-digital-life/frontend/src/app/utils/dragUtils.ts` — append to existing file:

```typescript
/**
 * Merge an external id list into a current order. Preserves the current order
 * for ids still present in `externalIds`, and appends new ids (in external
 * order) at the end. Used to keep `localOrder` in sync when `workspaceItems`
 * changes externally (pin/unpin, add/remove workspace).
 */
export function mergeOrderPreserving(
  currentOrder: string[],
  externalIds: string[]
): string[] {
  const externalSet = new Set(externalIds);
  const kept = currentOrder.filter((id) => externalSet.has(id));
  const existing = new Set(currentOrder);
  const appended = externalIds.filter((id) => !existing.has(id));
  return [...kept, ...appended];
}

/**
 * Compute the new full-list order after a single-bucket reorder.
 *
 * Splits `currentOrder` into same-bucket ids and other-bucket ids, reorders
 * the same-bucket slice using `moveIdBeforeTarget` / `moveIdAfterTarget`,
 * then recombines with pinned-first ordering (matches the WorkspaceList
 * render convention).
 *
 * `isPinnedById` is a lookup function so callers can pass a Map or a closure
 * over `workspaceItems`.
 */
export function computeReorderedList(
  currentOrder: string[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
  isPinnedBucket: boolean,
  isPinnedById: (id: string) => boolean
): string[] {
  const bucketIds = currentOrder.filter((id) => isPinnedById(id) === isPinnedBucket);
  const otherIds = currentOrder.filter((id) => isPinnedById(id) !== isPinnedBucket);
  const nextBucket =
    position === 'after'
      ? moveIdAfterTarget(bucketIds, draggedId, targetId)
      : moveIdBeforeTarget(bucketIds, draggedId, targetId);
  return isPinnedBucket ? [...nextBucket, ...otherIds] : [...otherIds, ...nextBucket];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run src/app/utils/dragUtils.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/utils/dragUtils.ts ai-digital-life/frontend/src/app/utils/dragUtils.test.ts
git commit -m "feat(core): add mergeOrderPreserving and computeReorderedList utilities"
```

---

### Task 2: CSS — remove box-shadow indicators, add transform transition

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/regions/leftbar-workspace.css:24-39`

**Interfaces:**
- Consumes: existing CSS variable tokens `--duration-150`, `--duration-200`, `--ease-default`, `--space-0-5`
- Produces: updated `.adl-workspace-item` transition; removed `.is-drag-target-before` / `.is-drag-target-after` rules

- [ ] **Step 1: Read current CSS**

Read `ai-digital-life/frontend/src/styles/regions/leftbar-workspace.css` lines 1-60 to confirm current state of `.adl-workspace-item` and the two `is-drag-target-*` selectors.

- [ ] **Step 2: Update `.adl-workspace-item` transition and remove indicator rules**

In `ai-digital-life/frontend/src/styles/regions/leftbar-workspace.css`, replace lines 24-39 (the `.adl-workspace-item` block and the two `is-drag-target-*` blocks):

```diff
 .adl-workspace-item {
   margin-bottom: var(--space-0-5);
-  transition: opacity var(--duration-150) var(--ease-default);
+  transition:
+    opacity var(--duration-150) var(--ease-default),
+    transform var(--duration-200) cubic-bezier(0.2, 0.8, 0.2, 1);
+  will-change: transform, opacity;
 }

 .adl-workspace-item.is-dragging {
   opacity: 0.4;
 }

-.adl-workspace-item.is-drag-target-before {
-  box-shadow: inset 0 2px 0 0 var(--accent);
-}
-
-.adl-workspace-item.is-drag-target-after {
-  box-shadow: inset 0 -2px 0 0 var(--accent);
-}
```

The result should look like:

```css
.adl-workspace-item {
  margin-bottom: var(--space-0-5);
  transition:
    opacity var(--duration-150) var(--ease-default),
    transform var(--duration-200) cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform, opacity;
}

.adl-workspace-item.is-dragging {
  opacity: 0.4;
}
```

- [ ] **Step 3: Verify no other CSS file references the removed classes**

Run: `pnpm --dir frontend exec grep -r "is-drag-target-before\|is-drag-target-after" frontend/src --include="*.css" --include="*.tsx" --include="*.ts"`

Expected: no matches anywhere in the codebase.

If matches are found in `.tsx` / `.ts` files (e.g. `WorkspaceList.tsx`), those references will be removed in Task 8. Note them but do not modify yet.

- [ ] **Step 4: Verify lint passes**

Run: `pnpm --dir frontend run lint`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/styles/regions/leftbar-workspace.css
git commit -m "refactor(frontend): remove drag target indicators, add transform transition"
```

---

### Task 3: Add `localOrder` state, ref, and sync effect in `WorkspaceList.tsx`

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`

**Interfaces:**
- Consumes: `mergeOrderPreserving` from `../../utils/dragUtils`
- Produces:
  - `localOrder: string[]` state in `WorkspaceList`
  - `localOrderRef: React.RefObject<string[]>` (mutable ref mirroring `localOrder` for use in document-level event listeners)
  - `useEffect` that syncs `localOrder` when `workspaceItems` prop changes

- [ ] **Step 1: Read the top of `WorkspaceList.tsx` to confirm current state**

Read `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx` lines 1-90 to confirm:
- Imports section (lines 1-16)
- `WorkspaceListProps` interface (lines 18-40)
- Existing drag state declarations (lines 70-82)

- [ ] **Step 2: Add `mergeOrderPreserving` to imports**

In `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`, replace line 42:

```diff
-import { moveIdAfterTarget, moveIdBeforeTarget } from '../../utils/dragUtils';
+import {
+  computeReorderedList,
+  mergeOrderPreserving,
+  moveIdAfterTarget,
+  moveIdBeforeTarget,
+} from '../../utils/dragUtils';
```

> Note: `moveIdAfterTarget` / `moveIdBeforeTarget` are no longer used directly after Task 6 (they're called inside `computeReorderedList`). They will be removed in Task 8. Keeping them imported for now avoids breaking the existing `handleMouseUp` logic during the transition.

- [ ] **Step 3: Add `localOrder` state and `localOrderRef`**

In `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`, find the existing drag state block (around lines 69-82):

```typescript
  // Mouse-based drag state
  const dragSessionRef = useRef<DragSession | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [dragTargetPosition, setDragTargetPosition] = useState<'before' | 'after'>('after');
  const targetIdRef = useRef<string | null>(null);
  const targetPosRef = useRef<'before' | 'after'>('after');
```

Insert after the `targetPosRef` line:

```typescript
  // Local render order — drives the <ul> ordering. Differs from workspaceItems
  // ordering during drag (FLIP reorders locally, persists on mouseup).
  const [localOrder, setLocalOrder] = useState<string[]>(() =>
    workspaceItems.map((w) => w.workspace.id)
  );
  const localOrderRef = useRef<string[]>(localOrder);
  localOrderRef.current = localOrder;

  // Snapshot of localOrder at mousedown — used to detect "did this drag actually
  // change the order?" on mouseup, so we only fire onReorderWorkspaces when needed.
  const sessionStartOrderRef = useRef<string[]>([]);
```

- [ ] **Step 4: Add sync `useEffect`**

Find the existing block:

```typescript
  // Keep refs current to avoid stale closures in document listeners
  const workspaceItemsRef = useRef(workspaceItems);
  workspaceItemsRef.current = workspaceItems;
  const onReorderRef = useRef(onReorderWorkspaces);
  onReorderRef.current = onReorderWorkspaces;
```

Insert after it (before the persistent document-level listeners `useEffect`):

```typescript
  // Sync localOrder when workspaceItems changes externally (pin/unpin, add/remove
  // workspace, or store refresh). Preserves current order for items still
  // present, appends new items at the end.
  useEffect(() => {
    const externalIds = workspaceItems.map((w) => w.workspace.id);
    const merged = mergeOrderPreserving(localOrderRef.current, externalIds);
    if (merged.length !== localOrderRef.current.length ||
        merged.some((id, i) => id !== localOrderRef.current[i])) {
      localOrderRef.current = merged;
      setLocalOrder(merged);
    }
  }, [workspaceItems]);
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS (0 errors)

- [ ] **Step 6: Verify lint passes**

Run: `pnpm --dir frontend run lint`
Expected: PASS (0 errors)

- [ ] **Step 7: Verify existing tests still pass**

Run: `pnpm --dir frontend run test`
Expected: PASS — no regressions

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx
git commit -m "feat(frontend): add localOrder state and sync effect for FLIP drag"
```

---

### Task 4: Render `workspaceItems` by `localOrder` ordering

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx:304-323`

**Interfaces:**
- Consumes: `localOrder` state from Task 3, `workspaceItems` prop, `SidebarWorkspaceItem` type
- Produces: `<ul>` renders items in `localOrder` order instead of `workspaceItems` order. The `targetCls` (CSS class for `is-drag-target-before/after`) is removed from the className computation.

- [ ] **Step 1: Read the render block**

Read `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx` lines 304-330 to confirm current render structure.

- [ ] **Step 2: Replace `workspaceItems.map` with `orderedItems.map` and drop `targetCls`**

In `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`, replace the block starting at line 308 (`{workspaceItems.map((item) => {`) and ending at the corresponding `})}` for the map call.

Old code (lines 308-323):

```tsx
        {workspaceItems.map((item) => {
          const expanded = expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent;
          const workspaceStatusLabel = t[STATUS_LABEL[item.rollupStatus]] as string;
          const isDragging = dragActiveId === item.workspace.id;
          const isTarget = dragTargetId === item.workspace.id;
          const targetCls = isTarget
            ? dragTargetPosition === 'before'
              ? ' is-drag-target-before'
              : ' is-drag-target-after'
            : '';

          return (
            <li
              key={item.workspace.id}
              className={`adl-workspace-item${item.isCurrent ? ' is-current' : ''}${isDragging ? ' is-dragging' : ''}${targetCls}`}
              data-ws-id={item.workspace.id}
            >
```

New code:

```tsx
        {(() => {
          const itemById = new Map(workspaceItems.map((w) => [w.workspace.id, w] as const));
          const orderedItems = localOrder
            .map((id) => itemById.get(id))
            .filter((x): x is SidebarWorkspaceItem => x != null);
          return orderedItems.map((item) => {
            const expanded = expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent;
            const workspaceStatusLabel = t[STATUS_LABEL[item.rollupStatus]] as string;
            const isDragging = dragActiveId === item.workspace.id;

            return (
              <li
                key={item.workspace.id}
                className={`adl-workspace-item${item.isCurrent ? ' is-current' : ''}${isDragging ? ' is-dragging' : ''}`}
                data-ws-id={item.workspace.id}
              >
```

> The IIFE is needed because we need to compute `itemById` and `orderedItems` once before the `.map`. The closing `})}` of the IIFE must match — see Step 3.

- [ ] **Step 3: Close the IIFE correctly**

Find the end of the `.map` callback (search for the `})}` that closes it — currently around line 460+ in the file). The structure is:

```tsx
            </li>
          );
        })}
```

Change it to close both the `.map` and the IIFE:

```tsx
            </li>
          );
          });
        })()}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS (0 errors)

- [ ] **Step 5: Verify lint passes**

Run: `pnpm --dir frontend run lint`
Expected: PASS (0 errors)

- [ ] **Step 6: Verify existing tests still pass**

Run: `pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 7: Manual smoke check (optional, no test)**

Run `pnpm --dir frontend run dev:browser` and open the left sidebar. Verify the workspace list renders in the same order as before (since `localOrder` was initialized from `workspaceItems`).

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx
git commit -m "refactor(frontend): render workspace list by localOrder"
```

---

### Task 5: Snapshot `localOrder` at drag start in `handleRowMouseDown`

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx:227-240`

**Interfaces:**
- Consumes: `localOrderRef` from Task 3, existing `dragSessionRef`
- Produces: `sessionStartOrderRef.current` is populated with a copy of `localOrderRef.current` at mousedown time

- [ ] **Step 1: Read the existing `handleRowMouseDown`**

Read `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx` lines 227-240 to confirm current implementation.

- [ ] **Step 2: Add snapshot assignment**

Replace the `handleRowMouseDown` body. Old code:

```tsx
  const handleRowMouseDown = useCallback(
    (event: React.MouseEvent, wsId: string, isPinned: boolean) => {
      if (event.button !== 0) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
      dragSessionRef.current = {
        draggedId: wsId,
        startY: event.clientY,
        isDragging: false,
        isPinned,
      };
    },
    []
  );
```

New code:

```tsx
  const handleRowMouseDown = useCallback(
    (event: React.MouseEvent, wsId: string, isPinned: boolean) => {
      if (event.button !== 0) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
      // Snapshot the order at drag start so mouseup can detect "did this drag
      // actually change anything?" and skip the IPC call if not.
      sessionStartOrderRef.current = [...localOrderRef.current];
      dragSessionRef.current = {
        draggedId: wsId,
        startY: event.clientY,
        isDragging: false,
        isPinned,
      };
    },
    []
  );
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS

- [ ] **Step 4: Verify lint passes**

Run: `pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx
git commit -m "feat(frontend): snapshot localOrder at drag start"
```

---

### Task 6: Implement FLIP in the `mousemove` handler

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx:84-158` (the `useEffect` with `handleMouseMove`)

**Interfaces:**
- Consumes:
  - `computeReorderedList` from `../../utils/dragUtils` (imported in Task 3)
  - `localOrderRef` / `setLocalOrder` from Task 3
  - `workspaceItemsRef` / `targetIdRef` / `targetPosRef` / `dragSessionRef` (existing)
- Produces: when the mouse moves enough to change the drop target within the same bucket, FLIP runs — records old tops → `setLocalOrder` → on next frame, applies `transform: translateY(dy)` with `transition: none` → forces reflow → switches to `transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)` and clears `transform`.

- [ ] **Step 1: Read the existing `useEffect` block in full**

Read `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx` lines 83-225 (the full `useEffect` with `handleMouseMove`, `cleanupDrag`, `handleMouseUp`, `handleBlur`).

- [ ] **Step 2: Rewrite `handleMouseMove` to do FLIP**

Replace the entire `handleMouseMove` function inside the `useEffect`. The new logic:

1. Detect drag start (4px threshold) — unchanged
2. Find the closest `li[data-ws-id]` to the cursor — keep existing edge-case handling (above first / below last / closest midY)
3. **NEW**: Bucket isolation check — if the target item's `isPinned` doesn't match the dragged item's bucket, return early (no FLIP, no state update)
4. **NEW**: If target unchanged, return early (avoid redundant FLIP)
5. **NEW**: Use `computeReorderedList` to compute the new full-list order
6. **NEW**: If new order equals current order, return early
7. **NEW**: Record old tops of all `li[data-ws-id]`
8. **NEW**: `setLocalOrder(newOrder)` + `localOrderRef.current = newOrder` + update `targetIdRef` / `targetPosRef`
9. **NEW**: In `requestAnimationFrame`, do Invert (set `transform: translateY(dy)` with `transition: none`) → force reflow → Play (set `transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)`, clear `transform`)

Old `handleMouseMove` (lines 85-158) — keep its structure but rewrite the body:

```tsx
    const handleMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      if (!session.isDragging) {
        if (Math.abs(e.clientY - session.startY) <= 4) return;
        session.isDragging = true;
        setDragActiveId(session.draggedId);
      }

      const ul = document.querySelector('.adl-workspace-list');
      if (!ul) return;

      const items = ul.querySelectorAll<HTMLLIElement>('li[data-ws-id]');
      if (items.length === 0) return;

      // ... existing edge-case + closest-item logic to compute foundId, foundPos ...
      // (kept verbatim from current implementation)
```

New `handleMouseMove` (full replacement):

```tsx
    const handleMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      if (!session.isDragging) {
        if (Math.abs(e.clientY - session.startY) <= 4) return;
        session.isDragging = true;
        setDragActiveId(session.draggedId);
      }

      const ul = document.querySelector('.adl-workspace-list');
      if (!ul) return;

      const items = ul.querySelectorAll<HTMLLIElement>('li[data-ws-id]');
      if (items.length === 0) return;

      let foundId: string | null = null;
      let foundPos: 'before' | 'after' = 'after';

      // Edge: cursor above first item's top edge → target first item (before)
      const firstRect = items[0].getBoundingClientRect();
      if (e.clientY < firstRect.top) {
        const firstId = items[0].getAttribute('data-ws-id');
        if (firstId && firstId !== session.draggedId) {
          foundId = firstId;
          foundPos = 'before';
        }
      }
      // Edge: cursor below last item's bottom edge → target last item (after)
      else {
        const lastRect = items[items.length - 1].getBoundingClientRect();
        if (e.clientY > lastRect.bottom) {
          const lastId = items[items.length - 1].getAttribute('data-ws-id');
          if (lastId && lastId !== session.draggedId) {
            foundId = lastId;
            foundPos = 'after';
          }
        }
      }

      // Normal: find closest item
      if (!foundId) {
        let minDist = Infinity;
        let closestId: string | null = null;
        let closestPos: 'before' | 'after' = 'after';
        for (const item of items) {
          const id = item.getAttribute('data-ws-id');
          if (!id || id === session.draggedId) continue;

          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const dist = Math.abs(e.clientY - midY);

          if (dist < minDist) {
            minDist = dist;
            closestId = id;
            closestPos = e.clientY < midY ? 'before' : 'after';
          }
        }
        if (closestId) {
          foundId = closestId;
          foundPos = closestPos;
        }
      }

      if (!foundId) return;

      // Bucket isolation: do not respond if target is in a different bucket.
      const wsItems = workspaceItemsRef.current;
      const targetItem = wsItems.find((w) => w.workspace.id === foundId);
      if (!targetItem) return;
      if (targetItem.workspace.isPinned !== session.isPinned) return;

      // Skip if target unchanged (avoid redundant FLIP).
      if (foundId === targetIdRef.current && foundPos === targetPosRef.current) return;
      targetIdRef.current = foundId;
      targetPosRef.current = foundPos;

      // Compute new full-list order.
      const isPinnedById = (id: string) =>
        wsItems.find((w) => w.workspace.id === id)?.workspace.isPinned ?? false;
      const newOrder = computeReorderedList(
        localOrderRef.current,
        session.draggedId,
        foundId,
        foundPos,
        session.isPinned,
        isPinnedById
      );

      // Skip if order didn't actually change (e.g. dragged id already at target position).
      const currentOrder = localOrderRef.current;
      const changed =
        newOrder.length !== currentOrder.length ||
        newOrder.some((id, i) => id !== currentOrder[i]);
      if (!changed) return;

      // FLIP — First: record old tops.
      const oldRects = new Map<string, number>();
      items.forEach((el) => {
        const id = el.getAttribute('data-ws-id');
        if (id) oldRects.set(id, el.getBoundingClientRect().top);
      });

      // Commit new order to React state (triggers re-render → DOM reorder).
      localOrderRef.current = newOrder;
      setLocalOrder(newOrder);

      // FLIP — Last + Invert + Play, on next frame after React commits.
      requestAnimationFrame(() => {
        const ulAfter = document.querySelector('.adl-workspace-list');
        if (!ulAfter) return;
        const itemsAfter = ulAfter.querySelectorAll<HTMLLIElement>('li[data-ws-id]');
        itemsAfter.forEach((el) => {
          const id = el.getAttribute('data-ws-id');
          if (!id) return;
          const oldTop = oldRects.get(id);
          if (oldTop === undefined) return;
          const newTop = el.getBoundingClientRect().top;
          const dy = oldTop - newTop;
          if (Math.abs(dy) > 0.5) {
            el.style.transition = 'none';
            el.style.transform = `translateY(${dy}px)`;
          }
        });
        // Force reflow so the inverted positions are committed before we re-enable transition.
        ulAfter.offsetHeight;
        // Play: clear transform with transition enabled.
        itemsAfter.forEach((el) => {
          el.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
          el.style.transform = '';
        });
      });
    };
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS

- [ ] **Step 4: Verify lint passes**

Run: `pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 5: Verify existing tests still pass**

Run: `pnpm --dir frontend run test`
Expected: PASS — no regressions

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx
git commit -m "feat(frontend): implement FLIP reorder animation in mousemove"
```

---

### Task 7: Update `mouseup` handler — clean inline styles, conditionally persist

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx:168-207` (the `handleMouseUp` function inside the `useEffect`)

**Interfaces:**
- Consumes:
  - `sessionStartOrderRef` from Task 5
  - `localOrderRef` from Task 3
  - `workspaceItemsRef` / `onReorderRef` (existing)
- Produces: on mouseup, all inline `transform` / `transition` styles are cleared, the dragged item's `is-dragging` class is removed (via state reset), and `onReorderWorkspaces` is called only if the order actually changed during this drag session.

- [ ] **Step 1: Read the existing `handleMouseUp` and `cleanupDrag`**

Read `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx` lines 160-211 to confirm current `cleanupDrag` and `handleMouseUp`.

- [ ] **Step 2: Update `cleanupDrag` to also clear inline styles**

Old `cleanupDrag` (lines 160-166):

```tsx
    const cleanupDrag = () => {
      dragSessionRef.current = null;
      targetIdRef.current = null;
      targetPosRef.current = 'after';
      setDragActiveId(null);
      setDragTargetId(null);
    };
```

New `cleanupDrag`:

```tsx
    const cleanupDrag = () => {
      // Clear inline transform/transition left over from FLIP.
      const ul = document.querySelector('.adl-workspace-list');
      if (ul) {
        ul.querySelectorAll<HTMLLIElement>('li[data-ws-id]').forEach((el) => {
          el.style.transform = '';
          el.style.transition = '';
        });
      }
      dragSessionRef.current = null;
      targetIdRef.current = null;
      targetPosRef.current = 'after';
      sessionStartOrderRef.current = [];
      setDragActiveId(null);
    };
```

> Note: `setDragTargetId(null)` is removed here because Task 8 will remove the `dragTargetId` state entirely. For now, leave it in if the state still exists; remove it together with the state in Task 8. Concretely: if you're running Task 7 before Task 8, keep `setDragTargetId(null);` in `cleanupDrag` and remove it in Task 8.

- [ ] **Step 3: Rewrite `handleMouseUp` to use `sessionStartOrderRef`**

Old `handleMouseUp` (lines 168-207):

```tsx
    const handleMouseUp = () => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      if (session.isDragging) {
        const targetId = targetIdRef.current;
        if (targetId && targetId !== session.draggedId) {
          try {
            const items = workspaceItemsRef.current;
            const onReorder = onReorderRef.current;
            const isPinnedBucket = session.isPinned;
            const bucketItems = items
              .filter((w) => w.workspace.isPinned === isPinnedBucket)
              .map((w) => w.workspace.id);

            if (bucketItems.includes(session.draggedId) && bucketItems.includes(targetId)) {
              const useAfter = targetPosRef.current === 'after';
              const nextIds = useAfter
                ? moveIdAfterTarget(bucketItems, session.draggedId, targetId)
                : moveIdBeforeTarget(bucketItems, session.draggedId, targetId);

              const pinnedIds = isPinnedBucket
                ? nextIds
                : items.filter((w) => w.workspace.isPinned).map((w) => w.workspace.id);
              const unpinnedIds = isPinnedBucket
                ? items.filter((w) => !w.workspace.isPinned).map((w) => w.workspace.id)
                : nextIds;

              onReorder({ pinnedIds, unpinnedIds });
            }
          } catch {
            // ignore reorder error
          }
        }
      }

      cleanupDrag();
    };
```

New `handleMouseUp`:

```tsx
    const handleMouseUp = () => {
      const session = dragSessionRef.current;
      if (!session) return;

      if (session.isDragging) {
        const startOrder = sessionStartOrderRef.current;
        const currentOrder = localOrderRef.current;
        const orderChanged =
          startOrder.length !== currentOrder.length ||
          startOrder.some((id, i) => id !== currentOrder[i]);

        if (orderChanged) {
          const items = workspaceItemsRef.current;
          const isPinnedById = (id: string) =>
            items.find((w) => w.workspace.id === id)?.workspace.isPinned ?? false;
          const pinnedIds = currentOrder.filter((id) => isPinnedById(id));
          const unpinnedIds = currentOrder.filter((id) => !isPinnedById(id));
          onReorderRef.current({ pinnedIds, unpinnedIds });
        }
      }

      cleanupDrag();
    };
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS

- [ ] **Step 5: Verify lint passes**

Run: `pnpm --dir frontend run lint`
Expected: PASS

- [ ] **Step 6: Verify existing tests still pass**

Run: `pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx
git commit -m "feat(frontend): clean inline styles on mouseup, persist only if order changed"
```

---

### Task 8: Remove unused `dragTargetId` / `dragTargetPosition` state and stale imports

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`

**Interfaces:**
- Consumes: all previous tasks completed
- Produces: `dragTargetId` / `dragTargetPosition` state gone; `moveIdAfterTarget` / `moveIdBeforeTarget` imports gone (no longer used directly); `setDragTargetId(null)` call in `cleanupDrag` (if still present) gone.

- [ ] **Step 1: Remove the unused state declarations**

In `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`, find and remove these two lines (added in the original implementation, around line 72-73):

```typescript
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [dragTargetPosition, setDragTargetPosition] = useState<'before' | 'after'>('after');
```

The remaining drag state should be:

```typescript
  // Mouse-based drag state
  const dragSessionRef = useRef<DragSession | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const targetIdRef = useRef<string | null>(null);
  const targetPosRef = useRef<'before' | 'after'>('after');

  // Local render order ...
  const [localOrder, setLocalOrder] = useState<string[]>(...);
  const localOrderRef = useRef<string[]>(localOrder);
  localOrderRef.current = localOrder;
  const sessionStartOrderRef = useRef<string[]>([]);
```

- [ ] **Step 2: Remove `setDragTargetId(null)` from `cleanupDrag` if still present**

In `cleanupDrag` (modified in Task 7), if there's a `setDragTargetId(null);` line, remove it. The final `cleanupDrag` should be:

```tsx
    const cleanupDrag = () => {
      const ul = document.querySelector('.adl-workspace-list');
      if (ul) {
        ul.querySelectorAll<HTMLLIElement>('li[data-ws-id]').forEach((el) => {
          el.style.transform = '';
          el.style.transition = '';
        });
      }
      dragSessionRef.current = null;
      targetIdRef.current = null;
      targetPosRef.current = 'after';
      sessionStartOrderRef.current = [];
      setDragActiveId(null);
    };
```

- [ ] **Step 3: Remove the now-unused `moveIdAfterTarget` / `moveIdBeforeTarget` imports**

In `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`, find the import block (around line 42, modified in Task 3):

```typescript
import {
  computeReorderedList,
  mergeOrderPreserving,
  moveIdAfterTarget,
  moveIdBeforeTarget,
} from '../../utils/dragUtils';
```

Change to:

```typescript
import { computeReorderedList, mergeOrderPreserving } from '../../utils/dragUtils';
```

- [ ] **Step 4: Verify no other references to the removed state remain**

Run: `pnpm --dir frontend exec grep -n "dragTargetId\|dragTargetPosition\|moveIdAfterTarget\|moveIdBeforeTarget" frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`

Expected: no matches.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS (0 errors)

- [ ] **Step 6: Verify lint passes**

Run: `pnpm --dir frontend run lint`
Expected: PASS (0 errors)

- [ ] **Step 7: Verify tests pass**

Run: `pnpm --dir frontend run test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx
git commit -m "refactor(frontend): remove unused dragTargetId/dragTargetPosition state"
```

---

### Task 9: Add `localOrder` merge effect unit test (component-level)

**Files:**
- Create: `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceList` component, `SidebarWorkspaceItem` type, `ReorderWorkspacesInput` type
- Produces: a test file that mounts `WorkspaceList` with mock props and verifies the `localOrder` sync effect correctly merges external changes (add/remove workspace) without losing current drag-induced order.

- [ ] **Step 1: Read an existing component test to understand the test setup pattern**

Read `ai-digital-life/frontend/src/app/utils/sidebarViewModel.test.ts` lines 1-50 to see the import pattern and mock-data builder style. Also check if there's a Vitest setup file:

Run: `pnpm --dir frontend exec grep -r "setupFiles" frontend/vitest.config* frontend/vite.config*`

- [ ] **Step 2: Write failing test for `localOrder` sync on `workspaceItems` prop change**

Create `ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import type { SidebarWorkspaceItem } from '../../utils/sidebarViewModel';
import { WorkspaceList } from './WorkspaceList';

// Build a minimal SidebarWorkspaceItem. Only the fields WorkspaceList reads.
function buildItem(id: string, isPinned: boolean, isCurrent = false): SidebarWorkspaceItem {
  return {
    workspace: {
      id,
      path: `/path/${id}`,
      rootPath: `/path/${id}`,
      name: id,
      lastOpenedAt: Date.now(),
      isPinned,
      pinnedOrder: 0,
      unpinnedOrder: 0,
      removedFromSidebar: false,
      available: true,
      hiddenFromRightPanels: false,
    },
    isCurrent,
    sessions: [],
    archivedSessions: [],
    rollupStatus: 'idle',
    statusCounts: { idle: 0, running: 0, awaiting: 0, error: 0, paused: 0 },
  };
}

function buildProps(overrides: Partial<Parameters<typeof WorkspaceList>[0]> = {}) {
  return {
    workspaceItems: [] as SidebarWorkspaceItem[],
    expandedSessionWorkspaces: {},
    toggleSessionWorkspace: vi.fn(),
    onReorderWorkspaces: vi.fn(),
    onSwitchToWorkspace: vi.fn(),
    onPinWorkspace: vi.fn(),
    onUnpinWorkspace: vi.fn(),
    onCreateSession: vi.fn(),
    onTriggerCreateWorkspace: vi.fn(),
    onSelectSession: vi.fn(),
    onContextMenu: vi.fn(),
    renderSessionRows: () => null,
    workspaceToolbarRef: { current: null },
    ...overrides,
  };
}

describe('WorkspaceList localOrder sync', () => {
  it('renders items in workspaceItems order on initial mount', () => {
    const items = [buildItem('a'), buildItem('b'), buildItem('c')];
    render(<WorkspaceList {...buildProps({ workspaceItems: items })} />);
    const list = document.querySelector('.adl-workspace-list');
    expect(list).not.toBeNull();
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id')
    );
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('preserves current order when an item is removed externally', () => {
    const items = [buildItem('a'), buildItem('b'), buildItem('c')];
    const { rerender } = render(<WorkspaceList {...buildProps({ workspaceItems: items })} />);

    // Remove 'b' externally.
    const nextItems = [buildItem('a'), buildItem('c')];
    rerender(<WorkspaceList {...buildProps({ workspaceItems: nextItems })} />);

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id')
    );
    expect(ids).toEqual(['a', 'c']);
  });

  it('appends new items at the end when added externally', () => {
    const items = [buildItem('a'), buildItem('b')];
    const { rerender } = render(<WorkspaceList {...buildProps({ workspaceItems: items })} />);

    const nextItems = [buildItem('a'), buildItem('b'), buildItem('c'), buildItem('d')];
    rerender(<WorkspaceList {...buildProps({ workspaceItems: nextItems })} />);

    const list = document.querySelector('.adl-workspace-list');
    const ids = Array.from(list!.querySelectorAll('li[data-ws-id]')).map((el) =>
      el.getAttribute('data-ws-id')
    );
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('WorkspaceList mouseup persistence', () => {
  it('does not call onReorderWorkspaces when no drag happened', () => {
    const onReorder = vi.fn();
    render(<WorkspaceList {...buildProps({ onReorderWorkspaces: onReorder })} />);
    // Simulate a stray mouseup with no preceding mousedown.
    fireEvent.mouseUp(document);
    expect(onReorder).not.toHaveBeenCalled();
  });
});

// Helper to satisfy unused-import linter when ReorderWorkspacesInput is referenced in types only.
export type _ReorderWorkspacesInputRef = ReorderWorkspacesInput;
```

- [ ] **Step 3: Run tests to verify they pass (or fix expectations)**

Run: `pnpm --dir frontend exec vitest run src/app/regions/left-sidebar/WorkspaceList.test.tsx`

Expected: PASS. If any test fails because the actual rendered structure differs (e.g. extra `<li>` for empty hint), inspect with `screen.debug()` and adjust the selectors. The tests should specifically check the `li[data-ws-id]` elements, which are only the workspace items (not the empty hint).

If the empty-state `<li class="adl-empty-hint">` interferes when `workspaceItems` is empty, do not query it — all three sync tests pass non-empty `workspaceItems`.

- [ ] **Step 4: Verify lint and typecheck**

Run: `pnpm --dir frontend run lint`
Run: `pnpm --dir frontend run typecheck`
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.test.tsx
git commit -m "test(frontend): cover localOrder sync on workspaceItems changes"
```

---

### Task 10: Final verification — full quality gates and dual-mode manual check

**Files:**
- No code changes — verification only

**Interfaces:**
- Consumes: all previous tasks
- Produces: confirmation that the implementation meets every acceptance criterion from the spec.

- [ ] **Step 1: Run full frontend quality gate**

Run all of these in sequence. Each must pass:

```bash
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

Expected: all PASS, 0 errors.

If `lint:fix` or `format` made changes, re-run `typecheck` and `test`, then commit the formatting changes:

```bash
git add -A
git commit -m "chore(frontend): apply lint/format fixes"
```

- [ ] **Step 2: Confirm no stale references to removed CSS classes anywhere**

Run: `pnpm --dir frontend exec grep -r "is-drag-target-before\|is-drag-target-after" frontend/src`

Expected: no matches.

- [ ] **Step 3: Confirm `dragTargetId` / `dragTargetPosition` are gone from `WorkspaceList.tsx`**

Run: `pnpm --dir frontend exec grep -n "dragTargetId\|dragTargetPosition" frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`

Expected: no matches.

- [ ] **Step 4: Manual verification in browser preview mode**

Run: `pnpm --dir ai-digital-life run dev:browser`

Open the app in a browser. In the left sidebar, perform each of these checks:

- [ ] Drag a workspace item within the unpinned bucket → other items smoothly slide out of the way (200ms)
- [ ] Drag a workspace item within the pinned bucket → same smooth slide
- [ ] Release the mouse → list stays in new order, no visible jump
- [ ] Drag a pinned item towards the unpinned bucket → no FLIP animation, no IPC call, item returns to original position on release
- [ ] Drag an unpinned item towards the pinned bucket → same as above (no response)
- [ ] Drag and release at the original position → no IPC call (no reorder)
- [ ] Drag past the top of the first item → it targets "before" the first item correctly
- [ ] Drag past the bottom of the last item → it targets "after" the last item correctly
- [ ] Press Esc / defocus the window mid-drag → state cleans up, no stuck `.is-dragging` class
- [ ] Open another panel that adds a workspace (or use the new-workspace button) → new workspace appears at the end of the list without disturbing existing order

- [ ] **Step 5: Manual verification in Tauri desktop mode**

Run: `pnpm --dir ai-digital-life run dev:tauri`

Repeat all the checks from Step 4. The animation and behavior should be identical to browser mode.

- [ ] **Step 6: Verify debug log collector shows no errors during drag**

While the app is running, perform a few drag operations. Then click the "Copy Debug Logs" button in the top-right corner. Paste into a text file and search for `error`, `warn`, `exception`. Expected: no errors or warnings emitted during drag operations.

- [ ] **Step 7: Final commit (if any formatting changes from Step 1 weren't committed)**

```bash
git status
# If clean, no commit needed.
# If uncommitted changes:
git add -A
git commit -m "chore(frontend): final formatting after verification"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §3.2 — FLIP approach | Task 6 |
| §3.2 — 200ms / cubic-bezier(0.2, 0.8, 0.2, 1) | Task 2 (CSS), Task 6 (inline) |
| §3.2 — keep native mouse-event skeleton | All tasks (no library introduced) |
| §3.2 — pinned/unpinned isolation | Task 6 (bucket check in mousemove) |
| §3.2 — remove box-shadow indicators | Task 2 (CSS), Task 8 (state removal) |
| §4.3.1 — localOrder + localOrderRef + sessionStartOrderRef | Task 3, Task 5 |
| §4.3.2 — bucket isolation in mousemove | Task 6 |
| §4.3.3 — FLIP with requestAnimationFrame, flushSync fallback note | Task 6 |
| §4.3.4 — render by localOrder | Task 4 |
| §4.3.5 — mouseup cleanup + conditional persist | Task 7 |
| §4.4 — CSS changes | Task 2 |
| §4.5 — remove dragTargetId / dragTargetPosition | Task 8 |
| §4.6 — bucket rendering | Task 4 (via computeReorderedList) |
| §7 — error handling (pointercancel/blur/unmount) | Existing cleanup logic preserved |
| §8.1 — unit tests for utilities | Task 1 |
| §8.1 — unit tests for localOrder merge | Task 9 |
| §8.3 — dual-mode manual verification | Task 10 |
| §12 — acceptance criteria | Task 10 |

All spec sections covered. No gaps.

**Placeholder scan:** No "TBD", "TODO", or "implement later". Every step has complete code or exact commands.

**Type consistency check:**
- `mergeOrderPreserving(currentOrder: string[], externalIds: string[]): string[]` — consistent across Task 1 definition, Task 1 tests, Task 3 usage
- `computeReorderedList(currentOrder, draggedId, targetId, position, isPinnedBucket, isPinnedById): string[]` — consistent across Task 1 definition, Task 1 tests, Task 6 usage
- `localOrderRef: React.RefObject<string[]>` (well, technically `React.MutableRefObject<string[]>` since we assign `.current` directly) — consistent across Task 3, Task 5, Task 6, Task 7
- `sessionStartOrderRef: React.MutableRefObject<string[]>` — consistent across Task 3, Task 5, Task 7
- `SidebarWorkspaceItem` — used in Task 4 and Task 9
- `ReorderWorkspacesInput` — used in Task 9 (imported from `@ai-digital-life/kernel`)

All type signatures match across tasks.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-07-19-workspace-drag-flip-animation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review

Which approach?
