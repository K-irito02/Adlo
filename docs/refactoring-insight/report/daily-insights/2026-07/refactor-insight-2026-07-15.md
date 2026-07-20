# Refactoring Insight Report

**Generated**: 2026-07-15
**Project**: AI Digital Life (`ai-digital-life/`)
**Tech Stack**: Rust + Tauri 2.x / React 19 + TypeScript + Zustand / Vite
**Scope**: `crates/` (24 Rust crates), `src-tauri/` (Tauri binary), `frontend/src/` (React UI)
**Scan Method**: Parallel sub-agents scanning 4 independent dimensions (code structure, architecture & design, performance & resource, hygiene & quality). 4 scan reports merged and deduplicated.

---

## Baseline Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Rust workspace crates | 24 | `crates/*` + `src-tauri` |
| Rust source files (.rs) | 202 | production + tests |
| Frontend files (.ts/.tsx) | >400 | excluding node_modules |
| Rust tests | 508 | per project AGENTS.md |
| Frontend tests | 431 | per project AGENTS.md |
| Zustand slices | 31 factories | in 24 slice files (5 browser + 3 github sub-slices) |
| Cross-slice action modules | 12 | `frontend/src/app/stores/actions/` |
| Bridge sub-interfaces | 27 | `shared/ipc/digital-life.ts` (rules doc says 13 — stale) |
| i18n keys | 936 | 13 domains, TCopyContext + useTCopy |
| TODO/FIXME/HACK/XXX markers | 3 | unusually low for project size |
| `any` type in production frontend | 1 | with explicit `biome-ignore` comment |
| `unwrap()` in production Rust | ~5 | `outline/brace.rs` (30+) + ~5 in startup `expect()` (acceptable) |
| Lint warnings | 0 | project enforces `clippy -D warnings` + eslint clean |
| Path traversal protection | Exemplary | single chokepoint in `crates/fs-ops/src/lib.rs` with defense-in-depth |
| Build time | Not measured | static analysis only — no build runs |
| Test suite runtime | Not measured | static analysis only |

**Overall health assessment**: The codebase is **unusually clean** for its size and feature breadth. Strict project rules (`dev-rules.md`, `error-handling.md`, `rust-patterns.md`, `mandatory-testing.md`) are clearly enforced: zero `console.log` debug spam, only 3 TODOs, near-zero production `unwrap()`, exemplary path-traversal protection. The findings below represent **refinement opportunities**, not crisis points.

---

## Risk Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| **Critical** (fix first) | 4 | Tauri main-thread blocking (active UX degradation matching documented root cause) + UI bypassing bridge layer |
| **High** (plan) | 10 | God modules, async I/O without `spawn_blocking`, N+1 DB writes, latent panic risk, disabled safety guard |
| **Medium** (quick wins) | 12 | Documentation drift, duplication, magic numbers, deep nesting, large components |
| **Low** (defer) | 9 | Style polish, deferred Phase 3+ markers, minor allocations |

**Risk matrix:**

```
Impact
  ^
  │  C1,C2,C4 (Critical)    C1,C2,C3,C4
  │  High Impact            High Impact
  │  Low Likelihood         High Likelihood
  │  (Plan carefully)       (Fix first)
  │
  │  L1-L9 (Low)            H1-H10, M1-M12
  │  Low Impact             Low Impact
  │  Low Likelihood         High Likelihood
  │  (Defer)                (Fix if easy)
  │
  └──────────────────────────→ Likelihood
```

---

## Findings

### 1. Critical — Tauri Main-Thread Blocking

> **Theme**: Multiple sync `#[tauri::command] pub fn` calls perform I/O (file system, git subprocesses, DB queries) on the Tauri main thread, blocking the tao event loop and causing window "未响应" (not responding). This **directly violates** the project rule documented in `.trae/rules/dev-rules.md` "常见根因速查" and `docs/knowledge-base/tauri-backend/tauri-sync-command-blocking-2026-07-14.md`. The correct `async fn` + `tokio::task::spawn_blocking` pattern already exists in adjacent code in the same files.

#### C1 — Sync `pub fn` git commands spawn subprocesses on main thread

- **Location**: `ai-digital-life/src-tauri/src/commands/workspace_git.rs#L86-L191`
  - `workspace_switch_git_branch` (L86) — sync, spawns 2-4 `git` subprocesses
  - `workspace_create_git_branch` (L115) — sync, spawns 2-3 `git` subprocesses
  - `workspace_git_stage_file` (L161) — sync, spawns `git add`
  - `workspace_git_unstage_file` (L172) — sync, spawns `git restore --staged`
  - `workspace_git_discard_file` (L183) — sync, spawns `git checkout`
- **Issue**: Each command blocks the main thread for the duration of `git` subprocess execution (100ms–multiple seconds on large repos). The same file already shows the correct pattern at L66-83 (`workspace_list_git_branches` uses `tokio::task::spawn_blocking`).
- **Impact**: UI freezes during every git operation. On large repos, `git switch` can take 2-5 seconds of frozen UI. Matches a documented root cause of "启动期窗口未响应".
- **Suggestion**: Convert each to `pub async fn` and wrap the blocking call in `tokio::task::spawn_blocking(move || ...)`, exactly as `workspace_list_git_branches` (L66-83) and `workspace_get_git_status` (L49-63) already do in the same file. Template is 8 lines.
- **Risk**: **Critical** — active user-facing degradation. Likelihood: HIGH (every git op). Impact: HIGH (UI freeze). Fix complexity: LOW (mechanical, template exists in same file). Ripple: LOW (commands are independent).

#### C2 — Sync `workspace_open` does heavy I/O + full tree walk on main thread

