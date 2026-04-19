# Workspace And Retrieval

## Current Scope

Workspace state now includes:

- detected root path
- detected workspace type
- lightweight Git snapshot
- latest session summary
- controlled file read / search / outline access for the active workspace

Retrieval remains worker-owned and continues to store only externally visible status and repo-map metadata.

## Runtime Rules

- Workspace identity, session summary, and retrieval snapshot stay separate in storage.
- Git snapshot collection is best-effort and must not block opening a workspace if Git is unavailable.
- Retrieval status is converted into a persisted task summary for the governance shell.
- Renderer never receives arbitrary filesystem access; it can only call structured `readFile`, `search`, and `outline` IPC methods against the active workspace.

## Present Limits

- No file-watch driven incremental updates yet.
- Checkpoint storage currently records metadata and inferred file lists, not restorable payloads.
- Git snapshot currently focuses on branch and dirty-state summary, not full history context.
- Search is currently simple recursive text matching and not yet backed by the retrieval worker index.
