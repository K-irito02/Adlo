# Plan C: Frontend Architecture & Component Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose oversized React components, fix serde casing violations across shared Rust↔TS types, consolidate catch-all bridge files, separate mixed-responsibility Rust modules, and extract repeated frontend patterns into reusable helpers.

**Architecture:** Thirteen independent tasks targeting the frontend component tree, shared IPC types, bridge layer organization, and one Rust crate responsibility separation. Each task is self-contained: fix serde casing on 4 structs, add runtime warnings to 13 inherited mock bridges, decompose 9 oversized components + 1 oversized hook into focused sub-components/hooks, split 2 catch-all bridge files into per-domain files, move 2 misplaced functions from agent-runtime to their domain crates, and extract 3 repeated frontend patterns into helpers.

**Tech Stack:** React 19, TypeScript, Zustand, Rust 1.85+, serde, ts-rs

## Global Constraints

- **Rust 1.85+**, **Node.js 24.15+**, **pnpm 10.x+**
- **`unwrap()` 禁用** in Rust non-test code — use `?` or pattern matching
- **`-D warnings` zero tolerance** — `cargo clippy --workspace --all-targets -- -D warnings` must pass
- **`rustfmt` default config** — `cargo fmt --all` must pass
- **TypeScript strict** — `pnpm --dir frontend run typecheck` must pass with 0 errors
- **ESLint** — `pnpm --dir frontend run lint` must pass
- **i18n 全覆盖** — all new UI text must use i18n keys via `useTCopy()`, no hardcoded strings
- **No backward-compatibility code** — removed code should not leave dead shims or `#[allow(dead_code)]`
- **Error handling** — use `captureError(get, error)` / `captureTypedError(get, error)`, never `set({ error: msg })` or empty `catch {}`
- **Commit format**: `type(scope): summary` where type ∈ {feat, fix, docs, chore, refactor, test} and scope ∈ {core, frontend, rust, stores, browser, terminal, ipc, docs, deps}
- **Environment**: Set `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` before any cargo command; Set `$env:Path = "D:\Program Files\nodejs;$env:Path"` before any pnpm/npm command
- **Proxy**: Clash proxy at `127.0.0.1:7890` must be enabled for crate downloads
- **Component decomposition rule**: extracted sub-components must be focused (one responsibility), testable in isolation, and follow the existing `features/<domain>/` or `regions/<area>/` directory structure
- **Barrel exports**: follow existing pattern in each domain's `index.ts` — do not create new barrel files unless the domain already has one

---

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `crates/types/src/types/agent.rs` | Add `#[serde(rename_all = "camelCase")]` + `#[derive(TS)]` to `AgentConfig` | Task 1 |
| `crates/subagent/src/task_tool.rs` | Add serde casing + TS derive to `TaskToolInput`/`TaskToolOutput` | Task 1 |
| `crates/subagent/src/lib.rs` | Add serde casing + TS derive to `SubagentTask` | Task 1 |
| `crates/mcp-client/src/lib.rs` | Add serde casing + TS derive to `McpServerConfig` | Task 1 |
| `frontend/src/shared/ipc/agent.ts`, `subagent.ts`, `mcp.ts` | Update TS mirrors to camelCase | Task 1 |
| `frontend/src/mock/mock-misc.ts` | Update mock data keys to camelCase | Task 1 |
| `frontend/src/preview-bridge/index.ts` | Add runtime warnings to 13 inherited mock bridges | Task 2 |
| `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` + new sub-files | Decompose into toolbar/tree/context-menu wiring | Task 3 |
| `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` + new sub-files | Extract row rendering, menu actions, drag handling | Task 4 |
| `frontend/src/app/features/diff-viewer/SideBySideDiffViewer.tsx` + `useDiffResizer.ts` | Extract resizer logic into hook | Task 5 |
| `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx` + new sub-files | Extract terminal lifecycle, resize, tab actions | Task 6 |
| `frontend/src/app/features/github-tree/GitHubEntrySubEntries.tsx` + new sub-files | Split entry rendering, menu wiring, state effects | Task 7 |
| `frontend/src/app/regions/TitleBar.tsx` + new sub-files | Extract menu, window controls, workspace switcher | Task 8 |
| `frontend/src/app/regions/left-sidebar/SessionList.tsx` + new sub-files | Extract session row, context menu, drag handling | Task 9 |
| `frontend/src/app/regions/right-panel/EditorSurfaceShell.tsx` + new sub-files | Extract tab bar, editor mount, preview switching | Task 10 |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx` + new hook files | Split into filters/selection/actions hooks | Task 11 |
| `frontend/src/tauri-bridge/tauri-misc.ts` → split into per-domain files | Split catch-all into focused bridge files | Task 12 |
| `frontend/src/mock/mock-misc.ts` → split into per-domain files | Split catch-all into focused mock files | Task 12 |
| `crates/agent-runtime/src/lib.rs` | Remove `create_patch_from_document` and `assistant_blocks` | Task 13 |
| `crates/change-engine/src/` | Accept moved `create_patch_from_document` | Task 13 |
| `crates/conversation/src/` | Accept moved `assistant_blocks` | Task 13 |
| `frontend/src/preview-bridge/preview-workspace.ts` | Extract `withWorkspace` HOF helper | Task 14 |
| `frontend/src/app/stores/actions/gitActions.ts` + new files | Split into snapshot/branch/file-ops action modules | Task 14 |
| `frontend/src/app/features/github-tree/GitHubEntryMenus.tsx` | Split `getMainEntryMenuItems` into builder functions | Task 14 |
| `frontend/src/app/features/browser/BookmarkToFolderDialog.tsx` | Replace manual DOM hint cards with React tooltip | Task 14 |

---

### Task 1: Fix serde casing for shared Rust↔TS structs

**Files:**
- Modify: `crates/types/src/types/agent.rs` (L78-94)
- Modify: `crates/subagent/src/task_tool.rs` (L4-21)
- Modify: `crates/subagent/src/lib.rs` (L13-24)
- Modify: `crates/mcp-client/src/lib.rs` (L16-25)
- Modify: `frontend/src/shared/ipc/agent.ts`
- Modify: `frontend/src/shared/ipc/subagent.ts`
- Modify: `frontend/src/shared/ipc/mcp.ts`
- Modify: `frontend/src/mock/mock-misc.ts`
- Modify: `frontend/src/preview-bridge/index.ts` (if it references snake_case keys)

**Interfaces:**
- Consumes: `ts-rs` crate (already in `crates/types/Cargo.toml` and `crates/subagent/Cargo.toml`)
- Produces: All 4 structs serialize as camelCase JSON; TS mirrors use camelCase field names

**Context:** Project rule `tagged-enum-camelcase-serde-pattern.md` mandates `#[serde(rename_all = "camelCase")]` on all shared structs. Four structs violate this rule. The TS mirror files and mock data use snake_case keys that must be updated to match.

- [ ] **Step 1: Add serde casing + TS derive to AgentConfig**