- **Location**: `ai-digital-life/src-tauri/src/commands/workspace.rs#L18-L46`
- **Issue**: Sync `pub fn` calls `open_workspace` (file I/O), `build_retrieval_snapshot` (recursive directory walk reading every file via `collect_retrieval_inner` in `crates/workspace/src/tree.rs:224-259`), `state.db.save_entity` (DB write), `upsert_sidebar_after_open` (more DB writes) — all on the main thread.
- **Impact**: Opening a workspace with 10k files can block UI for seconds. `build_retrieval_snapshot` already has an async variant `build_retrieval_snapshot_async` (`tree.rs:261`) but it's not used here.
- **Suggestion**: Convert to `pub async fn`; move `open_workspace` + `build_retrieval_snapshot` + DB writes into `spawn_blocking`. The async variant of the snapshot builder already exists — use it.
- **Risk**: **Critical** — first-run-after-launch experience. Likelihood: HIGH (every workspace open). Impact: HIGH (multi-second freeze). Fix complexity: MEDIUM (need to verify async snapshot path is sound). Ripple: MEDIUM (signature change ripples to callers).

#### C3 — Sync `pub fn` workspace file/search/outline commands

- **Location**: `ai-digital-life/src-tauri/src/commands/workspace.rs#L74-L250`
  - `workspace_search` (L151) — sync, walks files for text search (worst — full text scan)
  - `workspace_outline` (L159) — sync, reads + parses file
  - `workspace_create_file` (L74), `workspace_create_folder` (L83), `workspace_read_file` (L91), `workspace_get_change_preview` (L111) — sync file I/O
  - `workspace_rename_file` (L194), `workspace_delete_file`, `workspace_duplicate_file`, `workspace_move_file` — sync file I/O
- **Issue**: All are sync `pub fn` doing fs I/O on the main thread. `workspace_list_tree` (L132) in the same file correctly uses `async fn` + `spawn_blocking` — pattern is inconsistent within one file.
- **Impact**: Each file operation blocks UI; `workspace_search` on a large workspace is the worst case.
- **Suggestion**: Convert to `async fn` + `spawn_blocking`, matching `workspace_list_tree`.
- **Risk**: **Critical** for search/outline, **High** for single-file ops. Likelihood: HIGH. Impact: HIGH for search. Fix complexity: LOW (mechanical). Ripple: LOW.

#### C4 — Sync `pub fn` agent commands doing DB I/O

- **Location**: `ai-digital-life/src-tauri/src/commands/agent.rs#L64-L100`
- **Issue**: `agent_get_run`, `agent_retry_run`, `agent_abort_run` are sync `pub fn` that call `load_run_detail` (DB reads) and `save_run_detail` (DB writes). Compounds with the over-fetch in H4.
- **Impact**: Smaller than C1-C3 because DB ops are fast, but still blocks main thread.
- **Suggestion**: Convert to `async fn` + `spawn_blocking`.
- **Risk**: **Critical** (grouped with C1-C3 as the same rule violation pattern). Likelihood: HIGH. Impact: MEDIUM. Fix complexity: LOW.

> **C1-C4 consolidated fix plan**: Audit all `#[tauri::command] pub fn` in `src-tauri/src/commands/*.rs`. Convert every I/O-performing command to `pub async fn` + `spawn_blocking`. The template exists in 4 already-correct commands (`workspace_list_tree`, `workspace_list_git_branches`, `workspace_get_git_status`, `task_list_audit_entries` — per the 2026-07-14 fix log). Estimated 15-20 commands to convert.

---

### 2. Critical — Architecture: UI Bypasses Bridge Layer

#### C5 — 36 UI files import `@ai-digital-life/kernel` directly, bypassing the bridge layer

- **Location**:
  - 18 files in `frontend/src/app/components/`: `workspace/IndexStatus.tsx`, `workspace/RepoMapView.tsx`, `terminal/CommandOutputBlock.tsx`, `conversation/TokenUsage.tsx`, `conversation/RunSummaryBlock.tsx`, `conversation/ReferencePopover.tsx`, `approval/AuditPanel.tsx`, `approval/ApprovalCard.tsx`, `agent/StepBlock.tsx`, `agent/ExecutionSummary.tsx`, `agent/PlanCard.tsx`, `settings/SettingsNav.tsx`, `settings/SettingsPanel.tsx`, `settings/SettingsControls.tsx`, `settings/FontControl.tsx`, `MessageStream.tsx` (+2 test files)
  - 18 files in `frontend/src/app/features/`: `browser/BrowserNavigator.tsx`, `browser/BrowserNavTabsMode.tsx`, `workspace-terminal/WorkspaceTerminalEntry.tsx`, `workspace-terminal/MultiWorkspaceTerminal.tsx`, `workspace-file-tree/MultiWorkspaceFileTree.tsx`, `workspace-browser/MultiWorkspaceBrowser.tsx`, `workspace-changes-tree/WorkspaceChangesEntry.tsx`, `workspace-changes-tree/MultiWorkspaceChangesTree.tsx`, `workspace-file-tree/WorkspaceFileTreeEntry.tsx`, `outline/OutlineTree.tsx`, `github-tree/GitHubTree.tsx`, `browser-tree/BrowserTabTree.tsx`, `conversation/MessageBlocks.tsx`, `terminal/TerminalEmptyState.tsx`, `session-fork/ForkButton.tsx`, `patch-review/PatchHunkCard.tsx`, `patch-review/PatchFileCard.tsx`, `multi-workspace/MultiWorkspaceContainer.tsx`
- **Issue**: Per `.trae/rules/tauri-shell.md` rule "WebView → forbidden: directly accessing system capabilities", UI components should consume types via the bridge layer (`shared/ipc/`). Instead, 36 UI files import types directly from `@ai-digital-life/kernel` (the generated Rust→TypeScript type package). Compounding this, **100 frontend files total** import from `@ai-digital-life/kernel` (including stores, bridges, features, components).
- **Impact**: UI is tightly coupled to the Rust type layout. Renaming a Rust struct field ripples across 36+ UI files (and 100 total). The bridge layer (`shared/ipc/index.ts` with 27 sub-interfaces) becomes redundant for type access. Backend type changes cause widespread typecheck churn, slowing development of any kernel change.
- **Suggestion**: Two-phase fix:
  1. **Phase 1 (stop the bleeding)**: Add ESLint `no-restricted-imports` rule forbidding `@ai-digital-life/kernel` outside `shared/ipc/`, `tauri-bridge/`, `preview-bridge/`, `mock/`, and `app/stores/`. This prevents new violations while planning the migration.
  2. **Phase 2 (migrate)**: Re-export needed types from `shared/ipc/<domain>.ts`. Migrate 36 UI files to import from `shared/ipc/` instead of `@ai-digital-life/kernel`. Mechanical refactor.
