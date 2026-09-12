# SerializeAddon Terminal State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw PTY output persistence with `@xterm/addon-serialize` to capture and restore exact terminal visual state across app restarts.

**Architecture:** Each pooled xterm instance gets a SerializeAddon. Terminal state is periodically serialized and saved to IPC. On restore, serialized state is written to xterm before PTY creation, then the shell prompt appears naturally.

**Tech Stack:** React 19, xterm.js 6.x, @xterm/addon-fit, @xterm/addon-serialize, TypeScript, Tauri 2.x IPC

**Spec:** `docs/superpowers/specs/2026-09-13-serialize-addon-persistence-design.md`

## Global Constraints

- React 19 + Vite + TypeScript (strict mode)
- xterm.js `@xterm/xterm@^6.0.0`, `@xterm/addon-fit@^0.11.0`, `@xterm/addon-serialize@^0.7.0`
- ESLint v9 flat config, Prettier
- All UI text must use i18n keys (no hardcoded strings)
- CSS uses custom properties (`var(--*)`), no hardcoded colors
- Tauri IPC via `window.digitalLife.*` bridge
- `terminalOutputStore` interface unchanged (save/load/delete)
- Backend storage unchanged (SQLite in Tauri, IndexedDB in browser)

## File Structure

### Modified Files
| File | Changes |
|------|---------|
| `frontend/package.json` | Add `@xterm/addon-serialize` dependency |
| `frontend/src/app/features/terminal/terminalXtermPool.ts` | Add SerializeAddon to PooledXterm interface and acquire() |
| `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts` | Add serializeSession(), periodic timer, beforeunload, modify activateTab, remove ensureLoaded/warm-up/ptyCreatedAtRef |
| `frontend/src/app/components/terminal/XtermTerminal.tsx` | Add serialize() to handle |

### Unchanged Files
| File | Reason |
|------|--------|
| `terminalOutputStore.ts` | Interface unchanged (save/load/delete) |
| `terminalSlice.ts` | Tab state management unchanged |
| `useTerminalPanel.ts` | No changes needed |
| `useTerminalTabActions.ts` | No changes needed |

---

### Task 1: Install SerializeAddon Dependency

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `@xterm/addon-serialize` available for import

- [ ] **Step 1: Install the dependency**

```bash
cd ai-digital-life/frontend && pnpm add @xterm/addon-serialize
```

- [ ] **Step 2: Verify installation**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```
Expected: PASS (no import errors for @xterm/addon-serialize)

- [ ] **Step 3: Commit**

```bash
cd AI-DIGITAL-LIFE/SourceWorkspace && git add ai-digital-life/frontend/package.json ai-digital-life/frontend/pnpm-lock.yaml && git commit -m "chore(deps): add @xterm/addon-serialize for terminal state persistence"
```

---

### Task 2: Add SerializeAddon to TerminalXtermPool

**Files:**
- Modify: `frontend/src/app/features/terminal/terminalXtermPool.ts`

**Interfaces:**
- Consumes: `@xterm/addon-serialize` (from Task 1)
- Produces: `PooledXterm.serializeAddon` field, available for serialization

- [ ] **Step 1: Add SerializeAddon import and PooledXterm field**

In `terminalXtermPool.ts`, add the import at the top:

```typescript
import { SerializeAddon } from '@xterm/addon-serialize';
```

Update the `PooledXterm` interface to include `serializeAddon`:

```typescript
export interface PooledXterm {
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  hostEl: HTMLDivElement;
  sessionId: string;
  createdAt: number;
}
```

- [ ] **Step 2: Load SerializeAddon in acquire()**

In the `acquire()` method, after `terminal.loadAddon(webLinksAddon)` and before `terminal.open(hostEl)`, add:

```typescript
const serializeAddon = new SerializeAddon();
terminal.loadAddon(serializeAddon);
```

In the entry construction, add `serializeAddon` to the object:

```typescript
const entry: PooledXterm = {
  terminal,
  fitAddon,
  serializeAddon,
  hostEl,
  sessionId,
  createdAt: Date.now(),
};
```

- [ ] **Step 3: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/terminalXtermPool.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalXtermPool.ts && git commit -m "feat(terminal): add SerializeAddon to terminal pool entries"
```

---

