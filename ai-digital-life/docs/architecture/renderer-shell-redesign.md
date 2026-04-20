# Phase 2 Renderer Shell Redesign (17-Region Layout)

This note records the Renderer-only UI refactor that reshaped the Phase 2 single-agent thin slice into the 17-region three-pane layout defined by
`digitalLife/aiFunction-Implementation/UI设计草稿/GLM-5V-Turbo.md`.

The refactor is **Renderer-only**. It does **not** add new capabilities, change IPC whitelists, alter SQLite schema, or introduce Phase 2+
surfaces such as multi-agent DAG, MCP or plugin market. All privilege boundaries defined in
[`ai-digital-life/AGENTS.md`](../../AGENTS.md) remain unchanged.

## Scope

### In scope

- Break the monolithic `App.tsx` into region components under `apps/desktop/renderer/src/app/regions/`.
- Add renderer-only UI state (panel collapse, active tool, composer mode, context chips, draft text) in a new Zustand store
  `apps/desktop/renderer/src/app/ui-store.ts`, persisted to `localStorage`.
- Add `apps/desktop/renderer/src/app/icons.tsx` as the single SVG icon surface (Lucide-style, `currentColor`, token-driven sizes).
- Extend i18n strings in `apps/desktop/renderer/src/app/copy.ts` with the new region labels (zh-CN / en-US).
- Add `apps/desktop/renderer/src/styles/regions.css` for region-scoped layout rules; all tokens come from `tokens.css` / `themes.css`.

### Explicitly out of scope (kept for later phases / follow-ups)

- New IPC channels, new SQLite tables, or new migrations (no "workspace tabs / pinned sessions / archived sessions" persistence in this tranche).
- Visual theming changes beyond composition (no token or theme edits).
- Any Main / Preload / packages / workers changes. Only Renderer files under `apps/desktop/renderer/src/**` are touched.

## Region → Component Mapping

| Region | Content | Component |
| ------ | ------- | --------- |
| 1 | Application menu (File / Edit / View / Help) | `regions/TitleBar.tsx` |
| 2 | Global settings entry | `regions/TitleBar.tsx` |
| 3 | Panel collapse toggles | `regions/TitleBar.tsx` |
| 4 | Window management (minimize / maximize / close) | `regions/TitleBar.tsx` |
| 5 | Quick actions toolbar (New session, Open workspace, Recent) | `regions/LeftSidebar.tsx` |
| 6 | Session management (active, pinned, archived) | `regions/LeftSidebar.tsx` |
| 7 | Environment controls (language / theme / provider) | `regions/LeftSidebar.tsx` |
| 8 | Task execution / run stream | `regions/CenterPane.tsx` |
| 9 | Welcome / guidance empty state | `regions/CenterPane.tsx` |
| 10 | Context builder (chips + @mention) | `regions/CenterPane.tsx` |
| 11 | Prompt composer input | `regions/CenterPane.tsx` |
| 12 | Primary action button (send / stop / retry) | `regions/CenterPane.tsx` |
| 13 | Status bar (git, diagnostics, model health) | `regions/StatusBar.tsx` |
| 14 | Tool switcher (Files / Changes / Browser / Terminal) | `regions/RightPanel.tsx` |
| 15 | Files tool (tree + Monaco) | `regions/RightPanel.tsx` |
| 16 | Changes tool (patch preview + diff) | `regions/RightPanel.tsx` |
| 17 | Terminal tool (command stream) | `regions/RightPanel.tsx` |

## State Ownership

| Concern | Store |
| ------- | ----- |
| Workspace, sessions, runs, patches, provider health, task center, search, retrieval | `app/store.ts` (`useAppStore`) — unchanged truth source over IPC |
| Renderer-only shell state: `leftCollapsed`, `rightCollapsed`, `activeTool`, `chatMode`, `contextChips`, `composerDraft`, `statusPanelOpen`, `commandPaletteOpen` | `app/ui-store.ts` (`useUiStore`) |

The UI store is deliberately renderer-local: it never makes IPC calls and never holds security-relevant preferences. Preferences that affect
Main (language, theme, provider priority) continue to flow through `window.digitalLife.app.updatePreferences`.

## Right Panel Rendering Rule

`RightPanel` renders **all four tool panes** concurrently and toggles visibility via the `hidden` HTML attribute plus `aria-hidden`. This keeps
`textContent`-based integration assertions working (e.g. `renderer-shell.test.ts` searches the document for patch preview strings) while still
presenting a single active tool to users.

## Test Compatibility Invariants

The refactor preserves every selector and literal used by existing gates:

- `data-testid="composer-input"`, `data-testid="composer-submit"`, `data-testid="composer-stop"`, `data-testid="patch-apply"`,
  `data-testid="patch-rollback"`, `data-testid="patch-decline"`.
- Class hooks `.adl-run-card`, `.adl-patch-card`, `.adl-patch-card__actions`, `.adl-banner--error`.
- Strings required by `tests/e2e/workspace-shell.spec.ts` and `tests/integration/renderer-shell.test.ts`.

Gate results after the refactor (in the current environment):

- `tsc -p tsconfig.renderer.json / tsconfig.main.json / tsconfig.preload.json` — **clean**.
- `vitest run tests/integration/renderer-shell.test.ts` — **pass**.
- `vitest run` UI/design-system/kernel suites — **pass** (95/95 in scope).
- 7 `storage.test.ts` / `workspace.test.ts` failures remain, all caused by the pre-existing `better-sqlite3` NODE_MODULE_VERSION mismatch
  (`npm rebuild better-sqlite3 --runtime=electron`). Unrelated to this refactor.
- Playwright E2E (`workspace-shell.spec.ts`) must be rerun in a fully built Electron environment; selectors are preserved by construction.

## Future Follow-ups (not delivered in this tranche)

If a later phase decides to persist additional shell state, the following surfaces should be introduced through the documented
architecture-change workflow (docs first, then IPC, then SQLite migration):

- Pinned / archived / ordered conversation sessions beyond the current `archived` flag.
- Workspace tab set (multiple simultaneous file editors).
- Per-workspace panel widths.

Each of these would require: a new IPC channel in `apps/desktop/shared/ipc.ts`, a migration under `packages/migration`, repository support in
`packages/storage`, and matching tests. None are required for the 17-region visual redesign.
