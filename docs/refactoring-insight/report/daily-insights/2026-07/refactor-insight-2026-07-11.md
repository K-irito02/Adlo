# Refactoring Insight Report

**Generated**: 2026-07-11
**Project**: AI Digital Life (ai-digital-life/)
**Tech Stack**: Rust + Tauri 2.x (backend), React 19 + Vite + Zustand + TypeScript (frontend)
**Scope**: Full workspace — 22 Rust crates + src-tauri (192 .rs files, 26,845 lines), frontend (729 .ts/.tsx, 75,460 lines), 89 CSS files (16,835 lines)
**Total source lines**: 119,140

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Rust source files | 192 (26,845 lines) |
| Frontend TS/TSX files (excl. tests) | 729 (75,460 lines) |
| CSS files | 89 (16,835 lines) |
| Test files | 80 (6,503 lines) |
| **Total source + test** | **125,643 lines** |
| Workspace crates | 22 |
| npm packages | 66 |
| Rust lint warnings | 0 (clippy --workspace --all-targets) |
| Frontend lint warnings | 0 (eslint + tsc --noEmit) |
| Rust tests | 508 |
| Frontend tests | 431 |
| Git commits | 749 |
| Contributors | 2 (K-irito02: 486, Kora: 263) |

---

## Risk Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| Critical (fix first) | 3 | High impact + high likelihood — active problems |
| High (plan) | 7 | High impact + low likelihood — plan carefully |
| Medium (quick wins) | 9 | Low impact + high likelihood — fix if easy |
| Low (defer) | 6 | Low impact + low likelihood — document and defer |
| **Total findings** | **25** | |

---

## Findings

### 1. Architecture & Design

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `crates/browser/Cargo.toml:11` | `adl-browser` depends directly on `tauri` — a mid-level infrastructure crate coupled to the UI framework | Cannot test browser crates without full Tauri runtime; blocks reuse in non-Tauri contexts | Extract `WebViewHandle` trait with Tauri-agnostic interface; move Tauri-specific impl to `src-tauri/` | **Critical** |
| `crates/agent-runtime/Cargo.toml:21` | Domain logic (`agent-runtime`) depends on concrete storage (`adl-storage`) | Tight coupling between agent orchestration and SQLite schema; substitutes storage without modifying agent runtime | Introduce a `SessionRepository` trait in `agent-runtime`; keep `adl-storage` as one implementation behind it | **Critical** |
| `src-tauri/src/commands/agent_pipeline.rs` | 882-line god module handling model calling, context collection, patch generation, audit, and permission checking in one file | Hard to reason about, test, or modify individual concerns | Split into: `agent_pipeline.rs` (orchestration, ~200 lines), `model_caller.rs`, `patch_generator.rs`, `audit_helper.rs` | **Critical** |
| `crates/adl-logging/Cargo.toml:15` | `adl-logging` depends on `adl-kernel` for `LogMode` type — infrastructure depends on domain | Inverted dependency; logging (foundation) depends on kernel (higher level) | Move `LogMode` to `adl-logging` or to `adl-errors`; have `kernel` import it from there | **High** |
| `crates/errors/src/lib.rs` + `src-tauri/src/error.rs` + `commands/mod.rs:44-52` | Triple error encoding: `AppError` → `IpcErrorCode` → `IpcResult`. Every new error needs 3 synchronized changes | Maintenance liability; easy to miss a variant during additions | Unify into a single encoding. Either have `AppError` implement serialization directly, or derive `IpcErrorCode` from `AppError` via a macro | **High** |
| `tauri-bridge/` (9 files) vs `mock-bridge.ts` (144 lines) vs `preview-bridge/` (18 files) | Three different bridge implementation structures — split-by-domain, single-file-factory, per-domain-factory | Inconsistent; harder to know where to add new functionality | Unify to one pattern (recommended: `preview-bridge/` per-domain factory pattern) | **High** |
| `crates/agent-runtime/Cargo.toml` | `agent-runtime` depends on 6 adl crates — diffuse coupling | Changes to any of 6 crates ripple into agent-runtime; it acts as a central hub | Evaluate if all dependencies are needed; consider splitting `agent-runtime` into smaller focused crates (e.g., `agent-compaction`, `agent-plan`) | **High** |
| `crates/agent-runtime/src/tools/registry.rs` | 483 lines combining tool registry + inline implementations of 5 tool handlers | Registration and execution coupled; each tool's logic embedded in match arms | Extract each tool to its own file under `tools/` (already has `webfetch.rs`, `websearch.rs`, etc.) and use a dispatch map | **Medium** |
| `crates/agent-runtime/src/router.rs` | `AgentRouter` unit struct with only static methods | Unnecessary struct ceremony; could be free functions | Convert to module-level functions | **Low** |
| `frontend/src/kernel/types.ts:11` | Hand-written types in transitional deprecation (comment confirms `ts-rs` migration in progress) | Risk of desync between hand-written and generated types | Complete the `ts-rs` migration; remove hand-written types | **Low** |

