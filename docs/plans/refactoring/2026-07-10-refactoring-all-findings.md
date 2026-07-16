# Refactoring Insight — All Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 18 findings from the 2026-07-10 refactoring insight report across frontend bridges, Rust backend, browser feature, error handling, and performance hygiene.

**Architecture:** Phased approach — High-priority rule violations and complexity hotspots first, then Medium-priority structural improvements, then Low-priority quick wins. Each task is independently testable and committable. Frontend uses TDD with Vitest; Rust uses TDD with `cargo test`. All changes follow existing project patterns (Zustand slices, Tauri command handlers, `invokeIpc` wrapper, `preview-bridge/` factory pattern).

**Tech Stack:** Rust 1.85+ / Tauri 2.x / React 19 / Vite 8 / TypeScript 5.6 / Zustand 5 / Vitest 3 / pnpm 11

## Global Constraints

- **No `any` type**: Use precise types, `unknown`, and type guards (project rule `dev-rules.md`)
- **No `else`**: Use early-return pattern (project rule `dev-rules.md`)
- **No empty catch blocks**: All catches must at minimum `console.warn` (project rule `error-handling.md`)
- **i18n for all UI text**: No hardcoded Chinese/English in rendered output (project rule `dev-rules.md`)
- **Rust: no `unwrap()` in production code**: Use `?` or `.expect()` with context (project rule `dev-rules.md`)
- **Bridge layer threshold**: Single bridge file > 600 lines must be split per-domain (project rule `tauri-shell.md`)
- **Component threshold**: `.tsx` files > 400 lines should be split (project rule `component-architecture.md`)
- **Node.js PATH**: Run `$env:Path = "D:\Program Files\nodejs;$env:Path"` before any `pnpm`/`npm` command
- **Rust PATH**: Run `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` before any `cargo` command
- **Acceptance flow**: After all code changes, run the mandatory testing flow (ESLint + Prettier + typecheck + tests for frontend; rustfmt + clippy + check + tests for Rust)

---

## File Structure

### Files to Create

| File | Responsibility |
|------|----------------|
| `frontend/src/mock/mock-window.ts` | Mock bridge: window domain (minimize, maximize, close, etc.) |
| `frontend/src/mock/mock-app.ts` | Mock bridge: app domain (getInfo, getHealth, getDiagnostics, etc.) |
| `frontend/src/mock/mock-agent.ts` | Mock bridge: agent + subagent domains |
| `frontend/src/mock/mock-browser.ts` | Mock bridge: browser domain |
| `frontend/src/mock/mock-ci.ts` | Mock bridge: ci + github domains (shared token logic) |
| `frontend/src/mock/mock-provider.ts` | Mock bridge: provider domain |
| `frontend/src/mock/mock-mcp.ts` | Mock bridge: mcp domain |
| `frontend/src/mock/mock-snapshot.ts` | Mock bridge: snapshot domain |
| `frontend/src/mock/mock-misc.ts` | Mock bridge: webTools, commandsConfig, permission, compaction, sessionFork, lsp, plugin, reference, durable, reserved, customAgent, command, runActivity |
| `frontend/src/tauri-bridge/shared.ts` | Tauri bridge: `invokeIpc`, `subscribeChannel`, `isTauriShell` helpers |
| `frontend/src/tauri-bridge/index.ts` | Tauri bridge: `createTauriBridge()` assembler |
| `frontend/src/tauri-bridge/workspace.ts` | Tauri bridge: workspace domain |
| `frontend/src/tauri-bridge/browser.ts` | Tauri bridge: browser domain |
| `frontend/src/tauri-bridge/conversation.ts` | Tauri bridge: conversation domain |
| `frontend/src/tauri-bridge/agent.ts` | Tauri bridge: agent + subagent domains |
| `frontend/src/tauri-bridge/ci-github.ts` | Tauri bridge: ci + github domains |
| `frontend/src/tauri-bridge/provider.ts` | Tauri bridge: provider domain |
| `frontend/src/tauri-bridge/misc.ts` | Tauri bridge: all remaining small domains |
| `frontend/src/app/features/browser/useBrowserPanelMenuItems.ts` | BrowserPanel: menu items extraction |
| `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts` | BrowserPanel: address submit logic extraction |
| `frontend/src/app/features/browser/useBrowserPanelEffects.ts` | BrowserPanel: effects extraction |
| `frontend/src/app/features/browser/useBrowserPanelCloseHandlers.ts` | BrowserPanel: close handler wrappers |
| `crates/kernel/src/permission_types.rs` | Permission types: `PermissionDecision`, `PermissionRule`, `PermissionRuleset`, `PermissionRulesetConfig` |
| `crates/kernel/src/doom_loop.rs` | Doom-loop detection + external directory check |

### Files to Modify

| File | Change |
|------|--------|
| `frontend/src/mock-bridge.ts` | Fix 9 empty catches; delegate to split domain files |
| `frontend/src/tauri-bridge.ts` | Convert to re-export from `tauri-bridge/index.ts` (or delete + update imports) |
| `frontend/src/app/features/browser/BrowserPanel.tsx` | Extract 4 hooks, reduce from 731 to ~350 lines |
| `frontend/src/app/stores/actions/*.ts` (22 files) | Migrate `captureError` → `captureTypedError` |
| `frontend/src/app/stores/cacheHelpers.ts` | Remove `// TODO` from `captureTypedError` |
| `crates/kernel/src/command_risk.rs` | Extract types + doom_loop to submodules |
| `crates/kernel/src/lib.rs` | Add `mod permission_types; mod doom_loop;` |
| `crates/outline/src/brace.rs` | Replace `OnceLock` with `LazyLock` |
| `frontend/vite.config.ts` | Add 4 entries to `manualChunks` |
| `frontend/src/app/features/provider-manager/ProviderConfig.tsx` | Add `useMemo` |
| `crates/browser/src/webview2_history.rs` | Replace `std::thread` with `tokio::spawn` |
| `crates/kernel/src/events.rs` | Replace `.expect()` with poison recovery |
| `crates/adl-logging/src/manager.rs` | Document or remove `#[allow(dead_code)]` |
| `crates/browser/src/webview2_audio.rs` | Document or remove `#[allow(dead_code)]` |
| `src-tauri/src/commands/agent_pipeline.rs` | Add characterization tests for `collect_symbol_context` |

---

## Phase 1: High-Priority Fixes

### Task 1: Fix empty catch blocks in mock-bridge.ts

