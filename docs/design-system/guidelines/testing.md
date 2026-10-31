# Testing Strategy

The design system ships with layered coverage. **No public helper may land without a corresponding test.** 门禁以 `.agents/rules/quality-gates.md` 与 `mandatory-testing.md` 为准。

## 1. Unit tests (Vitest)

Location: `frontend/src/design-system/__tests__/` (`icons.test.ts`、`theme.test.ts`) + `frontend/src/styles/*.test.ts`（brush-tokens/center-reveal/resize-handle 等）. Real renderer integration coverage lives with the app (`frontend/src/**/*.test.ts(x)`).

## 2. Right-panel editor regressions

The file / diff viewers, outline navigation, and shared custom scroll shells rely on CodeMirror and product-owned layout behavior that is easy to break with innocent-looking layout changes. The following targeted tests are part of the required regression net:

| File | Scope |
| --- | --- |
| `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts` | CodeMirror preview/diff shell CSS, fold gutter marker styling, minimap anchoring, custom scrollbar visibility rules, native-scrollbar suppression for the app-owned standard rail, and side-by-side diff scroll ownership. |
| `frontend/src/app/regions/right-panel/filesEditorOptions.test.ts` | Files editor wiring, preview/editor scope IDs, shared minimap extension attachment, and shared fold gutter marker wiring. |
| `frontend/src/app/regions/right-panel/editor-support/` 相关（`stickyContext` 等） | Sticky row derivation, top-row visibility, max-row cap, markdown/plain-text fallback, diff-side context selection. |
| `frontend/src/app/regions/right-panel/changesEditorOptions.test.ts` | Diff editor options, side-by-side scroll policy, unified right-side minimap behavior, and shared fold gutter marker wiring. |
| `frontend/src/app/regions/right-panel/outlinePanelWiring.test.ts` | Files / Changes 大纲接线、共享滚动壳和浏览器 preview outline 接线。 |
| `frontend/src/app/features/file-tree/fileTree.test.tsx` | 文件树行级交互与共享滚动壳基础渲染。 |

When touching `FilesPanel`, `ChangesPanel`, `DiffViewer`, sticky navigation, minimap sizing, minimap context menus, or custom scrollbar ownership, run at least:

```bash
pnpm --dir frontend test -- --run \
  src/app/regions/right-panel/cmPreviewStyling.test.ts \
  src/app/regions/right-panel/filesEditorOptions.test.ts \
  src/app/regions/right-panel/changesEditorOptions.test.ts \
  src/app/regions/right-panel/outlinePanelWiring.test.ts
```

## 3. Build verification

`pnpm --dir frontend run build` validates that:

- All design-system imports type-check.
- All CSS imports resolve and merge (styles 已拆 40+ 文件 + Tailwind，具体体积以构建输出为准）。

`pnpm --dir frontend run typecheck` covers the WebView frontend; `pnpm run cargo:check` covers the Rust backend.

## 4. Visual regression

Visual regression 尚未自动化（未来想法，未立项）。以 `quality-gates.md` / `mandatory-testing.md` 的红绿测试与双端验证为准。

## Coverage expectations


| Area                         | Target                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `design-system/*.ts` helpers | ≥ 90 % statements + branches.                                                                             |
| `styles/*.css`               | Spot-checked via integration test rendering and build.                                                    |
| `main.tsx` / `app/*` | Covered indirectly by app-level integration tests; add focused unit tests when adding WebView-only behavior. |
| `theme.ts` controller        | 100 % public surface.                                                                                     |


## Local commands

```bash
# Single test run (frontend)
pnpm --dir frontend run test

# Watch a specific design-system spec
pnpm --dir frontend exec vitest src/design-system/__tests__/theme.test.ts

# Type check (frontend + Rust backend)
pnpm --dir frontend run typecheck
pnpm run cargo:check

# Build to verify CSS + JS bundle size
pnpm --dir frontend run build
```
