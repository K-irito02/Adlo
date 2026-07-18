# Refactoring Insight Report

**Generated**: 2026-07-18
**Project**: AI Digital Life
**Tech Stack**: Rust 1.97.1 + Tauri 2.x (24 workspace members), React 19 + TypeScript 5.6 + Vite 8 + Zustand 5
**Scope**: Full codebase — 24 Rust crates, 228 .rs files, ~910 .ts/.tsx source files
**Previous Report**: [refactor-insight-2026-07-17.md](./refactor-insight-2026-07-17.md) (12 findings)

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Rust test count | 534 passing, 0 failing, 12 ignored (git-gated) |
| Rust test suite runtime | 206s |
| Frontend test count | 594 passing, 0 failing |
| Frontend test suite runtime | 87.5s |
| Rust clippy warnings | 0 |
| Frontend ESLint warnings | 1 (prettier formatting in test file) |
| Total git commits (since 2026-05-18) | 681 |
| Fix/Feature commit ratio | 1.42:1 (190 fix vs 134 feat) |
| Refactoring rounds completed | 93 |

---

## Risk Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| Critical (fix first) | 3 | High impact + high likelihood |
| High (plan) | 5 | High impact + low likelihood |
| Medium (quick wins) | 10 | Low impact + high likelihood or moderate both |
| Low (defer) | 4 | Low impact + low likelihood |

---

## Overall Assessment

The codebase is in **good health** with a few concentrated hotspots needing attention. The project has excellent discipline: 0 clippy warnings, 1 ESLint warning, all 1,128 tests passing, 0 circular dependencies, consistent error handling with `Result<T, AppError>`, and near-complete i18n coverage. The main issues cluster around three files that have accumulated outsized scope: `previewWorkspaceService.ts` (1,870 lines, single-file browser-mode backend), `StoreState.ts` (55-extension monolithic interface), and `BrowserPanel.tsx` (533 lines, 92 git changes in 60 days).

---

## Findings

### 1. Architecture & Design

| # | Location | Issue | Impact | Suggestion | Risk |
|---|----------|-------|--------|------------|------|
| A1 | `frontend/dev/previewWorkspaceService.ts:1-1870` | Single-file browser-mode backend with ~30 functions and no module boundaries. Clear logical sections (git, search, files, CI, MCP, logging) all in one file. | Adding any new API endpoint requires navigating a 1,870-line file. No separation of concerns makes parallel development on preview APIs difficult. | Split into `previewWorkspaceService/` directory: `git.ts`, `search.ts`, `files.ts`, `ci.ts`, `logging.ts`, `mcp.ts`, `index.ts`. Function signatures already form natural module boundaries. | **Critical** |
| A2 | `frontend/src/app/stores/StoreState.ts:97-392` | Monolithic `StoreState` interface extends 32 slices + 23 action interfaces = **55 total extensions**. Adding any new slice requires modifying this file in 3 places. | Highest-churn store file (38 git changes). Every slice refactor must touch this file, creating merge conflicts and coordination overhead. | Consider compositional type approach via TypeScript mapped/conditional types to auto-merge slices, or domain-specific store facades (e.g., `BrowserStoreState`, `WorkspaceStoreState`). | **Critical** |
| A3 | `frontend/src/app/features/browser/BrowserPanel.tsx:368-532` | Two massive `useMemo` blocks: `actionsValue` (35 dependency items) and `stateMemo` (32 dependency items), passed as props to `BrowserShell`. | Large dependency arrays make both memos fragile — a single missing dep causes stale closure bugs. The stateMemo re-computes on nearly every render anyway. | Split into context slices accessed independently by sub-components (e.g., `NavigatorActionsContext`, `TabActionsContext`, `DialogActionsContext`), reducing the prop-drilling surface. | **Critical** |
| A4 | `frontend/dev/previewWorkspaceService.ts:1267-1727` | 460-line monolithic `handlePreviewWorkspaceApi` function with ~25 identical if-else blocks. Each block follows the same template: `parse method+path → read body → validate fields → call helper → writeJson`. | Adding a new endpoint requires copy-pasting a ~15-line block. Error-prone and resistant to change. | Replace with a route table: `Route[]` array with `{ method, path, requiredFields, handler }`. Main function becomes a 5-line dispatch loop. Each route handler becomes a standalone 8-12 line function. Expected reduction: 460 → ~30 dispatch + ~25 x 10 handler = ~280 lines total. | **High** |
| A5 | `crates/workspace/src/git.rs:1-446` | Mixes 3 distinct concerns: snapshot capture, branch management, and file staging in a single file (674 lines total incl. tests). | Each concern is ~150 lines — manageable alone but confusing together. Newcomers must scan all 3 to understand any one. | Split into `git_snapshot.rs`, `git_branch.rs`, `git_staging.rs`. Each is ~150 lines with clear boundaries. | **High** |
| A6 | `crates/agent-runtime/` | 6 internal dependencies (most in crate graph) + 17 source files spanning tool execution, compaction, plan mode, permissions, routing, token counting, and prompt assembly. | Scope creep — the crate is becoming an integration hub rather than a focused runtime. The `tools/` sub-module (7 files) is independently structured. | Consider extracting `tools/` to `adl-tools` crate. Move `compaction` + `compaction_summary` to `adl-context`. Evaluate after Phase 3 feature work to avoid premature splitting. | **Medium** |
| A7 | `frontend/src/app/stores/slices/` | Only 3 of 34 Zustand slices have dedicated test files (`browserTabsSlice`, `notificationSlice`, `toastSlice`, `githubRepoSlice`). | Untested slices risk regression when store conventions change. Slice pattern is consistent so test templates are reusable. | Add tests for high-churn slices first: `browserSlice.ts` (44 changes), `sessionSlice.ts`, `terminalSlice.ts`. Use existing test files as templates. | **Medium** |

