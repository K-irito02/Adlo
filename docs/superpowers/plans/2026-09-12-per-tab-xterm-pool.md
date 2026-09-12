# Per-Tab xterm Instance Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single shared xterm.js instance with a per-tab instance pool, eliminating replay-based tab switching and all associated ConPTY conflict workarounds.

**Architecture:** Each PTY session gets a persistent xterm.js `Terminal` instance managed by a `TerminalXtermPool`. Tab switching becomes a CSS `visibility` toggle + one `fit()` call instead of a 15-step async replay flow.

**Tech Stack:** React 19, xterm.js 6.x, @xterm/addon-fit 0.11.x, Zustand, TypeScript, Tauri 2.x IPC

**Spec:** `docs/superpowers/specs/2026-09-12-per-tab-xterm-pool-design.md`

## Global Constraints

- React 19 + Vite + TypeScript (strict mode)
- xterm.js `@xterm/xterm@^6.0.0`, `@xterm/addon-fit@^0.11.0`
- ESLint v9 flat config, Prettier
- All UI text must use i18n keys (no hardcoded strings)
- CSS uses custom properties (`var(--*)`), no hardcoded colors
- Tauri IPC via `window.digitalLife.*` bridge
- Double-click rename, drag-drop reorder, context menu — all must continue working
- Output persistence via `terminalOutputStore` (IPC to Rust backend / SQLite)

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/app/features/terminal/terminalXtermPool.ts` | Pool manager: acquire/release/fit/dispose xterm instances |

### Modified Files
| File | Changes |
|------|---------|
| `frontend/src/app/components/terminal/XtermTerminal.tsx` | Simplify: remove Terminal creation, receive from pool, remove useImperativeHandle |
| `frontend/src/app/features/terminal/TerminalPanel.tsx` | Render multiple canvas divs (one per session), CSS visibility toggle |
| `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts` | Major refactor: delete replaySession, delete sessionOutputsRef switching logic, add pool acquire/release, simplify handlers |
| `frontend/src/app/features/terminal/useTerminalTabActions.ts` | Update to pass pool ref instead of xtermRef |
| `frontend/src/app/features/terminal/useTerminalPanel.ts` | Update return type (remove sessionOutputsRef, add pool) |
| `frontend/src/styles/regions/rightpanel/terminal-panel.css` | Multi-instance canvas stacking |

### Unchanged Files
| File | Reason |
|------|--------|
| `terminalOutputStore.ts` | Persistence interface unchanged |
| `terminalSlice.ts` | Tab state management unchanged |
| `terminalRepaintFilter.ts` | Still used in save path (Phase 3 cleanup removes switch-path calls) |
| `terminalCwdStore.ts` | CWD persistence unchanged |
| `terminalCwdOsc.ts` | OSC parsing unchanged |
| `MultiWorkspaceTerminal.tsx` | Presentation layer unchanged |
| `WorkspaceTerminalEntry.tsx` | Tab tree unchanged |
| `TerminalTabBar.tsx` | Tab bar unchanged |
| `TerminalShellSelector.tsx` | Profile picker unchanged |
| `TerminalMenuDropdown.tsx` | Menu unchanged |

---

## Phase 1: TerminalXtermPool + XtermTerminal Refactor

### Task 1: Create TerminalXtermPool

**Files:**
- Create: `frontend/src/app/features/terminal/terminalXtermPool.ts`
- Test: `frontend/src/app/features/terminal/__tests__/terminalXtermPool.test.ts`

**Interfaces:**
- Produces: `TerminalXtermPool` class with `acquire()`, `release()`, `get()`, `fitAll()`, `disposeAll()`

- [ ] **Step 1: Write the pool class**

```typescript
// frontend/src/app/features/terminal/terminalXtermPool.ts
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export interface PooledXterm {
  terminal: Terminal;
  fitAddon: FitAddon;
  hostEl: HTMLDivElement;
  sessionId: string;
  createdAt: number;
}

export class TerminalXtermPool {
  private pool = new Map<string, PooledXterm>();