**Files:**
- Modify: `frontend/src/mock-bridge.ts` (lines 69, 135, 358, 368, 381, 428, 438, 451)

**Interfaces:**
- Consumes: nothing
- Produces: all 9 catch blocks now log warnings instead of silently swallowing

- [ ] **Step 1: Read the current catch blocks**

Read `frontend/src/mock-bridge.ts` lines 66-72, 132-138, 355-383, 425-453 to confirm the 9 empty catch locations.

- [ ] **Step 2: Fix catch #1 (line 69, loadPersistedState)**

Replace:
```typescript
    } catch {
      // silently ignore failed persisted state load
    }
```
With:
```typescript
    } catch (e) {
      console.warn('[mock-bridge] Failed to load persisted state', e);
    }
```

- [ ] **Step 3: Fix catch #3 (line 135, window.setTitle)**

Replace:
```typescript
      } catch {
        // ignore
      }
```
With:
```typescript
      } catch (e) {
        console.warn('[mock-bridge] Failed to set document title', e);
      }
```

- [ ] **Step 4: Fix catches #4-#6 (lines 358, 368, 381, ci domain)**

For line 358 (`ci.setAccessToken`):
Replace:
```typescript
        } catch {
          /* ignore */
        }
```
With:
```typescript
        } catch (e) {
          console.warn('[mock-bridge] Failed to set CI access token in localStorage', e);
        }
```

For line 368 (`ci.clearAccessToken`):
Replace:
```typescript
        } catch {
          /* ignore */
        }
```
With:
```typescript
        } catch (e) {
          console.warn('[mock-bridge] Failed to remove CI access token from localStorage', e);
        }
```

For line 381 (`ci.hasAccessToken`):
Replace:
```typescript
        } catch {
          return { ok: true, data: false };
        }
```
With:
```typescript
        } catch (e) {
          console.warn('[mock-bridge] Failed to check CI access token in localStorage', e);
          return { ok: true, data: false };
        }
```

- [ ] **Step 5: Fix catches #7-#9 (lines 428, 438, 451, github domain)**

For line 428 (`github.setAccessToken`):
Replace:
```typescript
        } catch {
          /* ignore */
        }
```
With:
```typescript
        } catch (e) {
          console.warn('[mock-bridge] Failed to set GitHub access token in localStorage', e);
        }
```

For line 438 (`github.clearAccessToken`):
Replace:
```typescript
        } catch {
          /* ignore */
        }
```
With:
```typescript
        } catch (e) {
          console.warn('[mock-bridge] Failed to remove GitHub access token from localStorage', e);
        }
```

For line 451 (`github.hasAccessToken`):
Replace:
```typescript
        } catch {
          return { ok: true, data: false };
        }
```
With:
```typescript
        } catch (e) {
          console.warn('[mock-bridge] Failed to check GitHub access token in localStorage', e);
          return { ok: true, data: false };
        }
```

- [ ] **Step 6: Verify no empty catches remain**

Run: `pnpm --dir frontend exec eslint src/mock-bridge.ts --rule '{"no-empty": ["error", {"allowEmptyCatch": false}]}'`
Expected: 0 errors

Also verify with Grep — search for `catch {` and `catch {}` in `mock-bridge.ts`:
Run: `pnpm --dir frontend exec grep -n "catch {" src/mock-bridge.ts || echo "No empty catches found"`
Expected: "No empty catches found"

- [ ] **Step 7: Run existing tests to verify no regression**

Run: `pnpm --dir frontend run test -- --reporter=verbose 2>&1 | Select-String "mock-bridge|FAIL|passed|failed"`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/mock-bridge.ts
git commit -m "fix(frontend): replace empty catch blocks with console.warn in mock-bridge