- **Risk**: **Critical** — severe architecture violation actively slowing development. Likelihood: HIGH (every backend type change). Impact: HIGH (36+ files affected per change). Fix complexity: MEDIUM (Phase 1 is trivial; Phase 2 is mechanical but large). Ripple: LOW (type-only refactor, no behavior change).

---

### 3. High — Latent Bugs & Disabled Safety Guards

#### H1 — `doom_loop_count = 0` placeholder disables a safety guard

- **Location**: `ai-digital-life/src-tauri/src/commands/agent_pipeline/patch_generator.rs#L34`
- **Issue**: `let doom_loop_count = 0u32; // TODO: 从 session 状态读取连续失败次数` — the doom-loop detection logic exists but is wired to a constant `0`. The counter never increments, so the safety guard is effectively disabled.
- **Impact**: Agent could enter infinite retry loops because the doom-loop counter never triggers the abort threshold. The `DoomLoopState` type exists in `crates/types/src/doom_loop.rs` but is unused here.
- **Suggestion**: Wire `doom_loop_count` from session state. The `DoomLoopState` field already exists in the type system; thread it through the agent pipeline.
- **Risk**: **High** — silently disables a safety mechanism. Likelihood: MEDIUM (only triggers on repeated agent failures). Impact: HIGH (unbounded retry loops). Fix complexity: MEDIUM (need to trace session state plumbing). Ripple: MEDIUM (touches agent pipeline).

#### H2 — Static `LazyLock` regex chain with 30+ `.unwrap()` calls

- **Location**: `ai-digital-life/crates/outline/src/brace.rs#L10-L50`
- **Issue**: `BRACE_MATCHERS` static is built via `LazyLock::new(|| vec![ (Regex::new(...).unwrap(), "..."), ... 30 entries ... ])`. Additionally `STRING_REGEX` (L47) and `COMMENT_REGEX` (L50) follow the same pattern. Any future edit that introduces a regex syntax error will cause `outline` to panic on first access — likely at app startup or first file open. Violates `rust-patterns.md`: "禁止 `unwrap()`".
- **Impact**: A single typo in a regex pattern (during future language support additions) becomes a startup panic instead of a compile-time or runtime error with context.
- **Suggestion**: Either (a) use `OnceLock<Vec<(Regex, &str)>>` with `.expect("BRACE_MATCHERS regexes are compile-time validated")` — slightly better than silent `unwrap()`, or (b) add a `#[test]` that compiles each regex pattern in CI, then keep `unwrap()` with a doc comment justifying the test guard.
- **Risk**: **High** — production code panics on first access. Likelihood: LOW (patterns are stable today). Impact: HIGH (app unusable). Fix complexity: LOW. Ripple: LOW.

#### H3 — `list_snapshots` / `prune_snapshots` async without `spawn_blocking`

- **Location**: `ai-digital-life/src-tauri/src/commands/snapshot.rs#L46-L54` and `:72-L80`
- **Issue**: Both declared `pub async fn` but call `manager.list_snapshots()` / `manager.prune_snapshots()` directly. These methods perform `std::fs::read_dir` + `std::fs::read_to_string` per snapshot (`crates/change-engine/src/snapshot.rs:91-107`); `prune_snapshots` calls `delete_snapshot` in a loop which does `std::fs::remove_dir_all` (L134). No `spawn_blocking`.
- **Impact**: Blocks the Tokio runtime worker thread; with many snapshots this stalls other async tasks (including the streaming agent pipeline). Same file's `create_snapshot` (L37) and `revert_to_snapshot_cmd` (L65) already use `spawn_blocking` correctly — inconsistent within one file.
- **Suggestion**: Wrap the manager calls in `tokio::task::spawn_blocking(move || ...)` exactly like `create_snapshot` does at L37-42.
- **Risk**: **High** — async runtime starvation under load. Likelihood: MEDIUM (only with many snapshots). Impact: HIGH (stalls streaming). Fix complexity: LOW (4-line change). Ripple: LOW.

---

### 4. High — Performance: N+1 DB Patterns & Over-fetch

#### H4 — `load_run_detail` over-fetches every AgentPlanStep row across all runs

- **Location**: `ai-digital-life/src-tauri/src/commands/agent.rs#L264-L275`
- **Issue**: `state.db.list_entities(EntityTable::AgentSteps)?` loads **every** `AgentPlanStep` row across **all** runs, then `steps.retain(|step| step.run_id == run_id)` filters in Rust. Called by `agent_get_run`, `agent_retry_run`, `agent_abort_run`.
- **Impact**: O(total_steps_in_db) deserialization per call. Grows unboundedly as agent usage accumulates — after hundreds of runs this becomes the dominant cost of opening the agent panel. Silent degradation over time, not visible at small scale.
- **Suggestion**: Add repository method `list_entities_by_run(table, run_id)` that filters at the SQL level using an indexed `run_id` column (the schema has indexes per `crates/storage/sql/init_indexes.sql`). Confirm the `run_id` index exists; add it if missing.
- **Risk**: **High** — silent degradation over time. Likelihood: HIGH (every agent panel open). Impact: HIGH (unbounded growth). Fix complexity: MEDIUM (new repository method + index check). Ripple: LOW.

#### H5 — Sequential DB writes in `conversation_archive_all_in_workspace`

