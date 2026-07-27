# Branch Graph Lane Assignment Algorithm

## Approach

The branch graph uses a **topology-based lane assignment** (Gitamine-style) algorithm instead of branch-name-based matching:

1. **computeColumns** — Kahn's algorithm (BFS in-degree) for topological sort, newest-first via date sorting
2. **Active lane tracking** — each commit gets a column based on parent-child relationships, not branch names
3. **First-parent chain** — continues the same column; merge parents get new columns
4. **Convergence** — when two lanes target the same commit, they merge (first-parent lane wins)

## Key Implementation Files

- `computeColumns` in `hooks/useLaneAssignment.ts` — core algorithm
- `buildRows` in `charts/BranchGraph.tsx` — uses `sortedIds` from the algorithm (not independent DFS)

## Ahead/Behind Indicators

- Backend computes `git rev-list --count` per branch (both Node.js preview and Rust Tauri)
- Label bar shows `↑N ↓M` with bold arrows + muted numbers
- SVG: ahead nodes at `opacity: 0.65`, synced at `opacity: 1.0`
- Tooltip uses i18n templates with truncated merge-base hash

## Column Label Dedup

Multiple columns sharing the same logical branch (e.g., `origin/main` on divergent paths) merge into one label button that filters all matching columns atomically.
