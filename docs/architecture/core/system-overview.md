# System Overview (Rust + Tauri)

> **项目形态**：当前实现即所规划的完整形态（桌面应用宿主 + 第三方 Agent harness 集成，不分阶段）。下文 "Phase 0 / Phase 2 thin slice" 为历史阶段表述，保留作演进记录；范围边界以 `.agents/rules/phase-boundary.md` 与根 `AGENTS.md` 为准。

## Purpose

This codebase is the runnable **desktop host + third-party Agent harness integration** on top of **Rust + Tauri 2.x** (foundation shell, workspace, terminal, editor, browser, storage governance, system capabilities; Agent capabilities provided by the harnessed third party).

## Implemented Backend Thin Slice

The Rust backend now contains a pragmatic single-agent thin slice across the Cargo workspace. It provides shared DTOs, SQLite-backed metadata tables, workspace scanning/search/outline, conversation and run persistence, governed command execution, approval records, checkpoint-backed PatchSet application/rollback, prompt/context assembly, and DeepSeek/MiniMax model routing with OS keyring secrets plus a controlled local fallback when providers are unavailable.

This is intentionally not a full autonomous multi-agent runtime. The backend exposes typed Tauri commands and versioned events for the existing WebView contract, while keeping all filesystem, process, SQL, and model-secret access inside Rust.

The implemented surface (after the Rust migration completes) covers:

- secure Tauri shell with CSP and capability allowlist
- typed `#[tauri::command]` bridge consumed via `@tauri-apps/api`
- recent workspace restore
- SQLite state persistence (`rusqlite`) with versioned migrations
- workspace indexing via `tokio` tasks (no separate Node worker)
- runtime language and theme preferences
- task / approval shell entry surfaces in the WebView frontend
- persisted workspace, session, task, approval, and audit metadata
- lightweight Git snapshot capture for workspace safety visibility
- startup recovery markers and migration diagnostics
- shared event-bus emission across workspace, retrieval, task, and approval flows
- React + Zustand workspace shell hosted inside the Tauri WebView
- conversation sessions and persisted conversation messages
- single-agent sequential planning state with stored run and step metadata
- patch-set, file-patch, and hunk persistence in SQLite
- structured workspace `read_file` / `search` / `outline` Tauri commands
- patch-first preview, explicit hunk decision, apply, and rollback flows
- apply-after-validate loop with structured validation results and automatic rollback on failure
- dual-provider routing for `DeepSeek -> MiniMax` with synthetic fallback only after both providers fail
- persisted non-sensitive model provider preferences
- real provider health snapshots exposed to the WebView
- automatic repair preview generation after validation failure
- `notify`-driven workspace file change events delivered via Tauri events
- WebDriver-based acceptance coverage for the workspace shell
- governed `command_run_stream` / `command_stop_stream` Tauri commands with versioned `digital-life://terminal-stream` events (Rust-side execution; WebView only subscribes)
- versioned `digital-life://run-activity` events for per-run transparency (persisted for replay)

## Runtime Path

1. The Tauri Rust process resolves the user data directory, records the runtime lifecycle marker, and initializes config, logging (`tracing`), and persisted state.
2. It evaluates version changes, prepares upgrade backups, and records migration diagnostics.
3. It spawns retrieval tasks via `tokio::spawn` (no separate Node worker).
4. It creates a Tauri window with explicit CSP and capability bindings.
5. The WebView loads the React frontend, which talks to the backend exclusively through `@tauri-apps/api`'s `invoke()` and `listen()`.
6. The frontend exposes two visible shells:
   - the Phase 0 home shell
   - the Phase 2 workspace shell implemented with `React + Zustand`
7. The frontend can open a workspace, manage conversation sessions, send a structured single-agent request, inspect file content, inspect outline/search results, and review a patch preview.
8. The Rust backend routes the single-agent request through prompt assembly, context selection, configurable `DeepSeek -> MiniMax` provider routing, patch-set persistence, and explicit patch application.
9. Patch application creates a checkpoint payload bundle before files are written, runs validation, rolls back on failure, and can generate a repair preview for a second pass.
10. When model preferences change, the backend persists the new non-sensitive settings, rebuilds the gateway and runtime, and refreshes the provider health snapshot without expanding WebView privilege.
11. File changes are observed through `notify`, and the frontend receives structured conflict notifications via Tauri events instead of polling.

## Validation Status (Target)

Once the Rust migration completes, the repository will provide:

- unit coverage for Phase 0 infrastructure crates (`#[cfg(test)] mod tests` per crate)
- Rust integration tests under `tests/integration/` exercising Tauri command surfaces
- a WebDriver acceptance test (`tauri-driver`) covering the main workspace patch flow
- passing `cargo test --workspace`, `cargo clippy`, `cargo check`, and `cargo tauri build` in the project environment

## Security Baseline

- explicit `app.security.csp` in `tauri.conf.json` (no empty CSP)
- capability-based command allowlist via `src-tauri/capabilities/*.json`
- `withGlobalTauri` disabled
- no raw filesystem, process, or SQL access from the WebView
- high-permission plugins (`tauri-plugin-fs`, `tauri-plugin-shell`, `tauri-plugin-http`) configured with strict scope
- secrets stored via the OS credential store (`keyring` crate); never in config files or logs

## Persistence

State is stored in `state/app-state.db` (SQLite via `rusqlite`):

- schema version
- current workspace path
- recent workspaces
- last window bounds
- retrieval state summary
- sessions, tasks, approvals, audit records, and checkpoints
- conversation sessions and conversation messages
- agent runs, steps, and tool invocation metadata
- patch sets, file patches, and hunk decisions
- command execution and validation result records
- model provider preferences and provider routing metadata
- run activity events (per-run replay timeline)

If a legacy `app-state.v1.json` (or pre-Rust `state/*.db`) exists, it is migrated into the current SQLite schema on first startup.

Runtime lifecycle markers live in `state/runtime-status.json` so the next launch can detect unclean shutdowns and surface recovery diagnostics.

UI preferences are stored separately in `config/config.json` and currently include:

- language
- theme mode
- log level
- max recent workspace count
- model provider enable switch
- model provider priority
- model provider default model id
