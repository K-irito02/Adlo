# Workspace Settings Three-Column Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace vertical stack of three workspace lists with a responsive three-column CSS grid that gracefully compresses (transform) then clips (curtain overflow) as the panel narrows.

**Architecture:** CSS-driven approach — all visual adaptations use Container Queries on a grid wrapper. Only one JS change: add `title` attribute to the sortable label for native tooltip on truncation. No DnD logic changes, no new React state, no new props.

**Tech Stack:** CSS Container Queries, CSS Grid, existing `@dnd-kit` setup, existing React components.

## Global Constraints

- All visual changes must use CSS Container Queries (`@container`), not `@media` (panel width ≠ viewport width)
- DnD logic (`useWorkspaceDnd.ts`, `computeMove`, `findContainer`) must remain unchanged
- Existing test structure must be preserved — add new tests, don't remove existing ones
- The `.adl-sortable-label` `title` attribute must match the `workspace.name` value exactly (not truncated)

---

### Task 1: Add `title` attribute to sortable label (TDD)

**Files:**
- Modify: `frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx:40`
- Test: `frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx` (add test case)

**Interfaces:**
- Produces: `.adl-sortable-label` element now carries `title={workspace.name}` with the full workspace name

- [ ] **Step 1: Write the failing test**

Add this test case inside the `describe('SortableWorkspaceList')` block in `SortableWorkspaceList.test.tsx`:

```tsx
it('sets title attribute on label for native tooltip', () => {
  renderInDnd(
    <SortableWorkspaceList
      kind="priority"
      title="P"
      desc="d"
      tooltipContent="t"
      items={makeItems(['my-long-workspace-name'])}
      emptyText="Empty"
      removeLabel="Remove {name}"
    />,
  );
  const label = screen.getByText('MY-LONG-WORKSPACE-NAME');
  expect(label.getAttribute('title')).toBe('my-long-workspace-name');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend run test -- --run src/app/features/workspace-settings/SortableWorkspaceList.test.tsx`
Expected: FAIL — `title` attribute is `null` (no `title` prop on the span yet)

- [ ] **Step 3: Add `title` attribute to the label**

In `SortableWorkspaceList.tsx:40`, change:

```tsx
<span className="adl-sortable-label">{workspace.name}</span>
```

to:

```tsx
<span className="adl-sortable-label" title={workspace.name}>{workspace.name}</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend run test -- --run src/app/features/workspace-settings/SortableWorkspaceList.test.tsx`
Expected: PASS — all 8 tests (7 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx
git commit -m "feat(workspace): add title attribute to sortable label for truncation tooltip"
```

---

### Task 2: Add CSS for three-column grid + Container Queries

**Files:**
- Modify: `frontend/src/styles/components/settings.css`

**Interfaces:**
- Consumes: `.adl-sortable-section`, `.adl-sortable-section-title`, `.adl-sortable-section-desc`, `.adl-sortable-item`, `.adl-sortable-label`, `.adl-sortable-handle`, `.adl-sortable-remove` (existing classes, no changes to them)
- Produces: `.workspace-curtain` (overflow hidden parent), `.workspace-grid` (3-column grid with Container Query), `@container` rules for transform/clip phases

- [ ] **Step 1: Add grid container CSS**

Add these styles to the end of `settings.css` (after line 552):

```css
/* ========= Three-Column Grid Layout ========= */

.workspace-curtain {
  overflow: hidden;
  position: relative;
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(80px, 1fr));
  gap: 12px;
  container-type: inline-size;
  container-name: workspace-lists;
}
```

- [ ] **Step 2: Add Container Query rules for transform/clip phases**

Add these rules to `settings.css`, after the grid styles:

```css
/* 🟢 -> 🟡 Transform phase: progressive compression */

/* 420px — hide descriptions, reduce gap */
@container workspace-lists (max-width: 420px) {
  .workspace-grid {
    gap: 8px;
  }
  .adl-sortable-section-desc {
    display: none;
  }
}

/* 360px — reduce font sizes and padding */
@container workspace-lists (max-width: 360px) {
  .adl-sortable-section-title {
    font-size: 12px;
  }
  .adl-sortable-item {
    padding: 4px 6px;
  }
  .ws-section {
    padding: 10px;
  }
}

/* 300px — hide handle and remove buttons (show on hover), truncate names */
@container workspace-lists (max-width: 300px) {
  .adl-sortable-handle,
  .adl-sortable-remove {
    display: none;
  }
  .adl-sortable-item:hover .adl-sortable-handle,
  .adl-sortable-item:hover .adl-sortable-remove {
    display: inline-flex;
  }
  .adl-sortable-section {
    padding: 6px;
  }
}