### Task 3: Add serializeSession Function and Periodic Timer

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`

**Interfaces:**
- Consumes: `terminalXtermPool.get(sessionId).serializeAddon.serialize()` from Task 2
- Consumes: `terminalOutputStore.save()` (existing)
- Produces: `serializeSession(sessionId)` function, periodic 30s timer, `beforeunload` handler

- [ ] **Step 1: Add serializeSession function**

In `useTerminalPtyLifecycle.ts`, add after the existing `persistTabCwds` callback:

```typescript
/** 序列化指定会话的终端状态并保存到 IPC */
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

- [ ] **Step 2: Add periodic serialization timer**

Add a new `useEffect` after the existing warm-up effect:

```typescript
// 定期序列化：每 30 秒保存所有活跃 pool entry 的终端状态
useEffect(() => {
  const interval = setInterval(() => {
    const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
    for (const sessionId of sessionIds) {
      serializeSession(sessionId);
    }
  }, 30_000);
  return () => clearInterval(interval);
}, [sessionIdsKey, serializeSession]);
```

- [ ] **Step 3: Add beforeunload handler**

Add another `useEffect`:

```typescript
// 应用关闭前保存所有活跃终端状态
useEffect(() => {
  const handleBeforeUnload = () => {
    const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
    for (const sessionId of sessionIds) {
      serializeSession(sessionId);
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [sessionIdsKey, serializeSession]);
```

- [ ] **Step 4: Integrate serialization into debounced save**

In the `subscribePtyOutput` effect, change the debounced save callback from saving raw output to calling `serializeSession`:

Replace:
```typescript
saveDebounceRef.current.set(
  event.sessionId,
  setTimeout(() => {
    saveDebounceRef.current.delete(event.sessionId);
    const latest = sessionOutputsRef.current.get(event.sessionId);
    if (latest) {
      const cleaned = stripConptyRepaintBursts(latest);
      if (cleaned.bursts > 0) {
        sessionOutputsRef.current.set(event.sessionId, cleaned.text);
      }
      terminalOutputStore.save(event.sessionId, cleaned.text);
    }
  }, 500),
);
```

With:
```typescript
saveDebounceRef.current.set(
  event.sessionId,
  setTimeout(() => {
    saveDebounceRef.current.delete(event.sessionId);
    serializeSession(event.sessionId);
  }, 500),
);
```

- [ ] **Step 5: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/useTerminalPtyLifecycle.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts && git commit -m "feat(terminal): add periodic serialization and beforeunload handler"
```

---

### Task 4: Modify activateTab for SerializeAddon Restore

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`

**Interfaces:**
- Consumes: `terminalOutputStore.load()` (existing) — returns serialized state string
- Consumes: `terminalXtermPool.get(sessionId).terminal.write()` — writes serialized state
- Consumes: `attachSession()` (existing) — creates PTY

- [ ] **Step 1: Modify activateTab dead session path**

Replace the current dead session path in `activateTab`:

```typescript
// PTY 已死亡（应用重启后的恢复标签）：
// 直接创建新 PTY，不写入持久化输出。
ensureTabCwdsLoaded();
const rememberedCwd = tabCwdRef.current.get(tabId);
await attachSession(tabId, tab.profile, tab.workspaceId, {
  cwdOverride: rememberedCwd,
  revived: true,
});
```

With:

```typescript
// PTY 已死亡（应用重启后的恢复标签）：
// 1) 加载序列化状态并写入 xterm（精确还原终端视觉状态）
// 2) 创建新 PTY（shell 提示符自然出现在底部）
ensureTabCwdsLoaded();
const rememberedCwd = tabCwdRef.current.get(tabId);

// 等待 pool entry 就绪
let pooled = terminalXtermPool.get(sessionId);
if (!pooled) {
  for (let frame = 0; frame < 30; frame++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    pooled = terminalXtermPool.get(sessionId);
    if (pooled) {
      break;
    }
  }
}

// 加载并写入序列化状态
if (pooled) {
  const serialized = await terminalOutputStore.load(sessionId);
  if (serialized) {
    pooled.terminal.write(serialized);
    pooled.terminal.scrollToBottom();
  }
}

// 创建新 PTY
await attachSession(tabId, tab.profile, tab.workspaceId, {
  cwdOverride: rememberedCwd,
  revived: true,
});
```