In `crates/types/src/types/agent.rs`, find the `AgentConfig` struct (L78-94) and update its derive and add serde attribute:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub id: AgentId,
    pub name: String,
    pub description: String,
    pub mode: AgentMode,
    pub hidden: bool,
    pub allows_write_tools: bool,
    pub prompt_template: String,
    pub model_override: Option<String>,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
}
```

If `AgentMode` and `AgentId` don't already have `TS` derive, add it to them as well (check their definitions in the same file).

- [ ] **Step 2: Add serde casing + TS derive to TaskToolInput and TaskToolOutput**

In `crates/subagent/src/task_tool.rs` (L4-21), update both structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TaskToolInput {
    pub description: String,
    pub prompt: String,
    pub subagent_type: String,
    pub task_id: Option<String>,
    pub background: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TaskToolOutput {
    pub task_id: String,
    pub state: String,
    pub summary: String,
    pub result: Option<String>,
    pub error: Option<String>,
}
```

Ensure `crates/subagent/Cargo.toml` has `ts-rs` in its `[target.'cfg(not(target_arch = "wasm32"))'.dependencies]` section (same pattern as `crates/types/Cargo.toml`). If not, add it.

- [ ] **Step 3: Add serde casing + TS derive to SubagentTask**

In `crates/subagent/src/lib.rs` (L13-24), update the struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SubagentTask {
    pub id: SubagentId,
    pub parent_session_id: String,
    pub child_session_id: String,
    pub subagent_type: String,
    pub prompt: String,
    pub background: bool,
    pub status: SubagentStatus,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}
```

Ensure `SubagentId` and `SubagentStatus` also have `TS` derive.

- [ ] **Step 4: Add serde casing + TS derive to McpServerConfig**

In `crates/mcp-client/src/lib.rs` (L16-25), update the struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub name: String,
    pub transport: McpTransportType,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env: std::collections::HashMap<String, String>,
    pub oauth: bool,
    pub enabled: bool,
}
```

Ensure `McpTransportType` has `TS` derive. Also check `crates/mcp-client/src/registry.rs` L65-99 (`parse_server_config`) — if it hand-rolls JSON parsing with snake_case keys, update it to use serde deserialization or align the key names.

- [ ] **Step 5: Regenerate TS types**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace -p adl-types -p adl-subagent -p adl-mcp-client -- --nocapture 2>&1 | Select-String "export|error" | Select-Object -Last 10
```
This triggers `ts-rs` export. Check that `frontend/src/shared/ipc/generated/` now has updated `.ts` files with camelCase fields.

- [ ] **Step 6: Update TS mirror files**

Read `frontend/src/shared/ipc/agent.ts`, `subagent.ts`, `mcp.ts`. Update all interface field names from snake_case to camelCase to match the generated types. If the files re-export from `./generated/`, update the re-export paths. If they define interfaces manually, update the field names.

For example, in `frontend/src/shared/ipc/agent.ts`, change:
```typescript
interface AgentConfig {
  allows_write_tools: boolean;
  prompt_template: string;
  model_override: string | undefined;
  allowed_tools: string[];
}
```
to:
```typescript
interface AgentConfig {
  allowsWriteTools: boolean;
  promptTemplate: string;
  modelOverride: string | undefined;
  allowedTools: string[];
}
```

- [ ] **Step 7: Update mock data**

In `frontend/src/mock/mock-misc.ts`, search for snake_case keys that mirror the updated structs (e.g., `parent_id`, `child_session_id`, `subagent_type`, `task_id`, `created_at`, `completed_at`, `custom_rules`, `include_defaults`, `content_type`, `cors_origins`, `max_concurrency`, `timeout_ms`, `max_output_bytes`). Update all to camelCase.

Also search `frontend/src/mock/mock-bridge.ts` and `frontend/src/mock/mock-shared.ts` for the same patterns and update.

- [ ] **Step 8: Update all frontend consumers**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck 2>&1 | Select-String "error" | Select-Object -First 30
```

Fix all type errors by updating snake_case property accesses to camelCase across `frontend/src/`. Common patterns to search and fix:
- `agent.allows_write_tools` → `agent.allowsWriteTools`
- `agent.prompt_template` → `agent.promptTemplate`
- `agent.model_override` → `agent.modelOverride`
- `agent.allowed_tools` → `agent.allowedTools`
- `task.parent_session_id` → `task.parentSessionId`
- `task.child_session_id` → `task.childSessionId`
- `task.subagent_type` → `task.subagentType`
- `task.created_at` → `task.createdAt`
- `task.completed_at` → `task.completedAt`
- `input.task_id` → `input.taskId`
- `input.subagent_type` → `input.subagentType`

Use Grep to find all occurrences and fix them.

- [ ] **Step 9: Verify Rust compilation + clippy + tests**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass. **Important**: Rust tests that assert JSON field names (e.g., `assert!(json.contains("allows_write_tools"))`) must be updated to assert camelCase names.

- [ ] **Step 10: Verify frontend**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```
Expected: 0 type errors, 0 lint errors, all tests pass.

- [ ] **Step 11: Commit**

```powershell
git add crates/types/src/types/agent.rs crates/subagent/src/task_tool.rs crates/subagent/src/lib.rs crates/mcp-client/src/lib.rs crates/mcp-client/src/registry.rs frontend/src/shared/ipc/ frontend/src/mock/ frontend/src/
git commit -m "refactor(ipc): add camelCase serde + TS derive to AgentConfig, TaskToolInput, SubagentTask, McpServerConfig

Fixes tagged-enum-camelcase-serde-pattern rule violation.
Updates all TS mirrors and mock data to use camelCase field names."
```

---

### Task 2: Add runtime warnings to preview-bridge inherited mock bridges

**Files:**
- Modify: `frontend/src/preview-bridge/index.ts` (L105-118)

**Interfaces:**
- Consumes: `DigitalLifeBridge` type from `shared/ipc/digital-life.ts`
- Produces: 13 inherited mock bridges emit a `console.warn` when invoked in preview mode

**Context:** `preview-bridge/index.ts` L105-118 inherits 13 bridges from `mockDigitalLifeBridge` (9 with "Phase 2" comment, 4 without). When these are called in browser dev mode, they silently run mock implementations. A runtime warning makes the divergence visible.

- [ ] **Step 1: Create a warning wrapper helper**

At the top of `frontend/src/preview-bridge/index.ts` (after imports, before the `previewBridge` const), add:

```typescript
const warnedBridges = new Set<string>();

