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

## Runtime Path

1. `Main` resolves the user data directory and initializes config, logging, and persisted state.
2. `Main` starts a worker thread used for workspace retrieval scans and worker health visibility.
3. `Main` creates a locked-down `BrowserWindow`.
4. `Preload` exposes the `window.digitalLife` bridge and hides raw Electron primitives.
5. `Renderer` reads bootstrap data, shows recent workspaces, retrieval status, health, and logs, and can request `workspace.open(path)`.
6. `Renderer` can update language and theme preferences through a typed IPC patch instead of direct file writes.
7. The workspace service validates the path, detects the project root, updates recent entries, persists state to SQLite, and triggers retrieval indexing.

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

If a legacy `app-state.v1.json` file exists, it is migrated into SQLite on first startup.

UI preferences are stored separately in `config/config.json` and currently include:

- language
- theme mode
- log level
- max recent workspace count
