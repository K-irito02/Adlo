# Plan E: Code Hygiene Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up scattered code hygiene issues — inline JS blobs, misleading "legacy" labels, deprecated exports, duplicated strings, magic numbers, stale docs, and ambiguous API aliases — to improve readability and reduce maintenance surprises.

**Architecture:** Nine independent cleanup tasks across Rust and frontend. Each task is self-contained, produces a verifiable diff, and ends with the project's standard verification cycle (fmt/clippy/lint/typecheck/test). No task depends on another.

**Tech Stack:** Rust 1.85+, React 19, TypeScript, CSS custom properties, ts-rs.

## Global Constraints

- **Rust 1.85+**
- **`unwrap()` 禁用** — use `?` operator or pattern matching
- **`-D warnings` zero tolerance** — `cargo clippy --workspace --all-targets -- -D warnings` must pass
- **`rustfmt` default config** — `cargo fmt --all` must pass
- **ESLint + Prettier** — `pnpm --dir frontend run lint` and `pnpm --dir frontend run format` must pass with zero errors
- **TypeScript strict** — `pnpm --dir frontend run typecheck` must pass
- **i18n 全覆盖** — UI text must use i18n keys, no hardcoded strings
- **No backward-compatibility code** — removed code should not leave dead shims or `#[allow(dead_code)]`
- **Commit format**: `type(scope): summary` where type ∈ {feat, fix, docs, chore, refactor, test} and scope ∈ {core, frontend, rust, stores, browser, terminal, ipc, docs, deps}
- **Environment**: Set `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` before any cargo command
- **Node environment**: Set `$env:Path = "D:\Program Files\nodejs;$env:Path"` before any pnpm/npm command

---

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `crates/browser/src/browser_navigation.rs` | Replace inline JS const with `include_str!` | Task 1 |
| `crates/browser/src/init_script.js` (new) | Holds the ~544-line INIT_SCRIPT JS source | Task 1 |
| `crates/kernel/src/command_risk.rs` | Update misleading "legacy" docstrings | Task 2 |
| `frontend/src/components/charts/heatmap/heatmap-context.tsx` | Delete `heatmapCssVars` deprecated export | Task 3 |
| `frontend/src/components/charts/heatmap/index.ts` | Remove `heatmapCssVars` from barrel | Task 3 |
| `frontend/src/components/charts/pattern-preset.tsx` | Delete `isCirclesPattern` deprecated export | Task 3 |
| `frontend/src/components/charts/projection-line.tsx` | Delete `showEndpoints` deprecated prop | Task 3 |
| `frontend/src/components/charts/projection-utils.ts` | Delete `ProjectionPathDensity` deprecated type | Task 3 |
| `frontend/src/components/charts/sunburst.ts` | Delete 4 deprecated sunburst exports | Task 3 |
| `frontend/src/shared/userAgent.ts` (new) | Single source of truth for User-Agent string | Task 4 |
| `src-tauri/src/commands/browser.rs` | Use shared User-Agent constant | Task 4 |
| `frontend/vite.config.ts` | Use shared User-Agent constant | Task 4 |
| `frontend/src/styles/tokens.css` | Add `--z-toast` and `--z-offscreen` tokens | Task 5 |
| `frontend/src/app/utils/debugLogCollector.ts` | Replace `99999` with token | Task 5 |
| `frontend/src/app/features/browser/BrowserContextMenu.tsx` | Replace `99999` with token | Task 5 |
| `frontend/src/app/features/terminal/TerminalContextMenu.tsx` | Replace `99999` with token | Task 5 |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubCITreeToolbar.tsx` | Replace `99999` with token | Task 5 |
| `frontend/src/app/components/StartupOverlay.tsx` | Replace `9999` with token | Task 5 |
| `frontend/src/app/features/github-tree/GitHubEntrySubEntries.tsx` | Replace `9999` with token | Task 5 |
| `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` | Replace `9999` with token | Task 5 |
| `frontend/src/app/features/browser/useBrowserUrlChange.ts` | Replace `8000`/`15000` with named constants | Task 6 |
| `frontend/src/app/features/browser/useWebViewVisibility.ts` | Replace `32767` with named constant | Task 6 |
| `AGENTS.md` | Update stale test counts | Task 7 |
| `ai-digital-life/AGENTS.md` | Update stale test counts | Task 7 |
| `frontend/src/shared/ipc/digital-life.ts` | Remove `ci` alias from `DigitalLifeBridge` | Task 8 |
| `frontend/src/app/stores/slices/ciSlice.ts` | Migrate `bridge.ci.*` → `bridge.github.*` | Task 8 |
| `frontend/src/tauri-bridge/tauri-misc.ts` (or equivalent) | Remove `ci` bridge assignment | Task 8 |
| `frontend/src/mock/mock-misc.ts` (or equivalent) | Remove `ci` bridge assignment | Task 8 |
| `frontend/src/preview-bridge/preview-misc.ts` (or equivalent) | Remove `ci` bridge assignment | Task 8 |
| `frontend/src/shared/ipc/index.ts` | Add header comment documenting barrel convention | Task 9 |

---

### Task 1: Extract INIT_SCRIPT JS blob to a separate file

**Files:**
- Create: `ai-digital-life/crates/browser/src/init_script.js`
- Modify: `ai-digital-life/crates/browser/src/browser_navigation.rs` (lines 5-548)

**Interfaces:**
- Consumes: None
- Produces: `INIT_SCRIPT` constant continues to be `pub const INIT_SCRIPT: &str`, but its value comes from `include_str!("init_script.js")`. Public API unchanged.

**Context:** `crates/browser/src/browser_navigation.rs` lines 5-548 contain a ~544-line inline `r#"..."#` raw string constant `INIT_SCRIPT`. The JS blob makes the Rust file hard to navigate, prevents IDE JS tooling from syntax-highlighting the embedded JS, and forces reviewers to scroll past ~540 lines of JS to reach Rust logic. Moving it to a sibling `.js` file loaded via `include_str!` keeps the compile-time embedding (no runtime file I/O) while restoring editor support.

