# Refactoring Insight Report

**Generated**: 2026-07-10
**Project**: AI Digital Life (AI 数字生命)
**Tech Stack**: Rust 1.77+ / Tauri 2.x / React 19 / Vite 8 / TypeScript 5.6 / Zustand 5 / Vitest 3 / pnpm 11
**Scope**: `ai-digital-life/crates/` (22 Rust crates), `ai-digital-life/src-tauri/src/`, `ai-digital-life/frontend/src/`
**Excluded**: `.worktrees/` (duplicate worktree)

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Rust source files (`.rs`) | 189 |
| Rust lines of code | ~29,514 |
| Rust test functions | 468 (in `crates/` + `src-tauri/src/`) |
| Rust workspace dependencies | 32 |
| Rust workspace members | 23 (22 crates + `src-tauri`) |
| Frontend `.tsx` files | ~250 |
| Frontend `.ts` files | ~250 |
| Frontend `.css` files | 88 |
| Frontend test files | 75 |
| Frontend test patterns (`it`/`test`/`describe`) | 587 |
| Frontend `dependencies` | 40 |
| Frontend `devDependencies` | 26 |
| Config files (`.toml` + `.json` + `.config.*`) | 43 |
| Phase status | Phase 2 complete (18 capabilities) |
| Refactoring iterations completed | 93 |

### File Size Distribution

**Rust `.rs` files**: Median ~97 lines, P75 ~220 lines, Max 764 lines
**Frontend `.tsx` files**: Median ~110 lines, P75 ~250 lines, Max 731 lines
**Frontend `.ts` files**: Median ~70 lines, P75 ~180 lines, Max 759 lines
**Frontend `.css` files**: Median ~130 lines, P75 ~300 lines, Max 718 lines

### Git Hotspots (files modified most since 2026-06-01)

| Changes | File |
|---------|------|
| 71 | `frontend/src/app/features/browser/BrowserPanel.tsx` |
| 32 | `frontend/src/app/stores/slices/browserSlice.ts` |
| 30 | `frontend/src/tauri-bridge.ts` |
| 26 | `frontend/src/mock-bridge.ts` |
| 25 | `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx` |
| 25 | `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx` |
| 22 | `frontend/src/app/features/browser/useBrowserWebView.ts` |
| 22 | `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` |
| 21 | `frontend/src/app/stores/StoreState.ts` |
| 21 | `crates/model-gateway/src/lib.rs` |

> The browser feature domain dominates the change hotspots, indicating it is the most actively developed and potentially most fragile area.

---

## Risk Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| Critical (fix first) | 0 | No correctness bugs, security vulnerabilities, or data loss risks found |
| High (plan) | 4 | Significant maintainability concerns: god functions, rule violations, oversized files |
| Medium (quick wins) | 9 | Files exceeding norms, bundle optimization, error-handling migration, clone-heavy code |
| Low (defer) | 5 | Minor cleanups, nice-to-have optimizations |

**Overall assessment**: The codebase is **well-structured and disciplined**. Zero `any` usage, proper i18n, no circular dependencies, no layer violations, no `todo!()`/`unimplemented!()` stubs. The findings are predominantly maintainability and consistency issues, not correctness problems.

---

## Findings

