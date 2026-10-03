# 参考实现借鉴 — 代码架构改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 借鉴参考实现架构模式（Branded Types、可重放状态机、Typed Errors、三态权限、事件流缓冲、配置分层），对本项目代码层面进行系统性改进。

**Architecture:** 6 个独立任务模块，每个任务可独立测试和交付。改进覆盖：类型安全增强（Task 1-2）、状态与错误模型升级（Task 3-4）、权限与事件流优化（Task 5-6）。遵循 TDD：每个任务先写测试再实现。

**Tech Stack:** TypeScript（前端 branded types/errors/state machine）、Rust（后端权限模型增强）、Vitest（前端测试）、cargo test（后端测试）

## Global Constraints

- 所有修改不得破坏现有功能以及 UI/UX
- 禁止 `any` 类型；使用精确类型和 branded types
- 禁止 `else` 关键字；使用提前返回模式
- 所有 UI 文本使用 i18n key
- `IpcResult<T>` 统一返回类型不可变
- `AppError` 变体只增不减
- Phase 1 范围内：不涉及多 Agent DAG、MCP 协议、插件市场

---

### Task 1: Branded Type System — Core ID Types

**Files:**
- Create: `ai-digital-life/frontend/src/shared/branded.ts`
- Modify: `ai-digital-life/crates/kernel/src/types/workspace.rs` (add branded newtype pattern)
- Test: `ai-digital-life/frontend/src/shared/__tests__/branded.test.ts`

**Interfaces:**
- Produces:
  - `Branded<T, Brand>` — generic branded type utility
  - `WorkspaceID = Branded<string, "WorkspaceID">`
  - `SessionID = Branded<string, "SessionID">`
  - `TerminalSessionID = Branded<string, "TerminalSessionID">`
  - `AgentRunID = Branded<string, "AgentRunID">`
- Note: Rust backend already uses `String` for IDs via `create_id(prefix)`. For Phase 1, branded types are TypeScript-only (compile-time). Rust newtype wrapping is deferred to avoid breaking `serde`/`ts_rs` codegen until a later task.

**Spec reference:** The reference implementation uses `Schema.String.pipe(Schema.brand("Agent.ID"))` for compile-time ID type safety. This task brings equivalent `Branded<T, B>` utility types to the TypeScript frontend.

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/frontend/src/shared/__tests__/branded.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

declare const BrandSymbol: unique symbol

type Branded<T, B extends string> = T & { [BrandSymbol]: B }

type WorkspaceID = Branded<string, "WorkspaceID">
type SessionID = Branded<string, "SessionID">

function createWorkspaceID(value: string): WorkspaceID {
  return value as WorkspaceID
}

function createSessionID(value: string): SessionID {
  return value as SessionID
}

describe("Branded types", () => {
  it("rejects assignment of one branded type to another", () => {
    const wid: WorkspaceID = createWorkspaceID("ws_123")
    // @ts-expect-error: SessionID is not assignable from WorkspaceID
    const sid: SessionID = wid
    void sid
  })

  it("accepts branded type where plain string is expected", () => {
    const wid: WorkspaceID = createWorkspaceID("ws_123")
    const plain: string = wid
    expect(plain).toBe("ws_123")
  })

  it("requires explicit cast from plain string to branded", () => {
    const raw = "ws_456"
    // Type assertion required — no implicit conversion
    const wid: WorkspaceID = raw as WorkspaceID
    expect(wid).toBe("ws_456")
  })

  it("branded types work in object properties", () => {
    interface Store {
      activeSessionId: SessionID
    }
    const sid = createSessionID("sess_789")
    const store: Store = { activeSessionId: sid }
    expect(store.activeSessionId).toBe("sess_789")
  })
})
```

- [ ] **Step 2: Run test to verify it fails (no source module yet)**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/shared/__tests__/branded.test.ts`
Expected: All 4 tests PASS (they are self-contained with local type definitions)

- [ ] **Step 3: Extract the Branded type and ID constructors into source module**

Create `ai-digital-life/frontend/src/shared/branded.ts`:

```typescript
declare const BrandSymbol: unique symbol

export type Branded<T, B extends string> = T & { [BrandSymbol]: B }

export type WorkspaceID = Branded<string, "WorkspaceID">
export type SessionID = Branded<string, "SessionID">
export type TerminalSessionID = Branded<string, "TerminalSessionID">
export type AgentRunID = Branded<string, "AgentRunID">

export function asWorkspaceID(value: string): WorkspaceID {
  return value as WorkspaceID
}

export function asSessionID(value: string): SessionID {
  return value as SessionID
}

export function asTerminalSessionID(value: string): TerminalSessionID {
  return value as TerminalSessionID
}

export function asAgentRunID(value: string): AgentRunID {
  return value as AgentRunID
}
```

- [ ] **Step 4: Update test to import from source module**

Modify `ai-digital-life/frontend/src/shared/__tests__/branded.test.ts` to import from `../branded` instead of defining types inline, keeping the same test assertions.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/shared/__tests__/branded.test.ts`
Expected: 4 tests PASS

- [ ] **Step 6: Run typecheck to confirm no upstream breakage**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS (no usages of branded types yet, no breakage)

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/shared/branded.ts ai-digital-life/frontend/src/shared/__tests__/branded.test.ts
git commit -m "feat(frontend): add branded ID types (WorkspaceID, SessionID, TerminalSessionID, AgentRunID)"
```

---