- [ ] **Step 1: Create the init_script.js file**

Create `ai-digital-life/crates/browser/src/init_script.js` by copying the contents of the `INIT_SCRIPT` raw string (everything between `r#"` on line 5 and `"#` on line 548 of `browser_navigation.rs`).

The file should start with:
```javascript
(function() {
    console.log('[ADL Browser] Initialization script loaded');

    // 检查是否是有效的网页 URL
    function isValidWebUrl(href) {
        if (!href || typeof href !== 'string') return false;
        return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
    }
```

…and end with:
```javascript
            return JSON.stringify({
                title: outTitle,
                favicon: outFavicon,
                url: u
            });
        };
    })();
})();
```

Do not include the `r#"` prefix or `"#` suffix — only the JS source.

- [ ] **Step 2: Replace the inline constant with include_str!**

In `ai-digital-life/crates/browser/src/browser_navigation.rs`, replace lines 4-548 (the doc comment + `pub const INIT_SCRIPT: &str = r#"..."#;`) with:

```rust
/// 初始化脚本：确保所有链接点击都在当前 WebView 中打开
///
/// Source lives in `init_script.js` to enable JS IDE tooling (syntax highlighting,
/// linting, formatting). Inlined at compile time via `include_str!` — no runtime
/// file I/O.
pub const INIT_SCRIPT: &str = include_str!("init_script.js");
```

- [ ] **Step 3: Verify compilation**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo check --workspace 2>&1 | Select-String "error|warning" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings

- [ ] **Step 4: Verify clippy**

Run:
```powershell
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings

- [ ] **Step 5: Verify tests**

Run:
```powershell
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: all test suites pass with 0 failures

- [ ] **Step 6: Commit**

```powershell
git add crates/browser/src/init_script.js crates/browser/src/browser_navigation.rs
git commit -m "refactor(browser): extract INIT_SCRIPT JS blob to separate file

Move ~544-line inline r#\"...\"# raw string to init_script.js loaded
via include_str!. Compile-time embedding preserved (no runtime I/O).
Restores JS IDE tooling (highlighting, linting, formatting) and makes
browser_navigation.rs navigable again."
```

---