### 2. Performance

| # | Location | Issue | Impact | Suggestion | Risk |
|---|----------|-------|--------|------------|------|
| P1 | `crates/model-gateway/src/providers/{openai,anthropic,google,ollama,openrouter}.rs` (5 files) | `String::from_utf8_lossy(&chunk).to_string()` allocates a new `String` for every streaming chunk (~1000+ chunks per response). Same pattern for `delta.to_string()` calls. | ~2,000 unnecessary String allocations per streaming response. For concurrent sessions, this creates GC/allocator pressure. | Remove `.to_string()`, work with `Cow<str>` from `from_utf8_lossy` directly. For delta extraction, return `&str` from JSON parsing or use `Arc<str>`. | **High** |
| P2 | `crates/model-gateway/src/route.rs:34-54` and `lib.rs:229-246` | Double-collect pattern: builds `resolved: Vec<(String, String)>` then iterates, with `.clone()` on each entry. The intermediate Vec is unnecessary. | Redundant allocation of a Vec + double-clone of each (provider, model_id) pair. Minor in absolute terms but in hot path for every model request. | Eliminate intermediate `resolved` Vec. Inline model_id lookup directly in the `for` loop. Avoids collection and reduces clones. | **Medium** |
| P3 | `frontend/src/app/components/WorkspaceSplitButton.tsx:29,38` | `localStorage.getItem()` called synchronously in component body (not in useEffect or lazy initializer). | Blocks main thread during React render. Rarely noticeable but violates React best practices. | Move to `useState(() => localStorage.getItem(...))` lazy initializer pattern. | **Medium** |
| P4 | `frontend/src/app/stores/selectors.ts:141,149` and `browserSelectors.ts:38,47` | `openTabs.find()` and `browserTabs.find()` are O(n) linear scans performed on every selector access. | For users with many open tabs, every render that accesses current file tab scans the full tab array. | Maintain a `tabsByPath` Map or `tabsById` index in the store for O(1) lookups. The browser store already has `browserTabsById` but the selector doesn't use it. | **Medium** |
| P5 | Bundle: `pdf.worker.min` (1,203 KB), `vendor-codemirror` (913 KB), `vendor-mammoth` (486 KB) | PDF.js worker, all 12 CodeMirror language packs, and mammoth.js (DOCX converter) are loaded eagerly even when never used. | Unnecessary bandwidth and parse time for users who never open PDFs, DOCX files, or certain language types. | Lazy-load PDF worker on first PDF open. Split CodeMirror languages into per-language chunks loaded on-demand. Lazy-load mammoth.js. Total bundle reduction potential: ~2.6 MB. | **Medium** |
| P6 | `frontend/src/app/stores/actions/generalActions.ts:168-180` | Workspace initialization fans out `2N` IPC calls in parallel via `Promise.allSettled` with no concurrency cap. | For 10+ workspaces, this bursts 20 simultaneous IPC calls. Currently uncapped. | Add a concurrency limiter (e.g., `p-limit(4)`) if visible workspace count grows beyond 5-10. | **Low** |