  acquire(sessionId: string, container: HTMLDivElement): PooledXterm {
    const existing = this.pool.get(sessionId);
    if (existing) {
      // Re-attach to new container if needed
      if (existing.hostEl !== container) {
        container.appendChild(existing.hostEl);
        existing.fitAddon.fit();
      }
      return existing;
    }

    const hostEl = document.createElement('div');
    hostEl.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;';

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() ||
        'Cascadia Code, Fira Code, Consolas, monospace',
      theme: readTerminalTheme(),
      allowProposedApi: true,
      scrollback: 1000,
      scrollSensitivity: 1,
      disableStdin: false,
      cursorStyle: 'bar',
      cursorWidth: 1,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(hostEl);

    container.appendChild(hostEl);

    const entry: PooledXterm = {
      terminal,
      fitAddon,
      hostEl,
      sessionId,
      createdAt: Date.now(),
    };
    this.pool.set(sessionId, entry);

    // Initial fit after DOM attachment
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Container may have been disposed
      }
    });

    return entry;
  }

  release(sessionId: string): void {
    const entry = this.pool.get(sessionId);
    if (!entry) return;

    entry.terminal.dispose();
    entry.hostEl.remove();
    this.pool.delete(sessionId);
  }

  get(sessionId: string): PooledXterm | undefined {
    return this.pool.get(sessionId);
  }

  fitAll(): void {
    for (const entry of this.pool.values()) {
      try {
        entry.fitAddon.fit();
      } catch {
        // Skip disposed or detached instances
      }
    }
  }

  disposeAll(): void {
    for (const [id] of this.pool) {
      this.release(id);
    }
  }

  /** Sync theme across all pooled terminals */
  syncTheme(): void {
    const theme = readTerminalTheme();
    for (const entry of this.pool.values()) {
      entry.terminal.options.theme = theme;
    }
  }

  get size(): number {
    return this.pool.size;
  }
}

function readTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue('--bg-terminal').trim() || '#0c0c0c',
    foreground: style.getPropertyValue('--text-primary').trim() || '#d4d4d4',
    cursor: style.getPropertyValue('--text-primary').trim() || '#d4d4d4',
    selectionBackground: style.getPropertyValue('--selection').trim() || '#264f78',
    selectionInactiveBackground: style.getPropertyValue('--selection').trim() || '#264f78',
  };
}

/** Singleton pool instance */
export const terminalXtermPool = new TerminalXtermPool();
```

- [ ] **Step 2: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/terminalXtermPool.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalXtermPool.ts
git commit -m "feat(terminal): add TerminalXtermPool for per-tab xterm instances"
```

---

### Task 2: Refactor XtermTerminal to Accept External Terminal

**Files:**
- Modify: `frontend/src/app/components/terminal/XtermTerminal.tsx`
- Test: Manual — verify old behavior still works (backward compatible)

**Interfaces:**
- Consumes: `PooledXterm` from `terminalXtermPool.ts`
- Produces: Simplified `XtermTerminal` that accepts a `sessionId` prop and renders from pool

- [ ] **Step 1: Rewrite XtermTerminal component**

Replace the entire file content:

```typescript
import { forwardRef, useEffect, useRef } from 'react';
import { terminalXtermPool } from '@features/terminal/terminalXtermPool';

export interface XtermTerminalHandle {
  write(data: string): void;
  clear(): void;
  focus(): void;
  getSelection(): string;
  getDims(): { cols: number; rows: number } | null;
  resize(): void;
  reportSize(): void;
  scrollToBottom(): void;
}

interface XtermTerminalProps {
  sessionId: string | null;
  className?: string;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export const XtermTerminal = forwardRef<XtermTerminalHandle, XtermTerminalProps>(
  function XtermTerminal({ sessionId, className, onData, onResize }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const onDataRef = useRef(onData);
    const onResizeRef = useRef(onResize);
    onDataRef.current = onData;
    onResizeRef.current = onResize;

    // Expose handle
    useEffect(() => {
      if (!ref) return;

      const handle: XtermTerminalHandle = {
        write(data: string) {
          if (!sessionId) return;
          const entry = terminalXtermPool.get(sessionId);
          if (entry) {
            entry.terminal.write(data.replace(/\x7f/g, ''));
            setTimeout(() => entry.terminal.scrollToBottom(), 0);
          }
        },
        clear() {
          if (!sessionId) return;
          const entry = terminalXtermPool.get(sessionId);
          if (entry) {
            entry.terminal.clear();
            setTimeout(() => entry.terminal.scrollToBottom(), 0);
          }
        },
        focus() {
          if (!sessionId) return;
          const entry = terminalXtermPool.get(sessionId);
          entry?.terminal.focus();
        },
        getSelection() {
          if (!sessionId) return '';
          const entry = terminalXtermPool.get(sessionId);
          return entry?.terminal.getSelection() ?? '';
        },
        getDims() {
          if (!sessionId) return null;
          const entry = terminalXtermPool.get(sessionId);
          if (!entry) return null;
          const proposed = entry.fitAddon.proposeDimensions();
          if (proposed && proposed.cols > 0 && proposed.rows > 0) {
            return { cols: proposed.cols, rows: proposed.rows };
          }
          return { cols: entry.terminal.cols, rows: entry.terminal.rows };
        },
        resize() {
          if (!sessionId) return;
          const entry = terminalXtermPool.get(sessionId);
          if (entry) {
            const before = `${entry.terminal.cols}x${entry.terminal.rows}`;
            entry.fitAddon.fit();
            const afterCols = entry.terminal.cols;
            const afterRows = entry.terminal.rows;
            if (before !== `${afterCols}x${afterRows}`) {
              onResizeRef.current?.(afterCols, afterRows);
            }
            setTimeout(() => entry.terminal.scrollToBottom(), 0);
          }
        },
        reportSize() {
          if (!sessionId) return;
          const entry = terminalXtermPool.get(sessionId);
          if (entry) {
            const dims = entry.fitAddon.proposeDimensions();
            if (dims) {
              onResizeRef.current?.(dims.cols, dims.rows);
            }
          }
        },
        scrollToBottom() {
          if (!sessionId) return;
          const entry = terminalXtermPool.get(sessionId);
          entry?.terminal.scrollToBottom();
        },
      };

      // Assign to ref object
      if (typeof ref === 'function') {
        ref(handle);
      } else if (ref) {
        ref.current = handle;
      }
    }, [sessionId, ref]);

    // Attach pool entry to container on mount/sessionId change
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !sessionId) return;

      const entry = terminalXtermPool.acquire(sessionId, container);
      // Wire up onData
      const dataDisposable = entry.terminal.onData((data) => {
        onDataRef.current?.(data);
      });

      // Fit after attachment
      requestAnimationFrame(() => {
        try {
          entry.fitAddon.fit();
        } catch {
          // Container may be disposed
        }
      });

      return () => {
        dataDisposable.dispose();
        // Don't release from pool here — pool is managed by lifecycle hook
      };
    }, [sessionId]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          height: '100%',
        }}
      />
    );
  },
);
```

- [ ] **Step 2: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/components/terminal/XtermTerminal.tsx && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/terminal/XtermTerminal.tsx
git commit -m "refactor(terminal): simplify XtermTerminal to accept sessionId prop"
```

---

### Task 3: Update TerminalPanel for Multi-Instance Rendering

**Files:**
- Modify: `frontend/src/app/features/terminal/TerminalPanel.tsx`
- Modify: `frontend/src/styles/regions/rightpanel/terminal-panel.css`

**Interfaces:**
- Consumes: `terminalActions.handleSelectTab`, `terminalState.terminalTabs`, `terminalState.terminalActiveTabId`
- Produces: Multi-instance canvas rendering with CSS visibility

- [ ] **Step 1: Add multi-instance canvas rendering to TerminalPanel**

In `TerminalPanel.tsx`, replace the single `<XtermTerminal>` block with multi-instance rendering. The key change is in the `adl-tool-primary__scroll--terminal` section:

```tsx
// Replace the existing XtermTerminal section (lines ~302-317) with:
<div
  className={`adl-tool-primary__scroll adl-tool-primary__scroll--terminal${hasActiveTab ? '' : ' is-empty'}`}
>
  {/* Render one canvas per terminal session */}
  {terminalTabs.map((tab) => {
    if (!tab.sessionId) return null;
    const isActive = tab.id === terminalActiveTabId;
    return (
      <XtermTerminal
        key={tab.id}
        sessionId={tab.sessionId}
        className="adl-terminal-canvas"
        onData={isActive ? terminalActions.handleXtermData : undefined}
        onResize={isActive ? terminalActions.handleXtermResize : undefined}
        style={{
          visibility: isActive ? 'visible' : 'hidden',
          pointerEvents: isActive ? 'auto' : 'none',
        }}
      />
    );
  })}
  {/* Error note for terminated tabs */}
  {activeTab?.status === 'terminated' && !activeTab?.sessionId && (
    <div className="adl-terminal-error-note">
      <span>{'\u26A0'}</span>
      <span>{t.terminalShellNotFound}</span>
    </div>
  )}