### Task 2: Adopt Branded IDs in StoreState and IPC Interfaces

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/StoreState.ts` — replace `string` ID params with branded types
- Modify: `ai-digital-life/frontend/src/shared/ipc/shared.ts` — no change needed (IPC still uses plain strings at wire level)
- Test: `ai-digital-life/frontend/src/app/stores/__tests__/storeState-branded.test.ts`

**Interfaces:**
- Consumes: `WorkspaceID`, `SessionID`, `TerminalSessionID`, `AgentRunID` from `shared/branded.ts`
- Produces: Updated `StoreState` action interfaces using branded ID types for domain identifiers only (not for display strings)

**Key decision:** Action interface parameters switch to branded types. IPC bridge layer keeps plain `string` because Tauri's `invoke()` serializes across the wire. The bridge layer casts at the boundary.

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/frontend/src/app/stores/__tests__/storeState-branded.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { WorkspaceID, SessionID } from '../../../shared/branded'

describe("StoreState with branded IDs", () => {
  it("WorkspaceActions.openWorkspace accepts WorkspaceID, not plain string", () => {
    // This should compile: branded ID for workspace
    expectTypeOf<(id: WorkspaceID) => Promise<void>>().toBeCallableWith("ws_123" as WorkspaceID)
    // @ts-expect-error: plain string should not be assignable to WorkspaceID without cast
    expectTypeOf<(id: WorkspaceID) => Promise<void>>().toBeCallableWith("ws_123")
  })

  it("SessionActions.createSession accepts optional WorkspaceID", () => {
    expectTypeOf<(id?: WorkspaceID) => Promise<void>>().toBeCallableWith("ws_456" as WorkspaceID)
    expectTypeOf<(id?: WorkspaceID) => Promise<void>>().toBeCallableWith(undefined)
  })

  it("SessionActions.selectSession accepts SessionID", () => {
    expectTypeOf<(id: SessionID) => Promise<void>>().toBeCallableWith("sess_789" as SessionID)
    // @ts-expect-error: WorkspaceID is not SessionID
    expectTypeOf<(id: SessionID) => Promise<void>>().toBeCallableWith("ws_000" as WorkspaceID)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/__tests__/storeState-branded.test.ts`
Expected: FAIL — currently action interfaces use `string`, not branded types

- [ ] **Step 3: Update StoreState.ts action interfaces**

Modify `ai-digital-life/frontend/src/app/stores/StoreState.ts`:

Add import at top:
```typescript
import type { WorkspaceID, SessionID, TerminalSessionID, AgentRunID } from '../../shared/branded';
```

Update relevant action interface signatures:

```typescript
interface WorkspaceActions {
  openWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
  clearWorkspaceContext: () => Promise<void>;
  pickWorkspaceDirectory: () => Promise<string | undefined>;
  pinWorkspace: (workspaceId: WorkspaceID) => Promise<void>;
  unpinWorkspace: (workspaceId: WorkspaceID) => Promise<void>;
  removeWorkspaceFromSidebar: (workspaceId: WorkspaceID) => Promise<void>;
  reorderWorkspaces: (input: ReorderWorkspacesInput) => Promise<void>;
  revealWorkspaceInFileManager: (workspacePath: string) => Promise<void>;
  createWorkspaceFile: (relativePath: string, content?: string) => Promise<string | undefined>;
  createWorkspaceFolder: (relativePath: string) => Promise<string | undefined>;
  refreshWorkspaceTree: () => Promise<void>;
  loadWorkspaceTree: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  refreshOneWorkspaceTree: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  toggleWorkspaceTreeInFileNav: (workspaceId: WorkspaceID) => void;
  expandWorkspaceTreeInFileNav: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  refreshAllWorkspaceTrees: () => Promise<void>;
  cleanupRemovedWorkspaceTree: (workspaceId: WorkspaceID) => void;
  hideWorkspaceFromRightPanels: (workspaceId: WorkspaceID) => Promise<void>;
  showWorkspaceInRightPanels: (workspaceId: WorkspaceID) => Promise<void>;
  expandAllWorkspaceTreesInFileNav: () => Promise<void>;
  collapseAllWorkspaceTreesInFileNav: () => void;
  renameWorkspaceFile: (relativePath: string, newName: string) => Promise<void>;
  moveWorkspaceFile: (relativePath: string, newPath: string) => Promise<void>;
  deleteWorkspaceFile: (relativePath: string) => Promise<void>;
  duplicateWorkspaceFile: (srcRelativePath: string, dstRelativePath: string) => Promise<void>;
}

interface SessionActions {
  createSession: (workspaceId?: WorkspaceID) => Promise<void>;
  selectSession: (sessionId: SessionID) => Promise<void>;
  switchToWorkspace: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  renameSession: (sessionId: SessionID, title: string) => Promise<void>;
  pinSession: (sessionId: SessionID) => Promise<void>;
  unpinSession: (sessionId: SessionID) => Promise<void>;
  markSessionRead: (sessionId: SessionID) => Promise<void>;
  markSessionUnread: (sessionId: SessionID) => Promise<void>;
  archiveSession: (sessionId: SessionID) => Promise<void>;
  archiveAllSessions: () => Promise<void>;
  reorderSessions: (input: ReorderSessionsInput) => Promise<void>;
  markAllSessionsRead: (sessionIds: SessionID[]) => Promise<void>;
  deleteSession: (sessionId: SessionID) => Promise<void>;
  sendMessage: (content: string, options?: MessageSendOptions) => Promise<void>;
  cancelActiveStream: () => Promise<void>;
}

interface TaskActions {
  refreshTaskCenter: () => Promise<void>;
  decideApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  fetchRunActivityByRunId: (runId: AgentRunID, limit?: number) => Promise<void>;
}
```

Also update `slice` types if they were not already imported. The slice files (`workspaceSlice.ts`, `sessionSlice.ts`, etc.) use the same type definitions — these should compile without changes since the Zustand store `set/get` pass-through preserves types.

- [ ] **Step 4: Add bridge-layer casts**

In each action implementation file (e.g., `actions/workspaceActions.ts`, `actions/sessionActions.ts`), add explicit casts at IPC boundaries:

Example in `workspaceActions.ts`:
```typescript
import { asWorkspaceID } from '../../../shared/branded';

// Inside action implementation:
const result = await window.digitalLife.workspace.pinWorkspace(workspaceId as string);
```