### Task 2: Remove misleading "legacy" docstrings on RiskLevel functions

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/command_risk.rs` (lines 142-149, 169-185)

**Interfaces:**
- Consumes: None
- Produces: No API change. Docstrings only.

**Context:** `risk_to_decision` (L143) and `evaluate_permission` (L171) are labeled "legacy" in their docstrings, but both functions are actively used:
- `risk_to_decision` is called by `default_decision` (L139) and `evaluate_permission` (L184), and has 3 unit tests (L268, L273, L278)
- `evaluate_permission` is called by `crates/agent-runtime/src/permission_check.rs:55` and exposed as Tauri command `src-tauri/src/commands/permission.rs:77`

The "legacy" labels mislead readers into thinking the functions can be deleted. They cannot — they implement the ruleset fallback path. Update docstrings to describe their actual purpose.

- [ ] **Step 1: Update risk_to_decision docstring**

In `ai-digital-life/crates/kernel/src/command_risk.rs`, replace lines 142-149:

```rust
/// Convert a legacy RiskLevel to a PermissionDecision.
pub fn risk_to_decision(risk: RiskLevel) -> PermissionDecision {
    match risk {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}
```

with:

```rust
/// Map a `RiskLevel` to its default `PermissionDecision`.
///
/// Used as the fallback when no ruleset rule matches: low-risk commands are
/// allowed, medium-risk commands prompt the user, high-risk commands are denied.
pub fn risk_to_decision(risk: RiskLevel) -> PermissionDecision {
    match risk {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}
```

- [ ] **Step 2: Update evaluate_permission docstring**

In the same file, replace lines 169-185:

```rust
/// Evaluate a permission request using both the ruleset and legacy risk assessment.
/// The ruleset takes precedence; if no rule matches, falls back to risk-based decision.
pub fn evaluate_permission(
    ruleset: &PermissionRuleset,
    tool_name: &str,
    command: &str,
    args: &[String],
    risk: RiskLevel,
) -> PermissionDecision {
    let ruleset_decision = evaluate_ruleset(ruleset, tool_name, command, args);

    if !ruleset.is_empty() {
        return ruleset_decision;
    }

    risk_to_decision(risk)
}
```

with:

```rust
/// Evaluate a permission request against the ruleset, falling back to risk-based
/// default when the ruleset is empty.
///
/// When the ruleset contains at least one rule, `evaluate_ruleset` decides (last
/// matching rule wins, or default if none match). When the ruleset is empty,
/// the caller-provided `risk` decides via `risk_to_decision`. The `risk`
/// parameter is only consulted when `ruleset.is_empty()` is true.
pub fn evaluate_permission(
    ruleset: &PermissionRuleset,
    tool_name: &str,
    command: &str,
    args: &[String],
    risk: RiskLevel,
) -> PermissionDecision {
    let ruleset_decision = evaluate_ruleset(ruleset, tool_name, command, args);

    if !ruleset.is_empty() {
        return ruleset_decision;
    }

    risk_to_decision(risk)
}
```

- [ ] **Step 3: Verify clippy + tests**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
cargo test --workspace 2>&1 | Select-String "test result|error" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings, all tests pass

- [ ] **Step 4: Commit**

```powershell
git add crates/kernel/src/command_risk.rs
git commit -m "docs(rust): remove misleading legacy labels on RiskLevel functions

risk_to_decision and evaluate_permission are actively used (ruleset
fallback path, Tauri command, agent-runtime permission_check).
Docstrings now describe actual purpose instead of falsely claiming
the functions are legacy."
```

---

### Task 3: Delete deprecated chart exports

**Files:**
- Modify: `ai-digital-life/frontend/src/components/charts/heatmap/heatmap-context.tsx` (lines 194-209)
- Modify: `ai-digital-life/frontend/src/components/charts/heatmap/index.ts` (line 48)
- Modify: `ai-digital-life/frontend/src/components/charts/pattern-preset.tsx` (lines 36-39)
- Modify: `ai-digital-life/frontend/src/components/charts/projection-line.tsx` (lines 43-44)
- Modify: `ai-digital-life/frontend/src/components/charts/projection-utils.ts` (lines 5-7)
- Modify: `ai-digital-life/frontend/src/components/charts/sunburst.ts` (lines 332-389)

**Interfaces:**
- Consumes: None
- Produces: Public API surface reduced by 8 deprecated exports. No external callers (verified via grep — only definition files match).

**Context:** The charts directory contains 8 `@deprecated` exports across 5 files. Grep confirms zero external callers — all matches are in the definition files themselves (or the heatmap barrel `index.ts` which re-exports `heatmapCssVars`). The deprecation comments all point to specific replacements that already exist.

The 8 deprecated exports to delete:
1. `heatmapCssVars` (heatmap-context.tsx L194-209) — use `HEATMAP_DEFAULT_LEVEL_COLORS`
2. `isCirclesPattern` (pattern-preset.tsx L36-39) — use `isCirclePattern`
3. `showEndpoints` prop (projection-line.tsx L43-44) — use `showEndMarker`
4. `ProjectionPathDensity` type (projection-utils.ts L5-7) — stepped density removed
5. `SunburstRevealSchedule` interface (sunburst.ts L332-340) — use `buildSunburstEnterTiming`
6. `buildRevealSchedule` function (sunburst.ts L341-359) — use `buildSunburstEnterTiming`
7. `segmentRevealFromRingSweep` function (sunburst.ts L360-379) — use expand + sweep enter
8. `buildRevealDelays` function (sunburst.ts L380-389) — use `buildSunburstEnterTiming`

- [ ] **Step 1: Delete heatmapCssVars from heatmap-context.tsx**

In `ai-digital-life/frontend/src/components/charts/heatmap/heatmap-context.tsx`, delete lines 194-209 (the `/** @deprecated ... */` comment + the `export const heatmapCssVars = { ... };` block).

The block to delete looks like:
```typescript
/** @deprecated Use {@link HEATMAP_DEFAULT_LEVEL_COLORS} */
export const heatmapCssVars = {
  empty: HEATMAP_DEFAULT_LEVEL_COLORS[0],
  // ... (full object)
};
```

Read the file around lines 190-215 first to capture the exact end of the object.

- [ ] **Step 2: Remove heatmapCssVars from heatmap barrel**

In `ai-digital-life/frontend/src/components/charts/heatmap/index.ts`, delete line 48:

```typescript
  heatmapCssVars,
```

The surrounding block (lines 39-52) should remain intact, just without the `heatmapCssVars,` line.

- [ ] **Step 3: Delete isCirclesPattern from pattern-preset.tsx**

In `ai-digital-life/frontend/src/components/charts/pattern-preset.tsx`, delete lines 36-39:

```typescript
/** @deprecated Use `isCirclePattern`. */
export function isCirclesPattern(preset: PatternPresetId): boolean {
  return isCirclePattern(preset);
}
```

- [ ] **Step 4: Delete showEndpoints prop from projection-line.tsx**

In `ai-digital-life/frontend/src/components/charts/projection-line.tsx`, delete lines 43-44:

```typescript
  /** @deprecated Use `showEndMarker`. */
  showEndpoints?: boolean;
```

Also search the file body for any `showEndpoints` reads and remove them. If the prop is read anywhere in the component, replace the read with `showEndMarker` (the replacement the deprecation comment points to). If no reads exist, just delete the prop declaration.

- [ ] **Step 5: Delete ProjectionPathDensity from projection-utils.ts**

In `ai-digital-life/frontend/src/components/charts/projection-utils.ts`, delete lines 5-7:

```typescript
/** @deprecated Stepped density removed — projections always anchor → horizon. */
export type ProjectionPathDensity = 'stepped' | 'endpoints';
```

Also grep the file body for `ProjectionPathDensity` reads and remove them. If the type is referenced elsewhere in the file, inline its replacement (the comment says projections always anchor → horizon, so the only valid value is `'endpoints'` — replace any `ProjectionPathDensity`-typed parameter with a literal `'endpoints'` or remove the branching).

- [ ] **Step 6: Delete 4 deprecated sunburst exports**

In `ai-digital-life/frontend/src/components/charts/sunburst.ts`, delete 4 blocks:

Block A (L332-340):
```typescript
/** @deprecated Use buildSunburstEnterTiming */
export interface SunburstRevealSchedule {
  ringStarts: Map<number, number>;
  // ... (full interface)
}
```

Block B (L341-359):
```typescript
/** @deprecated Use buildSunburstEnterTiming */
export function buildRevealSchedule(arcs: ArcDatum[], staggerScale = 1): SunburstRevealSchedule {
  const timing = buildSunburstEnterTiming(arcs, staggerScale);
  // ... (full function body)
}
```

Block C (L360-379):
```typescript
/** @deprecated Ring sweep reveal — use expand + sweep enter instead. */
export function segmentRevealFromRingSweep(
  ringProgress: number,
  // ... (full function body)
)
```

Block D (L380-389):
```typescript
/** @deprecated Use buildSunburstEnterTiming */
export function buildRevealDelays(arcs: ArcDatum[]): Map<string, number> {
  const timing = buildSunburstEnterTiming(arcs);
  // ... (full function body)
}
```

Read the file around lines 330-395 first to capture exact boundaries. Each block starts with a `/** @deprecated ... */` comment and ends at the closing `}` of the function/interface.

- [ ] **Step 7: Run lint:fix + format**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```
Expected: lint passes with 0 errors, prettier formats the modified files

- [ ] **Step 8: Run typecheck**

Run:
```powershell
pnpm --dir frontend run typecheck
```
Expected: 0 errors (confirms no external code referenced the deleted exports)

- [ ] **Step 9: Run tests**

Run:
```powershell
pnpm --dir frontend run test
```
Expected: all tests pass

- [ ] **Step 10: Commit**

```powershell
git add frontend/src/components/charts/
git commit -m "refactor(frontend): delete 8 deprecated chart exports

Grep confirmed zero external callers across the codebase. All 8
exports had explicit replacements documented in their @deprecated
tags. Removes dead public API surface from the charts module."
```

---

### Task 4: Extract User-Agent string to shared constant

**Files:**
- Create: `ai-digital-life/frontend/src/shared/userAgent.ts`
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs` (lines 224, 278)
- Modify: `ai-digital-life/frontend/vite.config.ts` (line 98)

**Interfaces:**
- Consumes: None
- Produces: `USER_AGENT` constant in `frontend/src/shared/userAgent.ts`. Rust side keeps its own `USER_AGENT` const (cross-language duplication eliminated at the source-of-truth level by documenting the shared value).

**Context:** The exact User-Agent string `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"` is duplicated between:
- `src-tauri/src/commands/browser.rs:224` (Rust const)
- `frontend/vite.config.ts:98` (Vite preview proxy header)

If the UA string is updated in one place but not the other, the Tauri browser and the Vite preview proxy will send different headers — potentially causing servers to serve different content. Extract to a single source of truth.

Since Rust and TypeScript can't share a literal value at compile time, the cleanup is:
- TypeScript: single `USER_AGENT` constant in `frontend/src/shared/userAgent.ts`, imported by `vite.config.ts`
- Rust: keep the `const USER_AGENT` in `browser.rs` but add a comment pointing to the TS source of truth
- Both must have identical string values

- [ ] **Step 1: Create the shared userAgent.ts file**

Create `ai-digital-life/frontend/src/shared/userAgent.ts`:

```typescript
/**
 * Canonical User-Agent string for outbound HTTP requests from the browser
 * subsystem (Tauri WebView navigation + Vite preview proxy).
 *
 * Rust side mirrors this exact string in `src-tauri/src/commands/browser.rs`
 * (`USER_AGENT` const). Update both locations together — they must stay in sync
 * so that Tauri-mode and preview-mode requests appear identical to servers.
 */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
```

- [ ] **Step 2: Use the constant in vite.config.ts**

In `ai-digital-life/frontend/vite.config.ts`, around line 98, find the preview proxy header block:

```typescript
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
```

Replace with an import at the top of the file and a reference to the constant. Add the import:

```typescript
import { USER_AGENT } from './src/shared/userAgent';
```

Then change line 98 to:

```typescript
                  'User-Agent': USER_AGENT,
```

Read the file first to confirm the exact import location (after existing imports, before the `defineConfig` call) and the exact line content (the line may have trailing whitespace or different indentation).

- [ ] **Step 3: Add sync comment to Rust USER_AGENT const**

In `ai-digital-life/src-tauri/src/commands/browser.rs`, replace line 224:

```rust
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
```

with:

```rust
/// Canonical User-Agent for outbound browser HTTP requests.
///
/// Mirrors `frontend/src/shared/userAgent.ts` (`USER_AGENT`). Update both
/// locations together — they must stay in sync so Tauri-mode and preview-mode
/// requests appear identical to servers.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
```

- [ ] **Step 4: Verify Rust side**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Select-String "error|warning" | Select-Object -Last 5
```
Expected: 0 errors, 0 warnings

- [ ] **Step 5: Verify frontend side**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
```
Expected: 0 lint errors, 0 typecheck errors

- [ ] **Step 6: Verify Vite config still loads**

Run:
```powershell
pnpm --dir frontend exec vite --version
```
Then optionally start dev server briefly to confirm no config errors. If a dev server is already running, restart it to pick up the new import.

Expected: no config parse errors

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/shared/userAgent.ts frontend/vite.config.ts src-tauri/src/commands/browser.rs
git commit -m "refactor(core): extract User-Agent string to shared constant

Duplicated UA string between Rust browser command and Vite preview
proxy header. TypeScript side now imports from shared/userAgent.ts;
Rust side keeps its const but documents the sync requirement.
Prevents silent drift between Tauri-mode and preview-mode requests."
```

---

### Task 5: Replace z-index magic values with tokens

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/tokens.css` (add new tokens)
- Modify: `ai-digital-life/frontend/src/app/utils/debugLogCollector.ts` (line 344)
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserContextMenu.tsx` (line 43)
- Modify: `ai-digital-life/frontend/src/app/features/terminal/TerminalContextMenu.tsx` (line 33)
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/communicate/GitHubCITreeToolbar.tsx` (line 236)
- Modify: `ai-digital-life/frontend/src/app/components/StartupOverlay.tsx` (line 62)
- Modify: `ai-digital-life/frontend/src/app/features/github-tree/GitHubEntrySubEntries.tsx` (line 306)
- Modify: `ai-digital-life/frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` (line 251)

**Interfaces:**
- Consumes: existing `--z-max: 9999` token (tokens.css L151)
- Produces: two new tokens `--z-toast: 99999` and `--z-offscreen: -9999`

**Context:** The codebase has two z-index conventions:
- `9999` (matches `--z-max` token) — used by `StartupOverlay.tsx`, `GitHubEntrySubEntries.tsx`, `GitHubTreeEntry.tsx`
- `99999` (no token, exceeds `--z-max`) — used by `debugLogCollector.ts`, `BrowserContextMenu.tsx`, `TerminalContextMenu.tsx`, `GitHubCITreeToolbar.tsx`

The `99999` literals bypass the token system and create an implicit second z-index layer. Also, `Tooltip.tsx` and `scrollbarWidth.ts` use `-9999` for offscreen element positioning — those are not z-index (they're physical `left`/`top` coordinates), so they are out of scope for this task and handled in Task 6 if applicable (actually they're left untouched — see Task 6 note).

This task:
1. Adds `--z-toast: 99999` token (for overlays that must appear above `--z-max` elements like context menus over modals)
2. Replaces all `99999` literals with `var(--z-toast)`
3. Replaces all `9999` literals in z-index contexts with `var(--z-max)`
4. Does NOT touch `-9999` physical coordinates (those are offscreen positioning, not z-index — different concern)

- [ ] **Step 1: Add --z-toast token**

In `ai-digital-life/frontend/src/styles/tokens.css`, find line 151:

```css
  --z-max: 9999;
```

Add a new line after it:

```css
  --z-max: 9999;
  --z-toast: 99999;
```

- [ ] **Step 2: Replace 99999 in debugLogCollector.ts**

In `ai-digital-life/frontend/src/app/utils/debugLogCollector.ts` line 344, change:

```typescript
    z-index: 99999;
```

to:

```typescript
    z-index: var(--z-toast);
```

Read the surrounding context first to confirm it's a CSS-in-JS or style string. The line may be inside a template literal or a style object — preserve the surrounding syntax.

- [ ] **Step 3: Replace 99999 in BrowserContextMenu.tsx**

In `ai-digital-life/frontend/src/app/features/browser/BrowserContextMenu.tsx` line 43, change:

```typescript
        zIndex: 99999,
```

to:

```typescript
        zIndex: 'var(--z-toast)',
```

Note: if this is a React style object, the value must be a string (CSS `var()` cannot be a number). Read the file first to confirm.

- [ ] **Step 4: Replace 99999 in TerminalContextMenu.tsx**

In `ai-digital-life/frontend/src/app/features/terminal/TerminalContextMenu.tsx` line 33, change:

```typescript
        zIndex: 99999,
```

to:

```typescript
        zIndex: 'var(--z-toast)',
```

- [ ] **Step 5: Replace 99999 in GitHubCITreeToolbar.tsx**

In `ai-digital-life/frontend/src/app/regions/right-panel/panels/communicate/GitHubCITreeToolbar.tsx` line 236, change:

```typescript
                    zIndex: 99999,
```

to:

```typescript
                    zIndex: 'var(--z-toast)',
```

- [ ] **Step 6: Replace 9999 in StartupOverlay.tsx**

In `ai-digital-life/frontend/src/app/components/StartupOverlay.tsx` line 62, change:

```typescript
        zIndex: 9999,
```

to:

```typescript
        zIndex: 'var(--z-max)',
```

- [ ] **Step 7: Replace 9999 in GitHubEntrySubEntries.tsx**

In `ai-digital-life/frontend/src/app/features/github-tree/GitHubEntrySubEntries.tsx` line 306, change:

```typescript
            zIndex: 9999,
```

to:

```typescript
            zIndex: 'var(--z-max)',
```

- [ ] **Step 8: Replace 9999 in GitHubTreeEntry.tsx**

In `ai-digital-life/frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` line 251, change:

```typescript
              zIndex: 9999,
```

to:

```typescript
              zIndex: 'var(--z-max)',
```

- [ ] **Step 9: Run lint:fix + format + typecheck**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
```
Expected: 0 errors

- [ ] **Step 10: Run tests**

Run:
```powershell
pnpm --dir frontend run test
```
Expected: all tests pass (some tests may assert z-index values — if they fail, update them to assert the new token-based values)

- [ ] **Step 11: Commit**

```powershell
git add frontend/src/styles/tokens.css frontend/src/app/utils/debugLogCollector.ts frontend/src/app/features/browser/BrowserContextMenu.tsx frontend/src/app/features/terminal/TerminalContextMenu.tsx frontend/src/app/regions/right-panel/panels/communicate/GitHubCITreeToolbar.tsx frontend/src/app/components/StartupOverlay.tsx frontend/src/app/features/github-tree/GitHubEntrySubEntries.tsx frontend/src/app/features/github-tree/GitHubTreeEntry.tsx
git commit -m "refactor(frontend): replace z-index magic values with tokens

Add --z-toast token (99999) for overlays above --z-max (9999).
Replace 4 hardcoded 99999 and 3 hardcoded 9999 literals with
var(--z-toast) / var(--z-max). Physical -9999 offscreen coordinates
(left/top) are not z-index and are left untouched."
```

---

### Task 6: Replace magic timeout and location numbers with named constants

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts` (line 304)
- Modify: `ai-digital-life/frontend/src/app/features/browser/useWebViewVisibility.ts` (lines 165-166)

**Interfaces:**
- Consumes: None
- Produces: two local named constants (`URL_CHANGE_FALLBACK_MS_*`, `HIDDEN_WEBVIEW_OFFSCREEN_COORD`)

**Context:** Two browser-feature hooks use unnamed numeric literals for timeouts and offscreen positioning:

1. `useBrowserUrlChange.ts:304` — `const fallbackDelay = noTabExists ? 8000 : 15000;` — magic timeouts for fallback URL-change detection. The two values encode "shorter fallback when no tab exists, longer when a tab exists" but nothing in the code says so.

2. `useWebViewVisibility.ts:165-166` — `x: 32767, y: 32767,` — magic offscreen coordinate for hiding a WebView. `32767` is `Int16.MAX_VALUE` (used by WebView2 to mean "way offscreen"), but nothing in the code explains this.

This task:
- Extracts the two timeout values into named constants at the top of `useBrowserUrlChange.ts`
- Extracts the `32767` literal into a single named constant at the top of `useWebViewVisibility.ts`
- Adds a brief comment explaining each constant's purpose

- [ ] **Step 1: Add named constants to useBrowserUrlChange.ts**

In `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts`, find the existing imports and constants section (read the top of the file first). Add after the existing top-level constants (or at the top of the file if none exist):

```typescript
/**
 * Fallback delay (ms) before treating a navigation as completed when no
 * `pageLoaded` event arrives. Shorter when no tab exists (no SPA routing
 * expected); longer when a tab exists (allow time for SPA transitions).
 */
const URL_CHANGE_FALLBACK_MS_NO_TAB = 8000;
const URL_CHANGE_FALLBACK_MS_WITH_TAB = 15000;
```

- [ ] **Step 2: Replace the magic numbers in useBrowserUrlChange.ts**

In the same file, change line 304:

```typescript
        const fallbackDelay = noTabExists ? 8000 : 15000;
```

to:

```typescript
        const fallbackDelay = noTabExists
          ? URL_CHANGE_FALLBACK_MS_NO_TAB
          : URL_CHANGE_FALLBACK_MS_WITH_TAB;
```

- [ ] **Step 3: Add named constant to useWebViewVisibility.ts**

In `ai-digital-life/frontend/src/app/features/browser/useWebViewVisibility.ts`, find the existing top-level constants section. Add:

```typescript
/**
 * Offscreen coordinate used to hide a WebView by moving it far outside the
 * viewport. `32767` is `Int16.MAX_VALUE` — WebView2 treats this as "way
 * offscreen" without unloading the page (preserves SPA state).
 */
const HIDDEN_WEBVIEW_OFFSCREEN_COORD = 32767;
```

- [ ] **Step 4: Replace the magic numbers in useWebViewVisibility.ts**

In the same file, change lines 165-166:

```typescript
            x: 32767,
            y: 32767,
```

to:

```typescript
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
```

- [ ] **Step 5: Run lint:fix + format + typecheck**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
```
Expected: 0 errors

- [ ] **Step 6: Run tests**

Run:
```powershell
pnpm --dir frontend run test
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/features/browser/useBrowserUrlChange.ts frontend/src/app/features/browser/useWebViewVisibility.ts
git commit -m "refactor(frontend): replace magic timeout/location numbers with named constants

Extract 8000/15000ms fallback delays in useBrowserUrlChange and
32767 offscreen coordinate in useWebViewVisibility into named
constants with explanatory comments. Values unchanged; readability
improved."
```

---

### Task 7: Update stale test counts in AGENTS.md

**Files:**
- Modify: `AGENTS.md` (line 44)
- Modify: `ai-digital-life/AGENTS.md` (line 47)

**Interfaces:**
- Consumes: None
- Produces: Documentation only.

**Context:** Both `AGENTS.md` files claim "508 Rust 测试、431 前端测试，clippy 与 lint 零警告". Actual state (per `docs/refactoring-insight/report/refactor-insight-2026-07-16.md`):
- Frontend tests: 549 passing (not 431)
- Frontend lint: 43 warnings (not "零警告")
- Rust tests: ~508 (per docs, not re-verified)
- Rust clippy: 0 warnings (verified)

After Plan A merged, frontend test count is 554 (per progress.md). After Plan B/C/D/E execute, counts will shift further. This task updates the docs to remove the stale specific numbers and replace them with a pointer to the verification commands, so the docs don't go stale again.

- [ ] **Step 1: Get current actual counts**

Run both test suites and record the actual numbers:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run test 2>&1 | Select-String "Test Files|Tests "
```
Record the frontend test count (e.g., "554 passed").

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace 2>&1 | Select-String "test result"
```
Record the Rust test count (sum of passed across all crates).

Also check current lint state:
```powershell
pnpm --dir frontend run lint 2>&1 | Select-String "warning|error" | Select-Object -Last 3
```

- [ ] **Step 2: Update root AGENTS.md**

In `e:\AI-DIGITAL-LIFE\SourceWorkspace\AGENTS.md`, find line 44:

```
> Phase 2 已于 2026-07-06 完成。Phase 2 增强（Provider 动态注册、模型选择路由、SSE 流式传输）于 2026-07-07 完成。包含 508 Rust 测试、431 前端测试，clippy 与 lint 零警告。
```

Replace with (substituting the actual numbers from Step 1):

```
> Phase 2 已于 2026-07-06 完成。Phase 2 增强（Provider 动态注册、模型选择路由、SSE 流式传输）于 2026-07-07 完成。截至 2026-07-17：{N} Rust 测试、{M} 前端测试。最新计数请运行 `cargo test --workspace` 与 `pnpm --dir frontend run test`。
```

Where `{N}` and `{M}` are the actual counts from Step 1. Remove the "clippy 与 lint 零警告" claim — it was inaccurate (frontend has 43 warnings). Instead add:

```
> 质量检查：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）、`pnpm --dir frontend run lint`（{W} warnings，主要为 react-refresh/only-export-components 与 react-hooks/exhaustive-deps）。
```

Where `{W}` is the actual warning count from Step 1.

- [ ] **Step 3: Update ai-digital-life/AGENTS.md**

In `e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\AGENTS.md`, find line 47:

```
> 508 Rust 测试、431 前端测试，clippy 与 lint 零警告。
```

Replace with the same updated wording as Step 2 (same numbers, same date).

- [ ] **Step 4: Commit**

```powershell
git add AGENTS.md ai-digital-life/AGENTS.md
git commit -m "docs: update stale test counts in AGENTS.md

Replace hardcoded '508 Rust / 431 frontend / 零警告' (inaccurate since
at least 2026-07-16) with current counts plus a pointer to the
verification commands. Frontend lint warnings acknowledged explicitly
instead of falsely claiming zero."
```

---

### Task 8: Remove `ci` bridge alias, migrate ciSlice to use `github`

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/digital-life.ts` (lines 133-136)
- Modify: `ai-digital-life/frontend/src/app/stores/slices/ciSlice.ts` (lines 89, 91, 98, 101, 171, 173, 198, 200, 256)
- Modify: `ai-digital-life/frontend/src/tauri-bridge/tauri-misc.ts` (or wherever the `ci` bridge is assigned)
- Modify: `ai-digital-life/frontend/src/mock/mock-misc.ts` (or equivalent)
- Modify: `ai-digital-life/frontend/src/preview-bridge/preview-misc.ts` (or equivalent)

**Interfaces:**
- Consumes: `GitHubBridge` interface (already defined)
- Produces: `DigitalLifeBridge` no longer has a `ci` property. All callers use `bridge.github.*` instead.

**Context:** `DigitalLifeBridge` exposes both `github: GitHubBridge` and `ci: GitHubBridge` — two property names pointing at the identical type. The comment says "与 ci 共用同一接口" / "与 github 共用同一接口". `ciSlice.ts` uses `bridge.ci.*` (9 references), while other callers use `bridge.github.*`. This is an unresolved API design decision that forces callers to guess which name to use.

Cleanup: pick `github` as the canonical name (more general), migrate `ciSlice.ts` to use `bridge.github.*`, then remove the `ci` property from `DigitalLifeBridge` and all 3 bridge implementations.

- [ ] **Step 1: Locate the ci bridge assignments in all 3 bridge implementations**

Grep for the `ci:` property assignment in tauri-bridge, mock, and preview:

```
ci:
```

Search in:
- `ai-digital-life/frontend/src/tauri-bridge/`
- `ai-digital-life/frontend/src/mock/`
- `ai-digital-life/frontend/src/preview-bridge/`

Record the exact file and line for each. The assignments typically look like `ci: githubBridge,` or `ci: { ...githubBridge },`.

- [ ] **Step 2: Migrate ciSlice.ts to use bridge.github**

In `ai-digital-life/frontend/src/app/stores/slices/ciSlice.ts`, replace all 9 occurrences of `bridge.ci` with `bridge.github`:

- Line 89: `bridge.ci && typeof bridge.ci.hasAccessToken === 'function'` → `bridge.github && typeof bridge.github.hasAccessToken === 'function'`
- Line 91: `await bridge.ci.hasAccessToken()` → `await bridge.github.hasAccessToken()`
- Line 98: `bridge.ci && typeof bridge.ci.hasAccessToken === 'function'` → `bridge.github && typeof bridge.github.hasAccessToken === 'function'`
- Line 101: `await bridge.ci.hasAccessToken()` → `await bridge.github.hasAccessToken()`
- Line 171: `bridge.ci && typeof bridge.ci.setAccessToken === 'function'` → `bridge.github && typeof bridge.github.setAccessToken === 'function'`
- Line 173: `await bridge.ci.setAccessToken(sanitized)` → `await bridge.github.setAccessToken(sanitized)`
- Line 198: `bridge.ci && typeof bridge.ci.clearAccessToken === 'function'` → `bridge.github && typeof bridge.github.clearAccessToken === 'function'`
- Line 200: `await bridge.ci.clearAccessToken()` → `await bridge.github.clearAccessToken()`
- Line 256: `(params) => bridge.ci.getStatus(params)` → `(params) => bridge.github.getStatus(params)`

Use `replace_all` for `bridge.ci` → `bridge.github` since all 9 occurrences should be migrated identically. Read the file first to confirm there are no other `bridge.ci` references that should NOT be migrated (there shouldn't be — `ciSlice.ts` is the CI slice, all `bridge.ci` references are CI-related).

- [ ] **Step 3: Remove ci property from DigitalLifeBridge interface**

In `ai-digital-life/frontend/src/shared/ipc/digital-life.ts`, delete lines 133-136:

```typescript
  /** GitHub 集成子模块 (与 ci 共用同一接口) */
  github: GitHubBridge;
  /** CI 状态子模块 (与 github 共用同一接口) */
  ci: GitHubBridge;
```

Replace with:

```typescript
  /** GitHub 集成子模块 (GitHub + CI 状态共用同一接口) */
  github: GitHubBridge;
```

- [ ] **Step 4: Remove ci assignment from all 3 bridge implementations**

In each of the 3 files identified in Step 1, delete the `ci: ...` line. The assignment typically looks like:

```typescript
  ci: githubBridge,
```

or:

```typescript
  ci: { ...githubBridge },
```

Delete the entire line. Read each file first to confirm the exact line content.

- [ ] **Step 5: Run lint:fix + format + typecheck**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
```
Expected: 0 errors (typecheck will catch any remaining `bridge.ci` references)

- [ ] **Step 6: Run tests**

Run:
```powershell
pnpm --dir frontend run test
```
Expected: all tests pass (some CI slice tests may need updating if they mock `bridge.ci` — update them to mock `bridge.github` instead)

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/shared/ipc/digital-life.ts frontend/src/app/stores/slices/ciSlice.ts frontend/src/tauri-bridge/ frontend/src/mock/ frontend/src/preview-bridge/
git commit -m "refactor(ipc): remove ci bridge alias, migrate ciSlice to use github

DigitalLifeBridge exposed both 'ci' and 'github' properties pointing
at the same GitHubBridge type — unresolved API design decision.
Migrate ciSlice.ts (9 references) to use bridge.github.*, then
remove the ci property from the interface and all 3 bridge
implementations (tauri/mock/preview)."
```

---

### Task 9: Document barrel convention in ipc/index.ts

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/index.ts` (add header comment)

**Interfaces:**
- Consumes: None
- Produces: Documentation only.

**Context:** `frontend/src/shared/ipc/index.ts` is a barrel file with 29 `export * from './<domain>'` statements. The refactoring-insight report flagged this as Low risk — "Acceptable as-is if name hygiene is maintained, but consider explicit named re-exports for the most-used types to improve traceability."

Converting to explicit named re-exports would be a large refactor touching every importer. The report itself says the barrel is "acceptable as-is". This task takes the minimal approach: add a header comment documenting the convention (no two domain files may export a symbol with the same name; new domains must follow the `export * from './<domain>'` pattern) so future contributors don't accidentally introduce collisions.

- [ ] **Step 1: Add header comment**

In `ai-digital-life/frontend/src/shared/ipc/index.ts`, prepend the following comment block before line 1:

```typescript
/**
 * IPC domain barrel.
 *
 * Convention:
 * - Each domain file (`./<domain>.ts`) exports its own types and bridge
 *   interfaces. This barrel re-exports them all via `export *`.
 * - No two domain files may export a symbol with the same name — ESLint
 *   will not catch this (wildcard re-exports are untyped at the barrel
 *   level). Manually verify before adding a new domain.
 * - New domains: add `export * from './<domain>';` below in alphabetical
 *   order. Run `pnpm --dir frontend run typecheck` to confirm no
 *   collisions.
 */
```

- [ ] **Step 2: Verify typecheck still passes**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run typecheck
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/shared/ipc/index.ts
git commit -m "docs(ipc): document barrel convention in ipc/index.ts

Add header comment explaining the export * barrel pattern and the
manual name-collision check required when adding new IPC domains.
Refactoring-insight report flagged this as Low risk and 'acceptable
as-is if name hygiene is maintained' — this comment makes the
hygiene rule explicit."
```

---

## Self-Review

### 1. Spec coverage

Cross-checked against `docs/refactoring-insight/report/refactor-insight-2026-07-16.md` and the Plan E research summary. All 9 cleanup targets from the research are covered:

| Research target | Task | Risk |
|----------------|------|------|
| INIT_SCRIPT JS blob extraction | Task 1 | High |
| Misleading "legacy" labels on RiskLevel functions | Task 2 | Medium |
| 8 `@deprecated` chart exports | Task 3 | Medium |
| User-Agent string duplication | Task 4 | Medium |
| z-index magic values (9999 / 99999) | Task 5 | Low |
| Magic timeout/location numbers (8000/15000/32767) | Task 6 | Low |
| AGENTS.md stale counts | Task 7 | Low |
| ci/github bridge alias | Task 8 | Low |
| ipc/index.ts barrel | Task 9 | Low |

### 2. Placeholder scan

No `TBD`, `TODO`, "implement later", "add appropriate error handling", or "similar to Task N" patterns. Every step contains the exact code or command to run. The two `Read the file first` instructions (Task 4 Step 2, Task 8 Step 1) are necessary because exact line content depends on the current file state — the instruction tells the implementer what to look for, not to guess.

### 3. Type consistency

- `USER_AGENT` constant: TypeScript string in `frontend/src/shared/userAgent.ts`, Rust `&str` const in `src-tauri/src/commands/browser.rs`. Both are strings; no type mismatch.
- `--z-toast` / `--z-max`: CSS custom properties consumed via `var()` in React style objects. Style object values must be strings when using `var()` — explicitly called out in Task 5 Steps 3-8.
- `URL_CHANGE_FALLBACK_MS_*` / `HIDDEN_WEBVIEW_OFFSCREEN_COORD`: TypeScript `number` constants, matching the original literal types.
- `DigitalLifeBridge`: removing the `ci` property is a type change. Step 5 typecheck will catch any remaining `bridge.ci` references. Task 8 Step 2 migrates all 9 known references first.
- No function signatures change across tasks.

### Notes for the implementer

- Tasks are independent and can be executed in any order. Recommended order is Task 1 → 9 (highest impact first).
- Each task ends with its own verification cycle. Do not skip verification even for "documentation only" tasks (Task 7, Task 9) — typecheck catches accidental breakage.
- Task 5 may cause test failures if any test asserts `zIndex: 99999` literally. Update those tests to assert `zIndex: 'var(--z-toast)'` (or assert the computed style, not the inline style).
- Task 8 may cause test failures if CI slice tests mock `bridge.ci`. Update those mocks to use `bridge.github`.
