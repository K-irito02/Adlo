# Workspace And Retrieval

## Current Scope

Workspace state now includes:

- detected root path
- detected workspace type
- lightweight Git snapshot
- latest session summary

Retrieval remains worker-owned and continues to store only externally visible status and repo-map metadata.

## Runtime Rules

- Workspace identity, session summary, and retrieval snapshot stay separate in storage.
- Git snapshot collection is best-effort and must not block opening a workspace if Git is unavailable.
- Retrieval status is converted into a persisted task summary for the governance shell.

## Present Limits

- No file-watch driven incremental updates yet.
- No checkpoint storage yet.
- Git snapshot currently focuses on branch and dirty-state summary, not full history context.