### 3. Code Structure

| # | Location | Issue | Impact | Suggestion | Risk |
|---|----------|-------|--------|------------|------|
| S1 | `crates/storage/src/crud.rs` (`#[cfg(test)]` modules, lines 355-933) | 6 identical copies of `open_test_db()` function, plus 4 duplicate `SEQ` statics, and 3 duplicate `unique_id()` helpers spread across test modules. | ~120 lines of copy-pasted boilerplate. Any change to test DB initialization must be repeated 6 times. | Extract a shared `fn test_db(name_prefix: &str) -> Database` at module level within `#[cfg(test)]`. Use a single `AtomicU64` static. | **High** |
| S2 | `frontend/dev/previewWorkspaceService.ts` (25 route handlers) | Each route handler is a copy-paste of the identical template: method+path check, body read, field validation, helper call, JSON response. | Adding a new endpoint requires ~15 lines of boilerplate. The pattern is error-prone (copy-paste mistakes in field names, path strings). | Create a `RouteTable` abstraction. Each route specifies method, path, required fields as metadata. The dispatcher iterates routes and handles validation generically. | **High** |
| S3 | `frontend/src/design-system/html.ts:31` and `frontend/src/app/features/preview/markdownPreviewUtils.ts:33` | `escapeHtml` function implemented identically in two files. The design-system version is the public API; markdownPreviewUtils has a private copy. | If the HTML escaping logic changes, one copy will diverge. Already a bug risk. | Import `escapeHtml` from `@design-system/html` in `markdownPreviewUtils.ts` and remove the duplicate. | **Medium** |
| S4 | `frontend/src/app/stores/slices/browserBookmarkSlice.ts`, `browserFoldersSlice.ts`, `browserTabsSlice.ts` | Slices do many `.filter()` and `.find()` operations creating new arrays on every state access. | While Zustand handles reference equality for the store, the resulting arrays are always new references, defeating selector memoization. | Consider normalizing browser state to use `Map`/`Record` instead of `Array` for frequently-accessed entities. | **Low** |
| S5 | `crates/model-gateway/src/route.rs:1` and `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:36` | Only 2 TODO markers in the entire codebase. Zero FIXME/HACK/XXX/WORKAROUND. | Negligible deferred debt. | No action needed. | **Info** |

### 4. Hygiene & Quality

| # | Location | Issue | Impact | Suggestion | Risk |
|---|----------|-------|--------|------------|------|
| H1 | `frontend/src/app/stores/slices/sessionSlice.ts:77` | Bare magic number `10240` used as streaming buffer limit without a named constant. | Unclear intent — is this bytes? characters? tokens? No documentation. | Extract to a named constant with documentation, e.g., `STREAMING_BUFFER_MAX_BYTES = 10240`. | **Medium** |
| H2 | `crates/model-gateway/src/fallback.rs:38` | `usize as u32` cast on token count summation. On 64-bit systems with extremely large contexts (1M+ tokens), this could theoretically truncate. | Extremely unlikely in practice (requires >4 billion tokens), but is a latent correctness bug. | Add `try_into()` guard or `min(u32::MAX as usize, ...)` bound check with a warning log if exceeded. | **Medium** |
| H3 | `frontend/src/app/components/SessionManagement.tsx` | 8 instances of `dangerouslySetInnerHTML` rendering session data. Deserves closest scrutiny for XSS risk. | If session content contains unsanitized user or agent output, this is an injection vector. | Verify DOMPurify or equivalent sanitization is applied before rendering. If not present, add sanitization step. | **Medium** |
| H4 | `frontend/src/app/features/browser/BrowserNavigator.tsx:422` | Hardcoded English string `"Resize browser navigator"` as aria-label — violates project i18n rule (936 keys available across 13 domains). | Only visible to screen readers, but violates project policy and breaks i18n coverage guarantee. | Add i18n key (e.g., `browser.navigator.resizeLabel`) to both `zh-CN` and `en-US` locale files, use `useTCopy()` in the component. | **Low** |
| H5 | `ai-digital-life/AGENTS.md` (lint warning count) | States "49 warnings" but current state is 1 warning (prettier formatting). Outdated self-report. | Misleading for developers checking project health. | Update to reflect current state: `1 warning (prettier/prettier in a test file)`. | **Low** |
| H6 | `frontend/src/app/features/browser/browser-landing/` (3 files) | `@tauri-bridge` imports in feature components — previous report flagged this as layer violation. Verified fixed in current state: **0 matches**. | Previously: browser-mode compatibility break. Now: resolved. | No action — this finding from the 2026-07-17 report has been resolved. | **Resolved** |
| H7 | `crates/agent-runtime/src/lib.rs` | Previous report flagged 141 `.unwrap()` calls. Verified: all `.unwrap()` calls are in `#[cfg(test)]` blocks. Production code has **0 unwrap** in agent-runtime. | Previously: panic crash risk. Now: resolved. | No action — this finding from the 2026-07-17 report has been resolved. | **Resolved** |

