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

## Conversation Scope

- Conversation scope supports both active-workspace sessions and conversation-only sessions.
- Conversation-only sessions persist under the internal workspace sentinel `__global__`; the WebView still presents them as a standalone “global conversation” group instead of a real workspace.
- Selecting “conversation-only mode” clears the active workspace context, disables workspace-bound Git actions, and keeps the composer available.
- Selecting a brand-new workspace path from the status bar does not immediately create a workspace/session sidebar row; it is stored as a pending workspace binding and is materialized only when the next message is sent.
- If the user binds a pending workspace from conversation-only mode and the active draft session is still empty, the draft is replaced by a workspace-scoped session instead of leaving behind an empty global session row.

## Branch Operations

- Workspace Git branch actions are owned by the workspace domain and exposed through typed Tauri Commands; the WebView never shells out to Git directly.
- The status bar can list local branches, switch branches, and create a new branch from either the current branch or a selected base branch.
- Branch switching is disabled when no active workspace is bound.
- If a switch or cross-base branch creation would discard local changes, the UI requires explicit confirmation and the backend auto-stashes local changes before continuing.
- After a branch change, the shell refreshes workspace tree, Git snapshot, retrieval snapshot, and open file content to keep preview and desktop behavior aligned.

## Runtime Rules

- Workspace identity, session summary, and retrieval snapshot stay separate in storage.
- Git snapshot collection is best-effort and must not block opening a workspace if Git is unavailable.
- Retrieval status is converted into a persisted task summary for the governance shell.
- The WebView never receives arbitrary filesystem access; it can only call structured `read_file`, `search`, and `outline` Tauri Commands against the active workspace.
- In pure browser preview, the renderer still does not read the filesystem directly. It calls a development-only local Vite API that exposes the same workspace tree / file read / search / outline surfaces, plus controlled file and directory creation for local testing.
- Retrieval/indexing status remains available in the shell, but the inline composer status bar no longer renders the `indexed` token; retrieval visibility moves to better-scoped retrieval/workspace surfaces.

## Present Limits

- No file-watch driven incremental updates yet.
- Checkpoint storage currently records metadata and inferred file lists, not restorable payloads.
- Git snapshot currently focuses on branch and dirty-state summary, not full history context.
- Search is currently simple recursive text matching and not backed by vector retrieval or AST indexing.
- File watching is represented by the event contract, but deep incremental watcher reconciliation remains a later hardening step.
