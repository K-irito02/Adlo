# Phase 2 WebView Shell Redesign (17-Region Layout)

> **历史归档（Electron 时代）**：本文件记录 Electron 实现下的 17 区布局演进。项目已迁移到 Rust + Tauri；下方的「Renderer」「IPC」「`window.digitalLife`」「Electron」等术语在新栈中分别对应 **WebView 前端**、**Tauri Command**、**`@tauri-apps/api` 的 `invoke`** 和 **Tauri**。关于 Tauri 桥接形态请以 [system-overview.md](./system-overview.md) 为准。

> **路径对照（仅作阅读本归档时）**：正文中的 `apps/desktop/renderer/` 已对应为仓库内 **`frontend/src/`**；`apps/desktop/shared/ipc.ts` 对应 **`frontend/src/shared/ipc.ts`**；`packages/kernel` 的前端类型已收拢为 **`frontend/src/kernel`**（`@ai-digital-life/kernel`）。

This note records the original 17-region shell refactor and the follow-up sidebar navigation foundation that now backs the left sidebar with
persisted workspace/session navigation metadata. The current left sidebar splits into a durable project-bound workspace bucket and a
renderer-local standalone conversation bucket. This note also captures the later center-pane composer consolidation and the softer panel
collapse/expand motion now used by the shell.

The initial shell composition was Renderer-first, but the current implementation is **not Renderer-only anymore**: sidebar pinning, ordering,
read / unread state, archive operations, rename, reveal-in-file-manager, and delete now flow through the documented IPC bridge into package
services and SQLite-backed storage. Privilege boundaries defined in [`ai-digital-life/AGENTS.md`](../../AGENTS.md) remain unchanged: Renderer
still goes through `window.digitalLife`, and no direct Node / SQLite access was added to Renderer.

## Scope

### In scope

- Break the monolithic `App.tsx` into region components under `apps/desktop/renderer/src/app/regions/`.
- Add renderer-only UI state (panel collapse, active tool, composer mode, context chips, draft text) in a new Zustand store
  `apps/desktop/renderer/src/app/ui-store.ts`, persisted to `localStorage`.
- Add `apps/desktop/renderer/src/app/icons.tsx` as the single SVG icon surface (Lucide-style, `currentColor`, token-driven sizes).
- Extend i18n strings in `apps/desktop/renderer/src/app/copy.ts` with the new region labels (zh-CN / en-US).
- Add `apps/desktop/renderer/src/styles/regions.css` for region-scoped layout rules; all tokens come from `tokens.css` / `themes.css`.
- Add `apps/desktop/renderer/src/app/sidebarViewModel.ts` to map persisted workspace / session records into sidebar presentation state
  (grouping, rollup status, archived buckets, hover-state display decisions).
- Extend sidebar behavior through `apps/desktop/shared/ipc.ts`, `apps/desktop/preload/index.ts`, `apps/desktop/main/index.ts`,
  `packages/workspace`, `packages/conversation`, `packages/storage`, and `packages/kernel` so workspace/session actions are durable.

### Explicitly out of scope (kept for later phases / follow-ups)

- Visual theming changes beyond composition (no token or theme edits).
- New privileged surfaces outside the existing desktop bridge boundary (no Renderer direct file system, shell, or database access).
- Phase 2+ features such as multi-agent DAG, MCP runtime, plugin market, or cloud collaboration surfaces.

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
| 13 | Inline status strip under the composer (git, diagnostics, model health) | `regions/CenterPane.tsx` |
| 14 | Tool switcher (Files / Changes / Browser / Terminal) | `regions/RightPanel.tsx` + `regions/right-panel/ToolSwitcher.tsx` |
| 15 | Tool context + files tool shell | `regions/RightPanel.tsx` + `regions/right-panel/FilesPanel.tsx` |
| 16 | Changes tool shell (summary / git navigator / patch preview) | `regions/RightPanel.tsx` + `regions/right-panel/ChangesPanel.tsx` |
| 17 | Browser + terminal shells | `regions/RightPanel.tsx` + `regions/right-panel/BrowserPanel.tsx` / `TerminalPanel.tsx` |

## Sidebar Foundation Delta

The left sidebar is now a cross-layer feature, not just a view refactor.

- `packages/kernel` defines navigation metadata such as workspace/session pin state, per-bucket ordering, read tracking, archive timestamps,
  and sidebar visibility.
- `packages/storage` persists those fields in SQLite and returns records pre-sorted by pinned / unpinned buckets.
- `packages/workspace` and `packages/conversation` expose sidebar actions used by Renderer:
  `pin/unpin`, `reorder`, `rename`, `mark read/unread`, `archive`, `delete`, `removeFromSidebar`, `restoreToSidebar`,
  `revealInFileManager`.