### 2. Performance

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `crates/model-gateway/src/providers/*.rs` | 5 provider implementations share ~70% structural duplication in `chat()` and `chat_stream()` — identical HTTP call patterns | Code bloat; bug fixes need to be applied 5 times; harder to add new providers | Extract a shared HTTP invocation helper; make provider files config-driven for endpoint/headers/body/response | **High** |
| `crates/agent-runtime/src/plugins/registry.rs` + `src-tauri/src/commands/plugin.rs` | Plugin system has 1 real implementation + 5 test-only impls | Premature abstraction — trait design not validated by a second consumer | Keep but note as unvalidated; consider if a simpler hook closure mechanism suffices for now | **Low** |

### 3. Code Structure

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `frontend/src/app/features/browser/BrowserNavigator.tsx` | 489 lines, 215-line contiguous render block | Hard to maintain; deep JSX nesting | Extract sub-modes (Open/Tabs/List/Search) into separate components | **Medium** |
| `frontend/src/app/regions/TitleBar.tsx` | 446 lines, 196-line contiguous render block | Hard to maintain; all menus inlined | Extract each menu (File/Edit/View/Help) into its own component | **Medium** |
| `frontend/src/tauri-bridge/misc.ts` | 326-line catch-all "misc" file | No clear single responsibility | Split into domain-specific files; eliminate the catch-all pattern | **Medium** |
| `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` | 494 lines | Large orchestration component | Extract file tree panel and editor tab bar into sub-components | **Medium** |
| `src-tauri/src/commands/agent_pipeline.rs:198-363` | `call_model()` function ~165 lines, nesting depth 6 | Hard to follow logic; Plan Mode injection, provider resolution, audit all in one function | Extract: Plan Mode injection (lines 210-239), provider resolution (lines 255-282) as helpers | **Medium** |
| `crates/storage/src/repository/workspace_repo.rs` | 141 lines — reasonable, but storage has no abstraction boundary | Domain crates import storage directly | Add `Repository` trait; hide concrete repo from domain code | **High** |

