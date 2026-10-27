# OpenCode Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On OpenCode these resolve to the tools below.

| Action skills request | OpenCode equivalent |
|----------------------|---------------------|
| Read a file | `read` |
| Read multiple files at once | Multiple `read` calls in parallel |
| Create a new file | `write` |
| Edit a file | `edit` (exact string replacement) |
| Run a shell command | `bash` |
| Search file contents | `grep` (regex pattern) |
| Find files by name | `glob` (glob pattern) |
| Fetch a URL | `webfetch` |
| Search the web | `websearch` |
| Invoke a skill | `skill` (load by name) |
| Dispatch a subagent | `task` with `subagent_type: "general"` or `"explore"` |
| Multiple parallel dispatches | Multiple `task` calls in the same message |
| Task tracking ("create a todo", "mark complete") | `todowrite` (states: pending, in_progress, completed, cancelled) |

## Instructions file

When a skill mentions "your instructions file", on OpenCode this is **`AGENTS.md`** (project-level) or **`CLAUDE.md`** (user-level). OpenCode loads instructions hierarchically: project root `AGENTS.md`, then subdirectory `AGENTS.md` files.

## Personal skills directory

User-level skills live at **`~/.config/opencode/skills/`**. Project-level skills live at **`.opencode/skills/`** in the workspace root. Each skill is a subdirectory containing a `SKILL.md` (with `name` and `description` frontmatter).

OpenCode also recognizes **`.agents/skills/`** as a cross-runtime alias (shared with Codex, Gemini, and Trae). When both `.opencode/skills/` and `.agents/skills/` exist, `.opencode/skills/` takes precedence.

## Subagent support

OpenCode dispatches subagents through the `task` tool, which takes `subagent_type`, `description`, and `prompt` parameters.

| Skill dispatch form | OpenCode equivalent |
|---------------------|---------------------|
| `Subagent (general-purpose):` | `task` with `subagent_type: "general"` |
| `Subagent (explore):` | `task` with `subagent_type: "explore"` |
| References a `*-prompt.md` template | Fill the template, then `task` with the filled prompt |
| Inline prompt (no template referenced) | `task` with `subagent_type: "general"` and your inline prompt |

### Parallel dispatch

OpenCode supports parallel subagent dispatch. Issue multiple `task` calls in the same message to run independent subagent work in parallel. Keep dependent tasks sequential.

## Additional OpenCode features

| Feature | Purpose |
|---------|---------|
| `skill` tool | Load and activate skills by name |
| `todowrite` | Rich task tracker with priority levels and status states |
| MCP integration | External tool servers via `opencode.json` `mcp.servers` configuration |
| CodeGraph | Code knowledge graph queries via `codegraph_explore` (Code Mode: `tools.codegraph.*`) |
| Plan mode | Read-only exploration mode (default in this session) |
| Build mode | File editing and command execution allowed |