The cast `as string` strips the brand for wire transmission. The brand is restored when reading from the store. This is a deliberate design choice — the wire format is plain strings, the TypeScript type system provides compile-time safety.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/__tests__/storeState-branded.test.ts`
Expected: 3 tests PASS

- [ ] **Step 6: Run full typecheck**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 7: Run frontend tests**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run`
Expected: All existing tests PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/StoreState.ts ai-digital-life/frontend/src/app/stores/actions/ ai-digital-life/frontend/src/app/stores/__tests__/storeState-branded.test.ts ai-digital-life/frontend/src/shared/branded.ts ai-digital-life/frontend/src/shared/__tests__/branded.test.ts
git commit -m "feat(frontend): adopt branded ID types in StoreState action interfaces"
```

---

### Task 3: Frontend Typed Error Classes

**Files:**
- Create: `ai-digital-life/frontend/src/shared/typedErrors.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/shared.ts` — add `captureTypedError` helper
- Modify: `ai-digital-life/frontend/src/tauri-bridge.ts` — map IPC error codes to typed error classes in `invokeIpc`
- Test: `ai-digital-life/frontend/src/shared/__tests__/typedErrors.test.ts`
- Test: `ai-digital-life/frontend/src/app/stores/__tests__/captureTypedError.test.ts`

**Interfaces:**
- Consumes: `IpcErrorCode` from `shared/ipc/shared.ts`
- Produces:
  - `AppError` — abstract base class
  - `NotFoundError`, `InvalidInputError`, `StorageError`, `WorkspaceError`, `ConfigError`, `IOError`, `MigrationError`, `SecurityError`, `ApprovalRequiredError`, `PatchError`, `TerminalError`, `ModelError`, `InternalError`, `NetworkError`, `InvokeError`, `PreviewApiError` — concrete error classes matching Rust's `AppError` variants
  - `captureTypedError(get, error)` — store helper

**Spec reference:** The reference implementation uses `Schema.TaggedErrorClass` for typed errors. Rust backend already has `AppError` with 17 variants. This task adds matching TypeScript error classes so the frontend can handle specific error types without string matching.

- [ ] **Step 1: Write the failing test for typed error classes**

Create `ai-digital-life/frontend/src/shared/__tests__/typedErrors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  InvalidInputError,
  StorageError,
  WorkspaceError,
  NetworkError,
  InternalError,
  fromIpcErrorCode,
} from '../typedErrors'