Resolves error-handling.md rule violation: '禁止 try { ... } catch {} 空 catch 块'
9 locations fixed across loadPersistedState, window.setTitle, ci.*, github.*"
```

---

### Task 2: Add characterization tests for collect_symbol_context

> **Correction note:** The insight report stated `collect_symbol_context` spans 320 lines. Actual measurement: **42 lines** (155-196). The function is not a complexity emergency. However, it has **zero test coverage**, so we add characterization tests before any future refactoring. The longer functions in the file are `call_model` (~166 lines) and `generate_patches` (~108 lines) — neither exceeds the 200-line threshold.

**Files:**
- Modify: `src-tauri/src/commands/agent_pipeline.rs` (test module at line 549+)

**Interfaces:**
- Consumes: `collect_symbol_context` (private fn, line 155), `AuditBatchEntry` (from `super::audit`), `StartRunInput` (from `crate::commands::agent`)
- Produces: 4 new test functions covering all branches of `collect_symbol_context`

- [ ] **Step 1: Set up Rust environment**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

- [ ] **Step 2: Read the function to understand test inputs**

Read `src-tauri/src/commands/agent_pipeline.rs` lines 155-196. The function signature:
```rust
fn collect_symbol_context<F: Fn(serde_json::Value)>(
    workspace: &adl_kernel::WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: &F,
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Vec<adl_kernel::ContextEntry>
```

Branches to cover:
1. Prompt has no `@symbol` → returns empty Vec
2. Prompt has `@symbol` but `workspace.root_path` is empty → returns 1 context entry (symbol only)
3. Prompt has `@symbol`, workspace has root_path, `search_text` succeeds → returns 1 + up to 6 entries
4. Prompt has `@symbol`, workspace has root_path, `search_text` fails → returns 1 entry (symbol only)

- [ ] **Step 3: Write the failing tests**

Add these tests inside the existing `#[cfg(test)] mod tests` block (after line 745, before the closing `}` of the tests module at line 764):

```rust
    // ========== collect_symbol_context characterization tests ==========

    #[test]
    fn test_collect_symbol_context_no_symbol_in_prompt() {
        let workspace = adl_kernel::WorkspaceMeta {
            root_path: String::new(),
            ..Default::default()
        };
        let input = StartRunInput {
            prompt: "Just a regular prompt without symbols".into(),
            ..Default::default()
        };
        let detail = AgentRunDetail::default();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace, &input, &detail, "scope-1", "session-1", &emit, &mut audit_batch,
        );

        assert!(result.is_empty(), "No symbol in prompt should yield no context");
        assert!(audit_batch.is_empty(), "No audit entries without symbol");
        assert!(activities.lock().unwrap().is_empty(), "No activity events without symbol");
    }

    #[test]
    fn test_collect_symbol_context_symbol_but_empty_root_path() {
        let workspace = adl_kernel::WorkspaceMeta {
            root_path: String::new(),
            ..Default::default()
        };
        let input = StartRunInput {
            prompt: "Fix the bug in @MyClass".into(),
            ..Default::default()
        };
        let detail = AgentRunDetail::default();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace, &input, &detail, "scope-1", "session-1", &emit, &mut audit_batch,
        );

        assert_eq!(result.len(), 1, "Symbol context entry should be added");
        assert!(audit_batch.is_empty(), "No audit entries without search");
        let acts = activities.lock().unwrap();
        assert_eq!(acts.len(), 1, "One context-added activity event");
        assert_eq!(acts[0]["contextType"], "symbol");
    }

    #[test]
    fn test_collect_symbol_context_symbol_with_search_success() {
        // Create a temp directory with a file containing the symbol
        let temp_dir = std::env::temp_dir().join("adl_test_symbol_search");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let test_file = temp_dir.join("test.rs");
        std::fs::write(&test_file, "struct MyClass { }").unwrap();

        let workspace = adl_kernel::WorkspaceMeta {
            root_path: temp_dir.to_string_lossy().to_string(),
            ..Default::default()
        };
        let input = StartRunInput {
            prompt: "Fix the bug in @MyClass".into(),
            ..Default::default()
        };
        let detail = AgentRunDetail::default();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace, &input, &detail, "scope-1", "session-1", &emit, &mut audit_batch,
        );

        // 1 symbol context + up to 6 search hit contexts
        assert!(result.len() >= 1, "At least symbol context should be present");
        assert_eq!(audit_batch.len(), 1, "One audit entry for search");
        assert_eq!(audit_batch[0].operation_type, "search");
        let acts = activities.lock().unwrap();
        assert!(acts.len() >= 1, "At least context-added event");

        // Cleanup
        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_collect_symbol_context_symbol_with_search_failure() {
        // Use a non-existent path to trigger search_text failure
        let workspace = adl_kernel::WorkspaceMeta {
            root_path: "/nonexistent/path/that/does/not/exist".into(),
            ..Default::default()
        };
        let input = StartRunInput {
            prompt: "Fix the bug in @MyClass".into(),
            ..Default::default()
        };
        let detail = AgentRunDetail::default();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace, &input, &detail, "scope-1", "session-1", &emit, &mut audit_batch,
        );

        // Symbol context added, but search fails silently → only 1 entry
        assert_eq!(result.len(), 1, "Only symbol context, search failed");
        assert!(audit_batch.is_empty(), "No audit entries on search failure");
    }
```

- [ ] **Step 4: Run tests to verify they compile and pass**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl-src-tauri --lib commands::agent_pipeline::tests::test_collect_symbol_context -- --nocapture
```
Expected: 4 tests pass (some may need adjustment if `StartRunInput` or `AgentRunDetail` don't implement `Default` — check and adjust).

If `Default` is not implemented, read the struct definitions and construct them manually with required fields.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/agent_pipeline.rs
git commit -m "test(rust): add characterization tests for collect_symbol_context

Covers 4 branches: no symbol, symbol + empty root_path,
symbol + search success, symbol + search failure.
Function had zero direct test coverage previously."
```

---

### Task 3: Split mock-bridge.ts into per-domain files

**Files:**
- Create: `frontend/src/mock/mock-window.ts`
- Create: `frontend/src/mock/mock-app.ts`
- Create: `frontend/src/mock/mock-agent.ts`
- Create: `frontend/src/mock/mock-browser.ts`
- Create: `frontend/src/mock/mock-ci.ts`
- Create: `frontend/src/mock/mock-provider.ts`
- Create: `frontend/src/mock/mock-mcp.ts`
- Create: `frontend/src/mock/mock-snapshot.ts`
- Create: `frontend/src/mock/mock-misc.ts`
- Modify: `frontend/src/mock-bridge.ts`

**Interfaces:**
- Consumes: `DigitalLifeBridge` interface from `shared/ipc`, existing `mock/shared.ts` exports
- Produces: `mock-bridge.ts` reduced from 759 to ~150 lines (assembler only)

- [ ] **Step 1: Read current mock-bridge.ts to understand inline domain implementations**

Read `frontend/src/mock-bridge.ts` fully. Note the 23 inline domains and their line ranges (from the analysis):
- window: 127-143
- app: 145-214
- agent: 222-251
- subagent: 253-267
- command: 271-293
- runActivity: 299-301
- browser: 303-323
- ci: 325-393
- github: 395-463
- mcp: 465-473
- provider: 475-511
- snapshot: 513-556
- webTools: 558-592
- commandsConfig: 594-609
- permission: 611-629
- compaction: 631-641
- sessionFork: 643-657
- lsp: 659-665
- plugin: 667-685
- reference: 687-712
- durable: 714-719
- reserved: 721-743
- customAgent: 745-752

- [ ] **Step 2: Create mock-window.ts**

Create `frontend/src/mock/mock-window.ts`:
```typescript
import type { WindowBridge } from '../shared/ipc';

export const mockWindow: WindowBridge = {
  minimize: () => {
    /* no-op in mock */
  },
  maximize: () => {
    /* no-op in mock */
  },
  close: () => {
    /* no-op in mock */
  },
  isMaximized: async () => ({ ok: true, data: false }),
  setTitle: (title: string) => {
    try {
      document.title = title;
    } catch (e) {
      console.warn('[mock-bridge] Failed to set document title', e);
    }
  },
  onResized: () => () => {
    /* no-op in mock */
  },
};
```

- [ ] **Step 3: Create mock-app.ts**

Read lines 145-214 of `mock-bridge.ts` for the app domain implementation. Create `frontend/src/mock/mock-app.ts` with the extracted code, importing shared state from `./shared`.

- [ ] **Step 4: Create mock-agent.ts**

Read lines 222-267. Create `frontend/src/mock/mock-agent.ts` containing both `agent` and `subagent` domains.

- [ ] **Step 5: Create mock-browser.ts**

Read lines 303-323. Create `frontend/src/mock/mock-browser.ts` with the browser domain.

- [ ] **Step 6: Create mock-ci.ts (shared ci + github)**

Read lines 325-463. The `ci` and `github` domains are near-identical. Create `frontend/src/mock/mock-ci.ts` with a shared token-management helper and both domain exports:
```typescript
import type { CiBridge, GithubBridge } from '../shared/ipc';

function createTokenBridge(storageKey: string, label: string): { setAccessToken: ...; clearAccessToken: ...; hasAccessToken: ... } {
  // shared implementation
}

export const mockCi: CiBridge = { ...createTokenBridge('adl-ui:ci-access-token', 'CI'), getStatus: ..., ... };
export const mockGithub: GithubBridge = { ...createTokenBridge('adl-ui:ci-access-token', 'GitHub'), getStatus: ..., ... };
```

- [ ] **Step 7: Create mock-provider.ts**

Read lines 475-511. Create `frontend/src/mock/mock-provider.ts`.

- [ ] **Step 8: Create mock-mcp.ts**

Read lines 465-473. Create `frontend/src/mock/mock-mcp.ts`.

- [ ] **Step 9: Create mock-snapshot.ts**

Read lines 513-556. Create `frontend/src/mock/mock-snapshot.ts`.

- [ ] **Step 10: Create mock-misc.ts**

Read lines 271-293 (command), 299-301 (runActivity), 558-592 (webTools), 594-609 (commandsConfig), 611-629 (permission), 631-641 (compaction), 643-657 (sessionFork), 659-665 (lsp), 667-685 (plugin), 687-712 (reference), 714-719 (durable), 721-743 (reserved), 745-752 (customAgent). Create `frontend/src/mock/mock-misc.ts` with all these domains.

- [ ] **Step 11: Rewrite mock-bridge.ts as assembler**

Replace the inline domain implementations with imports. The new `mock-bridge.ts` should be ~150 lines:
```typescript
import type { DigitalLifeBridge } from './shared/ipc';
import { mockWorkspace, setMockActiveWorkspace } from './mock/mock-workspace';
import { mockRetrieval } from './mock/mock-retrieval';
import { mockConversation } from './mock/mock-conversation';
import { mockPatch } from './mock/mock-patch';
import { mockPty } from './mock/mock-terminal';
import { mockTask } from './mock/mock-task';
import { mockWindow } from './mock/mock-window';
import { mockApp } from './mock/mock-app';
import { mockAgent, mockSubagent } from './mock/mock-agent';
import { mockBrowser } from './mock/mock-browser';
import { mockCi, mockGithub } from './mock/mock-ci';
import { mockProvider } from './mock/mock-provider';
import { mockMcp } from './mock/mock-mcp';
import { mockSnapshot } from './mock/mock-snapshot';
import {
  mockCommand, mockRunActivity, mockWebTools, mockCommandsConfig,
  mockPermission, mockCompaction, mockSessionFork, mockLsp,
  mockPlugin, mockReference, mockDurable, mockReserved, mockCustomAgent,
} from './mock/mock-misc';
// ... rest: persistence, subscribers, assembly
```

Keep in `mock-bridge.ts`: persistence helpers (`loadPersistedState`, `savePersistedState`), subscriber helpers (`subscribePtyOutput`), `enableMockBridgePersistence`, `disableMockBridgePersistence`, `setMockActiveWorkspace` (re-export), `mockDigitalLifeBridge` (assembled const), `setupMockBridge`.

- [ ] **Step 12: Run typecheck**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run typecheck
```
Expected: 0 errors

- [ ] **Step 13: Run tests**

```powershell
pnpm --dir frontend run test
```
Expected: All tests pass

- [ ] **Step 14: Verify line count reduction**

```powershell
pnpm --dir frontend exec wc -l src/mock-bridge.ts
```
Expected: ~150 lines (down from 759)

- [ ] **Step 15: Commit**

```bash
git add frontend/src/mock/
git add frontend/src/mock-bridge.ts
git commit -m "refactor(frontend): split mock-bridge.ts into per-domain files

Extracts 23 inline domains into mock/mock-{window,app,agent,browser,ci,
provider,mcp,snapshot,misc}.ts following the existing mock/ split pattern.
mock-bridge.ts reduced from 759 to ~150 lines (assembler only).
Consolidates ci/github duplicate token logic into shared helper."
```

---

### Task 4: Split tauri-bridge.ts into per-domain files

**Files:**
- Create: `frontend/src/tauri-bridge/shared.ts`
- Create: `frontend/src/tauri-bridge/index.ts`
- Create: `frontend/src/tauri-bridge/workspace.ts`
- Create: `frontend/src/tauri-bridge/browser.ts`
- Create: `frontend/src/tauri-bridge/conversation.ts`
- Create: `frontend/src/tauri-bridge/agent.ts`
- Create: `frontend/src/tauri-bridge/ci-github.ts`
- Create: `frontend/src/tauri-bridge/provider.ts`
- Create: `frontend/src/tauri-bridge/misc.ts`
- Modify: `frontend/src/tauri-bridge.ts` (convert to re-export or delete + update imports)

**Interfaces:**
- Consumes: `DigitalLifeBridge` interface, `IpcResult`, `IpcErrorCode` from `shared/ipc`, `invoke` from `@tauri-apps/api`
- Produces: `createTauriBridge()` from `tauri-bridge/index.ts`, `isTauriShell` from `tauri-bridge/shared.ts`

- [ ] **Step 1: Create tauri-bridge/shared.ts**

Extract `invokeIpc`, `subscribeChannel`, `isTauriShell` from `tauri-bridge.ts` lines 92-145 into `frontend/src/tauri-bridge/shared.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { IpcResult } from '../shared/ipc';
import { IpcErrorCode } from '../shared/ipc';

export async function invokeIpc<T>(cmd: string, args?: Record<string, unknown>): Promise<IpcResult<T>> {
  // ... existing implementation from lines 92-109
}

export function subscribeChannel<T>(channel: string, cb: (data: T) => void): () => void {
  // ... existing implementation from lines 111-130
}

export function isTauriShell(): boolean {
  // ... existing implementation from lines 132-145
}
```

- [ ] **Step 2: Create domain files**

For each domain file, export a factory function following the `preview-bridge/` pattern. Read the corresponding lines from `tauri-bridge.ts` and extract.

Create `frontend/src/tauri-bridge/workspace.ts` (lines 222-304):
```typescript
import type { WorkspaceBridge } from '../../shared/ipc';
import { invokeIpc } from './shared';

export function createTauriWorkspaceBridge(): WorkspaceBridge {
  return {
    list: () => invokeIpc('list_workspaces'),
    // ... all workspace methods from lines 222-304
  };
}
```

Create `frontend/src/tauri-bridge/browser.ts` (lines 438-541) — largest domain.
Create `frontend/src/tauri-bridge/conversation.ts` (lines 318-351).
Create `frontend/src/tauri-bridge/agent.ts` (lines 353-383) — agent + subagent.
Create `frontend/src/tauri-bridge/ci-github.ts` (lines 542-569).
Create `frontend/src/tauri-bridge/provider.ts` (lines 581-600).
Create `frontend/src/tauri-bridge/misc.ts` — all remaining small domains (window, app, retrieval, patch, command, pty, task, runActivity, mcp, snapshot, webTools, commandsConfig, permission, compaction, sessionFork, lsp, plugin, reference, durable, reserved, customAgent).

- [ ] **Step 3: Create tauri-bridge/index.ts assembler**

```typescript
import type { DigitalLifeBridge } from '../../shared/ipc';
import { isTauriShell, subscribeChannel } from './shared';
import { createTauriWorkspaceBridge } from './workspace';
import { createTauriBrowserBridge } from './browser';
// ... all other domain imports

export function createTauriBridge(): DigitalLifeBridge {
  return {
    workspace: createTauriWorkspaceBridge(),
    browser: createTauriBrowserBridge(),
    // ... all other domains
    // subscribers stay inline (they use subscribeChannel)
    subscribeModelStream: (cb) => subscribeChannel('model-stream', cb),
    // ...
  };
}

export { isTauriShell } from './shared';
```

- [ ] **Step 4: Convert tauri-bridge.ts to re-export**

Replace the contents of `frontend/src/tauri-bridge.ts` with:
```typescript
export { createTauriBridge, isTauriShell } from './tauri-bridge/index';
```

This preserves backward compatibility for all existing imports like `import { isTauriShell } from '@tauri-bridge'`.

- [ ] **Step 5: Run typecheck**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```
Expected: 0 errors

- [ ] **Step 6: Run tests**

```powershell
pnpm --dir frontend run test
```
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/tauri-bridge/
git add frontend/src/tauri-bridge.ts
git commit -m "refactor(frontend): split tauri-bridge.ts into per-domain files

Extracts 30 inline domains into tauri-bridge/{shared,workspace,browser,
conversation,agent,ci-github,provider,misc,index}.ts following the
preview-bridge/ factory pattern. tauri-bridge.ts reduced to re-export.
Complies with tauri-shell.md 600-line bridge split threshold."
```

---

### Task 5: Decompose BrowserPanel.tsx — extract menu items hook

**Files:**
- Create: `frontend/src/app/features/browser/useBrowserPanelMenuItems.ts`
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` (lines 288, 290-412)

**Interfaces:**
- Consumes: `activeTab`, `browserNavigateActiveTab`, `t` (from `useTCopy`), `zoomLevel`, `setZoomLevel`, `isTauriShell`
- Produces: `useBrowserPanelMenuItems()` returning `{ browserMenuItems: BrowserMenuItem[] }`

- [ ] **Step 1: Read the menu items useMemo block**

Read `frontend/src/app/features/browser/BrowserPanel.tsx` lines 288-412. This is the `browserMenuItems` useMemo with 12 menu items.

- [ ] **Step 2: Create the hook file**

Create `frontend/src/app/features/browser/useBrowserPanelMenuItems.ts`:
```typescript
import { useMemo } from 'react';
import { isTauriShell } from '@tauri-bridge';
import type { useTCopy } from '../i18n/useTCopy';

interface UseBrowserPanelMenuItemsParams {
  activeTab: { url: string } | null;
  browserNavigateActiveTab: (url: string) => void;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
  t: ReturnType<typeof useTCopy>['t'];
}

export function useBrowserPanelMenuItems({
  activeTab,
  browserNavigateActiveTab,
  zoomLevel,
  setZoomLevel,
  t,
}: UseBrowserPanelMenuItemsParams) {
  const isTauri = isTauriShell();

  const browserMenuItems = useMemo(() => {
    // ... copy the entire useMemo body from lines 290-412
  }, [activeTab, browserNavigateActiveTab, t, isTauri, zoomLevel, setZoomLevel]);

  return { browserMenuItems };
}
```

- [ ] **Step 3: Update BrowserPanel.tsx to use the hook**

In `BrowserPanel.tsx`:
1. Add import: `import { useBrowserPanelMenuItems } from './useBrowserPanelMenuItems';`
2. Remove line 288 (`const isTauri = isTauriShell();`) and lines 290-412 (the useMemo block)
3. Replace with:
```typescript
const { browserMenuItems } = useBrowserPanelMenuItems({
  activeTab,
  browserNavigateActiveTab,
  zoomLevel,
  setZoomLevel,
  t,
});
```
4. Remove the `isTauriShell` import if no longer used elsewhere in the file (check with Grep first).

- [ ] **Step 4: Run typecheck**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```
Expected: 0 errors

- [ ] **Step 5: Run tests**

```powershell
pnpm --dir frontend run test
```
Expected: All tests pass

- [ ] **Step 6: Verify line count reduction**

Check BrowserPanel.tsx is now ~610 lines (down from 731, removed ~121 lines).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserPanelMenuItems.ts
git add frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "refactor(frontend): extract useBrowserPanelMenuItems from BrowserPanel

Moves the 123-line browserMenuItems useMemo into a dedicated hook.
BrowserPanel.tsx reduced from 731 to ~610 lines."
```

---

### Task 6: Decompose BrowserPanel.tsx — extract address submit hook

**Files:**
- Create: `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts`
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` (lines 414-506)

**Interfaces:**
- Consumes: `address`, `browserLookupIndex`, `handleNavigationStart`, `navigateBrowser`, `browserNavigateActiveTab`, `setIframeLoadError`, `setIframeBlockedDetected`, `_handlePageMeta`, `setAddress`, `addressSubmittedForTabRef`, `submitVersionRef`, `validatedUrlsRef`
- Produces: `useBrowserPanelAddressSubmit()` returning `{ submitAddress: (e: React.FormEvent) => Promise<void> }`

- [ ] **Step 1: Read the submitAddress callback**

Read `frontend/src/app/features/browser/BrowserPanel.tsx` lines 414-506.

- [ ] **Step 2: Create the hook file**

Create `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts`:
```typescript
import { useCallback } from 'react';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import { setCachedFavicon } from '@utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '@utils/favicon';

interface UseBrowserPanelAddressSubmitParams {
  address: string;
  setAddress: (addr: string) => void;
  browserLookupIndex: Map<string, unknown> | null;
  handleNavigationStart: (url: string) => void;
  navigateBrowser: (url: string) => void;
  browserNavigateActiveTab: (url: string) => void;
  setIframeLoadError: (err: string | null) => void;
  setIframeBlockedDetected: (blocked: boolean) => void;
  handlePageMeta: (meta: unknown) => void;
  addressSubmittedForTabRef: React.MutableRefObject<string | null>;
  submitVersionRef: React.MutableRefObject<number>;
  validatedUrlsRef: React.MutableRefObject<Set<string>>;
}

export function useBrowserPanelAddressSubmit(params: UseBrowserPanelAddressSubmitParams) {
  const submitAddress = useCallback(async (e: React.FormEvent) => {
    // ... copy the entire body from lines 415-505
  }, [/* copy deps from lines 493-506 */]);

  return { submitAddress };
}
```

- [ ] **Step 3: Update BrowserPanel.tsx**

Replace lines 414-506 with:
```typescript
const { submitAddress } = useBrowserPanelAddressSubmit({
  address,
  setAddress,
  browserLookupIndex,
  handleNavigationStart,
  navigateBrowser,
  browserNavigateActiveTab,
  setIframeLoadError,
  setIframeBlockedDetected,
  handlePageMeta: _handlePageMeta,
  addressSubmittedForTabRef,
  submitVersionRef,
  validatedUrlsRef,
});
```

- [ ] **Step 4: Run typecheck and tests**

```powershell
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```
Expected: 0 errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts
git add frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "refactor(frontend): extract useBrowserPanelAddressSubmit from BrowserPanel

Moves the 93-line submitAddress callback into a dedicated hook.
BrowserPanel.tsx reduced to ~520 lines."
```

---

### Task 7: Decompose BrowserPanel.tsx — extract effects and close handlers

**Files:**
- Create: `frontend/src/app/features/browser/useBrowserPanelEffects.ts`
- Create: `frontend/src/app/features/browser/useBrowserPanelCloseHandlers.ts`
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` (lines 221-261, 546-605)

- [ ] **Step 1: Create useBrowserPanelCloseHandlers.ts**

Extract lines 221-261 (`wrappedHandleCloseTab`, `handleCloseAllTabs`, `handleClearTabDirectories`).

- [ ] **Step 2: Create useBrowserPanelEffects.ts**

Extract lines 546-605 (two useEffect blocks: address sync + outside-click handler).

- [ ] **Step 3: Update BrowserPanel.tsx**

Replace the extracted sections with hook calls. Target: ~350 lines remaining.

- [ ] **Step 4: Run typecheck and tests**

- [ ] **Step 5: Verify final line count**

```powershell
pnpm --dir frontend exec wc -l src/app/features/browser/BrowserPanel.tsx
```
Expected: ~350 lines (down from 731, under the 400-line threshold)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserPanelEffects.ts
git add frontend/src/app/features/browser/useBrowserPanelCloseHandlers.ts
git add frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "refactor(frontend): extract effects and close handlers from BrowserPanel

BrowserPanel.tsx reduced from ~520 to ~350 lines, now under the
400-line component threshold. All 4 hooks extracted: menu items,
address submit, effects, close handlers."
```

---

## Phase 2: Medium-Priority Structural Improvements

### Task 8: Split command_risk.rs into submodules

**Files:**
- Create: `crates/kernel/src/permission_types.rs` (types: lines 39-186)
- Create: `crates/kernel/src/doom_loop.rs` (lines 311-334)
- Modify: `crates/kernel/src/command_risk.rs` (keep: risk assessment, pattern matching, evaluation)
- Modify: `crates/kernel/src/lib.rs` (add module declarations)

- [ ] **Step 1: Read command_risk.rs fully and plan the split**

Read `crates/kernel/src/command_risk.rs`. The split boundaries:
- `permission_types.rs`: `PermissionDecision` (39-46), `PermissionRule` (73-98), `PermissionRuleset` (100-167), `PermissionRulesetConfig` (171-186), `default_true` (188-190)
- `doom_loop.rs`: `doom_loop_check` (313-322), `is_external_directory` (325-334)
- `command_risk.rs` (remaining): `assess_command_risk` (6-33), `requires_approval` (35-37), `rule_matches` (193-209), `pattern_matches` (214-220), `build_glob_regex` (226-274), `default_decision` (276-282), `risk_to_decision` (285-291), `evaluate_permission` (295-309), `build_ruleset` (337-349)

- [ ] **Step 2: Create permission_types.rs**

Move types to `crates/kernel/src/permission_types.rs`. Make types `pub` and add `pub use` re-exports. Move corresponding tests (lines 415-572 for PermissionDecision + Ruleset tests).

- [ ] **Step 3: Create doom_loop.rs**

Move `doom_loop_check` and `is_external_directory` to `crates/kernel/src/doom_loop.rs`. Move corresponding tests.

- [ ] **Step 4: Update command_risk.rs**

Add imports: `use crate::permission_types::{PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig};` and `use crate::doom_loop::{doom_loop_check, is_external_directory};`. Keep `pub use` re-exports for backward compatibility.

- [ ] **Step 5: Update lib.rs**

Add to `crates/kernel/src/lib.rs`:
```rust
pub mod permission_types;
pub mod doom_loop;

// Re-export for backward compatibility
pub use permission_types::{
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
};
pub use doom_loop::{doom_loop_check, is_external_directory};
```

- [ ] **Step 6: Run Rust checks**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo test -p adl-kernel
```
Expected: 0 errors, all tests pass

- [ ] **Step 7: Commit**

```bash
git add crates/kernel/src/permission_types.rs
git add crates/kernel/src/doom_loop.rs
git add crates/kernel/src/command_risk.rs
git add crates/kernel/src/lib.rs
git commit -m "refactor(rust): split command_risk.rs into permission_types and doom_loop modules

command_risk.rs reduced from 649 to ~350 lines. Types and doom-loop
detection extracted into focused modules with co-located tests."
```

---

### Task 9: Migrate captureError to captureTypedError (batch 1: high-traffic actions)

**Files:**
- Modify: `frontend/src/app/stores/actions/workspaceActions.ts` (10 calls)
- Modify: `frontend/src/app/stores/actions/streamActions.ts` (7 calls)
- Modify: `frontend/src/app/stores/actions/providerActions.ts` (7 calls)
- Modify: `frontend/src/app/stores/actions/fetchActions.ts` (7 calls)
- Modify: `frontend/src/app/stores/actions/mcpActions.ts` (6 calls)
- Modify: `frontend/src/app/stores/actions/gitActions.ts` (5 calls)
- Modify: `frontend/src/app/stores/cacheHelpers.ts` (remove TODO comment)

> This is a mechanical migration. For each file: replace `captureError(get` with `captureTypedError(get`, ensure `captureTypedError` is imported (replace `captureError` in the import).

- [ ] **Step 1: Migrate workspaceActions.ts**

Read the file. Replace all `captureError(get` → `captureTypedError(get`. Update the import line from `captureError` to `captureTypedError`.

- [ ] **Step 2: Migrate streamActions.ts, providerActions.ts, fetchActions.ts, mcpActions.ts, gitActions.ts**

Same mechanical replacement for each file.

- [ ] **Step 3: Remove TODO from cacheHelpers.ts**

In `frontend/src/app/stores/cacheHelpers.ts` line 176, remove:
```typescript
// TODO: 集成到现有 captureError 或逐步替换 Action 中旧的 captureError 调用
```

- [ ] **Step 4: Run typecheck and tests**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stores/actions/
git add frontend/src/app/stores/cacheHelpers.ts
git commit -m "refactor(frontend): migrate captureError to captureTypedError in high-traffic actions

Migrates 42 call sites across 6 action files: workspaceActions (10),
streamActions (7), providerActions (7), fetchActions (7), mcpActions (6),
gitActions (5). Enables typed error classification for UI differentiation."
```

---

### Task 10: Migrate captureError to captureTypedError (batch 2: remaining actions)

**Files:**
- Modify: 16 remaining action files (permissionActions, lspActions, customCommandActions, agentActions, workspaceLifecycleActions, snapshotActions, referenceActions, patchActions, customAgentActions, webToolsActions, taskActions, sessionForkActions, pluginActions, browserCleanupActions, compactionActions, commandActions)

- [ ] **Step 1: Migrate all 16 remaining files**

For each file: replace `captureError(get` → `captureTypedError(get`, update import.

- [ ] **Step 2: Verify no captureError calls remain in actions/**

```powershell
pnpm --dir frontend exec grep -rn "captureError(" src/app/stores/actions/ || echo "All migrated"
```
Expected: "All migrated"

- [ ] **Step 3: Run typecheck and tests**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/stores/actions/
git commit -m "refactor(frontend): complete captureError to captureTypedError migration

Migrates remaining 43 call sites across 16 action files. All 85 call
sites now use typed error capture. captureError helper retained for
backward compatibility but no longer used in actions."
```

---

### Task 11: Add heavy libraries to vite manualChunks

**Files:**
- Modify: `frontend/vite.config.ts` (lines 222-234)

- [ ] **Step 1: Read current manualChunks**

Read `frontend/vite.config.ts` lines 222-234.

- [ ] **Step 2: Add 4 new chunk rules**

Replace the `manualChunks` function with:
```typescript
        manualChunks(id: string) {
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
          if (id.includes('@codemirror')) return 'vendor-codemirror';
          if (id.includes('@xterm')) return 'vendor-xterm';
          if (id.includes('zustand')) return 'vendor-zustand';
          if (id.includes('markdown-it') || id.includes('react-markdown') || id.includes('remark-gfm')) return 'vendor-markdown';
          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('echarts')) return 'vendor-echarts';
          if (id.includes('highlight.js') || id.includes('highlight.js/')) return 'vendor-highlight';
          if (id.includes('mammoth')) return 'vendor-mammoth';
          if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';
          return undefined;
        },
```

- [ ] **Step 3: Verify build succeeds**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run build
```
Expected: Build succeeds, check that `vendor-echarts`, `vendor-highlight`, `vendor-mammoth`, `vendor-motion` chunks appear in output.

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "perf(frontend): add echarts/highlight.js/mammoth/motion to manualChunks

Prevents these heavy libraries from bundling into the main chunk.
Reduces initial bundle size for users who don't open Git Visualization
or DOCX preview."
```

---

### Task 12: Migrate brace.rs from OnceLock to LazyLock

**Files:**
- Modify: `crates/outline/src/brace.rs` (lines 1-97)

- [ ] **Step 1: Read brace.rs fully**

Read `crates/outline/src/brace.rs`. Note the 2 `OnceLock` patterns: `brace_matchers()` (27 regexes) and `sanitize_brace_line()` (2 regexes).

- [ ] **Step 2: Replace OnceLock with LazyLock for brace_matchers**

Replace the `brace_matchers` function (lines 10-43) with:
```rust
use std::sync::LazyLock;

static BRACE_MATCHERS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| vec![
    (Regex::new(r"^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)").unwrap(), "class"),
    // ... all 27 entries, same content
]);

fn brace_matchers() -> &'static [(Regex, &'static str)] {
    &BRACE_MATCHERS
}
```

- [ ] **Step 3: Replace OnceLock with LazyLock for sanitize_brace_line**

Replace lines 45-54 with:
```rust
static STRING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`"#).unwrap()
});

static COMMENT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"//.*$|/\*.*?\*/").unwrap()
});

fn sanitize_brace_line(line: &str) -> String {
    let without_strings = STRING_REGEX.replace_all(line, "");
    COMMENT_REGEX.replace_all(&without_strings, "").to_string()
}
```

- [ ] **Step 4: Run Rust checks**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check -p adl-outline
cargo clippy -p adl-outline -- -D warnings
cargo test -p adl-outline
```

- [ ] **Step 5: Commit**

```bash
git add crates/outline/src/brace.rs
git commit -m "refactor(rust): migrate brace.rs from OnceLock to LazyLock

Replaces 29 Regex::new().unwrap() calls in OnceLock::get_or_init pattern
with LazyLock::new for clearer initialization and better panic messages."
```

---

### Task 13: Split useChangesPanelState.tsx

**Files:**
- Create: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesFilters.ts`
- Create: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesActions.ts`
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx` (521 lines)

- [ ] **Step 1: Read useChangesPanelState.tsx and identify split boundaries**

Read the file. Identify filter logic, action dispatching, and selection state sections.

- [ ] **Step 2: Create useChangesFilters.ts**

Extract filter-related state and logic.

- [ ] **Step 3: Create useChangesActions.ts**

Extract action dispatching logic.

- [ ] **Step 4: Update useChangesPanelState.tsx to compose the sub-hooks**

- [ ] **Step 5: Run typecheck and tests**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/regions/right-panel/panels/ChangesPanel/
git commit -m "refactor(frontend): split useChangesPanelState into filters and actions hooks"
```

---

### Task 14: Split TitleBar.tsx

**Files:**
- Modify: `frontend/src/app/regions/TitleBar.tsx` (555 lines)
- Create: `frontend/src/app/regions/TitleBarMenus.tsx` (extract menu logic)
- Create: `frontend/src/app/regions/WindowControls.tsx` (extract window controls)

- [ ] **Step 1: Read TitleBar.tsx and identify extraction boundaries**

- [ ] **Step 2: Create WindowControls.tsx**

- [ ] **Step 3: Create TitleBarMenus.tsx** (if not already adequately extracted in `titleBarMenus.ts`)

- [ ] **Step 4: Update TitleBar.tsx**

- [ ] **Step 5: Run typecheck and tests**

- [ ] **Step 6: Commit**

---

## Phase 3: Low-Priority Quick Wins

### Task 15: Add useMemo to ProviderConfig.tsx

**Files:**
- Modify: `frontend/src/app/features/provider-manager/ProviderConfig.tsx` (line 14)

- [ ] **Step 1: Read the file**

Read `frontend/src/app/features/provider-manager/ProviderConfig.tsx` lines 1-30.

- [ ] **Step 2: Add useMemo import and wrap configuredProviders**

Change line 1:
```typescript
import { useState, useMemo } from 'react';
```

Change line 14:
```typescript
const configuredProviders = useMemo(
  () => providers.filter((p) => p.configured || p.hasKey).map((p) => p.id),
  [providers]
);
```

- [ ] **Step 3: Run typecheck and tests**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/provider-manager/ProviderConfig.tsx
git commit -m "perf(frontend): memoize configuredProviders in ProviderConfig"
```

---

### Task 16: Replace std::thread::sleep with tokio::time::sleep in webview2_history.rs

**Files:**
- Modify: `crates/browser/src/webview2_history.rs` (lines 51-80)

- [ ] **Step 1: Read the spawn_spa_fallback function**

Read `crates/browser/src/webview2_history.rs` lines 45-85.

- [ ] **Step 2: Replace with tokio::spawn**

```rust
fn spawn_spa_fallback(app: AppHandle, label: String, url: String) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
        // ... rest of the logic unchanged
    });
}
```

Check if the function is called from an async context or sync context. If sync, use `tauri::async_runtime::spawn` which works from sync code.

- [ ] **Step 3: Run Rust checks**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check -p adl-browser
cargo clippy -p adl-browser -- -D warnings
cargo test -p adl-browser
```

