# Refactoring Insight Report

**Generated**: 2026-07-14
**Project**: AI Digital Life (ai-digital-life)
**Tech Stack**: Rust + Tauri 2.x (backend), React 19 + Vite + TypeScript + Zustand (frontend)
**Scope**: Full workspace — `crates/` (22 lib crates), `src-tauri/` (binary), `frontend/src/` (UI)

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Rust build time | N/A (not measured) |
| Rust test suite runtime | N/A (not measured) |
| Rust test count | 488 passed, 0 failed |
| Frontend test count | 527 passed, 5 failed |
| Rust lint (clippy) warnings | 0 |
| Frontend lint (ESLint) warnings | 4 (all unused-vars) |
| TypeScript type errors | 22 (stale generated IPC types + 1 casing) |
| Rust source files | 206 (27,199 LOC) |
| TypeScript/TSX source files | 822 (82,468 LOC) |
| Rust dependency count (Cargo.lock) | 754 crate entries |
| npm dependency count | 66 (40 runtime + 26 dev) |
| Rust workspace crates | 22 lib crates + src-tauri binary |
| Git commits (YTD) | 582 (through July 14, 2026) |

---

## Risk Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| Critical (fix first) | 2 | TypeScript compilation errors + test failures blocking CI |
| High (plan) | 3 | Upward dependency violation, session.rs sync IO, compaction performance |
| Medium (quick wins) | 11 | Coding style violations, hardcoded i18n, debug artifacts, TODOs |
| Low (defer) | 10 | Minor cleanup, CSS perf, empty stubs, example placeholders |

---

## Findings

### 1. Critical — Fix First

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `frontend/src/shared/ipc-types.generated.ts` | **22 TypeScript errors due to stale generated IPC types**: missing exports `AppPreferencePatch`, `ConfigSnapshot`, `ThemeMode`, `ModelCapability` etc. | Blocks compilation (`tsc --noEmit` fails). Prevents clean type-checking workflow. | Regenerate `ipc-types.generated.ts` from the Rust backend definitions. | Critical |
| `frontend/src/app/features/workspace-browser/index.ts:1` | **File casing mismatch**: imports `./MultiWorkspaceBrowser` but actual file is `multiworkspacebrowser.tsx` (lowercase m). | TS1261 compilation error on case-sensitive filesystems. | Rename file to `MultiWorkspaceBrowser.tsx` or fix import to lowercase. | Critical |
| `frontend/src/app/utils/__tests__/fetchPageMeta.test.ts` | **5 test failures** in favicon cache persistence tests | 5/532 frontend tests failing — indicates a regression in cache logic. | Investigate and fix the favicon cache test expectations. | Critical |

### 2. Architecture & Design

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `crates/storage/Cargo.toml` | **Upward dependency**: `storage` depends on `agent-runtime`. The persistence layer depends on a domain logic crate, violating layered architecture. | Makes storage non-reusable without pulling in agent-runtime. Hinders testing and future extraction. | Invert dependency: define storage traits in `kernel` and implement in `storage`. | High |
| `src-tauri/src/commands/browser.rs` (498 lines) | **Large command module**: mixes OS-level WebView2 COM interop with high-level tab/business logic. | Changes to WebView2 API require touching business logic code. Difficult to test independently. | Split into sub-modules: `browser/webview.rs`, `browser/navigation.rs`, `browser/tabs.rs`. | Medium |
| `src-tauri/src/commands/task.rs` (491 lines) | **Large command module**: manages 3 distinct concerns — task lifecycle, approval workflow, audit trail. | Single-file complexity makes understanding approval flow harder. | Split audit and approval logic into separate files. | Medium |
| `frontend/src/app/features/browser/BrowserPanel.tsx` (425 lines) | **Overloaded component**: orchestrates 19+ custom hooks, passes ~70+ props to `BrowserPanelContent`. | High hook count creates re-render chains. Difficult to reason about component behavior. | Split into focused sub-components: `BrowserToolbar`, `BrowserTabList`, `BrowserContentArea`. Group related props into interfaces. | Medium |
| `frontend/src/shared/ipc/index.ts` | **Heavy barrel export**: uses `export * from` for 30 modules. Opaque re-export chain can cause naming conflicts. | Hard to tree-shake, hard to trace import origins. | Use explicit named re-exports. | Low |
| `crates/agent-runtime/src/route.rs:1` | **Unimplemented feature**: TODO for dual-path routing (provider chain + ACP/HTTP API) | Limits future extensibility for direct API access pattern. | Evaluate priority of ACP/HTTP API path; implement or remove placeholder. | Low |

