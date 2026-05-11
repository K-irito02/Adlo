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

## 3. Right-panel editor regressions

The file / diff viewers, outline navigation, and shared custom scroll shells rely on CodeMirror and product-owned layout behavior that is easy to break with innocent-looking layout changes. The following targeted tests are part of the required regression net:

| File | Scope |
| --- | --- |
| `frontend/src/app/regions/right-panel/cmMinimap.test.ts` | Minimap / standard rail setting normalization, scoped persistence, singleton context menu behavior, menu grouping, fixed-slider zoom behavior, natural-vs-long content track switching, and slider geometry. |
| `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts` | CodeMirror preview/diff shell CSS, minimap anchoring, custom scrollbar visibility rules, native-scrollbar suppression for the app-owned standard rail, and side-by-side diff scroll ownership. |
| `frontend/src/app/regions/right-panel/filesEditorOptions.test.ts` | Files editor wiring, preview/editor scope IDs, and shared minimap extension attachment. |
| `frontend/src/app/regions/right-panel/stickyContext.test.ts` | Sticky row derivation, top-row visibility, max-row cap, markdown/plain-text fallback, diff-side context selection. |
| `frontend/src/app/regions/right-panel/changesEditorOptions.test.ts` | Diff editor options, side-by-side scroll policy, unified right-side minimap behavior. |
| `frontend/src/app/regions/right-panel/outlineModel.test.ts` | Markdown / 代码 / 配置文件大纲抽取与树构建规则。 |
| `frontend/src/app/regions/right-panel/outlinePanelWiring.test.ts` | Files / Changes 大纲接线、共享滚动壳和浏览器 preview outline 接线。 |
| `frontend/src/app/regions/right-panel/fileTree.test.tsx` | 文件树行级交互与共享滚动壳基础渲染。 |

When touching `FilesPanel`, `ChangesPanel`, `DiffViewer`, sticky navigation, minimap sizing, minimap context menus, or custom scrollbar ownership, run at least:

```bash
npm --prefix frontend test -- --run \
  src/app/regions/right-panel/cmMinimap.test.ts \
  src/app/regions/right-panel/cmPreviewStyling.test.ts \
  src/app/regions/right-panel/filesEditorOptions.test.ts \
  src/app/regions/right-panel/stickyContext.test.ts \
  src/app/regions/right-panel/changesEditorOptions.test.ts \
  src/app/regions/right-panel/outlineModel.test.ts \
  src/app/regions/right-panel/outlinePanelWiring.test.ts
```

## 4. Build verification

`npm --prefix frontend run build` validates that:

- All design-system imports type-check.
- All CSS imports resolve and merge into a single bundle (32 kB gzipped 7 kB at the time of writing).

`npm --prefix frontend run typecheck` covers the WebView frontend; `cargo check --workspace` covers the Rust backend.

## 5. Visual regression (next stage)

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
