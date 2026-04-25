---
name: workspace-retrieval
description: Project-specific guidance for workspace detection, indexing, search, repo map generation, and retrieval task behavior in AI Digital Life (Rust + Tauri). Use when changing workspace models, index state, search behavior, file watching, or retrieval caching.
---

# Workspace Retrieval

Use this skill when the task affects workspace understanding or retrieval.

## Core rules

- Keep workspace identity, session recovery, and retrieval state separate but connected.
- Store both `rootPath` (absolute) and stable relative paths where needed.
- Run indexing and long retrieval jobs off the Tauri main thread (use `tokio::spawn` or `tokio::task::spawn_blocking`).
- Treat retrieval caches as disposable and rebuildable.
- Use `notify` (Rust crate) for incremental file watching, with debouncing.

## Expected responsibilities

- `workspace` crate: root detection, session summary, git snapshot, checkpoint references
- `fs-ops` crate: `notify`-based watchers, atomic writes, path scoping
- retrieval logic: file tree, text search, symbol index, repo map, incremental update
- `storage` crate: persistence and cache backing, not retrieval logic

## Quality bar

- Search results must map back to stable file locations (root + relative path).
- Index state must be externally visible via Tauri Events (e.g. `digital-life://retrieval-status`).
- Background task failure must not leave the system stuck forever; use timeouts and supervisor patterns.
- File watcher updates should be incremental by default; full rescan is opt-in.

## Avoid

- Blocking the Tauri main thread with sync IO (always wrap in `spawn_blocking`)
- Relative-path-only designs that lose root context
- Making retrieval responsible for session or approval logic
- Using `std::fs` watchers when `notify` is available