function warnMockBridge<T extends Record<string, unknown>>(
  bridgeName: string,
  bridge: T
): T {
  return new Proxy(bridge, {
    get(target, prop, receiver) {
      const key = `${bridgeName}.${String(prop)}`;
      if (!warnedBridges.has(key) && typeof target[prop as string] === 'function') {
        warnedBridges.add(key);
        console.warn(
          `[preview-bridge] "${key}" is using a mock implementation in preview mode. ` +
          `Behavior may differ from Tauri mode. Implement a real preview bridge for production fidelity.`
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
```

- [ ] **Step 2: Wrap the 13 inherited bridges**

In the `previewBridge` object (L105-118), wrap each inherited bridge:

```typescript
  mcp: warnMockBridge('mcp', mockDigitalLifeBridge.mcp),
  provider: warnMockBridge('provider', mockDigitalLifeBridge.provider),
  commandsConfig: warnMockBridge('commandsConfig', mockDigitalLifeBridge.commandsConfig),
  permission: warnMockBridge('permission', mockDigitalLifeBridge.permission),
  // Phase 2 bridges (inherited from mock — add preview-specific overrides here if needed)
  snapshot: warnMockBridge('snapshot', mockDigitalLifeBridge.snapshot),
  webTools: warnMockBridge('webTools', mockDigitalLifeBridge.webTools),
  compaction: warnMockBridge('compaction', mockDigitalLifeBridge.compaction),
  sessionFork: warnMockBridge('sessionFork', mockDigitalLifeBridge.sessionFork),
  lsp: warnMockBridge('lsp', mockDigitalLifeBridge.lsp),
  reference: warnMockBridge('reference', mockDigitalLifeBridge.reference),
  durable: warnMockBridge('durable', mockDigitalLifeBridge.durable),
  reserved: warnMockBridge('reserved', mockDigitalLifeBridge.reserved),
  customAgent: warnMockBridge('customAgent', mockDigitalLifeBridge.customAgent),
```

- [ ] **Step 3: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```
Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/preview-bridge/index.ts
git commit -m "feat(browser): add runtime warnings for 13 inherited mock bridges in preview mode

Mock bridges now emit a one-time console.warn when invoked in
preview mode, making the Tauri/preview behavioral divergence
visible to developers."
```

---

### Task 3: Decompose FileNavigatorShell

**Files:**
- Modify: `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` (L65-496)
- Create: `frontend/src/app/regions/right-panel/FileNavigatorRenaming.tsx` (rename dialog logic)
- Create: `frontend/src/app/regions/right-panel/FileNavigatorContextMenu.tsx` (context menu wiring)

**Interfaces:**
- Consumes: existing `useFileCreation`, `useSearchPanel`, `useFileContextMenuItems` hooks from `./hooks/`
- Produces: `FileNavigatorShell` stays as the orchestrator (<200 lines), delegates to extracted sub-components

**Context:** `FileNavigatorShell` is 496 lines. The main complexity is in rename/delete confirmation handlers (L258-288) and context menu wiring (L237-258). The toolbar and tree are already extracted (`FileNavigatorToolbar`, `FileNavigatorTree`).

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` completely to understand all props, state, handlers, and render structure.

- [ ] **Step 2: Extract rename/delete dialog into FileNavigatorRenaming.tsx**

Create `frontend/src/app/regions/right-panel/FileNavigatorRenaming.tsx` containing:
- The rename confirmation/cancel handlers (`handleRenameConfirm` L258, `handleRenameCancel` L272)
- The delete confirmation/cancel handlers (`handleDeleteConfirm` L278, `handleDeleteCancel` L288)
- The rename input and delete confirmation UI rendering
- Props interface that receives `renamingPath`, `deletingPath`, `onConfirmRename`, `onCancelRename`, `onConfirmDelete`, `onCancelDelete`, `t` (i18n)

Export a `FileNavigatorRenaming` component that renders the dialog when active.

- [ ] **Step 3: Extract context menu state into FileNavigatorContextMenu.tsx**

Create `frontend/src/app/regions/right-panel/FileNavigatorContextMenu.tsx` containing:
- The `contextMenuPersistRef` and `clearMenuHighlightRef` refs (L237-238)
- The `copyToClipboard` callback (L240)
- Context menu rendering logic
- Props interface for menu items, position, and callbacks

- [ ] **Step 4: Update FileNavigatorShell to use extracted components**

In `FileNavigatorShell.tsx`, replace the extracted logic with imports from the new files. The component should become a lean orchestrator that:
- Manages top-level state (expandedPaths, search, visibleWorkspaces)
- Composes `FileNavigatorToolbar` + `FileNavigatorTree` + `FileNavigatorRenaming` + `FileNavigatorContextMenu`
- Delegates handlers to the extracted components via props

Target: under 200 lines.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```
Expected: 0 errors, all tests pass. If existing tests reference internal handlers, update them.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/regions/right-panel/FileNavigatorShell.tsx frontend/src/app/regions/right-panel/FileNavigatorRenaming.tsx frontend/src/app/regions/right-panel/FileNavigatorContextMenu.tsx
git commit -m "refactor(frontend): decompose FileNavigatorShell into focused sub-components

Extracts rename/delete dialog and context menu wiring into
separate files. Shell becomes a lean orchestrator under 200 lines."
```

---

### Task 4: Decompose WorkspaceChangesEntry

**Files:**
- Modify: `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` (L52-457)
- Create: `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesActions.ts` (action handlers)
- Create: `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesMenu.tsx` (context menu rendering)

**Interfaces:**
- Consumes: `ChangesTreeNode`, `GitSnapshot` from stores
- Produces: `WorkspaceChangesEntry` stays as orchestrator, delegates actions and menu to extracted modules

**Context:** Component is ~400 lines with 15+ useCallback handlers (copy path, reveal, hide, refresh, pin, etc.) and context menu wiring. The handlers are pure action dispatchers that can be extracted.

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` completely.

- [ ] **Step 2: Extract action handlers into WorkspaceChangesActions.ts**

Create `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesActions.ts` exporting a `useWorkspaceChangesActions` hook that returns all the action handlers:
- `handleNameClick`, `handleNameContextMenu`, `handleMoreClick`, `closeMenu`
- `copyToClipboard`, `handleCopyFullPath`, `handleCopyRelativePath`
- `handleRevealInFileManager`, `handleHideFromRightPanels`
- `handleNameKeyDown`, `handleRefreshClick`, `handlePinClick`

The hook receives `{ node, t, onClose }` and returns an object with all handlers. Uses `useCallback` internally.

- [ ] **Step 3: Extract context menu into WorkspaceChangesMenu.tsx**

Create `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesMenu.tsx` containing:
- The `wrappedGetContextMenuItems` callback (L81)
- The menu rendering logic
- The `menuId` state (L118)
- Click-outside/escape/scroll event listeners (L127-144)

- [ ] **Step 4: Update WorkspaceChangesEntry to use extracted modules**

Replace inline handlers and menu logic with the extracted hook and component. The entry component should focus on rendering the row (name, icon, badges) and composing the menu.

Target: under 200 lines.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/features/workspace-changes-tree/
git commit -m "refactor(frontend): decompose WorkspaceChangesEntry into actions hook and menu component

Extracts 15+ action handlers into useWorkspaceChangesActions hook
and context menu into WorkspaceChangesMenu component."
```

---

### Task 5: Decompose SideBySideDiffViewer — extract useDiffResizer hook

**Files:**
- Modify: `frontend/src/app/features/diff-viewer/SideBySideDiffViewer.tsx` (L28-431)
- Create: `frontend/src/app/features/diff-viewer/useDiffResizer.ts` (resizer logic)

**Interfaces:**
- Consumes: `mergeViewARef`, `mergeViewBRef`, `wrapperRef` (CodeMirror refs)
- Produces: `useDiffResizer` hook returns `{ startResize, applyRatio }` and manages all resizer DOM/state

**Context:** The component has a massive effect (L163-309) containing 20+ nested local functions for the diff resizer (drag handle, ratio persistence, mouse/touch handlers, resize observer). This is the single largest inline block in the component.

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/features/diff-viewer/SideBySideDiffViewer.tsx` completely, focusing on L163-309.

- [ ] **Step 2: Create useDiffResizer.ts**

Create `frontend/src/app/features/diff-viewer/useDiffResizer.ts` exporting a `useDiffResizer` hook. Move all resizer logic from the effect into this hook:

- `SAVED_RATIO_KEY` constant
- `MIN_WIDTH` constant
- `applyRatio`, `applyCurrentRatio` functions
- `startResize`, `onMove`, `onEnd` handlers
- `onMouseMove`, `onMouseUp`, `onTouchMove`, `onTouchEnd` listeners
- `onResizerMouseDown`, `onResizerTouchStart` entry points
- `resizeObserver` setup and cleanup
- Resizer DOM element creation and insertion

The hook receives `{ mergeViewARef, mergeViewBRef, wrapperRef }` and returns `{ onResizerMouseDown, onResizerTouchStart }` (the entry points for attaching to the resizer handle element).

Use `useEffect` for setup/cleanup and `useCallback` for stable handlers. Ensure the ratio is persisted to localStorage via `SAVED_RATIO_KEY`.

- [ ] **Step 3: Update SideBySideDiffViewer to use the hook**

In `SideBySideDiffViewer.tsx`, replace the massive effect (L163-309) with:

```typescript
const { onResizerMouseDown, onResizerTouchStart } = useDiffResizer({
  mergeViewARef,
  mergeViewBRef,
  wrapperRef,
});
```

Keep the CodeMirror MergeView initialization in a separate effect. The component should drop from ~400 lines to ~200.

- [ ] **Step 4: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/diff-viewer/SideBySideDiffViewer.tsx frontend/src/app/features/diff-viewer/useDiffResizer.ts
git commit -m "refactor(frontend): extract diff resizer logic into useDiffResizer hook

Moves 150-line resizer effect (drag handle, ratio persistence,
mouse/touch listeners, resize observer) into a focused hook.
SideBySideDiffViewer drops from ~400 to ~200 lines."
```

---

### Task 6: Decompose WorkspaceTerminalEntry

**Files:**
- Modify: `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx` (L43-431)
- Create: `frontend/src/app/features/workspace-terminal/useTerminalMenu.ts` (menu/profile state + handlers)

**Interfaces:**
- Consumes: terminal session state from stores
- Produces: `useTerminalMenu` hook returns menu state and handlers

**Context:** Component is ~388 lines with profile selection (L96-106), sub-menu show/hide with timer (L148-167), and 10+ click handlers (L137-224). The menu/profile logic is self-contained.

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx` completely.

- [ ] **Step 2: Create useTerminalMenu.ts**

Create `frontend/src/app/features/workspace-terminal/useTerminalMenu.ts` exporting a `useTerminalMenu` hook that encapsulates:
- `menuId`, `subMenuId` state (L66-67)
- `subMenuTriggerRef`, `subHideTimerRef`, `menuContainerRef` refs (L68, L82-83)
- `currentProfile`, `profileLabels`, `defaultProfileLabel` (L96-106)
- `closeMenu` (L108), `clickOutsideRefs` (L117)
- `showSubMenu`, `hideSubMenuDelayed` (L148-167)
- `handleMoreClick` (L169), `handleHideFromRightPanels` (L180)
- `handleSelectDefaultProfile` (L185)
- `handleNameClick`, `handleNameContextMenu`, `handleNameKeyDown` (L137-199)
- `handleRefreshClick`, `handleCloseAllTabsClick`, `handleCreateTabClick` (L208-224)

The hook receives `{ node, t, onClose }` and returns all state + handlers.

- [ ] **Step 3: Update WorkspaceTerminalEntry**

Replace inline menu/profile logic with the extracted hook. The component focuses on rendering the terminal header, tab list, and xterm container.

Target: under 200 lines.

- [ ] **Step 4: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/workspace-terminal/
git commit -m "refactor(frontend): extract terminal menu/profile logic into useTerminalMenu hook

WorkspaceTerminalEntry drops from ~388 to ~200 lines. Menu state,
profile selection, and 10+ handlers move to focused hook."
```

---

### Task 7: Decompose GitHubEntrySubEntries

**Files:**
- Modify: `frontend/src/app/features/github-tree/GitHubEntrySubEntries.tsx` (L37-411)
- Create: `frontend/src/app/features/github-tree/GitHubChildMenuLogic.ts` (duplicated child folder logic)

**Interfaces:**
- Consumes: `GitHubTreeNode`, folder/workspace state
- Produces: `getChildMenuContext` helper returns `{ childFolderId, childIsPinned, isWorkspaceChild, isUserFolderChild, isUserFolderRoot, showDeleteFolder }`

**Context:** Component is ~385 lines. The main duplication is `childFolderId`/`childIsPinned`/`isWorkspaceChild`/`isUserFolderChild`/`isUserFolderRoot`/`showDeleteFolder` computed at both L181-193 and L310-324 — identical logic in two places.

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/features/github-tree/GitHubEntrySubEntries.tsx` completely.

- [ ] **Step 2: Create GitHubChildMenuLogic.ts**

Create `frontend/src/app/features/github-tree/GitHubChildMenuLogic.ts` exporting:

```typescript
export interface ChildMenuContext {
  childFolderId: string | undefined;
  childIsPinned: boolean;
  isWorkspaceChild: boolean;
  isUserFolderChild: boolean;
  isUserFolderRoot: boolean;
  showDeleteFolder: boolean;
}

export function getChildMenuContext(
  child: GitHubTreeNode,
  pinnedFolderIds: Set<string>,
  workspaceId: string | undefined
): ChildMenuContext {
  // Extract the logic from L181-193 / L310-324
}
```

- [ ] **Step 3: Update GitHubEntrySubEntries**

Replace both duplicated blocks (L181-193 and L310-324) with calls to `getChildMenuContext`. Also extract `renderSubEntryIcon`, `renderChildMeta`, `renderChildCount` into the same file or a `GitHubEntryRenderers.tsx` if they are large.

Target: under 250 lines.

- [ ] **Step 4: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/github-tree/
git commit -m "refactor(frontend): extract duplicated child menu logic in GitHubEntrySubEntries

Removes duplicated childFolderId/isWorkspaceChild/showDeleteFolder
computation (L181-193 and L310-324) into getChildMenuContext helper."
```

---

### Task 8: Decompose TitleBar

**Files:**
- Modify: `frontend/src/app/regions/TitleBar.tsx` (L59-423)
- Create: `frontend/src/app/regions/TitleBarNotifications.tsx` (notification dropdown)
- Create: `frontend/src/app/regions/TitleBarWindowControls.tsx` (drag/zoom/close controls)

**Interfaces:**
- Consumes: `useFileMenuItems`, `useViewMenuItems`, `useHelpMenuItems` hooks (already extracted)
- Produces: `TitleBar` orchestrates menu bars + notification panel + window controls

**Context:** Component is ~364 lines. Notification dropdown (L69-106, L80 `toggleNotifDropdown`, L95-106 IntersectionObserver effect) and window drag/zoom (L127-155 drag effect, L207-212 zoom) are the two largest self-contained blocks.

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/regions/TitleBar.tsx` completely.

- [ ] **Step 2: Create TitleBarNotifications.tsx**

Create `frontend/src/app/regions/TitleBarNotifications.tsx` containing:
- `notifications`, `removeNotification`, `markAllAsRead`, `clearAll`, `setReadByVisibility` store selectors (L69-73)
- `unreadCount` memo (L74)
- `notifRef`, `notifListRef` refs (L77-78)
- `toggleNotifDropdown` (L80)
- `seenDuringSessionRef` (L90)
- IntersectionObserver effect (L95-106)
- Notification dropdown rendering

Export a `TitleBarNotifications` component with minimal props (`t`, `locale`).

- [ ] **Step 3: Create TitleBarWindowControls.tsx**

Create `frontend/src/app/regions/TitleBarWindowControls.tsx` containing:
- `dragRef` (L127), `handleBodyMouseDown` (L128)
- Drag move/up effect (L142-155)
- `handleClose` (L200)
- `zoomBy` (L207), `resetZoom` (212)
- Window control buttons rendering (minimize, maximize, close, zoom in/out)

- [ ] **Step 4: Update TitleBar**

Replace the extracted blocks with imports from the new files. `TitleBar` focuses on composing menu bars (`fileItems`, `viewItems`, `helpItems`) + the two new sub-components + language switcher.

Target: under 180 lines.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/regions/TitleBar.tsx frontend/src/app/regions/TitleBarNotifications.tsx frontend/src/app/regions/TitleBarWindowControls.tsx
git commit -m "refactor(frontend): decompose TitleBar into notifications and window controls sub-components

TitleBar drops from ~364 to ~180 lines. Notification dropdown
and window drag/zoom logic move to focused components."
```

---

### Task 9: Decompose SessionList

**Files:**
- Modify: `frontend/src/app/regions/left-sidebar/SessionList.tsx` (L48-377)
- Create: `frontend/src/app/regions/left-sidebar/useSessionDragDrop.ts` (drag/drop reorder logic)
- Create: `frontend/src/app/regions/left-sidebar/SessionRow.tsx` (individual session row)

**Interfaces:**
- Consumes: session list from stores, `mergeEphemeralVisibleSessions` helper (L13)
- Produces: `useSessionDragDrop` hook returns drag state + 3 drop handlers; `SessionRow` renders a single session

**Context:** Component is ~329 lines. The 3 `handleSessionDrop*` handlers (L126, L159, L192) share nearly-identical `bucketItems`/`nextIds`/`pinnedIds`/`unpinnedIds` logic. The row rendering with drag/drop state is inline.

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/regions/left-sidebar/SessionList.tsx` completely.

- [ ] **Step 2: Create useSessionDragDrop.ts**

Create `frontend/src/app/regions/left-sidebar/useSessionDragDrop.ts` exporting a `useSessionDragDrop` hook that encapsulates:
- `dragOverSessionTarget`, `setDragOverSessionTarget` (L86)
- `flashDroppedSession` (L90)
- `handleSessionDrop` (L126), `handleSessionDropAfterVisibleTarget` (L159), `handleSessionDropToBucketEnd` (L192)
- `draggedSessionItem` (L235), `lastVisibleInBucket` (L238)
- `canDropTail` (L244), `shouldDropAfterVisibleTail` (L345)

Extract the shared `bucketItems`/`nextIds`/`pinnedIds`/`unpinnedIds` pattern into a private `computeReorder` function within the hook file.

- [ ] **Step 3: Create SessionRow.tsx**

Create `frontend/src/app/regions/left-sidebar/SessionRow.tsx` exporting a `SessionRow` component (React.memo) that renders a single session with:
- Name display / rename input
- Pin indicator
- Drag/drop visual state (`isHovered`, `canReorderIntoTarget`, `isDropTarget`, `isHighlighted`)
- Click/rename/drag handlers

- [ ] **Step 4: Update SessionList**

Replace inline drag/drop logic with `useSessionDragDrop` and row rendering with `SessionRow`. The list component focuses on composing visible items and the drop-tail target.

Target: under 180 lines.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/regions/left-sidebar/
git commit -m "refactor(frontend): decompose SessionList into drag-drop hook and SessionRow component

Extracts 3 nearly-identical drop handlers into useSessionDragDrop
hook with shared computeReorder helper. Row rendering moves to
SessionRow component. SessionList drops from ~329 to ~180 lines."
```

---

### Task 10: Decompose EditorSurfaceShell

**Files:**
- Modify: `frontend/src/app/regions/right-panel/EditorSurfaceShell.tsx` (L114-433)
- Create: `frontend/src/app/regions/right-panel/useDiffStickyRanges.ts` (sticky diff range computation)
- Create: `frontend/src/app/regions/right-panel/EditorTabBar.tsx` (tab bar rendering)

**Interfaces:**
- Consumes: `activeFilePatch`, `agentHunkDecorations` from stores
- Produces: `useDiffStickyRanges` hook returns `{ stickyDiffRanges, agentHunkDecorations, stickyContextContent, stickyContextInput }`

**Context:** Component is ~319 lines. The sticky diff range computation (L163-195: `stickyDiffRanges`, `agentHunkDecorations`, `stickyContextContent`, `stickyContextInput`) and tab bar rendering are the main complexity.

- [ ] **Step 1: Read the full component**

Read `frontend/src/app/regions/right-panel/EditorSurfaceShell.tsx` completely.

- [ ] **Step 2: Create useDiffStickyRanges.ts**

Create `frontend/src/app/regions/right-panel/useDiffStickyRanges.ts` exporting a `useDiffStickyRanges` hook that encapsulates:
- `fileCategory` memo (L138)
- `activeFilePatch` memo (L146)
- `activeFilePatchSummary` memo (L155)
- `stickyDiffRanges` memo (L163)
- `agentHunkDecorations` memo (L171-179)
- `stickyContextContent` (L199)
- `stickyContextInput` memo (L204)

The hook receives `{ activeFilePath, filePreviewModeByPath }` and returns all computed values.

- [ ] **Step 3: Create EditorTabBar.tsx**

Create `frontend/src/app/regions/right-panel/EditorTabBar.tsx` exporting an `EditorTabBar` component that renders the file tab bar with:
- Tab list
- Active tab indicator
- Close/preview toggle buttons
- i18n labels

- [ ] **Step 4: Update EditorSurfaceShell**

Replace inline computation with `useDiffStickyRanges` and tab bar rendering with `EditorTabBar`. The shell focuses on composing CodeEditor/DiffViewer with extensions and mount handlers.

Target: under 200 lines.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/regions/right-panel/EditorSurfaceShell.tsx frontend/src/app/regions/right-panel/useDiffStickyRanges.ts frontend/src/app/regions/right-panel/EditorTabBar.tsx
git commit -m "refactor(frontend): decompose EditorSurfaceShell into diff ranges hook and tab bar component

EditorSurfaceShell drops from ~319 to ~200 lines. Sticky diff
range computation moves to useDiffStickyRanges hook."
```

---

### Task 11: Decompose useChangesPanelState hook

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx` (L18-364)
- Create: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelFilters.ts`
- Create: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelSelection.ts`

**Interfaces:**
- Consumes: `showGitVisualization`, `setShowGitVisualization` from stores
- Produces: `useChangesPanelState` stays as orchestrator, delegates to `useChangesPanelFilters` and `useChangesPanelSelection`

**Context:** Hook is ~346 lines. The filter logic (search, status filter, file type filter) and selection logic (selected path, preview path, expand/collapse) are the two main concerns.

- [ ] **Step 1: Read the full hook**

Read `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx` completely.

- [ ] **Step 2: Create useChangesPanelFilters.ts**

Create `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelFilters.ts` exporting a `useChangesPanelFilters` hook that encapsulates:
- Filter state (search query, status filter, file type filter)
- Filtered tree computation
- Filter change handlers
- `baseMenuItems` memo (L147) if it relates to filters

- [ ] **Step 3: Create useChangesPanelSelection.ts**

Create `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelSelection.ts` exporting a `useChangesPanelSelection` hook that encapsulates:
- Selected path state
- Preview path state
- Expand/collapse state
- `changesMenuItems` memo (L159) and `copyItems` (L163)
- `renderNavigatorMeta` (L219), `renderNavigatorCount` (L232) callbacks

- [ ] **Step 4: Update useChangesPanelState**

Compose the two new hooks. The main hook keeps `showGitVisualization` state and `editorRef`/`changesPreviewContainerRef` refs, and delegates to the sub-hooks.

Target: under 150 lines.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/regions/right-panel/panels/ChangesPanel/
git commit -m "refactor(frontend): split useChangesPanelState into filters and selection hooks

Hook drops from ~346 to ~150 lines. Filter logic and selection
logic move to focused sub-hooks."
```

---

### Task 12: Split tauri-misc.ts and mock-misc.ts into per-domain files

**Files:**
- Create: `frontend/src/tauri-bridge/tauri-window.ts`, `tauri-app.ts`, `tauri-retrieval.ts`, `tauri-patch.ts`, `tauri-command.ts`, `tauri-task.ts`, `tauri-run-activity.ts`, `tauri-mcp.ts`, `tauri-commands-config.ts`, `tauri-session-fork.ts`, `tauri-reserved.ts`, `tauri-custom-agent.ts`
- Create: corresponding `frontend/src/mock/mock-*.ts` files for each domain
- Delete: `frontend/src/tauri-bridge/tauri-misc.ts`, `frontend/src/mock/mock-misc.ts`
- Modify: all files that import from `tauri-misc` or `mock-misc`

**Interfaces:**
- Consumes: existing bridge factory functions
- Produces: each bridge domain in its own file, matching the existing per-domain pattern (e.g., `tauri-workspace.ts`, `tauri-conversation.ts`)

**Context:** `tauri-misc.ts` (217 lines) bundles 12 bridge domains; `mock-misc.ts` (226 lines) bundles 12 mock domains. Other bridges each get dedicated files — this split is arbitrary and causes merge conflicts.

- [ ] **Step 1: Read both files completely**

Read `frontend/src/tauri-bridge/tauri-misc.ts` and `frontend/src/mock/mock-misc.ts`.

- [ ] **Step 2: Create per-domain tauri-bridge files**

For each of the 12 factories in `tauri-misc.ts`, create a new file in `frontend/src/tauri-bridge/`:
- `tauri-window.ts` — `createTauriWindowBridge` (L49-81)
- `tauri-app.ts` — `createTauriAppBridge` (L83-92)
- `tauri-retrieval.ts` — `createTauriRetrievalBridge` (L94-106)
- `tauri-patch.ts` — `createTauriPatchBridge` (L108-122)
- `tauri-command.ts` — `createTauriCommandBridge` (L124-130)
- `tauri-task.ts` — `createTauriTaskBridge` (L132-150)
- `tauri-run-activity.ts` — `createTauriRunActivityBridge` (L152-157)
- `tauri-mcp.ts` — `createTauriMcpBridge` (L159-169)
- `tauri-commands-config.ts` — `createTauriCommandsConfigBridge` (L171-184)
- `tauri-session-fork.ts` — `createTauriSessionForkBridge` (L186-196)
- `tauri-reserved.ts` — `createTauriReservedBridge` (L198-207)
- `tauri-custom-agent.ts` — `createTauriCustomAgentBridge` (L209-217)

Each file should include its own imports and export the factory function. Follow the pattern of existing files like `tauri-workspace.ts`.

- [ ] **Step 3: Create per-domain mock files**

For each of the 12 exports in `mock-misc.ts`, create a new file in `frontend/src/mock/`:
- `mock-command.ts`, `mock-run-activity.ts`, `mock-web-tools.ts`, `mock-commands-config.ts`, `mock-permission.ts`, `mock-compaction.ts`, `mock-session-fork.ts`, `mock-lsp.ts`, `mock-reference.ts`, `mock-durable.ts`, `mock-reserved.ts`, `mock-custom-agent.ts`

- [ ] **Step 4: Update all imports**

Use Grep to find all files that import from `tauri-misc` or `mock-misc`:
```
Grep pattern: from '.*tauri-misc'|from '.*mock-misc'
```

Update each import to point to the new per-domain file. For example:
```typescript
// Before
import { createTauriWindowBridge, createTauriAppBridge } from './tauri-misc';
// After
import { createTauriWindowBridge } from './tauri-window';
import { createTauriAppBridge } from './tauri-app';
```

- [ ] **Step 5: Delete the catch-all files**

Delete `frontend/src/tauri-bridge/tauri-misc.ts` and `frontend/src/mock/mock-misc.ts`.

- [ ] **Step 6: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/tauri-bridge/ frontend/src/mock/
git commit -m "refactor(ipc): split tauri-misc.ts and mock-misc.ts into per-domain files

Each bridge domain now has its own file, matching the existing
per-domain pattern. Eliminates catch-all files that caused merge
conflicts across 12 unrelated domains."
```

---

### Task 13: Move misplaced functions from agent-runtime to domain crates

**Files:**
- Modify: `crates/agent-runtime/src/lib.rs` (remove L217-240 and L242-292)
- Modify: `crates/change-engine/src/lib.rs` (accept `create_patch_from_document`)
- Modify: `crates/conversation/src/lib.rs` (accept `assistant_blocks`)
- Modify: all callers of `create_patch_from_document` and `assistant_blocks`

**Interfaces:**
- Consumes: `WorkspaceFileDocument`, `PatchSet`, `AgentRunDetail`, `ConversationScenario`, `ConversationBlock` from `adl-types`
- Produces: `adl_change_engine::create_patch_from_document` and `adl_conversation::assistant_blocks`

**Context:** `agent-runtime/src/lib.rs` mixes 6+ responsibilities. `create_patch_from_document` (L217-240) belongs in `change-engine` (it creates a patch set). `assistant_blocks` (L242-292) belongs in `conversation` (it builds conversation blocks). Moving them clarifies crate boundaries.

- [ ] **Step 1: Read the functions and their callers**

Read `crates/agent-runtime/src/lib.rs` L217-292. Then Grep for callers:
```
Grep pattern: create_patch_from_document|assistant_blocks
```

- [ ] **Step 2: Move create_patch_from_document to change-engine**

In `crates/change-engine/src/lib.rs` (or a new `crates/change-engine/src/document_patch.rs`), add:

```rust
use adl_types::{WorkspaceFileDocument, PatchSet};

pub fn create_patch_from_document(
    workspace_id: &str,
    session_id: &str,
    run_id: Option<&str>,
    prompt: &str,
    document: &WorkspaceFileDocument,
) -> PatchSet {
    let note = format!("// AI Digital Life task: {}\n", prompt.trim());
    let after = if document.content.starts_with(&note) {
        document.content.clone()
    } else {
        format!("{note}{}", document.content)
    };
    crate::create_single_file_patch_set(crate::PatchProposal {
        workspace_id,
        session_id,
        run_id: run_id.map(|s| s.to_string()),
        relative_path: &document.path,
        before_content: &document.content,
        after_content: &after,
        title: format!("Update {}", document.path),
        summary: format!("Patch preview for {}", document.path),
    })
}
```

Re-export from `crates/change-engine/src/lib.rs`:
```rust
pub mod document_patch;
pub use document_patch::create_patch_from_document;
```

Ensure `crates/change-engine/Cargo.toml` has `adl-types` dependency (it does).

- [ ] **Step 3: Move assistant_blocks to conversation**

In `crates/conversation/src/lib.rs` (or a new `crates/conversation/src/blocks.rs`), add:

```rust
use adl_types::{AgentRunDetail, PatchSet, ConversationScenario, ConversationBlock, PlanConversationItem, create_id};

pub fn assistant_blocks(
    detail: &AgentRunDetail,
    patch_set: Option<&PatchSet>,
    scenario: ConversationScenario,
) -> Vec<ConversationBlock> {
    // Copy the full implementation from agent-runtime/src/lib.rs L242-292
}
```

Re-export from `crates/conversation/src/lib.rs`:
```rust
pub mod blocks;
pub use blocks::assistant_blocks;
```

Ensure `crates/conversation/Cargo.toml` has `adl-types` dependency.

- [ ] **Step 4: Remove from agent-runtime and update callers**

In `crates/agent-runtime/src/lib.rs`, delete L217-292 (`create_patch_from_document` and `assistant_blocks`).

Update all callers to import from the new locations:
- `use adl_change_engine::create_patch_from_document;`
- `use adl_conversation::assistant_blocks;`

If `agent-runtime` already depends on `adl-change-engine` and `adl-conversation`, no Cargo.toml changes needed. If not, add them.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 10
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```

- [ ] **Step 6: Commit**

```powershell
git add crates/agent-runtime/src/lib.rs crates/change-engine/ crates/conversation/
git commit -m "refactor(rust): move create_patch_from_document to change-engine and assistant_blocks to conversation

agent-runtime becomes focused on run lifecycle + tool registry.
Patch creation lives in change-engine, conversation block building
lives in conversation crate."
```

---

### Task 14: Extract repeated frontend patterns into reusable helpers

**Files:**
- Modify: `frontend/src/preview-bridge/preview-workspace.ts` (L80-88, L203-329)
- Modify: `frontend/src/app/stores/actions/gitActions.ts` (L82-386)
- Create: `frontend/src/app/stores/actions/gitSnapshotActions.ts`, `gitBranchActions.ts`, `gitFileOpsActions.ts`
- Modify: `frontend/src/app/features/github-tree/GitHubEntryMenus.tsx` (L156-394)
- Create: `frontend/src/app/features/github-tree/githubMenuBuilders.ts`
- Modify: `frontend/src/app/features/browser/BookmarkToFolderDialog.tsx` (L275-323)

**Interfaces:**
- Consumes: existing patterns in 3 files
- Produces: `withWorkspace` HOF, 3 git action modules, menu builder functions, React-based tooltip

**Context:** Three independent pattern extractions: (1) `requireWorkspace()` guard repeated 9× in preview-workspace.ts, (2) `createGitActions` 303-line factory, (3) `getMainEntryMenuItems` 238-line function, (4) manual DOM hint cards in BookmarkToFolderDialog.

- [ ] **Step 1: Extract withWorkspace HOF in preview-workspace.ts**

Read `frontend/src/preview-bridge/preview-workspace.ts` L80-88 and L203-329.

At the top of the file (after `requireWorkspace` definition), add:

```typescript
function withWorkspace<T>(
  fn: (ctx: PreviewWorkspaceContext, rootPath: string) => Promise<IpcResult<T>>
): () => Promise<IpcResult<T>> {
  return async () => {
    if (!ctx.currentWorkspace) {
      return {
        ok: false as const,
        error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
      };
    }
    return fn(ctx, ctx.currentWorkspace.rootPath);
  };
}
```

Then refactor the 9 methods that use the guard (L203, L217, L227, L242, L268, L282, L292, L306, L317) to use `withWorkspace`:

```typescript
createFile: withWorkspace(async (ctx, rootPath) => {
  return requestPreviewApi('/workspace/file', { method: 'POST', body: ... });
}),
```

- [ ] **Step 2: Split gitActions into 3 modules**

Read `frontend/src/app/stores/actions/gitActions.ts` completely.

Create 3 new files:

**`frontend/src/app/stores/actions/gitSnapshotActions.ts`**:
- `fetchGitStatus` (L92-137)
- `loadGitSnapshot` (L243-261)
- `refreshGitSnapshot` (L271-295)
- Module-level helpers: `moveInSnapshot` (L24-54), `applyGitOperation` (L56-80)

**`frontend/src/app/stores/actions/gitBranchActions.ts`**:
- `fetchGitBranches` (L147-160)
- `switchGitBranch` (L169-206)
- `createGitBranch` (L215-233)
- Module-level helper: `refreshAfterBranchChange` (L17-22)

**`frontend/src/app/stores/actions/gitFileOpsActions.ts`**:
- `stageWorkspaceFile` (L345-357)
- `unstageWorkspaceFile` (L359-371)
- `discardWorkspaceFile` (L373-385)
- `expandWorkspaceChangesInFileNav` (L305-314)
- `collapseAllWorkspaceChanges` (L322-324)
- `expandAllWorkspaceChanges` (L334-343)

Update `gitActions.ts` to import and compose the 3 modules:

```typescript
export function createGitActions(set, get) {
  return {
    ...createGitSnapshotActions(set, get),
    ...createGitBranchActions(set, get),
    ...createGitFileOpsActions(set, get),
  };
}
```

- [ ] **Step 3: Split getMainEntryMenuItems into builder functions**

Read `frontend/src/app/features/github-tree/GitHubEntryMenus.tsx` L156-394.

Create `frontend/src/app/features/github-tree/githubMenuBuilders.ts` exporting:

```typescript
export function buildRefreshMenuItems(params: MenuBuilderParams): MainMenuItem[]
export function buildPinMenuItems(params: MenuBuilderParams): MainMenuItem[]
export function buildRenameMenuItems(params: MenuBuilderParams): MainMenuItem[]
export function buildSettingsMenuItems(params: MenuBuilderParams): MainMenuItem[]
export function buildHideMenuItems(params: MenuBuilderParams): MainMenuItem[]
export function buildDeleteMenuItems(params: MenuBuilderParams): MainMenuItem[]
export function buildDeleteRecursiveMenuItems(params: MenuBuilderParams): MainMenuItem[]
```

Update `getMainEntryMenuItems` to compose the builders:

```typescript
export function getMainEntryMenuItems(params: ...): Array<MainMenuItem> {
  return [
    ...buildRefreshMenuItems(params),
    ...buildPinMenuItems(params),
    ...buildRenameMenuItems(params),
    ...buildSettingsMenuItems(params),
    ...buildHideMenuItems(params),
    { type: 'separator', id: 'sep-danger' },
    ...buildDeleteMenuItems(params),
    { type: 'separator', id: 'sep-recursive', condition: ... },
    ...buildDeleteRecursiveMenuItems(params),
  ];
}
```

- [ ] **Step 4: Replace manual DOM hint cards in BookmarkToFolderDialog**

Read `frontend/src/app/features/browser/BookmarkToFolderDialog.tsx` L275-323.

Replace `handleHintEnter`/`handleHintLeave` (which manually create DOM elements via `document.createElement`) with a React-managed tooltip. Use the existing `TooltipSimple` component from the design system (check `frontend/src/design-system/` for availability) or a `useState`-driven tooltip:

```typescript
const [hintVisible, setHintVisible] = useState(false);
const [hintPosition, setHintPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

const handleHintEnter = useCallback((e: React.MouseEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setHintPosition({ x: rect.right + 8, y: rect.top });
  setHintVisible(true);
}, []);

const handleHintLeave = useCallback(() => {
  setHintVisible(false);
}, []);
```

Render the hint card as a React component (via portal if needed) instead of raw DOM manipulation. Remove `subCardsRef` and the cleanup effect.

- [ ] **Step 5: Verify**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run typecheck
pnpm run lint
pnpm run test
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/preview-bridge/preview-workspace.ts frontend/src/app/stores/actions/gitActions.ts frontend/src/app/stores/actions/gitSnapshotActions.ts frontend/src/app/stores/actions/gitBranchActions.ts frontend/src/app/stores/actions/gitFileOpsActions.ts frontend/src/app/features/github-tree/GitHubEntryMenus.tsx frontend/src/app/features/github-tree/githubMenuBuilders.ts frontend/src/app/features/browser/BookmarkToFolderDialog.tsx
git commit -m "refactor(frontend): extract repeated patterns into reusable helpers

- preview-workspace: withWorkspace HOF replaces 9 duplicated guards
- gitActions: split 303-line factory into 3 focused modules
- GitHubEntryMenus: split 238-line function into 7 builder functions
- BookmarkToFolderDialog: replace manual DOM hint cards with React state"
```

---

## Self-Review

### Spec coverage

| Finding from insight report | Task |
|----------------------------|------|
| High: serde casing for AgentConfig/TaskToolInput/SubagentTask/McpServerConfig | Task 1 |
| High: preview-bridge 13 inherited mock bridges | Task 2 |
| High: FileNavigatorShell 430 lines | Task 3 |
| High: WorkspaceChangesEntry 400 lines | Task 4 |
| High: SideBySideDiffViewer 400 lines | Task 5 |
| High: WorkspaceTerminalEntry 388 lines | Task 6 |
| High: GitHubEntrySubEntries 385 lines | Task 7 |
| High: TitleBar 364 lines | Task 8 |
| High: SessionList 329 lines | Task 9 |
| High: EditorSurfaceShell 319 lines | Task 10 |
| High: useChangesPanelState 346 lines | Task 11 |
| Medium: tauri-misc.ts and mock-misc.ts catch-all files | Task 12 |
| Medium: agent-runtime lib.rs mixed responsibilities | Task 13 |
| Medium: preview-workspace requireWorkspace guard repeated 9× | Task 14 |
| Medium: gitActions 303 lines | Task 14 |
| Medium: GitHubEntryMenus 238-line function | Task 14 |
| Medium: BookmarkToFolderDialog 309 lines | Task 14 |

All 17 findings from the insight report (within Plan C scope) are covered.

### Placeholder scan

- No "TBD", "TODO", "implement later" found
- Task 1 Step 6 says "update all interface field names" — specific field mappings are listed
- Component decomposition tasks (3-11) say "Read the full component" as Step 1 — this is intentional, the implementer must read the current code before extracting
- Task 13 Step 3 says "Copy the full implementation from agent-runtime/src/lib.rs L242-292" — the implementer must read the source. This is unavoidable as the function is ~50 lines.

### Type consistency

- `withWorkspace<T>` generic is consistent across preview-workspace refactoring
- `ChildMenuContext` interface in Task 7 matches the fields listed in the insight report
- `MenuBuilderParams` in Task 14 — the implementer should define this type based on the existing `getMainEntryMenuItems` params (listed in the research report)

### Notes on assumptions

1. **Task 1**: Assumes `ts-rs` is available in `crates/subagent` and `crates/mcp-client`. The implementer must verify Cargo.toml and add the dependency if missing.
2. **Tasks 3-11**: Assumes the existing `hooks/` directory pattern can be extended. The implementer should follow the existing directory structure.
3. **Task 12**: Assumes no circular import issues when splitting files. The implementer should verify imports resolve correctly.
4. **Task 13**: Assumes `agent-runtime` already depends on `change-engine` and `conversation`. If not, add the dependencies.
5. **Task 14**: Assumes `TooltipSimple` or equivalent exists in the design system. If not, use a simple `useState`-driven tooltip with CSS.