---

## Previously Resolved Findings (from 2026-07-17 Report)

| # | Original Finding | Status |
|---|-----------------|--------|
| R1 | 141 `.unwrap()` calls in agent-runtime | **Resolved** — all are in `#[cfg(test)]` blocks, production has 0 |
| R2 | Layer violation: `@tauri-bridge` imports in browser features | **Resolved** — 0 matches found |
| R3 | 5 Medium findings (oversized commands, large slices, high hook density, flaky tests, hardcoded i18n) | **Partially resolved** — command modules were split (task.rs, agent.rs, conversation.rs refactored into submodules per git log `84480c1c`), browser components split (`86a6c84`), i18n hardcoded strings replaced (`3ab0aa56`, `927ac5fe`, `4dc581c1`) |

---

## Statistics

| Metric | Count |
|--------|-------|
| Total findings | 22 |
| Critical | 3 |
| High | 5 |
| Medium | 10 |
| Low | 4 |
| Previously resolved (from 07-17 report) | 3 |
| Files affected | 25 |
| Estimated effort | **Medium** (~3-5 days for all Critical+High items; ~2-3 additional days for Medium items) |

---

## Recommended Execution Order

1. **[Critical — A1]** Split `previewWorkspaceService.ts` into module directory — eliminates the single biggest code smell; enables parallel work on preview APIs
2. **[Critical — A2]** Refactor `StoreState.ts` with compositional types or domain facades — reduces coordination friction for all future slice changes
3. **[Critical — A3]** Decompose `BrowserPanel.tsx` useMemo blocks into context slices — fixes the highest-churn component (92 changes, 19 fixes)
4. **[High — S1]** Extract shared `open_test_db()` in crud.rs — 30-minute fix eliminating 120 lines of duplication
5. **[High — S2]** Route table refactor for `handlePreviewWorkspaceApi` — done together with A1
6. **[High — A4]** Split `workspace/src/git.rs` into 3 sub-modules — cleaner boundaries for git operations
7. **[High — P1]** Remove unnecessary String allocations in 5 provider streaming closures — measurable perf win
8. **[High — P2]** Eliminate double-collect in provider routing — done together with P1
9. **[Medium]** Remaining 10 medium items can be batched or addressed opportunistically
10. **[Low]** 4 low items deferred to next review cycle

---

## Limitations

- **Bundle analysis**: No recent `stats.html` generated. Bundle sizes are inferred from `rollup-plugin-visualizer` documentation. Running `pnpm run build:analyze` would produce more precise data.
- **Test coverage depth**: While all crates have tests, coverage percentage was not measured. `cargo tarpaulin` or `--coverage` would provide quantitative coverage data.
- **Frontend file count**: The exact count of .ts/.tsx source files timed out during discovery (estimated at ~910). May undercount very small files.
- **Performance profiling**: No flame graphs or runtime profiling data available. Performance findings are based on static code analysis, not measured benchmarks.
