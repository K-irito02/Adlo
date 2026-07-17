# Refactoring Insight Report

**Generated**: 2026-07-17
**Project**: AI Digital Life (ADL)
**Tech Stack**: Rust (Tauri 2.x, tokio) + TypeScript (React 19, Vite 8, Zustand 5)
**Scope**: Full workspace — `ai-digital-life/` (Rust workspace with 25 crates + frontend with 780 TS/TSX files)

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Rust test count | 534 passed, 0 failed, 12 ignored |
| Rust test runtime | 3m 40s |
| Frontend test count | 572 passed, 8 failed (timeouts) |
| Frontend test runtime | 121s |
| Total test count | 1,106 |
| ESLint warnings | 0 (clean) |
| Clippy warnings | Could not measure (toolchain cache issue) |
| Rust source files | 150 `.rs` files (median ~4.7 KB) |
| Frontend source files | 780 `.ts`/`.tsx` files (median ~1.3 KB) |
| TODO/FIXME/HACK markers | 3 |
| Git commits (main) | 974 |
| Refactoring rounds completed | 93 |

---

## Risk Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| Critical (fix first) | 1 | High impact + high likelihood |
| High (plan) | 2 | High impact + lower likelihood, or high likelihood with moderate impact |
| Medium (quick wins) | 6 | Moderate impact, fixable in reasonable time |
| Low (defer) | 3 | Low impact, low likelihood, or cosmetic |

---

## Findings

### 1. Architecture & Design

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `frontend/src/app/features/browser/` (8 files) | Layer violation: feature files import `@tauri-bridge` directly (`useBrowserIframeState.ts`, `useBrowserMetaSubscription.ts`, `useBrowserNavigation.ts`, `useBrowserPanelMenuItems.ts`, `useBrowserPool.ts`, `useWebViewBounds.ts`, `useWebViewLifecycle.ts`, `useWebViewVisibility.ts`) | Browser-mode compatibility breaks if tauri-bridge API changes. The architecture rule mandates features go through `shared/ipc/`. Currently 8 files bypass this, creating a maintenance trap. The project's dual-bridge pattern (tauri-bridge + preview-bridge) is undermined. | Extract `isTauriShell` checks into a shared utility in `shared/env.ts`. Refactor browser hooks to accept environment flags via context or props, not direct tauri-bridge imports. | **Critical** |
| `frontend/src/app/features/browser/BrowserPanel.tsx` | God component: 567 lines, 23 imports, 73 git commits in ~6 weeks (most changed file) | Single component handles toolbar, URL bar, tabs, iframe stack, navigation, bookmarks, and context menus. Makes it brittle — any change risks unrelated functionality. Hotspot status indicates ongoing churn amplifying risk. | Split into smaller focused sub-components: `BrowserShell` (layout), `BrowserToolbarArea` (toolbar + URL + nav), `BrowserContentArea` (tabs + iframe). Each under 300 lines. | **High** |
| `frontend/src/app/features/editor/CodeEditor.tsx` | God component: 20 imports | Single editor component imports from CodeMirror, themes, store slices, actions, and utility modules. Editor setup, keybindings, fold gutter, lint, and completion all in one file. | Split editor setup concerns into focused hooks: `useCodeMirrorSetup`, `useEditorKeybindings`, `useEditorLint`. Keep `CodeEditor.tsx` as a thin orchestration layer. | **High** |
| `src-tauri/src/commands/task.rs` (566 lines), `agent.rs` (422), `conversation.rs` (410) | Oversized command modules: top 3 total ~1,400 lines | Tauri command modules handle routing, validation, business logic, and error mapping in single files. Reduces testability and makes parallel development harder. | Split each into `mod.rs` (routing) + `handlers.rs` (business logic) + `validation.rs` (input checks). The `agent_pipeline/` directory pattern (already exists) is the right model — extend it. | **Medium** |
| `frontend/src/app/stores/StoreState.ts` (366 lines), `githubRepoSlice.ts` (345), `terminalSlice.ts` (339), browser slices total (1,521 lines across 6 files) | Large store slices with high line counts | Large Zustand slices mix type definitions, state logic, and computed values. Browser-related logic is particularly fragmented across 6 separate files (browserSlice, browserFoldersDeletion, browserBookmarkHelpers, browserFoldersSlice, browserBookmarkSlice, browserTabsSlice). | Consider merging closely related browser slices into fewer, well-organized files. Extract shared types from `StoreState.ts` into domain-specific type files. | **Medium** |
| `stacked_bar_chart_index.tsx` (charts) | Chart components dominate the "largest file" list (7 of top 10) | Charts are the most line-heavy area at 852/701/692/640/636/609 lines each. These may be inherently complex visualization code, but the size suggests potential for decomposition. | Evaluate if chart components can share a common base (axes, tooltips, legends are already somewhat extracted). Consider extracting data processing into pure utils separate from rendering. | **Low** |

