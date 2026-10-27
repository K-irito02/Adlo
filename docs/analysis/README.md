# Analysis

> **定位**：实现快照与源码索引（记录"是什么"，只读性质，可能滞后于源码）。规范性约束以 `.agents/rules/` 为准，设计决策见 `../architecture/`。

Source code analysis and architecture maps for reference and comparison.

## Subdirectories

- [ai-digital-life](./ai-digital-life/) — ADL project source map

## Code Knowledge Graphs

`ai-digital-life/` has a local [CodeGraph](https://github.com/colbymchenry/codegraph) knowledge graph (`.codegraph/`, SQLite, auto-synced). The MCP server is configured in [`.opencode/opencode.json`](../../.opencode/opencode.json) (`mcp.servers.codegraph`) and exposes `codegraph_explore`; finer-grained lookups (symbols, callers, impact) use the `codegraph` CLI. See skill [`codegraph-knowledge-graph`](../../.agents/skills/codegraph-knowledge-graph/SKILL.md).
