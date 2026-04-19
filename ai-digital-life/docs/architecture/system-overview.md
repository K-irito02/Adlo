# Phase 0 And Phase 2 Thin Slice Overview

## Purpose

This codebase now contains two layers of runnable scope:

- Phase 0 foundation
- Phase 2 single-agent thin slice

The implemented surface currently covers:

- secure Electron shell
- controlled IPC
- recent workspace restore
- SQLite state persistence with legacy file migration
- retrieval worker indexing and status reporting
- runtime language and theme preferences
- task / approval shell entry surfaces in the renderer
- persisted workspace, session, task, approval, and audit metadata
- lightweight Git snapshot capture for workspace safety visibility
- startup recovery markers and migration diagnostics
- shared event-bus emission across workspace, retrieval, task, and approval flows
- React + Zustand workspace shell for the Phase 2 working view
- conversation sessions and persisted conversation messages
- single-agent sequential planning state with stored run and step metadata
- patch-set, file-patch, and hunk persistence in SQLite
- structured workspace `readFile/search/outline` IPC surfaces
- patch-first preview, explicit hunk decision, apply, and rollback flows
- apply-after-validate loop with structured validation results and automatic rollback on failure
- dual-provider routing for `DeepSeek -> MiniMax` with synthetic fallback only after both providers fail
- persisted non-sensitive model provider preferences, including enable switch, priority, and default model id
- real provider health snapshots exposed to the desktop shell
- automatic repair preview generation after validation failure
- chokidar-driven workspace file change notifications
- Playwright-based acceptance coverage for the workspace shell
- governed `command:runStream` / `command:stopStream` with `digitalLife:terminalStream` versioned events (Main-only execution; Renderer subscribes like model stream)
- optional SHA256 pre-check on `WorkspaceFsService.atomicWrite` for baseline-sensitive writes

## Runtime Path

1. `Main` resolves the user data directory, records the runtime lifecycle marker, and initializes config, logging, and persisted state.
2. `Main` evaluates version changes, prepares upgrade backups when needed, and records migration diagnostics.
3. `Main` starts a worker thread used for workspace retrieval scans and worker health visibility.
4. `Main` creates a locked-down `BrowserWindow`.
5. `Preload` exposes the `window.digitalLife` bridge and hides raw Electron primitives.
6. `Renderer` now has two visible shells:
  - the existing Phase 0 home shell
  - the new Phase 2 workspace shell implemented with `React + Zustand`
7. `Renderer` can open a workspace, create/list/get conversation sessions, send a structured single-agent request, inspect file content, inspect outline/search results, and review a patch preview.
8. `Main` routes the single-agent request through prompt assembly, context selection, configurable `DeepSeek -> MiniMax` provider routing, patch-set persistence, and explicit patch application.
9. Patch application creates a checkpoint payload bundle before files are written, runs validation, rolls back on failure, and can generate a repair preview for a second pass.
10. When model preferences change, `Main` persists the new non-sensitive settings, rebuilds `ModelGateway` and `AgentRuntimeService`, and refreshes the provider health snapshot without expanding Renderer privilege.
11. File changes are observed through `chokidar`, and the renderer receives structured conflict notifications instead of polling raw filesystem state.

## Validation Status

The repository now includes:

- unit coverage for the Phase 0 infrastructure packages
- an integration renderer-shell test that exercises the Phase 2 workspace shell and patch preview flow
- a Playwright acceptance test covering the main workspace patch flow
- passing `test`, `typecheck`, and `build` commands in the current environment

## Security Baseline

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- no raw `ipcRenderer` exposure
- no direct filesystem or process access from `Renderer`

## Persistence

This slice stores persisted state in `state/app-state.db`:

- schema version
- current workspace path
- recent workspaces
- last window bounds
- retrieval state summary
- sessions, tasks, approvals, audit records, and checkpoints
- conversation sessions and conversation messages
- agent runs, steps, and tool invocation metadata
- patch sets, file patches, and hunk decisions
- command execution and validation result placeholders for later tranches
- model provider preferences and provider routing metadata

If a legacy `app-state.v1.json` file exists, it is migrated into SQLite on first startup.

Separate runtime lifecycle markers are stored under `state/runtime-status.json` so the next launch can detect unclean shutdowns and surface recovery diagnostics.

UI preferences are stored separately in `config/config.json` and currently include:

- language
- theme mode
- log level
- max recent workspace count
- model provider enable switch
- model provider priority
- model provider default model id