- [ ] **Step 2: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/useTerminalPtyLifecycle.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts && git commit -m "feat(terminal): restore serialized terminal state on tab activation"
```

---

### Task 5: Remove Old Persistence Logic

**Files:**
- Modify: `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`

**Interfaces:**
- Removes: `ensureLoaded`, `loadedSessionIdsRef`, `loadPromisesRef`, warm-up effect, `ptyCreatedAtRef`, `STARTUP_WINDOW_MS`, startup window filter

- [ ] **Step 1: Remove ensureLoaded and related refs**

Remove from the hook:
- `loadPromisesRef` declaration
- `loadedSessionIdsRef` declaration
- `ptyCreatedAtRef` declaration
- `STARTUP_WINDOW_MS` constant
- `ensureLoaded` useCallback

- [ ] **Step 2: Remove warm-up effect**

Remove the `useEffect` that calls `ensureLoaded` for all sessions on startup:

```typescript
// 全量预热：标签集合（含会话）就绪后，后台并行加载所有会话的持久化输出。
useEffect(() => {
  const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
  if (sessionIds.length === 0) {
    return;
  }
  for (const sessionId of sessionIds) {
    void ensureLoaded(sessionId);
  }
}, [sessionIdsKey, ensureLoaded]);
```

- [ ] **Step 3: Remove startup window filter from subscribePtyOutput**

In the `subscribePtyOutput` effect, remove the startup window filter logic:

Remove:
```typescript
const createdAt = ptyCreatedAtRef.current.get(event.sessionId);
const inStartupWindow = createdAt !== undefined && Date.now() - createdAt < STARTUP_WINDOW_MS;
const filteredData = inStartupWindow ? data.replace(/\x1b\[(?:2J|3J|H|1;1H)/g, '') : data;
```

Replace all `filteredData` references with `data`.

- [ ] **Step 4: Remove ptyCreatedAtRef from attachSession**

In `attachSession`, remove the ptyCreatedAtRef setup:

```typescript
if (options?.revived) {
  ptyCreatedAtRef.current.set(sessionId, Date.now());
}
```

- [ ] **Step 5: Remove ptyCreatedAtRef cleanup**

Remove `ptyCreatedAtRef.current.delete(tab.sessionId)` from `handleCloseTab` and `handleCloseAllTabs`.

- [ ] **Step 6: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/terminal/useTerminalPtyLifecycle.ts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts && git commit -m "refactor(terminal): remove old persistence logic (ensureLoaded, warm-up, startup filter)"
```

---

### Task 6: Add serialize() to XtermTerminalHandle

**Files:**
- Modify: `frontend/src/app/components/terminal/XtermTerminal.tsx`

**Interfaces:**
- Consumes: `terminalXtermPool.get(sessionId).serializeAddon.serialize()` from Task 2
- Produces: `XtermTerminalHandle.serialize()` method

- [ ] **Step 1: Add serialize to XtermTerminalHandle interface**

```typescript
export interface XtermTerminalHandle {
  // ... existing methods ...
  /** 序列化终端状态为可写入字符串 */
  serialize(): string | null;
}
```

- [ ] **Step 2: Add serialize implementation to useImperativeHandle**

```typescript
serialize() {
  const entry = entryRef.current;
  if (!entry) {
    return null;
  }
  try {
    return entry.serializeAddon.serialize({ scrollback: 1000 });
  } catch {
    return null;
  }
},
```

- [ ] **Step 3: Run lint and typecheck**

```bash
cd ai-digital-life/frontend && npx eslint src/app/components/terminal/XtermTerminal.tsx && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/terminal/XtermTerminal.tsx && git commit -m "feat(terminal): add serialize() to XtermTerminalHandle"
```

---

### Task 7: Final Verification

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

- [ ] **Step 3: Run all frontend tests**

```bash
cd ai-digital-life/frontend && pnpm run test -- --run
```
Expected: All tests pass (pre-existing browser test failure is unrelated)

- [ ] **Step 4: Run Rust tests**

```bash
cd ai-digital-life && cargo test --workspace
```
Expected: All tests pass

- [ ] **Step 5: Manual verification checklist**

1. Create terminal, run commands, verify display is correct
2. Resize window, verify terminal adapts
3. Switch tabs, verify content preserved
4. Restart app, click historical tab, verify history visible in scrollback
5. Close tab, verify persisted data deleted
6. Create multiple tabs, restart, verify all tabs show history

- [ ] **Step 6: Commit final state**

```bash
cd AI-DIGITAL-LIFE/SourceWorkspace && git add -A && git commit -m "feat(terminal): SerializeAddon persistence — terminal state survives restarts"
```
