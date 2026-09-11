# Terminal Output Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement frontend httpBridge methods for terminal output persistence, enabling save/load/delete of terminal session outputs via the ad-server HTTP API.

**Architecture:** Add `terminalOutput` property to the existing `createHttpBridge` return object, following the same pattern as other domains (clipboard, snapshot, etc.). Each method maps to a POST endpoint using the existing `call` helper.

**Tech Stack:** TypeScript, Vitest, fetch-based HTTP bridge.

**Spec:** Task brief: `.superpowers/sdd/2026-09-11-terminal-output-persistence/task-4-brief.md`

## Global Constraints

- 新增 IPC 方法必须同步实现 tauri-bridge.ts / preview-bridge/ / mock-bridge.ts
- 功能行为必须在 Tauri 桌面和浏览器模式下一致
- TypeScript compilation must pass (`npx tsc --noEmit`)
- Existing tests must pass (`vitest`)

---

### Task 1: Add terminalOutput to httpBridge

**Files:**
- Modify: `ai-digital-life/frontend/src/httpBridge.ts` (insert after line 1033)
- Test: `ai-digital-life/frontend/src/httpBridge/__tests__/httpBridge.test.ts` (optional addition)

**Interfaces:**
- Consumes: `TerminalOutputBridge` interface from `shared/ipc/terminal-output.ts`
- Produces: `httpBridge.terminalOutput` with fetch implementations for save/load/delete

- [ ] **Step 1: Read existing httpBridge patterns**

  Examine `httpBridge.ts` lines 1000-1035 to understand the domain pattern: each domain is an object property with methods that call `call<T>(baseUrl, path, POST(body))`. Note the exact return type pattern (arrow functions returning `call` results).

- [ ] **Step 2: Add terminalOutput property**

  Insert after line 1033 (after `systemMonitor` domain). Use the exact pattern:

  ```typescript
      // ── Terminal-output persistence domain.
      terminalOutput: {
        save: (sessionId: string, output: string) =>
          call<void>(baseUrl, '/terminal/save', POST({ sessionId, output })),
        load: (sessionId: string) =>
          call<string | null>(baseUrl, '/terminal/load', POST({ sessionId })),
        delete: (sessionId: string) =>
          call<void>(baseUrl, '/terminal/delete', POST({ sessionId })),
      },
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
  Expected: PASS (no errors). If errors, adjust types.

- [ ] **Step 4: Run existing tests**

  Run: `cd ai-digital-life/frontend && npx vitest run --reporter=verbose`
  Expected: All existing tests pass (no regressions). The new terminalOutput methods are not yet tested but should not break existing behavior.

- [ ] **Step 5: (Optional) Add a test for terminalOutput**

  Add a test in `httpBridge.test.ts` to verify the mapping. Example:

  ```typescript
  it('maps terminalOutput.save to POST /terminal/save with { sessionId, output }', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true, data: null }));
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    await bridge.terminalOutput.save('sess-1', 'output data');
    const init = fetchMock.mock.calls[0]?.[1];
    const body = typeof init?.body === 'string' ? init.body : '{}';
    expect(JSON.parse(body)).toEqual({ sessionId: 'sess-1', output: 'output data' });
  });
  ```

  Run test to verify it passes.

- [ ] **Step 6: Commit**

  ```bash
  git add ai-digital-life/frontend/src/httpBridge.ts
  git commit -m "feat(bridge): add terminalOutput to httpBridge"
  ```

- [ ] **Step 7: Self-review**

  Review the change:
  - Does the new domain follow existing patterns exactly?
  - Are the endpoint paths correct (`/terminal/save`, `/terminal/load`, `/terminal/delete`)?
  - Do the method signatures match `TerminalOutputBridge` interface?
  - Are there any TypeScript errors?
  - Do existing tests still pass?

- [ ] **Step 8: Report**

  Write report to `.superpowers/sdd/2026-09-11-terminal-output-persistence/task-4-report.md` with status, commits, test summary, and any concerns.