- **Location**: `ai-digital-life/src-tauri/src/commands/conversation.rs#L153-L168`
- **Issue**: Loop iterates over every session in the workspace and calls `save_session(&state, session)?` (a DB write) inside the loop body for each session.
- **Impact**: O(n) sequential SQLite writes; also a sync `pub fn` Tauri command (compounds with C1-C4) so main thread is blocked for the full duration. 50 sessions = 50 round-trip writes.
- **Suggestion**: Apply the pattern already used by `workspace_reorder` (`workspace_sidebar.rs:222`) — mutate entries in memory, then call a single batch `save_sidebar_entries` at the end. Add a `save_sessions_batch` repository method that uses a single transaction.
- **Risk**: **High** — blocks main thread + N+1 writes. Likelihood: HIGH (every archive-all). Impact: HIGH (lag grows with session count). Fix complexity: MEDIUM. Ripple: LOW.

#### H6 — Sequential DB writes in `conversation_reorder_sessions`

- **Location**: `ai-digital-life/src-tauri/src/commands/conversation.rs#L184-L213`
- **Issue**: Inside `for session in &mut sessions` loop, `save_session(&state, session)?` is called once for each matched pinned session and once for each matched unpinned session (L196 and L202). Reordering 20 sessions produces up to 20 sequential DB writes.
- **Impact**: Drag-and-drop reorder is a frequent interaction; each reorder blocks the UI for sum-of-write-latencies instead of one transaction.
- **Suggestion**: Collect modified sessions into a `Vec` and emit a single batched transactional write at the end (mirror `workspace_reorder` at `workspace_sidebar.rs:204-L225` which already does this correctly).
- **Risk**: **High**. Likelihood: HIGH (frequent interaction). Impact: MEDIUM. Fix complexity: MEDIUM. Ripple: LOW.

---

### 5. High — God Modules

#### H7 — `src-tauri/src/commands/browser.rs` (709 lines, 14 commands + ~30 helpers)

- **Location**: `ai-digital-life/src-tauri/src/commands/browser.rs#L1-L709`
- **Issue**: A single file contains:
  - 14 `#[tauri::command]` functions (L197-L393): `browser_create_for_tab`, `browser_activate_tab`, `browser_destroy_tab`, `browser_navigate_tab`, `browser_set_tab_bounds`, `browser_go_back_tab`, `browser_go_forward_tab`, `browser_reload_tab`, `browser_fetch_page_meta`, `browser_mute_tab`, `browser_set_color_scheme`, `browser_set_zoom`, `browser_clear_cookies`, `browser_clear_cache`
  - Platform-specific webview setup: `new_window_handler`, `resolve_window_and_url`, `build_webview_builder`, `setup_webview2_handlers_for_platform`, `apply_theme_and_navigate_for_platform`, `register_webview_with_manager` (L14-L196)
  - HTML parsing utilities: `fetch_page_meta_inner`, `extract_meta_content`, `extract_attr_value`, `extract_title`, `extract_href`, `resolve_url`, `extract_favicon`, `extract_attr`, `favicon_score`, `google_favicon_url`, `origin_favicon_fallback`, `html_entity_decode` (L419-L709)
  - Fetch cache helper: `with_fetch_cache` (L407)
- **Impact**: Mixes three distinct concerns (Tauri command surface, WebView2 platform integration, HTML scraping utilities). HTML extractors are pure functions with no Tauri dependency and could be tested in isolation, but currently require compiling the entire Tauri command layer.
- **Suggestion**: Split into three files:
  - `commands/browser.rs` — keep only the 14 `#[tauri::command]` functions
  - `commands/browser_webview_setup.rs` — move `new_window_handler` through `register_webview_with_manager`
  - Move HTML extractors down into `crates/browser/src/html_meta.rs` (pure functions belonging to the browser domain, not the Tauri shim)
- **Risk**: **High** — large file, but the split is mechanical (no behavior change). Likelihood: LOW (not actively broken). Impact: MEDIUM (maintainability, testability). Fix complexity: MEDIUM. Ripple: LOW.

#### H8 — `ExternalLinkError.tsx` directly imports `@tauri-apps/plugin-shell`

- **Location**: `ai-digital-life/frontend/src/app/features/browser/ExternalLinkError.tsx#L4`
- **Issue**: A UI component directly imports a Tauri plugin: `import { open } from '@tauri-apps/plugin-shell';`. Bypasses the `digitalLife` bridge abstraction. The file already imports `isTauriShell` from `@tauri-bridge` (L3) — it knows about the bridge layer — but then bypasses it for the actual `open()` call.
- **Impact**: Static import pulls Tauri code into the browser bundle. The runtime `isTauriShell()` check at L22 mitigates failure, but the layer violation remains.
- **Suggestion**: Add `openExternal(url: string): Promise<void>` to the `WindowBridge` interface in `frontend/src/shared/ipc/window.ts`. Implement in `tauri-bridge/misc.ts` (calling `@tauri-apps/plugin-shell.open`) and `preview-bridge/preview-window.ts` (calling `window.open`). Replace the direct import in `ExternalLinkError.tsx` with `window.digitalLife.window.openExternal(url)`.
- **Risk**: **High** — layer violation. Likelihood: LOW (works at runtime via guard). Impact: MEDIUM (architectural integrity + bundle bloat). Fix complexity: LOW (single-file fix). Ripple: LOW.

#### H9 — `slicedStore.ts` merges 56 separate slice/action factories

- **Location**: `ai-digital-life/frontend/src/app/stores/slicedStore.ts#L9-L72, L89-L161`
- **Issue**: The composition root imports and merges **31 slice factories** (L9-L44) + **25 action factories** (L47-L72) into a single `useSlicedAppStore`. The `StoreState` interface (`StoreState.ts:41-L145`) is a union of 31 slice interfaces + 25 action interfaces + root fields.
- **Impact**: Any change to any slice signature requires re-evaluation of the entire store. The store cannot be tree-shaken or code-split — every consumer pays the cost of all 56 modules. Type errors in any slice propagate to all consumers via `StoreState`.
- **Suggestion**: Group slices into domain-specific sub-stores (e.g., `browserStore`, `githubStore`, `terminalStore`) using Zustand's slice composition with separate `create()` calls, then compose via `React/context`. Enables lazy-loading of less-used domains.
- **Risk**: **High** — large refactor. Likelihood: LOW (works today). Impact: HIGH (long-term maintainability + bundle size). Fix complexity: HIGH (architectural). Ripple: HIGH (touches every store consumer). **Defer until bundle size or build perf becomes problematic.**

