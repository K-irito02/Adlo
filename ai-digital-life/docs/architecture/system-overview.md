# Phase 0 Thin Slice Overview

## Purpose

This codebase implements the first runnable Phase 0 thin slice described in the planning repository:

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

## Runtime Path

1. `Main` resolves the user data directory, records the runtime lifecycle marker, and initializes config, logging, and persisted state.
2. `Main` evaluates version changes, prepares upgrade backups when needed, and records migration diagnostics.
3. `Main` starts a worker thread used for workspace retrieval scans and worker health visibility.
4. `Main` creates a locked-down `BrowserWindow`.
5. `Preload` exposes the `window.digitalLife` bridge and hides raw Electron primitives.
6. `Renderer` reads bootstrap data, shows recent workspaces, retrieval status, health, logs, and runtime diagnostics, and can request `workspace.open(path)`.
7. `Renderer` can update language and theme preferences through a typed IPC patch instead of direct file writes.
8. The workspace service validates the path, detects the project root, updates recent entries, persists state to SQLite, and triggers retrieval indexing.

## Validation Status

The repository now includes:

- unit coverage for the Phase 0 infrastructure packages
- an integration renderer-shell test that exercises diagnostics, approval, checkpoint preview, and restore flows
- passing `test`, `typecheck`, and `build` commands in the current environment

## Security Baseline

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- no raw `ipcRenderer` exposure
- no direct filesystem or process access from `Renderer`

## Persistence

This slice stores lightweight state in `state/app-state.db`:

- schema version
- current workspace path
- recent workspaces
- last window bounds
- retrieval state summary
- sessions, tasks, approvals, audit records, and checkpoints

If a legacy `app-state.v1.json` file exists, it is migrated into SQLite on first startup.

Separate runtime lifecycle markers are stored under `state/runtime-status.json` so the next launch can detect unclean shutdowns and surface recovery diagnostics.

UI preferences are stored separately in `config/config.json` and currently include:

- language
- theme mode
- log level
- max recent workspace count