/* 260px — hide info buttons, minimize padding */
@container workspace-lists (max-width: 260px) {
  .adl-icon-button--info {
    display: none;
  }
  .adl-sortable-section {
    padding: 4px;
  }
}

/* 🔴 Clip phase: handled by .workspace-curtain overflow:hidden +
   grid-template-columns: repeat(3, minmax(80px, 1fr)).
   Below 256px (3*80 + 2*8) grid overflows → parent clips right side.
   No additional CSS needed — the curtain effect is automatic. */
```

- [ ] **Step 3: Apply frontend lint**

Run: `pnpm --dir frontend run lint`
Expected: No new errors (existing warnings are pre-existing).

- [ ] **Step 4: Run frontend tests**

Run: `pnpm --dir frontend run test -- --run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/components/settings.css
git commit -m "feat(workspace): add three-column grid CSS with container query responsive rules"
```

---

### Task 3: Wrap SortableWorkspaceList trio in grid container

**Files:**
- Modify: `frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx`

**Interfaces:**
- Consumes: `.workspace-curtain`, `.workspace-grid` CSS classes (from Task 2)
- Produces: Three-column grid wrapper around the three SortableWorkspaceList components

- [ ] **Step 1: Edit the JSX to add grid wrapper**

In `WorkspaceSettings.tsx`, the `DndContext` children (lines 196-226) currently list three `<SortableWorkspaceList>` directly. Wrap them in the grid containers.

The current structure:

```tsx
<DndContext ...>
  <SortableWorkspaceList kind="priority" ... />
  <SortableWorkspaceList kind="deferred" ... />
  <SortableWorkspaceList kind="natural" ... />

  <DragOverlayPortal ...>
    ...
  </DragOverlayPortal>
</DndContext>
```

Change to:

```tsx
<DndContext ...>
  <div className="workspace-curtain">
    <div className="workspace-grid">
      <SortableWorkspaceList kind="priority" ... />
      <SortableWorkspaceList kind="deferred" ... />
      <SortableWorkspaceList kind="natural" ... />
    </div>
  </div>

  <DragOverlayPortal ...>
    ...
  </DragOverlayPortal>
</DndContext>
```

The `DragOverlayPortal` must stay OUTSIDE the grid (it renders via portal to `document.body` anyway, but keeping it as a sibling of the grid is cleaner).

- [ ] **Step 2: Run existing tests**

Run: `pnpm --dir frontend run test -- --run`
Expected: All tests pass (no behavioral change, only structural).

- [ ] **Step 3: Apply frontend lint**

Run: `pnpm --dir frontend run lint`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx
git commit -m "feat(workspace): wrap sortable lists in three-column grid container"
```

---

### Task 4: Visual verification

**No file changes** — this task is about manual visual testing.

**Interfaces:**
- Verifies all three phases (full, transform, clip) render correctly at different panel widths

- [ ] **Step 1: Start the app in browser mode**

```bash
cd ai-digital-life/frontend
pnpm run dev
```

Open the browser to the displayed URL.

- [ ] **Step 2: Navigate to Workspace Settings**

Open the right panel → Settings → Workspace section. Verify three columns are displayed side by side.

- [ ] **Step 3: Verify full phase (>420px content width)**

- Resize the right panel (or collapse the settings navigator) to get wide content area
- Verify: three equal columns, descriptions visible, info buttons visible, drag handles visible, remove buttons visible, names fully displayed

- [ ] **Step 4: Verify transform phase (260-420px)**

- Narrow the right panel gradually
- Verify at each breakpoint:
  - ~400px: descriptions hidden
  - ~350px: smaller fonts and padding
  - ~280px: drag handles and remove buttons hidden (appear on hover)
  - ~260px: info buttons hidden

- [ ] **Step 5: Verify clip phase (<260px)**

- Narrow the panel below 260px content width
- Verify: rightmost column(s) get progressively clipped by the container edge
- Verify: the clipping is smooth, not a jump
- Verify: expanding the panel makes columns "reappear" from right to left

- [ ] **Step 6: Verify DnD still works**

- Drag a workspace between columns to verify DnD still functions correctly
- Verify: drag overlay appears and follows cursor correctly
- Verify: items move between columns as expected

- [ ] **Step 7: Verify Cargo clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings` (from `ai-digital-life/` directory)
Expected: No new warnings.

- [ ] **Step 8: Commit any visual fixes**

If any visual issues are found during verification, fix them and commit.

```bash
git add -A
git commit -m "fix(workspace): adjust grid layout for visual correctness"
```
