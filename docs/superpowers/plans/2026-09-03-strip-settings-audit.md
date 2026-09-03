# Strip Settings & Audit Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 7 settings modules (agent, mcp, models, commands, permissions, references, lsp) and the entire audit panel from both frontend and backend, stripping the project for dsh plugin integration.

**Architecture:** Parallel sub-agent execution — 8 independent module removals in Batch 1, then a single global cleanup pass in Batch 2 to resolve cross-cutting types and references.

**Tech Stack:** React 19 + TypeScript + Zustand (frontend), Rust + Axum + rusqlite (backend)

## Global Constraints

- Branch: `refactor/strip-20260903`
- TypeScript: strict mode, no `any`
- Rust: `cargo clippy --workspace --all-targets -- -D warnings` must pass
- Frontend lint: `pnpm --dir frontend run lint` must pass
- All i18n keys must be removed from both `en-US` and `zh-CN`
- No orphaned imports after each batch

---

## Batch 1: Parallel Module Removal (8 Sub-Agents)

Each sub-agent handles ONE module. All 8 run concurrently.

### Task 1: Remove Agent Settings

**Files:**
- Delete: `frontend/src/app/features/custom-agent/` (entire directory)
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:13,39` — remove import + mapping
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx:13` — remove `{ id: 'agent', labelKey: 'settingsAgent' }`
- Modify: `frontend/src/kernel/types.ts:418` — remove `'agent'` from `SettingsGroupId`
- Modify: `frontend/src/app/i18n/en-US/settings.ts` — remove `settingsAgent` key
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts` — remove `settingsAgent` key

- [ ] **Step 1: Delete feature directory**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\custom-agent"
```

- [ ] **Step 2: Remove from SettingsPanel.tsx**

Remove line 13:
```typescript
import { CustomAgentSettings } from '../../features/custom-agent/CustomAgentSettings';
```

Remove from `SETTINGS_COMPONENTS` (line 39):
```typescript
agent: CustomAgentSettings,
```

- [ ] **Step 3: Remove from SettingsNav.tsx**

Remove from `GROUPS` array (line 13):
```typescript
{ id: 'agent', labelKey: 'settingsAgent' },
```

- [ ] **Step 4: Remove from kernel/types.ts**

In `SettingsGroupId` (line 416-427), remove `'agent'`:
```typescript
export type SettingsGroupId =
  | 'general'
  | 'workspace'
  | 'shortcuts'
  | 'mcp'
  | 'commands'
  | 'permissions'
  | 'references'
  | 'providers'
  | 'lsp'
  | 'browser';
```

- [ ] **Step 5: Remove i18n keys**

In `frontend/src/app/i18n/en-US/settings.ts`, remove `settingsAgent` entry.
In `frontend/src/app/i18n/zh-CN/settings.ts`, remove `settingsAgent` entry.

- [ ] **Step 6: Verify no orphaned imports**

Run: `cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx tsc --noEmit 2>&1 | Select-String "custom-agent|CustomAgentSettings|settingsAgent"`

---

### Task 2: Remove MCP Settings

**Files:**
- Delete: `frontend/src/app/features/mcp/` (entire directory)
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:11,33` — remove import + mapping
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx:16` — remove mcp group
- Modify: `frontend/src/kernel/types.ts:421` — remove `'mcp'` from `SettingsGroupId`
- Modify: `frontend/src/app/i18n/en-US/settings.ts` — remove `settingsMcp` key
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts` — remove `settingsMcp` key

- [ ] **Step 1: Delete feature directory**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\mcp"
```

- [ ] **Step 2: Remove from SettingsPanel.tsx**

Remove line 11:
```typescript
import { McpSettings } from '../../features/mcp/McpSettings';
```

Remove from `SETTINGS_COMPONENTS` (line 33):
```typescript
mcp: McpSettings,
```

- [ ] **Step 3: Remove from SettingsNav.tsx**

Remove from `GROUPS` array (line 16):
```typescript
{ id: 'mcp', labelKey: 'settingsMcp' },
```

- [ ] **Step 4: Remove from kernel/types.ts**

Remove `'mcp'` from `SettingsGroupId`.

- [ ] **Step 5: Remove i18n keys**

Remove `settingsMcp` from both en-US and zh-CN settings i18n files.

- [ ] **Step 6: Verify no orphaned imports**

