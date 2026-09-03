# Design: Strip Settings & Audit Panel

## Context

Branch `refactor/strip-20260903` — preparing the project to become a dsh (DeepSeek Harness) plugin. dsh's core philosophy is "everything is a plugin." This refactor removes settings UI, backend systems, and audit functionality that dsh will handle natively, stripping the project down to its essential shell.

## Scope

Remove **8 modules** entirely (frontend UI + backend handlers + IPC bridge + tests + i18n + CSS + kernel types):

1. **Agent Settings** — custom agent configuration UI and backend
2. **MCP Settings** — MCP server management UI and client system
3. **Model/Provider Settings** — model selection, provider cards, model gateway audit
4. **Custom Commands** — command editor and execution system
5. **Permission Rules** — permission ruleset management
6. **Reference Manager** — reference materials management
7. **LSP Settings** — Language Server Protocol symbols/diagnostics panel
8. **Audit Panel** — entire audit timeline, approval cards, audit backend

## What Stays

| Component | Reason |
|-----------|--------|
| `general` settings | Language, theme, log level — fundamental app config |
| `workspace` settings | Workspace load order, concurrent limits |
| `shortcuts` settings | Keyboard shortcut configuration |
| `browser` settings | Browser panel performance/download config |
| Other right-panel tabs | files, changes, browser, terminal, communicate — not in scope |

## Architecture

### Right Panel After Strip

```
ToolSwitcher (5 tabs):
  files | changes | browser | terminal | communicate
  (was: files | changes | browser | terminal | audit | settings | communicate)

SettingsPanel (4 groups):
  general | workspace | shortcuts | browser
  (was: general | agent | workspace | shortcuts | mcp | providers | commands | permissions | references | lsp | browser)
```

### Removal Strategy

**Parallel sub-agents (Batch 1):** 8 independent modules removed concurrently. Each agent handles one module: delete feature directory, remove SettingsNav entry, remove SETTINGS_COMPONENTS mapping, remove Kernel type, remove i18n keys, remove Rust backend files.

**Global cleanup (Batch 2):** After all modules removed, a single pass cleans up:
- `SettingsGroupId` type →精简为 `general | workspace | shortcuts | browser`
- `ToolId` type → 移除 `'audit'` and `'ci'`
- Store state/actions/selectors referencing removed modules
- IPC bridge methods for removed backends
- Test fixtures and mock data
- CSS styles for audit/approval
- Cross-references (e.g., TerminalPanel "Go to approval" button)

## Detailed Removal Plan

### Module 1: Agent Settings

**Delete:**
- `frontend/src/app/features/custom-agent/` (entire directory)

**Edit:**
- `SettingsPanel.tsx` — remove `agent: CustomAgentSettings` from `SETTINGS_COMPONENTS`
- `SettingsNav.tsx` — remove agent navigation group
- `kernel/types.ts` — remove `'agent'` from `SettingsGroupId`
- i18n files — remove `settingsAgent` keys

### Module 2: MCP Settings

**Delete:**
- `frontend/src/app/features/mcp/` (entire directory)

**Edit:**
- `SettingsPanel.tsx` — remove `mcp: McpSettings` from `SETTINGS_COMPONENTS`
- `SettingsNav.tsx` — remove mcp navigation group
- `kernel/types.ts` — remove `'mcp'` from `SettingsGroupId`
- i18n files — remove `settingsMcp` keys

### Module 3: Model/Provider Settings

**Delete:**
- `frontend/src/app/features/model-settings/` (entire directory)

**Edit:**
- `SettingsPanel.tsx` — remove `providers: ModelSettings` from `SETTINGS_COMPONENTS`
- `SettingsNav.tsx` — remove providers navigation group
- `kernel/types.ts` — remove `'providers'` from `SettingsGroupId`
- i18n files — remove `settingsModels` keys

### Module 4: Custom Commands

**Delete:**
- `frontend/src/app/features/command-editor/` (entire directory)

**Edit:**
- `SettingsPanel.tsx` — remove `commands: CommandSettings` from `SETTINGS_COMPONENTS`
- `SettingsNav.tsx` — remove commands navigation group
- `kernel/types.ts` — remove `'commands'` from `SettingsGroupId`
- i18n files — remove `settingsCommands` keys

### Module 5: Permission Rules

**Delete:**
- `frontend/src/app/features/permission-settings/` (entire directory)

