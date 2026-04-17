---
name: workspace-retrieval
description: Project-specific guidance for workspace detection, indexing, search, repo map generation, and retrieval worker behavior in AI Digital Life. Use when changing workspace models, index state, search behavior, file watching, or retrieval caching.
---

# Workspace Retrieval

Use this skill when the task affects workspace understanding or retrieval.

## Core rules

- Keep workspace identity, session recovery, and retrieval state separate but connected.
- Store both `rootPath` and stable relative paths where needed.
- Run indexing and long retrieval jobs outside the UI thread.
- Treat retrieval caches as disposable and rebuildable.

## Expected responsibilities

- `workspace`: root detection, session summary, git snapshot, checkpoint references
- `retrieval`: file tree, text search, symbol index, repo map, incremental update
- `storage`: persistence and cache backing, not retrieval logic

## Quality bar

- Search results must map back to stable file locations.
- Index state must be externally visible.
- Worker failure must not leave the system stuck forever.
- File watcher updates should be incremental by default.

## Avoid

- UI-blocking indexing
- relative-path-only designs that lose root context
- making retrieval responsible for session or approval logic