### 2. Performance

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `frontend/src/` (8 feature components with >10 hooks each) | High hook density: `BrowserLandingPage.tsx` (16 hooks), `WorkspaceFileTreeEntry.tsx` (15), `fileTree.tsx` (14), `BrowserEntrySubEntries.tsx` (13) | Components with >10 hooks are likely doing too much in render phase. Excessive `useEffect`/`useMemo`/`useCallback` chains create render-time overhead and make re-render debugging harder. | Audit hook usage: identify `useEffect` calls that can be collapsed, `useMemo` with trivial computations, and `useCallback` wrappers that don't actually prevent re-renders. | **Medium** |
| `frontend/src/app/features/browser/BrowserPanel.tsx` (23 imports), `CodeEditor.tsx` (20) | High import counts increase module graph size | Every import adds to the module dependency graph. Components with 20+ imports pull in significant dependency trees, affecting cold start and HMR times. | Split components (per architecture finding above). Use dynamic imports for rarely-used sub-features. | **Low** |
| `shared/ipc/index.ts` (30 re-exports), `right-panel/hooks/index.ts` (27) | Large barrel files | Barrel files with 27+ re-exports mean importing any single symbol pulls the entire module graph of all re-exported modules. Vite handles this with tree-shaking, but during development every barrel import triggers module resolution for all re-exports. | Split IPC barrel into domain-specific barrels (`ipc/workspace.ts`, `ipc/conversation.ts`, etc.) rather than one monolithic re-export. Reduce `right-panel/hooks/index.ts` to only export commonly-used hooks. | **Low** |

### 3. Code Structure

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `crates/storage/src/crud.rs` (934 lines) | Largest Rust file — 2.8x the next largest (workspace/src/git.rs at 674) | An 934-line file in a Rust codebase is a strong signal of too many responsibilities. CRUD operations for all entity types in one file creates merge conflicts and makes finding specific operations harder. | Split by entity: `crud/workspace.rs`, `crud/conversation.rs`, `crud/session.rs`, etc. with a `crud/mod.rs` re-export. | **Medium** |
| `crates/agent-runtime/src/lib.rs` (141 unwrap calls) | Excessive unwrap concentration | 141 of 347 total `.unwrap()` calls (40.6%) in a single file. This is a correctness risk — any unexpected `None`/`Err` at runtime causes a panic crash. The file has no doc comments or tests proportionate to its risk profile. | Replace with proper error propagation using `?` operator and `anyhow::Context` or `thiserror`. At minimum, convert to `.expect("descriptive message")` with context for debugging. | **Critical** |
| `crates/workspace/src/git.rs` (27 unwrap), `crates/storage/src/crud.rs` (18 unwrap + 27 expect = 45 total) | Secondary unwrap/expect hotspots in critical infrastructure | Git operations and database CRUD are failure-prone areas. Panics here cause data loss or corrupted state. The `expect` calls in `crud.rs` (27) are particularly concerning — many are likely SQL query results that could fail for legitimate reasons. | Replace with `?` propagation. Add `anyhow::Context` with descriptive messages. Consider introducing a `RepositoryResult<T>` type for storage operations. | **High** |
| `frontend/test/` (8 timeout failures) | Flaky tests: `GitVisualizationView.test.tsx` (3 tests × 15s timeout), `fetchPageMeta.test.ts` (2 × 5s), `CalendarHeatmap.test.tsx` (1 × 5s), `ClockHeatmap.test.tsx` (1 × 5s), `store.test.ts` (1 × 5s) | 8 of 580 tests (1.4%) fail consistently with timeouts. These create CI noise and mask real failures. The 15s timeouts on `GitVisualizationView` tests suggest either real performance issues or async test setup problems. | Investigate root cause: add shorter timeouts with specific assertions to identify where tests hang. For `GitVisualizationView`, check if there's an SVG rendering bottleneck. Fix or remove flaky tests. | **Medium** |