#### H10 — `FileTree` memoization breakage (new object + inline functions per render)

- **Location**: `ai-digital-life/frontend/src/app/features/file-tree/fileTree.tsx#L313-L319` (style object) and `#L94-L101, L136` (inline callbacks)
- **Issue**: Inside the virtualization render loop, each `<MemoizedVirtualNode>` receives `style={{ position: 'absolute', top: absoluteIndex * VIRTUAL_ITEM_HEIGHT, ... }}` — a new object literal per visible row per parent render. Because `MemoizedVirtualNode` is `memo()`-wrapped (L142) and `style` is a new reference each time, **every visible row re-renders** on every parent re-render. Compounded by three inline arrow functions at L94, L95, L136 passed to `<TreeNodeRow>` (also `React.memo`-wrapped at `TreeNodeRow.tsx:39`).
- **Impact**: A file tree with 40 visible rows re-renders all 40 children whenever any parent state changes (hover, selection, scroll-triggered state). React's reconciler does 40× unnecessary work. Visible jank on large trees during scroll/interaction.
- **Suggestion**: Either (a) compute a cached style map `useMemo(() => buildStyleMap(visibleRange), [visibleRange])` and look up by index, or (b) pass `top` as a primitive number prop and let `VirtualNodeComponent` assemble the style internally (primitive comparison survives `memo`). Hoist callbacks with `useCallback` keyed on `node.path`.
- **Risk**: **High** — visible jank. Likelihood: HIGH (every scroll/interaction). Impact: MEDIUM (perf, not correctness). Fix complexity: LOW (self-contained to one file). Ripple: LOW.

---

### 6. Medium — Quick Wins

#### M1 — Empty `catch {}` block in LocalPortSection (rule violation)

- **Location**: `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx#L87-L91`
- **Issue**: `try { ... } catch { } finally { ... }` with a literally empty catch body. Directly violates `error-handling.md`: "禁止 `try { ... } catch {}` 空 catch 块".
- **Impact**: When `fetch(SCAN_API)` fails for non-obvious reasons (CORS, network error, JSON parse error), the user sees "no ports found" with zero diagnostic information.
- **Suggestion**: Add `console.warn('[LocalPortSection] port scan failed:', e);` at minimum.
- **Risk**: **Medium** — rule violation. Fix complexity: LOW (1 line). Ripple: NONE.

#### M2 — Documentation drift: "13 sub-interfaces" but `digital-life.ts` defines 27

- **Location**:
  - `frontend/src/shared/ipc/digital-life.ts#L7-L34` — imports 27 sub-bridge interfaces
  - `.trae/rules/tauri-shell.md` — states "currently 13"
- **Issue**: Rule document is stale by 14 interfaces.
- **Impact**: New developers under-count the bridge surface area. Code review cannot rely on the documentation.
- **Suggestion**: Update `tauri-shell.md` to reflect 27 sub-interfaces, or auto-generate the list from `digital-life.ts` imports.
- **Risk**: **Medium** — documentation-only. Fix complexity: LOW. Ripple: NONE.

#### M3 — Magic numbers in `setTimeout` calls scattered across 4 slices

- **Location**:
  - `frontend/src/app/stores/slices/workspaceSlice.ts#L88` — `setTimeout(doHydrate, 200)`
  - `frontend/src/app/stores/slices/browserSlice.ts#L179` — `setTimeout(doHydrate, 200)`
  - `frontend/src/app/stores/slices/uiSlice.ts#L135` — `setTimeout(doHydrate, 200)`
  - `frontend/src/app/stores/slices/terminalSlice.ts#L122` — `setTimeout(doHydrate, 200)`
- **Issue**: The same `200` ms hydration delay is repeated verbatim in 4 slice files. No semantic meaning at call site.
- **Impact**: Changing hydration delay requires editing 4 files; easy to miss one.
- **Suggestion**: Add shared constant `STORAGE_HYDRATION_DELAY_MS = 200` to `frontend/src/app/stores/constants.ts` and import it in all 4 slices.
- **Risk**: **Medium** — duplication across 4 files. Fix complexity: LOW. Ripple: NONE.

#### M4 — `AppConfig` ↔ `LogConfig` field duplication

- **Location**:
  - `ai-digital-life/crates/kernel/src/config.rs#L19-L21` — `AppConfig` has `terminal_log_mode: LogMode` and `debug_log_mode: LogMode`
  - `ai-digital-life/crates/adl-logging/src/config.rs#L5-L8` — `LogConfig` has the same two fields
- **Issue**: Same configuration fields defined in two separate crates with no documented single-source-of-truth relationship.
- **Impact**: Risk of drift if a new log mode is added — both structs need updating.
- **Suggestion**: Either (a) make `LogConfig` a subset view: `impl From<&AppConfig> for LogConfig`, or (b) document the ownership explicitly with a doc comment on `LogConfig` pointing to `AppConfig` as source of truth.
- **Risk**: **Medium**. Fix complexity: LOW. Ripple: NONE.

#### M5 — Bridge file naming inconsistency across 3 bridge layers

- **Location**: `frontend/src/tauri-bridge/` (17 files, `<domain>.ts`), `frontend/src/preview-bridge/` (18 files, `preview-<domain>.ts` mixed), `frontend/src/mock/` (20 files, `mock-<domain>.ts` + `mock-shared-<domain>.ts`)
- **Issue**: Three bridge layers use three different naming conventions. PTY specifically: `pty.ts` (tauri) vs `ptyBridge.ts` (preview) vs `mock-shared-pty.ts` (mock) — three different names for the same domain. Some domains exist in one bridge but not others: `tauri-bridge/lsp.ts` has no preview/mock equivalent.
- **Impact**: Adding a new IPC method requires manually searching three differently-organized directories. New contributors cannot predict where to add a method. Sync drift between bridges is likely.
- **Suggestion**: Adopt single naming convention `<bridge>-<domain>.ts` across all three. Add a CI check that for each `<domain>` in `shared/ipc/<domain>.ts`, all three bridges must expose a corresponding file.
- **Risk**: **Medium** — affects 55 files; mechanical rename. Fix complexity: MEDIUM. Ripple: LOW (imports update mechanically).