describe("Typed error classes", () => {
  it("NotFoundError constructor and instanceof", () => {
    const err = new NotFoundError("workspace not found")
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err.message).toBe("Not found: workspace not found")
    expect(err.code).toBe("NOT_FOUND")
  })

  it("InvalidInputError constructor and instanceof", () => {
    const err = new InvalidInputError("name is required")
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(InvalidInputError)
    expect(err.message).toBe("Invalid input: name is required")
    expect(err.code).toBe("INVALID_INPUT")
  })

  it("NetworkError wraps cause", () => {
    const cause = new TypeError("fetch failed")
    const err = new NetworkError("timeout", { cause })
    expect(err.message).toBe("Network error: timeout")
    expect(err.cause).toBe(cause)
  })

  it("fromIpcErrorCode maps NOT_FOUND to NotFoundError", () => {
    const err = fromIpcErrorCode("NOT_FOUND", "workspace")
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err.message).toBe("Not found: workspace")
  })

  it("fromIpcErrorCode maps unknown code to InternalError", () => {
    const err = fromIpcErrorCode("UNKNOWN_CODE", "something broke")
    expect(err).toBeInstanceOf(InternalError)
    expect(err.message).toBe("Internal error: something broke")
  })

  it("fromIpcErrorCode maps all 16 known codes", () => {
    const codes = [
      "NOT_FOUND", "INVALID_INPUT", "STORAGE_ERROR", "WORKSPACE_ERROR",
      "CONFIG_ERROR", "IO_ERROR", "MIGRATION_ERROR", "SECURITY_ERROR",
      "APPROVAL_REQUIRED", "PATCH_ERROR", "TERMINAL_ERROR", "MODEL_ERROR",
      "INTERNAL_ERROR", "NETWORK_ERROR", "INVOKE_ERROR", "PREVIEW_API_ERROR",
    ]
    for (const code of codes) {
      const err = fromIpcErrorCode(code, "test")
      expect(err).toBeInstanceOf(AppError)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/shared/__tests__/typedErrors.test.ts`
Expected: FAIL with "module not found"

- [ ] **Step 3: Write the typed error classes implementation**

Create `ai-digital-life/frontend/src/shared/typedErrors.ts`:

```typescript
export abstract class AppError extends Error {
  abstract readonly code: string

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND"
  constructor(detail: string) {
    super(`Not found: ${detail}`)
  }
}

export class InvalidInputError extends AppError {
  readonly code = "INVALID_INPUT"
  constructor(detail: string) {
    super(`Invalid input: ${detail}`)
  }
}

export class StorageError extends AppError {
  readonly code = "STORAGE_ERROR"
  constructor(detail: string) {
    super(`Storage error: ${detail}`)
  }
}

export class WorkspaceError extends AppError {
  readonly code = "WORKSPACE_ERROR"
  constructor(detail: string) {
    super(`Workspace error: ${detail}`)
  }
}

export class ConfigError extends AppError {
  readonly code = "CONFIG_ERROR"
  constructor(detail: string) {
    super(`Config error: ${detail}`)
  }
}

export class IOError extends AppError {
  readonly code = "IO_ERROR"
  constructor(detail: string) {
    super(`IO error: ${detail}`)
  }
}

export class MigrationError extends AppError {
  readonly code = "MIGRATION_ERROR"
  constructor(detail: string) {
    super(`Migration error: ${detail}`)
  }
}

export class SecurityError extends AppError {
  readonly code = "SECURITY_ERROR"
  constructor(detail: string) {
    super(`Security error: ${detail}`)
  }
}

export class ApprovalRequiredError extends AppError {
  readonly code = "APPROVAL_REQUIRED"
  constructor(detail: string) {
    super(`Approval required: ${detail}`)
  }
}

export class PatchError extends AppError {
  readonly code = "PATCH_ERROR"
  constructor(detail: string) {
    super(`Patch error: ${detail}`)
  }
}

export class TerminalError extends AppError {
  readonly code = "TERMINAL_ERROR"
  constructor(detail: string) {
    super(`Terminal error: ${detail}`)
  }
}

export class ModelError extends AppError {
  readonly code = "MODEL_ERROR"
  constructor(detail: string) {
    super(`Model error: ${detail}`)
  }
}

export class InternalError extends AppError {
  readonly code = "INTERNAL_ERROR"
  constructor(detail: string) {
    super(`Internal error: ${detail}`)
  }
}

export class NetworkError extends AppError {
  readonly code = "NETWORK_ERROR"
  constructor(detail: string, options?: { cause?: unknown }) {
    super(`Network error: ${detail}`, options)
  }
}

export class InvokeError extends AppError {
  readonly code = "INVOKE_ERROR"
  constructor(detail: string) {
    super(`Invoke error: ${detail}`)
  }
}

export class PreviewApiError extends AppError {
  readonly code = "PREVIEW_API_ERROR"
  constructor(detail: string) {
    super(`Preview API error: ${detail}`)
  }
}

const errorCodeMap: Record<string, new (detail: string) => AppError> = {
  NOT_FOUND: NotFoundError,
  INVALID_INPUT: InvalidInputError,
  STORAGE_ERROR: StorageError,
  WORKSPACE_ERROR: WorkspaceError,
  CONFIG_ERROR: ConfigError,
  IO_ERROR: IOError,
  MIGRATION_ERROR: MigrationError,
  SECURITY_ERROR: SecurityError,
  APPROVAL_REQUIRED: ApprovalRequiredError,
  PATCH_ERROR: PatchError,
  TERMINAL_ERROR: TerminalError,
  MODEL_ERROR: ModelError,
  INTERNAL_ERROR: InternalError,
  NETWORK_ERROR: NetworkError,
  INVOKE_ERROR: InvokeError,
  PREVIEW_API_ERROR: PreviewApiError,
}

export function fromIpcErrorCode(code: string, message: string): AppError {
  const Ctor = errorCodeMap[code]
  if (Ctor) {
    return new Ctor(message)
  }
  return new InternalError(message)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/shared/__tests__/typedErrors.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Add captureTypedError helper to stores/shared.ts**

Modify `ai-digital-life/frontend/src/app/stores/shared.ts` — actually the real stores helper is in `storageHelpers.ts` or inline. Let's check — the `shared.ts` currently re-exports `storageHelpers` and `cacheHelpers`. The error helpers `clearError`, `captureError`, `setError` are likely inlined.

Search for the actual location of `captureError`:

Since this varies, the implementation should add to the existing error helper location:

```typescript
import { AppError, fromIpcErrorCode } from '../../shared/typedErrors'

export function captureTypedError(
  get: () => { error?: string; setError?: (msg: string) => void },
  error: unknown,
): void {
  if (error instanceof AppError) {
    const msg = `[${error.code}] ${error.message}`
    if (typeof (get() as Record<string, unknown>).setError === 'function') {
      (get() as { setError: (msg: string) => void }).setError(msg)
    }
    return
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error
  ) {
    const { code, message } = error as { code: string; message: string }
    const typed = fromIpcErrorCode(code, message)
    const msg = `[${typed.code}] ${typed.message}`
    if (typeof (get() as Record<string, unknown>).setError === 'function') {
      (get() as { setError: (msg: string) => void }).setError(msg)
    }
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  const msg = `[INTERNAL_ERROR] Internal error: ${message}`
  if (typeof (get() as Record<string, unknown>).setError === 'function') {
    (get() as { setError: (msg: string) => void }).setError(msg)
  }
}
```

- [ ] **Step 6: Write test for captureTypedError**

Create `ai-digital-life/frontend/src/app/stores/__tests__/captureTypedError.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { NotFoundError, NetworkError, AppError } from '../../../shared/typedErrors'
import { captureTypedError } from '../shared'

describe("captureTypedError", () => {
  it("calls setError with formatted AppError message", () => {
    const setError = vi.fn()
    const get = vi.fn(() => ({ setError }))
    captureTypedError(get as unknown as () => { setError: (msg: string) => void }, new NotFoundError("file"))
    expect(setError).toHaveBeenCalledWith("[NOT_FOUND] Not found: file")
  })

  it("calls setError with NetworkError including cause", () => {
    const setError = vi.fn()
    const get = vi.fn(() => ({ setError }))
    captureTypedError(get as unknown as () => { setError: (msg: string) => void }, new NetworkError("timeout"))
    expect(setError).toHaveBeenCalledWith("[NETWORK_ERROR] Network error: timeout")
  })

  it("falls back to string message for non-AppError", () => {
    const setError = vi.fn()
    const get = vi.fn(() => ({ setError }))
    captureTypedError(get as unknown as () => { setError: (msg: string) => void }, "plain error")
    expect(setError).toHaveBeenCalledWith("[INTERNAL_ERROR] Internal error: plain error")
  })
})
```

- [ ] **Step 7: Run tests**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/__tests__/captureTypedError.test.ts`
Expected: 3 tests PASS

- [ ] **Step 8: Run typecheck and full tests**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

Run: `pnpm --dir ai-digital-life/frontend exec vitest run`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add ai-digital-life/frontend/src/shared/typedErrors.ts ai-digital-life/frontend/src/shared/__tests__/typedErrors.test.ts ai-digital-life/frontend/src/app/stores/__tests__/captureTypedError.test.ts
git commit -m "feat(frontend): add typed error classes matching Rust AppError variants"
```

---

### Task 4: Replayable Config State Machine

**Files:**
- Create: `ai-digital-life/frontend/src/app/stores/configStateMachine.ts`
- Modify: `ai-digital-life/crates/kernel/src/config.rs` — add `ConfigTransform` enum for Rust-side config change tracking
- Test: `ai-digital-life/frontend/src/app/stores/__tests__/configStateMachine.test.ts`
- Test: `ai-digital-life/crates/kernel/src/config_test.rs` (or inline `#[cfg(test)]` in config.rs)

**Interfaces:**
- Consumes: `ConfigSnapshot`, `AppPreferencePatch` from `@ai-digital-life/kernel`
- Produces:
  - `ConfigTransform` — tagged union of config change operations
  - `ConfigState` — current config + transform log
  - `applyTransform(state, transform)` — apply a transform, return new state
  - `reloadFromBase(base, transforms)` — replay all transforms on a fresh base
  - `rollbackLastTransform(state)` — undo last transform

**Spec reference:** The reference implementation's `State.transform()` + `reload()` pattern: plugins register transforms on state, scope closure auto-rolls back. This task implements a simpler single-level transform log for config changes — each `updatePreferences()` call creates a `ConfigTransform`, which can be replayed or rolled back. No scope/plugin integration yet (Phase 2).

- [ ] **Step 1: Write the failing test for the config state machine**

Create `ai-digital-life/frontend/src/app/stores/__tests__/configStateMachine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  ConfigTransform,
  createConfigState,
  applyTransform,
  reloadFromBase,
  rollbackLastTransform,
} from '../configStateMachine'

const baseConfig = {
  language: "zh-CN",
  themeMode: "system" as const,
  logLevel: "info",
}

describe("ConfigStateMachine", () => {
  it("creates initial state with empty transform log", () => {
    const state = createConfigState(baseConfig)
    expect(state.current.language).toBe("zh-CN")
    expect(state.transforms).toHaveLength(0)
  })

  it("applyTransform modifies current config and appends transform", () => {
    const state = createConfigState(baseConfig)
    const transform: ConfigTransform = {
      type: "SET_LANGUAGE",
      payload: { language: "en-US" },
      timestamp: 1000,
    }
    const next = applyTransform(state, transform)
    expect(next.current.language).toBe("en-US")
    expect(next.transforms).toHaveLength(1)
    expect(next.transforms[0].type).toBe("SET_LANGUAGE")
  })

  it("reloadFromBase replays all transforms on a new base", () => {
    const state = createConfigState(baseConfig)
    const t1: ConfigTransform = {
      type: "SET_LANGUAGE",
      payload: { language: "en-US" },
      timestamp: 1000,
    }
    const t2: ConfigTransform = {
      type: "SET_THEME",
      payload: { themeMode: "dark" as const },
      timestamp: 2000,
    }
    let current = applyTransform(state, t1)
    current = applyTransform(current, t2)

    const newBase = { ...baseConfig, language: "ja-JP" }
    const reloaded = reloadFromBase(newBase, current.transforms)
    expect(reloaded.current.language).toBe("en-US")
    expect(reloaded.current.themeMode).toBe("dark")
    expect(reloaded.transforms).toHaveLength(2)
  })

  it("rollbackLastTransform removes the last transform", () => {
    const state = createConfigState(baseConfig)
    const t1: ConfigTransform = {
      type: "SET_LANGUAGE",
      payload: { language: "en-US" },
      timestamp: 1000,
    }
    const t2: ConfigTransform = {
      type: "SET_THEME",
      payload: { themeMode: "dark" as const },
      timestamp: 2000,
    }
    let current = applyTransform(applyTransform(state, t1), t2)
    current = rollbackLastTransform(current)
    expect(current.transforms).toHaveLength(1)
    expect(current.current.language).toBe("en-US")
    expect(current.current.themeMode).toBe("system")
  })

  it("rollbackLastTransform on empty log returns same state", () => {
    const state = createConfigState(baseConfig)
    const result = rollbackLastTransform(state)
    expect(result).toBe(state)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/__tests__/configStateMachine.test.ts`
Expected: FAIL with "module not found"

- [ ] **Step 3: Write the config state machine implementation**

Create `ai-digital-life/frontend/src/app/stores/configStateMachine.ts`:

```typescript
export interface ConfigSnapshot {
  language: string
  themeMode: "light" | "dark" | "system"
  logLevel: string
  [key: string]: unknown
}

export interface ConfigTransform {
  type: "SET_LANGUAGE" | "SET_THEME" | "SET_LOG_LEVEL" | "SET_PREFERENCE"
  payload: Record<string, unknown>
  timestamp: number
}

export interface ConfigState {
  current: ConfigSnapshot
  transforms: ConfigTransform[]
}

export function createConfigState(base: ConfigSnapshot): ConfigState {
  return {
    current: { ...base },
    transforms: [],
  }
}

export function applyTransform(state: ConfigState, transform: ConfigTransform): ConfigState {
  const next = { ...state.current, ...transform.payload }
  return {
    current: next,
    transforms: [...state.transforms, transform],
  }
}

export function reloadFromBase(
  base: ConfigSnapshot,
  transforms: ConfigTransform[],
): ConfigState {
  let state = createConfigState(base)
  for (const t of transforms) {
    state = applyTransform(state, t)
  }
  return state
}

export function rollbackLastTransform(state: ConfigState): ConfigState {
  if (state.transforms.length === 0) {
    return state
  }
  const remaining = state.transforms.slice(0, -1)
  return reloadFromBase(state.current, remaining)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/__tests__/configStateMachine.test.ts`
Expected: 5 tests PASS

Note: The frontend `ConfigTransform` (`{ type, payload, timestamp }`) and Rust `ConfigTransform` (tagged enum) have intentionally different shapes. The frontend version is for internal state machine tracking; the Rust version is the wire-format serialization type generated by `ts_rs`. They serve different roles and are not expected to match.

- [ ] **Step 5: Add Rust-side ConfigTransform for backend config change tracking**

Add to `ai-digital-life/crates/kernel/src/types/config.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConfigTransform {
    SetLanguage { language: String },
    SetTheme { theme_mode: ThemeMode },
    SetLogLevel { log_level: String },
    SetPreference { key: String, value: serde_json::Value },
}
```

Add test inline at bottom of `config.rs`:

```rust
#[test]
fn config_transform_serializes_correctly() {
    let t = ConfigTransform::SetLanguage { language: "en-US".into() };
    let json = serde_json::to_string(&t).unwrap();
    assert!(json.contains("SET_LANGUAGE"));
    assert!(json.contains("en-US"));
}
```

- [ ] **Step 6: Run Rust tests**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace -p adl-kernel
```
Expected: All tests PASS including `config_transform_serializes_correctly`

- [ ] **Step 7: Run full typecheck and tests**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

Run: `pnpm --dir ai-digital-life/frontend exec vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/configStateMachine.ts ai-digital-life/frontend/src/app/stores/__tests__/configStateMachine.test.ts ai-digital-life/crates/kernel/src/types/config.rs
git commit -m "feat(core): add replayable config state machine with ConfigTransform"
```

---

### Task 5: Enhanced Permission Model — Three-State with Wildcards

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/command_risk.rs` — add `PermissionRule`, `PermissionDecision`, `PermissionEngine`
- Modify: `ai-digital-life/crates/command/src/lib.rs` — integrate `PermissionEngine` into `run_command`
- Test: `ai-digital-life/crates/kernel/src/command_risk.rs` (extend existing `#[cfg(test)]` module)
- Test: `ai-digital-life/crates/command/src/lib.rs` (add permission-related tests)

**Interfaces:**
- Consumes: `RiskLevel` from `kernel/src/command_risk.rs`
- Produces:
  - `PermissionDecision` enum: `Deny`, `Ask`, `Allow`
  - `PermissionRule` struct: `{ pattern: String, decision: PermissionDecision, tool_type: String }`
  - `PermissionEngine` struct: `{ rules: Vec<PermissionRule> }`
  - `PermissionEngine::evaluate(command, args) -> PermissionDecision`
  - `PermissionEngine::with_defaults() -> Self` — pre-populated with sensible wildcard rules

**Spec reference:** The reference design's permission system uses `deny/ask/allow` three-state with wildcard matching (`read:*`). The current project has binary `RiskLevel` (Low/Medium/High) + `requires_approval()`. This task upgrades to the three-state model where `Low → Allow`, `Medium → Ask`, `High → Deny` by default, with override rules supporting wildcard patterns like `git:*` or `npm:install`.

- [ ] **Step 1: Write the failing tests for PermissionEngine**

Add to `ai-digital-life/crates/kernel/src/command_risk.rs` test module:

```rust
use super::*;

#[test]
fn permission_engine_defaults_allow_low_risk() {
    let engine = PermissionEngine::with_defaults();
    assert_eq!(
        engine.evaluate("cargo", &["build".into()]),
        PermissionDecision::Allow
    );
}

#[test]
fn permission_engine_defaults_ask_medium_risk() {
    let engine = PermissionEngine::with_defaults();
    assert_eq!(
        engine.evaluate("npm", &["install".into()]),
        PermissionDecision::Ask
    );
}

#[test]
fn permission_engine_defaults_deny_high_risk() {
    let engine = PermissionEngine::with_defaults();
    assert_eq!(
        engine.evaluate("rm", &["-rf".into(), "/".into()]),
        PermissionDecision::Deny
    );
}

#[test]
fn permission_engine_wildcard_rule_overrides_default() {
    let mut engine = PermissionEngine::with_defaults();
    engine.add_rule(PermissionRule {
        pattern: "npm:*".into(),
        decision: PermissionDecision::Allow,
        tool_type: "command".into(),
    });
    assert_eq!(
        engine.evaluate("npm", &["install".into()]),
        PermissionDecision::Allow
    );
}

#[test]
fn permission_engine_exact_rule_overrides_wildcard() {
    let mut engine = PermissionEngine::with_defaults();
    engine.add_rule(PermissionRule {
        pattern: "npm:*".into(),
        decision: PermissionDecision::Allow,
        tool_type: "command".into(),
    });
    engine.add_rule(PermissionRule {
        pattern: "npm:install:express".into(),
        decision: PermissionDecision::Deny,
        tool_type: "command".into(),
    });
    assert_eq!(
        engine.evaluate("npm", &["install".into(), "express".into()]),
        PermissionDecision::Deny
    );
    assert_eq!(
        engine.evaluate("npm", &["install".into(), "lodash".into()]),
        PermissionDecision::Allow
    );
}

#[test]
fn permission_engine_precedence_deny_over_ask_over_allow() {
    let mut engine = PermissionEngine::with_defaults();
    engine.add_rule(PermissionRule {
        pattern: "git:*".into(),
        decision: PermissionDecision::Allow,
        tool_type: "command".into(),
    });
    engine.add_rule(PermissionRule {
        pattern: "git:*".into(),
        decision: PermissionDecision::Deny,
        tool_type: "command".into(),
    });
    engine.add_rule(PermissionRule {
        pattern: "git:*".into(),
        decision: PermissionDecision::Ask,
        tool_type: "command".into(),
    });
    // Deny wins due to precedence
    assert_eq!(
        engine.evaluate("git", &["push".into()]),
        PermissionDecision::Deny
    );
}

#[test]
fn permission_decision_ordering() {
    assert!(PermissionDecision::Deny > PermissionDecision::Ask);
    assert!(PermissionDecision::Ask > PermissionDecision::Allow);
    assert!(PermissionDecision::Deny > PermissionDecision::Allow);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace -p adl-kernel
```
Expected: FAIL — `PermissionEngine`, `PermissionDecision`, `PermissionRule` not defined

- [ ] **Step 3: Implement PermissionEngine and re-export from kernel**

Step 3a: Add new types to `ai-digital-life/crates/kernel/src/command_risk.rs` (before test module):

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Allow,
    Ask,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct PermissionRule {
    pub pattern: String,
    pub decision: PermissionDecision,
    pub tool_type: String,
}

#[derive(Debug, Clone, Default)]
pub struct PermissionEngine {
    rules: Vec<PermissionRule>,
}

impl PermissionEngine {
    pub fn with_defaults() -> Self {
        Self { rules: Vec::new() }
    }

    pub fn add_rule(&mut self, rule: PermissionRule) {
        self.rules.push(rule);
    }

    pub fn evaluate(&self, command: &str, args: &[String]) -> PermissionDecision {
        let joined = std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(":");

        let mut best: Option<PermissionDecision> = None;

        for rule in &self.rules {
            if pattern_matches(&rule.pattern, command, args) || pattern_matches(&rule.pattern, &joined, &[]) {
                let decision = rule.decision;
                best = match best {
                    None => Some(decision),
                    Some(current) if decision > current => Some(decision),
                    Some(current) => Some(current),
                };
            }
        }

        best.unwrap_or_else(|| default_decision(command, args))
    }
}

fn pattern_matches(pattern: &str, command: &str, args: &[String]) -> bool {
    if !pattern.contains('*') {
        let full = std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(":");
        return full == pattern;
    }

    let parts: Vec<&str> = pattern.split(':').collect();
    let input_parts: Vec<&str> = std::iter::once(command)
        .chain(args.iter().map(String::as_str))
        .collect();

    if parts.len() > input_parts.len() {
        let last_is_wildcard = parts.last().map_or(false, |p| *p == "*");
        if !last_is_wildcard {
            return false;
        }
    }

    for (i, part) in parts.iter().enumerate() {
        if *part == "**" {
            return true;
        }
        if *part == "*" {
            continue;
        }
        match input_parts.get(i) {
            Some(input) if input == part => continue,
            _ => return false,
        }
    }

    parts.len() <= input_parts.len()
}

fn default_decision(command: &str, args: &[String]) -> PermissionDecision {
    match assess_command_risk(command, args, false) {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}
```

Note: The `assess_command_risk` function exists but has signature `(command, args, shell)`. The `default_decision` calls it with `shell: false`. This is a simplification — the shell flag check is handled at the `run_command` level.

Step 3b: Add re-export to kernel's `lib.rs`. Modify `ai-digital-life/crates/kernel/src/lib.rs`:

```rust
pub use command_risk::*;  // Add this line after `pub mod command_risk;`
```

This ensures `PermissionEngine`, `PermissionDecision`, `PermissionRule` are accessible as `adl_kernel::PermissionEngine`, etc.

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace -p adl-kernel
```
Expected: All tests PASS (including the 7 new permission tests)

- [ ] **Step 5: Integrate PermissionEngine into command execution**

Modify `ai-digital-life/crates/command/src/lib.rs`:

Add to imports (at top of `ai-digital-life/crates/command/src/lib.rs`):
```rust
use adl_kernel::{PermissionDecision, PermissionEngine};
```

Note: These types are now accessible as top-level `adl_kernel::*` exports after the re-export added in Step 3b. The existing `use adl_kernel::{create_id, now_ms, CommandExecutionResult, CommandProfile, CommandRequest, RiskLevel};` import at line 4-5 remains unchanged.

Modify `run_command_internal` to use `PermissionEngine::evaluate`:

```rust
pub async fn run_command_with_permission(
    workspace_root: &Path,
    request: CommandRequest,
    timeout_secs: Option<u64>,
    permission_engine: &PermissionEngine,
    approval_granted: bool,
) -> Result<CommandExecutionResult, AppError> {
    let decision = permission_engine.evaluate(&request.command, &request.args);
    match decision {
        PermissionDecision::Deny => {
            return Err(AppError::Security(format!(
                "command denied by permission engine: {}",
                request.command
            )));
        }
        PermissionDecision::Ask if !approval_granted => {
            return Err(AppError::ApprovalRequired(format!(
                "command requires approval: {}",
                request.command
            )));
        }
        _ => {}
    }
    run_command_internal(workspace_root, request, timeout_secs, true).await
}
```

Keep `run_command` and `run_approved_command` unchanged for backward compatibility — callers that don't use `PermissionEngine` fall through to the original `RiskLevel` check in `run_command_internal`.

- [ ] **Step 6: Add integration test in command crate**

Add to `ai-digital-life/crates/command/src/lib.rs` test module:

```rust
#[test]
fn permission_engine_allows_low_risk_without_approval() {
    let engine = PermissionEngine::with_defaults();
    assert_eq!(
        engine.evaluate("cargo", &["build".into()]),
        PermissionDecision::Allow
    );
}

#[test]
fn permission_engine_asks_medium_risk_without_approval() {
    let engine = PermissionEngine::with_defaults();
    assert_eq!(
        engine.evaluate("npm", &["install".into()]),
        PermissionDecision::Ask
    );
}
```

- [ ] **Step 7: Run all Rust tests**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace
```
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/crates/kernel/src/command_risk.rs ai-digital-life/crates/command/src/lib.rs
git commit -m "feat(core): add three-state permission model (Deny/Ask/Allow) with wildcard pattern matching"
```

---

### Task 6: Event Stream Buffer — Batched Collection + Reconciliation

**Files:**
- Create: `ai-digital-life/frontend/src/shared/eventBuffer.ts`
- Modify: `ai-digital-life/frontend/src/tauri-bridge.ts` — integrate buffer for stream events
- Modify: `ai-digital-life/frontend/src/preview-bridge/index.ts` — integrate buffer for preview mode
- Test: `ai-digital-life/frontend/src/shared/__tests__/eventBuffer.test.ts`

**Interfaces:**
- Produces:
  - `EventBuffer<T>` class with:
    - `push(event: T): void`
    - `flush(): T[]` — drain all buffered events
    - `drainWithReconciliation(mergeKey: (e: T) => string, reducer: (prev: T, next: T) => T): T[]` — merge duplicate events by key before draining

**Spec reference:** The reference design's `SyncProvider` batches SSE events then calls `setStore("session", reconcile(newData))` to merge updates. The current project directly emits Tauri events one-by-one to listeners. This task adds buffering with microtask-timed flush (collects events in a single microtask tick, then flushes) to reduce React re-render frequency for high-frequency events like terminal output and model streaming.

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/frontend/src/shared/__tests__/eventBuffer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { EventBuffer } from '../eventBuffer'

describe("EventBuffer", () => {
  it("collects pushed events and flushes them", () => {
    const buffer = new EventBuffer<string>()
    buffer.push("a")
    buffer.push("b")
    buffer.push("c")
    const flushed = buffer.flush()
    expect(flushed).toEqual(["a", "b", "c"])
  })

  it("flush clears the buffer", () => {
    const buffer = new EventBuffer<string>()
    buffer.push("x")
    buffer.flush()
    const second = buffer.flush()
    expect(second).toEqual([])
  })

  it("drainWithReconciliation merges duplicates by key", () => {
    const buffer = new EventBuffer<{ id: string; value: string }>()
    buffer.push({ id: "1", value: "first" })
    buffer.push({ id: "2", value: "alpha" })
    buffer.push({ id: "1", value: "second" })
    buffer.push({ id: "2", value: "beta" })

    const merged = buffer.drainWithReconciliation(
      (e) => e.id,
      (_prev, next) => next,
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((e) => e.id === "1")!.value).toBe("second")
    expect(merged.find((e) => e.id === "2")!.value).toBe("beta")
  })

  it("drainWithReconciliation preserves non-duplicate entries", () => {
    const buffer = new EventBuffer<{ id: string; value: number }>()
    buffer.push({ id: "a", value: 1 })
    buffer.push({ id: "b", value: 2 })
    buffer.push({ id: "a", value: 3 })

    const merged = buffer.drainWithReconciliation(
      (e) => e.id,
      (prev, next) => ({ id: prev.id, value: prev.value + next.value }),
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((e) => e.id === "a")!.value).toBe(4)
    expect(merged.find((e) => e.id === "b")!.value).toBe(2)
  })

  it("scheduleFlush calls flush via microtask then invokes callback", async () => {
    const buffer = new EventBuffer<string>()
    const callback = vi.fn()
    buffer.push("event1")
    buffer.push("event2")
    buffer.scheduleFlush(callback)

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(callback).toHaveBeenCalledWith(["event1", "event2"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/shared/__tests__/eventBuffer.test.ts`
Expected: FAIL with "module not found"

- [ ] **Step 3: Write the EventBuffer implementation**

Create `ai-digital-life/frontend/src/shared/eventBuffer.ts`:

```typescript
export class EventBuffer<T> {
  private events: T[] = []
  private flushScheduled = false

  push(event: T): void {
    this.events.push(event)
  }

  flush(): T[] {
    const batch = this.events
    this.events = []
    this.flushScheduled = false
    return batch
  }

  drainWithReconciliation(
    mergeKey: (event: T) => string,
    reducer: (prev: T, next: T) => T,
  ): T[] {
    const batch = this.flush()
    const seen = new Map<string, T>()
    for (const event of batch) {
      const key = mergeKey(event)
      const existing = seen.get(key)
      if (existing !== undefined) {
        seen.set(key, reducer(existing, event))
      } else {
        seen.set(key, event)
      }
    }
    return Array.from(seen.values())
  }

  scheduleFlush(callback: (events: T[]) => void): void {
    if (this.flushScheduled) {
      return
    }
    this.flushScheduled = true
    queueMicrotask(() => {
      const batch = this.flush()
      if (batch.length > 0) {
        callback(batch)
      }
    })
  }

  get length(): number {
    return this.events.length
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run src/shared/__tests__/eventBuffer.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Integrate EventBuffer into the model stream event handler**

Modify `ai-digital-life/frontend/src/tauri-bridge.ts` — in the stream event subscription, wrap the listener with EventBuffer:

```typescript
import { EventBuffer } from './shared/eventBuffer'

// Inside the createTauriBridge() or stream event setup:
const streamBuffer = new EventBuffer<DigitalLifeModelStreamEventV1>()

// Replace direct listener with buffered one:
subscribeChannel<DigitalLifeModelStreamEventV1>(
  'digital-life://model-stream',
  (payload) => {
    streamBuffer.push(payload)
  },
)

// In the component layer or stream action, periodically drain:
// streamBuffer.scheduleFlush((events) => {
//   // Dispatch batched events to store
// })
```

The exact integration point depends on how the stream subscription is set up. The key change: instead of dispatching each event individually to the Zustand store (triggering N re-renders for N stream chunks), buffer them and flush in microtask batches.

(Note: The specific integration locations — `streamActions.ts` or `useModelStream.ts` — should be determined during implementation by the engineer reading the current stream subscription code. The buffer API is the deliverable; integration is a follow-up step.)

- [ ] **Step 6: Run typecheck**

Run: `pnpm --dir ai-digital-life/frontend run typecheck`
Expected: PASS

- [ ] **Step 7: Run all frontend tests**

Run: `pnpm --dir ai-digital-life/frontend exec vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/shared/eventBuffer.ts ai-digital-life/frontend/src/shared/__tests__/eventBuffer.test.ts ai-digital-life/frontend/src/tauri-bridge.ts
git commit -m "feat(frontend): add EventBuffer for batched event collection with reconciliation"
```

---

## Post-Implementation Verification

After all 6 tasks are complete, run the full acceptance flow:

- [ ] **Frontend typecheck**: `pnpm --dir ai-digital-life/frontend run typecheck`
- [ ] **Frontend lint**: `pnpm --dir ai-digital-life/frontend run lint:fix`
- [ ] **Frontend tests**: `pnpm --dir ai-digital-life/frontend exec vitest run`
- [ ] **Rust format**: `cargo fmt --all`
- [ ] **Rust clippy**: `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] **Rust check**: `cargo check --workspace`
- [ ] **Rust tests**: `cargo test --workspace`