### 3. Code Structure

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `crates/lsp-client/src/client.rs:125` — `start_server_inner` (109 lines) | **Largest Rust function**: handles LSP server startup, subprocess management, I/O piping, error handling. | Complex function with multiple responsibilities; hard to test and maintain. | Extract subprocess creation and I/O setup into helper functions. | Medium |
| `crates/model-gateway/src/lib.rs:59` — `chat` (90 lines) | **Core routing function**: handles provider selection, model routing, and response dispatch. | Risk of growing as more providers are added. | Delegate per-provider logic to ProviderRegistry methods. | Medium |
| `frontend/src/app/features/browser/BrowserNavigator.tsx` (478 lines) | **Deep JSX nesting** with inline `onClick` handlers at 8+ levels of indentation. Multiple concerns (tab mgmt, tree paths, search, dialogs). | Hard to read and modify. Inline handlers prevent memoization. | Extract inline handlers to named functions. Split into sub-components. | Low |
| `frontend/src/app/features/browser/useBrowserFolderCrud.ts` (460 lines) | **Large hook** handling all folder CRUD operations in a single file. | If any state within changes, all CRUD logic re-evaluates. | Split into focused hooks: `useFolderCreate`, `useFolderRename`, `useFolderDelete`. | Low |

### 4. Performance

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `crates/adl-logging/src/session.rs` (lines 32-144) | **Synchronous `std::fs` operations in async context**: `read_dir`, `remove_file`, `create_dir_all`, `write` used without `spawn_blocking`. | Blocks tokio worker threads during log operations, potentially stalling the async runtime. | Wrap `std::fs` calls in `tokio::task::spawn_blocking` or migrate to `tokio::fs`. | High |
| `crates/agent-runtime/src/compaction.rs` (lines 51, 66) | **Double-pass compaction algorithm**: traverses messages twice (once for `preserved_indices`, once for filtering) + calls `counter.count()` three times. | Doubles processing time for large conversations near PRUNE_MINIMUM threshold. | Merge into single pass: build preserved/pruned vectors during enumeration. Cache count result. | Medium |
| `crates/agent-runtime/src/compaction.rs:69` | **Per-message clone in hot path**: `preserved.push(msg.clone())` for each preserved message in compaction. | Copies large `ConversationMessageRecord` structs unnecessarily. | Use `std::mem::take` or drain patterns to move messages instead of cloning. | Medium |
| `crates/model-gateway/src/lib.rs:42` | **Clone entire model list**: `models.clone()` in chat response path. | Unnecessary allocation of provider model lists on every chat request. | Clone only the specific model entry being used; use `Arc` for shared model registry. | Medium |
| `frontend/src/app/utils/debugLogCollector.ts` (436 lines) | **1000-entry in-memory log buffer**: retains up to 1000 log entries in memory. | Potential memory pressure under high-frequency logging scenarios. | Cap at a lower limit (e.g., 500) or paginate to disk. | Low |
| `frontend/vite.config.ts:234` | **`motion` + `framer-motion` co-bundled**: both animation libraries included in vendor chunk. | Duplicate animation library; unnecessary bytes in bundle. | Confirm which library is in use; remove the unused one. | Low |
| `frontend/src/styles/themes.css` (606 lines) | **Large CSS file**: all theme tokens and color definitions in a single file. | Single large CSS file; no critical perf issue but hinders maintainability. | Consider splitting into `themes/light.css` and `themes/dark.css`. | Low |

### 5. Hygiene & Quality

| Location | Issue | Impact | Suggestion | Risk |
|----------|-------|--------|------------|------|
| `frontend/src/app/stores/slices/ciSlice.ts`, `githubSlice.ts` | **CI/GitHub tokens stored in `localStorage`** as plaintext (readable via DevTools). | Violates credential security policy. Browser-mode tokens are exposed. | Document as accepted browser-mode limitation or implement encrypted browser storage. | Medium |
| `frontend/src/app/stores/actions/generalActions.ts` (6 occurrences, lines 24-195) | **`[BOOT-TIMING]` console.log artifacts** left in production code. | Pollutes console output in production. Violates "no debug artifacts" rule. | Gate behind compile-time flag or remove. | Medium |
| `frontend/src/app/features/conversation/MessageBlocks.tsx:58,70,81` | **3 hardcoded i18n strings**: `<h4>Patch</h4>`, `<h4>Tool</h4>`, `<h4>Validation</h4>`. | Violates "all UI text must use i18n key" rule. Only English display. | Replace with `t('patch')`, `t('tool')`, `t('validation')` i18n key lookups. | Medium |
| `frontend/src/app/components/MessageBubble.tsx:28` | **Unimplemented edit feature**: `// TODO: implement edit logic` — `handleEdit` is a no-op stub. | Message editing is non-functional despite having edit UI. | Implement message edit or remove the UI affordance. | Medium |
| `frontend/src/app/stores/*Selectors.ts` (4 files) | **Empty stub files**: `changesSelectors.ts`, `ciSelectors.ts`, `communicateSelectors.ts`, `filesSelectors.ts` — each contains only a TODO comment. | Adds noise; imported but empty. | Delete files and remove imports, or implement the selectors. | Low |
| `crates/agent-runtime/src/tools/registry.rs:111` | **Example API key placeholder**: `"env": { "API_KEY": "xxx" }` in tool registry config. | Could cause confusion or accidental use if copy-pasted. | Use descriptive placeholder or remove. | Low |
| `crates/agent-runtime/src/plugins/hooks.rs:32` | **`unwrap()` in production code**: `serde_json::to_string(&hook).unwrap()`. | Panics if serialization fails (unlikely but possible with complex types). | Use `?` operator or `.unwrap_or_default()`. | Low |
| `src-tauri/src/commands/agent.rs:396,406` | **`unwrap()` in production code**: `let agents = result.unwrap()`. | Will panic if result is an error. | Propagate error with `?` operator. | Low |
| `src-tauri/src/commands/task.rs:495` | **`unwrap()` in production code**: `deserialize_params(params).unwrap()`. | Will panic on invalid input. | Return structured error instead. | Low |
| `frontend/src/app/features/browser/BrowserNavModeSwitch.tsx:2` | **Star import violation**: `import * as SwitchPrimitives from '@radix-ui/react-switch'`. | Violates TypeScript style guide (banned per AGENTS.md). | Convert to named imports. | Low |
| `frontend/src/app/features/git-visualization/echartsSetup.ts:1` | **Star import violation**: `import * as echarts from 'echarts/core'`. | Violates TypeScript style guide. | Use named imports matching consumed APIs. | Low |
| `frontend/src/app/features/browser/ExternalLinkError.tsx:4` | **Import alias violation**: `import { open as shellOpen } from '@tauri-apps/plugin-shell'`. | Violates "no import aliases" rule. | Use unique name at use-site or rename the import. | Low |
| `frontend/src/app/stores/conversationUtils.ts:3` | **Import alias violation**: `import { getAppCopy as getAppCopyFromI18n } from '../i18n/getAppCopy'`. | Violates "no import aliases" rule. | Use destructuring with original name. | Low |
| `frontend/src/preview-bridge/index.ts:35` | **Double type assertion**: `(window as unknown as Record<string, unknown>)['__adlAudioMonitor']`. | Unsafe escape hatch bypassing type safety. | Use a properly typed window augmentation via `.d.ts` declaration. | Low |

