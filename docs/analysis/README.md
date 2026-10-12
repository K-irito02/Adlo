# Analysis

> **定位**：实现快照与源码索引（记录"是什么"，只读性质，可能滞后于源码）。规范性约束以 `.agents/rules/` 为准，设计决策见 `../architecture/`。

Source code analysis and architecture maps for reference and comparison.

## Subdirectories

- [ai-digital-life](./ai-digital-life/) — ADL project source map

## Code Knowledge Graphs

`ai-digital-life/` has a local [CodeGraph](https://github.com/colbymchenry/codegraph) knowledge graph (`.codegraph/`, SQLite, auto-synced). Query it via the `codegraph_*` MCP tools or the `codegraph` CLI — see skill [`codegraph-knowledge-graph`](../../.opencode/skills/codegraph-knowledge-graph/SKILL.md).