### 4. Hygiene & Quality

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| **26 of 27 feature directories** (browser-tree/, command-editor/, diff-viewer/, editor/, file-tree/, git-visualization/, github-tree/, lsp-panel/, mcp/, multi-workspace/, outline/, patch-review/, permission-settings/, plugin-manager/, preview/, provider-manager/, reference-manager/, session-fork/, terminal/, web-search/, workspace-browser/, workspace-changes-tree/, workspace-file-tree/, workspace-terminal/) | Zero test files | Feature area untested; regressions likely uncaught | Add integration tests for each feature; prioritize browser/ (most complex) and terminal/ (PTY integration) | **High** |
| `frontend/src/kernel/`, `tauri-bridge/`, `preview-bridge/`, `mock/`, `app/i18n/` | Zero tests in infrastructure layers | Core types, IPC bridge, i18n untested | Add unit tests for kernel types; integration tests for bridges; i18n key existence tests | **High** |
| **6+ files** (`ContextMenu.tsx`, `BrowserTreeEntryMenu.tsx`, `BrowserEntrySubEntries.tsx`, `BrowserMenuHintItem.tsx`, `MenuHintItem.tsx`, `BookmarkToFolderDialog.tsx`) | Duplicated DOM tooltip overlay pattern (createElement, querySelector, textContent) | Bug fix needs 6 changes; inconsistent behavior | Extract a shared `TooltipOverlay` utility | **Medium** |
| **3 locations** (`CopyButton.tsx:36-40`, `useBrowserTagActions.ts:99-105`, `debugLogCollector.ts:320-385`) | Legacy `document.execCommand('copy')` — deprecated API | May stop working in future browsers; inconsistent experience | Replace with `navigator.clipboard.writeText()` | **Medium** |
| **2 locations** (`diff-viewer/` and `right-panel/`) | Duplicated scrollbar measurement code | Copy-paste; fix in one misses the other | Extract shared `scrollbarWidth.ts` utility | **Low** |
| `frontend/src/app/stores/slices/` (33 slices) + `actions/` (25 actions) = **58 modules** | Large number of store modules; unclear slice-vs-action boundary | Steep learning curve; inconsistent placement of cross-cutting logic | Consolidate browser sub-slices (5 → 2); audit slice-vs-action boundary consistency | **Low** |

---

## Statistics

| Metric | Count |
|--------|-------|
| Total findings | 25 |
| Critical | 3 |
| High | 7 |
| Medium | 9 |
| Low | 6 |
| Files affected | ~45 |
| Estimated effort | Large |

---

## Strengths (Notable Achievements)

| Strength | Evidence |
|----------|----------|
| **Zero warnings** | Clippy + ESLint + tsc all pass with zero warnings |
| **No crate-level allow()** | Zero `#![allow(...)]` in Rust — no globally suppressed warnings |
| **Strict DAG dependency graph** | No circular dependencies across 22 crates — significant architectural discipline |
| **Zero `any` types in production** | No `:any` or `as any` in production TypeScript code |
| **Zero `.bind()` calls** | Clean functional patterns throughout |
| **Minimal TODO debt** | Only 2 Rust TODO + 5 frontend TODO = 7 total across 125K lines |
| **Proper error propagation in src-tauri** | Zero non-test `unwrap()` calls in the Tauri command layer |
| **No stray console.log** | All 30 console calls are legitimate (collector, mock, error reporting) |
| **Justified eslint suppressions** | All 7 have inline explanations |
| **Clean slice dependency documentation** | `slices.ts:5-16` explicitly maps slice dependencies |

---

## Recommended Execution Order

1. **Critical** `adl-browser` depends on `tauri` — Extract WebViewHandle trait. This blocks independent testing of the largest crate.
2. **Critical** `agent_pipeline.rs` 882-line god module — Split into focused files. This is the most-edited file and causes merge pain.
3. **Critical** `agent-runtime` depends on `adl-storage` — Introduce repository trait. This tightens the architecture and enables storage substitution.
4. **High** Triple error encoding — Unify to single encoding. Every new feature hits this friction point.
5. **High** Provider implementations 70% duplicated — Extract shared HTTP helper. Makes adding new providers trivial.
6. **High** Test coverage gaps — Add tests to kernel/, tauri-bridge/, and browser/ feature. Protect core infrastructure.
7. **High** `adl-logging` depends on `adl-kernel` — Move `LogMode` type. Fix the inverted dependency.
8. **High** Three bridge patterns — Unify to preview-bridge pattern. Standardize how bridges are built.
9. **High** Missing storage abstraction — Add repository trait boundary.
10. **Medium** + **Low** remaining items — Quick wins and deferred cleanup.