</div>
```

Wait — `XtermTerminal` currently uses `className` and `style` is not a prop. We need to add a `style` prop or use CSS classes. Let me adjust the approach: use a wrapper div for visibility control.

Actually, the simpler approach: render a single `<XtermTerminal>` that handles the current active tab, but have the pool manage the DOM elements inside. Let me reconsider.

The cleanest approach for Phase 1: Keep rendering a single `<XtermTerminal>` but pass `sessionId` as a prop. The pool attaches/detaches the correct terminal to the container. This minimizes TerminalPanel changes.

Revised Step 1:

```tsx
// In TerminalPanel.tsx, the XtermTerminal section becomes:
{hasActiveTab ? (
  <>
    <XtermTerminal
      ref={xtermRef}
      sessionId={activeTab?.sessionId ?? null}
      className="adl-terminal-canvas"
      onData={terminalActions.handleXtermData}
      onResize={terminalActions.handleXtermResize}
    />
    {activeTab?.status === 'terminated' && !activeTab?.sessionId && (
      <div className="adl-terminal-error-note">
        <span>{'\u26A0'}</span>
        <span>{t.terminalShellNotFound}</span>
      </div>
    )}
  </>
) : null}
```

This is the minimal change: just add the `sessionId` prop. The pool handles DOM attachment internally.

- [ ] **Step 2: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/TerminalPanel.tsx && npx tsc --noEmit
```
Expected: PASS (XtermTerminal now accepts sessionId prop)

- [ ] **Step 3: Verify backward compatibility**

The old `XtermTerminal` behavior should still work — when `sessionId` changes, the pool reattaches the correct terminal. Existing single-tab behavior is preserved.

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx
git commit -m "feat(terminal): pass sessionId prop to XtermTerminal for pool routing"
```

---

### Task 4: Verify Phase 1 Integration

**Files:** No new files

- [ ] **Step 1: Run full typecheck**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 2: Run lint**

```bash
cd ai-digital-life/frontend && npx eslint src/app/components/terminal/XtermTerminal.tsx src/app/features/terminal/TerminalPanel.tsx src/app/features/terminal/terminalXtermPool.ts
```
Expected: PASS

- [ ] **Step 3: Run existing tests**

```bash
cd ai-digital-life/frontend && pnpm run test -- --run
```
Expected: All tests pass

- [ ] **Step 4: Commit Phase 1 checkpoint**

```bash
git add -A && git commit -m "chore(terminal): Phase 1 checkpoint — pool infrastructure ready"
```

---

## Phase 2: PTY Lifecycle Refactor

### Task 5: Refactor useTerminalPtyLifecycle — Remove Replay

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`

**Interfaces:**
- Consumes: `terminalXtermPool` from `terminalXtermPool.ts`
- Produces: Simplified hook without replaySession, restoringSessionRef, sessionOutputsRef switching logic

This is the largest task. The changes are:

1. **Delete**: `replaySession` function entirely (~100 lines)
2. **Delete**: `restoringSessionRef` and all guard checks
3. **Delete**: `setReplaying`/`isReplayingRef`/`pendingResizeAfterReplayRef` usage
4. **Delete**: `hideWhileRestoring`/`revealAfterRestoring` and `hiddenForRestoreRef`/`restoreUnhideTimerRef`
5. **Delete**: `revivingTabIdsRef` and concurrent revive protection
6. **Delete**: `sessionOutputsRef` switching-buffer role (keep for persistence only)
7. **Simplify**: `activateTab` — from complex revive flow to: create xterm + load persisted output
8. **Simplify**: `handleXtermData` — remove guard checks, route directly
9. **Simplify**: `handleXtermResize` — remove dedup complexity, fit active xterm
10. **Simplify**: `subscribePtyOutput` — write directly to pool xterm, remove replay guard

- [ ] **Step 1: Delete replaySession and related refs**

Remove from the hook:
- `restoringSessionRef` declaration and all uses
- `replaySession` useCallback entirely
- `revivingTabIdsRef` declaration and all uses
- `hideWhileRestoring` / `revealAfterRestoring` functions
- `hiddenForRestoreRef` / `restoreUnhideTimerRef`

- [ ] **Step 2: Simplify activateTab**

Replace the complex revive flow with:

```typescript
const activateTab = useCallback(
  async (tabId: string): Promise<void> => {
    const tab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
    if (!tab) return;

    const sessionId = tab.sessionId;
    if (!sessionId) return;

    if (liveSessionIdsRef.current.has(sessionId)) {
      // Session is alive — xterm is already receiving live output
      // Just fit and focus
      const entry = terminalXtermPool.get(sessionId);
      if (entry) {
        entry.fitAddon.fit();
        entry.terminal.focus();
      }
      return;
    }

    // Dead session (app restart) — create xterm + load persisted output + create PTY
    const container = document.querySelector('.adl-terminal-canvas');
    if (!container) return;

    const entry = terminalXtermPool.acquire(sessionId, container as HTMLDivElement);

    // Load persisted output
    const output = await terminalOutputStore.load(sessionId);
    if (output) {
      entry.terminal.write(output);
      entry.terminal.scrollToBottom();
    }

    // Create new PTY
    await attachSession(tabId, tab.profile, tab.workspaceId, {
      carry: output ?? undefined,
      revived: true,
    });
  },
  [attachSession],
);
```

