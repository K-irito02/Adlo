# Branch Graph: Tag Hover Effect & Head Annotation Fix

**Date:** 2026-07-29
**Author:** AI Agent (brainstorming → writing-plans)
**Status:** Design approved, pending implementation

## Problem Summary

Two issues in the Branch Graph visualization component (`BranchGraph.tsx`):

### Issue 1: Ref Label Hover Indicator/Scale Missing

Ref labels rendered by `renderRefLabels()` (e.g., `heatmap-chart-generalization`) lack the indicator bar (`::before` pseudo-element) and scale effect (`transform: scale(1.06)`) on hover. Only column (branch) labels have these effects.

**Root Cause:** `renderRefLabels()` creates `<button>` elements with class `adl-branch-graph__label` but does not set `data-indicator` or `data-scale` attributes. The CSS rules target these attributes:
- `adl-branch-graph__label[data-indicator='true']::before` → indicator bar
- `adl-branch-graph__label[data-scale='true']` → scale transform

The `hoveredLabel` state is already set by `onMouseEnter`/`onMouseLeave` in `renderRefLabels`, but the computed `showIndicator`/`showScale` booleans are only applied to column labels.

### Issue 2: "Branch Head" Annotation on Every Commit

The `CommitTooltipCard` shows "branch head" (`gitVisBranchHead`) for literally every commit that has a branch name and no additional local refs. This is semantically incorrect: "branch head" should only appear on the tip (HEAD) commit of each branch.

**Root Cause:** The annotation logic in `CommitTooltipCard` (lines 198-200) uses a binary check:
```
localRefs.length > 0 ? "merged" : "branch head"
```
No distinction is made between HEAD commits and regular history commits.

## Design: Fix for Issue 1

### Approach

Add `data-indicator` and `data-scale` attributes to ref label buttons in `renderRefLabels()`, mirroring the logic used for column labels.

### Logic

```
For each ref label button:
  showIndicator = hoveredLabel === rl.name  OR  activeRefLabel === rl.name
  showScale     = hoveredLabel === rl.name  XOR  activeRefLabel === rl.name
                  (show scale only when hovered-only OR selected-only, not both)
```

### Required Changes

1. Pass `activeRefLabel` state into `renderRefLabels()`
2. Compute `showIndicator` and `showScale` per ref label
3. Apply `data-indicator` and `data-scale` attributes to `<button>` element

### CSS (already exists, no changes needed)

```css
.adl-branch-graph__label::before {
  /* indicator bar - positioned absolutely above button */
  transform: scaleX(0);
  transition: transform 0.2s ease;
}
.adl-branch-graph__label[data-indicator='true']::before {
  transform: scaleX(1);
}
.adl-branch-graph__label[data-scale='true'] {
  transform: scale(1.06);
}
```

## Design: Fix for Issue 2

### Approach: Single Annotation Priority System

Compute branch head commits from topological data. Use a priority system to show exactly ONE annotation per commit — the most informative one.

### Branch Head Detection

Compute `branchHeads: Set<string>` via `useMemo`:
- Iterate `sortedIds` (topological order, newest first)
- For each commit, record its branch name
- The first encounter of each branch name = the HEAD commit of that branch
- Add that commit's `id` to the set

### Single Annotation Priority

```
Priority 1 (highest): isBranchHead  +  branchProgress exists  +  no mergeBase
                       → "仅本地" (local only)
                       Purpose: Local-only branches (e.g. heatmap-chart-generalization)
                       are the most special case — no remote counterpart exists.

Priority 2:            localRefs.length > 0
                       → "已合并" (merged)
                       Purpose: This commit is reachable by multiple local branches,
                       indicating a merge point or shared ancestor.

Priority 3:            isBranchHead  +  has remote tracking (mergeBase exists)
                       → "分支头" (branch head)
                       Purpose: This is the tip of a normal branch with a remote counterpart.

Priority 4 (none):     Neither of the above
                       → No annotation, show branch name only
                       Purpose: Regular history commits within a branch — no special status.
```

### Decision Tree

```
Commit has a branch?
  ├─ No → no annotation
  └─ Yes → Is this commit a branch HEAD (isBranchHead)?
       ├─ No → no annotation
       └─ Yes → branchProgress?.mergeBase exists?
            ├─ No → "仅本地" (local-only special branch)
            └─ Yes → localRefs.length > 0?
                 ├─ Yes → "已合并" (shared by multiple branches)
                 └─ No → "分支头" (normal branch tip)
```

Wait — this shows "已合并" only after "仅本地". Let me correct the full priority:

```
isBranchHead + branchProgress exists + no mergeBase?
  ├─ Yes → "仅本地" (Priority 1)
  └─ No → localRefs.length > 0?
       ├─ Yes → "已合并" (Priority 2)
       └─ No → isBranchHead?
            ├─ Yes → "分支头" (Priority 3)
            └─ No → no annotation (Priority 4)
```

The key insight: **"仅本地" short-circuits "已合并"**. Even if a local-only branch's commit is also reachable from other branches (which it virtually always is, since local-only branches typically branch off main), the "仅本地" annotation takes priority because it's the most distinguishing characteristic.

### Examples

| Scenario | Annotation | Reasoning |
|---|---|---|
| `heatmap-chart-generalization`'s only commit | "仅本地" | Local-only branch, no remote. Most important info. |
| `main`'s latest commit (with `origin/main`) | "分支头" | Normal branch tip with remote tracking. |
| `main` history commit (not tip) | (none) | Regular commit, no special status. |
| Merge commit shared by `feature` and `main` | "已合并" | Reachable by multiple local branches. |
| `main`'s latest commit, also tagged | "分支头" | No extra local BRANCH refs (tags don't count as localRefs in current filter). |

### Required Changes

1. Compute `branchHeads: Set<string>` in `BranchGraph` component
2. Pass `isBranchHead: boolean` to `CommitTooltipCard`
3. Implement priority-based annotation logic in `CommitTooltipCard`
4. Update i18n keys (already exist: `gitVisBranchHead`, `gitVisLocalOnly`, `gitVisMerged`)

### No i18n Changes Needed

Existing keys already cover all three annotations:
- `gitVisBranchHead: 'branch head'` / `'分支头'`
- `gitVisLocalOnly: 'local only'` / `'仅本地'`
- `gitVisMerged: 'merged'` / `'已合并'`

## Files to Modify

| File | Changes |
|---|---|
| `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | 1. Compute `branchHeads` via useMemo<br>2. Pass `isBranchHead` to `CommitTooltipCard`<br>3. Update annotation priority logic in card<br>4. Add `data-indicator`/`data-scale` to `renderRefLabels()`<br>5. Add inline comments referencing this spec |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` | Update tests to verify new annotation behavior |
| `frontend/src/styles/regions\rightpanel\git-visualization.css` | No changes needed (CSS already handles the attributes) |

## Testing Strategy

1. **Unit test:** Verify `branchHeads` computation produces correct set
2. **Component test:** Tooltip card shows correct annotation for each scenario (local-only, merged, branch head, none)
3. **Visual test:** Hover on ref label shows indicator bar and scale effect