Run TypeScript check for `mcp/McpSettings` and `settingsMcp`.

---

### Task 3: Remove Model/Provider Settings

**Files:**
- Delete: `frontend/src/app/features/model-settings/` (entire directory)
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:16,37` — remove import + mapping
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx:17` — remove providers group
- Modify: `frontend/src/kernel/types.ts:425` — remove `'providers'` from `SettingsGroupId`
- Modify: `frontend/src/app/i18n/en-US/settings.ts` — remove `settingsModels` key
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts` — remove `settingsModels` key

- [ ] **Step 1: Delete feature directory**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\model-settings"
```

- [ ] **Step 2: Remove from SettingsPanel.tsx**

Remove line 16:
```typescript
import { ModelSettings } from '../../features/model-settings/ModelSettings';
```

Remove from `SETTINGS_COMPONENTS` (line 37):
```typescript
providers: ModelSettings,
```

- [ ] **Step 3: Remove from SettingsNav.tsx**

Remove from `GROUPS` array (line 17):
```typescript
{ id: 'providers', labelKey: 'settingsModels' },
```

- [ ] **Step 4: Remove from kernel/types.ts**

Remove `'providers'` from `SettingsGroupId`.

- [ ] **Step 5: Remove i18n keys**

Remove `settingsModels` from both en-US and zh-CN settings i18n files.

- [ ] **Step 6: Verify no orphaned imports**

Run TypeScript check.

---

### Task 4: Remove Custom Commands Settings

**Files:**
- Delete: `frontend/src/app/features/command-editor/` (entire directory)
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:12,34` — remove import + mapping
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx:18` — remove commands group
- Modify: `frontend/src/kernel/types.ts:422` — remove `'commands'` from `SettingsGroupId`
- Modify: `frontend/src/app/i18n/en-US/settings.ts` — remove `settingsCommands` key
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts` — remove `settingsCommands` key

- [ ] **Step 1: Delete feature directory**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\command-editor"
```

- [ ] **Step 2: Remove from SettingsPanel.tsx**

Remove line 12:
```typescript
import { CommandSettings } from '../../features/command-editor/CommandSettings';
```

Remove from `SETTINGS_COMPONENTS` (line 34):
```typescript
commands: CommandSettings,
```

- [ ] **Step 3: Remove from SettingsNav.tsx**

Remove from `GROUPS` array (line 18):
```typescript
{ id: 'commands', labelKey: 'settingsCommands' },
```

- [ ] **Step 4: Remove from kernel/types.ts**

Remove `'commands'` from `SettingsGroupId`.

- [ ] **Step 5: Remove i18n keys**

Remove `settingsCommands` from both en-US and zh-CN settings i18n files.

- [ ] **Step 6: Verify no orphaned imports**

Run TypeScript check.

---

### Task 5: Remove Permission Rules Settings

**Files:**
- Delete: `frontend/src/app/features/permission-settings/` (entire directory)
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:14,35` — remove import + mapping
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx:19` — remove permissions group
- Modify: `frontend/src/kernel/types.ts:423` — remove `'permissions'` from `SettingsGroupId`
- Modify: `frontend/src/app/i18n/en-US/settings.ts` — remove `settingsPermissions` key
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts` — remove `settingsPermissions` key

- [ ] **Step 1: Delete feature directory**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\permission-settings"
```

- [ ] **Step 2: Remove from SettingsPanel.tsx**

Remove line 14:
```typescript
import { PermissionSettings } from '../../features/permission-settings/PermissionSettings';
```

Remove from `SETTINGS_COMPONENTS` (line 35):
```typescript
permissions: PermissionSettings,
```

- [ ] **Step 3: Remove from SettingsNav.tsx**

Remove from `GROUPS` array (line 19):
```typescript
{ id: 'permissions', labelKey: 'settingsPermissions' },
```

- [ ] **Step 4: Remove from kernel/types.ts**

Remove `'permissions'` from `SettingsGroupId`.

- [ ] **Step 5: Remove i18n keys**

Remove `settingsPermissions` from both en-US and zh-CN settings i18n files.

- [ ] **Step 6: Verify no orphaned imports**

Run TypeScript check.

---

### Task 6: Remove Reference Manager Settings

