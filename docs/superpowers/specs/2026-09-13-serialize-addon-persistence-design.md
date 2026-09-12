# SerializeAddon Terminal State Persistence Design

## Problem Statement

After app restart, terminal tabs show a fresh prompt instead of the user's command history. The previous approach (writing raw PTY output to xterm) caused duplicate startup banners and display corruption because the persisted output contained shell startup sequences that conflict with the new PTY's startup.

## Solution: SerializeAddon-Based State Persistence

Use `@xterm/addon-serialize` to capture the terminal's exact visual state (scrollback, colors, cursor position) and save it to IPC. On restore, write the serialized state to xterm before the PTY connects, then the shell prompt appears naturally.

### Architecture Overview

```
Current: PTY output → raw string accumulation → save to IPC → replay raw string (banner duplication)
New:     PTY output → xterm renders in real-time → periodic serialize → save serialized state → write to xterm on restore (exact visual还原)
```

## Components

### 1. TerminalXtermPool — SerializeAddon Integration

**File:** `terminalXtermPool.ts`

Add `SerializeAddon` to each pooled terminal entry:

```typescript
import { SerializeAddon } from '@xterm/addon-serialize';

interface PooledXterm {
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;  // NEW
  hostEl: HTMLDivElement;
  sessionId: string;
  createdAt: number;
}
```

In `acquire()`, after creating the terminal and loading FitAddon/WebLinksAddon, load SerializeAddon:

```typescript
const serializeAddon = new SerializeAddon();
terminal.loadAddon(serializeAddon);
```

No other changes to the pool class.

### 2. Serialization Trigger Points

| Trigger | Operation | Reason |
|---------|-----------|--------|
| **Tab switch** | Serialize the tab being switched away from | Capture final state on switch |
| **Periodic timer** | Serialize all active pool entries every 30s | Prevent data loss on crash |
| **App shutdown** | `beforeunload` event serializes all active entries | Final save before exit |
| **Tab close** | Serialize before deletion | Save final state before cleanup |

**Implementation:** In `useTerminalPtyLifecycle.ts`, add a `serializeSession(sessionId)` function:

```typescript
const serializeSession = useCallback((sessionId: string) => {
  const entry = terminalXtermPool.get(sessionId);
  if (!entry) return;
  try {
    const state = entry.serializeAddon.serialize({ scrollback: 1000 });
    if (state) {
      terminalOutputStore.save(sessionId, state);
    }
  } catch (err) {
    console.warn('serializeSession failed:', err);
  }
}, []);
```

**Periodic timer:** A `useEffect` that sets a 30-second interval calling `serializeSession` for all pool entries.

**`beforeunload` listener:** In the same `useEffect`, add a `beforeunload` event listener that serializes all active entries synchronously.

**Tab switch integration:** In `handleSelectTab`, serialize the previous active tab's session before switching.

### 3. Restore Flow

When clicking a restored tab after restart:

```
1. activateTab (dead session path)
2. Wait for pool entry to exist
3. terminalOutputStore.load(sessionId) → get serialized string
4. pooled.terminal.write(serializedState) → restore terminal visual state
5. attachSession → create new PTY → shell prompt appears naturally
```

**Key:** Serialized state is written to xterm BEFORE PTY creation. The shell's startup (clear screen + prompt) overwrites the serialized content, but the user can scroll up to see the restored history.

**Changes to `activateTab`:**

```typescript
// Dead session path:
// 1. Wait for pool entry
// 2. Load serialized state from IPC
// 3. Write to xterm
// 4. Create PTY

let pooled = terminalXtermPool.get(sessionId);
// ... wait for pool entry ...

// Load and write serialized state
const serialized = await terminalOutputStore.load(sessionId);
if (serialized && pooled) {
  pooled.terminal.write(serialized);
  pooled.terminal.scrollToBottom();
}

// Create PTY
await attachSession(tabId, tab.profile, tab.workspaceId, { revived: true });
```

### 4. Cleanup of Old Logic

**Remove:**
- `ensureLoaded` function — no longer needed (serialized state loaded on-demand)
- `loadedSessionIdsRef` — no longer needed
- `loadPromisesRef` — no longer needed
- `sessionOutputsRef` for persistence — keep for current-session accumulation only
- Warm-up effect — no longer needed (serialized state loaded on-demand in activateTab)
- `ptyCreatedAtRef` / startup window filter — no longer needed (serialized state doesn't contain startup sequences)

**Keep:**
- `sessionOutputsRef` — still used for current-session output accumulation (debounced save input)
- `saveDebounceRef` — still used for debounced save
- `stripConptyRepaintBursts` — still used in save path

### 5. Debounced Save Change

The debounced save currently saves `sessionOutputsRef` (raw output). Change to save serialized state:

```typescript
// In subscribePtyOutput debounced save:
saveDebounceRef.current.set(
  event.sessionId,
  setTimeout(() => {
    saveDebounceRef.current.delete(event.sessionId);
    // Save serialized state instead of raw output
    serializeSession(event.sessionId);
  }, 500),
);
```

### 6. Dependencies

**New:** `@xterm/addon-serialize@^0.7.0` (compatible with `@xterm/xterm@^6.0.0`)

**Unchanged:** `@xterm/xterm@^6.0.0`, `@xterm/addon-fit@^0.11.0`, `@xterm/addon-web-links@^0.12.0`

### 7. Backward Compatibility

No migration needed. On first serialization after upgrade, the new serialized state overwrites the old raw output. Old tabs that haven't been activated still have raw output (harmless — not displayed on restore).

### 8. Error Handling

- If `serialize()` throws (e.g., terminal disposed), log warning and skip
- If `terminalOutputStore.save()` fails, log warning (existing behavior)
- If `terminalOutputStore.load()` returns null on restore, create fresh PTY (existing behavior)
- If serialized state is from a different terminal size, xterm will reflow content (acceptable degradation)

## Files Affected

| File | Change |
|------|--------|
| `terminalXtermPool.ts` | Add SerializeAddon to PooledXterm interface and acquire() |
| `useTerminalPtyLifecycle.ts` | Add serializeSession(), periodic timer, beforeunload, simplify activateTab, remove ensureLoaded/warm-up |
| `XtermTerminal.tsx` | Add serialize() to handle (optional — serialization can be done via pool directly) |
| `package.json` | Add `@xterm/addon-serialize` |
| `terminalOutputStore.ts` | No change (interface unchanged) |
