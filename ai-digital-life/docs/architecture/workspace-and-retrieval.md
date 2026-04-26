# Workspace And Retrieval

## Current Scope

Workspace state now includes:

- detected root path
- detected workspace type
- lightweight Git snapshot
- latest session summary
- controlled file read / search / outline access for the active workspace
- checkpoint-safe path resolution for workspace-relative file operations
- disposable repo-map and extension summaries persisted as retrieval snapshots

Retrieval remains worker-owned and continues to store only externally visible status and repo-map metadata.

## Runtime Rules

- Workspace identity, session summary, and retrieval snapshot stay separate in storage.
- Git snapshot collection is best-effort and must not block opening a workspace if Git is unavailable.
- Retrieval status is converted into a persisted task summary for the governance shell.
- The WebView never receives arbitrary filesystem access; it can only call structured `read_file`, `search`, and `outline` Tauri Commands against the active workspace.
- In pure browser preview, the renderer still does not read the filesystem directly. It calls a development-only local Vite API that exposes the same workspace tree / file read / search / outline surfaces, plus controlled file and directory creation for local testing.

## Present Limits

- No file-watch driven incremental updates yet.
- Checkpoint storage currently records metadata and inferred file lists, not restorable payloads.
- Git snapshot currently focuses on branch and dirty-state summary, not full history context.
- Search is currently simple recursive text matching and not backed by vector retrieval or AST indexing.
- File watching is represented by the event contract, but deep incremental watcher reconciliation remains a later hardening step.