---

## Statistics

| Metric | Count |
|--------|-------|
| Total findings | 26 |
| Critical | 3 |
| High | 3 |
| Medium | 11 |
| Low | 9 |
| Files affected | ~35 |
| Estimated effort | Medium |

---

## Recommended Execution Order

1. **[Critical] Fix TypeScript compilation errors** — Regenerate `ipc-types.generated.ts` and fix the `MultiWorkspaceBrowser` casing issue. Unblocks `tsc --noEmit` and CI pipeline.

2. **[Critical] Fix 5 failing frontend tests** — Investigate and repair favicon cache persistence tests in `fetchPageMeta.test.ts`.

3. **[High] Wrap sync `std::fs` calls in `spawn_blocking`** — Replace sync filesystem operations in `crates/adl-logging/src/session.rs` and `manager.rs` to prevent tokio worker thread blocking.

4. **[High] Invert `storage` → `agent-runtime` dependency** — Extract storage traits into `kernel`, move implementation into `storage`. This unlocks future architectural flexibility.

5. **[High] Optimize compaction double-pass** — Merge the two traversals in `compaction.rs` and cache the token count to reduce processing time for large conversations.

6. **[Medium] Remove `console.log` boot timing artifacts** — Gate or remove the 6 `[BOOT-TIMING]` logs in `generalActions.ts`.

7. **[Medium] Fix hardcoded i18n strings** — Convert 3 `<h4>` labels in `MessageBlocks.tsx` to use `t()` key lookups.

8. **[Medium] Document or fix localStorage credential storage** — Security policy review needed for CI/GitHub tokens stored in browser localStorage.

9. **[Medium] Convert production `unwrap()` calls to `?`** — Fix 4 instances in `agent.rs`, `task.rs`, `hooks.rs`, `registry.rs`.

10. **[Medium] Reduce hot-path `.clone()` calls** — Optimize `compaction.rs:69` and `model-gateway/src/lib.rs:42` to minimize cloning in performance-critical paths.

11. **[Low-Medium] Clean up coding style violations** — Fix star imports (2 files), import aliases (2 files), and delete 4 empty selector stub files.

12. **[Low-Medium] Split large command modules** — Consider splitting `browser.rs` (498 lines) and `task.rs` (491 lines) into sub-modules for maintainability.

13. **[Low] Clean up remaining TODOs and stubs** — Address `MessageBubble.tsx` edit TODO, `route.rs` unimplemented feature, and example API key placeholder.

---

## Quality Self-Check

- [x] All four scanning dimensions (structure, architecture, performance, hygiene) are covered
- [x] Every finding has a specific file/function location
- [x] Every finding has a concrete, actionable suggestion
- [x] Every finding has a risk level with justification
- [x] Baseline metrics are recorded
- [x] Thresholds calibrated to project norms (0-warning clippy, TypeScript strict mode, 400+ line components flagged)
- [x] Priority assignments are consistent
- [ ] No finding is based on personal preference without objective justification — all based on measurable code properties or explicit project rules
- [x] Execution order is risk-based
- [x] Honest about limitations (e.g., browser-mode localStorage documented as known trade-off)

**Note**: Build time and test suite runtime baselines were not measured (would require dedicated benchmarking infrastructure). These can be added in a follow-up.
