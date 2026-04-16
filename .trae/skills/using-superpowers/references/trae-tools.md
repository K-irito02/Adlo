# Trae IDE Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your platform equivalent:

| Skill references | Trae equivalent |
|-----------------|-----------------|
| `Read` (file reading) | `Read` |
| `Write` (file creation) | `Write` |
| `Edit` (file editing) | `SearchReplace` |
| `Bash` (run commands) | `RunCommand` (see [RunCommand details](#runcommand-details)) |
| `Grep` (search file content) | `Grep` |
| `Glob` (search files by name) | `Glob` |
| `Skill` tool (invoke a skill) | `Skill` |
| `WebSearch` | `WebSearch` |
| `WebFetch` | `WebFetch` |
| `Task` tool (dispatch subagent) | `Task` (see [Agent types](#agent-types)) |
| Multiple `Task` calls (parallel) | Multiple `Task` calls |
| Task returns result | Task returns result directly |
| `TodoWrite` (task tracking) | `TodoWrite` |
| `EnterPlanMode` / `ExitPlanMode` | No equivalent — use `/plan` slash command |

## RunCommand details

Trae's `RunCommand` replaces Claude Code's `Bash` with structured parameters:

| Bash usage | RunCommand equivalent |
|-----------|----------------------|
| `Bash("npm test")` | `RunCommand(command="npm test", blocking=true, requires_approval=false)` |
| Background process | `RunCommand(command="...", blocking=false, requires_approval=false, wait_ms_before_async=2000)` |
| Check running process | `CheckCommandStatus(command_id="...")` |
| Kill running process | `StopCommand(command_id="...")` |

Key parameters:

- **`blocking`**: `true` for short commands (tests, builds), `false` for long-running processes (dev servers, daemons)
- **`requires_approval`**: `false` for safe operations (read, write, install), `true` for destructive operations
- **`command_type`**: Optional classification — `web_server`, `long_running_process`, `short_running_process`, or `other`
- **`wait_ms_before_async`**: Milliseconds to pause before going fully async (detects early failures)
- **`cwd`**: Absolute path for working directory

## Agent types

Trae's `Task` tool accepts a `subagent_type` parameter with specialized agents:

| Claude Code agent | Trae equivalent |
|-------------------|-----------------|
| `general-purpose` | `"search"` (for research) or other specialized types |
| `Explore` | `"search"` |
| Named plugin agents | Specialized subagent types (see below) |

### Specialized subagent types

| subagent_type | Purpose |
|--------------|---------|
| `search` | Cross-module code search, documentation lookup, survey tasks |
| `ai-engineer` | AI model integration, NCNN inference, GPU acceleration |
| `qt-developer` | Qt/QML UI development, business logic, module integration |
| `graphics-engineer` | Shader development, rendering pipeline, GPU optimization |
| `media-engineer` | Video/audio decoding, FFmpeg, hardware acceleration |
| `test-engineer` | Functional testing, regression testing, performance benchmarks |
| `devops-engineer` | Build packaging, version management, CI/CD, release deployment |
| `ui-designer` | UI component design, design systems, visual aesthetics |
| `frontend-architect` | React/Vue/Angular components, state management, frontend performance |
| `backend-architect` | API design, server-side logic, database implementation |
| `api-test-pro` | API testing, load testing, contract testing |

### Dispatching named agents

When a skill says to dispatch a named agent type (e.g., `superpowers:code-reviewer`):

1. Map to the closest Trae subagent type from the table above
2. Provide a detailed `query` parameter with the full task description
3. Set `response_language` to match the user's language
4. Use a concise `description` (3-5 words)

Example mapping:

| Skill instruction | Trae equivalent |
|-------------------|-----------------|
| `Task tool (superpowers:code-reviewer)` | `Task(subagent_type="search", query="Review code for quality...", description="code review")` |
| `Task tool (general-purpose)` with inline prompt | `Task(subagent_type="search", query="...", description="research task")` |

## Additional Trae tools

These tools are available in Trae but have no direct Claude Code equivalent:

| Tool | Purpose |
|------|---------|
| `SearchCodebase` | Semantic code search using embedding-based retrieval across the entire codebase |
| `LS` | List files and directories in a given path |
| `DeleteFile` | Delete one or more files (supports batch deletion) |
| `GetDiagnostics` | Get VS Code language diagnostics (errors, warnings) for files |
| `AskUserQuestion` | Present structured questions with selectable options to the user |
| `OpenPreview` | Open a preview URL in the browser (for local dev servers) |
| `CheckCommandStatus` | Check the status of a previously executed non-blocking command |
| `StopCommand` | Terminate a currently running command |

### MCP tools

Trae provides MCP (Model Context Protocol) tools that extend capabilities:

| Tool | Purpose |
|------|---------|
| `mcp_Sequential_Thinking_sequentialthinking` | Dynamic, reflective problem-solving through structured chain-of-thought |
| `mcp_Time_get_current_time` | Get current time in a specific IANA timezone |
| `mcp_Time_convert_time` | Convert time between IANA timezones |
| `mcp_context7_resolve-library-id` | Resolve a package name to a Context7-compatible library ID |
| `mcp_context7_query-docs` | Query up-to-date documentation and code examples from Context7 |

## Environment detection

Skills that need to detect the Trae environment can check:

- **Operating system**: Windows (PowerShell 5 shell environment)
- **Working directory**: Specified via `cwd` parameter in `RunCommand`
- **Terminal management**: Max 5 terminals; commands run in PowerShell; non-idle terminals will be killed if reused

## Plan mode

Trae supports a plan mode triggered by the `/plan` slash command. When in plan mode:

- No edits or non-readonly tools may be used (except the plan file)
- Write the plan, then notify the user for confirmation
- Once accepted, implement the plan immediately without further confirmation

This differs from Claude Code's `EnterPlanMode`/`ExitPlanMode` tools — Trae uses a slash command instead.
