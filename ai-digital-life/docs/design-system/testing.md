# Testing Strategy

The design system ships with three layers of coverage. **No public helper may land without a corresponding test.**

## 1. Unit tests (Vitest, `node` env by default)

Location: `[tests/unit/design-system/](../../tests/unit/design-system/)`.


| File                    | Scope                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `html.test.ts`          | `escapeHtml` / `html` template / `classNames` / `formatBytes`. Verifies XSS protection and array flattening.                                                                                        |
| `icons.test.ts`         | Icon registry coverage, `currentColor`, decorative vs semantic ARIA, attribute escaping.                                                                                                            |
| `theme.test.ts` (jsdom) | `ThemeController` + guards (`isColorScheme`, `isThemeMode`, `resolveThemeMode`), storage failure fallbacks, system media-query subscription.                                                        |
| `components.test.ts`    | `renderButton`, `renderPill`, `renderCard`, `renderBanner`, `renderEmptyState`, `renderNavItem`, `renderSegmentedControl`, `renderStatTile`. Verifies state attributes, ARIA roles, escape-on-data. |


Why these matter:

- **Security**: hostile data attributes are caught before they reach the DOM.
- **Stability**: theme persistence + resolution rules are validated under hostile storage / media-query stubs.
- **Determinism**: the renderer integration test (`tests/integration/renderer-shell.test.ts`) dynamically imports `renderer/src/main.tsx`, which mounts `app/App.tsx`; it pins `data-testid`s, visible copy, and the stubbed `digitalLife` bridge contract.

## 2. Integration tests (Vitest jsdom)

`[tests/integration/renderer-shell.test.ts](../../tests/integration/renderer-shell.test.ts)` drives the desktop shell end-to-end against a stubbed `digitalLife` bridge:

- Bootstraps the renderer.
- Asserts diagnostics, migration scripts, and approval queue render.
- Clicks `Approve`, then verifies the IPC bridge was called and the success banner appears.
- Clicks `Restore this checkpoint`, then verifies the IPC bridge was called.

Run via `npx vitest run` or `npm run test`.

## 3. Build verification

`npm --prefix frontend run build` validates that:

- All design-system imports type-check.
- All CSS imports resolve and merge into a single bundle (32 kB gzipped 7 kB at the time of writing).

`npm --prefix frontend run typecheck` covers the WebView frontend; `cargo check --workspace` covers the Rust backend.

## 4. Visual regression (next stage)

Phase 0 does **not** automate visual regression yet. The plan for Stage One:

1. Add Playwright + a deterministic story per component (10 schemes × 4 component states).
2. Snapshot via Playwright's pixel-diffing under both Windows and macOS.
3. Block PRs that change > 1 % of pixels without an approved baseline update.

## Coverage expectations


| Area                         | Target                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `design-system/*.ts` helpers | ≥ 90 % statements + branches.                                                                             |
| `styles/*.css`               | Spot-checked via integration test rendering and build.                                                    |
| `main.tsx` / `app/*`         | Covered indirectly by `frontend-shell` integration tests; add focused unit tests when adding WebView-only behavior. |
| `theme.ts` controller        | 100 % public surface.                                                                                     |


## Local commands

```bash
# Single test run (frontend)
npm --prefix frontend test

# Watch a specific design-system spec
npx vitest tests/unit/design-system/theme.test.ts

# Type check (frontend + Rust backend)
npm --prefix frontend run typecheck
cargo check --workspace

# Build to verify CSS + JS bundle size
npm --prefix frontend run build
```

