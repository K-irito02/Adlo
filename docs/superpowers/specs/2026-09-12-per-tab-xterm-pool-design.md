# Per-Tab xterm Instance Pool Architecture

## Problem Statement

The terminal panel uses a single xterm.js `Terminal` instance shared across all tabs. Switching tabs requires clearing the xterm buffer and replaying persisted output. This causes:

1. **Content misalignment on resize**: When the window is resized while tabs are switched, the PTY dimensions and xterm grid dimensions can desync because the single xterm's ResizeObserver fires during replay
2. **ConPTY redraw conflicts**: Resizing the PTY triggers ConPTY to redraw the entire screen, which overwrites recently replayed content
3. **Complex guard mechanisms**: The `restoringSessionRef` guard, `setReplaying` flag, 300ms delayed clear, and `sessionOutputsRef` memory buffer are all workarounds for the shared-instance architecture
4. **Flicker on tab switch**: Clearing and rewriting the xterm buffer causes visible flicker

## Solution: Per-Tab xterm Instance Pool

Each PTY session gets its own persistent xterm.js `Terminal` instance. Switching tabs becomes a DOM visibility toggle instead of a content replay.

### Architecture Overview

```
Old: Tab A ─┐
            ├→ Single XtermTerminal → clear + replay on switch
      Tab B ─┘

New: Tab A → xterm-A ─┐
      Tab B → xterm-B ─┼→ CSS visibility toggle (hidden/visible)
      Tab C → xterm-C ─┘
```

### Key Principles

- One xterm `Terminal` per PTY session, lifecycle-bound to the session
- All xterm instances are permanently in the DOM, using CSS `visibility` for show/hide
- Tab switch = toggle visibility + one `fit()` call
- No replay needed: each xterm maintains its own buffer; PTY output writes directly to the corresponding instance
- No ConPTY conflicts: each xterm is independent; resize only affects the active instance

## Component Model

### TerminalXtermPool (New)

Pure logic manager (not a React component):

```typescript
// frontend/src/app/features/terminal/terminalXtermPool.ts

interface PooledXterm {
  terminal: Terminal;
  fitAddon: FitAddon;
  hostEl: HTMLDivElement;   // Independent DOM container
  sessionId: string;
  createdAt: number;
}

class TerminalXtermPool {
  private pool = new Map<string, PooledXterm>();

  acquire(sessionId: string, container: HTMLElement): PooledXterm;
  release(sessionId: string): void;
  get(sessionId: string): PooledXterm | undefined;
  fitAll(): void;                    // Called on window resize
  disposeAll(): void;                // Called on app exit
}
```

- `acquire()`: Creates a new Terminal instance or reattaches an existing one to a container
- `release()`: Disposes the Terminal and removes from pool
- `fitAll()`: Fits all active terminals (used on window resize)

### XtermTerminal Component (Simplified)

Changes from current implementation:

| Aspect | Old | New |
|--------|-----|-----|
| Terminal creation | Creates Terminal in useEffect | Receives Terminal from pool |
| Imperative handle | 10+ methods via useImperativeHandle | Simplified: just container ref |
| Props | `className`, `onData`, `onResize` | Add `sessionId` |
| ResizeObserver | Manages its own observer | Pool manages fitting |
| Theme switching | MutationObserver per instance | Pool-level theme sync |

### TerminalPanel Changes

```tsx
// Old: Single XtermTerminal with ref
<XtermTerminal ref={xtermRef} className="adl-terminal-canvas" ... />

// New: Multiple canvas divs, one per active session
{sessions.map(sessionId => (
  <div
    key={sessionId}
    className="adl-terminal-canvas"
    style={{
      visibility: sessionId === activeSessionId ? 'visible' : 'hidden',
      position: 'absolute', inset: 0,
    }}
    ref={el => el && pool.attach(sessionId, el)}
  />
))}
```

## Data Flow Changes

### PTY Output Routing

```
Old: PTY output → subscribePtyOutput → check sessionId === activeTab?
    → YES: write to single xterm
    → NO: store in sessionOutputsRef (memory buffer) → replay on switch

New: PTY output → directly write to pool.get(sessionId).terminal
    → Each xterm receives its output in real-time
    → No sessionOutputsRef memory buffer needed for switching
    → Persistence still needed for app restart
```

### PTY Input Routing

No change: `xterm.onData → handleXtermData → pty.input(activeSessionId, data)`

### Resize Handling

```
Old: ResizeObserver → debounce → fit single xterm → onResize → pty.resize

New: ResizeObserver → debounce → fit active xterm → onResize → pty.resize
    Window resize: pool.fitAll() refits all active instances
```

### Output Persistence

```
Old: PTY output → memory buffer → debounce 500ms → strip bursts → save
    Switch: load → strip → write to xterm (replay)

New: PTY output → write to xterm (real-time) → debounce 500ms → strip bursts → save
    Switch: no load needed (xterm maintains own buffer)
    Restart: load → write once (one-time, not per-switch)
```

## Tab Switch Flow Comparison

### Old Flow (~15 async steps)

```
Click tab → selectTab → activateTab → replaySession
  → restoringSessionRef = sessionId
  → setReplaying(true)
  → await ensureLoaded()
  → await waitForTerminal()
  → await nextFrame()
  → resize()
  → clear()
  → stripBursts()
  → write(replay)
  → scrollToBottom()
  → focus()
  → finally: setReplaying(false)
  → await 300ms
  → restoringSessionRef = null
```