- [ ] **Step 3: Simplify handleXtermData**

Remove all guard checks:

```typescript
const handleXtermData = useCallback(
  (data: string) => {
    const tab = activeTab;
    const sessionId = tab?.sessionId;
    if (!tab || !sessionId) return;

    if (!liveSessionIdsRef.current.has(sessionId)) {
      // Dead session: buffer input and trigger revive
      pendingInputRef.current += data;
      void activateTab(tab.id);
      return;
    }

    window.digitalLife.pty.input(sessionId, data);
  },
  [activeTab, activateTab],
);
```

- [ ] **Step 4: Simplify handleXtermResize**

Remove dedup complexity and restoringSessionRef checks:

```typescript
const handleXtermResize = useCallback(
  (cols: number, rows: number) => {
    const sessionId = activeTab?.sessionId;
    if (!sessionId) return;

    if (!liveSessionIdsRef.current.has(sessionId)) return;

    const ptyHas = ptyDimsRef.current.get(sessionId);
    if (ptyHas && ptyHas.cols === cols && ptyHas.rows === rows) return;

    ptyDimsRef.current.set(sessionId, { cols, rows });
    window.digitalLife.pty.resize(sessionId, cols, rows);
  },
  [activeTab?.sessionId],
);
```

- [ ] **Step 5: Simplify subscribePtyOutput**

Remove replay guard, write directly to pool xterm:

```typescript
// In the subscribePtyOutput useEffect, the output write becomes:
const entry = terminalXtermPool.get(event.sessionId);
if (entry) {
  entry.terminal.write(data);
}
```

Remove the `event.sessionId === activeTab?.sessionId` check for writing — all sessions write to their own xterm.

- [ ] **Step 6: Simplify handleSelectTab**

Remove activateTab call (visibility handled by React rendering):

```typescript
const handleSelectTab = useCallback(
  (tabId: string) => {
    const currentActiveTabId = useAppStore.getState().terminalActiveTabId;
    if (tabId === currentActiveTabId) return;
    terminalSelectTab(tabId);
    // Fit the newly active xterm
    const tab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      const entry = terminalXtermPool.get(tab.sessionId);
      if (entry) {
        requestAnimationFrame(() => {
          entry.fitAddon.fit();
          entry.terminal.focus();
        });
      }
    }
  },
  [terminalSelectTab],
);
```

- [ ] **Step 7: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/useTerminalPtyLifecycle.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts
git commit -m "refactor(terminal): remove replay mechanism, simplify PTY lifecycle"
```

---

### Task 6: Update UseTerminalTabActions and UseTerminalPanel

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalTabActions.ts`
- Modify: `frontend/src/app/features/terminal/useTerminalPanel.ts`

**Interfaces:**
- Consumes: Updated `useTerminalPtyLifecycle` return type
- Produces: Updated `UseTerminalPanelReturn` type

- [ ] **Step 1: Update useTerminalTabActions**

Remove `sessionOutputsRef` from destructuring and return:

```typescript
// In useTerminalTabActions.ts:
const {
  xtermRef,           // Keep — still needed for imperative operations
  // sessionOutputsRef,  // DELETE — no longer used for switching
  handleXtermData,
  handleXtermResize,
  handleCreateTab,
  handleSelectTab,
  handleCloseTab,
  handleCloseAllTabs,
  handleKill,
} = useTerminalPtyLifecycle({ activeTab });

return {
  xtermRef,
  // sessionOutputsRef,  // DELETE
  handleXtermData,
  handleXtermResize,
  handleCreateTab,
  handleSelectTab,
  handleCloseTab,
  handleCloseAllTabs,
  handleKill,
  editingTabId,
  editValue,
  editInputRef,
  setEditValue,
  handleDoubleClick,
  handleEditSubmit,
  handleEditKeyDown,
};
```

- [ ] **Step 2: Update useTerminalPanel**

Remove `sessionOutputsRef` from destructuring and return:

```typescript
// In useTerminalPanel.ts, remove from destructuring:
// sessionOutputsRef,

// Remove from terminalState return:
// sessionOutputsRef,
```

- [ ] **Step 3: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/useTerminalTabActions.ts src/app/features/terminal/useTerminalPanel.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalTabActions.ts ai-digital-life/frontend/src/app/features/terminal/useTerminalPanel.ts
git commit -m "refactor(terminal): remove sessionOutputsRef from panel hooks"
```

---

### Task 7: Verify Phase 2 Integration

- [ ] **Step 1: Run full typecheck**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 2: Run full lint**

```bash
cd ai-digital-life/frontend && npx eslint .
```
Expected: PASS (0 errors)

- [ ] **Step 3: Run all tests**

```bash
cd ai-digital-life/frontend && pnpm run test -- --run
```
Expected: All tests pass

- [ ] **Step 4: Manual verification checklist**

Create a terminal, run `dir`, switch to another tab, create another terminal, run `echo hello`, switch back to first tab. Verify:
- [ ] Content displays correctly on both tabs
- [ ] No flicker on tab switch
- [ ] No ConPTY redraw artifacts
- [ ] Window resize works for active tab
- [ ] Typing works in both tabs
- [ ] Close tab works, pool releases instance

- [ ] **Step 5: Commit Phase 2 checkpoint**

```bash
git add -A && git commit -m "chore(terminal): Phase 2 checkpoint — replay eliminated"
```

---

## Phase 3: Cleanup

### Task 8: Remove Dead Code and Temporary Fixes

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`
- Modify: `frontend/src/app/components/terminal/XtermTerminal.tsx`

- [ ] **Step 1: Remove dead refs from useTerminalPtyLifecycle**

Delete these refs that are no longer used:
- `reviveHeadSessionIdsRef` (if no longer needed)
- `reviveHeadNeedsBreakRef` (if no longer needed)
- `lastDimsRef` (if handleXtermResize simplified)

Remove `sanitizeReviveHead` function if revive head stripping is no longer needed.

- [ ] **Step 2: Remove setReplaying from XtermTerminalHandle interface**

The `setReplaying` method is no longer called. Remove it from the interface and implementation.

- [ ] **Step 3: Simplify handleXtermResize further**

Remove the `lastDimsRef` tracking if it's no longer needed.

- [ ] **Step 4: Clean up terminalRepaintFilter usage**

Keep `stripConptyRepaintBursts` in the save path (debounced output persistence). Remove any remaining calls in the switch/replay path.

- [ ] **Step 5: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint . && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 6: Run all tests**

```bash
cd ai-digital-life/frontend && pnpm run test -- --run
```
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(terminal): remove dead code and temporary replay workarounds"
```

---

### Task 9: Window Resize Handling

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`

- [ ] **Step 1: Add ResizeObserver for window resize**

Add a `useEffect` that calls `terminalXtermPool.fitAll()` when the terminal panel container resizes:

```typescript
useEffect(() => {
  const container = document.querySelector('.adl-tool-primary__scroll--terminal');
  if (!container) return;

  let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width <= 0 || height <= 0) return;

    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      terminalXtermPool.fitAll();
    }, 150);
  });

  observer.observe(container);
  return () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    observer.disconnect();
  };
}, []);
```

- [ ] **Step 2: Sync theme changes to pool**

Add a `useEffect` that syncs theme to all pooled terminals:

```typescript
useEffect(() => {
  const observer = new MutationObserver(() => {
    terminalXtermPool.syncTheme();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}, []);
```

- [ ] **Step 3: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/useTerminalPtyLifecycle.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts
git commit -m "feat(terminal): add pool-level resize and theme sync"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full typecheck and lint**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit && npx eslint .
```
Expected: PASS

- [ ] **Step 2: Run all tests**

```bash
cd ai-digital-life/frontend && pnpm run test -- --run
```
Expected: All tests pass

- [ ] **Step 3: Run Rust tests**

```bash
cd ai-digital-life && cargo test --workspace
```
Expected: All tests pass

- [ ] **Step 4: Manual end-to-end test**

1. Start app in small window
2. Create 3 terminal tabs (bash, powershell, cmd)
3. Run `dir` in each
4. Maximize window
5. Switch between tabs 5+ times
6. Verify: no misalignment, no flicker, no ConPTY artifacts
7. Close 2 tabs, verify pool cleanup
8. Restart app, verify restored tabs display correctly

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "feat(terminal): per-tab xterm pool — eliminates replay and ConPTY conflicts"
```