**Files:**
- Delete: `frontend/src/app/features/reference-manager/` (entire directory)
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:15,36` — remove import + mapping
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx:20` — remove references group
- Modify: `frontend/src/kernel/types.ts:424` — remove `'references'` from `SettingsGroupId`
- Modify: `frontend/src/app/i18n/en-US/settings.ts` — remove `settingsReferences` key
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts` — remove `settingsReferences` key

- [ ] **Step 1: Delete feature directory**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\reference-manager"
```

- [ ] **Step 2: Remove from SettingsPanel.tsx**

Remove line 15:
```typescript
import { ReferenceSettings } from '../../features/reference-manager/ReferenceSettings';
```

Remove from `SETTINGS_COMPONENTS` (line 36):
```typescript
references: ReferenceSettings,
```

- [ ] **Step 3: Remove from SettingsNav.tsx**

Remove from `GROUPS` array (line 20):
```typescript
{ id: 'references', labelKey: 'settingsReferences' },
```

- [ ] **Step 4: Remove from kernel/types.ts**

Remove `'references'` from `SettingsGroupId`.

- [ ] **Step 5: Remove i18n keys**

Remove `settingsReferences` from both en-US and zh-CN settings i18n files.

- [ ] **Step 6: Verify no orphaned imports**

Run TypeScript check.

---

### Task 7: Remove LSP Settings

**Files:**
- Delete: `frontend/src/app/features/lsp-panel/` (entire directory)
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx:17,38` — remove import + mapping
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx:21` — remove lsp group
- Modify: `frontend/src/kernel/types.ts:426` — remove `'lsp'` from `SettingsGroupId`
- Modify: `frontend/src/app/i18n/en-US/settings.ts` — remove `settingsLsp` key
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts` — remove `settingsLsp` key

- [ ] **Step 1: Delete feature directory**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\lsp-panel"
```

- [ ] **Step 2: Remove from SettingsPanel.tsx**

Remove line 17:
```typescript
import { LspSettings } from '../../features/lsp-panel/LspSettings';
```

Remove from `SETTINGS_COMPONENTS` (line 38):
```typescript
lsp: LspSettings,
```

- [ ] **Step 3: Remove from SettingsNav.tsx**

Remove from `GROUPS` array (line 21):
```typescript
{ id: 'lsp', labelKey: 'settingsLsp' },
```

- [ ] **Step 4: Remove from kernel/types.ts**

Remove `'lsp'` from `SettingsGroupId`.

- [ ] **Step 5: Remove i18n keys**

Remove `settingsLsp` from both en-US and zh-CN settings i18n files.

- [ ] **Step 6: Verify no orphaned imports**

Run TypeScript check.

---

### Task 8: Remove Audit Panel (Frontend + Backend)

This is the largest task. Split into sub-steps.

**Frontend files:**
- Delete: `frontend/src/app/components/approval/` (entire directory)
- Delete: `frontend/src/app/regions/right-panel/hooks/useAuditPanelProps.ts`
- Modify: `frontend/src/app/regions/right-panel/ToolSwitcher.tsx:56-61` — remove audit tab from `TAB_META`
- Modify: `frontend/src/app/regions/RightPanel.tsx:17-19,33,45,82,97,113,146-150,193,252` — remove audit lazy import, type import, props hook, render block, prop passing
- Modify: `frontend/src/app/stores/types.ts:6` — remove `'audit'` from `ToolId`
- Modify: `frontend/src/app/stores/slices/diagnosticSlice.ts:6,14,19-20,31,34-38,44` — remove `AuditEntry` import, `auditEntries` state, `setAuditEntries`, `appendAuditEntries`, reset
- Modify: `frontend/src/app/stores/actions/fetchActions.ts:84-178` — remove `fetchAuditEntries` function
- Modify: `frontend/src/app/stores/selectors.ts:51-52` — remove `getAuditEntries`, `useAuditEntries`
- Modify: `frontend/src/app/stores/StoreState.ts:327` — remove `fetchAuditEntries` from `DataFetchActions`
- Modify: `frontend/src/app/stores/cacheHelpers.ts:231` — remove `get().fetchAuditEntries(40)` call
- Modify: `frontend/src/app/stores/actions/generalActions.ts:303` — remove `auditEntries: []` from reset
- Modify: `frontend/src/app/stores/slices/uiSlice.ts:89` — remove `audit: false` from defaults
- Modify: `frontend/src/app/stores/slices/terminalSlice.ts:74` — remove `audit: false` from defaults
- Modify: `frontend/src/app/stores/slices/uiSliceWidths.ts:47` — remove `'audit'` from valid tools
- Modify: `frontend/src/app/regions/right-panel/types.ts:3,122,232` — remove `AuditEntry` import, `auditEntries` from `RightPanelViewProps`, `AuditPanelProps`
- Modify: `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts:27,56` — remove `auditEntries` from store read and badges
- Modify: `frontend/src/shared/ipc/task.ts:83-87` — remove `listAuditEntries` method
- Modify: `frontend/src/httpBridge.ts:1312-1313` — remove `listAuditEntries` implementation
- Modify: `frontend/src/app/features/terminal/TerminalPanel.tsx:314-325` — remove "Go to approval" button block
- Modify: `frontend/src/styles/components/approval-card.css` — remove audit CSS classes (lines 80-147)
- Modify: `frontend/src/app/i18n/en-US/approval.ts:16-23` — remove audit keys
- Modify: `frontend/src/app/i18n/zh-CN/approval.ts:16-23` — remove audit keys
- Modify: `frontend/src/app/i18n/en-US/terminal.ts:34` — remove `terminalGoToApproval`
- Modify: `frontend/src/app/i18n/zh-CN/terminal.ts:34` — remove `terminalGoToApproval`