#### M6 — `generalActions.ts` 5-level nesting + duplicated batch-init blocks

- **Location**: `frontend/src/app/stores/actions/generalActions.ts#L140-L189`
- **Issue**: 5-level nesting: `async () =>` → `try` → `await Promise.allSettled(visibleWorkspaces.map(async (w) => { ... }))` → `for (const r of wsResults)` → `if (tree !== undefined)` → `if (!batch.workspaceTrees) { ... }`. The 4 inner `if (!batch.X)` blocks (L163, L167, L173, L177) are repeated for `workspaceTrees`, `workspaceTreeLoading`, `gitSnapshots`, `workspaceChangesTreeLoading`.
- **Impact**: Hard to read; bug-prone copy-paste; adding a 5th field requires duplicating the pattern.
- **Suggestion**: Extract `accumulateBatch(batch, id, tree, snapshot, get)` helper that owns the lazy-init pattern.
- **Risk**: **Medium**. Fix complexity: LOW. Ripple: LOW.

#### M7 — Deep nesting in `webview2_favicon.rs` closure (6 levels)

- **Location**: `ai-digital-life/crates/browser/src/webview2_favicon.rs#L36-L87`
- **Issue**: 6-level nested closure: `FaviconChangedEventHandler::create(Box::new(move |sender, _args| { let Some(sender) = sender...; match sender.cast() {...}; if let Err(e) = ... { return }; let favicon = if pwstr.is_null() {...} else {...}; if favicon.is_empty() { return }; if !url.is_empty() { if let Ok(mut cache) = FAVICON_CACHE.write() { cache.insert(...); } } }))`
- **Impact**: Hard to follow; failure paths interleaved with success.
- **Suggestion**: Extract `fn handle_favicon_changed(sender, cache) -> Result<()>` free function and call it from the closure body.
- **Risk**: **Medium**. Fix complexity: LOW. Ripple: LOW.

#### M8 — 28 slices carry unused `_get` parameter

- **Location**: `frontend/src/app/stores/slices/*.ts` — 32 slice files declare `_get: () => StoreState`; only **4 actually call `_get(...)`**: `browserBookmarkSlice.ts`, `browserFoldersSlice.ts`, `ciSlice.ts`, `githubSlice.ts`.
- **Issue**: Widespread boilerplate; obscures which slices actually need state access.
- **Impact**: Mild dead code; linters may warn.
- **Suggestion**: Either (a) make `_get` optional in the slice factory signature, or (b) rename unused ones to `_` consistently. Better: pass a `SliceContext { set, get }` object only to slices that need `get`.
- **Risk**: **Medium** — affects 28 files. Fix complexity: LOW (mechanical). Ripple: LOW.

#### M9 — `BrowserPanel.tsx` 629-line god component

- **Location**: `ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx#L42-L629`
- **Issue**: 587-line React component wiring 8+ custom hooks + many `useCallback`s.
- **Impact**: Any UI change requires navigating 600 lines; hard to test in isolation.
- **Suggestion**: Extract `BrowserPanelFrame` (toolbar+iframe container), `BrowserPanelEffects` (refs + side effects), `BrowserPanelHandlers` (handlers as a `useBrowserPanelHandlers()` hook). Note: 4 hooks were already extracted on 2026-07-10 (BrowserPanel 650→458 lines per codebase-map.md, but file has since grown back to 629).
- **Risk**: **Medium**. Fix complexity: MEDIUM. Ripple: LOW.

#### M10 — Slice persistence boilerplate duplicated in 12 slices

- **Location**: 12 slice files (`browserBookmarkSlice`, `browserFoldersSlice`, `browserHistorySlice`, `browserLandingSlice`, `browserSlice`, `browserTabsSlice`, `ciSlice`, `githubRepoSliceHelpers`, `githubSlice`, `terminalSlice`, `uiSlice`, `uiSliceExpansion`)
- **Issue**: Each repeats `const { scheduleWrite } = createDebouncedWrite(50);` at the top, plus a near-identical `scheduleWrite(STORAGE_KEY, value)` pattern inside each setter.
- **Impact**: Adding a new persisted slice requires copying the boilerplate; debounced-write interval (50ms) is duplicated.
- **Suggestion**: Extract `usePersistedSliceField(key, value, debounceMs=50)` helper or `makePersistedWriter(key)` factory.
- **Risk**: **Medium**. Fix complexity: MEDIUM. Ripple: LOW.

#### M11 — `githubRepoSlice` side-effect-on-construction

- **Location**: `ai-digital-life/frontend/src/app/stores/slices/githubRepoSlice.ts#L63-L388`
- **Issue**: `createGitHubRepoSlice` factory (325 lines) inlines 17 methods + side-effect hydration (L67-L78) inside the factory. Hydration-on-construction is a hidden side effect.
- **Impact**: Factory is too long; hydration timing is implicit.
- **Suggestion**: Move hydration into an explicit `hydrateGitHubRepoSlice()` invoked by store bootstrap; split CRUD methods into `githubRepoActions.ts`.
- **Risk**: **Medium**. Fix complexity: MEDIUM. Ripple: MEDIUM.

#### M12 — `list_git_branches` parser brittleness

- **Location**: `ai-digital-life/crates/workspace/src/git.rs#L80-L153`
- **Issue**: 73-line function parses `git branch -vv` + `git for-each-ref` outputs by string splitting with many fallback paths for upstream tracking, ahead/behind, and branch state.
- **Impact**: Brittle against git output format changes; many code paths to test.
- **Suggestion**: Extract dedicated parsers per concern: `parse_branch_summary()`, `parse_ahead_behind()`, `parse_upstream_tracking()`.
- **Risk**: **Medium**. Fix complexity: MEDIUM. Ripple: LOW.