### 4. Hygiene & Quality

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `frontend/src/app/` (~15 component locations) | Hardcoded UI strings not using i18n — aria-labels and display text in `RunSummaryBlock.tsx`, `EnvironmentControls.tsx`, `SessionManagement.tsx`, `TitleBar.tsx`, `LeftSidebar.tsx`, `RightPanel.tsx`, `FileNavigatorShell.tsx`, `ComposerFooter.tsx` | Violates the project's own rule: "any UI display text must use i18n key." With 936 i18n keys across 13 domains, the infrastructure exists — these are omissions. Non-Chinese users see English-only strings in some UI elements. | Extract each hardcoded string into the appropriate i18n domain file (en-US + zh-CN). Add missing translations. | **Medium** |
| `crates/agent-runtime/src/lib.rs` (141 unwrap in production code) | See "Code Structure" — hygiene dimension | Production code should not contain `.unwrap()` calls outside of tests or provably-infallible positions. The volume (141) suggests code that was written rapidly without error handling. | Systematic audit of all `.unwrap()` calls in production Rust crates. Tag each as: (a) provably infallible → convert to `.expect("reason")`, (b) fallible → replace with `?`. | **High** |
| `crates/storage/src/crud.rs` (27 expect), `crates/storage/src/durable.rs` (8 expect) | Heavy `expect()` usage in storage layer | `expect("...")` is preferable to `unwrap()` (provides context) but still panics. Storage layer failures should be propagated as `Result` to the caller for graceful handling. | Replace with `?` + `anyhow::Context`. The storage layer should never panic on runtime errors. | **Medium** |
| `crates/adl-logging/src/Cargo.toml` | Potential self-dependency marker in `adl-logging` | Regex matching in scanning flagged a possible self-reference. If real, Cargo would reject it. | Verify Cargo.toml has no `adl-logging` in `[dependencies]`. (Likely false positive from scan regex matching `[package]` name field.) | **Low** |

---

## Statistics

| Metric | Count |
|--------|-------|
| Total findings | 12 |
| Critical | 2 |
| High | 3 |
| Medium | 5 |
| Low | 2 |
| Files affected | ~25 files directly, ~40 if barrel/import ripple effects included |
| Estimated effort | Large (multiple days of focused work) |

---

## Recommended Execution Order

1. **[Critical]** `crates/agent-runtime/src/lib.rs` — Replace 141 unwrap call — Highest correctness risk. Any runtime None/Err causes panic. Likely the source of the most impactful potential crashes in the application.

2. **[Critical]** Layer violation in `features/browser/` — Create `shared/env.ts` for `isTauriShell`, refactor 8 browser hooks. This restores architecture integrity and prevents browser-mode breakage.

3. **[High]** Secondary unwrap/expect hotspots — `crates/workspace/src/git.rs` (27 unwrap), `crates/storage/src/crud.rs` (45 total). Critical infrastructure (git + DB) should never panic.

4. **[High]** Split `BrowserPanel.tsx` — The most changed file in the project (73 commits), 567 lines, 23 imports. Breaks frequently during browser feature work. Splitting will reduce merge conflicts and improve team velocity.

5. **[High]** Split `CodeEditor.tsx` — 20 imports, editor setup in one monolithic component.

6. **[Medium]** Split `commands/task.rs`, `agent.rs`, `conversation.rs` — Follow existing `agent_pipeline/` pattern.

7. **[Medium]** Fix 8 flaky frontend tests — CI noise reduces confidence in test suite.

8. **[Medium]** Replace unwrap/expect in storage layer — `crates/storage/src/crud.rs` + `durable.rs`.

9. **[Medium]** Extract ~15 hardcoded i18n strings — Quick wins, infrastructure already exists.

10. **[Medium]** Audit high hook-density components — `BrowserLandingPage.tsx` (16 hooks), `WorkspaceFileTreeEntry.tsx` (15).