**Backend files:**
- Delete: `crates/server/src/handlers/audit.rs`
- Delete: `crates/server/tests/audit.rs`
- Delete: `crates/model-gateway/src/audit.rs`
- Modify: `crates/server/src/handlers/mod.rs:3` — remove `pub mod audit;`
- Modify: `crates/model-gateway/src/lib.rs:13,30` — remove `mod audit;` and `use audit::{AuditInput, audit_record};`
- Modify: `crates/server/src/router.rs:159,200-201` — remove audit routes
- Modify: `crates/server/src/handlers/command.rs:8,89-99,154-168` — remove `use save_audit_entry_with_db` and all audit calls
- Modify: `crates/server/src/handlers/patch.rs:19,115-125,185-211,297-307` — remove audit calls
- Modify: `crates/server/src/handlers/task.rs:18,147-157,258-272,305-307,377-387` — remove audit calls and `list_audit_entries` handler
- Modify: `crates/model-gateway/src/lib.rs:60,84-95,107,130-142,154,159-175,210` — change `chat()` and `chat_for_model()` to return `ModelResponse` only (remove audit record generation)

**Test files:**
- Modify: `frontend/src/app/regions/right-panel/ToolSwitcher.test.tsx` — remove audit tab assertions and mock badges
- Modify: `frontend/src/test-fixtures/mock-data.ts` — remove `mockAuditEntries`
- Modify: `frontend/src/app/stores/actions/generalActions.test.ts:253` — remove `listAuditEntries` mock

- [ ] **Step 1: Delete frontend audit directories**

```powershell
Remove-Item -Recurse -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\components\approval"
Remove-Item -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\regions\right-panel\hooks\useAuditPanelProps.ts"
```

- [ ] **Step 2: Delete backend audit files**

```powershell
Remove-Item -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\server\src\handlers\audit.rs"
Remove-Item -Force "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\model-gateway\src\audit.rs"
```

- [ ] **Step 3: Remove audit from ToolSwitcher.tsx**

Remove the audit entry from `TAB_META` (lines 56-61):
```typescript
  {
    id: 'audit',
    shortcut: 'Ctrl+Shift+A',
    icon: <IconShield size={16} decorative />,
    labelKey: 'toolAudit',
  },
```

Also remove `IconShield` from the import on line 9.

- [ ] **Step 4: Remove audit from RightPanel.tsx**

Remove lazy import (lines 17-19):
```typescript
const AuditPanel = lazy(() =>
  import('../components/approval/AuditPanel').then((m) => ({ default: m.AuditPanel })),
);
```

Remove `AuditPanelProps` from type import (line 33).

Remove `useAuditPanelProps` import (line 45).

Remove `auditProps` from `ActiveToolPanelProps` interface (line 82).

Remove `auditProps` from `areActiveToolPanelPropsEqual` (line 97).

Remove `auditProps` from `ActiveToolPanel` destructuring (line 113).