- [ ] **Step 4: Commit**

```bash
git add crates/browser/src/webview2_history.rs
git commit -m "perf(rust): replace std::thread with tokio::spawn in webview2_history

Uses async task instead of OS thread for the 2s SPA fallback timer."
```

---

### Task 17: Replace mutex .expect() with poison recovery in events.rs

**Files:**
- Modify: `crates/kernel/src/events.rs` (lines 68, 80)

- [ ] **Step 1: Read the file**

Read `crates/kernel/src/events.rs` lines 60-85.

- [ ] **Step 2: Replace .expect() with unwrap_or_else recovery**

For line 68 in `emit()`:
```rust
let mut by_type = self.by_type.lock().unwrap_or_else(|e| e.into_inner());
```

For line 80 in `diagnostics()`:
```rust
let by_type = self.by_type.lock().unwrap_or_else(|e| e.into_inner());
```

- [ ] **Step 3: Run Rust checks**

```powershell
cargo check -p adl-kernel
cargo clippy -p adl-kernel -- -D warnings
cargo test -p adl-kernel
```

- [ ] **Step 4: Commit**

```bash
git add crates/kernel/src/events.rs
git commit -m "fix(rust): recover from mutex poisoning in event diagnostics

Replaces .expect() with .unwrap_or_else(into_inner) for the
diagnostics-only by_type mutex. Prevents unnecessary panics."
```