### New Flow (~3 sync steps)

```
Click tab → selectTab
  → React renders: old tab visibility=hidden, new tab visibility=visible
  → useEffect on activeSessionId: pool.get(id).fitAddon.fit() + focus()
```

### Eliminated Complexity

- `replaySession` function (~60 lines)
- `restoringSessionRef` guard mechanism
- `setReplaying` / `isReplayingRef` / `pendingResizeAfterReplayRef`
- `sessionOutputsRef` memory buffer (for switching)
- 300ms delayed guard clear
- `stripConptyRepaintBursts` in switch path
- `hideWhileRestoring` / `revealAfterRestoring` flicker hiding
- `revivingTabIdsRef` concurrent revive protection

## PTY Lifecycle Changes

### useTerminalPtyLifecycle Simplification

| Old Logic | New Logic |
|-----------|-----------|
| `xtermRef` → single XtermTerminal handle | `poolRef` → TerminalXtermPool |
| `sessionOutputsRef` (Map) memory buffer | Deleted — output writes directly to xterm |
| `replaySession()` (~60 lines) | Deleted — no longer needed |
| `restoringSessionRef` guard | Deleted — each xterm is independent |
| `setReplaying` / `isReplayingRef` | Deleted |
| `activateTab()` complex revive flow | Simplified: create xterm + one-time load |
| `handleXtermResize` dedup logic | Simplified: fit only active xterm |
| `handleXtermData` guard checks | Simplified: route directly to PTY |
| `subscribePtyOutput` replay guard | Simplified: write directly to pool xterm |

### New Logic

```typescript
// Tab creation
const handleCreateTab = async (profile, workspaceId) => {
  const tab = terminalCreateTab(profile, workspaceId);
  const xterm = pool.acquire(tab.id, containerEl);
  const dims = xterm.fitAddon.proposeDimensions();
  const result = await pty.create({ shell, cwd, cols: dims.cols, rows: dims.rows });
  // Subscribe PTY output → write directly to xterm
  subscribePtyOutput(result.sessionId, (data) => xterm.terminal.write(data));
};

// Tab closure
const handleCloseTab = (tabId) => {
  const session = getTabSession(tabId);
  pty.kill(session.id);
  pool.release(tab.id);
  terminalCloseTab(tabId);
};

// Tab selection (synchronous)
const handleSelectTab = (tabId) => {
  terminalSelectTab(tabId);
  // React handles visibility via rendering
  // useEffect on activeSessionId triggers fit + focus
};
```

## App Restart Recovery

```
Old: Restored tab → replaySession → load → write to xterm → create PTY → carry history

New: Restored tab → pool.acquire(tabId) creates new xterm
  → terminalOutputStore.load(sessionId) → write once to xterm
  → create PTY with correct dimensions
  → subscribe PTY output → xterm receives live output
  → No more replay needed after initial load
```

## Memory Considerations

- Each xterm instance: ~2-5 MB (1000 lines scrollback)
- 20 tabs ≈ 40-100 MB — acceptable for desktop app
- No upper limit per user decision
- Disposal: only on tab close or app exit
- Potential future optimization: virtualize hidden tabs (out of scope)

## Implementation Phases

### Phase 1: TerminalXtermPool + XtermTerminal Refactor

**Files to create/modify:**
- `frontend/src/app/features/terminal/terminalXtermPool.ts` (NEW)
- `frontend/src/app/components/terminal/XtermTerminal.tsx` (REFACTOR)
- `frontend/src/app/features/terminal/TerminalPanel.tsx` (MODIFY)
- `frontend/src/styles/regions/rightpanel/terminal-panel.css` (MODIFY)

**Verification:** Multiple xterm instances created, tab visibility toggles correctly.

### Phase 2: PTY Lifecycle Refactor

**Files to modify:**
- `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts` (MAJOR REFACTOR)
- `frontend/src/app/features/terminal/useTerminalPanel.ts` (MODIFY)
- `frontend/src/app/features/terminal/useTerminalTabActions.ts` (MODIFY)

**Verification:** Tab switching works without flicker, misalignment, or ConPTY conflicts.

### Phase 3: Cleanup

**Files to modify:**
- `frontend/src/app/features/terminal/terminalRepaintFilter.ts` (CLEANUP switch-path calls)
- Various: remove `setReplaying`, `isReplayingRef`, `pendingResizeAfterReplayRef`, etc.
- Add memory monitoring (optional)

**Verification:** All existing functionality works (multi-tab, window resize, restart recovery, CWD tracking).

## Rollback Strategy

Each phase is independently testable. If Phase 2 introduces issues, roll back to Phase 1 state (pool created but old replay logic preserved). The pool infrastructure is additive and doesn't break existing code.

## Files Affected Summary

| File | Change Type | Phase |
|------|-------------|-------|
| `terminalXtermPool.ts` | NEW | 1 |
| `XtermTerminal.tsx` | REFACTOR | 1 |
| `TerminalPanel.tsx` | MODIFY | 1 |
| `terminal-panel.css` | MODIFY | 1 |
| `useTerminalPtyLifecycle.ts` | MAJOR REFACTOR | 2 |
| `useTerminalPanel.ts` | MODIFY | 2 |
| `useTerminalTabActions.ts` | MODIFY | 2 |
| `terminalRepaintFilter.ts` | CLEANUP | 3 |
| `terminalOutputStore.ts` | NO CHANGE | — |
| `terminalSlice.ts` | MINOR (if needed) | 2 |