- `apps/desktop/shared/ipc.ts` / `preload` / `main` expose the corresponding allowlisted bridge methods.
- `apps/desktop/renderer/src/app/sidebarViewModel.ts` is the presentation boundary for region 6. `regions/LeftSidebar.tsx` consumes that
  view-model instead of recomputing storage semantics inline.
- The current sidebar UI renders two separate buckets: project-bound sessions that follow the durable IPC/storage path, and a standalone
  conversation bucket that is renderer-local for now. The standalone bucket keeps its own visible-row cap, expand/collapse affordance,
  local reorder behavior, and resize-adjustable section height, but it does not write back to SQLite yet.

## State Ownership

| Concern | Store |
| ------- | ----- |
| Workspace, sessions, runs, patches, provider health, task center, search, retrieval | `app/store.ts` (`useAppStore`) — unchanged truth source over IPC |
| Renderer-only shell state: `leftCollapsed`, `rightCollapsed`, `activeTool`, expanded workspace sections, chat mode, menus, context chips | `app/ui-store.ts` (`useUiStore`) |

The UI store is deliberately renderer-local: it never makes IPC calls and never holds security-relevant preferences. Preferences that affect
Main (language, theme, provider priority) continue to flow through `window.digitalLife.app.updatePreferences`.

## Center Pane Interaction Update

The initial 17-region split treated the composer and status bar as separate visual bands. The current implementation intentionally consolidates
them into a bottom-centered interaction group:

- the composer is laid out as the bottom row of the `CenterPane` grid (not an absolutely-positioned overlay)
- the status information now renders as a lightweight inline strip directly under the composer instead of a full-width app footer
- the empty stream no longer renders placeholder guidance cards above the composer by default
- the composer input uses a renderer-controlled editable surface plus a custom visible caret so the insertion marker remains visually
  consistent across the Electron/Chromium runtime

This is a presentation-only refinement. It does not introduce new IPC surfaces or change message-send / cancel / retry behavior.

Empty-state layout note (post-migration hardening):

- the message area (`.adl-center__body`) is pinned to the `1fr` grid row so it stays stable whether approvals are present or not
- welcome/empty-state content is centered within the message area without using oversized "safety" padding meant for the composer

## Panel Motion Rule

Left and right panel collapse behavior should avoid the appearance of content being compressed in place. The implemented rule is:

- shell columns own width transitions
- panel content keeps its natural width inside an overflow-hidden shell
- collapsing panels fade and translate their content slightly before the column fully closes
- expanding panels reverse that motion so content appears to settle into place rather than stretch

This keeps the shell visually stable while preserving the existing `leftCollapsed` / `rightCollapsed` state model in `useUiStore`.

## Right Panel Rendering Rule

`RightPanel` renders **all four tool panes** concurrently and toggles visibility via the `hidden` HTML attribute plus `aria-hidden`. This keeps
`textContent`-based integration assertions working (e.g. `renderer-shell.test.ts` searches the document for patch preview strings) while still
presenting a single active tool to users.

The current right panel is no longer a single nested sidebar layout. It is a four-layer shell:

- top row horizontal tool switcher with badges
- second row tool-specific context bar
- body row with fixed rail, collapsible navigator, and primary workspace view
- left-edge resize handle with renderer-local width persistence

The shared `adl-iconstrip` shell pattern in `regions.css` now spans both the right-panel tool switcher and the desktop titlebar controls.
That pattern captures this product's compact command language for future shell surfaces: edge-bonded neutral backgrounds, no accent active fill,
label-button and window-control variants, conditional center separators only when adjacent highlighted states visually merge, and inset neutral badges.

Renderer-local state for panel width, navigator collapse, file-tree expansion, browser shell tabs/history/bookmarks, and terminal shell tabs/layout
now lives in `app/ui-store.ts`.

## Workspace Tree Surface

Files region navigation now consumes a typed workspace tree bridge instead of deriving explorer state from open tabs or search results:

- `packages/kernel` defines `WorkspaceTreeNode`
- `apps/desktop/shared/ipc.ts` exposes `workspace.listTree()`
- Main delegates to `WorkspaceFsService.listTree()`, which builds a directory-first nested tree from the allowlisted workspace root

This keeps Renderer within the existing file-access boundary while enabling a real explorer navigator in region 15.

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

- Workspace tab set (multiple simultaneous file editors).
- Per-workspace panel widths.
- Durable standalone conversation namespace and its sidebar actions.

Each of these would require the same pattern used by the sidebar foundation: bridge updates in `apps/desktop/shared/ipc.ts`, storage support
under `packages/storage`, and matching tests.