---

### Task 18: Document or remove #[allow(dead_code)] suppressions

**Files:**
- Modify: `crates/adl-logging/src/manager.rs` (line 41)
- Modify: `crates/browser/src/webview2_audio.rs` (line 22)

- [ ] **Step 1: Read both files to understand the dead code**

Read `crates/adl-logging/src/manager.rs` around line 41. Read `crates/browser/src/webview2_audio.rs` around line 22.

- [ ] **Step 2: For each, either remove the dead code or add documentation**

If the code is genuinely unused and not planned for Phase 3, remove it. If it's a reserved API point, add a comment:
```rust
#[allow(dead_code)] // Reserved for Phase 3 ACP/HTTP API integration
```

- [ ] **Step 3: Run Rust checks**

```powershell
cargo check --workspace
cargo clippy --workspace -- -D warnings
```

- [ ] **Step 4: Commit**

```bash
git add crates/adl-logging/src/manager.rs
git add crates/browser/src/webview2_audio.rs
git commit -m "chore(rust): document or remove #[allow(dead_code)] suppressions"
```

---

### Task 19: Audit react-hooks/exhaustive-deps eslint-disable directives

**Files:**
- Modify (if needed): `frontend/src/app/features/browser/SafeIframe.tsx` (line 93)
- Modify (if needed): `frontend/src/app/features/browser/useBrowserPageMeta.ts` (line 274)
- Modify (if needed): `frontend/src/app/features/browser/useBrowserUrlChange.ts` (line 312)
- Modify (if needed): `frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` (line 99)
- Modify (if needed): `frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx` (line 28)
- Modify (if needed): `frontend/src/app/features/git-visualization/hooks/useECharts.ts` (line 33)

- [ ] **Step 1: Read each file around the eslint-disable line**

For each of the 6 files, read 10 lines before and after the `eslint-disable` directive.

- [ ] **Step 2: For each, determine if the suppression is intentional**

If intentional (e.g., adding the dep would cause infinite re-render), add a comment:
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps -- adding X would cause infinite re-render
```

If accidental, fix the dependency array.

- [ ] **Step 3: Run lint to verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/
git commit -m "chore(frontend): document or fix react-hooks/exhaustive-deps suppressions"
```

---

## Final Acceptance

After all tasks complete, run the full mandatory testing flow:

### Frontend
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

### Rust
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
```

All must pass before considering the refactoring complete.