Remove audit render block (lines 146-150):
```tsx
      <div hidden={activeTool !== 'audit'} style={{ height: '100%', minHeight: 0 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <AuditPanel entries={auditProps.auditEntries} />
        </Suspense>
      </div>
```

Remove `auditProps` usage (line 193):
```typescript
const auditProps = useAuditPanelProps(panelProps);
```

Remove `auditProps` from `ActiveToolPanel` props (line 252).

- [ ] **Step 5: Remove audit from ToolId type**

In `frontend/src/app/stores/types.ts`, change `ToolId` to:
```typescript
export type ToolId =
  | 'files'
  | 'changes'
  | 'browser'
  | 'terminal'
  | 'settings'
  | 'communicate';
```

- [ ] **Step 6: Remove audit from diagnosticSlice.ts**

Remove `AuditEntry` import (line 6).

Remove `auditEntries` from `DiagnosticSlice` interface (line 14).

Remove `setAuditEntries` and `appendAuditEntries` from interface (lines 19-20).

Remove `auditEntries: []` from initial state (line 31).

Remove `setAuditEntries` and `appendAuditEntries` implementations (lines 34-38).

Remove `auditEntries: []` from `clearDiagnosticState` (line 44).

- [ ] **Step 7: Remove fetchAuditEntries from fetchActions.ts**

Remove the entire `fetchAuditEntries` function (lines 84-178).

- [ ] **Step 8: Remove audit selectors**

In `frontend/src/app/stores/selectors.ts`, remove (lines 51-52):
```typescript
  getAuditEntries: (state: StoreState) => state.auditEntries,
  useAuditEntries: () => useAppStore(useShallow((s) => s.auditEntries)),
```

- [ ] **Step 9: Remove fetchAuditEntries from StoreState.ts**

In `frontend/src/app/stores/StoreState.ts`, remove from `DataFetchActions` (line 327):
```typescript
  fetchAuditEntries: (limit?: number) => Promise<void>;
```

- [ ] **Step 10: Remove from cacheHelpers.ts**

In `frontend/src/app/stores/cacheHelpers.ts`, remove line 231:
```typescript
    get().fetchAuditEntries(40),
```

- [ ] **Step 11: Remove from generalActions.ts**

In `frontend/src/app/stores/actions/generalActions.ts`, remove `auditEntries: []` from the reset `set()` call (line 303).

- [ ] **Step 12: Remove audit from navigator defaults**

In `frontend/src/app/stores/slices/uiSlice.ts` (line 89), remove `audit: false`.
In `frontend/src/app/stores/slices/terminalSlice.ts` (line 74), remove `audit: false`.

- [ ] **Step 13: Remove audit from uiSliceWidths.ts**

In `frontend/src/app/stores/slices/uiSliceWidths.ts` (line 47), remove `raw === 'audit' ||`.

- [ ] **Step 14: Remove audit from right-panel types**

In `frontend/src/app/regions/right-panel/types.ts`:
- Remove `AuditEntry` from import (line 3)
- Remove `auditEntries: AuditEntry[];` from `RightPanelViewProps` (line 122)
- Remove `AuditPanelProps` type (line 232)

- [ ] **Step 15: Remove audit from useRightPanelViewProps.ts**

In `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts`:
- Remove `auditEntries` from store read (line 27)
- Remove `audit: auditEntries.length` from badges (line 56)
- Remove `auditEntries.length` from deps array (line 67)

- [ ] **Step 16: Remove listAuditEntries from IPC layer**

In `frontend/src/shared/ipc/task.ts`, remove lines 83-87 (the `listAuditEntries` method declaration).

In `frontend/src/httpBridge.ts`, remove the `listAuditEntries` implementation (lines 1312-1313 area).

In `frontend/src/mock/mock-task.ts`, remove the `listAuditEntries` method (line 23 area) and the `mockAuditEntries` import if it becomes orphaned.

In `frontend/src/app/stores/actions/generalActions.ts`, remove `task.listAuditEntries` from the JSDoc `@see` comments (lines 51-53).

- [ ] **Step 17: Remove "Go to approval" from TerminalPanel**

In `frontend/src/app/features/terminal/TerminalPanel.tsx`, remove lines 314-325 (the approval hint block with `setActiveRightTool('audit')`).

- [ ] **Step 18: Remove audit CSS**