**Edit:**
- `SettingsPanel.tsx` — remove `permissions: PermissionSettings` from `SETTINGS_COMPONENTS`
- `SettingsNav.tsx` — remove permissions navigation group
- `kernel/types.ts` — remove `'permissions'` from `SettingsGroupId`
- i18n files — remove `settingsPermissions` keys

### Module 6: Reference Manager

**Delete:**
- `frontend/src/app/features/reference-manager/` (entire directory)

**Edit:**
- `SettingsPanel.tsx` — remove `references: ReferenceSettings` from `SETTINGS_COMPONENTS`
- `SettingsNav.tsx` — remove references navigation group
- `kernel/types.ts` — remove `'references'` from `SettingsGroupId`
- i18n files — remove `settingsReferences` keys

### Module 7: LSP Settings

**Delete:**
- `frontend/src/app/features/lsp-panel/` (entire directory)

**Edit:**
- `SettingsPanel.tsx` — remove `lsp: LspSettings` from `SETTINGS_COMPONENTS`
- `SettingsNav.tsx` — remove lsp navigation group
- `kernel/types.ts` — remove `'lsp'` from `SettingsGroupId`
- i18n files — remove `settingsLsp` keys

### Module 8: Audit Panel

**Delete:**
- `frontend/src/app/components/approval/` (entire directory — AuditPanel, ApprovalCard)
- `frontend/src/app/regions/right-panel/hooks/useAuditPanelProps.ts`
- `crates/server/src/handlers/audit.rs`
- `crates/server/tests/audit.rs`
- `crates/model-gateway/src/audit.rs`

**Edit:**
- `ToolSwitcher.tsx` — remove audit from `TAB_META`
- `RightPanel.tsx` — remove AuditPanel lazy import, render block, and props wiring
- `stores/types.ts` — remove `'audit'` from `ToolId`
- `stores/slices/diagnosticSlice.ts` — remove `auditEntries` state, `setAuditEntries`, `appendAuditEntries`
- `stores/actions/fetchActions.ts` — remove `fetchAuditEntries`
- `stores/actions/generalActions.ts` — remove `auditEntries` from reset
- `stores/selectors.ts` — remove `getAuditEntries`, `useAuditEntries`
- `stores/StoreState.ts` — remove `fetchAuditEntries` from `DataFetchActions`
- `stores/cacheHelpers.ts` — remove `fetchAuditEntries` call from `postMutationRefresh`
- `stores/slices/uiSliceWidths.ts` — remove `'audit'` as valid tool
- `shared/ipc/task.ts` — remove `listAuditEntries` method
- `styles/components/approval-card.css` — remove audit CSS classes
- i18n `approval.ts` — remove audit keys
- `TerminalPanel.tsx` — remove "Go to approval" button
- `ToolSwitcher.test.tsx` — remove audit tab assertions and mock badges
- `test-fixtures/mock-data.ts` — remove `mockAuditEntries`
- Bridge tests — remove audit assertions

### Batch 2: Global Cleanup

**Kernel types:**
- `kernel/types.ts` — `SettingsGroupId` → `general | workspace | shortcuts | browser`
- `kernel/types.ts` — remove `AuditEntry` interface
- `kernel/types-task.ts` — remove `AuditRecord`, `RiskLevel`
- `kernel/types-agent.ts` — remove `ModelCallAuditRecord`

**Store:**
- `stores/types.ts` — `ToolId` → remove `'audit'` and `'ci'`
- `stores/slices/uiSlice.ts` — remove `audit` from navigator collapsed defaults
- `stores/slices/terminalSlice.ts` — remove `audit` from navigator collapsed defaults

**Rust:**
- Update any `Cargo.toml` that references removed audit modules
- Update any Rust `mod.rs` or `lib.rs` that declares audit modules

## Verification

After all removals:
1. `cargo check --workspace` — Rust compilation passes
2. `pnpm --dir frontend run typecheck` — TypeScript types valid
3. `cargo test --workspace` — Rust tests pass
4. `pnpm --dir frontend run test` — Frontend tests pass
5. `cargo clippy --workspace --all-targets -- -D warnings` — no warnings
6. `pnpm --dir frontend run lint` — no lint errors

## Risks

| Risk | Mitigation |
|------|-----------|
| Cross-module type dependencies | Batch 2 global cleanup resolves all dangling references |
| i18n key removal breaks rendering | Each module removes its own keys; unused keys are benign |
| Rust mod declarations | Scan `mod.rs`/`lib.rs` for `pub mod audit` after removal |
| Test failures from removed mocks | Update test fixtures in Batch 2 |
