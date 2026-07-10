# Branch Switch Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify branch switching behavior across StatusBar, Changes Panel, and File Panel with consistent stash handling, auto-restore on switch-back, and per-panel UI independence.

**Architecture:** Backend extends `GitBranchSummary` with `has_stash`, adds `pop_auto_stash`/`has_auto_stash` helpers, and updates `switch_git_branch` for auto-pop. Frontend extracts `useStashConfirm` hook, adds `CopyButton` reusable component, enhances `BranchSubCard` with filter buttons + copy, and integrates `BranchMenuItem` into File Panel.

**Tech Stack:** Rust (crates/kernel, crates/workspace), React 19 + TypeScript + Zustand, lucide-animated

## Global Constraints

- `GitBranchSummary` serialization must use `#[serde(rename_all = "camelCase")]` for TS type generation
- Stash message format: `adl-auto-stash:{branch_name}:{timestamp}`
- `git stash push` must include `--include-untracked`
- Stash pop conflict → retain stash (don't delete), return conflict flag
- `WorkspaceGitBranchChangeResult` must add `has_restored: bool` (serialized as `hasRestored`)
- All new i18n keys must be added to both `en-US` and `zh-CN`
- `CopyButton` must use `lucide-animated` `CopyIcon` + `CopyIconHandle`
- Filter buttons must replicate Changes Panel's `.adl-tool-navigator__summary-stat` grid + toggle pattern exactly
- Branch list item order: name | IconCheck | IconPendingCommit | Local/Remote badges | CopyButton
- `switch_git_branch` timing: stash current → git switch → pop target's stash (in that order)
- `switchGitBranch` frontend action must expose `hasRestored` for UI toast display
- `pnpm --dir frontend run test` for frontend tests, `cargo test --workspace` for Rust tests
- `pnpm --dir frontend run lint` + `pnpm --dir frontend run typecheck` + `cargo clippy --workspace --all-targets -- -D warnings` before final commit

---
### Task 1: Backend - has_stash + stash message format + helpers

**Files:**
- Modify: `crates/kernel/src/types/workspace.rs:49-54` (GitBranchSummary + WorkspaceGitBranchChangeResult)
- Modify: `crates/workspace/src/git.rs:138-191, 298-302` (stash helpers + switch_git_branch)
- Modify: `src-tauri/src/commands/workspace_git.rs:83-106, 187-204` (unpack 4-tuple + pass has_restored)
- Modify: `frontend/src/app/stores/actions/gitActions.ts:167-185` (handle hasRestored in result)
- Modify: `frontend/src/preview-bridge/preview-git.ts:56-83` (handle hasRestored)
- Create test at end of `crates/workspace/src/git.rs`

**Interfaces:**
- Produces: `GitBranchSummary { has_stash: bool }`, `has_auto_stash(root, branch) -> bool`, `pop_auto_stash(root, branch) -> Result<(bool, bool), AppError>`, `stash_workspace_changes(root, branch)` updated signature
- Consumes: `capture_git_snapshot(root)`, `run_git_required(root, args)`

- [ ] **Step 1: Add `has_stash` to `GitBranchSummary`**

```rust
// crates/kernel/src/types/workspace.rs line 49-54
pub struct GitBranchSummary {
    pub name: String,
    pub is_current: bool,
    pub local: bool,
    pub remote: bool,
    pub has_stash: bool,
}
```

- [ ] **Step 2: Regenerate TS types**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life && cargo test -p adl-kernel` (triggers `#[ts(export)]` generation)

- [ ] **Step 3: Update `stash_workspace_changes` message format**

```rust
// crates/workspace/src/git.rs
fn stash_workspace_changes(root: &Path, branch_name: &str) -> Result<(), AppError> {
    let message = format!("adl-auto-stash:{}:{}", branch_name, now_ms());
    run_git_required(root, &["stash", "push", "--include-untracked", "--message", &message])?;
    Ok(())
}
```

- [ ] **Step 4: Add `has_auto_stash` function**

```rust
fn has_auto_stash(root: &Path, branch_name: &str) -> bool {
    let stash_list = match run_git_required(root, &["stash", "list", "--format=%s"]) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let prefix = format!("adl-auto-stash:{}:", branch_name);
    stash_list.lines().any(|line| line.trim().starts_with(&prefix))
}
```

- [ ] **Step 5: Add `pop_auto_stash` function**

```rust
fn pop_auto_stash(root: &Path, target_branch: &str) -> Result<bool, AppError> {
    let stash_list = run_git_required(root, &["stash", "list", "--format=%s"])?;
    let prefix = format!("adl-auto-stash:{}:", target_branch);
    // Find the latest matching stash index (search from newest)
    let lines: Vec<&str> = stash_list.lines().collect();
    for (i, line) in lines.iter().rev().enumerate() {
        if line.trim().starts_with(&prefix) {
            let index = lines.len() - 1 - i;
            let stash_ref = format!("stash@{{{}}}", index);
            let pop_result = run_git_required(root, &["stash", "pop", "--index", &stash_ref]);
            match pop_result {
                Ok(_) => return Ok(true),  // popped successfully
                Err(_) => {
                    // Conflict - stash retained (git stash pop on conflict keeps stash)
                    return Ok(false);  // false = conflict occurred, stash retained
                }
            }
        }
    }
    Ok(true)  // no stash to pop is still success (nothing to restore)
}
```

- [ ] **Step 6: Update `switch_git_branch` for auto-pop**

The correct timing: stash current → switch → pop target's stash.

```rust
pub fn switch_git_branch(
    root: &Path,
    branch_name: &str,
    allow_stash: bool,
) -> Result<(GitSnapshot, bool, Option<String>, bool), AppError> {
    let snapshot = capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }
    let previous_branch = snapshot.branch.clone();

    // 1. Stash current dirty changes (if any)
    let should_stash = git_has_local_changes(&snapshot);
    if should_stash && !allow_stash {
        return Err(AppError::InvalidInput(
            "Dirty worktree requires explicit stash confirmation.".into(),
        ));
    }
    if should_stash {
        stash_workspace_changes(root, &previous_branch.clone().unwrap_or_default())?;
    }

    // 2. Switch to target branch
    run_git_required(root, &["switch", branch_name])?;

    // 3. Pop target branch's auto-stash (now on correct branch context)
    let has_restored = pop_auto_stash(root, branch_name)?;

    Ok((capture_git_snapshot(root), should_stash, previous_branch, has_restored))
}
```

The frontend-side `switchGitBranch` action in `gitActions.ts` must also be updated to handle the new 4-tuple return and expose `hasRestored` for UI toast display.

**Return type update in kernel types:**

In `crates/kernel/src/types/workspace.rs`, update `WorkspaceGitBranchChangeResult`:
```rust
pub struct WorkspaceGitBranchChangeResult {
    pub workspace: WorkspaceMeta,
    pub git_snapshot: GitSnapshot,
    pub has_restored: bool,  // new: whether auto-stash was restored on target branch
}
```

- [ ] **Step 7: Run existing tests**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life && cargo test --workspace -p adl-workspace`
Expected: all existing tests pass

- [ ] **Step 8: Commit**

```bash
git add crates/kernel/src/types/workspace.rs crates/workspace/src/git.rs frontend/src/shared/ipc-types.generated.ts
git commit -m "feat(core): add has_stash field and auto-stash pop helpers"
```

---
### Task 2: Frontend - IconPendingCommit + CopyButton component

**Files:**
- Modify: `frontend/src/app/icons/status.tsx` (+IconPendingCommit)
- Modify: `frontend/src/app/icons/index.ts` (+export)
- Create: `frontend/src/app/components/CopyButton.tsx`
- Create: `frontend/src/styles/components/copy-button.css`
- Modify: `frontend/src/app/features/browser/BrowserToolbar.tsx` (refactor to use CopyButton)
- Modify: `frontend/src/styles/regions/rightpanel/browser-toolbar.css` (remove .adl-tool-search__copy)

**Interfaces:**
- Produces: `IconPendingCommit`, `<CopyButton text size className tooltip tooltipCopied onCopy />`
- Consumes: `make` from `icons/helper.tsx`, `CopyIcon + CopyIconHandle` from `lucide-animated`, `TooltipSimple` from components

- [ ] **Step 1: Add IconPendingCommit**

```tsx
// frontend/src/app/icons/status.tsx (after IconGitFork)
export const IconPendingCommit = make(
  <>
    <path d="M13 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M13 16v5" />
    <path d="M13 3v7" />
    <path d="M9 7l4 -4l4 4" />
  </>
);
```

- [ ] **Step 2: Export from index.ts**

```tsx
// frontend/src/app/icons/index.ts - add to status export block
IconPendingCommit,
```

- [ ] **Step 3: Create CopyButton component**

```tsx
// frontend/src/app/components/CopyButton.tsx
import React, { useRef, useState } from 'react';
import { CopyIcon } from 'lucide-animated';
import type { CopyIconHandle } from 'lucide-animated';
import { TooltipSimple } from './Tooltip';
import { useTCopy } from '@i18n/useTCopy';

interface CopyButtonProps {
  text: string;
  size?: number;
  className?: string;
  tooltip?: string;
  tooltipCopied?: string;
  onCopy?: () => void;
}

export function CopyButton({
  text,
  size = 14,
  className,
  tooltip,
  tooltipCopied,
  onCopy,
}: CopyButtonProps) {
  const { t } = useTCopy();
  const [copied, setCopied] = useState(false);
  const copyIconRef = useRef<CopyIconHandle>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const content = copied
    ? (tooltipCopied ?? (t.copySuccessClipboard as string))
    : (tooltip ?? (t.fileCopyBranchName as string));

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(text).catch(() => {});
    copyIconRef.current?.startAnimation();
    setCopied(true);
    onCopy?.();
    if (resetTimerRef.current !== undefined) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      copyIconRef.current?.stopAnimation();
      setCopied(false);
    }, 600);
  };

  return (
    <TooltipSimple content={content} placement="top">
      <button
        type="button"
        className={`adl-copy-btn${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        onClick={handleClick}
        aria-label={content}
      >
        <CopyIcon ref={copyIconRef} size={size as any} />
      </button>
    </TooltipSimple>
  );
}
```

- [ ] **Step 4: Create copy-button.css**

```css
/* frontend/src/styles/components/copy-button.css */
.adl-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color var(--duration-150) var(--ease-default);
}

.adl-copy-btn:hover {
  color: var(--text-primary);
}
```

Import this CSS in the app's main CSS entry.

- [ ] **Step 5: Refactor BrowserToolbar to use CopyButton**

```tsx
// In BrowserToolbar.tsx, replace the copy button block (lines ~174-198):
import { CopyButton } from '@components/CopyButton';

// Replace:
// <button className={`adl-tool-search__copy${copied ? ' is-copied' : ''}`} ...>
//   <CopyIcon ref={copyIconRef} size={14} />
// </button>
// With:
<CopyButton
  text={activeTab?.url ?? address ?? ''}
  tooltip={t.browserCopyLink as string}
  tooltipCopied={t.copySuccessClipboard as string}
/>
```

Remove `useState`, `useRef`, `resetTimerRef`, `copyIconRef` related to copy state from BrowserToolbar (the component still needs `address`, `activeTab` etc.).

- [ ] **Step 6: Clean up browser-toolbar.css**

Remove the `.adl-tool-panel--browser .adl-tool-search__copy` CSS rules (lines 75-98 in browser-toolbar.css) since the button now uses `.adl-copy-btn` class.

- [ ] **Step 7: Run TypeScript check**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/icons/status.tsx frontend/src/app/icons/index.ts frontend/src/app/components/CopyButton.tsx frontend/src/styles/components/copy-button.css frontend/src/app/features/browser/BrowserToolbar.tsx frontend/src/styles/regions/rightpanel/browser-toolbar.css
git commit -m "feat(frontend): add IconPendingCommit and reusable CopyButton component"
```

---
### Task 3: Frontend - useStashConfirm hook + StatusBarGitInfo refactor

**Files:**
- Create: `frontend/src/app/hooks/useStashConfirm.ts`
- Modify: `frontend/src/app/regions/StatusBarGitInfo.tsx`

**Interfaces:**
- Produces: `useStashConfirm(options) -> { pendingAction, needsConfirm, confirm, cancel, setPending }`
- Consumes: `GitSnapshot`, `WorkspaceGitBranchSwitchInput`, `WorkspaceGitBranchCreateInput` from kernel types; `git_has_local_changes` logic

- [ ] **Step 1: Create useStashConfirm hook**

```typescript
// frontend/src/app/hooks/useStashConfirm.ts
import { useState, useCallback } from 'react';
import type { GitSnapshot, WorkspaceGitBranchSwitchInput, WorkspaceGitBranchCreateInput } from '@ai-digital-life/kernel';

type PendingBranchAction =
  | { kind: 'switch'; input: WorkspaceGitBranchSwitchInput }
  | { kind: 'create'; input: WorkspaceGitBranchCreateInput };

interface UseStashConfirmOptions {
  snapshot?: GitSnapshot;
  onConfirm: (action: PendingBranchAction) => Promise<void>;
}

function hasDirtyChanges(snapshot?: GitSnapshot): boolean {
  if (!snapshot) return false;
  return (
    snapshot.staged.length > 0 ||
    snapshot.unstaged.length > 0 ||
    snapshot.untracked.length > 0
  );
}

export function useStashConfirm({ snapshot, onConfirm }: UseStashConfirmOptions) {
  const [pendingAction, setPendingAction] = useState<PendingBranchAction | null>(null);

  const needsConfirm = pendingAction !== null;

  const confirm = useCallback(async () => {
    if (!pendingAction) return;
    await onConfirm(pendingAction);
    setPendingAction(null);
  }, [pendingAction, onConfirm]);

  const cancel = useCallback(() => {
    setPendingAction(null);
  }, []);

  const initiateSwitch = useCallback((input: WorkspaceGitBranchSwitchInput) => {
    if (hasDirtyChanges(snapshot)) {
      setPendingAction({ kind: 'switch', input: { ...input, allowStash: true } });
    } else {
      onConfirm({ kind: 'switch', input });
    }
  }, [snapshot, onConfirm]);

  const initiateCreate = useCallback((input: WorkspaceGitBranchCreateInput) => {
    if (hasDirtyChanges(snapshot)) {
      setPendingAction({ kind: 'create', input: { ...input, allowStash: true } });
    } else {
      onConfirm({ kind: 'create', input });
    }
  }, [snapshot, onConfirm]);

  return { pendingAction, needsConfirm, confirm, cancel, setPendingAction, initiateSwitch, initiateCreate };
}
```

- [ ] **Step 2: Create test for useStashConfirm**

```typescript
// frontend/src/app/hooks/__tests__/useStashConfirm.test.ts
import { renderHook, act } from '@testing-library/react';
import { useStashConfirm } from '../useStashConfirm';
import type { GitSnapshot } from '@ai-digital-life/kernel';

const cleanSnapshot: GitSnapshot = {
  isRepo: true, branch: 'main', head: 'abc123',
  staged: [], unstaged: [], untracked: [], conflicts: [],
  ahead: null, behind: null, capturedAt: 0,
};

const dirtySnapshot: GitSnapshot = {
  ...cleanSnapshot,
  staged: ['file.ts'],
};

describe('useStashConfirm', () => {
  it('switches directly when clean', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: cleanSnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: 'switch', input: { branchName: 'feature', allowStash: false } });
    expect(result.current.needsConfirm).toBe(false);
  });

  it('sets pending when dirty', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.needsConfirm).toBe(true);
  });

  it('calls onConfirm with allowStash:true after confirm', async () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    await act(async () => result.current.confirm());
    expect(onConfirm).toHaveBeenCalledWith({ kind: 'switch', input: { branchName: 'feature', allowStash: true } });
  });

  it('clears pending on cancel', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    act(() => result.current.cancel());
    expect(result.current.needsConfirm).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx vitest run --reporter=verbose src/app/hooks/__tests__/useStashConfirm.test.ts`
Expected: all 4 tests pass

- [ ] **Step 3: Refactor StatusBarGitInfo to use useStashConfirm**

In StatusBarGitInfo.tsx, replace the `pendingBranchAction` state + `handleSwitchBranch`/`handleCreateBranch` logic with:

```tsx
const { pendingAction, needsConfirm, confirm, cancel, initiateSwitch, initiateCreate } =
  useStashConfirm({
    snapshot: gitSnapshot,  // pass from parent or use store directly
    onConfirm: async (action) => {
      if (action.kind === 'switch') {
        await onSwitchGitBranch(action.input);
      } else {
        await onCreateGitBranch(action.input);
      }
      setPendingAction(undefined);
      onRequestClose();
    },
  });
```

Replace the manual dirty check + setPendingBranchAction calls with `initiateSwitch`/`initiateCreate`.
Replace the `pendingBranchAction` JSX conditional with `needsConfirm` and the confirm/cancel handlers.

- [ ] **Step 4: Run existing frontend tests**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run test`
Expected: all existing tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/hooks/useStashConfirm.ts frontend/src/app/hooks/__tests__/useStashConfirm.test.ts frontend/src/app/regions/StatusBarGitInfo.tsx
git commit -m "feat(frontend): add useStashConfirm hook and refactor StatusBarGitInfo"
```

---
### Task 4: Frontend - BranchSubCard enhancement

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx`
- Modify: `frontend/src/styles/regions/rightpanel/changes-panel.css` (filter CSS)

**Interfaces:**
- Consumes: `useStashConfirm`, `CopyButton`, `IconPendingCommit`, `IconCheck`, `IconGitBranch`, `SearchInput`, `Spinner`, `useTCopy`, `useAppStore`
- Produces: Enhanced `BranchSubCard` with filter buttons, CopyButton per branch item, empty states, stash confirm integration

- [ ] **Step 1: Add filter state + compute counts**

```typescript
// Inside BranchSubCard component, add:
const [localFilterActive, setLocalFilterActive] = useState(false);
const [remoteFilterActive, setRemoteFilterActive] = useState(false);

const localCount = useMemo(() => gitBranches.filter(b => b.local).length, [gitBranches]);
const remoteCount = useMemo(() => gitBranches.filter(b => b.remote).length, [gitBranches]);

const filteredBranches = useMemo(() => {
  let result = gitBranches;
  const q = branchSearch.toLowerCase().trim();
  if (q) {
    result = result.filter((b) => b.name.toLowerCase().includes(q));
  }
  // Apply local/remote filters
  const bothActive = localFilterActive && remoteFilterActive;
  const noneActive = !localFilterActive && !remoteFilterActive;
  if (!bothActive && !noneActive) {
    if (localFilterActive) result = result.filter(b => b.local);
    if (remoteFilterActive) result = result.filter(b => b.remote);
  }
  return result;
}, [gitBranches, branchSearch, localFilterActive, remoteFilterActive]);
```

- [ ] **Step 2: Render filter buttons between search and branch list**

```tsx
{/* Filter buttons - after search, before branch list */}
<div className="adl-changes-branch-filters">
  <button
    type="button"
    className={`adl-changes-branch-filter${localFilterActive ? ' is-active' : ''}`}
    onClick={() => setLocalFilterActive(v => !v)}
    aria-pressed={localFilterActive}
  >
    <span className="adl-changes-branch-filter-label">{t.changesBranchLocal}</span>
    <strong className="adl-changes-branch-filter-value">
      <span className="adl-changes-branch-filter-code" aria-hidden="true">L:</span>
      {localCount}
    </strong>
  </button>
  <button
    type="button"
    className={`adl-changes-branch-filter${remoteFilterActive ? ' is-active' : ''}`}
    onClick={() => setRemoteFilterActive(v => !v)}
    aria-pressed={remoteFilterActive}
  >
    <span className="adl-changes-branch-filter-label">{t.changesBranchRemote}</span>
    <strong className="adl-changes-branch-filter-value">
      <span className="adl-changes-branch-filter-code" aria-hidden="true">R:</span>
      {remoteCount}
    </strong>
  </button>
</div>
```

- [ ] **Step 3: Add filter CSS**

```css
/* In changes-panel.css */
.adl-changes-branch-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1-5);
  padding: var(--space-1) var(--space-2) var(--space-1-5);
  border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, var(--surface-subtle), transparent);
}

.adl-changes-branch-filter {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 36px;
  padding: var(--space-1);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid transparent;
  cursor: pointer;
  text-align: center;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  line-height: inherit;
  transition: border-color var(--duration-150) var(--ease-default), background-color var(--duration-150) var(--ease-default);
}

.adl-changes-branch-filter:hover {
  background: transparent;
  border-color: var(--border-default);
}

.adl-changes-branch-filter.is-active {
  background: transparent;
}

.adl-changes-branch-filter-label {
  color: var(--text-muted);
  font-size: 10px;
  white-space: nowrap;
  text-align: center;
}

.adl-changes-branch-filter-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: var(--font-semibold);
  line-height: 1;
  letter-spacing: 0.04em;
}

.adl-changes-branch-filter-value {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1;
}
```

- [ ] **Step 4: Update branch item rendering with CopyButton + new order**

```tsx
// In BranchSubCard's branch item button:
<span className="adl-changes-branch-item-name">{branch.name}</span>
{branch.name === currentBranch ? <IconCheck size={14} decorative /> : null}
{branch.hasStash ? <IconPendingCommit size={14} decorative /> : null}
{branch.local ? (
  <span className="adl-changes-branch-badge adl-changes-branch-badge--local">
    {t.changesBranchLocal}
  </span>
) : null}
{branch.remote ? (
  <span className="adl-changes-branch-badge adl-changes-branch-badge--remote">
    {t.changesBranchRemote}
  </span>
) : null}
<CopyButton text={branch.name} size={12} />
```

- [ ] **Step 5: Update empty states**

```typescript
// Replace the empty/no-results check with:
const isRepo = isRepoProp ?? (gitBranches.length > 0 || !!currentBranch);

// In the loading/branch-list section:
if (isLoadingBranches) {
  // show spinner (unchanged)
} else if (!isRepo) {
  // show "请先初始化为 Git 仓库"
  <div className="adl-changes-branch-empty">{t.changesBranchInitRepo}</div>
} else if (gitBranches.length <= 1 && !branchSearch) {
  // show "暂无其它分支"
  <div className="adl-changes-branch-empty">{t.changesBranchNoOther}</div>
} else if (filteredBranches.length === 0 && branchSearch) {
  // show "搜索分支不存在"
  <div className="adl-changes-branch-empty">{t.changesBranchSearchNone}</div>
} else {
  // render branch list
}
```

The `isRepo` prop needs to be passed to `BranchSubCard`. Add it to the interface:

```typescript
interface BranchSubCardProps {
  // ... existing props ...
  isRepo?: boolean;  // new
}
```

- [ ] **Step 6: Add stash confirm integration**

Import and use `useStashConfirm` in `BranchSubCard`:

```typescript
const { pendingAction, needsConfirm, confirm, cancel, initiateSwitch } = useStashConfirm({
  snapshot: gitSnapshot,
  onConfirm: async (action) => {
    if (action.kind === 'switch') {
      await switchGitBranch(action.input);
    }
    onOpenChange(false);
  },
});

// Replace handleSelect:
const handleSelect = useCallback(async (branchName: string) => {
  onSelect?.(branchName);
  initiateSwitch({ branchName, allowStash: false });
}, [onSelect, initiateSwitch]);
```

Add a stash confirmation overlay inside the sub-card when `needsConfirm` is true:

```tsx
{needsConfirm ? (
  <div className="adl-changes-branch-confirm">
    <p>{t.changesBranchStashConfirm}</p>
    <div className="adl-changes-branch-confirm-actions">
      <button type="button" className="adl-btn adl-btn--primary adl-btn--sm" onClick={confirm}>
        {t.approve}
      </button>
      <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={cancel}>
        {t.cancel}
      </button>
    </div>
  </div>
) : null}
```

- [ ] **Step 7: Add i18n key for stash confirm**

Add to both en-US and zh-CN changes.ts:

```typescript
// en-US
changesBranchStashConfirm: 'Local changes will be stashed before switching branches. Continue?',
// zh-CN
changesBranchStashConfirm: '本地变更将被暂存后切换分支，是否继续？',
```

- [ ] **Step 8: Run TypeScript check**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx frontend/src/styles/regions/rightpanel/changes-panel.css frontend/src/app/i18n/en-US/changes.ts frontend/src/app/i18n/zh-CN/changes.ts
git commit -m "feat(frontend): enhance BranchSubCard with filter, copy, stash confirm, empty states"
```

---
### Task 5: Frontend - File Panel integration + remaining i18n

**Files:**
- Modify: `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx`
- Modify: `frontend/src/app/i18n/en-US/file.ts`
- Modify: `frontend/src/app/i18n/zh-CN/file.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`

**Interfaces:**
- Consumes: `BranchMenuItem` from `BranchSubCard.tsx`, `useAppStore` for gitSnapshot

- [ ] **Step 1: Add BranchMenuItem to WorkspaceFileTreeEntry**

```tsx
// In imports:
import { BranchMenuItem } from '@regions/right-panel/panels/BranchSubCard';

// In component, add state:
const [branchSubOpen, setBranchSubOpen] = useState(false);

// Get currentBranch from store:
const gitBranch = useAppStore((s) => s.gitSnapshot?.branch);
const currentBranch = gitBranch ?? '';

// In the menu portal, at the top of menu items (before existing items):
<BranchMenuItem
  isSubOpen={branchSubOpen}
  onSubOpenChange={setBranchSubOpen}
  workspacePath={workspace.path}
  currentBranch={currentBranch}
/>
<div className="adl-multitree-entry__menu-sep" role="separator" />
```

- [ ] **Step 2: Add remaining i18n keys**

In `frontend/src/app/i18n/en-US/file.ts`:
```typescript
fileCopyBranchName: 'Copy branch name',
```

In `frontend/src/app/i18n/zh-CN/file.ts`:
```typescript
fileCopyBranchName: '复制分支名称',
```

Add missing changes.ts keys from previous tasks if not already added.

- [ ] **Step 3: Add `isRepo` prop to BranchMenuItem → BranchSubCard**

In `BranchSubCard.tsx`, accept `isRepo` prop and pass it to BranchSubCard from BranchMenuItem.
In `WorkspaceChangesEntry.tsx`, pass `isRepo={gitSnapshot?.isRepo ?? false}` to BranchMenuItem.
In `WorkspaceFileTreeEntry.tsx`, pass `isRepo={...}` to BranchMenuItem.

```typescript
// BranchMenuItem interface add:
isRepo?: boolean;
// BranchSubCard interface add:
isRepo?: boolean;
```

- [ ] **Step 4: Run TypeScript check**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run frontend tests**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx frontend/src/app/i18n/en-US/file.ts frontend/src/app/i18n/zh-CN/file.ts frontend/src/app/i18n/en-US/changes.ts frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx
git commit -m "feat(frontend): integrate BranchMenuItem into File Panel workspace entry"
```

---
### Task 6: Full validation

**Files:** All modified files from tasks 1-5

- [ ] **Step 1: Run Rust checks**

```bash
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Expected: clippy passes, all tests pass

- [ ] **Step 2: Run frontend checks**

```bash
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
npx tsc --noEmit
npx eslint .
pnpm run test
```

Expected: no type errors, no lint errors, all tests pass

- [ ] **Step 3: Manual smoke test**

```bash
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm run dev:browser
```

Verify:
1. StatusBar branch switch works for clean repo (no confirmation)
2. StatusBar branch switch shows stash confirm for dirty repo
3. Changes Panel branch switch shows same confirm for dirty repo
4. File Panel workspace entry shows "切换分支" in right-click and more-actions menu
5. Branch list shows correct icons: ✓, 🔄, Local/Remote badges, 📋 copy button
6. Copy button copies branch name to clipboard
7. Local/Remote filter buttons toggle branch visibility
8. Empty states: "暂无其它分支", "搜索分支不存在", "请先初始化为 Git 仓库"