In `frontend/src/styles/components/approval-card.css`, remove audit-related CSS classes (`.adl-audit-panel` and children, approximately lines 80-147).

- [ ] **Step 19: Remove audit i18n keys**

In `frontend/src/app/i18n/en-US/approval.ts`, remove lines 16-23 (audit keys: `auditTitle`, `auditFilterAll`, `auditFilterCommand`, `auditFilterFile`, `auditFilterPatch`, `auditFilterApproval`, `auditEmpty`, `toolAudit`).

In `frontend/src/app/i18n/zh-CN/approval.ts`, remove the same keys.

In `frontend/src/app/i18n/en-US/terminal.ts`, remove `terminalGoToApproval` (line 34).
In `frontend/src/app/i18n/zh-CN/terminal.ts`, remove `terminalGoToApproval` (line 34).

- [ ] **Step 20: Remove backend mod declarations**

In `crates/server/src/handlers/mod.rs`, remove line 3:
```rust
pub mod audit;
```

In `crates/model-gateway/src/lib.rs`, remove line 13:
```rust
mod audit;
```

And remove line 30:
```rust
use audit::{AuditInput, audit_record};
```

- [ ] **Step 21: Remove audit routes from router.rs**

In `crates/server/src/router.rs`:
- Remove line 159: `.route("/task/audit-entries", post(handlers::task::list_audit_entries))`
- Remove lines 200-201:
```rust
        // Audit domain (`audit_*` tauri helpers — read surface).
        .route("/audit/list", post(handlers::audit::list_audit_entries))
```

- [ ] **Step 22: Remove save_audit_entry_with_db calls from command.rs**

In `crates/server/src/handlers/command.rs`:
- Remove line 8: `use crate::handlers::audit::save_audit_entry_with_db;`
- Remove all `save_audit_entry_with_db(...)` calls and their surrounding `if let Err` blocks (lines 89-99 and 154-168)

- [ ] **Step 23: Remove save_audit_entry_with_db calls from patch.rs**

In `crates/server/src/handlers/patch.rs`:
- Remove line 19: `use crate::handlers::audit::save_audit_entry_with_db;`
- Remove all `save_audit_entry_with_db(...)` calls and their surrounding `if let Err` blocks (lines 115-125, 185-211, 297-307)

- [ ] **Step 24: Remove audit from task.rs**

In `crates/server/src/handlers/task.rs`:
- Remove line 18: `use crate::handlers::audit::save_audit_entry_with_db;`
- Remove `save_audit_entry_with_db(...)` calls (lines 147-157, 258-272, 377-387)
- Remove the `list_audit_entries` handler function (lines 305-307 area)

- [ ] **Step 25: Refactor model-gateway to remove audit record**

In `crates/model-gateway/src/lib.rs`:
- Change `chat()` return type from `(ModelResponse, ModelCallAuditRecord)` to `ModelResponse`
- Remove all `audit_record(AuditInput { ... })` calls
- Change `chat_for_model()` return type from `(ModelResponse, ModelCallAuditRecord)` to `ModelResponse`
- Remove audit record generation in both success and error paths
- Remove `ModelCallAuditRecord` from imports (line 27)
- Remove `AuditInput` usage (already removed with `use audit::...`)

- [ ] **Step 26: Update callers of model gateway chat methods**

Search for all callers of `gateway.chat()` and `gateway.chat_for_model()` that destructure the tuple return. Update them to receive `ModelResponse` only. Key callers:
- `crates/server/src/handlers/agent.rs` — `let (response, _audit) = gateway.chat(...)` → `let response = gateway.chat(...)`
- `crates/server/src/handlers/compaction.rs` — same pattern
- `crates/server/src/handlers/subagent.rs` — same pattern

- [ ] **Step 27: Update tests**

