# System Overview (Rust + Tauri)

> **项目形态**：当前实现即所规划的完整形态（桌面应用宿主 + 第三方 Agent harness 集成，不分阶段）。下文 "Phase 0 / Phase 2 thin slice" 为历史阶段表述，仅保留作演进记录；范围边界以 `.agents/rules/phase-boundary.md` 与根 `AGENTS.md` 为准。

## Purpose

This codebase is the runnable **desktop host + third-party Agent harness integration** on top of **Rust + Tauri 2.x**:

- Tauri 桌面壳、SQLite 状态
- 工作区管理、补丁预览/应用/回滚、快照
- xterm.js 交互式终端 + CodeMirror 编辑器 + 内置浏览器
- 存储治理（`adl-kernel::storage` 统一路径解析 + 启动期迁移 + 设置面板存储组）
- 系统能力（剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储）
- 第三方 harness 宿主集成（当前为 deepseek dsh）：进程托管与拉起（`crates/webapp-host`）、内嵌版本管理（`crates/dsh-bundle`）与系统版本检测/升级回退（`crates/dsh-version`）、下载源与镜像配置（`crates/download-source`）、中间区多标签宿主渲染（`CenterEntryPage`，`location='center'`）

Agent 对话、模型接入与编排由第三方 harness 提供，本仓库不实现内置单 Agent 运行时与 Provider 路由。

## Implemented Surface

The Rust backend provides shared DTOs, SQLite-backed metadata tables, workspace scanning/search/outline, conversation and run persistence, governed command execution, approval records, checkpoint-backed PatchSet application/rollback, and dsh host integration, while keeping all filesystem, process, SQL, and secret access inside Rust:

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
- React + Zustand workspace shell hosted inside the Tauri WebView
- patch-set, file-patch, and hunk persistence in SQLite
- structured workspace `read_file` / `search` / `outline` Tauri commands
- patch-first preview, explicit hunk decision, apply, and rollback flows
- apply-after-validate loop with structured validation results and automatic rollback on failure
- `notify`-driven workspace file change events delivered via Tauri events
- governed terminal PTY commands with versioned terminal-stream events (Rust-side execution; WebView only subscribes)
- versioned `digital-life://run-activity` events for per-run transparency (persisted for replay)
- dsh host integration: process托管/版本管理/下载源 + center-tab host rendering

## Runtime Path

1. The Tauri Rust process resolves the user data directory, records the runtime lifecycle marker, and initializes config, logging (`tracing`), and persisted state.
2. It evaluates version changes, prepares upgrade backups, and records migration diagnostics.
3. It runs the startup storage migration (`pendingMigration`, before any DB/log handle opens).
4. It creates a Tauri window with explicit CSP and capability bindings.
5. The WebView loads the React frontend, which talks to the backend exclusively through the typed bridge (`tauri-bridge/` in Tauri shell, `preview-bridge/` + adl-server in browser mode, `mock-bridge.ts` for tests).
6. The frontend exposes the home shell and the workspace shell implemented with `React + Zustand`.
7. The frontend can open a workspace, inspect file content, inspect outline/search results, and review a patch preview.
8. Patch application creates a checkpoint payload bundle before files are written, runs validation, rolls back on failure, and can generate a repair preview for a second pass.
9. File changes are observed through `notify`, and the frontend receives structured conflict notifications via Tauri events instead of polling.

## Run Modes

| 模式 | 命令（在 `ai-digital-life/` 执行） | 后端 |
|------|-----------------------------------|------|
| Tauri 桌面 | `pnpm run dev:tauri` | Rust + Tauri WebView2 |
| 浏览器预览 | `pnpm run dev:browser` | adl-server 真实后端（http 优先，可回退） |
| 双端同时 | `pnpm run dev:both` | 两者（一致性验证） |

## Validation Status

Quality gates see `.agents/rules/quality-gates.md` and `mandatory-testing.md`; CI runs them in `.github/workflows/quality-gates.yml` (Windows-only): `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, plus frontend `lint` / `typecheck` / `typecheck:dev` / `format:check` / `check:i18n` / `test`.

## Security Baseline

- explicit `app.security.csp` in `tauri.conf.json` (no empty CSP)
- capability-based command allowlist via `src-tauri/capabilities/*.json` (`default.json` + `browser-remote.json`, no `"all"` / `"**"`)
- `withGlobalTauri` disabled
- no raw filesystem, process, or SQL access from the WebView
- shell/dialog plugins configured with strict scope
- secrets stored via the OS credential store (`crates/credential/`); never in config files or logs

## Persistence

All application data paths resolve through `adl-kernel::storage` (`StoragePaths`); the pointer file is `<config_dir>/ai-digital-life/storage-locator.json` (overridable via `ADL_STORAGE_LOCATOR_PATH` for dev/test):

- locator `pendingMigration` executes at next process startup, before any DB/log handle opens (no hot migration); success switches the pointer then cleans owned files only (external files never deleted); failure keeps the old path and records the error without auto-retry
- settings panel storage group: unified-root vs per-category modes; 10 migratable paths + 1 settings-value path (`downloads_default`) + 6 non-movable items listed with reasons
- patch snapshot path converged to adl-server `storage.paths().snapshot_dir`
- debug builds log to `.adl-logs/` (repo root for shell/preview, `ai-digital-life/.adl-logs/` for adl-server); release builds log to `<data_root>/logs/`

SQLite stores schema version, workspaces, sessions, tasks, approvals, audit records, checkpoints, conversation data, patch sets/hunks/decisions, command execution/validation records, and run activity events. UI preferences (language `system` default with OS-following, theme mode, log level, etc.) persist via the same storage layer with localStorage cache on the frontend.