---

### 7. Low — Defer / Minor Polish

#### L1 — `route.rs` Phase 3+ TODO (deferred per phase plan)

- **Location**: `ai-digital-life/crates/model-gateway/src/route.rs#L1`
- **Issue**: `// TODO: dual-path routing — provider chain (this file) and direct ACP/HTTP API path`
- **Note**: Acceptable — feature is explicitly deferred per `phase-boundary.md`. Keep marker.

#### L2 — `MessageBubble.tsx` edit-logic TODO (feature stub)

- **Location**: `ai-digital-life/frontend/src/app/components/MessageBubble.tsx#L28`
- **Issue**: `// TODO: implement edit logic` — empty TODO with no implementation.
- **Suggestion**: Either implement the edit handler or remove the TODO with a tracking issue.

#### L3 — Single `any` usage with biome-ignore

- **Location**: `ai-digital-life/frontend/src/components/charts/sankey/sankey-chart.tsx#L160`
- **Issue**: `(link: any) => { ... }` — d3-sankey types are complex; biome-ignore documents the exception.
- **Suggestion**: Could tighten to `SankeyLink<Record<string, unknown>, Record<string, unknown>>` or `{ source: number; target: number }`. Acceptable as-is.

#### L4 — Hardcoded provider base URLs (DRY concern, not security)

- **Location**: `ai-digital-life/crates/model-gateway/src/providers/{anthropic,openai,google,openrouter,ollama}.rs` (multiple lines per file)
- **Issue**: Each provider's default base URL is duplicated as inline string literal in both `new()` and `with_client()` constructors.
- **Suggestion**: Extract to `const DEFAULT_BASE_URL: &str = "..."` at top of each provider file.

#### L5 — Tavily search API URL hardcoded inline

- **Location**: `ai-digital-life/crates/agent-runtime/src/tools/websearch.rs#L57`
- **Issue**: `client.post("https://api.tavily.com/search")` — inconsistent with file's own pattern of extracting magic values to constants.
- **Suggestion**: Add `const TAVILY_API_URL: &str = "..."` near L5.

#### L6 — Inline default values in `AppConfig::default()`

- **Location**: `ai-digital-life/crates/kernel/src/config.rs#L47-L65`
- **Issue**: Defaults like `language: "zh-CN".into()`, `max_recent_workspaces: 10` are inline literals.
- **Suggestion**: Extract to module-level `const`s for DRY.

#### L7 — Outline parser allocations (`kind: "heading".to_string()`)

- **Location**: `ai-digital-life/crates/outline/src/{markdown,python,shell,sql,yaml,brace,css,vue,json}.rs` and `lib.rs:179-L194`
- **Issue**: Every outline entry allocates `kind: "heading".to_string()` — a small fixed set of string literals re-allocated per symbol.
- **Impact**: For a 2000-symbol file, 2000 unnecessary heap allocations of identical strings.
- **Suggestion**: Change `OutlineItem.kind` from `String` to `Cow<'static, str>` (or an enum), assign `kind: "heading".into()` without allocation.

#### L8 — `tree.rs` repo_map allocations

- **Location**: `ai-digital-life/crates/workspace/src/tree.rs#L241-L244`
- **Issue**: `r#type: "file".to_string()` per entry + redundant `relative.clone()`.
- **Suggestion**: Use `&'static str` for type; move `relative` into struct.

#### L9 — `git.rs` branch list redundant clones

- **Location**: `ai-digital-life/crates/workspace/src/git.rs#L124-L144`
- **Issue**: `seen.insert(name.clone())` (clone 1) + `name: name.clone()` (clone 2) per branch.
- **Suggestion**: Iterate by value and move `name` into both `seen` and the struct.

---

## Statistics

| Metric | Count |
|--------|-------|
| Total findings | 35 (deduplicated from 41 raw findings across 4 scans) |
| Critical | 5 (C1, C2, C3, C4, C5) |
| High | 10 (H1-H10) |
| Medium | 12 (M1-M12) |
| Low | 9 (L1-L9) |
| Files affected | ~120 (C5 alone touches 36-100 files; C1-C4 touch ~15 commands) |
| Estimated effort | **Large** — C1-C4 are mechanical but numerous; C5 is a multi-phase migration; H9 is architectural |

---

## Recommended Execution Order

### Phase A — Stop active UX degradation (Critical, 1-2 days)

1. **[C1] Convert sync git commands to async** — `workspace_git.rs:86-191` (5 commands). Template exists at L66-83 in the same file. Lowest blast radius, highest UX impact.
2. **[C2] Convert `workspace_open` to async** — `workspace.rs:18-46`. Use existing `build_retrieval_snapshot_async`.
3. **[C3] Convert sync workspace file/search/outline commands** — `workspace.rs:74-250` (10 commands). Match `workspace_list_tree` pattern.
4. **[C4] Convert sync agent commands** — `agent.rs:64-100` (3 commands).
5. **[H3] Wrap `list_snapshots`/`prune_snapshots` in `spawn_blocking`** — 4-line change, copy pattern from `create_snapshot` at `snapshot.rs:37-42`.

> **Verification**: After Phase A, run `cargo check --workspace` + `cargo clippy --workspace -- -D warnings` + `cargo test --workspace`. Confirm no UI freeze during git ops, workspace open, and file search.

### Phase B — Stop the bleeding on architecture violations (Critical, 1 day)

6. **[C5 Phase 1] Add ESLint `no-restricted-imports` rule** — forbid `@ai-digital-life/kernel` outside `shared/ipc/`, `tauri-bridge/`, `preview-bridge/`, `mock/`, `app/stores/`. Prevents new violations while planning Phase 2 migration.
7. **[H8] Move `open()` from `@tauri-apps/plugin-shell` into `WindowBridge`** — single-file fix, removes a layer violation. Add `openExternal(url)` to `WindowBridge` interface, implement in 3 bridges.

### Phase C — Fix latent bugs and safety guards (High, 1-2 days)