- `frontend/src/app/regions/right-panel/ToolSwitcher.test.tsx` — remove `'toolAudit'` from expected tabs, remove `audit: 0` from mock badges
- `frontend/src/test-fixtures/mock-data.ts` — remove `AuditEntry` import (line 1) and `mockAuditEntries` array (lines 19-43). If `TaskCenterSnapshot` is the only remaining import, update import to `import type { TaskCenterSnapshot } from "@ai-digital-life/kernel";`
- `frontend/src/app/stores/actions/generalActions.test.ts` — remove `listAuditEntries: vi.fn()...` mock (line 253)
- `frontend/src/mock/mock-task.ts` — remove `listAuditEntries` method and `mockAuditEntries` import
- `frontend/src/tauri-bridge/__tests__/bridge.test.ts:171` — rename describe block from `'createTauriBridge system-capability domains stay on Tauri (audit)'` to `'createTauriBridge system-capability domains stay on Tauri'` (the test itself is about app domain, not audit)
- `frontend/src/preview-bridge/preview-bridge-index.test.ts:144` — rename test from `'reserved domain stays on the preview/mock impl, not the httpBridge NOT_SUPPORTED stubs (audit)'` to `'reserved domain stays on the preview/mock impl, not the httpBridge NOT_SUPPORTED stubs'` (the test is about acp config, not audit)

- [ ] **Step 28: Remove kernel types (AuditEntry, AuditRecord, ModelCallAuditRecord)**

In `frontend/src/kernel/types.ts`:
- Remove `import type { RiskLevel } from './types-task';` (line 2) — ONLY if no other type in this file uses `RiskLevel`. Since `AuditEntry` is the only consumer in this file, and it's being removed, the import can be removed.
- Remove `AuditEntry` interface (lines 400-414)

In `frontend/src/kernel/types-task.ts`:
- Remove `AuditRecord` interface (lines 83-90)
- Keep `RiskLevel` type (line 17) — it's used by `types-command.ts`, `types-conversation.ts`, and other types in this file

In `frontend/src/kernel/types-agent.ts`:
- Remove `ModelCallAuditRecord` interface (lines 114-131)

**Note on Rust-side types:** The Rust struct definitions (`ModelCallAuditRecord` in `crates/types/src/types/model.rs`, `AuditRecord` in `crates/types/src/types/conversation.rs`, `AuditEntry` in `crates/types`) are intentionally **retained**. They are used by other Rust subsystems (task crate, storage layer) and removing them would require database migrations and broader refactoring beyond this scope. The `EntityTable::AuditRecords` variant in storage is also retained — the table simply stops receiving new writes.

- [ ] **Step 29: Verify compilation**

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace 2>&1 | Select-String "error"
```

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
npx tsc --noEmit 2>&1 | Select-String "error"
```

---

## Batch 2: Global Cleanup

After all 8 parallel tasks complete.

### Task 9: Final SettingsGroupId Cleanup

After all 7 settings modules removed, verify `SettingsGroupId` is精简为:

```typescript
export type SettingsGroupId =
  | 'general'
  | 'workspace'
  | 'shortcuts'
  | 'browser';
```

And `SETTINGS_COMPONENTS` in `SettingsPanel.tsx` only has:
```typescript
const SETTINGS_COMPONENTS: Partial<Record<SettingsGroupId, React.ComponentType>> = {
  shortcuts: KeybindSettings,
  workspace: WorkspaceSettings,
  browser: BrowserSettings,
};
```

And `GROUPS` in `SettingsNav.tsx` only has 4 entries.

- [ ] **Step 1: Verify SettingsGroupId is correct**
- [ ] **Step 2: Verify SETTINGS_COMPONENTS has only 3 entries** (general uses SettingsControls, not in map)
- [ ] **Step 3: Verify GROUPS has only 4 entries**

### Task 10: Final Verification

- [ ] **Step 1: Rust compilation**

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace
```

- [ ] **Step 2: TypeScript compilation**

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
npx tsc --noEmit
```

- [ ] **Step 3: Rust clippy**

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings
```

- [ ] **Step 4: Frontend lint**

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run lint
```

- [ ] **Step 5: Rust tests**

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace
```

- [ ] **Step 6: Frontend tests**

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run test
```

- [ ] **Step 7: Commit**

```bash
cd E:\AI-DIGITAL-LIFE\SourceWorkspace
git add -A
git commit -m "refactor(strip): remove settings modules and audit panel for dsh integration

Remove 7 settings modules (agent, mcp, models, commands, permissions,
references, lsp) and the entire audit panel from frontend and backend.
Settings panel retains general, workspace, shortcuts, browser groups.
Right panel tabs reduced from 7 to 5 (files, changes, browser, terminal,
settings, communicate). Backend audit handlers, routes, and model gateway
audit record generation removed."
```