### 1. Architecture & Design

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| [agent_pipeline.rs:155-474](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/src-tauri/src/commands/agent_pipeline.rs#L155-L474) | `collect_symbol_context` function spans **320 lines** with 103 lines at 5+ levels of nesting — the single highest-complexity function in the codebase. Mixes symbol context collection, file context, patch generation, and audit batching. | Cognitive overload for maintainers; high risk of regression when modifying agent pipeline logic; hard to test in isolation. | Decompose into 4-5 focused helper functions: `collect_symbols()`, `collect_file_context()`, `generate_patch()`, `batch_audit()`. Each should be independently testable. | High |
| [mock-bridge.ts:69,135,358,368,381,428,438,451](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/mock-bridge.ts) | **9 empty `catch {}` blocks** with `// ignore` or `/* ignore */` comments — directly violates project rule `error-handling.md`: "禁止 try { ... } catch {} 空 catch 块" and "localStorage 写入必须捕获异常并至少记录 console.warn". | Silent failure swallowing in dev/test environment; debugging blind spots; rule erosion (other developers may copy the pattern). | Replace each empty catch with `console.warn('context', error)` or use the project's `captureError` helper. For localStorage operations, follow the `writeJson`/`writeFlag` pattern from `storageHelpers.ts`. | High |
| [command_risk.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/kernel/src/command_risk.rs) (649 lines) | God module mixing 4 separable concerns: risk-level assessment, `PermissionDecision` enum, `PermissionRule`/`PermissionRuleset` config types, and doom-loop detection logic. | Hard to navigate; changes to permission config types risk breaking risk assessment; test file is 291 lines (45% of file). | Split into: `command_risk.rs` (assessment logic), `permission_types.rs` (`PermissionDecision`, `PermissionRule`, `PermissionRuleset`), `doom_loop.rs` (detection). Move tests alongside each. | Medium |
| [cacheHelpers.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/stores/cacheHelpers.ts) + actions/ | `captureError` (untyped) used **30+ times** across action files; `captureTypedError` (typed, with 16 `AppError` subclasses) used only **2 times**. Project rule states "优先使用 captureTypedError 替代 captureError" but migration never happened. | Lost error type information; UI cannot differentiate `NotFoundError` from `NetworkError` from `StorageError`; reduced diagnostic quality. | Incrementally migrate `captureError(get, error)` → `captureTypedError(get, error)` across action files. Prioritize high-traffic paths (agentActions, fetchActions, gitActions). Can be done file-by-file without breaking changes. | Medium |

### 2. Performance

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| [vite.config.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/vite.config.ts) `manualChunks` | 4 heavy libraries not in `manualChunks` or lazy-loaded: `echarts` (~300-400KB gz), `highlight.js` (~50-100KB), `mammoth` (~100KB), `motion` (~50-80KB). These may bundle into the main chunk. | Larger initial bundle size; slower first paint; users who never open Git Visualization still download `echarts`. | Add `echarts`, `highlight.js`, `mammoth`, `motion` to `manualChunks` config, OR verify they are dynamically `import()`-ed only in the features that use them (`GitVisualizationView`, `DocxPreview`, etc.). Use `BUILD_ANALYZE=true vite build` to measure impact. | Medium |
| [lsp-client/client.rs:215](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/lsp-client/src/client.rs#L215) | `self.servers.clone()` clones an entire `HashMap` behind a `Mutex` lock — potentially expensive if the LSP server map grows. | Performance degradation when many LSP servers are active; lock held during clone. | Consider iterating without cloning (e.g., `self.servers.lock().iter().filter_map(...)`), or use `Arc` clones of individual server handles instead of cloning the whole map. | Low |
| [webview2_history.rs:51-80](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/browser/src/webview2_history.rs#L51-L80) | `std::thread::spawn` + `std::thread::sleep(2000ms)` for SPA fallback timer — consumes an OS thread for 2 seconds. | Wasted thread resource on each WebView2 navigation event; minor but avoidable. | Replace with `tokio::spawn` + `tokio::time::sleep` to use async task instead of OS thread. Low frequency mitigates impact. | Low |
| [ProviderConfig.tsx:14](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/provider-manager/ProviderConfig.tsx#L14) | `providers.filter(...).map(...)` runs on every render without `useMemo`. | Unnecessary re-computation on every render. Minor (small list ~5-10 providers) but violates pattern consistency. | Wrap in `useMemo` with `[providers]` dependency, or move to a store selector. | Low |

### 3. Code Structure

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| [BrowserPanel.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx) (731 lines, 71 git changes) | Largest frontend component AND most frequently modified file. Exceeds the 400-line component split threshold from `component-architecture.md` by 1.8x. Already partially decomposed (BrowserPanelDialogs, BrowserPanelContent extracted) but core remains large. | High regression risk — 71 changes in 5 weeks indicates active fragility; merge conflicts likely; hard to test. | Continue decomposition: extract `BrowserPanelState` (state management), `BrowserPanelEffects` (side effects), `BrowserPanelKeyboard` (keyboard handling). Target <400 lines for the shell. | High |
| [mock-bridge.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/mock-bridge.ts) (759 lines) | Largest frontend `.ts` file. The `tauri-shell.md` rule states "单个 bridge 文件 > 600 行时，按上述模式拆分". This file exceeds 600 lines but was not split. | Hard to maintain; dev-only but still a DX bottleneck; rule non-compliance. | Split into per-domain mock files under `mock/` (some already exist: `mock-workspace.ts`, `mock-conversation.ts`). Move remaining domains (browser, provider, github, etc.) into `mock/mock-browser.ts`, `mock/mock-provider.ts`, etc. | High |
| [tauri-bridge.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/tauri-bridge.ts) (723 lines, 30 git changes) | Second-largest frontend `.ts` file. Also exceeds the 600-line bridge split threshold. 3rd most frequently changed source file. | Same as above — maintainability and rule compliance. | Split into per-domain bridge files under `tauri-bridge/` directory (mirroring `preview-bridge/` structure). | Medium |
| [agent_pipeline.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/src-tauri/src/commands/agent_pipeline.rs) (764 lines) | Largest Rust file. Contains the 320-line `collect_symbol_context` function (see Architecture finding #1). | Complexity hotspot; hard to test. | Extract helper functions (see Architecture #1). Additionally, consider splitting Tauri command handlers from business logic. | High |
| [useChangesPanelState.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx) (521 lines) | Hook exceeds reasonable size for a single hook. Mixes changes panel state, filter logic, and action dispatching. | Hard to understand data flow; likely re-renders more than necessary. | Split into `useChangesFilters`, `useChangesActions`, `useChangesSelection` sub-hooks. | Medium |
| [TitleBar.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/TitleBar.tsx) (555 lines, 21 git changes) | Region component exceeding 400-line threshold. 10th most changed file. | Maintainability concern in a core layout component. | Extract menu logic into `TitleBarMenus.tsx` (partially done in `titleBarMenus.ts`), window controls into `WindowControls.tsx`. | Medium |
| [debugLogCollector.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/utils/debugLogCollector.ts) (473 lines) | Debug utility is large. Mixes log collection, formatting, export, and storage logic. | Developer tooling complexity; may accumulate more code over time. | Split into `debugLogCollector.ts` (core), `debugLogFormat.ts` (formatting), `debugLogExport.ts` (export/storage). | Low |

### 4. Hygiene & Quality

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| [brace.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/outline/src/brace.rs) (29 `.unwrap()` calls) | 29 production `.unwrap()` calls for `Regex::new(...)` at module initialization. All other production unwraps in the codebase are near-zero. | Panics on startup if a regex is invalid (programming error, but error message is unhelpful). Pattern inconsistency with rest of codebase which uses `?` or `.expect()`. | Replace with `static REGEX_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(...).expect("valid regex pattern"))`. Provides better panic messages and lazy initialization. | Medium |
| [adl-logging/manager.rs:41](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/adl-logging/src/manager.rs#L41), [browser/webview2_audio.rs:22](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/browser/src/webview2_audio.rs#L22) | 2 `#[allow(dead_code)]` suppressions without documentation explaining why. | Dead code may accumulate; suppressions hide real issues; future developers won't know if code is intentionally retained. | Either remove the dead code, or add a comment explaining why it's retained (e.g., "reserved for Phase 3 API"). | Low |
| [src-tauri/src/commands/agent_pipeline.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/src-tauri/src/commands/agent_pipeline.rs) (20 `.clone()`), [provider.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/src-tauri/src/commands/provider.rs) (15 `.clone()`), [subagent.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/src-tauri/src/commands/subagent.rs) (13 `.clone()`) | Tauri command layer is clone-heavy (286 total `.clone()` calls across `src-tauri/src/`). Common in Tauri apps (owned data from `State<>`), but top files exceed norms. | Potential performance impact if cloning large structs; memory pressure under load. Not all clones are perf-relevant (many clone `Arc`, small structs). | Audit the top 3 files. Replace `struct.clone()` with references where the command doesn't need ownership. Use `Arc::clone()` explicitly for `Arc` types (cheaper than full clone). Requires profiling to confirm hot paths. | Low |
| [kernel/events.rs:68,80](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/kernel/src/events.rs#L68) | 2 production `.expect("event diagnostics mutex poisoned")` calls. | Mutex poisoning causes panic instead of recovery. | Consider `lock().unwrap_or_else(|e| e.into_inner())` for poison recovery, or document why poisoning should be fatal. | Low |
| Frontend: 6 `react-hooks/exhaustive-deps` eslint-disable directives | 6 effect dependency suppressions, concentrated in browser feature ([SafeIframe.tsx:93](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/SafeIframe.tsx#L93), [useBrowserPageMeta.ts:274](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts#L274), [useBrowserUrlChange.ts:312](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts#L312), [LocalPortSection.tsx:99](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx#L99), [AddManualPortDialog.tsx:28](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx#L28), [useECharts.ts:33](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts#L33)) | Risk of stale closures; effects may not re-run when dependencies change. | Audit each suppression. If intentional, add a comment explaining why. If accidental, fix the dependency array. | Low |

---

## Statistics

| Metric | Count |
|--------|-------|
| Total findings | 18 |
| Critical | 0 |
| High | 4 |
| Medium | 9 |
| Low | 5 |
| Files affected | ~25 |
| Estimated effort | Medium (2-3 focused sessions for High items; Medium/Low can be batched) |

### Positive Findings (No Issues Found)

| Dimension | Status |
|-----------|--------|
| Circular dependencies (Rust) | None — fully acyclic dependency graph across 22 crates |
| Layer violations (Rust) | None — strict top-down dependency direction |
| Frontend circular imports | None — clean `regions → features → stores` flow |
| `any` type usage (frontend) | 0 occurrences — excellent type discipline |
| `as any` casts (frontend) | 0 occurrences |
| Hardcoded UI strings (frontend) | 0 — i18n fully enforced |
| `todo!()`/`unimplemented!()` (Rust) | 0 — no incomplete implementations |
| N+1 query patterns (Rust) | None found |
| Premature abstraction (Rust traits) | None — all 3 traits have legitimate multi-use or DI justification |
| Blocking in async (Rust) | 1 minor case (webview2_history.rs) |

---

## Recommended Execution Order

### Priority 1 — High Impact, High Likelihood (Fix First)

1. **[High]** Fix `mock-bridge.ts` empty catch blocks — **direct rule violation** (`error-handling.md`), straightforward fix (add `console.warn`), prevents pattern erosion. 9 locations.

2. **[High]** Decompose `collect_symbol_context` in [agent_pipeline.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/src-tauri/src/commands/agent_pipeline.rs#L155) — the 320-line function is the single highest-complexity function in the codebase. Extract 4-5 focused helpers. Improves testability and reduces regression risk in the agent pipeline.

3. **[High]** Split `mock-bridge.ts` (759 lines) and `tauri-bridge.ts` (723 lines) — both exceed the 600-line bridge split threshold from `tauri-shell.md`. Mirror the `preview-bridge/` per-domain structure.

4. **[High]** Continue decomposing `BrowserPanel.tsx` (731 lines, 71 changes) — the most fragile file in the codebase. Extract state management and effects into sub-hooks. Target <400 lines for the shell.

### Priority 2 — High Impact, Low Likelihood (Plan For)

5. **[Medium]** Split `command_risk.rs` (649 lines) into `permission_types.rs` + `doom_loop.rs` + `command_risk.rs`. Large but cohesive — plan carefully, ensure test coverage moves with the code.

6. **[Medium]** Migrate `captureError` → `captureTypedError` across action files. Incremental, file-by-file. Prioritize `agentActions`, `fetchActions`, `gitActions`.

### Priority 3 — Low Impact, High Likelihood (Quick Wins)

7. **[Medium]** Add `echarts`/`mammoth`/`highlight.js`/`motion` to `manualChunks` or verify lazy-loading. Measure with `BUILD_ANALYZE=true vite build`.

8. **[Medium]** Replace 29 `Regex::new(...).unwrap()` in [brace.rs](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/crates/outline/src/brace.rs) with `LazyLock` + `expect()`.

9. **[Medium]** Split `useChangesPanelState.tsx` (521 lines) and `TitleBar.tsx` (555 lines) into smaller sub-hooks/components.

### Priority 4 — Low Impact, Low Likelihood (Defer)

10. **[Low]** Wrap `ProviderConfig.tsx:14` computation in `useMemo`.
11. **[Low]** Replace `std::thread::sleep` with `tokio::time::sleep` in `webview2_history.rs`.
12. **[Low]** Audit `.clone()` usage in top 3 Tauri command files (requires profiling).
13. **[Low]** Document or remove 2 `#[allow(dead_code)]` suppressions.
14. **[Low]** Audit 6 `react-hooks/exhaustive-deps` eslint-disable directives in browser feature.

---

## Limitations

- **Build time / test runtime**: Not measured (would require running `cargo build` and `pnpm test` which take significant time). Recommend capturing these before starting Priority 1 fixes for before/after comparison.
- **Lint warning count**: Not measured (would require running `eslint` and `clippy`). The project claims "clippy 与 lint 零警告" in AGENTS.md.
- **Dead imports**: Could not be reliably detected via Grep (requires AST analysis). Recommend running `pnpm --dir frontend run lint` which flags unused imports.
- **Bundle size**: Not measured. The `BUILD_ANALYZE=true vite build` command with `rollup-plugin-visualizer` is configured but not run.
- **Frontend test count discrepancy**: AGENTS.md claims "431 frontend tests" but scan found 587 `it`/`test`/`describe` patterns (includes `describe` blocks). Actual test case count likely between these figures.

---

## Next Steps

This report is a **decision-making tool**. After review, the following downstream skills handle execution:

| Step | Skill | Purpose |
|------|-------|---------|
| Plan | `writing-plans` | Convert prioritized findings into a structured implementation plan |
| Execute | `executing-plans` or `subagent-driven-development` | Implement changes in priority order |
| Verify | `verification-before-completion` | Run tests, linters, type checks to confirm nothing broke |

**Important**: Do not start execution without user approval of this insight report. The user decides which findings to act on, in what order, and when.