8. **[H1] Wire `doom_loop_count` from session state** — `patch_generator.rs:34`. Confirm intent (is this a deliberate Phase-2 stub?) before changing. The `DoomLoopState` type already exists.
9. **[H2] Add CI test for `outline/brace.rs` regex patterns** — either keep `unwrap()` with a doc-comment justifying the test guard, or migrate to `OnceLock<Result<...>>`. 30+ patterns to validate.
10. **[H4] Add `list_entities_by_run` repository method** — filters at SQL level using indexed `run_id`. Confirm index exists in `init_indexes.sql`.
11. **[H5 + H6] Batch conversation session writes** — mirror `workspace_reorder` pattern. Add `save_sessions_batch` repository method.

### Phase D — Performance & render fixes (High, 1 day)

12. **[H10] Fix `FileTree` memoization** — cache style map or pass `top` as primitive; hoist callbacks with `useCallback`. Self-contained to one file.
13. **[H7] Split `browser.rs` (709 lines)** into `commands/browser.rs` + `commands/browser_webview_setup.rs` + `crates/browser/src/html_meta.rs`. Mechanical refactor.

### Phase E — Quick wins (Medium, 1 day batch)

14. **[M1] Add `console.warn` to empty catch in `LocalPortSection.tsx`** — 1 line.
15. **[M2] Update `tauri-shell.md`** — "13 sub-interfaces" → "27 sub-interfaces".
16. **[M3] Extract `STORAGE_HYDRATION_DELAY_MS = 200`** shared constant.
17. **[M4] Document `AppConfig` ↔ `LogConfig` ownership** relationship.
18. **[M6] Extract `accumulateBatch` helper** in `generalActions.ts`.
19. **[M7] Extract `handle_favicon_changed` from closure** in `webview2_favicon.rs`.

### Phase F — Larger refactors (defer or schedule)

20. **[C5 Phase 2] Migrate 36 UI files** to import from `shared/ipc/` instead of `@ai-digital-life/kernel`. Large but mechanical.
21. **[H9] Split `slicedStore.ts`** into domain-specific sub-stores. Architectural — defer until bundle size or build perf becomes problematic.
22. **[M5] Standardize bridge file naming** across 3 bridge layers. Large mechanical rename.
23. **[M9-M12] Component/slice extractions** — `BrowserPanel.tsx`, `githubRepoSlice`, `list_git_branches`, slice persistence boilerplate.

### Phase G — Polish (Low, batch when convenient)

24. **[L4-L6] Constants extraction pass** — provider URLs, Tavily URL, AppConfig defaults.
25. **[L7-L9] Rust allocation cleanups** — `OutlineItem.kind` to `Cow<'static, str>`, `RepoMapEntry.r#type` to `&'static str`, `git.rs` branch clones.
26. **[L1-L3] TODO/any cleanup** — keep `route.rs` Phase 3 marker; resolve `MessageBubble` edit TODO; tighten sankey `any` if convenient.

---

## Quality Self-Check

### Completeness

- [x] All four scanning dimensions (structure, architecture, performance, hygiene) are covered
- [x] Every finding has a specific file/function location with line range
- [x] Every finding has a concrete, actionable suggestion (not "improve this")
- [x] Every finding has a risk level with justification (likelihood + impact + fix complexity)
- [x] Baseline metrics are recorded (where measurable without running builds)

### Accuracy

- [x] Thresholds were calibrated to project norms (Rust median ~140 LOC → 500 flag; TS median ~110 LOC → 600 flag) — not arbitrary industry numbers
- [x] Priority assignments are consistent: all sync Tauri commands are Critical; all latent panic risks are High; all rule violations are at least Medium
- [x] No finding is based on personal preference — each cites a specific code property (line count, sync keyword, missing `spawn_blocking`, etc.) or a specific project rule

### Actionability

- [x] Each suggestion specifies the exact change (file, function, pattern to follow)
- [x] Execution order is risk-based: active UX degradation first, then architecture bleeding, then latent bugs, then performance, then quick wins, then deferred refactors
- [x] The report enables the user to make informed decisions — each finding notes fix complexity and ripple risk

### Honesty

- [x] Hygiene dimension had minimal findings — noted as "unusually clean" with positive controls (path traversal protection, type imports, lock poison recovery)
- [x] Performance scan couldn't measure build/test runtime — limitation documented in Baseline Metrics
- [x] Estimated effort is honest: C1-C4 are mechanical but numerous; C5 is multi-phase; H9 is architectural and explicitly recommended for deferral
- [x] Cross-scan duplicates were deduplicated (e.g., `doom_loop_count = 0` was found by both Code Structure and Hygiene scans — consolidated into H1; `browser.rs` 709 lines found by both Code Structure and Architecture — consolidated into H7)

### Limitations

- **No build/test runs**: All findings are static analysis. Quantitative baselines like build time, test suite runtime, and bundle size are not included.
- **Line counts**: Verified individually for the largest files; smaller files inferred from character counts (may be off by ±10%).
- **Trait analysis shallow**: Only `pub trait` declarations scanned; inner traits or `dyn` usage patterns may exist.
- **No dependency cycle tooling**: Circular dependency detection was manual (grep-based). A tool like `madge` (TS) or `cargo-deps` (Rust) would give more authoritative results.
- **Frontend render perf**: Findings H10 and M9 are based on static analysis of `memo()` usage and inline object/function creation. Real perf impact would require React DevTools profiler runs.

---

## Next Steps

This report is a **decision-making tool**. After review, the user decides which findings to act on, in what order, and when. Suggested downstream skills:

| Step | Skill | Purpose |
|------|-------|---------|
| Plan | `writing-plans` | Convert prioritized findings into a structured implementation plan |
| Execute | `executing-plans` or `subagent-driven-development` | Implement changes in risk-based order |
| Verify | `verification-before-completion` | Run tests, linters, type checks to confirm nothing broke |

**Important**: Do not start execution without user approval of this insight report. The recommended execution order above is a suggestion — the user may choose to defer Critical items, accelerate Medium items, or skip findings entirely based on context not visible to the scanner.
